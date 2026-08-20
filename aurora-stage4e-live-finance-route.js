(() => {
  'use strict';
  const BUILD = '20260820-stage4e-live-finance-2';
  const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();

  function fixFinanceLinks() {
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach((link) => {
      const raw = String(link.getAttribute('href') || '');
      if (!raw || raw.startsWith('#')) return;
      const clean = raw.split('#')[0].split('?')[0];
      const file = clean.split('/').pop() || '';
      if (!/^finance(?:-stage4c(?:-4d)?)?\.html$/i.test(file)) return;
      link.setAttribute('href', `/Aurora_FC/finance.html?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function loadReadonlyFinanceData() {
    if (currentFile !== 'finance.html' || window.AuroraFinanceLiveReadonlyLoadStarted) return;
    window.AuroraFinanceLiveReadonlyLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-live-readonly.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    document.head.appendChild(script);
  }

  fixFinanceLinks();
  loadReadonlyFinanceData();
  document.addEventListener('DOMContentLoaded', fixFinanceLinks, { once: true });
  setTimeout(fixFinanceLinks, 250);
  setTimeout(fixFinanceLinks, 1200);
  setTimeout(fixFinanceLinks, 5000);

  window.AuroraStage4ELiveFinanceRoute = Object.freeze({
    build: BUILD,
    target: '/Aurora_FC/finance.html',
    readonlyData: currentFile === 'finance.html'
  });
})();
