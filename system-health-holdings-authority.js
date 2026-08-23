(() => {
  'use strict';

  const BUILD = '20260823-system-health-holdings-authority-1';
  const STATE_KEY = 'aurora2:state:v1';

  function arr(value) { return Array.isArray(value) ? value : []; }

  function readState() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {};
      return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function legacyHoldingsError() {
    try {
      const item = window.AuroraSyncManager?.status?.()?.detail?.holdings || {};
      const status = String(item?.status || '').toUpperCase();
      const error = String(item?.lastError || '');
      return status === 'ERROR' && /aurora-holdings-sync\.js|110-managed|legacy holdings sync/i.test(error);
    } catch (_) {
      return false;
    }
  }

  function apply() {
    const state = readState();
    const positions = arr(state?.squad?.holdings).length;
    const canonical = state?.squad?.canonicalSync || {};
    const statusEl = document.getElementById('holdingsStatus');
    const metaEl = document.getElementById('holdingsMeta');
    if (!statusEl || !metaEl) return;

    const shown = String(statusEl.textContent || '').trim().toUpperCase();
    const canonicalStatus = String(canonical?.status || '').trim().toUpperCase();
    const hasCanonicalHoldings = positions > 0;
    const retiredError = shown === 'ERROR' || legacyHoldingsError();

    if (hasCanonicalHoldings && (retiredError || canonicalStatus === 'ERROR' || canonicalStatus === 'CANONICAL' || canonicalStatus === 'CONNECTED')) {
      statusEl.textContent = 'CANONICAL';
      statusEl.classList.remove('bad');
      statusEl.classList.add('cyan');
      metaEl.textContent = `${positions} Squad position${positions === 1 ? '' : 's'} • Squad is holdings authority`;
      const card = statusEl.closest('article');
      if (card) card.title = 'Legacy holdings sync is retired. Canonical Squad holdings are the active holdings authority.';
    }
  }

  const observer = new MutationObserver(() => apply());
  function start() {
    const statusEl = document.getElementById('holdingsStatus');
    if (statusEl) observer.observe(statusEl, { childList:true, characterData:true, subtree:true });
    apply();
    setTimeout(apply, 250);
    setTimeout(apply, 1000);
  }

  window.addEventListener('aurora2:state', apply);
  window.addEventListener('focus', apply);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') apply(); });

  window.AuroraSystemHealthHoldingsAuthority = Object.freeze({ build:BUILD, apply });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
