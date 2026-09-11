(() => {
  'use strict';

  const BUILD='20260911-transfer-funding-plan-5-threshold-whole-pounds';
  const CASH_CACHE='aurora-clean:transfer-broker-cash:v1';
  const BROKER_CASH_MIN_GBP=200;
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
  const wholeMoney=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(v||0));
  const round=v=>Number(Math.max(0,Number(v||0)).toFixed(2));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const upper=v=>String(v||'').trim().toUpperCase();
  const hash=v=>{let h=2166136261;for(const c of String(v||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')};
  let cash=null;
  function readCache(){try{return JSON.parse(localStorage.getItem(CASH_CACHE)||'null')?.snapshot||null}catch(_){return null}}
  function writeCache(v){try{localStorage.setItem(CASH_CACHE,JSON.stringify({savedAt:new Date().toISOString(),snapshot:v}))}catch(_){}}
  function brokerCode(row){const a=upper(row?.lockedAccount||row?.account||row?.broker||row?.preferredBroker||row?.platform);if(a.includes('212'))return'T212';if(a.includes('IG'))return'IG';return''}

  function financePlan(state){
    const mission=state.transfer?.mission,source=state.scouting?.allocationPlan;
    if(!mission||!source||upper(source.status)!=='APPROVED'||!Array.isArray(source.allocations)||!source.allocations.length)return null;
    if(String(source.missionId||'')!==String(mission.id||''))return null;
    const budget=round(mission.budget),sourceBudget=round(source.budget||source.allocated);if(!budget||!sourceBudget)return null;
    const factor=budget/sourceBudget;
    const existing=String(state.transfer?.route?.missionId||'')===String(mission.id||'')&&Array.isArray(state.transfer?.route?.allocations)?state.transfer.route.allocations:[];
    const allocations=source.allocations.map((r,i)=>{
      const legId=`LEG-${hash(`${mission.id}|FINANCE|${i}|${r.ticker}|${r.amount}`)}`;
      const old=existing.find(x=>String(x.legId||'')===legId)||existing.find(x=>upper(x.ticker)===upper(r.ticker)&&Number(x.selectionRank||0)===Number(r.selectionRank||i+1));
      const account=brokerCode(old);
      return{legId,ticker:r.ticker,name:r.name,yieldPct:Number(r.yieldPct||0),score:Number(r.score||0),selectionRank:Number(r.selectionRank||i+1),amount:round(Number(r.amount||0)*factor),fundingSource:'FINANCE',...(account?{lockedAccount:account,account}:{}),...(old?.brokerAssignedAt?{brokerAssignedAt:old.brokerAssignedAt}:{})};
    }).filter(r=>r.ticker&&r.amount>0);
    let allocated=round(allocations.reduce((s,r)=>s+r.amount,0)),delta=round(budget-allocated);if(allocations.length&&Math.abs(delta)>=.01)allocations[0].amount=round(allocations[0].amount+delta);
    allocations.forEach(r=>r.expectedAnnualIncome=round(r.amount*r.yieldPct/100));allocated=round(allocations.reduce((s,r)=>s+r.amount,0));
    return{budget,strategy:source.strategy||state.scouting?.strategy||'sustainable',approvedAt:source.approvedAt||null,allocations,allocated,expectedAnnualIncome:round(allocations.reduce((s,r)=>s+r.expectedAnnualIncome,0))};
  }

  function cashBalances(){return{IG:round(cash?.balances?.IG),T212:round(cash?.balances?.T212)}}
  function usableCashBalances(){const b=cashBalances();return{IG:b.IG>=BROKER_CASH_MIN_GBP?b.IG:0,T212:b.T212>=BROKER_CASH_MIN_GBP?b.T212:0}}

  function brokerTransferPlan(base,budget){
    const grouped={IG:0,T212:0};
    (base||[]).forEach(r=>{const b=brokerCode(r);if(b)grouped[b]+=Number(r.amount||0)});
    grouped.IG=round(grouped.IG);grouped.T212=round(grouped.T212);
    const wholeBudget=Math.floor(Number(budget||0)+1e-9);
    const plan={IG:Math.floor(grouped.IG),T212:Math.floor(grouped.T212)};
    let remaining=Math.max(0,wholeBudget-plan.IG-plan.T212);
    const order=['IG','T212'].filter(k=>grouped[k]>0).sort((a,b)=>(grouped[b]-Math.floor(grouped[b]))-(grouped[a]-Math.floor(grouped[a])));
    let i=0;while(remaining>0&&order.length){plan[order[i%order.length]]+=1;remaining--;i++}
    const total=plan.IG+plan.T212;
    return{IG:plan.IG,T212:plan.T212,total,untransferred:round(Number(budget||0)-total),exact:grouped};
  }

  function distributeCash(account,amount,base,missionId){
    const total=round(amount),eligible=base.filter(r=>brokerCode(r)===account);
    if(!(total>=BROKER_CASH_MIN_GBP)||!eligible.length)return[];
    const demand=eligible.reduce((s,r)=>s+r.amount,0)||1;let used=0;
    return eligible.map((r,i)=>{const a=i===eligible.length-1?round(total-used):round(total*(r.amount/demand));used=round(used+a);return{legId:`LEG-${hash(`${missionId}|BROKER_CASH|${account}|${i}|${r.ticker}|${a}`)}`,ticker:r.ticker,name:r.name,yieldPct:r.yieldPct,score:r.score,selectionRank:r.selectionRank,amount:a,expectedAnnualIncome:round(a*r.yieldPct/100),fundingSource:'BROKER_CASH',lockedAccount:account,account}}).filter(r=>r.amount>0);
  }

  function fundedPlan(state){
    const f=financePlan(state);if(!f)return null;
    const observed=cashBalances(),usable=usableCashBalances(),mission=state.transfer?.mission;
    const extra=[...distributeCash('IG',usable.IG,f.allocations,mission.id),...distributeCash('T212',usable.T212,f.allocations,mission.id)];
    const brokerCashTotal=round(extra.reduce((s,r)=>s+r.amount,0));
    const transfers=brokerTransferPlan(f.allocations,f.budget);
    return{...f,brokerCashAllocations:extra,brokerCashObserved:observed,brokerCash:usable,brokerCashThreshold:BROKER_CASH_MIN_GBP,brokerCashTotal,transferPlan:transfers,totalBuyingPower:round(f.budget+brokerCashTotal),totalExpectedAnnualIncome:round(f.expectedAnnualIncome+extra.reduce((s,r)=>s+r.expectedAnnualIncome,0))};
  }

  async function refreshCash(){const client=window.AuroraData2Client;if(!client?.post){cash=readCache();rebuildBrokerCash();render();return}try{const r=await client.post('brokerCashSnapshot',{});if(!r?.balances)throw new Error('Incomplete broker cash snapshot');cash=r;writeCache(r)}catch(_){cash=readCache()}rebuildBrokerCash();render()}

  function missionCanBuild(mission){if(!mission)return false;return !['COMPLETE','CANCELLED','LOCKED'].includes(upper(mission.status))}

  function buildRoute(){
    const A=window.AuroraClean;if(!A)return false;
    const before=A.readState();if(!missionCanBuild(before.transfer?.mission)||before.transfer?.route?.locked)return false;
    const preview=fundedPlan(before);if(!preview?.allocations?.length)return false;
    A.updateState(state=>{
      const p=fundedPlan(state);if(!p?.allocations?.length||!missionCanBuild(state.transfer?.mission)||state.transfer?.route?.locked)return;
      state.transfer.route={id:state.transfer?.route?.id||`ROUTE-${Date.now()}`,missionId:state.transfer.mission.id,strategy:p.strategy,allocationAuthority:'Approved Scouting Payday Plan + Broker Cash Authority',scoutingPlanApprovedAt:p.approvedAt,allocations:p.allocations,brokerCashAllocations:p.brokerCashAllocations,brokerCashObserved:p.brokerCashObserved,brokerCashPlanned:p.brokerCash,brokerCashThreshold:p.brokerCashThreshold,brokerCashAllocated:p.brokerCashTotal,transferPlan:p.transferPlan,financeAllocated:p.allocated,totalAllocated:p.totalBuyingPower,expectedAnnualIncome:p.totalExpectedAnnualIncome,locked:false,createdAt:state.transfer?.route?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
      state.transfer.mission.status='READY';state.transfer.mission.updatedAt=new Date().toISOString();
    });render();return true;
  }

  function rebuildBrokerCash(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return false;
    const state=A.readState(),route=state.transfer?.route;
    if(!route||route.locked||!Array.isArray(route.allocations)||!route.allocations.length)return false;
    const p=fundedPlan(state);if(!p?.allocations?.length)return false;
    A.updateState(next=>{const r=next.transfer?.route;if(!r||r.locked)return;r.allocations=p.allocations;r.brokerCashAllocations=p.brokerCashAllocations;r.brokerCashObserved=p.brokerCashObserved;r.brokerCashPlanned=p.brokerCash;r.brokerCashThreshold=p.brokerCashThreshold;r.brokerCashAllocated=p.brokerCashTotal;r.transferPlan=p.transferPlan;r.financeAllocated=p.allocated;r.totalAllocated=p.totalBuyingPower;r.expectedAnnualIncome=p.totalExpectedAnnualIncome;r.updatedAt=new Date().toISOString();});
    return true;
  }

  function routeBrokerReady(route){
    const finance=Array.isArray(route?.allocations)?route.allocations:[];
    if(!finance.length)return false;
    return finance.every(r=>['IG','T212'].includes(brokerCode(r)));
  }

  function lockRoute(){
    const A=window.AuroraClean;if(!A)return false;const state=A.readState();
    if(!state.transfer?.route?.allocations?.length||state.transfer.route.locked||!routeBrokerReady(state.transfer.route))return false;
    rebuildBrokerCash();
    A.updateState(next=>{if(!next.transfer?.route?.allocations?.length||!next.transfer?.mission||next.transfer.route.locked||!routeBrokerReady(next.transfer.route))return;next.transfer.route.locked=true;next.transfer.route.lockedAt=new Date().toISOString();next.transfer.mission.status='LOCKED';next.transfer.mission.updatedAt=new Date().toISOString();});render();return true;
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),mission=state.transfer?.mission,source=state.scouting?.allocationPlan,route=state.transfer?.route,preview=fundedPlan(state),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v},rows=document.getElementById('transferStage2Rows'),build=document.getElementById('transferStage2Build'),lock=document.getElementById('transferStage2Lock');
    const observed=cashBalances(),usable=usableCashBalances(),tp=preview?.transferPlan||route?.transferPlan||{IG:0,T212:0,total:0,untransferred:0};
    set('transferCashIG',money(observed.IG));set('transferCashT212',money(observed.T212));set('transferBuyingPower',money(preview?.totalBuyingPower||mission?.budget||0));
    set('transferCashIGUse',usable.IG?`Eligible · ${money(usable.IG)} will be used`:`Not used until balance reaches ${wholeMoney(BROKER_CASH_MIN_GBP)}`);
    set('transferCashT212Use',usable.T212?`Eligible · ${money(usable.T212)} will be used`:`Not used until balance reaches ${wholeMoney(BROKER_CASH_MIN_GBP)}`);
    set('transferToIG',wholeMoney(tp.IG));set('transferToT212',wholeMoney(tp.T212));set('transferPenceLeft',money(tp.untransferred));
    set('transferStage2Mission',mission?`${mission.status} · Finance ${money(mission.budget)}`:'No Finance mission');
    if(route?.allocations?.length){const all=[...(route.allocations||[]),...(route.brokerCashAllocations||[])];set('transferStage2RouteStatus',route.locked?'LOCKED':routeBrokerReady(route)?'READY · BROKERS RESOLVED':'ROUTE BUILT · BROKER ASSIGNMENT REQUIRED');if(rows)rows.innerHTML=all.map(r=>`<li><strong>${esc(r.ticker)}</strong> — ${money(r.amount)} — ${r.fundingSource==='BROKER_CASH'?`${esc(r.lockedAccount==='IG'?'IG ISA':'Trading 212 ISA')} CASH`:brokerCode(r)?esc(brokerCode(r)==='IG'?'IG ISA':'Trading 212 ISA'):'BROKER PENDING'} — projected annual income ${money(r.expectedAnnualIncome)}</li>`).join('');}
    else if(preview?.allocations?.length){set('transferStage2RouteStatus','APPROVED PLAN READY TO BUILD');if(rows)rows.innerHTML=preview.allocations.map(r=>`<li><strong>#${r.selectionRank} ${esc(r.ticker)}</strong> — ${money(r.amount)} — new Finance money · broker pending</li>`).join('');}
    else if(mission&&source?.allocations?.length&&upper(source.status)!=='APPROVED'){set('transferStage2RouteStatus','WAITING FOR PAYDAY PLAN APPROVAL');if(rows)rows.innerHTML='<li>Approve the whole payday plan in Scouting first.</li>';}
    else{set('transferStage2RouteStatus',mission?'WAITING FOR SCOUTING PLAN':'WAITING FOR FINANCE');if(rows)rows.innerHTML='<li>No approved Scouting payday plan available yet.</li>';}
    if(build)build.disabled=!missionCanBuild(mission)||!preview?.allocations?.length||!!route?.locked;if(lock)lock.disabled=!route?.allocations?.length||!!route?.locked||!routeBrokerReady(route);
  }

  function bind(){const A=window.AuroraClean;if(!A)return false;
    document.getElementById('transferRefreshCash')?.addEventListener('click',refreshCash);document.getElementById('transferStage2Build')?.addEventListener('click',buildRoute);document.getElementById('transferStage2Lock')?.addEventListener('click',lockRoute);
    window.addEventListener('aurora-clean:state',render);render();cash=readCache();setTimeout(rebuildBrokerCash,0);refreshCash();window.AuroraTransferStage2=Object.freeze({BUILD,BROKER_CASH_MIN_GBP,financePlan,fundedPlan,brokerTransferPlan,refreshCash,render,buildRoute,rebuildBrokerCash,lockRoute,missionCanBuild,routeBrokerReady});return true;
  }
  function boot(){if(!bind())setTimeout(boot,50)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
