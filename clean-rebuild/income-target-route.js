(() => {
  'use strict';

  const BUILD='20260902-income-route-2k-1';
  const TARGET_MONTHLY=2000;
  const TARGET_ANNUAL=TARGET_MONTHLY*12;
  const PLAN_KEY='aurora-clean:income-target-route:v1';
  const TRANSFER_PLAN_KEY='aurora-clean:transfer-target-plan:v1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const pct=v=>`${num(v).toFixed(2)}%`;
  const active=h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0;

  function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}

  function defaults(){
    const transfer=read(TRANSFER_PLAN_KEY)||{};
    return{
      monthlyContribution:Math.max(0,num(transfer.monthlyContribution)||1500),
      tescoCapital:75000,
      tescoDate:'2029-03',
      goalYears:8
    };
  }
  function plan(){return {...defaults(),...(read(PLAN_KEY)||{})}}

  function squadMetrics(state){
    const rows=(state.squad?.holdings||[]).filter(active);
    const annual=rows.reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp)||num(h.shares)*num(h.annualDpsGbp)),0);
    const market=rows.reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp??h.priceGbp)),0);
    return{annual,monthly:annual/12,market,portfolioYield:market>0?annual/market*100:0};
  }
  function routeRows(state){const r=state.transfer?.route;return r?[...(r.allocations||[]),...(r.brokerCashAllocations||[])]:[]}
  function weightedYield(rows){const total=rows.reduce((s,r)=>s+Math.max(0,num(r.amount)),0);return total>0?rows.reduce((s,r)=>s+Math.max(0,num(r.amount))*Math.max(0,num(r.yieldPct)),0)/total:0}
  function yieldAuthority(state,metrics){
    const routeYield=weightedYield(routeRows(state));
    if(routeYield>0)return{yield:routeYield,label:'Current Transfer route',exact:true};
    const approved=state.scouting?.allocationPlan;
    if(upper(approved?.status)==='APPROVED'&&Array.isArray(approved.allocations)){
      const y=weightedYield(approved.allocations);if(y>0)return{yield:y,label:'Approved Scouting plan',exact:true};
    }
    const candidates=(state.scouting?.candidates||[]).filter(r=>num(r.yieldPct)>0&&!['BLOCKED','REJECTED'].includes(upper(r.status||r.verdict||r.signal)));
    if(candidates.length){const top=[...candidates].sort((a,b)=>num(b.score||b.buyStrength)-num(a.score||a.buyStrength)||num(b.yieldPct)-num(a.yieldPct)).slice(0,4);const y=top.reduce((s,r)=>s+num(r.yieldPct),0)/top.length;if(y>0)return{yield:y,label:'Current Scouting planning yield',exact:false};}
    if(metrics.portfolioYield>0)return{yield:metrics.portfolioYield,label:'Current portfolio income yield',exact:false};
    return{yield:0,label:'Awaiting usable yield evidence',exact:false};
  }

  function monthIndexFromNow(yyyyMm){
    const m=String(yyyyMm||'').match(/^(\d{4})-(\d{2})$/);if(!m)return null;
    const now=new Date(),year=Number(m[1]),month=Number(m[2])-1;
    return Math.max(0,(year-now.getFullYear())*12+(month-now.getMonth()));
  }
  function simulate(currentAnnual,monthlyContribution,yieldPct,{tescoCapital=0,tescoMonth=null,maxMonths=480}={}){
    const y=Math.max(0,num(yieldPct))/100;if(currentAnnual>=TARGET_ANNUAL)return 0;if(!(y>0))return null;
    let annual=Math.max(0,currentAnnual);
    for(let m=1;m<=maxMonths;m++){
      if(tescoMonth!==null&&m===tescoMonth&&tescoCapital>0)annual+=tescoCapital*y;
      const reinvested=annual/12;
      annual+=(Math.max(0,monthlyContribution)+reinvested)*y;
      if(annual>=TARGET_ANNUAL)return m;
    }
    return null;
  }
  function dateFromMonths(months){if(months===null)return null;const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+months);return d}
  function fmtDate(months){const d=dateFromMonths(months);return d?d.toLocaleDateString('en-GB',{month:'short',year:'numeric'}):'Not projected'}
  function fmtYears(months){return months===null?'—':months===0?'Reached':`${(months/12).toFixed(1)} years`}

  function ensure(){
    let host=$('incomeTargetRoute');if(host)return host;
    const current=$('incomeConnection')?.closest('.department-section')||document.querySelector('body[data-page="income-real"]>.department-section');
    if(!current)return null;
    host=document.createElement('section');host.id='incomeTargetRoute';host.className='department-section income-route-panel';current.insertAdjacentElement('afterend',host);return host;
  }

  function render(){
    const A=window.AuroraClean,host=ensure();if(!A||!host)return;
    const state=A.readState(),m=squadMetrics(state),p=plan(),auth=yieldAuthority(state,m),tescoMonth=monthIndexFromNow(p.tescoDate);
    const progress=Math.min(100,m.monthly/TARGET_MONTHLY*100),monthlyGap=Math.max(0,TARGET_MONTHLY-m.monthly),annualGap=Math.max(0,TARGET_ANNUAL-m.annual);
    const without=auth.yield>0?simulate(m.annual,p.monthlyContribution,auth.yield):null;
    const withTesco=auth.yield>0?simulate(m.annual,p.monthlyContribution,auth.yield,{tescoCapital:p.tescoCapital,tescoMonth}):null;
    const saved=without!==null&&withTesco!==null?Math.max(0,without-withTesco):null;
    const tescoBoost=auth.yield>0?p.tescoCapital*(auth.yield/100):0;
    const goalMonths=Math.max(1,Math.round(Math.max(1,num(p.goalYears))*12));
    const onCourse=withTesco!==null&&withTesco<=goalMonths;
    const status=withTesco===null?'PROJECTION NOT READY':onCourse?'ON COURSE':'OFF COURSE';
    const statusClass=onCourse?'good':'bad';
    const paceText=withTesco===null?'Aurora needs a usable route, scouting or portfolio yield before it can publish a target date.':onCourse?`Current plan reaches £2,000/month inside your ${num(p.goalYears).toFixed(1)}-year course line.`:`Current plan projects beyond your ${num(p.goalYears).toFixed(1)}-year course line.`;
    const tescoDateLabel=p.tescoDate?new Date(`${p.tescoDate}-01T12:00:00`).toLocaleDateString('en-GB',{month:'long',year:'numeric'}):'Not set';

    host.innerHTML=`
      <div class="section-heading income-route-head"><div><p class="eyebrow">ROUTE TO £2,000 / MONTH</p><h2>Are you on course?</h2><p>Aurora projects your current dividend run-rate, monthly investing, dividend reinvestment and the Tesco maturity impact.</p></div><div class="income-route-status ${statusClass}"><span>COURSE STATUS</span><strong>${status}</strong><small>${paceText}</small></div></div>
      <div class="income-route-progress"><div class="income-route-progress-copy"><strong>${progress.toFixed(1)}% complete</strong><span>${money(m.monthly)} / ${money(TARGET_MONTHLY)} per month</span></div><div class="income-route-track"><i style="width:${progress}%"></i></div><div class="income-route-gap">Still to build: <strong>${money(monthlyGap)}/month</strong> · ${money(annualGap)}/year</div></div>
      <div class="income-route-grid">
        <article><span>CURRENT MONTHLY INCOME</span><strong>${money(m.monthly)}</strong><small>${money(m.annual)} annual forward income</small></article>
        <article><span>PROJECTED £2K DATE</span><strong>${withTesco===null?'—':fmtDate(withTesco)}</strong><small>${fmtYears(withTesco)} with Tesco maturity included</small></article>
        <article><span>WITHOUT TESCO MATURITY</span><strong>${without===null?'—':fmtDate(without)}</strong><small>${fmtYears(without)} on monthly investing + reinvested dividends</small></article>
        <article class="tesco"><span>TESCO MATURITY IMPACT</span><strong>${tescoBoost>0?`+${money(tescoBoost)}/yr`:'—'}</strong><small>${money(p.tescoCapital)} assumed invested from ${tescoDateLabel}${saved!==null?` · saves ${(saved/12).toFixed(1)} years`:''}</small></article>
      </div>
      <div class="income-route-course-line"><div><span>PLANNING YIELD</span><strong>${auth.yield>0?pct(auth.yield):'—'}</strong><small>${auth.label}${auth.exact?' · approved/current evidence':' · planning estimate'}</small></div><div><span>MONTHLY INVESTMENT</span><strong>${money(p.monthlyContribution)}</strong><small>Read from your route plan unless changed below</small></div><div><span>GOAL HORIZON</span><strong>${num(p.goalYears).toFixed(1)} years</strong><small>Green if the projection reaches the target inside this window</small></div></div>
      <details class="income-route-settings"><summary>Projection assumptions</summary><div class="income-route-inputs"><label>Monthly investment £<input id="incomeRouteMonthly" type="number" min="0" step="50" value="${num(p.monthlyContribution).toFixed(0)}"></label><label>Tesco maturity capital £<input id="incomeRouteTesco" type="number" min="0" step="1000" value="${num(p.tescoCapital).toFixed(0)}"></label><label>Tesco maturity month<input id="incomeRouteTescoDate" type="month" value="${String(p.tescoDate||'')}"></label><label>Goal horizon years<input id="incomeRouteGoalYears" type="number" min="1" max="30" step="0.5" value="${num(p.goalYears).toFixed(1)}"></label></div><div class="finance-actions"><button id="incomeRouteSave" type="button">Save Projection Assumptions</button></div><p>Projection only: it assumes new money and reinvested dividends earn the displayed planning yield. It is not a guaranteed return.</p></details>`;

    $('incomeRouteSave')?.addEventListener('click',()=>{
      const next={monthlyContribution:Math.max(0,num($('incomeRouteMonthly')?.value)),tescoCapital:Math.max(0,num($('incomeRouteTesco')?.value)),tescoDate:String($('incomeRouteTescoDate')?.value||''),goalYears:Math.max(1,num($('incomeRouteGoalYears')?.value)||8)};
      write(PLAN_KEY,next);render();
    });
  }

  function boot(){if(!window.AuroraClean){setTimeout(boot,60);return}render();window.addEventListener('aurora-clean:state',render);window.addEventListener('focus',render);document.getElementById('incomeRefresh')?.addEventListener('click',()=>setTimeout(render,900));window.AuroraIncomeTargetRoute=Object.freeze({BUILD,render,simulate,yieldAuthority});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
