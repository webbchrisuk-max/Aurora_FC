(() => {
  'use strict';

  const BUILD='20260925-transfer-funding-plan-10-scout-broker-route';
  const CASH_CACHE='aurora-clean:transfer-broker-cash:v1';
  const BROKER_CASH_MIN_GBP=200;
  const TARGET_BUYING_POWER_GBP=1000;

  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
  const wholeMoney=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(v||0));
  const round=v=>Number(Math.max(0,Number(v||0)).toFixed(2));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const upper=v=>String(v||'').trim().toUpperCase();
  const hash=v=>{let h=2166136261;for(const c of String(v||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')};
  let cash=null;

  function readCache(){try{return JSON.parse(localStorage.getItem(CASH_CACHE)||'null')?.snapshot||null}catch(_){return null}}
  function writeCache(v){try{localStorage.setItem(CASH_CACHE,JSON.stringify({savedAt:new Date().toISOString(),snapshot:v}))}catch(_){}}
  function brokerCode(row){const a=upper(row?.lockedAccount||row?.account||row?.broker||row?.preferredBroker||row?.platform);if(a.includes('212'))return'T212';if(a.includes('IG'))return'IG';return''}
  function routeBrokerReady(route){const rows=Array.isArray(route?.allocations)?route.allocations:[];return !!rows.length&&rows.every(r=>['IG','T212'].includes(brokerCode(r)))}

  function financePlan(state){
    const mission=state.transfer?.mission,source=state.scouting?.allocationPlan;
    if(!mission||!source||upper(source.status)!=='APPROVED'||!Array.isArray(source.allocations)||!source.allocations.length)return null;
    if(String(source.missionId||'')!==String(mission.id||''))return null;
    const budget=round(mission.budget),sourceBudget=round(source.budget||source.allocated);
    if(!budget||!sourceBudget)return null;
    const factor=budget/sourceBudget;
    const existing=String(state.transfer?.route?.missionId||'')===String(mission.id||'')&&Array.isArray(state.transfer?.route?.allocations)?state.transfer.route.allocations:[];
    const allocations=source.allocations.map((r,i)=>{
      const rank=Number(r.selectionRank||i+1);
      const legId=`LEG-${hash(`${mission.id}|FINANCE|${i}|${r.ticker}|${r.amount}`)}`;
      const old=existing.find(x=>String(x.legId||'')===legId)||existing.find(x=>upper(x.ticker)===upper(r.ticker)&&Number(x.selectionRank||0)===rank);
      const account=brokerCode(old)||brokerCode(r);
      const sourceSpec=account&&window.AuroraTransferBrokerAssign?.executionSpec
        ? window.AuroraTransferBrokerAssign.executionSpec(r,account)
        : {};
      return {
        legId,ticker:r.ticker,name:r.name,yieldPct:Number(r.yieldPct||0),score:Number(r.score||0),selectionRank:rank,
        amount:round(Number(r.amount||0)*factor),fundingSource:'FINANCE',
        ...(r.preferredBroker?{preferredBroker:r.preferredBroker}:{}),
        ...(r.brokerLocked===true?{brokerLocked:true}:{}),
        ...(account?{lockedAccount:account,account}:{}),
        ...((old?.underlyingTicker||r.underlyingTicker||sourceSpec.underlyingTicker)?{underlyingTicker:old?.underlyingTicker||r.underlyingTicker||sourceSpec.underlyingTicker}:{}),
        ...((old?.executionTicker||r.executionTicker||sourceSpec.executionTicker)?{executionTicker:old?.executionTicker||r.executionTicker||sourceSpec.executionTicker}:{}),
        ...((old?.executionMarket||r.executionMarket||sourceSpec.executionMarket)?{executionMarket:old?.executionMarket||r.executionMarket||sourceSpec.executionMarket}:{}),
        ...((old?.executionCurrency||r.executionCurrency||sourceSpec.executionCurrency)?{executionCurrency:old?.executionCurrency||r.executionCurrency||sourceSpec.executionCurrency}:{}),
        ...((old?.securityName||sourceSpec.securityName)?{securityName:old?.securityName||sourceSpec.securityName}:{}),
        ...(old?.brokerAssignedAt?{brokerAssignedAt:old.brokerAssignedAt}:account?{brokerAssignedAt:r.brokerSnapshotDate||new Date().toISOString()}:{})
      };
    }).filter(r=>r.ticker&&r.amount>0);
    let allocated=round(allocations.reduce((s,r)=>s+r.amount,0));
    const delta=round(budget-allocated);
    if(allocations.length&&Math.abs(delta)>=0.01)allocations[0].amount=round(allocations[0].amount+delta);
    allocations.forEach(r=>r.expectedAnnualIncome=round(r.amount*r.yieldPct/100));
    allocated=round(allocations.reduce((s,r)=>s+r.amount,0));
    return {budget,strategy:source.strategy||state.scouting?.strategy||'sustainable',approvedAt:source.approvedAt||null,allocations,allocated,expectedAnnualIncome:round(allocations.reduce((s,r)=>s+r.expectedAnnualIncome,0))};
  }

  function cashBalances(){return{IG:round(cash?.balances?.IG),T212:round(cash?.balances?.T212)}}
  function usableCashBalances(){const b=cashBalances();return{IG:b.IG>=BROKER_CASH_MIN_GBP?b.IG:0,T212:b.T212>=BROKER_CASH_MIN_GBP?b.T212:0}}

  function scaleRows(rows,total){
    const target=round(total),source=(rows||[]).reduce((s,r)=>s+Math.max(0,Number(r.amount||0)),0);
    if(!rows?.length||source<=0)return[];
    let used=0;
    return rows.map((r,i)=>{
      const amount=i===rows.length-1?round(target-used):round(target*(Math.max(0,Number(r.amount||0))/source));
      used=round(used+amount);
      return {...r,amount,expectedAnnualIncome:round(amount*Number(r.yieldPct||0)/100)};
    });
  }

  function proportionalParts(rows,total,weightFn=r=>Number(r.amount||0)){
    const target=round(total);
    if(!rows?.length||target<=0)return new Map();
    const weights=rows.map(r=>Math.max(0,Number(weightFn(r)||0)));
    const weightTotal=weights.reduce((s,v)=>s+v,0)||rows.length;
    const allZero=weights.every(v=>v===0);
    let used=0;
    const out=new Map();
    rows.forEach((r,i)=>{
      const weight=allZero?1:weights[i];
      const divisor=allZero?rows.length:weightTotal;
      const amount=i===rows.length-1?round(target-used):round(target*(weight/divisor));
      used=round(used+amount);
      out.set(r.legId,amount);
    });
    return out;
  }

  function splitWholePounds(needs,total){
    const plan={IG:0,T212:0};
    const target=Math.max(0,Math.floor(Number(total||0)));
    const active=['IG','T212'].filter(k=>Number(needs[k]||0)>0);
    active.forEach(k=>{plan[k]=Math.floor(Number(needs[k]||0))});
    let remaining=Math.max(0,target-plan.IG-plan.T212);
    const order=[...active].sort((a,b)=>((Number(needs[b])%1)-(Number(needs[a])%1))||Number(needs[b])-Number(needs[a]));
    let i=0;
    while(remaining>0&&order.length){plan[order[i%order.length]]+=1;remaining--;i++}
    return plan;
  }

  function fundedPlan(state){
    const raw=financePlan(state);if(!raw)return null;
    const observed=cashBalances(),eligible=usableCashBalances(),mission=state.transfer?.mission;
    const brokersReady=raw.allocations.length>0&&raw.allocations.every(r=>brokerCode(r));

    if(!brokersReady){
      return {
        ...raw,financeMissionBudget:raw.budget,financeUsed:raw.allocated,financeLeftBehind:round(raw.budget-raw.allocated),
        brokerCashAllocations:[],brokerCashObserved:observed,brokerCashEligible:eligible,brokerCash:{IG:0,T212:0},brokerCashThreshold:BROKER_CASH_MIN_GBP,
        targetBuyingPower:TARGET_BUYING_POWER_GBP,desiredBuyingPower:raw.allocated,brokerCashTotal:0,
        transferPlan:{IG:0,T212:0,total:0,untransferred:raw.budget,exact:{IG:0,T212:0}},
        totalBuyingPower:raw.allocated,totalExpectedAnnualIncome:raw.expectedAnnualIncome,brokersReady:false
      };
    }

    const represented={IG:raw.allocations.some(r=>brokerCode(r)==='IG'),T212:raw.allocations.some(r=>brokerCode(r)==='T212')};
    const availableBrokerCash={IG:represented.IG?eligible.IG:0,T212:represented.T212?eligible.T212:0};
    const availableCashTotal=round(availableBrokerCash.IG+availableBrokerCash.T212);
    const desiredBuyingPower=round(Math.min(TARGET_BUYING_POWER_GBP,raw.budget+availableCashTotal));
    const desiredRows=scaleRows(raw.allocations,desiredBuyingPower);

    const desiredByBroker={IG:0,T212:0};
    desiredRows.forEach(r=>{const b=brokerCode(r);if(b)desiredByBroker[b]=round(desiredByBroker[b]+r.amount)});
    const cashUse={IG:round(Math.min(availableBrokerCash.IG,desiredByBroker.IG)),T212:round(Math.min(availableBrokerCash.T212,desiredByBroker.T212))};

    const cashParts=new Map();
    ['IG','T212'].forEach(account=>{
      const rows=desiredRows.filter(r=>brokerCode(r)===account);
      const parts=proportionalParts(rows,cashUse[account]);
      parts.forEach((v,k)=>cashParts.set(k,v));
    });

    const financeNeeds={IG:0,T212:0};
    desiredRows.forEach(r=>{
      const b=brokerCode(r),need=Math.max(0,r.amount-(cashParts.get(r.legId)||0));
      financeNeeds[b]=round(financeNeeds[b]+need);
    });
    const totalFinanceNeed=round(financeNeeds.IG+financeNeeds.T212);
    const maxWholeFromPayday=Math.floor(raw.budget+1e-9);
    const wholeFinanceTotal=Math.min(maxWholeFromPayday,Math.ceil(totalFinanceNeed-1e-9));
    const transferPlan=splitWholePounds(financeNeeds,wholeFinanceTotal);

    const financeParts=new Map();
    ['IG','T212'].forEach(account=>{
      const rows=desiredRows.filter(r=>brokerCode(r)===account);
      const parts=proportionalParts(rows,transferPlan[account],r=>Math.max(0,r.amount-(cashParts.get(r.legId)||0)));
      parts.forEach((v,k)=>financeParts.set(k,v));
    });

    const allocations=raw.allocations.map(r=>{
      const amount=round(financeParts.get(r.legId)||0);
      return {...r,amount,expectedAnnualIncome:round(amount*Number(r.yieldPct||0)/100)};
    });

    const brokerCashAllocations=desiredRows.map((r,i)=>{
      const amount=round(cashParts.get(r.legId)||0),account=brokerCode(r);
      if(amount<=0)return null;
      return {
        legId:`LEG-${hash(`${mission.id}|BROKER_CASH|${account}|${i}|${r.ticker}|${amount}`)}`,
        ticker:r.ticker,name:r.name,yieldPct:r.yieldPct,score:r.score,selectionRank:r.selectionRank,amount,
        expectedAnnualIncome:round(amount*Number(r.yieldPct||0)/100),fundingSource:'BROKER_CASH',lockedAccount:account,account
      };
    }).filter(Boolean);

    const financeUsed=round(allocations.reduce((s,r)=>s+r.amount,0));
    const brokerCashTotal=round(brokerCashAllocations.reduce((s,r)=>s+r.amount,0));
    const totalBuyingPower=round(financeUsed+brokerCashTotal);
    const financeLeftBehind=round(raw.budget-financeUsed);
    const totalExpectedAnnualIncome=round(allocations.reduce((s,r)=>s+r.expectedAnnualIncome,0)+brokerCashAllocations.reduce((s,r)=>s+r.expectedAnnualIncome,0));

    return {
      ...raw,allocations,allocated:financeUsed,expectedAnnualIncome:round(allocations.reduce((s,r)=>s+r.expectedAnnualIncome,0)),
      financeMissionBudget:raw.budget,financeUsed,financeLeftBehind,
      brokerCashAllocations,brokerCashObserved:observed,brokerCashEligible:eligible,brokerCash:cashUse,brokerCashThreshold:BROKER_CASH_MIN_GBP,
      targetBuyingPower:TARGET_BUYING_POWER_GBP,desiredBuyingPower,brokerCashTotal,
      transferPlan:{IG:transferPlan.IG,T212:transferPlan.T212,total:transferPlan.IG+transferPlan.T212,untransferred:financeLeftBehind,exact:financeNeeds},
      totalBuyingPower,totalExpectedAnnualIncome,brokersReady:true
    };
  }

  async function refreshCash(){
    const client=window.AuroraData2Client;
    if(!client?.jsonp){cash=readCache();rebuildBrokerCash();render();return}
    try{
      const r=await client.jsonp('brokerCashSnapshot',{});
      if(!r?.balances)throw new Error('Incomplete broker cash snapshot');
      cash=r;writeCache(r);
    }catch(err){console.warn('[Aurora Transfer cash snapshot]',err);cash=readCache()}
    rebuildBrokerCash();render();
  }

  function missionCanBuild(mission){return !!mission&&!['COMPLETE','CANCELLED','LOCKED'].includes(upper(mission.status))}

  function writeRoute(state,p,existing){
    state.transfer.route={
      id:existing?.id||`ROUTE-${Date.now()}`,missionId:state.transfer.mission.id,strategy:p.strategy,
      allocationAuthority:'Approved Scouting Payday Plan + Consolidated Broker Funding Authority',scoutingPlanApprovedAt:p.approvedAt,
      allocations:p.allocations,brokerCashAllocations:p.brokerCashAllocations,brokerCashObserved:p.brokerCashObserved,
      brokerCashEligible:p.brokerCashEligible,brokerCashPlanned:p.brokerCash,brokerCashThreshold:p.brokerCashThreshold,
      targetBuyingPower:p.targetBuyingPower,desiredBuyingPower:p.desiredBuyingPower,brokerCashAllocated:p.brokerCashTotal,
      transferPlan:p.transferPlan,financeMissionBudget:p.financeMissionBudget,financeAllocated:p.financeUsed,financeLeftBehind:p.financeLeftBehind,
      totalAllocated:p.totalBuyingPower,expectedAnnualIncome:p.totalExpectedAnnualIncome,locked:false,
      createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
    };
  }

  function buildRoute(){
    const A=window.AuroraClean;if(!A)return false;
    const before=A.readState();if(!missionCanBuild(before.transfer?.mission)||before.transfer?.route?.locked)return false;
    const preview=fundedPlan(before);if(!preview?.allocations?.length)return false;
    A.updateState(state=>{
      const p=fundedPlan(state);if(!p?.allocations?.length||!missionCanBuild(state.transfer?.mission)||state.transfer?.route?.locked)return;
      writeRoute(state,p,state.transfer?.route);state.transfer.mission.status='READY';state.transfer.mission.updatedAt=new Date().toISOString();
    });
    render();return true;
  }

  function rebuildBrokerCash(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return false;
    const state=A.readState(),route=state.transfer?.route;
    if(!route||route.locked||!Array.isArray(route.allocations)||!route.allocations.length)return false;
    const p=fundedPlan(state);if(!p?.allocations?.length)return false;
    A.updateState(next=>{const r=next.transfer?.route;if(!r||r.locked)return;writeRoute(next,p,r)});
    return true;
  }

  function lockRoute(){
    const A=window.AuroraClean;if(!A)return false;const state=A.readState();
    if(!state.transfer?.route?.allocations?.length||state.transfer.route.locked||!routeBrokerReady(state.transfer.route))return false;
    rebuildBrokerCash();
    A.updateState(next=>{
      if(!next.transfer?.route?.allocations?.length||!next.transfer?.mission||next.transfer.route.locked||!routeBrokerReady(next.transfer.route))return;
      next.transfer.route.locked=true;next.transfer.route.lockedAt=new Date().toISOString();next.transfer.mission.status='LOCKED';next.transfer.mission.updatedAt=new Date().toISOString();
    });
    render();return true;
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState(),mission=state.transfer?.mission,source=state.scouting?.allocationPlan,route=state.transfer?.route,preview=fundedPlan(state);
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
    const rows=document.getElementById('transferStage2Rows'),build=document.getElementById('transferStage2Build'),lock=document.getElementById('transferStage2Lock');
    const observed=cashBalances(),eligible=usableCashBalances();
    const locked=route?.locked===true;
    const plan=locked?(route||{}):(preview||route||{});
    const cashUsed=locked?(route?.brokerCashPlanned||{IG:0,T212:0}):(plan.brokerCash||route?.brokerCashPlanned||{IG:0,T212:0});
    const tp=locked?(route?.transferPlan||{IG:0,T212:0,total:0,untransferred:Math.max(0,Number(mission?.budget||0)-Number(route?.financeAllocated||mission?.budget||0))}):(plan.transferPlan||{IG:0,T212:0,total:0,untransferred:Number(mission?.budget||0)});

    set('transferCashIG',money(observed.IG));set('transferCashT212',money(observed.T212));
    set('transferBuyingPower',money(locked?(route?.totalAllocated??route?.financeAllocated??mission?.budget??0):(plan.totalBuyingPower??route?.totalAllocated??mission?.budget??0)));
    set('transferCashIGUse',eligible.IG?`${money(eligible.IG)} eligible · ${money(cashUsed.IG||0)} ${locked?'locked':'planned'} for this route`:`Not used until balance reaches ${wholeMoney(BROKER_CASH_MIN_GBP)}`);
    set('transferCashT212Use',eligible.T212?`${money(eligible.T212)} eligible · ${money(cashUsed.T212||0)} ${locked?'locked':'planned'} for this route`:`Not used until balance reaches ${wholeMoney(BROKER_CASH_MIN_GBP)}`);
    set('transferToIG',wholeMoney(tp.IG||0));set('transferToT212',wholeMoney(tp.T212||0));set('transferPenceLeft',money(tp.untransferred||0));

    const used=Number(locked?(route?.financeAllocated??mission?.budget??0):(plan.financeUsed??route?.financeAllocated??mission?.budget??0));
    const left=Number(locked?(route?.financeLeftBehind??Math.max(0,Number(mission?.budget||0)-used)):(plan.financeLeftBehind??route?.financeLeftBehind??0));
    const legacyLocked=locked&&route?.targetBuyingPower!==TARGET_BUYING_POWER_GBP;
    set('transferStage2Mission',mission?`${mission.status} · Payday available ${money(mission.budget)} · using ${money(used)}${left>0?` · keeping ${money(left)}`:''}${legacyLocked?' · locked before current £1,000 funding rules':''}`:'No Finance mission');

    if(route?.allocations?.length){
      const all=[...(route.allocations||[]).filter(r=>Number(r.amount||0)>0),...(route.brokerCashAllocations||[]).filter(r=>Number(r.amount||0)>0)];
      set('transferStage2RouteStatus',route.locked?(legacyLocked?'LOCKED · LEGACY FUNDING PLAN':'LOCKED'):routeBrokerReady(route)?'READY · BROKERS RESOLVED':'ROUTE BUILT · BROKER ASSIGNMENT REQUIRED');
      if(rows)rows.innerHTML=all.length?all.map(r=>{const exec=upper(r.executionTicker),base=upper(r.underlyingTicker||r.ticker),security=exec&&exec!==base?`${esc(base)} → <b>${esc(exec)}</b>${r.executionMarket?` · ${esc(r.executionMarket)}`:''}`:esc(base);return `<li><strong>${security}</strong> — ${money(r.amount)} — ${r.fundingSource==='BROKER_CASH'?`${esc(r.lockedAccount==='IG'?'IG ISA':'Trading 212 ISA')} CASH`:brokerCode(r)?esc(brokerCode(r)==='IG'?'IG ISA':'Trading 212 ISA'):'BROKER PENDING'}${r.executionCurrency?` · ${esc(r.executionCurrency)}`:''} — projected annual income ${money(r.expectedAnnualIncome)}</li>`}).join(''):'<li>No funded purchase legs yet.</li>';
    }else if(preview?.allocations?.length){
      set('transferStage2RouteStatus','APPROVED PLAN READY TO BUILD');
      if(rows)rows.innerHTML=preview.allocations.filter(r=>Number(r.amount||0)>0).map(r=>`<li><strong>#${r.selectionRank} ${esc(r.ticker)}</strong> — ${money(r.amount)} — new Finance money · broker pending</li>`).join('');
    }else if(mission&&source?.allocations?.length&&upper(source.status)!=='APPROVED'){
      set('transferStage2RouteStatus','WAITING FOR PAYDAY PLAN APPROVAL');if(rows)rows.innerHTML='<li>Approve the whole payday plan in Scouting first.</li>';
    }else{
      set('transferStage2RouteStatus',mission?'WAITING FOR SCOUTING PLAN':'WAITING FOR FINANCE');if(rows)rows.innerHTML='<li>No approved Scouting payday plan available yet.</li>';
    }

    if(build)build.disabled=!missionCanBuild(mission)||!preview?.allocations?.length||!!route?.locked;
    if(lock)lock.disabled=!route?.allocations?.length||!!route?.locked||!routeBrokerReady(route);
  }

  function bind(){
    const A=window.AuroraClean;if(!A)return false;
    document.getElementById('transferRefreshCash')?.addEventListener('click',refreshCash);
    document.getElementById('transferStage2Build')?.addEventListener('click',buildRoute);
    document.getElementById('transferStage2Lock')?.addEventListener('click',lockRoute);
    window.addEventListener('aurora-clean:state',render);
    cash=readCache();render();setTimeout(rebuildBrokerCash,0);refreshCash();
    window.AuroraTransferStage2=Object.freeze({BUILD,BROKER_CASH_MIN_GBP,TARGET_BUYING_POWER_GBP,financePlan,fundedPlan,refreshCash,render,buildRoute,rebuildBrokerCash,lockRoute,missionCanBuild,routeBrokerReady,brokerCode});
    return true;
  }

  function boot(){if(!bind())setTimeout(boot,50)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();