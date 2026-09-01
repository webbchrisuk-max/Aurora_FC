(() => {
  'use strict';

  const BUILD='20260901-chairman-offers-reset-1';
  const RESET_MARKER='20260901-chairman-single-backend-rebuild';

  function reset(){
    const A=window.AuroraClean;
    if(!A?.readState||!A?.updateState){setTimeout(reset,60);return;}
    const state=A.readState();
    if(state.transfer?.chairmanOffersResetMarker===RESET_MARKER)return;

    A.updateState(next=>{
      next.transfer=next.transfer&&typeof next.transfer==='object'?next.transfer:{};
      next.transfer.chairmanOffers=[];
      delete next.transfer.chairmanOffersAuthority;
      delete next.transfer.chairmanOfferSelection;
      delete next.transfer.chairmanOfferDraft;
      next.transfer.chairmanOffersResetMarker=RESET_MARKER;
      next.transfer.chairmanOffersSource='REBUILD_PENDING_BACKEND';
    });

    window.dispatchEvent(new CustomEvent('aurora:chairman-offers-reset',{detail:{BUILD,marker:RESET_MARKER}}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reset,{once:true});
  else reset();

  window.AuroraChairmanOffersReset=Object.freeze({BUILD,RESET_MARKER,reset});
})();
