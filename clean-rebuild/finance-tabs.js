(() => {
  'use strict';
  const BUILD='20260827-clean-finance-tabs-1';
  const tabs=[
    {id:'payday',label:'Payday Control',eyebrow:'PAYDAY MISSION CONTROL',title:'Stages 1–6',desc:'Cash truth through mission release in one continuous flow.'},
    {id:'bills',label:'Bills',eyebrow:'BILL CONTROL',title:'Bills',desc:'Manage recurring bills and inspect the next payday cycle.'},
    {id:'pots',label:'Pots',eyebrow:'POT CONTROL',title:'Goal Pots',desc:'Manage pots and review the current funding plan.'},
    {id:'house',label:'House Improvements',eyebrow:'HOUSE PROJECT',title:'House Improvements',desc:'Renovation fund, room budgets and house payments.'}
  ];
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  function panelFor(el){return el?.closest('section')||null}
  function classify(){
    const all=qa('body[data-page="finance"] > section');
    all.forEach(s=>{if(!s.classList.contains('finance-stage-track'))s.dataset.financeTab='payday'});
    const billManager=panelFor(q('#financeBillCards')); if(billManager)billManager.dataset.financeTab='bills';
    const billCycle=panelFor(q('#financeStage2BillRows')); if(billCycle)billCycle.dataset.financeTab='bills';
    const potManager=panelFor(q('#financePotCards')); if(potManager)potManager.dataset.financeTab='pots';
    const potPlan=panelFor(q('#financeStage4PotRows')); if(potPlan)potPlan.dataset.financeTab='pots';
    const house=q('.house-project-section'); if(house)house.dataset.financeTab='house';
    qa('[data-finance-tab]').forEach(s=>s.classList.add('finance-tab-panel'));
  }
  function makeBar(){
    if(q('.finance-tabbar'))return;
    const hero=q('.finance-hero'); if(!hero)return;
    const bar=document.createElement('nav'); bar.className='finance-tabbar'; bar.setAttribute('aria-label','Finance sections');
    tabs.forEach((t,i)=>{
      const b=document.createElement('button'); b.type='button'; b.dataset.tab=t.id; b.textContent=t.label; b.setAttribute('aria-selected',i===0?'true':'false'); b.addEventListener('click',()=>select(t.id)); bar.appendChild(b);
    });
    hero.insertAdjacentElement('afterend',bar);
    const title=document.createElement('div'); title.className='finance-tab-panel-title'; title.id='financeTabTitle'; bar.insertAdjacentElement('afterend',title);
  }
  function select(id){
    if(!tabs.some(t=>t.id===id))id='payday';
    qa('.finance-tabbar button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===id?'true':'false'));
    qa('.finance-tab-panel').forEach(s=>{s.hidden=s.dataset.financeTab!==id});
    const meta=tabs.find(t=>t.id===id),title=q('#financeTabTitle');
    if(title&&meta)title.innerHTML=`<p class="eyebrow">${meta.eyebrow}</p><h2>${meta.title}</h2><p>${meta.desc}</p>`;
    try{sessionStorage.setItem('aurora-clean:finance-tab',id)}catch(_){}
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function boot(){
    if(!document.body?.matches('[data-page="finance"]'))return;
    classify(); makeBar();
    let saved='payday'; try{saved=sessionStorage.getItem('aurora-clean:finance-tab')||'payday'}catch(_){}
    select(saved); document.documentElement.dataset.financeTabs='ready'; window.AuroraFinanceTabs=Object.freeze({BUILD,select});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
