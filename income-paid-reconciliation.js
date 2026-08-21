(() => {
  'use strict';

  const base = window.AuroraIncomeTruth;
  if (!base) return;

  const BUILD = '20260821-income-paid-reconciliation-1';
  const AMOUNT_TOLERANCE_GBP = 0.03;
  const MAX_DAYS_AFTER_PAY_DATE = 45;
  const MAX_DAYS_BEFORE_PAY_DATE = 3;
  let matches = new Map();
  let lastSnapshot = null;
  let refreshing = false;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => base.num(value);
  const ticker = value => base.ticker(value);
  const account = value => base.accountCode(value);

  function settlementAmount(row) {
    const fields = [row?.amountGbp, row?.dividendAmountGbp, row?.grossAmountGbp, row?.cashChangeGbp, row?.amount];
    for (const value of fields) {
      const amount = Math.abs(num(value));
      if (amount > 0) return amount;
    }
    return 0;
  }

  function settlementDate(row) {
    const direct = row?.paidAt || row?.settledAt || row?.recordedAt || row?.createdAt || row?.timestamp || '';
    const parsed = base.parseDate(direct);
    if (parsed) return parsed;
    const reference = String(row?.reference || '');
    const match = reference.match(/(?:^|:)(\d{4}-\d{2}-\d{2})(?:[:]|$)/);
    return match ? base.parseDate(match[1]) : null;
  }

  function isDividendSettlement(row) {
    const amount = settlementAmount(row);
    if (amount <= 0 || !ticker(row?.ticker) || !['IG', 'T212'].includes(account(row?.account))) return false;
    const cashChange = num(row?.cashChangeGbp);
    if (cashChange < 0) return false;
    const type = String(row?.type || row?.mode || '').toUpperCase();
    const reference = String(row?.reference || '');
    if (/^DIV:/i.test(reference)) return true;
    if (/DIVIDEND|SETTLEMENT|CASH RECEIVED|CASH_RECEIVED|REINVEST/.test(type)) return true;
    return cashChange > 0;
  }

  function eventKey(event) {
    return String(event?.id || `${account(event?.account)}|${ticker(event?.ticker)}|${event?.payDate || ''}|${num(event?.expectedAmountGbp).toFixed(2)}`);
  }

  function eventAmount(state, event) {
    const match = matches.get(eventKey(event));
    return match ? match.amountGbp : base.eventAmount(state, event);
  }

  function reconciledEvent(event) {
    const match = matches.get(eventKey(event));
    if (!match) return event;
    return {
      ...event,
      status: 'PAID',
      actualAmountGbp: match.amountGbp,
      paidAt: match.recordedAt || event?.paidAt || '',
      settlementEvidence: 'BROKER_CASH_LEDGER',
      settlementReference: match.reference || ''
    };
  }

  function reconciledEvents(events) {
    return arr(events).map(reconciledEvent);
  }

  function buildMatches(state, events, snapshot) {
    const settlements = arr(snapshot?.ledger)
      .filter(isDividendSettlement)
      .map((row, index) => ({
        row,
        index,
        ticker: ticker(row.ticker),
        account: account(row.account),
        amountGbp: settlementAmount(row),
        date: settlementDate(row),
        recordedAt: row?.recordedAt || row?.settledAt || row?.paidAt || row?.createdAt || '',
        reference: String(row?.reference || '')
      }))
      .filter(row => row.date);

    const candidates = arr(events)
      .filter(event => !['PAID', 'CANCELLED', 'ARCHIVED'].includes(String(event?.status || '').toUpperCase()))
      .map(event => ({
        event,
        key: eventKey(event),
        ticker: ticker(event.ticker),
        account: account(event.account),
        amountGbp: base.eventAmount(state, event),
        payDate: base.parseDate(event.payDate)
      }))
      .filter(event => event.payDate && event.amountGbp > 0);

    const usedSettlements = new Set();
    const next = new Map();

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
        dayDiff: best.dayDiff
      });
    });

    matches = next;
    return next;
  }

  function calendarState(event) {
    return matches.has(eventKey(event)) ? 'paid' : base.calendarState(event);
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
    reconcileBrokerCash: buildMatches,
    reconciliationMatches: () => new Map(matches)
  });

  async function refresh() {
    if (refreshing || !window.AuroraData2Client?.post || !window.AuroraIncomeRestored?.calendar) return;
    refreshing = true;
    try {
      const snapshot = await window.AuroraData2Client.post('brokerCashSnapshot', {});
      lastSnapshot = snapshot;
      const state = window.Aurora2?.core?.read?.() || {};
      const events = window.AuroraIncomeRestored.calendar();
      buildMatches(state, events, snapshot);
      window.AuroraIncomeRestored.render?.();
      window.dispatchEvent(new CustomEvent('aurora:income-paid-reconciliation', {
        detail: { build: BUILD, matched: matches.size, checkedAt: new Date().toISOString() }
      }));
    } catch (_) {
      // Broker cash is supporting evidence only. Calendar remains usable if the snapshot is unavailable.
    } finally {
      refreshing = false;
    }
  }

  function start() {
    setTimeout(refresh, 900);
    document.addEventListener('click', event => {
      if (event.target.closest('#recordDividendCash,#refreshBrokerCash')) setTimeout(refresh, 1400);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(refresh, 250);
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);
  }

  window.AuroraIncomePaidReconciliation = Object.freeze({
    build: BUILD,
    refresh,
    matches: () => [...matches.entries()],
    snapshot: () => lastSnapshot
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
