(() => {
  'use strict';

  const BUILD = '20260823-finance-pots-bills-compact-1';
  const STATE_KEY = 'aurora2:state:v1';
  let ready = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = value => new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value) || 0);
  const num = value => { const n = Number(value); return Number.isFinite(n) ? Math.max(0,n) : 0; };
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function state() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read() || {};
      return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
    } catch (_) { return {}; }
  }

  function activePots(s) {
    return Array.isArray(s?.finance?.pots) ? s.finance.pots.filter(p => !p.archived) : [];
  }

  function installStyles() {
    if (document.getElementById('financePotsBillsCompactStyle')) return;
    const style = document.createElement('style');
    style.id = 'financePotsBillsCompactStyle';
    style.textContent = `
      .pb-compact-insights{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 12px}
      .pb-compact-insight{border:1px solid rgba(110,231,255,.12);border-radius:15px;padding:14px;background:linear-gradient(145deg,rgba(8,24,39,.9),rgba(4,13,24,.9))}
      .pb-compact-insight small{display:block;color:#728a9e;font:800 8px/1.2 system-ui;text-transform:uppercase;letter-spacing:.08em}
      .pb-compact-insight strong{display:block;margin-top:7px;color:#edf8ff;font:900 18px/1.1 system-ui;overflow-wrap:anywhere}
      .pb-compact-insight span{display:block;margin-top:5px;color:#788fa2;font:650 9px/1.35 system-ui}
      .pb-collapse{margin-top:12px;border:1px solid rgba(110,231,255,.12);border-radius:16px;background:rgba(4,15,27,.58);overflow:hidden}
      .pb-collapse-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;border:0;background:transparent;color:#e8f7ff;padding:15px 16px;text-align:left;cursor:pointer}
      .pb-collapse-toggle>span strong{display:block;font:900 13px/1.15 system-ui}.pb-collapse-toggle>span small{display:block;margin-top:5px;color:#7c94a7;font:650 9px/1.3 system-ui}
      .pb-collapse-toggle>b{width:28px;height:28px;display:grid;place-items:center;border:1px solid rgba(110,231,255,.16);border-radius:9px;color:#9ceeff;background:rgba(110,231,255,.05);font:900 16px/1 system-ui}
      .pb-collapse.open .pb-collapse-toggle>b{transform:rotate(45deg)}
      .pb-collapse-body{padding:0 14px 14px}.pb-collapse:not(.open) .pb-collapse-body{display:none!important}
      .pb-monthly-collapsed-note{padding:16px;border:1px dashed rgba(110,231,255,.13);border-radius:13px;color:#7890a3;text-align:center;font:650 9px/1.45 system-ui;background:rgba(4,15,27,.35)}
      .pb-bills-priority-note{margin:0 0 10px;padding:11px 13px;border:1px solid rgba(255,213,107,.15);border-radius:12px;background:rgba(255,213,107,.04);color:#c8b678;font:650 9px/1.45 system-ui}
      #pbBillsMount>.finance-panel{margin-top:0!important}
      @media(max-width:920px){.pb-compact-insights{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.pb-compact-insights{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensurePotCompact() {
    const mount = q('#pbPotsMount');
    const list = q('#financePotActionList');
    if (!mount || !list) return false;

    if (!q('#pbPotInsights', mount)) {
      const insights = document.createElement('div');
      insights.id = 'pbPotInsights';
      insights.className = 'pb-compact-insights';
      mount.insertBefore(insights, mount.firstChild);
    }

    if (!q('#pbManagePotsCollapse', mount)) {
      const wrap = document.createElement('div');
      wrap.id = 'pbManagePotsCollapse';
      wrap.className = 'pb-collapse';
      wrap.innerHTML = `
        <button type="button" class="pb-collapse-toggle" aria-expanded="false">
          <span><strong>Manage Pots</strong><small>Edit, archive or review every pot only when you need to.</small></span><b>+</b>
        </button>
        <div class="pb-collapse-body"></div>`;
      list.parentElement.insertBefore(wrap, list);
      q('.pb-collapse-body', wrap).appendChild(list);
      q('.pb-collapse-toggle', wrap).addEventListener('click', () => {
        wrap.classList.toggle('open');
        q('.pb-collapse-toggle', wrap).setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false');
      });
    }
    return true;
  }

  function ensureBillsCompact() {
    const mount = q('#pbBillsMount');
    const list = q('#financeBillActionList');
    if (!mount || !list) return false;

    const oldHead = qa('.pb-ledger-head', mount).find(node => node.nextElementSibling === list || node.parentElement === mount);
    if (oldHead) oldHead.style.display = 'none';

    if (!q('#pbBillsPriorityNote', mount)) {
      const note = document.createElement('div');
      note.id = 'pbBillsPriorityNote';
      note.className = 'pb-bills-priority-note';
      note.textContent = 'Manage Bills now focuses on commitments due before the next payday. The complete monthly ledger is kept below only when you choose to open it.';
      mount.insertBefore(note, mount.firstChild);
    }

    if (!q('#pbAllBillsCollapse', mount)) {
      const wrap = document.createElement('div');
      wrap.id = 'pbAllBillsCollapse';
      wrap.className = 'pb-collapse';
      wrap.innerHTML = `
        <button type="button" class="pb-collapse-toggle" aria-expanded="false">
          <span><strong>View All Monthly Bills</strong><small>Monthly groups, future bills and full management controls.</small></span><b>+</b>
        </button>
        <div class="pb-collapse-body"><div class="pb-monthly-collapsed-note">Monthly ledger is hidden while you focus on the next payday.</div></div>`;
      list.parentElement.insertBefore(wrap, list);
      q('.pb-collapse-body', wrap).appendChild(list);
      q('.pb-collapse-toggle', wrap).addEventListener('click', () => {
        wrap.classList.toggle('open');
        q('.pb-collapse-toggle', wrap).setAttribute('aria-expanded', wrap.classList.contains('open') ? 'true' : 'false');
      });
    }
    return true;
  }

  function renderPotInsights() {
    const host = q('#pbPotInsights');
    if (!host) return;
    const s = state();
    const pots = activePots(s);
    const holding = pots.find(p => norm(p?.name) === 'holding pot');
    const totalBalance = pots.reduce((sum,p) => sum + num(p.balance), 0);
    const totalTarget = pots.reduce((sum,p) => sum + num(p.target), 0);
    const totalFunding = pots.reduce((sum,p) => sum + num(p.fundingRequired || p.fundingOverride || p.fundingPerPayday), 0);
    const gaps = pots.map(p => ({ p, gap:Math.max(0,num(p.target)-num(p.balance)) })).sort((a,b)=>b.gap-a.gap);
    const biggest = gaps[0];

    host.innerHTML = `
      <div class="pb-compact-insight"><small>Active Pots</small><strong>${pots.length}</strong><span>${money(totalBalance)} currently held</span></div>
      <div class="pb-compact-insight"><small>Combined Target</small><strong>${money(totalTarget)}</strong><span>${money(Math.max(0,totalTarget-totalBalance))} total gap</span></div>
      <div class="pb-compact-insight"><small>Next Payday Funding</small><strong>${money(totalFunding)}</strong><span>Protected before release</span></div>
      <div class="pb-compact-insight"><small>${holding?'Holding Pot':'Largest Gap'}</small><strong>${holding?money(holding.balance):biggest?.p?.name || '—'}</strong><span>${holding?'Protected reserve':biggest?`${money(biggest.gap)} still required`:'No active target gap'}</span></div>`;
  }

  function compact() {
    installStyles();
    const potsReady = ensurePotCompact();
    const billsReady = ensureBillsCompact();
    if (!potsReady || !billsReady) return false;
    renderPotInsights();
    ready = true;
    window.AuroraFinancePotsBillsCompact = Object.freeze({ build:BUILD, ready:true, billsDefault:'next-payday-only', potsManagerCollapsed:true });
    return true;
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (compact()) {
        window.addEventListener('aurora2:state', () => setTimeout(renderPotInsights,0));
        window.addEventListener('aurora:finance-workspace', () => setTimeout(compact,0));
        return;
      }
      if (++tries < 600) setTimeout(wait,25);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
