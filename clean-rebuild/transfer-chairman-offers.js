(() => {
  'use strict';

  const BUILD='20260827-clean-chairman-offers-2';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(Math.max(0,num(v)).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const price=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:4}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const uid=()=>`OFFER-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const closed=new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  let refreshing=false;

  function activeHoldings(state){return (state.squad?.holdings||[]).filter(h=>!closed.has(upper(h.status||'ACTIVE'))&&num(h.shares)>0)}
  function offers(state){return Array.isArray(state.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[]}
  function holdingKey(h){return String(h.holdingId||`${upper(h.ticker)}|${String(h.account||'')}`)}
  function findHolding(state,offer){return activeHoldings(state).find(h=>holdingKey(h)===offer.holdingKey)||activeHoldings(state).find(h=>upper(h.ticker)===upper(offer.ticker)&&String(h.account||'')===String(offer.account||''))||null}
  function holdingIncomeForShares(h,shares){const totalShares=Math.max(0,num(h?.shares)),annual=Math.max(0,num(h?.annualIncomeGbp));return totalShares>0?round(annual*(shares/totalShares)):0}
  function offerMetrics(state,offer){
    const h=findHolding(state,offer),shares=Math.min(Math.max(0,num(offer.shares)),Math.max(0,num(h?.shares)||num(offer.originalHoldingShares))),live=Math.max(0,num(h?.livePriceGbp??h?.priceGbp??offer.lastLivePrice)),avg=Math.max(0,num(h?.avgCostGbp??offer.avgCostGbp)),target=Math.max(0,num(offer.targetPrice)),book=round(shares*avg),liveValue=round(shares*live),targetValue=round(shares*target),liveGain=round(liveValue-book),targetGain=round(targetValue-book),incomeSurrendered=h?holdingIncomeForShares(h,shares):round(offer.annualIncomeSurrendered);
    return{h,shares,live,avg,target,book,liveValue,targetValue,liveGain,targetGain,incomeSurrendered};
  }

  function reconcile(){
    const A=window.AuroraClean;if(!A)return false;
    const state=A.readState();
    const activateIds=offers(state).filter(o=>{if(upper(o.status)!=='WATCHING')return false;const m=offerMetrics(state,o);return m.live>0&&m.target>0&&m.live>=m.target}).map(o=>o.id);
    if(!activateIds.length)return false;
    const ids=new Set(activateIds),now=new Date().toISOString();
    A.updateState(next=>{(next.transfer.chairmanOffers||[]).forEach(o=>{if(ids.has(o.id)&&upper(o.status)==='WATCHING'){const h=findHolding(next,o);o.status='ACTIVE';o.activatedAt=now;o.lastLivePrice=round(h?.livePriceGbp||o.lastLivePrice)}})});
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
    const live=round(h.livePriceGbp||h.priceGbp),avg=round(h.avgCostGbp||(num(h.shares)>0?num(h.bookCostGbp)/num(h.shares):0)),status=live>=target?'ACTIVE':'WATCHING',createdAt=new Date().toISOString(),annualIncomeSurrendered=holdingIncomeForShares(h,shares);
    A.updateState(next=>{if(!Array.isArray(next.transfer.chairmanOffers))next.transfer.chairmanOffers=[];next.transfer.chairmanOffers.unshift({id:uid(),holdingKey:key,ticker:upper(h.ticker),name:String(h.name||h.ticker),account:String(h.account||'Unspecified'),shares:round(shares),originalHoldingShares:round(h.shares),avgCostGbp:avg,targetPrice:target,lastLivePrice:live,annualIncomeSurrendered,status,createdAt,activatedAt:status==='ACTIVE'?createdAt:null,acceptedAt:null,withdrawnAt:null,acceptedPrice:null,acceptedValue:null,notes:''})});
    if($('chairmanShares'))$('chairmanShares').value='';if($('chairmanTargetPrice'))$('chairmanTargetPrice').value='';render();
  }

  function setStatus(id,status){
    const A=window.AuroraClean;if(!A)return;const now=new Date().toISOString();
    A.updateState(next=>{const o=(next.transfer.chairmanOffers||[]).find(x=>x.id===id);if(!o)return;const cur=upper(o.status);if(['ACCEPTED','WITHDRAWN','EXPIRED'].includes(cur))return;if(status==='ACCEPTED'){const m=offerMetrics(next,o);if(cur!=='ACTIVE')return;o.status='ACCEPTED';o.acceptedAt=now;o.acceptedPrice=round(m.live||m.target);o.acceptedValue=round(m.shares*(m.live||m.target));o.lastLivePrice=round(m.live||o.lastLivePrice)}else if(status==='WITHDRAWN'){o.status='WITHDRAWN';o.withdrawnAt=now}});render();
  }

  function removeClosed(id){const A=window.AuroraClean;if(!A)return;A.updateState(next=>{next.transfer.chairmanOffers=(next.transfer.chairmanOffers||[]).filter(o=>o.id!==id)});render()}

  async function refreshHoldings(){
    if(refreshing)return;refreshing=true;const btn=$('chairmanRefreshHoldings');if(btn){btn.disabled=true;btn.textContent='Refreshing…'}
    try{const authority=window.AuroraMarketPriceAuthority||window.AuroraSquadLivePriceAuthority;if(authority?.refresh)await authority.refresh('transfer-chairman-offers');window.AuroraClean?.importRealHoldings?.();reconcile();render();}
    catch(_){render()}
    finally{refreshing=false;if(btn){btn.disabled=false;btn.textContent='Refresh Holdings & Prices'}}
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;populateHoldings();const state=A.readState(),rows=offers(state),host=$('chairmanOfferRows'),count=$('chairmanOfferCount');if(count)count.textContent=`${rows.filter(o=>!['ACCEPTED','WITHDRAWN','EXPIRED'].includes(upper(o.status))).length} open offer(s)`;if(!host)return;
    host.innerHTML=rows.length?rows.map(o=>{const m=offerMetrics(state,o),s=upper(o.status)||'WATCHING',canAccept=s==='ACTIVE',canWithdraw=['WATCHING','ACTIVE'].includes(s),gain=m.targetGain>=0?`+${money(m.targetGain)}`:`-${money(Math.abs(m.targetGain))}`;return`<article class="chairman-offer-card status-${s.toLowerCase()}"><div class="chairman-offer-head"><div><span class="chairman-status">${esc(s)}</span><h3>${esc(o.ticker)} · ${esc(o.account)}</h3><p>${esc(o.name||o.ticker)}</p></div><strong>${m.shares.toLocaleString('en-GB',{maximumFractionDigits:6})} shares</strong></div><div class="chairman-offer-grid"><div><span>LIVE PRICE</span><strong>${m.live>0?price(m.live):'—'}</strong></div><div><span>TARGET PRICE</span><strong>${price(m.target)}</strong></div><div><span>TARGET VALUE</span><strong>${money(m.targetValue)}</strong></div><div><span>TARGET GAIN</span><strong class="${m.targetGain>=0?'offer-positive':'offer-negative'}">${gain}</strong></div><div><span>INCOME SURRENDERED</span><strong>${money(m.incomeSurrendered)}/yr</strong></div><div><span>LIVE VALUE</span><strong>${money(m.liveValue)}</strong></div></div><div class="chairman-offer-actions">${canAccept?`<button type="button" class="finance-primary" data-offer-accept="${esc(o.id)}">Accept Offer</button>`:''}${canWithdraw?`<button type="button" data-offer-withdraw="${esc(o.id)}">Withdraw</button>`:`<button type="button" data-offer-remove="${esc(o.id)}">Remove from history</button>`}</div></article>`}).join(''):'<p>No Chairman\'s Offers yet. Choose a live holding above to create one.</p>';
    host.querySelectorAll('[data-offer-accept]').forEach(b=>b.addEventListener('click',()=>setStatus(b.dataset.offerAccept,'ACCEPTED')));host.querySelectorAll('[data-offer-withdraw]').forEach(b=>b.addEventListener('click',()=>setStatus(b.dataset.offerWithdraw,'WITHDRAWN')));host.querySelectorAll('[data-offer-remove]').forEach(b=>b.addEventListener('click',()=>removeClosed(b.dataset.offerRemove)));
  }

  function syncSelectedHolding(){const A=window.AuroraClean;if(!A)return;const state=A.readState(),key=$('chairmanHoldingSelect')?.value,h=activeHoldings(state).find(x=>holdingKey(x)===key);if(!h)return;if($('chairmanShares'))$('chairmanShares').value=String(num(h.shares));if($('chairmanTargetPrice')&&!$('chairmanTargetPrice').value){const live=num(h.livePriceGbp||h.priceGbp);if(live>0)$('chairmanTargetPrice').value=(live*1.05).toFixed(4)}}

  function boot(){const A=window.AuroraClean;if(!A){setTimeout(boot,60);return}if(!A.readState().squad?.holdings?.length)A.importRealHoldings?.();$('chairmanHoldingSelect')?.addEventListener('change',syncSelectedHolding);$('chairmanCreateOffer')?.addEventListener('click',createOffer);$('chairmanRefreshHoldings')?.addEventListener('click',refreshHoldings);window.addEventListener('aurora-clean:state',()=>{if(!reconcile())render()});window.addEventListener('aurora:market-prices',()=>{if(!reconcile())render()});reconcile();render();setTimeout(refreshHoldings,300);window.AuroraChairmanOffers=Object.freeze({BUILD,render,reconcile,createOffer,refreshHoldings})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();