(() => {
  'use strict';

  const BUILD = '20260823-finance-payday-pot-moves-direct-mount-2';
  const STATE_KEY = 'aurora2:state:v1';
  let lastSignature = '';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function readState() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {};
      return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
    } catch (_) { return {}; }
  }

  function preview(state) {
    const publicPreview = window.AuroraFinancePaydayPreview || {};
    const plan = publicPreview?.draftPlan || state?.finance?.plan || {};
    try {
      const fn = window.Aurora2?.financePaydayControl?.paydayFundingPreview;
      const result = typeof fn === 'function' ? fn(state, plan) : null;
      return result?.c || null;
    } catch (_) { return null; }
  }

  function holdingPot(state) {
    return arr(state?.finance?.pots).find(p => !p?.archived && norm(p?.name) === 'holding pot') || null;
  }

  function ensureStyle() {
    if (document.getElementById('financePaydayPotMovesStyle')) return;
    const style = document.createElement('style');
    style.id = 'financePaydayPotMovesStyle';
    style.textContent = `
      #financePaydayPotMovesHost{display:block!important;margin:0 0 18px!important}
      .payday-pot-moves{border:1px solid rgba(110,231,255,.18);border-radius:22px;padding:21px;background:linear-gradient(180deg,rgba(7,24,38,.98),rgba(3,13,25,.98));box-shadow:0 16px 44px rgba(0,0,0,.18)}
      .payday-pot-moves-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
      .payday-pot-moves-head small{display:block;color:#77e2f5;font:850 10px/1.2 system-ui;letter-spacing:.12em;text-transform:uppercase}
      .payday-pot-moves-head h4{margin:7px 0 0;font:900 23px/1.1 system-ui;color:#eef8ff}
      .payday-pot-moves-total{border:1px solid rgba(99,245,162,.2);border-radius:14px;padding:10px 12px;background:rgba(99,245,162,.055);text-align:right}
      .payday-pot-moves-total small{color:#7897a6;font-size:8px}.payday-pot-moves-total strong{display:block;margin-top:4px;color:#a7ffc7;font:900 18px/1 system-ui}
      .payday-pot-move-list{display:grid;gap:8px}
      .payday-pot-move{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:11px;align-items:center;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(0,0,0,.14)}
      .payday-pot-move>i{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:rgba(110,231,255,.08);color:#8fefff;font:900 12px/1 system-ui;font-style:normal}
      .payday-pot-move b{display:block;color:#eef8ff;font:850 12px/1.25 system-ui}.payday-pot-move span{display:block;margin-top:4px;color:#788fa3;font:650 9px/1.35 system-ui}
      .payday-pot-move strong{color:#eaf8ff;font:900 13px/1 system-ui;white-space:nowrap}
      .payday-pot-move.required{border-color:rgba(255,213,107,.2)}.payday-pot-move.required>i{background:rgba(255,213,107,.08);color:#ffd76f}
      .payday-pot-move.holding{border-color:rgba(99,245,162,.2)}.payday-pot-move.holding>i{background:rgba(99,245,162,.08);color:#99f6bc}
      .payday-pot-moves-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}
      .payday-pot-moves-summary>div{padding:10px 11px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(0,0,0,.12)}
      .payday-pot-moves-summary small{display:block;color:#71899e;font:800 8px/1.2 system-ui;text-transform:uppercase;letter-spacing:.07em}.payday-pot-moves-summary strong{display:block;margin-top:5px;color:#e8f6ff;font:850 12px/1.1 system-ui}
      .payday-pot-moves-empty{padding:18px;border:1px dashed rgba(110,231,255,.13);border-radius:13px;color:#7d94a7;text-align:center;font:650 10px/1.5 system-ui}
      @media(max-width:760px){.payday-pot-moves-head{flex-direction:column}.payday-pot-moves-total{text-align:left}.payday-pot-moves-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.payday-pot-move{grid-template-columns:36px minmax(0,1fr)}.payday-pot-move strong{grid-column:2}}
    `;
    document.head.appendChild(style);
  }

  function ensureHost() {
    const panel = document.getElementById('paydayPanel');
    if (!panel) return null;

    let host = document.getElementById('financePaydayPotMovesHost');
    if (host && host.isConnected) return host;

    host = document.createElement('article');
    host.id = 'financePaydayPotMovesHost';
    host.className = 'payday-pot-moves';
    host.dataset.paydayPotMoves = '1';
    host.innerHTML = '<div class="payday-pot-moves-empty">Loading payday pot moves…</div>';

    const dashboard = panel.querySelector('.payday-command-dashboard');
    const plannerGrid = panel.querySelector('.finance-command-grid');
    if (dashboard?.nextSibling) panel.insertBefore(host, dashboard.nextSibling);
    else if (plannerGrid) panel.insertBefore(host, plannerGrid);
    else panel.prepend(host);
    return host;
  }

  function moveRows(state, c) {
    const planRows = arr(c?.fundingPlan?.rows || state?.finance?.fundingPolicy?.lastPlan?.rows);
    const moves = planRows.map(row => ({
      type:'pot',
      name:String(row?.name || 'Pot'),
      amount:num(row?.amount),
      required:num(row?.required),
      reason:String(row?.reason || 'Payday pot funding'),
      deadline:String(row?.deadline || '')
    })).filter(row => row.amount > .009);

    const hp = holdingPot(state);
    const annual = num(c?.auto?.annualHoldingContribution);
    const topUp = num(c?.auto?.holdingTopUp);
    const holdingMove = Number((annual + topUp).toFixed(2));
    if (hp && holdingMove > .009) {
      const reasons = [];
      if (annual > .009) reasons.push(`${money(annual)} normal 13-pay contribution`);
      if (topUp > .009) reasons.push(`${money(topUp)} safety top-up`);
      moves.unshift({type:'holding',name:hp.name || 'Holding Pot',amount:holdingMove,required:holdingMove,reason:reasons.join(' + '),deadline:''});
    }
    return moves;
  }

  function render() {
    const host = ensureHost();
    if (!host) return false;
    const state = readState();
    const c = preview(state);

    if (!c) {
      host.innerHTML = `
        <div class="payday-pot-moves-head"><div><small>Payday Operations</small><h4>Pot Moves to Make</h4></div></div>
        <div class="payday-pot-moves-empty">Waiting for the Finance payday funding engine…</div>`;
      return false;
    }

    const rows = moveRows(state,c);
    const fundingPlan = c?.fundingPlan || state?.finance?.fundingPolicy?.lastPlan || {};
    const total = rows.reduce((sum,row)=>sum+row.amount,0);
    const required = num(fundingPlan?.requiredFunding) + num(c?.auto?.annualHoldingContribution) + num(c?.auto?.holdingTopUp);
    const extra = num(fundingPlan?.extraAllocated);
    const unallocated = num(fundingPlan?.unallocated);
    const wageDifference = num(c?.plan?.wageExtra ?? fundingPlan?.extraBudget);
    const signature = JSON.stringify({rows,total,required,extra,unallocated,wageDifference,payday:c?.plan?.paydayDate});
    if (signature === lastSignature && host.dataset.rendered === '1') return true;
    lastSignature = signature;
    host.dataset.rendered = '1';

    host.innerHTML = `
      <div class="payday-pot-moves-head">
        <div><small>Payday Operations</small><h4>Pot Moves to Make</h4></div>
        <div class="payday-pot-moves-total"><small>TOTAL TO MOVE</small><strong>${money(total)}</strong></div>
      </div>
      ${rows.length ? `<div class="payday-pot-move-list">${rows.map((row,index)=>{
        const requiredMove = row.required > .009;
        const meta = [row.reason, row.deadline ? `Deadline ${row.deadline}` : ''].filter(Boolean).join(' • ');
        return `<div class="payday-pot-move ${row.type === 'holding' ? 'holding' : requiredMove ? 'required' : ''}"><i>${String(index+1).padStart(2,'0')}</i><div><b>Move ${money(row.amount)} → ${esc(row.name)}</b><span>${esc(meta)}</span></div><strong>${requiredMove ? 'REQUIRED' : 'EXTRA PAY'}</strong></div>`;
      }).join('')}</div>` : '<div class="payday-pot-moves-empty">No pot transfers are required from the current payday plan.</div>'}
      <div class="payday-pot-moves-summary">
        <div><small>Required Funding</small><strong>${money(required)}</strong></div>
        <div><small>Extra Wage</small><strong>${money(wageDifference)}</strong></div>
        <div><small>Extra Routed to Pots</small><strong>${money(extra)}</strong></div>
        <div><small>Extra Left After Pots</small><strong>${money(unallocated)}</strong></div>
      </div>`;
    return true;
  }

  function start() {
    ensureStyle();
    ensureHost();
    let tries = 0;
    const wait = () => {
      const ready = render();
      if (!ready && ++tries < 1200) { setTimeout(wait,25); return; }
    };
    wait();

    window.addEventListener('aurora2:state', () => setTimeout(render,20));
    window.addEventListener('storage', event => { if (event.key === STATE_KEY) setTimeout(render,20); });
    window.addEventListener('focus', () => setTimeout(render,30));
    window.addEventListener('pageshow', () => setTimeout(render,30));
    window.addEventListener('aurora:finance-workspace', event => {
      if (event?.detail?.id === 'paydayPanel') setTimeout(render,0);
    });
    document.addEventListener('input', event => { if (event.target?.closest?.('#paydayPanel')) setTimeout(render,0); });
    document.addEventListener('change', event => { if (event.target?.closest?.('#paydayPanel')) setTimeout(render,0); });

    const panel = document.getElementById('paydayPanel');
    if (panel) {
      new MutationObserver(() => {
        if (!document.getElementById('financePaydayPotMovesHost')) setTimeout(render,0);
      }).observe(panel,{childList:true,subtree:false});
    }
    setInterval(render,1500);
  }

  window.AuroraFinancePaydayPotMoves = Object.freeze({build:BUILD,render});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
