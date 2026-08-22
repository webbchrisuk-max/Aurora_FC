(() => {
  'use strict';

  const BUILD = '20260822-transfer-mission-intake-auto-sync-2';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);

  function loadBrowserAutoSync() {
    if (window.__AuroraBrowserAutoSync || [...document.scripts].some(script => String(script.src || '').includes('aurora-browser-sync-auto.js'))) return;
    const script = document.createElement('script');
    script.src = 'aurora-browser-sync-auto.js?v=20260822-browser-auto-sync-2';
    script.async = false;
    document.head.appendChild(script);
  }

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Math.max(0, Number(value) || 0));

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

  function render() {
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
    const remaining = mission.amountRemaining != null
      ? Math.max(0, Number(mission.amountRemaining) || 0)
      : Math.max(0, budget - allocated);
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
    window.AuroraTransferMissionIntake = Object.freeze({
      build: BUILD,
      ready: true,
      active: true,
      missionId: mission.id || mission.mission_id || '',
      status,
      approvedBudget: budget,
      amountAllocated: allocated,
      amountRemaining: remaining,
      readOnly: true
    });
  }

  function boot() {
    loadBrowserAutoSync();
    render();
    window.addEventListener('pageshow', render);
    window.addEventListener('focus', render);
    window.addEventListener('storage', event => {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY) render();
    });
    window.addEventListener('aurora2:state', render);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();