(() => {
  'use strict';

  const BUILD='20260827-clean-finance-auto-ui-1';
  const managedIds=[
    ['financeImportBills','financeRecalculateBills','Bills'],
    ['financeImportHoldingPot','financeRecalculateHolding','Holding Pot'],
    ['financeImportPots','financeRecalculatePots','Goal Pots'],
    [null,'financeRecalculateDecision','Payday Decision']
  ];

  function badge(section,label){
    const heading=section?.querySelector('.section-heading');
    if(!heading||heading.querySelector('.finance-live-badge'))return;
    const el=document.createElement('span');
    el.className='finance-live-badge';
    el.textContent='LIVE · AUTO UPDATED';
    el.title=`${label} updates automatically from clean Finance data`;
    heading.appendChild(el);
  }

  function installStyles(){
    if(document.getElementById('financeAutoUiStyle'))return;
    const style=document.createElement('style');
    style.id='financeAutoUiStyle';
    style.textContent=`
      .finance-live-badge{display:inline-flex;align-items:center;white-space:nowrap;padding:7px 10px;border:1px solid rgba(94,255,165,.3);border-radius:999px;background:rgba(94,255,165,.08);color:#9bffc1;font:900 10px/1 system-ui;letter-spacing:.06em}
      .finance-auto-managed>.finance-actions{display:none!important}
      .finance-auto-managed .section-heading>p{max-width:760px}
      #financeManualFallback{margin-top:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:0;background:rgba(255,255,255,.025)}
      #financeManualFallback>summary{cursor:pointer;list-style:none;padding:12px 14px;font:800 11px system-ui;color:#8ea7ba}
      #financeManualFallback>summary::-webkit-details-marker{display:none}
      #financeManualFallback .finance-manual-fallback-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 14px 14px}
      #financeManualFallback button{opacity:.82}
    `;
    document.head.appendChild(style);
  }

  function setup(){
    installStyles();
    const fallback=document.createElement('details');
    fallback.id='financeManualFallback';
    fallback.innerHTML='<summary>Manual recovery controls</summary><div class="finance-manual-fallback-actions"></div>';
    const fallbackActions=fallback.querySelector('.finance-manual-fallback-actions');
    let firstManagedSection=null;

    managedIds.forEach(([importId,recalcId,label])=>{
      const button=document.getElementById(recalcId)||document.getElementById(importId);
      const section=button?.closest('.department-section');
      if(!section)return;
      if(!firstManagedSection)firstManagedSection=section;
      section.classList.add('finance-auto-managed');
      badge(section,label);
      const desc=section.querySelector('.section-heading>p');
      if(desc){
        if(label==='Bills')desc.textContent='Bills are read directly from Payday Control and recalculated automatically for the current payday cycle.';
        if(label==='Holding Pot')desc.textContent='Holding Pot balance and target are read directly from the clean Finance pots and updated automatically.';
        if(label==='Goal Pots')desc.textContent='Goal-pot funding updates automatically from the current clean Finance pot balances, targets and deadlines.';
      }
      [importId,recalcId].filter(Boolean).forEach(id=>{
        const el=document.getElementById(id);
        if(el){el.textContent=id.startsWith('financeImport')?`Reload ${label}`:`Recalculate ${label}`;fallbackActions.appendChild(el);}
      });
    });

    const stage5Button=document.getElementById('financeRecalculateDecision');
    const stage5Section=stage5Button?.closest('.department-section');
    if(stage5Section){
      const desc=stage5Section.querySelector('.section-heading>p');
      if(desc)desc.textContent='Maximum Safe Release is kept live automatically from current cash, bills, Holding Pot and goal-pot commitments.';
      stage5Section.appendChild(fallback);
    }else if(firstManagedSection){
      firstManagedSection.appendChild(fallback);
    }

    const stage6=document.getElementById('financeReleaseMission')?.closest('.department-section');
    if(stage6){
      const heading=stage6.querySelector('.section-heading>p');
      if(heading)heading.textContent='This is the deliberate approval step: release the current proved Maximum Safe Release into the investment mission chain.';
    }

    document.documentElement.dataset.financeAutoUi='ready';
    window.AuroraFinanceAutoUI=Object.freeze({BUILD,ready:true});
  }

  function boot(){
    if(!window.AuroraClean||!window.AuroraFinanceEngine){setTimeout(boot,50);return;}
    setup();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
