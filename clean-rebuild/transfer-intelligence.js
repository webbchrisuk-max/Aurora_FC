(() => {
  'use strict';

  const BUILD='20260911-transfer-intelligence-3-consolidated';
  const TARGET_MONTHLY_INCOME=2000;
  const PLAN_KEY='aurora-clean:transfer-target-plan:v1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const pct=v=>`${num(v).toFixed(2)}%`;
  const active=s=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(s||'ACTIVE'));
  const round=v=>Number(num(v).toFixed(2));

  function readPlan(){try{return JSON.parse(localStorage.getItem(PLAN_KEY)||'null')||{monthlyContribution:1000}}catch(_){return{monthlyContribution:1000}}}
  function writePlan(v){localStorage.setItem(PLAN_KEY,JSON.stringify(v))}
  function brokerLabel(r){const a=upper(r?.lockedAccount||r?.account||r?.broker||r?.preferredBroker||r?.platform);if(a.includes('212'))return'Trading 212 ISA';if(a.includes('IG'))return'IG ISA';return'Broker pending'}
  function brokerReady(r){return brokerLabel(r)!=='Broker pending'}

  function routeRows(state){
    const r=state.transfer?.route;if(!r)return[];
    return [...(r.allocations||[]),...(r.brokerCashAllocations||[])].filter(row=>num(row.amount)>0);
  }

  function approvedRows(state){
    const plan=state.scouting?.allocationPlan;
    if(upper(plan?.status)!=='APPROVED'||!Array.isArray(plan.allocations)||!plan.allocations.length)return[];
    const route=state.transfer?.route;
    const routeAlloc=String(route?.missionId||'')===String(plan.missionId||'')&&Array.isArray(route?.allocations)?route.allocations:[];
    return plan.allocations.map((row,i)=>{
      const rank=num(row.selectionRank)||i+1;
      const routed=routeAlloc.find(r=>upper(r.ticker)===upper(row.ticker)&&num(r.selectionRank)===rank)||routeAlloc.find(r=>upper(r.ticker)===upper(row.ticker));
      const account=routed?.lockedAccount||routed?.account||'';
      return {...row,selectionRank:rank,status:'APPROVED',...(account?{lockedAccount:account,account}:{})};
    });
  }

  function squadMetrics(state){
    const rows=(state.squad?.holdings||[]).filter(h=>active(h.status)&&num(h.shares)>0);
    const annual=rows.reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp)||num(h.shares)*num(h.annualDpsGbp)),0);
    const market=rows.reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0);
    const largest=rows.reduce((m,h)=>Math.max(m,Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp))),0);
    return{rows,annual:round(annual),monthly:round(annual/12),market:round(market),largestPct:market>0?largest/market*100:0};
  }

  function weightedYield(list){
    const total=list.reduce((s,r)=>s+Math.max(0,num(r.amount)),0);
    return total>0?list.reduce((s,r)=>s+num(r.amount)*num(r.yieldPct),0)/total:0;
  }

  function strategyRows(state){
    const rows=approvedRows(state).filter(r=>num(r.yieldPct)>0);
    const sustainable=[...rows].sort((a,b)=>num(b.score)-num(a.score)||num(b.yieldPct)-num(a.yieldPct));
    const maximum=[...rows].sort((a,b)=>num(b.yieldPct)-num(a.yieldPct)||num(b.score)-num(a.score));
    const current=routeRows(state);
    const candidateYield=list=>list.length?list.slice(0,Math.min(4,list.length)).reduce((s,r)=>s+num(r.yieldPct),0)/Math.min(4,list.length):0;
    return{
      sustainable:{yield:current.length?weightedYield(current):candidateYield(sustainable),count:sustainable.length,top:sustainable.slice(0,4)},
      maximum:{yield:current.length?weightedYield(current):candidateYield(maximum),count:maximum.length,top:maximum.slice(0,4)},
      custom:{yield:0,count:0,top:[]}
    };
  }

  function projectedGoalDate(currentAnnual,monthlyContribution,routeYield){
    const target=TARGET_MONTHLY_INCOME*12;if(currentAnnual>=target)return new Date();
    const y=Math.max(.001,num(routeYield))/100,annualContribution=Math.max(0,num(monthlyContribution))*12;
    if(!(annualContribution>0))return null;
    let annual=currentAnnual;
    for(let m=1;m<=360;m++){
      annual+=annualContribution/12*y;
      if(annual>=target){const d=new Date();d.setMonth(d.getMonth()+m);return d}
    }
    return null;
  }

  function fmtDate(d){return d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'Beyond 30 years'}
  function ensure(){let host=$('transferIntelligence');if(host)return host;const hero=document.querySelector('header.department-hero');if(!hero)return null;host=document.createElement('div');host.id='transferIntelligence';host.className='transfer-intel-shell';hero.insertAdjacentElement('afterend',host);return host}

  function missionPanel(state){
    const mission=state.transfer?.mission,route=state.transfer?.route,budget=Math.max(0,num(mission?.budget));
    const financeUsed=route?Math.max(0,num(route.financeAllocated)):0;
    const paydayKept=route?Math.max(0,num(route.financeLeftBehind)):0;
    const brokerCashUsed=route?Math.max(0,num(route.brokerCashAllocated)):0;
    const buyingPower=route?Math.max(0,num(route.totalAllocated)):0;
    const legs=routeRows(state).length,status=upper(mission?.status||'WAITING');
    return `<section class="transfer-intel-panel gold"><div class="transfer-intel-head"><div><p class="eyebrow">FINANCE MISSION AUTHORITY</p><h2>Current Transfer Budget</h2><p>Finance sets the payday ceiling. Transfer combines only the payday cash actually needed with eligible broker cash, while keeping the route near the £1,000 buying-power target.</p></div><span class="transfer-intel-badge ${['LOCKED','READY','DRAFT'].includes(status)?'good':'warn'}">${esc(status)}</span></div><div class="transfer-mission-layout"><div><div class="transfer-mission-budget">${money(budget)}</div><strong>${budget>0?'FINANCE RELEASE ACTIVE':'WAITING FOR FINANCE'}</strong><div class="transfer-intel-grid" style="margin-top:16px"><article class="transfer-intel-stat"><span>MISSION ID</span><strong>${esc(mission?.id||'—')}</strong></article><article class="transfer-intel-stat"><span>RELEASED PAYDAY</span><strong>${esc(mission?.releasedPayday||mission?.payday||'—')}</strong></article><article class="transfer-intel-stat"><span>STRATEGY</span><strong>${esc(state.scouting?.strategy||route?.strategy||'—')}</strong></article><article class="transfer-intel-stat"><span>PURCHASE LEGS</span><strong>${legs}</strong></article></div><div class="transfer-status-note">${route?'The figures on the right are the funding authorities for the current route.':'Build the approved Scouting route, then assign each target to IG ISA or Trading 212 ISA.'}</div></div><div class="transfer-intel-grid" style="grid-template-columns:1fr 1fr"><article class="transfer-intel-stat"><span>PAYDAY AVAILABLE</span><strong>${money(budget)}</strong></article><article class="transfer-intel-stat"><span>PAYDAY USED</span><strong>${money(financeUsed)}</strong></article><article class="transfer-intel-stat"><span>PAYDAY KEPT</span><strong>${money(paydayKept)}</strong></article><article class="transfer-intel-stat"><span>BROKER CASH USED</span><strong>${money(brokerCashUsed)}</strong></article><article class="transfer-intel-stat"><span>TOTAL BUYING POWER</span><strong>${money(buyingPower)}</strong></article><article class="transfer-intel-stat"><span>TARGET</span><strong>£1,000.00</strong></article></div></div><div class="transfer-intel-actions"><a href="finance.html">← Finance Command</a><a href="scouting.html">Scouting Centre →</a></div></section>`;
  }

  function shortlistPanel(state){
    const rows=approvedRows(state),approved=rows.length,resolved=rows.filter(brokerReady).length,pending=Math.max(0,rows.length-resolved);
    return `<section class="transfer-intel-panel"><div class="transfer-intel-head"><div><p class="eyebrow">STAGE T2 · SCOUTING INTAKE</p><h2>Approved shortlist</h2><p>Transfer uses Scouting's canonical picks without rescoring them. Broker assignment is read from the actual Transfer route, so this status matches the route below.</p></div><span class="transfer-intel-badge ${approved?'good':'warn'}">${approved?'APPROVED':'SCOUTING REVIEW'}</span></div><div class="transfer-intel-grid" style="margin-bottom:14px"><article class="transfer-intel-stat"><span>ACTIVE TARGETS</span><strong>${rows.length}</strong></article><article class="transfer-intel-stat"><span>SCOUTING APPROVED</span><strong>${approved}</strong></article><article class="transfer-intel-stat"><span>BROKER READY</span><strong>${resolved}/${rows.length}</strong></article><article class="transfer-intel-stat"><span>BROKER PENDING</span><strong>${pending}</strong></article></div><div class="transfer-shortlist">${rows.length?rows.map((r,i)=>`<div class="transfer-short-row"><div class="transfer-short-rank">#${num(r.selectionRank)||i+1}</div><div class="transfer-short-name"><strong>${esc(upper(r.ticker))} · ${esc(r.name||r.ticker)}</strong><small>APPROVED</small></div><div class="transfer-short-score"><strong>${Math.round(num(r.score||r.buyStrength))}/100</strong><small>score</small></div><div class="transfer-short-yield"><strong>${pct(r.yieldPct)}</strong><small>yield</small></div><div class="transfer-short-meta"><strong class="transfer-broker">${esc(brokerLabel(r))}</strong><small>${brokerReady(r)?'Broker resolved':'Resolve to IG ISA or Trading 212 ISA before lock'}</small></div></div>`).join(''):'<div class="transfer-intel-empty">No approved Scouting shortlist is currently available.</div>'}</div></section>`;
  }

  function previewPanel(state){
    const mission=state.transfer?.mission,route=state.transfer?.route,plan=state.scouting?.allocationPlan;
    const routed=routeRows(state),previewRows=routed.length?routed:approvedRows(state);
    const financeUsed=route?num(route.financeAllocated):num(plan?.allocated||mission?.budget);
    const paydayKept=route?num(route.financeLeftBehind):0;
    const brokerCashUsed=route?num(route.brokerCashAllocated):0;
    const totalBuyingPower=route?num(route.totalAllocated):previewRows.reduce((s,r)=>s+num(r.amount),0);
    const income=route?num(route.expectedAnnualIncome):previewRows.reduce((s,r)=>s+num(r.expectedAnnualIncome||num(r.amount)*num(r.yieldPct)/100),0);
    const approvedTargets=(plan?.allocations||[]).length;
    const financeRouteRows=route?.allocations||[];
    const brokerPending=route?financeRouteRows.filter(r=>!brokerReady(r)).length:approvedTargets;
    const executionReady=route?Math.max(0,approvedTargets-brokerPending):0;
    const badge=route?.locked?'LOCKED':route&&brokerPending===0&&approvedTargets?'EXECUTION READY':approvedTargets?'BROKER GATE':'PREVIEW';
    const badgeClass=route?.locked||badge==='EXECUTION READY'?'good':'warn';
    return `<section class="transfer-intel-panel red"><div class="transfer-intel-head"><div><p class="eyebrow">STAGE T3 · ALLOCATION PREVIEW</p><h2>Mission deployment preview</h2><p>Scouting chooses what to buy. Transfer decides the broker, how much existing broker cash is usable, and how many whole pounds need to move from payday cash.</p></div><span class="transfer-intel-badge ${badgeClass}">${badge}</span></div><div class="transfer-intel-grid"><article class="transfer-intel-stat"><span>FINANCE BUDGET</span><strong>${money(mission?.budget)}</strong></article><article class="transfer-intel-stat"><span>PAYDAY USED</span><strong>${money(financeUsed)}</strong></article><article class="transfer-intel-stat"><span>PAYDAY KEPT</span><strong>${money(paydayKept)}</strong></article><article class="transfer-intel-stat"><span>BROKER CASH USED</span><strong>${money(brokerCashUsed)}</strong></article><article class="transfer-intel-stat"><span>TOTAL BUYING POWER</span><strong>${money(totalBuyingPower)}</strong></article><article class="transfer-intel-stat"><span>APPROVED TARGETS</span><strong>${approvedTargets}</strong></article><article class="transfer-intel-stat"><span>EXECUTION READY</span><strong>${executionReady}</strong></article><article class="transfer-intel-stat"><span>BROKER PENDING</span><strong>${brokerPending}</strong></article><article class="transfer-intel-stat"><span>EST. ANNUAL INCOME</span><strong>${money(income)}</strong></article></div><div class="transfer-deploy-list">${previewRows.length?previewRows.map((r,i)=>`<div class="transfer-deploy-row"><strong>#${i+1}</strong><div><strong>${esc(upper(r.ticker))} · ${esc(r.name||r.ticker)}</strong><small>${esc(r.fundingSource||'FINANCE')}</small></div><div><strong>${esc(brokerLabel(r))}</strong><small>${brokerReady(r)?'broker ready':'broker pending'}</small></div><div><strong>${pct(r.yieldPct)}</strong><small>yield</small></div><div><strong>${money(r.amount)}</strong><small>planned buy</small></div></div>`).join(''):'<div class="transfer-intel-empty">Release a Finance mission and approve a Scouting plan to build the deployment preview.</div>'}</div><div class="transfer-intel-actions"><button type="button" data-intel-build class="primary" ${!mission||!plan?.allocations?.length||route?.locked?'disabled':''}>Build Approved Route</button><button type="button" data-intel-lock ${!route?.allocations?.length||route?.locked||brokerPending?'disabled':''}>Save + Lock Route</button></div></section>`;
  }

  function pacePanel(state){
    const squad=squadMetrics(state),plan=readPlan(),strategies=strategyRows(state),route=routeRows(state);
    const routeYield=route.length?weightedYield(route):strategies.maximum.yield;
    const goal=projectedGoalDate(squad.annual,plan.monthlyContribution,routeYield),requiredAnnual=Math.max(0,TARGET_MONTHLY_INCOME*12-squad.annual),requiredYield=plan.monthlyContribution>0?requiredAnnual/(plan.monthlyContribution*12)*100:0;
    const extra=routeYield>0?Math.max(0,(requiredAnnual/(routeYield/100)/12)-plan.monthlyContribution):0;
    return `<section class="transfer-intel-panel gold"><div class="transfer-intel-head"><div><p class="eyebrow">PHASE 2 · TARGET PACE DECISION ENGINE</p><h2>£2,000/month route intelligence</h2><p>Transfer measures the clean portfolio and current approved route against the income target without bypassing Scouting or broker gates.</p></div><span class="transfer-intel-badge ${goal&&goal.getFullYear()<=2034?'good':'warn'}">${extra>0?'KEEP QUALITY · RAISE CONTRIBUTION':'ON TARGET PACE'}</span></div><div class="transfer-intel-grid"><article class="transfer-intel-stat"><span>CURRENT MONTHLY INCOME</span><strong>${money(squad.monthly)}</strong></article><article class="transfer-intel-stat"><span>CURRENT ANNUAL INCOME</span><strong>${money(squad.annual)}</strong></article><article class="transfer-intel-stat"><span>RECOMMENDED ROUTE YIELD</span><strong>${pct(routeYield)}</strong></article><article class="transfer-intel-stat"><span>PROJECTED £2K DATE</span><strong>${fmtDate(goal)}</strong></article><article class="transfer-intel-stat"><span>REQUIRED YIELD AT PLAN</span><strong>${pct(requiredYield)}</strong></article><article class="transfer-intel-stat"><span>EXTRA MONTHLY TO HOLD GOAL</span><strong>${money(extra)}</strong></article></div><div class="transfer-pace-callout"><strong>${extra>0?'KEEP QUALITY ROUTE + RAISE CONTRIBUTION':'ROUTE SUPPORTS CURRENT TARGET PACE'}</strong><div>${extra>0?`At the current route yield, roughly ${money(extra)} extra per month would close the remaining income gap faster without chasing an unapproved high-yield share.`:'The current approved route and contribution level are sufficient under this simplified clean projection.'}</div></div><div class="transfer-pace-controls"><label>MONTHLY INVESTMENT PLAN £<input id="transferMonthlyPlan" type="number" min="0" step="50" value="${num(plan.monthlyContribution).toFixed(2)}"></label><button type="button" data-update-plan>Update Target Pace</button></div><h3 style="margin-top:18px">Three-way strategy comparison</h3><div class="transfer-strategy-grid">${[['Sustainable Income',strategies.sustainable],['Maximum Income',strategies.maximum],['Custom Basket',strategies.custom]].map(([name,s],i)=>`<article class="transfer-strategy-card ${i===0?'recommended':''}"><h3>${name}</h3><div class="transfer-strategy-metrics"><div><span>ROUTE YIELD</span><strong>${pct(s.yield)}</strong></div><div><span>ELIGIBLE TARGETS</span><strong>${s.count}</strong></div><div><span>PROJECTED DATE</span><strong>${fmtDate(projectedGoalDate(squad.annual,plan.monthlyContribution,s.yield))}</strong></div><div><span>STATUS</span><strong>${s.count?'SUPPORTED':'WAITING'}</strong></div></div></article>`).join('')}</div></section>`;
  }

  function render(){
    const A=window.AuroraClean,host=ensure();if(!A||!host)return;
    const state=A.readState();host.innerHTML=missionPanel(state)+shortlistPanel(state)+previewPanel(state)+pacePanel(state);bindActions();
  }

  function bindActions(){
    document.querySelector('[data-intel-build]')?.addEventListener('click',()=>document.getElementById('transferStage2Build')?.click());
    document.querySelector('[data-intel-lock]')?.addEventListener('click',()=>document.getElementById('transferStage2Lock')?.click());
    document.querySelector('[data-update-plan]')?.addEventListener('click',()=>{writePlan({monthlyContribution:Math.max(0,num($('transferMonthlyPlan')?.value))});render()});
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    render();window.addEventListener('aurora-clean:state',render);window.addEventListener('aurora:market-prices',render);
    window.AuroraTransferIntelligence=Object.freeze({BUILD,render,brokerReady,approvedRows,routeRows});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();