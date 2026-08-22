(() => {
  'use strict';

  const BUILD = '20260822-registration-route-intake-auto-sync-1';
  const STATE_KEY = 'aurora2:state:v1';

  function loadBrowserAutoSync() {
    if (window.__AuroraBrowserAutoSync || [...document.scripts].some(script => String(script.src || '').includes('aurora-browser-sync-auto.js'))) return;
    const script = document.createElement('script');
    script.src = 'aurora-browser-sync-auto.js?v=20260822-browser-auto-sync-1';
    script.async = false;
    document.head.appendChild(script);
  }

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(Math.max(0, num(value)));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function lockedContext(state) {
    const mission = state?.mission;
    const route = state?.transfer?.route;
    const status = String(mission?.status || '').toUpperCase();
    const matching = route && String(route?.missionId || '') === String(mission?.id || '');
    if (status !== 'LOCKED' || route?.locked !== true || !matching) return null;

    const allocations = arr(route.allocations).filter(row => num(row?.amount) > 0);
    const planned = round(mission?.approvedBudget ?? route?.financeBudget);
    const existingReceipts = arr(state?.registration?.receipts).filter(receipt =>
      String(receipt?.missionId || '') === String(mission?.id || '') ||
      allocations.some(row => String(receipt?.allocationId || receipt?.legId || '') === String(row?.id || ''))
    );
    const confirmedCost = round(existingReceipts.reduce((sum, row) => sum + num(row?.totalCostGbp ?? row?.costGbp ?? row?.amount), 0));
    const confirmedLegs = new Set(existingReceipts.map(row => String(row?.allocationId || row?.legId || '')).filter(Boolean));
    return {
      mission, route, allocations, planned,
      confirmedCost,
      confirmedCount: confirmedLegs.size,
      remaining: round(Math.max(0, planned - confirmedCost))
    };
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderLocked(ctx) {
    document.documentElement.dataset.registrationRoute = 'locked';
    setText('registrationRouteBudget', money(ctx.planned));
    setText('registrationRouteStatus', 'ROUTE LOCKED');
    setText('registrationRouteMeta', `${ctx.allocations.length} frozen purchase legs • payday ${ctx.mission?.paydayDate || '—'}`);
    setText('registrationRouteLock', 'Registration can confirm broker reality, but it cannot change the Finance budget or Transfer allocations.');

    setText('regKpiPlanned', money(ctx.planned));
    setText('regKpiConfirmed', money(ctx.confirmedCost));
    setText('regKpiRemaining', money(ctx.remaining));
    setText('regKpiPurchases', String(ctx.confirmedCount));

    setText('regFlowRouteMeta', `${ctx.allocations.length} locked legs received from Transfer`);
    setText('regFlowExecutionMeta', ctx.confirmedCount ? `${ctx.confirmedCount} purchase${ctx.confirmedCount === 1 ? '' : 's'} already confirmed` : 'Broker execution entry is the next controlled stage');
    setText('regDeskPriority', 'Locked Transfer route received. Registration is read-only while the execution form is rebuilt.');
    setText('regDeskStatus', 'ROUTE RECEIVED');

    const list = document.getElementById('registrationAllocationList');
    if (list) {
      list.innerHTML = ctx.allocations.map((row, index) => {
        const estShares = Math.max(0, num(row?.estimatedShares));
        const estPrice = Math.max(0, num(row?.estimatedPriceGbp));
        const registered = arr(readState()?.registration?.receipts).some(receipt => String(receipt?.allocationId || receipt?.legId || '') === String(row?.id || ''));
        return `
          <article class="reg-allocation-row ${registered ? 'confirmed' : ''}">
            <div class="reg-allocation-rank">#${index + 1}</div>
            <div class="reg-allocation-main">
              <small>LOCKED PURCHASE LEG</small>
              <strong>${esc(row?.ticker || row?.name || 'Purchase')} • ${esc(row?.name || row?.ticker || 'Locked target')}</strong>
              <span>${esc(row?.id || 'NO-LEG-ID')}</span>
            </div>
            <div><small>Broker</small><strong>${esc(String(row?.account || 'CHECK').toUpperCase() === 'IG' ? 'IG ISA' : row?.account || 'CHECK')}</strong></div>
            <div><small>Allocation</small><strong class="gold">${money(row?.amount)}</strong></div>
            <div><small>Est. shares</small><strong>${estShares ? estShares.toLocaleString('en-GB') : '—'}</strong></div>
            <div><small>Est. price</small><strong>${estPrice ? money(estPrice) : '—'}</strong></div>
            <div><small>Status</small><strong class="${registered ? 'green' : 'cyan'}">${registered ? 'CONFIRMED' : 'WAITING'}</strong></div>
          </article>`;
      }).join('');
    }

    window.AuroraRegistrationRouteIntake = Object.freeze({
      build: BUILD,
      ready: true,
      mode: 'LOCKED_ROUTE_READONLY',
      missionId: ctx.mission?.id || null,
      routeId: ctx.route?.id || null,
      budget: ctx.planned,
      legs: ctx.allocations.length,
      confirmed: ctx.confirmedCount,
      writeEnabled: false
    });
  }

  function renderWaiting() {
    document.documentElement.dataset.registrationRoute = 'waiting';
    setText('registrationRouteStatus', 'NO LOCKED ROUTE');
    setText('registrationRouteMeta', 'Lock a Transfer route before Registration can begin.');
    setText('registrationRouteLock', 'Registration never creates its own investment budget.');
    setText('regDeskPriority', 'Waiting for a locked Transfer route.');
    setText('regDeskStatus', 'WAITING');
    const list = document.getElementById('registrationAllocationList');
    if (list) list.innerHTML = '<div class="reg-empty">No locked purchase legs are available.</div>';
    window.AuroraRegistrationRouteIntake = Object.freeze({build:BUILD,ready:true,mode:'WAITING',writeEnabled:false});
  }

  function render() {
    const state = readState();
    if (!state) return renderWaiting();
    const ctx = lockedContext(state);
    if (!ctx) return renderWaiting();
    renderLocked(ctx);
  }

  const refresh = () => setTimeout(render, 0);
  loadBrowserAutoSync();
  window.addEventListener('aurora2:state', refresh);
  window.addEventListener('storage', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once:true});
  else render();
})();
