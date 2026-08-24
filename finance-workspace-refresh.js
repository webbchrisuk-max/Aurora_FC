(() => {
  'use strict';

  const BUILD = '20260824-finance-workspace-refresh-2';
  const STATE_KEY = 'aurora2:state:v1';
  if (window.__AuroraFinanceWorkspaceRefresh === BUILD) return;
  window.__AuroraFinanceWorkspaceRefresh = BUILD;

  const arr = v => Array.isArray(v) ? v : [];
  const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? Math.max(0,n) : 0; };
  const money = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(num(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function readState(){
    try { if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {}; } catch(_) {}
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch(_) { return {}; }
  }
  function parseDate(v){
    const raw=String(v||'').slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const d=new Date(`${raw}T12:00:00`); return Number.isNaN(d.getTime())?null:d;
  }
  function humanDate(v){
    const d=parseDate(v); if(d) return d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
    const m=String(v||'').slice(0,7); return /^\d{4}-\d{2}$/.test(m)?m:'No date';
  }
  function dueSort(b){
    const d=parseDate(b?.due); if(d) return d.getTime();
    const m=String(b?.occurrenceMonth||''); if(/^\d{4}-\d{2}$/.test(m)) return new Date(`${m}-01T12:00:00`).getTime();
    return Number.MAX_SAFE_INTEGER;
  }
  function activePots(s){ return arr(s?.finance?.pots).filter(p=>!p?.archived); }
  function activeBills(s){ return arr(s?.finance?.bills).filter(b=>!b?.archived&&!b?.paid&&b?.included!==false); }
  function fundingRows(s){
    const rows=arr(s?.finance?.fundingPolicy?.lastPlan?.rows);
    return rows.length ? rows : arr(window.AuroraFinancePaydayPreview?.fundingPlan?.rows);
  }
  function plannedForPot(s,p){
    const rows=fundingRows(s);
    const row=rows.find(r=>String(r?.potId||'')===String(p?.id||'') || norm(r?.name)===norm(p?.name));
    return num(row?.amount ?? p?.fundingOverride ?? p?.fundingPerPayday);
  }

  function installStyles(){
    let style=document.getElementById('financeWorkspaceRefreshStyle');
    if(!style){ style=document.createElement('style'); style.id='financeWorkspaceRefreshStyle'; document.head.appendChild(style); }
    style.textContent=`
      #potsPanel>.fu-pb{display:none!important}
      #financeUnifiedPotsBills{display:grid;gap:14px}
      .fpb-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .fpb-card{border:1px solid rgba(110,231,255,.13);border-radius:18px;padding:17px;background:linear-gradient(180deg,rgba(7,23,39,.96),rgba(3,12,24,.98))}
      .fpb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.fpb-head h3{margin:4px 0 0;font:900 23px/1.05 system-ui}
      .fpb-kicker{display:block;color:#72dff4;font:850 9px/1.2 system-ui;letter-spacing:.12em;text-transform:uppercase}
      .fpb-chip{border:1px solid rgba(99,245,162,.24);border-radius:999px;padding:7px 9px;color:#a9ffc7;background:rgba(99,245,162,.05);font:900 8px/1 system-ui;white-space:nowrap}
      .fpb-mini{border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:12px;background:rgba(0,0,0,.13)}.fpb-mini small{display:block;color:#72899d;font:800 8px system-ui;text-transform:uppercase;letter-spacing:.07em}.fpb-mini strong{display:block;margin-top:6px;font:900 18px system-ui}.fpb-mini span{display:block;margin-top:5px;color:#748da1;font:650 9px/1.3 system-ui}
      .fpb-pot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.fpb-pot{border:1px solid rgba(255,255,255,.07);border-radius:15px;padding:14px;background:rgba(0,0,0,.12)}.fpb-pot-top{display:flex;justify-content:space-between;gap:10px}.fpb-pot h4{margin:0;font:900 15px system-ui}.fpb-pot-meta{margin-top:5px;color:#7890a1;font:650 9px/1.45 system-ui}.fpb-track{height:7px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.07);margin:11px 0 7px}.fpb-track i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#6ee7ff,#8cf7be)}.fpb-pot-foot{display:flex;justify-content:space-between;gap:10px;color:#8096a6;font:700 9px system-ui}.fpb-status{font:900 9px system-ui;color:#9af7bb}
      .fpb-bill{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.055)}.fpb-bill:last-child{border-bottom:0}.fpb-bill b{font:850 11px system-ui}.fpb-bill span{display:block;margin-top:4px;color:#758da0;font:650 9px/1.35 system-ui}.fpb-bill>strong{font:900 11px system-ui;white-space:nowrap}
      .fpb-btn{appearance:none;border:1px solid rgba(110,231,255,.22);border-radius:9px;background:rgba(110,231,255,.05);color:#d9f8ff;padding:8px 10px;font:850 9px/1 system-ui;cursor:pointer}.fpb-btn.primary{border-color:rgba(99,245,162,.28);color:#a9ffc7;background:rgba(99,245,162,.06)}
      .fpb-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.fpb-management{margin-top:10px}.fpb-management>summary{cursor:pointer;list-style:none;border:1px solid rgba(110,231,255,.12);border-radius:11px;padding:10px 12px;color:#ccecf7;font:850 10px system-ui;background:rgba(5,17,30,.66)}.fpb-management>summary::-webkit-details-marker{display:none}
      @media(max-width:900px){.fpb-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.fpb-pot-grid{grid-template-columns:1fr}}@media(max-width:650px){.fpb-summary{grid-template-columns:1fr}.fpb-bill{grid-template-columns:1fr auto}}
    `;
  }

  function ensureShell(){
    const panel=document.getElementById('potsPanel'); if(!panel) return null;
    let shell=document.getElementById('financeUnifiedPotsBills');
    if(!shell){
      shell=document.createElement('section'); shell.id='financeUnifiedPotsBills';
      shell.innerHTML=`
        <div class="fpb-summary" id="fpbSummary"></div>
        <section class="fpb-card"><div class="fpb-head"><div><span class="fpb-kicker">Protected Savings</span><h3>Pots</h3></div><span class="fpb-chip">LIVE PROGRESS</span></div><div class="fpb-pot-grid" id="fpbPots"></div></section>
        <section class="fpb-card"><div class="fpb-head"><div><span class="fpb-kicker">Commitments</span><h3>Next 5 Bills</h3></div><span class="fpb-chip">UPCOMING</span></div><div id="fpbBills"></div></section>
        <section class="fpb-card"><div class="fpb-head"><div><span class="fpb-kicker">Finance Actions</span><h3>Add, edit & undo</h3></div></div><div class="fpb-toolbar"><button class="fpb-btn primary" type="button" data-action="new-pot">+ Add Pot</button><button class="fpb-btn primary" type="button" data-action="new-bill">+ Add Bill</button><button class="fpb-btn" type="button" data-action="undo-payment">Undo Last Payment</button></div><details class="fpb-management" open><summary>Manage Bills & editors</summary><div id="financeActionsMountStable"></div></details></section>`;
      panel.prepend(shell);
    }
    return shell;
  }

  function render(){
    if(!ensureShell()) return;
    const s=readState(), pots=activePots(s), bills=activeBills(s).sort((a,b)=>dueSort(a)-dueSort(b));
    const totalPot=pots.reduce((x,p)=>x+num(p?.balance),0), totalTarget=pots.reduce((x,p)=>x+num(p?.target),0), billTotal=bills.reduce((x,b)=>x+num(b?.amount),0);
    const nextFive=bills.slice(0,5);
    const summary=document.getElementById('fpbSummary');
    if(summary) summary.innerHTML=`<div class="fpb-mini"><small>Pot Cash</small><strong>${money(totalPot)}</strong><span>${pots.length} active pots</span></div><div class="fpb-mini"><small>Pot Targets</small><strong>${money(totalTarget)}</strong><span>Protected goals</span></div><div class="fpb-mini"><small>Open Bills</small><strong>${bills.length}</strong><span>${money(billTotal)} total</span></div><div class="fpb-mini"><small>Next Commitments</small><strong>${nextFive.length}</strong><span>Showing next five only</span></div>`;

    const ph=document.getElementById('fpbPots');
    if(ph) ph.innerHTML=pots.length?pots.map(p=>{
      const balance=num(p?.balance), target=num(p?.target), gap=Math.max(0,target-balance), pct=target>0?Math.min(100,balance/target*100):100, next=plannedForPot(s,p);
      const status=target<=.009?'PROTECTED':gap<=.009?'FUNDED':'FUNDING';
      return `<article class="fpb-pot"><div class="fpb-pot-top"><div><h4>${esc(p?.name||'Pot')}</h4><div class="fpb-pot-meta">${money(balance)} cash${target>0?` • ${money(target)} target`:''}${p?.deadline?` • ${esc(humanDate(p.deadline))}`:''}</div></div><button class="fpb-btn" type="button" data-pot-edit="${esc(p?.id)}">Edit</button></div><div class="fpb-track"><i style="width:${pct.toFixed(1)}%"></i></div><div class="fpb-pot-foot"><span>${target>0?`${pct.toFixed(0)}% • ${money(gap)} left`:'Protected cash balance'}</span><span class="fpb-status">${status}</span></div>${next>0?`<div class="fpb-pot-meta">Next payday funding: <b>${money(next)}</b></div>`:''}</article>`;
    }).join(''):'<div class="fpb-mini"><strong>No active pots</strong><span>Add a pot below.</span></div>';

    const bh=document.getElementById('fpbBills');
    if(bh) bh.innerHTML=nextFive.length?nextFive.map(b=>`<div class="fpb-bill"><div><b>${esc(b?.name||'Bill')}</b><span>${esc(humanDate(b?.due||b?.occurrenceMonth))} • ${esc(b?.fundingSource||'Current Account')}</span></div><strong>${money(b?.amount)}</strong></div>`).join(''):'<div class="fpb-mini"><strong>No unpaid bills</strong><span>Everything currently saved is paid, archived or excluded.</span></div>';
  }

  function arrangeOverview(){
    const overview=document.getElementById('overviewPanel'); if(!overview) return;
    let primary=document.getElementById('foOverviewPrimary');
    if(!primary){ primary=document.createElement('section'); primary.id='foOverviewPrimary'; overview.prepend(primary); }
    const mission=overview.querySelector('.mission-panel'), readiness=overview.querySelector('.readiness-panel');
    [mission,readiness].filter(Boolean).forEach(n=>{ if(n.parentElement!==primary) primary.appendChild(n); });
  }

  function boot(){
    installStyles(); arrangeOverview(); render();
    window.addEventListener('aurora2:state',()=>setTimeout(render,0));
    window.addEventListener('pageshow',render); window.addEventListener('focus',render);
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') render(); });
    window.AuroraFinanceWorkspaceRefresh=Object.freeze({build:BUILD,ready:true,render});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();