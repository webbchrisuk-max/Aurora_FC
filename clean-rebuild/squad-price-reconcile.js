(() => {
  'use strict';

  const BUILD='20260901-clean-squad-price-reconcile-5-live-sheet-first';
  const SHEET_ID='10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
  const OPEN_SHEET_URL=`https://opensheet.elk.sh/${SHEET_ID}/LivePrices`;
  const GVIZ_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=LivePrices`;
  const REFRESH_MS=60*1000;
  const CACHE_KEY='aurora-clean:squad-last-good-prices:v1';
  const CACHE_MAX_AGE_MS=6*60*60*1000;
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const active=row=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(String(row?.status||'ACTIVE').toUpperCase())&&num(row?.shares)>0;
  let quotes=new Map(),busy=false,applying=false,lastRefreshAt=null,lastSource='WAITING';

  function readLastGood(){
    try{
      const raw=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      const savedAt=Date.parse(raw?.savedAt||'');
      if(!raw||!Array.isArray(raw.quotes)||!Number.isFinite(savedAt)||Date.now()-savedAt>CACHE_MAX_AGE_MS)return new Map();
      return new Map(raw.quotes.filter(r=>ticker(r?.ticker)&&num(r?.price)>0).map(r=>[ticker(r.ticker),{
        ticker:ticker(r.ticker),price:num(r.price),dayPct:r.dayPct===null||r.dayPct===undefined?null:num(r.dayPct),source:String(r.source||'LAST_KNOWN_GOOD'),observedAt:r.observedAt||r.priceUpdatedAt||raw.savedAt,lastGood:true
      }]));
    }catch(_){return new Map()}
  }

  function saveLastGood(map){
    if(!map?.size)return;
    try{
      localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),quotes:[...map.values()].map(r=>({
        ticker:r.ticker,price:r.price,dayPct:r.dayPct??null,source:r.source||lastSource||'AURORADATA_LIVEPRICES',observedAt:r.observedAt||new Date().toISOString()
      }))}));
    }catch(_){}
  }

  function csvRows(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){
        if(quoted&&text[i+1]==='"'){cell+='"';i++;}
        else quoted=!quoted;
      }else if(ch===','&&!quoted){row.push(cell);cell='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        row.push(cell);cell='';if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[];
      }else cell+=ch;
    }
    if(cell||row.length){row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);}
    return rows;
  }

  function rowsToQuotes(rows,source){
    const map=new Map();
    const observedAt=new Date().toISOString();
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const tk=ticker(row.Symbol??row.symbol??row.ticker??row.Ticker);
      const price=num(row.Price??row.price??row.livePriceGbp??row.live_price_gbp);
      const rawDay=row['Day Change %']??row['Change %']??row.dayChangePct??row.dailyChangePct??row.changePct;
      const dayPct=rawDay===undefined||rawDay===null||String(rawDay).trim()===''?null:num(rawDay);
      if(tk&&price>0)map.set(tk,{ticker:tk,price,dayPct,source,observedAt});
    });
    return map;
  }

  async function fetchGoogleCsv(){
    const response=await fetch(`${GVIZ_URL}&_=${Date.now()}`,{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw new Error(`Google LivePrices HTTP ${response.status}`);
    const matrix=csvRows(await response.text());
    if(matrix.length<2)throw new Error('Google LivePrices returned no rows');
    const headers=matrix[0].map(v=>String(v).trim());
    const rows=matrix.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
    const map=rowsToQuotes(rows,'AURORADATA_GOOGLE_LIVEPRICES');
    if(!map.size)throw new Error('Google LivePrices returned no valid quotes');
    return map;
  }

  async function fetchOpenSheet(){
    const response=await fetch(`${OPEN_SHEET_URL}?v=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`OpenSheet LivePrices HTTP ${response.status}`);
    const map=rowsToQuotes(await response.json(),'AURORADATA_OPENSHEET_LIVEPRICES');
    if(!map.size)throw new Error('OpenSheet LivePrices returned no valid quotes');
    return map;
  }

  async function fetchQuotes(){
    const errors=[];
    for(const loader of [fetchGoogleCsv,fetchOpenSheet]){
      try{
        const map=await loader();
        lastSource=[...map.values()][0]?.source||'AURORADATA_LIVEPRICES';
        saveLastGood(map);
        return map;
      }catch(error){errors.push(error);}
    }
    const cached=readLastGood();
    if(cached.size){lastSource='AURORADATA_LIVEPRICES_LAST_GOOD';return cached;}
    throw errors[0]||new Error('AuroraData LivePrices unavailable');
  }

  function dayMove(shares,price,dayPct){
    if(!(shares>0)||!(price>0)||dayPct===null||dayPct===undefined||dayPct<=-99.9)return null;
    const previous=price/(1+dayPct/100);
    return (price-previous)*shares;
  }

  function patchHolding(row,quote,stamp){
    if(!quote||!active(row))return row;
    const shares=Math.max(0,num(row.shares));
    const book=Math.max(0,num(row.bookCostGbp??row.book_cost_gbp??row.costBasisGbp));
    const market=Number((shares*quote.price).toFixed(8));
    const pnl=Number((market-book).toFixed(8));
    const move=dayMove(shares,quote.price,quote.dayPct);
    return {
      ...row,
      livePriceGbp:quote.price,priceGbp:quote.price,live_price_gbp:quote.price,
      marketValueGbp:market,currentValueGbp:market,market_value_gbp:market,profitLossGbp:pnl,
      ...(quote.dayPct===null?{}:{dailyChangePct:quote.dayPct,dayChangePct:quote.dayPct,todayChangePct:quote.dayPct,daily_change_pct:quote.dayPct}),
      ...(move===null?{}:{dailyChangeGbp:Number(move.toFixed(8)),dayChangeGbp:Number(move.toFixed(8)),todayChangeGbp:Number(move.toFixed(8))}),
      priceSource:quote.source||lastSource||'AURORADATA_LIVEPRICES',priceUpdatedAt:quote.observedAt||stamp,lastPriceReconciledAt:stamp
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
      const currentDay=row?.dailyChangePct===undefined||row?.dailyChangePct===null?null:num(row.dailyChangePct);
      const quoteDay=quote.dayPct===undefined||quote.dayPct===null?null:num(quote.dayPct);
      const source=String(row?.priceSource||'').toUpperCase();
      const stale=/IG_BROKER_VERIFIED|VERIFIED_2026_08_25|FALLBACK|SHARED_MARKET|LAST_GOOD/.test(source);
      const sameDay=(currentDay===null&&quoteDay===null)||(currentDay!==null&&quoteDay!==null&&Math.abs(currentDay-quoteDay)<0.0000001);
      if(!stale&&Math.abs(current-quote.price)<0.0000001&&Math.abs(currentMarket-expected)<0.005&&sameDay)return row;
      changed=true;
      return patchHolding(row,quote,stamp);
    });
    if(!changed)return false;
    applying=true;
    try{
      A.updateState(next=>{
        next.squad=next.squad&&typeof next.squad==='object'?next.squad:{};
        next.squad.holdings=patched;
        next.squad.priceSource=lastSource||'AURORADATA_LIVEPRICES';
        next.squad.priceUpdatedAt=stamp;
        next.squad.priceReconcileReason=reason;
      });
    }finally{setTimeout(()=>{applying=false},0);}
    window.dispatchEvent(new CustomEvent('aurora:market-prices',{detail:{build:BUILD,reason,source:lastSource,quoteCount:quotes.size,changed:true}}));
    return true;
  }

  async function refresh(reason='manual'){
    if(busy){if(quotes.size)apply(`${reason}-while-busy`);return;}
    busy=true;
    try{
      quotes=await fetchQuotes();
      lastRefreshAt=new Date().toISOString();
      apply(reason);
      window.AuroraCleanSquadPrices=Object.freeze({BUILD,source:lastSource,quoteCount:quotes.size,asOf:lastRefreshAt,refresh,apply});
    }catch(error){console.warn('[Aurora Clean Squad Price Reconcile]',error);}
    finally{busy=false;}
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return;}
    quotes=readLastGood();
    if(quotes.size){lastSource='AURORADATA_LIVEPRICES_LAST_GOOD';apply('recent-last-good-startup');}
    refresh('startup');
    setTimeout(()=>refresh('startup-settled'),1200);
    setInterval(()=>refresh('interval'),REFRESH_MS);
    window.addEventListener('focus',()=>refresh('focus'));
    window.addEventListener('pageshow',()=>refresh('pageshow'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh('visible');});
    window.addEventListener('aurora-clean:state',()=>{if(!applying&&quotes.size)setTimeout(()=>apply('clean-state-change'),0);});
    window.addEventListener('aurora:market-prices',event=>{if(event?.detail?.source!==lastSource&&quotes.size)setTimeout(()=>apply('shared-price-override'),0);});
  }

  window.AuroraCleanSquadPrices=Object.freeze({BUILD,source:'WAITING',quoteCount:0,asOf:null,refresh,apply});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
