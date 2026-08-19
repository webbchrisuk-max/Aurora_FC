(() => {
  'use strict';

  const BUILD = '20260820-stage4a-finance-funding-probe-5';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isFinance = currentFile === 'finance.html' || currentFile.startsWith('finance-stage4a');
  const isNexus = currentFile === 'index.html' || currentFile === 'auroracityfc_nexusv2.html';
  let updateAttempts = 0;
  let fundingLoaded = false;

  // Newer stages own the global stage badge/navigation. Older probes may keep
  // running their own engines/panels but must never roll the page backwards.
  document.documentElement.dataset.auroraStageOwner = '4A';
  window.AuroraStageOwner = { stage: '4A', build: BUILD, priority: 40 };

  function stampNavigation() {
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
    bell.style.position = 'relative';
    bell.style.inset = 'auto';
    bell.style.width = '38px';
    bell.style.height = '38px';
    bell.style.minWidth = '38px';
    bell.style.margin = '0 12px 0 auto';
    bell.style.padding = '0';
    bell.style.display = 'grid';
    bell.style.placeItems = 'center';
    bell.style.border = '1px solid rgba(82,217,255,.22)';
    bell.style.borderRadius = '10px';
    bell.style.background = 'rgba(13,31,47,.72)';
    bell.style.color = '#bfefff';
    bell.style.zIndex = '4';
    if (bell.parentElement !== topbar) {
      if (status) topbar.insertBefore(bell, status);
      else topbar.appendChild(bell);
    } else if (status && bell.nextElementSibling !== status) {
      topbar.insertBefore(bell, status);
    }
    return true;
  }

  function settleNotificationBell() {
    [0, 50, 200, 600, 1500, 3000].forEach((delay) => setTimeout(mountNotificationBell, delay));
  }

  function setGlobalStatus() {
    document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 4A'; });
    document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'FINANCE FUNDING PROBE'; });
    document.querySelectorAll('.department-hero small, .hero small').forEach((node) => {
      node.textContent = String(node.textContent || '').replace(/STAGE 3[HI]/gi, 'STAGE 4A');
    });
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
      panel.innerHTML = '<small>STAGE 4A DEPARTMENT PROBE</small><h2>Finance Funding isolated</h2><p>The shared Stage 3I runtime remains verified. Open Finance Command to run the exact old Finance Funding Engine in a protected local-state dry run.</p>';
    }
    main.appendChild(panel);
  }

  function report(label, note) {
    setGlobalStatus();
    stampNavigation();
    ensurePanel();
    const title = document.getElementById('stage4aFundingStatus');
    const text = document.getElementById('stage4aFundingNote');
    if (title) title.textContent = `Finance Funding: ${label}`;
    if (text) text.textContent = `${note} State update attempts blocked: ${updateAttempts}.`;
    settleNotificationBell();
    window.AuroraStage4A = Object.freeze({
      build: BUILD,
      stageOwner: document.documentElement.dataset.auroraStageOwner,
      financePage: isFinance,
      fundingLoaded,
      updateAttempts,
      stateWritesEnabled: false,
      notificationBellInHeader: document.getElementById('auroraNotificationBell')?.parentElement?.classList?.contains('topbar') || false
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
        return originalUpdate(mutator);
      } catch (_) {
        return core.read();
      }
    };

    window.AuroraStage4AFundingShield = Object.freeze({
      build: BUILD,
      originalUpdate,
      status: () => ({ updateAttempts, fundingLoaded })
    });

    const mission = document.createElement('script');
    mission.src = '/aurora-fc-2/aurora-transfer-mission.js?v=20260820-stage4a-finance-funding-probe-5';
    mission.async = false;
    mission.addEventListener('load', () => {
      const funding = document.createElement('script');
      funding.src = '/aurora-fc-2/finance-funding.js?v=20260820-stage4a-finance-funding-probe-5';
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
  settleNotificationBell();

  if (!isFinance) {
    window.AuroraStage4A = Object.freeze({ build: BUILD, stageOwner: '4A', financePage: false, fundingLoaded: false, stateWritesEnabled: false });
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
