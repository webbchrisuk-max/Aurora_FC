(() => {
  'use strict';
  const BUILD='20260926-aurora-sidebar-6-edge-autohide';
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
  let hideTimer=null;
  const isDesktop=()=>matchMedia('(min-width:900px)').matches;

  function setDesktopOpen(open){
    if(!isDesktop())return;
    clearTimeout(hideTimer);
    document.documentElement.classList.add('aurora-sidebar-autohide');
    document.documentElement.classList.toggle('aurora-sidebar-revealed',!!open);
    const button=document.getElementById('auroraSidebarToggle');
    if(button){
      button.setAttribute('aria-expanded',open?'true':'false');
      button.setAttribute('aria-label',open?'Hide Aurora sidebar':'Show Aurora sidebar');
      button.title=open?'Hide sidebar':'Show sidebar';
      button.innerHTML='<span aria-hidden="true">‹</span>';
    }
  }
  function revealDesktop(){setDesktopOpen(true)}
  function hideDesktop(delay=320){
    if(!isDesktop())return;
    clearTimeout(hideTimer);
    hideTimer=setTimeout(()=>setDesktopOpen(false),Math.max(0,delay));
  }
  function applyCollapsed(value){value?setDesktopOpen(false):setDesktopOpen(true)}

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
    backdrop.id='auroraSidebarBackdrop';backdrop.type='button';backdrop.className='aurora-sidebar-backdrop';
    backdrop.setAttribute('aria-label','Close Aurora menu');
    backdrop.addEventListener('click',()=>closeMobile(details));
    document.body.appendChild(backdrop);return backdrop;
  }
  function ensureMobileClose(details){
    const panel=details.querySelector(':scope > div');if(!panel)return null;
    let button=panel.querySelector('.aurora-mobile-close');if(button)return button;
    button=document.createElement('button');button.type='button';button.className='aurora-mobile-close';
    button.setAttribute('aria-label','Close Aurora menu');button.innerHTML='<span aria-hidden="true">×</span>';
    button.addEventListener('click',()=>closeMobile(details));panel.prepend(button);return button;
  }
  function ensureToggle(details){
    let button=document.getElementById('auroraSidebarToggle');if(button)return button;
    button=document.createElement('button');button.id='auroraSidebarToggle';button.type='button';button.className='aurora-sidebar-toggle';
    button.innerHTML='<span aria-hidden="true">‹</span>';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();hideDesktop(0);button.blur();});
    details.prepend(button);return button;
  }
  function ensureEdgeTrigger(){
    let edge=document.getElementById('auroraSidebarEdge');if(edge)return edge;
    edge=document.createElement('button');edge.id='auroraSidebarEdge';edge.type='button';edge.className='aurora-sidebar-edge';
    edge.setAttribute('aria-label','Open Aurora sidebar');edge.title='Open Aurora sidebar';
    edge.addEventListener('pointerenter',revealDesktop);
    edge.addEventListener('focus',revealDesktop);
    edge.addEventListener('click',event=>{event.preventDefault();revealDesktop();});
    document.body.appendChild(edge);return edge;
  }
  function decorateLinks(details){
    const current=String(location.pathname.split('/').pop()||'index.html').toLowerCase();
    details.querySelectorAll('a[href]').forEach(a=>{
      if(a.dataset.auroraDecorated==='1')return;
      a.dataset.auroraDecorated='1';
      const href=String(a.getAttribute('href')||'').split('?')[0].split('#')[0];
      const file=(href.split('/').pop()||'index.html').toLowerCase(),meta=LABELS[file];
      if(meta){a.innerHTML=`<span class="aurora-nav-icon" aria-hidden="true">${meta[0]}</span><span class="aurora-nav-label">${meta[1]}</span>`;a.title=meta[1];}
      if(file===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
      a.addEventListener('pointerdown',()=>a.classList.add('aurora-nav-pressed'));
      const clear=()=>{a.classList.remove('aurora-nav-pressed');a.blur();};
      a.addEventListener('pointerup',clear);a.addEventListener('pointercancel',clear);
      a.addEventListener('click',()=>{clear();if(isDesktop())hideDesktop(0);else closeMobile(details);});
    });
  }
  function bindDesktopReveal(details){
    const nav=document.getElementById('auroraNav'),edge=ensureEdgeTrigger();
    if(nav&&!nav.dataset.auroraAutoHideBound){
      nav.dataset.auroraAutoHideBound='1';
      nav.addEventListener('pointerenter',()=>{clearTimeout(hideTimer);revealDesktop();});
      nav.addEventListener('pointerleave',event=>{
        if(!isDesktop())return;
        const x=event.clientX||999;
        hideDesktop(x<=16?500:260);
      });
      nav.addEventListener('focusin',revealDesktop);
      nav.addEventListener('focusout',()=>hideDesktop(450));
    }
    if(!document.documentElement.dataset.auroraEdgeBound){
      document.documentElement.dataset.auroraEdgeBound='1';
      document.addEventListener('pointermove',event=>{
        if(!isDesktop()||event.pointerType==='touch')return;
        if(event.clientX<=14)revealDesktop();
      },{passive:true});
      document.addEventListener('pointerdown',event=>{
        if(!isDesktop()||!document.documentElement.classList.contains('aurora-sidebar-revealed'))return;
        const navEl=document.getElementById('auroraNav');
        if(navEl&&!navEl.contains(event.target)&&event.target!==edge)hideDesktop(0);
      });
      document.addEventListener('touchstart',event=>{
        if(!isDesktop())return;
        const t=event.touches?.[0];
        if(t&&t.clientX<=24)revealDesktop();
      },{passive:true});
    }
  }
  function syncMode(details){
    if(isDesktop()){
      details.open=true;details.setAttribute('data-sidebar-mode','desktop');
      document.documentElement.classList.remove('aurora-mobile-menu-open','aurora-sidebar-collapsed');
      document.body.classList.remove('aurora-mobile-menu-open');
      document.documentElement.classList.add('aurora-sidebar-autohide');
      setDesktopOpen(false);
    }else{
      details.removeAttribute('data-sidebar-mode');
      document.documentElement.classList.remove('aurora-sidebar-autohide','aurora-sidebar-revealed','aurora-sidebar-collapsed');
      closeMobile(details);
    }
  }
  function enhance(){
    const details=document.getElementById('auroraCleanMenu');if(!details){setTimeout(enhance,50);return;}
    ensureToggle(details);ensureBackdrop(details);ensureMobileClose(details);ensureEdgeTrigger();decorateLinks(details);bindDesktopReveal(details);
    const summary=details.querySelector('summary');
    if(summary){
      summary.innerHTML='<span aria-hidden="true">☰</span><span>Aurora Menu</span>';summary.setAttribute('aria-label','Open Aurora menu');
      summary.addEventListener('click',event=>{if(isDesktop())return;event.preventDefault();details.open?closeMobile(details):openMobile(details);});
    }
    details.addEventListener('toggle',()=>{if(isDesktop())return;document.documentElement.classList.toggle('aurora-mobile-menu-open',details.open);document.body.classList.toggle('aurora-mobile-menu-open',details.open);});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(isDesktop())hideDesktop(0);else closeMobile(details);}});
    syncMode(details);
    const media=matchMedia('(min-width:900px)'),onChange=()=>syncMode(details);
    if(media.addEventListener)media.addEventListener('change',onChange);else media.addListener?.(onChange);
    window.addEventListener('pageshow',()=>syncMode(details));
    document.documentElement.dataset.auroraSidebar='ready';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  window.AuroraSidebar=Object.freeze({BUILD,enhance,applyCollapsed,revealDesktop,hideDesktop,openMobile,closeMobile});
})();