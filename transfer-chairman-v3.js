(function () {
  'use strict';

  var BUILD = '20260822-transfer-chairman-v3-engine-1';
  var STATE_KEY = 'aurora2:state:v1';
  var BACKUP_KEY = 'aurora2:state:backup:lastgood';
  var CUSTOM_KEY = 'aurora:transfer:chairman-custom:v2';
  var DEFAULT_MIN = 250;
  var DEFAULT_INCREMENT = 25;
  var DEFAULT_MAX_TARGETS = 8;
  var LEGACY_LOCKED = { TSCO: true };

  var selectedKey = '';
  var saleFraction = 0.50;
  var activeLens = 'sustainable';
  var customIds = {};
  var host = null;
  var bound = false;

  function arr(value) { return Array.isArray(value) ? value : []; }
  function num(value) {
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    var parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, num(value))); }
  function round2(value) { return Number(Math.max(0, num(value)).toFixed(2)); }
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  function money(value) {
    return new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2 }).format(num(value));
  }
  function pct(value) { return (num(value) >= 0 ? '+' : '') + num(value).toFixed(2) + '%'; }
  function ticker(value) {
    return String(value || '').replace(/^LON:/i, '').replace(/\.L$/i, '').replace(/\.GB$/i, '').replace(/\..*$/, '').toUpperCase().trim();
  }
  function accountCode(value) {
    var text = String(value || '').toLowerCase();
    if (text.indexOf('212') >= 0) return 'T212';
    if (/\big\b/.test(text) || text.indexOf('ig isa') >= 0) return 'IG';
    var upper = String(value || '').toUpperCase();
    return upper === 'IG' || upper === 'T212' ? upper : 'CHECK';
  }
  function accountLabel(value) {
    var code = accountCode(value);
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212 ISA' : 'Broker unresolved';
  }

  function readState() {
    try {
      if (window.Aurora2 && window.Aurora2.core && typeof window.Aurora2.core.read === 'function') {
        var live = window.Aurora2.core.read();
        if (live && typeof live === 'object') return live;
      }
    } catch (_) {}
    var keys = [STATE_KEY, BACKUP_KEY];
    for (var i = 0; i < keys.length; i += 1) {
      try {
        var parsed = JSON.parse(localStorage.getItem(keys[i]) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function activeHoldings(state) {
    var holdings = state && state.squad ? arr(state.squad.holdings) : [];
    return holdings.filter(function (row) {
      var status = String(row && row.status || '').toUpperCase();
      return ['SOLD','ARCHIVED','CLOSED','EXITED'].indexOf(status) < 0 && num(row && row.shares) > 0;
    });
  }

  function holdingMetrics(row) {
    var shares = Math.max(0, num(row && row.shares));
    var live = Math.max(0, num(row && (row.livePriceGbp || row.live_price_gbp || row.priceGbp || row.price)));
    var value = Math.max(0, num(row && (row.marketValueGbp || row.market_value_gbp || row.marketValue)));
    if (!(value > 0) && live > 0) value = shares * live;
    var book = Math.max(0, num(row && (row.bookCostGbp || row.book_cost_gbp || row.bookCost)));
    var dps = Math.max(0, num(row && (row.annualDpsGbp || row.annual_dps_gbp || row.annualDps)));
    var income = Math.max(0, num(row && (row.annualIncomeGbp || row.annual_income_gbp || row.annualIncome)));
    if (!(income > 0) && dps > 0) income = shares * dps;
    var profit = value - book;
    var profitPct = book > 0 ? profit / book * 100 : 0;
    return { shares:shares, live:live, value:value, book:book, income:income, profit:profit, profitPct:profitPct };
  }

  function holdingKey(row) {
    return String(row && row.id || (accountCode(row && row.account) + '|' + ticker(row && row.ticker)));
  }

  function lockedHolding(row) {
    var tk = ticker(row && row.ticker);
    return Boolean(row && row.locked) || String(row && row.status || '').toUpperCase() === 'LOCKED' || Boolean(LEGACY_LOCKED[tk]);
  }

  function materiality(state, metrics) {
    var all = activeHoldings(state).map(holdingMetrics);
    var totalValue = all.reduce(function (sum, item) { return sum + item.value; }, 0);
    var totalIncome = all.reduce(function (sum, item) { return sum + item.income; }, 0);
    var valueFloor = Math.max(100, totalValue * 0.001);
    var profitFloor = Math.max(10, totalValue * 0.0002);
    var incomeFloor = Math.max(5, totalIncome * 0.005);
    return {
      micro: metrics.value < valueFloor && Math.abs(metrics.profit) < profitFloor && metrics.income < incomeFloor,
      valueFloor:valueFloor, profitFloor:profitFloor, incomeFloor:incomeFloor
    };
  }

  function offerRows(state) {
    return activeHoldings(state).map(function (row) {
      var metrics = holdingMetrics(row);
      var mat = materiality(state, metrics);
      var locked = lockedHolding(row);
      var level = metrics.profitPct >= 10 ? 3 : metrics.profitPct >= 6 ? 2 : 0;
      var label = locked ? 'LOCKED' : mat.micro && level ? 'MICRO' : level === 3 ? '+10%' : level === 2 ? '+6%' : 'KEEP';
      return { row:row, metrics:metrics, mat:mat, locked:locked, level:level, label:label };
    }).filter(function (item) {
      return item.metrics.profitPct >= 6;
    }).sort(function (a, b) {
      return b.level - a.level || b.metrics.profit - a.metrics.profit || b.metrics.value - a.metrics.value;
    });
  }

  function targetGate(target) {
    var text = (String(target && target.status || '') + ' ' + String(target && target.recommendation || '')).toLowerCase();
    var eligibility = String(target && target.eligibilityStatus || '').toUpperCase();
    if (text.indexOf('block') >= 0 || ['INELIGIBLE','BLOCKED','NOT_ELIGIBLE'].indexOf(eligibility) >= 0) return 'block';
    if (text.indexOf('pass') >= 0) return 'pass';
    if (text.indexOf('caution') >= 0) return 'caution';
    return target && target.approvedForTransfer === true ? 'caution' : 'unknown';
  }

  function yieldPct(target) {
    var source = target && (target.yieldPct || target.dividendYieldPct || target.dividendYield || target.annualYieldPct || target.legacyYieldPct);
    var value = num(source);
    if (value > 0 && value <= 1 && String(source || '').indexOf('%') < 0) value *= 100;
    return Math.max(0, value);
  }

  function priceGbp(target) {
    var direct = num(target && (target.livePriceGbp || target.priceGbp || target.live_price_gbp || target.price_gbp || target.legacyPriceGbp));
    if (direct > 0) return direct;
    var raw = num(target && (target.livePrice || target.price || target.currentPrice));
    if (!(raw > 0)) return 0;
    var currency = String(target && (target.currency || target.quoteCurrency) || 'GBP').toUpperCase();
    var unit = String(target && (target.priceUnit || target.unit) || '').toUpperCase();
    if (currency === 'GBX' || unit === 'GBX' || unit === 'PENCE') return raw / 100;
    return currency === 'GBP' ? raw : 0;
  }

  function resolveBroker(state, target) {
    var preferred = accountCode(target && (target.preferredAccount || target.account || target.broker));
    if (preferred !== 'CHECK') return preferred;
    var tk = ticker(target && target.ticker);
    var owned = activeHoldings(state).filter(function (row) { return ticker(row && row.ticker) === tk; });
    if (owned.length) return accountCode(owned[0].account);
    return 'CHECK';
  }

  function targetScore(target, strategy) {
    var gate = targetGate(target);
    var score;
    if (strategy === 'maximum') score = num(target && target.maximumScore) || Math.min(100, yieldPct(target) * 10);
    else score = num(target && target.sustainableScore) || num(target && target.confidence) || Math.max(1, 100 - Math.max(1, num(target && target.rank)) * 5);
    if (gate === 'caution') score *= 0.82;
    return gate === 'block' ? 0 : Math.max(0, score);
  }

  function targetRank(target, strategy) {
    var value = num(target && (strategy === 'maximum' ? target.maximumRank : target.rank));
    return value > 0 ? value : 999999;
  }

  function candidates(state, sourceTicker, strategy, customOnly) {
    var scouting = state && state.scouting ? state.scouting : {};
    var batch = String(scouting.approvedBatchId || '');
    return arr(scouting.targets).filter(function (target) {
      if (!target || target.approvedForTransfer !== true) return false;
      if (batch && String(target.approvalBatchId || '') !== batch) return false;
      var gate = targetGate(target);
      if (gate !== 'pass' && gate !== 'caution') return false;
      var tk = ticker(target.ticker);
      if (!tk || tk === sourceTicker || tk === 'TSCO') return false;
      if (customOnly && !customIds[String(target.securityId || target.id || tk)]) return false;
      return yieldPct(target) > 0 && priceGbp(target) > 0 && resolveBroker(state, target) !== 'CHECK' && target.transferPermitted !== false;
    }).map(function (target) {
      var copy = {
        id:String(target.securityId || target.id || ticker(target.ticker)),
        ticker:ticker(target.ticker),
        name:String(target.name || ticker(target.ticker)),
        gate:targetGate(target),
        broker:resolveBroker(state, target),
        yieldPct:yieldPct(target),
        priceGbp:priceGbp(target),
        score:targetScore(target, strategy),
        rank:targetRank(target, strategy)
      };
      copy.routeScore = copy.yieldPct * (strategy === 'maximum' ? (0.80 + 0.20 * clamp(copy.score / 100, 0, 1)) : (0.55 + 0.45 * clamp(copy.score / 100, 0, 1)));
      return copy;
    }).sort(function (a, b) {
      return a.rank - b.rank || b.score - a.score || b.routeScore - a.routeScore || a.ticker.localeCompare(b.ticker);
    });
  }

  function positionCap(budget, count, strategy, gate, increment) {
    if (count <= 1) return budget;
    var share;
    if (count === 2) share = 0.65;
    else if (strategy === 'maximum') share = budget < 1000 ? 0.50 : budget < 2500 ? 0.42 : 0.38;
    else share = budget < 1000 ? 0.45 : budget < 2500 ? 0.36 : 0.32;
    if (gate === 'caution') share = Math.min(share, count === 2 ? 0.60 : 0.35);
    return Math.max(increment, Math.floor((budget * share + 0.0001) / increment) * increment);
  }

  function allocate(state, budget, sourceTicker, lens) {
    var transfer = state && state.transfer ? state.transfer : {};
    var settings = transfer.settings || {};
    var increment = Math.max(1, num(settings.increment) || DEFAULT_INCREMENT);
    var minimum = Math.max(increment, num(settings.minAllocation) || DEFAULT_MIN);
    var maxTargets = Math.max(1, Math.floor(num(settings.maxTargets) || DEFAULT_MAX_TARGETS));
    var strategy = lens === 'maximum' ? 'maximum' : 'sustainable';
    var pool = candidates(state, sourceTicker, strategy, lens === 'custom');
    if (!(budget > 0) || !pool.length) return { lens:lens, allocations:[], allocated:0, remaining:round2(budget), income:0, pool:pool };

    var count = Math.min(pool.length, maxTargets, Math.max(1, Math.floor((budget + 0.001) / minimum)));
    if (budget < minimum) count = 1;
    pool = pool.slice(0, count);
    var allocations = pool.map(function (target) {
      return { ticker:target.ticker, name:target.name, account:target.broker, gate:target.gate, yieldPct:target.yieldPct, priceGbp:target.priceGbp, score:target.score, routeScore:target.routeScore, amount:0, expectedAnnualIncome:0 };
    });
    var remaining = budget;
    var seed = budget >= minimum * count ? minimum : Math.max(increment, Math.floor((budget / count) / increment) * increment);
    allocations.forEach(function (row) {
      var cap = positionCap(budget, count, strategy, row.gate, increment);
      var amount = Math.min(seed, remaining, cap);
      row.amount = amount;
      remaining -= amount;
    });

    var guard = 0;
    while (remaining >= increment - 0.001 && guard < 10000) {
      guard += 1;
      var best = -1;
      var bestPriority = -1;
      for (var i = 0; i < allocations.length; i += 1) {
        var row = allocations[i];
        var cap = positionCap(budget, count, strategy, row.gate, increment);
        if (row.amount + increment > cap + 0.001) continue;
        var average = Math.max(increment, budget / Math.max(1, count));
        var priority = row.routeScore / (1 + (row.amount / average) * 0.65);
        if (priority > bestPriority) { bestPriority = priority; best = i; }
      }
      if (best < 0) break;
      allocations[best].amount += increment;
      remaining -= increment;
    }

    if (remaining > 0.005) {
      for (var j = 0; j < allocations.length; j += 1) {
        var candidate = allocations[j];
        var candidateCap = positionCap(budget, count, strategy, candidate.gate, increment);
        if (candidate.amount + remaining <= candidateCap + 0.005) {
          candidate.amount += remaining;
          remaining = 0;
          break;
        }
      }
    }

    allocations.forEach(function (row) {
      row.amount = round2(row.amount);
      row.expectedAnnualIncome = Number((row.amount * row.yieldPct / 100).toFixed(6));
    });
    var allocated = round2(allocations.reduce(function (sum, row) { return sum + row.amount; }, 0));
    var income = Number(allocations.reduce(function (sum, row) { return sum + row.expectedAnnualIncome; }, 0).toFixed(6));
    return { lens:lens, allocations:allocations.filter(function (row) { return row.amount > 0; }), allocated:allocated, remaining:round2(Math.max(0, budget - allocated)), income:income, pool:pool };
  }

  function scenario(metrics) {
    var fraction = Math.max(0.25, Math.min(1, saleFraction));
    return {
      fraction:fraction,
      sharesSold:metrics.shares * fraction,
      sharesRemaining:metrics.shares * (1 - fraction),
      cashReleased:metrics.value * fraction,
      bookReleased:metrics.book * fraction,
      profitRealised:metrics.profit * fraction,
      incomeSurrendered:metrics.income * fraction
    };
  }

  function parseDate(value) {
    if (!value) return null;
    var date = new Date(String(value).slice(0,10) + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function nextDividend(state, sourceTicker, sourceAccount, sale) {
    var income = state && state.income ? state.income : {};
    var today = new Date(); today.setHours(0,0,0,0);
    var rows = arr(income.calendar).map(function (event) {
      var date = parseDate(event && (event.exDate || event.ex_date));
      return { event:event, date:date };
    }).filter(function (item) {
      if (!item.date || item.date.getTime() < today.getTime()) return false;
      if (ticker(item.event && item.event.ticker) !== sourceTicker) return false;
      var eventAccount = accountCode(item.event && item.event.account);
      return eventAccount === sourceAccount || eventAccount === 'CHECK' || sourceAccount === 'CHECK';
    }).sort(function (a, b) { return a.date - b.date; });
    if (!rows.length) return null;
    var event = rows[0].event;
    var dps = num(event && (event.dividendPerShareGbp || event.dividend_per_share_gbp || event.dpsGbp || event.dps || event.dividendPerShare));
    var fullExpected = num(event && (event.expectedAmountGbp || event.expected_amount_gbp || event.grossDividendGbp || event.gross_dividend_gbp));
    var risk = dps > 0 ? sale.sharesSold * dps : fullExpected > 0 ? fullExpected * sale.fraction : 0;
    var days = Math.round((rows[0].date.getTime() - today.getTime()) / 86400000);
    return { exDate:event.exDate || event.ex_date || '', days:days, risk:risk };
  }

  function concentration(state, sourceTicker, sale, route) {
    var map = {};
    activeHoldings(state).forEach(function (row) {
      var tk = ticker(row && row.ticker);
      map[tk] = (map[tk] || 0) + holdingMetrics(row).value;
    });
    var totalBefore = Object.keys(map).reduce(function (sum, key) { return sum + map[key]; }, 0);
    var largestBefore = totalBefore > 0 ? Math.max.apply(null, Object.keys(map).map(function (key) { return map[key]; })) / totalBefore * 100 : 0;
    map[sourceTicker] = Math.max(0, (map[sourceTicker] || 0) - sale.cashReleased);
    route.allocations.forEach(function (row) { map[row.ticker] = (map[row.ticker] || 0) + row.amount; });
    var totalAfter = Math.max(0, totalBefore - sale.cashReleased + route.allocated);
    var largestAfter = totalAfter > 0 ? Math.max.apply(null, Object.keys(map).map(function (key) { return map[key]; })) / totalAfter * 100 : 0;
    return { before:largestBefore, after:largestAfter, change:largestAfter - largestBefore };
  }

  function verdict(item, sale, route, dividend, conc) {
    var replacement = route.income;
    var net = replacement - sale.incomeSurrendered;
    var coverage = sale.incomeSurrendered > 0 ? replacement / sale.incomeSurrendered * 100 : replacement > 0 ? 100 : 0;
    var cautions = route.allocations.filter(function (row) { return row.gate === 'caution'; }).length;
    if (item.locked) return { code:'keep', title:'DO NOT ROTATE', reason:'This is a locked / legacy Squad position. The economics can be reviewed, but Transfer will not turn it into an actionable sale.' };
    if (item.mat.micro) return { code:'review', title:'MICRO POSITION', reason:'The percentage gain is real, but the cash, profit and income impact is too small to make this a priority rotation.' };
    if (dividend && dividend.days >= 0 && dividend.days <= 7 && dividend.risk > 0) return { code:'wait', title:'WAIT FOR DIVIDEND', reason:'The next ex-dividend date is close and this sale scenario puts about ' + money(dividend.risk) + ' of dividend at risk.' };
    if (!route.allocations.length) return { code:'review', title:'REVIEW', reason:'There is no executable Scouting-approved PASS / CAUTION replacement route for this scenario.' };
    if (cautions > 0) return { code:'review', title:'REVIEW', reason:'The route still includes CAUTION replacements, so the board verdict is capped at REVIEW.' };
    if (conc.change > 5) return { code:'review', title:'REVIEW', reason:'The simulated rotation increases largest-position concentration by ' + conc.change.toFixed(1) + ' percentage points.' };
    if (item.metrics.profitPct >= 10 && net > 0 && coverage >= 105) return { code:'strong', title:'STRONG ROTATION', reason:'The +10% trigger is active and the replacement route improves annual income while keeping the route evidence clean.' };
    if ((item.metrics.profitPct >= 10 && coverage >= 100) || (item.metrics.profitPct >= 6 && net > 0)) return { code:'attractive', title:'ATTRACTIVE ROTATION', reason:'The profit trigger is active and the replacement route maintains or improves the annual income surrendered.' };
    return { code:'review', title:'REVIEW', reason:'The profit trigger is active, but the combined income and concentration case is not strong enough for a positive rotation verdict.' };
  }

  function caseData(state, item, lens) {
    var sale = scenario(item.metrics);
    var route = allocate(state, sale.cashReleased, ticker(item.row.ticker), lens);
    var dividend = nextDividend(state, ticker(item.row.ticker), accountCode(item.row.account), sale);
    var conc = concentration(state, ticker(item.row.ticker), sale, route);
    var netAnnual = route.income - sale.incomeSurrendered;
    var coverage = sale.incomeSurrendered > 0 ? route.income / sale.incomeSurrendered * 100 : route.income > 0 ? 100 : 0;
    return { item:item, sale:sale, route:route, dividend:dividend, concentration:conc, netAnnual:netAnnual, netMonthly:netAnnual / 12, coverage:coverage, verdict:verdict(item, sale, route, dividend, conc) };
  }

  function loadCustom() {
    customIds = {};
    try {
      arr(JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]')).forEach(function (id) { customIds[String(id)] = true; });
    } catch (_) {}
  }
  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(Object.keys(customIds))); } catch (_) {}
  }

  function routeRows(route) {
    if (!route.allocations.length) return '<div class="co-empty">No executable replacement route for this lens.</div>';
    return '<div class="co-route-list">' + route.allocations.map(function (row, index) {
      return '<div class="co-route-row"><div class="co-rank">#' + (index + 1) + '</div><div class="co-route-name"><b>' + esc(row.ticker) + ' • ' + esc(row.name) + '</b><span>' + esc(String(row.gate).toUpperCase()) + ' • score ' + Math.round(row.score) + '/100</span></div><div class="co-route-cell"><strong>' + esc(accountLabel(row.account)) + '</strong><span>Broker</span></div><div class="co-route-cell"><strong>' + row.yieldPct.toFixed(2) + '%</strong><span>Yield</span></div><div class="co-route-cell"><strong>' + money(row.amount) + ' • +' + money(row.expectedAnnualIncome) + '/yr</strong><span>Simulated allocation</span></div></div>';
    }).join('') + '</div>';
  }

  function strategyCard(data, lens) {
    var label = lens === 'maximum' ? 'Maximum Income' : lens === 'custom' ? 'Custom Basket' : 'Sustainable Income';
    return '<button type="button" class="co-strategy-card ' + (activeLens === lens ? 'active' : '') + '" data-v3-lens="' + lens + '"><h5>' + label + '</h5><div class="co-strategy-tags"></div><div class="co-strategy-metrics"><span><small>Replacement income</small><strong class="good">' + money(data.route.income) + '/yr</strong></span><span><small>Net annual</small><strong class="' + (data.netAnnual >= 0 ? 'good' : 'bad') + '">' + (data.netAnnual >= 0 ? '+' : '') + money(data.netAnnual) + '</strong></span><span><small>Income coverage</small><strong>' + data.coverage.toFixed(1) + '%</strong></span><span><small>Cash deployed</small><strong>' + money(data.route.allocated) + '</strong></span><span><small>Holdback</small><strong>' + money(data.route.remaining) + '</strong></span><span><small>Purchase legs</small><strong>' + data.route.allocations.length + '</strong></span></div><div class="co-strategy-note">Chairman verdict: ' + esc(data.verdict.title) + '</div></button>';
  }

  function render() {
    host = document.getElementById('transferChairmanOffers');
    if (!host) return;
    try {
      var state = readState();
      if (!state) throw new Error('Aurora state is unavailable on this device.');
      var offers = offerRows(state);
      if (!selectedKey || !offers.some(function (item) { return holdingKey(item.row) === selectedKey; })) selectedKey = offers.length ? holdingKey(offers[0].row) : '';
      var selected = offers.filter(function (item) { return holdingKey(item.row) === selectedKey; })[0] || null;
      var strong = offers.filter(function (item) { return item.metrics.profitPct >= 10 && !item.locked; }).length;
      var six = offers.filter(function (item) { return item.metrics.profitPct >= 6 && item.metrics.profitPct < 10 && !item.locked; }).length;
      var availableReplacements = candidates(state, selected ? ticker(selected.row.ticker) : '', 'sustainable', false).length;

      var html = '<div class="co-head"><div><span class="co-kicker">Chairman\'s Offers • V3</span><h2>Profit Rotation Desk</h2><p>The +6% / +10% Chairman review is running directly from Squad, Scouting and Income evidence. This desk is simulation-only.</p></div><span class="co-chip">V3 ENGINE LIVE</span></div>';
      html += '<div class="co-kpis"><div class="co-kpi"><small>Active offers</small><strong>' + offers.filter(function (item) { return !item.locked; }).length + '</strong></div><div class="co-kpi"><small>+10% strong reviews</small><strong>' + strong + '</strong></div><div class="co-kpi"><small>+6% reviews</small><strong>' + six + '</strong></div><div class="co-kpi"><small>Executable replacements</small><strong>' + availableReplacements + '</strong></div></div>';

      if (!offers.length) {
        html += '<div class="co-empty">No active Squad holding is currently above the +6% Chairman review trigger.</div>';
        host.innerHTML = html;
        host.setAttribute('data-state','clear');
        window.AuroraTransferChairmanOffers = { build:BUILD, ready:true, readOnly:true, offers:0, current:null };
        return;
      }

      html += '<div class="co-offer-list">' + offers.map(function (item) {
        var row = item.row, metrics = item.metrics, key = holdingKey(row);
        return '<button type="button" class="co-offer ' + (key === selectedKey ? 'selected' : '') + '" data-v3-offer="' + esc(key) + '"><span class="co-trigger ' + (item.level === 3 ? 'strong' : '') + '">' + esc(item.label) + '</span><span class="co-offer-name"><b>' + esc(ticker(row.ticker)) + ' • ' + esc(row.name || ticker(row.ticker)) + '</b><span>' + esc(accountLabel(row.account)) + ' • ' + (item.locked ? 'LOCKED REVIEW' : 'CHAIRMAN PROFIT TRIGGER') + '</span></span><span class="co-cell"><strong>' + money(metrics.value) + '</strong><span>Position value</span></span><span class="co-cell"><strong class="co-profit">' + pct(metrics.profitPct) + '</strong><span>Capital return</span></span><span class="co-cell"><strong class="co-profit">+' + money(metrics.profit) + '</strong><span>Unrealised profit</span></span><span class="co-open">' + (key === selectedKey ? 'CASE OPEN' : 'OPEN CASE') + '</span></button>';
      }).join('') + '</div>';

      var sustainable = caseData(state, selected, 'sustainable');
      var maximum = caseData(state, selected, 'maximum');
      var custom = caseData(state, selected, 'custom');
      var current = activeLens === 'maximum' ? maximum : activeLens === 'custom' ? custom : sustainable;
      var sale = current.sale;
      var dividendText = current.dividend ? current.dividend.exDate + ' • ' + current.dividend.days + ' days • ' + money(current.dividend.risk) + ' at risk' : 'No supported future ex-date found';
      var customPool = candidates(state, ticker(selected.row.ticker), 'sustainable', false);

      html += '<div class="co-case"><div class="co-case-head"><div><span class="co-kicker">Chairman\'s Rotation Case</span><h3>' + esc(ticker(selected.row.ticker)) + ' • ' + esc(accountLabel(selected.row.account)) + '</h3><p>Compare a hypothetical sale against Scouting-approved replacements. Nothing here changes Squad or creates a Registration transaction.</p></div><span class="co-chip">' + esc(selected.label) + ' TRIGGER • ' + pct(selected.metrics.profitPct) + '</span></div>';
      html += '<div class="co-controls"><div class="co-control"><small>Sale scenario</small><div class="co-buttons">' + [0.25,0.5,0.75,1].map(function (fraction) { return '<button type="button" data-v3-sale="' + fraction + '" class="' + (Math.abs(saleFraction - fraction) < 0.001 ? 'active' : '') + '">' + Math.round(fraction * 100) + '%</button>'; }).join('') + '</div></div><div class="co-control"><small>Custom basket</small><div class="co-custom show"><div class="co-custom-grid">' + (customPool.length ? customPool.map(function (target) { return '<label><input type="checkbox" data-v3-custom="' + esc(target.id) + '" ' + (customIds[target.id] ? 'checked' : '') + '> ' + esc(target.ticker) + ' • ' + target.yieldPct.toFixed(2) + '%</label>'; }).join('') : '<span>No executable PASS / CAUTION candidates.</span>') + '</div></div></div></div>';
      html += '<div class="co-stats"><div class="co-stat"><small>Cash released</small><strong class="gold">' + money(sale.cashReleased) + '</strong></div><div class="co-stat"><small>Profit realised</small><strong class="good">+' + money(sale.profitRealised) + '</strong></div><div class="co-stat"><small>Income surrendered</small><strong class="bad">-' + money(sale.incomeSurrendered) + '/yr</strong></div><div class="co-stat"><small>Replacement income</small><strong class="good">+' + money(current.route.income) + '/yr</strong></div><div class="co-stat"><small>Net income change</small><strong class="' + (current.netAnnual >= 0 ? 'good' : 'bad') + '">' + (current.netAnnual >= 0 ? '+' : '') + money(current.netAnnual) + '/yr</strong></div><div class="co-stat"><small>Monthly change</small><strong class="' + (current.netMonthly >= 0 ? 'good' : 'bad') + '">' + (current.netMonthly >= 0 ? '+' : '') + money(current.netMonthly) + '/m</strong></div></div>';
      html += '<div class="co-dividend-alert ' + (current.dividend && current.dividend.days <= 7 ? 'close' : '') + '"><b>Next dividend:</b> ' + esc(dividendText) + ' • Income coverage ' + current.coverage.toFixed(1) + '% • Largest-position concentration ' + current.concentration.before.toFixed(1) + '% → ' + current.concentration.after.toFixed(1) + '%.</div>';
      html += '<div class="co-strategy-compare"><h4>Three-way strategy comparison</h4><div class="co-strategy-grid">' + strategyCard(sustainable,'sustainable') + strategyCard(maximum,'maximum') + strategyCard(custom,'custom') + '</div></div>';
      html += '<div class="co-route"><h4>' + (activeLens === 'maximum' ? 'Maximum Income' : activeLens === 'custom' ? 'Custom Basket' : 'Sustainable Income') + ' replacement route</h4>' + routeRows(current.route) + '</div>';
      html += '<div class="co-verdict ' + esc(current.verdict.code) + '"><div class="co-verdict-head"><div><span class="co-kicker">Chairman\'s Verdict</span><strong>' + esc(current.verdict.title) + '</strong></div><span class="co-chip">SIMULATION ONLY</span></div><p>' + esc(current.verdict.reason) + '</p></div><div class="co-authority"><b>Authority:</b> Squad supplies holdings, Income supplies dividend timing, Scouting supplies replacements, and Transfer calculates the scenario. V3 cannot sell shares or mutate canonical holdings.</div></div>';

      host.innerHTML = html;
      host.setAttribute('data-state','ready');
      window.AuroraTransferChairmanOffers = {
        build:BUILD, ready:true, readOnly:true, offers:offers.length, strongReviews:strong, sixPctReviews:six,
        selectedKey:selectedKey, saleFraction:saleFraction, lens:activeLens,
        current:{ ticker:ticker(selected.row.ticker), account:accountCode(selected.row.account), profitPct:selected.metrics.profitPct, cashReleased:sale.cashReleased, incomeSurrendered:sale.incomeSurrendered, replacementIncome:current.route.income, netAnnual:current.netAnnual, verdict:current.verdict.title, allocations:current.route.allocations }
      };
      try { window.dispatchEvent(new CustomEvent('aurora:transfer-chairman-offers', { detail:{ build:BUILD, offers:offers.length, lens:activeLens, saleFraction:saleFraction } })); } catch (_) {}
    } catch (error) {
      host.setAttribute('data-state','error');
      host.innerHTML = '<div class="co-head"><div><span class="co-kicker">Chairman\'s Offers • V3</span><h2>Profit Rotation Desk</h2><p>The Chairman engine hit a safe-hold condition before calculating a rotation.</p></div><span class="co-chip">SAFE HOLD</span></div><div class="co-empty"><strong>Chairman review could not start.</strong><br>' + esc(error && error.message || String(error)) + '<br><br>No holdings, cash, Scouting or Registration data was changed.</div>';
      window.AuroraTransferChairmanOffers = { build:BUILD, ready:false, readOnly:true, error:String(error && error.message || error) };
    }
  }

  function eventTargetWithAttribute(start, attr) {
    var node = start;
    while (node && node !== host) {
      if (node.getAttribute && node.getAttribute(attr) !== null) return node;
      node = node.parentNode;
    }
    return null;
  }

  function bind() {
    host = document.getElementById('transferChairmanOffers');
    if (!host || bound) return;
    bound = true;
    host.addEventListener('click', function (event) {
      var offer = eventTargetWithAttribute(event.target, 'data-v3-offer');
      if (offer) { selectedKey = String(offer.getAttribute('data-v3-offer') || ''); render(); return; }
      var sale = eventTargetWithAttribute(event.target, 'data-v3-sale');
      if (sale) { saleFraction = Math.max(0.25, Math.min(1, num(sale.getAttribute('data-v3-sale')))); render(); return; }
      var lens = eventTargetWithAttribute(event.target, 'data-v3-lens');
      if (lens) { activeLens = String(lens.getAttribute('data-v3-lens') || 'sustainable'); render(); }
    });
    host.addEventListener('change', function (event) {
      var input = eventTargetWithAttribute(event.target, 'data-v3-custom');
      if (!input) return;
      var id = String(input.getAttribute('data-v3-custom') || '');
      if (!id) return;
      if (input.checked) customIds[id] = true; else delete customIds[id];
      saveCustom(); render();
    });
  }

  function boot() {
    loadCustom();
    bind();
    render();
    window.addEventListener('pageshow', render);
    window.addEventListener('focus', render);
    window.addEventListener('aurora2:state', function () { setTimeout(render, 50); });
    window.addEventListener('storage', function (event) {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY || event.key === CUSTOM_KEY) {
        if (event.key === CUSTOM_KEY) loadCustom();
        render();
      }
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();