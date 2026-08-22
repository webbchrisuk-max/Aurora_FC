(() => {
  'use strict';

  const BUILD = '20260822-transfer-strategy-control-2';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function normalize(value) {
    return String(value || '').toLowerCase() === 'maximum' ? 'maximum' : 'sustainable';
  }

  function label(value) {
    return normalize(value) === 'maximum' ? 'Maximum Income' : 'Sustainable Income';
  }

  function canChange(state) {
    const mission = state?.mission;
    const status = String(mission?.status || '').toUpperCase();
    const route = state?.transfer?.route;
    return Boolean(mission && status === 'DRAFT' && !(route?.locked === true && String(route?.missionId || '') === String(mission?.id || '')));
  }

  function currentStrategy(state) {
    return normalize(state?.scouting?.strategy || state?.mission?.strategy || 'sustainable');
  }

  function missionCancelled(state) {
    return String(state?.mission?.status || '').toUpperCase() === 'CANCELLED';
  }

  function writeStrategy(strategy) {
    const previous = readState();
    if (!previous) throw new Error('Aurora state is unavailable.');
    if (!canChange(previous)) throw new Error('Strategy can only be changed while the Transfer mission is still in DRAFT.');

    const nextStrategy = normalize(strategy);
    const stamp = new Date().toISOString();
    const next = {
      ...previous,
      scouting: {
        ...(previous.scouting || {}),
        strategy: nextStrategy,
        updatedAt: stamp
      },
      mission: {
        ...(previous.mission || {}),
        strategy: nextStrategy,
        updatedAt: stamp
      },
      transfer: {
        ...(previous.transfer || {}),
        selectedStrategy: nextStrategy,
        updatedAt: stamp
      },
      updatedAt: stamp
    };

    localStorage.setItem(BACKUP_KEY, JSON.stringify(previous));
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', {
      detail: { source: 'transfer-strategy-control', build: BUILD, strategy: nextStrategy }
    }));
  }

  function ensureStyles() {
    if (document.getElementById('transferStrategyControlStyles')) return;
    const style = document.createElement('style');
    style.id = 'transferStrategyControlStyles';
    style.textContent = `
      .transfer-strategy-control{margin-top:22px;border:1px solid rgba(255,213,107,.18);border-radius:22px;background:linear-gradient(135deg,rgba(41,27,5,.58),rgba(8,9,16,.95));padding:20px 22px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
      .transfer-strategy-copy{min-width:240px;flex:1}.transfer-strategy-copy small{display:block;color:#ff9aa4;font:800 10px/1.2 system-ui;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}.transfer-strategy-copy strong{display:block;font:900 22px/1.15 system-ui}.transfer-strategy-copy span{display:block;color:#968e99;font:600 12px/1.5 system-ui;margin-top:6px;max-width:700px}
      .transfer-strategy-buttons{display:flex;gap:8px;padding:5px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(0,0,0,.18)}.transfer-strategy-buttons button{appearance:none;border:1px solid transparent;border-radius:10px;background:transparent;color:#aaa1ad;padding:11px 14px;font:900 11px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}.transfer-strategy-buttons button.active{border-color:rgba(255,213,107,.32);background:rgba(255,213,107,.10);color:#ffe49f}.transfer-strategy-buttons button:disabled{opacity:.42;cursor:not-allowed}.transfer-strategy-lock{width:100%;color:#8d969b;font:700 11px/1.4 system-ui}.transfer-strategy-lock strong{color:#9affbd}
      @media(max-width:620px){.transfer-strategy-control{align-items:stretch}.transfer-strategy-buttons{width:100%;display:grid;grid-template-columns:1fr 1fr}.transfer-strategy-buttons button{white-space:normal}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    let host = document.getElementById('transferStrategyControl');
    if (host) return host;
    const missionShell = document.getElementById('transferMissionShell');
    if (!missionShell) return null;
    host = document.createElement('section');
    host.id = 'transferStrategyControl';
    host.className = 'transfer-strategy-control';
    missionShell.insertAdjacentElement('afterend', host);
    return host;
  }

  function guardCancelledMissionDisplay() {
    const state = readState();
    if (!missionCancelled(state)) return;

    const preview = document.getElementById('transferAllocationPreview');
    if (preview) {
      const kpis = preview.querySelectorAll('.allocation-kpis strong');
      if (kpis[0]) kpis[0].textContent = '£0.00';
      if (kpis[3]) kpis[3].textContent = '0';
      if (kpis[4]) kpis[4].textContent = '£0.00';
      if (kpis[5]) kpis[5].textContent = '£0.00';
      const empty = preview.querySelector('.allocation-empty');
      if (empty) empty.textContent = 'The previous Finance mission was cancelled. Return to Finance and release a new verified payday mission before building allocations.';
      const gate = preview.querySelector('.allocation-gate');
      if (gate) {
        gate.className = 'allocation-gate hold';
        gate.innerHTML = '<strong>ROUTE NOT READY</strong>Cancelled Finance missions cannot supply allocation cash. Release a new Finance mission to continue.';
      }
    }

    const save = document.getElementById('transferRouteSave');
    if (save) {
      const values = save.querySelectorAll('.route-save-grid strong');
      if (values[0]) values[0].textContent = '£0.00';
      if (values[1]) values[1].textContent = '£0.00';
      if (values[2]) values[2].textContent = '0';
      const hold = save.querySelector('.route-save-hold');
      if (hold) hold.innerHTML = '<strong>ROUTE SAVE HELD</strong><br>The previous Finance mission was cancelled. Release a new verified Finance mission before Save + Lock.';
    }
  }

  function render() {
    ensureStyles();
    const host = ensureSection();
    const state = readState();
    if (!host) return;

    if (!state?.mission || missionCancelled(state)) {
      const strategy = currentStrategy(state || {});
      host.innerHTML = `
        <div class="transfer-strategy-copy"><small>Transfer Strategy</small><strong>${label(strategy)}</strong><span>${missionCancelled(state) ? 'The previous Finance mission was cancelled. Your strategy is preserved, but a new Finance release is required before allocations can be built.' : 'Release a payday mission before choosing an allocation strategy.'}</span></div>
        <div class="transfer-strategy-buttons"><button class="${strategy === 'sustainable' ? 'active' : ''}" disabled>Sustainable Income</button><button class="${strategy === 'maximum' ? 'active' : ''}" disabled>Maximum Income</button></div>
        <div class="transfer-strategy-lock"><strong>WAITING FOR FINANCE:</strong> no cancelled mission can feed Allocation Preview or Save + Lock.</div>`;
      setTimeout(guardCancelledMissionDisplay, 0);
      return;
    }

    const strategy = currentStrategy(state);
    const editable = canChange(state);
    const status = String(state.mission.status || 'DRAFT').toUpperCase();
    host.innerHTML = `
      <div class="transfer-strategy-copy">
        <small>Transfer Strategy</small>
        <strong>${label(strategy)}</strong>
        <span>${editable ? 'Choose how Transfer ranks and allocates the Scouting-approved shortlist. The allocation preview recalculates immediately.' : 'This strategy is frozen because the route is already beyond the editable draft stage.'}</span>
      </div>
      <div class="transfer-strategy-buttons" role="group" aria-label="Transfer strategy">
        <button type="button" data-strategy="sustainable" class="${strategy === 'sustainable' ? 'active' : ''}" ${editable ? '' : 'disabled'}>Sustainable Income</button>
        <button type="button" data-strategy="maximum" class="${strategy === 'maximum' ? 'active' : ''}" ${editable ? '' : 'disabled'}>Maximum Income</button>
      </div>
      <div class="transfer-strategy-lock">${editable ? '<strong>EDITABLE:</strong> strategy will freeze when Save & Lock Route is completed.' : `<strong>${status.replaceAll('_',' ')}:</strong> strategy is locked for this route.`}</div>`;

    host.querySelectorAll('button[data-strategy]').forEach(button => {
      button.addEventListener('click', () => {
        const requested = normalize(button.dataset.strategy);
        if (requested === currentStrategy(readState())) return;
        try {
          writeStrategy(requested);
        } catch (error) {
          alert(`Strategy was not changed.\n\n${String(error?.message || error)}`);
        }
      });
    });

    window.AuroraTransferStrategyControl = Object.freeze({
      build: BUILD,
      ready: true,
      strategy,
      label: label(strategy),
      editable
    });
  }

  function boot() {
    render();
    const observer = new MutationObserver(() => guardCancelledMissionDisplay());
    observer.observe(document.body, {childList:true, subtree:true});
    window.addEventListener('aurora2:state', () => { render(); setTimeout(guardCancelledMissionDisplay, 0); });
    window.addEventListener('pageshow', () => { render(); setTimeout(guardCancelledMissionDisplay, 0); });
    window.addEventListener('focus', () => { render(); setTimeout(guardCancelledMissionDisplay, 0); });
    window.addEventListener('storage', event => {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY) {
        render();
        setTimeout(guardCancelledMissionDisplay, 0);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        render();
        setTimeout(guardCancelledMissionDisplay, 0);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
