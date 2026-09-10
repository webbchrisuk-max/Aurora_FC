(() => {
  'use strict';

  const BUILD='20260910-registration-route-broker-bridge-1';
  const $=id=>document.getElementById(id);
  const upper=v=>String(v||'').trim().toUpperCase();
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const accountCode=v=>{const s=upper(v);if(s.includes('212'))return'T212';if(s==='IG'||s.includes('IG ISA'))return'IG';return''};
  const accountLabel=v=>accountCode(v)==='IG'?'IG ISA':accountCode(v)==='T212'?'Trading 212 ISA':'';

  let repairing=false;
  function context(){
    const A=window.AuroraClean;if(!A?.readState)return null;
    const state=A.readState(),mission=state.transfer?.mission,route=state.transfer?.route;
    if(!mission||!route||route.locked!==true||String(route.missionId||'')!==String(mission.id||''))return null;
    const legs=[...(route.allocations||[]),...(route.brokerCashAllocations||[])].filter(r=>num(r.amount)>0);
    return{state,mission,route,legs};
  }

  function repairMissionLock(){
    const ctx=context(),A=window.AuroraClean;
    if(!ctx||!A?.updateState||repairing)return false;
    if(upper(ctx.mission.status)==='LOCKED')return false;
    if(['COMPLETE','CANCELLED'].includes(upper(ctx.mission.status)))return false;
    repairing=true;
    try{
      A.updateState(state=>{
        const mission=state.transfer?.mission,route=state.transfer?.route;
        if(!mission||!route||route.locked!==true||String(route.missionId||'')!==String(mission.id||''))return;
        if(!['COMPLETE','CANCELLED'].includes(upper(mission.status))){
          mission.status='LOCKED';
          mission.updatedAt=new Date().toISOString();
        }
      });
      return true;
    }finally{repairing=false;}
  }

  function selectedLeg(ctx){
    if(!ctx)return null;
    const id=String($('regLeg')?.value||'');
    return ctx.legs.find(r=>String(r.legId||r.id||'')===id)||ctx.legs[0]||null;
  }

  function syncFormBroker(){
    const ctx=context(),select=$('regAccount');
    if(!ctx||!select)return;
    const leg=selectedLeg(ctx);if(!leg)return;
    const planned=accountLabel(leg.lockedAccount||leg.account||leg.broker||leg.preferredBroker||leg.platform);
    if(planned){
      if(select.value!==planned)select.value=planned;
      select.disabled=true;
      select.title='Broker locked by Transfer route';
    }else{
      select.disabled=false;
      select.title='';
    }
  }

  function syncBoardBrokers(){
    const ctx=context();if(!ctx)return;
    const rows=document.querySelectorAll('#registrationCommandBoard tbody tr[data-leg-id]');
    rows.forEach((tr,index)=>{
      const legId=String(tr.dataset.legId||'');
      const leg=ctx.legs.find(r=>String(r.legId||r.id||'')===legId)||ctx.legs[index];
      if(!leg)return;
      const broker=accountLabel(leg.lockedAccount||leg.account||leg.broker||leg.preferredBroker||leg.platform);
      if(!broker)return;
      const cells=tr.querySelectorAll('td');
      if(cells[4]&&cells[4].textContent.trim()==='—')cells[4].textContent=broker;
    });
  }

  function sync(){
    if(repairMissionLock())return;
    syncFormBroker();
    syncBoardBrokers();
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    document.addEventListener('change',e=>{if(e.target?.id==='regLeg')setTimeout(sync,0)});
    window.addEventListener('aurora-clean:state',()=>setTimeout(sync,0));
    window.addEventListener('pageshow',()=>setTimeout(sync,0));
    const observer=new MutationObserver(()=>sync());
    observer.observe(document.body,{childList:true,subtree:true});
    setTimeout(sync,0);
    window.AuroraRegistrationRouteBridge=Object.freeze({BUILD,sync,repairMissionLock});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
