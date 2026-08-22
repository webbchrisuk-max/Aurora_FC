(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-registration-diagnostics-1';
  if (window.__auroraIncomeReinvestmentRegistrationDiagnostics) return;
  window.__auroraIncomeReinvestmentRegistrationDiagnostics = BUILD;

  const arr = value => Array.isArray(value) ? value : [];

  function resetRecordButton() {
    const button = document.getElementById('recordDividendCash');
    if (!button) return;
    if (/Confirming reinvestment/i.test(String(button.textContent || ''))) {
      button.textContent = 'Record Dividend';
      button.disabled = false;
    }
  }

  function status() {
    return window.__auroraIncomeReinvestmentReplayStatus || null;
  }

  function heldByReference(reference) {
    return arr(status()?.held).filter(row => String(row?.dividendReference || '') === String(reference || ''));
  }

  function decorateRows() {
    resetRecordButton();
    const replay = status();
    if (!replay) return;

    document.querySelectorAll('[data-ri-ledger-row]').forEach(row => {
      const text = String(row.textContent || '');
      const refMatch = text.match(/DIV:[A-Z0-9]+:[A-Z0-9.\-]+:\d{4}-\d{2}-\d{2}:[0-9.]+/i);
      if (!refMatch) return;
      const holds = heldByReference(refMatch[0]);
      row.querySelectorAll('[data-ri-hold-reason]').forEach(node => node.remove());
      if (!holds.length) return;

      const reason = [...new Set(holds.map(item => `${item.ticker || 'LEG'}: ${item.reason || 'Registration pending'}`))].join(' • ');
      const node = document.createElement('div');
      node.dataset.riHoldReason = BUILD;
      node.style.cssText = 'margin-top:7px;padding:7px 9px;border-radius:8px;border:1px solid rgba(255,184,77,.24);background:rgba(255,184,77,.07);color:#f2c27b;font-size:8px;line-height:1.45;text-align:left';
      node.textContent = `REGISTRATION HOLD • ${reason}`;
      const side = row.querySelector('.row-side') || row;
      side.appendChild(node);
    });

    const note = document.getElementById('cashNote');
    const held = arr(replay.held);
    if (note && held.length) {
      const compact = [...new Set(held.map(item => `${item.ticker || 'LEG'}: ${item.reason || 'Registration pending'}`))].join(' • ');
      note.textContent = `Reinvestment Registration pending — ${compact}`;
    }
  }

  async function retry() {
    resetRecordButton();
    const replay = window.AuroraIncomeReinvestmentReplay;
    if (!replay?.replay) return null;
    const result = await replay.replay();
    setTimeout(decorateRows, 120);
    setTimeout(decorateRows, 500);
    return result;
  }

  function addRetryButton() {
    const actions = document.querySelector('#treasury .cash-actions');
    if (!actions || document.getElementById('retryReinvestmentRegistration')) return;
    const button = document.createElement('button');
    button.className = 'income-btn';
    button.id = 'retryReinvestmentRegistration';
    button.type = 'button';
    button.textContent = 'Retry Reinvestment Registration';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const old = button.textContent;
      button.textContent = 'Checking Registration…';
      try { await retry(); }
      finally {
        button.disabled = false;
        button.textContent = old;
      }
    });
    actions.appendChild(button);
  }

  function boot() {
    addRetryButton();
    resetRecordButton();
    setTimeout(decorateRows, 1800);
    window.addEventListener('aurora:income-reinvestment-replay', () => {
      resetRecordButton();
      setTimeout(decorateRows, 100);
      setTimeout(decorateRows, 450);
    });
    window.addEventListener('aurora:income-settlement-reconcile', () => setTimeout(decorateRows, 150));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetRecordButton();
        setTimeout(decorateRows, 150);
      }
    });
  }

  window.AuroraIncomeReinvestmentRegistrationDiagnostics = Object.freeze({
    build: BUILD,
    retry,
    decorateRows,
    status
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();