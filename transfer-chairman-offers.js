(() => {
  'use strict';

  const BUILD = '20260822-transfer-chairman-offers-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const CUSTOM_KEY = 'aurora:transfer:chairman-custom:v1';
  const DEFAULT_MIN = 250;
  const DEFAULT_INCREMENT = 25;
  const DEFAULT_MAX_TARGETS = 8;
  const LEGACY_LOCKED = new Set(['TSCO']);
  if (window.__auroraTransferChairmanOffers) return;
  window.__auroraTransferChairmanOffers = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const raw = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const num = value => raw(value) ?? 0;
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, num(value)));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value) || 0);
  const pct = value => `${Number(value || 0) >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}%`;

  let selectedKey = '';
  let saleFraction = 0.5;
  let lens = 'sustainable';
  let customIds = new Set();
  let rendering = false;

  function readState() {
    try {
      const core = window.Aurora2?.core?.read?.();
      if (core && typeof core === 'object') return core;
    } catch (_) {}
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function ticker(value) {
    return String(value || '').replace(/^LON:/i, '').replace(/\.L$/i, '').replace(/\.GB$/i, '').replace(/\..*$/, '').toUpperCase().trim();
  }
  function accountCode(value) {
    const s = String(value || '').toLowerCase();
    if (s.includes('212')) return 'T212';
    if (/\big\b/.test(s) || s.includes('ig isa')) return 'IG';
    const u = String(value || '').toUpperCase();
    return u === 'IG' || u === 'T212' ? u : 'CHECK';
  }
  function accountLabel(value) {
    const code = accountCode(value);
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212 ISA' : 'Broker unresolved';
  }
  function holdingKey(row) {
    return String(row?.id || `${accountCode(row?.account)}|${ticker(row?.ticker)}`);
  }
  function activeHoldings(state) {
    return arr(state?.squad?.holdings).filter(row => !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(String(row?.status || '').toUpperCase()) && num(row?.shares) > 0);
  }
  function holdingMetrics(row) {
    const shares = Math.max(0, num(row?.shares));
    const live = Math.max(0, num(row?.livePriceGbp ?? row?.live_price_gbp ?? row?.priceGbp ?? row?.price));
    const directValue = Math.max(0, num(row?.marketValueGbp ?? row?.market_value_gbp ?? row?.marketValue));
    const value = directValue > 0 ? directValue : shares * live;
    const book = Math.max(0, num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.bookCost));
    const dps = Math.max(0, num(row?.annualDpsGbp ?? row?.annual_dps_gbp ?? row?.annualDps));
    const directIncome = Math.max(0, num(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? row?.annualIncome));
    const income = directIncome > 0 ? directIncome : shares * dps;
    const profit = value - book;
    const profitPct = book > 0 ? profit / book * 100 : 0;
    const currentYield = value > 0 ? income / value * 100 : 0;
    return { shares, live, value, book, income, profit, profitPct, currentYield };
  }
  function materiality(state, row, metrics = holdingMetrics(row)) {
    const all = activeHoldings(state).map(holdingMetrics);
    const totalValue = all.reduce((sum, item) => sum + item.value, 0);
    const totalIncome = all.reduce((sum, item) => sum + item.income, 0);
    const valueFloor = Math.max(100, totalValue * 0.001);
    const profitFloor = Math.max(10, totalValue * 0.0002);
    const incomeFloor = Math.max(5, totalIncome * 0.005);
    return {
      micro: metrics.value < valueFloor && Math.abs(metrics.profit) < profitFloor && metrics.income < incomeFloor,
      totalValue, totalIncome, valueFloor, profitFloor, incomeFloor
    };
  }
  function lockedHolding(row) {
    return Boolean(row?.locked) || String(row?.status || '').toUpperCase() === 'LOCKED' || LEGACY_LOCKED.has(ticker(row?.ticker));
  }
  function triggerFor(state, row) {
    const metrics = holdingMetrics(row);
    const mat = materiality(state, row, metrics);
    if (lockedHolding(row)) return { code:'locked', label:'LOCKED', metrics, mat, level:0 };
    if (mat.micro && metrics.profitPct >= 6) return { code:'micro', label:'MICRO', metrics, mat, level:1 };
    if (metrics.profitPct >= 10) return { code:'strong', label:'+10%', metrics, mat, level:3 };
    if (metrics.profitPct >= 6) return { code:'review', label:'+6%', metrics, mat, level:2 };
    return { code:'keep', label:'KEEP', metrics, mat, level:0 };
  }
  function offers(state) {
    return activeHoldings(state)
      .map(row => ({ row, ...triggerFor(state, row) }))
      .filter(item => item.metrics.profitPct >= 6 || (lockedHolding(item.row) && item.metrics.profitPct >= 6))
      .sort((a,b) => b.level - a.level || b.metrics.profit - a.metrics.profit || b.metrics.value - a.metrics.value);
  }

  function parseDate(value) {
    if (!value) return null;
    const text = String(value).slice(0,10);
    const date = new Date(`${text}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function dayDiff(from, to) {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
  }
  function eventDps(event) {
    const values = [event?.dividendPerShareGbp,event?.dividend_per_share_gbp,event?.dpsGbp,event?.dps,event?.dividendPerShare,event?.dividend_per_share];
    for (const value of values) if (num(value) > 0) return num(value);
    return 0;
  }
  function nextExDate(state, row, scenario) {
    const tk = ticker(row?.ticker), account = accountCode(row?.account);
    const today = new Date(); today.setHours(0,0,0,0);
    const candidates = arr(state?.income?.calendar)
      .filter(event => !['CANCELLED','ARCHIVED'].includes(String(event?.status || '').toUpperCase()))
      .filter(event => ticker(event?.ticker) === tk)
      .filter(event => {
        const code = accountCode(event?.account);
        return code === account || code === 'CHECK' || account === 'CHECK';
      })
      .map(event => ({ ...event, date:parseDate(event?.exDate || event?.ex_date) }))
      .filter(event => event.date && event.date.getTime() >= today.getTime())
      .sort((a,b) => a.date - b.date);
    const event = candidates[0];
    if (!event) return null;
    const dps = eventDps(event);
    const fullExpected = Math.max(0, num(event?.expectedAmountGbp ?? event?.expected_amount_gbp ?? event?.grossDividendGbp ?? event?.gross_dividend_gbp));
    const dividendAtRisk = dps > 0 ? scenario.sharesSold * dps : fullExpected > 0 ? fullExpected * scenario.fraction : 0;
    return { ...event, exDate:event?.exDate || event?.ex_date, days:dayDiff(today,event.date), dps, dividendAtRisk };
  }

  function targetGate(target) {
    const status = String(target?.status || '').trim().toLowerCase();
    const recommendation = String(target?.recommendation || '').trim().toLowerCase();
    const joined = `${status} ${recommendation}`;
    if (joined.includes('block') || ['INELIGIBLE','BLOCKED','NOT_ELIGIBLE'].includes(String(target?.eligibilityStatus || '').toUpperCase())) return 'block';
    if (joined.includes('caution')) return 'caution';
    if (joined.includes('pass')) return 'pass';
    return 'unknown';
  }
  function candidateId(target) {
    return String(target?.securityId || target?.security_id || target?.id || `${String(target?.exchange || 'LSE').toUpperCase()}:${ticker(target?.ticker)}`);
  }
  function yieldPct(target) {
    const source = target?.yieldPct ?? target?.dividendYieldPct ?? target?.dividendYield ?? target?.annualYieldPct ?? target?.legacyYieldPct;
    let value = num(source);
    if (value > 0 && value <= 1 && !String(source ?? '').includes('%')) value *= 100;
    return Math.max(0, value);
  }
  function priceGbp(target) {
    const direct = num(target?.livePriceGbp ?? target?.priceGbp ?? target?.live_price_gbp ?? target?.price_gbp ?? target?.legacyPriceGbp);
    if (direct > 0) return direct;
    const value = num(target?.livePrice ?? target?.price ?? target?.currentPrice);
    if (!(value > 0)) return 0;
    const currency = String(target?.currency || target?.quoteCurrency || 'GBP').toUpperCase();
    const unit = String(target?.priceUnit || target?.unit || '').toUpperCase();
    if (currency === 'GBX' || ['PENCE','GBX'].includes(unit)) return value / 100;
    return currency === 'GBP' ? value : 0;
  }
  function eligibilityAccounts(value) {
    if (Array.isArray(value)) return value.map(accountCode).filter(code => code !== 'CHECK');
    if (typeof value === 'string') return value.split(/[,|/]/).map(accountCode).filter(code => code !== 'CHECK');
    if (value && typeof value === 'object') return Object.entries(value).filter(([,allowed]) => allowed === true).map(([name]) => accountCode(name)).filter(code => code !== 'CHECK');
    return [];
  }
  function resolveBroker(state, target) {
    const preferred = accountCode(target?.preferredAccount || target?.account || target?.broker);
    const explicit = eligibilityAccounts(target?.brokerEligibility || target?.eligibleAccounts || target?.accounts);
    const rule = arr(state?.transfer?.platformRules).find(item => ticker(item?.ticker) === ticker(target?.ticker) && String(item?.active ?? 'true').toLowerCase() !== 'false');
    const ruleAccounts = eligibilityAccounts(rule?.allowed_accounts || rule?.allowedAccounts);
    const rulePreferred = accountCode(rule?.preferred_account || rule?.preferredAccount);
    const owned = activeHoldings(state).filter(item => ticker(item?.ticker) === ticker(target?.ticker)).map(item => accountCode(item?.account)).filter(code => code !== 'CHECK');
    const eligible = [...new Set([...ruleAccounts,...explicit,...owned])];
    const chosen = [rulePreferred,preferred,...owned,'IG','T212'].find(code => code !== 'CHECK' && (!eligible.length || eligible.includes(code))) || 'CHECK';
    return { account:chosen, eligible, supported:chosen !== 'CHECK' };
  }
  function strategyScore(target, strategy) {
    let base = strategy === 'maximum'
      ? (num(target?.maximumScore) > 0 ? num(target.maximumScore) : Math.min(100, yieldPct(target) * 10))
      : (num(target?.sustainableScore) > 0 ? num(target.sustainableScore) : Math.max(1, num(target?.confidence) || (100 - Math.max(1, num(target?.rank)) * 5)));
    if (targetGate(target) === 'caution') base *= 0.82;
    if (targetGate(target) === 'block') return 0;
    return Math.max(0, base);
  }
  function canonicalRank(target, strategy) {
    const value = num(strategy === 'maximum' ? target?.maximumRank : target?.rank);
    return value > 0 ? value : Number.MAX_SAFE_INTEGER;
  }
  function returnPriority(target, strategy) {
    const y = yieldPct(target);
    const scout = clamp(strategyScore(target,strategy),0,100) / 100;
    if (!(y > 0) || !(scout > 0)) return 0;
    const qualityMultiplier = strategy === 'maximum' ? (0.80 + 0.20 * scout) : (0.55 + 0.45 * scout);
    return y * qualityMultiplier;
  }
  function approvedCandidates(state, excludeTicker) {
    const batch = String(state?.scouting?.approvedBatchId || '');
    return arr(state?.scouting?.targets)
      .filter(target => target?.approvedForTransfer === true)
      .filter(target => !batch || String(target?.approvalBatchId || '') === batch)
      .filter(target => ['pass','caution'].includes(targetGate(target)))
      .filter(target => ticker(target?.ticker) && ticker(target?.ticker) !== excludeTicker && ticker(target?.ticker) !== 'TSCO')
      .map(target => {
        const broker = resolveBroker(state,target);
        const y = yieldPct(target);
        const price = priceGbp(target);
        return {
          ...target,
          _id:candidateId(target),
          _ticker:ticker(target?.ticker),
          _gate:targetGate(target),
          _broker:broker,
          _yield:y,
          _price:price,
          _eligible:y > 0 && price > 0 && broker.supported && target?.transferPermitted !== false
        };
      })
      .filter(target => target._eligible);
  }

  function roundDown(value, increment) {
    return Math.floor((Math.max(0,value) + 1e-9) / increment) * increment;
  }
  function desiredTargetCount(budget,candidates,maxTargets,requestedMin,increment) {
    const available = candidates.length;
    if (!(budget > 0) || available <= 0) return 0;
    const hardMax = Math.max(1,Math.floor(num(maxTargets) || DEFAULT_MAX_TARGETS));
    const floor = Math.max(increment,num(requestedMin) || DEFAULT_MIN);
    const affordable = Math.max(1,Math.min(available,hardMax,Math.max(1,Math.floor((budget + 0.001) / floor))));
    if (affordable <= 1) return affordable;
    const scale = Math.max(1,budget / floor);
    const softCap = Math.max(1,Math.min(affordable,Math.round(Math.sqrt(scale) * 2)));
    let minimum = 1;
    if (budget >= floor * 2) minimum = 2;
    if (budget >= floor * 3) minimum = 3;
    minimum = Math.min(minimum,softCap);
    const top = Math.max(0.0001,num(candidates[0]?._routeScore));
    let count = minimum;
    for (let index=minimum; index<softCap; index += 1) {
      const ratio = Math.max(0,num(candidates[index]?._routeScore)) / top;
      const threshold = index === 3 ? 0.80 : index === 4 ? 0.74 : 0.70;
      if (ratio + 1e-9 >= threshold) count += 1; else break;
    }
    return Math.max(1,Math.min(available,hardMax,count));
  }
  function effectiveMinimum(budget,count,increment,requested) {
    if (!(budget > 0) || count <= 0) return increment;
    const floor = Math.max(increment,num(requested) || DEFAULT_MIN);
    if (budget + 1e-9 >= floor * count) return floor;
    const scaled = roundDown(Math.max(increment,(budget / count) * 0.75),increment) || increment;
    return Math.max(increment,Math.min(floor,scaled));
  }
  function positionCap(budget,count,strategy,status,increment) {
    if (count <= 1) return budget;
    let share;
    if (count === 2) share = 0.65;
    else if (strategy === 'maximum') share = budget < 1000 ? 0.50 : budget < 2500 ? 0.42 : 0.38;
    else share = budget < 1000 ? 0.45 : budget < 2500 ? 0.36 : 0.32;
    if (status === 'caution') share = Math.min(share,count === 2 ? 0.60 : 0.35);
    return Math.max(increment,roundDown(budget * share,increment));
  }

  function allocateRotation(state,budget,sourceTicker,lensName) {
    const settings = { minAllocation:DEFAULT_MIN, increment:DEFAULT_INCREMENT, maxTargets:DEFAULT_MAX_TARGETS, ...(state?.transfer?.settings || {}) };
    const increment = Math.max(1,num(settings.increment) || DEFAULT_INCREMENT);
    const strategy = lensName === 'maximum' ? 'maximum' : 'sustainable';
    let candidates = approvedCandidates(state,sourceTicker)
      .filter(target => lensName !== 'custom' || customIds.has(target._id))
      .map(target => ({ ...target, _routeScore:Math.max(0.0001,returnPriority(target,strategy)), _scoutScore:Math.max(1,strategyScore(target,strategy)) }))
      .sort((a,b) => canonicalRank(a,strategy) - canonicalRank(b,strategy) || b._scoutScore - a._scoutScore || b._routeScore - a._routeScore || a._ticker.localeCompare(b._ticker));

    if (!(budget > 0) || !candidates.length) return { strategy:lensName, allocations:[], allocated:0, remaining:round2(budget), income:0, candidates, reason:lensName === 'custom' && !customIds.size ? 'CUSTOM_BASKET_EMPTY' : 'NO_EXECUTABLE_REPLACEMENTS' };
    const count = desiredTargetCount(budget,candidates,settings.maxTargets,settings.minAllocation,increment);
    candidates = candidates.slice(0,count);
    const minimum = effectiveMinimum(budget,count,increment,settings.minAllocation);
    const scores = candidates.map(target => target._routeScore);
    const allocations = candidates.map((target,index) => ({
      securityId:target._id,ticker:target._ticker,name:target?.name || target._ticker,account:target._broker.account,
      amount:0,yieldPct:target._yield,expectedAnnualIncome:0,estimatedPriceGbp:target._price,expectedShares:0,
      scoutingStatus:target._gate,scoutingScore:target._scoutScore,routeScore:scores[index]
    }));
    let remaining = budget;
    allocations.forEach(allocation => {
      const cap = positionCap(budget,count,strategy,allocation.scoutingStatus,increment);
      const seed = Math.min(minimum,remaining,cap);
      allocation.amount = seed;
      remaining -= seed;
    });
    let guard = 0;
    while (remaining >= increment - 0.001 && guard < 10000) {
      guard += 1;
      const average = Math.max(increment,budget / Math.max(1,count));
      const ranked = allocations.map((allocation,index) => {
        const cap = positionCap(budget,count,strategy,allocation.scoutingStatus,increment);
        if (allocation.amount + increment > cap + 0.001) return {index,priority:-Infinity};
        const diminishing = 1 + (allocation.amount / average) * 0.65;
        return {index,priority:scores[index] / diminishing};
      }).sort((a,b) => b.priority - a.priority);
      if (!ranked.length || !Number.isFinite(ranked[0].priority) || ranked[0].priority < 0) break;
      allocations[ranked[0].index].amount += increment;
      remaining -= increment;
    }
    if (remaining > 0.005) {
      const ranked = allocations.map((allocation,index) => ({index,score:scores[index],cap:positionCap(budget,count,strategy,allocation.scoutingStatus,increment)}))
        .filter(item => allocations[item.index].amount + remaining <= item.cap + 0.005).sort((a,b) => b.score - a.score);
      if (ranked.length) { allocations[ranked[0].index].amount += remaining; remaining = 0; }
    }
    allocations.forEach(allocation => {
      allocation.amount = round2(allocation.amount);
      allocation.expectedAnnualIncome = Number((allocation.amount * allocation.yieldPct / 100).toFixed(6));
      allocation.expectedShares = allocation.estimatedPriceGbp > 0 ? allocation.amount / allocation.estimatedPriceGbp : 0;
    });
    const allocated = round2(allocations.reduce((sum,item) => sum + item.amount,0));
    const income = Number(allocations.reduce((sum,item) => sum + item.expectedAnnualIncome,0).toFixed(6));
    return { strategy:lensName, allocations, allocated, remaining:round2(Math.max(0,budget - allocated)), income, candidates, reason:null };
  }

  function scenario(metrics) {
    const fraction = Math.max(0,Math.min(1,saleFraction));
    return {
      fraction,
      sharesSold:metrics.shares * fraction,
      sharesRemaining:metrics.shares * (1-fraction),
      cashReleased:metrics.value * fraction,
      bookReleased:metrics.book * fraction,
      profitRealised:metrics.profit * fraction,
      incomeSurrendered:metrics.income * fraction
    };
  }
  function concentration(state,row,scenarioData,route) {
    const map = new Map();
    activeHoldings(state).forEach(item => {
      const tk = ticker(item?.ticker); if (!tk) return;
      map.set(tk,(map.get(tk) || 0) + holdingMetrics(item).value);
    });
    const beforeTotal = [...map.values()].reduce((sum,value) => sum + value,0);
    const beforeLargest = beforeTotal > 0 ? Math.max(0,...map.values()) / beforeTotal * 100 : 0;
    const soldTicker = ticker(row?.ticker);
    map.set(soldTicker,Math.max(0,(map.get(soldTicker) || 0) - scenarioData.cashReleased));
    route.allocations.forEach(allocation => map.set(allocation.ticker,(map.get(allocation.ticker) || 0) + allocation.amount));
    const afterTotal = Math.max(0,beforeTotal - scenarioData.cashReleased + route.allocated);
    const afterLargest = afterTotal > 0 ? Math.max(0,...map.values()) / afterTotal * 100 : 0;
    return { before:beforeLargest, after:afterLargest, change:afterLargest-beforeLargest };
  }
  function verdict(state,row,metrics,mat,scenarioData,route,exEvent,conc) {
    const replacementIncome = route.income;
    const net = replacementIncome - scenarioData.incomeSurrendered;
    const coverage = scenarioData.incomeSurrendered > 0 ? replacementIncome / scenarioData.incomeSurrendered * 100 : replacementIncome > 0 ? 100 : 0;
    const caution = route.allocations.filter(item => item.scoutingStatus === 'caution').length;
    const closeEx = exEvent && exEvent.days >= 0 && exEvent.days <= 7 && exEvent.dividendAtRisk > 0;
    if (lockedHolding(row)) return {code:'keep',title:'DO NOT ROTATE',reason:'This is a locked / legacy Squad position. Chairman may inspect the economics, but Transfer will not turn it into an actionable rotation.'};
    if (mat.micro) return {code:'review',title:'MICRO POSITION',reason:`The percentage gain is real, but the £ impact is below Aurora's dynamic materiality thresholds. Current value ${money(metrics.value)} and profit ${money(metrics.profit)} do not justify priority rotation.`};
    if (closeEx) return {code:'wait',title:'WAIT FOR DIVIDEND',reason:`The next ex-date is ${exEvent.days === 0 ? 'today' : `only ${exEvent.days} day${exEvent.days === 1 ? '' : 's'} away`} and about ${money(exEvent.dividendAtRisk)} of dividend is attached to the shares in this sale scenario. Re-run after the ex-date.`};
    if (!route.allocations.length) return {code:'review',title:'REVIEW',reason:'Transfer cannot build an executable replacement route from the current Scouting-approved PASS / CAUTION list.'};
    if (caution > 0) return {code:'review',title:'REVIEW',reason:`The proposed route uses ${caution} CAUTION replacement${caution === 1 ? '' : 's'}. The economics are visible, but Scouting evidence must improve before a stronger Chairman verdict.`};
    if (conc.change > 5) return {code:'review',title:'REVIEW',reason:`The simulated rotation increases the largest-position concentration by ${conc.change.toFixed(1)} percentage points, so Chairman caps the verdict at REVIEW.`};
    if (metrics.profitPct >= 10 && net > 0 && coverage >= 105) return {code:'strong',title:'STRONG ROTATION',reason:`The holding is up ${metrics.profitPct.toFixed(1)}%, this sale realises ${money(scenarioData.profitRealised)}, and the replacement route improves surrendered annual income by ${money(net)} (${coverage.toFixed(1)}% income coverage).`};
    if ((metrics.profitPct >= 10 && coverage >= 100) || (metrics.profitPct >= 6 && net > 0)) return {code:'attractive',title:'ATTRACTIVE ROTATION',reason:`The profit trigger is active and the replacement route ${net >= 0 ? 'maintains or improves' : 'nearly replaces'} the annual income surrendered by the sale. This is a credible case for review, not an automatic sell.`};
    if (metrics.profitPct >= 6 || net > 0) return {code:'review',title:'REVIEW',reason:'The profit trigger is active, but the combined income, Scouting and concentration result is not strong enough for a positive rotation verdict.'};
    if (scenarioData.incomeSurrendered > 0 && coverage < 85) return {code:'keep',title:'KEEP',reason:'The simulated replacements recover less than 85% of the annual income surrendered by the sale.'};
    return {code:'keep',title:'KEEP',reason:'The current holding remains more compelling than this simulated rotation.'};
  }
  function buildCase(state,item) {
    if (!item) return null;
    const metrics = item.metrics;
    const mat = item.mat;
    const sale = scenario(metrics);
    const route = allocateRotation(state,sale.cashReleased,ticker(item.row?.ticker),lens);
    const exEvent = nextExDate(state,item.row,sale);
    const conc = concentration(state,item.row,sale,route);
    const replacementIncome = route.income;
    const netAnnual = replacementIncome - sale.incomeSurrendered;
    const coverage = sale.incomeSurrendered > 0 ? replacementIncome / sale.incomeSurrendered * 100 : replacementIncome > 0 ? 100 : 0;
    return { item,metrics,mat,sale,route,exEvent,conc,replacementIncome,netAnnual,netMonthly:netAnnual/12,coverage,verdict:verdict(state,item.row,metrics,mat,sale,route,exEvent,conc) };
  }

  function loadCustom() {
    try { customIds = new Set(arr(JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]')).map(String)); }
    catch (_) { customIds = new Set(); }
  }
  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY,JSON.stringify([...customIds])); } catch (_) {}
  }
  function ensureSection() {
    let host = document.getElementById('transferChairmanOffers');
    if (host) return host;
    const anchor = document.getElementById('transferAllocationPreview') || document.getElementById('transferScoutingIntake') || document.getElementById('transferStrategyControl') || document.getElementById('transferMissionShell');
    if (!anchor) return null;
    host = document.createElement('section');
    host.id = 'transferChairmanOffers';
    host.className = 'chairman-offers';
    anchor.insertAdjacentElement('afterend',host);
    return host;
  }

  function renderOfferList(rows) {
    if (!rows.length) return '<div class="co-empty">No active Squad holding is currently above the +6% Chairman review trigger. Locked legacy holdings remain protected.</div>';
    return `<div class="co-offer-list">${rows.map(item => {
      const row = item.row, m = item.metrics, key = holdingKey(row), selected = key === selectedKey;
      return `<button type="button" class="co-offer ${selected ? 'selected' : ''}" data-co-offer="${esc(key)}">
        <span class="co-trigger ${item.code === 'strong' ? 'strong' : ''}">${esc(item.label)}</span>
        <span class="co-offer-name"><b>${esc(ticker(row?.ticker))} • ${esc(row?.name || ticker(row?.ticker))}</b><span>${esc(accountLabel(row?.account))} • ${lockedHolding(row) ? 'LEGACY / LOCKED REVIEW' : item.code === 'micro' ? 'MICRO POSITION' : 'CHAIRMAN PROFIT TRIGGER'}</span></span>
        <span class="co-cell"><strong>${money(m.value)}</strong><span>Position value</span></span>
        <span class="co-cell"><strong class="co-profit">${pct(m.profitPct)}</strong><span>Capital return</span></span>
        <span class="co-cell"><strong class="co-profit">+${money(m.profit)}</strong><span>Unrealised profit</span></span>
        <span class="co-open">${selected ? 'CASE OPEN' : 'OPEN CASE'}</span>
      </button>`;
    }).join('')}</div>`;
  }

  function renderCase(state,caseData) {
    if (!caseData) return '';
    const {item,metrics,sale,route,exEvent,conc,netAnnual,netMonthly,coverage} = caseData;
    const row = item.row;
    const approved = approvedCandidates(state,ticker(row?.ticker));
    const exText = exEvent ? `${exEvent.exDate || '—'} • ${exEvent.days} day${Math.abs(exEvent.days) === 1 ? '' : 's'} • ${money(exEvent.dividendAtRisk)} at risk` : 'No supported future ex-date found';
    const selectedCount = approved.filter(target => customIds.has(target._id)).length;
    return `<div class="co-case">
      <div class="co-case-head"><div><span class="co-kicker">Chairman's Rotation Case</span><h3>${esc(ticker(row?.ticker))} • ${esc(accountLabel(row?.account))}</h3><p>Compare a hypothetical sale against the current Scouting-approved replacement pool. Nothing here changes Squad, cash, Finance missions or Registration.</p></div><span class="co-chip">${esc(item.label)} TRIGGER • ${pct(metrics.profitPct)}</span></div>
      <div class="co-controls">
        <div class="co-control"><small>Sale scenario</small><div class="co-buttons">${[0.25,0.5,0.75,1].map(value => `<button type="button" data-co-sale="${value}" class="${Math.abs(value-saleFraction) < .001 ? 'active' : ''}">${Math.round(value*100)}%</button>`).join('')}</div></div>
        <div class="co-control"><small>Replacement lens</small><div class="co-buttons"><button type="button" data-co-lens="sustainable" class="${lens==='sustainable'?'active':''}">Sustainable Income</button><button type="button" data-co-lens="maximum" class="${lens==='maximum'?'active':''}">Maximum Income</button><button type="button" data-co-lens="custom" class="${lens==='custom'?'active':''}">Custom Basket${lens==='custom' ? ` (${selectedCount})` : ''}</button></div>
          <div class="co-custom ${lens==='custom'?'show':''}"><div class="co-custom-grid">${approved.length ? approved.map(target => `<label><input type="checkbox" data-co-custom="${esc(target._id)}" ${customIds.has(target._id)?'checked':''}> ${esc(target._ticker)} • ${target._yield.toFixed(2)}%</label>`).join('') : '<span>No executable PASS / CAUTION candidates.</span>'}</div></div>
        </div>
      </div>
      <div class="co-stats">
        <div class="co-stat"><small>Cash released</small><strong class="gold">${money(sale.cashReleased)}</strong></div>
        <div class="co-stat"><small>Profit realised</small><strong class="good">+${money(sale.profitRealised)}</strong></div>
        <div class="co-stat"><small>Income surrendered</small><strong class="bad">-${money(sale.incomeSurrendered)}/yr</strong></div>
        <div class="co-stat"><small>Replacement income</small><strong class="good">+${money(route.income)}/yr</strong></div>
        <div class="co-stat"><small>Net income change</small><strong class="${netAnnual>=0?'good':'bad'}">${netAnnual>=0?'+':''}${money(netAnnual)}/yr</strong></div>
        <div class="co-stat"><small>Monthly change</small><strong class="${netMonthly>=0?'good':'bad'}">${netMonthly>=0?'+':''}${money(netMonthly)}/m</strong></div>
      </div>
      <div class="co-dividend-alert ${exEvent && exEvent.days <= 7 ? 'close' : ''}"><b>Next dividend:</b> ${esc(exText)} • Income coverage ${coverage.toFixed(1)}% • Largest-position concentration ${conc.before.toFixed(1)}% → ${conc.after.toFixed(1)}% (${conc.change>=0?'+':''}${conc.change.toFixed(1)}pp).</div>
      <div class="co-route"><h4>${lens === 'maximum' ? 'Maximum Income' : lens === 'custom' ? 'Custom Basket' : 'Sustainable Income'} replacement route</h4>
        ${route.allocations.length ? `<div class="co-route-list">${route.allocations.map((allocation,index) => `<div class="co-route-row"><div class="co-rank">#${index+1}</div><div class="co-route-name"><b>${esc(allocation.ticker)} • ${esc(allocation.name)}</b><span>${esc(allocation.scoutingStatus.toUpperCase())} • score ${Math.round(allocation.scoutingScore)}/100</span></div><div class="co-route-cell"><strong>${esc(accountLabel(allocation.account))}</strong><span>Broker</span></div><div class="co-route-cell"><strong>${allocation.yieldPct.toFixed(2)}%</strong><span>Yield</span></div><div class="co-route-cell"><strong>${money(allocation.amount)} • +${money(allocation.expectedAnnualIncome)}/yr</strong><span>Simulated allocation</span></div></div>`).join('')}</div>` : `<div class="co-empty">No executable replacement route. ${route.reason === 'CUSTOM_BASKET_EMPTY' ? 'Choose at least one Scouting-approved Custom Basket candidate.' : 'Current PASS / CAUTION candidates do not have enough broker, price and income evidence.'}</div>`}
      </div>
      <div class="co-verdict ${esc(caseData.verdict.code)}"><div class="co-verdict-head"><div><span class="co-kicker">Chairman's Verdict</span><strong>${esc(caseData.verdict.title)}</strong></div><span class="co-chip">SIMULATION ONLY</span></div><p>${esc(caseData.verdict.reason)}</p></div>
      <div class="co-authority"><b>Authority:</b> Squad supplies the holding, Income supplies dividend timing, Scouting supplies PASS / CAUTION replacements, and Transfer calculates the rotation case. This module cannot sell shares, create Registration receipts or mutate canonical holdings.</div>
    </div>`;
  }

  function bind(host) {
    host.querySelectorAll('[data-co-offer]').forEach(button => button.addEventListener('click',() => { selectedKey = String(button.dataset.coOffer || ''); render('offer-select'); }));
    host.querySelectorAll('[data-co-sale]').forEach(button => button.addEventListener('click',() => { saleFraction = Math.max(.25,Math.min(1,num(button.dataset.coSale))); render('sale-change'); }));
    host.querySelectorAll('[data-co-lens]').forEach(button => button.addEventListener('click',() => { lens = ['maximum','custom'].includes(button.dataset.coLens) ? button.dataset.coLens : 'sustainable'; render('lens-change'); }));
    host.querySelectorAll('[data-co-custom]').forEach(input => input.addEventListener('change',() => {
      const id = String(input.dataset.coCustom || '');
      if (!id) return;
      if (input.checked) customIds.add(id); else customIds.delete(id);
      saveCustom(); render('custom-change');
    }));
  }

  function render(reason='render') {
    if (rendering) return;
    rendering = true;
    try {
      const host = ensureSection();
      const state = readState();
      if (!host) return;
      if (!state) { host.innerHTML = '<div class="co-empty">Aurora state is unavailable. Chairman Offers cannot be calculated.</div>'; return; }
      const rows = offers(state);
      if (!selectedKey || !rows.some(item => holdingKey(item.row) === selectedKey)) selectedKey = holdingKey(rows[0]?.row || {});
      const selected = rows.find(item => holdingKey(item.row) === selectedKey) || null;
      const strong = rows.filter(item => item.metrics.profitPct >= 10 && !lockedHolding(item.row)).length;
      const review = rows.filter(item => item.metrics.profitPct >= 6 && item.metrics.profitPct < 10 && !lockedHolding(item.row)).length;
      const locked = rows.filter(item => lockedHolding(item.row)).length;
      const replacements = approvedCandidates(state,selected ? ticker(selected.row?.ticker) : '').length;
      const caseData = buildCase(state,selected);
      host.innerHTML = `<div class="co-head"><div><span class="co-kicker">Chairman's Offers • Restored</span><h2>Profit Rotation Desk</h2><p>The old +6% / +10% Chairman review is back inside Transfer Centre. Open a holding, choose how much to sell and compare the proceeds against Sustainable Income, Maximum Income or your own Scouting-approved basket.</p></div><span class="co-chip">READ-ONLY ROTATION SIMULATOR</span></div>
        <div class="co-kpis"><div class="co-kpi"><small>Active offers</small><strong>${rows.filter(item=>!lockedHolding(item.row)).length}</strong></div><div class="co-kpi"><small>+10% strong reviews</small><strong>${strong}</strong></div><div class="co-kpi"><small>+6% reviews</small><strong>${review}</strong></div><div class="co-kpi"><small>Executable replacements</small><strong>${replacements}</strong></div></div>
        ${renderOfferList(rows)}${renderCase(state,caseData)}`;
      bind(host);
      document.documentElement.dataset.transferChairmanOffers = rows.length ? 'offers' : 'clear';
      window.AuroraTransferChairmanOffers = Object.freeze({ build:BUILD, ready:true, readOnly:true, offers:rows.length, strongReviews:strong, sixPctReviews:review, lockedReviews:locked, selectedKey, saleFraction, lens, current:caseData ? { ticker:ticker(caseData.item.row?.ticker), account:accountCode(caseData.item.row?.account), profitPct:caseData.metrics.profitPct, cashReleased:caseData.sale.cashReleased, incomeSurrendered:caseData.sale.incomeSurrendered, replacementIncome:caseData.route.income, netAnnual:caseData.netAnnual, verdict:caseData.verdict.title, allocations:caseData.route.allocations.map(row=>({ticker:row.ticker,account:row.account,amount:row.amount,expectedAnnualIncome:row.expectedAnnualIncome})) } : null }));
      window.dispatchEvent(new CustomEvent('aurora:transfer-chairman-offers',{ detail:{build:BUILD,reason,offers:rows.length,selectedKey,lens,saleFraction} }));
    } finally { rendering = false; }
  }

  function boot() {
    loadCustom();
    render('open');
    window.addEventListener('aurora2:state',() => setTimeout(()=>render('state-change'),60));
    window.addEventListener('pageshow',() => render('pageshow'));
    window.addEventListener('focus',() => render('focus'));
    window.addEventListener('storage',event => { if ([STATE_KEY,BACKUP_KEY,CUSTOM_KEY].includes(event.key)) { if (event.key === CUSTOM_KEY) loadCustom(); render('storage'); } });
    document.addEventListener('visibilitychange',() => { if (!document.hidden) render('foreground'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
