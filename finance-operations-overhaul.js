(() => {
  'use strict';

  const BUILD = '20260824-finance-operations-overhaul-1';
  const STATE_KEY = 'aurora2:state:v1';
  let lastSignature = '';

  if (window.__AuroraFinanceOperationsOverhaul === BUILD) return;
  window.__AuroraFinanceOperationsOverhaul = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function readState() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {};
    } catch (_) {}
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function dateValue(value) {
    const raw = String(value || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function humanDate(value) {
    const d = dateValue(value);
    return d ? d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}) : (String(value || '').slice(0,7) || 'No date');
  }

  function dueSort(row) {
    const d = dateValue(row?.due);
    if (d) return d.getTime();
    const month = String(row?.occurrenceMonth || '');
    if (/^\d{4}-\d{2}$/.test(month)) return new Date(`${month}-01T12:00:00`).getTime();
    return Number.MAX_SAFE_INTEGER;
  }

  function installStyles() {
    if (document.getElementById('financeOperationsOverhaulStyle')) return;
    const style = document.createElement('style');
    style.id = 'financeOperationsOverhaulStyle';
    style.textContent = `
      .fo-action{appearance:none;border:1px solid rgba(110,231,255,.24);border-radius:9px;background:rgba(110,231,255,.055);color:#d9f8ff;padding:7px 9px;font:850 9px/1 system-ui;cursor:pointer}.fo-action.primary{border-color:rgba(99,245,162,.3);background:rgba(99,245,162,.06);color:#a9ffc7}.fo-actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.fo-bill-row,.fo-pot-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.055)}.fo-bill-row:last-child,.fo-pot-row:last-child{border-bottom:0}.fo-bill-row b,.fo-pot-row b{display:block;font:850 11px system-ui}.fo-bill-row span,.fo-pot-row span{display:block;margin-top:4px;color:#758da0;font:650 9px/1.35 system-ui}.fo-bill-row>strong,.fo-pot-row>strong{font:900 11px system-ui;white-space:nowrap}.fo-overdue b{color:#ffabb3}.fo-section-note{margin:10px 0 0;padding:10px 12px;border-left:3px solid #6ee7ff;border-radius:0 10px 10px 0;background:rgba(110,231,255,.04);color:#8da8b8;font:650 10px/1.5 system-ui}.fo-restore-card{border:1px solid rgba(99,245,162,.16);border-radius:16px;padding:15px;background:rgba(99,245,162,.035);margin-top:12px}.fo-restore-card strong{display:block;color:#b7ffcf;font:900 13px system-ui}.fo-restore-card span{display:block;color:#819b8b;margin-top:5px;font:650 10px/1.45 system-ui}#financeActionsMountStable>#financePotsBillsActions{margin-top:0!important}#potsPanel details[data-fo-retired]{display:none!important}
      @media(max-width:700px){.fo-bill-row,.fo-pot-row{grid-template-columns:1fr auto}.fo-actions{grid-column:1/-1;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function protectActionAuthority() {
    const actionsView = document.querySelector('#potsPanel [data-fu-view="actions"]');
    const actionsMount = document.querySelector('#potsPanel [data-fu-actions-mount]');
    if (actionsMount) {
      actionsMount.removeAttribute('data-fu-actions-mount');
      actionsMount.id = 'financeActionsMountStable';
    }
    if (actionsView && !document.getElementById('financeActionsMountStable')) {
      const mount = document.createElement('div');
      mount.id = 'financeActionsMountStable';
      actionsView.appendChild(mount);
    }

    document.querySelectorAll('#potsPanel [data-fu-pot-mount],#potsPanel [data-fu-bill-mount]').forEach(mount => {
      mount.removeAttribute('data-fu-pot-mount');
      mount.removeAttribute('data-fu-bill-mount');
      const details = mount.closest('details');
      if (details) details.dataset.foRetired = '1';
    });

    const root = document.getElementById('financePotsBillsActions');
    const stable = document.getElementById('financeActionsMountStable');
    if (root && stable && root.parentElement !== stable) stable.appendChild(root);
  }

  function ensureHouseProjects() {
    if (window.AuroraFinanceHouseProjects?.ready || window.AuroraFinanceHouseProjectsLoadStarted) return;
    window.AuroraFinanceHouseProjectsLoadStarted = true;
    const script = document.createElement('script');
    script.src = 'finance-house-projects.js?v=20260824-finance-house-restore-1';
    script.async = false;
    document.head.appendChild(script);
  }

  function actionButton(selector) {
    return document.querySelector(`#financePotsBillsActions ${selector}`);
  }

  function forwardAction(selector, fallbackPane = 'actions') {
    const target = actionButton(selector);
    if (target) {
      target.click();
      return true;
    }
    const paneButton = document.querySelector(`#potsPanel [data-fu-pane="${fallbackPane}"]`);
    paneButton?.click();
    return false;
  }

  function renderBills() {
    const host = document.querySelector('#potsPanel [data-fu-bills-due]');
    if (!host) return;
    const state = readState();
    const bills = arr(state?.finance?.bills)
      .filter(row => !row?.archived && !row?.paid && row?.included !== false)
      .sort((a,b) => dueSort(a)-dueSort(b) || String(a?.name||'').localeCompare(String(b?.name||'')));
    const now = new Date(); now.setHours(12,0,0,0);
    host.innerHTML = bills.length ? bills.map(row => {
      const due = dateValue(row?.due);
      const overdue = Boolean(due && due < now);
      return `<div class="fo-bill-row ${overdue?'fo-overdue':''}"><div><b>${esc(row?.name || 'Bill')}</b><span>${overdue?'OVERDUE • ':''}${esc(humanDate(row?.due || row?.occurrenceMonth))} • ${esc(row?.fundingSource || 'Current Account')}</span></div><strong>${money(row?.amount)}</strong><div class="fo-actions"><button class="fo-action primary" type="button" data-fo-pay-bill="${esc(row?.id)}">Mark Paid</button><button class="fo-action" type="button" data-fo-edit-bill="${esc(row?.id)}">Edit</button></div></div>`;
    }).join('') : '<div class="fu-row"><div><b>No unpaid bills</b><span>Everything currently saved is paid, archived or excluded.</span></div><strong class="fu-good">CLEAR</strong></div>';
  }

  function renderPots() {
    const host = document.querySelector('#potsPanel [data-fu-health]');
    if (!host) return;
    const pots = arr(readState()?.finance?.pots).filter(row => !row?.archived);
    host.innerHTML = pots.length ? pots.map(row => {
      const balance = num(row?.balance), target = num(row?.target), spent = row?.goalMode === 'funded-progress' ? num(row?.spent) : 0;
      const funded = balance + spent, gap = Math.max(0,target-funded), pct = target > 0 ? Math.min(100,funded/target*100) : 0;
      return `<div class="fo-pot-row"><div><b>${esc(row?.name || 'Pot')}</b><span>${money(balance)} balance${target>0?` • ${money(target)} target • ${pct.toFixed(0)}% funded`:''}${spent>0?` • ${money(spent)} spent`:''}</span></div><strong>${gap>0?`${money(gap)} left`:'FUNDED'}</strong><div class="fo-actions"><button class="fo-action" type="button" data-fo-edit-pot="${esc(row?.id)}">Edit</button></div></div>`;
    }).join('') : '<div class="fu-row"><div><b>No active pots</b></div><strong>—</strong></div>';
  }

  function tidyPaydayPanel() {
    const side = document.querySelector('#paydayPanel .finance-command-grid.two > article.finance-panel:last-child');
    if (!side || side.dataset.foTidied === '1') return;
    side.dataset.foTidied = '1';
    side.innerHTML = `<div class="finance-panel-head"><div><span class="finance-panel-kicker">Finance Operations</span><h3>Everything protected before Transfer</h3></div><span class="rule-chip green">LIVE</span></div><p>Payday controls, bills, pots, House Fund commitments and the safe Transfer release all use the saved Finance state. Use Pots & Bills to mark commitments paid, and House Projects for renovation spending.</p><div class="fo-restore-card"><strong>Finance management restored</strong><span>Bills, pot editors, payment undo and House Projects are available from the tabs above instead of being hidden behind the old rebuild shell.</span></div>`;
  }

  function updateNavLabels() {
    const potsTab = document.querySelector('.finance-section-nav a[href="#potsPanel"] small');
    if (potsTab) potsTab.textContent = 'Bills • mark paid • pots';
    const houseTab = document.querySelector('.finance-section-nav a[href="#housePanel"] small');
    if (houseTab) houseTab.textContent = 'Rooms • costs • paid ledger';
    const top = document.querySelector('.topbar .status b');
    if (top) top.textContent = 'FULL OPERATIONS';
  }

  function render() {
    protectActionAuthority();
    ensureHouseProjects();
    installStyles();
    tidyPaydayPanel();
    updateNavLabels();

    const state = readState();
    const signature = JSON.stringify({
      bills:arr(state?.finance?.bills).map(row=>[row?.id,row?.amount,row?.due,row?.occurrenceMonth,row?.paid,row?.archived,row?.fundingSource]),
      pots:arr(state?.finance?.pots).map(row=>[row?.id,row?.balance,row?.target,row?.spent,row?.archived]),
      house:state?.finance?.houseProject?.updatedAt || ''
    });
    if (signature !== lastSignature) {
      lastSignature = signature;
      renderBills();
      renderPots();
    }

    window.AuroraFinanceOperationsOverhaul = Object.freeze({
      build:BUILD,
      ready:true,
      unifiedPotsBills:true,
      markPaidVisible:true,
      houseProjectsRequested:true,
      actionAuthorityPreserved:true,
      render
    });
    document.documentElement.dataset.financeOperations = 'restored';
  }

  function handleClick(event) {
    const pay = event.target.closest('[data-fo-pay-bill]');
    if (pay) {
      event.preventDefault();
      forwardAction(`[data-bill-complete="${CSS.escape(pay.dataset.foPayBill)}"]`);
      setTimeout(render,80);
      return;
    }
    const editBill = event.target.closest('[data-fo-edit-bill]');
    if (editBill) {
      event.preventDefault();
      const pane = document.querySelector('#potsPanel [data-fu-pane="actions"]'); pane?.click();
      setTimeout(() => forwardAction(`[data-bill-edit="${CSS.escape(editBill.dataset.foEditBill)}"]`),30);
      return;
    }
    const editPot = event.target.closest('[data-fo-edit-pot]');
    if (editPot) {
      event.preventDefault();
      const pane = document.querySelector('#potsPanel [data-fu-pane="actions"]'); pane?.click();
      setTimeout(() => forwardAction(`[data-pot-edit="${CSS.escape(editPot.dataset.foEditPot)}"]`),30);
    }
  }

  function boot() {
    protectActionAuthority();
    ensureHouseProjects();
    document.addEventListener('click',handleClick,true);
    render();
    window.addEventListener('aurora2:state',()=>setTimeout(render,40));
    window.addEventListener('pageshow',()=>setTimeout(render,40));
    window.addEventListener('focus',()=>setTimeout(render,40));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(render,40);});
    [40,100,200,400,800,1500,3000,6000].forEach(delay=>setTimeout(render,delay));
    setInterval(render,1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();