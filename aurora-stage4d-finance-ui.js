(() => {
  'use strict';

  const BUILD = '20260820-stage4d-finance-ui-probe-1';
  const PRIORITY = 70;
  const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();
  const isFinanceProbe = currentFile === 'finance-stage4c-4d.html';

  let financeUiLoaded = false;
  let uiNodes = 0;
  let uiChecks = 0;
  let stateRefreshes = 0;
  let uiWriteAttempts = 0;
  let uiUpdateAttempts = 0;
  let runtimeErrors = [];
  let wrapped = false;
  let phase = 'idle';

  function ownerPriority() { return Number(window.AuroraStageOwner?.priority || 0); }
  function claimStage() {
    if (ownerPriority() > PRIORITY) return false;
    window.AuroraStageOwner = { stage: '4D', build: BUILD, priority: PRIORITY };
    document.documentElement.dataset.auroraStageOwner = '4D';
    return true;
  }

  function stampNavigation() {
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach((link) => {
      const raw = String(link.getAttribute('href') || '');
      if (!raw || raw.startsWith('#')) return;
      const target = raw.split('#')[0].split('?')[0];
      const file = target.split('/').pop() || '';
      const allowed = /^(index|finance|scouting|transfer|registration|squad|income|match-report|club-control|system-health)\.html$/i.test(file)
        || /^auroracityfc_nexusv2\.html$/i.test(file)
        || /^finance-stage4c(?:-4d)?\.html$/i.test(file);
      if (!allowed) return;
      const nextTarget = /^finance(?:-stage4c(?:-4d)?)?\.html$/i.test(file) ? 'finance-stage4c-4d.html' : target;
      link.setAttribute('href', `${nextTarget}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function setGlobalStatus() {
    if (ownerPriority() > PRIORITY) return;
    claimStage();
    document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 4D'; });
    document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'FINANCE UI PROBE'; });
    document.querySelectorAll('.department-hero small, .hero small').forEach((node) => {
      node.textContent = String(node.textContent || '').replace(/STAGE 3[HI]|STAGE 4[A-D]/gi, 'STAGE 4D');
    });
    stampNavigation();
  }

  function ensurePanel() {
    if (!isFinanceProbe || document.getElementById('stage4dFinanceUiPanel')) return;
    const main = document.querySelector('main.page') || document.querySelector('main') || document.body;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'stage4dFinanceUiPanel';
    panel.innerHTML = '<small>STAGE 4D RUNTIME CHECK</small><h2 id="stage4dFinanceUiStatus">Finance UI: WAITING…</h2><p id="stage4dFinanceUiNote">Waiting for the verified Stage 4C Finance Main harness before loading the exact old finance-ui.js layer.</p>';
    main.appendChild(panel);
  }

  function countUiNodes() {
    const harness = document.getElementById('stage4cLegacyFinanceHarness');
    if (!harness) return 0;
    return harness.querySelectorAll('[id^="financeV2"], [id^="fv2"], [class*="fv2"], [class*="fv21"]').length;
  }

  function report(label, note) {
    setGlobalStatus();
    ensurePanel();
    uiNodes = countUiNodes();
    uiChecks += 1;
    const title = document.getElementById('stage4dFinanceUiStatus');
    const text = document.getElementById('stage4dFinanceUiNote');
    if (title) title.textContent = `Finance UI: ${label}`;
    if (text) {
      text.textContent = `${note} UI nodes: ${uiNodes}. UI checks: ${uiChecks}. State refreshes: ${stateRefreshes}. `
        + `UI writes/updates blocked: ${uiWriteAttempts}/${uiUpdateAttempts}. Runtime errors: ${runtimeErrors.length}.`;
    }
    window.AuroraStage4D = Object.freeze({
      build: BUILD,
      financeUiLoaded,
      uiNodes,
      uiChecks,
      stateRefreshes,
      uiWriteAttempts,
      uiUpdateAttempts,
      runtimeErrors: [...runtimeErrors],
      stateWritesEnabled: false,
      stageOwner: window.AuroraStageOwner?.stage || null
    });
  }

  function recordError(value) {
    const msg = String(value?.message || value || 'Unknown error');
    if (!runtimeErrors.includes(msg)) runtimeErrors.push(msg);
    report('ERROR ❌', `Runtime error captured: ${msg}`);
  }

  window.addEventListener('error', (event) => {
    if (isFinanceProbe) recordError(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isFinanceProbe) recordError(event.reason || 'Unhandled promise rejection');
  });

  function wrapCore() {
    if (wrapped) return true;
    const core = window.Aurora2?.core;
    if (!core?.read || typeof core.write !== 'function' || typeof core.update !== 'function') return false;
    const previousWrite = core.write;
    const previousUpdate = core.update;

    core.write = function auroraStage4DUiWrite(nextState) {
      if (phase === 'ui' || phase === 'state') uiWriteAttempts += 1;
      const result = previousWrite(nextState);
      report('ACTIVE ✅', 'A Finance UI Core write reached the verified read-only stack and was not persisted.');
      return result;
    };

    core.update = function auroraStage4DUiUpdate(mutator) {
      if (phase === 'ui' || phase === 'state') uiUpdateAttempts += 1;
      const result = previousUpdate(mutator);
      report('ACTIVE ✅', 'A Finance UI Core update reached the verified read-only stack and was not persisted.');
      return result;
    };

    wrapped = true;
    return true;
  }

  function sendStateRefresh(delay) {
    setTimeout(() => {
      phase = 'state';
      stateRefreshes += 1;
      try {
        window.dispatchEvent(new CustomEvent('aurora2:state', { detail: { stage4dProbe: true, sequence: stateRefreshes } }));
      } catch (error) {
        recordError(error);
      }
      phase = 'idle';
      setTimeout(() => report(runtimeErrors.length ? 'ERROR ❌' : 'ACTIVE ✅', 'A controlled state refresh completed across Finance Main and Finance UI.'), 100);
    }, delay);
  }

  function loadFinanceUi() {
    if (!wrapCore()) return false;
    if (window.AuroraStage4DUiLoadStarted) return true;
    window.AuroraStage4DUiLoadStarted = true;
    report('LOADING…', 'Loading the exact old finance-ui.js on top of the verified 4C Finance harness.');

    const script = document.createElement('script');
    script.src = '/Aurora_FC/finance-ui.js?v=20260820-stage4d-finance-ui-probe-1';
    script.async = false;
    script.addEventListener('load', () => {
      financeUiLoaded = Boolean(window.AuroraFinanceUI);
      phase = 'ui';
      setTimeout(() => { phase = 'idle'; report(financeUiLoaded ? 'ACTIVE ✅' : 'FAILED ❌', financeUiLoaded ? 'The exact Finance UI layer loaded and completed its initial DOM build.' : 'finance-ui.js loaded but did not expose AuroraFinanceUI.'); }, 250);
      setTimeout(() => report(runtimeErrors.length ? 'ERROR ❌' : 'ACTIVE ✅', 'Finance UI delayed startup/render pass completed.'), 1200);
      setTimeout(() => report(runtimeErrors.length ? 'ERROR ❌' : 'ACTIVE ✅', 'Finance UI remained stable after its delayed render cycle.'), 3000);
      sendStateRefresh(500);
      sendStateRefresh(1800);
      sendStateRefresh(4200);
    }, { once: true });
    script.addEventListener('error', () => recordError(new Error('FINANCE_UI_LOAD_FAILED')), { once: true });
    document.head.appendChild(script);
    return true;
  }

  claimStage();
  setGlobalStatus();
  ensurePanel();

  if (!isFinanceProbe) {
    window.AuroraStage4D = Object.freeze({ build: BUILD, financeUiLoaded: false, stateWritesEnabled: false, stageOwner: '4D' });
    return;
  }

  let tries = 0;
  const wait = () => {
    const mainReady = Boolean(window.AuroraStage4C?.financeLoaded);
    const mainErrors = Number(window.AuroraStage4C?.runtimeErrors?.length || 0);
    const harnessReady = Boolean(document.getElementById('stage4cLegacyFinanceHarness'));
    if (mainReady && mainErrors === 0 && harnessReady && loadFinanceUi()) return;
    tries += 1;
    if (tries > 600) {
      recordError(new Error(mainErrors ? 'FINANCE_MAIN_HAS_ERRORS' : 'FINANCE_MAIN_WAIT_TIMEOUT'));
      return;
    }
    setTimeout(wait, 25);
  };
  wait();
})();