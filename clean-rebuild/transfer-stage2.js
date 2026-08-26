(() => {
  'use strict';

  const BUILD='20260826-transfer-approved-plan-plus-broker-cash-2';
  const CASH_CACHE='aurora-clean:transfer-broker-cash:v1';
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
  const round=v=>Number(Math.max(0,Number(v||0)).toFixed(2));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const upper=v=>String(v||'').trim().toUpperCase();
  const hash=v=>{let h=2166136261;for(const c of String(v||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')};
  let cash=null;
  function readCache(){try{return JSON.parse(localStorage.getItem(CASH_CACHE)||'null')?.snapshot||null}catch(_){return null}}
  function writeCache(v){try{localStorage.setItem(CASH_CACHE,JSON.stringify({savedAt:new Date().toISOString(),snapshot:v}))}catch(_){}}

  function financePlan(state){
    const mission=state.transfer?.mission,source=state.scouting?.allocationPlan;
    if(!mission||!source||upper(source.status)!=='APPROVED'||!Array.isArray(source.allocations)||!source.allocations.length)return null;
    if(String(source.missionId||'')!==String(mission.id||''))return null;
    const budget=round(mission.budget),sourceBudget=round(source.budget||source.allocated);if(!budget||!sourceBudget)return null;
    const factor=budget/sourceBudget;
    const allocations=source.allocations.map((r,i)=>({legId:`LEG-${hash(`${mission.id}|FINANCE|${i}|${r.ticker}|${r.amount}`)}`,ticker:r.ticker,name:r.name,yieldPct:Number(r.yieldPct||0),score:Number(r.score||0),selectionRank:Number(r.selectionRank||i+1),amount:round(Number(r.amount||0)*factor),fundingSource:'FINANCE'})).filter(r=>r.ticker&&r.amount>0);
    let allocated=round(allocations.reduce((s,r)=>s+r.amount,0)),delta=round(budget-allocated);if(allocations.length&&Math.abs(delta)>=.01)allocations[0].amount=round(allocations[0].amount+delta);
    allocations.forEach(r=>r.expectedAnnualIncome=round(r.amount*r.yieldPct/100));allocated=round(allocations.reduce((s,r)=>s+r.amount,0));
    return{budget,strategy:source.strategy||state.scouting?.strategy||'sustainable',approvedAt:source.approvedAt||null,allocations,allocated,expectedAnnualIncome:round(allocations.reduce((s,r)=>s+r.expectedAnnualIncome,0))};
  }

  function cashBalances(){return{IG:round(cash?.balances?.IG),T212:round(cash?.balances?.T212)}}
  function distributeCash(account,amount,base,missionId){
    const total=round(amount);if(!(total>0)||!base.length)return[];const demand=base.reduce((s,r)=>s+r.amount,0)||1;let used=0;
    return base.map((r,i)=>{const a=i===base.length-1?round(total-used):round(total*(r.amount/demand));used=round(used+a);return{legId:`LEG-${hash(`${missionId}|BROKER_CASH|${account}|${i}|${r.ticker}|${a}`)}`,ticker:r.ticker,name:r.name,yieldPct:r.yieldPct,score:r.score,selectionRank:r.selectionRank,amount:a,expectedAnnualIncome:round(a*r.yieldPct/100),fundingSource:'BROKER_CASH',lockedAccount:account}}).filter(r=>r.amount>0);
  }
  function fundedPlan(state){const f=financePlan(state);if(!f)return null;const b=cashBalances(),mission=state.transfer?.mission;const extra=[...distributeCash('IG',b.IG,f.allocations,mission.id),...distributeCash('T212',b.T212,f.allocations,mission.id)];const brokerCashTotal=round(extra.reduce((s,r)=>s+r.amount,0));return{...f,brokerCashAllocations:extra,brokerCash:b,brokerCashTotal,totalBuyingPower:round(f.budget+brokerCashTotal),totalExpectedAnnualIncome:round(f.expectedAnnualIncome+extra.reduce((s,r)=>s+r.expectedAnnualIncome,0))}}

  async function refreshCash(){const client=window.AuroraData2Client;if(!client?.post){cash=readCache();render();return}try{const r=await client.post('brokerCashSnapshot',{});if(!r?.balances)throw new Error('Incomplete broker cash snapshot');cash=r;writeCache(r)}catch(_){cash=readCache()}render()}

  function render(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),mission=state.transfer?.mission,source=state.scouting?.allocationPlan,route=state.transfer?.route,preview=fundedPlan(state),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v},rows=document.getElementById('transferStage2Rows'),build=document.getElementById('transferStage2Build'),lock=document.getElementById('transferStage2Lock');
    const b=cashBalances();set('transferCashIG',money(b.IG));set('transferCashT212',money(b.T212));set('transferBuyingPower',money(preview?.totalBuyingPower||mission?.budget||0));
    set('transferStage2Mission',mission?`${mission.status} · Finance ${money(mission.budget)}`:'No Finance mission');
    if(route?.allocations?.length){const all=[...(route.allocations||[]),...(route.brokerCashAllocations||[])];set('transferStage2RouteStatus',route.locked?'LOCKED':'READY');if(rows)rows.innerHTML=all.map(r=>`<li><strong>${esc(r.ticker)}</strong> — ${money(r.amount)} — ${r.fundingSource==='BROKER_CASH'?`${esc(r.lockedAccount==='IG'?'IG ISA':'Trading 212 ISA')} CASH`:'FINANCE'} — projected annual income ${money(r.expectedAnnualIncome)}</li>`).join('');}
    else if(preview?.allocations?.length){set('transferStage2RouteStatus','APPROVED PLAN + BROKER CASH READY');if(rows)rows.innerHTML=[...preview.allocations,...preview.brokerCashAllocations].map(r=>`<li><strong>#${r.selectionRank} ${esc(r.ticker)}</strong> — ${money(r.amount)} — ${r.fundingSource==='BROKER_CASH'?`${esc(r.lockedAccount==='IG'?'IG ISA':'Trading 212 ISA')} existing cash`:'new Finance money'}</li>`).join('');}
    else if(mission&&source?.allocations?.length&&upper(source.status)!=='APPROVED'){set('transferStage2RouteStatus','WAITING FOR PAYDAY PLAN APPROVAL');if(rows)rows.innerHTML='<li>Approve the whole payday plan in Scouting first.</li>';}
    else{set('transferStage2RouteStatus',mission?'WAITING FOR SCOUTING PLAN':'WAITING FOR FINANCE');if(rows)rows.innerHTML='<li>No approved Scouting payday plan available yet.</li>';}
    if(build)build.disabled=!mission||!['DRAFT','READY'].includes(upper(mission.status))||!preview?.allocations?.length||!!route?.locked;if(lock)lock.disabled=!route?.allocations?.length||!!route?.locked;
  }

  function bind(){const A=window.AuroraClean;if(!A)return false;
    document.getElementById('transferRefreshCash')?.addEventListener('click',refreshCash);
    document.getElementById('transferStage2Build')?.addEventListener('click',()=>{A.updateState(state=>{const p=fundedPlan(state);if(!p?.allocations?.length||!state.transfer?.mission)return;state.transfer.route={id:`ROUTE-${Date.now()}`,missionId:state.transfer.mission.id,strategy:p.strategy,allocationAuthority:'Approved Scouting Payday Plan + Broker Cash Authority',scoutingPlanApprovedAt:p.approvedAt,allocations:p.allocations,brokerCashAllocations:p.brokerCashAllocations,financeAllocated:p.allocated,brokerCashPlanned:p.brokerCash,brokerCashAllocated:p.brokerCashTotal,totalAllocated:p.totalBuyingPower,expectedAnnualIncome:p.totalExpectedAnnualIncome,locked:false,createdAt:new Date().toISOString()};state.transfer.mission.status='READY';state.transfer.mission.updatedAt=new Date().toISOString();});render()});
    document.getElementById('transferStage2Lock')?.addEventListener('click',()=>{A.updateState(state=>{if(!state.transfer?.route?.allocations?.length||!state.transfer?.mission)return;state.transfer.route.locked=true;state.transfer.route.lockedAt=new Date().toISOString();state.transfer.mission.status='LOCKED';state.transfer.mission.updatedAt=new Date().toISOString();});render()});
    window.addEventListener('aurora-clean:state',render);render();cash=readCache();refreshCash();window.AuroraTransferStage2=Object.freeze({BUILD,financePlan,fundedPlan,refreshCash,render});return true;
  }
  function boot(){if(!bind())setTimeout(boot,50)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
