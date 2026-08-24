(function(w){
'use strict';
w.AuroraRelease=Object.freeze({
  product:'Aurora 2.0',
  release:'Scouting Intelligence 3 + Match Report Truth',
  build:'2026.08.19.5',
  schemaVersion:11,
  syncManagerVersion:1,
  platformVersion:1,
  releasedAt:'2026-08-19T17:28:00+01:00',
  channel:'stable-candidate'
});

/* Scouting Intelligence 3 is the canonical final scoring authority. */
function ensureScoutingIntelligence3(){
  const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
  if(page!=='scouting.html')return;
  if(!w.AuroraScoutingIntelligence3Migration&&!document.querySelector('script[data-aurora-scouting-intelligence3-migration]')){
    const migration=document.createElement('script');
    migration.src='scouting-intelligence-3-migration.js?v=20260819-intelligence-3-migration-3';
    migration.async=false;
    migration.dataset.auroraScoutingIntelligence3Migration='1';
    document.head.appendChild(migration);
  }
  if(!w.AuroraScoutingIntelligence3&&!document.querySelector('script[data-aurora-scouting-intelligence3]')){
    const script=document.createElement('script');
    script.src='scouting-intelligence-3.js?v=20260819-intelligence-3-2';
    script.async=false;
    script.dataset.auroraScoutingIntelligence3='1';
    document.head.appendChild(script);
  }
  if(!w.AuroraScoutingIntelligence3GlobalBridge&&!document.querySelector('script[data-aurora-scouting-intelligence3-global]')){
    const script=document.createElement('script');
    script.src='scouting-intelligence-3-global-bridge.js?v=20260819-intelligence-3-global-1';
    script.async=false;
    script.dataset.auroraScoutingIntelligence3Global='1';
    document.head.appendChild(script);
  }
}
ensureScoutingIntelligence3();

/* Match Report must use one daily-performance authority from hero to player rows. */
function ensureMatchReportLiveAuthority(){
  const page=(String(location.pathname||'').split('/').pop()||'').toLowerCase();
  if(page!=='match-report.html')return;
  if(w.AuroraMatchReportLiveAuthority||document.querySelector('script[data-aurora-match-report-live-authority]'))return;
  const script=document.createElement('script');
  script.src='match-report-live-authority.js?v=20260819-match-truth-2';
  script.async=false;
  script.dataset.auroraMatchReportLiveAuthority='1';
  document.head.appendChild(script);
}
ensureMatchReportLiveAuthority();

/* Shared header housekeeping.
 * Club Command owns the honest market freshness pill (#auroraDataFreshness).
 * Older department HTMLs may still carry one or more .aurora-shell-live badges.
 * Prefer the freshness pill whenever visible and suppress every redundant live
 * badge anywhere in the same header, not just one exact context node.
 */
function enforceSingleLiveStatus(){
  document.querySelectorAll('.aurora-shell-header,.match-header,.n2-header').forEach(header=>{
    const freshness=header.querySelector('#auroraDataFreshness');
    const legacy=[...header.querySelectorAll('.aurora-shell-live,.live')].filter(el=>el!==freshness&&el.id!=='auroraDataFreshness');
    let freshnessVisible=false;
    if(freshness){
      freshnessVisible=getComputedStyle(freshness).display!=='none';
      freshness.hidden=false;
      freshness.removeAttribute('aria-hidden');
    }
    legacy.forEach(el=>{
      /* reportState is useful report content only when no freshness pill exists. */
      if(freshness&&freshnessVisible){
        el.dataset.auroraSingleLiveHidden='1';
        el.hidden=true;
        el.setAttribute('aria-hidden','true');
        el.style.setProperty('display','none','important');
      }else if(el.dataset.auroraSingleLiveHidden==='1'){
        el.hidden=false;
        el.removeAttribute('aria-hidden');
        el.style.removeProperty('display');
        delete el.dataset.auroraSingleLiveHidden;
      }
    });
  });
}

function installSingleLiveGuard(){
  enforceSingleLiveStatus();
  const target=document.body||document.documentElement;
  if(!target)return;
  const observer=new MutationObserver(()=>enforceSingleLiveStatus());
  observer.observe(target,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
  [50,180,500,1200,2500].forEach(ms=>setTimeout(enforceSingleLiveStatus,ms));
  w.addEventListener('resize',enforceSingleLiveStatus,{passive:true});
  w.addEventListener('aurora2:state',enforceSingleLiveStatus);
  w.AuroraSingleLiveStatus={refresh:enforceSingleLiveStatus};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSingleLiveGuard,{once:true});
else installSingleLiveGuard();
})(window);
