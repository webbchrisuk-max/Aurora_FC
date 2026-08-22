(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-replay-2';
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

  function referenceAmount(reference) {
    const match = String(reference || '').trim().match(/^DIV:[^:]+:[^:]+:\d{4}-\d{2}-\d{2}:([0-9]+(?:\.[0-9]+)?)(?::|$)/i);
    return match ? Math.abs(num(match[1])) : 0;
  }

  function amount(row) {
    for (const value of [
      row?.amountGbp,
      row?.grossGbp,
      row?.gross_gbp,
      row?.dividendAmountGbp,
      row?.settlementAmountGbp,
      row?.grossAmountGbp,
      row?.amount
    ]) {
      const n = Math.abs(num(value));
      if (n > 0) return n;
    }
    return referenceAmount(row?.reference);
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
    return {
      account,
      ticker,
      amountGbp,
      mode: 'REINVESTED',
      reference,
      note,
      forceBackendConfirm: true
    };
  }

  function toast(text) {
    const el = document.getElementById('incomeToast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(window.__incomeReplayToastTimer);
    window.__incomeReplayToastTimer = setTimeout(() => el.classList.remove('show'), 5200);
  }

  async function replay() {
    const promotion = window.AuroraIncomeReinvestmentPromotion;
    const client = window.AuroraData2Client;
    if (!promotion?.promoteSettlement || !client?.post) return null;

    let candidates = [];
    let newlyPromoted = 0;
    let alreadyConfirmed = 0;
    const held = [];

    try {
      const snapshot = await client.post('brokerCashSnapshot', {});
      candidates = arr(snapshot?.ledger).slice(0, 120).map(payload).filter(Boolean);

      for (const item of candidates) {
        const summary = await promotion.promoteSettlement(item);
        const promotedRows = arr(summary?.promoted);
        newlyPromoted += promotedRows.filter(row => row?.status === 'PROMOTED').length;
        alreadyConfirmed += promotedRows.filter(row => row?.status === 'ALREADY_PROMOTED').length;
        arr(summary?.held).forEach(row => held.push({
          dividendReference: item.reference,
          ticker: row?.ticker || row?.destination || '',
          reason: String(row?.holdReason || summary?.error || summary?.status || 'Registration pending')
        }));
      }

      if (newlyPromoted > 0) {
        toast(`${newlyPromoted} previously recorded reinvestment purchase${newlyPromoted === 1 ? '' : 's'} confirmed by AuroraData 2 and promoted into Squad.`);
        setTimeout(() => window.AuroraIncomeSettlementReconcile?.refresh?.(), 250);
      } else if (held.length > 0) {
        toast(`${held.length} reinvestment purchase${held.length === 1 ? '' : 's'} still Registration pending. Aurora has kept the dividend evidence and will not alter Squad until backend confirmation.`);
      }

      const detail = {
        build: BUILD,
        checked: candidates.length,
        promoted: newlyPromoted,
        alreadyConfirmed,
        held,
        status: held.length ? (newlyPromoted ? 'PARTIAL' : 'PENDING') : 'OK',
        at: new Date().toISOString()
      };
      window.__auroraIncomeReinvestmentReplayStatus = detail;
      window.dispatchEvent(new CustomEvent('aurora:income-reinvestment-replay', { detail }));
      return detail;
    } catch (error) {
      const detail = {
        build: BUILD,
        checked: candidates.length,
        promoted: newlyPromoted,
        alreadyConfirmed,
        held,
        status: 'ERROR',
        error: String(error?.message || error),
        at: new Date().toISOString()
      };
      window.__auroraIncomeReinvestmentReplayStatus = detail;
      window.dispatchEvent(new CustomEvent('aurora:income-reinvestment-replay', { detail }));
      toast(`Reinvestment Registration replay failed: ${detail.error}`);
      return detail;
    }
  }

  function boot() { setTimeout(replay, 1700); }
  window.AuroraIncomeReinvestmentReplay = Object.freeze({ build: BUILD, replay, payload, amount });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();