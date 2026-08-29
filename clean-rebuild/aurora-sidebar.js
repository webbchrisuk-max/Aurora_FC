(() => {
  'use strict';
  const BUILD='20260829-aurora-sidebar-3-collapsible';
  const STORAGE_KEY='aurora-clean:sidebar-collapsed:v1';
  const LABELS={
    'index.html':'🏠 Nexus',
    'finance.html':'💷 Finance Department',
    'scouting.html':'🔎 Scouting Centre',
    'transfer.html':'🔁 Transfer Centre',
    'registration.html':'🧾 Registration Desk',
    'squad.html':'⚽ Squad Hub',
    'income.html':'📈 Income Centre',
    'match-report.html':'📋 Match Report',
    'club-control.html':'🧠 Club Control',
    'system-health.html':'🩺 System Health'
  };
  function isDesktop(){return matchMedia('(min-width:900px)').matches;}
  function readCollapsed(){try{return localStorage.getItem(STORAGE_KEY)==='1';}catch(_){return false;}}
  function writeCollapsed(value){try{localStorage.setItem(STORAGE_KEY,value?'1':'0');}catch(_){}}
  function applyCollapsed(value){
    const collapsed=!!value&&isDesktop();
    document.documentElement.classList.toggle('aurora-sidebar-collapsed',collapsed);
    const button=document.getElementById('auroraSidebarToggle');
    if(button){
      button.setAttribute('aria-expanded',collapsed?'false':'true');
      button.setAttribute('aria-label',collapsed?'Expand Aurora sidebar':'Collapse Aurora sidebar');
      button.title=collapsed?'Expand sidebar':'Collapse sidebar';
      button.textContent=collapsed?'›':'‹';
    }
  }
  function syncMode(details){
    if(isDesktop()){
      details.open=true;
      details.setAttribute('data-sidebar-mode','desktop');
      applyCollapsed(readCollapsed());
    }else{
      details.removeAttribute('data-sidebar-mode');
      document.documentElement.classList.remove('aurora-sidebar-collapsed');
    }
  }
  function ensureToggle(details){
    if(document.getElementById('auroraSidebarToggle'))return;
    const button=document.createElement('button');
    button.id='auroraSidebarToggle';
    button.type='button';
    button.className='aurora-sidebar-toggle';
    button.addEventListener('click',()=>{
      const next=!document.documentElement.classList.contains('aurora-sidebar-collapsed');
      writeCollapsed(next);
      applyCollapsed(next);
    });
    details.prepend(button);
  }
  function enhance(){
    const details=document.getElementById('auroraCleanMenu');
    if(!details){setTimeout(enhance,60);return;}
    ensureToggle(details);
    details.querySelectorAll('a[href]').forEach(a=>{
      const href=String(a.getAttribute('href')||'').split('?')[0].split('#')[0];
      const file=href.split('/').pop()||'index.html';
      if(LABELS[file]){
        a.textContent=LABELS[file];
        a.dataset.fullLabel=LABELS[file];
        a.setAttribute('title',LABELS[file].replace(/^\S+\s*/,''));
      }
      a.addEventListener('click',()=>{if(!isDesktop())details.open=false;});
    });
    const summary=details.querySelector('summary');
    if(summary)summary.textContent='☰ Aurora Menu';
    syncMode(details);
    const media=matchMedia('(min-width:900px)');
    const onChange=()=>syncMode(details);
    if(media.addEventListener)media.addEventListener('change',onChange);
    else if(media.addListener)media.addListener(onChange);
    window.addEventListener('pageshow',()=>syncMode(details));
    document.documentElement.dataset.auroraSidebar='ready';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  window.AuroraSidebar=Object.freeze({BUILD,enhance,applyCollapsed});
})();
