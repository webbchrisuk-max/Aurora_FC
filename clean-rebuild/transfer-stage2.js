(() => {
  'use strict';

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value || 0));
  const round2 = value => Number(Number(value || 0).toFixed(2));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const upper = value => String(value || '').trim().toUpperCase();

  function scaledPlan(state) {
    const mission = state.transfer?.mission;
    const source = state.scouting?.allocationPlan;
    if (!mission || !source || !Array.isArray(source.allocations) || !source.allocations.length) return null;
    const missionBudget = round2(Math.max(0, Number(mission.budget || 0)));
    const sourceBudget = round2(Math.max(0, Number(source.budget || source.allocated || 0)));
    if (!missionBudget || !sourceBudget) return null;

    const factor = missionBudget / sourceBudget;
    const allocations = source.allocations.map(row => ({
      ticker: row.ticker,
      name: row.name,
      yieldPct: Number(row.yieldPct || 0),
      score: Number(row.score || 0),
      amount: round2(Number(row.amount || 0) * factor)
    })).filter(row => row.ticker && row.amount > 0);

    let allocated = round2(allocations.reduce((sum,row)=>sum+row.amount,0));
    const delta = round2(missionBudget - allocated);
    if (allocations.length && Math.abs(delta) >= 0.01) allocations[0].amount = round2(allocations[0].amount + delta);
    allocations.forEach(row => {
      row.expectedAnnualIncome = round2(row.amount * row.yieldPct / 100);
    });
    allocated = round2(allocations.reduce((sum,row)=>sum+row.amount,0));

    return {
      budget: missionBudget,
      strategy: source.strategy || state.scouting?.strategy || 'sustainable',
      allocations,
      allocated,
      expectedAnnualIncome: round2(allocations.reduce((sum,row)=>sum+row.expectedAnnualIncome,0))
    };
  }

  function render() {
    const aurora = window.AuroraClean;
    if (!aurora) return;
    const state = aurora.readState();
    const mission = state.transfer?.mission;
    const route = state.transfer?.route;
    const preview = scaledPlan(state);

    const setText = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    const rows = document.getElementById('transferStage2Rows');
    const build = document.getElementById('transferStage2Build');
    const lock = document.getElementById('transferStage2Lock');

    setText('transferStage2Mission', mission ? `${mission.status} · ${money(mission.budget)}` : 'No Finance mission');

    if (route?.allocations?.length) {
      setText('transferStage2RouteStatus', route.locked ? 'LOCKED' : 'READY');
      if (rows) rows.innerHTML = route.allocations.map(row => `<li><strong>${esc(row.ticker)}</strong> — ${money(row.amount)} — projected annual income ${money(row.expectedAnnualIncome)}</li>`).join('');
    } else if (preview?.allocations?.length) {
      setText('transferStage2RouteStatus', 'SCOUTING OPTIMISER READY');
      if (rows) rows.innerHTML = preview.allocations.map(row => `<li><strong>${esc(row.ticker)}</strong> — ${money(row.amount)} — projected annual income ${money(row.expectedAnnualIncome)}</li>`).join('');
    } else {
      setText('transferStage2RouteStatus', mission ? 'WAITING FOR SCOUTING ALLOCATION' : 'WAITING FOR FINANCE');
      if (rows) rows.innerHTML = '<li>No optimiser allocation available yet.</li>';
    }

    if (build) build.disabled = !mission || !['DRAFT','READY'].includes(upper(mission.status)) || !preview?.allocations?.length || !!route?.locked;
    if (lock) lock.disabled = !route?.allocations?.length || !!route?.locked;
  }

  function bind() {
    const aurora = window.AuroraClean;
    if (!aurora) return false;

    document.getElementById('transferStage2Build')?.addEventListener('click', () => {
      aurora.updateState(state => {
        const plan = scaledPlan(state);
        if (!plan?.allocations?.length || !state.transfer?.mission) return;
        state.transfer.route = {
          id: `ROUTE-${Date.now()}`,
          missionId: state.transfer.mission.id,
          strategy: plan.strategy,
          allocationAuthority: 'Scouting Optimiser',
          allocations: plan.allocations,
          locked: false,
          createdAt: new Date().toISOString()
        };
        state.transfer.mission.status = 'READY';
        state.transfer.mission.updatedAt = new Date().toISOString();
      });
      render();
    });

    document.getElementById('transferStage2Lock')?.addEventListener('click', () => {
      aurora.updateState(state => {
        if (!state.transfer?.route?.allocations?.length || !state.transfer?.mission) return;
        state.transfer.route.locked = true;
        state.transfer.route.lockedAt = new Date().toISOString();
        state.transfer.mission.status = 'LOCKED';
        state.transfer.mission.updatedAt = new Date().toISOString();
      });
      render();
    });

    window.addEventListener('aurora-clean:state', render);
    window.addEventListener('storage', event => {
      if (event.key === 'aurora-clean:state:v1') render();
    });
    render();
    window.AuroraTransferStage2 = Object.freeze({scaledPlan, render});
    return true;
  }

  function boot() {
    if (!bind()) setTimeout(boot, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
