(() => {
  'use strict';

  const BUILD = '20260826-clean-finance-auto-refresh-1';
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

  function holdingPot(state) {
    return (state?.finance?.pots || []).find(p => !p?.archived && norm(p?.name) === 'holding pot') || null;
  }

  function stable(value) {
    try { return JSON.stringify(value); } catch (_) { return ''; }
  }

  function refreshNow() {
    if (running) {
      queued = true;
      return;
    }

    const A = window.AuroraClean;
    const E = window.AuroraFinanceEngine;
    if (!A?.readState || !A?.updateState || !E?.calcBills || !E?.calcHolding || !E?.calcPots || !E?.calcDecision) {
      schedule(80);
      return;
    }

    running = true;
    try {
      const source = A.readState();
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

      const before = stable({
        holdingPotBalance: source.finance?.holdingPotBalance,
        holdingPotTarget: source.finance?.holdingPotTarget,
        stage2Bills: source.finance?.stage2Bills,
        stage3HoldingPot: source.finance?.stage3HoldingPot,
        stage4PotFunding: source.finance?.stage4PotFunding,
        stage5PaydayDecision: source.finance?.stage5PaydayDecision,
        lastSafeRelease: source.finance?.lastSafeRelease
      });

      const after = stable({
        holdingPotBalance: hp ? round(hp.balance) : round(source.finance?.holdingPotBalance),
        holdingPotTarget: hp ? round(hp.target) : round(source.finance?.holdingPotTarget),
        stage2Bills: bills,
        stage3HoldingPot: holding,
        stage4PotFunding: pots,
        stage5PaydayDecision: decision,
        lastSafeRelease: round(decision?.maximumSafeRelease)
      });

      if (before !== after) {
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
        });
      }

      const billStatus = document.getElementById('financeBillImportStatus');
      if (billStatus) billStatus.textContent = `Automatic · ${bills.billCount} active bill(s) · ${bills.payday} → ${bills.nextPayday}`;
      const holdingStatus = document.getElementById('financeHoldingImportStatus');
      if (holdingStatus) holdingStatus.textContent = `Automatic · Holding Pot ${new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(holding.currentBalance)} · top-up ${new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(holding.safetyTopUp)}`;
      const potStatus = document.getElementById('financePotImportStatus');
      if (potStatus) potStatus.textContent = `Automatic · ${pots.potCount} active pot(s) · ${new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pots.total)} planned`;
      const decisionStatus = document.getElementById('financeDecisionStage1Comparison');
      if (decisionStatus && decision) decisionStatus.textContent = 'Automatic · Payday Decision is live from current bills, Holding Pot and goal pots.';

      document.documentElement.dataset.financeAutoRefresh = 'ready';
      window.AuroraFinanceAutoRefresh = Object.freeze({ BUILD, ready: true, refresh: schedule });
    } finally {
      running = false;
      if (queued) {
        queued = false;
        schedule(40);
      }
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
