(() => {
  'use strict';
  const BUILD='20260902-chief-scout-payday-command-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function ensureCommand(){
    let host=$('scoutingCommand');if(host)return host;
    const hero=document.querySelector('header.scouting-hero');if(!hero)return null;
    host=document.createElement('section');host.id='scoutingCommand';host.className='scouting-command';
    hero.insertAdjacentElement('afterend',host);return host;
  }

  function ensureIntelligence(){
    let details=$('scoutingIntelligence');if(details)return details;
    const anchor=document.querySelector('.scouting-universe-section')||document.body.lastElementChild;
    details=document.createElement('details');details.id='scoutingIntelligence';details.className='scouting-compact';
    details.innerHTML='<summary>Scouting Intelligence · View full opportunity pool</summary><div class="scouting-compact-body" id="scoutingIntelligenceBody"></div>';
    anchor.insertAdjacentElement('afterend',details);return details;
  }

  function ensureAdminWrap(){
    const section=document.querySelector('.scouting-universe-section');if(!section||section.closest('#scoutingAdmin'))return;
    const details=document.createElement('details');details.id='scoutingAdmin';details.className='scouting-compact';
    details.innerHTML='<summary>Scouting Administration</summary><div class="scouting-compact-body"></div>';
    section.parentNode.insertBefore(details,section);details.querySelector('.scouting-compact-body').appendChild(section);
  }

  function moveNetwork(){
    const network=$('scoutingNetwork'),body=$('scoutingIntelligenceBody');
    if(network&&body&&network.parentNode!==body)body.appendChild(network);
  }

  function reason(row){
    const bits=[];
    if(num(row.yieldPct)>0)bits.push(`${num(row.yieldPct).toFixed(2)}% forward yield`);
    if(num(row.networkScore||row.score)>0)bits.push(`${num(row.networkScore||row.score).toFixed(1)}/100 network score`);
    if(row.held)bits.push('existing holding');else bits.push('new opportunity');
    if(row.pipelineStage)bits.push(String(row.pipelineStage).toLowerCase());
    return bits.join(' · ');
  }

  function pickCard(row,index){
    return `<article class="scouting-pick ${index===0?'top':''}"><div class="scouting-pick-rank">${index===0?'TOP RECOMMENDATION':`PICK #${index+1}`}</div><h3>${esc(row.ticker)}</h3><div class="name">${esc(row.name||row.ticker)}</div><div class="scouting-pick-amount">${money(row.amount)}</div><div class="scouting-pick-grid"><div class="scouting-pick-stat"><span>NETWORK SCORE</span><strong>${num(row.networkScore||row.score).toFixed(1)}</strong></div><div class="scouting-pick-stat"><span>FORWARD YIELD</span><strong>${num(row.yieldPct).toFixed(2)}%</strong></div><div class="scouting-pick-stat"><span>ANNUAL INCOME</span><strong>${money(row.expectedAnnualIncome)}</strong></div><div class="scouting-pick-stat"><span>VERDICT</span><strong>${esc(row.verdict||row.pipelineStage||'SELECTED')}</strong></div></div><p class="scouting-pick-reason">${esc(reason(row))}</p></article>`;
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    ensureAdminWrap();ensureIntelligence();moveNetwork();
    const state=A.readState(),plan=state.scouting?.allocationPlan||{},mission=state.transfer?.mission||{};
    const budget=num(plan.budget||mission.budget),alloc=Array.isArray(plan.allocations)?plan.allocations:[];
    const host=ensureCommand();if(!host)return;
    const strategy=state.scouting?.strategy==='maximum'?'Maximum Income':'Sustainable Income';
    const universe=window.AuroraScoutingNetwork?.rankings?.(state)||[];
    const strong=universe.filter(r=>num(r.networkScore||r.score)>=78).length;
    const buy=universe.filter(r=>num(r.networkScore||r.score)>=68&&num(r.networkScore||r.score)<78).length;
    host.innerHTML=`<div class="scouting-mission"><div class="scouting-mission-head"><div><p class="eyebrow scouting-eyebrow">PAYDAY SCOUTING MISSION</p><h2>${budget>0?'Aurora has your approved payday budget':'Waiting for the Finance mission'}</h2><p>${budget>0?`Aurora has ranked the full opportunity pool and selected the strongest ${alloc.length||'available'} option${alloc.length===1?'':'s'} for this payday.`:'Release the investment budget from Payday Mission Control and the Chief Scout will build the shortlist automatically.'}</p></div><div class="scouting-budget-pill"><span>APPROVED INVESTMENT BUDGET</span><strong>${money(budget)}</strong></div></div><div class="scouting-mission-kpis"><article class="scouting-mission-kpi"><span>SCOUTING STRATEGY</span><strong>${strategy}</strong></article><article class="scouting-mission-kpi"><span>OPPORTUNITIES SCOUTED</span><strong>${universe.length.toLocaleString('en-GB')}</strong></article><article class="scouting-mission-kpi"><span>PROJECTED EXTRA INCOME</span><strong>${money(plan.projectedAnnualIncome)}</strong></article></div><div class="scouting-picks">${alloc.length?alloc.map(pickCard).join(''):`<div class="scouting-empty">No payday shortlist yet. Once Finance releases the mission, Aurora will automatically scout the universe, choose the strongest candidates and show exactly how much to allocate to each.</div>`}</div><div class="scouting-command-actions"><div><span class="scouting-plan-status">${esc(plan.status||'WAITING')}</span><p class="scouting-admin-note">Strong Buy: ${strong} · Buy: ${buy} · Full universe remains available below when you want to inspect it.</p></div><button id="scoutingCommandApprove" type="button" class="finance-primary" ${!alloc.length||plan.status==='APPROVED'?'disabled':''}>${plan.status==='APPROVED'?'Payday Plan Approved ✓':'Approve Payday Plan'}</button></div></div>`;
    $('scoutingCommandApprove')?.addEventListener('click',()=>$('scoutingApprovePlan')?.click());
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    ensureAdminWrap();ensureIntelligence();render();
    const timer=setInterval(()=>{moveNetwork();if($('scoutingNetwork'))clearInterval(timer)},100);
    window.addEventListener('aurora-clean:state',()=>{render();setTimeout(moveNetwork,0)});
    window.addEventListener('pageshow',render);
    window.AuroraScoutingCommand=Object.freeze({BUILD,render});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();