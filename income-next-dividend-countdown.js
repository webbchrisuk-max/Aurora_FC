(() => {
  'use strict';

  const BUILD = '20260825-income-next-dividend-countdown-1';
  if (window.__AuroraIncomeNextDividendCountdown === BUILD) return;
  window.__AuroraIncomeNextDividendCountdown = BUILD;

  const SUMMARY_KEY = 'aurora2:income:summary:v1';
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(Number(value) || 0);

  function parseDate(value) {
    const raw = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function countdownLabel(value) {
    const payDate = parseDate(value);
    if (!payDate) return '';
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const days = Math.round((payDate.getTime() - today.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days away`;
  }

  function readSummary() {
    try {
      return JSON.parse(localStorage.getItem(SUMMARY_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function apply(summary = readSummary()) {
    const next = summary?.nextDividend;
    if (!next?.date) return;
    const countdown = countdownLabel(next.date);
    if (!countdown) return;

    const hero = document.getElementById('heroNext');
    if (hero) hero.textContent = `${next.ticker || 'Next'} • ${money(next.amount)} • ${countdown}`;

    const kNext = document.getElementById('kNext');
    if (kNext) kNext.textContent = next.ticker || '—';

    const meta = document.getElementById('kNextMeta');
    if (meta) meta.textContent = `${money(next.amount)} • ${countdown} • ${next.date}`;
  }

  window.addEventListener('aurora:income-summary', event => apply(event.detail));
  window.addEventListener('focus', () => apply());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(apply, 0), { once: true });
  } else {
    setTimeout(apply, 0);
  }

  setInterval(apply, 60000);
})();