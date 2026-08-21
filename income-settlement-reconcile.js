(() => {
  'use strict';

  const base = window.AuroraIncomeTruth;
  if (!base) return;

  const BUILD = '20260821-income-settlement-reconcile-2';
  const AMOUNT_TOLERANCE_GBP = 0.03;
  const MAX_DAYS_AFTER_PAY_DATE = 45;
  const MAX_DAYS_BEFORE_PAY_DATE = 3;
  let matches = new Map();
  let lastBrokerSnapshot = null;
  let lastIncomeSnapshot = null;
  let refreshing = false;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => base.num(value);
  const ticker = value => base.ticker(value);
  const account = value => base.accountCode(value);
  const parseDate = value => base.parseDate(value);
  const dateISO = value => {
    const d = parseDate(value);
    return d ? base.dateISO(d) : String(value || '').trim();
  };

  function matchKey(row) {
    const ac = account(row?.account);
    const tk = ticker(row?.ticker);
    const pay = dateISO(row?.payDate || row?.pay_date);
    return ac && tk && pay ? `${ac}|${tk}|${pay}` : String(row?.id || '');
  }

  function settlementAmount(row) {
    const fields = [row?.amountGbp, row?.dividendAmountGbp, row?.settlementAmountGbp, row?.grossAmountGbp, row?.cashChangeGbp, row?.amount];
    for (const value of fields) {
      const amount = Math.abs(num(value));
      if (amount > 0) return amount;
    }
    return 0;
  }

  function settlementDate(row) {
    const direct = row?.paidAt || row?.settledAt || row?.receivedAt || row?.recordedAt || row?.createdAt || row?.timestamp || '';
    const parsed = parseDate(direct);
    if (parsed) return parsed;
    const reference = String(row?.reference || '');
    const match = reference.match(/(?:^|:)(\d{4}-\d{2}-\d{2})(?:[:]|$)/);
    return match ? parseDate(match[1]) : null;
  }

  function isDividendSettlement(row) {
    const amount = settlementAmount(row);
    if (amount <= 0 || !ticker(row?.ticker) || !['IG', 'T212'].includes(account(row?.account))) return false;
    const cashChange = num(row?.cashChangeGbp);
    if (cashChange < 0) return false;
    const type = String(row?.type || row?.mode || row?.action || row?.category || '').toUpperCase();
    const reference = String(row?.reference || '');
    if (/^DIV:/i.test(reference)) return true;
    if (/DIVIDEND|SETTLEMENT|CASH RECEIVED|CASH_RECEIVED|REINVEST/.test(type)) return true;
    return cashChange > 0;
  }

  function backendReceivedAmount(row) {
    const fields = [row?.actualAmountGbp, row?.dividend_received, row?.dividendReceived, row?.receivedAmountGbp, row?.receivedAmount, row?.actualAmount];
    for (const value of fields) {
      const amount = Math.abs(num(value));
      if (amount > 0) return amount;
    }
    return 0;
  }

  function isBackendPaid(row) {
    const status = String(`${row?.status || ''} ${row?.payment_stage || ''} ${row?.paymentStage || ''}`).toUpperCase();
    return backendReceivedAmount(row) > 0 || /\bPAID\b/.test(status);
  }

  function backendEvidenceAmount(state, row, event) {
    const received = backendReceivedAmount(row);
    if (received > 0) return received;
    const expected = Math.abs(num(row?.expectedAmountGbp ?? row?.dividend_due ?? row?.dividendDue));
    if (expected > 0) return expected;
    return Math.max(0, base.eventAmount(state, event));
  }

  function eventAmount(state, event) {
    const match = matches.get(matchKey(event));
    return match ? match.amountGbp : base.eventAmount(state, event);
  }

  function reconciledEvent(event) {
    const match = matches.get(matchKey(event));
    if (!match) return event;
    return {
      ...event,
      status: 'PAID',
      actualAmountGbp: match.amountGbp,
      paidAt: match.recordedAt || event?.paidAt || '',
      paymentEvidence: match.evidence,
      paymentEvidenceRef: match.reference || '',
      reconciledBy: BUILD
    };
  }

  function reconciledEvents(events) {
    return arr(events).map(reconciledEvent);
  }

  function buildBackendPaidMatches(state, events, snapshot, next) {
    const paidRows = arr(snapshot?.dividends).filter(isBackendPaid);
    const byKey = new Map();
    paidRows.forEach(row => {
      const key = matchKey(row);
      if (key) byKey.set(key, row);
    });

    arr(events).forEach(event => {
      const status = String(event?.status || '').toUpperCase();
      if (['CANCELLED', 'ARCHIVED'].includes(status)) return;
      const key = matchKey(event);
      const row = byKey.get(key);
      if (!row) return;
      next.set(key, {
        amountGbp: backendEvidenceAmount(state, row, event),
        recordedAt: row?.paidAt || row?.receivedAt || row?.updatedAt || row?.payDate || row?.pay_date || '',
        reference: String(row?.id || row?.dividendId || `AURORADATA:${key}`),
        evidence: 'AURORADATA_DIVIDENDS'
      });
    });
  }

  function buildBrokerMatches(state, events, snapshot, next) {
    const settlements = arr(snapshot?.ledger)
      .filter(isDividendSettlement)
      .map((row, index) => ({
        index,
        ticker: ticker(row.ticker),
        account: account(row.account),
        amountGbp: settlementAmount(row),
        date: settlementDate(row),
        recordedAt: row?.recordedAt || row?.settledAt || row?.paidAt || row?.receivedAt || row?.createdAt || '',
        reference: String(row?.reference || '')
      }))
      .filter(row => row.date);

    const candidates = arr(events)
      .filter(event => !['PAID', 'CANCELLED', 'ARCHIVED'].includes(String(event?.status || '').toUpperCase()))
      .map(event => ({
        key: matchKey(event),
        ticker: ticker(event.ticker),
        account: account(event.account),
        amountGbp: base.eventAmount(state, event),
        payDate: parseDate(event.payDate)
      }))
      .filter(event => event.key && !next.has(event.key) && event.payDate && event.amountGbp > 0);

    const usedSettlements = new Set();
    candidates.forEach(candidate => {
      const scored = settlements
        .filter(settlement => !usedSettlements.has(settlement.index))
        .filter(settlement => settlement.ticker === candidate.ticker && settlement.account === candidate.account)
        .map(settlement => {
          const amountDiff = Math.abs(settlement.amountGbp - candidate.amountGbp);
          const dayDiff = Math.round((settlement.date.getTime() - candidate.payDate.getTime()) / 86400000);
          return { settlement, amountDiff, dayDiff };
        })
        .filter(item => item.amountDiff <= AMOUNT_TOLERANCE_GBP)
        .filter(item => item.dayDiff >= -MAX_DAYS_BEFORE_PAY_DATE && item.dayDiff <= MAX_DAYS_AFTER_PAY_DATE)
        .sort((a, b) => a.amountDiff - b.amountDiff || Math.abs(a.dayDiff) - Math.abs(b.dayDiff));

      const best = scored[0];
      if (!best) return;
      usedSettlements.add(best.settlement.index);
      next.set(candidate.key, {
        amountGbp: best.settlement.amountGbp,
        recordedAt: best.settlement.recordedAt,
        reference: best.settlement.reference,
        dayDiff: best.dayDiff,
        evidence: 'BROKER_CASH_LEDGER'
      });
    });
  }

  function buildMatches(state, events, brokerSnapshot, incomeSnapshot) {
    const next = new Map();
    buildBackendPaidMatches(state, events, incomeSnapshot, next);
    buildBrokerMatches(state, events, brokerSnapshot, next);
    matches = next;
    return next;
  }

  function calendarState(event) {
    return matches.has(matchKey(event)) ? 'paid' : base.calendarState(event);
  }

  function upcoming(state, events) {
    return base.upcoming(state, reconciledEvents(events));
  }

  function nextDividend(state, events) {
    return base.nextDividend(state, reconciledEvents(events));
  }

  function reliability(state, events, metrics = base.metrics(state)) {
    return base.reliability(state, reconciledEvents(events), metrics);
  }

  function runway(state, events, metrics = base.metrics(state)) {
    return base.runway(state, reconciledEvents(events), metrics);
  }

  function summary(state, events, history) {
    return base.summary(state, reconciledEvents(events), history);
  }

  window.AuroraIncomeTruth = Object.freeze({
    ...base,
    build: BUILD,
    eventAmount,
    calendarState,
    upcoming,
    nextDividend,
    reliability,
    runway,
    summary,
    reconcilePaymentEvidence: buildMatches,
    reconciliationMatches: () => new Map(matches)
  });

  async function refresh() {
    if (refreshing || !window.AuroraData2Client?.post || !window.AuroraIncomeRestored?.calendar) return;
    refreshing = true;
    try {
      const [brokerResult, incomeResult] = await Promise.allSettled([
        window.AuroraData2Client.post('brokerCashSnapshot', {}),
        window.AuroraData2Client.post('incomeSnapshot', {})
      ]);
      if (brokerResult.status === 'fulfilled') lastBrokerSnapshot = brokerResult.value;
      if (incomeResult.status === 'fulfilled') lastIncomeSnapshot = incomeResult.value;
      if (!lastBrokerSnapshot && !lastIncomeSnapshot) return;
      const state = window.Aurora2?.core?.read?.() || {};
      const events = window.AuroraIncomeRestored.calendar();
      buildMatches(state, events, lastBrokerSnapshot, lastIncomeSnapshot);
      window.AuroraIncomeRestored.render?.();
      window.dispatchEvent(new CustomEvent('aurora:income-settlement-reconcile', {
        detail: { build: BUILD, matched: matches.size, checkedAt: new Date().toISOString() }
      }));
    } finally {
      refreshing = false;
    }
  }

  function start() {
    setTimeout(refresh, 900);
    document.addEventListener('click', event => {
      if (event.target.closest('#recordDividendCash,#refreshBrokerCash,#syncIncomeBackend')) setTimeout(refresh, 1400);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(refresh, 250);
    });
    window.addEventListener('focus', () => setTimeout(refresh, 100));
    setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);
  }

  window.AuroraIncomeSettlementReconcile = Object.freeze({
    build: BUILD,
    refresh,
    matches: () => [...matches.entries()],
    brokerSnapshot: () => lastBrokerSnapshot,
    incomeSnapshot: () => lastIncomeSnapshot
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
