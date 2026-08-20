(() => {
  'use strict';

  const BUILD = '20260820-transfer-allocation-preview-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);
  const DEFAULT_MIN = 250;
  const DEFAULT_INCREMENT = 25;
  const DEFAULT_MAX_TARGETS = 8;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, num(value)));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Math.max(0, num(value)));

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function ticker(value) {
    return String(value || '').replace(/^LON:/i, '').replace(/\.L$/i, '').replace(/\..*$/, '').toUpperCase().trim();
  }

  function exchange(value) {
    const raw = String(value || '').trim().toUpperCase();
    const aliases = {LON:'LSE',XLON:'LSE',LONDON:'LSE',XNAS:'NASDAQ',NAS:'NASDAQ',XNYS:'NYSE',TOR:'TSX',XTSE:'TSX'};
    return aliases[raw] || raw;
  }

  function accountCode(value) {
    const lower = String(value || '').toLowerCase();
    if (lower.includes('212')) return 'T212';
    if (/\big\b/.test(lower) || lower.includes('ig isa')) return 'IG';
    const upper = String(value || '').toUpperCase();
    return upper === 'IG' || upper === 'T212' ? upper : 'CHECK';
  }

  function accountLabel(value) {
    const code = accountCode(value);
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212 ISA' : 'Broker unresolved';
  }

  function identity(record) {
    const explicit = String(record?.securityId || record?.security_id || '').trim();
    const parts = explicit.includes(':') ? explicit.split(':') : [];
    const tk = String(record?.ticker || record?.symbol || parts.slice(1).join(':') || '').replace(/^LON:/i, '').replace(/\.L$/i, '').toUpperCase().trim();
    return {
      securityId: explicit,
      exchange: exchange(record?.exchange || record?.exchangeCode || parts[0]),
      ticker: tk,
      account: accountCode(record?.account || record?.broker || record?.preferredAccount)
    };
  }

  function securityId(record) {
    const id = identity(record);
    if (id.securityId) return id.securityId;
    return `${id.exchange || 'UNKNOWN'}:${id.ticker || ticker(record?.ticker)}`;
  }

  function sameSecurity(a, b) {
    const left = identity(a), right = identity(b);
    if (left.securityId && right.securityId) return left.securityId === right.securityId || (left.ticker === right.ticker && left.exchange === right.exchange);
    if (!left.ticker || left.ticker !== right.ticker) return false;
    if (left.exchange && right.exchange) return left.exchange === right.exchange;
    return true;
  }

  function activeHoldings(state) {
    return arr(state?.squad?.holdings).filter(row => !['SOLD','ARCHIVED'].includes(String(row?.status || '').toUpperCase()) && num(row?.shares) > 0);
  }

  function holdingValue(row) {
    const direct = Math.max(0, num(row?.marketValueGbp));
    if (direct > 0) return direct;
    return Math.max(0, num(row?.shares)) * Math.max(0, num(row?.livePriceGbp));
  }

  function evidenceRows(state, target) {
    const sources = [
      ['SCOUTING_TARGET', arr(state?.scouting?.targets)],
      ['SCOUTING_UNIVERSE', arr(state?.scouting?.universe)],
      ['SQUAD_HOLDING', arr(state?.squad?.holdings)],
      ['CURRENT_MARKET_EVIDENCE', arr(state?.market?.evidence).concat(arr(state?.marketEvidence), arr(state?.marketData?.evidence), arr(state?.marketData?.quotes), arr(state?.marketData?.prices))],
      ['TRANSFER_MARKET_EVIDENCE', arr(state?.transfer?.marketEvidence).concat(arr(state?.transfer?.quotes))]
    ];
    return sources.flatMap(([source, rows]) => rows.filter(row => sameSecurity(target, row)).map(row => ({source, row})));
  }

  function normalizePrice(row) {
    const gbp = num(row?.livePriceGbp || row?.priceGbp || row?.live_price_gbp || row?.price_gbp || row?.legacyPriceGbp);
    if (gbp > 0) return gbp;
    const raw = num(row?.livePrice || row?.price || row?.currentPrice || row?.live_price);
    if (!(raw > 0)) return 0;
    const currency = String(row?.currency || row?.quoteCurrency || 'GBP').toUpperCase();
    const unit = String(row?.priceUnit || row?.unit || '').toUpperCase();
    if (currency === 'GBX') return raw / 100;
    if (currency === 'GBP') return ['PENCE','GBX'].includes(unit) ? raw / 100 : raw;
    const fx = num(row?.fxRateToGbp || row?.fxToGbp);
    return fx > 0 ? raw * fx : 0;
  }

  function evidenceTimestamp(row) {
    return row?.quoteUpdatedAt || row?.priceUpdatedAt || row?.asOf || row?.timestamp || row?.sourceUpdatedAt || row?.updatedAt || null;
  }

  function resolvePrice(state, target) {
    const rows = [{source:'SCOUTING_TARGET', row:target}, ...evidenceRows(state, target)];
    const ranked = rows.map(({source, row}) => {
      const price = normalizePrice(row);
      const timestamp = evidenceTimestamp(row);
      const stamp = timestamp ? Date.parse(timestamp) : NaN;
      const stale = Number.isFinite(stamp) && Date.now() - stamp > 36 * 60 * 60 * 1000;
      const sourceRank = source === 'CURRENT_MARKET_EVIDENCE' ? 5 : source === 'TRANSFER_MARKET_EVIDENCE' ? 4 : source === 'SCOUTING_TARGET' ? 3 : 1;
      return {price, timestamp, stale, source, score:(price > 0 ? 100 : 0) + (stale ? 0 : 20) + sourceRank + (Number.isFinite(stamp) ? stamp / 1e15 : 0)};
    }).filter(row => row.price > 0).sort((a,b) => b.score - a.score);
    const best = ranked[0];
    return best ? {supported:true, priceGbp:best.price, timestamp:best.timestamp, stale:best.stale, source:best.source} : {supported:false, priceGbp:0, timestamp:null, stale:false, source:null};
  }

  function yieldPctFrom(value) {
    const raw = String(value ?? '').trim();
    let y = num(raw);
    if (y > 0 && y <= 1 && !raw.includes('%')) y *= 100;
    return Math.max(0, y);
  }

  function resolveIncome(state, target) {
    const rows = [target, ...evidenceRows(state, target).map(item => item.row)];
    for (const row of rows) {
      const y = yieldPctFrom(row?.yieldPct ?? row?.dividendYieldPct ?? row?.dividendYield ?? row?.annualYieldPct ?? row?.legacyYieldPct);
      if (y > 0) return {supported:true, yieldPct:y, source:row === target ? 'SCOUTING_TARGET' : 'MATCHED_EVIDENCE'};
    }
    return {supported:false, yieldPct:0, source:null};
  }

  function eligibilityAccounts(value) {
    if (Array.isArray(value)) return value.map(accountCode).filter(code => code !== 'CHECK');
    if (typeof value === 'string') return value.split(/[,|/]/).map(accountCode).filter(code => code !== 'CHECK');
    if (value && typeof value === 'object') return Object.entries(value).filter(([, allowed]) => allowed === true).map(([broker]) => accountCode(broker)).filter(code => code !== 'CHECK');
    return [];
  }

  function existingExposure(state, target) {
    const rows = activeHoldings(state).filter(row => sameSecurity(target, row));
    return {
      accounts:[...new Set(rows.map(row => identity(row).account).filter(code => code !== 'CHECK'))],
      currentValueGbp:rows.reduce((sum, row) => sum + holdingValue(row), 0)
    };
  }

  function brokerPreference(state, target) {
    const prefs = state?.transfer?.brokerPreferences || {};
    const byId = prefs[securityId(target)];
    const byTicker = prefs[ticker(target?.ticker)];
    const raw = byId ?? byTicker;
    const value = raw && typeof raw === 'object' ? raw.account : raw;
    return accountCode(value);
  }

  function resolveBroker(state, target) {
    const matched = [target, ...evidenceRows(state, target).map(item => item.row)];
    const eligibilityDeclared = matched.some(row => row?.brokerEligibility != null || row?.IG != null || row?.ig != null || row?.T212 != null || row?.t212 != null || row?.igIsaSupported != null || row?.igISASupported != null || row?.supportsIgIsa != null || row?.trading212IsaSupported != null || row?.trading212ISASupported != null || row?.supportsTrading212Isa != null);
    const explicit = matched.flatMap(row => {
      const accounts = eligibilityAccounts(row?.brokerEligibility);
      if (row?.IG === true || row?.ig === true || row?.igIsaSupported === true || row?.igISASupported === true || row?.supportsIgIsa === true) accounts.push('IG');
      if (row?.T212 === true || row?.t212 === true || row?.trading212IsaSupported === true || row?.trading212ISASupported === true || row?.supportsTrading212Isa === true) accounts.push('T212');
      return accounts;
    });

    const platformRule = arr(state?.transfer?.platformRules).find(row => String(row?.active ?? 'true').toLowerCase() !== 'false' && sameSecurity(target, row));
    const platformAccounts = eligibilityAccounts(platformRule?.allowed_accounts || platformRule?.allowedAccounts);
    const platformPreferred = accountCode(platformRule?.preferred_account || platformRule?.preferredAccount);
    const transferConfig = arr(state?.transfer?.brokerEligibility).concat(arr(state?.transfer?.brokerConfiguration), arr(state?.transfer?.eligibleSecurities))
      .filter(row => sameSecurity(target, row)).flatMap(row => eligibilityAccounts(row?.brokerEligibility || row?.accounts || row?.eligibleAccounts));
    const marketSupport = arr(state?.transfer?.marketSupport).concat(arr(state?.transfer?.exchangeSupport))
      .filter(row => exchange(row?.exchange || row?.market) === identity(target).exchange)
      .flatMap(row => eligibilityAccounts(row?.accounts || row?.eligibleAccounts || row?.brokerEligibility));
    const previousRoute = arr(state?.transfer?.route?.allocations).concat(arr(state?.transfer?.routeEvidence))
      .filter(row => sameSecurity(target, row)).map(row => identity(row).account).filter(code => code !== 'CHECK');
    const remembered = brokerPreference(state, target);
    const preferred = accountCode(target?.preferredAccount);
    const owned = existingExposure(state, target).accounts;

    const tiers = [
      {source:'PLATFORM_RULES', accounts:platformAccounts},
      {source:'EXPLICIT_SECURITY_ELIGIBILITY', accounts:explicit},
      {source:'TRANSFER_BROKER_CONFIGURATION', accounts:transferConfig},
      {source:'CANONICAL_MARKET_SUPPORT', accounts:marketSupport},
      {source:'LEGACY_VERIFIED_BROKER', accounts:[remembered, preferred].filter(code => code !== 'CHECK')},
      {source:'EXISTING_ROUTE_EVIDENCE', accounts:previousRoute}
    ];
    const chosen = tiers.find(tier => tier.accounts.length) || null;
    const eligible = chosen ? [...new Set(chosen.accounts)] : [];
    const canonical = [platformPreferred, remembered, ...previousRoute].find(code => eligible.includes(code));
    const ownedAccount = owned.find(code => eligible.includes(code));
    const account = canonical || ownedAccount || (eligible.includes('IG') ? 'IG' : eligible.includes('T212') ? 'T212' : 'CHECK');
    const blockedByExplicit = eligibilityDeclared && !explicit.length && !platformAccounts.length;
    const finalAccount = blockedByExplicit ? 'CHECK' : account;
    return {supported:finalAccount !== 'CHECK', account:finalAccount, eligible:blockedByExplicit ? [] : eligible, source:blockedByExplicit ? 'EXPLICIT_SECURITY_INELIGIBILITY' : chosen?.source || null};
  }

  function resolveCandidate(state, target) {
    const price = resolvePrice(state, target);
    const income = resolveIncome(state, target);
    const broker = resolveBroker(state, target);
    const reasons = [];
    if (!(income.yieldPct > 0)) reasons.push('MISSING_INCOME_EVIDENCE');
    if (!(price.priceGbp > 0)) reasons.push('MISSING_PRICE_EVIDENCE');
    if (!broker.supported) reasons.push('MISSING_BROKER_ROUTE');
    if (target?.transferPermitted === false) reasons.push('TRANSFER_NOT_PERMITTED');
    if (['INELIGIBLE','BLOCKED','NOT_ELIGIBLE'].includes(String(target?.eligibilityStatus || '').toUpperCase())) reasons.push('SECURITY_INELIGIBLE');
    return {
      ...target,
      securityId:securityId(target),
      ticker:ticker(target?.ticker),
      brokerRoute:broker,
      priceEvidence:price,
      yieldPct:income.yieldPct,
      simulationEligible:reasons.length === 0,
      blockingReasons:reasons
    };
  }

  function strategyScore(target, strategy) {
    let base = strategy === 'maximum'
      ? (num(target?.maximumScore) > 0 ? num(target.maximumScore) : Math.min(100, Math.max(0, num(target?.yieldPct)) * 10))
      : (num(target?.sustainableScore) > 0 ? num(target.sustainableScore) : Math.max(1, num(target?.confidence) || (100 - Math.max(1, num(target?.rank)) * 5)));
    if (String(target?.status || '').toLowerCase() === 'caution') base *= 0.82;
    if (String(target?.status || '').toLowerCase() === 'block') return 0;
    return Math.max(0, base);
  }

  function canonicalRank(target, strategy) {
    const value = num(strategy === 'maximum' ? target?.maximumRank : target?.rank);
    return value > 0 ? value : Number.MAX_SAFE_INTEGER;
  }

  function canonicalScore(target, strategy) {
    const value = num(strategy === 'maximum' ? target?.maximumScore : target?.sustainableScore);
    return value > 0 ? value : strategyScore(target, strategy);
  }

  function canonicalPriority(a, b, strategy) {
    return canonicalRank(a, strategy) - canonicalRank(b, strategy) || canonicalScore(b, strategy) - canonicalScore(a, strategy) || securityId(a).localeCompare(securityId(b));
  }

  function returnPriority(target, strategy) {
    const yieldPct = Math.max(0, num(target?.yieldPct));
    const scout = clamp(strategyScore(target, strategy), 0, 100) / 100;
    if (!(yieldPct > 0) || !(scout > 0)) return 0;
    const qualityMultiplier = strategy === 'maximum' ? (0.80 + 0.20 * scout) : (0.55 + 0.45 * scout);
    return yieldPct * qualityMultiplier;
  }

  function roundDown(value, increment) {
    return Math.floor((Math.max(0, value) + 1e-9) / increment) * increment;
  }

  function desiredTargetCount(budget, candidates, maxTargets, requestedMin, increment) {
    const available = candidates.length;
    if (!(budget > 0) || available <= 0) return 0;
    const hardMax = Math.max(1, Math.floor(num(maxTargets) || DEFAULT_MAX_TARGETS));
    const requestedFloor = Math.max(increment, num(requestedMin) || DEFAULT_MIN);
    const affordable = Math.max(1, Math.min(available, hardMax, Math.max(1, Math.floor((budget + 0.001) / requestedFloor))));
    if (affordable <= 1) return affordable;
    const scale = Math.max(1, budget / requestedFloor);
    const softCap = Math.max(1, Math.min(affordable, Math.round(Math.sqrt(scale) * 2)));
    let minimum = 1;
    if (budget >= requestedFloor * 2) minimum = 2;
    if (budget >= requestedFloor * 3) minimum = 3;
    minimum = Math.min(minimum, softCap);
    const top = Math.max(0.0001, num(candidates[0]?._routeScore));
    let count = minimum;
    for (let index = minimum; index < softCap; index += 1) {
      const ratio = Math.max(0, num(candidates[index]?._routeScore)) / top;
      const threshold = index === 3 ? 0.80 : index === 4 ? 0.74 : 0.70;
      if (ratio + 1e-9 >= threshold) count += 1;
      else break;
    }
    return Math.max(1, Math.min(available, hardMax, count));
  }

  function effectiveMinimum(budget, count, increment, requested) {
    if (!(budget > 0) || count <= 0) return increment;
    const requestedFloor = Math.max(increment, num(requested) || DEFAULT_MIN);
    if (budget + 1e-9 >= requestedFloor * count) return requestedFloor;
    const scaled = roundDown(Math.max(increment, (budget / count) * 0.75), increment) || increment;
    return Math.max(increment, Math.min(requestedFloor, scaled));
  }

  function positionCap(budget, count, strategy, status, increment) {
    if (count <= 1) return budget;
    let pct;
    if (count === 2) pct = 0.65;
    else if (strategy === 'maximum') pct = budget < 1000 ? 0.50 : budget < 2500 ? 0.42 : 0.38;
    else pct = budget < 1000 ? 0.45 : budget < 2500 ? 0.36 : 0.32;
    if (String(status || '').toLowerCase() === 'caution') pct = Math.min(pct, count === 2 ? 0.60 : 0.35);
    return Math.max(increment, roundDown(budget * pct, increment));
  }

  function simulate(state) {
    const mission = state?.mission;
    const budget = Math.max(0, num(mission?.approvedBudget));
    const missionStatus = String(mission?.status || '').toUpperCase();
    const strategy = String(state?.scouting?.strategy || '').toLowerCase() === 'maximum' ? 'maximum' : 'sustainable';
    const settings = {brokerScope:'both', minAllocation:DEFAULT_MIN, increment:DEFAULT_INCREMENT, maxTargets:DEFAULT_MAX_TARGETS, ...(state?.transfer?.settings || {})};
    const increment = Math.max(1, num(settings.increment) || DEFAULT_INCREMENT);
    const batch = String(state?.scouting?.approvedBatchId || '');

    const evaluated = arr(state?.scouting?.targets).map(target => resolveCandidate(state, target));
    const approved = evaluated.filter(target => target?.approvedForTransfer === true && (!batch || String(target?.approvalBatchId || '') === batch));
    let candidates = approved
      .filter(target => String(target?.status || '').toLowerCase() !== 'block')
      .filter(target => target.simulationEligible)
      .filter(target => settings.brokerScope === 'both' || target.brokerRoute.account === settings.brokerScope)
      .sort((a,b) => canonicalPriority(a,b,strategy))
      .map(target => ({...target, _routeScore:Math.max(0.0001, returnPriority(target, strategy)), _scoutScore:Math.max(1, canonicalScore(target, strategy))}));

    const gateReady = budget > 0 && ['DRAFT','READY'].includes(missionStatus) && String(state?.scouting?.status || '').toUpperCase() === 'SCOUTING_READY';
    if (!gateReady || candidates.length === 0) {
      return {budget, strategy, missionStatus, approved, evaluated, candidates, allocations:[], allocated:0, remaining:budget, income:0, targetCount:0, exact:false, reason:!gateReady ? 'MISSION_OR_SCOUTING_NOT_READY' : 'NO_EXECUTABLE_TARGETS'};
    }

    const count = desiredTargetCount(budget, candidates, settings.maxTargets, settings.minAllocation, increment);
    candidates = candidates.slice(0, count);
    const minimum = effectiveMinimum(budget, count, increment, settings.minAllocation);
    const scores = candidates.map(target => Math.max(0.0001, target._routeScore));
    const allocations = candidates.map((target, index) => ({
      securityId:target.securityId,
      ticker:target.ticker,
      name:target?.name || target.ticker,
      account:target.brokerRoute.account,
      brokerSource:target.brokerRoute.source,
      amount:0,
      yieldPct:Math.max(0, num(target.yieldPct)),
      expectedAnnualIncome:0,
      estimatedPriceGbp:Math.max(0, num(target.priceEvidence?.priceGbp)),
      scoutingScore:target._scoutScore,
      routeScore:scores[index],
      scoutingStatus:String(target?.status || 'caution').toLowerCase(),
      recommendation:String(target?.recommendation || target?.status || ''),
      blockingReasons:target.blockingReasons || []
    }));

    let remaining = budget;
    allocations.forEach(allocation => {
      const cap = positionCap(budget, count, strategy, allocation.scoutingStatus, increment);
      const seed = Math.min(minimum, remaining, cap);
      allocation.amount = seed;
      remaining -= seed;
    });

    let guard = 0;
    while (remaining >= increment - 0.001 && guard < 10000) {
      guard += 1;
      const average = Math.max(increment, budget / Math.max(1, count));
      const ranked = allocations.map((allocation, index) => {
        const cap = positionCap(budget, count, strategy, allocation.scoutingStatus, increment);
        if (allocation.amount + increment > cap + 0.001) return {index, priority:-Infinity};
        const diminishing = 1 + (allocation.amount / average) * 0.65;
        return {index, priority:scores[index] / diminishing};
      }).sort((a,b) => b.priority - a.priority);
      if (!ranked.length || !Number.isFinite(ranked[0].priority) || ranked[0].priority < 0) break;
      allocations[ranked[0].index].amount += increment;
      remaining -= increment;
    }

    if (remaining > 0.005) {
      const ranked = allocations.map((allocation, index) => ({
        index,
        score:scores[index],
        cap:positionCap(budget, count, strategy, allocation.scoutingStatus, increment)
      })).filter(row => allocations[row.index].amount + remaining <= row.cap + 0.005).sort((a,b) => b.score - a.score);
      if (ranked.length) {
        allocations[ranked[0].index].amount += remaining;
        remaining = 0;
      }
    }

    allocations.forEach(allocation => {
      allocation.amount = Number(Math.max(0, allocation.amount).toFixed(2));
      allocation.expectedAnnualIncome = Number((allocation.amount * (allocation.yieldPct / 100)).toFixed(6));
      allocation.expectedShares = allocation.estimatedPriceGbp > 0 ? Math.floor(allocation.amount / allocation.estimatedPriceGbp) : 0;
    });
    const allocated = Number(allocations.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
    const income = Number(allocations.reduce((sum, row) => sum + row.expectedAnnualIncome, 0).toFixed(6));
    remaining = Number(Math.max(0, budget - allocated).toFixed(2));
    return {budget, strategy, missionStatus, approved, evaluated, candidates, allocations, allocated, remaining, income, targetCount:count, exact:Math.abs(budget - allocated) <= 0.005, minimum, increment, reason:null};
  }

  function ensureStyles() {
    if (document.getElementById('transferAllocationPreviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'transferAllocationPreviewStyles';
    style.textContent = `
      .allocation-preview{margin-top:22px;border:1px solid rgba(255,79,97,.18);border-radius:24px;background:linear-gradient(180deg,rgba(24,7,15,.94),rgba(6,10,18,.95));padding:26px}.allocation-preview-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.allocation-preview-head h2{margin:0;font:900 clamp(28px,5vw,44px)/1 system-ui}.allocation-preview-head p{margin:8px 0 0;color:#a695a1;max-width:760px;line-height:1.5}.allocation-preview-chip{border:1px solid rgba(255,213,107,.28);border-radius:999px;padding:10px 13px;color:#ffe29c;font:800 10px/1 system-ui;letter-spacing:.12em;text-transform:uppercase}.allocation-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:20px}.allocation-kpis div{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px;background:rgba(0,0,0,.15)}.allocation-kpis small{display:block;color:#7e737e;font:800 9px/1.2 system-ui;text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px}.allocation-kpis strong{font:900 17px/1.2 system-ui}.allocation-list{display:grid;gap:10px;margin-top:18px}.allocation-row{display:grid;grid-template-columns:45px minmax(0,1.2fr) minmax(110px,.7fr) minmax(90px,.55fr) minmax(105px,.65fr) minmax(105px,.65fr);gap:12px;align-items:center;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px;background:rgba(0,0,0,.13)}.allocation-rank{font:900 18px/1 system-ui;color:#ff8794}.allocation-name b{display:block;font:900 16px/1.2 system-ui}.allocation-name span,.allocation-cell span{display:block;color:#7c828d;font:700 9px/1.3 system-ui;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}.allocation-cell strong{font:900 15px/1.2 system-ui}.allocation-amount strong{color:#ffe29c}.allocation-income strong{color:#9affbd}.allocation-diagnostics{margin-top:16px;display:grid;gap:8px}.allocation-diag{border:1px solid rgba(255,213,107,.18);border-radius:14px;padding:12px;color:#cbbd96;background:rgba(255,213,107,.03);font:600 13px/1.45 system-ui}.allocation-diag b{color:#ffe29c}.allocation-gate{margin-top:18px;border-radius:16px;padding:16px;border:1px solid rgba(255,255,255,.09);font:600 14px/1.5 system-ui}.allocation-gate.ready{border-color:rgba(89,255,154,.30);background:rgba(89,255,154,.05);color:#abffc8}.allocation-gate.hold{border-color:rgba(255,213,107,.25);background:rgba(255,213,107,.04);color:#ffe2a0}.allocation-gate strong{display:block;font:900 12px/1 system-ui;letter-spacing:.1em;margin-bottom:7px}.allocation-empty{margin-top:18px;border:1px dashed rgba(255,213,107,.16);border-radius:16px;padding:18px;color:#a89b82}
      @media(max-width:900px){.allocation-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.allocation-row{grid-template-columns:40px minmax(0,1fr)}.allocation-cell{grid-column:2}}
      @media(max-width:540px){.allocation-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    let section = document.getElementById('transferAllocationPreview');
    if (section) return section;
    const scouting = document.getElementById('transferScoutingIntake');
    const mission = document.getElementById('transferMissionShell');
    const anchor = scouting || mission;
    if (!anchor) return null;
    section = document.createElement('section');
    section.id = 'transferAllocationPreview';
    section.className = 'allocation-preview';
    anchor.insertAdjacentElement('afterend', section);
    return section;
  }

  function render() {
    ensureStyles();
    const host = ensureSection();
    const state = readState();
    if (!host || !state) return;
    const preview = simulate(state);
    const strategyLabel = preview.strategy === 'maximum' ? 'Maximum Income' : 'Sustainable Income';
    const approvedBlocked = preview.approved.filter(target => !target.simulationEligible);
    const gateReady = preview.allocations.length > 0 && preview.exact && approvedBlocked.length === 0;

    host.innerHTML = `
      <div class="allocation-preview-head">
        <div><span class="transfer-kicker">Stage T3 • Allocation Preview</span><h2>Mission deployment preview</h2><p>The original Transfer allocation rules are running again, but this layer is still read-only. It resolves broker, price and dividend evidence before assigning any preview cash.</p></div>
        <span class="allocation-preview-chip">${esc(strategyLabel)} • PREVIEW ONLY</span>
      </div>
      <div class="allocation-kpis">
        <div><small>Finance budget</small><strong>${money(preview.budget)}</strong></div>
        <div><small>Approved targets</small><strong>${preview.approved.length}</strong></div>
        <div><small>Executable</small><strong>${preview.approved.filter(target => target.simulationEligible).length}</strong></div>
        <div><small>Preview legs</small><strong>${preview.allocations.length}</strong></div>
        <div><small>Allocated</small><strong>${money(preview.allocated)}</strong></div>
        <div><small>Unallocated</small><strong>${money(preview.remaining)}</strong></div>
      </div>
      ${preview.allocations.length ? `<div class="allocation-list">${preview.allocations.map((row, index) => `
        <div class="allocation-row">
          <div class="allocation-rank">#${index + 1}</div>
          <div class="allocation-name"><b>${esc(row.ticker)} • ${esc(row.name)}</b><span>${esc(row.recommendation || row.scoutingStatus)} • score ${Math.round(row.scoutingScore)}/100</span></div>
          <div class="allocation-cell"><strong>${esc(accountLabel(row.account))}</strong><span>Resolved broker</span></div>
          <div class="allocation-cell"><strong>${row.yieldPct.toFixed(2)}%</strong><span>Yield</span></div>
          <div class="allocation-cell allocation-amount"><strong>${money(row.amount)}</strong><span>Preview allocation</span></div>
          <div class="allocation-cell allocation-income"><strong>+${money(row.expectedAnnualIncome)}</strong><span>Est. annual income</span></div>
        </div>`).join('')}</div>` : `<div class="allocation-empty">No executable purchase legs can be previewed yet. ${esc(preview.reason || '')}</div>`}
      ${approvedBlocked.length ? `<div class="allocation-diagnostics">${approvedBlocked.map(target => `<div class="allocation-diag"><b>${esc(target.ticker || target.name || 'Target')}</b> stays at £0 — ${esc((target.blockingReasons || []).join(' • ') || 'execution evidence unresolved')}.</div>`).join('')}</div>` : ''}
      <div class="allocation-gate ${gateReady ? 'ready' : 'hold'}">
        <strong>${gateReady ? 'PREVIEW RECONCILES — READY FOR ROUTE SAVE' : preview.exact && preview.allocations.length ? 'PREVIEW RECONCILES — EVIDENCE ACTION REQUIRED' : 'ROUTE NOT READY'}</strong>
        ${gateReady ? `${money(preview.allocated)} exactly matches the frozen ${money(preview.budget)} Finance mission. Estimated annual income uplift: +${money(preview.income)}. The next stage can save this route with backup protection.` : approvedBlocked.length ? `${approvedBlocked.length} approved target${approvedBlocked.length === 1 ? '' : 's'} still lack executable broker/price/dividend evidence. Transfer will not guess.` : `Allocated ${money(preview.allocated)} of ${money(preview.budget)}; ${money(preview.remaining)} remains intentionally unallocated.`}
      </div>`;

    document.documentElement.dataset.transferAllocationPreview = gateReady ? 'ready' : 'hold';
    window.AuroraTransferAllocationPreview = Object.freeze({
      build: BUILD,
      ready: true,
      readOnly: true,
      strategy: preview.strategy,
      budget: preview.budget,
      approvedTargets: preview.approved.length,
      executableTargets: preview.approved.filter(target => target.simulationEligible).length,
      targetCount: preview.targetCount,
      allocated: preview.allocated,
      remaining: preview.remaining,
      expectedAnnualIncome: preview.income,
      exactReconciliation: preview.exact,
      routeSaveReady: gateReady,
      allocations: preview.allocations.map(row => ({securityId:row.securityId,ticker:row.ticker,account:row.account,amount:row.amount,yieldPct:row.yieldPct,expectedAnnualIncome:row.expectedAnnualIncome,estimatedPriceGbp:row.estimatedPriceGbp,expectedShares:row.expectedShares}))
    });
  }

  function boot() {
    render();
    window.addEventListener('pageshow', render);
    window.addEventListener('focus', render);
    window.addEventListener('aurora2:state', render);
    window.addEventListener('storage', event => {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY) render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
