(() => {
  'use strict';
  const BUILD='20260904-aurora-sidebar-5-mobile-drawer';
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

  function closeMobile(details){
    if(isDesktop()||!details)return;
    details.open=false;
    document.documentElement.classList.remove('aurora-mobile-menu-open');
    document.body.classList.remove('aurora-mobile-menu-open');
  }

  function openMobile(details){
    if(isDesktop()||!details)return;
    details.open=true;
    document.documentElement.classList.add('aurora-mobile-menu-open');
    document.body.classList.add('aurora-mobile-menu-open');
  }

  function ensureBackdrop(details){
    let backdrop=document.getElementById('auroraSidebarBackdrop');
    if(backdrop)return backdrop;
    backdrop=document.createElement('button');
    backdrop.id='auroraSidebarBackdrop';
    backdrop.type='button';
    backdrop.className='aurora-sidebar-backdrop';
    backdrop.setAttribute('aria-label','Close Aurora menu');
    backdrop.addEventListener('click',()=>closeMobile(details));
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function ensureMobileClose(details){
    const panel=details.querySelector(':scope > div');
    if(!panel)return null;
    let button=panel.querySelector('.aurora-mobile-close');
    if(button)return button;
    button=document.createElement('button');
    button.type='button';
    button.className='aurora-mobile-close';
    button.setAttribute('aria-label','Close Aurora menu');
    button.innerHTML='<span aria-hidden="true">×</span>';
    button.addEventListener('click',()=>closeMobile(details));
    panel.prepend(button);
    return button;
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
      if(a.dataset.auroraDecorated==='1')return;
      a.dataset.auroraDecorated='1';
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
      a.addEventListener('click',()=>{clear();closeMobile(details);});
    });
  }

  function syncMode(details){
    if(isDesktop()){
      details.open=true;
      details.setAttribute('data-sidebar-mode','desktop');
      document.documentElement.classList.remove('aurora-mobile-menu-open');
      document.body.classList.remove('aurora-mobile-menu-open');
      applyCollapsed(readCollapsed());
    }else{
      details.removeAttribute('data-sidebar-mode');
      document.documentElement.classList.remove('aurora-sidebar-collapsed');
      closeMobile(details);
    }
  }

  function enhance(){
    const details=document.getElementById('auroraCleanMenu');
    if(!details){setTimeout(enhance,50);return;}

    ensureToggle(details);
    ensureBackdrop(details);
    ensureMobileClose(details);
    decorateLinks(details);

    const summary=details.querySelector('summary');
    if(summary){
      summary.innerHTML='<span aria-hidden="true">☰</span><span>Aurora Menu</span>';
      summary.setAttribute('aria-label','Open Aurora menu');
      summary.addEventListener('click',event=>{
        if(isDesktop())return;
        event.preventDefault();
        details.open?closeMobile(details):openMobile(details);
      });
    }

    details.addEventListener('toggle',()=>{
      if(isDesktop())return;
      document.documentElement.classList.toggle('aurora-mobile-menu-open',details.open);
      document.body.classList.toggle('aurora-mobile-menu-open',details.open);
    });

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeMobile(details);
    });

    syncMode(details);
    const media=matchMedia('(min-width:900px)');
    const onChange=()=>syncMode(details);
    if(media.addEventListener)media.addEventListener('change',onChange);else media.addListener?.(onChange);
    window.addEventListener('pageshow',()=>syncMode(details));
    document.documentElement.dataset.auroraSidebar='ready';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  window.AuroraSidebar=Object.freeze({BUILD,enhance,applyCollapsed,openMobile,closeMobile});
})();