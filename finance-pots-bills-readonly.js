(() => {
  'use strict';

  const BUILD = '20260824-finance-pots-bills-compat-2';
  const STATE_KEY = 'aurora2:state:v1';
  const arr = value => Array.isArray(value) ? value : [];

  function state() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read();
    } catch (_) {}
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function snapshot() {
    const s = state();
    const pots = arr(s?.finance?.pots).filter(row => !row?.archived);
    const bills = arr(s?.finance?.bills).filter(row => !row?.archived && !row?.paid && row?.included !== false);
    return { s, pots, bills };
  }

  function publish() {
    const current = snapshot();
    window.AuroraFinancePotsBillsReadonly = Object.freeze({
      build: BUILD,
      ready: true,
      compatibilityMode: true,
      ownsMarkup: false,
      pots: current.pots.length,
      bills: current.bills.length,
      runtimeErrors: []
    });
    document.documentElement.dataset.financePotsBillsAuthority = 'unified-ui';
    window.dispatchEvent(new CustomEvent('aurora:finance-pots-bills-ready', {
      detail: { build: BUILD, pots: current.pots.length, bills: current.bills.length, ownsMarkup: false }
    }));
  }

  function boot() {
    // finance.html now owns the Pots & Bills layout. This bridge intentionally
    // does not replace #potsPanel.innerHTML; it only preserves the readiness
    // contract required by the backed-up write/action modules.
    publish();
    window.addEventListener('aurora2:state', publish);
    window.addEventListener('pageshow', publish);
    window.addEventListener('focus', publish);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') publish();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();