(() => {
  'use strict';

  const BUILD = '20260824-finance-pots-bills-compat-3';
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

  function loadScriptOnce(flag, src, marker) {
    if (window[flag] || [...document.scripts].some(script => String(script.src || '').includes(marker))) return;
    window[flag] = true;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    document.head.appendChild(script);
  }

  function ensureOperations() {
    loadScriptOnce('AuroraFinanceHouseProjectsLoadStarted','finance-house-projects.js?v=20260824-finance-house-restore-1','finance-house-projects.js');
    loadScriptOnce('AuroraFinanceOperationsOverhaulLoadStarted','finance-operations-overhaul.js?v=20260824-finance-operations-overhaul-1','finance-operations-overhaul.js');
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
    ensureOperations();
  }

  function boot() {
    // finance.html owns the visible Pots & Bills workspace. This compatibility
    // authority preserves the readiness contract for backed-up write modules
    // without replacing the new unified Finance UI.
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