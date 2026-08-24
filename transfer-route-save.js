(() => {
  'use strict';

  const BUILD = '20260824-transfer-route-save-phase2-funding-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const ROUTE_BACKUP_KEY = 'aurora2:transfer:route:backup:lastgood';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(Math.max(0, num(value)));
  const ticker = value => String(value || '').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\..*$/,'').toUpperCase().trim();
  const accountCode = value => {
    const lower = String(value || '').toLowerCase();
    if (lower.includes('212')) return 'T212';
    if (/\big\b/.test(lower) || lower.includes('ig isa')) return 'IG';
    const upper = String(value || '').toUpperCase();
    return upper === 'IG' || upper === 'T212' ? upper : 'CHECK';
  };

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeState(next, previous) {
    const stamp = new Date().toISOString();
    localStorage.setItem(BACKUP_KEY, JSON.stringify(previous));
    localStorage.setItem(ROUTE_BACKUP_KEY, JSON.stringify({savedAt:stamp,state:previous}));
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', {detail:{source:'transfer-route-save',build:BUILD}}));
  }

  function uid(prefix) {
    try {
      if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    } catch (_) {}
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  }

  function securityId(target) {
    const explicit = String(target?.securityId || target?.security_id || '').trim();
    if (explicit) return explicit;
    const exchange = String(target?.exchange || target?.exchangeCode || 'UNKNOWN').toUpperCase();
    return `${exchange}:${ticker(target?.ticker || target?.symbol)}`;
  }

  function findTarget(state, allocation) {
    const targets = arr(state?.scouting?.targets);
    const id = String(allocation?.securityId || '');
    return targets.find(target => id && securityId(target) === id) ||
      targets.find(target => ticker(target?.ticker) === ticker(allocation?.ticker));
  }

  function validate(state, preview) {
    const errors = [];
    const mission = state?.mission;
    const contract = window.AuroraTransferMission;
    if (!mission) errors.push('Finance mission is missing.');
    if (!contract?.plan || !contract?.lock) errors.push('Canonical mission contract is unavailable.');
    if (String(mission?.status || '').toUpperCase() !== 'DRAFT') errors.push(`Mission is ${String(mission?.status || 'UNKNOWN').toUpperCase()}, not DRAFT.`);
    if (String(state?.scouting?.status || '').toUpperCase() !== 'SCOUTING_READY') errors.push('Scouting is no longer SCOUTING_READY.');
    if (!preview?.routeSaveReady || !preview?.exactReconciliation) errors.push('Allocation preview is not fully reconciled.');

    const budget = round(mission?.approvedBudget);
    const previewBudget = round(preview?.budget);
    const allocations = arr(preview?.allocations).filter(row => num(row?.amount) > 0);
    const allocated = round(allocations.reduce((sum,row) => sum + num(row.financeAmount ?? row.amount), 0));
    if (!(budget > 0)) errors.push('Finance budget is zero.');
    if (Math.abs(budget - previewBudget) > .005) errors.push('Preview budget no longer matches Finance.');
    if (Math.abs(budget - allocated) > .005) errors.push(`Finance-funded allocations total ${money(allocated)} instead of ${money(budget)}.`);
    if (!allocations.length) errors.push('No purchase legs exist.');

    const funding = preview?.phase2Funding;
    if (preview?.phase2BrokerCashWired === true) {
      if (!funding?.fundingPlan?.reconciles) errors.push('Phase 2 broker-cash funding plan does not reconcile.');
      if (round(funding?.fundingPlan?.financeGap) > .005) errors.push('Phase 2 funding requires more new Finance cash than the approved release.');
    }

    const seen = new Set();
    allocations.forEach(row => {
      const target = findTarget(state, row);
      const key = String(row.securityId || ticker(row.ticker));
      if (seen.has(key)) errors.push(`${ticker(row.ticker)} appears more than once.`);
      seen.add(key);
      if (!target) errors.push(`${ticker(row.ticker)} is no longer in Scouting.`);
      else {
        const blocked = String(target.status || '').toLowerCase() === 'block' || String(target.recommendation || '').toUpperCase() === 'BLOCK';
        if (blocked || target.approvedForTransfer !== true) errors.push(`${ticker(row.ticker)} is no longer approved for Transfer.`);
      }
      const account = accountCode(row.account);
      if (!['IG','T212'].includes(account)) errors.push(`${ticker(row.ticker)} has no executable broker route.`);
      if (!(num(row.yieldPct) > 0)) errors.push(`${ticker(row.ticker)} has no supported income evidence.`);
      if (!(num(row.estimatedPriceGbp) > 0)) errors.push(`${ticker(row.ticker)} has no supported market price.`);
      if (num(row.brokerCashAmount) > 0 && !['IG','T212'].includes(account)) errors.push(`${ticker(row.ticker)} broker cash is not tied to a valid broker.`);
    });

    return {ok:errors.length === 0, errors, mission, budget, allocations, allocated};
  }

  function buildRoute(state, preview, checked) {
    const stamp = new Date().toISOString();
    const strategy = String(preview.strategy || state?.scouting?.strategy || 'sustainable').toLowerCase() === 'maximum' ? 'maximum' : 'sustainable';
    const previous = state?.transfer?.route;
    const routeId = previous && String(previous.missionId || '') === String(checked.mission.id || '')
      ? previous.id
      : uid('ROUTE');

    const allocations = checked.allocations.map(row => {
      const target = findTarget(state, row) || {};
      const financeAmount = round(row.financeAmount ?? row.amount);
      const brokerCashAmount = round(row.brokerCashAmount);
      const totalPurchaseAmount = round(row.totalPurchaseAmount ?? (financeAmount + brokerCashAmount));
      const expectedAnnualIncome = num(row.phase2ExpectedAnnualIncome ?? row.expectedAnnualIncome);
      const expectedShares = num(row.phase2ExpectedShares ?? row.expectedShares);
      return {
        id:uid('ALLOC'),
        targetId:target.id || null,
        securityId:row.securityId || securityId(target),
        exchange:target.exchange || null,
        ticker:ticker(row.ticker || target.ticker),
        name:target.name || row.ticker || 'Target',
        account:accountCode(row.account),
        sector:String(target.sector || ''),
        amount:financeAmount,
        financeAmount,
        brokerCashAmount,
        totalPurchaseAmount,
        phase2FundingSource:brokerCashAmount > 0 ? 'FINANCE_PLUS_EXISTING_BROKER_CASH' : 'FINANCE_ONLY',
        yieldPct:Math.max(0, num(row.yieldPct)),
        expectedAnnualIncome:Number(Math.max(0,expectedAnnualIncome).toFixed(6)),
        estimatedPriceGbp:Math.max(0,num(row.estimatedPriceGbp)),
        estimatedShares:Math.max(0,Math.floor(expectedShares)),
        scoutingScore:strategy === 'maximum' ? num(target.maximumScore) : num(target.sustainableScore),
        scoutingStatus:String(target.status || 'caution').toLowerCase(),
        reason:target.reason || 'Scouting-approved allocation',
        status:'SIMULATED'
      };
    });

    const brokerCashUsed = {
      IG:round(allocations.filter(row=>row.account==='IG').reduce((sum,row)=>sum+num(row.brokerCashAmount),0)),
      T212:round(allocations.filter(row=>row.account==='T212').reduce((sum,row)=>sum+num(row.brokerCashAmount),0))
    };
    brokerCashUsed.total = round(brokerCashUsed.IG + brokerCashUsed.T212);
    const totalPurchaseAllocated = round(allocations.reduce((sum,row)=>sum+num(row.totalPurchaseAmount),0));

    return {
      id:routeId,
      missionId:checked.mission.id,
      financeBudget:checked.budget,
      strategy,
      scoutingStrategy:strategy,
      scoutingStatusAtBuild:String(state?.scouting?.status || ''),
      brokerScope:'both',
      minAllocation:250,
      requestedMinAllocation:250,
      increment:25,
      allocationMode:'DYNAMIC_OPPORTUNITY_WEIGHTED',
      targetCount:allocations.length,
      allocations,
      allocated:checked.allocated,
      financeAllocated:checked.allocated,
      brokerCashUsed,
      brokerCashUsedTotal:brokerCashUsed.total,
      totalPurchaseAllocated,
      income:Number(allocations.reduce((sum,row)=>sum+num(row.expectedAnnualIncome),0).toFixed(6)),
      remaining:round(checked.budget - checked.allocated),
      status:'SIMULATION',
      locked:false,
      createdAt:previous?.missionId === checked.mission.id ? previous.createdAt || stamp : stamp,
      updatedAt:stamp,
      source:preview?.phase2BrokerCashWired === true ? 'TRANSFER_T3_PREVIEW_PHASE2_BROKER_CASH' : 'TRANSFER_T3_PREVIEW'
    };
  }

  function saveAndLock() {
    const state = readState();
    const preview = window.AuroraTransferAllocationPreview;
    const checked = validate(state, preview);
    if (!checked.ok) {
      alert(`Route was not saved.\n\n${checked.errors.join('\n')}`);
      render();
      return;
    }

    const route = buildRoute(state, preview, checked);
    const contract = window.AuroraTransferMission;
    const stamp = new Date().toISOString();
    try {
      const planned = contract.plan(checked.mission, route, stamp);
      const locked = contract.lock(planned.mission, planned.route, stamp);
      const next = {
        ...state,
        mission:{...locked.mission,transferRouteId:locked.route.id},
        transfer:{
          ...(state.transfer || {}),
          route:locked.route,
          executionChecks:{},
          updatedAt:stamp
        },
        alerts:[
          {id:uid('ALERT'),title:'Transfer route approved',note:`${money(locked.mission.amountAllocated)} Finance cash allocated • ${money(route.brokerCashUsedTotal)} existing broker cash attached.`,when:'now',createdAt:stamp},
          ...arr(state.alerts).filter(alert => alert?.title !== 'Transfer route approved')
        ].slice(0,8),
        updatedAt:stamp
      };
      writeState(next,state);
      render();
    } catch (error) {
      alert(`Route was not saved.\n\n${String(error?.message || error)}`);
    }
  }

  function ensureStyles() {
    if (document.getElementById('transferRouteSaveStyles')) return;
    const style = document.createElement('style');
    style.id = 'transferRouteSaveStyles';
    style.textContent = `
      .route-save{margin-top:22px;border:1px solid rgba(89,255,154,.18);border-radius:24px;background:linear-gradient(180deg,rgba(5,27,20,.90),rgba(5,9,16,.96));padding:26px}.route-save h2{margin:0;font:900 clamp(28px,5vw,44px)/1 system-ui}.route-save p{color:#91a69c;line-height:1.55;max-width:760px}.route-save-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}.route-save-grid div{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:15px;background:rgba(0,0,0,.14)}.route-save-grid small{display:block;color:#72867d;font:800 9px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase;margin-bottom:7px}.route-save-grid strong{font:900 18px/1.2 system-ui}.route-save-action{margin-top:18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.route-save-action button{appearance:none;border:1px solid rgba(89,255,154,.36);border-radius:14px;background:rgba(89,255,154,.08);color:#a8ffc6;padding:14px 18px;font:900 13px/1 system-ui;letter-spacing:.06em;text-transform:uppercase}.route-save-action button:disabled{opacity:.45;cursor:not-allowed}.route-save-note{color:#86a292;font:600 13px/1.5 system-ui}.route-save-locked{margin-top:18px;border:1px solid rgba(89,255,154,.30);border-radius:16px;padding:17px;background:rgba(89,255,154,.05);color:#aaffc8}.route-save-locked strong{display:block;font:900 13px/1 system-ui;letter-spacing:.1em;margin-bottom:8px}.route-save-locked a{display:inline-flex;margin-top:12px;text-decoration:none;border:1px solid rgba(110,231,255,.25);border-radius:11px;padding:10px 13px;color:#baf6ff;font:800 11px/1 system-ui}.route-save-hold{margin-top:18px;border:1px solid rgba(255,213,107,.22);border-radius:16px;padding:16px;color:#ffe3a3;background:rgba(255,213,107,.04)}
      @media(max-width:650px){.route-save-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    let host = document.getElementById('transferRouteSave');
    if (host) return host;
    const preview = document.getElementById('transferAllocationPreview');
    if (!preview) return null;
    host = document.createElement('section');
    host.id = 'transferRouteSave';
    host.className = 'route-save';
    preview.insertAdjacentElement('afterend',host);
    return host;
  }

  function render() {
    ensureStyles();
    const host = ensureSection();
    const state = readState();
    if (!host || !state) return;

    const mission = state?.mission || {};
    const status = String(mission.status || 'DRAFT').toUpperCase();
    const route = state?.transfer?.route;
    const preview = window.AuroraTransferAllocationPreview;
    const checked = status === 'DRAFT' ? validate(state,preview) : null;

    if (status === 'LOCKED' && route?.locked && String(route.missionId || '') === String(mission.id || '')) {
      const brokerCash = round(route?.brokerCashUsedTotal);
      const totalPurchases = round(route?.totalPurchaseAllocated || mission.amountAllocated);
      host.innerHTML = `
        <span class="transfer-kicker">Stage T4 • Route Authority</span>
        <h2>Route locked for Registration</h2>
        <p>The Finance mission, broker destinations and Phase 2 funding sources are frozen. Registration can record executions against these exact legs but cannot rewrite the route.</p>
        <div class="route-save-grid">
          <div><small>Finance cash</small><strong>${money(mission.amountAllocated)}</strong></div>
          <div><small>Existing broker cash</small><strong>${money(brokerCash)}</strong></div>
          <div><small>Total planned purchases</small><strong>${money(totalPurchases)}</strong></div>
        </div>
        <div class="route-save-locked"><strong>ROUTE LOCKED</strong>${money(mission.amountAllocated)} Finance cash + ${money(brokerCash)} existing broker cash is locked across ${arr(route.allocations).filter(row=>num(row.amount)>0).length} purchase legs. Each leg carries its own broker-cash split for Registration settlement.<br><a href="registration.html">Open Registration Desk →</a></div>`;
      document.documentElement.dataset.transferRoute = 'locked';
      window.AuroraTransferRouteSave = Object.freeze({build:BUILD,ready:true,status:'LOCKED',routeId:route.id,missionId:mission.id,legs:arr(route.allocations).length,brokerCashUsed:brokerCash,totalPurchaseAllocated:totalPurchases});
      return;
    }

    const ready = Boolean(checked?.ok);
    const previewFinance = round(preview?.allocated);
    const previewBrokerCash = round(preview?.phase2Funding?.brokerCashUsed?.total);
    const previewTotal = round(preview?.totalPurchaseAllocated || previewFinance);
    host.innerHTML = `
      <span class="transfer-kicker">Stage T4 • Save + Lock</span>
      <h2>Approve the final route</h2>
      <p>This is the first Transfer write. Aurora will revalidate the live Finance mission and Scouting approvals, preserve the account-locked broker-cash split, back up the current state, create stable purchase-leg IDs and lock the route for Registration.</p>
      <div class="route-save-grid">
        <div><small>Finance cash</small><strong>${money(previewFinance)}</strong></div>
        <div><small>Existing broker cash</small><strong>${money(previewBrokerCash)}</strong></div>
        <div><small>Total planned purchases</small><strong>${money(previewTotal)}</strong></div>
      </div>
      ${ready ? `<div class="route-save-action"><button type="button" id="saveLockTransferRoute">Save & Lock Route</button><span class="route-save-note">Backup created before the write. After lock, Registration becomes the execution authority.</span></div>` : `<div class="route-save-hold"><strong>ROUTE SAVE HELD</strong><br>${checked?.errors?.join(' • ') || `Mission status ${status} is not available for a new route save.`}</div>`}`;

    document.getElementById('saveLockTransferRoute')?.addEventListener('click', () => {
      if (!confirm(`Lock the Transfer route for Registration?\n\nFinance cash: ${money(previewFinance)}\nExisting broker cash: ${money(previewBrokerCash)}\nTotal planned purchases: ${money(previewTotal)}\n\nBroker cash stays ring-fenced to its own account.`)) return;
      saveAndLock();
    }, {once:true});
    document.documentElement.dataset.transferRoute = ready ? 'ready-to-lock' : 'hold';
    window.AuroraTransferRouteSave = Object.freeze({build:BUILD,ready:true,status:ready?'READY_TO_LOCK':'HOLD',errors:checked?.errors || []});
  }

  function boot() {
    const wait = () => {
      if (window.AuroraTransferAllocationPreview?.ready && window.AuroraTransferMission?.plan) {
        render();
        return;
      }
      setTimeout(wait,25);
    };
    wait();
    window.addEventListener('pageshow', () => setTimeout(render,0));
    window.addEventListener('focus', () => setTimeout(render,0));
    window.addEventListener('aurora2:state', () => setTimeout(render,0));
    window.addEventListener('aurora:phase2-allocation-wired', () => setTimeout(render,0));
    window.addEventListener('storage', event => {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY) setTimeout(render,0);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setTimeout(render,0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();