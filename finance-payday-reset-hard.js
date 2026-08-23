(() => {
  'use strict';

  const BUILD = '20260823-finance-payday-reset-hard-bill-order-complete-2';
  let ready = false;

  function loadManagedBillOrder() {
    if (window.AuroraFinanceManagedBillsDateOrder || window.AuroraFinanceManagedBillsDateOrderLoadStarted) return;
    window.AuroraFinanceManagedBillsDateOrderLoadStarted = true;
    const script = document.createElement('script');
    script.src = 'finance-bills-date-order.js?v=20260823-finance-managed-bills-date-order-1';
    script.async = false;
    document.head.appendChild(script);
  }

  function loadBillCompleteFix() {
    if (window.AuroraFinanceBillCompleteFix || window.AuroraFinanceBillCompleteFixLoadStarted) return;
    window.AuroraFinanceBillCompleteFixLoadStarted = true;
    const script = document.createElement('script');
    script.src = 'finance-bill-complete-fix.js?v=20260823-finance-bill-complete-finalise-1';
    script.async = false;
    document.head.appendChild(script);
  }

  function install() {
    const button = document.querySelector('[data-finance-preview-reset]');
    if (!button) return false;
    if (button.dataset.auroraHardResetBound === '1') return true;

    button.dataset.auroraHardResetBound = '1';
    button.textContent = 'Reset to saved values';

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      button.disabled = true;
      button.textContent = 'Restoring…';

      try {
        sessionStorage.setItem('aurora:finance:reset-return', 'paydayPanel');
      } catch (_) {}

      window.location.reload();
    }, true);

    ready = true;
    window.AuroraFinancePaydayHardReset = Object.freeze({
      build: BUILD,
      ready: true,
      mode: 'reload-saved-state',
      managedBillDateOrder: true,
      billCompletionFinalise: true
    });
    return true;
  }

  function restorePosition() {
    let target = '';
    try {
      target = sessionStorage.getItem('aurora:finance:reset-return') || '';
      if (target) sessionStorage.removeItem('aurora:finance:reset-return');
    } catch (_) {}

    if (!target) return;
    setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
    }, 250);
  }

  function boot() {
    loadManagedBillOrder();
    loadBillCompleteFix();
    let tries = 0;
    const wait = () => {
      if (install()) {
        restorePosition();
        return;
      }
      tries += 1;
      if (tries < 600) setTimeout(wait, 25);
    };
    wait();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  } else {
    setTimeout(boot, 0);
  }
})();
