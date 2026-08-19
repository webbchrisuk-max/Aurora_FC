(() => {
  'use strict';

  const BUILD = '20260819-stage3e-firebase-read-probe-1';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const NAV = Object.freeze({
    'index.html': ['🏟', 'Nexus Headquarters', 'Master club command'],
    'finance.html': ['💷', 'Finance Command', 'Cash, payday and pots'],
    'scouting.html': ['🔎', 'Scouting Centre', 'Evidence and recruitment'],
    'transfer.html': ['🔄', 'Transfer Centre', 'Deployment planning'],
    'registration.html': ['📝', 'Registration Desk', 'Broker execution'],
    'squad.html': ['⚽', 'Squad Hub', 'Canonical holdings'],
    'income.html': ['💰', 'Income Centre', 'Dividend truth'],
    'match-report.html': ['🏆', 'Match Report', 'Daily full-time review'],
    'club-control.html': ['⚙️', 'Club Control', 'Preferences and controls'],
    'system-health.html': ['🛡️', 'System Health', 'Integrity and diagnostics']
  });

  function repairSidebarMarkup() {
    document.querySelectorAll('.club-nav nav>a[href]').forEach((link) => {
      const href = (link.getAttribute('href') || '').split('#')[0].toLowerCase();
      const meta = NAV[href];
      if (meta && !link.querySelector(':scope > span')) {
        const [icon, label, description] = meta;
        link.innerHTML = `${icon} <span><b>${label}</b><em>${description}</em></span>`;
      }
    });
  }

  repairSidebarMarkup();

  document.documentElement.dataset.auroraShell = 'ready';
  document.documentElement.dataset.auroraShellBuild = BUILD;

  document.querySelectorAll('.club-nav a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('#')[0].toLowerCase();
    const target = href || 'index.html';
    const isNexusAlias = currentFile === 'auroracityfc_nexusv2.html' && target === 'index.html';
    link.classList.toggle('active', target === currentFile || isNexusAlias);
  });

  document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 3E'; });
  document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'FIREBASE READ PROBE'; });

  window.AuroraShell = Object.freeze({
    build: BUILD,
    ready: true,
    navigation: 'native-html',
    dataConnected: false,
    sessionEnabled: false,
    dynamicLoading: true,
    coreProbe: true,
    platformProbe: true,
    syncManagerProbe: true,
    firebaseReadProbe: true,
    cloudWritesEnabled: false
  });

  document.dispatchEvent(new CustomEvent('aurora:shell-ready', {
    detail: { build: BUILD, navigation: 'native-html', firebaseReadProbe: true, cloudWritesEnabled: false }
  }));

  const markState = (overrides = {}) => {
    window.AuroraStage3 = Object.freeze({
      build: BUILD,
      coreLoaded: false,
      platformLoaded: false,
      syncLoaded: false,
      firebaseReadProbeLoaded: false,
      firebaseReadStatus: 'WAITING',
      cloudWritesEnabled: false,
      notificationsLoaded: false,
      dataConnected: false,
      ...overrides
    });
  };
  markState();

  window.addEventListener('aurora:firebase-read-probe', (event) => {
    const detail = event.detail || {};
    document.documentElement.dataset.auroraFirebaseRead = String(detail.status || 'unknown').toLowerCase();
    markState({
      coreLoaded: true,
      platformLoaded: true,
      syncLoaded: true,
      firebaseReadProbeLoaded: true,
      firebaseReadStatus: detail.status || 'UNKNOWN'
    });
  });

  const readProbe = document.createElement('script');
  readProbe.src = 'aurora-firebase-read-probe.js?v=20260819-stage3e-firebase-read-probe-1';
  readProbe.async = false;
  readProbe.dataset.auroraStage3 = 'firebase-read-only';
  readProbe.addEventListener('load', () => {
    document.documentElement.dataset.auroraFirebaseReadProbe = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true, firebaseReadProbeLoaded: true });
  }, { once: true });
  readProbe.addEventListener('error', () => {
    document.documentElement.dataset.auroraFirebaseReadProbe = 'failed';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true, firebaseReadProbeLoaded: false, error: 'FIREBASE_READ_PROBE_LOAD_FAILED' });
  }, { once: true });

  const sync = document.createElement('script');
  sync.src = '/aurora-fc-2/aurora-sync-manager.js?v=20260819-stage3e-firebase-read-probe-1';
  sync.async = false;
  sync.dataset.auroraStage3 = 'sync-manager-plus-firebase-read';
  sync.addEventListener('load', () => {
    document.documentElement.dataset.auroraSyncManager = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true });
    document.head.appendChild(readProbe);
  }, { once: true });
  sync.addEventListener('error', () => {
    document.documentElement.dataset.auroraSyncManager = 'failed';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: false, error: 'SYNC_MANAGER_LOAD_FAILED' });
  }, { once: true });

  const platform = document.createElement('script');
  platform.src = '/aurora-fc-2/aurora-platform.js?v=20260819-stage3e-firebase-read-probe-1';
  platform.async = false;
  platform.dataset.auroraStage3 = 'core-plus-platform';
  platform.addEventListener('load', () => {
    document.documentElement.dataset.auroraPlatform = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true });
    document.head.appendChild(sync);
  }, { once: true });
  platform.addEventListener('error', () => {
    document.documentElement.dataset.auroraPlatform = 'failed';
    markState({ coreLoaded: true, platformLoaded: false, error: 'PLATFORM_LOAD_FAILED' });
  }, { once: true });

  const core = document.createElement('script');
  core.src = '/aurora-fc-2/aurora-core.js?v=20260819-stage3e-firebase-read-probe-1';
  core.async = false;
  core.dataset.auroraStage3 = 'core-plus-platform-plus-sync-plus-firebase-read';
  core.addEventListener('load', () => {
    document.documentElement.dataset.auroraCore = 'loaded';
    markState({ coreLoaded: true });
    document.head.appendChild(platform);
  }, { once: true });
  core.addEventListener('error', () => {
    document.documentElement.dataset.auroraCore = 'failed';
    markState({ coreLoaded: false, error: 'CORE_LOAD_FAILED' });
  }, { once: true });
  document.head.appendChild(core);
})();
