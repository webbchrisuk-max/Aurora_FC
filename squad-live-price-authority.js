(() => {
  'use strict';

  const BUILD = '20260825-squad-live-price-authority-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const MASTER_URL = 'AuroraMaster.json';
  const FALLBACK_AS_OF = '2026-08-25T18:32:00+01:00';
  const CLOSED = new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  const REFRESH_MS = 5 * 60 * 1000;

  if (window.__AuroraSquadLivePriceAuthority === BUILD) return;
  window.__AuroraSquadLivePriceAuthority = BUILD;

  const FALLBACK = Object.freeze({
    RGL:0.96,
    ARCC:14.606838,
    FSFL:0.71,
    UKW:1.104,
    TW:0.849,
    PHP:0.9705,
    FGEN:0.917,
    SUPR:0.8525,
    TSCO:4.634,
    VWRA:142.51199625,
    IITU:36.62,
    TRIG:0.766,
    SBRY:3.351,
    LMP:1.945,
    HICL:1.4001,
    AV:7.302,
    BATS:41.33,
    LAND:6.945,
    GCP:0.8154,
    IMB:25.1786
  });

  const num = value => {
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const upper = value => String(value || '').trim().toUpperCase();
  const ticker = value => upper(value).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const arr = value => Array.isArray(value) ? value : [];

  let lastRefreshAt = null;
  let lastSource = 'FALLBACK';
  let lastUpdated = 0;
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
    const status = upper(row?.status || 'ACTIVE');
    return !CLOSED.has(status) && num(row?.shares) > 0;
  }

  function normaliseLiveRows(rows) {
    const map = new Map();
    arr(rows).forEach(row => {
      if (!row || typeof row !== 'object') return;
      const tk = ticker(row.Symbol ?? row.symbol ?? row.ticker ?? row.google_symbol);
      const price = num(row.Price ?? row.price ?? row.livePriceGbp ?? row.live_price_gbp ?? row.native_price);
      if (!tk || !(price > 0)) return;
      map.set(tk, price);
    });
    return map;
  }

  function masterTimestamp(master) {
    const raw = master?.meta?.generated_at || master?.meta?.updated_at || master?.generatedAt || '';
    const time = Date.parse(raw);
    return Number.isFinite(time) ? time : 0;
  }

  async function readExportedLivePrices() {
    try {
      const response = await fetch(`${MASTER_URL}?v=${Date.now()}`, {cache:'no-store'});
      if (!response.ok) throw new Error(`AuroraMaster ${response.status}`);
      const master = await response.json();
      const rows = master?.LivePrices || master?.livePrices || master?.LIVE_PRICES || [];
      const map = normaliseLiveRows(rows);
      return {map, timestamp:masterTimestamp(master)};
    } catch (_) {
      return {map:new Map(), timestamp:0};
    }
  }

  function fallbackMap() {
    return new Map(Object.entries(FALLBACK));
  }

  async function latestPriceMap() {
    const exported = await readExportedLivePrices();
    const fallbackTime = Date.parse(FALLBACK_AS_OF) || 0;
    if (exported.map.size && exported.timestamp >= fallbackTime) {
      lastSource = 'AURORADATA2_EXPORT_LIVEPRICES';
      return exported.map;
    }
    lastSource = 'AURORADATA2_LIVEPRICES_VERIFIED_FALLBACK';
    return fallbackMap();
  }

  function patchHolding(row, prices, stamp) {
    if (!activeHolding(row)) return row;
    const tk = ticker(row?.ticker);
    const price = num(prices.get(tk));
    if (!(price > 0)) return row;

    const oldPrice = num(row?.livePriceGbp ?? row?.priceGbp ?? row?.live_price_gbp);
    const shares = Math.max(0, num(row?.shares));
    const book = Math.max(0, num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp));
    const marketValue = Number((shares * price).toFixed(8));
    const profitLoss = Number((marketValue - book).toFixed(8));
    const oldValue = num(row?.marketValueGbp ?? row?.currentValueGbp ?? row?.market_value_gbp);

    if (Math.abs(oldPrice - price) < 0.0000001 && Math.abs(oldValue - marketValue) < 0.005) return row;

    return {
      ...row,
      livePriceGbp: price,
      priceGbp: price,
      live_price_gbp: price,
      marketValueGbp: marketValue,
      currentValueGbp: marketValue,
      market_value_gbp: marketValue,
      profitLossGbp: profitLoss,
      priceSource: lastSource,
      priceUpdatedAt: stamp
    };
  }

  function writeState(prices) {
    const current = readState();
    const holdings = arr(current?.squad?.holdings);
    if (!current || !holdings.length || !prices.size) return 0;

    const stamp = new Date().toISOString();
    let changed = 0;
    const nextHoldings = holdings.map(row => {
      const next = patchHolding(row, prices, stamp);
      if (next !== row) changed += 1;
      return next;
    });
    if (!changed) return 0;

    const mutate = state => ({
      ...state,
      squad:{
        ...(state?.squad || {}),
        holdings:nextHoldings,
        priceSource:lastSource,
        priceUpdatedAt:stamp
      }
    });

    try {
      if (window.Aurora2?.core?.update) {
        window.Aurora2.core.update(mutate);
      } else {
        const next = mutate(current);
        localStorage.setItem(BACKUP_KEY, JSON.stringify(current));
        localStorage.setItem(STATE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('aurora2:state', {detail:{source:'squad-live-price-authority',build:BUILD}}));
      }
    } catch (error) {
      console.error('[Aurora Squad Live Price Authority] state update failed', error);
      return 0;
    }

    lastUpdated = changed;
    return changed;
  }

  async function refresh(reason = 'manual') {
    if (refreshing) return window.AuroraSquadLivePriceAuthority;
    refreshing = true;
    try {
      const prices = await latestPriceMap();
      const changed = writeState(prices);
      lastRefreshAt = new Date().toISOString();
      window.AuroraSquadLivePriceAuthority = Object.freeze({
        build:BUILD,
        ready:true,
        source:lastSource,
        asOf:lastRefreshAt,
        changed,
        priceCount:prices.size,
        refresh
      });
      document.documentElement.dataset.squadLivePriceAuthority = 'ready';
      document.documentElement.dataset.squadLivePriceSource = lastSource;
      window.dispatchEvent(new CustomEvent('aurora:squad-live-prices', {detail:{build:BUILD,reason,source:lastSource,changed,priceCount:prices.size}}));
      return window.AuroraSquadLivePriceAuthority;
    } finally {
      refreshing = false;
    }
  }

  function boot() {
    refresh('startup');
    setTimeout(() => refresh('startup-late'), 1200);
    setInterval(() => refresh('interval'), REFRESH_MS);
    window.addEventListener('pageshow', () => refresh('pageshow'));
    window.addEventListener('focus', () => refresh('focus'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh('visible');
    });
  }

  window.AuroraSquadLivePriceAuthority = Object.freeze({build:BUILD,ready:false,source:lastSource,asOf:lastRefreshAt,changed:lastUpdated,priceCount:0,refresh});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
