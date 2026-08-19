(() => {
  'use strict';

  const BUILD = '20260819-stage3-core-probe-1';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.documentElement.dataset.auroraShell = 'ready';
  document.documentElement.dataset.auroraShellBuild = BUILD;

  document.querySelectorAll('.club-nav a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('#')[0].toLowerCase();
    const target = href || 'index.html';
    const isNexusAlias = currentFile === 'auroracityfc_nexusv2.html' && target === 'index.html';
    link.classList.toggle('active', target === currentFile || isNexusAlias);
  });

  document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 3'; });
  document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'CORE PROBE'; });

  window.AuroraShell = Object.freeze({
    build: BUILD,
    ready: true,
    navigation: 'native-html',
    dataConnected: false,
    sessionEnabled: false,
    dynamicLoading: false,
    coreProbe: true
  });

  document.dispatchEvent(new CustomEvent('aurora:shell-ready', {
    detail: { build: BUILD, navigation: 'native-html', coreProbe: true }
  }));

  const core = document.createElement('script');
  core.src = '/aurora-fc-2/aurora-core.js?v=20260819-stage3-core-probe-1';
  core.async = false;
  core.dataset.auroraStage3 = 'core-only';
  core.addEventListener('load', () => {
    document.documentElement.dataset.auroraCore = 'loaded';
    window.AuroraStage3 = Object.freeze({
      build: BUILD,
      coreLoaded: true,
      platformLoaded: false,
      syncLoaded: false,
      cloudLoaded: false,
      notificationsLoaded: false,
      dataConnected: false
    });
    document.dispatchEvent(new CustomEvent('aurora:core-probe-ready', {
      detail: { build: BUILD, coreLoaded: true }
    }));
  }, { once: true });
  core.addEventListener('error', () => {
    document.documentElement.dataset.auroraCore = 'failed';
    window.AuroraStage3 = Object.freeze({ build: BUILD, coreLoaded: false, error: 'CORE_LOAD_FAILED' });
  }, { once: true });
  document.head.appendChild(core);
})();
