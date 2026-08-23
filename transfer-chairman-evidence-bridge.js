(function () {
  'use strict';

  var BUILD = '20260823-transfer-chairman-evidence-bridge-1';
  var STATE_KEY = 'aurora2:state:v1';
  var BACKUP_KEY = 'aurora2:state:backup:lastgood';
  var MAX_GLOBAL_CANDIDATES = 24;
  var MAX_SUPPORTED_YIELD = 12;
  var MIN_EVIDENCE = 3;
  var MIN_STRENGTH = 60;
  var MIN_SAFETY = 35;

  var cacheKey = '';
  var evidenceByTicker = {};
  var globalScheduled = false;
  var globalReady = false;
  var cachedGlobal = [];
  var cachedGlobalKey = '';

  function arr(value) { return Array.isArray(value) ? value : []; }
  function num(value) {
    var parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, num(value))); }
  function ticker(value) {
    return String(value || '').replace(/^LON:/i, '').replace(/\.L$/i, '').replace(/\.GB$/i, '').replace(/\..*$/, '').toUpperCase().trim();
  }
  function exchange(value) {
    var raw = String(value || '').trim().toUpperCase();
    var aliases = {LON:'LSE',XLON:'LSE',LONDON:'LSE',XNAS:'NASDAQ',NAS:'NASDAQ',XNYS:'NYSE',TOR:'TSX',XTSE:'TSX'};
    return aliases[raw] || raw;
  }
  function accountCode(value) {
    var lower = String(value || '').toLowerCase();
    if (lower.indexOf('212') >= 0) return 'T212';
    if (/\big\b/.test(lower) || lower.indexOf('ig isa') >= 0) return 'IG';
    var upper = String(value || '').toUpperCase();
    return upper === 'IG' || upper === 'T212' ? upper : 'CHECK';
  }
  function eligibilityAccounts(value) {
    if (Array.isArray(value)) return value.map(accountCode).filter(function (code) { return code !== 'CHECK'; });
    if (typeof value === 'string') {
      var text = value.trim();
      if ((text[0] === '[' || text[0] === '{') && text.length > 1) {
        try { return eligibilityAccounts(JSON.parse(text)); } catch (_) {}
      }
      return text.split(/[,|/]/).map(accountCode).filter(function (code) { return code !== 'CHECK'; });
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).filter(function (key) { return value[key] === true; }).map(accountCode).filter(function (code) { return code !== 'CHECK'; });
    }
    return [];
  }
  function yieldPct(row) {
    row = row || {};
    var source = row.yieldPct != null ? row.yieldPct : row.dividendYieldPct != null ? row.dividendYieldPct : row.dividendYield != null ? row.dividendYield : row.annualYieldPct != null ? row.annualYieldPct : row.legacyYieldPct;
    var value = num(source);
    if (value > 0 && value <= 1 && String(source || '').indexOf('%') < 0) value *= 100;
    return Math.max(0, value);
  }
  function priceGbp(row) {
    row = row || {};
    var direct = num(row.livePriceGbp || row.priceGbp || row.live_price_gbp || row.price_gbp || row.legacyPriceGbp);
    if (direct > 0) return direct;
    var raw = num(row.livePrice || row.price || row.currentPrice || row.live_price || row.legacyPriceNative);
    if (!(raw > 0)) return 0;
    var currency = String(row.currency || row.quoteCurrency || 'GBP').toUpperCase();
    var unit = String(row.priceUnit || row.unit || '').toUpperCase();
    if (currency === 'GBX') return raw / 100;
    if (currency === 'GBP') return unit === 'GBX' || unit === 'PENCE' ? raw / 100 : raw;
    var fx = num(row.fxRateToGbp || row.fxToGbp);
    return fx > 0 ? raw * fx : 0;
  }
  function targetGate(target) {
    var text = (String(target && target.status || '') + ' ' + String(target && target.recommendation || '')).toLowerCase();
    var eligibility = String(target && target.eligibilityStatus || '').toUpperCase();
    if (text.indexOf('block') >= 0 || ['INELIGIBLE','BLOCKED','NOT_ELIGIBLE'].indexOf(eligibility) >= 0) return 'block';
    if (text.indexOf('pending') >= 0) return 'pending';
    if (text.indexOf('caution') >= 0) return 'caution';
    if (text.indexOf('pass') >= 0 || text.indexOf('strong buy') >= 0 || /(^|\s)buy($|\s)/.test(text)) return 'pass';
    return target && target.approvedForTransfer === true ? 'caution' : 'unknown';
  }
  function readStoredState() {
    var keys = [STATE_KEY, BACKUP_KEY];
    for (var i = 0; i < keys.length; i += 1) {
      try {
        var parsed = JSON.parse(localStorage.getItem(keys[i]) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }
  function indexRow(map, row) {
    if (!row) return;
    var tk = ticker(row.ticker || row.marketSymbol || row.symbol);
    if (!tk) return;
    var prior = map[tk] || {};
    var p = priceGbp(row);
    var y = yieldPct(row);
    var broker = accountCode(row.preferredAccount || row.account || row.broker);
    var eligible = eligibilityAccounts(row.brokerEligibility || row.accounts || row.eligibleAccounts);
    if (broker === 'CHECK' && eligible.length) broker = eligible.indexOf('IG') >= 0 ? 'IG' : eligible[0];
    if (broker === 'CHECK' && (row.IG === true || row.ig === true || row.igIsaSupported === true || row.supportsIgIsa === true)) broker = 'IG';
    if (broker === 'CHECK' && (row.T212 === true || row.t212 === true || row.trading212IsaSupported === true || row.supportsTrading212Isa === true)) broker = 'T212';
    map[tk] = {
      priceGbp: prior.priceGbp > 0 ? prior.priceGbp : p,
      yieldPct: prior.yieldPct > 0 ? prior.yieldPct : y,
      broker: prior.broker && prior.broker !== 'CHECK' ? prior.broker : broker,
      evidenceCount: Math.max(num(prior.evidenceCount), num(row.evidenceCount))
    };
  }
  function ensureEvidenceIndex(state) {
    var scouting = state && state.scouting || {};
    var market = state && state.market || {};
    var marketData = state && state.marketData || {};
    var transfer = state && state.transfer || {};
    var key = [
      String(scouting.updatedAt || ''), arr(scouting.universe).length,
      arr(market.evidence).length, arr(state && state.marketEvidence).length,
      arr(marketData.evidence).length, arr(marketData.quotes).length, arr(marketData.prices).length,
      arr(transfer.marketEvidence).length, arr(transfer.quotes).length,
      arr(state && state.squad && state.squad.holdings).length
    ].join('|');
    if (key === cacheKey) return;
    var map = {};
    [
      arr(scouting.universe), arr(market.evidence), arr(state && state.marketEvidence),
      arr(marketData.evidence), arr(marketData.quotes), arr(marketData.prices),
      arr(transfer.marketEvidence), arr(transfer.quotes), arr(state && state.squad && state.squad.holdings)
    ].forEach(function (rows) { rows.forEach(function (row) { indexRow(map, row); }); });
    evidenceByTicker = map;
    cacheKey = key;
  }
  function exchangeBrokerMap(state) {
    var map = {};
    arr(state && state.transfer && state.transfer.exchangeSupport).concat(arr(state && state.transfer && state.transfer.marketSupport)).forEach(function (row) {
      var ex = exchange(row && (row.exchange || row.market));
      if (!ex || map[ex]) return;
      var accounts = eligibilityAccounts(row && (row.accounts || row.eligibleAccounts || row.brokerEligibility));
      if (accounts.length) map[ex] = accounts.indexOf('IG') >= 0 ? 'IG' : accounts[0];
    });
    return map;
  }
  function fastBroker(state, target, exchangeMap) {
    var direct = accountCode(target && (target.preferredAccount || target.account || target.broker));
    if (direct !== 'CHECK') return direct;
    var tk = ticker(target && (target.ticker || target.marketSymbol));
    var evidence = evidenceByTicker[tk] || {};
    var fromEvidence = accountCode(evidence.broker);
    if (fromEvidence !== 'CHECK') return fromEvidence;
    var explicit = eligibilityAccounts(target && target.brokerEligibility);
    if (explicit.length) return explicit.indexOf('IG') >= 0 ? 'IG' : explicit[0];
    if (target && (target.IG === true || target.ig === true || target.igIsaSupported === true || target.supportsIgIsa === true)) return 'IG';
    if (target && (target.T212 === true || target.t212 === true || target.trading212IsaSupported === true || target.supportsTrading212Isa === true)) return 'T212';
    var held = arr(state && state.squad && state.squad.holdings).find(function (row) { return ticker(row && row.ticker) === tk && num(row && row.shares) > 0; });
    var heldAccount = accountCode(held && held.account);
    if (heldAccount !== 'CHECK') return heldAccount;
    var ex = exchange(target && (target.exchange || target.exchangeCode));
    return exchangeMap && exchangeMap[ex] ? exchangeMap[ex] : 'CHECK';
  }
  function enrichActiveTargets(state) {
    ensureEvidenceIndex(state);
    var scouting = state && state.scouting || {};
    var batch = String(scouting.approvedBatchId || '');
    var exMap = exchangeBrokerMap(state);
    return arr(scouting.targets).map(function (target) {
      if (!target) return target;
      var tk = ticker(target.ticker || target.marketSymbol);
      var evidence = evidenceByTicker[tk] || {};
      var gate = targetGate(target);
      var broker = fastBroker(state, target, exMap);
      var price = priceGbp(target) || num(evidence.priceGbp);
      var y = yieldPct(target) || num(evidence.yieldPct);
      var eligible = (gate === 'pass' || gate === 'caution') && target.transferPermitted !== false && broker !== 'CHECK' && price > 0 && y > 0;
      var copy = Object.assign({}, target, {
        preferredAccount: broker !== 'CHECK' ? broker : target.preferredAccount,
        livePriceGbp: price > 0 ? price : target.livePriceGbp,
        yieldPct: y > 0 ? y : target.yieldPct,
        chairmanSimulationCandidate: eligible || target.chairmanSimulationCandidate === true,
        chairmanBrokerSource: broker !== 'CHECK' ? 'CONSOLIDATED_EVIDENCE' : null,
        chairmanActiveEvidenceSource: eligible ? 'CACHED_TICKER_EVIDENCE' : null
      });
      if (eligible) {
        copy.approvedForTransfer = true;
        if (batch) copy.approvalBatchId = batch;
      }
      return copy;
    });
  }
  function globalCandidate(state, row, exMap, batch) {
    row = row || {};
    var tk = ticker(row.ticker || row.marketSymbol);
    var y = yieldPct(row);
    var price = priceGbp(row);
    var broker = fastBroker(state, row, exMap);
    var evidence = num(row.evidenceCount);
    var strength = num(row.legacyStrength || row.buyStrength || row.strength);
    var safety = num(row.legacyPayoutScore || row.dividendSafety || row.payoutScore);
    var valuation = num(row.legacyValuationScore || row.valuationScore);
    var growth = num(row.legacyGrowthScore || row.dividendGrowth || row.growthScore);
    var quality = num(row.legacyBusinessQuality || row.businessQuality || row.qualityScore);
    var sourceStatus = String(row.sourceStatus || row.status || '').toLowerCase();
    var risk = String(row.legacyPayoutRisk || row.payoutRisk || '').toLowerCase();
    if (!tk || tk === 'TSCO' || !(y > 0) || y > MAX_SUPPORTED_YIELD || !(price > 0) || broker === 'CHECK') return null;
    if (evidence < MIN_EVIDENCE || strength < MIN_STRENGTH || safety < MIN_SAFETY) return null;
    if (/suspend|cancel|omit|avoid|sell/.test(sourceStatus) || /very high|extreme/.test(risk)) return null;
    var signals = [price > 0,y > 0,safety > 0,valuation > 0,growth > 0,quality > 0,evidence >= 5].filter(Boolean).length;
    var confidence = clamp(35 + signals * 9, 35, 92);
    var caution = y > 10 || safety < 60 || confidence < 75;
    var incomeScore = y <= 2 ? 35 + y * 12.5 : y <= 6 ? 60 + (y - 2) * 8 : y <= 8 ? 92 + (y - 6) * 4 : y <= 10 ? 100 - (y - 8) * 5 : 90 - (y - 10) * 10;
    incomeScore = clamp(incomeScore, 30, 100);
    var sustainableScore = clamp(strength * .28 + safety * .27 + valuation * .14 + growth * .10 + quality * .08 + incomeScore * .13, 1, 100);
    var maximumScore = clamp(strength * .18 + safety * .18 + valuation * .08 + growth * .05 + quality * .06 + incomeScore * .45, 1, 100);
    return {
      id:'CHAIRMAN-GLOBAL-' + (row.securityId || row.id || tk),
      securityId:row.securityId || row.id || ((exchange(row.exchange) || 'UNKNOWN') + ':' + tk),
      exchange:row.exchange,ticker:tk,name:String(row.name || tk),preferredAccount:broker,livePriceGbp:price,yieldPct:y,
      confidence:confidence,dividendSafety:safety,sustainableScore:Number(sustainableScore.toFixed(2)),maximumScore:Number(maximumScore.toFixed(2)),
      status:caution ? 'caution' : 'pass',recommendation:caution ? 'CAUTION' : (maximumScore >= 80 ? 'STRONG BUY' : 'BUY'),
      approvedForTransfer:true,approvalBatchId:batch || '',transferPermitted:true,chairmanSimulationCandidate:true,
      chairmanGlobalCandidate:true,chairmanBrokerSource:'IDLE_GLOBAL_SEARCH',evidenceCount:evidence,source:'CHAIRMAN_GLOBAL_IDLE_SEARCH'
    };
  }
  function scheduleIdle(fn) {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, {timeout:1200});
    else setTimeout(function () { fn({timeRemaining:function () { return 8; }, didTimeout:true}); }, 80);
  }
  function scheduleGlobalScan(state) {
    if (globalScheduled) return;
    var scouting = state && state.scouting || {};
    var universe = arr(scouting.universe);
    var key = String(scouting.updatedAt || '') + '|' + universe.length;
    if (globalReady && key === cachedGlobalKey) return;
    if (!universe.length) { globalReady = true; cachedGlobal = []; cachedGlobalKey = key; return; }
    globalScheduled = true;
    var exMap = exchangeBrokerMap(state);
    var batch = String(scouting.approvedBatchId || '');
    var rows = [];
    var index = 0;
    function chunk(deadline) {
      var started = Date.now();
      var processed = 0;
      while (index < universe.length && processed < 180) {
        var candidate = globalCandidate(state, universe[index], exMap, batch);
        if (candidate) rows.push(candidate);
        index += 1;
        processed += 1;
        if (deadline && typeof deadline.timeRemaining === 'function' && !deadline.didTimeout && deadline.timeRemaining() < 2) break;
        if (Date.now() - started > 10) break;
      }
      if (index < universe.length) { scheduleIdle(chunk); return; }
      rows.sort(function (a, b) { return b.maximumScore - a.maximumScore || b.yieldPct - a.yieldPct || b.sustainableScore - a.sustainableScore || a.ticker.localeCompare(b.ticker); });
      cachedGlobal = rows.slice(0, MAX_GLOBAL_CANDIDATES);
      cachedGlobalKey = key;
      globalReady = true;
      globalScheduled = false;
      publishApi();
      try { window.dispatchEvent(new CustomEvent('aurora2:state', {detail:{source:'chairman-evidence-global-ready',build:BUILD}})); } catch (_) {}
    }
    setTimeout(function () { scheduleIdle(chunk); }, 250);
  }
  function enrichState(state) {
    if (!state || typeof state !== 'object') return state;
    var scouting = state.scouting || {};
    var active = enrichActiveTargets(state);
    scheduleGlobalScan(state);
    if (cachedGlobal.length) {
      var seen = {};
      active.forEach(function (row) { if (row) seen[String(row.securityId || ticker(row.ticker))] = true; });
      cachedGlobal.forEach(function (row) {
        var key = String(row.securityId || ticker(row.ticker));
        if (!seen[key]) { active.push(row); seen[key] = true; }
      });
    }
    return Object.assign({}, state, {scouting:Object.assign({}, scouting, {targets:active})});
  }
  function publishApi() {
    var api = Object.freeze({
      build:BUILD,ready:true,readOnly:true,mode:'CONSOLIDATED_ACTIVE_EVIDENCE_PLUS_IDLE_GLOBAL',
      globalReady:globalReady,globalCandidates:cachedGlobal.length,cachedKey:cachedGlobalKey,
      candidateTickers:cachedGlobal.map(function (row) { return row.ticker; })
    });
    window.AuroraTransferChairmanEvidenceBridge = api;
    window.AuroraTransferChairmanBrokerBridge = api;
    window.AuroraTransferChairmanActiveEvidence = api;
  }

  var core = window.Aurora2 && window.Aurora2.core;
  var sourceRead = core && typeof core.read === 'function' ? core.read.bind(core) : readStoredState;
  window.Aurora2 = window.Aurora2 || {};
  window.Aurora2.core = window.Aurora2.core || {};
  window.Aurora2.core.read = function () { return enrichState(sourceRead()); };
  publishApi();
})();
