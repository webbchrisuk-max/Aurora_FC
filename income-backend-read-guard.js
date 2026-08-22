(() => {
  'use strict';

  const BUILD = '20260822-income-backend-read-guard-4-instant-hydration';
  const LOCAL_CALENDAR_KEY = 'aurora2:income:calendar-local:v1';
  const CACHE_PREFIX = 'aurora2:income:backend-read-cache:v1:';
  const HYDRATION_SOURCE = 'INSTANT_HYDRATION_CACHE';
  const READ_ACTIONS = new Set(['incomeSnapshot', 'brokerCashSnapshot', 'dividendEngineStatus']);
  const MAX_ATTEMPTS = 4;
  const RECENT_LIVE_MS = 8000;

  const client = window.AuroraData2Client;
  if (!client || window.__auroraIncomeBackendReadGuard) return;
  window.__auroraIncomeBackendReadGuard = BUILD;

  const originalPost = typeof client.post === 'function' ? client.post.bind(client) : null;
  if (!originalPost) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const arr = value => Array.isArray(value) ? value : [];
  const inflight = new Map();
  const recent = new Map();

  function accountCode(value) {
    const text = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!text) return '';
    if (text === 'IG' || text.includes('IGISA')) return 'IG';
    if (text === 'T212' || text.includes('TRADE212') || text.includes('TRADING212')) return 'T212';
    return text;
  }

  function tickerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/\.L$/i, '');
  }

  function dateKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const gb = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (gb) return `${gb[3]}-${String(gb[2]).padStart(2, '0')}-${String(gb[1]).padStart(2, '0')}`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  function dividendKey(row) {
    const ac = accountCode(row?.account);
    const tk = tickerCode(row?.ticker);
    const pay = dateKey(row?.payDate || row?.pay_date);
    return ac && tk && pay ? `${ac}|${tk}|${pay}` : '';
  }

  function readCache(action) {
    try {
      const wrapped = JSON.parse(localStorage.getItem(CACHE_PREFIX + action) || 'null');
      return wrapped?.data ? wrapped : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(action, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + action, JSON.stringify({
        savedAt: new Date().toISOString(),
        data
      }));
    } catch (_) {}
  }

  function isValid(action, result) {
    if (!result || result.ok === false || result.queued === true) return false;
    if (action === 'brokerCashSnapshot') {
      if (!result.balances || typeof result.balances !== 'object' || !Array.isArray(result.ledger)) return false;
      const ig = Number(result.balances.IG);
      const t212 = Number(result.balances.T212);
      return Number.isFinite(ig) && Number.isFinite(t212);
    }
    if (action === 'incomeSnapshot') return Array.isArray(result.dividends);
    if (action === 'dividendEngineStatus') return typeof result === 'object' && !result.queued;
    return true;
  }

  function hydrationId(row, index) {
    const direct = String(row?.id || row?.dividendId || row?.dividend_id || '').trim();
    if (direct) return direct;
    const key = dividendKey(row);
    return key ? `HYDRATE-${key.replaceAll('|', '-')}` : `HYDRATE-${index}`;
  }

  function syncHydrationMirror(snapshot) {
    const backendRows = arr(snapshot?.dividends);
    if (!backendRows.length) return 0;
    try {
      const localRows = arr(JSON.parse(localStorage.getItem(LOCAL_CALENDAR_KEY) || '[]'));
      const localOwned = localRows.filter(row => String(row?.source || '') !== HYDRATION_SOURCE);
      const mirrored = backendRows.map((row, index) => ({
        ...row,
        id: hydrationId(row, index),
        source: HYDRATION_SOURCE,
        _auroraHydration: true,
        _auroraHydratedAt: new Date().toISOString()
      }));
      localStorage.setItem(LOCAL_CALENDAR_KEY, JSON.stringify([...mirrored, ...localOwned].slice(0, 400)));
      return mirrored.length;
    } catch (_) {
      return 0;
    }
  }

  function pruneStaleLocalCalendar(snapshot) {
    const backendRows = arr(snapshot?.dividends);
    if (!backendRows.length) return;
    const backendIds = new Set(backendRows.map(row => String(row?.id || row?.dividendId || row?.dividend_id || '')).filter(Boolean));
    const backendKeys = new Set(backendRows.map(dividendKey).filter(Boolean));
    try {
      const localRows = arr(JSON.parse(localStorage.getItem(LOCAL_CALENDAR_KEY) || '[]'));
      const kept = localRows.filter(row => {
        if (String(row?.source || '') === HYDRATION_SOURCE) return true;
        const id = String(row?.id || row?.dividendId || row?.dividend_id || '');
        const key = dividendKey(row);
        return !((id && backendIds.has(id)) || (key && backendKeys.has(key)));
      });
      if (kept.length !== localRows.length) {
        localStorage.setItem(LOCAL_CALENDAR_KEY, JSON.stringify(kept));
        window.dispatchEvent(new CustomEvent('aurora:income-local-calendar-pruned', {
          detail: { build: BUILD, removed: localRows.length - kept.length }
        }));
      }
    } catch (_) {}
  }

  function money(value) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function engineTime(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function paintCash(snapshot, source) {
    if (!snapshot?.balances) return;
    setText('cashBalanceIG', money(snapshot.balances.IG));
    setText('cashBalanceT212', money(snapshot.balances.T212));
    setText('cashBackendStatus', source === 'LIVE' ? 'CONNECTED' : 'VERIFYING');
    if (source !== 'LIVE') {
      setText('cashNote', 'Showing the last verified broker cash position while AuroraData 2 confirms the live snapshot.');
    }
  }

  function paintEngine(snapshot, source) {
    if (!snapshot || snapshot.ok === false) return;
    const installed = Boolean(snapshot.installed);
    const last = snapshot.lastSummary || {};
    const alpha = snapshot.alphaVantage || {};
    setText('engineBadge', source === 'LIVE' ? (installed ? 'AUTO ON' : 'AUTO OFF') : 'VERIFYING');
    setText('engineAuto', installed ? 'Nightly' : 'Off');
    setText('engineAlpha', alpha.configured ? 'CONNECTED' : 'NOT SET');
    setText('engineReview', String(Number(snapshot.openReviewCount) || 0));
    setText('engineLast', engineTime(last.finishedAt || last.completedAt || snapshot.lastRunAt));
  }

  function paintCachedUi() {
    const cash = readCache('brokerCashSnapshot');
    if (cash?.data) paintCash(cash.data, 'CACHE');
    const engine = readCache('dividendEngineStatus');
    if (engine?.data) paintEngine(engine.data, 'CACHE');
  }

  function markCachedInUi(action, savedAt) {
    if (action !== 'brokerCashSnapshot') return;
    setTimeout(() => {
      const badge = document.getElementById('cashBackendStatus');
      const note = document.getElementById('cashNote');
      if (badge) badge.textContent = 'CACHED';
      if (note) note.textContent = `Showing last verified broker cash snapshot${savedAt ? ` from ${new Date(savedAt).toLocaleString('en-GB')}` : ''}. Live refresh will retry automatically.`;
    }, 30);
  }

  function markUnavailableInUi(action, error) {
    if (action !== 'brokerCashSnapshot') return;
    setTimeout(() => {
      const ig = document.getElementById('cashBalanceIG');
      const t212 = document.getElementById('cashBalanceT212');
      const badge = document.getElementById('cashBackendStatus');
      const note = document.getElementById('cashNote');
      if (ig) ig.textContent = '—';
      if (t212) t212.textContent = '—';
      if (badge) badge.textContent = 'CHECK';
      if (note) note.textContent = `Live broker cash snapshot unavailable; Aurora has not inferred a £0 balance. ${String(error?.message || error || '')}`.trim();
    }, 30);
  }

  function dispatchRead(action, result, source, attempt = 0, error = '') {
    window.dispatchEvent(new CustomEvent('aurora:income-backend-read', {
      detail: { build: BUILD, action, source, transport: 'POST', attempt, at: new Date().toISOString(), error }
    }));
    window.dispatchEvent(new CustomEvent('aurora:income-instant-hydration', {
      detail: { build: BUILD, action, result, source, at: new Date().toISOString() }
    }));
  }

  function acceptLive(action, result, attempt) {
    writeCache(action, result);
    if (action === 'incomeSnapshot') {
      pruneStaleLocalCalendar(result);
      syncHydrationMirror(result);
    }
    if (action === 'brokerCashSnapshot') paintCash(result, 'LIVE');
    if (action === 'dividendEngineStatus') paintEngine(result, 'LIVE');
    recent.set(action, { at: Date.now(), result });
    dispatchRead(action, result, 'LIVE', attempt);
    return result;
  }

  async function safeRead(action, payload = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await originalPost(action, payload || {});
        if (isValid(action, result)) return acceptLive(action, result, attempt);
        throw new Error(`${action} returned a queued or incomplete snapshot.`);
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) await sleep(350 * attempt);
      }
    }

    const cached = readCache(action);
    if (cached) {
      const result = { ...cached.data, _auroraCached: true, _auroraCachedAt: cached.savedAt };
      if (action === 'incomeSnapshot') {
        pruneStaleLocalCalendar(result);
        syncHydrationMirror(result);
      }
      if (action === 'brokerCashSnapshot') paintCash(result, 'CACHE');
      if (action === 'dividendEngineStatus') paintEngine(result, 'CACHE');
      recent.set(action, { at: Date.now(), result });
      markCachedInUi(action, cached.savedAt);
      dispatchRead(action, result, 'CACHE', 0, String(lastError?.message || lastError || ''));
      return result;
    }

    markUnavailableInUi(action, lastError);
    throw lastError || new Error(`${action} could not be read from AuroraData 2.`);
  }

  function acceleratedRead(action, payload = {}) {
    const last = recent.get(action);
    if (last && Date.now() - last.at < RECENT_LIVE_MS) return Promise.resolve(last.result);
    if (inflight.has(action)) return inflight.get(action);
    const request = safeRead(action, payload || {}).finally(() => inflight.delete(action));
    inflight.set(action, request);
    return request;
  }

  client.post = function guardedPost(action, payload) {
    const name = String(action || '').trim();
    if (READ_ACTIONS.has(name)) return acceleratedRead(name, payload || {});
    return originalPost(name, payload || {});
  };

  function prewarm() {
    if (document.visibilityState === 'hidden') return;
    READ_ACTIONS.forEach(action => acceleratedRead(action, {}).catch(() => {}));
  }

  const cachedIncome = readCache('incomeSnapshot');
  if (cachedIncome?.data) syncHydrationMirror(cachedIncome.data);

  window.AuroraIncomeBackendReadGuard = Object.freeze({
    build: BUILD,
    read: acceleratedRead,
    cache: action => readCache(action),
    prewarm,
    inflight: action => inflight.has(action),
    recent: action => recent.get(action)?.result || null,
    pruneLocalCalendar: pruneStaleLocalCalendar,
    hydrateCalendar: syncHydrationMirror
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