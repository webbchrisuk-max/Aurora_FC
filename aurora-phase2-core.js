(() => {
  'use strict';

  const BUILD = '20260824-phase2-core-2';
  if (window.AuroraPhase2Core?.build === BUILD) return;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const roundMoney = value => Number(Math.max(0, num(value)).toFixed(2));

  function accountCode(value) {
    const raw = String(value || '').trim();
    const lower = raw.toLowerCase();
    const upper = raw.toUpperCase();
    if (upper === 'IG' || lower.includes('ig isa') || /\big\b/.test(lower)) return 'IG';
    if (upper === 'T212' || lower.includes('trading 212') || lower.includes('212 isa') || lower === '212') return 'T212';
    return 'CHECK';
  }

  function accountLabel(value) {
    const code = accountCode(value);
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212 ISA' : 'Broker unresolved';
  }

  function ticker(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/^LON:/, '')
      .replace(/^LSE:/, '')
      .replace(/\.L$/, '')
      .replace(/\.GB$/, '');
  }

  function exchange(value) {
    const raw = String(value || '').trim().toUpperCase();
    const aliases = { LON:'LSE', XLON:'LSE', LONDON:'LSE', XNAS:'NASDAQ', NAS:'NASDAQ', XNYS:'NYSE', TOR:'TSX', XTSE:'TSX' };
    return aliases[raw] || raw;
  }

  function securityIdentity(record = {}) {
    const explicit = String(record.securityId || record.security_id || '').trim();
    const parts = explicit.includes(':') ? explicit.split(':') : [];
    const symbol = ticker(record.ticker || record.symbol || parts.slice(1).join(':'));
    const market = exchange(record.exchange || record.exchangeCode || parts[0]);
    const account = accountCode(record.account || record.broker || record.preferredAccount);
    return Object.freeze({ securityId: explicit || `${market || 'UNKNOWN'}:${symbol || 'UNKNOWN'}`, exchange: market, ticker: symbol, account });
  }

  function normalizeBrokerCash(snapshot = {}) {
    const balances = snapshot?.balances && typeof snapshot.balances === 'object' ? snapshot.balances : snapshot;
    const IG = roundMoney(balances?.IG ?? balances?.ig ?? balances?.igIsa ?? balances?.igISA ?? 0);
    const T212 = roundMoney(balances?.T212 ?? balances?.t212 ?? balances?.trading212 ?? balances?.trading212Isa ?? 0);
    return Object.freeze({ IG, T212, total: roundMoney(IG + T212), source: 'AURORADATA2_BROKER_CASH' });
  }

  function allocationDemand(allocations = []) {
    const demand = { IG: 0, T212: 0, CHECK: 0, total: 0 };
    arr(allocations).forEach(row => {
      const amount = roundMoney(row?.amount ?? row?.amountGbp ?? row?.allocation ?? row?.allocationGbp);
      if (!(amount > 0)) return;
      const account = accountCode(row?.account || row?.broker || row?.preferredAccount);
      demand[account] = roundMoney((demand[account] || 0) + amount);
      demand.total = roundMoney(demand.total + amount);
    });
    return Object.freeze(demand);
  }

  function fundingPlan({ financeRelease = 0, brokerCash = {}, allocations = null, desiredByBroker = null } = {}) {
    const cash = normalizeBrokerCash(brokerCash);
    const demand = desiredByBroker && typeof desiredByBroker === 'object'
      ? {
          IG: roundMoney(desiredByBroker.IG),
          T212: roundMoney(desiredByBroker.T212),
          CHECK: roundMoney(desiredByBroker.CHECK),
          total: roundMoney(num(desiredByBroker.IG) + num(desiredByBroker.T212) + num(desiredByBroker.CHECK))
        }
      : allocationDemand(allocations || []);

    const finance = roundMoney(financeRelease);
    const brokers = {};
    let totalNewTransferRequired = 0;
    let totalExistingCashUsed = 0;
    let totalLockedCashUnused = 0;

    ['IG', 'T212'].forEach(account => {
      const desired = roundMoney(demand[account]);
      const existingCash = roundMoney(cash[account]);
      const existingCashUsed = roundMoney(Math.min(desired, existingCash));
      const newTransferRequired = roundMoney(Math.max(0, desired - existingCashUsed));
      const lockedCashUnused = roundMoney(Math.max(0, existingCash - existingCashUsed));
      brokers[account] = Object.freeze({
        account,
        label: accountLabel(account),
        desiredSpend: desired,
        existingCash,
        existingCashUsed,
        newTransferRequired,
        lockedCashUnused
      });
      totalNewTransferRequired = roundMoney(totalNewTransferRequired + newTransferRequired);
      totalExistingCashUsed = roundMoney(totalExistingCashUsed + existingCashUsed);
      totalLockedCashUnused = roundMoney(totalLockedCashUnused + lockedCashUnused);
    });

    const unresolvedDemand = roundMoney(demand.CHECK);
    const financeGap = roundMoney(Math.max(0, totalNewTransferRequired + unresolvedDemand - finance));
    const unassignedFinance = roundMoney(Math.max(0, finance - totalNewTransferRequired));

    return Object.freeze({
      financeRelease: finance,
      brokerCash: cash,
      totalBuyingPower: roundMoney(finance + cash.total),
      demand,
      brokers: Object.freeze(brokers),
      totalExistingCashUsed,
      totalNewTransferRequired,
      totalLockedCashUnused,
      unresolvedDemand,
      financeGap,
      unassignedFinance,
      reconciles: financeGap < 0.005 && unresolvedDemand < 0.005,
      ringFenceRule: 'IG cash funds IG purchases only; T212 cash funds Trading 212 purchases only; Finance release is the only flexible new-money pool.'
    });
  }

  const INCOME_PLAN_KEY = 'aurora2:income:target2000-plan:v1';
  const TARGET_MONTHLY = 2000;
  const TARGET_ANNUAL = TARGET_MONTHLY * 12;
  const GOAL_DATE = new Date('2034-08-24T12:00:00');
  const DEFAULT_MONTHLY_INVESTMENT = 1000;
  const MAX_MONTHS = 360;

  function addMonths(date, months) {
    const next = new Date(date);
    next.setHours(12, 0, 0, 0);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  function monthsBetween(a, b) {
    const left = a instanceof Date ? a : new Date(a);
    const right = b instanceof Date ? b : new Date(b);
    if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return 0;
    return (right.getFullYear() - left.getFullYear()) * 12 + (right.getMonth() - left.getMonth()) + (right.getDate() - left.getDate()) / 30.4375;
  }

  function incomePlanSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(INCOME_PLAN_KEY) || '{}') || {};
      return { monthlyInvestment: roundMoney(saved.monthlyInvestment || DEFAULT_MONTHLY_INVESTMENT) || DEFAULT_MONTHLY_INVESTMENT };
    } catch (_) {
      return { monthlyInvestment: DEFAULT_MONTHLY_INVESTMENT };
    }
  }

  function saveMonthlyInvestment(value) {
    const monthlyInvestment = roundMoney(value);
    try { localStorage.setItem(INCOME_PLAN_KEY, JSON.stringify({monthlyInvestment,updatedAt:new Date().toISOString()})); } catch (_) {}
    window.dispatchEvent(new CustomEvent('aurora:income-goal-plan', {detail:{monthlyInvestment}}));
    return monthlyInvestment;
  }

  function projectIncomeGoal({ startAnnual, monthlyInvestment, yieldPct, startDate = new Date(), maxMonths = MAX_MONTHS } = {}) {
    let annual = Math.max(0, num(startAnnual));
    const monthly = Math.max(0, num(monthlyInvestment));
    const yieldRate = Math.max(0, num(yieldPct)) / 100;
    const started = new Date(startDate);
    started.setHours(12,0,0,0);
    if (annual >= TARGET_ANNUAL) return {reached:true,months:0,date:started,annualIncome:annual};
    if (!(yieldRate > 0) || (!(monthly > 0) && !(annual > 0))) return {reached:false,months:null,date:null,annualIncome:annual};
    for (let month = 1; month <= maxMonths; month += 1) {
      const reinvestedDividendCash = annual / 12;
      annual += (monthly + reinvestedDividendCash) * yieldRate;
      if (annual >= TARGET_ANNUAL) return {reached:true,months:month,date:addMonths(started,month),annualIncome:annual};
    }
    return {reached:false,months:null,date:null,annualIncome:annual};
  }

  function annualIncomeAtMonths({ startAnnual, monthlyInvestment, yieldPct, months } = {}) {
    let annual = Math.max(0, num(startAnnual));
    const monthly = Math.max(0, num(monthlyInvestment));
    const rate = Math.max(0, num(yieldPct)) / 100;
    for (let index = 0; index < Math.max(0, Math.floor(num(months))); index += 1) {
      annual += (monthly + annual / 12) * rate;
    }
    return annual;
  }

  function monthsToGoal(startDate = new Date()) {
    return Math.max(0, Math.ceil(monthsBetween(startDate, GOAL_DATE)));
  }

  function requiredMonthlyInvestment(startAnnual, yieldPct, startDate = new Date()) {
    const months = monthsToGoal(startDate);
    if (!months || num(startAnnual) >= TARGET_ANNUAL) return 0;
    if (!(num(yieldPct) > 0)) return null;
    let low = 0, high = 10000;
    if (annualIncomeAtMonths({startAnnual,monthlyInvestment:high,yieldPct,months}) < TARGET_ANNUAL) return null;
    for (let index = 0; index < 48; index += 1) {
      const mid = (low + high) / 2;
      if (annualIncomeAtMonths({startAnnual,monthlyInvestment:mid,yieldPct,months}) >= TARGET_ANNUAL) high = mid;
      else low = mid;
    }
    return roundMoney(high);
  }

  function requiredYieldPct(startAnnual, monthlyInvestment, startDate = new Date()) {
    const months = monthsToGoal(startDate);
    if (!months || num(startAnnual) >= TARGET_ANNUAL) return 0;
    let low = 0, high = 50;
    if (annualIncomeAtMonths({startAnnual,monthlyInvestment,yieldPct:high,months}) < TARGET_ANNUAL) return null;
    for (let index = 0; index < 48; index += 1) {
      const mid = (low + high) / 2;
      if (annualIncomeAtMonths({startAnnual,monthlyInvestment,yieldPct:mid,months}) >= TARGET_ANNUAL) high = mid;
      else low = mid;
    }
    return Number(high.toFixed(2));
  }

  function projectionStatus(result) {
    if (!result?.reached || !result?.date) return {label:'BEHIND TARGET',cls:'bad',deltaMonths:null};
    const deltaMonths = monthsBetween(result.date, GOAL_DATE);
    if (Math.abs(deltaMonths) <= 1) return {label:'ON TARGET',cls:'good',deltaMonths};
    return deltaMonths > 1 ? {label:'AHEAD OF TARGET',cls:'good',deltaMonths} : {label:'BEHIND TARGET',cls:'bad',deltaMonths};
  }

  const incomeGoal = Object.freeze({
    planKey:INCOME_PLAN_KEY,
    targetMonthly:TARGET_MONTHLY,
    targetAnnual:TARGET_ANNUAL,
    goalDate:GOAL_DATE.toISOString().slice(0,10),
    defaultMonthlyInvestment:DEFAULT_MONTHLY_INVESTMENT,
    maxMonths:MAX_MONTHS,
    planSettings:incomePlanSettings,
    saveMonthlyInvestment,
    project:projectIncomeGoal,
    annualAtMonths:annualIncomeAtMonths,
    monthsBetween,
    monthsToGoal,
    requiredMonthlyInvestment,
    requiredYieldPct,
    projectionStatus
  });

  function loadTransferTargetDecisionEngine() {
    const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if (currentFile !== 'transfer.html') return;
    if (window.__AuroraTransferTargetDecisionEngine || [...document.scripts].some(script => String(script.src || '').includes('transfer-target-decision-engine.js'))) return;
    const script = document.createElement('script');
    script.src = 'transfer-target-decision-engine.js?v=20260824-transfer-target-decision-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'target-pace-decision-engine';
    document.head.appendChild(script);
  }

  const api = Object.freeze({
    build: BUILD,
    ready: true,
    readOnly: true,
    accountCode,
    accountLabel,
    ticker,
    exchange,
    securityIdentity,
    roundMoney,
    normalizeBrokerCash,
    allocationDemand,
    fundingPlan,
    incomeGoal
  });

  window.AuroraPhase2Core = api;
  document.documentElement.dataset.auroraPhase2Core = 'ready';
  window.dispatchEvent(new CustomEvent('aurora:phase2-core-ready', { detail: { build: BUILD, readOnly: true, incomeGoal:true } }));
  loadTransferTargetDecisionEngine();
})();
