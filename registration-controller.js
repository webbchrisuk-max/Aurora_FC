(() => {
  'use strict';

  const BUILD = '20260824-registration-controller-1';
  const STATE_KEY = 'aurora2:state:v1';

  if (window.__auroraRegistrationController) return;
  window.__auroraRegistrationController = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Math.max(0, num(value)));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function loadBrowserAutoSync() {
    if (window.__AuroraBrowserAutoSync || [...document.scripts].some(script => String(script.src || '').includes('aurora-browser-sync-auto.js'))) return;
    const script = document.createElement('script');
    script.src = 'aurora-browser-sync-auto.js?v=20260822-browser-auto-sync-2';
    script.async = false;
    document.head.appendChild(script);
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function lockedContext(state = readState()) {
    const mission = state?.mission;
    const route = state?.transfer?.route;
    const status = String(mission?.status || '').toUpperCase();
    const matching = route && String(route?.missionId || '') === String(mission?.id || '');
    if (status !== 'LOCKED' || route?.locked !== true || !matching) return null;

    const allocations = arr(route.allocations).filter(row => num(row?.amount) > 0);
    const planned = round2(mission?.approvedBudget ?? route?.financeBudget);
    const receipts = arr(state?.registration?.receipts).filter(receipt =>
      String(receipt?.missionId || '') === String(mission?.id || '') ||
      allocations.some(row => String(receipt?.allocationId || receipt?.legId || '') === String(row?.id || row?.legId || ''))
    );
    const confirmedCost = round2(receipts.reduce((sum, row) => sum + num(row?.totalCostGbp ?? row?.costGbp ?? row?.amount), 0));
    const confirmedLegs = new Set(receipts.map(row => String(row?.allocationId || row?.legId || '')).filter(Boolean));
    return {
      state, mission, route, allocations, receipts, planned, confirmedCost,
      confirmedCount: confirmedLegs.size,
      remaining: round2(Math.max(0, planned - confirmedCost))
    };
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function ensurePreviewStyles() {
    if (document.getElementById('registrationBrokerPreviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'registrationBrokerPreviewStyles';
    style.textContent = `
      .reg-execution-preview{margin-top:22px;border:1px solid rgba(180,156,255,.18);border-radius:24px;padding:26px;background:linear-gradient(180deg,rgba(14,10,24,.96),rgba(3,10,16,.96));box-shadow:0 18px 50px rgba(0,0,0,.22)}
      .reg-execution-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.reg-execution-head h2{margin:0;font:900 clamp(28px,5vw,44px)/1 system-ui}.reg-execution-head p{max-width:780px;color:#8f9ba7;line-height:1.55}.reg-execution-chip{border:1px solid rgba(255,213,107,.28);border-radius:999px;padding:9px 12px;color:#ffe29a;font:800 10px/1 system-ui;letter-spacing:.1em;text-transform:uppercase}
      .reg-execution-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin-top:20px}.reg-execution-grid .field{display:grid;gap:6px;min-width:0}.reg-execution-grid .wide{grid-column:span 2}.reg-execution-grid label{color:#738691;font:800 9px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase}.reg-execution-grid input,.reg-execution-grid select{width:100%;box-sizing:border-box;min-height:44px;border:1px solid rgba(110,231,255,.13);border-radius:11px;background:rgba(1,10,16,.92);color:#edf8fb;padding:9px 11px;font:700 14px/1.2 system-ui}.reg-execution-grid input[readonly]{color:#a8bcc4;background:rgba(255,255,255,.025)}
      .reg-execution-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}.reg-execution-kpis div{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px;background:rgba(0,0,0,.14)}.reg-execution-kpis small{display:block;color:#70818a;font:800 8px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase;margin-bottom:7px}.reg-execution-kpis strong{font:900 18px/1.15 system-ui}.reg-execution-kpis .good{color:#9affbd}.reg-execution-kpis .warn{color:#ffe29a}.reg-execution-kpis .bad{color:#ff9ba6}
      .reg-execution-note{margin-top:16px;border:1px solid rgba(110,231,255,.15);border-radius:14px;padding:14px;color:#a3b3ba;background:rgba(110,231,255,.025);font:600 12px/1.5 system-ui}.reg-execution-note strong{color:#dff8ff}.reg-execution-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.reg-execution-actions button{border:1px solid rgba(110,231,255,.22);border-radius:11px;background:rgba(110,231,255,.04);color:#baf7ff;padding:10px 13px;font:800 10px/1 system-ui;letter-spacing:.08em;text-transform:uppercase}.reg-execution-actions button:disabled{opacity:.45}
      @media(max-width:950px){.reg-execution-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.reg-execution-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.reg-execution-grid .wide{grid-column:span 2}}
      @media(max-width:560px){.reg-execution-grid,.reg-execution-kpis{grid-template-columns:1fr}.reg-execution-grid .wide{grid-column:span 1}}
    `;
    document.head.appendChild(style);
  }

  function ensurePreviewSection() {
    let section = document.getElementById('registrationBrokerPreview');
    if (section) return section;
    const anchor = document.querySelector('.reg-allocations');
    if (!anchor) return null;
    section = document.createElement('section');
    section.id = 'registrationBrokerPreview';
    section.className = 'reg-execution-preview';
    anchor.insertAdjacentElement('afterend', section);
    return section;
  }

  function selectedLeg(ctx) {
    const id = String(document.getElementById('brokerPreviewLeg')?.value || '');
    return ctx?.allocations.find(row => String(row?.id || row?.legId || '') === id) || ctx?.allocations[0] || null;
  }

  function calcActual() {
    const shares = Math.max(0, num(document.getElementById('brokerPreviewShares')?.value));
    const priceInput = Math.max(0, num(document.getElementById('brokerPreviewPrice')?.value));
    const unit = String(document.getElementById('brokerPreviewPriceUnit')?.value || 'GBP');
    const currency = String(document.getElementById('brokerPreviewCurrency')?.value || 'GBP').trim().toUpperCase();
    const fx = Math.max(0, num(document.getElementById('brokerPreviewFx')?.value || 1));
    const fees = Math.max(0, num(document.getElementById('brokerPreviewFees')?.value));
    const priceNative = unit === 'PENCE' ? priceInput / 100 : priceInput;
    const grossNative = shares * priceNative;
    const totalNative = grossNative + fees;
    const totalGbp = currency === 'GBP' ? totalNative : totalNative * fx;
    return { shares, priceInput, currency, fx, fees, totalGbp };
  }

  function refreshPreviewNumbers(ctx) {
    const leg = selectedLeg(ctx);
    if (!leg) return;
    const actual = calcActual();
    const planned = Math.max(0, num(leg.amount));
    const difference = Number((actual.totalGbp - planned).toFixed(2));
    setText('brokerPreviewPlanned', money(planned));
    setText('brokerPreviewActual', money(actual.totalGbp));
    const diffEl = document.getElementById('brokerPreviewDifference');
    if (diffEl) {
      diffEl.textContent = `${difference > 0 ? '+' : ''}${money(difference)}`;
      diffEl.className = Math.abs(difference) <= 0.01 ? 'good' : Math.abs(difference) <= Math.max(5, planned * 0.02) ? 'warn' : 'bad';
    }
    const valid = actual.shares > 0 && actual.priceInput > 0 && (actual.currency === 'GBP' || actual.fx > 0);
    const stateEl = document.getElementById('brokerPreviewState');
    if (stateEl) {
      stateEl.textContent = valid ? 'PREVIEW READY' : 'ENTER BROKER EXECUTION';
      stateEl.className = valid ? 'good' : 'warn';
    }
    window.AuroraRegistrationBrokerPreview = Object.freeze({
      build: BUILD, ready: true, writeEnabled: false,
      missionId: ctx.mission.id, routeId: ctx.route.id,
      legId: leg.id || leg.legId || '', planned,
      actualGbp: Number(actual.totalGbp.toFixed(2)), difference, valid
    });
  }

  function seedLeg(ctx, leg) {
    if (!leg) return;
    const account = document.getElementById('brokerPreviewAccount');
    const ticker = document.getElementById('brokerPreviewTicker');
    const shares = document.getElementById('brokerPreviewShares');
    const price = document.getElementById('brokerPreviewPrice');
    const currency = document.getElementById('brokerPreviewCurrency');
    const fx = document.getElementById('brokerPreviewFx');
    const fees = document.getElementById('brokerPreviewFees');
    if (account) account.value = String(leg.account || 'CHECK').toUpperCase() === 'IG' ? 'IG ISA' : String(leg.account || 'CHECK');
    if (ticker) ticker.value = String(leg.ticker || '');
    if (shares) shares.value = Math.max(0, num(leg.estimatedShares)) || '';
    if (price) price.value = Math.max(0, num(leg.estimatedPriceGbp)) || '';
    if (currency) currency.value = 'GBP';
    if (fx) fx.value = '1';
    if (fees) fees.value = '0';
    refreshPreviewNumbers(ctx);
  }

  function renderRoute(ctx) {
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
    setText('regFlowExecutionMeta', ctx.confirmedCount ? `${ctx.confirmedCount} purchase${ctx.confirmedCount === 1 ? '' : 's'} already confirmed` : 'Broker execution preview is the next controlled stage');
    setText('regDeskPriority', 'Locked Transfer route received. Registration is read-only while canonical execution write remains held.');
    setText('regDeskStatus', 'ROUTE RECEIVED');

    const list = document.getElementById('registrationAllocationList');
    if (list) {
      list.innerHTML = ctx.allocations.map((row, index) => {
        const id = String(row?.id || row?.legId || '');
        const registered = ctx.receipts.some(receipt => String(receipt?.allocationId || receipt?.legId || '') === id);
        const estShares = Math.max(0, num(row?.estimatedShares));
        const estPrice = Math.max(0, num(row?.estimatedPriceGbp));
        return `<article class="reg-allocation-row ${registered ? 'confirmed' : ''}">
          <div class="reg-allocation-rank">#${index + 1}</div>
          <div class="reg-allocation-main"><small>LOCKED PURCHASE LEG</small><strong>${esc(row?.ticker || row?.name || 'Purchase')} • ${esc(row?.name || row?.ticker || 'Locked target')}</strong><span>${esc(id || 'NO-LEG-ID')}</span></div>
          <div><small>Broker</small><strong>${esc(String(row?.account || 'CHECK').toUpperCase() === 'IG' ? 'IG ISA' : row?.account || 'CHECK')}</strong></div>
          <div><small>Allocation</small><strong class="gold">${money(row?.amount)}</strong></div>
          <div><small>Est. shares</small><strong>${estShares ? estShares.toLocaleString('en-GB') : '—'}</strong></div>
          <div><small>Est. price</small><strong>${estPrice ? money(estPrice) : '—'}</strong></div>
          <div><small>Status</small><strong class="${registered ? 'green' : 'cyan'}">${registered ? 'CONFIRMED' : 'WAITING'}</strong></div>
        </article>`;
      }).join('');
    }

    window.AuroraRegistrationRouteIntake = Object.freeze({
      build: BUILD, ready: true, mode: 'LOCKED_ROUTE_READONLY',
      missionId: ctx.mission?.id || null, routeId: ctx.route?.id || null,
      budget: ctx.planned, legs: ctx.allocations.length,
      confirmed: ctx.confirmedCount, writeEnabled: false
    });
  }

  function renderPreview(ctx) {
    ensurePreviewStyles();
    const section = ensurePreviewSection();
    if (!section) return;
    if (!ctx?.allocations?.length) {
      section.innerHTML = '<div class="reg-execution-note"><strong>Broker execution held.</strong> A locked Transfer route is required before this preview can open.</div>';
      return;
    }
    const options = ctx.allocations.map((row, index) => `<option value="${esc(String(row.id || row.legId || ''))}">#${index + 1} ${esc(row.ticker || row.name || 'Purchase')} • ${money(row.amount)}</option>`).join('');
    section.innerHTML = `
      <div class="reg-execution-head"><div><span class="registration-kicker">Broker Reality Preview</span><h2>Confirm the real trade</h2><p>Choose one frozen purchase leg and enter exactly what the broker executed. Aurora reconciles the execution against the locked allocation, but this stage does not save or register anything yet.</p></div><span class="reg-execution-chip">NO SAVE • PREVIEW ONLY</span></div>
      <div class="reg-execution-grid">
        <div class="field wide"><label>Locked purchase leg</label><select id="brokerPreviewLeg">${options}</select></div>
        <div class="field"><label>Trade date</label><input id="brokerPreviewDate" inputmode="numeric" placeholder="YYYY-MM-DD" value="${todayLocal()}"></div>
        <div class="field"><label>Account</label><input id="brokerPreviewAccount" readonly></div><div class="field"><label>Ticker</label><input id="brokerPreviewTicker" readonly></div>
        <div class="field"><label>Shares bought</label><input id="brokerPreviewShares" type="number" min="0" step="0.000001"></div><div class="field"><label>Execution price</label><input id="brokerPreviewPrice" type="number" min="0" step="0.0001"></div>
        <div class="field"><label>Price unit</label><select id="brokerPreviewPriceUnit"><option value="GBP">Currency / share</option><option value="PENCE">Pence / share</option></select></div><div class="field"><label>Currency</label><input id="brokerPreviewCurrency" value="GBP" maxlength="3"></div>
        <div class="field"><label>FX to GBP</label><input id="brokerPreviewFx" type="number" min="0" step="0.000001" value="1"></div><div class="field"><label>Fees</label><input id="brokerPreviewFees" type="number" min="0" step="0.01" value="0"></div>
      </div>
      <div class="reg-execution-kpis"><div><small>Planned allocation</small><strong id="brokerPreviewPlanned">£0.00</strong></div><div><small>Actual GBP</small><strong id="brokerPreviewActual">£0.00</strong></div><div><small>Difference</small><strong id="brokerPreviewDifference">£0.00</strong></div><div><small>Execution state</small><strong id="brokerPreviewState" class="warn">ENTER BROKER EXECUTION</strong></div></div>
      <div class="reg-execution-note"><strong>Controlled preview:</strong> broker/account and ticker stay locked to Transfer. Shares, price, currency, FX and fees are temporary inputs only. AuroraData 2, Registration receipts and Squad are untouched.</div>
      <div class="reg-execution-actions"><button type="button" id="brokerPreviewReset">Reset selected leg estimate</button><button type="button" disabled>Register & Confirm — locked</button></div>`;

    const legSelect = document.getElementById('brokerPreviewLeg');
    seedLeg(ctx, ctx.allocations[0]);
    legSelect?.addEventListener('change', () => seedLeg(ctx, selectedLeg(ctx)));
    ['brokerPreviewShares','brokerPreviewPrice','brokerPreviewPriceUnit','brokerPreviewCurrency','brokerPreviewFx','brokerPreviewFees'].forEach(id => {
      const node = document.getElementById(id);
      node?.addEventListener('input', () => refreshPreviewNumbers(ctx));
      node?.addEventListener('change', () => refreshPreviewNumbers(ctx));
    });
    document.getElementById('brokerPreviewReset')?.addEventListener('click', () => seedLeg(ctx, selectedLeg(ctx)));
    setText('regFlowExecutionMeta', 'Broker execution preview is live; canonical write remains held');
    const pill = document.querySelector('.registration-pill.readonly');
    if (pill) pill.textContent = 'LOCKED ROUTE • EXECUTION PREVIEW';
    const top = document.querySelector('.topbar .status b');
    if (top) top.textContent = 'BROKER PREVIEW';
  }

  function renderWaiting() {
    document.documentElement.dataset.registrationRoute = 'waiting';
    setText('registrationRouteBudget', '£0.00');
    setText('registrationRouteStatus', 'NO LOCKED ROUTE');
    setText('registrationRouteMeta', 'Lock a Transfer route before Registration can begin.');
    setText('registrationRouteLock', 'Registration never creates its own investment budget.');
    setText('regKpiPlanned', '£0.00');
    setText('regKpiConfirmed', '£0.00');
    setText('regKpiRemaining', '£0.00');
    setText('regKpiPurchases', '0');
    setText('regDeskPriority', 'Waiting for a locked Transfer route.');
    setText('regDeskStatus', 'WAITING');
    const list = document.getElementById('registrationAllocationList');
    if (list) list.innerHTML = '<div class="reg-empty">No locked purchase legs are available.</div>';
    renderPreview(null);
    window.AuroraRegistrationRouteIntake = Object.freeze({build: BUILD, ready: true, mode: 'WAITING', writeEnabled: false});
    window.AuroraRegistrationBrokerPreview = Object.freeze({build: BUILD, ready: true, writeEnabled: false, valid: false});
  }

  function render() {
    const ctx = lockedContext();
    if (!ctx) return renderWaiting();
    renderRoute(ctx);
    renderPreview(ctx);
  }

  function boot() {
    loadBrowserAutoSync();
    render();
    const refresh = () => setTimeout(render, 0);
    window.addEventListener('aurora2:state', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  }

  window.AuroraRegistrationController = Object.freeze({build: BUILD, ready: true, render, lockedContext, writeEnabled: false});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
