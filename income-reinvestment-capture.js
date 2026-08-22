(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-capture-1';
  const $ = id => document.getElementById(id);
  const num = value => {
    const n = Number(String(value ?? '').replace(/[£,%]/g, '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  let busy = false;

  function truth() { return window.AuroraIncomeTruth || null; }
  function client() { return window.AuroraData2Client || null; }
  function ticker(value) {
    const raw = String(value || '').trim();
    return truth()?.ticker?.(raw) || raw.toUpperCase();
  }
  function destination(value) {
    const raw = String(value || '').trim();
    if (/^[A-Za-z0-9.\-]{1,16}$/.test(raw)) return raw.toUpperCase();
    return raw;
  }
  function toast(message) {
    const el = $('incomeToast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(window.__incomeReinvestToastTimer);
    window.__incomeReinvestToastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value ?? '';
  }

  function installStyles() {
    if ($('incomeReinvestStyles')) return;
    const style = document.createElement('style');
    style.id = 'incomeReinvestStyles';
    style.textContent = `
      .income-reinvest-panel{margin-top:10px;padding:13px;border:1px solid rgba(196,167,255,.18);border-radius:12px;background:linear-gradient(135deg,rgba(91,33,182,.10),rgba(8,47,73,.08))}
      .income-reinvest-panel[hidden]{display:none!important}
      .income-reinvest-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:10px}
      .income-reinvest-head strong{display:block;font-size:11px;color:#f4c96b}
      .income-reinvest-head span{display:block;margin-top:4px;color:#8f819e;font-size:8px;line-height:1.45}
      .income-reinvest-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr auto;gap:8px;align-items:end}
      .income-reinvest-status{margin-top:9px;padding:9px;border-radius:9px;border:1px solid rgba(103,232,249,.12);background:rgba(8,47,73,.08);color:#9bb4c0;font-size:8px;line-height:1.5}
      .income-reinvest-status.ready{color:#5ee7a1;border-color:rgba(94,231,161,.18);background:rgba(6,78,59,.08)}
      @media(max-width:900px){.income-reinvest-grid{grid-template-columns:1fr 1fr}.income-reinvest-grid .income-btn{grid-column:1/-1}}
      @media(max-width:620px){.income-reinvest-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function populateDestinations() {
    const list = $('cashReinvestTickers');
    if (!list || !truth()?.metrics) return;
    let state = {};
    try { state = window.Aurora2?.core?.read?.() || {}; } catch (_) {}
    const players = truth().metrics(state)?.players || [];
    const unique = [...new Set(players.map(row => ticker(row?.ticker)).filter(Boolean))].sort();
    list.innerHTML = unique.map(tk => `<option value="${tk}"></option>`).join('');
  }

  function updateStatus() {
    const panel = $('cashReinvestFields');
    const status = $('cashReinvestStatus');
    if (!panel || !status) return;
    const mode = String($('cashRecordMode')?.value || 'CASH').toUpperCase();
    panel.hidden = mode !== 'REINVESTED';
    if (mode !== 'REINVESTED') return;
    const dest = destination($('cashReinvestDestination')?.value);
    const shares = Math.max(0, num($('cashReinvestShares')?.value));
    const price = Math.max(0, num($('cashReinvestPrice')?.value));
    status.classList.toggle('ready', Boolean(dest && shares > 0));
    if (!dest) {
      status.textContent = 'Tell Aurora where Trading 212 reinvested the dividend. Income will not guess the destination.';
    } else if (shares <= 0) {
      status.textContent = `${dest} captured as the reinvestment destination. Exact purchased shares are still pending broker confirmation.`;
    } else {
      status.textContent = `${shares.toLocaleString('en-GB', { maximumFractionDigits: 8 })} shares of ${dest} captured${price > 0 ? ` at £${price.toFixed(4)}` : ''}. This is reinvestment evidence; Registration remains the share authority.`;
    }
  }

  function installPanel() {
    if ($('cashReinvestFields')) return true;
    const form = document.querySelector('#treasury .cash-form');
    if (!form) return false;
    installStyles();
    const panel = document.createElement('div');
    panel.className = 'income-reinvest-panel';
    panel.id = 'cashReinvestFields';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="income-reinvest-head"><div><strong>AUTO-REINVESTMENT EVIDENCE</strong><span>Record what the broker actually bought. Income stores the evidence; Registration/Squad remain authoritative for holdings.</span></div><span>NO SHARE GUESSING</span></div>
      <div class="income-reinvest-grid">
        <div class="field"><label>Reinvested into (ticker / Pie)</label><input id="cashReinvestDestination" list="cashReinvestTickers" placeholder="e.g. SUPR or Dividend Pie"><datalist id="cashReinvestTickers"></datalist></div>
        <div class="field"><label>Shares purchased</label><input id="cashReinvestShares" type="number" min="0" step="0.00000001" placeholder="If broker shows it"></div>
        <div class="field"><label>Buy price £</label><input id="cashReinvestPrice" type="number" min="0" step="0.0001" placeholder="Optional"></div>
        <button class="income-btn" id="cashReinvestSame" type="button">Use dividend ticker</button>
      </div>
      <div class="income-reinvest-status" id="cashReinvestStatus">Tell Aurora where the dividend was reinvested.</div>
    `;
    form.insertAdjacentElement('afterend', panel);
    populateDestinations();
    $('cashRecordMode')?.addEventListener('change', updateStatus);
    ['cashReinvestDestination', 'cashReinvestShares', 'cashReinvestPrice'].forEach(id => $(id)?.addEventListener('input', updateStatus));
    $('cashReinvestSame')?.addEventListener('click', () => {
      setValue('cashReinvestDestination', ticker($('cashRecordTicker')?.value));
      updateStatus();
    });
    window.addEventListener('aurora2:state', () => setTimeout(populateDestinations, 50));
    updateStatus();
    return true;
  }

  function reinvestmentNote(dest, shares, price) {
    const shareText = shares > 0 ? `${shares.toLocaleString('en-GB', { maximumFractionDigits: 8 })} shares` : 'shares pending';
    const priceText = price > 0 ? ` @ £${price.toFixed(4)}` : '';
    return `Auto reinvested → ${dest} • ${shareText}${priceText} • ${shares > 0 ? 'Registration ready' : 'Registration pending'}`;
  }

  async function recordReinvestment(button) {
    if (busy) return;
    const account = String($('cashRecordAccount')?.value || '').toUpperCase();
    const tk = ticker($('cashRecordTicker')?.value);
    const amount = Math.max(0, num($('cashRecordAmount')?.value));
    const dest = destination($('cashReinvestDestination')?.value);
    const shares = Math.max(0, num($('cashReinvestShares')?.value));
    const price = Math.max(0, num($('cashReinvestPrice')?.value));
    if (!['IG', 'T212'].includes(account) || !tk || amount <= 0) {
      toast('Enter broker, dividend ticker and dividend amount.');
      return;
    }
    if (!dest) {
      toast('Enter what the dividend was auto-reinvested into.');
      $('cashReinvestDestination')?.focus();
      return;
    }
    if (!client()?.post) {
      toast('AuroraData 2 client is not available.');
      return;
    }
    const reference = `DIV:${account}:${tk}:${new Date().toISOString().slice(0, 10)}:${amount.toFixed(2)}`;
    const note = reinvestmentNote(dest, shares, price);
    busy = true;
    if (button) button.disabled = true;
    try {
      const result = await client().post('recordDividendSettlement', {
        account,
        ticker: tk,
        amountGbp: amount,
        mode: 'REINVESTED',
        reference,
        note
      });
      setValue('cashRecordAmount', '');
      setValue('cashReinvestDestination', '');
      setValue('cashReinvestShares', '');
      setValue('cashReinvestPrice', '');
      updateStatus();
      setTimeout(() => $('refreshBrokerCash')?.click(), 80);
      setTimeout(() => window.AuroraIncomeSettlementReconcile?.refresh?.(), 250);
      toast(result?.duplicate
        ? 'This dividend settlement was already recorded.'
        : shares > 0
          ? `Reinvestment recorded: ${shares.toLocaleString('en-GB', { maximumFractionDigits: 8 })} shares of ${dest}.`
          : `Reinvestment destination ${dest} recorded; share confirmation remains pending.`);
    } catch (error) {
      toast(`Dividend reinvestment record failed: ${String(error?.message || error)}`);
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  function bindCapture() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('#recordDividendCash');
      if (!button) return;
      const mode = String($('cashRecordMode')?.value || 'CASH').toUpperCase();
      if (mode !== 'REINVESTED') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      recordReinvestment(button);
    }, true);
  }

  function start() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (installPanel() || tries > 200) clearInterval(timer);
    }, 50);
    bindCapture();
  }

  window.AuroraIncomeReinvestmentCapture = Object.freeze({
    build: BUILD,
    refreshUI: () => { installPanel(); populateDestinations(); updateStatus(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
