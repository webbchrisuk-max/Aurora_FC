(() => {
  'use strict';

  const BUILD = '20260824-income-reinvestment-exact-cost-authority-1';
  const COST_TOLERANCE = 0.011;
  const MAX_SMALL_RECONCILIATION_GBP = 0.25;
  if (window.__AuroraIncomeReinvestmentExactCostAuthority) return;
  window.__AuroraIncomeReinvestmentExactCostAuthority = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(num(value).toFixed(2));
  const positive2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(num(value));

  function hash(value) {
    let h = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function accountCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'IG' || raw.includes('IG ISA')) return 'IG';
    if (raw === 'T212' || raw.includes('212')) return 'T212';
    return 'CHECK';
  }

  function tickerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/^LON:/, '').replace(/\.L$/, '').replace(/\.GB$/, '');
  }

  function toast(message) {
    const el = document.getElementById('incomeToast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(window.__incomeExactAuthorityToast);
    window.__incomeExactAuthorityToast = setTimeout(() => el.classList.remove('show'), 6000);
  }

  function idsFor(item, leg) {
    const stable = hash(`${item.reference}|${accountCode(item.account)}|${leg.index}|${leg.ticker}|${leg.shares}|${leg.priceGbp}`);
    return {
      transactionId: `TX-RI-${stable}`,
      clientRequestId: `REQ-RI-${stable}`,
      missionId: `MISSION-RI-${hash(item.reference)}`,
      routeId: `ROUTE-RI-${hash(item.reference)}`,
      legId: `LEG-RI-${stable}`
    };
  }

  function tradeDate(reference) {
    const match = String(reference || '').match(/(?:^|:)(\d{4}-\d{2}-\d{2})(?:[:]|$)/);
    return match ? match[1] : new Date().toISOString().slice(0, 10);
  }

  function readState() {
    try {
      const live = window.Aurora2?.core?.read?.();
      if (live && typeof live === 'object') return live;
    } catch (_) {}
    try {
      const parsed = JSON.parse(localStorage.getItem('aurora2:state:v1') || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function activeHolding(state, account, ticker) {
    return arr(state?.squad?.holdings).find(row =>
      accountCode(row?.account) === account && tickerCode(row?.ticker) === ticker &&
      !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(String(row?.status || '').toUpperCase())
    ) || null;
  }

  function targetFor(state, ticker) {
    return arr(state?.scouting?.targets).find(row => tickerCode(row?.ticker) === ticker) || null;
  }

  function priorHoldingSnapshot(holding) {
    if (!holding) return null;
    return {
      holdingId: holding.id || '', account: accountCode(holding.account), ticker: tickerCode(holding.ticker), name: holding.name || holding.ticker || '',
      shares: num(holding.shares), bookCostGbp: num(holding.bookCostGbp), avgCostGbp: num(holding.avgCostGbp), livePriceGbp: num(holding.livePriceGbp),
      marketValueGbp: num(holding.marketValueGbp), profitLossGbp: num(holding.profitLossGbp), annualDpsGbp: num(holding.annualDpsGbp),
      annualIncomeGbp: num(holding.annualIncomeGbp), sector: holding.sector || '', role: holding.role || '', status: holding.status || 'ACTIVE',
      locked: !!holding.locked, lockReason: holding.lockReason || '', source: holding.source || 'AURORA2_SQUAD', sourceUpdatedAt: holding.sourceUpdatedAt || null
    };
  }

  function firstPositive(...values) {
    for (const value of values) { const n = num(value); if (n > 0) return n; }
    return 0;
  }

  function adjustmentReference(dividendReference) {
    const api = window.AuroraIncomeReinvestmentCashRemainder;
    if (api?.adjustmentReference) return api.adjustmentReference(dividendReference);
    return `ADJ:RI-REMAINDER:${hash(dividendReference)}`;
  }

  function ledgerChange(row) {
    return num(row?.cashChangeGbp ?? row?.cash_change_gbp ?? row?.changeGbp ?? row?.change_gbp);
  }

  function currentRecordedRemainderEffect(snapshot, reference) {
    const ref = adjustmentReference(reference);
    const row = arr(snapshot?.ledger).find(item => String(item?.reference || '') === ref);
    return row ? round2(ledgerChange(row)) : 0;
  }

  async function settlementData(reference) {
    const client = window.AuroraData2Client;
    const replayApi = window.AuroraIncomeReinvestmentReplay;
    const promotion = window.AuroraIncomeReinvestmentPromotion;
    if (!client?.post || !replayApi?.payload || !promotion?.parseLegs) return null;
    const snapshot = await client.post('brokerCashSnapshot', {});
    const item = arr(snapshot?.ledger).slice(0, 160).map(replayApi.payload).filter(Boolean)
      .find(row => String(row.reference || '') === String(reference || ''));
    if (!item) return null;
    const legs = promotion.parseLegs(item.note).filter(leg => leg.ticker && leg.shares > 0 && leg.priceGbp > 0);
    return { snapshot, item, legs };
  }

  function buildPenceRequest(item, leg, legs, exactCosts) {
    const state = readState();
    if (!state) throw new Error('Aurora local state is unavailable for Registration retry.');
    const account = accountCode(item.account);
    const tk = tickerCode(leg.ticker);
    const holding = activeHolding(state, account, tk);
    const target = targetFor(state, tk);
    const ids = idsFor(item, leg);
    const costFor = row => positive2(exactCosts.get(row.index));
    const totalReadyCostGbp = positive2(legs.reduce((sum, row) => sum + costFor(row), 0));
    const legCostGbp = costFor(leg);
    const precisePriceGbp = leg.shares > 0 ? legCostGbp / leg.shares : 0;
    const annualDps = firstPositive(holding?.annualDpsGbp, target?.annualDpsGbp, target?.annualDps, target?.dividendPerShareAnnualGbp, target?.recurringDpsGbp);
    const expectedAnnualIncomeGbp = annualDps > 0 ? leg.shares * annualDps : 0;
    const dividendAmount = positive2(item.amountGbp);
    const createdAt = new Date().toISOString();
    return {
      ids,
      payload: {
        transaction: {
          transactionId: ids.transactionId, clientRequestId: ids.clientRequestId, tradeDate: tradeDate(item.reference), account, ticker: tk,
          name: target?.name || holding?.name || tk, side: 'BUY', shares: leg.shares,
          priceInput: Number((precisePriceGbp * 100).toFixed(10)), priceUnit: 'PENCE', currency: 'GBP', fxRateToGbp: 1, feesNative: 0,
          totalCostGbp: legCostGbp, missionId: ids.missionId, routeId: ids.routeId, allocationId: ids.legId, legId: ids.legId,
          strategy: 'DIVIDEND_REINVESTMENT', recommendation: target?.recommendation || '', confidence: num(target?.confidence), expectedAnnualIncomeGbp
        },
        priorHolding: priorHoldingSnapshot(holding),
        missionSnapshot: {
          missionId: ids.missionId, paydayDate: tradeDate(item.reference), approvedBudget: dividendAmount, status: 'LOCKED', totalCash: dividendAmount,
          commitments: totalReadyCostGbp, protectedCash: 0, safeSurplus: Math.max(0, dividendAmount - totalReadyCostGbp), expectedWages: 0,
          wagesReceived: 0, wageDifference: 0, annualBillFunding: 0, potFundingRequired: 0, holdingPotTopUp: 0, source: 'INCOME_DIVIDEND_REINVESTMENT_EXACT_BROKER_TRUTH'
        },
        routeSnapshot: {
          routeId: ids.routeId, missionId: ids.missionId, strategy: 'DIVIDEND_REINVESTMENT', financeBudget: dividendAmount,
          allocated: totalReadyCostGbp, remaining: Math.max(0, dividendAmount - totalReadyCostGbp), expectedAnnualIncome: 0,
          status: 'LOCKED', locked: true, createdAt,
          allocations: legs.map(row => {
            const rowIds = idsFor(item, row);
            return { id: rowIds.legId, legId: rowIds.legId, account, ticker: row.ticker, amount: costFor(row), expectedAnnualIncome: 0 };
          })
        }
      }
    };
  }

  async function reconcileCashDifference(data, exactTotal) {
    const client = window.AuroraData2Client;
    const account = accountCode(data.item.account);
    if (!client?.post || !['IG','T212'].includes(account)) return null;
    const dividend = positive2(data.item.amountGbp);
    const desiredEffect = round2(dividend - exactTotal);
    const currentEffect = currentRecordedRemainderEffect(data.snapshot, data.item.reference);
    const delta = round2(desiredEffect - currentEffect);
    if (Math.abs(delta) <= COST_TOLERANCE) return { status: 'BALANCED', delta: 0 };
    const reference = `ADJ:RI-EXACT-COST:${hash(data.item.reference)}:${hash(`${exactTotal}`)}`;
    if (arr(data.snapshot?.ledger).some(row => String(row?.reference || '') === reference)) return { status: 'ALREADY_RECONCILED', delta, reference };
    const result = await client.post('adjustBrokerCash', {
      account,
      changeGbp: delta,
      reference,
      note: `Exact reinvestment cost reconciliation • ${tickerCode(data.item.ticker)} • broker purchase truth ${money(exactTotal)} vs dividend ${money(dividend)}`
    });
    return { status: 'RECONCILED', delta, reference, snapshot: result?.snapshot || null };
  }

  function referenceFromPanel(panel) {
    const ledger = document.getElementById('cashLedger');
    const replay = window.__auroraIncomeReinvestmentReplayStatus;
    const held = arr(replay?.held);
    if (held[0]?.dividendReference) return String(held[0].dividendReference);
    const text = String(panel?.parentElement?.textContent || ledger?.textContent || '');
    return text.match(/DIV:[A-Z0-9]+:[A-Z0-9.\-]+:\d{4}-\d{2}-\d{2}:[0-9.]+/i)?.[0] || '';
  }

  async function handleExactMismatch(button, event) {
    const panel = button.closest('#riRegistrationCostResolution');
    if (!panel) return false;
    const reference = referenceFromPanel(panel);
    if (!reference) return false;
    const values = new Map();
    panel.querySelectorAll('[data-ri-exact-cost]').forEach(input => {
      const value = positive2(input.value);
      if (value > 0) values.set(Number(input.dataset.index), value);
    });
    const data = await settlementData(reference);
    if (!data || values.size !== data.legs.length) return false;
    const exactTotal = positive2([...values.values()].reduce((sum, value) => sum + value, 0));
    const recordedRemainder = currentRecordedRemainderEffect(data.snapshot, data.item.reference);
    const oldRequired = positive2(data.item.amountGbp - Math.max(0, recordedRemainder));
    const difference = round2(exactTotal - oldRequired);
    if (Math.abs(difference) <= COST_TOLERANCE) return false;
    if (Math.abs(difference) > MAX_SMALL_RECONCILIATION_GBP) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm(`Use the broker's exact purchase values?\n\nEntered purchases: ${money(exactTotal)}\nOld rounded/remainder evidence: ${money(oldRequired)}\nDifference: ${money(difference)}\n\nAurora will treat your broker purchase values as the authority, register the UK unit prices in PENCE, and reconcile the ${money(Math.abs(difference))} rounding/cash difference.`)) return true;

    const promotion = window.AuroraIncomeReinvestmentPromotion;
    const replayApi = window.AuroraIncomeReinvestmentReplay;
    const client = window.AuroraData2Client;
    if (!promotion?.promoteSettlement || !replayApi?.replay || !client?.post) {
      toast('Exact-cost Registration recovery is still loading. Try again in a moment.');
      return true;
    }

    button.disabled = true;
    button.textContent = 'Registering broker truth…';
    try {
      for (const leg of data.legs) {
        const built = buildPenceRequest(data.item, leg, data.legs, values);
        const result = await client.post('registerPurchase', built.payload);
        if (!result?.confirmed || !result?.transaction) throw new Error(`${leg.ticker}: AuroraData 2 did not confirm the exact-cost purchase.`);
        if (String(result.transaction.transactionId || '') !== built.ids.transactionId) throw new Error(`${leg.ticker}: confirmed transaction ID did not match.`);
      }
      const cash = await reconcileCashDifference(data, exactTotal);
      await promotion.promoteSettlement(data.item);
      const finalResult = await replayApi.replay();
      const remaining = arr(finalResult?.held);
      if (remaining.length) throw new Error(remaining.map(row => `${row.ticker}: ${row.reason || row.holdReason || 'Registration held'}`).join(' • '));
      toast(`${data.legs.length} exact reinvestment purchases registered in pence. Broker cash reconciliation ${String(cash?.status || 'complete').toLowerCase().replaceAll('_',' ')}.`);
      panel.remove();
    } catch (error) {
      toast(`Registration remains held: ${String(error?.message || error)}`);
    } finally {
      if (button.isConnected) { button.disabled = false; button.textContent = 'Confirm exact costs & register'; }
    }
    return true;
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#riConfirmExactCosts');
    if (!button) return;
    handleExactMismatch(button, event).catch(error => toast(`Exact-cost reconciliation failed: ${String(error?.message || error)}`));
  }, true);

  const observer = new MutationObserver(() => {
    const panel = document.getElementById('riRegistrationCostResolution');
    if (!panel || panel.dataset.exactAuthority === BUILD) return;
    panel.dataset.exactAuthority = BUILD;
    const note = panel.querySelector('small');
    if (note) note.textContent += ' If the broker-exact leg values differ only by a small rounding amount, Aurora will offer to accept broker truth and reconcile the difference.';
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.AuroraIncomeReinvestmentExactCostAuthority = Object.freeze({
    build: BUILD, ready: true, maxSmallReconciliationGbp: MAX_SMALL_RECONCILIATION_GBP
  });
})();