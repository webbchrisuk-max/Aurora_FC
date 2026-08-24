/* Aurora 2 shared hero artwork configuration. Presentation only. */
(function(){
  'use strict';

  const ASSET_VERSION='20260815-1';
  const heroes={
    nexus:{selector:'.hq4-hero',image:'assets/heroes/nexus-hq-stadium.PNG',position:'center',tablet:'62% center',mobile:'70% center'},
    finance:{selector:'.finance-command-hero',image:'assets/heroes/finance-command.PNG',position:'center',tablet:'64% center',mobile:'72% center'},
    transfer:{selector:'.transfer-command-hero',image:'assets/heroes/transfer-centre.PNG',position:'center',tablet:'65% center',mobile:'73% center'},
    squad:{selector:'.squad-command-hero',image:'assets/heroes/squad-hub.PNG',position:'center',tablet:'64% center',mobile:'70% center'},
    scouting:{selector:'.scouting-command-hero',image:'assets/heroes/scouting-centre.PNG',position:'center',tablet:'65% center',mobile:'72% center'},
    registration:{selector:'.registration-command-hero',image:'assets/heroes/registration-desk.PNG',position:'center',tablet:'65% center',mobile:'74% center'},
    income:{selector:'.income-command-hero',image:'assets/heroes/income-centre.PNG',position:'center',tablet:'65% center',mobile:'72% center'},
    boardroom:{selector:'.chairman-command-hero',image:'assets/heroes/club-control.PNG',position:'center',tablet:'64% center',mobile:'71% center'},
    health:{selector:'.health-hero',image:'assets/heroes/system-health.PNG',position:'center',tablet:'65% center',mobile:'72% center'}
  };

  Object.entries(heroes).forEach(function([department,config]){
    const hero=document.querySelector(config.selector);
    if(!hero)return;
    hero.classList.add('aurora-hero-art');
    hero.dataset.auroraHero=department;
    hero.style.setProperty('--aurora-hero-image','url("'+config.image+'?v='+ASSET_VERSION+'")');
    hero.style.setProperty('--aurora-hero-position',config.position);
    hero.style.setProperty('--aurora-hero-tablet-position',config.tablet);
    hero.style.setProperty('--aurora-hero-mobile-position',config.mobile);
  });
})();

/* Keep floating hero facts in step with their existing authoritative UI values. */
(function(){
  'use strict';
  function syncHeroFacts(){
    document.querySelectorAll('[data-mirror]').forEach(function(target){
      const source=document.getElementById(target.dataset.mirror);
      if(source&&source!==target&&target.textContent!==source.textContent)target.textContent=source.textContent;
    });
  }
  syncHeroFacts();
  const observer=new MutationObserver(syncHeroFacts);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  window.addEventListener('aurora:statechange',syncHeroFacts);
})();

/* Club Control page extension loader. Keeps optional Chairman intelligence out of other departments. */
(function(){
  'use strict';
  if(!document.querySelector('.chairman-command-page'))return;
  if(document.querySelector('script[data-aurora-chairman-offer-ladder]'))return;
  const script=document.createElement('script');
  script.src='chairman-offer-ladder.js?v=20260822-v04';
  script.async=false;
  script.dataset.auroraChairmanOfferLadder='v0.4';
  document.head.appendChild(script);
})();
