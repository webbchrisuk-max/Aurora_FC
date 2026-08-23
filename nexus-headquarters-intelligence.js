(() => {
  'use strict';

  const BUILD = '20260823-nexus-headquarters-intelligence-1';
  const STATE_KEY = 'aurora2:state:v1';
  const INCOME_SUMMARY_KEY = 'aurora2:income:summary:v1';
  const INCOME_CALENDAR_KEY = 'aurora2:income:calendar-local:v1';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED','CONFIRMED']);

  const arr = value => Array.isArray(value) ? value : [];
  const upper = value => String(value || '').trim().toUpperCase();
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2 }).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function readJson(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }

  function state() {
    return readJson(STATE_KEY, {}) || {};
  }

  function dateKey(value) {
    const text = String(value || '').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function formatDate(value) {
    const key = dateKey(value);
    if (!key) return 'Not dated';
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y,m-1,d,12).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  }

  function activeBill(bill) {
    return !bill?.archived && !bill?.paid && bill?.included !== false;
  }

  function nextBill(s) {
    return arr(s?.finance?.bills)
      .filter(activeBill)
      .map(b => ({...b,_date:dateKey(b?.due)}))
      .filter(b => b._date)
      .sort((a,b) => a._date.localeCompare(b._date))[0] || null;
  }

  function billAttention(s) {
    const today = todayKey();
    const active = arr(s?.finance?.bills).filter(activeBill);
    const due = active.filter(b => dateKey(b?.due) && dateKey(b.due) <= today);
    const overdue = due.filter(b => dateKey(b.due) < today);
    if (overdue.length) return { tone:'bad', icon:'🔴', title:`${overdue.length} overdue bill${overdue.length===1?'':'s'}`, detail:'Finance has bills waiting to be completed.', href:'finance.html#potsPanel' };
    const todayBills = due.filter(b => dateKey(b.due) === today);
    if (todayBills.length) return { tone:'bad', icon:'🔴', title:`${todayBills.length} bill${todayBills.length===1?'':'s'} due today`, detail:'Complete today’s payments in Finance.', href:'finance.html#potsPanel' };
    return { tone:'good', icon:'🟢', title:'Bills up to date', detail:'No active bill is overdue or due today.', href:'finance.html#potsPanel' };
  }

  function registrationAttention(s) {
    const drafts = arr(s?.transfer?.registrationDrafts);
    const pending = drafts.filter(row => !TERMINAL.has(upper(row?.status)));
    if (pending.length) return { tone:'warn', icon:'🟠', title:`${pending.length} registration${pending.length===1?'':'s'} pending`, detail:'Broker execution still needs confirmation.', href:'registration.html' };
    return { tone:'good', icon:'🟢', title:'Registration clear', detail:'No pending transfer registrations found.', href:'registration.html' };
  }

  function transferAttention(s) {
    const mission = s?.mission || {};
    const status = upper(mission?.status);
    const budget = Math.max(0,num(mission?.approvedBudget));
    if (budget > 0 && !['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(status)) {
      const remaining = Math.max(0,num(mission?.amountRemaining ?? budget - num(mission?.amountAllocated)));
      return { tone:'info', icon:'🔵', title:`Transfer mission ${status || 'ACTIVE'}`, detail:`${money(remaining)} remains in the current mission.`, href:'transfer.html' };
    }
    return { tone:'good', icon:'🟢', title:'No active transfer mission', detail:'Transfer has no released mission requiring action.', href:'transfer.html' };
  }

  function incomeAttention(s) {
    const cached = readJson(INCOME_SUMMARY_KEY,{}) || {};
    const annual = num(cached?.annualIncomeGbp ?? cached?.annualIncome ?? cached?.annual);
    const dated = arr(readJson(INCOME_CALENDAR_KEY,[])).filter(e => dateKey(e?.payDate || e?.pay_date)).length + arr(s?.income?.calendar).filter(e => dateKey(e?.payDate || e?.pay_date)).length;
    if (annual > 0 && dated < 8) return { tone:'warn', icon:'🟠', title:'Dividend calendar needs dates', detail:`Only ${dated} dated dividend event${dated===1?'':'s'} currently feed the runway.`, href:'income.html' };
    return { tone:'good', icon:'🟢', title:'Income engine active', detail: annual > 0 ? `${money(annual)}/year forward income is being tracked.` : 'Income Centre is available for the latest run-rate.', href:'income.html' };
  }

  function nextDividend(s) {
    const cached = readJson(INCOME_SUMMARY_KEY,{}) || {};
    const c = cached?.nextDividend || cached?.next;
    if (c) return c;
    const events = [...arr(s?.income?.calendar), ...arr(readJson(INCOME_CALENDAR_KEY,[]))]
      .filter(e => dateKey(e?.payDate || e?.pay_date) && dateKey(e?.payDate || e?.pay_date) >= todayKey())
      .sort((a,b) => dateKey(a?.payDate || a?.pay_date).localeCompare(dateKey(b?.payDate || b?.pay_date)));
    return events[0] || null;
  }

  function setText(id,value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderAttention(items) {
    const host = document.getElementById('nxAttentionGrid');
    if (!host) return;
    host.innerHTML = items.map(item => `
      <a class="nx-command-card nx-attention-card" href="${esc(item.href)}" data-tone="${esc(item.tone)}">
        <div class="icon">${item.icon}</div>
        <small>MANAGER ATTENTION</small>
        <strong>${esc(item.title)}</strong>
        <span>${esc(item.detail)}</span>
        <b>OPEN DEPARTMENT →</b>
      </a>`).join('');
  }

  function render() {
    const s = state();
    renderAttention([billAttention(s), registrationAttention(s), transferAttention(s), incomeAttention(s)]);

    const bill = nextBill(s);
    setText('nxComingBill', bill ? `${bill.name || 'Bill'} • ${money(bill.amount)}` : 'No dated bill');
    setText('nxComingBillMeta', bill ? formatDate(bill.due) : 'Finance');

    const div = nextDividend(s);
    const divTicker = String(div?.ticker || div?.name || 'Dividend');
    const divAmount = num(div?.amountGbp ?? div?.amount ?? div?.value);
    setText('nxComingDividend', div ? `${divTicker}${divAmount ? ` • ${money(divAmount)}` : ''}` : 'No dated dividend');
    setText('nxComingDividendMeta', div ? formatDate(div?.payDate || div?.pay_date) : 'Income');

    const payday = s?.finance?.plan?.paydayDate || '';
    setText('nxComingPayday', payday ? formatDate(payday) : 'Not set');
    setText('nxComingPaydayMeta', 'Finance payday');

    const mission = s?.mission || {};
    const missionStatus = upper(mission?.status);
    setText('nxComingTransfer', num(mission?.approvedBudget) > 0 && !['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(missionStatus) ? (missionStatus || 'ACTIVE') : 'No active mission');
    setText('nxComingTransferMeta', num(mission?.approvedBudget) > 0 ? `${money(mission?.amountRemaining ?? mission?.approvedBudget)} remaining` : 'Transfer');

    const now = new Date();
    const reportText = now.getHours() >= 17 ? 'Latest report' : '5:00 PM today';
    setText('nxComingReport', reportText);
    setText('nxComingReportMeta', 'Match Report');
  }

  window.AuroraNexusHeadquartersIntelligence = Object.freeze({ build:BUILD, render });
  window.addEventListener('aurora2:state', render);
  window.addEventListener('storage', event => { if (event.key === STATE_KEY) render(); });
  window.addEventListener('focus', render);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once:true}); else render();
})();