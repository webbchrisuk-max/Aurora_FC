(() => {
  'use strict';

  const BUILD='20260827-chairman-status-guard-1';
  const upper=v=>String(v||'').trim().toUpperCase();
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  let writing=false;

  function holdingKey(h){return String(h?.holdingId||`${upper(h?.ticker)}|${String(h?.account||'')}`)}
  function activeHolding(state,offer){
    const rows=Array.isArray(state?.squad?.holdings)?state.squad.holdings:[];
    return rows.find(h=>holdingKey(h)===offer.holdingKey)||rows.find(h=>upper(h?.ticker)===upper(offer?.ticker)&&String(h?.account||'')===String(offer?.account||''))||null;
  }
  function incomeForShares(h,shares){const total=Math.max(0,num(h?.shares)),annual=Math.max(0,num(h?.annualIncomeGbp));return total>0?annual*(Math.max(0,num(shares))/total):0}
  function clearReplacement(o){
    o.replacementTicker='';o.replacementName='';o.replacementSector='';o.replacementYieldPct=0;o.replacementScore=0;o.replacementProjectedAnnualIncome=0;o.replacementIncomeUplift=0;o.replacementIncomeUpliftPct=0;o.replacementHeld=false;o.replacementPostTickerPct=0;o.replacementPostSectorPct=0;o.replacementSameBroker=false;o.replacementConfidence='';o.replacementDecisionScore=0;
  }

  function reconcile(){
    if(writing)return false;
    const A=window.AuroraClean,E=window.AuroraChairmanOffers;if(!A||!E?.bestReplacement)return false;
    const state=A.readState(),rows=Array.isArray(state.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[],downgrade=[];
    rows.forEach(o=>{
      if(upper(o.status)!=='ACTIVE')return;
      const h=activeHolding(state,o),shares=Math.max(0,num(o.shares)),live=Math.max(0,num(h?.livePriceGbp??h?.priceGbp??o.lastLivePrice)),proceeds=shares*live,lost=h?incomeForShares(h,shares):Math.max(0,num(o.annualIncomeSurrendered));
      const replacement=E.bestReplacement(state,proceeds,lost,o.ticker,o.account);
      if(!replacement)downgrade.push(o.id);
    });
    if(!downgrade.length)return false;
    const ids=new Set(downgrade),now=new Date().toISOString();writing=true;
    A.updateState(next=>{(next.transfer?.chairmanOffers||[]).forEach(o=>{if(ids.has(o.id)&&upper(o.status)==='ACTIVE'){o.status='WATCHING';o.holdReason='NO_QUALIFIED_SAME_ACCOUNT_REPLACEMENT';o.lastHeldAt=now;clearReplacement(o)}})});
    writing=false;
    return true;
  }

  function boot(){
    if(!window.AuroraClean||!window.AuroraChairmanOffers){setTimeout(boot,60);return}
    reconcile();
    window.addEventListener('aurora-clean:state',reconcile);
    window.addEventListener('aurora:market-prices',reconcile);
    window.AuroraChairmanStatusGuard=Object.freeze({BUILD,reconcile});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();