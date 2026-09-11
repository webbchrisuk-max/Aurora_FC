(() => {
  'use strict';

  const BUILD='20260911-transfer-mission-controls-2-cancel-process';
  const upper=v=>String(v||'').trim().toUpperCase();

  function context(){
    const A=window.AuroraClean;
    if(!A?.readState)return null;
    const state=A.readState();
    const mission=state.transfer?.mission;
    const route=state.transfer?.route;
    if(!mission)return null;
    const receipts=(state.registration?.receipts||[]).filter(r=>String(r.missionId||'')===String(mission.id||''));
    return {state,mission,route,receipts};
  }

  function actionsHost(){return document.querySelector('#transferStage2Lock')?.parentElement||null;}

  function ensureUnlockButton(){
    const actions=actionsHost();if(!actions)return null;
    let btn=document.getElementById('transferStage2Unlock');
    if(btn)return btn;
    btn=document.createElement('button');
    btn.id='transferStage2Unlock';btn.type='button';btn.textContent='Undo Locked Mission';
    btn.style.borderColor='rgba(255,184,77,.45)';btn.style.color='#ffd38a';btn.style.background='rgba(255,166,0,.08)';
    actions.appendChild(btn);btn.addEventListener('click',unlockMission);return btn;
  }

  function ensureCancelButton(){
    const actions=actionsHost();if(!actions)return null;
    let btn=document.getElementById('transferStage2CancelMission');
    if(btn)return btn;
    btn=document.createElement('button');
    btn.id='transferStage2CancelMission';btn.type='button';btn.textContent='Cancel Entire Payday Mission';
    btn.style.borderColor='rgba(255,100,115,.55)';btn.style.color='#ffadb6';btn.style.background='rgba(198,45,64,.12)';
    actions.appendChild(btn);btn.addEventListener('click',cancelEntireMission);return btn;
  }

  function render(){
    const unlock=ensureUnlockButton(),cancel=ensureCancelButton(),ctx=context();
    if(unlock){
      const locked=!!ctx?.route?.locked&&!['COMPLETE','CANCELLED'].includes(upper(ctx?.mission?.status));
      unlock.hidden=!locked;unlock.disabled=!locked;
      if(locked){const count=ctx.receipts.length;unlock.textContent=count?`Locked · ${count} execution${count===1?'':'s'} confirmed`:'Undo Locked Mission';unlock.disabled=count>0;unlock.title=count>0?'Cannot unlock after a broker execution has been confirmed':'Return this locked route to editable Transfer';}
    }
    if(cancel){
      const active=!!ctx?.mission&&!['COMPLETE','CANCELLED'].includes(upper(ctx.mission.status));
      cancel.hidden=!active;
      const count=ctx?.receipts?.length||0;
      cancel.disabled=!active||count>0;
      cancel.textContent=count?`Cannot Cancel · ${count} Execution${count===1?'':'s'} Confirmed`:'Cancel Entire Payday Mission';
      cancel.title=count>0?'Whole-mission cancellation is blocked after a confirmed broker execution':'Cancel Finance → Scouting → Transfer for this payday and return to Finance';
    }
  }

  function unlockMission(){
    const A=window.AuroraClean,ctx=context();
    if(!A?.updateState||!ctx||!ctx.route?.locked)return;
    if(ctx.receipts.length){alert(`This mission cannot be unlocked because ${ctx.receipts.length} broker execution${ctx.receipts.length===1?' has':'s have'} already been confirmed. Use a reconciliation/reversal process instead.`);return;}
    if(!confirm('Undo this locked mission?\n\nThe Finance mission and approved Scouting plan will be kept. The Transfer route will return to editable status and broker-cash legs will be rebuilt from current broker cash.'))return;
    A.updateState(state=>{
      const mission=state.transfer?.mission,route=state.transfer?.route;
      if(!mission||!route||!route.locked||String(route.missionId||'')!==String(mission.id||''))return;
      route.locked=false;delete route.lockedAt;delete route.settled;delete route.settledAt;
      route.brokerCashAllocations=[];route.brokerCashAllocated=0;route.totalAllocated=Number(route.financeAllocated||0);route.updatedAt=new Date().toISOString();
      mission.status='READY';delete mission.lockedAt;mission.updatedAt=new Date().toISOString();
    });
    setTimeout(()=>{try{window.AuroraTransferStage2?.rebuildBrokerCash?.();}catch(_){}try{window.AuroraTransferStage2?.render?.();}catch(_){}render();},0);
  }

  function cancelEntireMission(){
    const A=window.AuroraClean,ctx=context();
    if(!A?.updateState||!ctx?.mission)return;
    if(ctx.receipts.length){alert(`This payday mission cannot be cancelled because ${ctx.receipts.length} broker execution${ctx.receipts.length===1?' has':'s have'} already been confirmed. Use a reconciliation/reversal process instead.`);return;}
    const budget=Number(ctx.mission.budget||0).toFixed(2);
    if(!confirm(`Cancel the ENTIRE payday investment process?\n\nThis will cancel the £${budget} Finance mission, remove its Scouting payday plan and delete the Transfer route. No broker trades have been confirmed, so Squad, Income and broker cash will not be changed.\n\nYou can then return to Finance and release a fresh mission.`))return;
    const cancelledAt=new Date().toISOString(),missionId=String(ctx.mission.id||'');
    A.updateState(state=>{
      state.transfer=state.transfer||{};
      state.transfer.cancelledMissions=Array.isArray(state.transfer.cancelledMissions)?state.transfer.cancelledMissions:[];
      state.transfer.cancelledMissions.unshift({mission:{...(state.transfer.mission||{}),status:'CANCELLED',cancelledAt},route:state.transfer.route?JSON.parse(JSON.stringify(state.transfer.route)):null,cancelledAt});
      state.transfer.cancelledMissions=state.transfer.cancelledMissions.slice(0,10);
      state.transfer.mission=null;
      state.transfer.route=null;
      if(state.scouting?.allocationPlan&&String(state.scouting.allocationPlan.missionId||'')===missionId)state.scouting.allocationPlan=null;
      if(state.finance?.stage6MissionRelease&&String(state.finance.stage6MissionRelease.missionId||'')===missionId)state.finance.stage6MissionRelease=null;
      if(state.registration?.receipts)state.registration.receipts=state.registration.receipts.filter(r=>String(r.missionId||'')!==missionId);
    });
    setTimeout(()=>{try{window.AuroraTransferStage2?.render?.();}catch(_){}render();},0);
    alert('Payday investment mission cancelled. Finance, Scouting and Transfer are clear for a fresh mission.');
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    ensureUnlockButton();ensureCancelButton();render();
    window.addEventListener('aurora-clean:state',render);window.addEventListener('pageshow',render);
    window.AuroraTransferUnlockMission=Object.freeze({BUILD,render,unlockMission,cancelEntireMission});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
