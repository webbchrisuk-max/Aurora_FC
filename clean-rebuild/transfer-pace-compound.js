(() => {
  'use strict';
  const BUILD='20260827-transfer-pace-compound-1';
  const TARGET_ANNUAL=24000;
  const PLAN_KEY='aurora-clean:transfer-target-plan:v1';
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const pct=v=>`${num(v).toFixed(2)}%`;
  const active=s=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(s||'ACTIVE'));

  function readPlan(){try{return JSON.parse(localStorage.getItem(PLAN_KEY)||'null')||{monthlyContribution:1000}}catch(_){return{monthlyContribution:1000}}}
  function squadAnnual(state){return (state.squad?.holdings||[]).filter(h=>active(h.status)&&num(h.shares)>0).reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp)||num(h.shares)*num(h.annualDpsGbp)),0)}
  function routeRows(state){const r=state.transfer?.route;return r?[...(r.allocations||[]),...(r.brokerCashAllocations||[])]:[]}
  function weightedYield(rows){const total=rows.reduce((s,r)=>s+Math.max(0,num(r.amount)),0);return total>0?rows.reduce((s,r)=>s+Math.max(0,num(r.amount))*Math.max(0,num(r.yieldPct)),0)/total:0}
  function approvedPlanYield(state){const a=state.scouting?.allocationPlan;if(upper(a?.status)!=='APPROVED'||!Array.isArray(a.allocations))return 0;return weightedYield(a.allocations)}
  function candidateYield(state,mode='maximum'){
    const rows=(state.scouting?.candidates||[]).filter(r=>num(r.yieldPct)>0&&!['BLOCKED','REJECTED'].includes(upper(r.status||r.verdict||r.signal)));
    if(!rows.length)return 0;
    const sorted=[...rows].sort(mode==='maximum'?(a,b)=>num(b.yieldPct)-num(a.yieldPct):(a,b)=>num(b.score||b.buyStrength)-num(a.score||a.buyStrength)||num(b.yieldPct)-num(a.yieldPct));
    const top=sorted.slice(0,Math.min(4,sorted.length));return top.reduce((s,r)=>s+num(r.yieldPct),0)/top.length;
  }
  function yieldAuthority(state){
    const route=routeRows(state),routeYield=weightedYield(route);if(routeYield>0)return{yield:routeYield,label:'LOCKED / CURRENT ROUTE',exact:true};
    const approved=approvedPlanYield(state);if(approved>0)return{yield:approved,label:'APPROVED SCOUTING PLAN',exact:true};
    const sustainable=candidateYield(state,'sustainable'),maximum=candidateYield(state,'maximum');
    if(maximum>0||sustainable>0)return{yield:Math.max(sustainable,maximum),low:Math.min(...[sustainable,maximum].filter(x=>x>0)),high:Math.max(sustainable,maximum),label:'PLANNING RANGE · ROUTE NOT YET APPROVED',exact:false};
    return{yield:0,label:'AWAITING APPROVED ROUTE',exact:false};
  }
  function simulate(currentAnnual,monthlyContribution,yieldPct,maxMonths=360){
    const y=Math.max(0,num(yieldPct))/100;if(currentAnnual>=TARGET_ANNUAL)return 0;if(!(monthlyContribution>0)||!(y>0))return null;
    let annual=Math.max(0,currentAnnual);
    for(let m=1;m<=maxMonths;m++){
      const monthlyDividend=annual/12;
      annual+=(monthlyContribution+monthlyDividend)*y;
      if(annual>=TARGET_ANNUAL)return m;
    }
    return null;
  }
  function fmtMonths(months){if(months===null)return'Awaiting approved route';if(months===0)return'Target reached';const d=new Date();d.setMonth(d.getMonth()+months);const years=months/12;return `${d.toLocaleDateString('en-GB',{month:'short',year:'numeric'})} · ${years.toFixed(1)} yrs`}
  function findStat(panel,label){return [...panel.querySelectorAll('.transfer-intel-stat')].find(el=>el.querySelector('span')?.textContent.trim()===label)}
  function setStat(panel,label,value,sub){const stat=findStat(panel,label);if(!stat)return;const strong=stat.querySelector('strong');if(strong)strong.textContent=value;if(sub){let small=stat.querySelector('small');if(!small){small=document.createElement('small');stat.appendChild(small)}small.textContent=sub}}
  function apply(){
    const A=window.AuroraClean;if(!A)return false;
    const panel=[...document.querySelectorAll('.transfer-intel-panel')].find(p=>p.textContent.includes('£2,000/month route intelligence'));if(!panel)return false;
    const state=A.readState(),plan=readPlan(),currentAnnual=squadAnnual(state),auth=yieldAuthority(state),monthly=Math.max(0,num(plan.monthlyContribution));
    let targetText='Awaiting approved route',pace='ROUTE NOT READY',callout='Approve the Scouting allocation or build the Transfer route before Aurora publishes an exact £2,000/month date.';
    if(auth.yield>0){
      if(auth.exact){const months=simulate(currentAnnual,monthly,auth.yield);targetText=fmtMonths(months);pace=months!==null&&months<=120?'ON TARGET PACE':months!==null?'LONG-RANGE TARGET':'PLAN NEEDS MORE CAPITAL';callout=`Projection compounds the ${money(monthly)} monthly investment plus all forecast dividend income reinvested at ${pct(auth.yield)}. This is a planning projection, not a guaranteed return.`;}
      else {const lowMonths=simulate(currentAnnual,monthly,auth.low||auth.yield),highMonths=simulate(currentAnnual,monthly,auth.high||auth.yield);if(lowMonths!==null&&highMonths!==null){const fast=Math.min(lowMonths,highMonths),slow=Math.max(lowMonths,highMonths);targetText=`${(fast/12).toFixed(1)}–${(slow/12).toFixed(1)} years`;pace=slow<=120?'ON TARGET RANGE':'PLANNING RANGE';callout=`No route is approved yet, so Aurora shows a planning range using the strongest current Scouting strategy yields. Exact dating starts once the route is approved.`;}}
    }
    setStat(panel,'RECOMMENDED ROUTE YIELD',auth.yield>0?pct(auth.yield):'—',auth.label);
    setStat(panel,'PROJECTED £2K DATE',targetText,'Monthly contributions + reinvested dividends');
    setStat(panel,'REQUIRED YIELD AT PLAN','—','Replaced by compound target modelling');
    setStat(panel,'EXTRA MONTHLY TO HOLD GOAL','—','Calculated only from an approved route');
    const badge=panel.querySelector('.transfer-intel-head .transfer-intel-badge');if(badge){badge.textContent=pace;badge.classList.toggle('good',/ON TARGET/.test(pace));badge.classList.toggle('warn',!/ON TARGET/.test(pace));}
    const box=panel.querySelector('.transfer-pace-callout');if(box)box.innerHTML=`<strong>${pace}</strong><div>${callout}</div>`;
    panel.dataset.compoundPace=BUILD;return true;
  }
  function boot(){let tries=0;const run=()=>{tries++;if(apply()||tries>100)return;setTimeout(run,80)};run();window.addEventListener('aurora-clean:state',()=>setTimeout(apply,0));window.addEventListener('aurora:market-prices',()=>setTimeout(apply,0));document.addEventListener('click',e=>{if(e.target.closest?.('[data-update-plan],[data-intel-build],[data-intel-lock]'))setTimeout(apply,80)});const obs=new MutationObserver(()=>{if(!document.body.dataset.paceApplying){document.body.dataset.paceApplying='1';requestAnimationFrame(()=>{apply();delete document.body.dataset.paceApplying})}});obs.observe(document.body,{childList:true,subtree:true});window.AuroraTransferPace=Object.freeze({BUILD,apply,simulate,yieldAuthority});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
