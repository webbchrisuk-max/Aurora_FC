(() => {
  'use strict';

  const BUILD='20260910-transfer-unlock-mission-1';
  const upper=v=>String(v||'').trim().toUpperCase();

  function context(){
    const A=window.AuroraClean;
    if(!A?.readState)return null;
    const state=A.readState();
    const mission=state.transfer?.mission;
    const route=state.transfer?.route;
    if(!mission||!route||String(route.missionId||'')!==String(mission.id||''))return null;
    const receipts=(state.registration?.receipts||[]).filter(r=>String(r.missionId||'')===String(mission.id||''));
    return {state,mission,route,receipts};
  }

  function ensureButton(){
    const actions=document.querySelector('#transferStage2Lock')?.parentElement;
    if(!actions)return null;
    let btn=document.getElementById('transferStage2Unlock');
    if(btn)return btn;
    btn=document.createElement('button');
    btn.id='transferStage2Unlock';
    btn.type='button';
    btn.textContent='Undo Locked Mission';
    btn.title='Unlock this route only if no broker executions have been confirmed';
    btn.style.borderColor='rgba(255,184,77,.45)';
    btn.style.color='#ffd38a';
    btn.style.background='rgba(255,166,0,.08)';
    actions.appendChild(btn);
    btn.addEventListener('click',unlockMission);
    return btn;
  }

  function render(){
    const btn=ensureButton();
    if(!btn)return;
    const ctx=context();
    const locked=!!ctx?.route?.locked && upper(ctx?.mission?.status)!=='COMPLETE';
    btn.hidden=!locked;
    btn.disabled=!locked;
    if(locked){
      const count=ctx.receipts.length;
      btn.textContent=count?`Locked · ${count} execution${count===1?'':'s'} confirmed`:'Undo Locked Mission';
      btn.disabled=count>0;
      btn.title=count>0?'Cannot unlock after a broker execution has been confirmed':'Return this locked route to editable Transfer';
    }
  }

  function unlockMission(){
    const A=window.AuroraClean,ctx=context();
    if(!A?.updateState||!ctx||!ctx.route.locked)return;
    if(ctx.receipts.length){
      alert(`This mission cannot be unlocked because ${ctx.receipts.length} broker execution${ctx.receipts.length===1?' has':'s have'} already been confirmed. Use a reconciliation/reversal process instead.`);
      return;
    }
    if(!confirm('Undo this locked mission?\n\nThe Finance mission and approved Scouting plan will be kept. The Transfer route will return to editable status and broker-cash legs will be rebuilt from current broker cash.'))return;

    A.updateState(state=>{
      const mission=state.transfer?.mission;
      const route=state.transfer?.route;
      if(!mission||!route||!route.locked||String(route.missionId||'')!==String(mission.id||''))return;
      route.locked=false;
      delete route.lockedAt;
      delete route.settled;
      delete route.settledAt;
      route.brokerCashAllocations=[];
      route.brokerCashAllocated=0;
      route.totalAllocated=Number(route.financeAllocated||0);
      route.updatedAt=new Date().toISOString();
      mission.status='READY';
      delete mission.lockedAt;
      mission.updatedAt=new Date().toISOString();
    });

    setTimeout(()=>{
      try{window.AuroraTransferStage2?.rebuildBrokerCash?.();}catch(_){}
      try{window.AuroraTransferStage2?.render?.();}catch(_){}
      render();
    },0);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    ensureButton();
    render();
    window.addEventListener('aurora-clean:state',render);
    window.addEventListener('pageshow',render);
    window.AuroraTransferUnlockMission=Object.freeze({BUILD,render,unlockMission});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
