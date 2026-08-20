(() => {
  'use strict';

  const BUILD = '20260820-finance-pots-bills-readonly-1';
  const STATE_KEY = 'aurora2:state:v1';
  let ready = false;
  let runtimeErrors = [];

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const num = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function state() {
    try {
      if (window.Aurora2?.core?.read) return window.Aurora2.core.read();
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function today() {
    const d = new Date(); d.setHours(12, 0, 0, 0); return d;
  }
  function humanDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    return d ? d.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric' }) : 'No date';
  }
  function nextPayday(plan) {
    let d = parseDate(plan?.paydayDate);
    if (!d) return null;
    const now = today();
    let guard = 0;
    while (d < now && guard++ < 30) d.setDate(d.getDate() + 28);
    return d;
  }
  function activePots(s) {
    return Array.isArray(s?.finance?.pots) ? s.finance.pots.filter(p => !p.archived) : [];
  }
  function activeBills(s) {
    return Array.isArray(s?.finance?.bills)
      ? s.finance.bills.filter(b => !b.archived && !b.paid && b.included !== false)
      : [];
  }
  function isHoldingPot(p) { return norm(p?.name) === 'holding pot'; }
  function fundedAmount(p) {
    const balance = Math.max(0, num(p?.balance));
    return p?.goalMode === 'funded-progress' ? balance + Math.max(0, num(p?.spent)) : balance;
  }
  function potNextFunding(p) {
    return Math.max(0, num(p?.fundingRequired || p?.fundingOverride || p?.fundingPerPayday));
  }
  function potTone(pct) { return pct >= 99.5 ? 'funded' : pct >= 60 ? 'partial' : 'underfunded'; }
  function potStatus(pct, next) {
    if (pct >= 99.5) return { label:'FUNDED', tone:'positive' };
    if (next > 0) return { label:'FUNDING', tone:'positive' };
    return { label:'NEEDS PLAN', tone:'warn' };
  }

  function installSectionMarkup() {
    const panel = document.getElementById('potsPanel');
    if (!panel || panel.dataset.auroraPotsBillsReadonly === '1') return Boolean(panel);
    panel.dataset.auroraPotsBillsReadonly = '1';
    panel.classList.add('aurora-pots-bills-readonly');
    panel.innerHTML = `
      <section class="finance-scoreboard four">
        <article class="finance-score green"><small>Pot Cash</small><strong id="potBalanceTotal">£0.00</strong><span>Available across active pots</span></article>
        <article class="finance-score cyan"><small>Pot Targets</small><strong id="potTargetTotal">£0.00</strong><span>Combined active targets</span></article>
        <article class="finance-score gold"><small>Funding Gap</small><strong id="potGapTotal">£0.00</strong><span>Remaining target gap</span></article>
        <article class="finance-score release"><small>Next Payday Funding</small><strong id="potFundingTotal">£0.00</strong><span>Automatically protected</span></article>
      </section>

      <section class="finance-command-grid two">
        <article class="finance-panel">
          <div class="finance-panel-head"><div><span class="finance-panel-kicker">Protected Savings</span><h3>Pot Progress</h3></div><span class="finance-panel-note">Live • read only</span></div>
          <div id="financePotProgressDashboard" class="finance-pot-progress-dashboard"></div>
        </article>

        <article class="finance-panel">
          <div class="finance-panel-head"><div><span class="finance-panel-kicker">Commitment Schedule</span><h3>Upcoming Bills</h3></div><span class="finance-panel-note">Next five • read only</span></div>
          <div id="financeBillSummary" class="finance-bill-summary"></div>
          <div id="financeNextFiveBills" class="finance-next-five"></div>
        </article>
      </section>

      <section class="finance-panel" style="margin-top:12px">
        <div class="finance-panel-head"><div><span class="finance-panel-kicker">Controlled Rebuild</span><h3>Pots & Bills live view restored</h3></div><span class="rule-chip">READ ONLY</span></div>
        <p style="margin:12px 0 0;color:#7d9488;font-size:9px;line-height:1.55">These cards read the saved Aurora Finance pots and bills. Add, edit, archive, mark-paid and undo actions remain disconnected until the next controlled step.</p>
      </section>`;
    return true;
  }

  function renderPots(s) {
    const pots = activePots(s).slice().sort((a,b) => {
      if (isHoldingPot(a) !== isHoldingPot(b)) return isHoldingPot(a) ? -1 : 1;
      const pa = num(a.priority) || 2, pb = num(b.priority) || 2;
      return pa !== pb ? pa - pb : String(a.name || '').localeCompare(String(b.name || ''));
    });

    const totalBalance = pots.reduce((sum,p) => sum + Math.max(0,num(p.balance)), 0);
    const totalTarget = pots.reduce((sum,p) => sum + Math.max(0,num(p.target)), 0);
    const totalGap = pots.reduce((sum,p) => sum + Math.max(0, Math.max(0,num(p.target)) - fundedAmount(p)), 0);
    const totalNext = pots.reduce((sum,p) => sum + potNextFunding(p), 0);

    const set = (id, value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    set('potBalanceTotal', money(totalBalance));
    set('potTargetTotal', money(totalTarget));
    set('potGapTotal', money(totalGap));
    set('potFundingTotal', money(totalNext));

    const host = document.getElementById('financePotProgressDashboard');
    if (!host) return;
    if (!pots.length) {
      host.innerHTML = '<div class="finance-notice">No active Finance pots are currently saved.</div>';
      return;
    }

    host.innerHTML = pots.map(p => {
      const holding = isHoldingPot(p);
      const balance = Math.max(0,num(p.balance));
      const target = Math.max(0,num(p.target));
      const funded = fundedAmount(p);
      const gap = Math.max(0,target-funded);
      const pct = target > 0 ? Math.max(0,Math.min(100,(funded/target)*100)) : (balance > 0 ? 100 : 0);
      const next = potNextFunding(p);
      const tone = potTone(pct);
      const status = potStatus(pct,next);
      const deadline = p.deadline ? humanDate(p.deadline) : 'No deadline';
      return `
        <article class="finance-progress-pot ${holding?'holding':''} ${tone}">
          <div class="finance-progress-pot-head"><div><small>${holding?'HOLDING POT • PROTECTED CASH':`P${num(p.priority)||2} • ${esc(deadline)}`}</small><h4>${esc(p.name || 'Untitled pot')}</h4></div></div>
          <div class="finance-progress-amounts"><strong>${money(balance)}</strong><span>${target>0?`${money(target)} target`:'No fixed target'}</span></div>
          <div class="finance-progress-track ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="finance-progress-caption"><b>${Math.round(pct)}% funded</b><span>${target>0?(gap>0?`${money(gap)} remaining`:'Target reached'):'Balance tracked'}</span></div>
          <div class="finance-progress-foot"><div><small>Next payday</small><strong>${money(next)}</strong></div><div><small>Status</small><strong class="${status.tone}">${status.label}</strong></div></div>
        </article>`;
    }).join('');
  }

  function billSortDate(b) {
    const due = parseDate(b.due);
    if (due) return due.getTime();
    const month = String(b.occurrenceMonth || '');
    if (/^\d{4}-\d{2}$/.test(month)) return new Date(`${month}-01T12:00:00`).getTime();
    return Number.MAX_SAFE_INTEGER;
  }
  function dueInfo(b) {
    const now = today();
    const due = parseDate(b.due);
    const rolling = String(b.commitmentType || '') === 'rolling_monthly';
    if (rolling) {
      const current = now.toISOString().slice(0,7);
      const month = String(b.occurrenceMonth || current);
      return { label: month > current ? 'Next month' : 'Due this month', tone:'', date:null };
    }
    if (!due) return { label:'No date', tone:'', date:null };
    const days = Math.round((due.getTime()-now.getTime())/86400000);
    return {
      label: days < 0 ? `Overdue ${Math.abs(days)}d` : days === 0 ? 'Due today' : `Due in ${days}d`,
      tone: days < 0 ? 'overdue' : days <= 7 ? 'soon' : '',
      date: due
    };
  }
  function beforeNextPayday(b, payday) {
    if (!payday) return false;
    const due = parseDate(b.due);
    if (due) return due <= payday;
    const month = String(b.occurrenceMonth || '');
    return /^\d{4}-\d{2}$/.test(month) && month <= payday.toISOString().slice(0,7);
  }

  function renderBills(s) {
    const bills = activeBills(s).slice().sort((a,b) => billSortDate(a)-billSortDate(b) || String(a.name||'').localeCompare(String(b.name||'')));
    const next = bills.slice(0,5);
    const payday = nextPayday(s?.finance?.plan || {});
    const before = bills.filter(b => beforeNextPayday(b,payday));

    const bySource = source => before.filter(b => norm(b.fundingSource || 'Current Account') === norm(source)).reduce((sum,b)=>sum+Math.max(0,num(b.amount)),0);
    const holdingOut = bySource('Holding Pot');
    const currentOut = bySource('Current Account');
    const otherOut = before.filter(b => !['holding pot','current account'].includes(norm(b.fundingSource || 'Current Account'))).reduce((sum,b)=>sum+Math.max(0,num(b.amount)),0);
    const nextFiveTotal = next.reduce((sum,b)=>sum+Math.max(0,num(b.amount)),0);

    const summary = document.getElementById('financeBillSummary');
    if (summary) summary.innerHTML = `
      <div class="finance-bill-stat holding"><small>Holding Pot going out</small><strong>${money(holdingOut)}</strong><span>Known before payday</span></div>
      <div class="finance-bill-stat"><small>Current Account</small><strong>${money(currentOut)}</strong><span>Known before payday</span></div>
      <div class="finance-bill-stat"><small>Other pots</small><strong>${money(otherOut)}</strong><span>Known before payday</span></div>
      <div class="finance-bill-stat next"><small>Next five total</small><strong>${money(nextFiveTotal)}</strong><span>${bills.length} active bill${bills.length===1?'':'s'} overall</span></div>`;

    const host = document.getElementById('financeNextFiveBills');
    if (!host) return;
    if (!next.length) {
      host.innerHTML = '<div class="finance-notice good">No active unpaid bills are currently saved.</div>';
      return;
    }
    host.innerHTML = `
      <div class="finance-next-five-head"><strong>Next commitments</strong><span>${payday?`Payday ${esc(humanDate(payday))}`:'Payday not set'}</span></div>
      ${next.map((b,index) => {
        const due = dueInfo(b);
        return `<div class="finance-next-bill ${due.tone}">
          <i>${String(index+1).padStart(2,'0')}</i>
          <div><strong>${esc(b.name || 'Untitled bill')}</strong><span>${esc(due.label)}${due.date?` • ${esc(humanDate(due.date))}`:''} • ${esc(b.fundingSource || 'Current Account')}</span></div>
          <b>${money(b.amount)}</b>
        </div>`;
      }).join('')}`;
  }

  function render() {
    const s = state();
    if (!s?.finance) return;
    try {
      renderPots(s);
      renderBills(s);
      window.AuroraFinancePotsBillsReadonly = Object.freeze({
        build: BUILD,
        ready: true,
        pots: activePots(s).length,
        bills: activeBills(s).length,
        runtimeErrors: [...runtimeErrors]
      });
    } catch (error) {
      const message = String(error?.message || error || 'Unknown error');
      if (!runtimeErrors.includes(message)) runtimeErrors.push(message);
      console.warn('[Aurora Finance Pots/Bills readonly]', message);
    }
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (installSectionMarkup()) {
        ready = true;
        render();
        window.addEventListener('aurora2:state', render);
        window.addEventListener('pageshow', () => setTimeout(render,0));
        window.addEventListener('focus', () => setTimeout(render,0));
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(render,0); });
        return;
      }
      tries += 1;
      if (tries < 400) setTimeout(wait,25);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot,0), { once:true });
  else setTimeout(boot,0);
})();
