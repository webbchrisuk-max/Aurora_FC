(() => {
  'use strict';

  const BUILD = '20260823-finance-pots-bills-dashboard-1';
  const STATE_KEY = 'aurora2:state:v1';
  const VIEWS = ['summary','pots','bills','actions'];
  let started = false;
  let monthObserver = null;
  let monthScheduled = 0;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = value => new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value) || 0);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = value => { const n = Number(value); return Number.isFinite(n) ? Math.max(0,n) : 0; };
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function readState() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {};
      return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
    } catch (_) { return {}; }
  }

  function parseDate(value) {
    const raw = String(value || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function today() { const d = new Date(); d.setHours(12,0,0,0); return d; }

  function nextPayday(plan) {
    let d = parseDate(plan?.paydayDate);
    if (!d) return null;
    const now = today();
    let guard = 0;
    while (d < now && guard++ < 30) d.setDate(d.getDate() + 28);
    return d;
  }

  function humanDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    return d ? d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}) : 'No date';
  }

  function activeBills(s) {
    return Array.isArray(s?.finance?.bills) ? s.finance.bills.filter(b => !b.archived && !b.paid && b.included !== false) : [];
  }

  function activePots(s) {
    return Array.isArray(s?.finance?.pots) ? s.finance.pots.filter(p => !p.archived) : [];
  }

  function billDueBeforePayday(bill, payday) {
    if (!payday) return false;
    const due = parseDate(bill?.due);
    if (due) return due <= payday;
    const month = String(bill?.occurrenceMonth || '');
    if (/^\d{4}-\d{2}$/.test(month)) return month <= `${payday.getFullYear()}-${String(payday.getMonth()+1).padStart(2,'0')}`;
    return false;
  }

  function installStyles() {
    if (document.getElementById('financePotsBillsDashboardStyle')) return;
    const style = document.createElement('style');
    style.id = 'financePotsBillsDashboardStyle';
    style.textContent = `
      #potsPanel.aurora-pb-dashboard{--pb-line:rgba(110,231,255,.14);--pb-panel:rgba(5,16,29,.82)}
      .pb-subnav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:14px 0;position:sticky;top:146px;z-index:7;padding:8px;border:1px solid var(--pb-line);border-radius:17px;background:rgba(2,9,19,.94);backdrop-filter:blur(14px)}
      .pb-subnav button{min-height:58px;border:1px solid transparent;border-radius:12px;background:transparent;color:#7893a7;text-align:left;padding:10px 12px;cursor:pointer}
      .pb-subnav button strong{display:block;color:#dcecf7;font:850 12px/1.15 system-ui}.pb-subnav button span{display:block;margin-top:5px;font:650 9px/1.2 system-ui}
      .pb-subnav button.active{border-color:rgba(110,231,255,.25);background:linear-gradient(145deg,rgba(13,42,59,.9),rgba(5,18,31,.88));color:#9feeff;box-shadow:0 9px 28px rgba(0,0,0,.18)}
      .pb-view[hidden]{display:none!important}.pb-view{animation:pbIn .18s ease}.pb-view>.finance-panel:first-child{margin-top:0}
      @keyframes pbIn{from{opacity:.35;transform:translateY(4px)}to{opacity:1;transform:none}}
      .pb-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}
      .pb-summary-card{border:1px solid var(--pb-line);border-radius:16px;padding:15px;background:linear-gradient(145deg,rgba(9,26,42,.92),rgba(4,13,25,.92))}
      .pb-summary-card small{display:block;color:#728ca1;font:800 9px/1.2 system-ui;text-transform:uppercase;letter-spacing:.08em}.pb-summary-card strong{display:block;margin-top:8px;color:#eef8ff;font:900 22px/1 system-ui}.pb-summary-card span{display:block;margin-top:6px;color:#7790a4;font:650 9px/1.35 system-ui}
      .pb-view-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:3px 0 13px}.pb-view-head h3{margin:4px 0 0;font:900 27px/1 system-ui}.pb-view-head p{max-width:520px;margin:0;color:#7891a5;font:600 10px/1.45 system-ui;text-align:right}
      .pb-next-payday{display:grid;gap:8px}.pb-payday-bill{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:11px;align-items:center;padding:12px 13px;border:1px solid rgba(110,231,255,.11);border-radius:13px;background:rgba(4,16,28,.62)}
      .pb-payday-bill>i{font-style:normal;width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:rgba(110,231,255,.08);color:#8eeeff;font:900 10px system-ui}.pb-payday-bill strong{display:block;color:#ecf8ff;font:850 12px/1.2 system-ui}.pb-payday-bill span{display:block;margin-top:4px;color:#7890a2;font:650 9px/1.3 system-ui}.pb-payday-bill>b{color:#eaf8ff;font:900 13px system-ui}.pb-payday-bill.overdue{border-color:rgba(255,88,105,.28);background:rgba(68,11,21,.18)}.pb-payday-bill.overdue>i{background:rgba(255,88,105,.1);color:#ff8b96}
      .pb-ledger-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:16px 0 8px}.pb-ledger-head strong{font:900 14px system-ui}.pb-ledger-head span{color:#7890a4;font:650 9px system-ui}
      #financeBillActionList .finance-managed-month{cursor:pointer!important;user-select:none;position:relative;padding-right:42px!important}
      #financeBillActionList .finance-managed-month:after{content:'+';position:absolute;right:14px;top:50%;transform:translateY(-50%);width:22px;height:22px;display:grid;place-items:center;border-radius:7px;border:1px solid rgba(110,231,255,.16);color:#99edff;font:900 14px system-ui;background:rgba(110,231,255,.04)}
      #financeBillActionList .finance-managed-month.pb-open:after{content:'−'}
      #financeBillActionList .finance-action-row.pb-month-hidden{display:none!important}
      #financePotProgressDashboard{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px!important}
      #financePotProgressDashboard .finance-progress-pot{margin:0!important;min-width:0}
      #financePotActionList{margin-top:12px}.pb-actions-shell .finance-actions-toolbar{margin-top:0}.pb-actions-shell .finance-actions-grid{margin-top:12px}
      .pb-empty{padding:22px;border:1px dashed rgba(110,231,255,.16);border-radius:14px;color:#7891a5;text-align:center;font:650 10px/1.5 system-ui;background:rgba(4,16,28,.35)}
      @media(max-width:980px){.pb-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#financePotProgressDashboard{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:720px){.pb-subnav{grid-template-columns:repeat(2,minmax(0,1fr));top:132px}.pb-view-head{align-items:start;flex-direction:column}.pb-view-head p{text-align:left}.pb-payday-bill{grid-template-columns:36px minmax(0,1fr);}.pb-payday-bill>b{grid-column:2}.pb-summary-grid,#financePotProgressDashboard{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function createShell(panel) {
    if (q('#financePotsBillsDashboard', panel)) return q('#financePotsBillsDashboard', panel);
    const shell = document.createElement('div');
    shell.id = 'financePotsBillsDashboard';
    shell.innerHTML = `
      <nav class="pb-subnav" aria-label="Pots and Bills sections">
        <button type="button" data-pb-view="summary" class="active"><strong>Overview</strong><span>Money position</span></button>
        <button type="button" data-pb-view="pots"><strong>Pots</strong><span>Progress & funding</span></button>
        <button type="button" data-pb-view="bills"><strong>Bills</strong><span>Next payday & monthly</span></button>
        <button type="button" data-pb-view="actions"><strong>Finance Actions</strong><span>Add & edit</span></button>
      </nav>
      <section class="pb-view" data-pb-pane="summary"><div id="pbSummaryMount"></div></section>
      <section class="pb-view" data-pb-pane="pots" hidden><div class="pb-view-head"><div><span class="finance-panel-kicker">Protected Savings</span><h3>Pot Control</h3></div><p>See the position first. Open Finance Actions only when you need to add or change a pot.</p></div><div id="pbPotsMount"></div></section>
      <section class="pb-view" data-pb-pane="bills" hidden><div class="pb-view-head"><div><span class="finance-panel-kicker">Commitment Schedule</span><h3>Bills Control</h3></div><p>The important commitments before payday are kept at the top. The full ledger stays grouped by month underneath.</p></div><div id="pbNextPaydayMount"></div><div id="pbBillsMount"></div></section>
      <section class="pb-view pb-actions-shell" data-pb-pane="actions" hidden><div class="pb-view-head"><div><span class="finance-panel-kicker">Controlled Writes</span><h3>Finance Actions</h3></div><p>Add, edit, archive and undo from one place. Existing backed-up Finance write protections remain in force.</p></div><div id="pbActionsMount"></div></section>`;
    panel.insertBefore(shell, panel.firstChild);
    return shell;
  }

  function moveExistingContent(panel) {
    const shell = q('#financePotsBillsDashboard', panel);
    if (!shell) return false;
    const summaryMount = q('#pbSummaryMount', shell);
    const potsMount = q('#pbPotsMount', shell);
    const billsMount = q('#pbBillsMount', shell);
    const actionsMount = q('#pbActionsMount', shell);
    const nextMount = q('#pbNextPaydayMount', shell);

    const scoreboard = q(':scope > .finance-scoreboard', panel);
    if (scoreboard && scoreboard.parentElement !== summaryMount) summaryMount.appendChild(scoreboard);

    const progress = q('#financePotProgressDashboard');
    if (progress) {
      const potPanel = progress.closest('.finance-panel');
      if (potPanel && potPanel.parentElement !== potsMount) potsMount.appendChild(potPanel);
    }

    const upcoming = q('#financeNextFiveBills');
    if (upcoming) {
      const billPanel = upcoming.closest('.finance-panel');
      if (billPanel && billPanel.parentElement !== billsMount) billsMount.appendChild(billPanel);
      const head = q('.finance-panel-head', billPanel);
      if (head) head.style.display = 'none';
      const nextFive = q('#financeNextFiveBills', billPanel);
      if (nextFive) nextFive.style.display = 'none';
    }

    const actionSection = q('#financePotsBillsActions');
    if (actionSection) {
      const toolbar = q('.finance-actions-toolbar', actionSection);
      const editors = q('.finance-actions-grid', actionSection);
      const potList = q('#financePotActionList', actionSection);
      const billList = q('#financeBillActionList', actionSection);
      const status = q('#financePotsBillsActionStatus', actionSection);
      if (toolbar && toolbar.parentElement !== actionsMount) actionsMount.appendChild(toolbar);
      if (editors && editors.parentElement !== actionsMount) actionsMount.appendChild(editors);
      if (status && status.parentElement !== actionsMount) actionsMount.appendChild(status);
      if (potList && potList.parentElement !== potsMount) potsMount.appendChild(potList);
      if (billList && billList.parentElement !== billsMount) {
        const ledgerHead = document.createElement('div');
        ledgerHead.className = 'pb-ledger-head';
        ledgerHead.innerHTML = '<strong>Monthly bill ledger</strong><span>Tap a month to expand</span>';
        billsMount.appendChild(ledgerHead);
        billsMount.appendChild(billList);
      }
      if (!actionSection.children.length) actionSection.remove();
      else actionSection.style.display = 'none';
    }

    qa(':scope > .finance-panel', panel).forEach(extra => {
      if (extra.id === 'financePotsBillsActions') return;
      if (!extra.closest('#financePotsBillsDashboard')) extra.style.display = 'none';
    });

    if (!q('#pbSummaryCards', summaryMount)) {
      const cards = document.createElement('div');
      cards.id = 'pbSummaryCards';
      cards.className = 'pb-summary-grid';
      summaryMount.appendChild(cards);
    }
    if (!q('#pbNextPayday', nextMount)) {
      const block = document.createElement('article');
      block.className = 'finance-panel';
      block.innerHTML = `<div class="finance-panel-head"><div><span class="finance-panel-kicker">Priority Commitments</span><h3>Due Before Next Payday</h3></div><span class="rule-chip green" id="pbPaydayBillChip">CHECKING</span></div><div id="pbNextPayday" class="pb-next-payday"></div>`;
      nextMount.appendChild(block);
    }
    return Boolean(progress && q('#financeBillActionList') && q('.finance-actions-toolbar'));
  }

  function renderSummary(s) {
    const pots = activePots(s);
    const bills = activeBills(s);
    const payday = nextPayday(s?.finance?.plan || {});
    const before = bills.filter(b => billDueBeforePayday(b,payday));
    const dueTotal = before.reduce((sum,b)=>sum+num(b.amount),0);
    const potCash = pots.reduce((sum,p)=>sum+num(p.balance),0);
    const potFunding = pots.reduce((sum,p)=>sum+num(p.fundingRequired || p.fundingOverride || p.fundingPerPayday),0);
    const overdue = bills.filter(b => { const d=parseDate(b.due); return d && d < today(); }).length;
    const host = q('#pbSummaryCards');
    if (!host) return;
    host.innerHTML = `
      <div class="pb-summary-card"><small>Active pots</small><strong>${pots.length}</strong><span>${money(potCash)} held across Finance pots</span></div>
      <div class="pb-summary-card"><small>Next payday funding</small><strong>${money(potFunding)}</strong><span>Current planned pot funding</span></div>
      <div class="pb-summary-card"><small>Bills before payday</small><strong>${before.length}</strong><span>${money(dueTotal)} due${payday?` by ${esc(humanDate(payday))}`:''}</span></div>
      <div class="pb-summary-card"><small>Attention</small><strong class="${overdue?'bad':'good'}">${overdue ? `${overdue} OVERDUE` : 'CLEAR'}</strong><span>${bills.length} active unpaid bill${bills.length===1?'':'s'} overall</span></div>`;
  }

  function renderNextPayday(s) {
    const payday = nextPayday(s?.finance?.plan || {});
    const bills = activeBills(s)
      .filter(b => billDueBeforePayday(b,payday))
      .sort((a,b) => (parseDate(a.due)?.getTime() || Number.MAX_SAFE_INTEGER) - (parseDate(b.due)?.getTime() || Number.MAX_SAFE_INTEGER));
    const host = q('#pbNextPayday');
    const chip = q('#pbPaydayBillChip');
    if (!host) return;
    const total = bills.reduce((sum,b)=>sum+num(b.amount),0);
    if (chip) chip.textContent = payday ? `${bills.length} • ${money(total)}` : 'PAYDAY NOT SET';
    if (!payday) { host.innerHTML = '<div class="pb-empty">Set the payday date in Payday Control to create the next-payday bill window.</div>'; return; }
    if (!bills.length) { host.innerHTML = `<div class="pb-empty">No active bills are due before ${esc(humanDate(payday))}.</div>`; return; }
    const now = today();
    host.innerHTML = bills.map((b,index) => {
      const due = parseDate(b.due);
      const overdue = Boolean(due && due < now);
      return `<div class="pb-payday-bill ${overdue?'overdue':''}"><i>${String(index+1).padStart(2,'0')}</i><div><strong>${esc(b.name || 'Untitled bill')}</strong><span>${due?esc(humanDate(due)):'This payday cycle'} • ${esc(b.fundingSource || 'Current Account')}${overdue?' • OVERDUE':''}</span></div><b>${money(b.amount)}</b></div>`;
    }).join('');
  }

  function setView(view) {
    view = VIEWS.includes(view) ? view : 'summary';
    qa('[data-pb-view]').forEach(btn => {
      const active = btn.dataset.pbView === view;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });
    qa('[data-pb-pane]').forEach(pane => pane.hidden = pane.dataset.pbPane !== view);
    const panel = q('#potsPanel');
    if (panel) panel.dataset.pbView = view;
    if (view === 'bills') setTimeout(scheduleMonthCollapse,0);
  }

  function applyMonthCollapse() {
    const host = q('#financeBillActionList');
    if (!host) return;
    const children = [...host.children];
    let currentHeader = null;
    children.forEach(node => {
      if (node.classList.contains('finance-managed-month')) {
        currentHeader = node;
        if (!node.dataset.pbCollapseReady) {
          node.dataset.pbCollapseReady = '1';
          node.classList.remove('pb-open');
          node.setAttribute('role','button');
          node.setAttribute('tabindex','0');
          node.setAttribute('aria-expanded','false');
        }
        return;
      }
      if (node.classList.contains('finance-action-row') && currentHeader) {
        node.classList.toggle('pb-month-hidden', !currentHeader.classList.contains('pb-open'));
      }
    });
  }

  function scheduleMonthCollapse() {
    cancelAnimationFrame(monthScheduled);
    monthScheduled = requestAnimationFrame(applyMonthCollapse);
  }

  function toggleMonth(header) {
    if (!header?.classList.contains('finance-managed-month')) return;
    const open = !header.classList.contains('pb-open');
    header.classList.toggle('pb-open',open);
    header.setAttribute('aria-expanded',open?'true':'false');
    let node = header.nextElementSibling;
    while (node && !node.classList.contains('finance-managed-month')) {
      if (node.classList.contains('finance-action-row')) node.classList.toggle('pb-month-hidden',!open);
      node = node.nextElementSibling;
    }
  }

  function render() {
    const s = readState();
    if (!s?.finance) return;
    renderSummary(s);
    renderNextPayday(s);
    scheduleMonthCollapse();
  }

  function bind() {
    document.addEventListener('click', event => {
      const sub = event.target.closest('[data-pb-view]');
      if (sub) { event.preventDefault(); setView(sub.dataset.pbView); return; }
      const month = event.target.closest('#financeBillActionList .finance-managed-month');
      if (month) { event.preventDefault(); toggleMonth(month); }
    }, true);
    document.addEventListener('keydown', event => {
      const month = event.target.closest?.('#financeBillActionList .finance-managed-month');
      if (month && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleMonth(month); }
    });
    window.addEventListener('aurora2:state', () => setTimeout(render,0));
    window.addEventListener('focus', () => setTimeout(render,0));
  }

  function observeMonths() {
    const host = q('#financeBillActionList');
    if (!host) return;
    if (!monthObserver) monthObserver = new MutationObserver(scheduleMonthCollapse);
    monthObserver.disconnect();
    monthObserver.observe(host,{childList:true});
  }

  function start() {
    if (started) return;
    installStyles();
    const panel = q('#potsPanel');
    if (!panel) { setTimeout(start,50); return; }
    panel.classList.add('aurora-pb-dashboard');
    createShell(panel);

    let tries = 0;
    const wait = () => {
      const ready = moveExistingContent(panel);
      if (ready) {
        started = true;
        bind();
        observeMonths();
        setView('summary');
        render();
        window.AuroraFinancePotsBillsDashboard = Object.freeze({ build:BUILD, ready:true, show:setView, render });
        return;
      }
      tries += 1;
      if (tries < 600) setTimeout(wait,25);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
