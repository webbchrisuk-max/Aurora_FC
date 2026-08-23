/* Aurora City FC — Transfer UI Controller
 * Consolidates Transfer mission presentation and locked-route presentation.
 * Business engines (scouting, allocation, route save/guards, Chairman logic) remain separate.
 */
(() => {
  'use strict';

  const BUILD = '20260823-transfer-ui-controller-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);

  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round = value => Number(Math.max(0, num(value)).toFixed(2));
  const arr = value => Array.isArray(value) ? value : [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(Math.max(0, num(value)));

  function loadBrowserAutoSync() {
    if (window.__AuroraBrowserAutoSync || [...document.scripts].some(script => String(script.src || '').includes('aurora-browser-sync-auto.js'))) return;
    const script = document.createElement('script');
    script.src = 'aurora-browser-sync-auto.js?v=20260822-browser-auto-sync-2';
    script.async = false;
    document.head.appendChild(script);
  }

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function activeMission(state) {
    const mission = state?.mission;
    if (!mission || !(Number(mission.approvedBudget) > 0)) return null;
    if (TERMINAL.has(String(mission.status || '').toUpperCase())) return null;
    return mission;
  }

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function toneForStatus(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'DRAFT') return 'draft';
    if (s === 'READY') return 'ready';
    if (s === 'LOCKED' || s === 'PARTIALLY_REGISTERED') return 'locked';
    return 'neutral';
  }

  function resetPosition(status = 'WAITING FOR FINANCE', note = 'Finance must release a verified payday budget first.') {
    text('transferKpiBudget', '£0.00');
    text('transferKpiAllocated', '£0.00');
    text('transferKpiRemaining', '£0.00');
    text('transferKpiLegs', '0');
    const gate = document.getElementById('transferAllocationGate');
    if (gate) {
      gate.className = 'transfer-gate hold';
      gate.innerHTML = `<strong>${status}</strong><span>${note}</span>`;
    }
  }

  function renderMission() {
    const state = readState();
    const mission = activeMission(state);
    const shell = document.getElementById('transferMissionShell');
    if (!shell) return;

    if (!state) {
      shell.dataset.state = 'missing';
      text('transferMissionStatus', 'STATE NOT FOUND');
      text('transferBudget', '£0.00');
      text('transferMissionId', 'No Aurora state is available on this device.');
      text('transferMissionPayday', '—');
      text('transferMissionStrategy', '—');
      text('transferMissionRemaining', '£0.00');
      text('transferMissionSource', 'Aurora state is not available in this browser.');
      resetPosition('STATE NOT FOUND', 'Transfer cannot build a route until Aurora state is available.');
      window.AuroraTransferMissionIntake = Object.freeze({build:BUILD,ready:true,active:false,status:'STATE_NOT_FOUND',approvedBudget:0,amountAllocated:0,amountRemaining:0,readOnly:true});
      return;
    }

    if (!mission) {
      const previousStatus = String(state?.mission?.status || '').toUpperCase();
      const cancelled = previousStatus === 'CANCELLED';
      const strategy = String(state?.scouting?.strategy || state?.transfer?.selectedStrategy || 'Not selected');
      shell.dataset.state = 'empty';
      text('transferMissionStatus', 'WAITING FOR FINANCE');
      text('transferBudget', '£0.00');
      text('transferMissionId', cancelled ? 'Previous Finance mission was cancelled.' : 'No active Finance mission has been released.');
      text('transferMissionPayday', '—');
      text('transferMissionStrategy', strategy);
      text('transferMissionRemaining', '£0.00');
      text('transferMissionSource', cancelled ? 'Cancelled missions cannot supply Transfer cash. Finance must release a new verified payday budget.' : 'Finance must release a verified payday budget first.');
      resetPosition('WAITING FOR FINANCE', cancelled ? 'The previous mission was cancelled. Release a new Finance mission to continue.' : 'Finance must release a verified payday budget first.');
      window.AuroraTransferMissionIntake = Object.freeze({build:BUILD,ready:true,active:false,status:cancelled?'CANCELLED_WAIT':'NO_MISSION',approvedBudget:0,amountAllocated:0,amountRemaining:0,readOnly:true});
      return;
    }

    const status = String(mission.status || 'DRAFT').toUpperCase();
    const budget = Math.max(0, Number(mission.approvedBudget) || 0);
    const allocated = Math.max(0, Number(mission.amountAllocated) || 0);
    const remaining = mission.amountRemaining != null ? Math.max(0, Number(mission.amountRemaining) || 0) : Math.max(0, budget - allocated);
    const snapshot = mission.financeSnapshot || {};

    shell.dataset.state = toneForStatus(status);
    text('transferMissionStatus', status.replaceAll('_', ' '));
    text('transferBudget', money(budget));
    text('transferMissionId', mission.id || mission.mission_id || 'Mission');
    text('transferMissionPayday', mission.paydayDate || mission.sourceRelease?.paydayDate || '—');
    text('transferMissionStrategy', String(mission.strategy || state?.scouting?.strategy || 'Not selected'));
    text('transferMissionRemaining', money(remaining));
    text('transferMissionSource', `Finance safe-release snapshot: ${money(snapshot.safeSurplus ?? budget)} • exact approved budget ${money(budget)}.`);
    text('transferKpiBudget', money(budget));
    text('transferKpiAllocated', money(allocated));
    text('transferKpiRemaining', money(remaining));
    text('transferKpiLegs', String(Array.isArray(mission.legIds) ? mission.legIds.length : 0));

    const gate = document.getElementById('transferAllocationGate');
    if (gate) {
      gate.className = `transfer-gate ${status === 'DRAFT' ? 'open' : 'hold'}`;
      gate.innerHTML = status === 'DRAFT'
        ? '<strong>MISSION RECEIVED</strong><span>Finance budget is frozen and ready for the allocation layer.</span>'
        : `<strong>${status.replaceAll('_',' ')}</strong><span>This mission is already beyond initial allocation intake.</span>`;
    }

    document.documentElement.dataset.transferMissionIntake = 'live';
    window.AuroraTransferMissionIntake = Object.freeze({build:BUILD,ready:true,active:true,missionId:mission.id || mission.mission_id || '',status,approvedBudget:budget,amountAllocated:allocated,amountRemaining:remaining,readOnly:true});
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
    return {mission,route,allocations,budget,allocated,remaining,income,strategy};
  }

  function renderLockedRoute() {
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
        <div><span class="transfer-kicker">Stage T4 • Locked Allocation Route</span><h2>Mission deployment locked</h2><p>The allocation preview has finished. These are the frozen purchase legs saved for Registration, so Transfer no longer re-runs the pre-lock Scouting gate.</p></div>
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
        ${locked.allocations.map((row,index)=>`<div class="allocation-row"><div class="allocation-rank">#${index+1}</div><div class="allocation-name"><b>${esc(row?.ticker || row?.name || 'Purchase leg')} • ${esc(row?.name || row?.ticker || 'Locked target')}</b><span>${esc(String(row?.scoutingStatus || row?.status || 'locked').toUpperCase())} • stable leg ${esc(row?.id || '')}</span></div><div class="allocation-cell"><strong>${esc(accountLabel(row?.account))}</strong><span>Locked broker</span></div><div class="allocation-cell"><strong>${num(row?.yieldPct).toFixed(2)}%</strong><span>Yield</span></div><div class="allocation-cell allocation-amount"><strong>${money(row?.amount)}</strong><span>Locked allocation</span></div><div class="allocation-cell allocation-income"><strong>+${money(row?.expectedAnnualIncome)}</strong><span>Est. annual income</span></div></div>`).join('')}
      </div>
      <div class="allocation-gate ready"><strong>ROUTE LOCKED — READY FOR REGISTRATION</strong>${money(locked.allocated)} is frozen across ${locked.allocations.length} purchase legs${locked.remaining > 0 ? `; ${money(locked.remaining)} remains intentionally unallocated` : ''}. Estimated annual income uplift: +${money(locked.income)}.</div>`;

    window.AuroraTransferAllocationPreview = Object.freeze({build:BUILD,ready:true,mode:'LOCKED_ROUTE',routeLocked:true,routeSaveReady:false,exactReconciliation:Math.abs(locked.budget-locked.allocated-locked.remaining)<=0.005,budget:locked.budget,allocated:locked.allocated,remaining:locked.remaining,income:Number(locked.income.toFixed(6)),allocations:locked.allocations.map(row=>({...row})),approved:locked.allocations.map(row=>({...row,simulationEligible:true})),candidates:locked.allocations.map(row=>({...row,simulationEligible:true})),targetCount,strategy:locked.route?.strategy || locked.route?.scoutingStrategy || 'sustainable',missionStatus:'LOCKED',reason:'LOCKED_ROUTE_IS_AUTHORITATIVE'});
    document.documentElement.dataset.transferAllocation = 'locked';
    return true;
  }

  function render() {
    renderMission();
    renderLockedRoute();
  }

  function boot() {
    loadBrowserAutoSync();
    render();
    window.addEventListener('pageshow', render);
    window.addEventListener('focus', render);
    window.addEventListener('storage', event => { if (!event.key || event.key === STATE_KEY || event.key === BACKUP_KEY) render(); });
    window.addEventListener('aurora2:state', render);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
    window.AuroraTransferUiController = Object.freeze({build:BUILD,render});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();