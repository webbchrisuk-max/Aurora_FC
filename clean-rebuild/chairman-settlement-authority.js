(() => {
  'use strict';
  const BUILD='20260827-chairman-settlement-authority-1';
  function install(){
    const base=window.AuroraClean;if(!base){setTimeout(install,40);return}
    if(base.__chairmanSettlementAuthority)return;
    const wrapped=Object.freeze({...base,
      __chairmanSettlementAuthority:true,
      importRealHoldings:(options={})=>{
        const state=base.readState();
        if(state.squad?.chairmanSettlementPendingBackend===true&&!options?.force){
          return{ok:true,count:(state.squad?.holdings||[]).filter(h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(String(h.status||'ACTIVE').toUpperCase())&&Number(h.shares||0)>0).length,locked:true,message:'Chairman-settled Squad state is protected from stale live imports until backend sale truth is reconciled.'};
        }
        return base.importRealHoldings(options);
      }
    });
    window.AuroraClean=wrapped;
    window.AuroraChairmanSettlementAuthority=Object.freeze({BUILD,isProtected:()=>base.readState().squad?.chairmanSettlementPendingBackend===true});
  }
  install();
})();