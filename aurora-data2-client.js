/* Aurora City FC — AuroraData 2 Registration Client v2.1 Compatibility Bridge */
(function (w) {
  'use strict';

  const SPREADSHEET_ID = '1ZDdYmyDrvNuz3utKmgsToKL7NqsibzbWyIo0vg-TjcA';
  const STORAGE_KEY = 'aurora:data2:registration-connection:v2';
  const LEGACY_ENDPOINT_KEY = 'aurora2:data2:endpoint';
  const LEGACY_TOKEN_KEY = 'aurora2:data2:token';
  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit';
  const INCOME_ACTIONS = new Set([
    'incomeSnapshot', 'upsertDividend', 'dividendEngineStatus',
    'runDividendUpdate', 'installDividendUpdateTrigger', 'removeDividendUpdateTrigger'
  ]);

  function normaliseEndpoint(value) {
    let endpoint = String(value || '').trim();
    if (!endpoint) return '';
    endpoint = endpoint.replace(/\/dev(?:[?#].*)?$/i, '/exec');
    endpoint = endpoint.replace(/\/exec\/(?:[?#].*)?$/i, '/exec');
    return endpoint;
  }

  function readStored() {
    try {
      const row = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      // One-time compatibility read: move browsers from the retired split client keys.
      if (!row.endpoint) row.endpoint = localStorage.getItem(LEGACY_ENDPOINT_KEY) || '';
      if (!row.token) row.token = localStorage.getItem(LEGACY_TOKEN_KEY) || '';
      if ((row.endpoint || row.token) && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
        localStorage.removeItem(LEGACY_ENDPOINT_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
      }
      return {
        endpoint: normaliseEndpoint(row.endpoint),
        token: String(row.token || '').trim()
      };
    } catch (_) {
      return { endpoint: '', token: '' };
    }
  }

  function config() {
    return readStored();
  }

  function saveConfig(endpoint, token) {
    const next = {
      endpoint: normaliseEndpoint(endpoint),
      token: String(token || '').trim()
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}

    return next;
  }

  function clearConfig() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_ENDPOINT_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch (_) {}
    return { endpoint: '', token: '' };
  }

  function ensureConfig() {
    const c = config();
    if (!c.endpoint || !c.token) {
      throw new Error('Enter the Apps Script web-app URL and private token, then save the connection.');
    }
    return c;
  }

  function jsonp(action, payload, timeoutMs) {
    const c = ensureConfig();
    timeoutMs = Number(timeoutMs) || 25000;

    return new Promise((resolve, reject) => {
      const callbackName = 'auroraData2Jsonp' + Date.now() + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let settled = false;

      function finish(error, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { delete w[callbackName]; } catch (_) { w[callbackName] = undefined; }
        try { script.remove(); } catch (_) {}
        if (error) reject(error);
        else resolve(result || {});
      }

      const timer = setTimeout(() => {
        finish(new Error('AuroraData 2 response timed out.'));
      }, timeoutMs);

      w[callbackName] = function (result) {
        if (result && result.ok === false) {
          finish(new Error(result.message || 'AuroraData 2 request failed.'));
          return;
        }
        finish(null, result || {});
      };

      const url = new URL(c.endpoint);
      url.searchParams.set('action', action);
      url.searchParams.set('token', c.token);

      Object.entries(payload || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || typeof value === 'object') return;
        url.searchParams.set(key, String(value));
      });

      url.searchParams.set('callback', callbackName);
      url.searchParams.set('_', String(Date.now()));

      script.src = url.toString();
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.onerror = function () {
        finish(new Error('AuroraData 2 connection could not be opened.'));
      };

      document.head.appendChild(script);
    });
  }

  async function health() {
    const result = await jsonp('test', {});
    if (!result || result.ok === false) {
      throw new Error(result?.message || 'AuroraData 2 backend did not confirm the connection.');
    }

    let transactions = 0;
    try {
      const recent = await jsonp('listRecentRegistrations', { limit: 50 });
      transactions = Number(recent?.count || 0);
    } catch (_) {}

    return {
      ...result,
      connected: true,
      transactions,
      holdings: 0,
      spreadsheetId: SPREADSHEET_ID
    };
  }

  function flattenPurchasePayload(payload) {
    const tx = payload?.transaction || payload || {};
    const prior = payload?.priorHolding || {};
    const route = payload?.routeSnapshot || {};

    return {
      action: 'registerPurchase',
      transactionId: tx.transactionId,
      clientRequestId: tx.clientRequestId,
      tradeDate: tx.tradeDate,
      account: tx.account,
      ticker: tx.ticker,
      name: tx.name,
      shares: tx.shares,
      priceInput: tx.priceInput,
      priceUnit: tx.priceUnit,
      currency: tx.currency,
      fxRateToGbp: tx.fxRateToGbp,
      fees: tx.feesNative,
      missionId: tx.missionId,
      routeId: tx.routeId,
      allocationId: tx.allocationId,
      strategy: tx.strategy || route.strategy || '',
      recommendation: tx.recommendation || '',
      confidence: tx.confidence,
      expectedAnnualIncomeGbp: tx.expectedAnnualIncomeGbp,
      createIfMissing: true,
      annualDps: Number(prior.annualDpsGbp || 0),
      sector: prior.sector || '',
      role: prior.role || '',
      referencePriceGbp: Number(prior.livePriceGbp || 0)
    };
  }

  function buildRegistrationShape(flat, raw, originalPayload) {
    const tx = originalPayload?.transaction || originalPayload || {};
    const prior = originalPayload?.priorHolding || {};

    const previousShares = Number(raw?.previousShares ?? prior.shares ?? 0) || 0;
    const newShares = Number(raw?.newShares ?? (previousShares + Number(flat.shares || 0))) || 0;
    const previousBook = Number(raw?.previousBookCostGbp ?? prior.bookCostGbp ?? 0) || 0;
    const purchaseCost = Number(raw?.purchaseCostGbp ?? tx.totalCostGbp ?? 0) || 0;
    const newBook = Number(raw?.newBookCostGbp ?? (previousBook + purchaseCost)) || 0;
    const newAvg = Number(raw?.newAverageGbp ?? (newShares > 0 ? newBook / newShares : 0)) || 0;
    const annualDps = Number(raw?.annualDpsGbp ?? prior.annualDpsGbp ?? flat.annualDps ?? 0) || 0;
    const live = Number(raw?.livePriceGbp ?? prior.livePriceGbp ?? flat.referencePriceGbp ?? newAvg) || 0;
    const marketValue = Number(raw?.newMarketValueGbp ?? (newShares * live)) || 0;
    const annualIncome = Number(raw?.newAnnualIncomeGbp ?? (newShares * annualDps)) || 0;

    return {
      ...raw,
      confirmed: true,
      receiptId: raw?.backendReceiptId || raw?.receiptId || '',
      confirmedAt: raw?.timestamp || new Date().toISOString(),
      transaction: {
        transactionId: String(raw?.transactionId || flat.transactionId || ''),
        totalCostGbp: purchaseCost,
        previousShares,
        newShares,
        previousBookCostGbp: previousBook,
        newBookCostGbp: newBook,
        previousAvgCostGbp: Number(raw?.previousAverageGbp ?? prior.avgCostGbp ?? 0) || 0,
        newAvgCostGbp: newAvg
      },
      holding: {
        holdingId: raw?.holdingId || prior.holdingId || '',
        account: raw?.account || flat.account,
        ticker: raw?.ticker || flat.ticker,
        name: raw?.name || flat.name || flat.ticker,
        shares: newShares,
        bookCostGbp: newBook,
        avgCostGbp: newAvg,
        livePriceGbp: live,
        marketValueGbp: marketValue,
        profitLossGbp: Number(raw?.newProfitLossGbp ?? (marketValue - newBook)) || 0,
        annualDpsGbp: annualDps,
        annualIncomeGbp: annualIncome,
        sector: prior.sector || flat.sector || '',
        role: prior.role || flat.role || '',
        status: 'ACTIVE',
        locked: false,
        lockReason: ''
      }
    };
  }

  async function postTransport(payload) {
    const c = ensureConfig();
    const body = new URLSearchParams();
    body.set('token', c.token);
    body.set('payload', JSON.stringify(payload));

    try {
      const response = await fetch(c.endpoint, {
        method: 'POST',
        body,
        redirect: 'follow'
      });

      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}

      if (!response.ok) {
        throw new Error(json?.message || ('Registration service returned ' + response.status));
      }

      if (!json) throw new Error('Registration service returned an unreadable response.');
      if (json.ok === false) throw new Error(json.message || 'Registration failed.');
      return json;

    } catch (error) {
      const message = String(error?.message || error || '');
      const likelyCors = error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message);

      if (!likelyCors) throw error;

      await fetch(c.endpoint, {
        method: 'POST',
        mode: 'no-cors',
        body,
        redirect: 'follow'
      });

      return { ok: true, queued: true };
    }
  }

  async function waitForTransaction(transactionId, timeoutMs) {
    const started = Date.now();
    const limit = Number(timeoutMs) || 18000;

    while (Date.now() - started < limit) {
      const recent = await jsonp('listRecentRegistrations', { limit: 50 }, 12000);
      const rows = Array.isArray(recent?.registrations) ? recent.registrations : [];
      const hit = rows.find(row => String(row?.transactionId || '') === String(transactionId || ''));
      if (hit) return hit;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    throw new Error('AuroraData 2 received the request, but the confirmed transaction was not visible yet.');
  }

  async function routedPost(action, payload) {
    action = String(action || '').trim();

    if (action === 'seedHoldings') {
      const holdings = Array.isArray(payload?.holdings) ? payload.holdings : [];
      return {
        ok: true,
        inserted: 0,
        skipped: holdings.length,
        message: 'AuroraData 2 Consolidated already owns canonical Holdings; no seed write was required.'
      };
    }

    if (action === 'registerPurchase') {
      const flat = flattenPurchasePayload(payload);
      if (!flat.transactionId) throw new Error('Registration transaction ID is missing.');

      let raw = await postTransport(flat);

      if (raw?.queued) {
        const confirmed = await waitForTransaction(flat.transactionId);
        raw = {
          ok: true,
          duplicate: false,
          transactionId: confirmed.transactionId,
          account: confirmed.account,
          ticker: confirmed.ticker,
          name: confirmed.name,
          previousShares: confirmed.previousShares,
          newShares: confirmed.newShares,
          purchaseCostGbp: confirmed.totalCostGbp,
          annualIncomeAddedGbp: confirmed.annualIncomeAddedGbp,
          backendReceiptId: confirmed.backendReceiptId
        };
      }

      return buildRegistrationShape(flat, raw, payload);
    }

    const flat = { ...(payload || {}), action };
    return postTransport(flat);
  }

  function stampConnection(action, status, error) {
    const A = w.Aurora2;
    if (!A?.core?.update || (!INCOME_ACTIONS.has(action) && action !== 'test')) return;
    const now = new Date().toISOString();
    A.core.update(state => ({
      ...state,
      connection: status === 'CONNECTED' ? {
        ...state.connection,
        mode: 'AuroraData2',
        status,
        spreadsheetId: SPREADSHEET_ID
      } : state.connection,
      income: INCOME_ACTIONS.has(action) ? {
        ...state.income,
        backend: {
          ...state.income?.backend,
          status,
          spreadsheetId: SPREADSHEET_ID,
          lastHealthAt: status === 'CONNECTED' ? now : state.income?.backend?.lastHealthAt,
          lastEngineContactAt: status === 'CONNECTED' ? now : state.income?.backend?.lastEngineContactAt,
          lastError: error ? String(error) : null
        },
        updatedAt: now
      } : state.income
    }));
  }

  async function post(action, payload) {
    try {
      const result = await routedPost(action, payload);
      if (INCOME_ACTIONS.has(action)) stampConnection(action, 'CONNECTED', null);
      return result;
    } catch (error) {
      if (INCOME_ACTIONS.has(action)) stampConnection(action, 'ERROR', error?.message || error);
      throw error;
    }
  }

  async function updatePlatformRule(rule) {
    return post('updatePlatformRule', { spreadsheetId: SPREADSHEET_ID, rule });
  }

  function probeIncomePage() {
    const path = String(w.location?.pathname || '').toLowerCase();
    if (!path.endsWith('income.html')) return;
    const connection = config();
    if (!connection.endpoint || !connection.token) {
      stampConnection('incomeSnapshot', 'NOT_CONNECTED', 'AuroraData 2 connection is not configured in this browser.');
      return;
    }
    setTimeout(() => health().then(() => stampConnection('incomeSnapshot', 'CONNECTED', null))
      .catch(error => stampConnection('incomeSnapshot', 'ERROR', error?.message || error)), 0);
  }

  w.AuroraData2Client = {
    version: '3.0-consolidated',
    spreadsheetId: SPREADSHEET_ID,
    spreadsheetUrl: SPREADSHEET_URL,
    config,
    saveConfig,
    clearConfig,
    clearToken() {
      const current = config();
      return saveConfig(current.endpoint, '');
    },
    health,
    post,
    updatePlatformRule,
    get(action, payload) {
      return jsonp(action, payload || {});
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', probeIncomePage, { once: true });
  } else {
    probeIncomePage();
  }

})(window);
