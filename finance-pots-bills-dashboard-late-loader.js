(() => {
  'use strict';

  const BUILD = '20260823-finance-pots-bills-dashboard-late-loader-1';
  let started = false;

  function readyForDashboard() {
    return Boolean(
      window.AuroraFinancePotsBillsReadonly?.ready &&
      window.AuroraFinancePotsBillsActions?.ready &&
      document.getElementById('financePotProgressDashboard') &&
      document.getElementById('financePotActionList') &&
      document.getElementById('financeBillActionList')
    );
  }

  function loadDashboard() {
    if (started) return;
    started = true;

    const existing = document.getElementById('financePotsBillsDashboard');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.src = 'finance-pots-bills-dashboard.js?v=20260823-finance-pots-bills-dashboard-late-2';
    script.async = false;
    script.dataset.financePotsBillsDashboardLate = '1';
    document.head.appendChild(script);
  }

  function wait() {
    if (readyForDashboard()) {
      setTimeout(loadDashboard, 50);
      return;
    }
    setTimeout(wait, 50);
  }

  window.AuroraFinancePotsBillsDashboardLateLoader = Object.freeze({
    build: BUILD,
    readyForDashboard
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wait, { once:true });
  else wait();
})();
