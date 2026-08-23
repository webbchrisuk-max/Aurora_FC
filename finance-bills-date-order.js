(() => {
  'use strict';

  const BUILD = '20260823-finance-managed-bills-month-groups-1';
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

  function monthKeyForBill(bill) {
    const due = String(bill?.due || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due.slice(0, 7);
    const month = String(bill?.occurrenceMonth || '');
    if (/^\d{4}-\d{2}$/.test(month)) return month;
    return 'NO_DATE';
  }

  function formatMonth(key) {
    if (!/^\d{4}-\d{2}$/.test(String(key || ''))) return 'No Date';
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1, 12, 0, 0).toLocaleDateString('en-GB', {
      month: 'long', year: 'numeric'
    });
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
      #financeBillActionList{display:block!important}
      #financeBillActionList .finance-managed-month{margin:18px 0 8px;padding:11px 13px;border:1px solid rgba(110,231,255,.16);border-radius:12px;background:linear-gradient(90deg,rgba(10,37,56,.82),rgba(5,18,31,.48));display:flex;align-items:center;justify-content:space-between;gap:12px}
      #financeBillActionList .finance-managed-month:first-child{margin-top:4px}
      #financeBillActionList .finance-managed-month strong{display:block;color:#e9f8ff;font-size:13px;letter-spacing:.01em}
      #financeBillActionList .finance-managed-month span{display:block;color:#7fa8ba;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
      #financeBillActionList .finance-action-row{margin-bottom:8px}
      #financeBillActionList .finance-managed-bill-date{display:inline-flex;align-items:center;gap:6px;margin:0 3px;padding:3px 7px;border-radius:7px;border:1px solid rgba(110,231,255,.13);background:rgba(110,231,255,.045);color:#a9bcc8;font-weight:800;pointer-events:none}
      #financeBillActionList .finance-managed-bill-date.due-today,
      #financeBillActionList .finance-managed-bill-date.overdue{color:#ff6573;border-color:rgba(255,78,95,.48);background:rgba(255,58,78,.10);box-shadow:0 0 14px rgba(255,58,78,.08)}
      #financeBillActionList .finance-managed-bill-date .due-tag{font-size:8px;letter-spacing:.09em;font-weight:900;color:#ff6573}
      #financeBillActionList .finance-action-row.due-today{border-color:rgba(255,78,95,.24)}
      #financeBillActionList .finance-row-actions,#financeBillActionList .finance-row-actions button{position:relative;z-index:3;pointer-events:auto}
      @media(max-width:760px){#financeBillActionList .finance-managed-month{align-items:flex-start;flex-direction:column;gap:4px}}
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
    const dateText = actualDate ? formatDate(actualDate) : (/^\d{4}-\d{2}$/.test(rawMonth) ? formatMonth(rawMonth) : 'No date');
    const dateClass = isToday ? ' due-today' : isOverdue ? ' overdue' : '';
    const tag = isToday ? '<em class="due-tag">DUE TODAY</em>' : isOverdue ? '<em class="due-tag">OVERDUE</em>' : '';

    if (isToday) row.classList.add('due-today');
    if (isOverdue) row.classList.add('bill-overdue');

    const desired = `${esc(status)} • £${amount.toFixed(2)} • <b class="finance-managed-bill-date${dateClass}">${esc(dateText)}${tag}</b> • ${esc(bill?.fundingSource || 'Current Account')}`;
    if (meta.innerHTML !== desired) meta.innerHTML = desired;
  }

  function createMonthHeader(key, entries) {
    const active = entries.filter(item => isActiveOutstanding(item.bill));
    const total = active.reduce((sum, item) => sum + Math.max(0, Number(item.bill?.amount || 0)), 0);
    const header = document.createElement('div');
    header.className = 'finance-managed-month';
    header.dataset.financeBillMonth = key;
    header.innerHTML = `<strong>${esc(formatMonth(key))}</strong><span>${active.length} active bill${active.length === 1 ? '' : 's'} • £${total.toFixed(2)}</span>`;
    return header;
  }

  function observeHost(host) {
    if (!observer) observer = new MutationObserver(() => { if (!applying) scheduleApply(); });
    observer.disconnect();
    observer.observe(host, { childList: true });
  }

  function apply() {
    if (applying) return;
    const host = document.getElementById('financeBillActionList');
    const bills = readState()?.finance?.bills;
    if (!host || !Array.isArray(bills)) return;

    const rows = [...host.querySelectorAll(':scope > .finance-action-row')];
    if (!rows.length) {
      observeHost(host);
      return;
    }

    applying = true;
    if (observer) observer.disconnect();
    try {
      ensureStyle();
      host.querySelectorAll(':scope > .finance-managed-month').forEach(node => node.remove());

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

      const groups = new Map();
      entries.forEach(entry => {
        const key = monthKeyForBill(entry.bill);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
      });

      const orderedKeys = [...groups.keys()].sort((a, b) => {
        if (a === 'NO_DATE') return 1;
        if (b === 'NO_DATE') return -1;
        return a.localeCompare(b);
      });

      const fragment = document.createDocumentFragment();
      orderedKeys.forEach(key => {
        const groupEntries = groups.get(key) || [];
        fragment.appendChild(createMonthHeader(key, groupEntries));
        groupEntries.forEach(({ row, bill }) => {
          if (bill) decorateRow(row, bill);
          fragment.appendChild(row);
        });
      });
      host.appendChild(fragment);
    } finally {
      applying = false;
      observeHost(host);
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
    observeHost(host);
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
    groupedByMonth: true,
    stablePointerClicks: true,
    today: localTodayKey()
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
})();
