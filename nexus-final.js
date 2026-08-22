(() => {
  'use strict';

  const BUILD = '20260822-nexus-final-2';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const INCOME_SUMMARY_KEY = 'aurora2:income:summary:v1';
  const INCOME_CALENDAR_KEY = 'aurora2:income:calendar-local:v1';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);
  const PITCH_POSITIONS = [
    [50,88],[18,72],[39,69],[61,69],[82,72],[28,48],[50,43],[72,48],[18,22],[50,15],[82,22]
  ];

  if (window.__AuroraNexusFinal === BUILD) return;
  window.__AuroraNexusFinal = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const raw = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const num = value => raw(value) ?? 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const money = value => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value) || 0);
  const signedMoney = value => `${Number(value) > 0 ? '+' : ''}${money(value)}`;
  const pct = value => `${Number(value) > 0 ? '+' : ''}${(Number(value) || 0).toFixed(2)}%`;
  const upper = value => String(value || '').trim().toUpperCase();
  const ticker = value => upper(value).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');

  function readJson(key, fallback = null) {
    try { const parsed = JSON.parse(localStorage.getItem(key) || 'null'); return parsed ?? fallback; }
    catch (_) { return fallback; }
  }

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      const parsed = readJson(key, null);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    return {};
  }

  function accountCode(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('212')) return 'T212';
    if (text.includes('ig')) return 'IG';
    return 'CHECK';
  }

  function activeHolding(row) {
    const status = upper(row?.status || 'ACTIVE');
    return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(status) && num(row?.shares) > 0;
  }

  function holdingMetrics(row) {
    const shares = Math.max(0, num(row?.shares));
    const book = Math.max(0, num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp ?? (shares * num(row?.avgCostGbp))));
    const price = Math.max(0, num(row?.livePriceGbp ?? row?.priceGbp ?? row?.live_price_gbp));
    const directValue = Math.max(0, num(row?.marketValueGbp ?? row?.currentValueGbp ?? row?.market_value_gbp));
    const value = shares > 0 && price > 0 ? shares * price : directValue;
    const dps = Math.max(0, num(row?.annualDpsGbp ?? row?.annualDps ?? row?.annual_dps_gbp));
    const directIncome = Math.max(0, num(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? row?.annualIncome));
    const income = shares > 0 && dps > 0 ? shares * dps : directIncome;
    const profit = value - book;
    const dayPct = raw(row?.dailyChangePct ?? row?.dayChangePct ?? row?.todayChangePct ?? row?.changePct ?? row?.daily_change_pct);
    let dayGbp = raw(row?.dailyChangeGbp ?? row?.dayChangeGbp ?? row?.todayChangeGbp ?? row?.changeGbp);
    if (dayGbp === null && dayPct !== null && price > 0 && shares > 0 && dayPct > -99.9) {
      const previous = price / (1 + dayPct / 100);
      dayGbp = (price - previous) * shares;
    }
    return {shares,book,price,value,income,profit,dayPct,dayGbp};
  }

  function portfolio(state) {
    const rows = arr(state?.squad?.holdings).filter(activeHolding);
    const map = new Map();
    let value = 0, book = 0, income = 0, today = 0, todayEvidence = 0;
    rows.forEach(row => {
      const tk = ticker(row?.ticker || row?.name);
      if (!tk) return;
      const m = holdingMetrics(row);
      value += m.value; book += m.book; income += m.income;
      if (m.dayGbp !== null) { today += m.dayGbp; todayEvidence += 1; }
      const item = map.get(tk) || {ticker:tk,name:row?.name || tk,value:0,book:0,income:0,profit:0,positions:0,accounts:new Set(),sector:row?.sector || 'Unclassified'};
      item.value += m.value; item.book += m.book; item.income += m.income; item.profit += m.profit; item.positions += 1; item.accounts.add(accountCode(row?.account));
      map.set(tk, item);
    });
    const players = [...map.values()].map(item => ({...item,accounts:[...item.accounts]}));
    const marketToday = raw(state?.market?.portfolioTodayChangeGbp ?? state?.market?.portfolio_today_change_gbp);
    const todayGbp = marketToday !== null ? marketToday : (todayEvidence ? today : null);
    const marketPct = raw(state?.market?.portfolioTodayChangePct ?? state?.market?.portfolio_today_change_pct);
    const todayPct = marketPct !== null ? marketPct : (todayGbp !== null && value - todayGbp > 0 ? todayGbp / (value - todayGbp) * 100 : null);
    return {rows,players,value,book,income,monthly:income/12,profit:value-book,todayGbp,todayPct};
  }

  function financeSummary(state) {
    const finance = state?.finance || {};
    const plan = finance.plan || {};
    const holdingPot = arr(finance.pots).find(pot => !pot?.archived && String(pot?.name || '').trim().toLowerCase() === 'holding pot');
    let safeRelease = raw(finance?.paydayReleaseCandidate?.releaseAmount ?? finance?.paydayReleaseCandidate?.safeSurplus ?? plan?.releaseAmount) ?? 0;
    let commitments = raw(finance?.paydayReleaseCandidate?.commitments) ?? 0;
    try {
      const control = window.Aurora2?.financePaydayControl;
      if (typeof control?.paydayFundingPreview === 'function') {
        const preview = control.paydayFundingPreview(state, plan)?.c;
        if (preview) {
          safeRelease = Math.max(0, num(preview.safeSurplus));
          commitments = Math.max(0, num(preview.commitments));
        }
      }
    } catch (_) {}
    return {
      holdingPot: Math.max(0, num(holdingPot?.balance)),
      safeRelease,
      commitments,
      protectedCash: Math.max(0, num(plan?.protectedCash)),
      paydayDate: String(plan?.paydayDate || ''),
      openingCash: Math.max(0, num(plan?.openingCash)),
      wagesReceived: Math.max(0, num(plan?.wagesReceived))
    };
  }

  function missionSummary(state) {
    const mission = state?.mission || null;
    const status = upper(mission?.status);
    const active = Boolean(mission && num(mission?.approvedBudget) > 0 && !TERMINAL.has(status));
    const route = active && state?.transfer?.route && (!state.transfer.route.missionId || String(state.transfer.route.missionId) === String(mission?.id || '')) ? state.transfer.route : null;
    const allocations = arr(route?.allocations).filter(row => num(row?.amount) > 0);
    const allocated = allocations.reduce((sum,row) => sum + num(row?.amount), 0) || Math.max(0, num(mission?.amountAllocated));
    const budget = active ? Math.max(0, num(mission?.approvedBudget)) : 0;
    const remaining = active ? Math.max(0, num(mission?.amountRemaining ?? (budget - allocated))) : 0;
    return {mission,active,status:active ? (status || 'DRAFT') : 'NO ACTIVE MISSION',route,allocations,budget,allocated,remaining,strategy:String(mission?.strategy || state?.scouting?.strategy || state?.transfer?.selectedStrategy || 'Not selected')};
  }

  function scoutingSummary(state) {
    const targets = arr(state?.scouting?.targets);
    const ready = targets.filter(row => row?.eligibleForTransfer === true && ['PASS','CAUTION','READY','APPROVED'].includes(upper(row?.status || 'PASS')));
    const approved = targets.filter(row => ['APPROVED','PASS','READY'].includes(upper(row?.status)));
    const blocked = targets.filter(row => row?.restricted || ['BLOCK','BLOCKED','RESTRICTED','REJECTED'].includes(upper(row?.status)));
    const best = [...ready].sort((a,b) => num(b?.score ?? b?.confidence ?? b?.sustainableScore ?? b?.maximumScore) - num(a?.score ?? a?.confidence ?? a?.sustainableScore ?? a?.maximumScore))[0] || null;
    return {targets,ready,approved,blocked,best};
  }

  function registrationSummary(state, mission) {
    const receipts = arr(state?.registration?.receipts);
    const drafts = arr(state?.transfer?.registrationDrafts);
    const confirmed = receipts.length || drafts.filter(row => upper(row?.status) === 'CONFIRMED').length;
    const missionReceipts = mission?.active ? receipts.filter(row => String(row?.missionId || '') === String(mission.mission?.id || '')) : [];
    return {receipts,confirmed,missionReceipts};
  }

  function incomeSummary(state, portfolioData) {
    const cached = readJson(INCOME_SUMMARY_KEY, null) || {};
    const annual = raw(cached?.annualIncomeGbp ?? cached?.annualIncome ?? cached?.annual) ?? portfolioData.income;
    const monthly = raw(cached?.monthlyIncomeGbp ?? cached?.monthlyIncome ?? cached?.monthly) ?? annual / 12;
    let next = cached?.nextDividend || cached?.next || null;
    if (!next) {
      const local = arr(readJson(INCOME_CALENDAR_KEY, []));
      const merged = [...arr(state?.income?.calendar), ...local].filter(event => {
        const d = new Date(`${String(event?.payDate || event?.pay_date || '').slice(0,10)}T12:00:00`);
        return !Number.isNaN(d.getTime()) && d.getTime() >= Date.now() - 86400000 && !['CANCELLED','ARCHIVED'].includes(upper(event?.status));
      }).sort((a,b) => String(a?.payDate || a?.pay_date).localeCompare(String(b?.payDate || b?.pay_date)));
      next = merged[0] || null;
    }
    return {annual,monthly,next};
  }

  function reportDate(row) {
    const value = row?.report_date || row?.reportDate || row?.generated_at || row?.generatedAt || row?.created_at || row?.createdAt || row?.timestamp || row?.date || '';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function matchSummary(state, portfolioData) {
    const md = state?.matchday || state?.matchReport || state?.matchdayReport || {};
    const reports = [md?.latest,md?.report,...arr(md?.reports),...arr(state?.portfolio?.matchdayReports)].filter(Boolean).sort((a,b) => (reportDate(b)?.getTime() || 0) - (reportDate(a)?.getTime() || 0));
    const today = new Date();
    const current = reports.find(row => {
      const d = reportDate(row); return d && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    }) || null;
    if (current) {
      const verdict = String(current?.verdict || current?.market_result || current?.marketResult || current?.result || 'FULL TIME').toUpperCase();
      return {status:'FULL TIME',result:verdict,summary:String(current?.summary || current?.manager_report || current?.managerReport || 'Published Match Report available.'),published:true};
    }
    const hour = today.getHours();
    const move = portfolioData.todayPct;
    const provisional = move === null ? 'IN SESSION' : move > .05 ? 'WINNING' : move < -.05 ? 'LOSING' : 'LEVEL';
    return {status:hour >= 17 ? 'AWAITING REPORT' : 'IN SESSION',result:provisional,summary:move === null ? 'Waiting for enough market evidence to call today’s session.' : `${pct(move)} current portfolio movement before the 5PM full-time report.`,published:false};
  }

  function autoSyncSummary() {
    const status = window.AuroraBrowserAutoSync?.status?.() || {};
    const role = String(status?.role || status?.meta?.role || 'WAITING').toUpperCase();
    const last = status?.lastActionAt || status?.meta?.lastMasterUploadAt || status?.meta?.lastFollowerApplyAt || null;
    return {role,last,error:String(status?.lastError || '')};
  }

  function managerOrder(state, mission, scouting, finance) {
    if (mission.active) {
      if (['LOCKED','PARTIALLY_REGISTERED'].includes(mission.status)) return ['Complete Registration','A locked Transfer route is waiting for broker execution to be recorded.','registration.html'];
      if (mission.status === 'DRAFT') return ['Build the Transfer route',`${money(mission.budget)} has been released by Finance and is waiting for allocation.`,'transfer.html'];
      if (mission.status === 'READY') return ['Review the Transfer route','The mission is ready for the next controlled Transfer step.','transfer.html'];
      return ['Review active mission',`${mission.status.replaceAll('_',' ')} • ${money(mission.remaining)} remaining.`,'transfer.html'];
    }
    if (scouting.best) return [`Scouting has ${ticker(scouting.best?.ticker || scouting.best?.name)} ready`,`${scouting.ready.length} Transfer-eligible target${scouting.ready.length === 1 ? '' : 's'} currently pass the evidence gate.`,'scouting.html'];
    if (finance.safeRelease > 0) return ['Finance has a safe release',`${money(finance.safeRelease)} is available in the current payday forecast, but no mission is active.`,'finance.html'];
    return ['Hold team shape','No urgent mission gate is currently waiting. Keep the club state clean and review the next signal.','match-report.html'];
  }

  function text(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function classForSign(el, value) {
    if (!el) return;
    el.classList.remove('good','bad','gold','cyan');
    if (value > 0) el.classList.add('good'); else if (value < 0) el.classList.add('bad');
  }

  function restoreNexusChrome() {
    const status = document.querySelector('.topbar .status');
    if (status) {
      const stage = status.querySelector('span');
      const label = status.querySelector('b');
      if (stage) stage.textContent = 'NEXUS';
      if (label) label.textContent = 'LIVE COMMAND';
    }
  }

  function renderPortfolio(state, p) {
    text('nxPortfolioValue', money(p.value));
    text('nxPortfolioMeta', `${p.players.length} players • ${p.rows.length} account positions`);
    const move = document.getElementById('nxTodayMove');
    text('nxTodayMove', p.todayGbp === null ? 'Awaiting feed' : signedMoney(p.todayGbp));
    text('nxTodayMoveMeta', p.todayPct === null ? 'Daily evidence incomplete' : pct(p.todayPct));
    classForSign(move, p.todayGbp || 0);
    text('nxAnnualIncome', money(p.income));
    text('nxMonthlyIncome', `${money(p.income / 12)} / month`);
  }

  function renderLeaders(p) {
    const byValue = [...p.players].sort((a,b) => b.value-a.value);
    const byIncome = [...p.players].sort((a,b) => b.income-a.income);
    const byProfit = [...p.players].sort((a,b) => b.profit-a.profit);
    const byDrag = [...p.players].sort((a,b) => a.profit-b.profit);
    const rows = [
      ['nxValueCaptain',byValue[0],row => money(row.value)],
      ['nxIncomeCaptain',byIncome[0],row => `${money(row.income)}/yr`],
      ['nxProfitLeader',byProfit[0],row => `${row.profit >= 0 ? '+' : ''}${money(row.profit)}`],
      ['nxBiggestDrag',byDrag[0]?.profit < 0 ? byDrag[0] : null,row => money(row.profit)]
    ];
    rows.forEach(([prefix,row,value]) => { text(`${prefix}Ticker`, row?.ticker || '—'); text(`${prefix}Value`, row ? value(row) : '—'); });

    const broker = new Map([['IG',0],['T212',0],['CHECK',0]]);
    p.rows.forEach(row => broker.set(accountCode(row?.account), (broker.get(accountCode(row?.account)) || 0) + holdingMetrics(row).value));
    const host = document.getElementById('nxBrokerBars');
    if (host) host.innerHTML = [...broker.entries()].map(([code,value]) => {
      const share = p.value > 0 ? value/p.value*100 : 0;
      const label = code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212' : 'Review';
      return `<div class="nx-bar-row"><span>${esc(label)}</span><div><i style="width:${Math.min(100,share).toFixed(1)}%"></i></div><strong>${share.toFixed(1)}%</strong></div>`;
    }).join('');
  }

  function renderPitch(p) {
    const host = document.getElementById('nxPitchPlayers');
    if (!host) return;
    const rows = [...p.players].sort((a,b) => b.value-a.value).slice(0,11);
    host.innerHTML = rows.map((row,index) => {
      const pos = PITCH_POSITIONS[index] || [50,50];
      return `<div class="nx-player" style="left:${pos[0]}%;top:${pos[1]}%" title="${esc(row.name)}"><b>${esc(row.ticker)}</b><span>${esc(money(row.value))}</span></div>`;
    }).join('');
    text('nxPitchNote', rows.length ? `${rows.length} largest unique holdings by current canonical value. Multi-broker positions are combined.` : 'Starting XI will appear when canonical Squad holdings are available.');
  }

  function renderCommandCards(p, f, m, s, r, income, match, sync) {
    text('nxFinanceStatus', money(f.safeRelease)); text('nxFinanceMeta', `Safe release • Holding Pot ${money(f.holdingPot)}`);
    text('nxScoutingStatus', s.ready.length ? `${s.ready.length} READY` : 'MONITORING'); text('nxScoutingMeta', s.best ? `${ticker(s.best?.ticker || s.best?.name)} leads the eligible list` : `${s.blocked.length} restricted • ${s.targets.length} tracked`);
    text('nxTransferStatus', m.status.replaceAll('_',' ')); text('nxTransferMeta', m.active ? `${money(m.budget)} budget • ${m.allocations.length} route leg${m.allocations.length===1?'':'s'}` : 'No live Finance mission');
    text('nxRegistrationStatus', r.confirmed ? `${r.confirmed} RECEIPT${r.confirmed===1?'':'S'}` : 'READY'); text('nxRegistrationMeta', m.active ? `${r.missionReceipts.length} receipt${r.missionReceipts.length===1?'':'s'} on current mission` : 'Broker execution truth');
    text('nxSquadStatus', `${p.players.length} PLAYERS`); text('nxSquadMeta', `${money(p.value)} canonical value`);
    text('nxIncomeStatus', `${money(income.monthly)}/m`); text('nxIncomeMeta', `${money(income.annual)} annual forward income`);
    text('nxMatchStatus', match.status); text('nxMatchMeta', match.result);
    text('nxSystemStatus', sync.role === 'MASTER' ? 'MASTER' : sync.role === 'FOLLOWER' ? 'FOLLOWER' : 'CHECKING'); text('nxSystemMeta', sync.error ? 'Auto sync needs attention' : 'Browser state protection active');
  }

  function renderFinanceTransfer(f, m) {
    text('nxHoldingPot', money(f.holdingPot));
    text('nxSafeRelease', money(f.safeRelease));
    text('nxProtectedCash', money(f.protectedCash));
    text('nxPaydayDate', f.paydayDate || '—');
    text('nxMissionStatus', m.status.replaceAll('_',' '));
    text('nxMissionBudget', money(m.budget));
    text('nxMissionAllocated', money(m.allocated));
    text('nxMissionRemaining', money(m.remaining));
    text('nxMissionStrategy', m.strategy);
    const note = document.getElementById('nxRouteStatus');
    if (note) note.textContent = m.active ? `${m.allocations.length} allocation leg${m.allocations.length===1?'':'s'} • ${m.route?.locked === true ? 'route locked' : 'route not yet locked'} • mission ${m.mission?.id || 'active'}.` : 'Finance and Transfer are clear. No active investment mission is currently consuming the next payday forecast.';
  }

  function renderIncomeMatch(income, match) {
    text('nxIncomeMonthly', `${money(income.monthly)}/m`);
    text('nxIncomeAnnualSide', `${money(income.annual)}/yr`);
    const p625 = Math.max(0, Math.min(100, income.monthly / 625 * 100));
    const p2000 = Math.max(0, Math.min(100, income.monthly / 2000 * 100));
    const bar625 = document.getElementById('nxProgress625'); if (bar625) bar625.style.width = `${p625}%`;
    const bar2000 = document.getElementById('nxProgress2000'); if (bar2000) bar2000.style.width = `${p2000}%`;
    text('nxProgress625Text', `${p625.toFixed(1)}%`); text('nxProgress2000Text', `${p2000.toFixed(1)}%`);
    const next = income.next;
    let nextText = 'Calendar building';
    if (next) {
      if (typeof next === 'string') nextText = next;
      else nextText = `${ticker(next?.ticker || next?.name) || 'Dividend'} • ${String(next?.payDate || next?.pay_date || '').slice(0,10) || 'date pending'}`;
    }
    text('nxNextDividend', nextText);
    text('nxMatchReportStatus', match.status);
    text('nxMatchResult', match.result);
    text('nxMatchSummary', match.summary);
  }

  function renderHealth(state, p, sync) {
    text('nxHealthState', state?.schemaVersion ? `Schema ${state.schemaVersion}` : 'State connected');
    text('nxHealthSquad', `${p.rows.length} positions`);
    text('nxHealthSync', sync.role || 'WAITING');
    text('nxHealthUpdated', state?.updatedAt ? new Date(state.updatedAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : 'No timestamp');
  }

  function render() {
    restoreNexusChrome();
    const state = readState();
    const p = portfolio(state);
    const f = financeSummary(state);
    const m = missionSummary(state);
    const s = scoutingSummary(state);
    const r = registrationSummary(state, m);
    const income = incomeSummary(state, p);
    const match = matchSummary(state, p);
    const sync = autoSyncSummary();
    const order = managerOrder(state,m,s,f);

    text('nxManagerOrder', order[0]); text('nxManagerNote', order[1]);
    const link = document.getElementById('nxManagerLink'); if (link) link.href = order[2];
    text('nxHoldingPotHero', money(f.holdingPot));
    text('nxSafeReleaseHero', money(f.safeRelease));
    renderPortfolio(state,p);
    renderCommandCards(p,f,m,s,r,income,match,sync);
    renderLeaders(p);
    renderPitch(p);
    renderFinanceTransfer(f,m);
    renderIncomeMatch(income,match);
    renderHealth(state,p,sync);
    document.documentElement.dataset.nexusFinal = 'live';

    window.AuroraNexusFinal = Object.freeze({build:BUILD,ready:true,portfolioValue:p.value,annualIncome:income.annual,monthlyIncome:income.monthly,missionStatus:m.status,autoSyncRole:sync.role});
  }

  function boot() {
    render();
    window.addEventListener('aurora2:state', () => setTimeout(render, 0));
    window.addEventListener('aurora:browser-auto-sync', () => setTimeout(render, 0));
    window.addEventListener('storage', event => { if ([STATE_KEY,BACKUP_KEY,INCOME_SUMMARY_KEY,INCOME_CALENDAR_KEY].includes(event.key)) setTimeout(render, 0); });
    window.addEventListener('focus', () => setTimeout(render, 120));
    window.addEventListener('pageshow', () => setTimeout(render, 120));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(render, 120); });
    [500,1500,4000].forEach(delay => setTimeout(render, delay));
    setInterval(() => { if (document.visibilityState === 'visible') render(); }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();