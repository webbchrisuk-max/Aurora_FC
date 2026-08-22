(() => {
  'use strict';

  const BUILD = '20260822-income-backend-read-guard-2';
  const LOCAL_CALENDAR_KEY = 'aurora2:income:calendar-local:v1';
  const CACHE_PREFIX = 'aurora2:income:backend-read-cache:v1:';
  const READ_ACTIONS = new Set(['incomeSnapshot', 'brokerCashSnapshot', 'dividendEngineStatus']);
  const MAX_ATTEMPTS = 3;

  const client = window.AuroraData2Client;
  if (!client || window.__auroraIncomeBackendReadGuard) return;
  window.__auroraIncomeBackendReadGuard = BUILD;

  const originalPost = typeof client.post === 'function' ? client.post.bind(client) : null;
  const originalGet = typeof client.get === 'function' ? client.get.bind(client) : null;
  if (!originalPost || !originalGet) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const arr = value => Array.isArray(value) ? value : [];

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
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function dividendKey(row) {
    const account = accountCode(row?.account);
    const ticker = tickerCode(row?.ticker);
    const payDate = dateKey(row?.payDate || row?.pay_date);
    return account && ticker && payDate ? `${account}|${ticker}|${payDate}` : '';
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
      if (!result.balances || typeof result.balances !== 'object') return false;
      const ig = Number(result.balances.IG);
      const t212 = Number(result.balances.T212);
      return Number.isFinite(ig) && Number.isFinite(t212) && Array.isArray(result.ledger);
    }
    if (action === 'incomeSnapshot') return Array.isArray(result.dividends);
    if (action === 'dividendEngineStatus') return typeof result === 'object';
    return true;
  }

  function pruneStaleLocalCalendar(incomeSnapshot) {
    const backendRows = arr(incomeSnapshot?.dividends);
    if (!backendRows.length) return;

    const backendIds = new Set(backendRows.map(row => String(row?.id || row?.dividendId || row?.dividend_id || '')).filter(Boolean));
    const backendKeys = new Set(backendRows.map(dividendKey).filter(Boolean));

    try {
      const localRows = arr(JSON.parse(localStorage.getItem(LOCAL_CALENDAR_KEY) || '[]'));
      const kept = localRows.filter(row => {
        const id = String(row?.id || row?.dividendId || row?.dividend_id || '');
        const key = dividendKey(row);
        if (id && backendIds.has(id)) return false;
        if (key && backendKeys.has(key)) return false;
        return true;
      });
      if (kept.length !== localRows.length) {
        localStorage.setItem(LOCAL_CALENDAR_KEY, JSON.stringify(kept));
        window.dispatchEvent(new CustomEvent('aurora:income-local-calendar-pruned', {
          detail: { build: BUILD, removed: localRows.length - kept.length }
        }));
      }
    } catch (_) {}
  }

  function markCachedInUi(action, savedAt) {
    if (action !== 'brokerCashSnapshot') return;
    setTimeout(() => {
      const badge = document.getElementById('cashBackendStatus');
      const note = document.getElementById('cashNote');
      if (badge) badge.textContent = 'CACHED';
      if (note) note.textContent = `Showing last verified broker cash snapshot${savedAt ? ` from ${new Date(savedAt).toLocaleString('en-GB')}` : ''}. Live refresh will retry automatically.`;
    }, 0);
  }

  function acceptLive(action, result, attempt, transport) {
    writeCache(action, result);
    if (action === 'incomeSnapshot') pruneStaleLocalCalendar(result);
    window.dispatchEvent(new CustomEvent('aurora:income-backend-read', {
      detail: { build: BUILD, action, source: 'LIVE', transport, attempt, at: new Date().toISOString() }
    }));
    return result;
  }

  async function safeRead(action, payload = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const getResult = await originalGet(action, payload || {});
        if (isValid(action, getResult)) return acceptLive(action, getResult, attempt, 'GET_JSONP');
        throw new Error(`${action} GET returned an incomplete snapshot.`);
      } catch (error) {
        lastError = error;
      }

      try {
        const postResult = await originalPost(action, payload || {});
        if (isValid(action, postResult)) return acceptLive(action, postResult, attempt, 'POST');
        throw new Error(`${action} POST returned an incomplete snapshot.`);
      } catch (error) {
        lastError = error;
      }

      if (attempt < MAX_ATTEMPTS) await sleep(220 * attempt);
    }

    const cached = readCache(action);
    if (cached) {
      const result = { ...cached.data, _auroraCached: true, _auroraCachedAt: cached.savedAt };
      if (action === 'incomeSnapshot') pruneStaleLocalCalendar(result);
      markCachedInUi(action, cached.savedAt);
      window.dispatchEvent(new CustomEvent('aurora:income-backend-read', {
        detail: { build: BUILD, action, source: 'CACHE', at: new Date().toISOString(), error: String(lastError?.message || lastError || '') }
      }));
      return result;
    }

    throw lastError || new Error(`${action} could not be read from AuroraData 2.`);
  }

  client.post = function guardedPost(action, payload) {
    const name = String(action || '').trim();
    if (READ_ACTIONS.has(name)) return safeRead(name, payload || {});
    return originalPost(name, payload || {});
  };

  client.get = function guardedGet(action, payload) {
    const name = String(action || '').trim();
    if (READ_ACTIONS.has(name)) return safeRead(name, payload || {});
    return originalGet(name, payload || {});
  };

  window.AuroraIncomeBackendReadGuard = Object.freeze({
    build: BUILD,
    read: safeRead,
    cache: action => readCache(action),
    pruneLocalCalendar: pruneStaleLocalCalendar
  });
})();