(() => {
  'use strict';

  const BUILD = '20260824-pots-bills-cleanup-1';
  const STATE_KEY = 'aurora2:state:v1';
  if (window.__AuroraFinancePotsBillsCleanup === BUILD) return;
  window.__AuroraFinancePotsBillsCleanup = BUILD;

  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const money = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Math.max(0,Number(v)||0));

  function state(){
    try { return window.Aurora2?.core?.read?.() || JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function installStyles(){
    if (document.getElementById('auroraPotsBillsCleanupStyle')) return;
    const style = document.createElement('style');
    style.id = 'auroraPotsBillsCleanupStyle';
    style.textContent = `
      #financePotActionList{display:none!important}
      #fpbBills .fpb-actions{display:none!important}
      #fpbBills .fpb-bill{grid-template-columns:minmax(0,1fr) auto!important}
      #financePotEditor .aurora-pot-editor-extra{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
      #financePotEditor .aurora-pot-editor-extra .danger{border-color:rgba(255,104,104,.4);color:#ffb2b2}
      #financeBillActionList .aurora-bill-month{margin:12px 0 16px;border:1px solid rgba(110,231,255,.12);border-radius:14px;overflow:hidden;background:rgba(3,14,25,.45)}
      #financeBillActionList .aurora-bill-month-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;background:rgba(110,231,255,.055);border-bottom:1px solid rgba(110,231,255,.1)}
      #financeBillActionList .aurora-bill-month-head strong{font-size:12px;color:#e8f9ff}
      #financeBillActionList .aurora-bill-month-head span{font-size:9px;color:#8da5b5}
      #financeBillActionList .aurora-bill-month-body{display:grid;gap:8px;padding:9px}
      #financeBillActionList .aurora-bill-month-body .finance-action-row{margin:0}
    `;
    document.head.appendChild(style);
  }

  function monthKey(bill){
    const due = String(bill?.due || '').slice(0,10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due.slice(0,7);
    const month = String(bill?.occurrenceMonth || '').slice(0,7);
    return /^\d{4}-\d{2}$/.test(month) ? month : 'no-date';
  }
  function monthLabel(key){
    if (key === 'no-date') return 'No date set';
    const [y,m] = key.split('-').map(Number);
    return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  }

  function tidyUpperBills(){
    const billCard = document.querySelector('#financeUnifiedPotsBills .fpb-card:has(#fpbBills)');
    const chip = billCard?.querySelector('.fpb-chip');
    if (chip) chip.textContent = 'UPCOMING';
    document.querySelectorAll('#fpbBills .fpb-actions').forEach(el => el.remove());
  }

  function currentPot(){
    const id = document.querySelector('#financePotEditor [data-pot="id"]')?.value || '';
    if (!id) return null;
    return (state()?.finance?.pots || []).find(p => String(p?.id || '') === String(id)) || null;
  }

  function syncPotEditor(){
    const editor = document.getElementById('financePotEditor');
    const actions = editor?.querySelector('.finance-editor-actions');
    if (!editor || !actions) return;

    const save = actions.querySelector('[data-action="save-pot"]');
    const cancel = actions.querySelector('[data-action="cancel-pot"]');
    const pot = currentPot();
    if (save) save.textContent = pot ? 'Save Changes' : 'Save Pot';
    if (cancel) cancel.textContent = 'Cancel';

    let extra = actions.querySelector('.aurora-pot-editor-extra');
    if (!extra) {
      extra = document.createElement('span');
      extra.className = 'aurora-pot-editor-extra';
      extra.innerHTML = '<button type="button" data-cleanup-pot-archive>Archive Pot</button><button type="button" class="danger" data-cleanup-pot-delete>Delete Pot</button>';
      actions.appendChild(extra);
    }

    extra.style.display = pot ? 'flex' : 'none';
    if (!pot) return;
    const protectedPot = norm(pot.name) === 'holding pot' || norm(pot.name) === 'house fund' || norm(pot.name) === 'house';
    const archive = extra.querySelector('[data-cleanup-pot-archive]');
    const del = extra.querySelector('[data-cleanup-pot-delete]');
    if (archive) {
      archive.textContent = pot.archived ? 'Restore Pot' : 'Archive Pot';
      archive.disabled = protectedPot;
      archive.title = protectedPot ? 'This protected Finance pot cannot be archived here.' : '';
    }
    if (del) {
      del.disabled = protectedPot;
      del.title = protectedPot ? 'This protected Finance pot cannot be deleted.' : '';
    }
  }

  function triggerHiddenPotAction(kind){
    const pot = currentPot();
    if (!pot) return;
    const selector = kind === 'archive'
      ? `#financePotActionList [data-pot-toggle="${CSS.escape(String(pot.id))}"]`
      : `#financePotActionList [data-pot-delete="${CSS.escape(String(pot.id))}"]`;
    const button = document.querySelector(selector);
    if (!button) return;
    button.click();
    setTimeout(syncPotEditor,0);
  }

  function groupManageBills(){
    const host = document.getElementById('financeBillActionList');
    if (!host) return;
    const rows = [...host.querySelectorAll(':scope > .finance-action-row')];
    if (!rows.length) return;

    const s = state();
    const bills = s?.finance?.bills || [];
    const header = host.querySelector(':scope > .finance-panel-head');
    const groups = new Map();

    rows.forEach(row => {
      const action = row.querySelector('[data-bill-edit],[data-bill-complete],[data-bill-toggle],[data-bill-delete]');
      const id = action?.dataset.billEdit || action?.dataset.billComplete || action?.dataset.billToggle || action?.dataset.billDelete || '';
      const bill = bills.find(b => String(b?.id || '') === String(id));
      const key = monthKey(bill);
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push({row,bill});
    });

    const ordered = [...groups.keys()].sort((a,b) => {
      if (a === 'no-date') return 1;
      if (b === 'no-date') return -1;
      return a.localeCompare(b);
    });

    host.innerHTML = '';
    if (header) host.appendChild(header);
    ordered.forEach(key => {
      const items = groups.get(key);
      const total = items.reduce((sum,x)=>sum + Math.max(0,Number(x.bill?.amount)||0),0);
      const activeCount = items.filter(x => !x.bill?.archived && !x.bill?.paid && x.bill?.included !== false).length;
      const section = document.createElement('section');
      section.className = 'aurora-bill-month';
      section.innerHTML = `<div class="aurora-bill-month-head"><strong>${monthLabel(key)}</strong><span>${activeCount} active • ${money(total)}</span></div><div class="aurora-bill-month-body"></div>`;
      const body = section.querySelector('.aurora-bill-month-body');
      items.forEach(x => body.appendChild(x.row));
      host.appendChild(section);
    });
  }

  let applying = false;
  function apply(){
    if (applying) return;
    applying = true;
    installStyles();
    tidyUpperBills();
    syncPotEditor();
    groupManageBills();
    applying = false;
  }

  document.addEventListener('click',event => {
    if (event.target.closest('[data-fpb-edit-pot],[data-pot-edit],[data-action="new-pot"]')) setTimeout(syncPotEditor,0);
    if (event.target.closest('[data-cleanup-pot-archive]')) { event.preventDefault(); triggerHiddenPotAction('archive'); }
    if (event.target.closest('[data-cleanup-pot-delete]')) { event.preventDefault(); triggerHiddenPotAction('delete'); }
  },true);

  function boot(){
    apply();
    const root = document.getElementById('potsPanel') || document.body;
    const observer = new MutationObserver(() => {
      clearTimeout(observer._t);
      observer._t = setTimeout(apply,25);
    });
    observer.observe(root,{childList:true,subtree:true});
    window.addEventListener('aurora2:state',()=>setTimeout(apply,30));
    [200,500,1000,2000,4000].forEach(ms=>setTimeout(apply,ms));
    window.AuroraFinancePotsBillsCleanup = Object.freeze({build:BUILD,ready:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();