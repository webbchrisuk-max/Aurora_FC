(() => {
  'use strict';

  const BUILD = '20260820-stage4a-finance-funding-probe-6';
  const PRIORITY = 40;
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isFinance = currentFile === 'finance.html' || currentFile.startsWith('finance-stage4');
  const isNexus = currentFile === 'index.html' || currentFile === 'auroracityfc_nexusv2.html';
  let updateAttempts = 0;
  let writeAttempts = 0;
  let fundingLoaded = false;
  let shieldsInstalled = false;

  const currentOwnerPriority = () => Number(window.AuroraStageOwner?.priority || 0);
  const ownsGlobalStage = () => currentOwnerPriority() <= PRIORITY;

  function claimStage() {
    if (!ownsGlobalStage()) return false;
    document.documentElement.dataset.auroraStageOwner = '4A';
    window.AuroraStageOwner = { stage: '4A', build: BUILD, priority: PRIORITY };
    return true;
  }

  function stampNavigation() {
    if (!ownsGlobalStage()) return;
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach((link) => {
      const raw = String(link.getAttribute('href') || '');
      const target = raw.split('#')[0].split('?')[0];
      if (!/^(index|finance|scouting|transfer|registration|squad|income|match-report|club-control|system-health)\.html$/i.test(target)) return;
      link.setAttribute('href', `${target}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function mountNotificationBell() {
    const bell = document.getElementById('auroraNotificationBell');
    const topbar = document.querySelector('.topbar');
    const status = topbar?.querySelector('.status');
    if (!bell || !topbar) return false;
    bell.classList.add('aurora-header-notification');
    Object.assign(bell.style, {
      position: 'relative', inset: 'auto', width: '38px', height: '38px', minWidth: '38px',
      margin: '0 12px 0 auto', padding: '0', display: 'grid', placeItems: 'center',
      border: '1px solid rgba(82,217,255,.22)', borderRadius: '10px',
      background: 'rgba(13,31,47,.72)', color: '#bfefff', zIndex: '4'
    });
    if (bell.parentElement !== topbar) {
      if (status) topbar.insertBefore(bell, status); else topbar.appendChild(bell);
    } else if (status && bell.nextElementSibling !== status) topbar.insertBefore(bell, status);
    return true;
  }

  function settleNotificationBell() {
    [0, 50, 200, 600, 1500, 3000].forEach((delay) => setTimeout(mountNotificationBell, delay));
  }

  function setGlobalStatus() {
    if (!ownsGlobalStage()) return;
    claimStage();
    document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 4A'; });
    document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'FINANCE FUNDING PROBE'; });
    document.querySelectorAll('.department-hero small, .hero small').forEach((node) => {
      node.textContent = String(node.textContent || '').replace(/STAGE 3[HI]|STAGE 4A/gi, 'STAGE 4A');
    });
    stampNavigation();
  }

  function ensurePanel() {
    if ((!isFinance && !isNexus) || document.getElementById('stage4aFundingPanel')) return;
    const main = document.querySelector('main.page') || document.querySelector('main') || document.body;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'stage4aFundingPanel';
    if (isFinance) {
      panel.innerHTML = '<small>STAGE 4A RUNTIME CHECK</small><h2 id="stage4aFundingStatus">Finance Funding: WAITING…</h2><p id="stage4aFundingNote">Waiting for Aurora Core before loading the exact old Finance Funding Engine.</p>';
    } else {
      panel.innerHTML = '<small>STAGE 4A DEPARTMENT PROBE</small><h2>Finance Funding isolated</h2><p>The shared runtime remains verified. Open Finance Command to run the old Finance Funding Engine with local Core writes fully blocked.</p>';
    }
    main.appendChild(panel);
  }

  function report(label, note) {
    setGlobalStatus();
    ensurePanel();
    const title = document.getElementById('stage4aFundingStatus');
    const text = document.getElementById('stage4aFundingNote');
    if (title) title.textContent = `Finance Funding: ${label}`;
    if (text) text.textContent = `${note} Writes blocked: ${writeAttempts}. Updates blocked: ${updateAttempts}.`;
    settleNotificationBell();
    window.AuroraStage4A = Object.freeze({
      build: BUILD,
      financePage: isFinance,
      fundingLoaded,
      writeAttempts,
      updateAttempts,
      stateWritesEnabled: false,
      trueReadonlyShield: true,
      stageOwner: window.AuroraStageOwner?.stage || null
    });
  }

  function cloneState(value) {
    try { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch (_) { return value; }
  }

  function installTrueReadonlyShield() {
    const core = window.Aurora2?.core;
    if (!core?.read || typeof core.write !== 'function' || typeof core.update !== 'function') return false;
    if (shieldsInstalled) return true;
    const originalWrite = core.write;
    const originalUpdate = core.update;

    core.write = function auroraStage4AReadonlyWrite(nextState) {
      writeAttempts += 1;
      report('ACTIVE ✅', 'Finance Funding attempted a Core write; the candidate state was returned to the engine but not persisted.');
      return cloneState(nextState ?? core.read());
    };

    core.update = function auroraStage4AReadonlyUpdate(mutator) {
      updateAttempts += 1;
      const current = cloneState(core.read());
      let candidate = current;
      try { if (typeof mutator === 'function') candidate = mutator(current) ?? current; } catch (_) {}
      report('ACTIVE ✅', 'A Core update was intercepted and evaluated against a clone without persistence.');
      return cloneState(candidate);
    };

    shieldsInstalled = true;
    window.AuroraStage4AFundingShield = Object.freeze({
      build: BUILD,
      originalWrite,
      originalUpdate,
      status: () => ({ writeAttempts, updateAttempts, fundingLoaded, trueReadonlyShield: true })
    });
    return true;
  }

  function loadFunding() {
    if (!installTrueReadonlyShield()) return false;
    if (window.AuroraStage4AFundingLoadStarted) return true;
    window.AuroraStage4AFundingLoadStarted = true;

    const mission = document.createElement('script');
    mission.src = '/aurora-fc-2/aurora-transfer-mission.js?v=20260820-stage4a-finance-funding-probe-6';
    mission.async = false;
    mission.addEventListener('load', () => {
      const funding = document.createElement('script');
      funding.src = '/aurora-fc-2/finance-funding.js?v=20260820-stage4a-finance-funding-probe-6';
      funding.async = false;
      funding.addEventListener('load', () => {
        fundingLoaded = true;
        report('ACTIVE ✅', 'The exact old Finance Funding Engine is running behind the corrected true read-only Core shield.');
      }, { once: true });
      funding.addEventListener('error', () => report('FAILED ❌', 'Finance Funding Engine failed to load.'), { once: true });
      document.head.appendChild(funding);
    }, { once: true });
    mission.addEventListener('error', () => report('FAILED ❌', 'Transfer Mission helper failed to load.'), { once: true });
    document.head.appendChild(mission);
    return true;
  }

  claimStage();
  setGlobalStatus();
  ensurePanel();
  settleNotificationBell();

  if (!isFinance) {
    window.AuroraStage4A = Object.freeze({ build: BUILD, financePage: false, fundingLoaded: false, stateWritesEnabled: false, trueReadonlyShield: true });
    return;
  }

  let tries = 0;
  const wait = () => {
    if (loadFunding()) return;
    tries += 1;
    if (tries > 240) { report('FAILED ❌', 'Aurora Core did not become ready for Finance Funding.'); return; }
    setTimeout(wait, 25);
  };
  wait();
})();
