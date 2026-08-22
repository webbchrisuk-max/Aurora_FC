(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-ledger-ui-1';
  if (window.__auroraIncomeReinvestmentLedgerUi) return;
  window.__auroraIncomeReinvestmentLedgerUi = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(num(value));
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function accountCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'IG' || raw.includes('IG ISA')) return 'IG';
    if (raw === 'T212' || raw.includes('212')) return 'T212';
    return raw;
  }

  function accountLabel(value) {
    return accountCode(value) === 'T212' ? 'Trading 212 ISA' : accountCode(value) === 'IG' ? 'IG ISA' : String(value || '');
  }

  function ticker(value) {
    return String(value || '').trim().toUpperCase().replace(/^LON:/, '').replace(/\.L$/, '').replace(/\.GB$/, '');
  }

  function referenceAmount(reference) {
    const match = String(reference || '').trim().match(/^DIV:[^:]+:[^:]+:\d{4}-\d{2}-\d{2}:([0-9]+(?:\.[0-9]+)?)(?::|$)/i);
    return match ? Math.abs(num(match[1])) : 0;
  }

  function grossAmount(row) {
    for (const value of [row?.grossGbp, row?.gross_gbp, row?.amountGbp, row?.dividendAmountGbp, row?.settlementAmountGbp, row?.grossAmountGbp, row?.amount]) {
      const amount = Math.abs(num(value));
      if (amount > 0) return amount;
    }
    return referenceAmount(row?.reference);
  }

  function cashChange(row) {
    return num(row?.cashChangeGbp ?? row?.cash_change_gbp);
  }

  function balanceAfter(row) {
    return num(row?.balanceAfterGbp ?? row?.balance_after_gbp);
  }

  function rowType(row) {
    return String(row?.type || row?.mode || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  function isReinvested(row) {
    return rowType(row).includes('DIVIDEND_REINVESTED') || /REINVEST/.test(rowType(row));
  }

  function legCount(note) {
    const match = String(note || '').match(/(?:^|\s)RI2=([^\s]+)/);
    if (!match) return 0;
    return String(match[1] || '').split('|').filter(Boolean).length;
  }

  function promotionState(row) {
    if (!isReinvested(row)) return '';
    const expected = legCount(row?.note || row?.notes);
    if (!expected) return 'Registration evidence pending';
    const reference = String(row?.reference || '');
    const ledger = arr(window.AuroraIncomeReinvestmentPromotion?.ledger?.());
    const confirmed = ledger.filter(item =>
      String(item?.dividendReference || '') === reference &&
      String(item?.status || '').toUpperCase() === 'PROMOTED'
    ).length;
    if (confirmed >= expected) return `${expected}/${expected} Registration confirmed`;

    const replay = window.__auroraIncomeReinvestmentReplayStatus;
    const held = arr(replay?.held).filter(item => String(item?.dividendReference || '') === reference);
    if (held.length) return `${confirmed}/${expected} Registration pending`;
    return `${confirmed}/${expected} Registration pending`;
  }

  function adjustmentApplied(snapshot, row) {
    const api = window.AuroraIncomeReinvestmentCashRemainder;
    if (!api?.adjustmentReference || !row?.reference) return false;
    const reference = api.adjustmentReference(String(row.reference));
    return arr(snapshot?.ledger).some(item => String(item?.reference || '') === reference);
  }

  function actionHtml(snapshot, row, index) {
    if (!isReinvested(row) || !String(row?.note || '').includes('RI2=')) return '';
    if (adjustmentApplied(snapshot, row)) {
      return '<div style="margin-top:7px;color:#5ee7a1;font-size:8px">UNUSED CASH HELD IN BROKER CASH POSITION</div>';
    }
    return `
      <div style="display:flex;gap:7px;align-items:center;justify-content:flex-end;margin-top:7px;flex-wrap:wrap">
        <label for="riCash-${index}" style="font-size:8px;color:#8f819e">Unused cash £</label>
        <input id="riCash-${index}" data-ri-cash-input type="number" min="0" step="0.01" placeholder="Exact broker remainder" style="width:145px;padding:7px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.10);background:rgba(4,8,20,.45);color:#fff">
        <button class="income-btn" type="button" data-ri-cash-apply data-index="${index}">Add unused cash</button>
      </div>`;
  }

  function formatTime(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-GB');
  }

  function render(snapshot) {
    const host = document.getElementById('cashLedger');
    if (!host || !snapshot) return false;
    const rows = arr(snapshot?.ledger).slice(0, 16);
    const ig = document.getElementById('cashBalanceIG');
    const t212 = document.getElementById('cashBalanceT212');
    if (ig) ig.textContent = money(snapshot?.balances?.IG || 0);
    if (t212) t212.textContent = money(snapshot?.balances?.T212 || 0);

    host.innerHTML = rows.length ? rows.map((row, index) => {
      const reinvested = isReinvested(row);
      const gross = grossAmount(row);
      const movement = cashChange(row);
      const displayAmount = reinvested && gross > 0
        ? `${money(gross)} reinvested`
        : `${movement >= 0 ? '+' : ''}${money(movement)}`;
      const state = promotionState(row);
      const stateText = state ? ` • ${state}` : '';
      const note = row?.note ? ` • ${esc(row.note)}` : '';
      return `<div class="income-row" data-ri-ledger-row="${BUILD}">
        <div><strong>${esc(ticker(row?.ticker) || accountLabel(row?.account))} • ${esc(String(row?.type || '').replaceAll('_', ' '))}</strong>
        <span>${esc(formatTime(row?.recordedAt || row?.recorded_at))} • ${esc(row?.reference || 'no reference')}${note}${esc(stateText)}</span></div>
        <div class="row-side"><b>${esc(displayAmount)}</b><span>${money(balanceAfter(row))} cash balance</span>${actionHtml(snapshot, row, index)}</div>
      </div>`;
    }).join('') : '<div class="empty">No broker dividend cash activity recorded yet.</div>';
    host.dataset.reinvestmentLedgerBuild = BUILD;
    host.__auroraLedgerSnapshot = snapshot;
    return true;
  }

  function toast(message) {
    const el = document.getElementById('incomeToast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(window.__incomeLedgerUiToastTimer);
    window.__incomeLedgerUiToastTimer = setTimeout(() => el.classList.remove('show'), 4600);
  }

  async function refresh() {
    const client = window.AuroraData2Client;
    if (!client?.post) return false;
    try {
      const snapshot = await client.post('brokerCashSnapshot', {});
      render(snapshot);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function applyCash(button) {
    const host = document.getElementById('cashLedger');
    const snapshot = host?.__auroraLedgerSnapshot;
    const index = Number(button?.dataset?.index);
    const row = arr(snapshot?.ledger).slice(0, 16)[index];
    if (!row || !isReinvested(row)) return toast('That reinvested dividend row is no longer available. Refresh the cash ledger.');
    const input = button.closest('.row-side')?.querySelector('[data-ri-cash-input]');
    const amount = Number(String(input?.value || '').trim());
    if (!(amount > 0)) return toast('Enter the exact unused cash amount shown by the broker.');

    const api = window.AuroraIncomeReinvestmentCashRemainder;
    const client = window.AuroraData2Client;
    if (!api?.applyRemainder || !client?.post) return toast('Unused-cash reconciliation is not ready yet.');

    button.disabled = true;
    const old = button.textContent;
    button.textContent = 'Adding cash…';
    try {
      const outcome = await api.applyRemainder(client.post.bind(client), {
        account: row?.account,
        dividendTicker: row?.ticker,
        dividendReference: String(row?.reference || ''),
        amount,
        source: 'BROKER_EXACT'
      });
      if (outcome?.status === 'ALREADY_APPLIED') toast(`${money(amount)} unused cash was already held in ${accountLabel(row?.account)}.`);
      else toast(`${money(amount)} unused dividend cash added to ${accountLabel(row?.account)}.`);
      await refresh();
      setTimeout(() => window.AuroraIncomeSettlementReconcile?.refresh?.(), 120);
    } catch (error) {
      toast(`Unused cash reconciliation failed: ${String(error?.message || error)}`);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  function bind() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-ri-cash-apply]');
      if (button) {
        event.preventDefault();
        applyCash(button);
        return;
      }
      if (event.target.closest?.('#refreshBrokerCash,#recordDividendCash')) setTimeout(refresh, 350);
    });
    window.addEventListener('aurora:income-settlement-reconcile', () => setTimeout(refresh, 80));
    window.addEventListener('aurora:income-reinvestment-replay', () => setTimeout(refresh, 80));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(refresh, 120);
    });

    const host = document.getElementById('cashLedger');
    if (host) {
      const observer = new MutationObserver(() => {
        const first = host.querySelector('[data-ri-ledger-row]');
        if (host.children.length && !first) setTimeout(refresh, 40);
      });
      observer.observe(host, { childList: true });
    }
  }

  function start() {
    bind();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (document.getElementById('cashLedger') && window.AuroraData2Client?.post) {
        clearInterval(timer);
        refresh();
      } else if (tries > 240) clearInterval(timer);
    }, 50);
  }

  window.AuroraIncomeReinvestmentLedgerUi = Object.freeze({ build: BUILD, refresh, render, grossAmount });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();