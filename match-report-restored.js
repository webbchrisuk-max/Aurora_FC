(() => {
  'use strict';

  const BUILD = '20260822-match-report-restored-1';
  const HISTORY_KEY = 'aurora2:match-report:presentation-history:v2';
  const INCOME_SUMMARY_KEY = 'aurora2:income:summary:v1';
  const MAX_HISTORY = 45;
  if (window.__auroraMatchReportRestored) return;
  window.__auroraMatchReportRestored = BUILD;

  const $ = id => document.getElementById(id);
  const arr = value => Array.isArray(value) ? value : [];
  const raw = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const num = value => raw(value) ?? 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[ch]));
  const money = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', maximumFractionDigits:2 }).format(Number(value));
  const pct = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
  const now = () => new Date().toISOString();

  function state() {
    try { return window.Aurora2?.core?.read?.() || {}; }
    catch (_) { return {}; }
  }
  function readJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch (_) { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function parseDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function sameDay(a, b = new Date()) {
    return !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function ticker(value) {
    return String(value || '').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  }
  function accountCode(value) {
    const text = String(value || '').toUpperCase();
    if (text.includes('212')) return 'T212';
    if (text === 'IG' || text.includes('IG ISA')) return 'IG';
    return text || 'CHECK';
  }
  function accountLabel(value) {
    const code = accountCode(value);
    if (code === 'T212') return 'Trading 212';
    if (code === 'IG') return 'IG ISA';
    return String(value || '—');
  }
  function activeHolding(row) {
    return ['ACTIVE','LOCKED'].includes(String(row?.status || '').toUpperCase()) && num(row?.shares) > 0;
  }
  function holdingIncome(row) {
    const direct = raw(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? row?.annualIncome);
    if (direct !== null && direct >= 0) return direct;
    const shares = num(row?.shares);
    const dps = raw(row?.annualDpsGbp ?? row?.annual_dps_gbp ?? row?.annualDps);
    return dps !== null && dps >= 0 ? shares * dps : 0;
  }
  function holdingValue(row) {
    const direct = raw(row?.marketValueGbp ?? row?.market_value_gbp ?? row?.marketValue);
    if (direct !== null && direct >= 0) return direct;
    const live = raw(row?.livePriceGbp ?? row?.live_price_gbp ?? row?.livePrice ?? row?.priceGbp ?? row?.price);
    return live !== null && live > 0 ? num(row?.shares) * live : 0;
  }
  function dayPct(row) {
    const candidates = [row?.dailyChangePct,row?.dayChangePct,row?.todayChangePct,row?.changePct,row?.daily_change_pct,row?.day_change_pct];
    for (const value of candidates) { const n = raw(value); if (n !== null && n > -99.9) return n; }
    const live = raw(row?.livePriceGbp ?? row?.livePrice ?? row?.priceGbp ?? row?.price);
    const prev = raw(row?.previousCloseGbp ?? row?.prevCloseGbp ?? row?.previousClose ?? row?.prevClose);
    return live !== null && prev !== null && prev > 0 ? (live - prev) / prev * 100 : null;
  }
  function dayGbp(row) {
    const candidates = [row?.dailyChangeGbp,row?.dayChangeGbp,row?.todayChangeGbp,row?.changeGbp,row?.daily_change_gbp,row?.day_change_gbp];
    for (const value of candidates) { const n = raw(value); if (n !== null) return n; }
    const p = dayPct(row);
    const live = raw(row?.livePriceGbp ?? row?.livePrice ?? row?.priceGbp ?? row?.price);
    const shares = num(row?.shares);
    if (p === null || live === null || live <= 0 || shares <= 0) return null;
    const previous = live / (1 + p / 100);
    return (live - previous) * shares;
  }
  function confidenceFor(s, tk) {
    const target = arr(s?.scouting?.targets).find(row => ticker(row?.ticker) === tk);
    const n = raw(target?.confidence ?? target?.confidenceScore);
    return n !== null && n > 0 ? clamp(n,0,100) : null;
  }
  function safetyFor(s, tk) {
    const target = arr(s?.scouting?.targets).find(row => ticker(row?.ticker) === tk);
    const n = raw(target?.dividendSafety ?? target?.dividend_safety ?? target?.incomeSafety);
    return n !== null && n > 0 ? clamp(n,0,100) : null;
  }

  function positions(s) {
    return arr(s?.squad?.holdings).filter(activeHolding).map(row => {
      const tk = ticker(row?.ticker);
      return {
        raw: row,
        ticker: tk,
        name: row?.name || tk,
        account: accountCode(row?.account),
        shares: num(row?.shares),
        value: holdingValue(row),
        income: holdingIncome(row),
        dayPct: dayPct(row),
        dayGbp: dayGbp(row),
        confidence: confidenceFor(s, tk),
        safety: safetyFor(s, tk)
      };
    });
  }
  function securities(rows) {
    const map = new Map();
    rows.forEach(row => {
      if (!row.ticker) return;
      const item = map.get(row.ticker) || { ticker:row.ticker,name:row.name,shares:0,value:0,income:0,dayGbp:0,dayPct:null,evidence:false,confidence:row.confidence,safety:row.safety,accounts:new Set() };
      item.shares += row.shares;
      item.value += row.value;
      item.income += row.income;
      item.accounts.add(row.account);
      if (row.dayGbp !== null && row.dayPct !== null) { item.dayGbp += row.dayGbp; item.dayPct = row.dayPct; item.evidence = true; }
      if (item.confidence === null && row.confidence !== null) item.confidence = row.confidence;
      if (item.safety === null && row.safety !== null) item.safety = row.safety;
      map.set(row.ticker, item);
    });
    return [...map.values()].map(row => ({ ...row, accounts:[...row.accounts] }));
  }
  function incomeSummary(rows) {
    const cached = readJson(INCOME_SUMMARY_KEY, null);
    const annual = raw(cached?.annualIncomeGbp ?? cached?.annualIncome ?? cached?.annual);
    const monthly = raw(cached?.monthlyIncomeGbp ?? cached?.monthlyIncome ?? cached?.monthly);
    const fallbackAnnual = rows.reduce((sum,row) => sum + row.income, 0);
    return {
      annual: annual !== null && annual >= 0 ? annual : fallbackAnnual,
      monthly: monthly !== null && monthly >= 0 ? monthly : (annual !== null ? annual / 12 : fallbackAnnual / 12),
      nextDividend: cached?.nextDividend || cached?.next || null,
      source: annual !== null ? 'INCOME CENTRE' : 'SQUAD FALLBACK'
    };
  }
  function aggregate(s, pos, sec, income) {
    const market = s?.market || {};
    const totalValue = pos.reduce((sum,row) => sum + row.value, 0);
    const evidenced = sec.filter(row => row.evidence);
    const allCovered = sec.length > 0 && evidenced.length === sec.length;
    const computedGain = allCovered ? evidenced.reduce((sum,row) => sum + row.dayGbp, 0) : null;
    const stateGain = raw(market?.portfolioTodayChangeGbp ?? market?.portfolio_today_change_gbp);
    const gain = stateGain !== null ? stateGain : computedGain;
    const statePct = raw(market?.portfolioTodayChangePct ?? market?.portfolio_today_change_pct);
    const computedPct = gain !== null && totalValue - gain > 0 ? gain / (totalValue - gain) * 100 : null;
    const changePct = statePct !== null ? statePct : computedPct;
    const up = sec.filter(row => row.evidence && row.dayPct > 0).length;
    const down = sec.filter(row => row.evidence && row.dayPct < 0).length;
    const flat = sec.filter(row => row.evidence && row.dayPct === 0).length;
    return {
      value: totalValue,
      gain,
      changePct,
      annual: income.annual,
      monthly: income.monthly,
      coverage: evidenced.length,
      total: sec.length,
      up,
      down,
      flat,
      complete: allCovered || (stateGain !== null && statePct !== null),
      regime: String(market?.regime || market?.status || 'Monitoring'),
      marketSource: stateGain !== null || statePct !== null ? 'SHARED MARKET STATE' : (allCovered ? 'SQUAD DAILY EVIDENCE' : 'PARTIAL SQUAD EVIDENCE')
    };
  }

  function reportDateValue(row) {
    return row?.report_date || row?.reportDate || row?.generated_at || row?.generatedAt || row?.created_at || row?.createdAt || row?.timestamp || row?.date || '';
  }
  function reportTime(row) { return parseDate(reportDateValue(row))?.getTime() || 0; }
  function publishedReports(s) {
    const out = [], md = s?.matchday || s?.matchReport || s?.matchdayReport || {};
    if (md.latest) out.push(md.latest);
    if (md.report) out.push(md.report);
    out.push(...arr(md.reports), ...arr(s?.portfolio?.matchdayReports));
    return out.filter(Boolean).sort((a,b) => reportTime(b)-reportTime(a));
  }
  function publishedToday(s) {
    return publishedReports(s).find(row => sameDay(parseDate(reportDateValue(row)))) || null;
  }
  function reportField(row, ...keys) {
    for (const key of keys) if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
    return undefined;
  }
  function localHistory() { return arr(readJson(HISTORY_KEY, [])); }
  function savePresentationSnapshot(snapshot) {
    if (!snapshot?.date) return;
    const current = localHistory();
    const identity = `${snapshot.date}|${snapshot.source}|${snapshot.changePct ?? ''}|${snapshot.gain ?? ''}`;
    const next = [snapshot, ...current.filter(row => `${row.date}|${row.source}|${row.changePct ?? ''}|${row.gain ?? ''}` !== identity)].sort((a,b) => String(b.at || b.date).localeCompare(String(a.at || a.date))).slice(0,MAX_HISTORY);
    writeJson(HISTORY_KEY, next);
  }
  function frozenFromPublished(report, fallback) {
    if (!report) return null;
    const gain = raw(reportField(report,'portfolio_change_gbp','portfolioChangeGbp'));
    const changePct = raw(reportField(report,'portfolio_change_pct','portfolioChangePct'));
    const value = raw(reportField(report,'portfolio_value','portfolioValue'));
    const up = raw(reportField(report,'holdings_up','holdingsUp'));
    const down = raw(reportField(report,'holdings_down','holdingsDown'));
    const flat = raw(reportField(report,'holdings_flat','holdingsFlat'));
    return {
      date: dateKey(parseDate(reportDateValue(report)) || new Date()),
      at: reportDateValue(report) || now(),
      source: String(report?.source || 'PUBLISHED MATCH REPORT').replaceAll('_',' '),
      published: true,
      value: value !== null ? value : fallback.value,
      gain: gain !== null ? gain : fallback.gain,
      changePct: changePct !== null ? changePct : fallback.changePct,
      up: up !== null ? Math.round(up) : fallback.up,
      down: down !== null ? Math.round(down) : fallback.down,
      flat: flat !== null ? Math.round(flat) : fallback.flat,
      summary: String(reportField(report,'summary','manager_report','managerReport') || ''),
      verdict: String(reportField(report,'verdict','market_result','marketResult') || ''),
      motm: ticker(reportField(report,'motm_ticker','motmTicker')),
      toughest: ticker(reportField(report,'toughest_match_ticker','toughestMatchTicker'))
    };
  }
  function presentationFreeze(agg, sec) {
    const today = dateKey();
    const existing = localHistory().find(row => row.date === today && row.frozen === true);
    if (existing) return existing;
    if (new Date().getHours() < 17 || !agg.complete || agg.changePct === null || agg.gain === null) return null;
    const ranked = sec.filter(row => row.evidence).sort((a,b) => b.dayGbp-a.dayGbp);
    const result = agg.changePct > .05 ? 'WIN' : agg.changePct < -.05 ? 'DEFEAT' : 'DRAW';
    const snapshot = {
      date:today,at:now(),source:'MATCH REPORT PRESENTATION FREEZE',published:false,frozen:true,
      value:agg.value,gain:agg.gain,changePct:agg.changePct,up:agg.up,down:agg.down,flat:agg.flat,
      summary:`${result} • ${agg.up} up / ${agg.down} down / ${agg.flat} flat.`,
      verdict:result,motm:ranked[0]?.ticker || '',toughest:ranked[ranked.length-1]?.ticker || ''
    };
    savePresentationSnapshot(snapshot);
    return snapshot;
  }
  function headline(s, agg, sec) {
    const published = publishedToday(s);
    if (new Date().getHours() >= 17 && published) return frozenFromPublished(published, agg);
    const local = presentationFreeze(agg, sec);
    if (local) return local;
    return {
      date:dateKey(),at:now(),source:agg.marketSource,published:false,frozen:false,
      value:agg.value,gain:agg.gain,changePct:agg.changePct,up:agg.up,down:agg.down,flat:agg.flat,summary:'',verdict:'',motm:'',toughest:''
    };
  }

  function matchRating(row, annual) {
    if (!row || !row.evidence || row.dayPct === null) return null;
    let rating = 6.5 + clamp(row.dayPct,-4,4) * .55;
    if (row.confidence !== null) rating += (row.confidence - 65) / 90;
    if (row.safety !== null) rating += (row.safety - 65) / 120;
    const share = annual > 0 ? row.income / annual : 0;
    rating += Math.min(.35, share * .9);
    return clamp(rating,4.5,9.8);
  }
  function resultClass(changePct) {
    if (changePct === null) return { label:'AWAITING', cls:'pending' };
    if (changePct > .05) return { label:'WIN', cls:'' };
    if (changePct < -.05) return { label:'DEFEAT', cls:'loss' };
    return { label:'DRAW', cls:'draw' };
  }
  function todayReceipts(s) {
    const rows = arr(s?.registration?.receipts);
    return rows.filter(row => sameDay(parseDate(row?.confirmedAt || row?.createdAt || row?.tradeDate || row?.date)));
  }
  function registrationPending(s) {
    const promos = arr(s?.registration?.reinvestmentPromotions);
    const pendingPromos = promos.filter(row => String(row?.status || '').toUpperCase() !== 'PROMOTED');
    const waiting = arr(s?.registration?.pending || s?.registration?.queue || []);
    return [...pendingPromos,...waiting];
  }
  function routeContext(s) {
    const t = s?.transfer || {};
    const route = t?.lockedRoute || t?.currentRoute || t?.route || t?.activeRoute || null;
    const strategy = String(route?.strategy || t?.strategy || t?.mode || s?.market?.buyMode || 'Review only');
    const status = String(route?.status || t?.status || 'No active route');
    const budget = raw(route?.budgetGbp ?? route?.budget ?? route?.totalCash ?? t?.budgetGbp);
    return { route, strategy, status, budget };
  }

  function setText(id, value, cls = '') {
    const el = $(id); if (!el) return;
    el.textContent = value ?? '—';
    el.classList.remove('positive','negative');
    if (cls) el.classList.add(cls);
  }
  function signedMoney(value) {
    return value === null ? '—' : `${value >= 0 ? '+' : ''}${money(value)}`;
  }
  function managerCopy(head, agg, sec, s) {
    if (head.summary) return head.summary;
    if (head.changePct === null) return `Aurora has ${agg.coverage}/${agg.total} unique securities with supported daily movement evidence. The desk will not invent a result while coverage is incomplete.`;
    const ranked = sec.filter(row => row.evidence).sort((a,b) => b.dayGbp-a.dayGbp);
    const best = ranked[0], worst = ranked[ranked.length-1];
    const result = resultClass(head.changePct).label.toLowerCase();
    return `Aurora is showing a ${result} at ${pct(head.changePct)} (${signedMoney(head.gain)}). ${head.up} holdings are up, ${head.down} down and ${head.flat} flat. ${best?.ticker || 'The leading holding'} is the strongest supported contributor${worst ? `, while ${worst.ticker} is the largest drag` : ''}. Match Report is descriptive only and creates no buy or sell authority.`;
  }

  function renderHero(head, agg, income, s) {
    const result = resultClass(head.changePct);
    const orb = $('scoreOrb');
    if (orb) { orb.classList.remove('loss','draw','pending'); if (result.cls) orb.classList.add(result.cls); }
    setText('resultPct', pct(head.changePct));
    setText('resultWord', result.label);
    setText('portfolioValue', money(head.value));
    setText('dayGain', signedMoney(head.gain), head.gain > 0 ? 'positive' : head.gain < 0 ? 'negative' : '');
    setText('annualIncome', `${money(income.annual)}/yr`);
    setText('monthlyIncome', `${money(income.monthly)}/m`);
    setText('breadth', head.changePct === null ? `${agg.coverage}/${agg.total}` : `${head.up} ↑ • ${head.down} ↓`);
    setText('coverage', `${agg.coverage}/${agg.total}`);
    setText('managerHeadline', managerCopy(head,agg,securities(positions(s)),s));
    setText('reportSource', `${head.published ? 'PUBLISHED FULL-TIME' : head.frozen ? 'LOCAL FULL-TIME FREEZE' : 'LIVE READ-ONLY'} • ${head.source}`);

    const stateEl = $('matchState');
    if (stateEl) {
      stateEl.classList.remove('warn','bad');
      const label = new Date().getHours() >= 17 ? (head.published ? 'PUBLISHED FULL TIME' : head.frozen ? 'FULL TIME FROZEN' : agg.complete ? 'FULL TIME LIVE' : 'FULL TIME • PARTIAL') : (agg.complete ? 'MATCHDAY LIVE' : 'LIVE • PARTIAL EVIDENCE');
      stateEl.querySelector('span').textContent = label;
      if (!agg.complete) stateEl.classList.add('warn');
    }
    const freeze = $('freezeNote');
    if (freeze) {
      freeze.hidden = !(head.published || head.frozen);
      freeze.textContent = head.published
        ? 'Full-time headline and breadth are frozen to the published report. Player rows can still use newer supported holding evidence, so later price updates may differ slightly from the frozen headline.'
        : 'Full-time headline and breadth are frozen locally as a presentation snapshot. This does not write holdings, cash, Transfer or Registration authority.';
    }
  }

  function renderAwards(sec, agg, head) {
    const evidenced = sec.filter(row => row.evidence).sort((a,b) => b.dayGbp-a.dayGbp);
    const motm = head.motm ? sec.find(row => row.ticker === head.motm) || evidenced[0] : evidenced[0];
    const worst = head.toughest ? sec.find(row => row.ticker === head.toughest) || evidenced[evidenced.length-1] : evidenced[evidenced.length-1];
    const incomeStar = [...sec].sort((a,b) => b.income-a.income)[0] || null;
    const defensive = [...sec].filter(row => !row.evidence || row.dayPct >= 0).sort((a,b) => (b.safety ?? b.confidence ?? -1) - (a.safety ?? a.confidence ?? -1))[0] || null;
    const award = (prefix,row,note,rating) => {
      setText(`${prefix}Name`, row?.ticker || 'Awaiting evidence');
      setText(`${prefix}Note`, note || 'No supported evidence yet.');
      const el = $(`${prefix}Rating`); if (el) { el.textContent = rating === null ? '—' : rating.toFixed(1); el.classList.toggle('low', rating !== null && rating < 6); }
    };
    award('motm', motm, motm ? `${signedMoney(motm.dayGbp)} supported contribution • ${pct(motm.dayPct)}.` : '', motm ? matchRating(motm,agg.annual) : null);
    award('worst', worst, worst ? `${signedMoney(worst.dayGbp)} supported contribution • ${pct(worst.dayPct)}.` : '', worst ? matchRating(worst,agg.annual) : null);
    const incomeRating = incomeStar && agg.annual > 0 ? clamp(6.8 + (incomeStar.income/agg.annual)*3,6.8,9.6) : null;
    award('income', incomeStar, incomeStar ? `${money(incomeStar.income)} a year in canonical forward income.` : '', incomeRating);
    const defensiveNote = defensive ? (defensive.safety !== null ? `Dividend safety ${Math.round(defensive.safety)}/100 from Scouting evidence.` : defensive.confidence !== null ? `Scouting confidence ${Math.round(defensive.confidence)}/100; no standalone safety score is invented.` : 'Stable today, but no genuine safety/confidence score is available.') : '';
    award('def', defensive, defensiveNote, defensive ? matchRating(defensive,agg.annual) : null);
  }

  function renderAnalysis(sec, agg) {
    setText('upCount', String(agg.up)); setText('downCount', String(agg.down)); setText('flatCount', String(agg.flat)); setText('coverageCount', `${agg.coverage}/${agg.total}`);
    const pos = sec.filter(row => row.evidence && row.dayGbp > 0).sort((a,b) => b.dayGbp-a.dayGbp).slice(0,5);
    const neg = sec.filter(row => row.evidence && row.dayGbp < 0).sort((a,b) => a.dayGbp-b.dayGbp).slice(0,5);
    const html = (rows,positive) => rows.length ? rows.map(row => `<div class="match-contrib-row"><strong>${esc(row.ticker)} — ${esc(row.name)}</strong><span class="${positive?'positive':'negative'}">${signedMoney(row.dayGbp)}</span></div>`).join('') : '<div class="match-empty">No supported contribution in this direction.</div>';
    if ($('positiveContrib')) $('positiveContrib').innerHTML = html(pos,true);
    if ($('negativeContrib')) $('negativeContrib').innerHTML = html(neg,false);
  }

  function renderTeamTalk(head, agg, sec, s) {
    const result = resultClass(head.changePct);
    const route = routeContext(s);
    const receipts = todayReceipts(s);
    const pending = registrationPending(s);
    setText('deskVerdict', result.label === 'AWAITING' ? 'REVIEW • EVIDENCE BUILDING' : `${result.label} • ${route.strategy.toUpperCase()}`);
    setText('teamTalkCopy', managerCopy(head,agg,sec,s));
    setText('marketRegime', agg.regime);
    setText('transferContext', route.status);
    setText('registrationContext', pending.length ? `${pending.length} pending` : `${receipts.length} confirmed today`);
  }

  function renderWatch(sec, s) {
    const host = $('watchList'); if (!host) return;
    const items = [];
    const drag = sec.filter(row => row.evidence).sort((a,b) => a.dayGbp-b.dayGbp)[0];
    if (drag && drag.dayGbp < 0) items.push({ icon:'📉', title:`${drag.ticker} — largest drag`, text:`${signedMoney(drag.dayGbp)} today • ${pct(drag.dayPct)}. Match Report flags it for review only.` });
    const pending = registrationPending(s);
    if (pending.length) items.push({ icon:'📝', title:'Registration still has pending work', text:`${pending.length} pending item${pending.length===1?'':'s'} remain outside canonical Squad until confirmed.` });
    const route = routeContext(s);
    if (route.route) items.push({ icon:'🔄', title:'Transfer route context', text:`${route.strategy} • ${route.status}${route.budget !== null ? ` • ${money(route.budget)} budget` : ''}.` });
    const missing = sec.filter(row => !row.evidence);
    if (missing.length) items.push({ icon:'📡', title:'Daily evidence incomplete', text:`${missing.length} securit${missing.length===1?'y':'ies'} still lack supported daily movement evidence: ${missing.slice(0,5).map(row=>row.ticker).join(', ')}${missing.length>5?'…':''}` });
    if (!items.length) items.push({ icon:'✅', title:'No immediate report exceptions', text:'All current Match Report checks have supported evidence and no pending Registration exception is visible.' });
    host.innerHTML = items.slice(0,5).map(item => `<div class="match-watch"><i>${item.icon}</i><div><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></div></div>`).join('');
  }

  function renderRatings(pos, agg) {
    const host = $('ratingsBody'); if (!host) return;
    const rows = [...pos].sort((a,b) => (matchRating(b,agg.annual) ?? -1) - (matchRating(a,agg.annual) ?? -1) || b.value-a.value);
    host.innerHTML = rows.length ? rows.map((row,index) => {
      const rating = matchRating(row,agg.annual);
      const evidence = row.safety !== null ? `${Math.round(row.safety)}/100 safety` : row.confidence !== null ? `${Math.round(row.confidence)}/100 confidence` : '—';
      return `<tr><td><b>#${index+1}</b></td><td class="holding-name"><strong>${esc(row.ticker)}</strong><span>${esc(row.name)}</span></td><td><span class="account-chip">${esc(accountLabel(row.account))}</span></td><td>${money(row.value)}</td><td class="match-move ${row.dayGbp>0?'positive':row.dayGbp<0?'negative':''}">${row.dayGbp===null?'—':signedMoney(row.dayGbp)}</td><td class="${row.dayPct>0?'positive':row.dayPct<0?'negative':''}">${pct(row.dayPct)}</td><td>${money(row.income)}/yr</td><td>${esc(evidence)}</td><td><span class="player-rating">${rating===null?'—':rating.toFixed(1)}</span>${rating===null?'':`<div class="rating-bar"><i style="width:${rating*10}%"></i></div>`}</td></tr>`;
    }).join('') : '<tr><td colspan="9"><div class="match-empty">No active canonical Squad positions.</div></td></tr>';
  }

  function historyRows(s, head) {
    const pub = publishedReports(s).map(row => ({
      date: dateKey(parseDate(reportDateValue(row)) || new Date()),
      at: reportDateValue(row) || '', source:String(row?.source || 'PUBLISHED').replaceAll('_',' '), published:true,
      changePct:raw(reportField(row,'portfolio_change_pct','portfolioChangePct')),
      gain:raw(reportField(row,'portfolio_change_gbp','portfolioChangeGbp')),
      value:raw(reportField(row,'portfolio_value','portfolioValue')),
      verdict:String(reportField(row,'market_result','marketResult','verdict') || '')
    }));
    const combined = [head, ...pub, ...localHistory()].filter(row => row?.date);
    const seen = new Set();
    return combined.sort((a,b) => String(b.at || b.date).localeCompare(String(a.at || a.date))).filter(row => {
      const key = `${row.date}|${row.source}|${row.changePct ?? ''}|${row.gain ?? ''}`;
      if (seen.has(key)) return false; seen.add(key); return true;
    }).slice(0,12);
  }
  function renderHistory(s, head) {
    const rows = historyRows(s,head), host = $('formRow'); if (!host) return;
    host.innerHTML = rows.length ? rows.map(row => {
      const cls = row.changePct === null ? 'pending' : row.changePct > .05 ? 'win' : row.changePct < -.05 ? 'loss' : 'draw';
      const label = row.verdict || (cls==='win'?'WIN':cls==='loss'?'DEFEAT':cls==='draw'?'DRAW':'LIVE');
      const date = parseDate(row.date)?.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) || row.date;
      return `<div class="match-form-chip ${cls}"><b><span>${esc(date)}</span><span>${esc(String(label).toUpperCase())}</span></b><strong>${pct(row.changePct)}</strong><span>${row.gain===null||row.gain===undefined?'Movement pending':signedMoney(row.gain)} • ${esc(row.source || 'Match Report')}</span></div>`;
    }).join('') : '<div class="match-empty">No Match Report history yet.</div>';
  }

  function renderSources(s, agg, income) {
    const receipts = arr(s?.registration?.receipts);
    const route = routeContext(s);
    const cards = [
      ['Squad authority', `${positions(s).length} active account positions`, 'Canonical holdings only'],
      ['Income authority', `${money(income.annual)}/yr`, income.source],
      ['Registration', `${receipts.length} stored receipt${receipts.length===1?'':'s'}`, registrationPending(s).length ? 'Pending items remain outside Squad' : 'No visible pending exception'],
      ['Transfer context', route.status, route.strategy]
    ];
    if ($('sourceGrid')) $('sourceGrid').innerHTML = cards.map(card => `<div class="match-source-card"><strong>${esc(card[0])}</strong><span>${esc(card[1])}</span><span>${esc(card[2])}</span></div>`).join('');
    setText('sourceBadge', agg.complete ? 'EVIDENCE READY' : 'PARTIAL EVIDENCE');
  }

  let rendering = false;
  async function render(reason = 'render') {
    if (rendering) return;
    rendering = true;
    document.documentElement.classList.add('match-refreshing');
    try {
      let tries = 0;
      while (!window.Aurora2?.core?.read && tries < 120) { await new Promise(resolve => setTimeout(resolve,40)); tries += 1; }
      const s = state();
      const pos = positions(s), sec = securities(pos), income = incomeSummary(pos), agg = aggregate(s,pos,sec,income), head = headline(s,agg,sec);
      renderHero(head,agg,income,s);
      renderAwards(sec,agg,head);
      renderAnalysis(sec,agg);
      renderTeamTalk(head,agg,sec,s);
      renderWatch(sec,s);
      renderRatings(pos,agg);
      renderHistory(s,head);
      renderSources(s,agg,income);
      setText('lastUpdated', new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
      window.dispatchEvent(new CustomEvent('aurora:match-report-rendered',{ detail:{ build:BUILD,reason,coverage:agg.coverage,total:agg.total,source:head.source,at:now() } }));
    } finally {
      document.documentElement.classList.remove('match-refreshing');
      rendering = false;
    }
  }

  function bind() {
    $('refreshReport')?.addEventListener('click', () => render('manual-refresh'));
    window.addEventListener('aurora2:state', () => setTimeout(() => render('state-change'),50));
    window.addEventListener('aurora:income-summary', () => setTimeout(() => render('income-change'),50));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => render('foreground'),100); });
    window.addEventListener('focus', () => setTimeout(() => render('focus'),80));
    setInterval(() => { if (document.visibilityState === 'visible') render('minute-refresh'); },60000);
  }

  window.AuroraMatchReportRestored = Object.freeze({ build:BUILD, render, positions:() => positions(state()), history:() => historyRows(state(),headline(state(),aggregate(state(),positions(state()),securities(positions(state())),incomeSummary(positions(state()))),securities(positions(state())))) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); render('open'); }, { once:true });
  else { bind(); render('open'); }
})();
