(() => {
  'use strict';

  const BUILD = '20260825-finance-overhaul-bootstrap-4';
  const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (currentFile !== 'finance.html') return;

  try { window.AuroraBrowserAutoSync?.stop?.(); } catch (_) {}
  window.AuroraFinanceAutoSyncSuppressed = true;

  function fixFinanceLinks() {
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach(link => {
      const raw = String(link.getAttribute('href') || '');
      if (!raw || raw.startsWith('#')) return;
      const file = raw.split('#')[0].split('?')[0].split('/').pop() || '';
      if (!/^finance(?:-stage4c(?:-4d)?)?\.html$/i.test(file)) return;
      link.setAttribute('href', `/Aurora_FC/finance.html?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }
  function hasScript(marker) { return [...document.scripts].some(script => String(script.src || '').includes(marker)); }
  function loadScript(src, marker = src.split('?')[0]) {
    return new Promise(resolve => {
      if (hasScript(marker)) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = src; script.async = false;
      script.addEventListener('load', () => resolve(true), {once:true});
      script.addEventListener('error', () => resolve(false), {once:true});
      document.head.appendChild(script);
    });
  }
  async function waitFor(check, maxMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      try { if (check()) return true; } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return false;
  }
  async function bootFinanceOperations() {
    await loadScript(`finance-live-readonly.js?v=${BUILD}`, 'finance-live-readonly.js');
    await waitFor(() => window.AuroraFinanceLiveReadonly?.ready, 5000);
    await loadScript(`finance-payday-preview.js?v=${BUILD}`, 'finance-payday-preview.js');
    await waitFor(() => window.AuroraFinancePaydayPreview?.ready, 5000);
    await loadScript(`finance-date-field.js?v=${BUILD}`, 'finance-date-field.js');
    await waitFor(() => window.AuroraFinanceDateField?.ready, 3500);
    await loadScript(`finance-payday-save.js?v=${BUILD}`, 'finance-payday-save.js');
    await waitFor(() => window.AuroraFinancePaydaySave?.ready, 5000);
    await Promise.all([
      loadScript(`finance-payday-reset-hard.js?v=${BUILD}`, 'finance-payday-reset-hard.js'),
      loadScript(`finance-protected-bills.js?v=${BUILD}`, 'finance-protected-bills.js'),
      loadScript(`finance-pots-bills-readonly.js?v=${BUILD}`, 'finance-pots-bills-readonly.js'),
      loadScript(`finance-house-projects.js?v=${BUILD}`, 'finance-house-projects.js'),
      loadScript(`finance-live-finalize.js?v=${BUILD}`, 'finance-live-finalize.js')
    ]);
    await waitFor(() => window.AuroraFinancePotsBillsReadonly?.ready, 5000);
    await loadScript(`finance-pots-bills-actions.js?v=${BUILD}`, 'finance-pots-bills-actions.js');
    await waitFor(() => window.AuroraFinancePotsBillsActions?.ready, 5000);
    await loadScript(`finance-operations-overhaul.js?v=${BUILD}`, 'finance-operations-overhaul.js');
    await loadScript(`finance-release-candidate.js?v=${BUILD}`, 'finance-release-candidate.js');
    await waitFor(() => window.AuroraFinanceReleaseCandidate?.ready, 5000);
    await loadScript(`finance-mission-release.js?v=${BUILD}`, 'finance-mission-release.js');
    document.documentElement.dataset.financeBootstrap = 'operations-ready';
    window.dispatchEvent(new CustomEvent('aurora:finance-bootstrap-ready', {detail:{build:BUILD}}));
  }
  fixFinanceLinks();
  document.addEventListener('DOMContentLoaded', fixFinanceLinks, {once:true});
  [250,1200,5000].forEach(delay => setTimeout(fixFinanceLinks, delay));
  bootFinanceOperations().catch(error => console.warn('[Aurora Finance bootstrap]', String(error?.message || error)));
  window.AuroraStage4ELiveFinanceRoute = Object.freeze({
    build:BUILD,target:'/Aurora_FC/finance.html',deterministicBootstrap:true,financeWriteProtection:true,browserAutoSync:false,
    paydayPreview:true,paydaySave:true,protectedBills:true,potsBillsReadonly:true,potsBillsActions:true,potsBillsCanonical:true,
    houseProjects:true,operationsOverhaul:true,missionRelease:true
  });
})();