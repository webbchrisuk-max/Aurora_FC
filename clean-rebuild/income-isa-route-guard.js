(() => {
  'use strict';
  const BUILD='20260924-income-isa-route-guard-1';
  const PLAN_KEY='aurora-clean:income-target-route:v1';
  const ISA_KEY='aurora-clean:isa-tracker-v1';
  const GUARD_KEY='aurora-clean:income-route-isa-guard:v1';
  const TARGET_ANNUAL=24000;
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const upper=v=>String(v||'').trim().toUpperCase();

  function holdingsMetrics(state){
    const rows=(state?.squad?.holdings||[]).filter(h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0);
    const annual=rows.reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp)||num(h.shares)*num(h.annualDpsGbp)),0);
    const market=rows.reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp??h.priceGbp)),0);
    return {annual,monthly:annual/12,market,portfolioYield:market>0?annual/market*100:0};
  }

  function weightedYield(rows){
    const total=(rows||[]).reduce((s,r)=>s+Math.max(0,num(r.amount)),0);
    return total>0?(rows||[]).reduce((s,r)=>s+Math.max(0,num(r.amount))*Math.max(0,num(r.yieldPct)),0)/total:0;
  }

  function planningYield(state,m){
    const route=state?.transfer?.route;
    const routeRows=route?[...(route.allocations||[]),...(route.brokerCashAllocations||[])]:[];
    const ry=weightedYield(routeRows); if(ry>0)return ry;
    const approved=state?.scouting?.allocationPlan;
    if(upper(approved?.status)==='APPROVED'){const y=weightedYield(approved.allocations||[]);if(y>0)return y;}
    const candidates=(state?.scouting?.candidates||[]).filter(r=>num(r.yieldPct)>0&&!['BLOCKED','REJECTED'].includes(upper(r.status||r.verdict||r.signal)));
    if(candidates.length){const top=[...candidates].sort((a,b)=>num(b.score||b.buyStrength)-num(a.score||a.buyStrength)||num(b.yieldPct)-num(a.yieldPct)).slice(0,4);const y=top.reduce((s,r)=>s+num(r.yieldPct),0)/top.length;if(y>0)return y;}
    return m.portfolioYield;
  }

  function isaTracker(state){
    const fallback={taxYear:'2026/27',annualAllowance:20000,monzoCash:753.04,monzoStocks:5200,trading212:9440,igCurrentNet:0,igFlexibleReplacement:50510.31};
    const fromState=state?.finance?.isaTracker;
    const fromLocal=read(ISA_KEY);
    const v=(fromState&&fromState.taxYear==='2026/27')?fromState:(fromLocal&&fromLocal.taxYear==='2026/27')?fromLocal:fallback;
    const annual=Math.max(0,num(v.annualAllowance)||20000);
    const used=Math.max(0,num(v.monzoCash)+num(v.monzoStocks)+num(v.trading212)+num(v.igCurrentNet));
    return {taxYear:String(v.taxYear||'2026/27'),annualAllowance:annual,used,normalLeft:Math.max(0,annual-used),flexibleReplacement:Math.max(0,num(v.igFlexibleReplacement))};
  }

  function taxYearKey(d){const y=d.getFullYear(),m=d.getMonth(),s=m>=3?y:y-1;return s+'/'+String((s+1)%100).padStart(2,'0')}
  function monthOffset(yyyyMm){const m=String(yyyyMm||'').match(/^(\d{4})-(\d{2})$/);if(!m)return null;const now=new Date();return Math.max(0,(Number(m[1])-now.getFullYear())*12+(Number(m[2])-1-now.getMonth()))}
  function nextReset(){const now=new Date();const y=(now.getMonth()>3||(now.getMonth()===3&&now.getDate()>=6))?now.getFullYear()+1:now.getFullYear();return new Date(y,3,6,12)}
  function monthsBeforeReset(){const now=new Date();let count=0;for(let i=1;i<=18;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,15);if(d.getMonth()===3)break;count++}return count}

  function simulate(currentAnnual,monthlyContribution,yieldPct,isa,opts={}){
    const y=Math.max(0,num(yieldPct))/100;if(!(y>0))return null;
    let annual=Math.max(0,currentAnnual),pendingTesco=0,activeYear='',normal=0,flex=0;
    const now=new Date(),currentYear=taxYearKey(now),tescoMonth=opts.tescoMonth,tescoCapital=Math.max(0,num(opts.tescoCapital)),useFlex=!!opts.useFlex;
    for(let m=1;m<=480;m++){
      const d=new Date(now.getFullYear(),now.getMonth()+m,15),year=taxYearKey(d);
      if(year!==activeYear){activeYear=year;normal=year===currentYear?isa.normalLeft:isa.annualAllowance;flex=year===currentYear&&useFlex?isa.flexibleReplacement:0;}
      if(tescoMonth!==null&&m===tescoMonth)pendingTesco+=tescoCapital;
      const desired=Math.max(0,num(monthlyContribution));
      const normalRegular=Math.min(desired,normal);normal-=normalRegular;
      const flexRegular=Math.min(Math.max(0,desired-normalRegular),flex);flex-=flexRegular;
      const regular=normalRegular+flexRegular;
      const cap=Math.max(0,normal)+Math.max(0,flex);
      const tesco=Math.min(pendingTesco,cap);
      const fromNormal=Math.min(tesco,normal);normal-=fromNormal;
      const fromFlex=Math.min(tesco-fromNormal,flex);flex-=fromFlex;pendingTesco-=tesco;
      const reinvested=annual/12;
      annual+=(regular+tesco+reinvested)*y;
      if(annual>=TARGET_ANNUAL)return {months:m,pendingTesco};
    }
    return {months:null,pendingTesco};
  }

  function dateFromMonths(months){if(months===null||months===undefined)return null;const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+months);return d}
  function fmtDate(months){const d=dateFromMonths(months);return d?d.toLocaleDateString('en-GB',{month:'short',year:'numeric'}):'Not projected'}
  function fmtYears(months){return months===null||months===undefined?'—':months===0?'Reached':(months/12).toFixed(1)+' years'}
  function cardByLabel(label){return [...document.querySelectorAll('#incomeTargetRoute article')].find(a=>String(a.querySelector('span')?.textContent||'').trim()===label)||null}
  function lineByLabel(label){return [...document.querySelectorAll('#incomeTargetRoute .income-route-course-line>div')].find(a=>String(a.querySelector('span')?.textContent||'').trim()===label)||null}

  function ensurePanel(host){
    let panel=document.getElementById('incomeIsaRouteGuard');
    if(panel)return panel;
    panel=document.createElement('div');panel.id='incomeIsaRouteGuard';panel.className='income-route-isa-guard';
    const settings=host.querySelector('.income-route-settings');
    if(settings)settings.insertAdjacentElement('beforebegin',panel);else host.appendChild(panel);
    return panel;
  }

  function guardSettings(){const saved=read(GUARD_KEY)||{};return {useFlex:!!saved.useFlex}}

  function render(){
    const A=window.AuroraClean,host=document.getElementById('incomeTargetRoute');if(!A||!host)return;
    const state=A.readState(),m=holdingsMetrics(state),isa=isaTracker(state),p={monthlyContribution:1000,tescoCapital:75000,tescoDate:'2029-03',goalYears:8,...(read(PLAN_KEY)||{})},g=guardSettings();
    const y=planningYield(state,m),tescoMonth=monthOffset(p.tescoDate);
    const without=simulate(m.annual,p.monthlyContribution,y,isa,{useFlex:g.useFlex});
    const withTesco=simulate(m.annual,p.monthlyContribution,y,isa,{useFlex:g.useFlex,tescoCapital:p.tescoCapital,tescoMonth});
    const goalMonths=Math.max(1,Math.round(Math.max(1,num(p.goalYears)||8)*12));
    const onCourse=withTesco?.months!==null&&withTesco?.months<=goalMonths;

    const dateCard=cardByLabel('PROJECTED £2K DATE');if(dateCard){dateCard.querySelector('strong').textContent=fmtDate(withTesco?.months??null);dateCard.querySelector('small').textContent=fmtYears(withTesco?.months??null)+' · ISA allowance aware';}
    const withoutCard=cardByLabel('WITHOUT TESCO MATURITY');if(withoutCard){withoutCard.querySelector('strong').textContent=fmtDate(without?.months??null);withoutCard.querySelector('small').textContent=fmtYears(without?.months??null)+' · ISA allowance aware';}
    const tescoCard=cardByLabel('TESCO MATURITY IMPACT');if(tescoCard){const small=tescoCard.querySelector('small');if(small)small.textContent=money(p.tescoCapital)+' becomes available from '+String(p.tescoDate||'')+' and is staged through available ISA allowance, not assumed invested all at once.'}
    const status=host.querySelector('.income-route-status');if(status){status.classList.toggle('good',onCourse);status.classList.toggle('bad',!onCourse);const strong=status.querySelector('strong');if(strong)strong.textContent=onCourse?'ON COURSE':'OFF COURSE';const small=status.querySelector('small');if(small)small.textContent=onCourse?'ISA-aware plan reaches the target inside your course line.':'ISA-aware plan projects beyond your course line.'}

    const monthLine=lineByLabel('MONTHLY INVESTMENT')||lineByLabel('PLANNED MONTHLY INVESTMENT');
    if(monthLine){monthLine.querySelector('span').textContent='PLANNED MONTHLY INVESTMENT';monthLine.querySelector('strong').textContent=money(p.monthlyContribution);monthLine.querySelector('small').textContent='Aurora now limits actual new ISA money to available allowance.'}

    const months=monthsBeforeReset(),wanted=Math.max(0,num(p.monthlyContribution))*months,capacity=isa.normalLeft+(g.useFlex?isa.flexibleReplacement:0),shortfall=Math.max(0,wanted-capacity),full=Math.max(0,num(p.monthlyContribution))>0?Math.floor(isa.normalLeft/Math.max(1,num(p.monthlyContribution))):0,partial=Math.max(0,isa.normalLeft-full*Math.max(0,num(p.monthlyContribution)));
    const panel=ensurePanel(host);
    panel.innerHTML='<div class="income-route-isa-head"><div><span>ISA ROUTE GUARD</span><strong>'+money(isa.normalLeft)+' normal allowance left</strong><small>2026/27 · Monzo roundups reduce this automatically</small></div><div><span>NEXT RESET</span><strong>'+nextReset().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'</strong><small>Future projection assumes '+money(isa.annualAllowance)+' annual allowance stays unchanged</small></div></div><p>At <b>'+money(p.monthlyContribution)+'/month</b>, '+money(wanted)+' is planned before the April reset. Normal allowance funds <b>'+full+' full month'+(full===1?'':'s')+'</b>'+(partial>0?' plus <b>'+money(partial)+'</b> of the next':'')+'. '+(shortfall>0&&!g.useFlex?'<b>'+money(shortfall)+'</b> would remain as cash until the new tax year unless you deliberately use valid IG flexible replacement capacity or invest outside an ISA.':'The selected ISA capacity covers the planned contributions before reset.')+'</p><label class="income-route-isa-toggle"><input id="incomeRouteUseFlexGuard" type="checkbox" '+(g.useFlex?'checked':'')+'> Include current-year IG flexible replacement capacity ('+money(isa.flexibleReplacement)+') in this projection</label>';
    document.getElementById('incomeRouteUseFlexGuard')?.addEventListener('change',e=>{write(GUARD_KEY,{useFlex:!!e.target.checked});render()},{once:true});
  }

  let timer=null;
  function schedule(delay=80){clearTimeout(timer);timer=setTimeout(render,delay)}
  function boot(){if(!window.AuroraClean){setTimeout(boot,60);return}schedule(700);window.addEventListener('aurora-clean:state',()=>schedule(120));window.addEventListener('focus',()=>schedule(120));document.getElementById('incomeRefresh')?.addEventListener('click',()=>schedule(1100));document.addEventListener('click',e=>{if(e.target?.id==='incomeRouteSave')schedule(100)});window.AuroraIncomeIsaRouteGuard=Object.freeze({BUILD,render,simulate,isaTracker});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();