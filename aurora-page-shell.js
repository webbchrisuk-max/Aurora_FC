(() => {
  'use strict';

  const BUILD = '20260819-stage3d-cloud-init-probe-2';
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

  document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 3D'; });
  document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'CLOUD INIT PROBE'; });

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
    cloudInitProbe: true,
    cloudNetworkBlocked: true
  });

  document.dispatchEvent(new CustomEvent('aurora:shell-ready', {
    detail: { build: BUILD, navigation: 'native-html', cloudInitProbe: true, cloudNetworkBlocked: true }
  }));

  const markState = (overrides = {}) => {
    window.AuroraStage3 = Object.freeze({
      build: BUILD,
      coreLoaded: false,
      platformLoaded: false,
      syncLoaded: false,
      cloudLoaded: false,
      cloudNetworkBlocked: true,
      notificationsLoaded: false,
      dataConnected: false,
      ...overrides
    });
  };
  markState();

  const nativeFetch = window.fetch.bind(window);
  const firebaseHosts = new Set([
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firestore.googleapis.com'
  ]);
  window.fetch = function auroraCloudProbeFetch(input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : String(input?.url || input || ''); } catch (_) {}
    try {
      const parsed = new URL(url, location.href);
      if (firebaseHosts.has(parsed.hostname)) {
        return Promise.reject(new TypeError('AURORA_CLOUD_PROBE_NETWORK_BLOCKED'));
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  const restoreFetch = () => {
    if (window.fetch?.name === 'auroraCloudProbeFetch') window.fetch = nativeFetch;
  };

  const cloud = document.createElement('script');
  cloud.src = '/aurora-fc-2/aurora-cloud-sync.js?v=20260819-stage3d-cloud-init-probe-2';
  cloud.async = false;
  cloud.dataset.auroraStage3 = 'cloud-init-network-blocked';
  cloud.addEventListener('load', () => {
    document.documentElement.dataset.auroraCloud = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true, cloudLoaded: true });
    const ready = window.AuroraCloudSync?.ready;
    if (ready && typeof ready.finally === 'function') {
      ready.finally(() => {
        restoreFetch();
        document.documentElement.dataset.auroraCloudInit = 'complete';
        document.dispatchEvent(new CustomEvent('aurora:cloud-init-probe-ready', {
          detail: { build: BUILD, cloudLoaded: true, networkBlocked: true }
        }));
      });
    } else {
      restoreFetch();
    }
  }, { once: true });
  cloud.addEventListener('error', () => {
    restoreFetch();
    document.documentElement.dataset.auroraCloud = 'failed';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true, cloudLoaded: false, error: 'CLOUD_LOAD_FAILED' });
  }, { once: true });

  const sync = document.createElement('script');
  sync.src = '/aurora-fc-2/aurora-sync-manager.js?v=20260819-stage3d-cloud-init-probe-2';
  sync.async = false;
  sync.dataset.auroraStage3 = 'sync-manager-plus-cloud-init';
  sync.addEventListener('load', () => {
    document.documentElement.dataset.auroraSyncManager = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true });
    document.head.appendChild(cloud);
  }, { once: true });
  sync.addEventListener('error', () => {
    restoreFetch();
    document.documentElement.dataset.auroraSyncManager = 'failed';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: false, error: 'SYNC_MANAGER_LOAD_FAILED' });
  }, { once: true });

  const platform = document.createElement('script');
  platform.src = '/aurora-fc-2/aurora-platform.js?v=20260819-stage3d-cloud-init-probe-2';
  platform.async = false;
  platform.dataset.auroraStage3 = 'core-plus-platform';
  platform.addEventListener('load', () => {
    document.documentElement.dataset.auroraPlatform = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true });
    document.head.appendChild(sync);
  }, { once: true });
  platform.addEventListener('error', () => {
    restoreFetch();
    document.documentElement.dataset.auroraPlatform = 'failed';
    markState({ coreLoaded: true, platformLoaded: false, error: 'PLATFORM_LOAD_FAILED' });
  }, { once: true });

  const core = document.createElement('script');
  core.src = '/aurora-fc-2/aurora-core.js?v=20260819-stage3d-cloud-init-probe-2';
  core.async = false;
  core.dataset.auroraStage3 = 'core-plus-platform-plus-sync-plus-cloud-init';
  core.addEventListener('load', () => {
    document.documentElement.dataset.auroraCore = 'loaded';
    markState({ coreLoaded: true });
    document.head.appendChild(platform);
  }, { once: true });
  core.addEventListener('error', () => {
    restoreFetch();
    document.documentElement.dataset.auroraCore = 'failed';
    markState({ coreLoaded: false, error: 'CORE_LOAD_FAILED' });
  }, { once: true });
  document.head.appendChild(core);
})();