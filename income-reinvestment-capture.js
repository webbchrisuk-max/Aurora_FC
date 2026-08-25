(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-capture-2';
  const $ = id => document.getElementById(id);
  const num = value => {
    const n = Number(String(value ?? '').replace(/[£,%]/g, '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  let busy = false;
  let legSeq = 0;

  function truth() { return window.AuroraIncomeTruth || null; }
  function client() { return window.AuroraData2Client || null; }
  function ticker(value) {
    const raw = String(value || '').trim();
    return truth()?.ticker?.(raw) || raw.toUpperCase();
  }
  function destination(value) {
    const raw = String(value || '').trim();
    if (/^[A-Za-z0-9.\-]{1,24}$/.test(raw)) return raw.toUpperCase();
    return raw;
  }
  function toast(message) {
    const el = $('incomeToast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(window.__incomeReinvestToastTimer);
    window.__incomeReinvestToastTimer = setTimeout(() => el.classList.remove('show'), 3400);
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
      .income-reinvest-legs{display:grid;gap:9px}
      .income-reinvest-leg{display:grid;grid-template-columns:1.25fr .9fr .9fr auto auto;gap:8px;align-items:end;padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(4,8,20,.24)}
      .income-reinvest-leg .field{min-width:0}
      .income-reinvest-leg-actions{display:flex;gap:6px;align-items:center}
      .income-reinvest-remove{min-width:38px;padding-inline:10px}
      .income-reinvest-remove[disabled]{opacity:.35;cursor:not-allowed}
      .income-reinvest-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}
      .income-reinvest-toolbar span{color:#8f819e;font-size:8px;line-height:1.45}
      .income-reinvest-status{margin-top:9px;padding:9px;border-radius:9px;border:1px solid rgba(103,232,249,.12);background:rgba(8,47,73,.08);color:#9bb4c0;font-size:8px;line-height:1.5}
      .income-reinvest-status.ready{color:#5ee7a1;border-color:rgba(94,231,161,.18);background:rgba(6,78,59,.08)}
      @media(max-width:1040px){.income-reinvest-leg{grid-template-columns:1fr 1fr 1fr}.income-reinvest-leg-actions{grid-column:1/-1}}
      @media(max-width:700px){.income-reinvest-leg{grid-template-columns:1fr 1fr}.income-reinvest-leg .field:first-child{grid-column:1/-1}.income-reinvest-leg-actions{grid-column:1/-1}}
      @media(max-width:520px){.income-reinvest-leg{grid-template-columns:1fr}.income-reinvest-leg .field:first-child,.income-reinvest-leg-actions{grid-column:1}}
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

  function legRows() {
    return [...document.querySelectorAll('#cashReinvestLegs .income-reinvest-leg')];
  }

  function readLeg(row) {
    return {
      destination: destination(row.querySelector('[data-reinvest-destination]')?.value),
      shares: Math.max(0, num(row.querySelector('[data-reinvest-shares]')?.value)),
      priceGbp: Math.max(0, num(row.querySelector('[data-reinvest-price]')?.value))
    };
  }

  function readLegs({ includeEmpty = false } = {}) {
    const rows = legRows().map(readLeg);
    return includeEmpty ? rows : rows.filter(leg => leg.destination);
  }

  function syncRemoveButtons() {
    const rows = legRows();
    rows.forEach(row => {
      const button = row.querySelector('[data-reinvest-remove]');
      if (button) button.disabled = rows.length <= 1;
    });
  }

  function addLeg(values = {}) {
    const host = $('cashReinvestLegs');
    if (!host) return null;
    legSeq += 1;
    const row = document.createElement('div');
    row.className = 'income-reinvest-leg';
    row.dataset.reinvestLeg = String(legSeq);
    row.innerHTML = `
      <div class="field"><label>Reinvested into (ticker / Pie)</label><input data-reinvest-destination list="cashReinvestTickers" placeholder="e.g. PHP or Dividend Pie"></div>
      <div class="field"><label>Shares purchased</label><input data-reinvest-shares type="number" min="0" step="0.00000001" placeholder="If broker shows it"></div>
      <div class="field"><label>Buy price £</label><input data-reinvest-price type="number" min="0" step="0.0001" placeholder="Optional"></div>
      <div class="income-reinvest-leg-actions">
        <button class="income-btn" data-reinvest-same type="button">Use dividend ticker</button>
        <button class="income-btn danger income-reinvest-remove" data-reinvest-remove type="button" aria-label="Remove reinvestment leg">Remove</button>
      </div>
    `;
    row.querySelector('[data-reinvest-destination]').value = values.destination || '';
    row.querySelector('[data-reinvest-shares]').value = values.shares > 0 ? values.shares : '';
    row.querySelector('[data-reinvest-price]').value = values.priceGbp > 0 ? values.priceGbp : '';
    row.addEventListener('input', updateStatus);
    row.querySelector('[data-reinvest-same]')?.addEventListener('click', () => {
      row.querySelector('[data-reinvest-destination]').value = ticker($('cashRecordTicker')?.value);
      updateStatus();
    });
    row.querySelector('[data-reinvest-remove]')?.addEventListener('click', () => {
      if (legRows().length <= 1) return;
      row.remove();
      syncRemoveButtons();
      updateStatus();
    });
    host.appendChild(row);
    syncRemoveButtons();
    updateStatus();
    return row;
  }

  function resetLegs() {
    const host = $('cashReinvestLegs');
    if (!host) return;
    host.innerHTML = '';
    addLeg();
  }

  function updateStatus() {
    const panel = $('cashReinvestFields');
    const status = $('cashReinvestStatus');
    if (!panel || !status) return;
    const mode = String($('cashRecordMode')?.value || 'CASH').toUpperCase();
    panel.hidden = mode !== 'REINVESTED';
    if (mode !== 'REINVESTED') return;

    const all = readLegs({ includeEmpty: true });
    const legs = all.filter(leg => leg.destination);
    const pendingRows = all.filter(leg => !leg.destination && (leg.shares > 0 || leg.priceGbp > 0)).length;
    const ready = legs.filter(leg => leg.shares > 0).length;
    const pendingShares = legs.length - ready;

    status.classList.toggle('ready', legs.length > 0 && pendingRows === 0 && pendingShares === 0);
    if (!legs.length) {
      status.textContent = 'Add each share or Pie that Trading 212 bought with this one dividend. Aurora will not guess any destination.';
      return;
    }

    const parts = [`${legs.length} reinvestment leg${legs.length === 1 ? '' : 's'} captured`];
    if (ready) parts.push(`${ready} Registration ready`);
    if (pendingShares) parts.push(`${pendingShares} waiting for exact share quantity`);
    if (pendingRows) parts.push(`${pendingRows} incomplete row${pendingRows === 1 ? '' : 's'}`);
    status.textContent = `${parts.join(' • ')}. This remains one dividend settlement; Squad holdings are not changed here.`;
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
      <div class="income-reinvest-head"><div><strong>AUTO-REINVESTMENT EVIDENCE</strong><span>One dividend can fund several purchases. Add one leg for each share or Pie the broker actually bought.</span></div><span>ONE DIVIDEND • MULTIPLE LEGS</span></div>
      <datalist id="cashReinvestTickers"></datalist>
      <div class="income-reinvest-legs" id="cashReinvestLegs"></div>
      <div class="income-reinvest-toolbar">
        <button class="income-btn" id="cashReinvestAddLeg" type="button">+ Add another reinvestment</button>
        <span>Income records evidence only. Registration/Squad remain authoritative for purchased shares.</span>
      </div>
      <div class="income-reinvest-status" id="cashReinvestStatus">Add the broker's reinvestment destination.</div>
    `;
    form.insertAdjacentElement('afterend', panel);
    populateDestinations();
    addLeg();
    $('cashRecordMode')?.addEventListener('change', updateStatus);
    $('cashRecordTicker')?.addEventListener('input', updateStatus);
    $('cashReinvestAddLeg')?.addEventListener('click', () => {
      const row = addLeg();
      row?.querySelector('[data-reinvest-destination]')?.focus();
    });
    window.addEventListener('aurora2:state', () => setTimeout(populateDestinations, 50));
    updateStatus();
    return true;
  }

  function formatLeg(leg, index) {
    const shares = leg.shares > 0
      ? `${leg.shares.toLocaleString('en-GB', { maximumFractionDigits: 8 })} shares`
      : 'shares pending';
    const price = leg.priceGbp > 0 ? ` @ £${leg.priceGbp.toFixed(4)}` : '';
    return `${index + 1}:${leg.destination} ${shares}${price}`;
  }

  function reinvestmentNote(legs) {
    const ready = legs.filter(leg => leg.shares > 0).length;
    const human = legs.map(formatLeg).join(' ; ');
    const machine = legs.map(leg => [
      encodeURIComponent(leg.destination),
      leg.shares > 0 ? String(leg.shares) : '',
      leg.priceGbp > 0 ? String(leg.priceGbp) : ''
    ].join('~')).join('|');
    return `Auto reinvested v2 • ${legs.length} legs • ${human} • ${ready}/${legs.length} Registration ready • RI2=${machine}`;
  }

  async function recordReinvestment(button) {
    if (busy) return;
    const account = String($('cashRecordAccount')?.value || '').toUpperCase();
    const tk = ticker($('cashRecordTicker')?.value);
    const amount = Math.max(0, num($('cashRecordAmount')?.value));
    const legs = readLegs();
    const incomplete = readLegs({ includeEmpty: true }).some(leg => !leg.destination && (leg.shares > 0 || leg.priceGbp > 0));

    if (!['IG', 'T212'].includes(account) || !tk || amount <= 0) {
      toast('Enter broker, dividend ticker and dividend amount.');
      return;
    }
    if (!legs.length) {
      toast('Add at least one reinvestment destination.');
      legRows()[0]?.querySelector('[data-reinvest-destination]')?.focus();
      return;
    }
    if (incomplete) {
      toast('Complete or remove the reinvestment row that has shares/price but no destination.');
      return;
    }
    if (!client()?.post) {
      toast('AuroraData 2 client is not available.');
      return;
    }

    const reference = `DIV:${account}:${tk}:${new Date().toISOString().slice(0, 10)}:${amount.toFixed(2)}`;
    const note = reinvestmentNote(legs);
    const ready = legs.filter(leg => leg.shares > 0).length;
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
      $('cashRecordAmount').value = '';
      resetLegs();
      updateStatus();
      setTimeout(() => $('refreshBrokerCash')?.click(), 80);
      setTimeout(() => window.AuroraIncomeSettlementReconcile?.refresh?.(), 250);
      toast(result?.duplicate
        ? 'This dividend settlement was already recorded.'
        : `${legs.length} reinvestment leg${legs.length === 1 ? '' : 's'} recorded${ready < legs.length ? ` • ${legs.length - ready} still awaiting exact shares` : ' • Registration evidence ready'}.`);
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
    legs: () => readLegs(),
    addLeg,
    refreshUI: () => { installPanel(); populateDestinations(); updateStatus(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

(() => {
  if (window.__auroraIncomeNextDividendCountdownLoader) return;
  window.__auroraIncomeNextDividendCountdownLoader = true;
  const script = document.createElement('script');
  script.src = 'income-next-dividend-countdown.js?v=20260825-income-next-dividend-countdown-1';
  script.defer = true;
  document.head.appendChild(script);
})();
