(() => {
  'use strict';

  const BUILD='20260925-scouting-execution-profile-1';
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'');

  // Explicit execution intelligence can live here without contaminating the generic
  // scouting/ranking engine. Source data wins when a newer broker-specific field exists.
  const PROFILES=Object.freeze({
    FMG:Object.freeze({
      preferredBroker:'IG',
      executionAccount:'IG ISA',
      marketSymbol:'FMG',
      executionTicker:'FMG',
      executionMarket:'ASX',
      executionCurrency:'AUD',
      brokerLocked:true,
      brokerYieldPct:6.597,
      brokerYieldSource:'IG ISA',
      brokerSnapshotDate:'2026-09-25',
      brokerBuyPriceNative:16.370,
      analystPriceTargetNative:17.76,
      analystPriceTargetCurrency:'AUD',
      analystView:'2 Underperform'
    })
  });

  function ticker(row){return upper(row?.underlyingTicker||row?.ticker||row?.marketSymbol||row)}
  function brokerCode(row){
    const t=ticker(row),profile=PROFILES[t]||{};
    const raw=upper(row?.preferredBroker||row?.executionAccount||row?.account||row?.broker||row?.platform||profile.preferredBroker||profile.executionAccount);
    if(raw.includes('212'))return'T212';
    if(raw.includes('IG'))return'IG';
    return'';
  }
  function accountLabel(row){
    const code=brokerCode(row);
    return code==='IG'?'IG ISA':code==='T212'?'Trading 212 ISA':'Broker review';
  }
  function resolve(row={}){
    const t=ticker(row),profile=PROFILES[t]||{};
    const sourceBrokerYield=num(row?.brokerYieldPct);
    const sourceTarget=num(row?.analystPriceTargetNative);
    const sourceBuy=num(row?.brokerBuyPriceNative);
    const resolved={
      ...row,
      preferredBroker:row?.preferredBroker||profile.preferredBroker||'',
      executionAccount:row?.executionAccount||profile.executionAccount||'',
      marketSymbol:row?.marketSymbol||profile.marketSymbol||t,
      executionTicker:row?.executionTicker||profile.executionTicker||t,
      executionMarket:row?.executionMarket||profile.executionMarket||'',
      executionCurrency:row?.executionCurrency||profile.executionCurrency||row?.currency||'',
      brokerLocked:row?.brokerLocked===true||profile.brokerLocked===true,
      brokerYieldPct:sourceBrokerYield>0?sourceBrokerYield:num(profile.brokerYieldPct),
      brokerYieldSource:row?.brokerYieldSource||profile.brokerYieldSource||'',
      brokerSnapshotDate:row?.brokerSnapshotDate||profile.brokerSnapshotDate||'',
      brokerBuyPriceNative:sourceBuy>0?sourceBuy:num(profile.brokerBuyPriceNative),
      analystPriceTargetNative:sourceTarget>0?sourceTarget:num(profile.analystPriceTargetNative),
      analystPriceTargetCurrency:row?.analystPriceTargetCurrency||profile.analystPriceTargetCurrency||row?.currency||'',
      analystView:row?.analystView||profile.analystView||''
    };
    if(!resolved.executionAccount&&brokerCode(resolved))resolved.executionAccount=accountLabel(resolved);
    return resolved;
  }
  function effectiveYieldPct(row){
    const resolved=resolve(row);
    const brokerYield=num(resolved.brokerYieldPct);
    return brokerYield>0?brokerYield:Math.max(0,num(resolved.yieldPct));
  }
  function isBrokerLocked(row){return resolve(row).brokerLocked===true}
  function profileFor(value){return PROFILES[upper(value)]||null}

  window.AuroraScoutingExecutionProfiles=Object.freeze({
    BUILD,PROFILES,resolve,effectiveYieldPct,brokerCode,accountLabel,isBrokerLocked,profileFor
  });
})();