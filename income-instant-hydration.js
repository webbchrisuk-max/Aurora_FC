(() => {
  'use strict';

  const BUILD = '20260822-income-instant-hydration-1';
  const CACHE_PREFIX = 'aurora2:income:backend-read-cache:v1:';
  const LOCAL_CALENDAR_KEY = 'aurora2:income:calendar-local:v1';
  const HYDRATION_SOURCE = 'INSTANT_HYDRATION_CACHE';
  const READ_ACTIONS = new Set(['incomeSnapshot', 'brokerCashSnapshot', 'dividendEngineStatus']);
  const RECENT_LIVE_MS = 8000;

  const client = window.AuroraData2Client;
  if (!client || typeof client.post !== 'function' || window.__auroraIncomeInstantHydration) return;
  window.__auroraIncomeInstantHydration = BUILD;

  const originalPost = client.post.bind(client);
  const inflight = new Map();
  const recent = new Map();
  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(num(value));

  function readCache(action) {
    try {
      const wrapped = JSON.parse(localStorage.getItem(CACHE_PREFIX + action) || 'null');
      return wrapped?.data ? wrapped : null;
    } catch (_) { return null; }
  }

  function readLocalCalendar() {
    try { return arr(JSON.parse(localStorage.getItem(LOCAL_CALENDAR_KEY) || '[]')); }
    catch (_) { return []; }
  }

  function eventId(row, index) {
    const direct = String(row?.id || row?.dividendId || row?.dividend_id || '').trim();
    if (direct) return direct;
    const account = String(row?.account || '').trim().toUpperCase();
    const ticker = String(row?.ticker || '').trim().toUpperCase();
    const pay = String(row?.payDate || row?.pay_date || '').slice(0, 10);
    return account && ticker && pay ? `HYDRATE-${account}-${ticker}-${pay}` : `HYDRATE-${index}`;
  }

  function installCalendarMirror(snapshot) {
    const backendRows = arr(snapshot?.dividends);
    if (!backendRows.length) return 0;
    try {
      const existing = readLocalCalendar().filter(row => String(row?.source || '') !== HYDRATION_SOURCE);
      const hydrationRows = backendRows.map((row, index) => ({
        ...row,
        id: eventId(row, index),
        source: HYDRATION_SOURCE,
        _auroraHydration: true,
        _auroraHydratedAt: new Date().toISOString()
      }));
      const backendIds = new Set(hydrationRows.map(row => String(row.id || '')).filter(Boolean));
      const kept = existing.filter(row => !backendIds.has(String(row?.id || '')));
      localStorage.setItem(LOCAL_CALENDAR_KEY, JSON.stringify([...hydrationRows, ...kept].slice(0, 400)));
      return hydrationRows.length;
    } catch (_) { return 0; }
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function paintCash(snapshot, source = 'CACHE') {
    if (!snapshot?.balances) return;
    setText('cashBalanceIG', money(snapshot.balances.IG));
    setText('cashBalanceT212', money(snapshot.balances.T212));
    setText('cashBackendStatus', source === 'LIVE' ? 'CONNECTED' : 'VERIFYING');
    const note = document.getElementById('cashNote');
    if (note && source !== 'LIVE') note.textContent = 'Showing the last verified broker cash position while AuroraData 2 confirms the live snapshot.';
  }

  function engineTime(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function paintEngine(snapshot, source = 'CACHE') {
    if (!snapshot || snapshot.ok === false) return;
    const installed = Boolean(snapshot.installed);
    const last = snapshot.lastSummary || {};
    const alpha = snapshot.alphaVantage || {};
    setText('engineBadge', source === 'LIVE' ? (installed ? 'AUTO ON' : 'AUTO OFF') : 'VERIFYING');
    setText('engineAuto', installed ? 'Nightly' : 'Off');
    setText('engineAlpha', alpha.configured ? 'CONNECTED' : 'NOT SET');
    setText('engineReview', String(num(snapshot.openReviewCount)));
    setText('engineLast', engineTime(last.finishedAt || last.completedAt || snapshot.lastRunAt));
  }

  function paintCachedUi() {
    const cash = readCache('brokerCashSnapshot');
    if (cash?.data) paintCash(cash.data, 'CACHE');
    const engine = readCache('dividendEngineStatus');
    if (engine?.data) paintEngine(engine.data, 'CACHE');
  }

  function dispatch(action, result, source) {
    window.dispatchEvent(new CustomEvent('aurora:income-instant-hydration', {
      detail: { build: BUILD, action, result, source, at: new Date().toISOString() }
    }));
  }

  function remember(action, result, source = 'LIVE') {
    recent.set(action, { at: Date.now(), result });
    if (action === 'incomeSnapshot') installCalendarMirror(result);
    if (action === 'brokerCashSnapshot') paintCash(result, source);
    if (action === 'dividendEngineStatus') paintEngine(result, source);
    dispatch(action, result, source);
    return result;
  }

  function acceleratedRead(action, payload = {}) {
    const cachedRecent = recent.get(action);
    if (cachedRecent && Date.now() - cachedRecent.at < RECENT_LIVE_MS) return Promise.resolve(cachedRecent.result);
    if (inflight.has(action)) return inflight.get(action);

    const promise = Promise.resolve()
      .then(() => originalPost(action, payload || {}))
      .then(result => remember(action, result, result?._auroraCached ? 'CACHE' : 'LIVE'))
      .finally(() => inflight.delete(action));
    inflight.set(action, promise);
    return promise;
  }

  client.post = function instantHydrationPost(action, payload) {
    const name = String(action || '').trim();
    if (!READ_ACTIONS.has(name)) return originalPost(name, payload || {});
    return acceleratedRead(name, payload || {});
  };

  function prewarm() {
    if (document.visibilityState === 'hidden') return;
    READ_ACTIONS.forEach(action => acceleratedRead(action, {}).catch(() => {}));
  }

  const cachedIncome = readCache('incomeSnapshot');
  if (cachedIncome?.data) installCalendarMirror(cachedIncome.data);

  window.AuroraIncomeInstantHydration = Object.freeze({
    build: BUILD,
    prewarm,
    cache: readCache,
    inflight: action => inflight.has(action),
    recent: action => recent.get(action)?.result || null
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      paintCachedUi();
      prewarm();
    }, { once: true });
  } else {
    paintCachedUi();
    prewarm();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) prewarm();
  });
})();