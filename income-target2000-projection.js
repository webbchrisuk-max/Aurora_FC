(() => {
  'use strict';

  const BUILD = '20260824-phase2-income-2000-projection-1';
  const PLAN_KEY = 'aurora2:income:target2000-plan:v1';
  const STATE_KEY = 'aurora2:state:v1';
  const TARGET_MONTHLY = 2000;
  const TARGET_ANNUAL = TARGET_MONTHLY * 12;
  const GOAL_DATE = new Date('2034-08-24T12:00:00');
  const DEFAULT_MONTHLY_INVESTMENT = 1000;
  const MAX_MONTHS = 360;

  if (window.__AuroraIncomeTarget2000Projection === BUILD) return;
  window.__AuroraIncomeTarget2000Projection = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(round2(value));
  const pct = value => `${Math.max(0, num(value)).toFixed(2)}%`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function readState() {
    try {
      const live = window.Aurora2?.core?.read?.();
      if (live && typeof live === 'object') return live;
    } catch (_) {}
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function planSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAN_KEY) || '{}') || {};
      return { monthlyInvestment: round2(saved.monthlyInvestment || DEFAULT_MONTHLY_INVESTMENT) || DEFAULT_MONTHLY_INVESTMENT };
    } catch (_) {
      return { monthlyInvestment: DEFAULT_MONTHLY_INVESTMENT };
    }
  }

  function saveMonthlyInvestment(value) {
    const monthlyInvestment = Math.max(0, round2(value));
    try { localStorage.setItem(PLAN_KEY, JSON.stringify({ monthlyInvestment, updatedAt: new Date().toISOString() })); }
    catch (_) {}
    return monthlyInvestment;
  }

  function addMonths(date, months) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  function monthsBetween(a, b) {
    if (!(a instanceof Date) || !(b instanceof Date) || Number.isNaN(a) || Number.isNaN(b)) return 0;
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30.4375;
  }

  function humanDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  function humanDuration(months) {
    const total = Math.max(0, Math.round(num(months)));
    const years = Math.floor(total / 12);
    const remainder = total % 12;
    if (!years) return `${remainder} month${remainder === 1 ? '' : 's'}`;
    if (!remainder) return `${years} year${years === 1 ? '' : 's'}`;
    return `${years}y ${remainder}m`;
  }

  function project({ startAnnual, monthlyInvestment, yieldPct, startDate = new Date(), maxMonths = MAX_MONTHS }) {
    let annual = Math.max(0, num(startAnnual));
    const monthly = Math.max(0, num(monthlyInvestment));
    const yieldRate = Math.max(0, num(yieldPct)) / 100;
    const started = new Date(startDate);
    started.setHours(12, 0, 0, 0);

    if (annual >= TARGET_ANNUAL) return { reached:true, months:0, date:started, annualIncome:annual };
    if (!(yieldRate > 0) || (!(monthly > 0) && !(annual > 0))) return { reached:false, months:null, date:null, annualIncome:annual };

    for (let month = 1; month <= maxMonths; month += 1) {
      const dividendCashReinvested = annual / 12;
      const invested = monthly + dividendCashReinvested;
      annual += invested * yieldRate;
      if (annual >= TARGET_ANNUAL) {
        return { reached:true, months:month, date:addMonths(started, month), annualIncome:annual };
      }
    }
    return { reached:false, months:null, date:null, annualIncome:annual };
  }

  function annualAtMonths({ startAnnual, monthlyInvestment, yieldPct, months }) {
    let annual = Math.max(0, num(startAnnual));
    const monthly = Math.max(0, num(monthlyInvestment));
    const rate = Math.max(0, num(yieldPct)) / 100;
    for (let i = 0; i < Math.max(0, Math.floor(months)); i += 1) {
      const dividendCashReinvested = annual / 12;
      annual += (monthly + dividendCashReinvested) * rate;
    }
    return annual;
  }

  function monthsToGoal(startDate = new Date()) {
    return Math.max(0, Math.ceil(monthsBetween(startDate, GOAL_DATE)));
  }

  function requiredMonthlyInvestment(startAnnual, yieldPct, startDate = new Date()) {
    const months = monthsToGoal(startDate);
    if (!months || startAnnual >= TARGET_ANNUAL) return 0;
    if (!(yieldPct > 0)) return null;
    let low = 0, high = 10000;
    if (annualAtMonths({ startAnnual, monthlyInvestment:high, yieldPct, months }) < TARGET_ANNUAL) return null;
    for (let i = 0; i < 48; i += 1) {
      const mid = (low + high) / 2;
      if (annualAtMonths({ startAnnual, monthlyInvestment:mid, yieldPct, months }) >= TARGET_ANNUAL) high = mid;
      else low = mid;
    }
    return round2(high);
  }

  function requiredYieldPct(startAnnual, monthlyInvestment, startDate = new Date()) {
    const months = monthsToGoal(startDate);
    if (!months || startAnnual >= TARGET_ANNUAL) return 0;
    let low = 0, high = 50;
    if (annualAtMonths({ startAnnual, monthlyInvestment, yieldPct:high, months }) < TARGET_ANNUAL) return null;
    for (let i = 0; i < 48; i += 1) {
      const mid = (low + high) / 2;
      if (annualAtMonths({ startAnnual, monthlyInvestment, yieldPct:mid, months }) >= TARGET_ANNUAL) high = mid;
      else low = mid;
    }
    return Number(high.toFixed(2));
  }

  function routeContext(state, T) {
    const route = state?.transfer?.route;
    const terminal = new Set(['REGISTERED','COMPLETE','COMPLETED','ARCHIVED','CANCELLED']);
    if (!route || terminal.has(String(route?.status || '').toUpperCase()) || terminal.has(String(state?.mission?.status || '').toUpperCase())) {
      return { active:false, amount:0, income:0, yieldPct:0, allocations:[] };
    }
    const allocations = arr(route?.allocations).filter(row => num(row?.amount ?? row?.amountGbp) > 0);
    const amount = Math.max(0, num(route?.allocated ?? route?.financeBudget ?? allocations.reduce((sum,row) => sum + num(row?.amount ?? row?.amountGbp), 0)));
    const income = Math.max(0, num(T?.activeTransferIncome?.(state) ?? route?.expectedAnnualIncome ?? route?.income));
    const routeYield = amount > 0 ? income / amount * 100 : 0;
    return { active:income > 0 || allocations.length > 0, amount, income, yieldPct:routeYield, allocations };
  }

  function projectionStatus(result) {
    if (!result?.reached || !result.date) return { label:'BEHIND TARGET', cls:'bad', note:'Projected beyond the 30-year modelling window.' };
    const delta = monthsBetween(result.date, GOAL_DATE);
    if (Math.abs(delta) <= 1) return { label:'ON TARGET', cls:'good', note:'Projected within one month of the 8-year target.' };
    if (delta > 1) return { label:'AHEAD OF TARGET', cls:'good', note:`About ${humanDuration(delta)} ahead of the 8-year target.` };
    return { label:'BEHIND TARGET', cls:'bad', note:`About ${humanDuration(Math.abs(delta))} behind the 8-year target.` };
  }

  function paceLabel(yieldPct, requiredYield) {
    if (!(yieldPct > 0)) return { label:'NO YIELD EVIDENCE', cls:'neutral' };
    if (requiredYield == null) return { label:'HELPS TARGET', cls:'neutral' };
    if (yieldPct >= requiredYield + 0.25) return { label:'ACCELERATES 8-YEAR PACE', cls:'good' };
    if (yieldPct >= requiredYield - 0.25) return { label:'ON 8-YEAR PACE', cls:'good' };
    return { label:'HELPS, BUT BELOW 8-YEAR PACE', cls:'warn' };
  }

  function ensureStyle() {
    if (document.getElementById('incomeTarget2000ProjectionStyle')) return;
    const style = document.createElement('style');
    style.id = 'incomeTarget2000ProjectionStyle';
    style.textContent = `
      #target2000Projection{border-color:rgba(255,213,107,.18);background:linear-gradient(180deg,rgba(20,14,29,.96),rgba(8,11,19,.98))}
      #target2000Projection .t2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      #target2000Projection .t2-head h2{margin:5px 0 0;font:950 clamp(26px,4vw,42px)/1 system-ui}
      #target2000Projection .t2-badge{border:1px solid rgba(255,213,107,.28);border-radius:999px;padding:8px 11px;font:900 9px system-ui;letter-spacing:.08em;white-space:nowrap}
      #target2000Projection .t2-badge.good{color:#a9ffc7;border-color:rgba(99,245,162,.28);background:rgba(99,245,162,.06)}
      #target2000Projection .t2-badge.bad{color:#ffabb3;border-color:rgba(255,117,129,.3);background:rgba(255,117,129,.07)}
      #target2000Projection .t2-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:16px}
      #target2000Projection .t2-kpi{border:1px solid rgba(255,255,255,.075);border-radius:14px;padding:13px;background:rgba(0,0,0,.14)}
      #target2000Projection .t2-kpi small{display:block;color:#7e91a0;font:800 8px system-ui;text-transform:uppercase;letter-spacing:.08em}
      #target2000Projection .t2-kpi strong{display:block;margin-top:6px;font:900 18px system-ui}
      #target2000Projection .t2-kpi span{display:block;margin-top:5px;color:#748797;font:650 9px/1.35 system-ui}
      #target2000Projection .t2-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:15px;padding:12px;border:1px solid rgba(110,231,255,.1);border-radius:14px;background:rgba(110,231,255,.025)}
      #target2000Projection .t2-controls label{display:grid;gap:5px;color:#8ca1ae;font:800 9px system-ui;text-transform:uppercase;letter-spacing:.07em}
      #target2000Projection .t2-controls input{width:150px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:#090d15;color:#f4f8fb;padding:9px 10px;font:850 12px system-ui}
      #target2000Projection .t2-controls button{border:1px solid rgba(110,231,255,.2);border-radius:9px;background:rgba(110,231,255,.05);color:#c9f8ff;padding:10px 12px;font:850 10px system-ui}
      #target2000Projection .t2-table-wrap{overflow:auto;margin-top:14px;border:1px solid rgba(255,255,255,.07);border-radius:14px}
      #target2000Projection table{width:100%;border-collapse:collapse;min-width:760px}
      #target2000Projection th{padding:10px;text-align:left;color:#7890a0;background:rgba(0,0,0,.18);font:850 8px system-ui;text-transform:uppercase;letter-spacing:.06em}
      #target2000Projection td{padding:11px 10px;border-top:1px solid rgba(255,255,255,.055);font:750 10px/1.35 system-ui;vertical-align:top}
      #target2000Projection td small{display:block;margin-top:3px;color:#718694;font:650 8px/1.3 system-ui}
      #target2000Projection .t2-good{color:#9af7bb}.t2-warn{color:#ffd26b}.t2-bad{color:#ff9ba5}.t2-neutral{color:#9fb1bd}
      #target2000Projection .t2-section-title{margin:18px 0 7px;font:900 17px system-ui}.t2-section-note{margin:0;color:#7f919e;font:650 10px/1.5 system-ui}
      #target2000Projection .t2-impact{margin-top:13px;border-left:3px solid #ffd56b;border-radius:0 12px 12px 0;padding:12px 14px;background:rgba(255,213,107,.045);color:#aab8c2;font:700 10px/1.5 system-ui}
      #target2000Projection .t2-method{margin-top:13px;color:#6f8290;font:650 9px/1.5 system-ui}
      @media(max-width:900px){#target2000Projection .t2-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){#target2000Projection .t2-head{display:grid}.t2-badge{justify-self:start}#target2000Projection .t2-kpis{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById('target2000Projection');
    if (panel) return panel;
    const promotion = document.getElementById('promotion');
    if (!promotion) return null;
    panel = document.createElement('section');
    panel.id = 'target2000Projection';
    panel.className = 'income-panel full';
    promotion.insertAdjacentElement('afterend', panel);

    const jumpbar = document.querySelector('.income-jumpbar');
    if (jumpbar && !jumpbar.querySelector('[data-jump="target2000Projection"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.jump = 'target2000Projection';
      button.textContent = '£2k Projection';
      jumpbar.insertBefore(button, jumpbar.children[1] || null);
    }
    return panel;
  }

  function scenarioRows(startAnnual, yieldPct, route, monthlyPlan) {
    const inputs = [...new Set([monthlyPlan, 1000, 1500, 2000].map(round2).filter(v => v > 0))];
    const rows = inputs.map(monthly => {
      const result = project({ startAnnual, monthlyInvestment:monthly, yieldPct });
      const status = projectionStatus(result);
      return { label:monthly === monthlyPlan ? 'Your monthly plan' : `${money(monthly)} / month`, monthly, startAnnual, yieldPct, result, status, routeApplied:false };
    });
    if (route.active && route.income > 0) {
      const result = project({ startAnnual:startAnnual + route.income, monthlyInvestment:monthlyPlan, yieldPct });
      const status = projectionStatus(result);
      rows.unshift({ label:'Your plan + current Transfer route', monthly:monthlyPlan, startAnnual:startAnnual + route.income, yieldPct, result, status, routeApplied:true });
    }
    return rows;
  }

  function render() {
    const T = window.AuroraIncomeTruth;
    if (!T?.metrics) return false;
    const state = readState();
    const metrics = T.metrics(state);
    const route = routeContext(state, T);
    const settings = planSettings();
    const monthlyPlan = settings.monthlyInvestment;
    const currentAnnual = Math.max(0, num(metrics.annual));
    const currentMonthly = currentAnnual / 12;
    const portfolioYield = Math.max(0, num(metrics.yieldPct));
    const assumedYield = portfolioYield > 0 ? portfolioYield : Math.max(0, route.yieldPct);
    const assumedYieldSource = portfolioYield > 0 ? 'current portfolio market yield' : route.yieldPct > 0 ? 'current Transfer route yield' : 'yield unavailable';
    const afterRouteAnnual = currentAnnual + Math.max(0, route.income);
    const selectedProjection = project({ startAnnual:afterRouteAnnual, monthlyInvestment:monthlyPlan, yieldPct:assumedYield });
    const selectedStatus = projectionStatus(selectedProjection);
    const requiredMonthly = requiredMonthlyInvestment(afterRouteAnnual, assumedYield);
    const requiredYield = requiredYieldPct(afterRouteAnnual, monthlyPlan);
    const beforeRouteProjection = project({ startAnnual:currentAnnual, monthlyInvestment:monthlyPlan, yieldPct:assumedYield });
    const timeSavedMonths = beforeRouteProjection.reached && selectedProjection.reached ? Math.max(0, num(beforeRouteProjection.months) - num(selectedProjection.months)) : 0;
    const rows = scenarioRows(currentAnnual, assumedYield, route, monthlyPlan);
    const panel = ensurePanel();
    if (!panel) return false;
    ensureStyle();

    const progress = Math.min(100, currentMonthly / TARGET_MONTHLY * 100);
    const routeMonthly = route.income / 12;
    const routePace = paceLabel(route.yieldPct, requiredYield);
    const goalMonths = monthsToGoal();

    const legRows = route.allocations.map(row => {
      const amount = Math.max(0, num(row?.amount ?? row?.amountGbp));
      const income = Math.max(0, num(row?.expectedAnnualIncome ?? row?.expectedAnnualIncomeGbp ?? (amount * Math.max(0, num(row?.yieldPct)) / 100)));
      const y = amount > 0 ? (income > 0 ? income / amount * 100 : Math.max(0, num(row?.yieldPct))) : Math.max(0, num(row?.yieldPct));
      const pace = paceLabel(y, requiredYield);
      return { ticker:T.ticker?.(row?.ticker) || String(row?.ticker || '—'), account:T.accountLabel?.(row?.account) || String(row?.account || '—'), amount, income, y, pace };
    });

    panel.innerHTML = `
      <div class="t2-head">
        <div><span class="income-kicker">PHASE 2 • £2,000 / MONTH TARGET CONTROL</span><h2>8-Year Dividend Projection</h2><p class="t2-section-note">Tracks whether the current investing pace is projected to reach £24,000 a year in forward dividends by ${humanDate(GOAL_DATE)} and shows what the active Transfer purchases do to that date.</p></div>
        <span class="t2-badge ${selectedStatus.cls}">${selectedStatus.label}</span>
      </div>
      <div class="t2-kpis">
        <div class="t2-kpi"><small>Current Monthly Income</small><strong>${money(currentMonthly)}</strong><span>${progress.toFixed(1)}% of £2,000</span></div>
        <div class="t2-kpi"><small>8-Year Goal Date</small><strong>${humanDate(GOAL_DATE)}</strong><span>${humanDuration(goalMonths)} remaining</span></div>
        <div class="t2-kpi"><small>Projected £2k Date</small><strong>${selectedProjection.reached ? humanDate(selectedProjection.date) : '> 30 years'}</strong><span>${selectedStatus.note}</span></div>
        <div class="t2-kpi"><small>Required Monthly at Current Yield</small><strong>${requiredMonthly == null ? 'Not reachable' : money(requiredMonthly)}</strong><span>To reach the 8-year date at ${pct(assumedYield)}</span></div>
        <div class="t2-kpi"><small>Required Yield at Your Plan</small><strong>${requiredYield == null ? '> 50%' : pct(requiredYield)}</strong><span>At ${money(monthlyPlan)} invested each month</span></div>
      </div>
      <div class="t2-controls">
        <label>Monthly investment plan £<input id="target2000MonthlyPlan" type="number" min="0" step="50" value="${monthlyPlan.toFixed(2)}"></label>
        <button id="target2000SavePlan" type="button">Update Projection</button>
        <span class="t2-neutral">Assumed future purchase yield: <strong>${pct(assumedYield)}</strong> from ${esc(assumedYieldSource)}. Dividends are modelled as reinvested monthly.</span>
      </div>
      <h3 class="t2-section-title">Projection table</h3>
      <p class="t2-section-note">Same portfolio starting point, with different monthly investment levels. The current active Transfer route is shown separately so you can see whether today's buys pull the target date forward.</p>
      <div class="t2-table-wrap"><table>
        <thead><tr><th>Scenario</th><th>Monthly Invest</th><th>Starting Income</th><th>Assumed Yield</th><th>Projected £2k Date</th><th>Time to Target</th><th>Status</th></tr></thead>
        <tbody>${rows.map(row => `<tr><td><strong>${esc(row.label)}</strong>${row.routeApplied ? `<small>Includes +${money(route.income)}/yr from active Transfer route</small>` : ''}</td><td>${money(row.monthly)}</td><td>${money(row.startAnnual / 12)}/m</td><td>${pct(row.yieldPct)}</td><td>${row.result.reached ? humanDate(row.result.date) : '> 30 years'}</td><td>${row.result.reached ? humanDuration(row.result.months) : 'Outside model'}</td><td class="t2-${row.status.cls}">${esc(row.status.label)}<small>${esc(row.status.note)}</small></td></tr>`).join('')}</tbody>
      </table></div>
      <h3 class="t2-section-title">What the shares you are buying do</h3>
      <p class="t2-section-note">This uses the active saved Transfer route only. Each leg is compared with the yield currently required for the £${monthlyPlan.toLocaleString('en-GB')} monthly plan to hit the 8-year target.</p>
      ${route.active ? `
        <div class="t2-impact"><strong>Current route impact:</strong> ${money(route.amount)} deployed is projected to add <strong>+${money(route.income)}/yr</strong> (${money(routeMonthly)}/month) at a route yield of <strong>${pct(route.yieldPct)}</strong>. ${timeSavedMonths > 0 ? `That moves the modelled £2,000/month date forward by about <strong>${humanDuration(timeSavedMonths)}</strong>.` : 'The route adds income, but the model does not yet show a full-month reduction in the target date.'} <span class="t2-${routePace.cls}">${esc(routePace.label)}</span></div>
        <div class="t2-table-wrap"><table>
          <thead><tr><th>Share</th><th>Broker</th><th>Buy Amount</th><th>Annual Income Added</th><th>Yield</th><th>Impact on 8-Year Pace</th></tr></thead>
          <tbody>${legRows.length ? legRows.map(leg => `<tr><td><strong>${esc(leg.ticker)}</strong></td><td>${esc(leg.account)}</td><td>${money(leg.amount)}</td><td class="t2-good">+${money(leg.income)}</td><td>${pct(leg.y)}</td><td class="t2-${leg.pace.cls}">${esc(leg.pace.label)}</td></tr>`).join('') : `<tr><td colspan="6" class="t2-neutral">The active route has an income projection but no saved per-share allocation legs yet.</td></tr>`}</tbody>
        </table></div>` : `<div class="t2-impact"><strong>No active saved Transfer route.</strong> The 8-year projection is live from the canonical Squad, but share-by-share impact will appear here as soon as Transfer has a current route.</div>`}
      <div class="t2-method">Projection method: current canonical forward income + monthly contributions + reinvested dividend cash, invested at the displayed yield. It deliberately does not invent future dividend growth, dividend cuts, capital growth or future share prices. Transfer income remains a projection until Registration/Squad confirms the purchase.</div>
    `;

    panel.querySelector('#target2000SavePlan')?.addEventListener('click', () => {
      const input = panel.querySelector('#target2000MonthlyPlan');
      saveMonthlyInvestment(input?.value);
      render();
    });
    panel.querySelector('#target2000MonthlyPlan')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      saveMonthlyInvestment(event.currentTarget.value);
      render();
    });

    document.documentElement.dataset.incomeTarget2000Projection = selectedStatus.cls;
    window.AuroraIncomeTarget2000Projection = Object.freeze({
      build: BUILD,
      ready: true,
      targetMonthly: TARGET_MONTHLY,
      targetAnnual: TARGET_ANNUAL,
      goalDate: GOAL_DATE.toISOString().slice(0,10),
      monthlyInvestment: monthlyPlan,
      assumedYieldPct: Number(assumedYield.toFixed(4)),
      currentAnnualIncome: Number(currentAnnual.toFixed(2)),
      currentMonthlyIncome: Number(currentMonthly.toFixed(2)),
      activeRouteAnnualIncome: Number(route.income.toFixed(2)),
      activeRouteYieldPct: Number(route.yieldPct.toFixed(4)),
      projectedDate: selectedProjection.reached ? selectedProjection.date.toISOString().slice(0,10) : null,
      projectedMonths: selectedProjection.months,
      status: selectedStatus.label,
      requiredMonthlyInvestment: requiredMonthly,
      requiredYieldPct: requiredYield,
      routeTimeSavedMonths: Number(timeSavedMonths.toFixed(2)),
      readOnlyPortfolio: true,
      render
    });
    window.dispatchEvent(new CustomEvent('aurora:income-target2000-projection', { detail: window.AuroraIncomeTarget2000Projection }));
    return true;
  }

  async function boot() {
    let tries = 0;
    while ((!window.AuroraIncomeTruth?.metrics || !document.getElementById('promotion')) && tries < 240) {
      await new Promise(resolve => setTimeout(resolve, 50));
      tries += 1;
    }
    if (!window.AuroraIncomeTruth?.metrics) return;
    render();
    window.addEventListener('aurora2:state', () => setTimeout(render, 40));
    window.addEventListener('focus', () => setTimeout(render, 40));
    window.addEventListener('pageshow', () => setTimeout(render, 40));
    window.addEventListener('aurora:income-summary', () => setTimeout(render, 40));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(render, 40); });
  }

  window.AuroraIncomeTarget2000ProjectionMath = Object.freeze({ build:BUILD, project, annualAtMonths, requiredMonthlyInvestment, requiredYieldPct, monthsBetween });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
