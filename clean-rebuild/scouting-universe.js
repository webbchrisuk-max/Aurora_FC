(() => {
  'use strict';

  const BUILD = '20260925-scouting-universe-5-preserve-evidence';
  const STATE_KEY = 'aurora-clean:state:v1';
  const MASTER_URL = '../AuroraMaster.json?v=20260925-scouting-universe-3-broker-execution';
  const SHEET_ID = '1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
  const GLOBAL_SHEET_ID = '1N_kmoc9fwnwuWR1Jo0Qwi_0wF3Ifb5bTApnzlRNUSYk';
  const LIVE_FEEDS = {
    Watchlist: `https://opensheet.elk.sh/${SHEET_ID}/Watchlist`,
    'Global Watchlist': `https://opensheet.elk.sh/${GLOBAL_SHEET_ID}/Global%20Watchlist`,
    AuroraScout: `https://opensheet.elk.sh/${SHEET_ID}/AuroraScout`
  };
  const SOURCE_NAMES = ['Watchlist','Global Watchlist','AuroraScout'];

  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const upper = value => String(value || '').trim().toUpperCase().replace(/^LON:/, '').replace(/\.L$/, '');
  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function writeState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('aurora-clean:state', {detail: state}));
  }

  function cell(row, names) {
    if (!row || typeof row !== 'object') return '';
    const wanted = names.map(key);
    const found = Object.keys(row).find(k => wanted.includes(key(k)));
    return found ? row[found] : '';
  }

  function rawTicker(row) {
    return upper(cell(row,['ticker','symbol','yahoo symbol','yahoo_symbol','lse symbol','lse_symbol','epic','code']));
  }

  function rowsValue(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      for (const property of ['rows','data','values','items']) {
        if (Array.isArray(value[property])) return value[property];
      }
    }
    return [];
  }

  function readTab(master, tab) {
    const wanted = key(tab);
    const pick = obj => {
      if (!obj || typeof obj !== 'object') return [];
      const direct = rowsValue(obj[tab]);
      if (direct.length) return direct;
      const found = Object.keys(obj).find(k => key(k) === wanted);
      return found ? rowsValue(obj[found]) : [];
    };
    let rows = pick(master);
    if (rows.length) return rows;
    for (const wrapper of ['data','tabs','sheets','feeds','payload']) {
      rows = pick(master?.[wrapper]);
      if (rows.length) return rows;
    }
    return [];
  }

  function normaliseRow(row, source) {
    const ticker = rawTicker(row);
    if (!ticker) return null;
    const name = String(cell(row,['name','company','company name','company_name']) || ticker).trim();
    const liveNative = num(cell(row,['live_price_native','live price native','native price','live_price','live price','price','current price','current_price']));
    const dpsNative = num(cell(row,['annual_dps_native','annual dps native','native dps','annual_dps','annual dps','dps','annual dividend per share','dividend per share']));
    const fx = num(cell(row,['fx_rate_to_gbp','fx rate to gbp','fx']));
    const liveGbp = num(cell(row,['live_price_gbp','live price gbp','price_gbp','price gbp']));
    const dpsGbp = num(cell(row,['annual_dps_gbp','annual dps gbp','dps_gbp','dps gbp']));
    const livePrice = liveGbp > 0 ? liveGbp : (liveNative > 0 && fx > 0 ? liveNative * fx : liveNative);
    const annualDps = dpsGbp > 0 ? dpsGbp : (dpsNative > 0 && fx > 0 ? dpsNative * fx : dpsNative);
    const sheetYield = num(cell(row,['yield_pct','yield pct','yield','dividend yield','dividend_yield','forward yield','forward_yield']));
    const referenceYieldPct = livePrice > 0 && annualDps > 0 ? (annualDps / livePrice) * 100 : (sheetYield > 0 && sheetYield < 1 ? sheetYield * 100 : sheetYield);
    const brokerYieldRaw = num(cell(row,['broker_yield_pct','broker yield pct','broker_dividend_yield','broker dividend yield','ig_yield','ig dividend yield']));
    const brokerYieldPct = brokerYieldRaw > 0 && brokerYieldRaw < 1 ? brokerYieldRaw * 100 : brokerYieldRaw;
    const buyStrength = Math.max(0, Math.min(100, num(cell(row,['buy_strength','buy strength','score','watch pressure','watch_pressure']))));
    const sourceUpdatedAt = String(cell(row,['last_updated','last updated','date_checked','date checked','trade time','trade_time','generated_at']) || '').trim();
    const candidate = {
      id:`UNIVERSE-${ticker}`, ticker, name,
      sector:String(cell(row,['sector','industry']) || '').trim(),
      role:String(cell(row,['role','squad_role','squad role']) || '').trim(),
      market:String(cell(row,['market','exchange']) || '').trim(),
      currency:String(cell(row,['currency']) || '').trim(),
      payoutRisk:String(cell(row,['payout_risk','payout risk','risk']) || '').trim(),
      scoutStatus:String(cell(row,['scout_status','scout status','status']) || '').trim(),
      trialStatus:String(cell(row,['trial_status','trial status']) || '').trim(),
      trialVerdict:String(cell(row,['trial_verdict','trial verdict']) || '').trim(),
      managerNote:String(cell(row,['manager_note','manager note']) || '').trim(),
      notes:String(cell(row,['notes','note','manager_note','manager note']) || '').trim(),
      fairValueGbp:num(cell(row,['fair_value_gbp','fair value gbp','fair_value','fair value'])),
      livePriceGbp:livePrice,
      livePriceNative:liveNative,
      annualDpsGbp:annualDps,
      referenceYieldPct:Number(Math.max(0,referenceYieldPct).toFixed(4)),
      yieldPct:Number(Math.max(0,referenceYieldPct).toFixed(4)),
      brokerYieldPct:Number(Math.max(0,brokerYieldPct).toFixed(4)),
      preferredBroker:String(cell(row,['preferred_broker','preferred broker','broker','account','platform']) || '').trim(),
      executionAccount:String(cell(row,['execution_account','execution account','buy account','buy_account']) || '').trim(),
      marketSymbol:String(cell(row,['market_symbol','market symbol','chart_symbol','chart symbol','symbol']) || ticker).trim(),
      executionTicker:String(cell(row,['execution_ticker','execution ticker']) || ticker).trim(),
      executionMarket:String(cell(row,['execution_market','execution market']) || '').trim(),
      executionCurrency:String(cell(row,['execution_currency','execution currency']) || cell(row,['currency']) || '').trim(),
      brokerYieldSource:String(cell(row,['broker_yield_source','broker yield source']) || '').trim(),
      brokerSnapshotDate:String(cell(row,['broker_snapshot_date','broker snapshot date']) || '').trim(),
      brokerBuyPriceNative:num(cell(row,['broker_buy_price_native','broker buy price native','buy_price','buy price'])),
      analystPriceTargetNative:num(cell(row,['analyst_price_target_native','analyst price target native','analyst_price_target','analyst price target','price_target','price target','target_price','target price'])),
      analystPriceTargetCurrency:String(cell(row,['analyst_price_target_currency','analyst price target currency','target_currency','target currency']) || cell(row,['currency']) || '').trim(),
      analystView:String(cell(row,['analyst_view','analyst view','analyst_rating','analyst rating','consensus']) || '').trim(),
      buyStrength:Number(buyStrength.toFixed(1)),
      source,
      sourceUpdatedAt,
      approved:false,
      updatedAt:new Date().toISOString()
    };
    const profiled = window.AuroraScoutingExecutionProfiles?.resolve?.(candidate) || candidate;
    const effectiveYield = window.AuroraScoutingExecutionProfiles?.effectiveYieldPct?.(profiled) ?? profiled.yieldPct;
    return {...profiled,yieldPct:Number(Math.max(0,effectiveYield).toFixed(4))};
  }

  async function fetchJson(url) {
    const response = await fetch(url, {cache:'default'});
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.json();
  }

  function dedupeRaw(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const ticker = rawTicker(row);
      if (ticker) map.set(ticker, row);
    });
    return [...map.values()];
  }

  async function fetchPools() {
    const masterPools = Object.fromEntries(SOURCE_NAMES.map(name => [name, []]));
    const livePools = Object.fromEntries(SOURCE_NAMES.map(name => [name, []]));
    const diagnostics = {build:BUILD, primaryWorkbook:'AuroraData 2 — Consolidated', primarySheetId:SHEET_ID, master:false, live:{}, errors:{}};

    await Promise.all(Object.entries(LIVE_FEEDS).map(async ([name,url]) => {
      try {
        const rows = rowsValue(await fetchJson(url));
        livePools[name] = rows;
        diagnostics.live[name] = rows.length;
      } catch (error) {
        diagnostics.live[name] = 0;
        diagnostics.errors[name] = String(error?.message || error);
      }
    }));

    const missingLive = SOURCE_NAMES.filter(name => !(livePools[name] || []).length);
    if (missingLive.length) {
      try {
        const master = await fetchJson(MASTER_URL);
        missingLive.forEach(name => { masterPools[name] = readTab(master, name); });
        diagnostics.master = missingLive.some(name => (masterPools[name] || []).length);
      } catch (error) {
        diagnostics.errors.master = String(error?.message || error);
      }
    }

    const pools = {};
    SOURCE_NAMES.forEach(name => {
      pools[name] = dedupeRaw([...(masterPools[name] || []), ...(livePools[name] || [])]);
    });

    if (!Object.values(pools).some(rows => rows.length)) {
      throw new Error('No Aurora scouting universe source returned rows');
    }

    const liveNames = SOURCE_NAMES.filter(name => (diagnostics.live[name] || 0) > 0);
    const source = [diagnostics.master ? 'AuroraMaster baseline' : '', liveNames.length ? `live ${liveNames.join(' + ')}` : ''].filter(Boolean).join(' + ');
    return {pools, source:source || 'scouting universe', diagnostics};
  }

  function mergeUniverse(state, pools) {
    const existing = Array.isArray(state?.scouting?.candidates) ? state.scouting.candidates : [];
    const existingByTicker = new Map(existing.map(row => [upper(row?.ticker), row]));
    const merged = new Map();
    const priority = {'Global Watchlist':1,'Watchlist':2,'AuroraScout':3};
    Object.entries(pools).forEach(([source, rows]) => {
      (Array.isArray(rows) ? rows : []).forEach(raw => {
        const next = normaliseRow(raw, source);
        if (!next) return;
        const old = merged.get(next.ticker);
        if (!old) { merged.set(next.ticker, next); return; }
        const preferNext = (priority[source] || 0) >= (priority[old.source] || 0);
        const combined = preferNext ? {...old, ...next} : {...next, ...old};
        combined.yieldPct = next.yieldPct > 0 ? next.yieldPct : old.yieldPct;
        combined.livePriceGbp = next.livePriceGbp > 0 ? next.livePriceGbp : old.livePriceGbp;
        combined.annualDpsGbp = next.annualDpsGbp > 0 ? next.annualDpsGbp : old.annualDpsGbp;
        combined.fairValueGbp = next.fairValueGbp > 0 ? next.fairValueGbp : old.fairValueGbp;
        combined.buyStrength = Math.max(num(old.buyStrength), num(next.buyStrength));
        combined.payoutRisk = next.payoutRisk || old.payoutRisk || '';
        combined.sourceUpdatedAt = next.sourceUpdatedAt || old.sourceUpdatedAt || '';
        merged.set(next.ticker, combined);
      });
    });
    const universe = [...merged.values()].map(row => {
      const old=existingByTicker.get(row.ticker)||{};
      const next={...old,...row,approved:!!old.approved};
      for(const field of ['sector','role','payoutRisk','notes','scoutStatus','trialStatus','trialVerdict','managerNote','buyPermission','valuationGate','decisionAction','decisionConfidence','dataQuality','evidenceUpdatedAt','brokerYieldSource','brokerSnapshotDate','preferredBroker','executionAccount','executionTicker','executionMarket','executionCurrency','marketSymbol','analystPriceTargetCurrency','analystView']){
        if(!String(next[field]??'').trim()&&String(old[field]??'').trim())next[field]=old[field];
      }
      for(const field of ['livePriceGbp','livePriceNative','annualDpsGbp','yieldPct','referenceYieldPct','brokerYieldPct','fairValueGbp','buyStrength','brokerBuyPriceNative','analystPriceTargetNative']){
        if(!(num(row[field])>0)&&num(old[field])>0)next[field]=old[field];
      }
      if(!Array.isArray(row.enrichmentSources)&&Array.isArray(old.enrichmentSources))next.enrichmentSources=old.enrichmentSources;
      if(!row.enrichmentUpdatedAt&&old.enrichmentUpdatedAt)next.enrichmentUpdatedAt=old.enrichmentUpdatedAt;
      if(row.source!=='MARKET WATCH')next.marketWatch=false;
      return next;
    });
    const manualOrSquadOnly = existing.filter(row => {
      const ticker = upper(row?.ticker);
      return ticker && !merged.has(ticker) && ['MANUAL','SQUAD'].includes(String(row?.source || '').toUpperCase());
    });
    return [...universe, ...manualOrSquadOnly];
  }

  function setStatus(text, error=false) {
    const el = document.getElementById('scoutingUniverseStatus');
    if (!el) return;
    el.textContent = text;
    el.dataset.state = error ? 'error' : 'ok';
  }

  async function refresh() {
    const button = document.getElementById('scoutingRefreshUniverse');
    if (button) { button.disabled = true; button.textContent = 'Loading Universe…'; }
    setStatus('Loading AuroraData 2 live scouting feeds plus AuroraMaster fallback…');
    try {
      const {pools, source, diagnostics} = await fetchPools();
      const state = readState();
      state.scouting = state.scouting && typeof state.scouting === 'object' ? state.scouting : {};
      state.scouting.candidates = mergeUniverse(state, pools);
      state.scouting.universeLoadedAt = new Date().toISOString();
      state.scouting.universeSource = source;
      state.scouting.universeDiagnostics = diagnostics;
      state.scouting.universeCounts = {
        watchlist:pools.Watchlist?.length || 0,
        global:pools['Global Watchlist']?.length || 0,
        scout:pools.AuroraScout?.length || 0,
        marketWatch:Number(state.scouting?.universeCounts?.marketWatch || 0)
      };
      writeState(state);
      const unique = new Set(state.scouting.candidates.map(row => upper(row?.ticker)).filter(Boolean)).size;
      const counts = state.scouting.universeCounts;
      const globalLive = diagnostics.live['Global Watchlist'] || 0;
      setStatus(`AuroraData 2 live · ${unique} unique candidates · Watchlist ${counts.watchlist} · Global ${counts.global} (${globalLive} live) · Scout ${counts.scout}`);
    } catch (error) {
      console.error('[Aurora Clean Scouting Universe]', error);
      setStatus(`Universe load failed: ${String(error?.message || error)}`, true);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Refresh Aurora Universe'; }
    }
  }

  function boot() {
    document.getElementById('scoutingRefreshUniverse')?.addEventListener('click', refresh);
    refresh();
    window.AuroraScoutingUniverse = Object.freeze({BUILD,refresh,fetchPools,SHEET_ID});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();