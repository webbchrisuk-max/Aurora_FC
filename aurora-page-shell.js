(() => {
  'use strict';

  const BUILD = '20260819-stage3c-sync-manager-probe-1';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.documentElement.dataset.auroraShell = 'ready';
  document.documentElement.dataset.auroraShellBuild = BUILD;

  document.querySelectorAll('.club-nav a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('#')[0].toLowerCase();
    const target = href || 'index.html';
    const isNexusAlias = currentFile === 'auroracityfc_nexusv2.html' && target === 'index.html';
    link.classList.toggle('active', target === currentFile || isNexusAlias);
  });

  document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 3C'; });
  document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'SYNC MANAGER PROBE'; });

  window.AuroraShell = Object.freeze({
    build: BUILD,
    ready: true,
    navigation: 'native-html',
    dataConnected: false,
    sessionEnabled: false,
    dynamicLoading: true,
    coreProbe: true,
    platformProbe: true,
    syncManagerProbe: true
  });

  document.dispatchEvent(new CustomEvent('aurora:shell-ready', {
    detail: { build: BUILD, navigation: 'native-html', coreProbe: true, platformProbe: true, syncManagerProbe: true }
  }));

  const markState = (overrides = {}) => {
    window.AuroraStage3 = Object.freeze({
      build: BUILD,
      coreLoaded: false,
      platformLoaded: false,
      syncLoaded: false,
      cloudLoaded: false,
      notificationsLoaded: false,
      dataConnected: false,
      ...overrides
    });
  };
  markState();

  const sync = document.createElement('script');
  sync.src = '/aurora-fc-2/aurora-sync-manager.js?v=20260819-stage3c-sync-manager-probe-1';
  sync.async = false;
  sync.dataset.auroraStage3 = 'sync-manager-only';
  sync.addEventListener('load', () => {
    document.documentElement.dataset.auroraSyncManager = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true });
    document.dispatchEvent(new CustomEvent('aurora:sync-manager-probe-ready', {
      detail: { build: BUILD, coreLoaded: true, platformLoaded: true, syncLoaded: true }
    }));
  }, { once: true });
  sync.addEventListener('error', () => {
    document.documentElement.dataset.auroraSyncManager = 'failed';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: false, error: 'SYNC_MANAGER_LOAD_FAILED' });
  }, { once: true });

  const platform = document.createElement('script');
  platform.src = '/aurora-fc-2/aurora-platform.js?v=20260819-stage3c-sync-manager-probe-1';
  platform.async = false;
  platform.dataset.auroraStage3 = 'core-plus-platform';
  platform.addEventListener('load', () => {
    document.documentElement.dataset.auroraPlatform = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true });
    document.head.appendChild(sync);
  }, { once: true });
  platform.addEventListener('error', () => {
    document.documentElement.dataset.auroraPlatform = 'failed';
    markState({ coreLoaded: true, platformLoaded: false, syncLoaded: false, error: 'PLATFORM_LOAD_FAILED' });
  }, { once: true });

  const core = document.createElement('script');
  core.src = '/aurora-fc-2/aurora-core.js?v=20260819-stage3c-sync-manager-probe-1';
  core.async = false;
  core.dataset.auroraStage3 = 'core-plus-platform-plus-sync';
  core.addEventListener('load', () => {
    document.documentElement.dataset.auroraCore = 'loaded';
    markState({ coreLoaded: true });
    document.head.appendChild(platform);
  }, { once: true });
  core.addEventListener('error', () => {
    document.documentElement.dataset.auroraCore = 'failed';
    markState({ coreLoaded: false, platformLoaded: false, syncLoaded: false, error: 'CORE_LOAD_FAILED' });
  }, { once: true });
  document.head.appendChild(core);
})();