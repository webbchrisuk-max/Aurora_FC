(() => {
  'use strict';
  const BUILD = '20260820-stage4e-live-finance-7';
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

  function loadPaydaySave() {
    if (currentFile !== 'finance.html' || window.AuroraFinancePaydaySaveLoadStarted) return;
    window.AuroraFinancePaydaySaveLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-payday-save.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    document.head.appendChild(script);
  }

  function loadDateDisplay() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinanceDateField?.ready) { loadPaydaySave(); return; }
    if (window.AuroraFinanceDateFieldLoadStarted) {
      const wait = () => window.AuroraFinanceDateField?.ready ? loadPaydaySave() : setTimeout(wait, 25);
      wait();
      return;
    }
    window.AuroraFinanceDateFieldLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-date-field.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', () => {
      const wait = () => window.AuroraFinanceDateField?.ready ? loadPaydaySave() : setTimeout(wait, 25);
      wait();
    }, { once: true });
    document.head.appendChild(script);
  }

  function loadPaydayPreview() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinancePaydayPreview?.ready) { loadDateDisplay(); return; }
    if (window.AuroraFinancePaydayPreviewLoadStarted) {
      const wait = () => window.AuroraFinancePaydayPreview?.ready ? loadDateDisplay() : setTimeout(wait, 25);
      wait();
      return;
    }
    window.AuroraFinancePaydayPreviewLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-payday-preview.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', () => {
      const wait = () => window.AuroraFinancePaydayPreview?.ready ? loadDateDisplay() : setTimeout(wait, 25);
      wait();
    }, { once: true });
    document.head.appendChild(script);
  }

  function loadReadonlyFinanceData() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinanceLiveReadonly?.ready) { loadPaydayPreview(); return; }
    if (window.AuroraFinanceLiveReadonlyLoadStarted) {
      const wait = () => window.AuroraFinanceLiveReadonly?.ready ? loadPaydayPreview() : setTimeout(wait, 25);
      wait();
      return;
    }
    window.AuroraFinanceLiveReadonlyLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-live-readonly.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', loadPaydayPreview, { once: true });
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
    readonlyData: currentFile === 'finance.html',
    paydayPreview: currentFile === 'finance.html',
    customDateDisplay: currentFile === 'finance.html',
    paydaySave: currentFile === 'finance.html'
  });
})();
