(() => {
  'use strict';

  const BUILD='20260827-clean-chairman-offers-3-auto-income-replacement';
  const AUTO_GAIN_TRIGGER_PCT=6;
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(Math.max(0,num(v)).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const price=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:4}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const uid=()=>`OFFER-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
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

  function bestReplacement(state,proceeds,incomeSurrendered,excludeTicker){
    const amount=round(proceeds),lost=round(incomeSurrendered),exclude=upper(excludeTicker);
    if(!(amount>0))return null;
    const candidates=scoutingRows(state).filter(r=>upper(r.ticker)!==exclude).map(r=>{
      const yieldPct=Math.max(0,num(r.yieldPct));
      const projectedAnnualIncome=round(amount*yieldPct/100);
      const incomeUplift=round(projectedAnnualIncome-lost);
      return{ticker:upper(r.ticker),name:String(r.name||r.ticker),yieldPct,score:num(r.score),projectedAnnualIncome,incomeUplift,held:!!r.held};
    }).filter(r=>r.incomeUplift>0.009)
      .sort((a,b)=>b.incomeUplift-a.incomeUplift||b.score-a.score||b.yieldPct-a.yieldPct||a.ticker.localeCompare(b.ticker));
    return candidates[0]||null;
  }

  function replacementForOffer(state,offer,m){
    const live=bestReplacement(state,m.liveValue,m.incomeSurrendered,offer.ticker);
    if(live)return live;
    if(offer.replacementTicker&&num(offer.replacementProjectedAnnualIncome)>num(m.incomeSurrendered))return{
      ticker:upper(offer.replacementTicker),name:String(offer.replacementName||offer.replacementTicker),yieldPct:num(offer.replacementYieldPct),score:num(offer.replacementScore),projectedAnnualIncome:round(offer.replacementProjectedAnnualIncome),incomeUplift:round(num(offer.replacementProjectedAnnualIncome)-num(m.incomeSurrendered)),held:!!offer.replacementHeld
    };
    return null;
  }

  function autoGenerateOffers(){
    const A=window.AuroraClean;if(!A||generating)return false;
    const state=A.readState(),existing=offers(state),newRows=[];
    activeHoldings(state).forEach(h=>{
      const key=holdingKey(h),avg=avgCost(h),live=livePrice(h),shares=round(h.shares);
      if(!(avg>0)||!(live>0)||!(shares>0)||gainPct(h)+1e-9<AUTO_GAIN_TRIGGER_PCT)return;
      if(existing.some(o=>o.holdingKey===key&&String(o.source||'').startsWith('AUTO_6_PERCENT')))return;
      const surrendered=holdingIncomeForShares(h,shares),proceeds=round(shares*live),replacement=bestReplacement(state,proceeds,surrendered,h.ticker);
      if(!replacement)return;
      const now=new Date().toISOString(),target=round(avg*(1+(AUTO_GAIN_TRIGGER_PCT/100)));
      newRows.push({id:uid(),holdingKey:key,ticker:upper(h.ticker),name:String(h.name||h.ticker),account:String(h.account||'Unspecified'),shares,originalHoldingShares:shares,avgCostGbp:round(avg),targetPrice:target,lastLivePrice:round(live),annualIncomeSurrendered:surrendered,status:'ACTIVE',createdAt:now,activatedAt:now,acceptedAt:null,withdrawnAt:null,acceptedPrice:null,acceptedValue:null,notes:'Automatically created at +6% gain because a higher-income replacement was available.',source:'AUTO_6_PERCENT_INCOME_UPGRADE',triggerGainPct:AUTO_GAIN_TRIGGER_PCT,replacementTicker:replacement.ticker,replacementName:replacement.name,replacementYieldPct:replacement.yieldPct,replacementScore:replacement.score,replacementProjectedAnnualIncome:replacement.projectedAnnualIncome,replacementIncomeUplift:replacement.incomeUplift,replacementHeld:replacement.held});
    });
    if(!newRows.length)return false;
    generating=true;
    A.updateState(next=>{if(!Array.isArray(next.transfer.chairmanOffers))next.transfer.chairmanOffers=[];next.transfer.chairmanOffers.unshift(...newRows)});
    generating=false;
    return true;
  }

  function reconcile(){
    const A=window.AuroraClean;if(!A)return false;
    const state=A.readState();
    const activateIds=offers(state).filter(o=>{if(upper(o.status)!=='WATCHING')return false;const m=offerMetrics(state,o);return m.live>0&&m.target>0&&m.live>=m.target&&!!bestReplacement(state,m.liveValue,m.incomeSurrendered,o.ticker)}).map(o=>o.id);
    if(!activateIds.length)return false;
    const ids=new Set(activateIds),now=new Date().toISOString();
    A.updateState(next=>{(next.transfer.chairmanOffers||[]).forEach(o=>{if(ids.has(o.id)&&upper(o.status)==='WATCHING'){const h=findHolding(next,o),m=offerMetrics(next,o),replacement=bestReplacement(next,m.liveValue,m.incomeSurrendered,o.ticker);if(!replacement)return;o.status='ACTIVE';o.activatedAt=now;o.lastLivePrice=round(h?.livePriceGbp||o.lastLivePrice);o.replacementTicker=replacement.ticker;o.replacementName=replacement.name;o.replacementYieldPct=replacement.yieldPct;o.replacementScore=replacement.score;o.replacementProjectedAnnualIncome=replacement.projectedAnnualIncome;o.replacementIncomeUplift=replacement.incomeUplift;o.replacementHeld=replacement.held;}})});
    return true;
  }

  function populateHoldings(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),sel=$('chairmanHoldingSelect');if(!sel)return;
    const current=sel.value,rows=activeHoldings(state);
    sel.innerHTML='<option value="">Choose a holding…</option>'+rows.map(h=>`<option value="${esc(holdingKey(h))}">${esc(h.ticker)} · ${esc(h.account||'Unspecified')} · ${num(h.shares).toLocaleString('en-GB',{maximumFractionDigits:6})} shares · live ${price(h.livePriceGbp||h.priceGbp||0)}</option>`).join('');
    if(rows.some(h=>holdingKey(h)===current))sel.value=current;
  }

  function createOffer(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),key=$('chairmanHoldingSelect')?.value,h=activeHoldings(state).find(x=>holdingKey(x)===key);if(!h)return;
    const shares=Math.min(Math.max(0,num($('chairmanShares')?.value)),num(h.shares)),target=round($('chairmanTargetPrice')?.value);if(!(shares>0)||!(target>0))return;
    const live=round(h.livePriceGbp||h.priceGbp),avg=round(avgCost(h)),surrendered=holdingIncomeForShares(h,shares),replacement=bestReplacement(state,round(shares*live),surrendered,h.ticker),status=live>=target&&replacement?'ACTIVE':'WATCHING',createdAt=new Date().toISOString();
    A.updateState(next=>{if(!Array.isArray(next.transfer.chairmanOffers))next.transfer.chairmanOffers=[];next.transfer.chairmanOffers.unshift({id:uid(),holdingKey:key,ticker:upper(h.ticker),name:String(h.name||h.ticker),account:String(h.account||'Unspecified'),shares:round(shares),originalHoldingShares:round(h.shares),avgCostGbp:avg,targetPrice:target,lastLivePrice:live,annualIncomeSurrendered:surrendered,status,createdAt,activatedAt:status==='ACTIVE'?createdAt:null,acceptedAt:null,withdrawnAt:null,acceptedPrice:null,acceptedValue:null,notes:'',source:'MANUAL',replacementTicker:replacement?.ticker||'',replacementName:replacement?.name||'',replacementYieldPct:replacement?.yieldPct||0,replacementScore:replacement?.score||0,replacementProjectedAnnualIncome:replacement?.projectedAnnualIncome||0,replacementIncomeUplift:replacement?.incomeUplift||0,replacementHeld:!!replacement?.held})});
    if($('chairmanShares'))$('chairmanShares').value='';if($('chairmanTargetPrice'))$('chairmanTargetPrice').value='';render();
  }

  function setStatus(id,status){
    const A=window.AuroraClean;if(!A)return;const now=new Date().toISOString();
    A.updateState(next=>{const o=(next.transfer.chairmanOffers||[]).find(x=>x.id===id);if(!o)return;const cur=upper(o.status);if(['ACCEPTED','WITHDRAWN','EXPIRED'].includes(cur))return;if(status==='ACCEPTED'){const m=offerMetrics(next,o),replacement=replacementForOffer(next,o,m);if(cur!=='ACTIVE'||!replacement||replacement.incomeUplift<=0)return;o.status='ACCEPTED';o.acceptedAt=now;o.acceptedPrice=round(m.live||m.target);o.acceptedValue=round(m.shares*(m.live||m.target));o.lastLivePrice=round(m.live||o.lastLivePrice);o.replacementTicker=replacement.ticker;o.replacementName=replacement.name;o.replacementYieldPct=replacement.yieldPct;o.replacementProjectedAnnualIncome=replacement.projectedAnnualIncome;o.replacementIncomeUplift=replacement.incomeUplift;}else if(status==='WITHDRAWN'){o.status='WITHDRAWN';o.withdrawnAt=now}});render();
  }

  function removeClosed(id){const A=window.AuroraClean;if(!A)return;A.updateState(next=>{next.transfer.chairmanOffers=(next.transfer.chairmanOffers||[]).filter(o=>o.id!==id)});render()}

  async function refreshHoldings(){
    if(refreshing)return;refreshing=true;const btn=$('chairmanRefreshHoldings');if(btn){btn.disabled=true;btn.textContent='Refreshing…'}
    try{const authority=window.AuroraMarketPriceAuthority||window.AuroraSquadLivePriceAuthority;if(authority?.refresh)await authority.refresh('transfer-chairman-offers');window.AuroraClean?.importRealHoldings?.();autoGenerateOffers();reconcile();render();}
    catch(_){render()}
    finally{refreshing=false;if(btn){btn.disabled=false;btn.textContent='Refresh Holdings & Prices'}}
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;populateHoldings();const state=A.readState(),rows=offers(state),host=$('chairmanOfferRows'),count=$('chairmanOfferCount');if(count)count.textContent=`${rows.filter(o=>!['ACCEPTED','WITHDRAWN','EXPIRED'].includes(upper(o.status))).length} open offer(s)`;if(!host)return;
    host.innerHTML=rows.length?rows.map(o=>{const m=offerMetrics(state,o),replacement=replacementForOffer(state,o,m),s=upper(o.status)||'WATCHING',canAccept=s==='ACTIVE'&&!!replacement&&replacement.incomeUplift>0,canWithdraw=['WATCHING','ACTIVE'].includes(s),gain=m.targetGain>=0?`+${money(m.targetGain)}`:`-${money(Math.abs(m.targetGain))}`,auto=String(o.source||'').startsWith('AUTO_6_PERCENT');return`<article class="chairman-offer-card status-${s.toLowerCase()}"><div class="chairman-offer-head"><div><span class="chairman-status">${esc(s)}</span><h3>${esc(o.ticker)} · ${esc(o.account)}</h3><p>${esc(o.name||o.ticker)}${auto?' · AUTO +6%':''}</p></div><strong>${m.shares.toLocaleString('en-GB',{maximumFractionDigits:6})} shares</strong></div><div class="chairman-offer-grid"><div><span>LIVE PRICE</span><strong>${m.live>0?price(m.live):'—'}</strong></div><div><span>6% / TARGET PRICE</span><strong>${price(m.target)}</strong></div><div><span>LIVE GAIN</span><strong class="${m.liveGain>=0?'offer-positive':'offer-negative'}">${m.liveGain>=0?'+':''}${money(m.liveGain)} · ${m.liveGainPct.toFixed(2)}%</strong></div><div><span>SALE VALUE</span><strong>${money(m.liveValue)}</strong></div><div><span>INCOME SURRENDERED</span><strong>${money(m.incomeSurrendered)}/yr</strong></div><div><span>REPLACEMENT</span><strong>${replacement?`${esc(replacement.ticker)} · ${replacement.yieldPct.toFixed(2)}%`:'No income upgrade found'}</strong></div><div><span>REPLACEMENT INCOME</span><strong>${replacement?`${money(replacement.projectedAnnualIncome)}/yr`:'—'}</strong></div><div><span>ANNUAL INCOME UPLIFT</span><strong class="${replacement?.incomeUplift>0?'offer-positive':''}">${replacement?`+${money(replacement.incomeUplift)}/yr`:'—'}</strong></div></div><div class="chairman-offer-actions">${canAccept?`<button type="button" class="finance-primary" data-offer-accept="${esc(o.id)}">Accept Offer</button>`:''}${canWithdraw?`<button type="button" data-offer-withdraw="${esc(o.id)}">Withdraw</button>`:`<button type="button" data-offer-remove="${esc(o.id)}">Remove from history</button>`}</div></article>`}).join(''):'<p>No Chairman\'s Offers yet. Aurora will automatically create one when a holding reaches +6% and a higher-income replacement exists.</p>';
    host.querySelectorAll('[data-offer-accept]').forEach(b=>b.addEventListener('click',()=>setStatus(b.dataset.offerAccept,'ACCEPTED')));host.querySelectorAll('[data-offer-withdraw]').forEach(b=>b.addEventListener('click',()=>setStatus(b.dataset.offerWithdraw,'WITHDRAWN')));host.querySelectorAll('[data-offer-remove]').forEach(b=>b.addEventListener('click',()=>removeClosed(b.dataset.offerRemove)));
  }

  function syncSelectedHolding(){const A=window.AuroraClean;if(!A)return;const state=A.readState(),key=$('chairmanHoldingSelect')?.value,h=activeHoldings(state).find(x=>holdingKey(x)===key);if(!h)return;if($('chairmanShares'))$('chairmanShares').value=String(num(h.shares));if($('chairmanTargetPrice')&&!$('chairmanTargetPrice').value){const avg=avgCost(h);if(avg>0)$('chairmanTargetPrice').value=(avg*1.06).toFixed(4)}}

  function refreshAll(){if(autoGenerateOffers())return;if(reconcile())return;render()}
  function boot(){const A=window.AuroraClean;if(!A){setTimeout(boot,60);return}if(!A.readState().squad?.holdings?.length)A.importRealHoldings?.();$('chairmanHoldingSelect')?.addEventListener('change',syncSelectedHolding);$('chairmanCreateOffer')?.addEventListener('click',createOffer);$('chairmanRefreshHoldings')?.addEventListener('click',refreshHoldings);window.addEventListener('aurora-clean:state',refreshAll);window.addEventListener('aurora:market-prices',refreshAll);refreshAll();setTimeout(refreshHoldings,300);window.AuroraChairmanOffers=Object.freeze({BUILD,AUTO_GAIN_TRIGGER_PCT,render,reconcile,autoGenerateOffers,bestReplacement,createOffer,refreshHoldings})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();