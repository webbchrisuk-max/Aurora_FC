(() => {
  'use strict';

  const BUILD='20260827-scouting-market-watch-2';
  const TARGET=2000;
  const SOURCES={
    NASDAQ:'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_tickers.json',
    NYSE:'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_tickers.json',
    AMEX:'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_tickers.json'
  };
  const clean=v=>String(v||'').trim().toUpperCase();
  const plain=t=>/^[A-Z]{1,5}$/.test(t);
  let marketRows=[];
  let writing=false;
  let loaded=false;

  async function fetchSymbols(url){
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    return Array.isArray(data)?data.map(clean).filter(plain):[];
  }

  function buildRows(pools){
    const seen=new Set();
    const rows=[];
    const names=['NASDAQ','NYSE','AMEX'];
    const indexes={NASDAQ:0,NYSE:0,AMEX:0};
    while(rows.length<TARGET){
      let added=false;
      for(const market of names){
        const list=pools[market]||[];
        while(indexes[market]<list.length){
          const ticker=list[indexes[market]++];
          if(seen.has(ticker))continue;
          seen.add(ticker);
          rows.push({
            id:`MARKET-WATCH-${ticker}`,
            ticker,
            name:ticker,
            sector:'',
            role:'Development Watch',
            market,
            currency:'USD',
            payoutRisk:'UNKNOWN',
            notes:'Broad market-watch coverage. Requires Aurora price, dividend and broker enrichment before recruitment.',
            fairValueGbp:0,
            livePriceGbp:0,
            annualDpsGbp:0,
            yieldPct:0,
            buyStrength:0,
            source:'MARKET WATCH',
            approved:false,
            marketWatch:true,
            dataPending:true,
            updatedAt:new Date().toISOString()
          });
          added=true;
          break;
        }
        if(rows.length>=TARGET)break;
      }
      if(!added)break;
    }
    return rows;
  }

  function enrichedSourceRows(state){
    const c=state.scouting?.universeCounts||{};
    return Number(c.watchlist||0)+Number(c.global||0)+Number(c.scout||0);
  }

  function decorate(){
    if(!loaded||!marketRows.length)return;
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState();
    const enriched=enrichedSourceRows(state);
    const totalSource=enriched+marketRows.length;
    const firstKpi=document.querySelector('#scoutingNetwork .scout-network-kpi');
    const small=firstKpi?.querySelector('small');
    if(small)small.textContent=`${totalSource.toLocaleString('en-GB')} source rows · ${enriched.toLocaleString('en-GB')} Aurora-enriched + ${marketRows.length.toLocaleString('en-GB')} broad market watch`;
    const steps=document.querySelectorAll('#scoutingNetwork .scout-funnel-step');
    if(steps[0]){
      const strong=steps[0].querySelector('strong');
      const label=steps[0].querySelector('span');
      if(strong)strong.textContent=totalSource.toLocaleString('en-GB');
      if(label)label.textContent='SOURCE + MARKET WATCH';
    }
  }

  function apply(){
    const A=window.AuroraClean;
    if(!A||!marketRows.length||writing)return;
    const state=A.readState();
    const existing=Array.isArray(state.scouting?.candidates)?state.scouting.candidates:[];
    const existingKeys=new Set(existing.map(r=>clean(r?.ticker)).filter(Boolean));
    const missing=marketRows.filter(r=>!existingKeys.has(r.ticker));
    const counts=state.scouting?.marketWatchCounts||{};
    const metadataCurrent=Number(counts.unique||0)===marketRows.length;
    if(!missing.length&&metadataCurrent){setTimeout(decorate,0);return;}
    writing=true;
    A.updateState(next=>{
      next.scouting=next.scouting||{};
      const current=Array.isArray(next.scouting.candidates)?next.scouting.candidates:[];
      const keys=new Set(current.map(r=>clean(r?.ticker)).filter(Boolean));
      const additions=marketRows.filter(r=>!keys.has(r.ticker));
      next.scouting.candidates=[...current,...additions];
      next.scouting.marketWatchLoadedAt=new Date().toISOString();
      next.scouting.marketWatchCounts={...(next.scouting.marketWatchCounts||{}),unique:marketRows.length,target:TARGET};
      next.scouting.universeCounts={...(next.scouting.universeCounts||{}),marketWatch:marketRows.length};
    });
    writing=false;
    setTimeout(decorate,0);
  }

  function setStatus(text,error=false){
    const el=document.getElementById('scoutingMarketWatchStatus');
    if(!el)return;
    el.textContent=text;
    el.dataset.state=error?'error':'ok';
  }

  async function load(){
    setStatus('Building broad market watch…');
    try{
      const settled=await Promise.all(Object.entries(SOURCES).map(async([name,url])=>{
        try{return[name,await fetchSymbols(url),''];}
        catch(e){return[name,[],String(e?.message||e)];}
      }));
      const pools=Object.fromEntries(settled.map(([name,rows])=>[name,rows]));
      marketRows=buildRows(pools);
      if(!marketRows.length)throw new Error('No market symbols returned');
      loaded=true;
      const raw=Object.fromEntries(settled.map(([name,rows])=>[name,rows.length]));
      const A=window.AuroraClean;
      if(A){
        writing=true;
        A.updateState(state=>{
          state.scouting=state.scouting||{};
          state.scouting.marketWatchCounts={NASDAQ:raw.NASDAQ||0,NYSE:raw.NYSE||0,AMEX:raw.AMEX||0,unique:marketRows.length,target:TARGET};
        });
        writing=false;
      }
      apply();
      setStatus(`Broad Market Watch ready · ${marketRows.length.toLocaleString('en-GB')} real listed symbols · data-pending names cannot enter payday plans`);
      setTimeout(decorate,30);
    }catch(e){
      console.error('[Aurora Market Watch]',e);
      setStatus(`Broad Market Watch unavailable · ${String(e?.message||e)}`,true);
    }
  }

  function ensureStatus(){
    if(document.getElementById('scoutingMarketWatchStatus'))return;
    const anchor=document.getElementById('scoutingUniverseStatus');
    if(!anchor)return;
    const node=document.createElement('span');
    node.id='scoutingMarketWatchStatus';
    node.textContent='Broad Market Watch loading…';
    node.style.display='block';
    node.style.marginTop='6px';
    anchor.insertAdjacentElement('afterend',node);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    ensureStatus();
    load();
    window.addEventListener('aurora-clean:state',()=>{
      if(!writing&&loaded)setTimeout(()=>{apply();decorate();},0);
    });
    window.AuroraScoutingMarketWatch=Object.freeze({BUILD,TARGET,load,apply,decorate});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
