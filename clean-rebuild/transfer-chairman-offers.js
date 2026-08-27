(() => {
  'use strict';

  const BUILD='20260827-clean-chairman-offers-4-income-recycling';
  const AUTO_GAIN_TRIGGER_PCT=6;
  const MIN_INCOME_UPLIFT_PCT=8;
  const COOLDOWN_DAYS=90;
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(Math.max(0,num(v)).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const norm=v=>String(v||'').trim().toLowerCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const price=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:4}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const uid=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const closed=new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  let refreshing=false,generating=false;

  function activeHoldings(state){return (state.squad?.holdings||[]).filter(h=>!closed.has(upper(h.status||'ACTIVE'))&&num(h.shares)>0)}
  function offers(state){return Array.isArray(state.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[]}
  function holdingKey(h){return String(h.holdingId||`${upper(h.ticker)}|${String(h.account||'')}`)}
  function findHolding(state,offer){return activeHoldings(state).find(h=>holdingKey(h)===offer.holdingKey)||activeHoldings(state).find(h=>upper(h.ticker)===upper(offer.ticker)&&String(h.account||'')===String(offer.account||''))||null}
  function holdingIncomeForShares(h,shares){const totalShares=Math.max(0,num(h?.shares)),annual=Math.max(0,num(h?.annualIncomeGbp));return totalShares>0?round(annual*(shares/totalShares)):0}
  function avgCost(h){const shares=Math.max(0,num(h?.shares));return Math.max(0,num(h?.avgCostGbp)||(shares>0?num(h?.bookCostGbp)/shares:0))}
  function livePrice(h){return Math.max(0,num(h?.livePriceGbp??h?.priceGbp))}
  function gainPct(h){const avg=avgCost(h),live=livePrice(h);return avg>0&&live>0?((live-avg)/avg)*100:0}
  function ageDays(value){const t=Date.parse(value||'');return Number.isFinite(t)?Math.max(0,(Date.now()-t)/86400000):Infinity}

  function offerMetrics(state,offer){
    const h=findHolding(state,offer),shares=Math.min(Math.max(0,num(offer.shares)),Math.max(0,num(h?.shares)||num(offer.originalHoldingShares))),live=Math.max(0,num(h?.livePriceGbp??h?.priceGbp??offer.lastLivePrice)),avg=Math.max(0,num(h?.avgCostGbp??offer.avgCostGbp)),target=Math.max(0,num(offer.targetPrice)),book=round(shares*avg),liveValue=round(shares*live),targetValue=round(shares*target),liveGain=round(liveValue-book),targetGain=round(targetValue-book),incomeSurrendered=h?holdingIncomeForShares(h,shares):round(offer.annualIncomeSurrendered);
    const liveGainPct=book>0?((liveValue-book)/book)*100:0;
    return{h,shares,live,avg,target,book,liveValue,targetValue,liveGain,targetGain,liveGainPct,incomeSurrendered};
  }

  function scoutingRows(state){
    const A=window.AuroraClean;
    try{if(A?.scoutingRankings)return A.scoutingRankings(state).filter(r=>upper(r.ticker)&&num(r.yieldPct)>0)}catch(_){}
    return (state.scouting?.candidates||[]).filter(r=>upper(r.ticker)&&num(r.yieldPct)>0);
  }

  function portfolioProfile(state){
    const rows=activeHoldings(state),totalBook=rows.reduce((s,h)=>s+Math.max(0,num(h.bookCostGbp)),0),tickerBook=new Map(),sectorBook=new Map();
    rows.forEach(h=>{const b=Math.max(0,num(h.bookCostGbp)),t=upper(h.ticker),sector=String(h.sector||'').trim();tickerBook.set(t,(tickerBook.get(t)||0)+b);if(sector)sectorBook.set(sector,(sectorBook.get(sector)||0)+b)});
    return{rows,totalBook,tickerBook,sectorBook};
  }

  function sameBrokerAvailable(state,ticker,account){return activeHoldings(state).some(h=>upper(h.ticker)===upper(ticker)&&norm(h.account)===norm(account))}

  function bestReplacement(state,proceeds,incomeSurrendered,excludeTicker,sourceAccount=''){
    const amount=round(proceeds),lost=round(incomeSurrendered),exclude=upper(excludeTicker),profile=portfolioProfile(state);
    if(!(amount>0)||!(lost>=0))return null;
    const candidates=scoutingRows(state).filter(r=>upper(r.ticker)!==exclude).map(r=>{
      const ticker=upper(r.ticker),yieldPct=Math.max(0,num(r.yieldPct)),projectedAnnualIncome=round(amount*yieldPct/100),incomeUplift=round(projectedAnnualIncome-lost),incomeUpliftPct=lost>0?(incomeUplift/lost)*100:(incomeUplift>0?100:0),heldBook=profile.tickerBook.get(ticker)||0,postTickerPct=profile.totalBook>0?((heldBook+amount)/(profile.totalBook+amount))*100:0,sector=String(r.sector||'').trim(),sectorBook=sector?(profile.sectorBook.get(sector)||0):0,postSectorPct=profile.totalBook>0&&sector?((sectorBook+amount)/(profile.totalBook+amount))*100:0,sameBroker=sameBrokerAvailable(state,ticker,sourceAccount),diversificationBonus=!r.held?12:Math.max(0,8-(postTickerPct/5)),concentrationPenalty=Math.max(0,postTickerPct-20)*1.4+Math.max(0,postSectorPct-35)*.6,brokerBonus=sameBroker?5:0,score=num(r.score),decisionScore=incomeUpliftPct+diversificationBonus+brokerBonus-concentrationPenalty+(score/25);
      const confidence=incomeUpliftPct>=20&&postTickerPct<=20?'STRONG UPGRADE':incomeUpliftPct>=12&&postTickerPct<=25?'GOOD UPGRADE':'QUALIFIED UPGRADE';
      return{ticker,name:String(r.name||r.ticker),sector,yieldPct,score,projectedAnnualIncome,incomeUplift,incomeUpliftPct,held:!!r.held,postTickerPct,postSectorPct,sameBroker,diversificationBonus,concentrationPenalty,decisionScore,confidence};
    }).filter(r=>r.incomeUplift>0.009&&r.incomeUpliftPct+1e-9>=MIN_INCOME_UPLIFT_PCT)
      .sort((a,b)=>b.decisionScore-a.decisionScore||b.incomeUpliftPct-a.incomeUpliftPct||b.score-a.score||a.ticker.localeCompare(b.ticker));
    return candidates[0]||null;
  }

  function replacementForOffer(state,offer,m){
    const live=bestReplacement(state,m.liveValue,m.incomeSurrendered,offer.ticker,offer.account);if(live)return live;
    const storedIncome=round(offer.replacementProjectedAnnualIncome),lost=round(m.incomeSurrendered),uplift=round(storedIncome-lost),upliftPct=lost>0?(uplift/lost)*100:0;
    if(offer.replacementTicker&&uplift>0&&upliftPct>=MIN_INCOME_UPLIFT_PCT)return{ticker:upper(offer.replacementTicker),name:String(offer.replacementName||offer.replacementTicker),sector:String(offer.replacementSector||''),yieldPct:num(offer.replacementYieldPct),score:num(offer.replacementScore),projectedAnnualIncome:storedIncome,incomeUplift:uplift,incomeUpliftPct:upliftPct,held:!!offer.replacementHeld,postTickerPct:num(offer.replacementPostTickerPct),postSectorPct:num(offer.replacementPostSectorPct),sameBroker:!!offer.replacementSameBroker,confidence:String(offer.replacementConfidence||'QUALIFIED UPGRADE'),decisionScore:num(offer.replacementDecisionScore)};
    return null;
  }

  function onCooldown(state,h){
    const key=holdingKey(h),ticker=upper(h.ticker);
    return offers(state).some(o=>{if(!(o.holdingKey===key||upper(o.ticker)===ticker))return false;const s=upper(o.status);if(!['ACCEPTED','WITHDRAWN','EXPIRED'].includes(s))return false;return ageDays(o.acceptedAt||o.withdrawnAt||o.expiredAt||o.createdAt)<COOLDOWN_DAYS});
  }

  function storeReplacement(o,r){o.replacementTicker=r?.ticker||'';o.replacementName=r?.name||'';o.replacementSector=r?.sector||'';o.replacementYieldPct=r?.yieldPct||0;o.replacementScore=r?.score||0;o.replacementProjectedAnnualIncome=r?.projectedAnnualIncome||0;o.replacementIncomeUplift=r?.incomeUplift||0;o.replacementIncomeUpliftPct=r?.incomeUpliftPct||0;o.replacementHeld=!!r?.held;o.replacementPostTickerPct=r?.postTickerPct||0;o.replacementPostSectorPct=r?.postSectorPct||0;o.replacementSameBroker=!!r?.sameBroker;o.replacementConfidence=r?.confidence||'';o.replacementDecisionScore=r?.decisionScore||0}

  function autoGenerateOffers(){
    const A=window.AuroraClean;if(!A||generating)return false;const state=A.readState(),existing=offers(state),newRows=[];
    activeHoldings(state).forEach(h=>{
      const key=holdingKey(h),avg=avgCost(h),live=livePrice(h),shares=round(h.shares);if(!(avg>0)||!(live>0)||!(shares>0)||gainPct(h)+1e-9<AUTO_GAIN_TRIGGER_PCT||onCooldown(state,h))return;
      if(existing.some(o=>o.holdingKey===key&&!['WITHDRAWN','EXPIRED'].includes(upper(o.status))))return;
      const surrendered=holdingIncomeForShares(h,shares),proceeds=round(shares*live),replacement=bestReplacement(state,proceeds,surrendered,h.ticker,h.account);if(!replacement)return;
      const now=new Date().toISOString(),target=round(avg*1.06),offer={id:uid('OFFER'),holdingKey:key,ticker:upper(h.ticker),name:String(h.name||h.ticker),account:String(h.account||'Unspecified'),shares,originalHoldingShares:shares,avgCostGbp:round(avg),targetPrice:target,lastLivePrice:round(live),annualIncomeSurrendered:surrendered,status:'ACTIVE',createdAt:now,activatedAt:now,acceptedAt:null,withdrawnAt:null,acceptedPrice:null,acceptedValue:null,notes:`Auto +6% offer. Replacement must improve annual income by at least ${MIN_INCOME_UPLIFT_PCT}%.`,source:'AUTO_6_PERCENT_INCOME_RECYCLING',triggerGainPct:AUTO_GAIN_TRIGGER_PCT};storeReplacement(offer,replacement);newRows.push(offer);
    });
    if(!newRows.length)return false;generating=true;A.updateState(next=>{next.transfer.chairmanOffers=Array.isArray(next.transfer?.chairmanOffers)?next.transfer.chairmanOffers:[];next.transfer.chairmanOffers.unshift(...newRows)});generating=false;return true;
  }

  function reconcile(){
    const A=window.AuroraClean;if(!A)return false;const state=A.readState(),activate=[];
    offers(state).forEach(o=>{if(upper(o.status)!=='WATCHING')return;const m=offerMetrics(state,o),r=bestReplacement(state,m.liveValue,m.incomeSurrendered,o.ticker,o.account);if(m.live>0&&m.target>0&&m.live>=m.target&&r)activate.push({id:o.id,r})});
    if(!activate.length)return false;const map=new Map(activate.map(x=>[x.id,x.r])),now=new Date().toISOString();A.updateState(next=>{(next.transfer.chairmanOffers||[]).forEach(o=>{const r=map.get(o.id);if(r&&upper(o.status)==='WATCHING'){o.status='ACTIVE';o.activatedAt=now;o.lastLivePrice=round(findHolding(next,o)?.livePriceGbp||o.lastLivePrice);storeReplacement(o,r)}})});return true;
  }

  function populateHoldings(){const A=window.AuroraClean;if(!A)return;const state=A.readState(),sel=$('chairmanHoldingSelect');if(!sel)return;const current=sel.value,rows=activeHoldings(state);sel.innerHTML='<option value="">Choose a holding…</option>'+rows.map(h=>`<option value="${esc(holdingKey(h))}">${esc(h.ticker)} · ${esc(h.account||'Unspecified')} · ${num(h.shares).toLocaleString('en-GB',{maximumFractionDigits:6})} shares · live ${price(h.livePriceGbp||h.priceGbp||0)}</option>`).join('');if(rows.some(h=>holdingKey(h)===current))sel.value=current}

  function createOffer(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),key=$('chairmanHoldingSelect')?.value,h=activeHoldings(state).find(x=>holdingKey(x)===key);if(!h)return;const shares=Math.min(Math.max(0,num($('chairmanShares')?.value)),num(h.shares)),target=round($('chairmanTargetPrice')?.value);if(!(shares>0)||!(target>0))return;
    const live=round(livePrice(h)),avg=round(avgCost(h)),surrendered=holdingIncomeForShares(h,shares),replacement=bestReplacement(state,round(shares*live),surrendered,h.ticker,h.account),status=live>=target&&replacement?'ACTIVE':'WATCHING',createdAt=new Date().toISOString(),offer={id:uid('OFFER'),holdingKey:key,ticker:upper(h.ticker),name:String(h.name||h.ticker),account:String(h.account||'Unspecified'),shares:round(shares),originalHoldingShares:round(h.shares),avgCostGbp:avg,targetPrice:target,lastLivePrice:live,annualIncomeSurrendered:surrendered,status,createdAt,activatedAt:status==='ACTIVE'?createdAt:null,acceptedAt:null,withdrawnAt:null,acceptedPrice:null,acceptedValue:null,notes:'',source:'MANUAL'};storeReplacement(offer,replacement);A.updateState(next=>{next.transfer.chairmanOffers=Array.isArray(next.transfer?.chairmanOffers)?next.transfer.chairmanOffers:[];next.transfer.chairmanOffers.unshift(offer)});if($('chairmanShares'))$('chairmanShares').value='';if($('chairmanTargetPrice'))$('chairmanTargetPrice').value='';render();
  }

  function createReplacementRoute(state,o,m,r,now){
    state.transfer.chairmanReplacementRoutes=Array.isArray(state.transfer.chairmanReplacementRoutes)?state.transfer.chairmanReplacementRoutes:[];
    const route={id:uid('CHAIRMAN-ROUTE'),offerId:o.id,status:'READY_FOR_REGISTRATION',source:'CHAIRMAN_OFFER',createdAt:now,sale:{ticker:o.ticker,name:o.name,account:o.account,shares:m.shares,acceptedPrice:o.acceptedPrice,proceeds:o.acceptedValue,annualIncomeSurrendered:m.incomeSurrendered},replacement:{ticker:r.ticker,name:r.name,sector:r.sector||'',account:o.account,amount:o.acceptedValue,yieldPct:r.yieldPct,expectedAnnualIncome:r.projectedAnnualIncome,incomeUplift:r.incomeUplift,incomeUpliftPct:r.incomeUpliftPct,confidence:r.confidence,sameBroker:r.sameBroker}};
    state.transfer.chairmanReplacementRoutes.unshift(route);state.transfer.activeChairmanReplacementRouteId=route.id;o.replacementRouteId=route.id;return route;
  }

  function setStatus(id,status){
    const A=window.AuroraClean;if(!A)return;const now=new Date().toISOString();A.updateState(next=>{const o=(next.transfer.chairmanOffers||[]).find(x=>x.id===id);if(!o)return;const cur=upper(o.status);if(['ACCEPTED','WITHDRAWN','EXPIRED'].includes(cur))return;if(status==='ACCEPTED'){const m=offerMetrics(next,o),r=replacementForOffer(next,o,m);if(cur!=='ACTIVE'||!r||r.incomeUpliftPct<MIN_INCOME_UPLIFT_PCT)return;o.status='ACCEPTED';o.acceptedAt=now;o.acceptedPrice=round(m.live||m.target);o.acceptedValue=round(m.shares*(m.live||m.target));o.lastLivePrice=round(m.live||o.lastLivePrice);storeReplacement(o,r);createReplacementRoute(next,o,m,r,now)}else if(status==='WITHDRAWN'){o.status='WITHDRAWN';o.withdrawnAt=now}});render();
  }

  function removeClosed(id){const A=window.AuroraClean;if(!A)return;A.updateState(next=>{next.transfer.chairmanOffers=(next.transfer.chairmanOffers||[]).filter(o=>o.id!==id)});render()}

  async function refreshHoldings(){if(refreshing)return;refreshing=true;const btn=$('chairmanRefreshHoldings');if(btn){btn.disabled=true;btn.textContent='Refreshing…'}try{const authority=window.AuroraMarketPriceAuthority||window.AuroraSquadLivePriceAuthority;if(authority?.refresh)await authority.refresh('transfer-chairman-offers');window.AuroraClean?.importRealHoldings?.();autoGenerateOffers();reconcile();render()}catch(_){render()}finally{refreshing=false;if(btn){btn.disabled=false;btn.textContent='Refresh Holdings & Prices'}}}

  function render(){
    const A=window.AuroraClean;if(!A)return;populateHoldings();const state=A.readState(),rows=offers(state),host=$('chairmanOfferRows'),count=$('chairmanOfferCount');if(count)count.textContent=`${rows.filter(o=>!['ACCEPTED','WITHDRAWN','EXPIRED'].includes(upper(o.status))).length} open offer(s)`;if(!host)return;
    host.innerHTML=rows.length?rows.map(o=>{const m=offerMetrics(state,o),r=replacementForOffer(state,o,m),s=upper(o.status)||'WATCHING',canAccept=s==='ACTIVE'&&!!r&&r.incomeUpliftPct>=MIN_INCOME_UPLIFT_PCT,canWithdraw=['WATCHING','ACTIVE'].includes(s),auto=String(o.source||'').startsWith('AUTO_6_PERCENT'),routeId=o.replacementRouteId||'',verdict=r?.confidence||'NO QUALIFIED UPGRADE';return`<article class="chairman-offer-card status-${s.toLowerCase()}"><div class="chairman-offer-head"><div><span class="chairman-status">${esc(s)}</span><h3>${esc(o.ticker)} · ${esc(o.account)}</h3><p>${esc(o.name||o.ticker)}${auto?' · AUTO +6%':''}</p></div><strong>${m.shares.toLocaleString('en-GB',{maximumFractionDigits:6})} shares</strong></div><div class="chairman-offer-grid"><div><span>LIVE PRICE</span><strong>${m.live>0?price(m.live):'—'}</strong></div><div><span>6% / TARGET PRICE</span><strong>${price(m.target)}</strong></div><div><span>LIVE GAIN</span><strong class="${m.liveGain>=0?'offer-positive':'offer-negative'}">${m.liveGain>=0?'+':''}${money(m.liveGain)} · ${m.liveGainPct.toFixed(2)}%</strong></div><div><span>SALE VALUE</span><strong>${money(m.liveValue)}</strong></div><div><span>INCOME LOST</span><strong>${money(m.incomeSurrendered)}/yr</strong></div><div><span>REPLACE WITH</span><strong>${r?`${esc(r.ticker)} · ${r.yieldPct.toFixed(2)}%`:'No qualified replacement'}</strong></div><div><span>NEW INCOME</span><strong>${r?`${money(r.projectedAnnualIncome)}/yr`:'—'}</strong></div><div><span>INCOME UPLIFT</span><strong class="${r?.incomeUplift>0?'offer-positive':''}">${r?`+${money(r.incomeUplift)}/yr · +${r.incomeUpliftPct.toFixed(1)}%`:'—'}</strong></div><div><span>POST POSITION</span><strong>${r?`${r.postTickerPct.toFixed(1)}% ticker · ${r.postSectorPct.toFixed(1)}% sector`:'—'}</strong></div><div><span>BROKER FIT</span><strong>${r?(r.sameBroker?'SAME BROKER ✓':'ACCOUNT ROUTE REQUIRED'):'—'}</strong></div><div><span>VERDICT</span><strong class="${r?'offer-positive':''}">${esc(verdict)}</strong></div>${routeId?`<div><span>REPLACEMENT ROUTE</span><strong>${esc(routeId)} · READY</strong></div>`:''}</div><div class="chairman-offer-actions">${canAccept?`<button type="button" class="finance-primary" data-offer-accept="${esc(o.id)}">Accept + Build Replacement Route</button>`:''}${canWithdraw?`<button type="button" data-offer-withdraw="${esc(o.id)}">Withdraw</button>`:`<button type="button" data-offer-remove="${esc(o.id)}">Remove from history</button>`}</div></article>`}).join(''):`<p>No Chairman's Offers yet. Aurora creates one at +${AUTO_GAIN_TRIGGER_PCT}% only when the replacement improves annual income by at least ${MIN_INCOME_UPLIFT_PCT}% and passes concentration checks.</p>`;
    host.querySelectorAll('[data-offer-accept]').forEach(b=>b.addEventListener('click',()=>setStatus(b.dataset.offerAccept,'ACCEPTED')));host.querySelectorAll('[data-offer-withdraw]').forEach(b=>b.addEventListener('click',()=>setStatus(b.dataset.offerWithdraw,'WITHDRAWN')));host.querySelectorAll('[data-offer-remove]').forEach(b=>b.addEventListener('click',()=>removeClosed(b.dataset.offerRemove)));
  }

  function syncSelectedHolding(){const A=window.AuroraClean;if(!A)return;const state=A.readState(),key=$('chairmanHoldingSelect')?.value,h=activeHoldings(state).find(x=>holdingKey(x)===key);if(!h)return;if($('chairmanShares'))$('chairmanShares').value=String(num(h.shares));if($('chairmanTargetPrice')&&!$('chairmanTargetPrice').value){const avg=avgCost(h);if(avg>0)$('chairmanTargetPrice').value=(avg*1.06).toFixed(4)}}
  function refreshAll(){if(autoGenerateOffers())return;if(reconcile())return;render()}
  function boot(){const A=window.AuroraClean;if(!A){setTimeout(boot,60);return}if(!A.readState().squad?.holdings?.length)A.importRealHoldings?.();$('chairmanHoldingSelect')?.addEventListener('change',syncSelectedHolding);$('chairmanCreateOffer')?.addEventListener('click',createOffer);$('chairmanRefreshHoldings')?.addEventListener('click',refreshHoldings);window.addEventListener('aurora-clean:state',refreshAll);window.addEventListener('aurora:market-prices',refreshAll);refreshAll();setTimeout(refreshHoldings,300);window.AuroraChairmanOffers=Object.freeze({BUILD,AUTO_GAIN_TRIGGER_PCT,MIN_INCOME_UPLIFT_PCT,COOLDOWN_DAYS,render,reconcile,autoGenerateOffers,bestReplacement,createOffer,refreshHoldings})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();