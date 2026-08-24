/* Aurora FC 2.0 — Chairman's Offer Ladder v0.4
 * Scenario-only price ladder for the Chairman's Office.
 * Reads canonical Squad / Income / Scouting / Transfer state and never writes Finance,
 * Squad, Registration or the live Transfer mission.
 */
(function(w){
  'use strict';

  const A=()=>w.Aurora2||{};
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[£,%]/g,'').replace(/,/g,''));return Number.isFinite(n)?n:0};
  const money=v=>A().ui?.money?A().ui.money(Number(v)||0):`£${(Number(v)||0).toFixed(2)}`;
  const esc=v=>A().ui?.escape?A().ui.escape(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ticker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();

  const BUILD='chairman-offer-ladder-v0.4-20260822';
  let renderQueued=false;

  function currentLens(){
    const active=w.document?.querySelector?.('[data-lens].active');
    const value=String(active?.dataset?.lens||'sustainable').toLowerCase();
    return ['sustainable','maximum','custom'].includes(value)?value:'sustainable';
  }

  function canonicalBasket(state){
    return arr(state?.scouting?.replacementBasket)
      .map(item=>String(item?.securityId||item||''))
      .filter(Boolean);
  }

  function offerPoints(metrics){
    const avg=Math.max(0,num(metrics?.avg));
    const live=Math.max(0,num(metrics?.price)||(num(metrics?.shares)>0?num(metrics?.value)/num(metrics?.shares):0));
    return [
      {id:'review',label:'+6% REVIEW FLOOR',kind:'review',price:avg*1.06,thresholdPct:6},
      {id:'live',label:'CURRENT LIVE OFFER',kind:'live',price:live,thresholdPct:avg>0?(live/avg-1)*100:0},
      {id:'strong',label:'+10% STRONG-REVIEW LINE',kind:'strong',price:avg*1.10,thresholdPct:10}
    ];
  }

  function offerScenario(metrics,fraction,offerPrice){
    const f=Math.max(0,Math.min(1,num(fraction)));
    const shares=Math.max(0,num(metrics?.shares));
    const avg=Math.max(0,num(metrics?.avg));
    const income=Math.max(0,num(metrics?.income));
    const price=Math.max(0,num(offerPrice));
    const sharesSold=shares*f;
    const bookReleased=sharesSold*avg;
    const cashReleased=sharesSold*price;
    return {
      fraction:f,
      sharesSold,
      sharesRemaining:shares-sharesSold,
      cashReleased,
      bookReleased,
      profitRealised:cashReleased-bookReleased,
      incomeSurrendered:income*f
    };
  }

  function metricsAtOffer(metrics,offerPrice){
    const price=Math.max(0,num(offerPrice));
    const shares=Math.max(0,num(metrics?.shares));
    const book=Math.max(0,num(metrics?.book));
    const value=shares*price;
    const profit=value-book;
    return {
      ...metrics,
      price,
      value,
      profit,
      profitPct:book>0?profit/book*100:0,
      currentYield:value>0?Math.max(0,num(metrics?.income))/value*100:0
    };
  }

  function simulateAtOffer(state,data,point,lensName=currentLens()){
    const engine=A().transferEngine;
    const metrics=metricsAtOffer(data.metrics,point.price);
    const scenario=offerScenario(data.metrics,data.scenario.fraction,point.price);
    const targetIds=lensName==='custom'?canonicalBasket(state):null;
    const strategy=lensName==='maximum'?'maximum':'sustainable';
    const rotationContext={
      holdingId:data.holding?.id||'',
      ticker:ticker(data.holding?.ticker),
      account:data.holding?.account,
      saleFraction:scenario.fraction
    };
    const sim=engine?.simulate?engine.simulate(state,{
      budget:scenario.cashReleased,
      strategy,
      brokerScope:'both',
      minAllocation:state?.transfer?.settings?.minAllocation||250,
      increment:state?.transfer?.settings?.increment||25,
      maxTargets:8,
      excludeTicker:ticker(data.holding?.ticker),
      targetIds,
      allowActiveScouting:true,
      rotationContext
    }):{
      financeBudget:scenario.cashReleased,allocations:[],allocated:0,income:0,
      remaining:scenario.cashReleased,status:'SIMULATION',reason:'ENGINE_MISSING'
    };
    const concentration=engine?.concentrationSnapshot
      ?engine.concentrationSnapshot(state,rotationContext,arr(sim.allocations))
      :null;
    const replacementIncome=Math.max(0,num(sim.income));
    const netAnnual=replacementIncome-scenario.incomeSurrendered;
    const coverage=scenario.incomeSurrendered>0?replacementIncome/scenario.incomeSurrendered*100:(replacementIncome>0?100:0);
    const replacementYield=scenario.cashReleased>0?replacementIncome/scenario.cashReleased*100:0;
    const breakEvenYield=scenario.cashReleased>0?scenario.incomeSurrendered/scenario.cashReleased*100:0;
    const verdict=A().clubControl?.buildVerdict
      ?A().clubControl.buildVerdict({holding:data.holding,metrics,mat:data.mat,scenario,sim,exEvent:data.exEvent,concentration})
      :{code:'review',title:'REVIEW',reason:'Chairman verdict engine unavailable.'};
    return {
      ...point,
      metrics,scenario,sim,concentration,replacementIncome,netAnnual,coverage,replacementYield,breakEvenYield,
      yieldEdge:replacementYield-breakEvenYield,
      verdict
    };
  }

  function buildOfferLadder(state,data,lensName=currentLens()){
    if(!data?.holding||!data?.metrics)return [];
    return offerPoints(data.metrics).map(point=>simulateAtOffer(state,data,point,lensName));
  }

  function liveZone(data){
    if(!data?.holding||!data?.metrics)return {code:'empty',label:'NO CASE'};
    if(data.holding.locked||String(data.holding.status||'').toUpperCase()==='LOCKED')return {code:'locked',label:'LOCKED'};
    if(data.mat?.micro)return {code:'micro',label:'MICRO'};
    const pct=num(data.metrics.profitPct);
    if(pct>=10)return {code:'strong',label:'STRONG REVIEW'};
    if(pct>=6)return {code:'review',label:'REVIEW OPEN'};
    return {code:'keep',label:'BELOW REVIEW'};
  }

  function verdictClass(code){
    return ['strong','attractive'].includes(String(code))?'good':
      ['block','keep'].includes(String(code))?'muted':
      String(code)==='wait'?'wait':'review';
  }

  function injectStyles(){
    if(!w.document||w.document.getElementById('chairmanOfferLadderV04Styles'))return;
    const style=w.document.createElement('style');
    style.id='chairmanOfferLadderV04Styles';
    style.textContent=`
      .offer-ladder-panel{border-color:rgba(243,201,105,.16)!important;background:radial-gradient(circle at 100% 0,rgba(243,201,105,.065),transparent 38%),linear-gradient(145deg,rgba(22,17,8,.78),rgba(7,8,11,.98))!important}
      .offer-ladder-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}
      .offer-ladder-summary>div{padding:11px;border:1px solid rgba(243,201,105,.09);border-radius:12px;background:rgba(243,201,105,.014);min-width:0}
      .offer-ladder-summary small,.offer-ladder-row small{display:block;color:#847e6e;font-size:6px;font-weight:1000;letter-spacing:.09em;text-transform:uppercase}
      .offer-ladder-summary strong{display:block;margin-top:5px;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .offer-ladder-summary span{display:block;margin-top:4px;color:#7d7565;font-size:7px;line-height:1.4}
      .offer-zone{display:inline-flex!important;width:max-content;min-height:24px;align-items:center;padding:0 8px;border-radius:999px;border:1px solid rgba(255,255,255,.08);font-size:6px!important;font-weight:1000;letter-spacing:.07em}
      .offer-zone.strong{color:#baffd0;border-color:rgba(89,255,154,.20);background:rgba(89,255,154,.03)}
      .offer-zone.review{color:#ffe09a;border-color:rgba(243,201,105,.22);background:rgba(243,201,105,.03)}
      .offer-zone.keep,.offer-zone.micro,.offer-zone.locked{color:#c1c9d1;border-color:rgba(148,163,184,.16);background:rgba(148,163,184,.025)}
      .offer-ladder-table{display:grid;gap:8px;margin-top:10px}
      .offer-ladder-row{display:grid;grid-template-columns:minmax(170px,1.25fr) repeat(7,minmax(90px,1fr));gap:7px;align-items:stretch;padding:9px;border:1px solid rgba(255,255,255,.055);border-radius:14px;background:rgba(255,255,255,.012)}
      .offer-ladder-row.is-live{border-color:rgba(88,244,255,.17);background:rgba(88,244,255,.018)}
      .offer-ladder-row.is-strong{border-color:rgba(89,255,154,.12)}
      .offer-ladder-row>div{min-width:0;padding:4px}
      .offer-ladder-row>div:first-child{padding:7px 8px;border-right:1px solid rgba(255,255,255,.05)}
      .offer-ladder-row strong{display:block;margin-top:4px;font-size:10px;line-height:1.25;overflow:hidden;text-overflow:ellipsis}
      .offer-ladder-row span{display:block;margin-top:3px;color:#777165;font-size:7px;line-height:1.35}
      .offer-ladder-verdict{display:inline-flex!important;width:max-content;max-width:100%;padding:5px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.08);font-size:6px!important;font-weight:1000!important;white-space:nowrap}
      .offer-ladder-verdict.good{color:#baffd0;border-color:rgba(89,255,154,.18);background:rgba(89,255,154,.025)}
      .offer-ladder-verdict.review{color:#ffe09a;border-color:rgba(243,201,105,.20);background:rgba(243,201,105,.025)}
      .offer-ladder-verdict.wait{color:#ffd9a0;border-color:rgba(246,185,79,.20);background:rgba(246,185,79,.03)}
      .offer-ladder-verdict.muted{color:#c1c9d1;border-color:rgba(148,163,184,.15);background:rgba(148,163,184,.022)}
      .offer-ladder-note{margin-top:9px;color:#817865;font-size:7px;line-height:1.5}
      @media(max-width:1100px){.offer-ladder-row{grid-template-columns:repeat(4,minmax(0,1fr))}.offer-ladder-row>div:first-child{grid-column:span 4;border-right:0;border-bottom:1px solid rgba(255,255,255,.05)}}
      @media(max-width:760px){.offer-ladder-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.offer-ladder-row{grid-template-columns:repeat(2,minmax(0,1fr))}.offer-ladder-row>div:first-child{grid-column:span 2}.offer-ladder-row strong{font-size:9px}}
    `;
    w.document.head.appendChild(style);
  }

  function injectPanel(){
    if(!w.document||w.document.getElementById('chairmanOfferLadderV04'))return;
    const anchor=w.document.getElementById('rotationCase');
    if(!anchor)return;
    const section=w.document.createElement('section');
    section.className='chairman-panel offer-ladder-panel';
    section.id='chairmanOfferLadderV04';
    section.innerHTML=`
      <div class="chairman-panel-head">
        <div>
          <span class="chairman-panel-kicker">Chairman's Offer v0.4</span>
          <h3>Offer Ladder</h3>
          <p class="chairman-copy">Three price lines, one shared Transfer engine: +6% review floor, current live offer and +10% strong-review line.</p>
        </div>
        <span class="chairman-panel-note">SCENARIO ONLY • NO AUTO SALE</span>
      </div>
      <div class="offer-ladder-summary" id="offerLadderSummary"></div>
      <div class="offer-ladder-table" id="offerLadderRows"></div>
      <p class="offer-ladder-note" id="offerLadderNote">Loading the selected Chairman case…</p>`;
    anchor.insertAdjacentElement('afterend',section);

    const jumpbar=w.document.querySelector('.chairman-jumpbar');
    if(jumpbar&&!jumpbar.querySelector('[data-chair-jump="chairmanOfferLadderV04"]')){
      const b=w.document.createElement('button');
      b.type='button';b.dataset.chairJump='chairmanOfferLadderV04';b.textContent='Offer Ladder';
      const rotation=jumpbar.querySelector('[data-chair-jump="rotationCase"]');
      rotation?.insertAdjacentElement('afterend',b)||jumpbar.appendChild(b);
    }
    const version=w.document.querySelector('.chairman-version-pill');
    if(version)version.textContent='ROTATION ENGINE v0.4 • OFFER LADDER';
  }

  function render(){
    renderQueued=false;
    if(!w.document?.getElementById('chairmanOfferLadderV04'))injectPanel();
    const summary=w.document?.getElementById('offerLadderSummary');
    const host=w.document?.getElementById('offerLadderRows');
    const note=w.document?.getElementById('offerLadderNote');
    if(!summary||!host)return;
    const state=A().core?.read?.();
    const data=A().clubControl?.caseData?.();
    if(!state||!data){
      summary.innerHTML='<div><small>Status</small><strong>No case selected</strong><span>Select a Squad holding above.</span></div>';
      host.innerHTML='';
      if(note)note.textContent='Chairman v0.4 waits for the same canonical Squad state as the existing Rotation Case.';
      return;
    }

    const ladder=buildOfferLadder(state,data,currentLens());
    const zone=liveZone(data);
    const avg=Math.max(0,num(data.metrics.avg));
    const live=Math.max(0,num(data.metrics.price));
    const strong=avg*1.10;
    const toStrong=strong-live;
    const liveRow=ladder.find(row=>row.id==='live');
    const exGuard=data.exEvent&&num(data.exEvent.days)>=0&&num(data.exEvent.days)<=7&&num(data.exEvent.dividendAtRisk)>0;

    summary.innerHTML=`
      <div><small>Live Offer Zone</small><strong class="offer-zone ${esc(zone.code)}">${esc(zone.label)}</strong><span>${data.metrics.profitPct>=0?'+':''}${num(data.metrics.profitPct).toFixed(2)}% vs book cost</span></div>
      <div><small>Average Cost / Share</small><strong>${money(avg)}</strong><span>Canonical Squad book cost ÷ shares</span></div>
      <div><small>Distance to +10% Line</small><strong>${toStrong<=0?'CLEARED':money(toStrong)+' / share'}</strong><span>${toStrong<=0?'Live price already clears the strong-review threshold.':`${(toStrong/Math.max(.000001,live)*100).toFixed(2)}% above current live price`}</span></div>
      <div><small>Live Income Coverage</small><strong>${liveRow?liveRow.coverage.toFixed(1)+'%':'—'}</strong><span>${liveRow?`${liveRow.yieldEdge>=0?'+':''}${liveRow.yieldEdge.toFixed(2)}pp replacement-yield edge`:'No Transfer simulation'}</span></div>`;

    host.innerHTML=ladder.map(row=>{
      const pnlPct=row.metrics.profitPct;
      const allocations=arr(row.sim.allocations).filter(a=>num(a.amount)>0).length;
      return `<article class="offer-ladder-row ${row.kind==='live'?'is-live':row.kind==='strong'?'is-strong':''}">
        <div><small>${esc(row.label)}</small><strong>${money(row.price)} / share</strong><span>${pnlPct>=0?'+':''}${pnlPct.toFixed(2)}% vs average cost${row.kind==='live'?' • live market line':''}</span></div>
        <div><small>Cash Released</small><strong>${money(row.scenario.cashReleased)}</strong><span>${Math.round(row.scenario.fraction*100)}% sale scenario</span></div>
        <div><small>Profit Realised</small><strong>${row.scenario.profitRealised>=0?'+':''}${money(row.scenario.profitRealised)}</strong><span>Above released book cost</span></div>
        <div><small>Replacement Income</small><strong>${money(row.replacementIncome)} / yr</strong><span>${allocations} simulated allocation${allocations===1?'':'s'}</span></div>
        <div><small>Income Coverage</small><strong>${row.coverage.toFixed(1)}%</strong><span>${row.netAnnual>=0?'+':''}${money(row.netAnnual)} / yr net</span></div>
        <div><small>Replacement Yield</small><strong>${row.replacementYield.toFixed(2)}%</strong><span>Break-even ${row.breakEvenYield.toFixed(2)}%</span></div>
        <div><small>Transfer Holdback</small><strong>${money(row.sim.remaining)}</strong><span>Not forced into a buy</span></div>
        <div><small>Board Result</small><strong class="offer-ladder-verdict ${verdictClass(row.verdict.code)}">${esc(row.verdict.title)}</strong><span>${row.yieldEdge>=0?'+':''}${row.yieldEdge.toFixed(2)}pp yield edge</span></div>
      </article>`;
    }).join('');

    if(note)note.textContent=exGuard
      ?`Dividend guard active: the next ex-date is ${data.exEvent.days===0?'today':`${data.exEvent.days} day${data.exEvent.days===1?'':'s'} away`} and approximately ${money(data.exEvent.dividendAtRisk)} is attached to the selected shares. Offer rows inherit the existing WAIT FOR DIVIDEND verdict.`
      :'Every row re-runs the shared Transfer simulation at that exact offer price. Finance, Squad, Registration and the live Transfer mission remain unchanged.';
  }

  function scheduleRender(){
    if(renderQueued)return;
    renderQueued=true;
    const run=()=>w.setTimeout(render,0);
    if(typeof w.requestAnimationFrame==='function')w.requestAnimationFrame(run);else run();
  }

  function init(){
    if(!w.document?.querySelector?.('.chairman-command-page'))return;
    injectStyles();
    injectPanel();
    scheduleRender();
    w.document.addEventListener('click',event=>{
      if(event.target?.closest?.('[data-review],[data-sale],[data-lens],#refreshCase'))scheduleRender();
    },true);
    w.document.addEventListener('change',event=>{
      if(event.target?.closest?.('#holdingSelect,[data-custom]'))scheduleRender();
    },true);
    w.addEventListener?.('aurora2:state',scheduleRender);
  }

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.chairmanOfferLadder={
    BUILD,
    offerPoints,
    offerScenario,
    metricsAtOffer,
    simulateAtOffer,
    buildOfferLadder,
    liveZone,
    render
  };

  if(w.document){
    if(w.document.readyState==='loading')w.document.addEventListener('DOMContentLoaded',init,{once:true});
    else init();
  }
})(window);
