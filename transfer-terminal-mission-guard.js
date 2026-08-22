(() => {
  'use strict';

  const BUILD = '20260822-transfer-terminal-mission-guard-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function terminalStatus(state) {
    const status = String(state?.mission?.status || '').toUpperCase();
    return TERMINAL.has(status) ? status : '';
  }

  function apply() {
    const state = readState();
    const status = terminalStatus(state);
    if (!status) return;

    const preview = document.getElementById('transferAllocationPreview');
    if (preview) {
      const values = preview.querySelectorAll('.allocation-kpis strong');
      if (values[0]) values[0].textContent = '£0.00';
      if (values[3]) values[3].textContent = '0';
      if (values[4]) values[4].textContent = '£0.00';
      if (values[5]) values[5].textContent = '£0.00';

      preview.querySelector('.allocation-list')?.remove();

      let empty = preview.querySelector('.allocation-empty');
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'allocation-empty';
        const gate = preview.querySelector('.allocation-gate');
        if (gate) gate.insertAdjacentElement('beforebegin', empty);
        else preview.appendChild(empty);
      }
      empty.textContent = status === 'CANCELLED'
        ? 'The previous Finance mission was cancelled. Release a new verified Finance mission before building allocations.'
        : 'This Finance mission is closed and cannot supply new allocation cash.';

      const gate = preview.querySelector('.allocation-gate');
      if (gate) {
        gate.className = 'allocation-gate hold';
        gate.innerHTML = `<strong>ROUTE NOT READY</strong>${status === 'CANCELLED' ? 'Cancelled Finance missions cannot supply allocation cash. Release a new Finance mission to continue.' : 'A closed Finance mission cannot create a new Transfer route.'}`;
      }
    }

    const currentPreview = window.AuroraTransferAllocationPreview;
    if (currentPreview?.ready) {
      window.AuroraTransferAllocationPreview = Object.freeze({
        ...currentPreview,
        budget: 0,
        targetCount: 0,
        allocated: 0,
        remaining: 0,
        expectedAnnualIncome: 0,
        exactReconciliation: false,
        routeSaveReady: false,
        allocations: []
      });
    }

    const routeSave = document.getElementById('transferRouteSave');
    if (routeSave) {
      const values = routeSave.querySelectorAll('.route-save-grid strong');
      if (values[0]) values[0].textContent = '£0.00';
      if (values[1]) values[1].textContent = '£0.00';
      if (values[2]) values[2].textContent = '0';
      routeSave.querySelector('.route-save-action')?.remove();
      let hold = routeSave.querySelector('.route-save-hold');
      if (!hold) {
        hold = document.createElement('div');
        hold.className = 'route-save-hold';
        routeSave.appendChild(hold);
      }
      hold.innerHTML = `<strong>ROUTE SAVE HELD</strong><br>${status === 'CANCELLED' ? 'The previous Finance mission was cancelled. Release a new verified Finance mission before Save + Lock.' : 'This Finance mission is closed and cannot be used for a new route.'}`;
    }

    document.documentElement.dataset.transferTerminalMission = status.toLowerCase();
    window.AuroraTransferTerminalMissionGuard = Object.freeze({build:BUILD,ready:true,status,active:true});
  }

  function schedule() {
    setTimeout(apply, 0);
    setTimeout(apply, 60);
    setTimeout(apply, 220);
  }

  function boot() {
    schedule();
    window.addEventListener('pageshow', schedule);
    window.addEventListener('focus', schedule);
    window.addEventListener('aurora2:state', schedule);
    window.addEventListener('storage', event => {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY) schedule();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedule();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();