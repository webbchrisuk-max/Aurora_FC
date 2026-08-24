(() => {
  'use strict';

  const BUILD = '20260824-finance-workspace-refresh-1';
  const STATE_KEY = 'aurora2:state:v1';
  let lastSignature = '';

  if (window.__AuroraFinanceWorkspaceRefresh === BUILD) return;
  window.__AuroraFinanceWorkspaceRefresh = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function readState() {
    try { if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {}; } catch (_) {}
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function parseDate(value) {
    const raw = String(value || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function today() { const d = new Date(); d.setHours(12,0,0,0); return d; }
  function humanDate(value) {
    const d = parseDate(value);
    if (d) return d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
    const month = String(value || '').slice(0,7);
    return /^\d{4}-\d{2}$/.test(month) ? month : 'No date';
  }
  function nextPayday(plan) {
    let d = parseDate(plan?.paydayDate);
    if (!d) return null;
    const now = today();
    let guard = 0;
    while (d < now && guard++ < 30) d.setDate(d.getDate() + 28);
    return d;
  }
  function beforePayday(bill, payday) {
    if (!payday) return false;
    const due = parseDate(bill?.due);
    if (due) return due <= payday;
    const month = String(bill?.occurrenceMonth || '');
    return /^\d{4}-\d{2}$/.test(month) && month <= payday.toISOString().slice(0,7);
  }
  function activeBills(state) { return arr(state?.finance?.bills).filter(b => !b?.archived && !b?.paid && b?.included !== false); }
  function activePots(state) { return arr(state?.finance?.pots).filter(p => !p?.archived); }
  function preview(state) {
    const publicPreview = window.AuroraFinancePaydayPreview || {};
    const plan = publicPreview?.draftPlan || state?.finance?.plan || {};
    try {
      const fn = window.Aurora2?.financePaydayControl?.paydayFundingPreview;
      const result = typeof fn === 'function' ? fn(state, plan) : null;
      if (result?.c) return result.c;
    } catch (_) {}
    return {plan,auto:{},safeSurplus:num(publicPreview?.safeSurplus),fundingPlan:state?.finance?.fundingPolicy?.lastPlan || {}};
  }

  function installStyles() {
    if (document.getElementById('financeWorkspaceRefreshStyle')) return;
    const style = document.createElement('style');
    style.id = 'financeWorkspaceRefreshStyle';
    style.textContent = `
      #foOverviewPrimary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:12px}#foOverviewPrimary .finance-panel{margin:0}
      #financeOverviewPayments.fo-compact-payday{padding:17px 19px;margin:0 0 13px}#financeOverviewPayments.fo-compact-payday .finance-panel-head h3{font-size:20px}#financeOverviewPayments.fo-compact-payday .fu-row{padding:6px 0}#financeOverviewPayments .fo-paid-from-pot{opacity:.82}#financeOverviewPayments .fo-paid-from-pot strong{color:#8da8b8}#financeOverviewPayments .fo-cash-total strong{color:#a9ffc7}
      #financeOverviewPayments .fo-explain{margin-top:10px;padding:9px 11px;border-left:3px solid #6ee7ff;border-radius:0 9px 9px 0;background:rgba(110,231,255,.04);color:#86a0b0;font:650 9px/1.45 system-ui}
      #potsPanel .fu-pb-nav,#potsPanel>.fu-pb>.fu-pane{display:none!important}#financeUnifiedPotsBills{display:grid;gap:14px}
      .fpb-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.fpb-card{border:1px solid rgba(110,231,255,.13);border-radius:18px;padding:17px;background:linear-gradient(180deg,rgba(7,23,39,.96),rgba(3,12,24,.98))}.fpb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.fpb-head h3{margin:4px 0 0;font:900 23px/1.05 system-ui}.fpb-kicker{display:block;color:#72dff4;font:850 9px/1.2 system-ui;letter-spacing:.12em;text-transform:uppercase}.fpb-chip{border:1px solid rgba(99,245,162,.24);border-radius:999px;padding:7px 9px;color:#a9ffc7;background:rgba(99,245,162,.05);font:900 8px/1 system-ui;white-space:nowrap}.fpb-mini{border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:12px;background:rgba(0,0,0,.13)}.fpb-mini small{display:block;color:#72899d;font:800 8px system-ui;text-transform:uppercase;letter-spacing:.07em}.fpb-mini strong{display:block;margin-top:6px;font:900 18px system-ui}.fpb-mini span{display:block;margin-top:5px;color:#748da1;font:650 9px/1.3 system-ui}
      .fpb-pot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.fpb-pot{border:1px solid rgba(255,255,255,.07);border-radius:15px;padding:14px;background:rgba(0,0,0,.12)}.fpb-pot-top{display:flex;justify-content:space-between;gap:10px}.fpb-pot h4{margin:0;font:900 15px system-ui}.fpb-pot-meta{margin-top:5px;color:#7890a1;font:650 9px/1.45 system-ui}.fpb-track{height:7px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.07);margin:11px 0 7px}.fpb-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#6ee7ff,#8cf7be)}.fpb-pot-foot{display:flex;justify-content:space-between;gap:10px;color:#8096a6;font:700 9px system-ui}.fpb-status{font:900 9px system-ui}.fpb-status.good{color:#9af7bb}.fpb-status.warn{color:#ffd26b}
      .fpb-bill{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.055)}.fpb-bill:last-child{border-bottom:0}.fpb-bill b{font:850 11px system-ui}.fpb-bill span{display:block;margin-top:4px;color:#758da0;font:650 9px/1.35 system-ui}.fpb-bill>strong{font:900 11px system-ui;white-space:nowrap}.fpb-bill.overdue b{color:#ffabb3}.fpb-actions{display:flex;gap:6px;flex-wrap:wrap}.fpb-btn{appearance:none;border:1px solid rgba(110,231,255,.22);border-radius:9px;background:rgba(110,231,255,.05);color:#d9f8ff;padding:8px 10px;font:850 9px/1 system-ui;cursor:pointer}.fpb-btn.primary{border-color:rgba(99,245,162,.28);color:#a9ffc7;background:rgba(99,245,162,.06)}.fpb-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.fpb-management{margin-top:10px}.fpb-management>summary{cursor:pointer;list-style:none;border:1px solid rgba(110,231,255,.12);border-radius:11px;padding:10px 12px;color:#ccecf7;font:850 10px system-ui;background:rgba(5,17,30,.66)}.fpb-management>summary::-webkit-details-marker{display:none}
      @media(max-width:900px){#foOverviewPrimary{grid-template-columns:1fr}.fpb-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.fpb-pot-grid{grid-template-columns:1fr}}@media(max-width:650px){.fpb-summary{grid-template-columns:1fr}.fpb-bill{grid-template-columns:1fr auto}.fpb-actions{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function arrangeOverview() {
    const overview = document.getElementById('overviewPanel');
    if (!overview) return;
    let primary = document.getElementById('foOverviewPrimary');
    if (!primary) {
      primary = document.createElement('section');
      primary.id = 'foOverviewPrimary';
      overview.prepend(primary);
    }
    const mission = overview.querySelector('.mission-panel');
    const readiness = overview.querySelector('.readiness-panel');
    [mission,readiness].filter(Boolean).forEach(node => { if (node.parentElement !== primary) primary.appendChild(node); });
    const allocation = document.getElementById('financeOverviewPayments');
    if (allocation) {
      allocation.classList.add('fo-compact-payday');
      if (allocation.previousElementSibling !== primary) primary.insertAdjacentElement('afterend', allocation);
    }
    overview.querySelectorAll('.finance-command-grid.two').forEach(grid => { if (!grid.querySelector(':scope > *')) grid.remove(); });
  }

  function renderOverviewAllocation() {
    const host = document.getElementById('financeOverviewPayments');
    if (!host) return;
    const state = readState();
    const c = preview(state) || {};
    const plan = c?.plan || state?.finance?.plan || {};
    const auto = c?.auto || {};
    const payday = nextPayday(plan);
    const dueBills = activeBills(state).filter(b => beforePayday(b,payday));
    const currentBills = dueBills.filter(b => norm(b?.fundingSource || 'Current Account') === 'current account').reduce((s,b)=>s+num(b?.amount),0);
    const holdingPotBills = dueBills.filter(b => norm(b?.fundingSource) === 'holding pot').reduce((s,b)=>s+num(b?.amount),0);
    const otherPotBills = dueBills.filter(b => !['current account','holding pot'].includes(norm(b?.fundingSource || 'Current Account'))).reduce((s,b)=>s+num(b?.amount),0);
    const holdingMove = num(auto?.annualHoldingContribution) + num(auto?.holdingTopUp);
    const fundingPlan = c?.fundingPlan || state?.finance?.fundingPolicy?.lastPlan || {};
    const potRows = arr(fundingPlan?.rows).filter(r => num(r?.amount) > .009 && norm(r?.name) !== 'holding pot');
    const goalPotFunding = potRows.length ? potRows.reduce((s,r)=>s+num(r?.amount),0) : num(auto?.potsDue);
    const protectedSpending = num(plan?.protectedCash);
    const otherPlanned = num(plan?.otherPlanned);
    const plannedRelease = num(plan?.releaseAmount);
    const cashRequired = holdingMove + goalPotFunding + currentBills + protectedSpending + otherPlanned;
    const potFundedBills = holdingPotBills + otherPotBills;

    const label = host.querySelector('[data-fu-overview-payday]');
    if (label) label.textContent = payday ? `Payday ${humanDate(payday.toISOString().slice(0,10))}` : 'Payday not dated';
    const payments = host.querySelector('[data-fu-overview-payments]');
    if (!payments) return;
    const rows = [
      ['Holding Pot funding',holdingMove,'13-pay contribution + safety top-up',''],
      ['Goal Pot funding',goalPotFunding,'Protected moves into active goal pots',''],
      ['Current Account bills',currentBills,'Bills that need payday/current-account cash',''],
      ['Bills paid from Holding Pot',holdingPotBills,'Already funded inside Holding Pot — not deducted again','fo-paid-from-pot'],
      ['Bills paid from other pots',otherPotBills,'Already funded inside their named pots — not deducted again','fo-paid-from-pot'],
      ['Protected spending',protectedSpending,'Personal spending kept aside',''],
      ['Other planned spending',otherPlanned,'Other payday commitments','']
    ];
    payments.innerHTML = rows.map(([name,value,note,cls]) => `<div class="fu-row ${cls}"><div><b>${esc(name)}</b><span>${esc(note)}</span></div><strong>${money(value)}</strong></div>`).join('') +
      `<div class="fu-row fu-overview-total fo-cash-total"><div><b>Cash required from this payday</b><span>Only new cash that must be protected before Transfer</span></div><strong>${money(cashRequired)}</strong></div>` +
      `<div class="fu-row"><div><b>Already-funded pot bills</b><span>Shown for visibility only; this ${money(potFundedBills)} is not added again to payday cash required</span></div><strong>${money(potFundedBills)}</strong></div>` +
      `<div class="fu-row"><div><b>Safe Release to Transfer</b><span>Investment mission amount after protected commitments</span></div><strong class="fu-overview-release">${money(plannedRelease)}</strong></div>` +
      `<div class="fo-explain">The old “Bills from Other Pots” line grouped every non-current-account bill together, including Holding Pot bills, and the overview then added that figure into “Total protected / outgoing”. That made already-funded pot bills look like fresh payday cash. This view now separates them and excludes them from the payday cash-required total.</div>`;
  }

  function ensureUnifiedPotsBills() {
    const panel = document.getElementById('potsPanel');
    if (!panel) return null;
    let shell = document.getElementById('financeUnifiedPotsBills');
    if (shell) return shell;
    shell = document.createElement('section');
    shell.id = 'financeUnifiedPotsBills';
    shell.innerHTML = `
      <div class="fpb-summary" id="fpbSummary"></div>
      <section class="fpb-card"><div class="fpb-head"><div><span class="fpb-kicker">Protected Savings</span><h3>Pots</h3></div><span class="fpb-chip">LIVE PROGRESS</span></div><div class="fpb-pot-grid" id="fpbPots"></div></section>
      <section class="fpb-card"><div class="fpb-head"><div><span class="fpb-kicker">Commitments</span><h3>Bills</h3></div><span class="fpb-chip">MARK PAID HERE</span></div><div id="fpbBills"></div></section>
      <section class="fpb-card"><div class="fpb-head"><div><span class="fpb-kicker">Finance Actions</span><h3>Add, edit & undo</h3></div></div><div class="fpb-toolbar"><button class="fpb-btn primary" type="button" data-fpb-action="new-pot">+ Add Pot</button><button class="fpb-btn primary" type="button" data-fpb-action="new-bill">+ Add Bill</button><button class="fpb-btn" type="button" data-fpb-action="undo-payment">Undo Last Payment</button></div><details class="fpb-management"><summary>Open editors, archive & advanced controls</summary><div id="financeActionsMountStable"></div></details></section>`;
    panel.prepend(shell);
    return shell;
  }

  function moveActionAuthority() {
    const root = document.getElementById('financePotsBillsActions');
    const mount = document.getElementById('financeActionsMountStable');
    if (root && mount && root.parentElement !== mount) mount.appendChild(root);
  }

  function dueState(bill) {
    const due = parseDate(bill?.due);
    const now = today();
    if (due) {
      const days = Math.round((due.getTime()-now.getTime())/86400000);
      return {overdue:days<0,label:days<0?`Overdue ${Math.abs(days)}d`:days===0?'Due today':`Due in ${days}d`};
    }
    const month = String(bill?.occurrenceMonth || '');
    return {overdue:false,label:month ? `Due ${month}` : 'No date'};
  }

  function renderPotsBills() {
    const shell = ensureUnifiedPotsBills();
    if (!shell) return;
    moveActionAuthority();
    const state = readState();
    const pots = activePots(state);
    const bills = activeBills(state).sort((a,b) => {
      const ad = parseDate(a?.due)?.getTime() || Number.MAX_SAFE_INTEGER;
      const bd = parseDate(b?.due)?.getTime() || Number.MAX_SAFE_INTEGER;
      return ad-bd || String(a?.name||'').localeCompare(String(b?.name||''));
    });
    const p = preview(state) || {};
    const payday = nextPayday(p?.plan || state?.finance?.plan || {});
    const before = bills.filter(b => beforePayday(b,payday));
    const cash = pots.reduce((s,pot)=>s+num(pot?.balance),0);
    const target = pots.reduce((s,pot)=>s+num(pot?.target),0);
    const funded = pots.reduce((s,pot)=>s+num(pot?.balance)+(pot?.goalMode==='funded-progress'?num(pot?.spent):0),0);
    const gap = pots.reduce((s,pot)=>s+Math.max(0,num(pot?.target)-(num(pot?.balance)+(pot?.goalMode==='funded-progress'?num(pot?.spent):0))),0);
    const due = before.reduce((s,b)=>s+num(b?.amount),0);

    const summary = document.getElementById('fpbSummary');
    if (summary) summary.innerHTML = [
      ['Pot cash',money(cash),`${pots.length} active pots`],
      ['Funded progress',money(funded),target>0?`${money(gap)} still to fund`:'No combined target'],
      ['Bills before payday',money(due),payday?`Before ${humanDate(payday.toISOString().slice(0,10))}`:'Payday not dated'],
      ['Active bills',String(bills.length),`${bills.filter(b=>dueState(b).overdue).length} overdue`]
    ].map(([label,value,note])=>`<div class="fpb-mini"><small>${label}</small><strong>${value}</strong><span>${esc(note)}</span></div>`).join('');

    const potHost = document.getElementById('fpbPots');
    if (potHost) potHost.innerHTML = pots.length ? pots.map(pot => {
      const balance = num(pot?.balance), target = num(pot?.target), spent = pot?.goalMode==='funded-progress'?num(pot?.spent):0;
      const fundedAmount = balance + spent, gap = Math.max(0,target-fundedAmount);
      const pct = target > 0 ? Math.min(100,fundedAmount/target*100) : (balance>0?100:0);
      const next = num(pot?.fundingRequired || pot?.fundingOverride || pot?.fundingPerPayday);
      const status = target <= .009 ? 'PROTECTED' : gap <= .009 ? 'FUNDED' : next > .009 ? 'FUNDING' : 'NEEDS PLAN';
      const cls = status === 'NEEDS PLAN' ? 'warn' : 'good';
      return `<article class="fpb-pot"><div class="fpb-pot-top"><div><h4>${esc(pot?.name || 'Pot')}</h4><div class="fpb-pot-meta">${money(balance)} cash${spent>0?` • ${money(spent)} already spent`:''}${target>0?` • ${money(target)} target`:''}${pot?.deadline?` • ${esc(humanDate(pot.deadline))}`:''}</div></div><button class="fpb-btn" type="button" data-fpb-edit-pot="${esc(pot?.id)}">Edit</button></div><div class="fpb-track"><i style="width:${pct.toFixed(1)}%"></i></div><div class="fpb-pot-foot"><span>${target>0?`${pct.toFixed(0)}% • ${money(gap)} left`:'Protected cash balance'}</span><span class="fpb-status ${cls}">${status}</span></div>${next>0?`<div class="fpb-pot-meta">Next payday funding: <b>${money(next)}</b></div>`:''}</article>`;
    }).join('') : '<div class="fpb-mini"><strong>No active pots</strong><span>Add a pot below.</span></div>';

    const billHost = document.getElementById('fpbBills');
    if (billHost) billHost.innerHTML = bills.length ? bills.map(bill => {
      const d = dueState(bill);
      return `<div class="fpb-bill ${d.overdue?'overdue':''}"><div><b>${esc(bill?.name || 'Bill')}</b><span>${esc(d.label)}${bill?.due?` • ${esc(humanDate(bill.due))}`:''} • ${esc(bill?.fundingSource || 'Current Account')}</span></div><strong>${money(bill?.amount)}</strong><div class="fpb-actions"><button class="fpb-btn primary" type="button" data-fpb-pay-bill="${esc(bill?.id)}">Mark Paid</button><button class="fpb-btn" type="button" data-fpb-edit-bill="${esc(bill?.id)}">Edit</button></div></div>`;
    }).join('') : '<div class="fpb-mini"><strong>No unpaid bills</strong><span>Everything currently saved is paid, archived or excluded.</span></div>';
  }

  function revealManagement() {
    const details = document.querySelector('#financeUnifiedPotsBills .fpb-management');
    if (details) details.open = true;
  }
  function clickAuthority(selector) {
    const button = document.querySelector(`#financePotsBillsActions ${selector}`);
    if (!button) return false;
    revealManagement();
    button.click();
    return true;
  }

  function handleClick(event) {
    const action = event.target.closest('[data-fpb-action]');
    if (action) {
      const map = {'new-pot':'[data-action="new-pot"]','new-bill':'[data-action="new-bill"]','undo-payment':'[data-action="undo-payment"]'};
      clickAuthority(map[action.dataset.fpbAction]);
      return;
    }
    const pay = event.target.closest('[data-fpb-pay-bill]');
    if (pay) { clickAuthority(`[data-bill-complete="${CSS.escape(pay.dataset.fpbPayBill)}"]`); return; }
    const editBill = event.target.closest('[data-fpb-edit-bill]');
    if (editBill) { clickAuthority(`[data-bill-edit="${CSS.escape(editBill.dataset.fpbEditBill)}"]`); return; }
    const editPot = event.target.closest('[data-fpb-edit-pot]');
    if (editPot) { clickAuthority(`[data-pot-edit="${CSS.escape(editPot.dataset.fpbEditPot)}"]`); }
  }

  function render() {
    installStyles();
    arrangeOverview();
    renderOverviewAllocation();
    renderPotsBills();
    const state = readState();
    lastSignature = JSON.stringify({
      plan:state?.finance?.plan,
      bills:arr(state?.finance?.bills).map(x=>[x?.id,x?.amount,x?.due,x?.occurrenceMonth,x?.fundingSource,x?.paid,x?.archived]),
      pots:arr(state?.finance?.pots).map(x=>[x?.id,x?.balance,x?.target,x?.spent,x?.deadline,x?.fundingRequired,x?.fundingOverride,x?.archived])
    });
    window.AuroraFinanceWorkspaceRefresh = Object.freeze({build:BUILD,ready:true,overviewReordered:true,potsBillsUnified:true,potProgressBars:true,potFundedBillsExcludedFromPaydayCash:true,render});
    document.documentElement.dataset.financeWorkspaceRefresh = 'ready';
  }

  function schedule(delay=40) { clearTimeout(schedule.timer); schedule.timer=setTimeout(render,delay); }
  function boot() {
    document.addEventListener('click',handleClick,true);
    render();
    window.addEventListener('aurora2:state',()=>schedule(30));
    window.addEventListener('pageshow',()=>schedule(40));
    window.addEventListener('focus',()=>schedule(40));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(40);});
    [80,160,300,600,1200,2400,5000].forEach(delay=>setTimeout(render,delay));
    setInterval(()=>{
      const state = readState();
      const signature = JSON.stringify({plan:state?.finance?.plan,bills:arr(state?.finance?.bills).map(x=>[x?.id,x?.amount,x?.due,x?.fundingSource,x?.paid,x?.archived]),pots:arr(state?.finance?.pots).map(x=>[x?.id,x?.balance,x?.target,x?.spent,x?.archived])});
      if (signature !== lastSignature || !document.getElementById('financeUnifiedPotsBills')) render();
      else moveActionAuthority();
    },1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();