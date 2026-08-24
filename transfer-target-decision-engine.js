(() => {
  'use strict';

  const BUILD = '20260824-transfer-target-decision-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const DEFAULT_MAX_TARGETS = 8;
  const DEFAULT_INCREMENT = 25;

  if (window.__AuroraTransferTargetDecisionEngine === BUILD) return;
  window.__AuroraTransferTargetDecisionEngine = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(round(value));
  const pct = value => `${Math.max(0, num(value)).toFixed(2)}%`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function core() { return window.AuroraPhase2Core || null; }
  function goal() { return core()?.incomeGoal || null; }

  function readState() {
    try {
      const live = window.Aurora2?.core?.read?.();
      if (live && typeof live === 'object') return live;
    } catch (_) {}
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function accountCode(value) {
    return core()?.accountCode?.(value) || 'CHECK';
  }

  function accountLabel(value) {
    return core()?.accountLabel?.(value) || String(value || 'Broker');
  }

  function ticker(value) {
    return core()?.ticker?.(value) || String(value || '').toUpperCase().trim();
  }

  function ensureIncomeTruth() {
    if (window.AuroraIncomeTruth?.metrics) return;
    if ([...document.scripts].some(script => String(script.src || '').includes('income-truth.js'))) return;
    const script = document.createElement('script');
    script.src = 'income-truth.js?v=20260824-income-truth-consolidated-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'target-decision-income-truth';
    document.head.appendChild(script);
  }

  function fallbackMetrics(state) {
    const holdings = arr(state?.squad?.holdings).filter(row => {
      const status = String(row?.status || '').toUpperCase();
      if (!['ACTIVE','LOCKED'].includes(status)) return false;
      if (!(num(row?.shares) > 0)) return false;
      if (row?.incomeExempt === true || row?.dividendEligible === false) return false;
      const tk = ticker(row?.ticker);
      const ac = accountCode(row?.account);
      const reason = String(`${row?.lockReason || ''} ${row?.role || ''} ${row?.source || ''}`).toLowerCase();
      if (tk === 'TSCO' && (ac === 'CHECK' || /saye|save as you earn|2029|legacy/.test(reason))) return false;
      return true;
    });
    let annual = 0, value = 0;
    holdings.forEach(row => {
      const shares = Math.max(0, num(row?.shares));
      const dps = Math.max(0, num(row?.annualDpsGbp));
      annual += shares > 0 && dps > 0 ? shares * dps : Math.max(0, num(row?.annualIncomeGbp));
      value += Math.max(0, num(row?.marketValueGbp)) || (shares * Math.max(0, num(row?.livePriceGbp)));
    });
    return { annual, monthly:annual / 12, yieldPct:value > 0 ? annual / value * 100 : 0 };
  }

  function incomeMetrics(state) {
    try {
      if (window.AuroraIncomeTruth?.metrics) return window.AuroraIncomeTruth.metrics(state);
    } catch (_) {}
    return fallbackMetrics(state);
  }

  function targetForRow(state, row) {
    const id = String(row?.securityId || '');
    const tk = ticker(row?.ticker);
    return arr(state?.scouting?.targets).find(target => id && String(target?.securityId || target?.security_id || '') === id) ||
      arr(state?.scouting?.targets).find(target => ticker(target?.ticker) === tk) || {};
  }

  function routeRows(state, preview) {
    return arr(preview?.allocations).filter(row => num(row?.amount ?? row?.financeAmount ?? row?.totalPurchaseAmount) > 0).map(row => {
      const target = targetForRow(state, row);
      const financeAmount = round(row?.financeAmount ?? row?.amount);
      const brokerCashAmount = round(row?.brokerCashAmount);
      const totalPurchaseAmount = round(row?.totalPurchaseAmount ?? (financeAmount + brokerCashAmount));
      const yieldPct = Math.max(0, num(row?.yieldPct));
      const annualIncome = Math.max(0, num(row?.phase2ExpectedAnnualIncome ?? row?.expectedAnnualIncome ?? (totalPurchaseAmount * yieldPct / 100)));
      return {
        ...row,
        securityId:row?.securityId || target?.securityId || target?.security_id || '',
        ticker:ticker(row?.ticker || target?.ticker),
        account:accountCode(row?.account || target?.preferredAccount || target?.account),
        financeAmount,
        brokerCashAmount,
        totalPurchaseAmount,
        yieldPct,
        annualIncome,
        scoutingStatus:String(target?.status || row?.scoutingStatus || 'pass').toLowerCase(),
        scoutingScore:Math.max(0, num(target?.maximumScore || target?.sustainableScore || row?.scoutingScore)),
        estimatedPriceGbp:Math.max(0, num(row?.estimatedPriceGbp))
      };
    });
  }

  function routeSummary(state, preview) {
    const rows = routeRows(state, preview);
    const amount = round(rows.reduce((sum,row) => sum + row.totalPurchaseAmount, 0));
    const income = Number(rows.reduce((sum,row) => sum + row.annualIncome, 0).toFixed(6));
    return {
      rows,
      amount,
      financeAmount:round(rows.reduce((sum,row) => sum + row.financeAmount, 0)),
      brokerCashAmount:round(rows.reduce((sum,row) => sum + row.brokerCashAmount, 0)),
      income,
      yieldPct:amount > 0 ? income / amount * 100 : 0
    };
  }

  function maximumIncomeCap(globalBudget, candidateCount, status, increment) {
    if (candidateCount <= 1) return globalBudget;
    let capPct = candidateCount === 2 ? 0.65 : globalBudget < 1500 ? 0.55 : globalBudget < 2500 ? 0.45 : 0.38;
    if (String(status || '').toLowerCase() === 'caution') capPct = Math.min(capPct, 0.35);
    return Math.max(increment, Math.floor((globalBudget * capPct) / increment) * increment);
  }

  function allocateGroup(group, financeBudget, globalFinanceBudget, totalCount, increment) {
    const result = group.map(row => ({...row, acceleratedFinanceAmount:0}));
    let remaining = round(financeBudget);
    let guard = 0;
    while (remaining >= increment - 0.001 && guard < 10000) {
      guard += 1;
      const ranked = result.map((row,index) => ({
        index,
        yieldPct:row.yieldPct,
        score:row.scoutingScore,
        cap:maximumIncomeCap(globalFinanceBudget, totalCount, row.scoutingStatus, increment)
      })).filter(item => result[item.index].acceleratedFinanceAmount + increment <= item.cap + 0.001)
        .sort((a,b) => b.yieldPct - a.yieldPct || b.score - a.score || a.index - b.index);
      if (!ranked.length) break;
      result[ranked[0].index].acceleratedFinanceAmount = round(result[ranked[0].index].acceleratedFinanceAmount + increment);
      remaining = round(remaining - increment);
    }
    if (remaining > 0.005) {
      const ranked = result.map((row,index) => ({
        index,
        yieldPct:row.yieldPct,
        score:row.scoutingScore,
        cap:maximumIncomeCap(globalFinanceBudget, totalCount, row.scoutingStatus, increment)
      })).filter(item => result[item.index].acceleratedFinanceAmount + remaining <= item.cap + 0.005)
        .sort((a,b) => b.yieldPct - a.yieldPct || b.score - a.score || a.index - b.index);
      if (ranked.length) {
        result[ranked[0].index].acceleratedFinanceAmount = round(result[ranked[0].index].acceleratedFinanceAmount + remaining);
        remaining = 0;
      }
    }
    return {rows:result, remaining:round(remaining)};
  }

  function acceleratedScenario(state, preview, route) {
    if (!route?.rows?.length || !(route.financeAmount > 0)) return null;
    const increment = Math.max(1, num(preview?.phase2BasePreview?.increment ?? preview?.increment ?? state?.transfer?.settings?.increment ?? DEFAULT_INCREMENT));
    const totalCount = route.rows.length;
    const byAccount = new Map();
    route.rows.forEach(row => {
      if (!byAccount.has(row.account)) byAccount.set(row.account, []);
      byAccount.get(row.account).push(row);
    });

    let acceleratedRows = [];
    for (const [account, rows] of byAccount.entries()) {
      const financeBudget = round(rows.reduce((sum,row) => sum + row.financeAmount, 0));
      const brokerCash = round(rows.reduce((sum,row) => sum + row.brokerCashAmount, 0));
      const allocated = allocateGroup(rows, financeBudget, route.financeAmount, totalCount, increment);
      if (allocated.remaining > 0.005) return null;
      const financeTotal = round(allocated.rows.reduce((sum,row) => sum + row.acceleratedFinanceAmount, 0));
      let brokerAssigned = 0;
      allocated.rows.forEach((row,index) => {
        const share = financeTotal > 0 ? row.acceleratedFinanceAmount / financeTotal : 1 / Math.max(1, allocated.rows.length);
        const cashAmount = index === allocated.rows.length - 1 ? round(brokerCash - brokerAssigned) : round(brokerCash * share);
        brokerAssigned = round(brokerAssigned + cashAmount);
        const totalPurchaseAmount = round(row.acceleratedFinanceAmount + cashAmount);
        acceleratedRows.push({
          ...row,
          financeAmount:row.acceleratedFinanceAmount,
          amount:row.acceleratedFinanceAmount,
          brokerCashAmount:cashAmount,
          totalPurchaseAmount,
          phase2ExpectedAnnualIncome:Number((totalPurchaseAmount * row.yieldPct / 100).toFixed(6)),
          expectedAnnualIncome:Number((totalPurchaseAmount * row.yieldPct / 100).toFixed(6)),
          phase2FundingSource:cashAmount > 0 ? 'FINANCE_PLUS_EXISTING_BROKER_CASH' : 'FINANCE_ONLY',
          targetPaceMode:'INCOME_ACCELERATED_SAFE_BASKET'
        });
      });
    }

    acceleratedRows = acceleratedRows.sort((a,b) => b.yieldPct - a.yieldPct || b.scoutingScore - a.scoutingScore || a.ticker.localeCompare(b.ticker));
    const financeAmount = round(acceleratedRows.reduce((sum,row) => sum + row.financeAmount, 0));
    const brokerCashAmount = round(acceleratedRows.reduce((sum,row) => sum + row.brokerCashAmount, 0));
    const amount = round(acceleratedRows.reduce((sum,row) => sum + row.totalPurchaseAmount, 0));
    const income = Number(acceleratedRows.reduce((sum,row) => sum + num(row.phase2ExpectedAnnualIncome), 0).toFixed(6));
    const fundingPlan = window.AuroraTransferBrokerCashAuthority?.fundingPlanFor?.(acceleratedRows.map(row => ({...row, amount:row.totalPurchaseAmount}))) || null;
    const reconciles = Math.abs(financeAmount - route.financeAmount) <= 0.005 && Math.abs(brokerCashAmount - route.brokerCashAmount) <= 0.005 && fundingPlan?.reconciles !== false;
    if (!reconciles) return null;
    return {rows:acceleratedRows, financeAmount, brokerCashAmount, amount, income, yieldPct:amount > 0 ? income / amount * 100 : 0, fundingPlan, reconciles:true};
  }

  function humanDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
  }

  function duration(months) {
    const total = Math.max(0, Math.round(Math.abs(num(months))));
    const years = Math.floor(total / 12), remainder = total % 12;
    if (!years) return `${remainder} month${remainder === 1 ? '' : 's'}`;
    if (!remainder) return `${years} year${years === 1 ? '' : 's'}`;
    return `${years}y ${remainder}m`;
  }

  function dateImpact(before, after) {
    if (!before?.reached || !after?.reached) return null;
    return num(before.months) - num(after.months);
  }

  function impactText(months) {
    if (months == null) return 'No comparable date';
    if (Math.abs(months) < 0.5) return 'No full-month change';
    return months > 0 ? `${duration(months)} sooner` : `${duration(months)} later`;
  }

  function paceLabel(yieldPct, requiredYield) {
    if (!(yieldPct > 0)) return {label:'NO YIELD EVIDENCE',cls:'neutral'};
    if (requiredYield == null) return {label:'HELPS TARGET',cls:'neutral'};
    if (yieldPct >= requiredYield + 0.25) return {label:'ACCELERATES TARGET',cls:'good'};
    if (yieldPct >= requiredYield - 0.25) return {label:'ON 8-YEAR PACE',cls:'good'};
    return {label:'HELPS, BUT BELOW PACE',cls:'warn'};
  }

  function decisionFor({recommendedStatus, acceleratedStatus, recommendedRequiredMonthly, acceleratedRequiredMonthly, monthlyPlan, recommendedImpact, acceleratedImpact, accelerated}) {
    if (recommendedStatus?.label === 'AHEAD OF TARGET' || recommendedStatus?.label === 'ON TARGET') {
      return {label:'KEEP RECOMMENDED ROUTE',cls:'good',note:'The current safe Transfer basket keeps the £2,000/month eight-year target intact. There is no need to chase a higher headline yield.'};
    }
    const recommendedExtra = recommendedRequiredMonthly == null ? null : Math.max(0, recommendedRequiredMonthly - monthlyPlan);
    const acceleratedExtra = acceleratedRequiredMonthly == null ? null : Math.max(0, acceleratedRequiredMonthly - monthlyPlan);
    const acceleratedMaterial = Boolean(accelerated && acceleratedImpact != null && recommendedImpact != null && acceleratedImpact > recommendedImpact + 0.5);
    if (acceleratedStatus && ['AHEAD OF TARGET','ON TARGET'].includes(acceleratedStatus.label) && acceleratedMaterial) {
      return {label:'INCOME-ACCELERATED SAFE BASKET AVAILABLE',cls:'good',note:'The same Scouting-approved purchase basket can be weighted more heavily toward its higher-yielding legs and still stay inside current broker and concentration guards.'};
    }
    if (recommendedExtra != null && recommendedExtra > 0 && (!acceleratedMaterial || acceleratedExtra == null || acceleratedExtra >= recommendedExtra - 1)) {
      return {label:'KEEP QUALITY ROUTE + RAISE CONTRIBUTION',cls:'warn',note:`The safer lever is contribution, not chasing unapproved 8%+ shares. About ${money(recommendedExtra)} extra per month would restore the eight-year pace at the current route yield.`};
    }
    if (acceleratedMaterial) {
      return {label:'ACCELERATED WEIGHTING IMPROVES THE DATE',cls:'warn',note:`The income-weighted version improves the projection, but it still does not fully restore the eight-year date. ${acceleratedExtra != null && acceleratedExtra > 0 ? `${money(acceleratedExtra)} extra per month would close the remaining gap.` : 'The remaining gap should be reviewed rather than filled by chasing yield.'}`};
    }
    return {label:'TARGET PACE NEEDS MORE CONTRIBUTION',cls:'bad',note:'The current approved basket does not contain enough extra safe yield to fix the date by weighting alone. Keep the safety gates and use contribution or a longer timeline rather than forcing higher-risk shares.'};
  }

  function ensureStyle() {
    if (document.getElementById('transferTargetDecisionStyles')) return;
    const style = document.createElement('style');
    style.id = 'transferTargetDecisionStyles';
    style.textContent = `
      #transferTargetDecision{margin-top:22px;border:1px solid rgba(255,213,107,.2);border-radius:24px;padding:26px;background:linear-gradient(180deg,rgba(27,20,8,.90),rgba(7,10,18,.97));box-shadow:0 18px 55px rgba(0,0,0,.2)}
      #transferTargetDecision .td-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
      #transferTargetDecision .td-head h2{margin:0;font:900 clamp(28px,5vw,44px)/1 system-ui}
      #transferTargetDecision .td-head p{margin:8px 0 0;max-width:820px;color:#a69c8a;font:600 13px/1.55 system-ui}
      #transferTargetDecision .td-badge{border-radius:999px;padding:9px 12px;border:1px solid rgba(255,255,255,.12);font:900 9px/1 system-ui;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap}
      #transferTargetDecision .td-badge.good{color:#9effbf;border-color:rgba(89,255,154,.28);background:rgba(89,255,154,.05)}
      #transferTargetDecision .td-badge.warn{color:#ffe19a;border-color:rgba(255,213,107,.28);background:rgba(255,213,107,.05)}
      #transferTargetDecision .td-badge.bad{color:#ff9da8;border-color:rgba(255,79,97,.3);background:rgba(255,79,97,.06)}
      #transferTargetDecision .td-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:18px}
      #transferTargetDecision .td-kpi{border:1px solid rgba(255,255,255,.075);border-radius:15px;padding:13px;background:rgba(0,0,0,.14)}
      #transferTargetDecision .td-kpi small{display:block;color:#8a8277;font:800 8px/1.2 system-ui;letter-spacing:.08em;text-transform:uppercase}
      #transferTargetDecision .td-kpi strong{display:block;margin-top:6px;font:900 18px/1.2 system-ui}
      #transferTargetDecision .td-kpi span{display:block;margin-top:5px;color:#7f817f;font:650 9px/1.4 system-ui}
      #transferTargetDecision .td-decision{margin-top:15px;border-left:3px solid #ffd56b;border-radius:0 13px 13px 0;padding:14px 16px;background:rgba(255,213,107,.045)}
      #transferTargetDecision .td-decision strong{display:block;font:950 12px/1.2 system-ui;letter-spacing:.08em}.td-decision span{display:block;margin-top:7px;color:#b2a995;font:650 11px/1.55 system-ui}
      #transferTargetDecision .td-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:14px;padding:12px;border:1px solid rgba(110,231,255,.1);border-radius:13px;background:rgba(110,231,255,.025)}
      #transferTargetDecision .td-controls label{display:grid;gap:5px;color:#8da0ad;font:800 9px system-ui;text-transform:uppercase;letter-spacing:.07em}.td-controls input{width:145px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:#090d15;color:#f4f8fb;padding:9px 10px;font:850 12px system-ui}.td-controls button{border:1px solid rgba(110,231,255,.2);border-radius:9px;background:rgba(110,231,255,.05);color:#c9f8ff;padding:10px 12px;font:850 10px system-ui}
      #transferTargetDecision .td-table-wrap{overflow:auto;margin-top:14px;border:1px solid rgba(255,255,255,.07);border-radius:14px}#transferTargetDecision table{width:100%;border-collapse:collapse;min-width:760px}#transferTargetDecision th{padding:10px;text-align:left;color:#7f8790;background:rgba(0,0,0,.18);font:850 8px system-ui;text-transform:uppercase;letter-spacing:.06em}#transferTargetDecision td{padding:11px 10px;border-top:1px solid rgba(255,255,255,.055);font:750 10px/1.4 system-ui;vertical-align:top}#transferTargetDecision td small{display:block;margin-top:3px;color:#73808a;font:650 8px/1.35 system-ui}
      #transferTargetDecision .td-good{color:#9af7bb}.td-warn{color:#ffd26b}.td-bad{color:#ff9ba5}.td-neutral{color:#9fb1bd}.td-title{margin:18px 0 6px;font:900 17px system-ui}.td-note{margin:0;color:#808b93;font:650 10px/1.5 system-ui}.td-method{margin-top:13px;color:#6f7e88;font:650 9px/1.5 system-ui}
      @media(max-width:980px){#transferTargetDecision .td-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:560px){#transferTargetDecision .td-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById('transferTargetDecision');
    if (panel) return panel;
    const preview = document.getElementById('transferAllocationPreview');
    const brokerCash = document.getElementById('transferPhase2BrokerCash');
    const anchor = preview || brokerCash || document.getElementById('transferMissionShell');
    if (!anchor) return null;
    panel = document.createElement('section');
    panel.id = 'transferTargetDecision';
    anchor.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function render() {
    const G = goal();
    const state = readState();
    const preview = window.AuroraTransferAllocationPreview;
    if (!G || !state || !preview?.ready) return false;
    ensureIncomeTruth();
    ensureStyle();
    const panel = ensurePanel();
    if (!panel) return false;

    const metrics = incomeMetrics(state);
    const settings = G.planSettings();
    const monthlyPlan = settings.monthlyInvestment;
    const currentAnnual = Math.max(0, num(metrics?.annual));
    const currentMonthly = currentAnnual / 12;
    const portfolioYield = Math.max(0, num(metrics?.yieldPct));
    const recommended = routeSummary(state, preview);
    const accelerated = acceleratedScenario(state, preview, recommended);
    const recommendedFutureYield = recommended.yieldPct > 0 ? recommended.yieldPct : portfolioYield;
    const acceleratedFutureYield = accelerated?.yieldPct > 0 ? accelerated.yieldPct : recommendedFutureYield;
    const baselineYield = portfolioYield > 0 ? portfolioYield : recommendedFutureYield;

    const baselineProjection = G.project({startAnnual:currentAnnual,monthlyInvestment:monthlyPlan,yieldPct:baselineYield});
    const recommendedProjection = G.project({startAnnual:currentAnnual + recommended.income,monthlyInvestment:monthlyPlan,yieldPct:recommendedFutureYield});
    const acceleratedProjection = accelerated ? G.project({startAnnual:currentAnnual + accelerated.income,monthlyInvestment:monthlyPlan,yieldPct:acceleratedFutureYield}) : null;
    const recommendedStatus = G.projectionStatus(recommendedProjection);
    const acceleratedStatus = acceleratedProjection ? G.projectionStatus(acceleratedProjection) : null;
    const recommendedRequiredMonthly = G.requiredMonthlyInvestment(currentAnnual + recommended.income, recommendedFutureYield);
    const acceleratedRequiredMonthly = accelerated ? G.requiredMonthlyInvestment(currentAnnual + accelerated.income, acceleratedFutureYield) : null;
    const recommendedRequiredYield = G.requiredYieldPct(currentAnnual + recommended.income, monthlyPlan);
    const recommendedImpact = dateImpact(baselineProjection, recommendedProjection);
    const acceleratedImpact = acceleratedProjection ? dateImpact(baselineProjection, acceleratedProjection) : null;
    const decision = decisionFor({recommendedStatus,acceleratedStatus,recommendedRequiredMonthly,acceleratedRequiredMonthly,monthlyPlan,recommendedImpact,acceleratedImpact,accelerated});
    const maxTargets = Math.max(1, Math.floor(num(state?.transfer?.settings?.maxTargets) || DEFAULT_MAX_TARGETS));
    const extraMonthly = recommendedRequiredMonthly == null ? null : Math.max(0, recommendedRequiredMonthly - monthlyPlan);
    const routePace = paceLabel(recommended.yieldPct, recommendedRequiredYield);

    const scenarios = [
      {label:'Current portfolio pace',amount:0,income:0,yieldPct:baselineYield,projection:baselineProjection,status:G.projectionStatus(baselineProjection),requiredMonthly:G.requiredMonthlyInvestment(currentAnnual, baselineYield),impact:null},
      {label:'Recommended Transfer basket',amount:recommended.amount,income:recommended.income,yieldPct:recommended.yieldPct,projection:recommendedProjection,status:recommendedStatus,requiredMonthly:recommendedRequiredMonthly,impact:recommendedImpact}
    ];
    if (accelerated) scenarios.push({label:'Income-accelerated safe weighting',amount:accelerated.amount,income:accelerated.income,yieldPct:accelerated.yieldPct,projection:acceleratedProjection,status:acceleratedStatus,requiredMonthly:acceleratedRequiredMonthly,impact:acceleratedImpact});

    panel.innerHTML = `
      <div class="td-head"><div><span class="transfer-kicker">Phase 2 • Target Pace Decision Engine</span><h2>£2,000/month route intelligence</h2><p>Transfer now judges the whole approved basket against the eight-year income target. It keeps the existing Scouting, broker, price, concentration and Finance gates, then shows whether the current route shortens or lengthens the journey and whether contribution is a safer lever than chasing headline yield.</p></div><span class="td-badge ${decision.cls}">${esc(decision.label)}</span></div>
      <div class="td-kpis">
        <div class="td-kpi"><small>Current Monthly Income</small><strong>${money(currentMonthly)}</strong><span>Canonical Squad forward income</span></div>
        <div class="td-kpi"><small>8-Year Goal Date</small><strong>${humanDate(G.goalDate)}</strong><span>£24,000/year target</span></div>
        <div class="td-kpi"><small>Recommended Route Yield</small><strong>${pct(recommended.yieldPct)}</strong><span>${recommended.rows.length} of up to ${maxTargets} route legs</span></div>
        <div class="td-kpi"><small>Projected £2k Date</small><strong>${recommendedProjection.reached ? humanDate(recommendedProjection.date) : '> 30 years'}</strong><span>${impactText(recommendedImpact)} vs current pace</span></div>
        <div class="td-kpi"><small>Required Yield at Plan</small><strong>${recommendedRequiredYield == null ? '> 50%' : pct(recommendedRequiredYield)}</strong><span>At ${money(monthlyPlan)}/month after this route</span></div>
        <div class="td-kpi"><small>Extra Monthly to Hold Goal</small><strong>${extraMonthly == null ? 'Review' : money(extraMonthly)}</strong><span>${extraMonthly > 0 ? 'Contribution alternative to chasing yield' : 'Current contribution is sufficient in this model'}</span></div>
      </div>
      <div class="td-decision"><strong>${esc(decision.label)}</strong><span>${esc(decision.note)}</span></div>
      <div class="td-controls"><label>Monthly investment plan £<input id="tdMonthlyPlan" type="number" min="0" step="50" value="${monthlyPlan.toFixed(2)}"></label><button id="tdUpdatePlan" type="button">Update Target Pace</button><span class="td-neutral">This is the same £2,000 plan used by the Income Centre tracker.</span></div>
      <h3 class="td-title">Route comparison</h3><p class="td-note">The income-accelerated scenario, when available, only reweights shares already inside the current executable Transfer basket. It does not introduce a new high-yield share or bypass Scouting.</p>
      <div class="td-table-wrap"><table><thead><tr><th>Scenario</th><th>Purchase</th><th>Route Yield</th><th>Annual Income Added</th><th>Projected £2k Date</th><th>Target Impact</th><th>Monthly Needed</th><th>Status</th></tr></thead><tbody>${scenarios.map(row => `<tr><td><strong>${esc(row.label)}</strong></td><td>${row.amount > 0 ? money(row.amount) : '—'}</td><td>${pct(row.yieldPct)}</td><td>${row.income > 0 ? `+${money(row.income)}` : '—'}</td><td>${row.projection?.reached ? humanDate(row.projection.date) : '> 30 years'}</td><td>${row.impact == null ? 'Baseline' : impactText(row.impact)}</td><td>${row.requiredMonthly == null ? 'Review' : money(row.requiredMonthly)}</td><td class="td-${row.status?.cls || 'neutral'}">${esc(row.status?.label || 'CHECK')}</td></tr>`).join('')}</tbody></table></div>
      <h3 class="td-title">What each share does to the pace</h3><p class="td-note">The basket is dynamic, not fixed at three shares. Transfer can use a wider set of approved opportunities up to the configured maximum; each current leg is compared with the yield required to keep the eight-year plan on pace.</p>
      <div class="td-table-wrap"><table><thead><tr><th>Share</th><th>Broker</th><th>Total Planned Buy</th><th>Yield</th><th>Annual Income Added</th><th>8-Year Pace</th></tr></thead><tbody>${recommended.rows.length ? recommended.rows.map(row => { const pace = paceLabel(row.yieldPct,recommendedRequiredYield); return `<tr><td><strong>${esc(row.ticker)}</strong></td><td>${esc(accountLabel(row.account))}</td><td>${money(row.totalPurchaseAmount)}<small>${row.brokerCashAmount > 0 ? `${money(row.financeAmount)} Finance + ${money(row.brokerCashAmount)} existing broker cash` : `${money(row.financeAmount)} Finance`}</small></td><td>${pct(row.yieldPct)}</td><td class="td-good">+${money(row.annualIncome)}</td><td class="td-${pace.cls}">${esc(pace.label)}</td></tr>`; }).join('') : `<tr><td colspan="6" class="td-neutral">Waiting for an executable Transfer basket.</td></tr>`}</tbody></table></div>
      <div class="td-method">Decision method: canonical current forward income + the current Transfer basket + ongoing monthly contributions + reinvested dividends. The recommended route scenario assumes future contributions continue at the current route yield; the baseline uses the current portfolio yield. The accelerated scenario preserves the same safe basket and broker cash by account while changing only the weighting. It remains a planning scenario until the normal Transfer route is saved and Registration confirms actual purchases.</div>
    `;

    const updatePlan = () => {
      const input = panel.querySelector('#tdMonthlyPlan');
      G.saveMonthlyInvestment(input?.value);
      render();
    };
    panel.querySelector('#tdUpdatePlan')?.addEventListener('click', updatePlan);
    panel.querySelector('#tdMonthlyPlan')?.addEventListener('keydown', event => { if (event.key === 'Enter') updatePlan(); });

    window.AuroraTransferTargetDecisionEngine = Object.freeze({
      build:BUILD,
      ready:true,
      readOnly:true,
      targetMonthly:G.targetMonthly,
      targetAnnual:G.targetAnnual,
      goalDate:G.goalDate,
      monthlyInvestment:monthlyPlan,
      currentAnnualIncome:Number(currentAnnual.toFixed(2)),
      currentMonthlyIncome:Number(currentMonthly.toFixed(2)),
      recommended:Object.freeze({amount:recommended.amount,income:Number(recommended.income.toFixed(2)),yieldPct:Number(recommended.yieldPct.toFixed(4)),projectedDate:recommendedProjection.reached ? recommendedProjection.date.toISOString().slice(0,10) : null,impactMonths:recommendedImpact,requiredMonthlyInvestment:recommendedRequiredMonthly,status:recommendedStatus.label,legCount:recommended.rows.length}),
      accelerated:accelerated ? Object.freeze({amount:accelerated.amount,income:Number(accelerated.income.toFixed(2)),yieldPct:Number(accelerated.yieldPct.toFixed(4)),projectedDate:acceleratedProjection?.reached ? acceleratedProjection.date.toISOString().slice(0,10) : null,impactMonths:acceleratedImpact,requiredMonthlyInvestment:acceleratedRequiredMonthly,status:acceleratedStatus?.label || 'CHECK',legCount:accelerated.rows.length}) : null,
      decision:Object.freeze(decision),
      render
    });
    document.documentElement.dataset.transferTargetDecision = decision.cls;
    window.dispatchEvent(new CustomEvent('aurora:transfer-target-decision', {detail:window.AuroraTransferTargetDecisionEngine}));
    return true;
  }

  function scheduleRender(delay = 30) {
    clearTimeout(scheduleRender.timer);
    scheduleRender.timer = setTimeout(render, delay);
  }

  async function boot() {
    ensureIncomeTruth();
    let tries = 0;
    while ((!goal() || !window.AuroraTransferAllocationPreview?.ready) && tries < 240) {
      await new Promise(resolve => setTimeout(resolve, 50));
      tries += 1;
    }
    render();
    window.addEventListener('aurora2:state', () => scheduleRender(50));
    window.addEventListener('aurora:phase2-allocation-wired', () => scheduleRender(50));
    window.addEventListener('aurora:phase2-broker-cash', () => scheduleRender(80));
    window.addEventListener('focus', () => scheduleRender(50));
    window.addEventListener('pageshow', () => scheduleRender(50));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleRender(50); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
