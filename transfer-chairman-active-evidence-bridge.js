(function () {
  'use strict';

  var BUILD = '20260822-transfer-chairman-active-evidence-1';
  var cacheKey = '';
  var evidenceByTicker = {};

  function arr(value) { return Array.isArray(value) ? value : []; }
  function num(value) {
    var parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function ticker(value) {
    return String(value || '').replace(/^LON:/i, '').replace(/\.L$/i, '').replace(/\.GB$/i, '').replace(/\..*$/, '').toUpperCase().trim();
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

  function ensureIndex(state) {
    var scouting = state && state.scouting || {};
    var market = state && state.market || {};
    var marketData = state && state.marketData || {};
    var transfer = state && state.transfer || {};
    var key = [
      String(scouting.updatedAt || ''), arr(scouting.universe).length,
      arr(market.evidence).length, arr(state && state.marketEvidence).length,
      arr(marketData.evidence).length, arr(marketData.quotes).length, arr(marketData.prices).length,
      arr(transfer.marketEvidence).length, arr(transfer.quotes).length
    ].join('|');
    if (key === cacheKey) return;
    var map = {};
    [
      arr(scouting.universe),
      arr(market.evidence),
      arr(state && state.marketEvidence),
      arr(marketData.evidence),
      arr(marketData.quotes),
      arr(marketData.prices),
      arr(transfer.marketEvidence),
      arr(transfer.quotes),
      arr(state && state.squad && state.squad.holdings)
    ].forEach(function (rows) { rows.forEach(function (row) { indexRow(map, row); }); });
    evidenceByTicker = map;
    cacheKey = key;
  }

  function enrich(state) {
    if (!state || typeof state !== 'object') return state;
    ensureIndex(state);
    var scouting = state.scouting || {};
    var batch = String(scouting.approvedBatchId || '');
    var targets = arr(scouting.targets).map(function (target) {
      if (!target) return target;
      var tk = ticker(target.ticker || target.marketSymbol);
      var evidence = evidenceByTicker[tk] || {};
      var gate = targetGate(target);
      var p = priceGbp(target) || num(evidence.priceGbp);
      var y = yieldPct(target) || num(evidence.yieldPct);
      var broker = accountCode(target.preferredAccount || target.account || target.broker);
      if (broker === 'CHECK') broker = accountCode(evidence.broker);
      var eligible = (gate === 'pass' || gate === 'caution') && target.transferPermitted !== false && p > 0 && y > 0 && broker !== 'CHECK';
      var copy = Object.assign({}, target, {
        livePriceGbp: p > 0 ? p : target.livePriceGbp,
        yieldPct: y > 0 ? y : target.yieldPct,
        preferredAccount: broker !== 'CHECK' ? broker : target.preferredAccount,
        chairmanSimulationCandidate: eligible || target.chairmanSimulationCandidate === true,
        chairmanActiveEvidenceSource: eligible ? 'CACHED_TICKER_EVIDENCE' : null
      });
      if (eligible) {
        copy.approvedForTransfer = true;
        if (batch) copy.approvalBatchId = batch;
      }
      return copy;
    });
    return Object.assign({}, state, {scouting:Object.assign({}, scouting, {targets:targets})});
  }

  var core = window.Aurora2 && window.Aurora2.core;
  if (!core || typeof core.read !== 'function') return;
  var sourceRead = core.read.bind(core);
  if (!window.__auroraChairmanActiveEvidenceSourceRead) window.__auroraChairmanActiveEvidenceSourceRead = sourceRead;
  sourceRead = window.__auroraChairmanActiveEvidenceSourceRead;
  core.read = function () { return enrich(sourceRead()); };

  window.AuroraTransferChairmanActiveEvidence = Object.freeze({
    build:BUILD,
    ready:true,
    readOnly:true,
    mode:'CACHED_TICKER_LOOKUP'
  });
})();