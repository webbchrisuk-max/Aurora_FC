(() => {
  'use strict';

  const BUILD = '20260824-phase2-system-health-reconciliation-1';
  const STATE_KEY = 'aurora2:state:v1';
  const EPSILON = 0.01;
  let running = false;

  if (window.__AuroraPhase2SystemHealthReconciliation) return;
  window.__AuroraPhase2SystemHealthReconciliation = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(num(value).toFixed(2));
  const positive = value => Math.max(0, round2(value));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(num(value));

  function accountCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'IG' || raw.includes('IG ISA')) return 'IG';
    if (raw === 'T212' || raw.includes('212')) return 'T212';
    return 'CHECK';
  }

  function readState() {
    try {
      const live = window.Aurora2?.core?.read?.();
      if (live && typeof live === 'object') return live;
    } catch (_) {}
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function ledgerReferenceSet(snapshot) {
    return new Set(arr(snapshot?.ledger).map(row => String(row?.reference || '')).filter(Boolean));
  }

  function relevantReceipts(state, mission, route) {
    return arr(state?.registration?.receipts).filter(row =>
      String(row?.missionId || '') === String(mission?.id || '') &&
      String(row?.routeId || '') === String(route?.id || '')
    );
  }

  function derive(state, snapshot) {
    const checks = [];
    const mission = state?.mission || null;
    const route = state?.transfer?.route || null;
    const add = (tone, title, note, meta) => checks.push({ tone, title, note, meta });

    if (!mission || !route) {
      add('warn', 'No active locked investment route', 'Finance → Transfer → Registration reconciliation becomes active once a Transfer route exists.', 'WAITING');
      return {
        status: 'WAITING', tone: 'warn', checks,
        figures: { financeRelease: 0, brokerCashPlanned: 0, purchaseCapacity: 0, confirmedPurchases: 0, brokerCashSettled: 0, remainingCapacity: 0 }
      };
    }

    const allocations = arr(route.allocations).filter(row => positive(row?.totalPurchaseAmount ?? row?.amount) > 0);
    const receipts = relevantReceipts(state, mission, route);
    const refs = ledgerReferenceSet(snapshot);
    const financeRelease = positive(mission.approvedBudget ?? route.financeBudget);
    const financeLegs = positive(allocations.reduce((sum, row) => sum + positive(row.financeAmount ?? row.amount), 0));
    const igBrokerPlanned = positive(allocations.filter(row => accountCode(row.account) === 'IG').reduce((sum, row) => sum + positive(row.brokerCashAmount), 0));
    const t212BrokerPlanned = positive(allocations.filter(row => accountCode(row.account) === 'T212').reduce((sum, row) => sum + positive(row.brokerCashAmount), 0));
    const brokerCashPlanned = positive(igBrokerPlanned + t212BrokerPlanned);
    const purchaseCapacity = positive(financeRelease + brokerCashPlanned);
    const legPurchaseTotal = positive(allocations.reduce((sum, row) => sum + positive(row.totalPurchaseAmount ?? (positive(row.financeAmount ?? row.amount) + positive(row.brokerCashAmount))), 0));
    const confirmedPurchases = positive(receipts.reduce((sum, row) => sum + positive(row.totalCostGbp), 0));
    const brokerCashSettled = positive(receipts.reduce((sum, row) => sum + positive(row.brokerCashDebitedGbp), 0));
    const remainingCapacity = round2(purchaseCapacity - confirmedPurchases);

    const routeMatchesMission = String(route.missionId || '') === String(mission.id || '');
    add(routeMatchesMission ? 'good' : 'block', 'Finance mission matches Transfer route', routeMatchesMission ? 'The locked Transfer route belongs to the current Finance mission.' : 'Mission and route IDs disagree. Registration must be held.', routeMatchesMission ? 'PASS' : 'BLOCK');

    const financeMatches = Math.abs(financeLegs - financeRelease) <= EPSILON;
    add(financeMatches ? 'good' : 'block', 'Finance release reconciles to Transfer legs', `${money(financeRelease)} released by Finance • ${money(financeLegs)} assigned as new cash across the route.`, financeMatches ? 'PASS' : 'MISMATCH');

    const purchaseMatches = Math.abs(legPurchaseTotal - purchaseCapacity) <= EPSILON;
    add(purchaseMatches ? 'good' : 'block', 'Route buying power reconciles', `${money(financeRelease)} Finance + ${money(brokerCashPlanned)} existing broker cash = ${money(legPurchaseTotal)} planned purchases.`, purchaseMatches ? 'PASS' : 'MISMATCH');

    const invalidBrokerCashLegs = allocations.filter(row => positive(row.brokerCashAmount) > 0 && !['IG', 'T212'].includes(accountCode(row.account)));
    add(!invalidBrokerCashLegs.length ? 'good' : 'block', 'Broker cash stays account-locked', invalidBrokerCashLegs.length ? `${invalidBrokerCashLegs.length} leg(s) have broker cash without a valid IG/T212 account.` : `IG ${money(igBrokerPlanned)} stays IG-only • T212 ${money(t212BrokerPlanned)} stays T212-only.`, invalidBrokerCashLegs.length ? 'BLOCK' : 'PASS');

    const allocationMap = new Map(allocations.map(row => [String(row.id || row.legId || ''), row]));
    const orphanReceipts = [];
    const brokerRouteMismatches = [];
    const settlementProblems = [];
    const duplicateRefs = new Set();
    const seenRefs = new Set();

    receipts.forEach(receipt => {
      const legId = String(receipt.allocationId || receipt.legId || '');
      const leg = allocationMap.get(legId);
      if (!leg) {
        orphanReceipts.push(receipt);
        return;
      }
      if (accountCode(receipt.account) !== accountCode(leg.account)) brokerRouteMismatches.push(receipt);

      const plannedBroker = positive(receipt.brokerCashAmountPlanned ?? leg.brokerCashAmount);
      const actual = positive(receipt.totalCostGbp);
      const expectedDebit = positive(Math.min(plannedBroker, actual));
      const debit = positive(receipt.brokerCashDebitedGbp);
      const status = String(receipt.brokerCashSettlementStatus || (plannedBroker > 0 ? 'MISSING' : 'NO_BROKER_CASH')).toUpperCase();
      const reference = String(receipt.brokerCashSettlementReference || '');

      if (reference) {
        if (seenRefs.has(reference)) duplicateRefs.add(reference);
        seenRefs.add(reference);
      }

      if (plannedBroker > EPSILON) {
        const debitMatches = Math.abs(debit - expectedDebit) <= EPSILON;
        const statusOk = ['SETTLED', 'ALREADY_SETTLED'].includes(status);
        const ledgerOk = reference && refs.has(reference);
        if (!debitMatches || !statusOk || (snapshot && !ledgerOk)) {
          settlementProblems.push({ ticker: receipt.ticker, status, expectedDebit, debit, reference, ledgerOk });
        }
      } else if (debit > EPSILON) {
        settlementProblems.push({ ticker: receipt.ticker, status, expectedDebit: 0, debit, reference, ledgerOk: false });
      }
    });

    add(!orphanReceipts.length ? 'good' : 'block', 'Registration receipts map to locked legs', orphanReceipts.length ? `${orphanReceipts.length} confirmed receipt(s) do not map back to this locked Transfer route.` : `${receipts.length} receipt(s) checked against stable allocation IDs.`, orphanReceipts.length ? 'BLOCK' : 'PASS');
    add(!brokerRouteMismatches.length ? 'good' : 'block', 'Registration broker matches Transfer broker', brokerRouteMismatches.length ? `${brokerRouteMismatches.length} receipt(s) were confirmed against a different broker than the locked route.` : 'Every confirmed purchase stays in the broker selected by Transfer.', brokerRouteMismatches.length ? 'BLOCK' : 'PASS');

    if (!snapshot && brokerCashPlanned > EPSILON) {
      add('warn', 'Broker-cash ledger verification waiting', 'AuroraData 2 brokerCashSnapshot was unavailable, so settlement references could not be independently verified.', 'CHECK');
    } else {
      add(!settlementProblems.length ? 'good' : 'block', 'Broker cash settlements reconcile', settlementProblems.length ? `${settlementProblems.length} confirmed purchase(s) need broker-cash reconciliation.` : `${money(brokerCashSettled)} of existing broker cash has been settled with matching ledger references.`, settlementProblems.length ? 'BLOCK' : 'PASS');
    }

    add(!duplicateRefs.size ? 'good' : 'block', 'Settlement references are unique', duplicateRefs.size ? `${duplicateRefs.size} duplicate settlement reference(s) detected.` : 'No duplicate broker-cash settlement references detected.', duplicateRefs.size ? 'BLOCK' : 'PASS');

    const capacityOk = remainingCapacity >= -EPSILON;
    add(capacityOk ? 'good' : 'block', 'Confirmed purchases stay inside funded capacity', `${money(confirmedPurchases)} confirmed • ${money(purchaseCapacity)} funded capacity • ${money(Math.max(0, remainingCapacity))} remaining.`, capacityOk ? 'PASS' : 'OVERSPEND');

    const blocked = checks.some(row => row.tone === 'block');
    const warned = checks.some(row => row.tone === 'warn');
    return {
      status: blocked ? 'ATTENTION' : warned ? 'CHECK' : 'RECONCILED',
      tone: blocked ? 'block' : warned ? 'warn' : 'good',
      checks,
      figures: { financeRelease, brokerCashPlanned, igBrokerPlanned, t212BrokerPlanned, purchaseCapacity, confirmedPurchases, brokerCashSettled, remainingCapacity: Math.max(0, remainingCapacity) },
      missionId: mission.id || '', routeId: route.id || '', receipts: receipts.length
    };
  }

  function row(item) {
    const icon = item.tone === 'block' ? '!' : item.tone === 'warn' ? '•' : '✓';
    return `<div class="p2-health-row ${item.tone}"><i>${icon}</i><div><strong>${item.title}</strong><span>${item.note}</span></div><b>${item.meta}</b></div>`;
  }

  function ensureStyles() {
    if (document.getElementById('phase2ReconciliationHealthStyles')) return;
    const style = document.createElement('style');
    style.id = 'phase2ReconciliationHealthStyles';
    style.textContent = `
      #phase2ReconciliationHealth{margin-top:22px}
      #phase2ReconciliationHealth .p2-health-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}
      #phase2ReconciliationHealth .p2-health-summary>div{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px;background:rgba(0,0,0,.13)}
      #phase2ReconciliationHealth .p2-health-summary small{display:block;color:#71838b;font:800 8px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}
      #phase2ReconciliationHealth .p2-health-summary strong{font:900 19px/1.15 system-ui}
      #phase2ReconciliationHealth .p2-health-list{display:grid;gap:9px;margin-top:16px}
      #phase2ReconciliationHealth .p2-health-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:11px;align-items:center;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;background:rgba(0,0,0,.12)}
      #phase2ReconciliationHealth .p2-health-row i{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;font:900 12px system-ui;font-style:normal}
      #phase2ReconciliationHealth .p2-health-row strong{display:block;font:850 12px/1.3 system-ui}
      #phase2ReconciliationHealth .p2-health-row span{display:block;color:#81939b;font:600 10px/1.45 system-ui;margin-top:3px}
      #phase2ReconciliationHealth .p2-health-row b{font:900 9px/1 system-ui;letter-spacing:.08em}
      #phase2ReconciliationHealth .p2-health-row.good i{background:rgba(89,255,154,.08);color:#9affbd}#phase2ReconciliationHealth .p2-health-row.good b{color:#9affbd}
      #phase2ReconciliationHealth .p2-health-row.warn i{background:rgba(255,213,107,.08);color:#ffe29a}#phase2ReconciliationHealth .p2-health-row.warn b{color:#ffe29a}
      #phase2ReconciliationHealth .p2-health-row.block i{background:rgba(255,92,112,.1);color:#ff9ba6}#phase2ReconciliationHealth .p2-health-row.block b{color:#ff9ba6}
      @media(max-width:800px){#phase2ReconciliationHealth .p2-health-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:520px){#phase2ReconciliationHealth .p2-health-summary{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById('phase2ReconciliationHealth');
    if (panel) return panel;
    const ownerPanel = [...document.querySelectorAll('.health-panel')].find(node => node.textContent.includes('Who Owns What'));
    if (!ownerPanel) return null;
    panel = document.createElement('section');
    panel.id = 'phase2ReconciliationHealth';
    panel.className = 'health-panel';
    ownerPanel.closest('.health-grid')?.insertAdjacentElement('beforebegin', panel);
    return panel;
  }

  async function brokerSnapshot() {
    try {
      if (!window.AuroraData2Client?.post) return null;
      return await window.AuroraData2Client.post('brokerCashSnapshot', {});
    } catch (_) { return null; }
  }

  async function render() {
    if (running) return;
    running = true;
    try {
      ensureStyles();
      const panel = ensurePanel();
      if (!panel) return;
      const state = readState();
      const snapshot = await brokerSnapshot();
      const result = derive(state, snapshot);
      const f = result.figures;
      panel.innerHTML = `
        <div class="health-panel-head"><div><small>PHASE 2 • MONEY FLOW</small><h2>Finance → Transfer → Registration</h2><p class="health-copy">Independent reconciliation of the investment funding chain. IG cash can only settle IG purchases; Trading 212 cash can only settle Trading 212 purchases.</p></div><span class="health-badge ${result.tone}">${result.status}</span></div>
        <div class="p2-health-summary">
          <div><small>Finance Release</small><strong>${money(f.financeRelease)}</strong></div>
          <div><small>Existing Broker Cash</small><strong>${money(f.brokerCashPlanned)}</strong></div>
          <div><small>Confirmed Purchases</small><strong>${money(f.confirmedPurchases)}</strong></div>
          <div><small>Funded Capacity Left</small><strong>${money(f.remainingCapacity)}</strong></div>
        </div>
        <div class="p2-health-list">${result.checks.map(row).join('')}</div>`;
      document.documentElement.dataset.phase2MoneyFlow = String(result.status || 'check').toLowerCase();
      window.AuroraPhase2SystemHealthReconciliation = Object.freeze({ build: BUILD, ready: true, ...result, brokerSnapshotConnected: Boolean(snapshot), run: render });
      window.dispatchEvent(new CustomEvent('aurora:phase2-system-health', { detail: { build: BUILD, status: result.status, figures: result.figures } }));
    } finally {
      running = false;
    }
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      tries += 1;
      if (document.querySelector('.health-panel')) {
        render();
        return;
      }
      if (tries < 300) setTimeout(wait, 25);
    };
    wait();
    document.getElementById('runCheck')?.addEventListener('click', () => setTimeout(render, 120));
    window.addEventListener('aurora2:state', () => setTimeout(render, 80));
    window.addEventListener('pageshow', () => setTimeout(render, 100));
    window.addEventListener('focus', () => setTimeout(render, 100));
    window.addEventListener('storage', event => { if (event.key === STATE_KEY) setTimeout(render, 80); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();