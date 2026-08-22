(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-bridge-2';
  if (window.__auroraIncomeReinvestmentBridge) return;
  window.__auroraIncomeReinvestmentBridge = BUILD;

  function load(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error(`Could not load ${src.split('?')[0]}.`)), { once: true });
      document.head.appendChild(script);
    });
  }

  load('income-reinvestment-promotion.js?v=20260822-income-reinvestment-promotion-1', () => !!window.AuroraIncomeReinvestmentPromotion)
    .then(() => load('income-reinvestment-cash-remainder.js?v=20260822-income-reinvestment-cash-remainder-1', () => !!window.AuroraIncomeReinvestmentCashRemainder))
    .then(() => load('income-reinvestment-replay.js?v=20260822-income-reinvestment-replay-1', () => !!window.AuroraIncomeReinvestmentReplay))
    .catch(error => console.warn('[Aurora Income reinvestment bridge]', error));
})();