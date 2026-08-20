(() => {
  'use strict';

  const BUILD = '20260820-finance-live-finalize-1';

  function apply() {
    const status = document.querySelector('.topbar .status');
    if (status) {
      const span = status.querySelector('span');
      const strong = status.querySelector('b');
      if (span) span.textContent = 'FINANCE';
      if (strong) strong.textContent = 'LIVE COMMAND';
    }

    const pill = document.querySelector('.finance-version-pill');
    if (pill) pill.textContent = 'LIVE DATA • CONTROLLED WRITES';

    const paydaySide = document.querySelector('#paydayPanel .finance-panel:last-child');
    if (paydaySide) {
      const kicker = paydaySide.querySelector('.finance-panel-kicker');
      if (kicker && /rebuild step|functionality/i.test(kicker.textContent || '')) kicker.textContent = 'Payday Operations';
    }

    document.documentElement.dataset.financeLiveFinalized = 'true';
  }

  function boot() {
    apply();
    window.addEventListener('pageshow', () => setTimeout(apply, 0));
    window.addEventListener('focus', () => setTimeout(apply, 0));
    window.addEventListener('aurora2:state', () => setTimeout(apply, 0));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setTimeout(apply, 0);
    });
    [100, 400, 1200, 3000].forEach(delay => setTimeout(apply, delay));
    window.AuroraFinanceLiveFinalize = Object.freeze({ build: BUILD, ready: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
