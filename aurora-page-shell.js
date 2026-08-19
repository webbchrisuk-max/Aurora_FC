(() => {
  'use strict';

  const BUILD = '20260819-stage2-shell-1';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.documentElement.dataset.auroraShell = 'ready';
  document.documentElement.dataset.auroraShellBuild = BUILD;

  document.querySelectorAll('.club-nav a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('#')[0].toLowerCase();
    const target = href || 'index.html';
    const isNexusAlias = currentFile === 'auroracityfc_nexusv2.html' && target === 'index.html';
    link.classList.toggle('active', target === currentFile || isNexusAlias);
  });

  window.AuroraShell = Object.freeze({
    build: BUILD,
    ready: true,
    navigation: 'native-html',
    dataConnected: false,
    sessionEnabled: false,
    dynamicLoading: false
  });

  document.dispatchEvent(new CustomEvent('aurora:shell-ready', {
    detail: { build: BUILD, navigation: 'native-html' }
  }));
})();
