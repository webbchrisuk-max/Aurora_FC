(() => {
  'use strict';

  const BUILD = '20260822-scouting-unowned-price-guard-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const PRICE_REASON = 'Live GBP execution price is missing.';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`.toUpperCase();

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function writeState(next, previous, source) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(previous));
      localStorage.setItem(STATE_KEY, JSON.stringify({...next, updatedAt:now()}));
      window.dispatchEvent(new CustomEvent('aurora2:state', {detail:{source:source || 'scouting-unowned-price-guard',build:BUILD}}));
      return true;
    } catch (error) {
      console.error('[Scouting Unowned Price Guard] state write failed', error);
      return false;
    }
  }

  function normalizedReasons(target) {
    const reasons = arr(target?.eligibilityReasons).map(value => String(value || '').trim()).filter(Boolean);
    return reasons.filter(reason => reason !== PRICE_REASON);
  }

  function pendingForPriceOnly(target) {
    const status = String(target?.status || '').toLowerCase();
    const recommendation = String(target?.recommendation || '').toUpperCase();
    if (status !== 'pending' && recommendation !== 'DATA PENDING') return false;
    const reasons = arr(target?.eligibilityReasons).map(value => String(value || '').trim()).filter(Boolean);
    return reasons.includes(PRICE_REASON) && reasons.filter(reason => reason !== PRICE_REASON).length === 0;
  }

  function cleanGate(target) {
    const safety = num(target?.dividendSafety ?? target?.legacyPayoutScore);
    const confidence = num(target?.confidence ?? target?.dataQuality);
    const yieldPct = num(target?.yieldPct ?? target?.legacyYieldPct);
    const coverage = num(target?.evidenceCoverage);
    const broker = String(target?.preferredAccount || '').toUpperCase();
    return safety >= 60 && confidence >= 75 && yieldPct <= 10 && coverage >= 80 && broker !== 'CHECK';
  }

  function score(target, strategy) {
    return strategy === 'maximum' ? num(target?.maximumScore) : num(target?.sustainableScore);
  }

  function normalizeTarget(target, strategy) {
    if (!pendingForPriceOnly(target)) return target;
    const clean = cleanGate(target);
    const activeScore = score(target,strategy);
    const recommendation = clean ? (activeScore >= 80 ? 'STRONG BUY' : activeScore >= 70 ? 'BUY' : 'WATCH') : 'CAUTION';
    const status = clean ? 'pass' : 'caution';
    const reasons = normalizedReasons(target);
    reasons.push('Execution price is not a Scouting gate; current price will be resolved before allocation / registration.');
    return {
      ...target,
      status,
      recommendation,
      eligibleForTransfer:true,
      executionPriceStatus:'REQUIRED_AT_EXECUTION',
      livePriceRequiredAtExecution:true,
      scoutingPriceIndependent:true,
      eligibilityReasons:reasons,
      reason:`${recommendation} • Scouting evidence passed without requiring an owned-position live price. Current execution price is required later in Transfer / Registration.`,
      updatedAt:now()
    };
  }

  function normalizeState(state) {
    if (!state || typeof state !== 'object') return {state,changed:false};
    const strategy = String(state?.scouting?.strategy || 'sustainable').toLowerCase() === 'maximum' ? 'maximum' : 'sustainable';
    let changed = false;
    const targets = arr(state?.scouting?.targets).map(target => {
      const next = normalizeTarget(target,strategy);
      if (next !== target) changed = true;
      return next;
    });
    if (!changed) return {state,changed:false};
    return {
      changed:true,
      state:{...state,scouting:{...(state.scouting || {}),targets,updatedAt:now()}}
    };
  }

  function repairStoredState(source) {
    const current = readState();
    const result = normalizeState(current);
    if (!result.changed) return current;
    writeState(result.state,current,source || 'scouting-price-gate-repair');
    return result.state;
  }

  function approvalEligible(target) {
    const status = String(target?.status || '').toLowerCase();
    const recommendation = String(target?.recommendation || '').toUpperCase();
    return target?.transferPermitted !== false && target?.eligibleForTransfer !== false &&
      (target?.eligibleForTransfer === true || status === 'pass' || status === 'caution' || ['BUY','STRONG BUY','CAUTION'].includes(recommendation));
  }

  function approveFromScouting(event) {
    const button = event.target?.closest?.('#approveShortlist');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    let state = repairStoredState('scouting-price-gate-before-approval') || readState();
    if (!state) return;
    const locked = Boolean(state?.transfer?.route?.locked) || ['LOCKED','PARTIALLY_REGISTERED','COMPLETE','COMPLETED'].includes(String(state?.mission?.status || '').toUpperCase());
    if (locked) return;

    const rows = arr(state?.scouting?.targets);
    const eligible = rows.filter(approvalEligible);
    if (!eligible.length) return;

    const approvedAt = now();
    const approvalBatchId = uid('SHORTLIST');
    const ids = new Set(eligible.map(target => String(target?.securityId || target?.id || target?.ticker || '')));
    const next = {
      ...state,
      scouting:{
        ...(state.scouting || {}),
        status:'SCOUTING_READY',
        approvedBatchId:approvalBatchId,
        targets:rows.map(target => {
          const id = String(target?.securityId || target?.id || target?.ticker || '');
          const approved = ids.has(id);
          return {...target,approvedForTransfer:approved,approvedAt:approved ? approvedAt : null,approvalBatchId:approved ? approvalBatchId : null};
        }),
        decisionHistory:[{
          id:uid('SCOUT'),approvedAt,missionId:state?.mission?.id || null,count:eligible.length,
          strategy:state?.scouting?.strategy || 'sustainable',topTicker:eligible[0]?.ticker || null,
          source:'SCOUTING_PRICE_INDEPENDENT_APPROVAL'
        },...arr(state?.scouting?.decisionHistory)].slice(0,20),
        updatedAt:approvedAt
      }
    };
    writeState(next,state,'scouting-price-independent-approval');
  }

  function boot() {
    repairStoredState('scouting-price-gate-boot');
    document.addEventListener('click',approveFromScouting,true);
    window.addEventListener('pageshow',() => repairStoredState('scouting-price-gate-pageshow'));
    window.addEventListener('focus',() => repairStoredState('scouting-price-gate-focus'));
    window.addEventListener('aurora2:state',event => {
      if (event?.detail?.source === 'scouting-price-gate-repair' || event?.detail?.source === 'scouting-price-independent-approval') return;
      setTimeout(() => repairStoredState('scouting-price-gate-repair'),0);
    });
  }

  window.AuroraScoutingUnownedPriceGuard = Object.freeze({build:BUILD,ready:true,rule:'SCOUTING_DOES_NOT_REQUIRE_OWNED_LIVE_PRICE'});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();