(() => {
  'use strict';
  const BUILD='20260910-chief-scout-payday-command-4-canonical-top-pick';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function ensureCommand(){
    let host=$('scoutingCommand');if(host)return host;
    const hero=document.querySelector('header.scouting-hero');if(!hero)return null;
    host=document.createElement('section');host.id='scoutingCommand';host.className='scouting-command';
    hero.insertAdjacentElement('afterend',host);return host;
  }

  function ensureAdminWrap(){
    const section=document.querySelector('.scouting-universe-section');
    if(!section)return null;
    let details=$('scoutingAdmin');
    if(!details){
      details=document.createElement('details');details.id='scoutingAdmin';details.className='scouting-compact';
      details.innerHTML='<summary>Scouting Administration</summary><div class="scouting-compact-body"></div>';
      section.parentNode.insertBefore(details,section);
      details.querySelector('.scouting-compact-body').appendChild(section);
    }
    return details;
  }

  function ensureIntelligence(){
    const admin=ensureAdminWrap();
    let details=$('scoutingIntelligence');
    if(!details){
      details=document.createElement('details');details.id='scoutingIntelligence';details.className='scouting-compact';details.open=true;
      details.innerHTML='<summary>Scouting Intelligence · View full opportunity pool</summary><div class="scouting-compact-body" id="scoutingIntelligenceBody"><div id="scoutingIntelligenceLoading" class="scouting-empty">Loading full opportunity pool…</div></div>';
    }
    if(admin&&details.parentNode!==admin.parentNode){admin.insertAdjacentElement('afterend',details);}
    else if(admin&&details.previousElementSibling!==admin){admin.insertAdjacentElement('afterend',details);}
    return details;
  }

  function moveNetwork(){
    const details=ensureIntelligence();
    const network=$('scoutingNetwork'),body=$('scoutingIntelligenceBody');
    if(!details||!body)return false;
    if(network){
      if(network.parentNode!==body)body.appendChild(network);
      $('scoutingIntelligenceLoading')?.remove();
      return network.parentNode===body;
    }
    if(!$('scoutingIntelligenceLoading')){
      const loading=document.createElement('div');loading.id='scoutingIntelligenceLoading';loading.className='scouting-empty';loading.textContent='Loading full opportunity pool…';body.appendChild(loading);
    }
    return false;
  }

  function reason(row){
    const bits=[];
    if(num(row.yieldPct)>0)bits.push(`${num(row.yieldPct).toFixed(2)}% forward yield`);
    if(num(row.networkScore||row.score)>0)bits.push(`${num(row.networkScore||row.score).toFixed(1)}/100 network score`);
    if(row.held)bits.push('existing holding');else bits.push('new opportunity');
    if(row.pipelineStage)bits.push(String(row.pipelineStage).toLowerCase());
    if(row.readiness&&row.readiness!=='COMPLETE')bits.push(String(row.readiness).toLowerCase());
    return bits.join(' · ');
  }

  function pickCard(row,index){
    return `<article class="scouting-pick ${index===0?'top':''}"><div class="scouting-pick-rank">${index===0?'TOP RECOMMENDATION':`PICK #${index+1}`}</div><h3>${esc(row.ticker)}</h3><div class="name">${esc(row.name||row.ticker)}</div><div class="scouting-pick-amount">${money(row.amount)}</div><div class="scouting-pick-grid"><div class="scouting-pick-stat"><span>NETWORK SCORE</span><strong>${num(row.networkScore||row.score).toFixed(1)}</strong></div><div class="scouting-pick-stat"><span>FORWARD YIELD</span><strong>${num(row.yieldPct).toFixed(2)}%</strong></div><div class="scouting-pick-stat"><span>ANNUAL INCOME</span><strong>${money(row.expectedAnnualIncome)}</strong></div><div class="scouting-pick-stat"><span>VERDICT</span><strong>${esc(row.verdict||row.pipelineStage||'SELECTED')}</strong></div></div><p class="scouting-pick-reason">${esc(reason(row))}</p></article>`;
  }

  function syncCanonicalTopPick(universe,budget,alloc){
    const selected=Array.isArray(alloc)&&alloc.length?alloc[0]:null;
    const top=selected||universe.find(r=>['BUY','STRONG BUY'].includes(upper(r.verdict)))||universe[0];
    if(!top)return;
    const score=num(top.networkScore||top.score);
    const title=$('scoutingTopPick');
    const detail=$('scoutingTopPickDetail');
    if(title)title.textContent=`${upper(top.ticker)} · ${score.toFixed(1)}`;
    if(detail){
      if(selected){
        detail.textContent=`Canonical payday pick · ${num(top.yieldPct).toFixed(2)}% yield · ${money(top.expectedAnnualIncome)} projected annual income on ${money(top.amount)}.`;
      }else{
        detail.textContent=`Canonical National Scouting Network leader · ${num(top.yieldPct).toFixed(2)}% yield${budget>0?` · ${money(budget*num(top.yieldPct)/100)} estimated annual income if the full mission went here.`:''}`;
      }
    }
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    ensureAdminWrap();ensureIntelligence();moveNetwork();
    const state=A.readState(),plan=state.scouting?.allocationPlan||{},mission=state.transfer?.mission||{};
    const budget=num(plan.budget||mission.budget),alloc=Array.isArray(plan.allocations)?plan.allocations:[];
    const host=ensureCommand();if(!host)return;
    const strategy=state.scouting?.strategy==='maximum'?'Maximum Income':'Sustainable Income';
    const universe=window.AuroraScoutingNetwork?.rankings?.(state)||[];
    const strong=universe.filter(r=>upper(r.verdict)==='STRONG BUY').length;
    const buy=universe.filter(r=>upper(r.verdict)==='BUY').length;
    const watch=universe.filter(r=>upper(r.verdict)==='WATCH').length;
    const blocked=universe.filter(r=>upper(r.verdict)==='BLOCKED').length;
    const fullEvidence=universe.filter(r=>r.evidenceComplete).length;
    const enrichment=state.scouting?.enrichment||{};
    const sourceLabel=enrichment.workbook||state.scouting?.universeDiagnostics?.primaryWorkbook||'Scouting data';
    syncCanonicalTopPick(universe,budget,alloc);
    host.innerHTML=`<div class="scouting-mission"><div class="scouting-mission-head"><div><p class="eyebrow scouting-eyebrow">PAYDAY SCOUTING MISSION</p><h2>${budget>0?'Aurora has your approved payday budget':'Waiting for the Finance mission'}</h2><p>${budget>0?`Aurora has ranked the full opportunity pool and selected ${alloc.length||'no'} buy-ready option${alloc.length===1?'':'s'} for this payday.`:'Release the investment budget from Payday Mission Control and the Chief Scout will build the shortlist automatically.'}</p></div><div class="scouting-budget-pill"><span>APPROVED INVESTMENT BUDGET</span><strong>${money(budget)}</strong></div></div><div class="scouting-mission-kpis"><article class="scouting-mission-kpi"><span>SCOUTING STRATEGY</span><strong>${strategy}</strong></article><article class="scouting-mission-kpi"><span>OPPORTUNITIES SCOUTED</span><strong>${universe.length.toLocaleString('en-GB')}</strong></article><article class="scouting-mission-kpi"><span>BUY-READY</span><strong>${(buy+strong).toLocaleString('en-GB')}</strong></article><article class="scouting-mission-kpi"><span>FULL EVIDENCE</span><strong>${fullEvidence.toLocaleString('en-GB')}</strong></article><article class="scouting-mission-kpi"><span>PROJECTED EXTRA INCOME</span><strong>${money(plan.projectedAnnualIncome)}</strong></article></div><div class="scouting-picks">${alloc.length?alloc.map(pickCard).join(''):`<div class="scouting-empty">No buy-ready payday shortlist yet. Finance can release a mission, but Scouting will only allocate it when candidates pass all evidence and decision gates.</div>`}</div><div class="scouting-command-actions"><div><span class="scouting-plan-status">${esc(plan.status||'WAITING')}</span><p class="scouting-admin-note">Strong Buy: ${strong} · Buy: ${buy} · Watch: ${watch} · Blocked: ${blocked} · Source: ${esc(sourceLabel)}${enrichment.lastRunAt?` · enrichment ${new Date(enrichment.lastRunAt).toLocaleString('en-GB')}`:''}</p></div><button id="scoutingCommandApprove" type="button" class="finance-primary" ${!alloc.length||plan.status==='APPROVED'?'disabled':''}>${plan.status==='APPROVED'?'Payday Plan Approved ✓':'Approve Payday Plan'}</button></div></div>`;
    $('scoutingCommandApprove')?.addEventListener('click',()=>$('scoutingApprovePlan')?.click());
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    ensureAdminWrap();ensureIntelligence();render();
    let attempts=0;
    const timer=setInterval(()=>{attempts++;if(moveNetwork()||attempts>100)clearInterval(timer)},100);
    const observer=new MutationObserver(()=>moveNetwork());
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('aurora-clean:state',()=>{render();setTimeout(moveNetwork,0)});
    window.addEventListener('pageshow',()=>{render();setTimeout(moveNetwork,0)});
    window.addEventListener('aurora:market-prices',render);
    window.AuroraScoutingCommand=Object.freeze({BUILD,render,moveNetwork,syncCanonicalTopPick});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();