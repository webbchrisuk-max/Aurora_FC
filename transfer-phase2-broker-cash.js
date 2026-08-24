(() => {
  'use strict';

  const BUILD = '20260824-phase2-broker-cash-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);
  let snapshot = null;
  let connected = false;
  let lastError = '';
  let lastRefreshAt = null;
  let refreshing = false;

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Math.max(0, Number(value) || 0));

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
      #transferPhase2BrokerCash .p2-rule{margin-top:14px;border-left:3px solid #6ee7ff;border-radius:0 12px 12px 0;padding:12px 14px;background:rgba(110,231,255,.045);color:#aabac4;font:650 12px/1.5 system-ui}
      #transferPhase2BrokerCash .p2-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:13px}
      #transferPhase2BrokerCash .p2-btn{border:1px solid rgba(110,231,255,.2);border-radius:10px;background:rgba(110,231,255,.05);color:#c8f8ff;padding:9px 12px;font:800 10px system-ui}
      #transferPhase2BrokerCash .p2-meta{color:#758b98;font:650 10px/1.4 system-ui}
      @media(max-width:800px){#transferPhase2BrokerCash .p2-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
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

  function publicState() {
    const C = core();
    const state = readState();
    const mission = activeMission(state);
    const balances = C ? C.normalizeBrokerCash(snapshot || {}) : { IG:0, T212:0, total:0 };
    const financeRelease = C ? C.roundMoney(mission?.approvedBudget || 0) : Math.max(0, Number(mission?.approvedBudget) || 0);
    const preview = window.AuroraTransferAllocationPreview;
    const plan = C && preview?.allocations
      ? C.fundingPlan({ financeRelease, brokerCash: snapshot || {}, allocations: preview.allocations })
      : C ? C.fundingPlan({ financeRelease, brokerCash: snapshot || {}, allocations: [] }) : null;
    return {
      build: BUILD,
      ready: true,
      readOnly: true,
      connected,
      lastError,
      lastRefreshAt,
      missionId: mission?.id || mission?.mission_id || '',
      financeRelease,
      balances,
      totalBuyingPower: C ? C.roundMoney(financeRelease + balances.total) : financeRelease + balances.total,
      currentRouteFunding: plan
    };
  }

  function publish() {
    const detail = publicState();
    window.AuroraTransferBrokerCashAuthority = Object.freeze({
      ...detail,
      refresh: () => refresh('manual'),
      fundingPlanFor: allocations => core()?.fundingPlan({ financeRelease: detail.financeRelease, brokerCash: snapshot || {}, allocations }) || null
    });
    document.documentElement.dataset.phase2BrokerCash = connected ? 'connected' : 'check';
    window.dispatchEvent(new CustomEvent('aurora:phase2-broker-cash', { detail }));
    return detail;
  }

  function render() {
    const C = core();
    if (!C) return false;
    ensureStyle();
    const panel = ensurePanel();
    if (!panel) return false;
    const detail = publish();
    const b = detail.balances;
    const routePlan = detail.currentRouteFunding;
    const routeNote = routePlan && window.AuroraTransferAllocationPreview?.allocations?.length
      ? `Current saved preview would use ${money(routePlan.totalExistingCashUsed)} of existing broker cash and require ${money(routePlan.totalNewTransferRequired)} of new Finance cash. The Phase 2 optimizer handoff is the next step, so existing broker cash is not yet allowed to enlarge the route automatically.`
      : 'Broker balances are now available to Transfer as read-only authority. The next Phase 2 step will let the optimizer use these account-locked balances when it builds the route.';

    panel.innerHTML = `
      <div class="p2-head">
        <div><span class="transfer-kicker">Phase 2 • Shared Broker Cash Authority</span><h2>Account-locked buying power</h2></div>
        <span class="p2-chip">${detail.connected ? 'BROKER CASH CONNECTED' : 'BROKER CASH CHECK'}</span>
      </div>
      <div class="p2-grid">
        <div><small>New Finance Release</small><strong>${money(detail.financeRelease)}</strong></div>
        <div><small>IG ISA Cash</small><strong>${money(b.IG)}</strong></div>
        <div><small>Trading 212 Cash</small><strong>${money(b.T212)}</strong></div>
        <div><small>Total Potential Buying Power</small><strong>${money(detail.totalBuyingPower)}</strong></div>
      </div>
      <div class="p2-rule"><strong>Ring-fence rule:</strong> IG cash can fund IG ISA purchases only. Trading 212 cash can fund Trading 212 ISA purchases only. The Finance release is the only flexible new-money pool. ${routeNote}</div>
      <div class="p2-actions"><button class="p2-btn" type="button" data-p2-refresh>${refreshing ? 'Refreshing…' : 'Refresh Broker Cash'}</button><span class="p2-meta">${detail.connected ? `Last refresh ${detail.lastRefreshAt ? new Date(detail.lastRefreshAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : 'just now'}` : (detail.lastError || 'AuroraData 2 broker cash is not available in this browser yet.')}</span></div>
    `;
    panel.querySelector('[data-p2-refresh]')?.addEventListener('click', () => refresh('button'));
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

  function boot() {
    if (!core()) {
      window.addEventListener('aurora:phase2-core-ready', boot, { once: true });
      return;
    }
    render();
    setTimeout(() => refresh('startup'), 120);
    window.addEventListener('aurora2:state', () => setTimeout(render, 20));
    window.addEventListener('aurora:transfer-allocation-preview', () => setTimeout(render, 20));
    window.addEventListener('focus', () => setTimeout(render, 20));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(render, 20); });
  }

  window.__AuroraPhase2BrokerCashBuild = BUILD;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
