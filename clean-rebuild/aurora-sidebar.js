(() => {
  'use strict';
  const BUILD='20260829-aurora-sidebar-4-stable';
  const STORAGE_KEY='aurora-clean:sidebar-collapsed:v1';
  const LABELS={
    'index.html':['🏠','Nexus'],
    'finance.html':['💷','Finance Department'],
    'scouting.html':['🔎','Scouting Centre'],
    'transfer.html':['🔁','Transfer Centre'],
    'registration.html':['🧾','Registration Desk'],
    'squad.html':['⚽','Squad Hub'],
    'income.html':['📈','Income Centre'],
    'match-report.html':['📋','Match Report'],
    'club-control.html':['🧠','Club Control'],
    'system-health.html':['🩺','System Health']
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
      button.innerHTML=collapsed?'<span aria-hidden="true">›</span>':'<span aria-hidden="true">‹</span>';
    }
  }
  function ensureToggle(details){
    let button=document.getElementById('auroraSidebarToggle');
    if(button)return button;
    button=document.createElement('button');
    button.id='auroraSidebarToggle';
    button.type='button';
    button.className='aurora-sidebar-toggle';
    button.innerHTML='<span aria-hidden="true">‹</span>';
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const next=!document.documentElement.classList.contains('aurora-sidebar-collapsed');
      writeCollapsed(next);applyCollapsed(next);button.blur();
    });
    details.prepend(button);
    return button;
  }
  function decorateLinks(details){
    const current=String(location.pathname.split('/').pop()||'index.html').toLowerCase();
    details.querySelectorAll('a[href]').forEach(a=>{
      const href=String(a.getAttribute('href')||'').split('?')[0].split('#')[0];
      const file=(href.split('/').pop()||'index.html').toLowerCase();
      const meta=LABELS[file];
      if(meta){
        a.innerHTML=`<span class="aurora-nav-icon" aria-hidden="true">${meta[0]}</span><span class="aurora-nav-label">${meta[1]}</span>`;
        a.title=meta[1];
      }
      if(file===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
      a.addEventListener('pointerdown',()=>a.classList.add('aurora-nav-pressed'));
      const clear=()=>{a.classList.remove('aurora-nav-pressed');a.blur();};
      a.addEventListener('pointerup',clear);a.addEventListener('pointercancel',clear);
      a.addEventListener('click',()=>{clear();if(!isDesktop())details.open=false;});
    });
  }
  function syncMode(details){
    if(isDesktop()){
      details.open=true;details.setAttribute('data-sidebar-mode','desktop');applyCollapsed(readCollapsed());
    }else{
      details.removeAttribute('data-sidebar-mode');document.documentElement.classList.remove('aurora-sidebar-collapsed');
    }
  }
  function enhance(){
    const details=document.getElementById('auroraCleanMenu');
    if(!details){setTimeout(enhance,50);return;}
    ensureToggle(details);decorateLinks(details);
    const summary=details.querySelector('summary');if(summary)summary.textContent='☰ Aurora Menu';
    syncMode(details);
    const media=matchMedia('(min-width:900px)');
    const onChange=()=>syncMode(details);
    if(media.addEventListener)media.addEventListener('change',onChange);else media.addListener?.(onChange);
    window.addEventListener('pageshow',()=>syncMode(details));
    document.documentElement.dataset.auroraSidebar='ready';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  window.AuroraSidebar=Object.freeze({BUILD,enhance,applyCollapsed});
})();