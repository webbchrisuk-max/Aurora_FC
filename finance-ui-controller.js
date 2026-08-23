(() => {
  'use strict';

  const BUILD = '20260823-finance-ui-controller-1';
  const STATE_KEY = 'aurora2:state:v1';
  const WORKSPACES = ['overviewPanel','paydayPanel','potsPanel','housePanel'];
  let lastPayday = '';
  let lastPots = '';
  let observer = null;

  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const arr = v => Array.isArray(v) ? v : [];
  const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? Math.max(0,n) : 0; };
  const money = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function readState(){
    try { if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {}; } catch(_){}
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch(_) { return {}; }
  }
  function dateKey(v){ const t=String(v||'').slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(t)?t:''; }
  function parseDate(v){ const k=dateKey(v); if(!k)return null; const d=new Date(`${k}T12:00:00`); return Number.isNaN(d.getTime())?null:d; }
  function today(){ const d=new Date(); d.setHours(12,0,0,0); return d; }
  function humanDate(v){ const d=v instanceof Date?v:parseDate(v); return d?d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}):'No date'; }
  function nextPayday(plan){ let d=parseDate(plan?.paydayDate); if(!d)return null; const now=today(); let g=0; while(d<now&&g++<30)d.setDate(d.getDate()+28); return d; }
  function activePots(s){ return arr(s?.finance?.pots).filter(p=>!p?.archived); }
  function activeBills(s){ return arr(s?.finance?.bills).filter(b=>!b?.archived&&!b?.paid&&b?.included!==false); }
  function holdingPot(s){ return activePots(s).find(p=>norm(p?.name)==='holding pot')||null; }
  function preview(s){
    const publicPreview=window.AuroraFinancePaydayPreview||{};
    const plan=publicPreview?.draftPlan||s?.finance?.plan||{};
    try {
      const fn=window.Aurora2?.financePaydayControl?.paydayFundingPreview;
      const result=typeof fn==='function'?fn(s,plan):null;
      if(result?.c)return result.c;
    } catch(_){}
    return null;
  }
  function billBeforePayday(b,pd){ const due=parseDate(b?.due); return !!(pd&&due&&due<=pd); }

  function installStyles(){
    if(q('#financeUnifiedUiStyle'))return;
    const st=document.createElement('style'); st.id='financeUnifiedUiStyle';
    st.textContent=`
      #paydayPanel .fu-payday{display:grid;gap:16px;margin-bottom:18px}.fu-card{border:1px solid rgba(110,231,255,.14);border-radius:20px;padding:19px;background:linear-gradient(180deg,rgba(7,23,39,.96),rgba(3,12,24,.98))}.fu-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.fu-kicker{display:block;color:#72dff4;font:850 9px/1.2 system-ui;letter-spacing:.12em;text-transform:uppercase}.fu-head h3,.fu-head h4{margin:5px 0 0}.fu-head h3{font:950 30px/1 system-ui}.fu-head h4{font:900 21px/1.1 system-ui}.fu-chip{padding:7px 10px;border-radius:999px;border:1px solid rgba(99,245,162,.24);color:#a9ffc7;background:rgba(99,245,162,.06);font:900 9px system-ui}.fu-chip.warn{border-color:rgba(255,117,129,.28);color:#ffabb3;background:rgba(255,117,129,.07)}
      .fu-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-top:15px}.fu-metric,.fu-mini{border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:11px;background:rgba(0,0,0,.13)}.fu-metric small,.fu-mini small{display:block;color:#72899d;font:800 8px system-ui;text-transform:uppercase;letter-spacing:.07em}.fu-metric strong{display:block;margin-top:6px;font:900 17px system-ui}.fu-message{margin-top:13px;padding:11px 13px;border-left:3px solid #6ee7ff;background:rgba(110,231,255,.05);border-radius:0 11px 11px 0;color:#a9c2d2;font:650 11px/1.45 system-ui}
      .fu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.fu-list{display:grid;gap:7px;margin-top:12px}.fu-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.055)}.fu-row:last-child{border-bottom:0}.fu-row b{font:800 11px system-ui}.fu-row span{display:block;color:#748da1;font:650 9px/1.35 system-ui;margin-top:3px}.fu-row strong{font:900 11px system-ui;white-space:nowrap}.fu-moves .fu-row{grid-template-columns:34px minmax(0,1fr) auto;align-items:center}.fu-moves i{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:rgba(110,231,255,.07);color:#8eefff;font:900 9px system-ui;font-style:normal}
      #potsPanel.fu-ready .live-placeholder{display:none!important}.fu-pb{display:grid;gap:14px}.fu-pb-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:7px;border:1px solid rgba(110,231,255,.13);border-radius:15px;background:rgba(2,9,19,.93);position:sticky;top:146px;z-index:7}.fu-pb-nav button{border:1px solid transparent;border-radius:10px;background:transparent;color:#849caf;padding:10px;text-align:left}.fu-pb-nav button b{display:block;color:#e4f2fb}.fu-pb-nav button small{display:block;margin-top:3px}.fu-pb-nav button.active{border-color:rgba(110,231,255,.22);background:rgba(110,231,255,.06)}.fu-pane[hidden]{display:none!important}.fu-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.fu-summary .fu-mini strong{display:block;margin-top:6px;font:900 18px system-ui}.fu-intel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fu-health{display:grid;gap:7px;margin-top:11px}.fu-health-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.055)}.fu-health-row:last-child{border-bottom:0}.fu-health-row b{font:800 11px system-ui}.fu-health-row span{font:900 9px system-ui}.fu-good{color:#9af7bb}.fu-warn{color:#ffd26b}.fu-bad{color:#ff9ba5}.fu-neutral{color:#8ba2b4}
      .fu-collapsible{margin-top:10px}.fu-collapsible>summary{cursor:pointer;list-style:none;border:1px solid rgba(110,231,255,.12);border-radius:12px;padding:11px 13px;color:#ccecf7;font:850 11px system-ui;background:rgba(5,17,30,.66)}.fu-collapsible>summary::-webkit-details-marker{display:none}.fu-collapsible[open]>summary{margin-bottom:9px}
      @media(max-width:900px){.fu-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.fu-grid,.fu-intel{grid-template-columns:1fr}.fu-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:650px){.fu-pb-nav{grid-template-columns:repeat(2,minmax(0,1fr));top:132px}.fu-summary{grid-template-columns:1fr}.fu-moves .fu-row{grid-template-columns:30px minmax(0,1fr)}.fu-moves .fu-row>strong{grid-column:2}}
    `; document.head.appendChild(st);
  }

  function showWorkspace(id,historyMode=true){
    id=WORKSPACES.includes(id)?id:'overviewPanel';
    WORKSPACES.forEach(pid=>{ const p=q('#'+pid); if(!p)return; p.hidden=pid!==id; p.classList.toggle('finance-workspace-active',pid===id); });
    qa('.finance-section-nav .tab').forEach(a=>{ const active=(a.getAttribute('href')||'')===`#${id}`; a.classList.toggle('active',active); a.setAttribute('aria-selected',active?'true':'false'); });
    document.body.dataset.financeWorkspace=id;
    if(historyMode&&location.hash!==`#${id}`) history.pushState({financeWorkspace:id},'',`${location.pathname}${location.search}#${id}`);
  }
  function bindWorkspace(){
    document.addEventListener('click',e=>{ const a=e.target.closest('.finance-section-nav a[href^="#"],a.finance-hero-action[href^="#"],a.mini-link-btn[href^="#"]'); if(!a)return; const id=(a.getAttribute('href')||'').slice(1); if(!WORKSPACES.includes(id))return; e.preventDefault(); showWorkspace(id,true); },true);
    window.addEventListener('popstate',()=>showWorkspace(location.hash.slice(1),false));
    window.addEventListener('hashchange',()=>showWorkspace(location.hash.slice(1),false));
    showWorkspace(WORKSPACES.includes(location.hash.slice(1))?location.hash.slice(1):'overviewPanel',false);
  }

  function ensurePayday(){
    const panel=q('#paydayPanel'); if(!panel)return null;
    let host=q('.fu-payday',panel); if(host)return host;
    host=document.createElement('section'); host.className='fu-payday';
    host.innerHTML=`
      <article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Finance Command Decision</span><h3>Payday Decision</h3></div><span class="fu-chip" data-fu-safe>CHECKING</span></div><div class="fu-metrics"><div class="fu-metric"><small>Total Available</small><strong data-fu-total>—</strong></div><div class="fu-metric"><small>Commitments</small><strong data-fu-commit>—</strong></div><div class="fu-metric"><small>Protected Cash</small><strong data-fu-protected>—</strong></div><div class="fu-metric"><small>Maximum Safe Release</small><strong data-fu-surplus>—</strong></div><div class="fu-metric"><small>Planned Release</small><strong data-fu-release>—</strong></div></div><div class="fu-message" data-fu-message>Reading the Finance payday engine…</div></article>
      <article class="fu-card fu-moves"><div class="fu-head"><div><span class="fu-kicker">Payday Operations</span><h4>Pot Moves to Make</h4></div><span class="fu-chip" data-fu-move-total>—</span></div><div class="fu-list" data-fu-moves></div></article>
      <div class="fu-grid"><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Protection Order</span><h4>Commitments Breakdown</h4></div></div><div class="fu-list" data-fu-breakdown></div></article><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Release Gate</span><h4>Payday Checklist</h4></div></div><div class="fu-list" data-fu-checks></div></article></div>`;
    panel.prepend(host); return host;
  }
  function renderPayday(){
    const host=ensurePayday(); if(!host)return;
    const s=readState(), c=preview(s); if(!c){ q('[data-fu-message]',host).textContent='Waiting for the Finance payday funding engine…'; return; }
    const plan=c.plan||s?.finance?.plan||{}, auto=c.auto||{}, fp=c.fundingPlan||s?.finance?.fundingPolicy?.lastPlan||{};
    const safe=num(c.safeSurplus), release=num(plan.releaseAmount), total=num(c.totalCash), commitments=num(c.commitments), protectedCash=num(plan.protectedCash);
    const rows=arr(fp?.rows).filter(r=>num(r?.amount)>.009).map(r=>({name:r?.name||'Pot',amount:num(r?.amount),required:num(r?.required),reason:r?.reason||'',deadline:r?.deadline||''}));
    const hp=holdingPot(s), hpMove=num(auto?.annualHoldingContribution)+num(auto?.holdingTopUp); if(hp&&hpMove>.009) rows.unshift({name:hp.name||'Holding Pot',amount:hpMove,required:hpMove,reason:'13-pay contribution / safety top-up',deadline:''});
    const sig=JSON.stringify({plan,auto,safe,commitments,rows}); if(sig===lastPayday)return; lastPayday=sig;
    q('[data-fu-total]',host).textContent=money(total); q('[data-fu-commit]',host).textContent=money(commitments); q('[data-fu-protected]',host).textContent=money(protectedCash); q('[data-fu-surplus]',host).textContent=money(safe); q('[data-fu-release]',host).textContent=money(release);
    const safeEl=q('[data-fu-safe]',host); const ok=release<=safe+.005; safeEl.textContent=ok?'SAFE':'BLOCKED'; safeEl.classList.toggle('warn',!ok); q('[data-fu-message]',host).textContent=ok?`${money(Math.max(0,safe-release))} remains above the planned release after all protected commitments.`:`Planned release is ${money(release-safe)} above the maximum safe release.`;
    const moveTotal=rows.reduce((a,r)=>a+r.amount,0); q('[data-fu-move-total]',host).textContent=`TOTAL ${money(moveTotal)}`; q('[data-fu-moves]',host).innerHTML=rows.length?rows.map((r,i)=>`<div class="fu-row"><i>${String(i+1).padStart(2,'0')}</i><div><b>Move ${money(r.amount)} → ${esc(r.name)}</b><span>${esc([r.reason,r.deadline?`Deadline ${r.deadline}`:''].filter(Boolean).join(' • '))}</span></div><strong>${r.required>.009?'REQUIRED':'EXTRA PAY'}</strong></div>`).join(''):'<div class="fu-row"><div><b>No pot transfers required</b><span>The current payday plan has no pot moves.</span></div></div>';
    q('[data-fu-breakdown]',host).innerHTML=[['Current Account bills',auto.billsDue],['13-pay bill funding',auto.annualHoldingContribution],['Holding Pot safety top-up',auto.holdingTopUp],['Goal pot funding',auto.potsDue],['Other planned spending',plan.otherPlanned],['Protected spending',plan.protectedCash]].map(([n,v])=>`<div class="fu-row"><div><b>${n}</b></div><strong>${money(v)}</strong></div>`).join('');
    const hpBal=num(hp?.balance); q('[data-fu-checks]',host).innerHTML=[['Cash loaded',total>0,money(total)],['Bills protected',true,money(auto.billsDue)],['Goal pots funded',true,money(auto.potsDue)],['Holding Pot protected',!!hp,money(hpBal)],['Release within safe surplus',ok,ok?'SAFE':'BLOCK']].map(([n,good,m])=>`<div class="fu-row"><div><b>${good?'✓':'!'} ${n}</b></div><strong class="${good?'fu-good':'fu-bad'}">${m}</strong></div>`).join('');
  }

  function ensurePotsShell(){
    const panel=q('#potsPanel'); if(!panel)return null;
    let shell=q('.fu-pb',panel); if(shell)return shell;
    shell=document.createElement('section'); shell.className='fu-pb'; shell.innerHTML=`
      <nav class="fu-pb-nav"><button class="active" data-fu-pane="summary"><b>Overview</b><small>Money & health</small></button><button data-fu-pane="pots"><b>Pots</b><small>Progress & management</small></button><button data-fu-pane="bills"><b>Bills</b><small>Before payday</small></button><button data-fu-pane="actions"><b>Finance Actions</b><small>Add & edit</small></button></nav>
      <section class="fu-pane" data-fu-view="summary"><div class="fu-summary" data-fu-summary></div><div class="fu-intel"><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Priority</span><h4>Needs Attention</h4></div></div><div class="fu-list" data-fu-attention></div></article><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Safety</span><h4>Holding Pot Cover</h4></div></div><div class="fu-list" data-fu-cover></div></article></div><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Funding</span><h4>Next Payday Pot Moves</h4></div></div><div class="fu-list" data-fu-pb-moves></div></article></section>
      <section class="fu-pane" data-fu-view="pots" hidden><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Protected Savings</span><h4>Pot Health</h4></div></div><div class="fu-health" data-fu-health></div><details class="fu-collapsible"><summary>Manage Pots</summary><div data-fu-pot-mount></div></details></article></section>
      <section class="fu-pane" data-fu-view="bills" hidden><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Commitments</span><h4>Due Before Next Payday</h4></div></div><div class="fu-list" data-fu-bills-due></div><details class="fu-collapsible"><summary>View All Monthly Bills</summary><div data-fu-bill-mount></div></details></article></section>
      <section class="fu-pane" data-fu-view="actions" hidden><div data-fu-actions-mount></div></section>`;
    panel.prepend(shell); panel.classList.add('fu-ready');
    shell.addEventListener('click',e=>{const b=e.target.closest('[data-fu-pane]');if(!b)return; const id=b.dataset.fuPane; qa('[data-fu-pane]',shell).forEach(x=>x.classList.toggle('active',x===b)); qa('[data-fu-view]',shell).forEach(x=>x.hidden=x.dataset.fuView!==id);});
    return shell;
  }
  function adoptPotsContent(shell){
    const potList=q('#financePotActionList'), billList=q('#financeBillActionList'), actions=q('#financePotsBillsActions');
    const potMount=q('[data-fu-pot-mount]',shell), billMount=q('[data-fu-bill-mount]',shell), actionsMount=q('[data-fu-actions-mount]',shell);
    if(potList&&potList.parentElement!==potMount)potMount.appendChild(potList);
    if(billList&&billList.parentElement!==billMount)billMount.appendChild(billList);
    if(actions){ const toolbar=q('.finance-actions-toolbar',actions), editors=q('.finance-actions-grid',actions), status=q('#financePotsBillsActionStatus',actions); [toolbar,editors,status].filter(Boolean).forEach(n=>actionsMount.appendChild(n)); if(!actions.children.length)actions.remove(); else actions.style.display='none'; }
    const progress=q('#financePotProgressDashboard'); if(progress){ const p=progress.closest('.finance-panel'); if(p&&!p.closest('.fu-pb'))p.style.display='none'; }
    const nextFive=q('#financeNextFiveBills'); if(nextFive){ const p=nextFive.closest('.finance-panel'); if(p&&!p.closest('.fu-pb'))p.style.display='none'; }
    qa('#potsPanel > .finance-scoreboard,#potsPanel > .finance-panel').forEach(n=>{ if(!n.closest('.fu-pb')&&n.id!=='financePotsBillsActions')n.style.display='none'; });
  }
  function renderPots(){
    const shell=ensurePotsShell(); if(!shell)return; adoptPotsContent(shell);
    const s=readState(), c=preview(s)||{}, pots=activePots(s), bills=activeBills(s), pd=nextPayday(c?.plan||s?.finance?.plan||{}), before=bills.filter(b=>billBeforePayday(b,pd));
    const hp=holdingPot(s), hpBal=num(hp?.balance), dueTotal=before.reduce((a,b)=>a+num(b?.amount),0), topUp=num(c?.auto?.annualHoldingContribution)+num(c?.auto?.holdingTopUp), projected=Math.max(0,hpBal+topUp-dueTotal);
    const targetTotal=pots.reduce((a,p)=>a+num(p?.target),0), cash=pots.reduce((a,p)=>a+num(p?.balance),0), gap=Math.max(0,targetTotal-cash), funding=pots.reduce((a,p)=>a+num(p?.fundingPerPayday||p?.fundingRequired||p?.fundingOverride),0);
    const fp=c?.fundingPlan||s?.finance?.fundingPolicy?.lastPlan||{}, moves=arr(fp?.rows).filter(r=>num(r?.amount)>.009);
    const sig=JSON.stringify({pots:pots.map(p=>[p.id,p.balance,p.target,p.deadline,p.fundingPerPayday]),bills:before.map(b=>[b.id,b.due,b.amount]),moves,hpBal,topUp}); if(sig===lastPots)return; lastPots=sig;
    q('[data-fu-summary]',shell).innerHTML=[['Pot Cash',cash,`${pots.length} active pots`],['Targets',targetTotal,`Gap ${money(gap)}`],['Next Payday Funding',funding,'Scheduled pot funding'],['Bills Before Payday',dueTotal,pd?humanDate(pd):'Payday not dated']].map(([l,v,s])=>`<div class="fu-mini"><small>${l}</small><strong>${money(v)}</strong><span>${s}</span></div>`).join('');
    const overdue=before.filter(b=>parseDate(b?.due)&&parseDate(b.due)<today()); const undated=pots.filter(p=>num(p?.target)>num(p?.balance)&&!dateKey(p?.deadline)); const behind=pots.filter(p=>dateKey(p?.deadline)&&num(p?.target)>num(p?.balance)&&num(p?.fundingPerPayday)<=.009);
    const attention=[...(overdue.length?[`${overdue.length} overdue bill${overdue.length===1?'':'s'}`]:[]),...(behind.length?[`${behind.length} pot${behind.length===1?'':'s'} behind pace`]:[]),...(undated.length?[`${undated.length} funding gap${undated.length===1?'':'s'} without deadline`]:[])]; q('[data-fu-attention]',shell).innerHTML=attention.length?attention.map(t=>`<div class="fu-row"><div><b>${esc(t)}</b></div><strong class="fu-warn">REVIEW</strong></div>`).join(''):'<div class="fu-row"><div><b>No urgent Pots & Bills issues</b><span>Everything currently looks under control.</span></div><strong class="fu-good">CLEAR</strong></div>';
    q('[data-fu-cover]',shell).innerHTML=[['Current Holding Pot',hpBal],['Bills before payday',dueTotal],['Expected payday top-up',topUp],['Projected after bills',projected]].map(([l,v])=>`<div class="fu-row"><div><b>${l}</b></div><strong>${money(v)}</strong></div>`).join('');
    q('[data-fu-pb-moves]',shell).innerHTML=moves.length?moves.map(r=>`<div class="fu-row"><div><b>${esc(r?.name||'Pot')}</b><span>${esc(r?.reason||'Payday funding')}</span></div><strong>${money(r?.amount)}</strong></div>`).join(''):'<div class="fu-row"><div><b>No scheduled pot moves</b></div><strong>£0.00</strong></div>';
    q('[data-fu-health]',shell).innerHTML=pots.map(p=>{ const bal=num(p.balance), target=num(p.target), gap=Math.max(0,target-bal), deadline=dateKey(p.deadline), f=num(p.fundingPerPayday||p.fundingRequired||p.fundingOverride); let status='NO DEADLINE',cls='fu-neutral'; if(target<=.009||gap<=.009){status='FUNDED';cls='fu-good';} else if(deadline&&f>.009){status='ON TRACK';cls='fu-good';} else if(deadline){status='BEHIND PACE';cls='fu-bad';} return `<div class="fu-health-row"><div><b>${esc(p.name||'Pot')}</b><small>${money(bal)}${target?` / ${money(target)}`:''}</small></div><span class="${cls}">${status}</span></div>`; }).join('');
    q('[data-fu-bills-due]',shell).innerHTML=before.length?before.sort((a,b)=>dateKey(a.due).localeCompare(dateKey(b.due))).map(b=>`<div class="fu-row"><div><b>${esc(b.name||'Bill')}</b><span>${humanDate(b.due)} • ${esc(b.fundingSource||'Current Account')}</span></div><strong>${money(b.amount)}</strong></div>`).join(''):'<div class="fu-row"><div><b>No bills due before payday</b></div><strong class="fu-good">CLEAR</strong></div>';
  }

  function render(){ renderPayday(); renderPots(); }
  function boot(){
    installStyles(); bindWorkspace(); render();
    ['aurora2:state','focus','pageshow'].forEach(type=>window.addEventListener(type,()=>setTimeout(render,25)));
    window.addEventListener('storage',e=>{if(e.key===STATE_KEY)setTimeout(render,25);});
    observer=new MutationObserver(()=>{ clearTimeout(observer._t); observer._t=setTimeout(render,60); }); observer.observe(document.body,{childList:true,subtree:true});
    setInterval(render,1500);
    window.AuroraFinanceUiController=Object.freeze({build:BUILD,render,show:showWorkspace});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
