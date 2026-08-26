(() => {
  'use strict';

  const STATE_KEY = 'aurora-clean:state:v1';
  const MASTER_URL = 'https://script.google.com/macros/s/AKfycbzR9kEguzDL5ICF4xn3nHBLyE0ELv_ZSgn46vld54V7KZt6CRsFU_mNzx0AQd1qXPei/exec';
  const SHEET_ID = '10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
  const FALLBACK = {
    Watchlist: `https://opensheet.elk.sh/${SHEET_ID}/Watchlist`,
    'Global Watchlist': `https://opensheet.elk.sh/${SHEET_ID}/Global%20Watchlist`,
    AuroraScout: `https://opensheet.elk.sh/${SHEET_ID}/AuroraScout`
  };

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

  function readTab(master, tab) {
    const wanted = key(tab);
    const pick = obj => {
      if (!obj || typeof obj !== 'object') return [];
      if (Array.isArray(obj[tab])) return obj[tab];
      const found = Object.keys(obj).find(k => key(k) === wanted);
      return found && Array.isArray(obj[found]) ? obj[found] : [];
    };
    let rows = pick(master);
    if (rows.length) return rows;
    for (const wrapper of ['data','tabs','sheets','feeds']) {
      rows = pick(master?.[wrapper]);
      if (rows.length) return rows;
    }
    return [];
  }

  function normaliseRow(row, source) {
    const ticker = upper(cell(row,['ticker','symbol']));
    if (!ticker) return null;

    const name = String(cell(row,['name','company']) || ticker).trim();
    const liveNative = num(cell(row,['live_price_native','live price native','native price','live_price','live price','price']));
    const dpsNative = num(cell(row,['annual_dps_native','annual dps native','native dps','annual_dps','annual dps','dps','annual dividend per share']));
    const fx = num(cell(row,['fx_rate_to_gbp','fx rate to gbp','fx']));
    const liveGbp = num(cell(row,['live_price_gbp','live price gbp','price_gbp']));
    const dpsGbp = num(cell(row,['annual_dps_gbp','annual dps gbp','dps_gbp']));
    const livePrice = liveGbp > 0 ? liveGbp : (liveNative > 0 && fx > 0 ? liveNative * fx : liveNative);
    const annualDps = dpsGbp > 0 ? dpsGbp : (dpsNative > 0 && fx > 0 ? dpsNative * fx : dpsNative);
    const sheetYield = num(cell(row,['yield_pct','yield pct','yield','dividend yield']));
    const yieldPct = livePrice > 0 && annualDps > 0 ? (annualDps / livePrice) * 100 : (sheetYield > 0 && sheetYield < 1 ? sheetYield * 100 : sheetYield);
    const buyStrength = Math.max(0, Math.min(100, num(cell(row,['buy_strength','buy strength','score','watch pressure']))));

    if (!(yieldPct > 0 || buyStrength > 0 || livePrice > 0)) return null;

    return {
      id: `UNIVERSE-${ticker}`,
      ticker,
      name,
      sector: String(cell(row,['sector']) || '').trim(),
      role: String(cell(row,['role']) || '').trim(),
      market: String(cell(row,['market']) || '').trim(),
      currency: String(cell(row,['currency']) || '').trim(),
      payoutRisk: String(cell(row,['payout_risk','payout risk']) || '').trim(),
      notes: String(cell(row,['notes']) || '').trim(),
      fairValueGbp: num(cell(row,['fair_value_gbp','fair value gbp','fair_value','fair value'])),
      livePriceGbp: livePrice,
      annualDpsGbp: annualDps,
      yieldPct: Number(Math.max(0,yieldPct).toFixed(4)),
      buyStrength: Number(buyStrength.toFixed(1)),
      source,
      approved: false,
      updatedAt: new Date().toISOString()
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function fetchPools() {
    try {
      const master = await fetchJson(MASTER_URL);
      const pools = {
        Watchlist: readTab(master,'Watchlist'),
        'Global Watchlist': readTab(master,'Global Watchlist'),
        AuroraScout: readTab(master,'AuroraScout')
      };
      if (Object.values(pools).some(rows => rows.length)) return {pools, source:'Aurora master feed'};
      throw new Error('Master feed contained no scouting universe tabs');
    } catch (masterError) {
      const entries = await Promise.all(Object.entries(FALLBACK).map(async ([name,url]) => {
        try { return [name, await fetchJson(url)]; }
        catch (_) { return [name, []]; }
      }));
      const pools = Object.fromEntries(entries);
      if (Object.values(pools).some(rows => rows.length)) return {pools, source:'Aurora OpenSheet fallback'};
      throw masterError;
    }
  }

  function mergeUniverse(state, pools) {
    const existing = Array.isArray(state?.scouting?.candidates) ? state.scouting.candidates : [];
    const existingByTicker = new Map(existing.map(row => [upper(row?.ticker), row]));
    const merged = new Map();

    const priority = {'Watchlist':1,'Global Watchlist':2,'AuroraScout':3};
    Object.entries(pools).forEach(([source, rows]) => {
      (Array.isArray(rows) ? rows : []).forEach(raw => {
        const next = normaliseRow(raw, source);
        if (!next) return;
        const old = merged.get(next.ticker);
        if (!old || priority[source] >= priority[old.source]) merged.set(next.ticker, {...old, ...next});
      });
    });

    const universe = [...merged.values()].map(row => {
      const old = existingByTicker.get(row.ticker);
      return {...row, approved: !!old?.approved};
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
    setStatus('Loading Watchlist, Global Watchlist and AuroraScout…');

    try {
      const {pools, source} = await fetchPools();
      const state = readState();
      state.scouting = state.scouting && typeof state.scouting === 'object' ? state.scouting : {};
      state.scouting.candidates = mergeUniverse(state, pools);
      state.scouting.universeLoadedAt = new Date().toISOString();
      state.scouting.universeSource = source;
      state.scouting.universeCounts = {
        watchlist: pools.Watchlist?.length || 0,
        global: pools['Global Watchlist']?.length || 0,
        scout: pools.AuroraScout?.length || 0
      };
      writeState(state);
      const unique = new Set(state.scouting.candidates.map(row => upper(row?.ticker)).filter(Boolean)).size;
      setStatus(`Loaded ${unique} unique candidates · ${source}`);
    } catch (error) {
      console.error('[Aurora Clean Scouting Universe]', error);
      setStatus(`Universe load failed: ${String(error?.message || error)}`, true);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Refresh Aurora Universe'; }
    }
  }

  function boot() {
    const button = document.getElementById('scoutingRefreshUniverse');
    button?.addEventListener('click', refresh);
    refresh();
    window.AuroraScoutingUniverse = Object.freeze({refresh});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();