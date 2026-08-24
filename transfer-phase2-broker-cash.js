(() => {
  'use strict';

  const BUILD = '20260824-phase2-broker-cash-2';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);
  let snapshot = null;
  let connected = false;
  let lastError = '';
  let lastRefreshAt = null;
  let refreshing = false;
  let wiring = false;

  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(round(value));

  function core() {
    return window.AuroraPhase2Core || null;
  }

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

  function activeMission(state) {
    const mission = state?.mission;
    if (!mission || !(Number(mission.approvedBudget) > 0)) return null;
    if (TERMINAL.has(String(mission.status || '').toUpperCase())) return null;
    return mission;
  }

  function basePreview() {
    const preview = window.AuroraTransferAllocationPreview;
    if (!preview?.ready) return null;
    if (preview?.phase2BrokerCashWired === true && preview?.phase2BasePreview) return preview.phase2BasePreview;
    return preview;
  }

  function distributeLockedCash(account, cash, allocations) {
    const rows = allocations.filter(row => core()?.accountCode(row?.account) === account && num(row?.amount) > 0);
    const available = round(cash);
    if (!(available > 0) || !rows.length) return {used:0, unused:available, byKey:new Map()};

    const demand = rows.reduce((sum,row) => sum + round(row.amount), 0);
    if (!(demand > 0)) return {used:0, unused:available, byKey:new Map()};

    const byKey = new Map();
    let assigned = 0;
    rows.forEach((row,index) => {
      const key = `${row.securityId || row.ticker}|${account}`;
      const amount = index === rows.length - 1
        ? round(available - assigned)
        : round(available * (round(row.amount) / demand));
      const safeAmount = Math.max(0, Math.min(round(available - assigned), amount));
      byKey.set(key, safeAmount);
      assigned = round(assigned + safeAmount);
    });
    return {used:assigned, unused:round(available - assigned), byKey};
  }

  function buildWiredPreview() {
    const C = core();
    const base = basePreview();
    if (!C || !base?.allocations) return null;

    const balances = C.normalizeBrokerCash(snapshot || {});
    const financeRelease = round(base.budget);
    const original = base.allocations.map(row => ({...row, amount:round(row.amount)}));
    const ig = distributeLockedCash('IG', balances.IG, original);
    const t212 = distributeLockedCash('T212', balances.T212, original);

    const augmented = original.map(row => {
      const account = C.accountCode(row.account);
      const key = `${row.securityId || row.ticker}|${account}`;
      const brokerCashAmount = round(account === 'IG' ? (ig.byKey.get(key) || 0) : account === 'T212' ? (t212.byKey.get(key) || 0) : 0);
      const financeAmount = round(row.amount);
      const totalPurchaseAmount = round(financeAmount + brokerCashAmount);
      const yieldPct = Math.max(0, num(row.yieldPct));
      return {
        ...row,
        financeAmount,
        brokerCashAmount,
        totalPurchaseAmount,
        phase2FundingSource: brokerCashAmount > 0 ? 'FINANCE_PLUS_EXISTING_BROKER_CASH' : 'FINANCE_ONLY',
        phase2ExpectedAnnualIncome: Number((totalPurchaseAmount * yieldPct / 100).toFixed(6)),
        phase2ExpectedShares: num(row.estimatedPriceGbp) > 0 ? Math.floor(totalPurchaseAmount / num(row.estimatedPriceGbp)) : 0
      };
    });

    const totalBrokerCashUsed = round(ig.used + t212.used);
    const totalPurchaseAllocated = round(augmented.reduce((sum,row) => sum + row.totalPurchaseAmount, 0));
    const totalExpectedAnnualIncome = Number(augmented.reduce((sum,row) => sum + num(row.phase2ExpectedAnnualIncome), 0).toFixed(6));
    const desiredAllocations = augmented.map(row => ({...row, amount:row.totalPurchaseAmount}));
    const fundingPlan = C.fundingPlan({financeRelease, brokerCash:snapshot || {}, allocations:desiredAllocations});

    return {
      base,
      balances,
      financeRelease,
      allocations:augmented,
      brokerCashUsed:{IG:ig.used,T212:t212.used,total:totalBrokerCashUsed},
      brokerCashUnused:{IG:ig.unused,T212:t212.unused,total:round(ig.unused+t212.unused)},
      totalPurchaseAllocated,
      totalExpectedAnnualIncome,
      fundingPlan
    };
  }

  function wirePreview() {
    if (wiring) return null;
    const wired = buildWiredPreview();
    if (!wired) return null;
    wiring = true;
    try {
      const base = wired.base;
      window.AuroraTransferAllocationPreview = Object.freeze({
        ...base,
        phase2BrokerCashWired:true,
        phase2BasePreview:base,
        allocations:wired.allocations,
        totalPurchaseAllocated:wired.totalPurchaseAllocated,
        totalExpectedAnnualIncome:wired.totalExpectedAnnualIncome,
        phase2Funding:Object.freeze({
          financeRelease:wired.financeRelease,
          brokerCash:wired.balances,
          brokerCashUsed:Object.freeze(wired.brokerCashUsed),
          brokerCashUnused:Object.freeze(wired.brokerCashUnused),
          fundingPlan:wired.fundingPlan,
          totalPurchaseAllocated:wired.totalPurchaseAllocated,
          totalExpectedAnnualIncome:wired.totalExpectedAnnualIncome,
          writeGuard:'FINANCE_ROUTE_CONTRACT_STAYS_UNCHANGED_UNTIL_REGISTRATION_SETTLEMENT'
        })
      });
      document.documentElement.dataset.phase2Allocation = wired.brokerCashUsed.total > 0 ? 'wired' : 'finance-only';
      window.dispatchEvent(new CustomEvent('aurora:phase2-allocation-wired', {detail:{build:BUILD,totalPurchaseAllocated:wired.totalPurchaseAllocated,brokerCashUsed:wired.brokerCashUsed,fundingPlan:wired.fundingPlan}}));
      return wired;
    } finally {
      wiring = false;
    }
  }

  function ensureStyle() {
    if (document.getElementById('phase2BrokerCashStyle')) return;
    const style = document.createElement('style');
    style.id = 'phase2BrokerCashStyle';
    style.textContent = `
      #transferPhase2BrokerCash{margin-top:22px;border-color:rgba(110,231,255,.18)}
      #transferPhase2BrokerCash .p2-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
      #transferPhase2BrokerCash .p2-head h2{margin:0;font:900 clamp(24px,4vw,38px)/1.05 system-ui}
      #transferPhase2BrokerCash .p2-chip{border:1px solid rgba(110,231,255,.25);border-radius:999px;padding:8px 11px;color:#a9f4ff;background:rgba(110,231,255,.05);font:900 9px/1 system-ui;letter-spacing:.08em;white-space:nowrap}
      #transferPhase2BrokerCash .p2-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}
      #transferPhase2BrokerCash .p2-grid>div{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px;background:rgba(0,0,0,.14)}
      #transferPhase2BrokerCash .p2-grid small{display:block;color:#817988;font:800 9px/1.2 system-ui;text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px}
      #transferPhase2BrokerCash .p2-grid strong{font:900 20px/1.15 system-ui}
      #transferPhase2BrokerCash .p2-grid .p2-live strong{color:#9affbd}
      #transferPhase2BrokerCash .p2-rule{margin-top:14px;border-left:3px solid #6ee7ff;border-radius:0 12px 12px 0;padding:12px 14px;background:rgba(110,231,255,.045);color:#aabac4;font:650 12px/1.5 system-ui}
      #transferPhase2BrokerCash .p2-breakdown{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      #transferPhase2BrokerCash .p2-breakdown>div{border:1px solid rgba(89,255,154,.12);border-radius:14px;padding:12px;background:rgba(89,255,154,.025);color:#99aaa4;font:650 11px/1.5 system-ui}
      #transferPhase2BrokerCash .p2-breakdown b{display:block;color:#b6ffcf;font:900 12px/1.2 system-ui;margin-bottom:4px}
      #transferPhase2BrokerCash .p2-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:13px}
      #transferPhase2BrokerCash .p2-btn{border:1px solid rgba(110,231,255,.2);border-radius:10px;background:rgba(110,231,255,.05);color:#c8f8ff;padding:9px 12px;font:800 10px system-ui}
      #transferPhase2BrokerCash .p2-meta{color:#758b98;font:650 10px/1.4 system-ui}
      .allocation-row[data-phase2-cash='yes'] .allocation-amount strong{color:#9affbd!important}
      .allocation-row .p2-row-source{display:block;color:#8dbf9c!important;font-size:8px!important;letter-spacing:.05em!important;text-transform:none!important}
      @media(max-width:800px){#transferPhase2BrokerCash .p2-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){#transferPhase2BrokerCash .p2-breakdown{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById('transferPhase2BrokerCash');
    if (panel) return panel;
    const missionShell = document.getElementById('transferMissionShell');
    if (!missionShell) return null;
    panel = document.createElement('section');
    panel.id = 'transferPhase2BrokerCash';
    panel.className = 'transfer-card';
    missionShell.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function decorateAllocationRows(wired) {
    if (!wired?.allocations?.length) return;
    const rows = [...document.querySelectorAll('#transferAllocationPreview .allocation-row')];
    rows.forEach((node,index) => {
      const allocation = wired.allocations[index];
      if (!allocation) return;
      const amountCell = node.querySelector('.allocation-amount');
      if (!amountCell) return;
      node.dataset.phase2Cash = allocation.brokerCashAmount > 0 ? 'yes' : 'no';
      const strong = amountCell.querySelector('strong');
      const span = amountCell.querySelector('span');
      if (strong) strong.textContent = money(allocation.totalPurchaseAmount);
      if (span) span.textContent = allocation.brokerCashAmount > 0 ? 'TOTAL PURCHASE' : 'FINANCE PURCHASE';
      let source = amountCell.querySelector('.p2-row-source');
      if (!source) {
        source = document.createElement('span');
        source.className = 'p2-row-source';
        amountCell.appendChild(source);
      }
      source.textContent = allocation.brokerCashAmount > 0
        ? `${money(allocation.financeAmount)} Finance + ${money(allocation.brokerCashAmount)} existing ${core()?.accountLabel(allocation.account)} cash`
        : `${money(allocation.financeAmount)} Finance`;
    });
  }

  function publicState() {
    const C = core();
    const state = readState();
    const mission = activeMission(state);
    const balances = C ? C.normalizeBrokerCash(snapshot || {}) : { IG:0, T212:0, total:0 };
    const financeRelease = C ? C.roundMoney(mission?.approvedBudget || 0) : round(mission?.approvedBudget || 0);
    const wired = buildWiredPreview();
    return {
      build: BUILD,
      ready: true,
      readOnly: true,
      allocatorWired:true,
      connected,
      lastError,
      lastRefreshAt,
      missionId: mission?.id || mission?.mission_id || '',
      financeRelease,
      balances,
      totalBuyingPower: C ? C.roundMoney(financeRelease + balances.total) : round(financeRelease + balances.total),
      currentRouteFunding: wired?.fundingPlan || null,
      currentWiredAllocation:wired || null
    };
  }

  function publish(wired = null) {
    const detail = publicState();
    window.AuroraTransferBrokerCashAuthority = Object.freeze({
      ...detail,
      refresh: () => refresh('manual'),
      fundingPlanFor: allocations => core()?.fundingPlan({ financeRelease: detail.financeRelease, brokerCash: snapshot || {}, allocations }) || null,
      wireAllocation:() => wirePreview()
    });
    document.documentElement.dataset.phase2BrokerCash = connected ? 'connected' : 'check';
    window.dispatchEvent(new CustomEvent('aurora:phase2-broker-cash', { detail:{...detail,currentWiredAllocation:undefined} }));
    return wired || detail.currentWiredAllocation;
  }

  function render() {
    const C = core();
    if (!C) return false;
    ensureStyle();
    const panel = ensurePanel();
    if (!panel) return false;
    const wired = wirePreview() || buildWiredPreview();
    const detail = publicState();
    publish(wired);
    const b = detail.balances;
    const used = wired?.brokerCashUsed || {IG:0,T212:0,total:0};
    const unused = wired?.brokerCashUnused || {IG:b.IG,T212:b.T212,total:b.total};
    const funding = wired?.fundingPlan;
    const live = Boolean(wired?.allocations?.length && used.total > 0);

    panel.innerHTML = `
      <div class="p2-head">
        <div><span class="transfer-kicker">Phase 2 • Shared Broker Cash Authority</span><h2>Account-locked buying power</h2></div>
        <span class="p2-chip">${live ? 'LIVE ALLOCATOR WIRED' : detail.connected ? 'BROKER CASH CONNECTED' : 'BROKER CASH CHECK'}</span>
      </div>
      <div class="p2-grid">
        <div><small>New Finance Release</small><strong>${money(detail.financeRelease)}</strong></div>
        <div><small>IG ISA Cash</small><strong>${money(b.IG)}</strong></div>
        <div><small>Trading 212 Cash</small><strong>${money(b.T212)}</strong></div>
        <div class="p2-live"><small>Planned Purchases</small><strong>${money(wired?.totalPurchaseAllocated || detail.financeRelease)}</strong></div>
      </div>
      <div class="p2-breakdown">
        <div><b>IG ISA</b>Use ${money(used.IG)} existing cash • keep ${money(unused.IG)} unused • new transfer needed ${money(funding?.brokers?.IG?.newTransferRequired || 0)}</div>
        <div><b>Trading 212 ISA</b>Use ${money(used.T212)} existing cash • keep ${money(unused.T212)} unused • new transfer needed ${money(funding?.brokers?.T212?.newTransferRequired || 0)}</div>
      </div>
      <div class="p2-rule"><strong>Ring-fence rule:</strong> IG cash is added only to IG ISA purchase legs. Trading 212 cash is added only to Trading 212 ISA purchase legs. Finance remains the only flexible new-money pool. ${live ? `The current recommendation now plans ${money(wired.totalPurchaseAllocated)} of purchases: ${money(detail.financeRelease)} from the Finance route plus ${money(used.total)} of existing broker cash. Existing cash is only added to brokers that already have an executable recommended leg; otherwise it stays untouched.` : 'When an executable route exists, existing broker cash will automatically top up only the matching broker legs.'}</div>
      <div class="p2-actions"><button class="p2-btn" type="button" data-p2-refresh>${refreshing ? 'Refreshing…' : 'Refresh Broker Cash'}</button><span class="p2-meta">${detail.connected ? `Last refresh ${detail.lastRefreshAt ? new Date(detail.lastRefreshAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : 'just now'} • Phase 2 allocation is live in the preview; Save + Lock remains on the original Finance contract until the Registration cash-settlement step is installed.` : (detail.lastError || 'AuroraData 2 broker cash is not available in this browser yet.')}</span></div>
    `;
    panel.querySelector('[data-p2-refresh]')?.addEventListener('click', () => refresh('button'));
    decorateAllocationRows(wired);
    return true;
  }

  async function waitForClient(timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (window.AuroraData2Client?.post) return window.AuroraData2Client;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return null;
  }

  async function refresh(reason = 'startup') {
    if (refreshing) return publicState();
    refreshing = true;
    render();
    try {
      const client = await waitForClient();
      if (!client?.post) throw new Error('AuroraData 2 client is unavailable.');
      snapshot = await client.post('brokerCashSnapshot', {});
      connected = true;
      lastError = '';
      lastRefreshAt = new Date().toISOString();
    } catch (error) {
      connected = false;
      lastError = String(error?.message || error || 'Broker cash refresh failed.');
      lastRefreshAt = new Date().toISOString();
    } finally {
      refreshing = false;
      render();
    }
    return publicState();
  }

  function scheduleRender(delay = 25) {
    setTimeout(render, delay);
  }

  function boot() {
    if (!core()) {
      window.addEventListener('aurora:phase2-core-ready', boot, { once: true });
      return;
    }
    render();
    setTimeout(() => refresh('startup'), 120);
    window.addEventListener('aurora2:state', () => scheduleRender(35));
    window.addEventListener('aurora:transfer-allocation-preview', () => scheduleRender(20));
    window.addEventListener('focus', () => scheduleRender(35));
    window.addEventListener('pageshow', () => scheduleRender(35));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleRender(35); });

    const previewHost = document.getElementById('transferAllocationPreview');
    if (previewHost) {
      const observer = new MutationObserver(() => scheduleRender(15));
      observer.observe(previewHost,{childList:true,subtree:true});
    }
  }

  window.__AuroraPhase2BrokerCashBuild = BUILD;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
