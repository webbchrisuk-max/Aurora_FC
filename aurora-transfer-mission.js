/* Aurora 2.0 canonical Finance -> Transfer -> Registration workflow contract. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AuroraTransferMission=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const STATUS=Object.freeze({DRAFT:'DRAFT',READY:'READY',LOCKED:'LOCKED',PARTIAL:'PARTIALLY_REGISTERED',COMPLETE:'COMPLETE',CANCELLED:'CANCELLED',ERROR:'ERROR'});
  const num=v=>Math.max(0,Number(v)||0);
  const arr=v=>Array.isArray(v)?v:[];
  const round=v=>Number(num(v).toFixed(2));
  const broker=v=>{const s=String(v||'').toLowerCase();return s.includes('212')?'T212':(/\big\b/.test(s)||s.includes('ig isa'))?'IG':String(v||'').toUpperCase()};
  const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').toUpperCase().trim();
  const stableLegId=(missionId,a,index)=>String(a.legId||a.leg_id||`${missionId}-${ticker(a.ticker)}-${broker(a.account)||index+1}`);

  function create({id,paydayDate,amount,strategy,createdAt,financeSnapshot}){
    const stamp=createdAt||new Date().toISOString();
    return {id,mission_id:id,paydayDate:paydayDate||'',sourceRelease:{paydayDate:paydayDate||'',releaseAmount:round(amount)},createdAt:stamp,
      transferAmount:round(amount),approvedBudget:round(amount),availableCash:round(amount),strategy:strategy||'',
      allocationPlan:null,brokerRoutes:[],legIds:[],amountAllocated:0,amountRemaining:round(amount),actualInvested:0,
      executionStatus:STATUS.DRAFT,registrationStatus:{registered:0,total:0},status:STATUS.DRAFT,
      completionTimestamp:null,updatedAt:stamp,source:'Finance',financeSnapshot:financeSnapshot||{}};
  }

  function plan(mission,route,stamp=new Date().toISOString()){
    if(!mission||!route||String(route.missionId)!==String(mission.id))throw new Error('Route does not belong to this mission.');
    if([STATUS.LOCKED,STATUS.PARTIAL,STATUS.COMPLETE].includes(mission.status))throw new Error('Approved mission cannot be silently replanned.');
    const legs=arr(route.allocations).filter(a=>num(a.amount)>0).map((a,i)=>({...a,id:stableLegId(mission.id,a,i),legId:stableLegId(mission.id,a,i),leg_id:stableLegId(mission.id,a,i),status:'PLANNED'}));
    const allocated=round(legs.reduce((s,l)=>s+num(l.amount),0));
    if(allocated>num(mission.approvedBudget)+.005)throw new Error('Allocation exceeds Finance release.');
    const brokers=[...new Set(legs.map(l=>broker(l.account)).filter(Boolean))];
    return {mission:{...mission,strategy:route.strategy||mission.strategy,allocationPlan:{routeId:route.id,legIds:legs.map(l=>l.id)},brokerRoutes:brokers,
      legIds:legs.map(l=>l.id),amountAllocated:allocated,amountRemaining:round(num(mission.approvedBudget)-allocated),executionStatus:STATUS.READY,
      registrationStatus:{registered:0,total:legs.length},status:STATUS.READY,updatedAt:stamp},route:{...route,allocations:legs,allocated,remaining:round(num(mission.approvedBudget)-allocated),status:STATUS.READY,locked:false,updatedAt:stamp}};
  }

  function lock(mission,route,stamp=new Date().toISOString()){
    if(!mission||!route||route.missionId!==mission.id||mission.allocationPlan?.routeId!==route.id)throw new Error('Build the current mission plan before lock.');
    if(mission.status!==STATUS.READY||!arr(route.allocations).length)throw new Error('Only a ready route can be locked.');
    return {mission:{...mission,status:STATUS.LOCKED,executionStatus:STATUS.LOCKED,lockedAt:stamp,updatedAt:stamp},route:{...route,status:STATUS.LOCKED,locked:true,lockedAt:stamp,updatedAt:stamp}};
  }

  function validateRegistration(state,input){
    const m=state?.mission,r=state?.transfer?.route,legId=String(input?.legId||input?.allocationId||'');
    const leg=arr(r?.allocations).find(x=>String(x.id)===legId||String(x.legId)===legId);
    const errors=[];
    if(!m||String(input?.missionId)!==String(m.id))errors.push('Mission does not exist.');
    if(!r?.locked||![STATUS.LOCKED,STATUS.PARTIAL].includes(String(m?.status)))errors.push('Mission is not locked.');
    if(!leg)errors.push('Purchase leg does not exist.');
    const receipts=arr(state?.registration?.receipts),drafts=arr(state?.transfer?.registrationDrafts);
    if((leg&&leg.status==='REGISTERED')||receipts.some(x=>x.missionId===m?.id&&(x.legId===legId||x.allocationId===legId))||drafts.some(x=>x.missionId===m?.id&&(x.legId===legId||x.allocationId===legId)&&x.status==='CONFIRMED'))errors.push('Purchase leg is already registered.');
    if(leg&&broker(leg.account)!==broker(input?.account))errors.push('Broker does not match the locked route.');
    if(leg&&ticker(leg.ticker)!==ticker(input?.ticker))errors.push('Ticker does not match the locked route.');
    if(!(num(input?.shares)>0))errors.push('Shares must be greater than zero.');
    if(!(num(input?.price)>0))errors.push('Price must be greater than zero.');
    return {ok:errors.length===0,errors,leg};
  }

  function reconcile(mission,route,drafts,stamp=new Date().toISOString()){
    const legs=arr(route?.allocations).filter(l=>num(l.amount)>0),legIds=new Set(legs.map(l=>String(l.legId||l.id)));
    const confirmedByLeg=new Map();
    arr(drafts).filter(d=>String(d.routeId)===String(route?.id)&&String(d.missionId)===String(mission?.id)&&d.status==='CONFIRMED').forEach(d=>{
      const legId=String(d.legId||d.allocationId);
      if(legIds.has(legId)&&!confirmedByLeg.has(legId))confirmedByLeg.set(legId,d);
    });
    const confirmed=[...confirmedByLeg.values()],txByLeg=confirmedByLeg;
    const nextLegs=legs.map(l=>{const legId=String(l.legId||l.id),tx=txByLeg.get(legId);return tx?{...l,status:'REGISTERED',transactionId:tx.transactionId}:l});
    const registered=nextLegs.filter(l=>l.status==='REGISTERED').length,total=nextLegs.length;
    const actual=round(confirmed.reduce((s,d)=>s+num(d.totalCostGbp),0)),remaining=round(num(mission.approvedBudget)-actual);
    const status=total&&registered===total?STATUS.COMPLETE:registered?STATUS.PARTIAL:STATUS.LOCKED;
    return {mission:{...mission,status,executionStatus:status,registrationStatus:{registered,total},actualInvested:actual,amountRemaining:remaining,
      completionTimestamp:status===STATUS.COMPLETE?(mission.completionTimestamp||stamp):null,updatedAt:stamp},route:{...route,allocations:nextLegs,status,locked:true,actualInvested:actual,actualRemaining:remaining,updatedAt:stamp}};
  }

  function progress(state){
    const m=state?.mission,r=state?.transfer?.route,d=arr(state?.transfer?.registrationDrafts);
    if(!m||!r)return {registered:0,total:0,actualInvested:0,remaining:num(m?.approvedBudget),status:m?.status||null};
    const x=reconcile(m,r,d,m.updatedAt);return {...x.mission.registrationStatus,actualInvested:x.mission.actualInvested,remaining:x.mission.amountRemaining,status:x.mission.status};
  }

  function registeredLegIds(state){
    const m=state?.mission,r=state?.transfer?.route,ids=new Set();
    arr(r?.allocations).filter(l=>l.status==='REGISTERED'||l.transactionId).forEach(l=>ids.add(String(l.legId||l.id)));
    arr(state?.transfer?.registrationDrafts).filter(d=>d.status==='CONFIRMED'&&String(d.missionId)===String(m?.id)).forEach(d=>ids.add(String(d.legId||d.allocationId)));
    arr(state?.registration?.receipts).filter(d=>String(d.missionId)===String(m?.id)).forEach(d=>ids.add(String(d.legId||d.allocationId)));
    return ids;
  }

  function resetActiveTransferMission(state,stamp=new Date().toISOString()){
    const currentId=String(state?.mission?.id||'');
    const transfer=state?.transfer||{};
    const registrationDrafts=arr(transfer.registrationDrafts).filter(d=>{
      const belongsToCurrent=currentId&&String(d?.missionId||'')===currentId;
      return !belongsToCurrent||String(d?.status||'').toUpperCase()==='CONFIRMED';
    });
    return {
      ...state,
      mission:null,
      transfer:{
        ...transfer,
        route:null,
        registrationDrafts,
        executionChecks:{},
        updatedAt:stamp
      },
      updatedAt:stamp
    };
  }

  function rollbackAction(state){
    const status=String(state?.mission?.status||'');
    if(status===STATUS.DRAFT)return {action:'RESET_MISSION',label:'Reset Mission'};
    if(status===STATUS.READY)return {action:'RETURN_TO_DRAFT',label:'Return to Draft'};
    if(status===STATUS.LOCKED)return registeredLegIds(state).size
      ?{action:null,label:'Rollback unavailable — purchases recorded',disabled:true}
      :{action:'UNLOCK_ROUTE',label:'Unlock Route'};
    if(status===STATUS.PARTIAL)return {action:'CANCEL_REMAINING_LEGS',label:'Cancel / Rollback Remaining Legs'};
    if(status===STATUS.COMPLETE)return {action:null,label:'MISSION COMPLETE — REAL TRANSACTIONS RECORDED',disabled:true};
    if(status===STATUS.CANCELLED||status===STATUS.ERROR)return {action:'RESTORE_MISSION',label:'Restore Mission'};
    return null;
  }

  function rollback(state,action,reason='',stamp=new Date().toISOString()){
    const m=state?.mission,r=state?.transfer?.route;
    if(!m)throw new Error('Mission does not exist.');
    const offered=rollbackAction(state);
    if(!offered?.action||offered.action!==action)throw new Error(offered?.label||'Rollback is not allowed for this mission.');
    const previousStatus=m.status,registered=registeredLegIds(state);
    const allLegIds=arr(r?.allocations).map(l=>String(l.legId||l.id));
    let mission={...m},route=r?{...r,allocations:arr(r.allocations).map(l=>({...l}))}:null;
    let affected=[];
    if(action==='RESET_MISSION'||action==='RETURN_TO_DRAFT'){
      affected=allLegIds;
      mission={...mission,status:STATUS.DRAFT,executionStatus:STATUS.DRAFT,allocationPlan:null,brokerRoutes:[],legIds:[],amountAllocated:0,
        amountRemaining:round(mission.approvedBudget),actualInvested:0,registrationStatus:{registered:0,total:0},completionTimestamp:null};
      route=null;
    }else if(action==='UNLOCK_ROUTE'){
      if(registered.size)throw new Error('Registered purchases prevent this route from being unlocked.');
      affected=allLegIds;
      mission={...mission,status:STATUS.READY,executionStatus:STATUS.READY,lockedAt:null};
      route={...route,status:STATUS.READY,locked:false,lockedAt:null};
    }else if(action==='CANCEL_REMAINING_LEGS'){
      affected=allLegIds.filter(id=>!registered.has(id));
      route={...route,allocations:route.allocations.map(l=>registered.has(String(l.legId||l.id))?l:{...l,status:'CANCELLED'}),status:STATUS.CANCELLED,locked:true};
      mission={...mission,status:STATUS.CANCELLED,executionStatus:STATUS.CANCELLED,amountAllocated:round(mission.actualInvested),
        amountRemaining:round(num(mission.approvedBudget)-num(mission.actualInvested)),completionTimestamp:null,
        restorePoint:{status:STATUS.PARTIAL,executionStatus:STATUS.PARTIAL,affectedLegIds:affected}};
    }else if(action==='RESTORE_MISSION'){
      const target=m.restorePoint?.status||m.lastValidStatus||(registered.size?STATUS.PARTIAL:(r?.locked?STATUS.LOCKED:r?STATUS.READY:STATUS.DRAFT));
      affected=arr(m.restorePoint?.affectedLegIds);
      mission={...mission,status:target,executionStatus:target};
      delete mission.restorePoint;
      if(route){
        const restoredLegs=route.allocations.map(l=>affected.includes(String(l.legId||l.id))&&l.status==='CANCELLED'?{...l,status:'PLANNED'}:l);
        route={...route,allocations:restoredLegs,status:target,locked:[STATUS.LOCKED,STATUS.PARTIAL].includes(target)};
      }
    }
    const entry={timestamp:stamp,previousStatus,newStatus:mission.status,affectedLegIds:affected,action,reason:reason||offered.label};
    mission={...mission,updatedAt:stamp,history:[...arr(m.history),entry]};
    if(route)route={...route,updatedAt:stamp};
    return {...state,mission,transfer:{...(state.transfer||{}),route,updatedAt:stamp},updatedAt:stamp};
  }
  return Object.freeze({STATUS,create,plan,lock,validateRegistration,reconcile,progress,stableLegId,registeredLegIds,resetActiveTransferMission,rollbackAction,rollback});
});