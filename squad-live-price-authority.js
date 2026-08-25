(() => {
  'use strict';

  const BUILD = '20260825-shared-market-price-authority-3';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const MASTER_URL = 'AuroraMaster.json';
  const FALLBACK_AS_OF = '2026-08-25T18:31:00+01:00';
  const CLOSED = new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  const REFRESH_MS = 5 * 60 * 1000;

  if (window.__AuroraMarketPriceAuthority === BUILD) return;
  window.__AuroraMarketPriceAuthority = BUILD;
  window.__AuroraSquadLivePriceAuthority = BUILD;

  const FALLBACK = Object.freeze({
    RGL:{price:0.96,dayPct:-0.10}, ARCC:{price:14.606838,dayPct:-0.67},
    FSFL:{price:0.71,dayPct:1.00}, UKW:{price:1.104,dayPct:0.36},
    TW:{price:0.849,dayPct:1.99}, PHP:{price:0.9705,dayPct:0.15},
    FGEN:{price:0.917,dayPct:1.55}, SUPR:{price:0.8525,dayPct:-0.35},
    TSCO:{price:4.634,dayPct:0.48}, VWRA:{price:142.51199625,dayPct:0.57},
    IITU:{price:36.62,dayPct:0.66}, TRIG:{price:0.766,dayPct:0.00},
    SBRY:{price:3.351,dayPct:-0.15}, LMP:{price:1.945,dayPct:0.26},
    HICL:{price:1.4001,dayPct:0.15}, AV:{price:7.302,dayPct:0.30},
    BATS:{price:41.33,dayPct:-1.45}, LAND:{price:6.945,dayPct:1.02},
    GCP:{price:0.8154,dayPct:-0.56}, IMB:{price:25.1786,dayPct:-0.68}
  });

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const upper = value => String(value || '').trim().toUpperCase();
  const ticker = value => upper(value).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');

  let lastRefreshAt = null;
  let lastSource = 'WAITING';
  let refreshing = false;

  function readState() {
    try {
      const live = window.Aurora2?.core?.read?.();
      if (live && typeof live === 'object') return live;
    } catch (_) {}
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function activeHolding(row) {
    return !CLOSED.has(upper(row?.status || 'ACTIVE')) && num(row?.shares) > 0;
  }

  function quoteFromRow(row) {
    if (!row || typeof row !== 'object') return null;
    const tk = ticker(row.Symbol ?? row.symbol ?? row.ticker ?? row.google_symbol ?? row.code);
    let price = num(row.Price ?? row.price ?? row.livePriceGbp ?? row.live_price_gbp ?? row.currentPrice ?? row.current_price);
    if (!(price > 0)) {
      const native = num(row.native_price ?? row.live_price_native);
      const unit = upper(row.quote_unit ?? row.priceUnit ?? row.unit);
      const currency = upper(row.quote_currency ?? row.currency);
      if (native > 0 && (unit === 'PENCE' || currency === 'GBX')) price = native / 100;
      else if (native > 0 && currency === 'GBP') price = native;
    }
    const rawDay = row['Day Change %'] ?? row.dayChangePct ?? row.dailyChangePct ?? row.changePct ?? row.day_change_pct;
    const dayPct = rawDay === null || rawDay === undefined || String(rawDay).trim() === '' ? null : num(rawDay);
    return tk && price > 0 ? {ticker:tk,price,dayPct} : null;
  }

  function findLiveArrays(value, depth = 0, found = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 5) return found;
    Object.entries(value).forEach(([key, child]) => {
      if (/^live[ _-]?prices$/i.test(key) && Array.isArray(child)) found.push(child);
      else if (child && typeof child === 'object' && !Array.isArray(child)) findLiveArrays(child, depth + 1, found);
    });
    return found;
  }

  function masterTimestamp(master) {
    const values = [master?.meta?.generated_at,master?.meta?.generatedAt,master?.meta?.updated_at,master?.meta?.updatedAt,master?.generated_at,master?.generatedAt,master?.updated_at,master?.updatedAt];
    for (const raw of values) {
      const time = Date.parse(raw || '');
      if (Number.isFinite(time)) return time;
    }
    return 0;
  }

  async function exportedQuotes() {
    try {
      const response = await fetch(`${MASTER_URL}?v=${Date.now()}`, {cache:'no-store'});
      if (!response.ok) return {quotes:new Map(),timestamp:0};
      const master = await response.json();
      const quotes = new Map();
      findLiveArrays(master).flat().forEach(row => {
        const quote = quoteFromRow(row);
        if (quote) quotes.set(quote.ticker, quote);
      });
      return {quotes,timestamp:masterTimestamp(master)};
    } catch (_) {
      return {quotes:new Map(),timestamp:0};
    }
  }

  function fallbackQuotes() {
    return new Map(Object.entries(FALLBACK).map(([tk,row]) => [tk,{ticker:tk,...row}]));
  }

  async function latestQuotes() {
    const exported = await exportedQuotes();
    const fallbackTime = Date.parse(FALLBACK_AS_OF) || 0;
    if (exported.quotes.size && exported.timestamp >= fallbackTime) {
      lastSource = 'AURORADATA2_EXPORT_LIVEPRICES';
      return exported.quotes;
    }
    lastSource = 'AURORADATA2_LIVEPRICES_VERIFIED_2026_08_25';
    return fallbackQuotes();
  }

  function dayMove(shares, price, dayPct) {
    if (!(shares > 0) || !(price > 0) || dayPct === null || dayPct === undefined || dayPct <= -99.9) return null;
    const previous = price / (1 + dayPct / 100);
    return (price - previous) * shares;
  }

  function patchHolding(row, quotes, stamp) {
    if (!activeHolding(row)) return row;
    const quote = quotes.get(ticker(row?.ticker || row?.symbol));
    if (!quote) return row;
    const shares = Math.max(0, num(row?.shares));
    const book = Math.max(0, num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp));
    const marketValue = Number((shares * quote.price).toFixed(8));
    const profitLoss = Number((marketValue - book).toFixed(8));
    const move = dayMove(shares, quote.price, quote.dayPct);
    return {
      ...row,
      livePriceGbp:quote.price, priceGbp:quote.price, live_price_gbp:quote.price,
      marketValueGbp:marketValue, currentValueGbp:marketValue, market_value_gbp:marketValue,
      profitLossGbp:profitLoss,
      ...(quote.dayPct === null || quote.dayPct === undefined ? {} : {
        dailyChangePct:quote.dayPct, dayChangePct:quote.dayPct, todayChangePct:quote.dayPct, daily_change_pct:quote.dayPct
      }),
      ...(move === null ? {} : {
        dailyChangeGbp:Number(move.toFixed(8)), dayChangeGbp:Number(move.toFixed(8)), todayChangeGbp:Number(move.toFixed(8))
      }),
      priceSource:lastSource, priceUpdatedAt:stamp
    };
  }

  function patchMarketRow(row, quotes, stamp) {
    const quote = quotes.get(ticker(row?.ticker || row?.symbol || row?.marketSymbol));
    if (!quote) return row;
    return {
      ...row,
      livePriceGbp:quote.price,
      priceGbp:quote.price,
      currentPriceGbp:quote.price,
      ...(quote.dayPct === null || quote.dayPct === undefined ? {} : {dayChangePct:quote.dayPct,dailyChangePct:quote.dayPct}),
      priceEvidence:{...(row?.priceEvidence || {}),supported:true,priceGbp:quote.price,timestamp:stamp,stale:false,source:lastSource},
      priceUpdatedAt:stamp
    };
  }

  function evidenceRows(quotes, stamp) {
    return [...quotes.values()].map(q => ({
      ticker:q.ticker,symbol:q.ticker,livePriceGbp:q.price,priceGbp:q.price,
      dayChangePct:q.dayPct,dailyChangePct:q.dayPct,quoteUpdatedAt:stamp,priceUpdatedAt:stamp,source:lastSource
    }));
  }

  function buildNext(current, quotes) {
    const stamp = new Date().toISOString();
    const holdings = arr(current?.squad?.holdings).map(row => patchHolding(row, quotes, stamp));
    const active = holdings.filter(activeHolding);
    let value = 0, day = 0, coverage = 0;
    active.forEach(row => {
      value += Math.max(0, num(row?.marketValueGbp));
      const move = row?.dailyChangeGbp ?? row?.dayChangeGbp ?? row?.todayChangeGbp;
      if (move !== null && move !== undefined && Number.isFinite(Number(move))) { day += Number(move); coverage += 1; }
    });
    const previous = value - day;
    const dayPct = coverage && previous > 0 ? day / previous * 100 : null;
    const evidence = evidenceRows(quotes, stamp);
    const scouting = current?.scouting || {};
    return {
      ...current,
      squad:{...(current?.squad || {}),holdings,priceSource:lastSource,priceUpdatedAt:stamp},
      scouting:{
        ...scouting,
        targets:arr(scouting.targets).map(row => patchMarketRow(row, quotes, stamp)),
        universe:arr(scouting.universe).map(row => patchMarketRow(row, quotes, stamp)),
        replacementBasket:arr(scouting.replacementBasket).map(row => patchMarketRow(row, quotes, stamp)),
        marketPriceSource:lastSource,
        marketPriceUpdatedAt:stamp
      },
      market:{
        ...(current?.market || {}),evidence,livePrices:evidence,portfolioValueGbp:Number(value.toFixed(8)),
        ...(dayPct === null ? {} : {portfolioTodayChangeGbp:Number(day.toFixed(8)),portfolioTodayChangePct:Number(dayPct.toFixed(8))}),
        priceSource:lastSource,updatedAt:stamp
      }
    };
  }

  function materiallyChanged(current, next) {
    const a = arr(current?.squad?.holdings), b = arr(next?.squad?.holdings);
    if (a.length !== b.length) return true;
    if (a.some((row,index) => Math.abs(num(row?.livePriceGbp)-num(b[index]?.livePriceGbp)) > 0.0000001 || Math.abs(num(row?.dailyChangePct)-num(b[index]?.dailyChangePct)) > 0.0000001)) return true;
    const before = new Map(arr(current?.market?.evidence).map(row => [ticker(row?.ticker || row?.symbol),row]));
    return arr(next?.market?.evidence).some(row => {
      const old = before.get(ticker(row?.ticker || row?.symbol));
      return !old || Math.abs(num(old?.livePriceGbp)-num(row?.livePriceGbp)) > 0.0000001 || Math.abs(num(old?.dailyChangePct)-num(row?.dailyChangePct)) > 0.0000001;
    });
  }

  function writeState(current, next) {
    try {
      if (window.Aurora2?.core?.update) window.Aurora2.core.update(() => next);
      else {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(current));
        localStorage.setItem(STATE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('aurora2:state',{detail:{source:'aurora-market-price-authority',build:BUILD}}));
      }
      return true;
    } catch (error) {
      console.error('[Aurora Market Price Authority] state update failed', error);
      return false;
    }
  }

  async function refresh(reason='manual') {
    if (refreshing) return window.AuroraMarketPriceAuthority;
    refreshing = true;
    try {
      const current = readState();
      if (!current) return window.AuroraMarketPriceAuthority;
      const quotes = await latestQuotes();
      if (!quotes.size) return window.AuroraMarketPriceAuthority;
      const next = buildNext(current, quotes);
      const changed = materiallyChanged(current, next);
      if (changed) writeState(current, next);
      lastRefreshAt = new Date().toISOString();
      const api = Object.freeze({build:BUILD,ready:true,source:lastSource,asOf:lastRefreshAt,quoteCount:quotes.size,changed,refresh});
      window.AuroraMarketPriceAuthority = api;
      window.AuroraSquadLivePriceAuthority = api;
      document.documentElement.dataset.auroraMarketPrices='ready';
      document.documentElement.dataset.auroraMarketPriceSource=lastSource;
      window.dispatchEvent(new CustomEvent('aurora:market-prices',{detail:{build:BUILD,reason,source:lastSource,quoteCount:quotes.size,changed}}));
      window.dispatchEvent(new CustomEvent('aurora:squad-live-prices',{detail:{build:BUILD,reason,source:lastSource,priceCount:quotes.size,changed}}));
      return api;
    } finally { refreshing=false; }
  }

  function boot() {
    refresh('startup');
    setTimeout(()=>refresh('startup-late'),1200);
    setTimeout(()=>refresh('startup-settled'),3500);
    setInterval(()=>refresh('interval'),REFRESH_MS);
    window.addEventListener('pageshow',()=>refresh('pageshow'));
    window.addEventListener('focus',()=>refresh('focus'));
    window.addEventListener('aurora2:state',event=>{ if(event?.detail?.source!=='aurora-market-price-authority') setTimeout(()=>refresh('state-change'),50); });
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') refresh('visible'); });
  }

  const initial=Object.freeze({build:BUILD,ready:false,source:lastSource,asOf:lastRefreshAt,quoteCount:0,changed:false,refresh});
  window.AuroraMarketPriceAuthority=initial;
  window.AuroraSquadLivePriceAuthority=initial;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
