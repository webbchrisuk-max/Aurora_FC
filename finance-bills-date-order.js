(() => {
  'use strict';

  const BUILD = '20260823-finance-managed-bills-date-order-1';
  const STATE_KEY = 'aurora2:state:v1';
  let applying = false;
  let observer = null;
  let scheduled = 0;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  function readState() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read();
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function localTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dateKey(bill) {
    const due = String(bill?.due || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
    const month = String(bill?.occurrenceMonth || '');
    if (/^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
    return '9999-12-31';
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return String(value || 'No date');
    const [y, m, d] = String(value).split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0, 0);
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  function isActiveOutstanding(bill) {
    return !bill?.archived && !bill?.paid && bill?.included !== false;
  }

  function rankStatus(bill) {
    if (isActiveOutstanding(bill)) return 0;
    if (bill?.included === false && !bill?.archived && !bill?.paid) return 1;
    if (bill?.paid) return 2;
    if (bill?.archived) return 3;
    return 4;
  }

  function rowBillId(row) {
    return row.querySelector('[data-bill-complete]')?.dataset.billComplete
      || row.querySelector('[data-bill-edit]')?.dataset.billEdit
      || row.querySelector('[data-bill-toggle]')?.dataset.billToggle
      || row.querySelector('[data-bill-delete]')?.dataset.billDelete
      || '';
  }

  function ensureStyle() {
    if (document.getElementById('financeManagedBillsDateOrderStyle')) return;
    const style = document.createElement('style');
    style.id = 'financeManagedBillsDateOrderStyle';
    style.textContent = `
      #financeBillActionList .finance-managed-bill-date{
        display:inline-flex;align-items:center;gap:6px;margin:0 3px;padding:3px 7px;
        border-radius:7px;border:1px solid rgba(110,231,255,.13);
        background:rgba(110,231,255,.045);color:#a9bcc8;font-weight:800;
      }
      #financeBillActionList .finance-managed-bill-date.due-today,
      #financeBillActionList .finance-managed-bill-date.overdue{
        color:#ff6573;border-color:rgba(255,78,95,.48);background:rgba(255,58,78,.10);
        box-shadow:0 0 14px rgba(255,58,78,.08);
      }
      #financeBillActionList .finance-managed-bill-date .due-tag{
        font-size:8px;letter-spacing:.09em;font-weight:900;color:#ff6573;
      }
      #financeBillActionList .finance-action-row.due-today{
        border-color:rgba(255,78,95,.24);
      }
    `;
    document.head.appendChild(style);
  }

  function decorateRow(row, bill) {
    row.classList.remove('due-today', 'bill-overdue');
    const meta = row.querySelector(':scope > div > span');
    if (!meta) return;

    const status = bill?.archived ? 'Archived' : bill?.paid ? 'Paid' : bill?.included === false ? 'Excluded' : 'Active';
    const amount = Number(bill?.amount || 0);
    const rawDue = String(bill?.due || '').slice(0, 10);
    const rawMonth = String(bill?.occurrenceMonth || '');
    const today = localTodayKey();
    const actualDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : '';
    const isToday = Boolean(actualDate && actualDate === today && isActiveOutstanding(bill));
    const isOverdue = Boolean(actualDate && actualDate < today && isActiveOutstanding(bill));
    const dateText = actualDate ? formatDate(actualDate) : (/^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : 'No date');
    const dateClass = isToday ? ' due-today' : isOverdue ? ' overdue' : '';
    const tag = isToday ? '<em class="due-tag">DUE TODAY</em>' : isOverdue ? '<em class="due-tag">OVERDUE</em>' : '';

    if (isToday) row.classList.add('due-today');
    if (isOverdue) row.classList.add('bill-overdue');

    meta.innerHTML = `${esc(status)} • £${amount.toFixed(2)} • <b class="finance-managed-bill-date${dateClass}">${esc(dateText)}${tag}</b> • ${esc(bill?.fundingSource || 'Current Account')}`;
  }

  function apply() {
    if (applying) return;
    const host = document.getElementById('financeBillActionList');
    const bills = readState()?.finance?.bills;
    if (!host || !Array.isArray(bills)) return;

    const rows = [...host.querySelectorAll(':scope > .finance-action-row')];
    if (!rows.length) return;

    applying = true;
    try {
      ensureStyle();
      const byId = new Map(bills.map(b => [String(b?.id || ''), b]));
      const entries = rows.map((row, originalIndex) => {
        const bill = byId.get(String(rowBillId(row))) || null;
        return { row, bill, originalIndex };
      });

      entries.sort((a, b) => {
        const ar = rankStatus(a.bill), br = rankStatus(b.bill);
        if (ar !== br) return ar - br;
        const ad = dateKey(a.bill), bd = dateKey(b.bill);
        if (ad !== bd) return ad.localeCompare(bd);
        const an = String(a.bill?.name || ''), bn = String(b.bill?.name || '');
        const nameCmp = an.localeCompare(bn);
        return nameCmp || a.originalIndex - b.originalIndex;
      });

      entries.forEach(({ row, bill }) => {
        if (bill) decorateRow(row, bill);
        host.appendChild(row);
      });
    } finally {
      applying = false;
    }
  }

  function scheduleApply() {
    cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(apply);
  }

  function watch() {
    const host = document.getElementById('financeBillActionList');
    if (!host) {
      setTimeout(watch, 50);
      return;
    }
    if (!observer) {
      observer = new MutationObserver(() => { if (!applying) scheduleApply(); });
      observer.observe(host, { childList: true, subtree: true });
    }
    scheduleApply();
  }

  window.addEventListener('aurora2:state', scheduleApply);
  window.addEventListener('pageshow', scheduleApply);
  window.addEventListener('focus', scheduleApply);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleApply();
  });

  window.AuroraFinanceManagedBillsDateOrder = Object.freeze({
    build: BUILD,
    active: true,
    today: localTodayKey()
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
})();
