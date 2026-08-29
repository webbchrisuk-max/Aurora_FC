(() => {
  'use strict';
  const BUILD='20260829-aurora-sidebar-1';
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
  function enhance(){
    const details=document.getElementById('auroraCleanMenu');
    if(!details){setTimeout(enhance,60);return;}
    details.querySelectorAll('a[href]').forEach(a=>{
      const href=String(a.getAttribute('href')||'').split('?')[0].split('#')[0];
      const file=href.split('/').pop()||'index.html';
      if(LABELS[file])a.textContent=LABELS[file];
      a.addEventListener('click',()=>{if(matchMedia('(max-width:899px)').matches)details.open=false;},{once:false});
    });
    const summary=details.querySelector('summary');
    if(summary)summary.textContent='☰ Aurora Menu';
    document.documentElement.dataset.auroraSidebar='ready';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  window.AuroraSidebar=Object.freeze({BUILD,enhance});
})();
