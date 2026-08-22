(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-replay-1';
  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function accountCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'IG' || raw.includes('IG ISA')) return 'IG';
    if (raw === 'T212' || raw.includes('212')) return 'T212';
    return '';
  }

  function tickerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/^LON:/, '').replace(/\.L$/, '').replace(/\.GB$/, '');
  }

  function amount(row) {
    for (const value of [row?.amountGbp, row?.dividendAmountGbp, row?.settlementAmountGbp, row?.grossAmountGbp, row?.amount]) {
      const n = Math.abs(num(value));
      if (n > 0) return n;
    }
    return 0;
  }

  function payload(row) {
    const note = String(row?.note || row?.notes || '');
    if (!note.includes('RI2=')) return null;
    const mode = String(row?.mode || row?.type || row?.action || row?.category || '').toUpperCase();
    const reference = String(row?.reference || '');
    if (!/^DIV:/i.test(reference) && !/REINVEST/.test(mode)) return null;
    const account = accountCode(row?.account);
    const ticker = tickerCode(row?.ticker);
    const amountGbp = amount(row);
    if (!account || !ticker || amountGbp <= 0) return null;
    return { account, ticker, amountGbp, mode: 'REINVESTED', reference, note };
  }

  function toast(text) {
    const el = document.getElementById('incomeToast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(window.__incomeReplayToastTimer);
    window.__incomeReplayToastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  async function replay() {
    const promotion = window.AuroraIncomeReinvestmentPromotion;
    const client = window.AuroraData2Client;
    if (!promotion?.promoteSettlement || !client?.post) return;
    try {
      const snapshot = await client.post('brokerCashSnapshot', {});
      const candidates = arr(snapshot?.ledger).slice(0, 80).map(payload).filter(Boolean);
      let newlyPromoted = 0;
      for (const item of candidates) {
        const summary = await promotion.promoteSettlement(item);
        newlyPromoted += arr(summary?.promoted).filter(row => row?.status === 'PROMOTED').length;
      }
      if (newlyPromoted > 0) {
        toast(`${newlyPromoted} previously recorded reinvestment purchase${newlyPromoted === 1 ? '' : 's'} confirmed and promoted into Squad.`);
        setTimeout(() => window.AuroraIncomeSettlementReconcile?.refresh?.(), 250);
      }
      window.dispatchEvent(new CustomEvent('aurora:income-reinvestment-replay', {
        detail: { build: BUILD, checked: candidates.length, promoted: newlyPromoted, at: new Date().toISOString() }
      }));
    } catch (_) {}
  }

  function boot() { setTimeout(replay, 1600); }
  window.AuroraIncomeReinvestmentReplay = Object.freeze({ build: BUILD, replay });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();