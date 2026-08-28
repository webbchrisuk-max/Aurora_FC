(() => {
  'use strict';

  const BUILD='20260828-clean-squad-price-reconcile-1';
  const SHEET_ID='10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
  const LIVE_URL=`https://opensheet.elk.sh/${SHEET_ID}/LivePrices`;
  const REFRESH_MS=60*1000;
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const active=row=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(String(row?.status||'ACTIVE').toUpperCase())&&num(row?.shares)>0;
  let quotes=new Map(),busy=false,applying=false,lastRefreshAt=null;

  async function fetchQuotes(){
    const response=await fetch(`${LIVE_URL}?v=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`LivePrices HTTP ${response.status}`);
    const rows=await response.json();
    const next=new Map();
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const tk=ticker(row.Symbol??row.symbol??row.ticker);
      const price=num(row.Price??row.price??row.livePriceGbp??row.live_price_gbp);
      if(tk&&price>0)next.set(tk,{ticker:tk,price});
    });
    return next;
  }

  function patchHolding(row,quote,stamp){
    if(!quote||!active(row))return row;
    const shares=Math.max(0,num(row.shares));
    const book=Math.max(0,num(row.bookCostGbp??row.book_cost_gbp??row.costBasisGbp));
    const market=Number((shares*quote.price).toFixed(8));
    const pnl=Number((market-book).toFixed(8));
    return {
      ...row,
      livePriceGbp:quote.price,
      priceGbp:quote.price,
      live_price_gbp:quote.price,
      marketValueGbp:market,
      currentValueGbp:market,
      market_value_gbp:market,
      profitLossGbp:pnl,
      priceSource:'AURORADATA_LIVEPRICES_CLEAN',
      priceUpdatedAt:stamp
    };
  }

  function apply(reason='refresh'){
    const A=window.AuroraClean;
    if(!A||!quotes.size||applying)return false;
    const state=A.readState();
    const rows=Array.isArray(state?.squad?.holdings)?state.squad.holdings:[];
    let changed=false;
    const stamp=new Date().toISOString();
    const patched=rows.map(row=>{
      const quote=quotes.get(ticker(row?.ticker||row?.symbol));
      if(!quote)return row;
      const current=num(row?.livePriceGbp??row?.priceGbp);
      const expected=num(row?.shares)*quote.price;
      const currentMarket=num(row?.marketValueGbp??row?.currentValueGbp);
      if(Math.abs(current-quote.price)<0.0000001&&Math.abs(currentMarket-expected)<0.005)return row;
      changed=true;
      return patchHolding(row,quote,stamp);
    });
    if(!changed)return false;
    applying=true;
    try{
      A.updateState(next=>{
        next.squad=next.squad&&typeof next.squad==='object'?next.squad:{};
        next.squad.holdings=patched;
        next.squad.priceSource='AURORADATA_LIVEPRICES_CLEAN';
        next.squad.priceUpdatedAt=stamp;
        next.squad.priceReconcileReason=reason;
      });
    } finally {
      setTimeout(()=>{applying=false},0);
    }
    window.dispatchEvent(new CustomEvent('aurora:market-prices',{detail:{build:BUILD,reason,source:'AURORADATA_LIVEPRICES_CLEAN',quoteCount:quotes.size,changed:true}}));
    return true;
  }

  async function refresh(reason='manual'){
    if(busy)return;
    busy=true;
    try{
      quotes=await fetchQuotes();
      lastRefreshAt=new Date().toISOString();
      apply(reason);
      window.AuroraCleanSquadPrices=Object.freeze({BUILD,source:'AURORADATA_LIVEPRICES_CLEAN',quoteCount:quotes.size,asOf:lastRefreshAt,refresh,apply});
    }catch(error){
      console.warn('[Aurora Clean Squad Price Reconcile]',error);
    }finally{busy=false}
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return}
    refresh('startup');
    setTimeout(()=>refresh('startup-settled'),1500);
    setInterval(()=>refresh('interval'),REFRESH_MS);
    window.addEventListener('focus',()=>refresh('focus'));
    window.addEventListener('pageshow',()=>refresh('pageshow'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh('visible')});
    window.addEventListener('aurora-clean:state',()=>{if(!applying&&quotes.size)setTimeout(()=>apply('clean-state-change'),0)});
    window.addEventListener('aurora:market-prices',event=>{if(event?.detail?.source!=='AURORADATA_LIVEPRICES_CLEAN'&&quotes.size)setTimeout(()=>apply('shared-price-override'),0)});
  }

  window.AuroraCleanSquadPrices=Object.freeze({BUILD,source:'WAITING',quoteCount:0,asOf:null,refresh,apply});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
