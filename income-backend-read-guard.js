(() => {
  'use strict';

  const BUILD = '20260822-income-backend-read-guard-3';
  const LOCAL_CALENDAR_KEY = 'aurora2:income:calendar-local:v1';
  const CACHE_PREFIX = 'aurora2:income:backend-read-cache:v1:';
  const READ_ACTIONS = new Set(['incomeSnapshot', 'brokerCashSnapshot', 'dividendEngineStatus']);
  const MAX_ATTEMPTS = 4;

  const client = window.AuroraData2Client;
  if (!client || window.__auroraIncomeBackendReadGuard) return;
  window.__auroraIncomeBackendReadGuard = BUILD;

  const originalPost = typeof client.post === 'function' ? client.post.bind(client) : null;
  if (!originalPost) return;

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

  function pruneStaleLocalCalendar(snapshot) {
    const backendRows = arr(snapshot?.dividends);
    if (!backendRows.length) return;
    const backendIds = new Set(backendRows.map(row => String(row?.id || row?.dividendId || row?.dividend_id || '')).filter(Boolean));
    const backendKeys = new Set(backendRows.map(dividendKey).filter(Boolean));
    try {
      const localRows = arr(JSON.parse(localStorage.getItem(LOCAL_CALENDAR_KEY) || '[]'));
      const kept = localRows.filter(row => {
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

  function acceptLive(action, result, attempt) {
    writeCache(action, result);
    if (action === 'incomeSnapshot') pruneStaleLocalCalendar(result);
    window.dispatchEvent(new CustomEvent('aurora:income-backend-read', {
      detail: { build: BUILD, action, source: 'LIVE', transport: 'POST', attempt, at: new Date().toISOString() }
    }));
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
      if (action === 'incomeSnapshot') pruneStaleLocalCalendar(result);
      markCachedInUi(action, cached.savedAt);
      window.dispatchEvent(new CustomEvent('aurora:income-backend-read', {
        detail: { build: BUILD, action, source: 'CACHE', at: new Date().toISOString(), error: String(lastError?.message || lastError || '') }
      }));
      return result;
    }

    markUnavailableInUi(action, lastError);
    throw lastError || new Error(`${action} could not be read from AuroraData 2.`);
  }

  client.post = function guardedPost(action, payload) {
    const name = String(action || '').trim();
    if (READ_ACTIONS.has(name)) return safeRead(name, payload || {});
    return originalPost(name, payload || {});
  };

  window.AuroraIncomeBackendReadGuard = Object.freeze({
    build: BUILD,
    read: safeRead,
    cache: action => readCache(action),
    pruneLocalCalendar: pruneStaleLocalCalendar
  });
})();