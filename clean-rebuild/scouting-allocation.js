(() => {
  'use strict';

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value || 0));
  const round2 = value => Number(Number(value || 0).toFixed(2));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  function buildPlan(state) {
    const aurora = window.AuroraClean;
    if (!aurora) return null;
    const budget = round2(Math.max(0, aurora.safeRelease(state.finance)));
    const strategy = state.scouting?.strategy === 'maximum' ? 'maximum' : 'sustainable';
    const rows = aurora.scoutingRankings(state).filter(row => row.approved && Number(row.yieldPct) > 0);

    if (!budget || !rows.length) {
      return {budget, strategy, approvedCount: rows.length, allocated: 0, projectedAnnualIncome: 0, allocations: []};
    }

    const baseCap = strategy === 'maximum' ? 0.65 : 0.45;
    const capPct = Math.max(baseCap, 1 / rows.length);
    const items = rows.map(row => ({
      ...row,
      weight: strategy === 'maximum'
        ? Math.max(1, Number(row.score)) * Math.max(0.25, Number(row.yieldPct))
        : Math.max(1, Number(row.score)) * (row.held ? Math.max(0.45, 1 - Number(row.exposurePct || 0) / 100) : 1.12),
      amount: 0
    }));

    let remaining = budget;
    let open = [...items];
    while (open.length && remaining > 0.004) {
      const totalWeight = open.reduce((sum, row) => sum + row.weight, 0) || open.length;
      let capped = false;
      for (const row of [...open]) {
        const desired = remaining * (row.weight / totalWeight);
        const cap = budget * capPct;
        const capacity = Math.max(0, cap - row.amount);
        if (desired > capacity + 0.005) {
          row.amount += capacity;
          remaining -= capacity;
          open = open.filter(item => item !== row);
          capped = true;
        }
      }
      if (!capped) {
        const weight = open.reduce((sum, row) => sum + row.weight, 0) || open.length;
        open.forEach(row => { row.amount += remaining * (row.weight / weight); });
        remaining = 0;
      }
    }

    const allocations = items.filter(row => row.amount > 0.004).map(row => ({
      ticker: row.ticker,
      name: row.name,
      yieldPct: Number(row.yieldPct),
      score: Number(row.score),
      held: !!row.held,
      amount: round2(row.amount),
      expectedAnnualIncome: round2(row.amount * Number(row.yieldPct) / 100)
    }));

    let allocated = round2(allocations.reduce((sum, row) => sum + row.amount, 0));
    const delta = round2(budget - allocated);
    if (allocations.length && Math.abs(delta) >= 0.01) {
      allocations[0].amount = round2(allocations[0].amount + delta);
      allocations[0].expectedAnnualIncome = round2(allocations[0].amount * allocations[0].yieldPct / 100);
    }
    allocated = round2(allocations.reduce((sum, row) => sum + row.amount, 0));

    return {
      budget,
      strategy,
      approvedCount: rows.length,
      allocated,
      projectedAnnualIncome: round2(allocations.reduce((sum, row) => sum + row.expectedAnnualIncome, 0)),
      allocations,
      calculatedAt: new Date().toISOString()
    };
  }

  function render(plan) {
    if (!plan) return;
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const rows = document.getElementById('scoutingAllocationRows');
    setText('scoutingApprovedCount', String(plan.approvedCount));
    setText('scoutingAllocatedBudget', money(plan.allocated));
    setText('scoutingProjectedIncome', money(plan.projectedAnnualIncome));
    setText('scoutingAllocationNote', plan.allocations.length
      ? `${plan.strategy === 'maximum' ? 'Maximum Income' : 'Sustainable Income'} optimiser · ${plan.allocations.length} allocation(s) · no equal split.`
      : 'Approve one or more ranked candidates to build the payday allocation.');
    if (rows) {
      rows.innerHTML = plan.allocations.length
        ? plan.allocations.map((row, index) => `<li><strong>#${index + 1} ${esc(row.ticker)}</strong> — ${money(row.amount)} — ${row.yieldPct.toFixed(2)}% yield — projected annual income ${money(row.expectedAnnualIncome)}</li>`).join('')
        : '<li>No allocation yet.</li>';
    }
  }

  function samePlan(a, b) {
    if (!a || !b) return false;
    const clean = plan => JSON.stringify({
      budget: plan.budget, strategy: plan.strategy, approvedCount: plan.approvedCount,
      allocated: plan.allocated, projectedAnnualIncome: plan.projectedAnnualIncome,
      allocations: (plan.allocations || []).map(row => [row.ticker, row.amount, row.expectedAnnualIncome])
    });
    return clean(a) === clean(b);
  }

  let writing = false;
  function refresh() {
    const aurora = window.AuroraClean;
    if (!aurora || writing) return;
    const state = aurora.readState();
    const plan = buildPlan(state);
    render(plan);
    if (!samePlan(state.scouting?.allocationPlan, plan)) {
      writing = true;
      aurora.updateState(next => {
        next.scouting.allocationPlan = plan;
      });
      writing = false;
    }
  }

  function boot() {
    if (!window.AuroraClean) {
      setTimeout(boot, 50);
      return;
    }
    refresh();
    window.addEventListener('aurora-clean:state', refresh);
    window.AuroraScoutingAllocation = Object.freeze({buildPlan, refresh});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
