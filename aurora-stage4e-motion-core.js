(() => {
  'use strict';

  const BUILD = '20260820-stage4e-motion-core-probe-1';
  const PRIORITY = 80;
  const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();
  const isFinanceProbe = currentFile === 'finance-stage4c-4d.html' && /\/stage4e\//i.test(window.location.pathname);

  let motionLoaded = false;
  let motionReady = false;
  let mutationTests = 0;
  let childModuleScripts = 0;
  let runtimeErrors = [];

  function ownerPriority() { return Number(window.AuroraStageOwner?.priority || 0); }
  function claimStage() {
    if (ownerPriority() > PRIORITY) return false;
    window.AuroraStageOwner = { stage: '4E', build: BUILD, priority: PRIORITY };
    document.documentElement.dataset.auroraStageOwner = '4E';
    return true;
  }

  function rootTarget(file) {
    const financeLike = /^finance(?:-stage4c(?:-4d)?)?\.html$/i.test(file);
    if (financeLike) return '/Aurora_FC/stage4e/finance-stage4c-4d.html';
    return `/Aurora_FC/${file}`;
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
      link.setAttribute('href', `${rootTarget(file)}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function setGlobalStatus() {
    if (ownerPriority() > PRIORITY) return;
    claimStage();
    document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 4E'; });
    document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'MOTION CORE PROBE'; });
    document.querySelectorAll('.department-hero small, .hero small').forEach((node) => {
      node.textContent = String(node.textContent || '').replace(/STAGE 3[HI]|STAGE 4[A-E]/gi, 'STAGE 4E');
    });
    stampNavigation();
  }

  function ensurePanel() {
    if (!isFinanceProbe || document.getElementById('stage4eMotionPanel')) return;
    const main = document.querySelector('main.page') || document.querySelector('main') || document.body;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'stage4eMotionPanel';
    panel.innerHTML = '<small>STAGE 4E RUNTIME CHECK</small><h2 id="stage4eMotionStatus">Motion Core: WAITING…</h2><p id="stage4eMotionNote">Waiting for the verified Stage 4D Finance UI stack before loading the exact old Motion controller.</p>';
    main.appendChild(panel);
  }

  function countChildScripts() {
    return document.querySelectorAll([
      'script[data-aurora-bill-actions-fix]',
      'script[data-aurora-house-dashboard-upgrade]',
      'script[data-aurora-house-room-groups]',
      'script[data-aurora-house-priority-layout]',
      'script[data-aurora-scouting-intelligence3-migration]',
      'script[data-aurora-scouting-intelligence3]',
      'script[data-aurora-scouting-intelligence3-global]',
      'script[data-aurora-scouting-intelligence3-approval]',
      'script[data-aurora-former-reentry]',
      'script[data-aurora-squad-opportunities]',
      'script[data-aurora-scouting-clean-board]',
      'script[data-aurora-background-signals]'
    ].join(',')).length;
  }

  function report(label, note) {
    setGlobalStatus();
    ensurePanel();
    motionReady = document.documentElement.classList.contains('aurora-motion-ready');
    childModuleScripts = countChildScripts();
    const title = document.getElementById('stage4eMotionStatus');
    const text = document.getElementById('stage4eMotionNote');
    if (title) title.textContent = `Motion Core: ${label}`;
    if (text) text.textContent = `${note} Motion ready: ${motionReady ? 'yes' : 'no'}. Mutation tests: ${mutationTests}. Child module scripts auto-loaded: ${childModuleScripts}. Runtime errors: ${runtimeErrors.length}.`;
    window.AuroraStage4E = Object.freeze({
      build: BUILD,
      motionLoaded,
      motionReady,
      mutationTests,
      childModuleScripts,
      runtimeErrors: [...runtimeErrors],
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

  function runMutationTest(delay, value) {
    setTimeout(() => {
      const harness = document.getElementById('stage4cLegacyFinanceHarness');
      if (!harness) { recordError(new Error('MOTION_HARNESS_MISSING')); return; }
      let target = harness.querySelector('#missionAmount, #mOpening, strong');
      if (!target) {
        target = document.createElement('strong');
        target.id = 'stage4eMotionTarget';
        harness.appendChild(target);
      }
      mutationTests += 1;
      target.textContent = `£${value}.00`;
      setTimeout(() => report(runtimeErrors.length ? 'ERROR ❌' : 'ACTIVE ✅', 'The Motion observer processed a controlled value mutation.'), 80);
    }, delay);
  }

  function loadMotion() {
    if (window.AuroraStage4EMotionLoadStarted) return true;
    window.AuroraStage4EMotionLoadStarted = true;
    report('LOADING…', 'Loading the exact old aurora-motion.js controller with its page-specific child loaders isolated by the Stage 4E test path.');

    const script = document.createElement('script');
    script.src = '/Aurora_FC/aurora-motion.js?v=20260820-stage4e-motion-core-probe-1';
    script.async = false;
    script.addEventListener('load', () => {
      motionLoaded = Boolean(window.AuroraMotion);
      setTimeout(() => report(motionLoaded ? 'ACTIVE ✅' : 'FAILED ❌', motionLoaded ? 'The exact Motion controller loaded and armed its observer.' : 'aurora-motion.js loaded but did not expose AuroraMotion.'), 250);
      runMutationTest(500, 101);
      runMutationTest(1400, 202);
      runMutationTest(2800, 303);
      setTimeout(() => report(runtimeErrors.length ? 'ERROR ❌' : 'ACTIVE ✅', 'Motion remained stable after its observer and pulse cycles.'), 4200);
    }, { once: true });
    script.addEventListener('error', () => recordError(new Error('AURORA_MOTION_LOAD_FAILED')), { once: true });
    document.head.appendChild(script);
    return true;
  }

  claimStage();
  setGlobalStatus();
  ensurePanel();

  if (!isFinanceProbe) {
    window.AuroraStage4E = Object.freeze({ build: BUILD, motionLoaded: false, runtimeErrors: [], stageOwner: '4E' });
    return;
  }

  let tries = 0;
  const wait = () => {
    const uiReady = Boolean(window.AuroraStage4D?.financeUiLoaded);
    const uiErrors = Number(window.AuroraStage4D?.runtimeErrors?.length || 0);
    const harnessReady = Boolean(document.getElementById('stage4cLegacyFinanceHarness'));
    if (uiReady && uiErrors === 0 && harnessReady) { loadMotion(); return; }
    tries += 1;
    if (tries > 700) {
      recordError(new Error(uiErrors ? 'FINANCE_UI_HAS_ERRORS' : 'FINANCE_UI_WAIT_TIMEOUT'));
      return;
    }
    setTimeout(wait, 25);
  };
  wait();
})();
