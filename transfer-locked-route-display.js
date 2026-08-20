(() => {
  'use strict';

  const BUILD = '20260820-transfer-locked-route-display-2';
  const STATE_KEY = 'aurora2:state:v1';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round = value => Number(Math.max(0, num(value)).toFixed(2));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(Math.max(0, num(value)));

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function accountLabel(value) {
    const lower = String(value || '').toLowerCase();
    if (lower.includes('212') || String(value || '').toUpperCase() === 'T212') return 'Trading 212 ISA';
    if (/\big\b/.test(lower) || lower.includes('ig isa') || String(value || '').toUpperCase() === 'IG') return 'IG ISA';
    return String(value || 'Broker');
  }

  function lockedContext(state) {
    const mission = state?.mission;
    const route = state?.transfer?.route;
    const status = String(mission?.status || '').toUpperCase();
    const matching = route && String(route?.missionId || '') === String(mission?.id || '');
    if (status !== 'LOCKED' || route?.locked !== true || !matching) return null;

    const allocations = arr(route.allocations).filter(row => num(row?.amount) > 0);
    const budget = round(mission?.approvedBudget ?? route?.financeBudget);
    const allocated = round(mission?.amountAllocated ?? route?.allocated ?? allocations.reduce((sum,row) => sum + num(row.amount), 0));
    const remaining = round(mission?.amountRemaining ?? route?.remaining ?? Math.max(0, budget - allocated));
    const income = Math.max(0, num(route?.income) || allocations.reduce((sum,row) => sum + Math.max(0, num(row?.expectedAnnualIncome)), 0));
    const strategy = String(route?.strategy || route?.scoutingStrategy || state?.scouting?.strategy || 'sustainable').toLowerCase() === 'maximum' ? 'Maximum income' : 'Sustainable income';

    return {mission, route, allocations, budget, allocated, remaining, income, strategy};
  }

  function renderLocked() {
    const state = readState();
    const locked = lockedContext(state);
    const host = document.getElementById('transferAllocationPreview');
    if (!locked || !host) return false;

    const targetCount = new Set(locked.allocations.map(row => String(row?.securityId || row?.ticker || row?.name || ''))).size;

    const headerStatus = document.querySelector('.topbar .status');
    if (headerStatus) {
      const label = headerStatus.querySelector('span');
      const value = headerStatus.querySelector('b');
      if (label) label.textContent = 'TRANSFER';
      if (value) value.textContent = 'ROUTE LOCKED';
    }
    const safeChip = document.querySelector('.transfer-status .safe');
    if (safeChip) safeChip.textContent = 'ROUTE LOCKED • REGISTRATION READY';

    host.innerHTML = `
      <div class="allocation-preview-head">
        <div>
          <span class="transfer-kicker">Stage T4 • Locked Allocation Route</span>
          <h2>Mission deployment locked</h2>
          <p>The allocation preview has finished. These are the frozen purchase legs saved for Registration, so Transfer no longer re-runs the pre-lock Scouting gate.</p>
        </div>
        <span class="allocation-preview-chip">${esc(locked.strategy)} • LOCKED</span>
      </div>
      <div class="allocation-kpis">
        <div><small>Finance budget</small><strong>${money(locked.budget)}</strong></div>
        <div><small>Locked targets</small><strong>${targetCount}</strong></div>
        <div><small>Executable</small><strong>${locked.allocations.length}</strong></div>
        <div><small>Purchase legs</small><strong>${locked.allocations.length}</strong></div>
        <div><small>Allocated</small><strong>${money(locked.allocated)}</strong></div>
        <div><small>Unallocated</small><strong>${money(locked.remaining)}</strong></div>
      </div>
      <div class="allocation-list">
        ${locked.allocations.map((row, index) => `
          <div class="allocation-row">
            <div class="allocation-rank">#${index + 1}</div>
            <div class="allocation-name">
              <b>${esc(row?.ticker || row?.name || 'Purchase leg')} • ${esc(row?.name || row?.ticker || 'Locked target')}</b>
              <span>${esc(String(row?.scoutingStatus || row?.status || 'locked').toUpperCase())} • stable leg ${esc(row?.id || '')}</span>
            </div>
            <div class="allocation-cell"><strong>${esc(accountLabel(row?.account))}</strong><span>Locked broker</span></div>
            <div class="allocation-cell"><strong>${num(row?.yieldPct).toFixed(2)}%</strong><span>Yield</span></div>
            <div class="allocation-cell allocation-amount"><strong>${money(row?.amount)}</strong><span>Locked allocation</span></div>
            <div class="allocation-cell allocation-income"><strong>+${money(row?.expectedAnnualIncome)}</strong><span>Est. annual income</span></div>
          </div>`).join('')}
      </div>
      <div class="allocation-gate ready">
        <strong>ROUTE LOCKED — READY FOR REGISTRATION</strong>
        ${money(locked.allocated)} is frozen across ${locked.allocations.length} purchase legs${locked.remaining > 0 ? `; ${money(locked.remaining)} remains intentionally unallocated` : ''}. Estimated annual income uplift: +${money(locked.income)}.
      </div>`;

    window.AuroraTransferAllocationPreview = Object.freeze({
      build: BUILD,
      ready: true,
      mode: 'LOCKED_ROUTE',
      routeLocked: true,
      routeSaveReady: false,
      exactReconciliation: Math.abs(locked.budget - locked.allocated - locked.remaining) <= 0.005,
      budget: locked.budget,
      allocated: locked.allocated,
      remaining: locked.remaining,
      income: Number(locked.income.toFixed(6)),
      allocations: locked.allocations.map(row => ({...row})),
      approved: locked.allocations.map(row => ({...row, simulationEligible:true})),
      candidates: locked.allocations.map(row => ({...row, simulationEligible:true})),
      targetCount,
      strategy: locked.route?.strategy || locked.route?.scoutingStrategy || 'sustainable',
      missionStatus: 'LOCKED',
      reason: 'LOCKED_ROUTE_IS_AUTHORITATIVE'
    });

    document.documentElement.dataset.transferAllocation = 'locked';
    return true;
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (renderLocked()) return;
      tries += 1;
      if (tries < 600) setTimeout(wait, 25);
    };
    wait();
  }

  const refresh = () => setTimeout(renderLocked, 0);
  window.addEventListener('aurora2:state', refresh);
  window.addEventListener('storage', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), {once:true});
  else setTimeout(boot, 0);
})();