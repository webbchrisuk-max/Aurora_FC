(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-registration-diagnostics-3';
  const STATE_KEY = 'aurora2:state:v1';
  const AUTO_KEY = 'aurora:income:reinvestment-registration-repair:v3';
  const COST_TOLERANCE = 0.011;
  if (window.__auroraIncomeReinvestmentRegistrationDiagnostics) return;
  window.__auroraIncomeReinvestmentRegistrationDiagnostics = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(round2(value));

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

  function toast(message) {
    const el = document.getElementById('incomeToast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(window.__incomeRegistrationDiagnosticsToast);
    window.__incomeRegistrationDiagnosticsToast = setTimeout(() => el.classList.remove('show'), 5200);
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

  function adjustmentAmount(snapshot, dividendReference) {
    const api = window.AuroraIncomeReinvestmentCashRemainder;
    if (!api?.adjustmentReference) return null;
    const ref = api.adjustmentReference(dividendReference);
    const row = arr(snapshot?.ledger).find(item => String(item?.reference || '') === ref);
    if (!row) return null;
    const amount = Math.abs(num(row?.cashChangeGbp ?? row?.cash_change_gbp ?? row?.changeGbp ?? row?.change_gbp));
    return amount > 0 ? round2(amount) : null;
  }

  function costContext(snapshot, item, legs) {
    const remainder = adjustmentAmount(snapshot, item.reference);
    const gross = round2(item.amountGbp);
    const recordedSpend = round2(legs.reduce((sum, leg) => sum + (leg.shares * leg.priceGbp), 0));
    const requiredSpend = remainder === null ? null : round2(Math.max(0, gross - remainder));
    const difference = requiredSpend === null ? null : round2(Math.abs(recordedSpend - requiredSpend));
    return { gross, remainder, recordedSpend, requiredSpend, difference };
  }

  function buildPenceRequest(item, leg, allReadyLegs, exactCosts = null) {
    const state = readState();
    if (!state) throw new Error('Aurora local state is unavailable for Registration retry.');
    const account = accountCode(item.account);
    const tk = tickerCode(leg.ticker);
    const holding = activeHolding(state, account, tk);
    const target = targetFor(state, tk);
    const ids = idsFor(item, leg);
    const costFor = row => exactCosts && exactCosts.has(row.index)
      ? round2(exactCosts.get(row.index))
      : round2(row.shares * row.priceGbp);
    const totalReadyCostGbp = round2(allReadyLegs.reduce((sum, row) => sum + costFor(row), 0));
    const legCostGbp = costFor(leg);
    const precisePriceGbp = leg.shares > 0 ? legCostGbp / leg.shares : 0;
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
          priceInput: Number((precisePriceGbp * 100).toFixed(10)),
          priceUnit: 'PENCE',
          currency: 'GBP',
          fxRateToGbp: 1,
          feesNative: 0,
          totalCostGbp: legCostGbp,
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
              amount: costFor(row),
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

  async function getSettlementData(reference) {
    const client = window.AuroraData2Client;
    const replayApi = window.AuroraIncomeReinvestmentReplay;
    const promotion = window.AuroraIncomeReinvestmentPromotion;
    if (!client?.post || !replayApi?.payload || !promotion?.parseLegs) return null;
    const snapshot = await client.post('brokerCashSnapshot', {});
    const item = arr(snapshot?.ledger).slice(0, 120).map(replayApi.payload).filter(Boolean)
      .find(row => String(row.reference || '') === String(reference || ''));
    if (!item) return null;
    const legs = promotion.parseLegs(item.note).filter(leg => leg.ticker && leg.shares > 0 && leg.priceGbp > 0);
    return { snapshot, item, legs, costs: costContext(snapshot, item, legs) };
  }

  async function renderCostResolution() {
    const host = document.getElementById('cashLedger');
    if (!host) return;
    document.getElementById('riRegistrationCostResolution')?.remove();
    const replay = status();
    const held = arr(replay?.held);
    if (!held.length) return;
    const reference = String(held[0]?.dividendReference || '');
    if (!reference) return;

    let data;
    try { data = await getSettlementData(reference); } catch (_) { return; }
    if (!data || data.costs.remainder === null || data.costs.requiredSpend === null) return;
    if ((data.costs.difference || 0) <= COST_TOLERANCE) return;

    const panel = document.createElement('div');
    panel.id = 'riRegistrationCostResolution';
    panel.style.cssText = 'margin-top:12px;padding:12px;border:1px solid rgba(255,184,77,.24);border-radius:12px;background:rgba(255,184,77,.05)';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div><strong style="font-size:11px">Exact purchase costs required</strong><div style="margin-top:4px;color:#a898b7;font-size:8px;line-height:1.5">Dividend ${money(data.costs.gross)} − broker cash ${money(data.costs.remainder)} = <b>${money(data.costs.requiredSpend)}</b> actually invested. The rounded prices in the old evidence imply ${money(data.costs.recordedSpend)}, so Aurora will not guess the ${money(data.costs.difference)} difference.</div></div>
        <span class="income-badge">REGISTRATION HELD</span>
      </div>
      <div id="riExactCostInputs" style="display:grid;grid-template-columns:repeat(${Math.min(3, Math.max(1, data.legs.length))},minmax(150px,1fr));gap:8px;margin-top:10px"></div>
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px"><small style="color:#8f819e;font-size:8px">Enter each exact purchase value shown by Trading 212. Together they must total ${money(data.costs.requiredSpend)}.</small><button class="income-btn" id="riConfirmExactCosts" type="button">Confirm exact costs & register</button></div>
    `;
    const inputs = panel.querySelector('#riExactCostInputs');
    data.legs.forEach(leg => {
      const field = document.createElement('label');
      field.style.cssText = 'display:block;font-size:8px;color:#a898b7';
      field.innerHTML = `${leg.ticker} • ${leg.shares.toLocaleString('en-GB', { maximumFractionDigits: 8 })} shares<input data-ri-exact-cost data-index="${leg.index}" type="number" min="0" step="0.01" placeholder="Exact purchase value £" style="width:100%;margin-top:5px;padding:8px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.10);background:rgba(4,8,20,.45);color:#fff">`;
      inputs.appendChild(field);
    });
    host.insertAdjacentElement('afterend', panel);
    panel.querySelector('#riConfirmExactCosts')?.addEventListener('click', () => registerExactCosts(reference, panel));
  }

  async function registerExactCosts(reference, panel) {
    const client = window.AuroraData2Client;
    const promotion = window.AuroraIncomeReinvestmentPromotion;
    const replayApi = window.AuroraIncomeReinvestmentReplay;
    if (!client?.post || !promotion?.promoteSettlement || !replayApi?.replay) return toast('Registration recovery is not ready yet.');
    const data = await getSettlementData(reference);
    if (!data) return toast('The reinvestment settlement could not be reloaded.');

    const exactCosts = new Map();
    panel.querySelectorAll('[data-ri-exact-cost]').forEach(input => {
      const value = round2(input.value);
      if (value > 0) exactCosts.set(Number(input.dataset.index), value);
    });
    if (exactCosts.size !== data.legs.length) return toast('Enter the exact purchase value for every reinvestment leg.');
    const exactTotal = round2([...exactCosts.values()].reduce((sum, value) => sum + value, 0));
    if (Math.abs(exactTotal - data.costs.requiredSpend) > COST_TOLERANCE) {
      return toast(`Exact purchase values total ${money(exactTotal)}. They must total ${money(data.costs.requiredSpend)}.`);
    }

    const button = panel.querySelector('#riConfirmExactCosts');
    if (button) { button.disabled = true; button.textContent = 'Registering exact purchases…'; }
    try {
      for (const leg of data.legs) {
        const built = buildPenceRequest(data.item, leg, data.legs, exactCosts);
        const result = await client.post('registerPurchase', built.payload);
        if (!result?.confirmed || !result?.transaction) throw new Error(`${leg.ticker}: AuroraData 2 did not confirm the exact-cost purchase.`);
        if (String(result.transaction.transactionId || '') !== built.ids.transactionId) throw new Error(`${leg.ticker}: confirmed transaction ID did not match.`);
      }
      await promotion.promoteSettlement(data.item);
      const finalResult = await replayApi.replay();
      if (arr(finalResult?.held).length) throw new Error(arr(finalResult.held).map(row => `${row.ticker}: ${row.reason}`).join(' • '));
      toast(`${data.legs.length} reinvestment purchases confirmed by AuroraData 2 and promoted into Squad.`);
      panel.remove();
    } catch (error) {
      toast(`Registration remains held: ${String(error?.message || error)}`);
    } finally {
      resetRecordButton();
      if (button?.isConnected) { button.disabled = false; button.textContent = 'Confirm exact costs & register'; }
      setTimeout(decorateRows, 100);
      setTimeout(renderCostResolution, 350);
    }
  }

  async function safePenceFallback(replayResult) {
    const client = window.AuroraData2Client;
    const promotion = window.AuroraIncomeReinvestmentPromotion;
    const replayApi = window.AuroraIncomeReinvestmentReplay;
    if (!client?.post || !promotion?.parseLegs || !promotion?.promoteSettlement || !replayApi?.payload) return replayResult;
    const held = arr(replayResult?.held);
    if (!held.length) return replayResult;

    const snapshot = await client.post('brokerCashSnapshot', {});
    const settlements = arr(snapshot?.ledger).slice(0, 120).map(replayApi.payload).filter(Boolean);
    const affectedRefs = [...new Set(held.map(row => String(row?.dividendReference || '')).filter(Boolean))];
    const blocked = [];

    for (const reference of affectedRefs) {
      const item = settlements.find(row => String(row.reference || '') === reference);
      if (!item) continue;
      const readyLegs = promotion.parseLegs(item.note).filter(leg => leg.ticker && leg.shares > 0 && leg.priceGbp > 0);
      const costs = costContext(snapshot, item, readyLegs);
      if (costs.remainder === null || costs.requiredSpend === null || (costs.difference || 0) > COST_TOLERANCE) {
        blocked.push({
          dividendReference: reference,
          ticker: item.ticker,
          reason: costs.requiredSpend === null
            ? 'Exact broker cash remainder is required before canonical Registration.'
            : `Exact purchase costs required: ${money(costs.requiredSpend)} invested but rounded evidence totals ${money(costs.recordedSpend)}.`
        });
        continue;
      }

      const heldTickers = new Set(held.filter(row => String(row.dividendReference || '') === reference).map(row => tickerCode(row.ticker)));
      for (const leg of readyLegs.filter(row => heldTickers.has(tickerCode(row.ticker)))) {
        const built = buildPenceRequest(item, leg, readyLegs);
        const result = await client.post('registerPurchase', built.payload);
        if (!result?.confirmed || !result?.transaction || String(result.transaction.transactionId || '') !== built.ids.transactionId) {
          blocked.push({ dividendReference: reference, ticker: leg.ticker, reason: 'AuroraData 2 did not confirm the safe PENCE-format Registration retry.' });
        }
      }
      if (!blocked.some(row => row.dividendReference === reference)) await promotion.promoteSettlement(item);
    }

    const finalResult = await replayApi.replay();
    if (blocked.length && arr(finalResult?.held).length) {
      finalResult.held = [...arr(finalResult.held), ...blocked];
      window.__auroraIncomeReinvestmentReplayStatus = finalResult;
      window.dispatchEvent(new CustomEvent('aurora:income-reinvestment-replay', { detail: finalResult }));
    }
    return finalResult;
  }

  async function retry({ allowSafeFallback = true } = {}) {
    resetRecordButton();
    const replay = window.AuroraIncomeReinvestmentReplay;
    if (!replay?.replay) return null;
    try {
      let result = await replay.replay();
      if (allowSafeFallback && arr(result?.held).length) result = await safePenceFallback(result);
      return result;
    } finally {
      resetRecordButton();
      setTimeout(decorateRows, 120);
      setTimeout(renderCostResolution, 400);
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
      try { await retry({ allowSafeFallback: true }); }
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
    await retry({ allowSafeFallback: true });
  }

  function boot() {
    addRetryButton();
    resetRecordButton();
    setTimeout(decorateRows, 1800);
    setTimeout(renderCostResolution, 2100);
    setTimeout(autoRepairOnce, 2500);
    window.addEventListener('aurora:income-reinvestment-replay', () => {
      resetRecordButton();
      setTimeout(decorateRows, 100);
      setTimeout(renderCostResolution, 350);
    });
    window.addEventListener('aurora:income-settlement-reconcile', () => {
      setTimeout(decorateRows, 150);
      setTimeout(renderCostResolution, 400);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetRecordButton();
        setTimeout(decorateRows, 150);
        setTimeout(renderCostResolution, 400);
      }
    });
  }

  window.AuroraIncomeReinvestmentRegistrationDiagnostics = Object.freeze({
    build: BUILD,
    retry,
    safePenceFallback,
    renderCostResolution,
    decorateRows,
    status
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();