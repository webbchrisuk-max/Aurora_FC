(() => {
  'use strict';

  const BUILD = '20260819-stage4a-finance-funding-probe-1';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isFinance = currentFile === 'finance.html';
  let updateAttempts = 0;
  let fundingLoaded = false;

  function stampNavigation() {
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach((link) => {
      const raw = String(link.getAttribute('href') || '');
      const target = raw.split('#')[0].split('?')[0];
      if (!/^(index|finance|scouting|transfer|registration|squad|income|match-report|club-control|system-health)\.html$/i.test(target)) return;
      link.setAttribute('href', `${target}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function setGlobalStatus() {
    document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 4A'; });
    document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'FINANCE FUNDING PROBE'; });
  }

  function ensurePanel() {
    if (!isFinance || document.getElementById('stage4aFundingPanel')) return;
    const main = document.querySelector('main.page') || document.querySelector('main') || document.body;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'stage4aFundingPanel';
    panel.innerHTML = '<small>STAGE 4A RUNTIME CHECK</small><h2 id="stage4aFundingStatus">Finance Funding: WAITING…</h2><p id="stage4aFundingNote">Waiting for Aurora Core before loading the exact old Finance Funding Engine.</p>';
    main.appendChild(panel);
  }

  function report(label, note) {
    ensurePanel();
    const title = document.getElementById('stage4aFundingStatus');
    const text = document.getElementById('stage4aFundingNote');
    if (title) title.textContent = `Finance Funding: ${label}`;
    if (text) text.textContent = `${note} State update attempts blocked: ${updateAttempts}.`;
    window.AuroraStage4A = Object.freeze({
      build: BUILD,
      financePage: isFinance,
      fundingLoaded,
      updateAttempts,
      stateWritesEnabled: false
    });
  }

  function loadFunding() {
    const core = window.Aurora2?.core;
    if (!core?.read || typeof core.update !== 'function') return false;

    const originalUpdate = core.update;
    core.update = function auroraStage4AFundingDryRunUpdate(mutator) {
      updateAttempts += 1;
      report('ACTIVE ✅', 'The exact Funding Engine is running in a local-state dry run.');
      try {
        const current = core.read();
        if (typeof mutator === 'function') mutator(current);
      } catch (_) {}
      return core.read();
    };

    window.AuroraStage4AFundingShield = Object.freeze({
      build: BUILD,
      originalUpdate,
      status: () => ({ updateAttempts, fundingLoaded })
    });

    const mission = document.createElement('script');
    mission.src = '/aurora-fc-2/aurora-transfer-mission.js?v=20260819-stage4a-finance-funding-probe-1';
    mission.async = false;
    mission.addEventListener('load', () => {
      const funding = document.createElement('script');
      funding.src = '/aurora-fc-2/finance-funding.js?v=20260819-stage4a-finance-funding-probe-1';
      funding.async = false;
      funding.addEventListener('load', () => {
        fundingLoaded = true;
        report('ACTIVE ✅', 'The exact old Finance Funding Engine loaded. Its canonical state writes are shielded for this first Finance probe.');
      }, { once: true });
      funding.addEventListener('error', () => report('FAILED ❌', 'Finance Funding Engine failed to load.'), { once: true });
      document.head.appendChild(funding);
    }, { once: true });
    mission.addEventListener('error', () => report('FAILED ❌', 'Transfer Mission helper failed to load.'), { once: true });
    document.head.appendChild(mission);
    return true;
  }

  setGlobalStatus();
  stampNavigation();
  ensurePanel();

  if (!isFinance) {
    window.AuroraStage4A = Object.freeze({ build: BUILD, financePage: false, fundingLoaded: false, stateWritesEnabled: false });
    return;
  }

  let tries = 0;
  const wait = () => {
    if (loadFunding()) return;
    tries += 1;
    if (tries > 240) {
      report('FAILED ❌', 'Aurora Core did not become ready for Finance Funding.');
      return;
    }
    setTimeout(wait, 25);
  };
  wait();
})();
