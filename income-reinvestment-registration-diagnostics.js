(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-registration-diagnostics-2';
  const STATE_KEY = 'aurora2:state:v1';
  const AUTO_KEY = 'aurora:income:reinvestment-registration-repair:v2';
  if (window.__auroraIncomeReinvestmentRegistrationDiagnostics) return;
  window.__auroraIncomeReinvestmentRegistrationDiagnostics = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));

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

  function readState() {
    try {
      const core = window.Aurora2?.core?.read?.();
      if (core && typeof core === 'object') return core;
    } catch (_) {}
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function resetRecordButton() {
    const button = document.getElementById('recordDividendCash');
    if (!button) return;
    if (/Confirming reinvestment/i.test(String(button.textContent || ''))) {
      button.textContent = 'Record Dividend';
      button.disabled = false;
    }
  }

  function status() {
    return window.__auroraIncomeReinvestmentReplayStatus || null;
  }

  function heldByReference(reference) {
    return arr(status()?.held).filter(row => String(row?.dividendReference || '') === String(reference || ''));
  }

  function activeHolding(state, account, ticker) {
    return arr(state?.squad?.holdings).find(row =>
      accountCode(row?.account) === account &&
      tickerCode(row?.ticker) === ticker &&
      !['SOLD', 'ARCHIVED', 'CLOSED', 'EXITED'].includes(String(row?.status || '').toUpperCase())
    ) || null;
  }

  function targetFor(state, ticker) {
    return arr(state?.scouting?.targets).find(row => tickerCode(row?.ticker) === ticker) || null;
  }

  function priorHoldingSnapshot(holding) {
    if (!holding) return null;
    return {
      holdingId: holding.id || '',
      account: accountCode(holding.account),
      ticker: tickerCode(holding.ticker),
      name: holding.name || holding.ticker || '',
      shares: num(holding.shares),
      bookCostGbp: num(holding.bookCostGbp),
      avgCostGbp: num(holding.avgCostGbp),
      livePriceGbp: num(holding.livePriceGbp),
      marketValueGbp: num(holding.marketValueGbp),
      profitLossGbp: num(holding.profitLossGbp),
      annualDpsGbp: num(holding.annualDpsGbp),
      annualIncomeGbp: num(holding.annualIncomeGbp),
      sector: holding.sector || '',
      role: holding.role || '',
      status: holding.status || 'ACTIVE',
      locked: !!holding.locked,
      lockReason: holding.lockReason || '',
      source: holding.source || 'AURORA2_SQUAD',
      sourceUpdatedAt: holding.sourceUpdatedAt || null
    };
  }

  function firstPositive(...values) {
    for (const value of values) {
      const n = num(value);
      if (n > 0) return n;
    }
    return 0;
  }

  function tradeDate(reference) {
    const match = String(reference || '').match(/(?:^|:)(\d{4}-\d{2}-\d{2})(?:[:]|$)/);
    return match ? match[1] : new Date().toISOString().slice(0, 10);
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

  function buildPenceRequest(item, leg, allReadyLegs) {
    const state = readState();
    if (!state) throw new Error('Aurora local state is unavailable for Registration retry.');
    const account = accountCode(item.account);
    const tk = tickerCode(leg.ticker);
    const holding = activeHolding(state, account, tk);
    const target = targetFor(state, tk);
    const ids = idsFor(item, leg);
    const totalReadyCostGbp = round2(allReadyLegs.reduce((sum, row) => sum + (row.shares * row.priceGbp), 0));
    const annualDps = firstPositive(holding?.annualDpsGbp, target?.annualDpsGbp, target?.annualDps, target?.dividendPerShareAnnualGbp, target?.recurringDpsGbp);
    const expectedAnnualIncomeGbp = annualDps > 0 ? leg.shares * annualDps : 0;
    const createdAt = new Date().toISOString();
    const dividendAmount = round2(item.amountGbp);

    return {
      ids,
      payload: {
        transaction: {
          transactionId: ids.transactionId,
          clientRequestId: ids.clientRequestId,
          tradeDate: tradeDate(item.reference),
          account,
          ticker: tk,
          name: target?.name || holding?.name || tk,
          side: 'BUY',
          shares: leg.shares,
          priceInput: Number((leg.priceGbp * 100).toFixed(6)),
          priceUnit: 'PENCE',
          currency: 'GBP',
          fxRateToGbp: 1,
          feesNative: 0,
          totalCostGbp: round2(leg.shares * leg.priceGbp),
          missionId: ids.missionId,
          routeId: ids.routeId,
          allocationId: ids.legId,
          legId: ids.legId,
          strategy: 'DIVIDEND_REINVESTMENT',
          recommendation: target?.recommendation || '',
          confidence: num(target?.confidence),
          expectedAnnualIncomeGbp
        },
        priorHolding: priorHoldingSnapshot(holding),
        missionSnapshot: {
          missionId: ids.missionId,
          paydayDate: tradeDate(item.reference),
          approvedBudget: dividendAmount,
          status: 'LOCKED',
          totalCash: dividendAmount,
          commitments: totalReadyCostGbp,
          protectedCash: 0,
          safeSurplus: Math.max(0, dividendAmount - totalReadyCostGbp),
          expectedWages: 0,
          wagesReceived: 0,
          wageDifference: 0,
          annualBillFunding: 0,
          potFundingRequired: 0,
          holdingPotTopUp: 0,
          source: 'INCOME_DIVIDEND_REINVESTMENT'
        },
        routeSnapshot: {
          routeId: ids.routeId,
          missionId: ids.missionId,
          strategy: 'DIVIDEND_REINVESTMENT',
          financeBudget: dividendAmount,
          allocated: totalReadyCostGbp,
          remaining: Math.max(0, dividendAmount - totalReadyCostGbp),
          expectedAnnualIncome: 0,
          status: 'LOCKED',
          locked: true,
          createdAt,
          allocations: allReadyLegs.map(row => {
            const rowIds = idsFor(item, row);
            return {
              id: rowIds.legId,
              legId: rowIds.legId,
              account,
              ticker: row.ticker,
              amount: round2(row.shares * row.priceGbp),
              expectedAnnualIncome: 0
            };
          })
        }
      }
    };
  }

  function decorateRows() {
    resetRecordButton();
    const replay = status();
    if (!replay) return;

    document.querySelectorAll('[data-ri-ledger-row]').forEach(row => {
      const text = String(row.textContent || '');
      const refMatch = text.match(/DIV:[A-Z0-9]+:[A-Z0-9.\-]+:\d{4}-\d{2}-\d{2}:[0-9.]+/i);
      if (!refMatch) return;
      const holds = heldByReference(refMatch[0]);
      row.querySelectorAll('[data-ri-hold-reason]').forEach(node => node.remove());
      if (!holds.length) return;

      const reason = [...new Set(holds.map(item => `${item.ticker || 'LEG'}: ${item.reason || 'Registration pending'}`))].join(' • ');
      const node = document.createElement('div');
      node.dataset.riHoldReason = BUILD;
      node.style.cssText = 'margin-top:7px;padding:7px 9px;border-radius:8px;border:1px solid rgba(255,184,77,.24);background:rgba(255,184,77,.07);color:#f2c27b;font-size:8px;line-height:1.45;text-align:left';
      node.textContent = `REGISTRATION HOLD • ${reason}`;
      const side = row.querySelector('.row-side') || row;
      side.appendChild(node);
    });

    const note = document.getElementById('cashNote');
    const held = arr(replay.held);
    if (note && held.length) {
      const compact = [...new Set(held.map(item => `${item.ticker || 'LEG'}: ${item.reason || 'Registration pending'}`))].join(' • ');
      note.textContent = `Reinvestment Registration pending — ${compact}`;
    } else if (note && replay.status === 'OK') {
      note.textContent = 'Broker cash ledger connected. Reinvestment Registration is current.';
    }
  }

  async function penceFallback(replayResult) {
    const client = window.AuroraData2Client;
    const promotion = window.AuroraIncomeReinvestmentPromotion;
    const replayApi = window.AuroraIncomeReinvestmentReplay;
    if (!client?.post || !promotion?.parseLegs || !promotion?.promoteSettlement || !replayApi?.payload) return replayResult;
    const held = arr(replayResult?.held);
    if (!held.length) return replayResult;

    const snapshot = await client.post('brokerCashSnapshot', {});
    const settlements = arr(snapshot?.ledger).slice(0, 120).map(replayApi.payload).filter(Boolean);
    const affectedRefs = [...new Set(held.map(row => String(row?.dividendReference || '')).filter(Boolean))];
    const fallbackErrors = [];

    for (const reference of affectedRefs) {
      const item = settlements.find(row => String(row.reference || '') === reference);
      if (!item) continue;
      const allLegs = promotion.parseLegs(item.note);
      const readyLegs = allLegs.filter(leg => leg.ticker && leg.shares > 0 && leg.priceGbp > 0);
      const heldTickers = new Set(held.filter(row => String(row.dividendReference || '') === reference).map(row => tickerCode(row.ticker)));

      for (const leg of readyLegs.filter(row => heldTickers.has(tickerCode(row.ticker)))) {
        try {
          const built = buildPenceRequest(item, leg, readyLegs);
          const result = await client.post('registerPurchase', built.payload);
          if (!result?.confirmed || !result?.transaction) throw new Error('AuroraData 2 did not confirm the PENCE-format Registration retry.');
          if (String(result.transaction.transactionId || '') !== built.ids.transactionId) throw new Error('Confirmed transaction ID did not match the reinvestment retry.');
        } catch (error) {
          fallbackErrors.push({ dividendReference: reference, ticker: leg.ticker, reason: `PENCE retry: ${String(error?.message || error)}` });
        }
      }

      try { await promotion.promoteSettlement(item); }
      catch (error) { fallbackErrors.push({ dividendReference: reference, ticker: item.ticker, reason: `Promotion replay: ${String(error?.message || error)}` }); }
    }

    const finalResult = await replayApi.replay();
    if (fallbackErrors.length && arr(finalResult?.held).length) {
      finalResult.held = [...arr(finalResult.held), ...fallbackErrors];
      window.__auroraIncomeReinvestmentReplayStatus = finalResult;
      window.dispatchEvent(new CustomEvent('aurora:income-reinvestment-replay', { detail: finalResult }));
    }
    return finalResult;
  }

  async function retry({ allowPenceFallback = true } = {}) {
    resetRecordButton();
    const replay = window.AuroraIncomeReinvestmentReplay;
    if (!replay?.replay) return null;
    try {
      let result = await replay.replay();
      if (allowPenceFallback && arr(result?.held).length) result = await penceFallback(result);
      return result;
    } finally {
      resetRecordButton();
      setTimeout(decorateRows, 120);
      setTimeout(decorateRows, 500);
    }
  }

  function addRetryButton() {
    const actions = document.querySelector('#treasury .cash-actions');
    if (!actions || document.getElementById('retryReinvestmentRegistration')) return;
    const button = document.createElement('button');
    button.className = 'income-btn';
    button.id = 'retryReinvestmentRegistration';
    button.type = 'button';
    button.textContent = 'Retry Reinvestment Registration';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const old = button.textContent;
      button.textContent = 'Checking Registration…';
      try { await retry({ allowPenceFallback: true }); }
      finally {
        button.disabled = false;
        button.textContent = old;
      }
    });
    actions.appendChild(button);
  }

  async function autoRepairOnce() {
    try {
      if (sessionStorage.getItem(AUTO_KEY) === '1') return;
      sessionStorage.setItem(AUTO_KEY, '1');
    } catch (_) {}
    await retry({ allowPenceFallback: true });
  }

  function boot() {
    addRetryButton();
    resetRecordButton();
    setTimeout(decorateRows, 1800);
    setTimeout(autoRepairOnce, 2400);
    window.addEventListener('aurora:income-reinvestment-replay', () => {
      resetRecordButton();
      setTimeout(decorateRows, 100);
      setTimeout(decorateRows, 450);
    });
    window.addEventListener('aurora:income-settlement-reconcile', () => setTimeout(decorateRows, 150));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetRecordButton();
        setTimeout(decorateRows, 150);
      }
    });
  }

  window.AuroraIncomeReinvestmentRegistrationDiagnostics = Object.freeze({
    build: BUILD,
    retry,
    penceFallback,
    decorateRows,
    status
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();