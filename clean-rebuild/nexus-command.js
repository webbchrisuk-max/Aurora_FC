(() => {
  'use strict';

  const BUILD='20260827-nexus-command-next-dividend-2';
  const INCOME_CACHE_KEY='aurora-clean:income-snapshot:v1';
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const activeHolding=h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0;

  function metrics(state){
    const holdings=(state.squad?.holdings||[]).filter(activeHolding);
    const market=holdings.reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp||h.currentValueGbp||num(h.shares)*num(h.livePriceGbp))),0);
    const book=holdings.reduce((s,h)=>s+Math.max(0,num(h.bookCostGbp||h.costBasisGbp)),0);
    const annual=holdings.reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp||num(h.shares)*num(h.annualDpsGbp))),0);
    return {holdings,market,book,pnl:market-book,annual,monthly:annual/12};
  }

  function readIncomeSnapshot(){
    try{
      const cached=JSON.parse(localStorage.getItem(INCOME_CACHE_KEY)||'null');
      return cached?.snapshot&&typeof cached.snapshot==='object'?cached.snapshot:null;
    }catch(_){return null;}
  }

  function parseDividendDate(value){
    if(value===null||value===undefined||value==='')return NaN;
    if(typeof value==='number'&&Number.isFinite(value))return Date.UTC(1899,11,30)+Math.round(value)*86400000+12*3600000;
    const raw=String(value).trim();
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    return Date.parse(raw);
  }

  function normaliseDividend(raw={}){
    const date=parseDividendDate(raw.payDate??raw.pay_date??raw.paymentDate??raw.payment_date??raw.date);
    const shares=Math.max(0,num(raw.sharesEligible??raw.shares_eligible??raw.eligibleShares));
    const dps=Math.max(0,num(raw.dividendPerShareGbp??raw.dividend_per_share_gbp??raw.dpsGbp));
    const expected=Math.max(0,num(raw.expectedAmountGbp??raw.expected_amount_gbp??raw.grossDividendGbp??raw.gross_dividend_gbp??raw.amountGbp??raw.amount));
    return {
      ticker:upper(raw.ticker||raw.symbol),
      name:String(raw.name||raw.company||raw.ticker||''),
      status:upper(raw.status||'FORECAST'),
      date,
      amount:expected>0?expected:(shares>0&&dps>0?shares*dps:0)
    };
  }

  function nextDividend(state){
    const snapshot=readIncomeSnapshot();
    const snapshotRows=Array.isArray(snapshot?.dividends)?snapshot.dividends:[];
    const stateRows=Array.isArray(state.income?.dividends)?state.income.dividends:Array.isArray(state.income?.fixtures)?state.income.fixtures:[];
    const rows=snapshotRows.length?snapshotRows:stateRows;
    const today=new Date();today.setHours(0,0,0,0);const start=today.getTime();
    return rows.map(normaliseDividend)
      .filter(r=>Number.isFinite(r.date)&&r.date>=start&&!['ARCHIVED','CANCELLED','CANCELED','MISSED','PAID'].includes(r.status))
      .sort((a,b)=>a.date-b.date||b.amount-a.amount)[0]||null;
  }

  function openChairman(state){
    const rows=Array.isArray(state.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[];
    return rows.filter(r=>!['WITHDRAWN','EXPIRED','COMPLETE','CLOSED'].includes(upper(r.status))).length;
  }

  function chain(state){
    const stage5=state.finance?.stage5PaydayDecision;
    const mission=state.transfer?.mission;
    const missionStatus=upper(mission?.status||'NONE');
    const plan=state.scouting?.allocationPlan;
    const route=state.transfer?.route;
    const receipts=state.registration?.receipts||[];
    const missionReceipts=mission?receipts.filter(r=>String(r.missionId||'')===String(mission.id||'')):[];
    const locked=route?.locked===true&&mission&&String(route.missionId||'')===String(mission.id||'');
    const routeLegs=[...(route?.allocations||[]),...(route?.brokerCashAllocations||[])];
    let next={title:'Build Finance Stages 1–5',detail:'No safe release has been calculated yet.',href:'finance.html',tone:'attention'};
    if(stage5&&!mission) next={title:'Release Finance Mission',detail:`Stage 5 has proved ${money(stage5.maximumSafeRelease)} available.`,href:'finance.html',tone:'active'};
    if(mission&&missionStatus==='DRAFT') next={title:'Approve the Scouting Plan',detail:'Finance mission is live. Scouting needs to select and approve the recruitment plan.',href:'scouting.html',tone:'active'};
    if(mission&&['READY','ALLOCATED'].includes(missionStatus)) next={title:'Lock the Transfer Route',detail:'The approved recruitment plan is waiting for Transfer execution routing.',href:'transfer.html',tone:'active'};
    if(mission&&missionStatus==='LOCKED') next={title:'Confirm Broker Executions',detail:`Registration has ${missionReceipts.length}/${routeLegs.length||route?.allocations?.length||0} execution receipts.`,href:'registration.html',tone:'active'};
    if(missionStatus==='COMPLETE') next={title:'Payday Complete',detail:'The current mission is settled. Archive it when you are ready for the next cycle.',href:'index.html#payday',tone:'good'};
    return {stage5,mission,missionStatus,plan,route,locked,missionReceipts,routeLegs,next};
  }

  function departmentCards(state,m,c){
    const scouts=Array.isArray(state.scouting?.candidates)?state.scouting.candidates:[];
    const valid=scouts.filter(r=>num(r.yieldPct)>0&&num(r.livePriceGbp)>0).length;
    const top=typeof window.AuroraScoutingNetwork?.rankings==='function' ? window.AuroraScoutingNetwork.rankings(state)[0] : null;
    const routeLegs=c.routeLegs.length||c.route?.allocations?.length||0;
    const chairman=openChairman(state);
    const receiptCount=c.missionReceipts.length;
    return [
      {name:'Finance',status:c.stage5?'PROVED':'WAITING',tone:c.stage5?'good':'attention',value:c.stage5?money(c.stage5.maximumSafeRelease):'Not ready',detail:c.mission?`Mission ${c.missionStatus} · ${money(c.mission.budget)}`:'Stage 6 mission not released',href:'finance.html'},
      {name:'Scouting',status:c.plan?.status==='APPROVED'?'APPROVED':'SCANNING',tone:c.plan?.status==='APPROVED'?'good':'active',value:`${scouts.length.toLocaleString('en-GB')} watched`,detail:top?`Top scout: ${top.ticker} · ${num(top.yieldPct).toFixed(2)}% yield`:`${valid} valid income candidates`,href:'scouting.html'},
      {name:'Transfer',status:c.locked?'LOCKED':c.route?'ROUTE BUILT':'WAITING',tone:c.locked?'good':c.route?'active':'attention',value:c.route?`${routeLegs} route leg${routeLegs===1?'':'s'}`:'No route',detail:chairman?`${chairman} open Chairman case${chairman===1?'':'s'}`:'No open Chairman action',href:'transfer.html'},
      {name:'Registration',status:c.missionStatus==='COMPLETE'?'SETTLED':c.locked?'EXECUTING':'WAITING',tone:c.missionStatus==='COMPLETE'?'good':c.locked?'active':'attention',value:c.locked||c.missionStatus==='COMPLETE'?`${receiptCount}/${routeLegs||0} confirmed`:'No execution',detail:c.missionStatus==='COMPLETE'?'Mission settled into Squad':'Broker receipts update the real holdings',href:'registration.html'},
      {name:'Squad Hub',status:m.holdings.length?'LIVE':'EMPTY',tone:m.holdings.length?'good':'blocked',value:money(m.market),detail:`${m.holdings.length} active holdings · P/L ${money(m.pnl)}`,href:'squad.html'},
      {name:'Income',status:m.annual>0?'LIVE':'WAITING',tone:m.annual>0?'good':'attention',value:`${money(m.monthly)}/mo`,detail:`${money(m.annual)} forward annual income`,href:'income.html'}
    ];
  }

  function overall(cards){
    const blocked=cards.some(c=>c.tone==='blocked');
    const attention=cards.filter(c=>c.tone==='attention').length;
    if(blocked)return{label:'BLOCKED',tone:'blocked',detail:'One or more departments cannot progress.'};
    if(attention>=3)return{label:'ATTENTION',tone:'attention',detail:`${attention} departments are waiting for action.`};
    if(attention)return{label:'READY',tone:'attention',detail:`${attention} department${attention===1?'':'s'} waiting for the next step.`};
    return{label:'HEALTHY',tone:'',detail:'Core clean departments are reporting normally.'};
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState(),m=metrics(state),c=chain(state),cards=departmentCards(state,m,c),health=overall(cards),div=nextDividend(state),chairman=openChairman(state);
    const master=document.getElementById('nexusMaster');
    if(master)master.innerHTML=`<article class="nexus-master-card"><div class="nexus-master-copy"><small>AURORA COMMAND STATUS</small><h2>${esc(c.next.title)}</h2><p>${esc(c.next.detail)}</p></div><div class="nexus-health-ring ${health.tone}"><div><strong>${health.label}</strong><span>SYSTEM</span></div></div></article><article class="nexus-action-card"><span class="nexus-card-label">NEXT MANAGER ACTION</span><h3>${esc(c.next.title)}</h3><p>${esc(c.next.detail)}</p><a href="${esc(c.next.href)}">Open department →</a></article>`;
    const strip=document.getElementById('nexusStrip');
    if(strip)strip.innerHTML=`
      <article class="nexus-strip-card portfolio"><small class="nexus-card-label">PORTFOLIO VALUE</small><strong>${money(m.market)}</strong><small>P/L ${money(m.pnl)}</small></article>
      <article class="nexus-strip-card income"><small class="nexus-card-label">FORWARD INCOME</small><strong>${money(m.annual)}</strong><small>${money(m.monthly)} monthly average</small></article>
      <article class="nexus-strip-card scouting"><small class="nexus-card-label">SCOUTING NETWORK</small><strong>${(state.scouting?.candidates||[]).length.toLocaleString('en-GB')}</strong><small>${state.scouting?.allocationPlan?.allocations?.length||0} payday pick(s)</small></article>
      <article class="nexus-strip-card dividend"><small class="nexus-card-label">NEXT DIVIDEND</small><strong>${div?esc(div.ticker||div.name||'Scheduled'):'No dated fixture'}</strong><small>${div?`${new Date(div.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} · ${money(div.amount)}`:'Open Income Centre to refresh dividend fixtures'}</small></article>`;
    const grid=document.getElementById('nexusDepartments');
    if(grid)grid.innerHTML=cards.map(card=>`<article class="nexus-dept-card" data-tone="${card.tone}"><div class="nexus-dept-head"><div><span class="nexus-card-label">DEPARTMENT</span><h3>${esc(card.name)}</h3></div><span class="nexus-status">${esc(card.status)}</span></div><div class="nexus-dept-value">${esc(card.value)}</div><p class="nexus-dept-detail">${esc(card.detail)}</p><a href="${esc(card.href)}">Open ${esc(card.name)} →</a></article>`).join('');
    const alerts=document.getElementById('nexusAlerts');
    if(alerts)alerts.innerHTML=`<article class="nexus-alert-box warning"><strong>System attention</strong><p>${esc(health.detail)}</p></article><article class="nexus-alert-box chairman"><strong>Chairman desk</strong><p>${chairman?`${chairman} active Chairman case${chairman===1?'':'s'} need monitoring or execution.`:'No active Chairman rotation case right now.'}</p></article>`;
    const updated=document.getElementById('nexusUpdated');if(updated)updated.textContent=`Command view updated ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
    ['nexusFinance','nexusScouting','nexusTransfer','nexusRegistration','nexusSquad','nexusIncome'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.textContent=cards[i].status;});
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return;}
    render();
    window.addEventListener('aurora-clean:state',render);
    window.addEventListener('aurora:market-prices',render);
    window.addEventListener('storage',event=>{if(event.key===INCOME_CACHE_KEY)render();});
    window.addEventListener('pageshow',render);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();});
    window.AuroraNexusCommand=Object.freeze({BUILD,render,metrics,chain,nextDividend});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
