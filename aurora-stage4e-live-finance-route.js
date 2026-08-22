(() => {
  'use strict';
  const BUILD = '20260822-stage4e-live-finance-auto-sync-2';
  const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();

  function loadBrowserAutoSync() {
    if (window.__AuroraBrowserAutoSync || [...document.scripts].some(script => String(script.src || '').includes('aurora-browser-sync-auto.js'))) return;
    const script = document.createElement('script');
    script.src = 'aurora-browser-sync-auto.js?v=20260822-browser-auto-sync-2';
    script.async = false;
    document.head.appendChild(script);
  }

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

  function loadFinalize() {
    if (currentFile !== 'finance.html' || window.AuroraFinanceLiveFinalizeLoadStarted) return;
    window.AuroraFinanceLiveFinalizeLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-live-finalize.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    document.head.appendChild(script);
  }

  function loadMissionRelease() {
    if (currentFile !== 'finance.html' || window.AuroraFinanceMissionReleaseLoadStarted) return;
    const start = () => {
      if (window.AuroraFinanceMissionReleaseLoadStarted) return;
      window.AuroraFinanceMissionReleaseLoadStarted = true;
      const script = document.createElement('script');
      script.src = `finance-mission-release.js?v=${encodeURIComponent(BUILD)}`;
      script.async = false;
      document.head.appendChild(script);
    };
    if (window.AuroraFinanceReleaseCandidate?.ready) { start(); return; }
    const wait = () => window.AuroraFinanceReleaseCandidate?.ready ? start() : setTimeout(wait, 25);
    wait();
  }

  function loadReleaseCandidate() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinanceReleaseCandidate?.ready) { loadMissionRelease(); return; }
    if (window.AuroraFinanceReleaseCandidateLoadStarted) {
      const wait = () => window.AuroraFinanceReleaseCandidate?.ready ? loadMissionRelease() : setTimeout(wait, 25);
      wait();
      return;
    }
    window.AuroraFinanceReleaseCandidateLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-release-candidate.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', () => {
      const wait = () => window.AuroraFinanceReleaseCandidate?.ready ? loadMissionRelease() : setTimeout(wait, 25);
      wait();
    }, { once: true });
    document.head.appendChild(script);
  }

  function loadHouseProjects() {
    if (currentFile !== 'finance.html' || window.AuroraFinanceHouseProjectsLoadStarted) return;
    window.AuroraFinanceHouseProjectsLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-house-projects.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    document.head.appendChild(script);
  }

  function loadPotDelete() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinancePotDelete?.ready) { loadHouseProjects(); return; }
    if (window.AuroraFinancePotDeleteLoadStarted) { loadHouseProjects(); return; }
    window.AuroraFinancePotDeleteLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-pot-delete.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', loadHouseProjects, { once: true });
    document.head.appendChild(script);
  }

  function loadPotsBillsActions() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinancePotsBillsActions?.ready) { loadPotDelete(); return; }
    if (window.AuroraFinancePotsBillsActionsLoadStarted) {
      loadPotDelete();
      return;
    }
    window.AuroraFinancePotsBillsActionsLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-pots-bills-actions.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', loadPotDelete, { once: true });
    document.head.appendChild(script);
  }

  function loadPotsBillsReadonly() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinancePotsBillsReadonly?.ready) { loadPotsBillsActions(); return; }
    if (window.AuroraFinancePotsBillsReadonlyLoadStarted) {
      const wait = () => window.AuroraFinancePotsBillsReadonly?.ready ? loadPotsBillsActions() : setTimeout(wait, 25);
      wait();
      return;
    }
    window.AuroraFinancePotsBillsReadonlyLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-pots-bills-readonly.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', () => {
      const wait = () => window.AuroraFinancePotsBillsReadonly?.ready ? loadPotsBillsActions() : setTimeout(wait, 25);
      wait();
    }, { once: true });
    document.head.appendChild(script);
  }

  function loadProtectedBills() {
    if (currentFile !== 'finance.html' || window.AuroraFinanceProtectedBillsLoadStarted) return;
    window.AuroraFinanceProtectedBillsLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-protected-bills.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    document.head.appendChild(script);
  }

  function loadHardPaydayReset() {
    if (currentFile !== 'finance.html' || window.AuroraFinancePaydayHardResetLoadStarted) return;
    window.AuroraFinancePaydayHardResetLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-payday-reset-hard.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    document.head.appendChild(script);
  }

  function continueAfterPaydaySave() {
    loadHardPaydayReset();
    loadProtectedBills();
    loadPotsBillsReadonly();
    loadReleaseCandidate();
  }

  function loadPaydaySave() {
    if (currentFile !== 'finance.html') return;
    if (window.AuroraFinancePaydaySave?.ready) { continueAfterPaydaySave(); return; }
    if (window.AuroraFinancePaydaySaveLoadStarted) {
      const wait = () => window.AuroraFinancePaydaySave?.ready ? continueAfterPaydaySave() : setTimeout(wait, 25);
      wait();
      return;
    }
    window.AuroraFinancePaydaySaveLoadStarted = true;
    const script = document.createElement('script');
    script.src = `finance-payday-save.js?v=${encodeURIComponent(BUILD)}`;
    script.async = false;
    script.addEventListener('load', () => {
      const wait = () => window.AuroraFinancePaydaySave?.ready ? continueAfterPaydaySave() : setTimeout(wait, 25);
      wait();
    }, { once: true });
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

  loadBrowserAutoSync();
  fixFinanceLinks();
  loadReadonlyFinanceData();
  loadFinalize();
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
    paydaySave: currentFile === 'finance.html',
    releaseCandidate: currentFile === 'finance.html',
    missionRelease: currentFile === 'finance.html',
    hardPaydayReset: currentFile === 'finance.html',
    protectedBills: currentFile === 'finance.html',
    potsBillsReadonly: currentFile === 'finance.html',
    potsBillsActions: currentFile === 'finance.html',
    potDelete: currentFile === 'finance.html',
    houseProjects: currentFile === 'finance.html',
    liveFinalize: currentFile === 'finance.html',
    browserAutoSync: true
  });
})();