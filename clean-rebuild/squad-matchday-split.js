(() => {
  'use strict';
  const BUILD='20260827-squad-matchday-split-market-first-2';
  const $=id=>document.getElementById(id);
  function arrange(){
    const market=$('squadCurrentMarketPosition'),pitch=$('squadMatchdayPitch'),table=document.querySelector('.squad-register');
    if(!market||!pitch||!table)return false;
    let layout=$('squadMatchdayLayout');
    if(!layout){
      layout=document.createElement('section');
      layout.id='squadMatchdayLayout';
      layout.className='squad-matchday-layout';
    }
    if(market.nextElementSibling!==layout)market.insertAdjacentElement('afterend',layout);
    if(pitch.parentNode!==layout)layout.appendChild(pitch);
    if(table.parentNode!==layout)layout.appendChild(table);
    return true;
  }
  function boot(){
    if(arrange())return finish();
    let tries=0;const timer=setInterval(()=>{tries+=1;if(arrange()||tries>80){clearInterval(timer);if($('squadMatchdayLayout'))finish();}},75);
  }
  function finish(){
    window.addEventListener('aurora-clean:state',()=>setTimeout(arrange,0));
    window.addEventListener('aurora:market-prices',()=>setTimeout(arrange,0));
    window.AuroraSquadMatchdaySplit=Object.freeze({BUILD,arrange});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
