(() => {
  'use strict';

  const BUILD = '20260826-finance-ui-single-owner-1';
  const STATE_KEY = 'aurora2:state:v1';
  const WORKSPACES = ['overviewPanel','paydayPanel','potsPanel','housePanel'];
  let lastPayday = '';
  let lastOverviewPayments = '';
  let renderQueued = false;

  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const arr = v => Array.isArray(v) ? v : [];
  const num = v => { const n=Number(String(v ?? '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n)?Math.max(0,n):0; };
  const money = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function readState(){
    try { if(window.Aurora2?.core?.read) return window.Aurora2.core.read() || {}; } catch(_){}
    try { return JSON.parse(localStorage.getItem(STATE_KEY)||'{}') || {}; } catch(_) { return {}; }
  }
  function dateKey(v){ const t=String(v||'').slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(t)?t:''; }
  function parseDate(v){ const k=dateKey(v); if(!k)return null; const d=new Date(`${k}T12:00:00`); return Number.isNaN(d.getTime())?null:d; }
  function today(){ const d=new Date(); d.setHours(12,0,0,0); return d; }
  function humanDate(v){ const d=v instanceof Date?v:parseDate(v); return d?d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'No date'; }
  function nextPayday(plan){ let d=parseDate(plan?.paydayDate); if(!d)return null; const now=today(); let guard=0; while(d<now&&guard++<30)d.setDate(d.getDate()+28); return d; }
  function activeBills(s){ return arr(s?.finance?.bills).filter(b=>!b?.archived&&!b?.paid&&b?.included!==false); }
  function holdingPot(s){ return arr(s?.finance?.pots).find(p=>!p?.archived&&norm(p?.name)==='holding pot')||null; }
  function preview(s){
    const publicPreview=window.AuroraFinancePaydayPreview||{};
    const plan=publicPreview?.draftPlan||s?.finance?.plan||{};
    try {
      const fn=window.Aurora2?.financePaydayControl?.paydayFundingPreview;
      const result=typeof fn==='function'?fn(s,plan):null;
      if(result?.c)return result.c;
    } catch(_){}
    return {plan,auto:{},safeSurplus:num(publicPreview?.safeSurplus),commitments:num(publicPreview?.commitments),fundingPlan:s?.finance?.fundingPolicy?.lastPlan||{}};
  }
  function billBeforePayday(b,pd){
    if(!pd)return false;
    const due=parseDate(b?.due);
    if(due)return due<=pd;
    const month=String(b?.occurrenceMonth||'');
    return /^\d{4}-\d{2}$/.test(month)&&month<=pd.toISOString().slice(0,7);
  }

  function installStyles(){
    if(q('#financeUnifiedUiStyle'))return;
    const st=document.createElement('style'); st.id='financeUnifiedUiStyle';
    st.textContent=`
      #paydayPanel .fu-payday{display:grid;gap:16px;margin-bottom:18px}.fu-card{border:1px solid rgba(110,231,255,.14);border-radius:20px;padding:19px;background:linear-gradient(180deg,rgba(7,23,39,.96),rgba(3,12,24,.98))}.fu-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.fu-kicker{display:block;color:#72dff4;font:850 9px/1.2 system-ui;letter-spacing:.12em;text-transform:uppercase}.fu-head h3,.fu-head h4{margin:5px 0 0}.fu-head h3{font:950 30px/1 system-ui}.fu-head h4{font:900 21px/1.1 system-ui}.fu-chip{padding:7px 10px;border-radius:999px;border:1px solid rgba(99,245,162,.24);color:#a9ffc7;background:rgba(99,245,162,.06);font:900 9px system-ui}.fu-chip.warn{border-color:rgba(255,117,129,.28);color:#ffabb3;background:rgba(255,117,129,.07)}
      .fu-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-top:15px}.fu-metric,.fu-mini{border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:11px;background:rgba(0,0,0,.13)}.fu-metric small,.fu-mini small{display:block;color:#72899d;font:800 8px system-ui;text-transform:uppercase;letter-spacing:.07em}.fu-metric strong,.fu-mini strong{display:block;margin-top:6px;font:900 17px system-ui}.fu-mini span{display:block;margin-top:5px;color:#748da1;font:650 9px/1.3 system-ui}.fu-message{margin-top:13px;padding:11px 13px;border-left:3px solid #6ee7ff;background:rgba(110,231,255,.05);border-radius:0 11px 11px 0;color:#a9c2d2;font:650 11px/1.45 system-ui}
      .fu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.fu-list{display:grid;gap:7px;margin-top:12px}.fu-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.055)}.fu-row:last-child{border-bottom:0}.fu-row b{font:800 11px system-ui}.fu-row span{display:block;color:#748da1;font:650 9px/1.35 system-ui;margin-top:3px}.fu-row strong{font:900 11px system-ui;white-space:nowrap}.fu-moves .fu-row{grid-template-columns:34px minmax(0,1fr) auto;align-items:center}.fu-moves i{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:rgba(110,231,255,.07);color:#8eefff;font:900 9px system-ui;font-style:normal}
      #financeOverviewPayments{margin:14px 0}.fu-overview-total{border-top:1px solid rgba(110,231,255,.16);margin-top:7px;padding-top:12px}.fu-overview-release{color:#a9ffc7}
      @media(max-width:900px){.fu-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.fu-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  function showWorkspace(id,historyMode=true){
    id=WORKSPACES.includes(id)?id:'overviewPanel';
    WORKSPACES.forEach(pid=>{const p=q('#'+pid);if(!p)return;p.hidden=pid!==id;p.classList.toggle('finance-workspace-active',pid===id);});
    qa('.finance-section-nav .tab').forEach(a=>{const active=(a.getAttribute('href')||'')===`#${id}`;a.classList.toggle('active',active);a.setAttribute('aria-selected',active?'true':'false');});
    document.body.dataset.financeWorkspace=id;
    if(historyMode&&location.hash!==`#${id}`)history.pushState({financeWorkspace:id},'',`${location.pathname}${location.search}#${id}`);
  }

  function bindWorkspace(){
    document.addEventListener('click',e=>{
      const a=e.target.closest('.finance-section-nav a[href^="#"],a.finance-hero-action[href^="#"],a.mini-link-btn[href^="#"]');
      if(a){const id=(a.getAttribute('href')||'').slice(1);if(WORKSPACES.includes(id)){e.preventDefault();showWorkspace(id,true);}}
    },true);
    window.addEventListener('popstate',()=>showWorkspace(location.hash.slice(1),false));
    window.addEventListener('hashchange',()=>showWorkspace(location.hash.slice(1),false));
    showWorkspace(WORKSPACES.includes(location.hash.slice(1))?location.hash.slice(1):'overviewPanel',false);
  }

  function renderOverviewPayments(){
    const host=q('#financeOverviewPayments');if(!host)return;
    const s=readState();if(!s?.finance)return;
    const c=preview(s)||{},plan=c?.plan||s?.finance?.plan||{},auto=c?.auto||{},pd=nextPayday(plan);
    const bills=activeBills(s).filter(b=>billBeforePayday(b,pd));
    const currentBills=bills.filter(b=>norm(b?.fundingSource||'Current Account')==='current account').reduce((a,b)=>a+num(b?.amount),0);
    const otherPotBills=bills.filter(b=>norm(b?.fundingSource||'Current Account')!=='current account').reduce((a,b)=>a+num(b?.amount),0);
    const holdingMove=num(auto?.annualHoldingContribution)+num(auto?.holdingTopUp);
    const fp=c?.fundingPlan||s?.finance?.fundingPolicy?.lastPlan||{};
    const potRows=arr(fp?.rows).filter(r=>num(r?.amount)>.009&&norm(r?.name)!=='holding pot');
    const goalPotFunding=potRows.length?potRows.reduce((a,r)=>a+num(r?.amount),0):num(auto?.potsDue);
    const protectedSpending=num(plan?.protectedCash),otherPlanned=num(plan?.otherPlanned),plannedRelease=num(plan?.releaseAmount);
    const totalProtected=holdingMove+goalPotFunding+currentBills+otherPotBills+protectedSpending+otherPlanned;
    const signature=JSON.stringify({pd:pd?.toISOString(),currentBills,otherPotBills,holdingMove,goalPotFunding,protectedSpending,otherPlanned,plannedRelease,potRows,bills:bills.map(b=>[b.id,b.name,b.amount,b.fundingSource,b.due])});
    if(signature===lastOverviewPayments)return;lastOverviewPayments=signature;
    const paydayLabel=q('[data-fu-overview-payday]',host);if(paydayLabel)paydayLabel.textContent=pd?`Payday ${humanDate(pd)}`:'Payday not dated';
    const payments=q('[data-fu-overview-payments]',host);if(payments){
      const rows=[['Holding Pot',holdingMove,'13-pay contribution + safety top-up'],['Goal Pots',goalPotFunding,'Funding plan for active pots'],['Current Account Bills',currentBills,'Bills paid directly from current account'],['Bills from Other Pots',otherPotBills,'Bills funded from named pots'],['Protected Spending',protectedSpending,'Personal spending kept aside'],['Other Planned Spending',otherPlanned,'Other payday commitments']];
      payments.innerHTML=rows.map(([name,value,note])=>`<div class="fu-row"><div><b>${esc(name)}</b><span>${esc(note)}</span></div><strong>${money(value)}</strong></div>`).join('')+`<div class="fu-row fu-overview-total"><div><b>Total protected / outgoing</b><span>Everything accounted for before release</span></div><strong>${money(totalProtected)}</strong></div><div class="fu-row"><div><b>Safe Release to Transfer</b><span>Investment mission amount after commitments</span></div><strong class="fu-overview-release">${money(plannedRelease)}</strong></div>`;
    }
  }

  function ensurePayday(){
    const panel=q('#paydayPanel'); if(!panel)return null;
    let host=q('.fu-payday',panel); if(host)return host;
    host=document.createElement('section'); host.className='fu-payday';
    host.innerHTML=`<article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Finance Command Decision</span><h3>Payday Decision</h3></div><span class="fu-chip" data-fu-safe>CHECKING</span></div><div class="fu-metrics"><div class="fu-metric"><small>Total Available</small><strong data-fu-total>—</strong></div><div class="fu-metric"><small>Commitments</small><strong data-fu-commit>—</strong></div><div class="fu-metric"><small>Protected Cash</small><strong data-fu-protected>—</strong></div><div class="fu-metric"><small>Maximum Safe Release</small><strong data-fu-surplus>—</strong></div><div class="fu-metric"><small>Planned Release</small><strong data-fu-release>—</strong></div></div><div class="fu-message" data-fu-message>Reading the Finance payday engine…</div></article><article class="fu-card fu-moves"><div class="fu-head"><div><span class="fu-kicker">Payday Operations</span><h4>Pot Moves to Make</h4></div><span class="fu-chip" data-fu-move-total>—</span></div><div class="fu-list" data-fu-moves></div></article><div class="fu-grid"><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Protection Order</span><h4>Commitments Breakdown</h4></div></div><div class="fu-list" data-fu-breakdown></div></article><article class="fu-card"><div class="fu-head"><div><span class="fu-kicker">Release Gate</span><h4>Payday Checklist</h4></div></div><div class="fu-list" data-fu-checks></div></article></div>`;
    panel.prepend(host);return host;
  }

  function renderPayday(){
    const host=ensurePayday();if(!host)return;
    const s=readState(),c=preview(s),plan=c?.plan||s?.finance?.plan||{},auto=c?.auto||{},fp=c?.fundingPlan||s?.finance?.fundingPolicy?.lastPlan||{};
    const safe=num(c?.safeSurplus),release=num(plan?.releaseAmount),total=num(c?.totalCash),commitments=num(c?.commitments),protectedCash=num(plan?.protectedCash);
    const rows=arr(fp?.rows).filter(r=>num(r?.amount)>.009);
    const sig=JSON.stringify({plan,auto,safe,release,total,rows});if(sig===lastPayday)return;lastPayday=sig;
    const set=(sel,val)=>{const el=q(sel,host);if(el)el.textContent=val;};
    set('[data-fu-total]',money(total));set('[data-fu-commit]',money(commitments));set('[data-fu-protected]',money(protectedCash));set('[data-fu-surplus]',money(safe));set('[data-fu-release]',money(release));
    const ok=release<=safe+.005,safeEl=q('[data-fu-safe]',host);if(safeEl){safeEl.textContent=ok?'SAFE':'BLOCKED';safeEl.classList.toggle('warn',!ok);}set('[data-fu-message]',ok?`${money(Math.max(0,safe-release))} remains above the planned release after protected commitments.`:`Planned release is ${money(release-safe)} above the maximum safe release.`);
    set('[data-fu-move-total]',`TOTAL ${money(rows.reduce((a,r)=>a+num(r?.amount),0))}`);
    const moveHost=q('[data-fu-moves]',host);if(moveHost)moveHost.innerHTML=rows.length?rows.map((r,i)=>`<div class="fu-row"><i>${String(i+1).padStart(2,'0')}</i><div><b>Move ${money(r?.amount)} → ${esc(r?.name||'Pot')}</b><span>${esc(r?.reason||'Payday funding')}</span></div><strong>${num(r?.required)>.009?'REQUIRED':'EXTRA PAY'}</strong></div>`).join(''):'<div class="fu-row"><div><b>No pot transfers required</b></div><strong>£0.00</strong></div>';
    const breakdown=q('[data-fu-breakdown]',host);if(breakdown)breakdown.innerHTML=[['Current Account bills',auto?.billsDue],['13-pay bill funding',auto?.annualHoldingContribution],['Holding Pot safety top-up',auto?.holdingTopUp],['Pot funding',auto?.potsDue],['Protected spending',plan?.protectedCash]].map(([n,v])=>`<div class="fu-row"><div><b>${n}</b></div><strong>${money(v)}</strong></div>`).join('');
    const checks=q('[data-fu-checks]',host);if(checks)checks.innerHTML=[['Cash loaded',total>0,money(total)],['Bills protected',true,money(auto?.billsDue)],['Pots funded',true,money(auto?.potsDue)],['Holding Pot protected',!!holdingPot(s),money(holdingPot(s)?.balance)],['Release within safe surplus',ok,ok?'SAFE':'BLOCK']].map(([n,good,m])=>`<div class="fu-row"><div><b>${good?'✓':'!'} ${n}</b></div><strong class="${good?'fu-good':'fu-bad'}">${m}</strong></div>`).join('');
  }

  function render(){
    renderQueued=false;
    try{renderOverviewPayments();renderPayday();}catch(err){console.warn('[Aurora Finance UI]',err)}
  }
  function requestRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(render)}

  function boot(){
    installStyles();bindWorkspace();requestRender();
    window.addEventListener('aurora2:state',requestRender);
    window.addEventListener('aurora:finance-runtime-snapshot',requestRender);
    window.addEventListener('storage',e=>{if(e.key===STATE_KEY)requestRender()});
    window.addEventListener('pageshow',requestRender);
    window.AuroraFinanceUiController=Object.freeze({build:BUILD,render:requestRender,show:showWorkspace,owns:{overview:true,paydayDecision:true,potsBills:false},polling:false});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();