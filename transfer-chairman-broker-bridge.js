(function () {
  'use strict';

  var BUILD = '20260822-transfer-chairman-global-income-search-3';
  var STATE_KEY = 'aurora2:state:v1';
  var BACKUP_KEY = 'aurora2:state:backup:lastgood';
  var MAX_GLOBAL_CANDIDATES = 24;
  var MAX_SUPPORTED_YIELD = 12;
  var MIN_EVIDENCE = 3;
  var MIN_STRENGTH = 60;
  var MIN_SAFETY = 35;

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
    var aliases = { LON:'LSE', XLON:'LSE', LONDON:'LSE', XNAS:'NASDAQ', NAS:'NASDAQ', XNYS:'NYSE', TOR:'TSX', XTSE:'TSX' };
    return aliases[raw] || raw;
  }
  function accountCode(value) {
    var lower = String(value || '').toLowerCase();
    if (lower.indexOf('212') >= 0) return 'T212';
    if (/\big\b/.test(lower) || lower.indexOf('ig isa') >= 0) return 'IG';
    var upper = String(value || '').toUpperCase();
    return upper === 'IG' || upper === 'T212' ? upper : 'CHECK';
  }
  function identity(record) {
    record = record || {};
    var explicit = String(record.securityId || record.security_id || '').trim();
    var parts = explicit.indexOf(':') >= 0 ? explicit.split(':') : [];
    return {
      securityId: explicit,
      exchange: exchange(record.exchange || record.exchangeCode || parts[0]),
      ticker: ticker(record.ticker || record.symbol || record.marketSymbol || parts.slice(1).join(':')),
      account: accountCode(record.account || record.broker || record.preferredAccount)
    };
  }
  function securityId(record) {
    var id = identity(record);
    return id.securityId || ((id.exchange || 'UNKNOWN') + ':' + id.ticker);
  }
  function sameSecurity(a, b) {
    var left = identity(a), right = identity(b);
    if (left.securityId && right.securityId) {
      if (left.securityId === right.securityId) return true;
      return left.ticker && left.ticker === right.ticker && left.exchange === right.exchange;
    }
    if (!left.ticker || left.ticker !== right.ticker) return false;
    if (left.exchange && right.exchange) return left.exchange === right.exchange;
    return true;
  }
  function targetGate(target) {
    var text = (String(target && target.status || '') + ' ' + String(target && target.recommendation || '')).toLowerCase();
    var eligibility = String(target && target.eligibilityStatus || '').toUpperCase();
    if (text.indexOf('block') >= 0 || ['INELIGIBLE','BLOCKED','NOT_ELIGIBLE'].indexOf(eligibility) >= 0) return 'block';
    if (text.indexOf('pending') >= 0) return 'pending';
    if (text.indexOf('pass') >= 0 || text.indexOf('strong buy') >= 0 || /(^|\s)buy($|\s)/.test(text)) return 'pass';
    if (text.indexOf('caution') >= 0) return 'caution';
    return 'unknown';
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
      return Object.keys(value).filter(function (broker) { return value[broker] === true; }).map(accountCode).filter(function (code) { return code !== 'CHECK'; });
    }
    return [];
  }
  function evidenceRows(state, target) {
    var groups = [
      arr(state && state.scouting && state.scouting.targets),
      arr(state && state.scouting && state.scouting.universe),
      arr(state && state.squad && state.squad.holdings),
      arr(state && state.market && state.market.evidence),
      arr(state && state.marketEvidence),
      arr(state && state.marketData && state.marketData.evidence),
      arr(state && state.marketData && state.marketData.quotes),
      arr(state && state.marketData && state.marketData.prices),
      arr(state && state.transfer && state.transfer.marketEvidence),
      arr(state && state.transfer && state.transfer.quotes)
    ];
    return groups.reduce(function (all, rows) {
      return all.concat(rows.filter(function (row) { return sameSecurity(target, row); }));
    }, []);
  }
  function normalizePrice(row) {
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
  function resolvePrice(state, target) {
    var rows = [target].concat(evidenceRows(state, target));
    for (var i = 0; i < rows.length; i += 1) {
      var price = normalizePrice(rows[i]);
      if (price > 0) return price;
    }
    return 0;
  }
  function yieldFrom(row) {
    row = row || {};
    var source = row.yieldPct != null ? row.yieldPct : row.dividendYieldPct != null ? row.dividendYieldPct : row.dividendYield != null ? row.dividendYield : row.annualYieldPct != null ? row.annualYieldPct : row.legacyYieldPct;
    var value = num(source);
    if (value > 0 && value <= 1 && String(source || '').indexOf('%') < 0) value *= 100;
    return Math.max(0, value);
  }
  function resolveYield(state, target) {
    var rows = [target].concat(evidenceRows(state, target));
    for (var i = 0; i < rows.length; i += 1) {
      var value = yieldFrom(rows[i]);
      if (value > 0) return value;
    }
    return 0;
  }
  function activeHoldings(state) {
    return arr(state && state.squad && state.squad.holdings).filter(function (row) {
      var status = String(row && row.status || '').toUpperCase();
      return ['SOLD','ARCHIVED','CLOSED','EXITED'].indexOf(status) < 0 && num(row && row.shares) > 0;
    });
  }
  function brokerPreference(state, target) {
    var prefs = state && state.transfer && state.transfer.brokerPreferences || {};
    var raw = prefs[securityId(target)];
    if (raw == null) raw = prefs[ticker(target && target.ticker)];
    var value = raw && typeof raw === 'object' ? raw.account : raw;
    return accountCode(value);
  }
  function resolveBroker(state, target) {
    state = state || {}; target = target || {};
    var matched = [target].concat(evidenceRows(state, target));
    var eligibilityDeclared = matched.some(function (row) {
      return row && (row.brokerEligibility != null || row.IG != null || row.ig != null || row.T212 != null || row.t212 != null ||
        row.igIsaSupported != null || row.igISASupported != null || row.supportsIgIsa != null ||
        row.trading212IsaSupported != null || row.trading212ISASupported != null || row.supportsTrading212Isa != null);
    });
    var explicit = matched.reduce(function (all, row) {
      var accounts = eligibilityAccounts(row && row.brokerEligibility);
      if (row && (row.IG === true || row.ig === true || row.igIsaSupported === true || row.igISASupported === true || row.supportsIgIsa === true)) accounts.push('IG');
      if (row && (row.T212 === true || row.t212 === true || row.trading212IsaSupported === true || row.trading212ISASupported === true || row.supportsTrading212Isa === true)) accounts.push('T212');
      return all.concat(accounts);
    }, []);
    var platformRule = arr(state && state.transfer && state.transfer.platformRules).find(function (row) {
      return String(row && row.active != null ? row.active : 'true').toLowerCase() !== 'false' && sameSecurity(target, row);
    });
    var platformAccounts = eligibilityAccounts(platformRule && (platformRule.allowed_accounts || platformRule.allowedAccounts));
    var platformPreferred = accountCode(platformRule && (platformRule.preferred_account || platformRule.preferredAccount));
    var transferConfig = arr(state && state.transfer && state.transfer.brokerEligibility)
      .concat(arr(state && state.transfer && state.transfer.brokerConfiguration), arr(state && state.transfer && state.transfer.eligibleSecurities))
      .filter(function (row) { return sameSecurity(target, row); })
      .reduce(function (all, row) { return all.concat(eligibilityAccounts(row && (row.brokerEligibility || row.accounts || row.eligibleAccounts))); }, []);
    var targetExchange = identity(target).exchange;
    var marketSupport = arr(state && state.transfer && state.transfer.marketSupport)
      .concat(arr(state && state.transfer && state.transfer.exchangeSupport))
      .filter(function (row) { return exchange(row && (row.exchange || row.market)) === targetExchange; })
      .reduce(function (all, row) { return all.concat(eligibilityAccounts(row && (row.accounts || row.eligibleAccounts || row.brokerEligibility))); }, []);
    var previousRoute = arr(state && state.transfer && state.transfer.route && state.transfer.route.allocations)
      .concat(arr(state && state.transfer && state.transfer.routeEvidence))
      .filter(function (row) { return sameSecurity(target, row); })
      .map(function (row) { return identity(row).account; }).filter(function (code) { return code !== 'CHECK'; });
    var remembered = brokerPreference(state, target);
    var preferred = accountCode(target && target.preferredAccount);
    var owned = activeHoldings(state).filter(function (row) { return sameSecurity(target, row); })
      .map(function (row) { return identity(row).account; }).filter(function (code) { return code !== 'CHECK'; });
    var tiers = [
      { source:'PLATFORM_RULES', accounts:platformAccounts },
      { source:'EXPLICIT_SECURITY_ELIGIBILITY', accounts:explicit },
      { source:'TRANSFER_BROKER_CONFIGURATION', accounts:transferConfig },
      { source:'CANONICAL_MARKET_SUPPORT', accounts:marketSupport },
      { source:'LEGACY_VERIFIED_BROKER', accounts:[remembered, preferred].filter(function (code) { return code !== 'CHECK'; }) },
      { source:'EXISTING_ROUTE_EVIDENCE', accounts:previousRoute }
    ];
    var chosen = tiers.find(function (tier) { return tier.accounts.length; }) || null;
    var eligible = chosen ? Array.from(new Set(chosen.accounts)) : [];
    var canonical = [platformPreferred, remembered].concat(previousRoute).find(function (code) { return eligible.indexOf(code) >= 0; });
    var ownedAccount = owned.find(function (code) { return eligible.indexOf(code) >= 0; });
    var account = canonical || ownedAccount || (eligible.indexOf('IG') >= 0 ? 'IG' : eligible.indexOf('T212') >= 0 ? 'T212' : 'CHECK');
    var blockedByExplicit = eligibilityDeclared && !explicit.length && !platformAccounts.length;
    if (blockedByExplicit) account = 'CHECK';
    return { supported:account !== 'CHECK', account:account, eligible:blockedByExplicit ? [] : eligible, source:blockedByExplicit ? 'EXPLICIT_SECURITY_INELIGIBILITY' : (chosen && chosen.source || null) };
  }
  function incomeScoreFromYield(value) {
    var y = Math.max(0, num(value));
    if (!y) return 0;
    if (y <= 2) return clamp(35 + y * 12.5, 0, 100);
    if (y <= 6) return clamp(60 + (y - 2) * 8, 0, 100);
    if (y <= 8) return clamp(92 + (y - 6) * 4, 0, 100);
    if (y <= 10) return clamp(100 - (y - 8) * 5, 0, 100);
    return clamp(90 - (y - 10) * 10, 30, 90);
  }
  function globalProfile(state, row) {
    row = row || {};
    var tk = ticker(row.ticker || row.marketSymbol);
    var y = resolveYield(state, row);
    var price = resolvePrice(state, row);
    var route = resolveBroker(state, row);
    var evidence = num(row.evidenceCount);
    var strength = num(row.legacyStrength || row.buyStrength || row.strength);
    var safety = num(row.legacyPayoutScore || row.dividendSafety || row.payoutScore);
    var valuation = num(row.legacyValuationScore || row.valuationScore);
    var growth = num(row.legacyGrowthScore || row.dividendGrowth || row.growthScore);
    var quality = num(row.legacyBusinessQuality || row.businessQuality || row.qualityScore);
    var sourceStatus = String(row.sourceStatus || row.status || '').toLowerCase();
    var risk = String(row.legacyPayoutRisk || row.payoutRisk || '').toLowerCase();
    var signals = [price > 0, y > 0, safety > 0, valuation > 0, growth > 0, quality > 0, evidence >= 5].filter(Boolean).length;
    var confidence = clamp(35 + signals * 9, 35, 92);
    var blockers = [];
    if (!tk || tk === 'TSCO') blockers.push('LOCKED_OR_MISSING_TICKER');
    if (!(y > 0)) blockers.push('NO_YIELD');
    if (y > MAX_SUPPORTED_YIELD) blockers.push('YIELD_ABOVE_REVIEW_CEILING');
    if (!(price > 0)) blockers.push('NO_PRICE');
    if (!route.supported) blockers.push('NO_BROKER');
    if (evidence < MIN_EVIDENCE) blockers.push('THIN_EVIDENCE');
    if (strength < MIN_STRENGTH) blockers.push('LOW_SCOUT_STRENGTH');
    if (safety < MIN_SAFETY) blockers.push('LOW_DIVIDEND_SAFETY');
    if (/suspend|cancel|omit|avoid|sell/.test(sourceStatus)) blockers.push('NEGATIVE_SOURCE_STATUS');
    if (/very high|extreme/.test(risk)) blockers.push('PAYOUT_RISK_TOO_HIGH');
    if (confidence < 50) blockers.push('LOW_CONFIDENCE');
    var caution = y > 10 || safety < 60 || confidence < 75;
    var incomeScore = incomeScoreFromYield(y);
    var sustainableScore = clamp(strength * .28 + safety * .27 + valuation * .14 + growth * .10 + quality * .08 + incomeScore * .13, 0, 100);
    var safetyFactor = .72 + .28 * clamp(safety, 0, 100) / 100;
    var maximumScore = clamp(y * 9 * safetyFactor + strength * .08 + confidence * .05, 0, 100);
    return {
      eligible:blockers.length === 0,
      blockers:blockers,
      ticker:tk,
      yieldPct:y,
      priceGbp:price,
      broker:route.account,
      brokerSource:route.source,
      evidence:evidence,
      strength:strength,
      safety:safety,
      confidence:confidence,
      status:caution ? 'caution' : 'pass',
      sustainableScore:sustainableScore,
      maximumScore:maximumScore
    };
  }
  function makeGlobalCandidate(state, row, profile, batch) {
    return Object.assign({}, row, {
      id:'CHAIRMAN-' + securityId(row),
      securityId:securityId(row),
      ticker:profile.ticker,
      name:String(row.name || profile.ticker),
      preferredAccount:profile.broker,
      livePriceGbp:profile.priceGbp,
      yieldPct:profile.yieldPct,
      confidence:profile.confidence,
      dividendSafety:profile.safety,
      sustainableScore:profile.sustainableScore,
      maximumScore:profile.maximumScore,
      status:profile.status,
      recommendation:profile.status === 'pass' ? 'PASS' : 'CAUTION',
      approvedForTransfer:true,
      approvalBatchId:batch || null,
      transferPermitted:true,
      chairmanSimulationCandidate:true,
      chairmanGlobalCandidate:true,
      chairmanBrokerSource:profile.brokerSource,
      chairmanEvidenceCount:profile.evidence,
      source:'CHAIRMAN_GLOBAL_INCOME_SEARCH'
    });
  }
  function rankChairmanTargets(targets) {
    var sustainable = targets.slice().sort(function (a, b) {
      var gateA = targetGate(a) === 'pass' ? 0 : 1;
      var gateB = targetGate(b) === 'pass' ? 0 : 1;
      return gateA - gateB || num(b.sustainableScore) - num(a.sustainableScore) || resolveYield({}, b) - resolveYield({}, a);
    });
    sustainable.forEach(function (target, index) { target.rank = index + 1; });
    var maximum = targets.slice().sort(function (a, b) {
      return num(b.maximumScore) - num(a.maximumScore) || resolveYield({}, b) - resolveYield({}, a) || num(b.dividendSafety) - num(a.dividendSafety);
    });
    maximum.forEach(function (target, index) { target.maximumRank = index + 1; });
    return sustainable;
  }
  function readStoredState() {
    for (var i = 0; i < [STATE_KEY, BACKUP_KEY].length; i += 1) {
      try {
        var parsed = JSON.parse(localStorage.getItem([STATE_KEY, BACKUP_KEY][i]) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  var existingCore = window.Aurora2 && window.Aurora2.core;
  var sourceRead = existingCore && typeof existingCore.read === 'function' ? existingCore.read.bind(existingCore) : readStoredState;
  if (!window.__auroraChairmanCandidateSourceRead) window.__auroraChairmanCandidateSourceRead = sourceRead;
  sourceRead = window.__auroraChairmanCandidateSourceRead;

  function enrichState(state) {
    if (!state || typeof state !== 'object') return state;
    var scouting = state.scouting || {};
    var batch = String(scouting.approvedBatchId || '');
    var activeTargets = arr(scouting.targets).map(function (target) {
      var gate = targetGate(target);
      var route = resolveBroker(state, target);
      var price = resolvePrice(state, target);
      var incomeYield = resolveYield(state, target);
      var simulationEligible = (gate === 'pass' || gate === 'caution') && target.transferPermitted !== false && route.supported && price > 0 && incomeYield > 0;
      var copy = Object.assign({}, target, {
        livePriceGbp:price > 0 ? price : target.livePriceGbp,
        yieldPct:incomeYield > 0 ? incomeYield : target.yieldPct,
        chairmanResolvedAccount:route.account,
        chairmanBrokerSource:route.source || null,
        chairmanSimulationCandidate:simulationEligible
      });
      if (route.supported) copy.preferredAccount = route.account;
      if (simulationEligible) {
        copy.approvedForTransfer = true;
        if (batch) copy.approvalBatchId = batch;
      }
      return copy;
    });

    var existingIds = new Set(activeTargets.map(function (target) { return securityId(target); }));
    var global = arr(scouting.universe).map(function (row) {
      return { row:row, profile:globalProfile(state, row) };
    }).filter(function (item) {
      return item.profile.eligible && !existingIds.has(securityId(item.row));
    }).sort(function (a, b) {
      return b.profile.maximumScore - a.profile.maximumScore || b.profile.yieldPct - a.profile.yieldPct || b.profile.safety - a.profile.safety;
    }).slice(0, MAX_GLOBAL_CANDIDATES).map(function (item) {
      return makeGlobalCandidate(state, item.row, item.profile, batch);
    });

    var combined = rankChairmanTargets(activeTargets.concat(global));
    return Object.assign({}, state, { scouting:Object.assign({}, scouting, { targets:combined }) });
  }

  window.Aurora2 = window.Aurora2 || {};
  window.Aurora2.core = window.Aurora2.core || {};
  window.Aurora2.core.read = function () { return enrichState(sourceRead()); };

  var sample = enrichState(sourceRead());
  var active = sample && sample.scouting ? arr(sample.scouting.targets).filter(function (target) { return target && target.chairmanSimulationCandidate === true; }) : [];
  var globalCount = active.filter(function (target) { return target.chairmanGlobalCandidate === true; }).length;
  window.AuroraTransferChairmanBrokerBridge = Object.freeze({
    build:BUILD,
    ready:true,
    readOnly:true,
    mode:'GLOBAL_INCOME_REPLACEMENT_SEARCH',
    simulationCandidates:active.length,
    globalCandidates:globalCount,
    candidateTickers:active.map(function (target) { return ticker(target.ticker); }),
    resolveBroker:resolveBroker,
    resolvePrice:resolvePrice,
    resolveYield:resolveYield,
    globalProfile:globalProfile,
    enrichState:enrichState
  });
})();