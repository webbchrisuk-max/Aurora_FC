(() => {
  'use strict';
  const BUILD='20260827-chairman-settlement-lock-1';
  let writing=false;
  function sync(){
    if(writing||!window.AuroraClean)return;
    const A=window.AuroraClean,state=A.readState(),routes=Array.isArray(state.transfer?.chairmanReplacementRoutes)?state.transfer.chairmanReplacementRoutes:[];
    const completed=routes.filter(r=>String(r.status||'').toUpperCase()==='COMPLETE'&&r.settledAt).sort((a,b)=>Date.parse(b.settledAt)-Date.parse(a.settledAt))[0];
    if(!completed||state.squad?.chairmanSettlementPendingBackend===true)return;
    writing=true;
    A.updateState(next=>{next.squad=next.squad||{};next.squad.chairmanSettlementPendingBackend=true;next.squad.chairmanSettlementRouteId=completed.id;next.squad.chairmanSettlementLockedAt=new Date().toISOString();});
    writing=false;
  }
  function boot(){if(!window.AuroraClean){setTimeout(boot,40);return}sync();window.addEventListener('aurora-clean:state',sync);window.AuroraChairmanSettlementLock=Object.freeze({BUILD,sync})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();