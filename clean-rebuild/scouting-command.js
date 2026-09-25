(() => {
  'use strict';
  const BUILD='20260925-chief-scout-command-8-visible-execution-intel';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const brokerLabel=row=>window.AuroraScoutingExecutionProfiles?.accountLabel?.(row)||'Broker review';
  const nativeMoney=(value,currency)=>{
    const n=num(value),c=upper(currency);
    if(!(n>0))return'—';
    if(c==='AUD')return`A${n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}`;
    if(c==='USD')return`US${n.toFixed(2)}`;
    if(c==='EUR')return`€${n.toFixed(2)}`;
    if(c==='GBP')return`£${n.toFixed(2)}`;
    return`${c?c+' ':''}${n.toFixed(2)}`;
  };
  const executionFacts=row=>{
    const facts=[];
    const broker=brokerLabel(row);
    if(broker!=='Broker review')facts.push(['BUY ACCOUNT',broker]);
    if(num(row.brokerBuyPriceNative)>0)facts.push(['BROKER BUY',nativeMoney(row.brokerBuyPriceNative,row.executionCurrency||row.currency)]);
    if(num(row.analystPriceTargetNative)>0)facts.push(['ANALYST TARGET',nativeMoney(row.analystPriceTargetNative,row.analystPriceTargetCurrency||row.executionCurrency||row.currency)]);
    if(row.analystView)facts.push(['ANALYST VIEW',String(row.analystView)]);
    if(row.marketSymbol)facts.push(['SYMBOL',String(row.marketSymbol)]);
    return facts;
  };

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
      details=document.createElement('details');details.id='scoutingIntelligence';details.className='scouting-compact';
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
    if(num(row.yieldPct)>0)bits.push(`${num(row.yieldPct).toFixed(3)}% forward yield`);
    if(brokerLabel(row)!=='Broker review')bits.push(`${brokerLabel(row)} execution`);
    if(num(row.brokerYieldPct)>0)bits.push(`${num(row.brokerYieldPct).toFixed(3)}% broker yield`);
    if(num(row.networkScore||row.score)>0)bits.push(`${num(row.networkScore||row.score).toFixed(1)}/100 network score`);
    if(row.held)bits.push('existing holding');else bits.push('new opportunity');
    if(row.pipelineStage)bits.push(String(row.pipelineStage).toLowerCase());
    if(row.readiness&&row.readiness!=='COMPLETE')bits.push(String(row.readiness).toLowerCase());
    return bits.join(' · ');
  }

  function pickCard(row,index){
    return `<article class="scouting-pick ${index===0?'top':''}"><div class="scouting-pick-rank">${index===0?'TOP PAYDAY PICK':`PAYDAY PICK #${index+1}`}</div><h3>${esc(row.ticker)}</h3><div class="name">${esc(row.name||row.ticker)}</div><div class="scouting-pick-tier">${esc(row.tier||'READY')}</div><div class="scouting-pick-amount">${money(row.amount)}</div><div class="scouting-pick-grid"><div class="scouting-pick-stat"><span>NETWORK SCORE</span><strong>${num(row.networkScore||row.score).toFixed(1)}</strong></div><div class="scouting-pick-stat"><span>FORWARD YIELD</span><strong>${num(row.yieldPct).toFixed(3)}%</strong></div><div class="scouting-pick-stat"><span>BUY ACCOUNT</span><strong>${esc(brokerLabel(row))}</strong></div><div class="scouting-pick-stat"><span>ANNUAL INCOME</span><strong>${money(row.expectedAnnualIncome)}</strong></div><div class="scouting-pick-stat"><span>VERDICT</span><strong>${esc(row.verdict||row.pipelineStage||'SELECTED')}</strong></div></div><p class="scouting-pick-reason">${esc(reason(row))}</p></article>`;
  }

  function readyCard(row,index){
    const tier=String(row.tier||'READY').toUpperCase();
    const upside=num(row.upsidePct);
    const reasonBits=[
      `${num(row.networkScore||row.score).toFixed(1)}/100 score`,
      `${num(row.yieldPct).toFixed(3)}% yield`,
      row.risk?`${String(row.risk).toLowerCase()} payout risk`:'',
      Number.isFinite(upside)?`${upside>=0?'+':''}${upside.toFixed(1)}% fair-value gap`:'',
      row.held?'already held':'new diversification candidate'
    ].filter(Boolean);
    const facts=executionFacts(row);
    return `<article class="scouting-ready-card tier-${tier.toLowerCase()}" data-ready-ticker="${esc(row.ticker)}"><div class="scouting-ready-rank">#${index+1}</div><div><span class="scouting-ready-tier">${esc(tier)}</span><h3>${esc(row.ticker)}</h3><p>${esc(row.name||row.ticker)}</p></div><div class="scouting-ready-score"><strong>${num(row.networkScore||row.score).toFixed(1)}</strong><span>NETWORK SCORE</span></div><div class="scouting-ready-meta"><span>${num(row.yieldPct).toFixed(3)}% yield</span><span>${esc(brokerLabel(row))}</span><span>${esc(row.executionMarket||row.market||'MARKET')}</span><span>${esc(row.verdict)}</span><span>${row.held?'CURRENT HOLDING':'NEW OPPORTUNITY'}</span></div>${facts.length?`<div class="scouting-ready-exec">${facts.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`:''}<small>${esc(reasonBits.join(' · '))}</small><button type="button" class="scouting-ready-report" data-ready-report="${esc(row.ticker)}">View full scout report</button></article>`;
  }

  function readyBoard(universe){
    const ready=universe.filter(r=>r.buyReady===true);
    const grouped=['PREMIER','ELITE','READY'].map(tier=>({tier,rows:ready.filter(r=>String(r.tier||'').toUpperCase()===tier)})).filter(g=>g.rows.length);
    if(!ready.length)return '<div class="scouting-empty">No candidate currently passes every buy gate. The research queue stays separate below until evidence is complete.</div>';
    let rank=0;
    return grouped.map(group=>`<section class="scouting-ready-tier-section"><div class="scouting-ready-tier-head"><div><span>${group.tier}</span><strong>${group.rows.length} buy-ready prospect${group.rows.length===1?'':'s'}</strong></div><small>${group.tier==='PREMIER'?'Strong Buy · complete evidence':group.tier==='ELITE'?'Higher-scoring Buy · complete evidence':'Buy · complete evidence'}</small></div><div class="scouting-ready-list">${group.rows.map(row=>readyCard(row,rank++)).join('')}</div></section>`).join('');
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
        detail.textContent=`${top.tier||'READY'} payday pick · ${num(top.yieldPct).toFixed(3)}% yield · ${brokerLabel(top)} · ${money(top.expectedAnnualIncome)} projected annual income on ${money(top.amount)}.`;
      }else{
        detail.textContent=`${top.tier||'SCOUTING'} leader · ${num(top.yieldPct).toFixed(3)}% yield · ${brokerLabel(top)}${budget>0?` · ${money(budget*num(top.yieldPct)/100)} estimated annual income if the full mission went here.`:''}`;
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
    const ready=universe.filter(r=>r.buyReady===true);
    const premier=ready.filter(r=>upper(r.tier)==='PREMIER').length;
    const elite=ready.filter(r=>upper(r.tier)==='ELITE').length;
    const standardReady=ready.filter(r=>upper(r.tier)==='READY').length;
    const watch=universe.filter(r=>upper(r.verdict)==='WATCH').length;
    const blocked=universe.filter(r=>upper(r.verdict)==='BLOCKED').length;
    const fullEvidence=universe.filter(r=>r.evidenceComplete).length;
    const researchQueue=universe.filter(r=>!r.buyReady&&!r.decisionState?.block).length;
    const enrichment=state.scouting?.enrichment||{};
    const sourceLabel=enrichment.workbook||state.scouting?.universeDiagnostics?.primaryWorkbook||'Scouting data';
    syncCanonicalTopPick(universe,budget,alloc);
    host.innerHTML=`<div class="scouting-mission"><div class="scouting-mission-head"><div><p class="eyebrow scouting-eyebrow">CHIEF SCOUT · READY BOARD</p><h2>${ready.length?`${ready.length} prospect${ready.length===1?' is':'s are'} cleared to buy`:'No prospect has cleared every buy gate yet'}</h2><p>The full scouting pool stays underneath as research. This board shows only candidates with complete evidence and no active decision, payout-risk or valuation block.</p></div><div class="scouting-budget-pill"><span>PAYDAY INVESTMENT BUDGET</span><strong>${money(budget)}</strong></div></div><div class="scouting-mission-kpis"><article class="scouting-mission-kpi"><span>PREMIER</span><strong>${premier}</strong></article><article class="scouting-mission-kpi"><span>ELITE</span><strong>${elite}</strong></article><article class="scouting-mission-kpi"><span>READY</span><strong>${standardReady}</strong></article><article class="scouting-mission-kpi"><span>RESEARCH QUEUE</span><strong>${researchQueue.toLocaleString('en-GB')}</strong></article><article class="scouting-mission-kpi"><span>FULL EVIDENCE</span><strong>${fullEvidence.toLocaleString('en-GB')}</strong></article></div><div class="scouting-ready-board">${readyBoard(universe)}</div>${budget>0?`<div class="scouting-payday-divider"><div><p class="eyebrow">THIS PAYDAY</p><h3>${alloc.length?'Proposed allocation from the ready board':'Waiting for a buy-ready allocation'}</h3></div><span>${strategy}</span></div><div class="scouting-picks">${alloc.length?alloc.map(pickCard).join(''):`<div class="scouting-empty">The Finance mission is live, but no current candidate is eligible for allocation.</div>`}</div>`:''}<div class="scouting-command-actions"><div><span class="scouting-plan-status">${esc(plan.status||'WAITING')}</span><p class="scouting-admin-note">Premier: ${premier} · Elite: ${elite} · Ready: ${standardReady} · Watch: ${watch} · Blocked: ${blocked} · Source: ${esc(sourceLabel)}${enrichment.lastRunAt?` · enrichment ${new Date(enrichment.lastRunAt).toLocaleString('en-GB')}`:''}</p></div><button id="scoutingCommandApprove" type="button" class="finance-primary" ${!alloc.length||plan.status==='APPROVED'?'disabled':''}>${plan.status==='APPROVED'?'Payday Plan Approved ✓':'Approve Payday Plan'}</button></div></div>`;
    $('scoutingCommandApprove')?.addEventListener('click',()=>$('scoutingApprovePlan')?.click());
    host.querySelectorAll('[data-ready-report]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      window.AuroraScoutingNetwork?.openDrawer?.(button.dataset.readyReport);
    }));
  }

  let stableRenderTimer=null;
  function renderPending(){
    const host=ensureCommand();if(!host)return;
    host.innerHTML='<div class="scouting-mission"><div class="scouting-mission-head"><div><p class="eyebrow scouting-eyebrow">CHIEF SCOUT · READY BOARD</p><h2>Finalising the live scouting board…</h2><p>Aurora is waiting for the universe, evidence and holding map to settle before publishing buy-ready prospects.</p></div><div class="scouting-budget-pill"><span>STATUS</span><strong>SYNCING</strong></div></div></div>';
  }
  function scheduleStableRender(delay=700){
    clearTimeout(stableRenderTimer);
    stableRenderTimer=setTimeout(()=>{render();setTimeout(moveNetwork,0)},delay);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    ensureAdminWrap();ensureIntelligence();renderPending();scheduleStableRender(1900);
    let attempts=0;
    const timer=setInterval(()=>{attempts++;if(moveNetwork()||attempts>100)clearInterval(timer)},100);
    const observer=new MutationObserver(()=>moveNetwork());
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('aurora-clean:state',()=>scheduleStableRender(750));
    window.addEventListener('pageshow',()=>scheduleStableRender(500));
    window.addEventListener('aurora:market-prices',()=>scheduleStableRender(650));
    window.AuroraScoutingCommand=Object.freeze({BUILD,render,renderPending,scheduleStableRender,moveNetwork,syncCanonicalTopPick,readyBoard});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();