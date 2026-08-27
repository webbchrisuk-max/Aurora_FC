(() => {
  'use strict';
  const BUILD='20260827-squad-order-market-first-1';
  function apply(){
    const market=document.getElementById('squadCurrentMarketPosition');
    const intel=document.getElementById('squadIntelligence');
    if(!market||!intel){setTimeout(apply,50);return;}
    if(market.nextElementSibling!==intel)market.insertAdjacentElement('afterend',intel);
  }
  function boot(){apply();window.addEventListener('aurora-clean:state',()=>setTimeout(apply,0));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.AuroraSquadOrder=Object.freeze({BUILD,apply});
})();