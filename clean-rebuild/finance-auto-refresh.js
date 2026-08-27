(() => {
  'use strict';

  const BUILD = '20260827-clean-finance-auto-refresh-2';
  let running = false;
  let queued = false;
  let timer = null;

  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const round = value => Number(num(value).toFixed(2));
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const stable = value => { try { return JSON.stringify(value); } catch (_) { return ''; } };

  function holdingPot(state) {
    return (state?.finance?.pots || []).find(p => !p?.archived && norm(p?.name) === 'holding pot') || null;
  }

  function inputSignature(state) {
    const finance = state?.finance || {};
    return stable({
      paydayDate: String(finance.paydayDate || ''),
      expectedWages: round(finance.expectedWages),
      wagesReceived: round(finance.wagesReceived),
      availableCash: round(finance.availableCash),
      protectedCash: round(finance.protectedCash),
      bills: (finance.bills || []).map(b => ({
        id: String(b?.id || ''), name: String(b?.name || ''), amount: round(b?.amount),
        due: String(b?.due || b?.dueDate || ''), frequency: String(b?.frequency || ''),
        fundingSource: String(b?.fundingSource || ''), included: b?.included !== false,
        paid: !!b?.paid, archived: !!b?.archived
      })),
      pots: (finance.pots || []).map(p => ({
        id: String(p?.id || ''), name: String(p?.name || ''), balance: round(p?.balance),
        target: round(p?.target), spent: round(p?.spent), goalMode: String(p?.goalMode || ''),
        deadline: String(p?.deadline || p?.completeBy || p?.targetDate || ''),
        fundingOverride: round(p?.fundingOverride), priority: Number(p?.priority) || 2,
        archived: !!p?.archived
      }))
    });
  }

  function statusText(state) {
    const b = state?.finance?.stage2Bills;
    const h = state?.finance?.stage3HoldingPot;
    const p = state?.finance?.stage4PotFunding;
    const d = state?.finance?.stage5PaydayDecision;
    const gbp = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
    const billStatus = document.getElementById('financeBillImportStatus');
    if (billStatus && b) billStatus.textContent = `LIVE · ${b.billCount} active bill(s) · ${b.payday} → ${b.nextPayday}`;
    const holdingStatus = document.getElementById('financeHoldingImportStatus');
    if (holdingStatus && h) holdingStatus.textContent = `LIVE · Holding Pot ${gbp(h.currentBalance)} · top-up ${gbp(h.safetyTopUp)}`;
    const potStatus = document.getElementById('financePotImportStatus');
    if (potStatus && p) potStatus.textContent = `LIVE · ${p.potCount} active pot(s) · ${gbp(p.total)} planned`;
    const decisionStatus = document.getElementById('financeDecisionStage1Comparison');
    if (decisionStatus && d) decisionStatus.textContent = 'LIVE · Payday Decision automatically reflects current bills, Holding Pot and goal pots.';
  }

  function refreshNow() {
    if (running) { queued = true; return; }

    const A = window.AuroraClean;
    const E = window.AuroraFinanceEngine;
    if (!A?.readState || !A?.updateState || !E?.calcBills || !E?.calcHolding || !E?.calcPots || !E?.calcDecision) {
      schedule(80);
      return;
    }

    running = true;
    try {
      const source = A.readState();
      const signature = inputSignature(source);
      const finance = source.finance || {};
      const alreadyCurrent = finance.autoCalculationInputSignature === signature &&
        finance.stage2Bills && finance.stage3HoldingPot && finance.stage4PotFunding && finance.stage5PaydayDecision;

      if (!alreadyCurrent) {
        const calcState = clone(source);
        const hp = holdingPot(calcState);
        if (hp) {
          calcState.finance.holdingPotBalance = round(hp.balance);
          calcState.finance.holdingPotTarget = round(hp.target);
        }

        const bills = E.calcBills(calcState);
        const holding = E.calcHolding(calcState, bills);
        const pots = E.calcPots(calcState);
        const decision = E.calcDecision(calcState, bills, holding, pots);

        A.updateState(state => {
          const liveHp = holdingPot(state);
          if (liveHp) {
            state.finance.holdingPotBalance = round(liveHp.balance);
            state.finance.holdingPotTarget = round(liveHp.target);
            state.finance.holdingPotImportSource = 'CLEAN_FINANCE_POTS:AUTO';
            state.finance.holdingPotImportAt = new Date().toISOString();
          }
          state.finance.stage2Bills = bills;
          state.finance.stage3HoldingPot = holding;
          state.finance.stage4PotFunding = pots;
          state.finance.stage5PaydayDecision = decision;
          state.finance.lastSafeRelease = round(decision?.maximumSafeRelease);
          state.finance.autoCalculatedAt = new Date().toISOString();
          state.finance.autoCalculationBuild = BUILD;
          state.finance.autoCalculationInputSignature = signature;
        });
        statusText(A.readState());
      } else {
        statusText(source);
      }

      document.documentElement.dataset.financeAutoRefresh = 'ready';
      window.AuroraFinanceAutoRefresh = Object.freeze({ BUILD, ready: true, refresh: schedule });
    } finally {
      running = false;
      if (queued) { queued = false; schedule(40); }
    }
  }

  function schedule(delay = 25) {
    clearTimeout(timer);
    timer = setTimeout(refreshNow, delay);
  }

  function boot() {
    schedule(0);
    window.addEventListener('aurora-clean:state', () => schedule(20));
    window.addEventListener('pageshow', () => schedule(20));
    window.addEventListener('focus', () => schedule(20));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedule(20);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
