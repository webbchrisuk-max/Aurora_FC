(() => {
  'use strict';

  const BUILD='20260901-squad-sheet-authority-1';
  const SHEET_ID='10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
  const HOLDINGS_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Holdings`;
  const PRICES_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=LivePrices`;
  const REFRESH_MS=30*1000;
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const ticker=v=>upper(v).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const closed=new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  let applying=false,busy=false,holdingRows=[],priceMap=new Map(),lastRefreshAt=null;

  function csvRows(text){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){
        if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
      }else if(ch===','&&!quoted){row.push(cell);cell='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        row.push(cell);cell='';if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[];
      }else cell+=ch;
    }
    if(cell||row.length){row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);}
    return rows;
  }

  function objects(text){
    const matrix=csvRows(text);
    if(matrix.length<2)return[];
    const headers=matrix[0].map(v=>String(v).trim());
    return matrix.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
  }

  async function fetchCsv(url){
    const response=await fetch(`${url}&_=${Date.now()}`,{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw new Error(`AuroraData HTTP ${response.status}`);
    return objects(await response.text());
  }

  function serialTime(v){
    const n=num(v);
    if(!(n>25000))return null;
    const d=new Date((n-25569)*86400000);
    return Number.isFinite(d.getTime())?d.toISOString():null;
  }

  function buildPriceMap(rows){
    const map=new Map();
    const fetchedAt=new Date().toISOString();
    rows.forEach(r=>{
      const tk=ticker(r.Symbol??r.symbol??r.ticker);
      const price=num(r.Price??r.price);
      if(!tk||!(price>0))return;
      const rawDay=r['Day Change %']??r['Change %']??r.dayChangePct;
      const dayPct=rawDay===undefined||rawDay===null||String(rawDay).trim()===''?null:num(rawDay);
      const tradeTime=serialTime(r['Trade Time']??r.tradeTime) || fetchedAt;
      map.set(tk,{price,dayPct,tradeTime});
    });
    return map;
  }

  function normaliseHolding(r){
    const status=upper(r.status||'ACTIVE');
    const shares=Math.max(0,num(r.shares));
    if(closed.has(status)||!(shares>0))return null;
    const tk=ticker(r.ticker||r.symbol);
    if(!tk)return null;
    const quote=priceMap.get(tk);
    const live=quote?.price>0?quote.price:Math.max(0,num(r.live_price??r.livePriceGbp));
    const book=Math.max(0,num(r.book_cost??r.bookCostGbp));
    const market=shares*live;
    const annualDps=Math.max(0,num(r.annual_dps??r.annualDpsGbp));
    const annualIncome=Math.max(0,num(r.annual_dps_total??r.annualIncomeGbp)||(shares*annualDps));
    return {
      account:String(r.account||'Unspecified'),
      ticker:tk,
      name:String(r.name||tk),
      shares,
      bookCostGbp:book,
      avgCostGbp:Math.max(0,num(r.average_price??r.avgCostGbp)||(shares>0?book/shares:0)),
      livePriceGbp:live,
      priceGbp:live,
      marketValueGbp:market,
      currentValueGbp:market,
      profitLossGbp:market-book,
      annualDpsGbp:annualDps,
      annualIncomeGbp:annualIncome,
      sector:String(r.sector||''),
      role:String(r.role||''),
      status,
      dailyChangePct:quote?.dayPct??null,
      dayChangePct:quote?.dayPct??null,
      todayChangePct:quote?.dayPct??null,
      priceSource:quote?'AURORADATA_LIVEPRICES_DIRECT':'AURORADATA_HOLDINGS',
      priceUpdatedAt:quote?.tradeTime||lastRefreshAt||new Date().toISOString(),
      holdingsSource:'AURORADATA_HOLDINGS_DIRECT'
    };
  }

  function apply(reason='sheet-refresh'){
    const A=window.AuroraClean;
    if(!A||applying||!holdingRows.length)return false;
    const holdings=holdingRows.map(normaliseHolding).filter(Boolean);
    if(!holdings.length)return false;
    applying=true;
    try{
      A.updateState(state=>{
        state.squad=state.squad&&typeof state.squad==='object'?state.squad:{};
        state.squad.holdings=holdings;
        state.squad.importedAt=new Date().toISOString();
        state.squad.source='AURORADATA_HOLDINGS_DIRECT';
        state.squad.priceSource='AURORADATA_LIVEPRICES_DIRECT';
        state.squad.priceUpdatedAt=lastRefreshAt||new Date().toISOString();
        state.squad.sheetAuthorityReason=reason;
      });
    }finally{setTimeout(()=>{applying=false},0);}
    window.dispatchEvent(new CustomEvent('aurora:market-prices',{detail:{build:BUILD,source:'AURORADATA_LIVEPRICES_DIRECT',reason,holdingCount:holdings.length,quoteCount:priceMap.size}}));
    return true;
  }

  async function refresh(reason='manual'){
    if(busy)return;
    busy=true;
    try{
      const [holdings,prices]=await Promise.all([fetchCsv(HOLDINGS_URL),fetchCsv(PRICES_URL)]);
      holdingRows=holdings;
      priceMap=buildPriceMap(prices);
      lastRefreshAt=new Date().toISOString();
      apply(reason);
      window.AuroraSquadSheetAuthority=Object.freeze({BUILD,refresh,apply,asOf:lastRefreshAt,holdingCount:holdingRows.length,quoteCount:priceMap.size});
    }catch(error){console.warn('[Aurora Squad Sheet Authority]',error);}
    finally{busy=false;}
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return;}
    refresh('startup');
    setInterval(()=>refresh('interval'),REFRESH_MS);
    window.addEventListener('focus',()=>refresh('focus'));
    window.addEventListener('pageshow',()=>refresh('pageshow'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh('visible');});
    window.addEventListener('aurora-clean:state',()=>{if(!applying&&holdingRows.length)setTimeout(()=>apply('state-overwrite-guard'),0);});
  }

  window.AuroraSquadSheetAuthority=Object.freeze({BUILD,refresh,apply,asOf:null,holdingCount:0,quoteCount:0});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
