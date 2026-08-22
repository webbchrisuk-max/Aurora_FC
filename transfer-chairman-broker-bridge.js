(function () {
  'use strict';

  var BUILD = '20260822-transfer-chairman-broker-bridge-1';
  var STATE_KEY = 'aurora2:state:v1';
  var BACKUP_KEY = 'aurora2:state:backup:lastgood';

  function arr(value) { return Array.isArray(value) ? value : []; }
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
    var explicit = String(record && (record.securityId || record.security_id) || '').trim();
    var parts = explicit.indexOf(':') >= 0 ? explicit.split(':') : [];
    var rawTicker = record && (record.ticker || record.symbol || record.marketSymbol) || parts.slice(1).join(':');
    return {
      securityId: explicit,
      exchange: exchange(record && (record.exchange || record.exchangeCode) || parts[0]),
      ticker: ticker(rawTicker),
      account: accountCode(record && (record.account || record.broker || record.preferredAccount))
    };
  }
  function securityId(record) {
    var id = identity(record);
    if (id.securityId) return id.securityId;
    return (id.exchange || 'UNKNOWN') + ':' + id.ticker;
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
    return [
      arr(state && state.scouting && state.scouting.targets),
      arr(state && state.scouting && state.scouting.universe),
      arr(state && state.squad && state.squad.holdings),
      arr(state && state.market && state.market.evidence),
      arr(state && state.marketEvidence),
      arr(state && state.marketData && state.marketData.evidence),
      arr(state && state.transfer && state.transfer.marketEvidence),
      arr(state && state.transfer && state.transfer.quotes)
    ].reduce(function (all, rows) {
      return all.concat(rows.filter(function (row) { return sameSecurity(target, row); }));
    }, []);
  }
  function activeHoldings(state) {
    return arr(state && state.squad && state.squad.holdings).filter(function (row) {
      var status = String(row && row.status || '').toUpperCase();
      return ['SOLD','ARCHIVED','CLOSED','EXITED'].indexOf(status) < 0 && Number(row && row.shares || 0) > 0;
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
    state = state || {};
    target = target || {};
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
    return {
      supported: account !== 'CHECK',
      account: account,
      eligible: blockedByExplicit ? [] : eligible,
      source: blockedByExplicit ? 'EXPLICIT_SECURITY_INELIGIBILITY' : (chosen && chosen.source || null)
    };
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

  var existingCore = window.Aurora2 && window.Aurora2.core;
  var sourceRead = existingCore && typeof existingCore.read === 'function' ? existingCore.read.bind(existingCore) : readStoredState;
  if (!window.__auroraChairmanBrokerSourceRead) window.__auroraChairmanBrokerSourceRead = sourceRead;
  sourceRead = window.__auroraChairmanBrokerSourceRead;

  function enrichState(state) {
    if (!state || typeof state !== 'object') return state;
    var scouting = state.scouting || {};
    var targets = arr(scouting.targets).map(function (target) {
      var route = resolveBroker(state, target);
      if (!route.supported) return Object.assign({}, target, { chairmanBrokerSource:route.source || null });
      return Object.assign({}, target, {
        preferredAccount: route.account,
        chairmanResolvedAccount: route.account,
        chairmanBrokerSource: route.source || null
      });
    });
    return Object.assign({}, state, { scouting:Object.assign({}, scouting, { targets:targets }) });
  }

  window.Aurora2 = window.Aurora2 || {};
  window.Aurora2.core = window.Aurora2.core || {};
  window.Aurora2.core.read = function () {
    return enrichState(sourceRead());
  };

  var sample = enrichState(sourceRead());
  var resolved = sample && sample.scouting ? arr(sample.scouting.targets).filter(function (target) {
    return target && target.approvedForTransfer === true && accountCode(target.preferredAccount) !== 'CHECK';
  }).length : 0;
  window.AuroraTransferChairmanBrokerBridge = Object.freeze({
    build: BUILD,
    ready: true,
    readOnly: true,
    resolvedApprovedTargets: resolved,
    resolveBroker: resolveBroker,
    enrichState: enrichState
  });
})();