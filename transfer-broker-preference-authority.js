(function () {
  'use strict';

  var BUILD = '20260822-transfer-broker-authority-1';
  var SOURCE = 'transfer-broker-authority-sync';
  var STATE_KEY = 'aurora2:state:v1';
  var BACKUP_KEY = 'aurora2:state:backup:lastgood';
  var BACKUPS_FIELD = 'brokerRuleBackups';
  var reconciling = false;

  function arr(value) { return Array.isArray(value) ? value : []; }
  function now() { return new Date().toISOString(); }
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
  function accountLabel(value) {
    var code = accountCode(value);
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212 ISA' : 'CHECK';
  }
  function securityId(record) {
    var explicit = String(record && (record.securityId || record.security_id || record.id) || '').trim();
    if (explicit) return explicit;
    return (exchange(record && (record.exchange || record.exchangeCode)) || 'UNKNOWN') + ':' + ticker(record && (record.ticker || record.symbol));
  }
  function sameSecurity(a,b) {
    a = a || {}; b = b || {};
    var aId = String(a.securityId || a.security_id || '').trim();
    var bId = String(b.securityId || b.security_id || '').trim();
    if (aId && bId && aId === bId) return true;
    var aTicker = ticker(a.ticker || a.symbol);
    var bTicker = ticker(b.ticker || b.symbol);
    if (!aTicker || aTicker !== bTicker) return false;
    var aEx = exchange(a.exchange || a.exchangeCode);
    var bEx = exchange(b.exchange || b.exchangeCode);
    return !aEx || !bEx || aEx === bEx;
  }
  function routeLocked(state) {
    return Boolean(state && state.transfer && state.transfer.route && state.transfer.route.locked) ||
      ['LOCKED','PARTIALLY_REGISTERED','COMPLETE','COMPLETED'].indexOf(String(state && state.mission && state.mission.status || '').toUpperCase()) >= 0;
  }
  function readState() {
    var keys = [STATE_KEY,BACKUP_KEY];
    for (var i=0;i<keys.length;i+=1) {
      try {
        var parsed = JSON.parse(localStorage.getItem(keys[i]) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }
  function writeState(next,previous) {
    try {
      localStorage.setItem(BACKUP_KEY,JSON.stringify(previous));
      localStorage.setItem(STATE_KEY,JSON.stringify(Object.assign({},next,{updatedAt:now()})));
      window.dispatchEvent(new CustomEvent('aurora2:state',{detail:{source:SOURCE,build:BUILD}}));
      return true;
    } catch (error) {
      console.error('[Transfer Broker Authority] state write failed',error);
      return false;
    }
  }
  function targetFor(state,targetId,tickerValue) {
    var id = String(targetId || '').trim();
    var tk = ticker(tickerValue);
    return arr(state && state.scouting && state.scouting.targets).find(function (target) {
      return (id && securityId(target) === id) || (tk && ticker(target && target.ticker) === tk);
    }) || null;
  }
  function preferenceFor(state,target) {
    var prefs = state && state.transfer && state.transfer.brokerPreferences || {};
    var raw = prefs[securityId(target)];
    if (raw == null) raw = prefs[ticker(target && target.ticker)];
    var code = accountCode(raw && typeof raw === 'object' ? raw.account : raw);
    var source = String(raw && typeof raw === 'object' ? raw.source || '' : '').toUpperCase();
    return {code:code,source:source,raw:raw};
  }
  function userPreference(state,target) {
    var pref = preferenceFor(state,target);
    if (pref.code === 'CHECK') return 'CHECK';
    if (!pref.source || pref.source === 'TRANSFER_SHORTLIST_USER' || pref.source.indexOf('USER') >= 0) return pref.code;
    return 'CHECK';
  }
  function currentRule(state,target) {
    return arr(state && state.transfer && state.transfer.platformRules).find(function (row) {
      return String(row && row.active != null ? row.active : 'true').toLowerCase() !== 'false' && sameSecurity(target,row);
    }) || null;
  }
  function ruleAccount(rule) {
    return accountCode(rule && (rule.preferred_account || rule.preferredAccount));
  }
  function ruleAllowedAccount(rule) {
    var allowed = String(rule && (rule.allowed_accounts || rule.allowedAccounts) || '');
    var parts = allowed.split(/[,|/]/).map(accountCode).filter(function (code) { return code !== 'CHECK'; });
    return parts.length === 1 ? parts[0] : 'CHECK';
  }
  function backupKey(target) {
    return securityId(target) || ticker(target && target.ticker);
  }

  function applyOverride(state,target,code) {
    if (!state || !target || (code !== 'IG' && code !== 'T212')) return {state:state,changed:false};
    var transfer = Object.assign({},state.transfer || {});
    var rules = arr(transfer.platformRules).slice();
    var backups = Object.assign({},transfer[BACKUPS_FIELD] || {});
    var key = backupKey(target);
    var index = rules.findIndex(function (row) { return sameSecurity(target,row); });
    var existing = index >= 0 ? rules[index] : null;

    if (existing && ruleAccount(existing) === code && ruleAllowedAccount(existing) === code) {
      return {state:state,changed:false};
    }

    if (!Object.prototype.hasOwnProperty.call(backups,key)) {
      backups[key] = existing ? {missing:false,rule:existing} : {missing:true};
    }

    var stamp = now();
    var override = Object.assign({},existing || {},{
      securityId:(existing && (existing.securityId || existing.security_id)) || target.securityId || target.security_id || securityId(target),
      ticker:ticker(target.ticker || target.symbol),
      exchange:(existing && (existing.exchange || existing.exchangeCode)) || target.exchange || target.exchangeCode || '',
      preferred_account:accountLabel(code),
      allowed_accounts:accountLabel(code),
      active:true,
      transferShortlistOverride:true,
      source:'TRANSFER_SHORTLIST_USER',
      note:'Transfer shortlist manual broker override',
      updated_at:stamp,
      updatedAt:stamp
    });

    if (index >= 0) rules[index] = override;
    else rules.unshift(override);
    transfer.platformRules = rules;
    transfer[BACKUPS_FIELD] = backups;
    transfer.updatedAt = stamp;
    return {state:Object.assign({},state,{transfer:transfer}),changed:true};
  }

  function restoreAuto(state,target) {
    if (!state || !target) return {state:state,changed:false};
    var transfer = Object.assign({},state.transfer || {});
    var rules = arr(transfer.platformRules).slice();
    var backups = Object.assign({},transfer[BACKUPS_FIELD] || {});
    var key = backupKey(target);
    var backup = backups[key];
    var index = rules.findIndex(function (row) { return sameSecurity(target,row); });
    var existing = index >= 0 ? rules[index] : null;
    var changed = false;

    if (backup) {
      if (backup.missing) {
        if (index >= 0 && existing && existing.transferShortlistOverride === true) {
          rules.splice(index,1);
          changed = true;
        }
      } else if (backup.rule) {
        if (index >= 0) rules[index] = backup.rule;
        else rules.unshift(backup.rule);
        changed = true;
      }
      delete backups[key];
      changed = true;
    } else if (existing && existing.transferShortlistOverride === true) {
      rules.splice(index,1);
      changed = true;
    }

    if (!changed) return {state:state,changed:false};
    transfer.platformRules = rules;
    transfer[BACKUPS_FIELD] = backups;
    transfer.updatedAt = now();
    return {state:Object.assign({},state,{transfer:transfer}),changed:true};
  }

  function setAuthoritativeBroker(targetId,tickerValue,code) {
    var state = readState();
    if (!state || routeLocked(state)) return false;
    var target = targetFor(state,targetId,tickerValue);
    if (!target) return false;
    var result = code === 'CHECK' ? restoreAuto(state,target) : applyOverride(state,target,code);
    if (!result.changed) return false;
    return writeState(result.state,state);
  }

  function reconcilePreferences() {
    if (reconciling) return;
    var original = readState();
    if (!original || routeLocked(original)) return;
    var state = original;
    var changed = false;
    arr(state && state.scouting && state.scouting.targets).forEach(function (target) {
      var code = userPreference(state,target);
      if (code === 'CHECK') return;
      var result = applyOverride(state,target,code);
      if (result.changed) {
        state = result.state;
        changed = true;
      }
    });
    if (!changed) return;
    reconciling = true;
    writeState(state,original);
    reconciling = false;
  }

  document.addEventListener('change',function (event) {
    var select = event.target && event.target.closest ? event.target.closest('select[data-broker-id]') : null;
    if (!select) return;
    var id = String(select.dataset.brokerId || '');
    var tk = String(select.dataset.brokerTicker || '');
    var code = accountCode(select.value);
    setTimeout(function () { setAuthoritativeBroker(id,tk,code); },0);
  },true);

  function boot() {
    reconcilePreferences();
    window.addEventListener('aurora2:state',function (event) {
      if (event && event.detail && event.detail.source === SOURCE) return;
      setTimeout(reconcilePreferences,0);
    });
    window.addEventListener('pageshow',reconcilePreferences);
    window.addEventListener('focus',reconcilePreferences);
    window.AuroraTransferBrokerPreferenceAuthority = Object.freeze({
      build:BUILD,
      ready:true,
      authoritativeField:'transfer.platformRules',
      setAuthoritativeBroker:setAuthoritativeBroker,
      reconcile:reconcilePreferences
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
