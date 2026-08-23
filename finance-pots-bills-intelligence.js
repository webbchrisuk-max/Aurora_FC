(() => {
  'use strict';

  const BUILD = '20260823-finance-pots-bills-intelligence-1';
  const STATE_KEY = 'aurora2:state:v1';
  let lastSignature = '';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function readState() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {};
      return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
    } catch (_) { return {}; }
  }

  function parseDate(value) {
    const raw = String(value || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function today() { const d = new Date(); d.setHours(12,0,0,0); return d; }

  function nextPayday(plan) {
    let d = parseDate(plan?.paydayDate);
    if (!d) return null;
    const now = today();
    let guard = 0;
    while (d < now && guard++ < 30) d.setDate(d.getDate()+28);
    return d;
  }

  function activePots(state) { return arr(state?.finance?.pots).filter(p => !p?.archived); }
  function activeBills(state) { return arr(state?.finance?.bills).filter(b => !b?.archived && !b?.paid && b?.included !== false); }
  function holdingPot(state) { return activePots(state).find(p => norm(p?.name) === 'holding pot') || null; }

  function fundedValue(p) {
    const balance = num(p?.balance);
    return String(p?.goalMode || '') === 'funded-progress' ? balance + num(p?.spent) : balance;
  }
  function gap(p) { return Math.max(0, num(p?.target) - fundedValue(p)); }

  function preview(state) {
    const plan = window.AuroraFinancePaydayPreview?.draftPlan || state?.finance?.plan || {};
    try {
      const fn = window.Aurora2?.financePaydayControl?.paydayFundingPreview;
      const result = typeof fn === 'function' ? fn(state, plan) : null;
      return result?.c || null;
    } catch (_) { return null; }
  }

  function potHealth(p) {
    const remaining = gap(p);
    const target = num(p?.target);
    const deadline = parseDate(p?.deadline);
    const required = num(p?.fundingRequired);
    const scheduled = num(p?.fundingPerPayday || p?.fundingOverride);
    if (target <= .009 || remaining <= .009) return {tone:'good',label:'FUNDED',detail: target > 0 ? `${money(fundedValue(p))} of ${money(target)}` : 'No funding target'};
    if (!deadline) return {tone:'neutral',label:'NO DEADLINE',detail:`${money(remaining)} still to fund`};
    if (deadline < today()) return {tone:'bad',label:'BEHIND PACE',detail:`Deadline passed • ${money(remaining)} remaining`};
    if (required > scheduled + .009) return {tone:'bad',label:'BEHIND PACE',detail:`Needs ${money(required)} / payday • ${money(scheduled)} scheduled`};
    return {tone:'good',label:'ON TRACK',detail:`${money(scheduled)} next payday • ${money(remaining)} remaining`};
  }

  function attention(state) {
    const now = today();
    const items = [];
    activeBills(state).forEach(b => {
      const due = parseDate(b?.due);
      if (due && due < now) items.push({tone:'bad',title:`${b?.name || 'Bill'} overdue`,detail:`${money(b?.amount)} • due ${due.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`});
    });
    activePots(state).filter(p => norm(p?.name) !== 'holding pot').forEach(p => {
      const h = potHealth(p);
      if (h.label === 'BEHIND PACE') items.push({tone:'bad',title:`${p?.name || 'Pot'} behind pace`,detail:h.detail});
      else if (h.label === 'NO DEADLINE' && gap(p) > .009) items.push({tone:'warn',title:`${p?.name || 'Pot'} has no deadline`,detail:`${money(gap(p))} target gap • optional funding only`});
    });
    return items.slice(0,5);
  }

  function paydayMoves(state, c) {
    const funding = c?.fundingPlan || state?.finance?.fundingPolicy?.lastPlan || {};
    const rows = arr(funding?.rows).map(row => ({name:row?.name || 'Pot', amount:num(row?.amount), required:num(row?.required)})).filter(r => r.amount > .009);
    const hp = holdingPot(state);
    const hpMove = num(c?.auto?.annualHoldingContribution) + num(c?.auto?.holdingTopUp);
    if (hp && hpMove > .009) rows.unshift({name:hp.name || 'Holding Pot',amount:hpMove,required:hpMove,holding:true});
    return rows;
  }

  function holdingCover(state, c) {
    const hp = holdingPot(state);
    const balance = num(hp?.balance);
    const payday = nextPayday(state?.finance?.plan || {});
    const holdingBills = activeBills(state).filter(b => norm(b?.fundingSource) === 'holding pot');
    let due = num(c?.auto?.holdingRequired);
    if (!due && payday) {
      due = holdingBills.reduce((sum,b) => {
        const d = parseDate(b?.due);
        return sum + (d && d <= payday ? num(b?.amount) : 0);
      },0);
    }
    const topup = num(c?.auto?.annualHoldingContribution) + num(c?.auto?.holdingTopUp);
    const after = balance + topup - due;
    return {balance,due,topup,after};
  }

  function installStyle() {
    if (document.getElementById('pbIntelligenceStyle')) return;
    const style = document.createElement('style');
    style.id = 'pbIntelligenceStyle';
    style.textContent = `
      .pb-intel{display:grid;gap:12px;margin:14px 0 4px}.pb-intel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .pb-intel-card{border:1px solid rgba(110,231,255,.13);border-radius:18px;padding:17px;background:linear-gradient(145deg,rgba(7,25,40,.94),rgba(3,13,25,.96))}
      .pb-intel-card>small,.pb-health-head small{display:block;color:#75dff1;font:850 9px/1.2 system-ui;letter-spacing:.11em;text-transform:uppercase}.pb-intel-card h4,.pb-health-head h4{margin:6px 0 13px;font:900 19px/1.1 system-ui}
      .pb-attention-list,.pb-move-list,.pb-health-list{display:grid;gap:7px}.pb-attention-row,.pb-move-row,.pb-health-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid rgba(255,255,255,.065);border-radius:12px;background:rgba(0,0,0,.13)}
      .pb-attention-row b,.pb-move-row b,.pb-health-row b{display:block;color:#edf8ff;font:800 11px/1.2 system-ui}.pb-attention-row span,.pb-move-row span,.pb-health-row span{display:block;margin-top:3px;color:#7891a4;font:650 8px/1.3 system-ui}.pb-attention-row em,.pb-health-row em{font-style:normal;font:900 8px/1 system-ui;letter-spacing:.06em;padding:6px 8px;border-radius:999px;background:rgba(110,231,255,.07);color:#9cecff;white-space:nowrap}.pb-attention-row.bad em,.pb-health-row.bad em{background:rgba(255,91,110,.09);color:#ff9ba5}.pb-attention-row.warn em{background:rgba(255,211,102,.09);color:#ffd66e}.pb-health-row.good em{background:rgba(95,242,158,.09);color:#9dffc5}.pb-health-row.neutral em{color:#9fb0bd;background:rgba(255,255,255,.05)}
      .pb-cover-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.pb-cover-grid div{padding:11px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(0,0,0,.12)}.pb-cover-grid small{display:block;color:#71899d;font:800 8px/1.2 system-ui;text-transform:uppercase}.pb-cover-grid strong{display:block;margin-top:6px;font:900 13px/1 system-ui}.pb-cover-note{margin-top:9px;color:#8298a9;font:650 9px/1.4 system-ui}
      .pb-move-row strong{font:900 12px/1 system-ui;color:#eaf8ff;white-space:nowrap}.pb-intel-empty{padding:15px;border:1px dashed rgba(110,231,255,.13);border-radius:12px;color:#7890a4;text-align:center;font:650 9px/1.5 system-ui}.pb-intel-link{display:inline-flex;margin-top:10px;padding:8px 10px;border:1px solid rgba(110,231,255,.17);border-radius:10px;color:#aeeeff;text-decoration:none;font:850 9px/1 system-ui}
      .pb-health-panel{margin-top:12px;border:1px solid rgba(110,231,255,.13);border-radius:18px;padding:17px;background:rgba(5,17,30,.75)}.pb-health-head{display:flex;justify-content:space-between;gap:14px;align-items:start}.pb-health-head p{margin:0;color:#7890a4;font:650 9px/1.4 system-ui;text-align:right;max-width:360px}
      @media(max-width:900px){.pb-intel-grid{grid-template-columns:1fr}.pb-cover-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.pb-cover-grid{grid-template-columns:1fr 1fr}.pb-health-head{flex-direction:column}.pb-health-head p{text-align:left}}
    `;
    document.head.appendChild(style);
  }

  function ensureHosts() {
    const summary = document.getElementById('pbSummaryMount');
    const pots = document.getElementById('pbPotsMount');
    if (!summary || !pots) return null;
    let root = document.getElementById('pbIntelligence');
    if (!root) {
      root = document.createElement('section');
      root.id = 'pbIntelligence';
      root.className = 'pb-intel';
      const cards = document.getElementById('pbSummaryCards');
      if (cards) cards.insertAdjacentElement('afterend',root); else summary.prepend(root);
    }
    let health = document.getElementById('pbPotHealthPanel');
    if (!health) {
      health = document.createElement('section');
      health.id = 'pbPotHealthPanel';
      health.className = 'pb-health-panel';
      pots.prepend(health);
    }
    return {root,health};
  }

  function render() {
    const hosts = ensureHosts();
    if (!hosts) return false;
    const state = readState();
    const c = preview(state);
    const pots = activePots(state);
    const attentionRows = attention(state);
    const moves = paydayMoves(state,c);
    const cover = holdingCover(state,c);
    const healthRows = pots.filter(p => norm(p?.name) !== 'holding pot').map(p => ({p,h:potHealth(p)}));
    const signature = JSON.stringify({attentionRows,moves,cover,healthRows:healthRows.map(x=>[x.p?.id,x.p?.name,x.h.label,x.h.detail]),payday:state?.finance?.plan?.paydayDate});
    if (signature === lastSignature && document.getElementById('pbIntelligence') && document.getElementById('pbPotHealthPanel')) return true;
    lastSignature = signature;

    hosts.root.innerHTML = `<div class="pb-intel-grid">
      <article class="pb-intel-card"><small>Manager Check</small><h4>Needs Attention</h4>${attentionRows.length ? `<div class="pb-attention-list">${attentionRows.map(r=>`<div class="pb-attention-row ${r.tone}"><div><b>${esc(r.title)}</b><span>${esc(r.detail)}</span></div><em>${r.tone==='bad'?'ACTION':'CHECK'}</em></div>`).join('')}</div>` : '<div class="pb-intel-empty">No overdue bills or pot-funding problems need attention.</div>'}</article>
      <article class="pb-intel-card"><small>Protected Reserve</small><h4>Holding Pot Cover</h4><div class="pb-cover-grid"><div><small>Current</small><strong>${money(cover.balance)}</strong></div><div><small>Bills Before Payday</small><strong>${money(cover.due)}</strong></div><div><small>Next Top-Up</small><strong>${money(cover.topup)}</strong></div><div><small>Projected After Bills</small><strong>${cover.after < 0 ? '− ' : ''}${money(Math.abs(cover.after))}</strong></div></div><div class="pb-cover-note">${cover.after >= 0 ? `${money(cover.after)} remains protected after the next scheduled Holding Pot commitments.` : `${money(Math.abs(cover.after))} additional cover would be needed for the current forecast.`}</div></article>
      <article class="pb-intel-card" style="grid-column:1/-1"><small>Next Payday</small><h4>Pot Moves</h4>${moves.length ? `<div class="pb-move-list">${moves.slice(0,6).map(r=>`<div class="pb-move-row"><div><b>Move ${money(r.amount)} → ${esc(r.name)}</b><span>${r.holding ? 'Holding Pot protection' : r.required > .009 ? 'Required / scheduled funding' : 'Extra-wage routing'}</span></div><strong>${money(r.amount)}</strong></div>`).join('')}</div>` : '<div class="pb-intel-empty">No pot moves are required by the current payday plan.</div>'}<a class="pb-intel-link" href="#paydayPanel">Open Payday Operations →</a></article>
    </div>`;

    hosts.health.innerHTML = `<div class="pb-health-head"><div><small>Funding Pace</small><h4>Pot Health</h4></div><p>Quick status only. Full pot controls stay tucked underneath and only need opening when you want to edit something.</p></div>${healthRows.length ? `<div class="pb-health-list">${healthRows.map(({p,h})=>`<div class="pb-health-row ${h.tone}"><div><b>${esc(p?.name || 'Pot')}</b><span>${esc(h.detail)}</span></div><em>${esc(h.label)}</em></div>`).join('')}</div>` : '<div class="pb-intel-empty">No active goal pots to assess.</div>'}`;
    return true;
  }

  function start() {
    installStyle();
    let tries = 0;
    const wait = () => {
      const ready = render();
      if (!ready && ++tries < 600) { setTimeout(wait,25); return; }
      window.addEventListener('aurora2:state',()=>setTimeout(render,30));
      window.addEventListener('storage',e=>{if(e.key===STATE_KEY)setTimeout(render,30)});
      window.addEventListener('focus',()=>setTimeout(render,40));
      window.addEventListener('aurora:finance-workspace',()=>setTimeout(render,40));
      setInterval(render,1500);
    };
    wait();
  }

  window.AuroraFinancePotsBillsIntelligence = Object.freeze({build:BUILD,render});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
