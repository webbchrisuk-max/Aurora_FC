(() => {
  'use strict';

  const BUILD = '20260819-stage3b-platform-probe-1';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.documentElement.dataset.auroraShell = 'ready';
  document.documentElement.dataset.auroraShellBuild = BUILD;

  document.querySelectorAll('.club-nav a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('#')[0].toLowerCase();
    const target = href || 'index.html';
    const isNexusAlias = currentFile === 'auroracityfc_nexusv2.html' && target === 'index.html';
    link.classList.toggle('active', target === currentFile || isNexusAlias);
  });

  document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 3B'; });
  document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'PLATFORM PROBE'; });

  window.AuroraShell = Object.freeze({
    build: BUILD,
    ready: true,
    navigation: 'native-html',
    dataConnected: false,
    sessionEnabled: false,
    dynamicLoading: false,
    coreProbe: true,
    platformProbe: true
  });

  document.dispatchEvent(new CustomEvent('aurora:shell-ready', {
    detail: { build: BUILD, navigation: 'native-html', coreProbe: true, platformProbe: true }
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

  const platform = document.createElement('script');
  platform.src = '/aurora-fc-2/aurora-platform.js?v=20260819-stage3b-platform-probe-1';
  platform.async = false;
  platform.dataset.auroraStage3 = 'platform-only';
  platform.addEventListener('load', () => {
    document.documentElement.dataset.auroraPlatform = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true });
    document.dispatchEvent(new CustomEvent('aurora:platform-probe-ready', {
      detail: { build: BUILD, coreLoaded: true, platformLoaded: true }
    }));
  }, { once: true });
  platform.addEventListener('error', () => {
    document.documentElement.dataset.auroraPlatform = 'failed';
    markState({ coreLoaded: true, platformLoaded: false, error: 'PLATFORM_LOAD_FAILED' });
  }, { once: true });

  const core = document.createElement('script');
  core.src = '/aurora-fc-2/aurora-core.js?v=20260819-stage3b-platform-probe-1';
  core.async = false;
  core.dataset.auroraStage3 = 'core-plus-platform';
  core.addEventListener('load', () => {
    document.documentElement.dataset.auroraCore = 'loaded';
    markState({ coreLoaded: true });
    document.head.appendChild(platform);
  }, { once: true });
  core.addEventListener('error', () => {
    document.documentElement.dataset.auroraCore = 'failed';
    markState({ coreLoaded: false, platformLoaded: false, error: 'CORE_LOAD_FAILED' });
  }, { once: true });
  document.head.appendChild(core);
})();
