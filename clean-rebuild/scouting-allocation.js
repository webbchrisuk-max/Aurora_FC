(() => {
  'use strict';

  const BUILD = '20260827-scouting-full-universe-allocation-1';
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value || 0));
  const round2 = value => Number(Number(value || 0).toFixed(2));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'
  }[ch]));
  const upper = value => String(value || '').trim().toUpperCase();
  const missionIsUsable = mission => !!mission && !['COMPLETE','CANCELLED'].includes(upper(mission.status)) && Number(mission.budget || 0) > 0;

  function pickCountForBudget(budget) {
    const value = Math.max(0, Number(budget || 0));
    if (value < 500) return 1;
    if (value < 1000) return 2;
    if (value < 2000) return 3;
    if (value < 3500) return 4;
    return 5;
  }

  function signature(plan) {
    if (!plan) return '';
    return JSON.stringify({
      missionId: plan.missionId || null,
      budget: round2(plan.budget),
      strategy: plan.strategy || 'sustainable',
      allocations: (plan.allocations || []).map(row => [row.ticker, round2(row.amount), round2(row.expectedAnnualIncome)])
    });
  }

  function buildPlan(state) {
    const aurora = window.AuroraClean;
    if (!aurora) return null;
    const mission = state.transfer?.mission;
    const budget = missionIsUsable(mission) ? round2(Math.max(0, Number(mission.budget || 0))) : 0;
    const strategy = state.scouting?.strategy === 'maximum' ? 'maximum' : 'sustainable';
    const rankingAuthority = window.AuroraScoutingNetwork?.rankings;
    const ranked = typeof rankingAuthority === 'function' ? rankingAuthority(state) : aurora.scoutingRankings(state);
    const eligible = ranked.filter(row => Number(row.yieldPct) > 0 && String(row.verdict || 'BUY') !== 'BLOCKED');
    const targetCount = budget > 0 ? Math.min(pickCountForBudget(budget), eligible.length) : 0;
    const rows = eligible.slice(0, targetCount);

    if (!budget || !rows.length) {
      return {
        build: BUILD,
        budget, strategy, selectedCount: rows.length, targetCount, allocated: 0, projectedAnnualIncome: 0,
        allocations: [], missionId: missionIsUsable(mission) ? mission.id : null,
        authority: missionIsUsable(mission) ? 'Finance Stage 6 + National Scouting Network' : 'WAITING FOR FINANCE STAGE 6',
        status: 'WAITING'
      };
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

    const allocations = items.filter(row => row.amount > 0.004).map((row,index) => ({
      selectionRank: index + 1,
      ticker: row.ticker,
      name: row.name,
      yieldPct: Number(row.yieldPct),
      score: Number(row.score),
      networkScore: Number(row.networkScore || row.score || 0),
      pipelineStage: row.stage || '',
      verdict: row.verdict || '',
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

    const proposal = {
      build: BUILD,
      budget,
      strategy,
      selectedCount: allocations.length,
      targetCount,
      allocated,
      projectedAnnualIncome: round2(allocations.reduce((sum, row) => sum + row.expectedAnnualIncome, 0)),
      allocations,
      missionId: mission.id,
      authority: 'Finance Stage 6 + National Scouting Network',
      status: 'PROPOSED',
      calculatedAt: new Date().toISOString()
    };
    proposal.signature = signature(proposal);

    const existing = state.scouting?.allocationPlan;
    if (existing?.status === 'APPROVED' && existing.signature && existing.signature === proposal.signature) {
      proposal.status = 'APPROVED';
      proposal.approvedAt = existing.approvedAt || null;
    }
    return proposal;
  }

  function render(plan) {
    if (!plan) return;
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const rows = document.getElementById('scoutingAllocationRows');
    const approve = document.getElementById('scoutingApprovePlan');
    setText('scoutingApprovedCount', String(plan.selectedCount || 0));
    setText('scoutingAllocatedBudget', money(plan.allocated));
    setText('scoutingProjectedIncome', money(plan.projectedAnnualIncome));
    setText('scoutingPlanStatus', plan.status === 'APPROVED' ? 'APPROVED FOR TRANSFER' : plan.allocations.length ? 'PROPOSED · REVIEW REQUIRED' : 'WAITING');
    setText('scoutingAllocationNote', plan.allocations.length
      ? `${plan.strategy === 'maximum' ? 'Maximum Income' : 'Sustainable Income'} selected ${plan.allocations.length} strongest recruitment candidate${plan.allocations.length === 1 ? '' : 's'} from the full National Scouting Network for ${money(plan.budget)}. Review the proposal, then approve the whole plan once.`
      : plan.budget > 0
        ? 'No eligible ranked opportunities are available for the released mission.'
        : 'Waiting for Finance Stage 6 to release an investment mission.');
    if (rows) {
      rows.innerHTML = plan.allocations.length
        ? plan.allocations.map(row => `<li><strong>#${row.selectionRank} ${esc(row.ticker)}</strong> — ${money(row.amount)} — network score ${Number(row.networkScore || row.score).toFixed(1)} — ${Number(row.yieldPct).toFixed(2)}% yield — ${esc(row.pipelineStage || row.verdict || '')} — projected annual income ${money(row.expectedAnnualIncome)}</li>`).join('')
        : `<li>${plan.budget > 0 ? 'No payday proposal yet.' : 'No Finance mission released yet.'}</li>`;
    }
    if (approve) {
      approve.disabled = !plan.allocations.length || plan.status === 'APPROVED';
      approve.textContent = plan.status === 'APPROVED' ? 'Payday Plan Approved ✓' : 'Approve Payday Plan';
    }
  }

  function samePlan(a, b) {
    if (!a || !b) return false;
    return signature(a) === signature(b) && String(a.status || '') === String(b.status || '') && String(a.approvedAt || '') === String(b.approvedAt || '');
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
      aurora.updateState(next => { next.scouting.allocationPlan = plan; });
      writing = false;
    }
  }

  function approvePlan() {
    const aurora = window.AuroraClean;
    if (!aurora) return;
    aurora.updateState(state => {
      const current = buildPlan(state);
      if (!current?.allocations?.length || current.status === 'WAITING') return;
      current.status = 'APPROVED';
      current.approvedAt = new Date().toISOString();
      state.scouting.allocationPlan = current;
      state.transfer.route = null;
    });
    refresh();
  }

  function boot() {
    if (!window.AuroraClean) { setTimeout(boot, 50); return; }
    document.getElementById('scoutingApprovePlan')?.addEventListener('click', approvePlan);
    refresh();
    window.addEventListener('aurora-clean:state', refresh);
    window.AuroraScoutingAllocation = Object.freeze({BUILD,buildPlan,refresh,approvePlan,pickCountForBudget});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();