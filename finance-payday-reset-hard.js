(() => {
  'use strict';

  const BUILD = '20260820-finance-payday-reset-hard-1';
  let ready = false;

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
      mode: 'reload-saved-state'
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
