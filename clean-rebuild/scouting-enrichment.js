(() => {
  'use strict';
  const BUILD='20260827-scouting-enrichment-1';
  const SHEET_ID='10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
  const SOURCES={
    AuroraScout:`https://opensheet.elk.sh/${SHEET_ID}/AuroraScout`,
    Watchlist:`https://opensheet.elk.sh/${SHEET_ID}/Watchlist`,
    'Global Watchlist':`https://opensheet.elk.sh/${SHEET_ID}/Global%20Watchlist`,
    AuroraIntelligence:`https://opensheet.elk.sh/${SHEET_ID}/AuroraIntelligence`,
    DecisionEngine:`https://opensheet.elk.sh/${SHEET_ID}/DecisionEngine`,
    LivePrices:`https://opensheet.elk.sh/${SHEET_ID}/LivePrices`
  };
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const clean=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const key=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const cell=(row,names)=>{if(!row||typeof row!=='object')return'';const wanted=names.map(key);const found=Object.keys(row).find(k=>wanted.includes(key(k)));return found?row[found]:''};
  let running=false,lastSummary=null;

  function yieldPct(row){
    const raw=num(cell(row,['yield_pct','yield','dividend_yield','dividend yield']));
    if(raw<=0)return 0;
    return raw>0&&raw<1?raw*100:raw;
  }
  function price(row){return num(cell(row,['live_price_gbp','live price gbp','live_price','live price','price','Live_Price','current_price']))}
  function fair(row){return num(cell(row,['fair_value_gbp','fair value gbp','fair_value','fair value','Fair_Value']))}
  function dps(row){
    const direct=num(cell(row,['annual_dps_gbp','annual dps gbp','annual_dps','annual dps']));
    if(direct>0)return direct;
    const p=price(row),y=yieldPct(row);return p>0&&y>0?p*y/100:0;
  }
  function evidence(row,source){
    const ticker=clean(cell(row,['ticker','Ticker','symbol','Symbol','code']));if(!ticker)return null;
    const p=price(row),y=yieldPct(row),a=dps(row),f=fair(row);
    return {ticker,source,
      name:String(cell(row,['name','Name','company','Company','company_name'])||'').trim(),
      sector:String(cell(row,['sector','Sector','industry'])||'').trim(),
      role:String(cell(row,['role','Role','squad_role','Squad_Role'])||'').trim(),
      payoutRisk:String(cell(row,['payout_risk','Payout_Risk','risk_level','risk'])||'').trim(),
      livePriceGbp:p,annualDpsGbp:a,yieldPct:y,fairValueGbp:f,
      decisionAction:String(cell(row,['decision_action','Final_Action','action'])||'').trim(),
      decisionConfidence:String(cell(row,['decision_confidence','Confidence','confidence_band'])||'').trim(),
      dataQuality:String(cell(row,['data_quality'])||'').trim()
    };
  }
  async function fetchRows(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();return Array.isArray(d)?d:[]}
  function mergeEvidence(map,next){
    const old=map.get(next.ticker)||{ticker:next.ticker,sources:[]};
    const merged={...old,...next,sources:[...new Set([...(old.sources||[]),next.source])].filter(Boolean)};
    for(const field of ['name','sector','role','payoutRisk','decisionAction','decisionConfidence','dataQuality']) if(!next[field]&&old[field])merged[field]=old[field];
    for(const field of ['livePriceGbp','annualDpsGbp','yieldPct','fairValueGbp']) if(!(next[field]>0)&&old[field]>0)merged[field]=old[field];
    map.set(next.ticker,merged);
  }
  function ensurePanel(){
    let host=$('scoutingEnrichment');if(host)return host;
    const anchor=document.querySelector('.scouting-universe-section');if(!anchor)return null;
    host=document.createElement('section');host.id='scoutingEnrichment';host.className='scout-enrichment-panel';anchor.insertAdjacentElement('afterend',host);return host;
  }
  function classify(rows){
    const pending=rows.filter(r=>r?.marketWatch&&!(num(r.livePriceGbp)>0&&num(r.yieldPct)>0));
    const priceReady=rows.filter(r=>num(r.livePriceGbp)>0).length;
    const dividendReady=rows.filter(r=>num(r.livePriceGbp)>0&&num(r.yieldPct)>0).length;
    const researched=rows.filter(r=>num(r.livePriceGbp)>0&&num(r.yieldPct)>0&&(r.sector||r.payoutRisk||r.fairValueGbp)).length;
    return{pending,priceReady,dividendReady,researched};
  }
  function render(summary){
    const A=window.AuroraClean;if(!A)return;const state=A.readState();const rows=Array.isArray(state.scouting?.candidates)?state.scouting.candidates:[];const c=classify(rows);const host=ensurePanel();if(!host)return;
    const queue=c.pending.slice(0,10);
    host.innerHTML=`<div class="scout-enrichment-head"><div><p class="eyebrow">SCOUTING ENRICHMENT DESK</p><h2>Turn Development Watch into researched candidates</h2><p>Aurora cross-checks its live intelligence feeds and upgrades Market Watch names only when real price, dividend, valuation or risk evidence exists.</p></div><span class="scout-enrichment-badge">${summary?.matched||0} EVIDENCE MATCHES</span></div><div class="scout-enrichment-grid"><article class="scout-enrichment-kpi"><span>DEVELOPMENT WATCH</span><strong>${c.pending.length.toLocaleString('en-GB')}</strong><small>still waiting for usable dividend evidence</small></article><article class="scout-enrichment-kpi"><span>PRICE READY</span><strong>${c.priceReady.toLocaleString('en-GB')}</strong><small>candidate has a real market price</small></article><article class="scout-enrichment-kpi"><span>DIVIDEND READY</span><strong>${c.dividendReady.toLocaleString('en-GB')}</strong><small>price + positive forward yield</small></article><article class="scout-enrichment-kpi"><span>RESEARCHED</span><strong>${c.researched.toLocaleString('en-GB')}</strong><small>income data plus sector/risk/valuation evidence</small></article><article class="scout-enrichment-kpi"><span>PROMOTED THIS SWEEP</span><strong>${summary?.promoted||0}</strong><small>Market Watch rows upgraded by real evidence</small></article></div><div class="scout-enrichment-actions"><button id="scoutingRunEnrichment" type="button">Run Enrichment Sweep</button><span id="scoutingEnrichmentStatus" class="scout-enrichment-status" data-state="${summary?.error?'error':summary?'ok':''}">${summary?.message||'Waiting for first enrichment sweep…'}</span></div><div class="scout-enrichment-queue"><p class="eyebrow">NEXT DEVELOPMENT WATCH</p><div class="scout-enrichment-list">${queue.length?queue.map(r=>`<div class="scout-enrichment-item"><strong>${r.ticker}</strong><span>${r.market||'Market'} · waiting for price + dividend evidence</span></div>`).join(''):'<div class="scout-enrichment-item"><strong>Queue clear</strong><span>No data-pending Market Watch rows.</span></div>'}</div></div>`;
    $('scoutingRunEnrichment')?.addEventListener('click',()=>sweep('manual'));
  }
  async function sweep(reason='auto'){
    if(running)return;const A=window.AuroraClean;if(!A)return;running=true;render(lastSummary);
    const button=$('scoutingRunEnrichment');if(button){button.disabled=true;button.textContent='Sweeping…'}
    try{
      const settled=await Promise.all(Object.entries(SOURCES).map(async([name,url])=>{try{return[name,await fetchRows(url),'']}catch(e){return[name,[],String(e?.message||e)]}}));
      const map=new Map();let sourceRows=0;settled.forEach(([name,rows])=>{sourceRows+=rows.length;rows.forEach(row=>{const e=evidence(row,name);if(e)mergeEvidence(map,e)})});
      const before=A.readState();const candidates=Array.isArray(before.scouting?.candidates)?before.scouting.candidates:[];let matched=0,promoted=0;
      const nextRows=candidates.map(row=>{
        const e=map.get(clean(row?.ticker));if(!e)return row;matched++;
        const wasPending=!!row.marketWatch&&!(num(row.livePriceGbp)>0&&num(row.yieldPct)>0);
        const next={...row};
        if(e.name&&!next.name||next.name===next.ticker)next.name=e.name||next.name;
        if(e.sector&&!next.sector)next.sector=e.sector;
        if(e.role&&!next.role)next.role=e.role;
        if(e.payoutRisk&&!next.payoutRisk||String(next.payoutRisk).toUpperCase()==='UNKNOWN')next.payoutRisk=e.payoutRisk||next.payoutRisk;
        if(e.livePriceGbp>0)next.livePriceGbp=e.livePriceGbp;
        if(e.annualDpsGbp>0)next.annualDpsGbp=e.annualDpsGbp;
        if(e.yieldPct>0)next.yieldPct=Number(e.yieldPct.toFixed(4));
        if(e.fairValueGbp>0)next.fairValueGbp=e.fairValueGbp;
        next.enrichmentSources=e.sources;next.enrichmentUpdatedAt=new Date().toISOString();
        if(e.decisionAction)next.decisionAction=e.decisionAction;if(e.decisionConfidence)next.decisionConfidence=e.decisionConfidence;if(e.dataQuality)next.dataQuality=e.dataQuality;
        const nowReady=num(next.livePriceGbp)>0&&num(next.yieldPct)>0;
        next.dataPending=!nowReady;
        if(wasPending&&nowReady)promoted++;
        return next;
      });
      A.updateState(state=>{state.scouting=state.scouting||{};state.scouting.candidates=nextRows;state.scouting.enrichment={build:BUILD,lastRunAt:new Date().toISOString(),reason,sourceRows,evidenceTickers:map.size,matched,promoted};});
      lastSummary={matched,promoted,message:`Sweep complete · ${map.size.toLocaleString('en-GB')} evidence tickers · ${matched.toLocaleString('en-GB')} matched · ${promoted} promoted`};
    }catch(e){lastSummary={matched:0,promoted:0,error:true,message:`Enrichment sweep failed · ${String(e?.message||e)}`}}
    finally{running=false;render(lastSummary)}
  }
  function boot(){if(!window.AuroraClean){setTimeout(boot,60);return}render(null);setTimeout(()=>sweep('startup'),900);window.addEventListener('aurora-clean:state',()=>{if(!running)setTimeout(()=>render(lastSummary),0)});setInterval(()=>sweep('interval'),15*60*1000);window.AuroraScoutingEnrichment=Object.freeze({BUILD,sweep,render});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();