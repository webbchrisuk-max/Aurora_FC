(() => {
  'use strict';

  const BUILD = '20260820-finance-protected-bills-1';
  let ready = false;
  let lastAmount = 0;
  let lastBillsDue = 0;
  let lastAnnualFunding = 0;
  let lastError = null;

  const money = (value) => new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);

  function installStyles() {
    if (document.getElementById('auroraFinanceProtectedBillsStyles')) return;
    const style = document.createElement('style');
    style.id = 'auroraFinanceProtectedBillsStyles';
    style.textContent = `
      #paydayPanel .aurora-protected-bills-value{
        display:flex;
        align-items:center;
        width:100%;
        min-width:0;
        min-height:43px;
        box-sizing:border-box;
        padding:8px 10px;
        border:1px solid rgba(255,209,94,.18);
        border-radius:10px;
        background:linear-gradient(135deg,rgba(255,209,94,.055),rgba(2,9,16,.76));
        color:#fff0b5;
        font:inherit;
        font-weight:900;
        line-height:1.2;
      }
      #paydayPanel .aurora-protected-bills-field small strong{
        color:#ffe29a;
        font-weight:900;
      }
    `;
    document.head.appendChild(style);
  }

  function fieldGrid() {
    return document.querySelector('#paydayPanel .finance-field-grid');
  }

  function protectedSpendingField() {
    const fields = [...document.querySelectorAll('#paydayPanel .finance-field-grid .field')];
    return fields.find((field) => /protected spending money/i.test(field.querySelector('label')?.textContent || '')) || null;
  }

  function ensureField() {
    const grid = fieldGrid();
    if (!grid) return null;
    let field = grid.querySelector('.aurora-protected-bills-field');
    if (field) return field;

    installStyles();
    field = document.createElement('div');
    field.className = 'field aurora-protected-bills-field';
    field.innerHTML = `
      <label>Protected money for bills</label>
      <div class="aurora-protected-bills-value" data-finance-protected-bills>£0.00</div>
      <small data-finance-protected-bills-meta>Calculated automatically from bills due and 13-pay bill funding. Deducted before the safe investment release.</small>
    `;

    const protectedField = protectedSpendingField();
    if (protectedField?.parentNode === grid) grid.insertBefore(field, protectedField);
    else grid.appendChild(field);
    return field;
  }

  function currentState() {
    try { return window.Aurora2?.core?.read?.() || null; }
    catch (_) { return null; }
  }

  function currentPlan(state) {
    const draft = window.AuroraFinancePaydayPreview?.draftPlan;
    return draft && typeof draft === 'object'
      ? { ...draft }
      : { ...(state?.finance?.plan || {}) };
  }

  function calculate() {
    const state = currentState();
    const control = window.Aurora2?.financePaydayControl;
    if (!state?.finance || typeof control?.paydayFundingPreview !== 'function') return null;
    const preview = control.paydayFundingPreview(state, currentPlan(state));
    const auto = preview?.c?.auto || {};
    const billsDue = Math.max(0, Number(auto.billsDue) || 0);
    const annualFunding = Math.max(0, Number(auto.annualHoldingContribution) || 0);
    return {
      amount: Number((billsDue + annualFunding).toFixed(2)),
      billsDue,
      annualFunding
    };
  }

  function render() {
    const field = ensureField();
    if (!field) return false;

    try {
      const values = calculate();
      if (!values) return false;
      lastAmount = values.amount;
      lastBillsDue = values.billsDue;
      lastAnnualFunding = values.annualFunding;
      lastError = null;

      const value = field.querySelector('[data-finance-protected-bills]');
      const meta = field.querySelector('[data-finance-protected-bills-meta]');
      if (value) value.textContent = money(values.amount);
      if (meta) {
        meta.innerHTML = `Automatically protected: <strong>${money(values.billsDue)}</strong> bills due + <strong>${money(values.annualFunding)}</strong> 13-pay funding. This is deducted before safe release.`;
      }

      ready = true;
      window.AuroraFinanceProtectedBills = Object.freeze({
        build: BUILD,
        ready: true,
        amount: lastAmount,
        billsDue: lastBillsDue,
        annualFunding: lastAnnualFunding,
        includedBeforeSafeRelease: true,
        lastError
      });
      return true;
    } catch (error) {
      lastError = String(error?.message || error || 'Unknown protected-bills error');
      console.warn('[Aurora Finance protected bills]', lastError);
      return false;
    }
  }

  function bind() {
    const grid = fieldGrid();
    if (!grid || grid.dataset.auroraProtectedBillsBound === '1') return;
    grid.dataset.auroraProtectedBillsBound = '1';
    const refresh = () => setTimeout(render, 0);
    grid.addEventListener('input', refresh, true);
    grid.addEventListener('change', refresh, true);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      const previewReady = Boolean(window.AuroraFinancePaydayPreview?.ready);
      const apiReady = typeof window.Aurora2?.financePaydayControl?.paydayFundingPreview === 'function';
      if (previewReady && apiReady && fieldGrid()) {
        ensureField();
        bind();
        render();
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
