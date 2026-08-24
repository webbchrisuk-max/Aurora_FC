(() => {
  'use strict';

  const BUILD = '20260824-phase2-core-1';
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
    fundingPlan
  });

  window.AuroraPhase2Core = api;
  document.documentElement.dataset.auroraPhase2Core = 'ready';
  window.dispatchEvent(new CustomEvent('aurora:phase2-core-ready', { detail: { build: BUILD, readOnly: true } }));
})();
