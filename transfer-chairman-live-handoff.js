(function () {
  'use strict';

  var BUILD = '20260822-transfer-chairman-live-handoff-1';

  function arr(value) { return Array.isArray(value) ? value : []; }
  function num(value) {
    var parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
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
  function identity(record) {
    record = record || {};
    var explicit = String(record.securityId || record.security_id || '').trim();
    var parts = explicit.indexOf(':') >= 0 ? explicit.split(':') : [];
    return {
      securityId: explicit,
      exchange: exchange(record.exchange || record.exchangeCode || parts[0]),
      ticker: ticker(record.ticker || record.symbol || record.marketSymbol || parts.slice(1).join(':'))
    };
  }
  function securityId(record) {
    var id = identity(record);
    return id.securityId || ((id.exchange || 'UNKNOWN') + ':' + id.ticker);
  }
  function sameSecurity(a,b) {
    var left = identity(a), right = identity(b);
    if (left.securityId && right.securityId) {
      if (left.securityId === right.securityId) return true;
      return left.ticker && left.ticker === right.ticker && left.exchange === right.exchange;
    }
    if (!left.ticker || left.ticker !== right.ticker) return false;
    if (left.exchange && right.exchange) return left.exchange === right.exchange;
    return true;
  }
  function activeHoldings(state) {
    return arr(state && state.squad && state.squad.holdings).filter(function (row) {
      var status = String(row && row.status || '').toUpperCase();
      return ['SOLD','ARCHIVED','CLOSED','EXITED'].indexOf(status) < 0 && num(row && row.shares) > 0;
    });
  }
  function preferenceFor(state,target) {
    var prefs = state && state.transfer && state.transfer.brokerPreferences || {};
    var raw = prefs[securityId(target)];
    if (raw == null) raw = prefs[ticker(target && target.ticker)];
    return accountCode(raw && typeof raw === 'object' ? raw.account : raw);
  }
  function resolveBroker(state,target) {
    state = state || {}; target = target || {};
    var transfer = state.transfer || {};
    var direct = accountCode(target.preferredAccount || target.account || target.broker);
    var remembered = preferenceFor(state,target);

    var platformRule = arr(transfer.platformRules).find(function (row) {
      return String(row && row.active != null ? row.active : 'true').toLowerCase() !== 'false' && sameSecurity(target,row);
    });
    var platformAccounts = eligibilityAccounts(platformRule && (platformRule.allowed_accounts || platformRule.allowedAccounts));
    var platformPreferred = accountCode(platformRule && (platformRule.preferred_account || platformRule.preferredAccount));

    var explicit = [];
    [target].concat(arr(state && state.scouting && state.scouting.universe).filter(function (row) { return sameSecurity(target,row); }))
      .forEach(function (row) {
        explicit = explicit.concat(eligibilityAccounts(row && row.brokerEligibility));
        if (row && (row.IG === true || row.ig === true || row.igIsaSupported === true || row.igISASupported === true || row.supportsIgIsa === true)) explicit.push('IG');
        if (row && (row.T212 === true || row.t212 === true || row.trading212IsaSupported === true || row.trading212ISASupported === true || row.supportsTrading212Isa === true)) explicit.push('T212');
      });

    var transferConfig = arr(transfer.brokerEligibility).concat(arr(transfer.brokerConfiguration),arr(transfer.eligibleSecurities))
      .filter(function (row) { return sameSecurity(target,row); })
      .reduce(function (all,row) { return all.concat(eligibilityAccounts(row && (row.brokerEligibility || row.accounts || row.eligibleAccounts))); },[]);

    var targetExchange = identity(target).exchange;
    var marketAccounts = arr(transfer.marketSupport).concat(arr(transfer.exchangeSupport))
      .filter(function (row) { return exchange(row && (row.exchange || row.market)) === targetExchange; })
      .reduce(function (all,row) { return all.concat(eligibilityAccounts(row && (row.accounts || row.eligibleAccounts || row.brokerEligibility))); },[]);

    var previousRoute = arr(transfer.route && transfer.route.allocations).concat(arr(transfer.routeEvidence))
      .filter(function (row) { return sameSecurity(target,row); })
      .map(function (row) { return accountCode(row && (row.account || row.broker || row.preferredAccount)); })
      .filter(function (code) { return code !== 'CHECK'; });

    var owned = activeHoldings(state).filter(function (row) { return sameSecurity(target,row); })
      .map(function (row) { return accountCode(row && row.account); }).filter(function (code) { return code !== 'CHECK'; });

    var tiers = [
      {source:'PLATFORM_RULES',accounts:platformAccounts},
      {source:'EXPLICIT_SECURITY_ELIGIBILITY',accounts:explicit},
      {source:'TRANSFER_BROKER_CONFIGURATION',accounts:transferConfig},
      {source:'CANONICAL_MARKET_SUPPORT',accounts:marketAccounts}
    ];
    var chosen = tiers.find(function (tier) { return tier.accounts.length; }) || null;
    var eligible = Array.from(new Set(chosen ? chosen.accounts : []));

    var candidates = [
      {account:platformPreferred,source:'PLATFORM_PREFERRED_BROKER'},
      {account:remembered,source:'SAVED_TRANSFER_PREFERENCE'}
    ].concat(previousRoute.map(function (account) { return {account:account,source:'PREVIOUS_TRANSFER_ROUTE'}; }))
      .concat(owned.map(function (account) { return {account:account,source:'EXISTING_HOLDING'}; }))
      .concat([{account:direct,source:'SCOUTING_PREFERRED_BROKER'}])
      .filter(function (item) { return item.account !== 'CHECK'; });

    var selected = candidates.find(function (item) { return !eligible.length || eligible.indexOf(item.account) >= 0; });
    if (!selected && eligible.length === 1) selected = {account:eligible[0],source:chosen && chosen.source || 'BROKER_ELIGIBILITY'};
    if (!selected && eligible.length > 1) selected = {account:eligible.indexOf('IG') >= 0 ? 'IG' : eligible[0],source:(chosen && chosen.source || 'BROKER_ELIGIBILITY') + '_AUTO'};

    return {account:selected ? selected.account : 'CHECK', source:selected ? selected.source : 'UNRESOLVED', eligible:eligible};
  }

  var core = window.Aurora2 && window.Aurora2.core;
  if (!core || typeof core.read !== 'function') return;
  var sourceRead = core.read.bind(core);

  core.read = function () {
    var state = sourceRead();
    if (!state || typeof state !== 'object') return state;
    var scouting = state.scouting || {};
    var targets = arr(scouting.targets).map(function (target) {
      if (!target) return target;
      var route = resolveBroker(state,target);
      return Object.assign({},target,{
        preferredAccount:route.account !== 'CHECK' ? route.account : target.preferredAccount,
        chairmanResolvedAccount:route.account,
        chairmanBrokerSource:route.source,
        chairmanBrokerEligibleAccounts:route.eligible
      });
    });
    return Object.assign({},state,{scouting:Object.assign({},scouting,{targets:targets})});
  };

  window.AuroraTransferChairmanLiveHandoff = Object.freeze({
    build:BUILD,
    ready:true,
    readOnly:true,
    brokerTruth:'TRANSFER_SHORTLIST',
    resolveBroker:resolveBroker
  });
})();