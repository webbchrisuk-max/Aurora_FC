(() => {
  'use strict';

  const BUILD = '20260823-finance-payday-command-dashboard-1';
  const STATE_KEY = 'aurora2:state:v1';
  let lastSignature = '';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(num(value));
  const upper = value => String(value || '').trim().toUpperCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function readState() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {};
      return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
    } catch (_) { return {}; }
  }

  function dateKey(value) {
    const text = String(value || '').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function displayDate(value) {
    const key = dateKey(value);
    if (!key) return 'Not dated';
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y,m-1,d,12).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }

  function previewData(state) {
    const publicPreview = window.AuroraFinancePaydayPreview || {};
    const plan = publicPreview?.draftPlan || state?.finance?.plan || {};
    let calculation = null;
    try {
      const fn = window.Aurora2?.financePaydayControl?.paydayFundingPreview;
      if (typeof fn === 'function') calculation = fn(state, plan);
    } catch (_) {}
    const c = calculation?.c || {};
    const normalized = c.plan || plan || {};
    const auto = c.auto || {};
    const safe = Math.max(0, num(c.safeSurplus ?? publicPreview?.safeSurplus));
    const commitments = Math.max(0, num(c.commitments ?? publicPreview?.commitments));
    const release = Math.max(0, num(normalized.releaseAmount ?? publicPreview?.draftPlan?.releaseAmount));
    const totalCash = Math.max(0, num(c.totalCash ?? normalized.openingCash) + (c.totalCash == null ? num(normalized.wagesReceived || normalized.expectedWages) + num(normalized.extraCash) : 0));
    return { plan:normalized, auto, safe, commitments, release, totalCash };
  }

  function holdingPot(state) {
    return arr(state?.finance?.pots).find(p => !p?.archived && String(p?.name || '').trim().toLowerCase() === 'holding pot') || null;
  }

  function activeBills(state) {
    return arr(state?.finance?.bills).filter(b => !b?.archived && !b?.paid && b?.included !== false);
  }

  function upcomingBills30(state) {
    const today = new Date(); today.setHours(12,0,0,0);
    const end = new Date(today); end.setDate(end.getDate()+30);
    return activeBills(state).map(b => {
      const key = dateKey(b?.due);
      const date = key ? new Date(`${key}T12:00:00`) : null;
      return {...b,_date:date};
    }).filter(b => b._date && b._date >= today && b._date <= end)
      .sort((a,b)=>a._date-b._date);
  }

  function historyRows(state) {
    const finance = state?.finance || {};
    const candidates = [
      ...arr(finance.paydayHistory),
      ...arr(finance.releaseHistory),
      ...arr(finance.paydayRuns),
      ...arr(finance.releases)
    ];
    const seen = new Set();
    return candidates.filter(row => {
      const key = String(row?.id || row?.paydayDate || row?.date || row?.createdAt || JSON.stringify(row));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b)=>String(b?.paydayDate || b?.date || b?.createdAt || '').localeCompare(String(a?.paydayDate || a?.date || a?.createdAt || ''))).slice(0,6);
  }

  function ensureStyle() {
    if (document.getElementById('financePaydayCommandStyle')) return;
    const style = document.createElement('style');
    style.id = 'financePaydayCommandStyle';
    style.textContent = `
      #paydayPanel .payday-command-dashboard{display:grid;gap:18px;margin-bottom:20px}
      .payday-decision{position:relative;overflow:hidden;border:1px solid rgba(110,231,255,.2);border-radius:26px;padding:26px;background:linear-gradient(135deg,rgba(7,30,51,.96),rgba(3,12,26,.98));box-shadow:0 20px 60px rgba(0,0,0,.24)}
      .payday-decision:after{content:'£';position:absolute;right:18px;bottom:-28px;font:950 150px/1 system-ui;color:rgba(110,231,255,.035)}
      .payday-decision-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;position:relative;z-index:1}
      .payday-decision-head small,.payday-subcard small{display:block;color:#76dff3;font:850 10px/1.2 system-ui;letter-spacing:.13em;text-transform:uppercase}
      .payday-decision-head h3{margin:7px 0 0;font:950 clamp(30px,4vw,46px)/1 system-ui;letter-spacing:-.035em}
      .payday-safety{border:1px solid rgba(99,245,162,.28);border-radius:999px;padding:9px 13px;background:rgba(99,245,162,.07);color:#aaffc7;font:900 10px/1 system-ui;letter-spacing:.08em}
      .payday-safety.warn{border-color:rgba(255,123,134,.34);background:rgba(255,123,134,.08);color:#ffadb4}
      .payday-decision-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:11px;margin-top:22px}
      .payday-decision-metric{border:1px solid rgba(255,255,255,.08);border-radius:17px;padding:15px;background:rgba(0,0,0,.17)}
      .payday-decision-metric small{color:#768fa6;font:800 9px/1.2 system-ui;text-transform:uppercase;letter-spacing:.08em}
      .payday-decision-metric strong{display:block;margin-top:7px;font:900 21px/1.1 system-ui}
      .payday-decision-message{position:relative;z-index:1;margin-top:17px;border-left:3px solid #6ee7ff;padding:13px 15px;background:rgba(110,231,255,.055);border-radius:0 13px 13px 0;color:#b9d4e2;font:650 13px/1.55 system-ui}
      .payday-dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
      .payday-subcard{border:1px solid rgba(255,255,255,.085);border-radius:22px;padding:21px;background:linear-gradient(180deg,rgba(8,20,37,.95),rgba(4,12,25,.97))}
      .payday-subcard h4{margin:7px 0 15px;font:900 22px/1.1 system-ui}
      .payday-breakdown{display:grid;gap:8px}
      .payday-breakdown>div{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}
      .payday-breakdown>div:last-child{border-bottom:0}.payday-breakdown span{color:#8aa1b5;font:650 11px/1.35 system-ui}.payday-breakdown strong{font:850 12px/1.2 system-ui}
      .payday-checklist{display:grid;gap:9px}.payday-check{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.065);border-radius:14px;padding:11px 12px;background:rgba(0,0,0,.13)}
      .payday-check i{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;font-style:normal;background:rgba(99,245,162,.1);color:#8ff8b9}.payday-check.warn i{background:rgba(255,213,107,.1);color:#ffd56b}.payday-check b{font:800 12px/1.2 system-ui}.payday-check span{color:#758da2;font:650 9px/1.25 system-ui}.payday-check em{font-style:normal;color:#88a0b5;font:800 9px/1 system-ui}
      .payday-upcoming{display:grid;gap:8px}.payday-upcoming-row{display:grid;grid-template-columns:84px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}.payday-upcoming-row:last-child{border-bottom:0}.payday-upcoming-row time{color:#6ee7ff;font:800 10px/1 system-ui}.payday-upcoming-row b{font:800 12px/1.2 system-ui}.payday-upcoming-row strong{font:850 12px/1 system-ui}
      .payday-mission-box{border:1px solid rgba(125,167,255,.16);border-radius:16px;padding:15px;background:rgba(64,94,170,.07)}.payday-mission-box strong{display:block;font:900 23px/1.1 system-ui}.payday-mission-box span{display:block;margin-top:6px;color:#849bb1;font:650 11px/1.4 system-ui}
      .payday-history-table{width:100%;border-collapse:collapse}.payday-history-table th,.payday-history-table td{text-align:left;padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.06);font-size:10px}.payday-history-table th{color:#718aa0;text-transform:uppercase;letter-spacing:.07em}.payday-history-table td{color:#afc0cf}.payday-empty{color:#7f97ab;font:650 11px/1.5 system-ui;padding:6px 0}
      @media(max-width:1000px){.payday-decision-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:760px){.payday-dashboard-grid{grid-template-columns:1fr}.payday-decision-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.payday-decision-head{flex-direction:column}.payday-upcoming-row{grid-template-columns:74px 1fr auto}}
    `;
    document.head.appendChild(style);
  }

  function ensureShell() {
    const panel = document.getElementById('paydayPanel');
    if (!panel || panel.querySelector('.payday-command-dashboard')) return panel?.querySelector('.payday-command-dashboard') || null;
    const host = document.createElement('section');
    host.className = 'payday-command-dashboard';
    host.innerHTML = `
      <article class="payday-decision">
        <div class="payday-decision-head"><div><small>Finance Command Decision</small><h3>Payday Decision</h3></div><span class="payday-safety" data-payday-safety>CHECKING</span></div>
        <div class="payday-decision-grid">
          <div class="payday-decision-metric"><small>Total Available</small><strong data-payday-total>—</strong></div>
          <div class="payday-decision-metric"><small>Commitments</small><strong data-payday-commitments>—</strong></div>
          <div class="payday-decision-metric"><small>Protected Cash</small><strong data-payday-protected>—</strong></div>
          <div class="payday-decision-metric"><small>Maximum Safe Release</small><strong data-payday-safe>—</strong></div>
          <div class="payday-decision-metric"><small>Planned Release</small><strong data-payday-release>—</strong></div>
        </div>
        <div class="payday-decision-message" data-payday-message>Reading the Finance payday engine…</div>
      </article>
      <div class="payday-dashboard-grid">
        <article class="payday-subcard"><small>Protection Order</small><h4>Commitments Breakdown</h4><div class="payday-breakdown" data-payday-breakdown></div></article>
        <article class="payday-subcard"><small>Release Gate</small><h4>Payday Checklist</h4><div class="payday-checklist" data-payday-checklist></div></article>
        <article class="payday-subcard"><small>Forward View</small><h4>Next 30 Days</h4><div class="payday-upcoming" data-payday-upcoming></div></article>
        <article class="payday-subcard"><small>Money → Mission</small><h4>Transfer Mission</h4><div data-payday-mission></div></article>
      </div>
      <article class="payday-subcard"><small>Audit Trail</small><h4>Payday History</h4><div data-payday-history></div></article>
    `;
    panel.prepend(host);
    return host;
  }

  function set(host, selector, value) {
    const el = host?.querySelector(selector);
    if (el) el.textContent = value;
  }

  function checklist(state, p) {
    const hp = holdingPot(state);
    const hpTarget = Math.max(0, num(hp?.target ?? hp?.targetBalance ?? hp?.goal));
    const hpBalance = Math.max(0, num(hp?.balance));
    const billsProtected = num(p.auto?.billsDue) >= 0;
    const potsProtected = num(p.auto?.potsDue) >= 0;
    const hpProtected = hp ? (num(p.auto?.holdingTopUp) >= 0) : true;
    const spendingProtected = num(p.plan?.protectedCash) >= 0;
    const releaseSafe = p.release <= p.safe + 0.005;
    return [
      {name:'Wages / available cash loaded',ok:p.totalCash > 0,meta:p.totalCash > 0 ? money(p.totalCash) : 'WAITING'},
      {name:'Bills protected',ok:billsProtected,meta:money(p.auto?.billsDue)},
      {name:'Goal pots funded',ok:potsProtected,meta:money(p.auto?.potsDue)},
      {name:'Holding Pot protected',ok:hpProtected,meta:hp ? `${money(hpBalance)}${hpTarget ? ` / ${money(hpTarget)}` : ''}` : 'No pot'},
      {name:'Personal spending protected',ok:spendingProtected,meta:money(p.plan?.protectedCash)},
      {name:'Release within safe surplus',ok:releaseSafe,meta:releaseSafe ? 'SAFE' : 'BLOCK'}
    ];
  }

  function render() {
    const host = ensureShell();
    if (!host) return;
    const state = readState();
    const p = previewData(state);
    const signature = JSON.stringify({plan:p.plan,auto:p.auto,safe:p.safe,release:p.release,mission:state?.mission,bills:activeBills(state).map(b=>[b.id,b.due,b.amount,b.paid])});
    if (signature === lastSignature) return;
    lastSignature = signature;

    const headroom = Math.max(0, p.safe - p.release);
    const safe = p.release <= p.safe + 0.005;
    set(host,'[data-payday-total]',money(p.totalCash));
    set(host,'[data-payday-commitments]',`− ${money(p.commitments)}`);
    set(host,'[data-payday-protected]',`− ${money(p.plan?.protectedCash)}`);
    set(host,'[data-payday-safe]',money(p.safe));
    set(host,'[data-payday-release]',money(p.release));
    const safety = host.querySelector('[data-payday-safety]');
    if (safety) { safety.textContent = safe ? 'SAFE ✓' : 'TOO HIGH'; safety.classList.toggle('warn',!safe); }
    const message = safe
      ? p.safe > 0
        ? `Everything in the current Finance preview is protected. ${money(p.release)} is planned for release to Transfer and ${money(headroom)} remains as extra headroom inside the safe surplus.`
        : 'Finance currently has no safe surplus available for release. Commitments and protected cash remain ahead of investing.'
      : `Planned release exceeds Finance's maximum safe release by ${money(p.release-p.safe)}. Finance should not release this amount.`;
    set(host,'[data-payday-message]',message);

    const breakdown = host.querySelector('[data-payday-breakdown]');
    if (breakdown) breakdown.innerHTML = [
      ['Current Account bills',p.auto?.billsDue],
      ['13-pay bill funding',p.auto?.annualHoldingContribution],
      ['Holding Pot safety top-up',p.auto?.holdingTopUp],
      ['Goal pot funding',p.auto?.potsDue],
      ['Other planned spending',p.plan?.otherPlanned],
      ['Protected spending',p.plan?.protectedCash]
    ].map(([name,value])=>`<div><span>${esc(name)}</span><strong>− ${money(value)}</strong></div>`).join('');

    const checks = host.querySelector('[data-payday-checklist]');
    if (checks) checks.innerHTML = checklist(state,p).map(item=>`<div class="payday-check ${item.ok?'':'warn'}"><i>${item.ok?'✓':'!'}</i><b>${esc(item.name)}</b><em>${esc(item.meta)}</em></div>`).join('');

    const upcoming = upcomingBills30(state);
    const upcomingHost = host.querySelector('[data-payday-upcoming]');
    if (upcomingHost) upcomingHost.innerHTML = upcoming.length
      ? upcoming.slice(0,8).map(b=>`<div class="payday-upcoming-row"><time>${esc(displayDate(b.due).replace(/\s\d{4}$/,''))}</time><b>${esc(b.name || 'Bill')}</b><strong>${money(b.amount)}</strong></div>`).join('')
      : '<div class="payday-empty">No dated active bills fall within the next 30 days.</div>';

    const mission = state?.mission || null;
    const missionHost = host.querySelector('[data-payday-mission]');
    if (missionHost) {
      const status = upper(mission?.status);
      const active = Boolean(mission && num(mission?.approvedBudget) > 0 && !['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(status));
      missionHost.innerHTML = active
        ? `<div class="payday-mission-box"><strong>${money(mission.approvedBudget)} • ${esc(status || 'ACTIVE')}</strong><span>${money(mission.amountRemaining ?? mission.approvedBudget-num(mission.amountAllocated))} remains. Finance owns the released amount; Transfer owns allocation and broker routing.</span></div>`
        : `<div class="payday-mission-box"><strong>No active mission</strong><span>A safe payday release can become the next Transfer mission when Finance releases it.</span></div>`;
    }

    const history = historyRows(state);
    const historyHost = host.querySelector('[data-payday-history]');
    if (historyHost) historyHost.innerHTML = history.length
      ? `<div style="overflow:auto"><table class="payday-history-table"><thead><tr><th>Date</th><th>Available</th><th>Commitments</th><th>Safe release</th><th>Actual release</th></tr></thead><tbody>${history.map(row=>`<tr><td>${esc(displayDate(row.paydayDate || row.date || row.createdAt))}</td><td>${money(row.totalCash ?? row.availableCash ?? row.openingCash)}</td><td>${money(row.commitments ?? row.totalCommitments)}</td><td>${money(row.safeSurplus ?? row.safeRelease)}</td><td>${money(row.releaseAmount ?? row.actualRelease ?? row.amount)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="payday-empty">No recorded payday history is stored yet. This panel will populate when Aurora has saved payday/release history to show.</div>';
  }

  function start() {
    ensureStyle();
    ensureShell();
    render();
    document.addEventListener('input', event => { if (event.target?.closest?.('#paydayPanel')) setTimeout(render,0); });
    document.addEventListener('change', event => { if (event.target?.closest?.('#paydayPanel')) setTimeout(render,0); });
    window.addEventListener('aurora2:state', () => setTimeout(render,30));
    window.addEventListener('storage', event => { if (event.key === STATE_KEY) setTimeout(render,30); });
    window.addEventListener('focus', () => setTimeout(render,50));
    setInterval(render, 1500);
  }

  window.AuroraFinancePaydayCommandDashboard = Object.freeze({build:BUILD,render});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
