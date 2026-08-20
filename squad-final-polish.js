(() => {
  'use strict';

  const BUILD = '20260820-squad-final-polish-2';
  const HISTORY_SCRIPT = 'squad-former-players-data.js?v=20260820-squad-former-history-1';
  const STATE_KEYS = ['aurora2:state:v1', 'aurora2:state:backup:lastgood'];
  const CLOSED = new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const maybeNum = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const upper = value => String(value || '').trim().toUpperCase();
  const ticker = value => upper(value).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(value));

  let stateCache = {};
  let renderTimer = 0;

  function readState() {
    for (const key of STATE_KEYS) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return {};
  }

  function accountCode(value) {
    const lower = String(value || '').toLowerCase();
    if (lower.includes('212')) return 'T212';
    if (/\big\b/.test(lower) || lower.includes('ig isa')) return 'IG';
    const raw = upper(value);
    return raw === 'IG' || raw === 'T212' ? raw : 'CHECK';
  }
  function accountLabel(value) {
    const code = accountCode(value);
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212 ISA' : 'Account Review';
  }
  function activeHolding(row) {
    const status = upper(row?.status || 'ACTIVE');
    return !CLOSED.has(status) && num(row?.shares) > 0;
  }
  function formerHolding(row) {
    return !!ticker(row?.ticker) && (CLOSED.has(upper(row?.status)) || row?.archived === true || row?.closed === true);
  }
  function holdingMetrics(row) {
    const shares = Math.max(0,num(row?.shares));
    const book = Math.max(0,num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp));
    const price = Math.max(0,num(row?.livePriceGbp ?? row?.priceGbp ?? row?.live_price_gbp));
    const directValue = Math.max(0,num(row?.marketValueGbp ?? row?.currentValueGbp ?? row?.market_value_gbp));
    const value = shares > 0 && price > 0 ? shares * price : directValue;
    const dps = Math.max(0,num(row?.annualDpsGbp ?? row?.annualDps ?? row?.annual_dps_gbp));
    const directIncome = Math.max(0,num(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? row?.annualIncome));
    const income = shares > 0 && dps > 0 ? shares * dps : directIncome;
    return {shares,book,price,value,dps,income};
  }
  function firstText(row, keys, fallback='') {
    for (const key of keys) {
      const value = String(row?.[key] ?? '').trim();
      if (value) return value;
    }
    return fallback;
  }
  function firstNumber(row, keys) {
    for (const key of keys) {
      const value = maybeNum(row?.[key]);
      if (value !== null) return value;
    }
    return null;
  }
  function firstPositiveNumber(row, keys) {
    for (const key of keys) {
      const value = maybeNum(row?.[key]);
      if (value !== null && value > 0) return value;
    }
    return null;
  }
  function displayDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Date not recorded';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return `${String(dmy[1]).padStart(2,'0')}/${String(dmy[2]).padStart(2,'0')}/${dmy[3]}`;
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return raw;
    return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(time));
  }
  function optionalMoney(value) {
    const parsed = maybeNum(value);
    return parsed === null ? '—' : money(parsed);
  }
  function optionalShares(value) {
    const parsed = maybeNum(value);
    return parsed === null ? '—' : parsed.toLocaleString('en-GB',{maximumFractionDigits:8});
  }

  function activeRows() { return arr(stateCache?.squad?.holdings).filter(activeHolding); }
  function localFormerRows() { return arr(stateCache?.squad?.holdings).filter(formerHolding); }
  function lockedRows() { return activeRows().filter(row => !!row?.locked || upper(row?.status) === 'LOCKED'); }

  function localFormerRecord(row) {
    const m = holdingMetrics(row);
    const priceValue = firstPositiveNumber(row,['executionPrice','salePrice','soldPrice','exitPrice','livePriceGbp','priceGbp']);
    const unit = upper(firstText(row,['executionPriceUnit','priceUnit','salePriceUnit']));
    const priceDisplay = firstText(row,['executionPriceDisplay','salePriceDisplay']) || (priceValue === null ? '' : unit === 'PENCE' ? `${priceValue}p` : money(priceValue));
    return {
      ticker:ticker(row?.ticker),
      name:row?.name || ticker(row?.ticker),
      account:accountLabel(row?.account),
      status:upper(row?.status || 'SOLD'),
      soldAt:firstText(row,['soldAt','executedAt','closedAt','archivedAt','updatedAt','date','tradeDate']),
      sharesSold:firstPositiveNumber(row,['sharesSold','soldShares','lastShares','sharesBeforeSale','previousShares']) ?? (m.shares > 0 ? m.shares : null),
      executionPriceDisplay:priceDisplay,
      netProceedsGbp:firstPositiveNumber(row,['actualProceedsGbp','netProceedsGbp','saleProceedsGbp','proceedsGbp']),
      bookCostGbp:firstPositiveNumber(row,['originalBookCostGbp','bookCostBeforeSaleGbp','bookCostGbp','book_cost_gbp','costBasisGbp']) ?? (m.book > 0 ? m.book : null),
      realisedProfitGbp:firstNumber(row,['realisedProfitGbp','realizedProfitGbp','realisedPnlGbp','realizedPnlGbp']),
      feesGbp:firstNumber(row,['feesGbp','fees','saleFeesGbp']),
      sector:row?.sector || '',
      ticketId:firstText(row,['ticketId','ticket_id']),
      transactionId:firstText(row,['transactionId','transaction_id']),
      source:firstText(row,['source'],'Canonical Squad history'),
      note:firstText(row,['exitReason','saleReason','reason','managerNote','manager_note','note','notes'])
    };
  }
  function meaningful(value) {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    return true;
  }
  function mergeRecord(base, next) {
    const out = {...(base || {})};
    Object.entries(next || {}).forEach(([key,value]) => {
      if (!meaningful(value)) return;
      if (typeof value === 'number' && value === 0 && meaningful(out[key]) && out[key] !== 0) return;
      out[key] = value;
    });
    return out;
  }
  function historyRows() {
    const external = arr(window.AuroraSquadFormerPlayers?.rows?.());
    const local = localFormerRows().map(localFormerRecord);
    const map = new Map();
    [...external,...local].forEach(row => {
      const tk = ticker(row?.ticker);
      if (!tk) return;
      const acct = accountLabel(row?.account);
      const key = `${tk}|${acct}`;
      map.set(key,mergeRecord(map.get(key),{...row,ticker:tk,account:acct,status:upper(row?.status || 'SOLD')}));
    });
    return [...map.values()].sort((a,b) => String(b.soldAt || '').localeCompare(String(a.soldAt || '')) || a.ticker.localeCompare(b.ticker));
  }

  function lockedTickerInfo(tk) {
    const rows = activeRows().filter(row => ticker(row?.ticker) === ticker(tk));
    const locked = rows.some(row => !!row?.locked || upper(row?.status)==='LOCKED');
    const reason = rows.map(row => firstText(row,['lockReason','lock_reason','restrictionNote','restriction_note'])).find(Boolean) || 'Protected from normal Transfer activity.';
    return {locked,reason};
  }

  function multiBrokerRows() {
    const map = new Map();
    activeRows().forEach(row => {
      const tk = ticker(row?.ticker);
      if (!tk) return;
      if (!map.has(tk)) map.set(tk,new Set());
      map.get(tk).add(accountLabel(row?.account));
    });
    return [...map.entries()]
      .filter(([,accounts]) => accounts.size > 1)
      .map(([tk,accounts]) => ({ticker:tk,accounts:[...accounts]}))
      .sort((a,b)=>a.ticker.localeCompare(b.ticker));
  }

  function ensureStatusRail() {
    let rail = document.getElementById('squadStatusRail');
    if (rail) return rail;
    const register = document.querySelector('.register-card');
    if (!register) return null;
    rail = document.createElement('section');
    rail.id = 'squadStatusRail';
    rail.className = 'squad-status-rail';
    rail.innerHTML = `
      <article class="squad-status-tile"><small>⚽ First Team</small><strong id="statusFirstTeam">0</strong><span id="statusFirstTeamMeta">canonical players</span></article>
      <article class="squad-status-tile protected"><small>🔒 Protected</small><strong id="statusProtected">0</strong><span>locked / protected players</span></article>
      <article class="squad-status-tile former"><small>👋 Former Players</small><strong id="statusFormer">0</strong><span>Aurora sale history</span></article>`;
    register.parentNode.insertBefore(rail,register);
    return rail;
  }

  function renderStatusRail() {
    if (!ensureStatusRail()) return;
    const active = activeRows();
    const players = new Set(active.map(row=>ticker(row?.ticker)).filter(Boolean));
    const protectedPlayers = new Set(lockedRows().map(row=>ticker(row?.ticker)).filter(Boolean));
    const former = historyRows();
    const set = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    set('statusFirstTeam',String(players.size));
    set('statusFirstTeamMeta',`${active.length} account position${active.length===1?'':'s'}`);
    set('statusProtected',String(protectedPlayers.size));
    set('statusFormer',String(former.length));
  }

  function ensureFormerSection() {
    let section = document.getElementById('formerPlayers');
    if (section) return section;
    const register = document.querySelector('.register-card');
    if (!register) return null;
    section = document.createElement('section');
    section.className = 'squad-card squad-history-card';
    section.id = 'formerPlayers';
    section.innerHTML = `
      <div class="squad-head">
        <div><span class="squad-kicker">Club History • AuroraData Read Only</span><h2>Former Players</h2><p>Executed and historical Squad exits stay visible here as club history. Sale history is kept separate from the active canonical first team and cannot change a holding.</p></div>
        <span class="authority-chip" id="formerPlayerCount">0 records</span>
      </div>
      <div class="filters"><input class="squad-history-search" id="formerPlayerSearch" placeholder="Search former ticker, company or broker"></div>
      <div class="squad-history-grid" id="formerPlayerGrid"></div>
      <div class="squad-history-note" id="formerPlayerSource">Loading Aurora sale history…</div>`;
    register.insertAdjacentElement('afterend',section);
    section.querySelector('#formerPlayerSearch')?.addEventListener('input',renderFormerPlayers);
    return section;
  }

  function renderFormerPlayers() {
    if (!ensureFormerSection()) return;
    const host = document.getElementById('formerPlayerGrid');
    const count = document.getElementById('formerPlayerCount');
    const source = document.getElementById('formerPlayerSource');
    if (!host || !count) return;
    const q = String(document.getElementById('formerPlayerSearch')?.value || '').trim().toLowerCase();
    const rows = historyRows()
      .filter(row => !q || `${row?.ticker||''} ${row?.name||''} ${row?.account||''} ${row?.sector||''}`.toLowerCase().includes(q));
    count.textContent = `${rows.length} record${rows.length===1?'':'s'}`;
    const historyStatus = window.AuroraSquadFormerPlayers?.status?.();
    if (source) {
      source.textContent = historyStatus?.source
        ? `Source: ${historyStatus.source}. Read-only history only — active Squad holdings are untouched.`
        : 'Source: canonical archived Squad rows. Read-only history only — active Squad holdings are untouched.';
    }
    if (!rows.length) {
      host.innerHTML = `<div class="squad-empty">${q?'No former players match this search.':'No sold or archived history is available yet.'}</div>`;
      return;
    }
    host.innerHTML = rows.map(row => {
      const status=upper(row?.status || 'SOLD');
      const when=displayDate(row?.soldAt);
      const profit=maybeNum(row?.realisedProfitGbp);
      const details=[];
      if (maybeNum(row?.bookCostGbp) !== null) details.push(`Original book ${optionalMoney(row.bookCostGbp)}`);
      if (maybeNum(row?.feesGbp) !== null) details.push(`Fees ${optionalMoney(row.feesGbp)}`);
      if (row?.ticketId) details.push(`Ticket ${row.ticketId}`);
      if (row?.transactionId) details.push(`Transaction ${row.transactionId}`);
      if (row?.orderId) details.push(`Order ${row.orderId}`);
      if (row?.source) details.push(row.source);
      const note = String(row?.note || '').trim();
      return `<article class="squad-former-card">
        <div class="squad-former-head"><div><strong>${esc(ticker(row?.ticker))} — ${esc(row?.name || ticker(row?.ticker))}</strong><span>${esc(row?.account || 'Account Review')} • Sold ${esc(when)}</span></div><b class="squad-former-status">${esc(status)}</b></div>
        <div class="squad-former-metrics">
          <div><small>Shares sold</small><b>${optionalShares(row?.sharesSold)}</b></div>
          <div><small>Sale price</small><b>${esc(row?.executionPriceDisplay || '—')}</b></div>
          <div><small>Net proceeds</small><b>${optionalMoney(row?.netProceedsGbp)}</b></div>
          <div><small>Realised P/L</small><b class="${profit===null?'':profit>=0?'good':'bad'}">${profit===null?'—':`${profit>=0?'+':''}${money(profit)}`}</b></div>
        </div>
        ${details.length?`<div class="squad-history-note">${esc(details.join(' • '))}</div>`:''}
        ${note?`<div class="squad-history-note">${esc(note)}</div>`:''}
      </article>`;
    }).join('');
  }

  function ensureMultiBrokerCard() {
    const grid = document.querySelector('.health-grid');
    if (!grid) return null;
    const parent = grid.closest('.squad-card');
    if (parent && !parent.id) parent.id='squadDataHealth';
    let card=document.getElementById('healthMultiBroker');
    if (card) return card;
    card=document.createElement('div');
    card.className='health-card multi-broker';
    card.id='healthMultiBroker';
    card.innerHTML='<small>Multi-Broker Players</small><strong id="healthMultiBrokerCount">0</strong><span id="healthMultiBrokerMeta">Checking account separation…</span><em class="squad-integrity-detail" id="healthMultiBrokerDetail"></em>';
    grid.appendChild(card);
    return card;
  }

  function renderMultiBroker() {
    if (!ensureMultiBrokerCard()) return;
    const rows=multiBrokerRows();
    const count=document.getElementById('healthMultiBrokerCount');
    const meta=document.getElementById('healthMultiBrokerMeta');
    const detail=document.getElementById('healthMultiBrokerDetail');
    if (count) count.textContent=String(rows.length);
    if (meta) meta.textContent=rows.length?'One company = one pitch player; broker positions remain separate.':'No ticker currently spans multiple broker accounts.';
    if (detail) detail.textContent=rows.length?rows.slice(0,6).map(row=>`${row.ticker} ×${row.accounts.length} (${row.accounts.join(' + ')})`).join(' • '):'Account-scoped integrity clean.';
  }

  function ensureManagerButton() {
    const box=document.querySelector('.next-action');
    if (!box) return null;
    let button=document.getElementById('squadManagerAction');
    if (!button) {
      button=document.createElement('a');
      button.id='squadManagerAction';
      button.className='squad-manager-action';
      button.href='#';
      button.textContent='Open next step';
      box.appendChild(button);
    }
    return button;
  }

  function renderManagerAction() {
    const action=document.getElementById('nextAction');
    const meta=document.getElementById('nextActionMeta');
    const button=ensureManagerButton();
    const box=document.querySelector('.next-action');
    if (!action || !meta || !button || !box) return;

    const active=activeRows();
    const review=active.filter(row=>accountCode(row?.account)==='CHECK').length;
    const missingSector=active.filter(row=>!String(row?.sector||'').trim()).length;
    const missingIncome=active.filter(row=>num(row?.annualIncomeGbp ?? row?.annual_income_gbp)<=0 && num(row?.annualDpsGbp ?? row?.annualDps)<=0).length;
    const missingBook=active.filter(row=>num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp)<=0).length;
    const missingPrice=active.filter(row=>num(row?.livePriceGbp ?? row?.priceGbp ?? row?.marketValueGbp ?? row?.currentValueGbp)<=0).length;
    const waiting=num(document.getElementById('bridgeWaitingTop')?.textContent);

    box.classList.remove('manager-warn','manager-good');
    if (!active.length) {
      box.classList.add('manager-warn');
      action.textContent='Build the first canonical Squad position';
      meta.textContent='No active account-scoped holding is connected yet.';
      button.textContent='Open Registration Desk';button.href='registration.html';
      return;
    }
    if (review>0) {
      box.classList.add('manager-warn');
      action.textContent='Resolve broker account labels';
      meta.textContent=`${review} active position${review===1?'':'s'} still sit in Account Review.`;
      button.textContent='Open Data Health';button.href='#squadDataHealth';
      return;
    }
    if (waiting>0) {
      box.classList.add('manager-warn');
      action.textContent='Review confirmed trades waiting for Squad';
      meta.textContent=`${waiting} confirmed Registration receipt${waiting===1?'':'s'} ${waiting===1?'is':'are'} waiting for the controlled Squad promotion stage.`;
      button.textContent='Open Registration Bridge';button.href='#registrationBridgeRows';
      return;
    }
    const metadata=missingSector+missingIncome+missingBook+missingPrice;
    if (metadata>0) {
      box.classList.add('manager-warn');
      action.textContent='Complete first-team data health';
      meta.textContent=`${missingSector} sector • ${missingIncome} income • ${missingBook} book cost • ${missingPrice} price/value fields need attention.`;
      button.textContent='Open Data Health';button.href='#squadDataHealth';
      return;
    }
    box.classList.add('manager-good');
    action.textContent='Squad is clean — continue to Income Centre';
    meta.textContent=`${new Set(active.map(row=>ticker(row?.ticker)).filter(Boolean)).size} players • ${active.length} account positions • canonical first team ready.`;
    button.textContent='Open Income Centre';button.href='income.html';
  }

  function decoratePitch() {
    document.querySelectorAll('[data-squad-pitch-player]').forEach(node => {
      const info=lockedTickerInfo(node.dataset.squadPitchPlayer);
      node.classList.toggle('is-locked',info.locked);
      let badge=node.querySelector('.squad-lock-badge');
      if (info.locked && !badge) {
        badge=document.createElement('span');badge.className='squad-lock-badge';badge.textContent='🔒';badge.title=info.reason;node.appendChild(badge);
      } else if (!info.locked && badge) badge.remove();
    });
    document.querySelectorAll('[data-squad-bench-player]').forEach(node => {
      const info=lockedTickerInfo(node.dataset.squadBenchPlayer);
      let badge=node.querySelector('.squad-bench-lock');
      if (info.locked && !badge) {
        badge=document.createElement('span');badge.className='squad-bench-lock';badge.textContent='🔒 PROTECTED';badge.title=info.reason;
        node.querySelector('strong')?.appendChild(badge);
      } else if (!info.locked && badge) badge.remove();
    });
  }

  function decorateDrawer() {
    const drawer=document.getElementById('squadPlayerDrawer');
    if (!drawer?.classList.contains('open')) return;
    const title=document.getElementById('squadDrawerTitle')?.textContent || '';
    const tk=ticker(title.split('—')[0]);
    if (!tk) return;
    const info=lockedTickerInfo(tk);
    const content=document.getElementById('squadDrawerContent');
    const subtitle=document.getElementById('squadDrawerSubtitle');
    if (!content) return;
    let protectedBox=content.querySelector('.squad-drawer-protected');
    if (info.locked) {
      if (subtitle && !subtitle.textContent.includes('🔒')) subtitle.textContent=`🔒 Protected • ${subtitle.textContent}`;
      if (!protectedBox) {
        protectedBox=document.createElement('div');protectedBox.className='squad-drawer-protected';
        const hero=content.querySelector('.squad-drawer-hero');
        if (hero) hero.insertAdjacentElement('afterend',protectedBox); else content.prepend(protectedBox);
      }
      protectedBox.innerHTML=`<b>🔒 Protected holding</b><br>${esc(info.reason)}`;
    } else if (protectedBox) protectedBox.remove();
  }

  function loadHistoryModule() {
    if (window.AuroraSquadFormerPlayers) return Promise.resolve(window.AuroraSquadFormerPlayers);
    const existing=[...document.scripts].find(script => String(script.src || '').includes('squad-former-players-data.js'));
    if (existing) {
      return new Promise(resolve => {
        let tries=0;
        const wait=()=>{
          if (window.AuroraSquadFormerPlayers) return resolve(window.AuroraSquadFormerPlayers);
          tries+=1;
          if (tries>120) return resolve(null);
          setTimeout(wait,25);
        };
        wait();
      });
    }
    return new Promise(resolve => {
      const script=document.createElement('script');
      script.src=HISTORY_SCRIPT;
      script.async=true;
      script.addEventListener('load',()=>resolve(window.AuroraSquadFormerPlayers || null),{once:true});
      script.addEventListener('error',()=>resolve(null),{once:true});
      document.head.appendChild(script);
    });
  }

  function render() {
    stateCache=readState();
    renderStatusRail();
    renderFormerPlayers();
    renderMultiBroker();
    renderManagerAction();
    decoratePitch();
    decorateDrawer();
  }
  function scheduleRender(delay=0) {
    clearTimeout(renderTimer);
    renderTimer=setTimeout(render,delay);
  }

  function bind() {
    document.addEventListener('click',event=>{
      if (event.target.closest('[data-squad-pitch-player],[data-squad-bench-player]')) {
        setTimeout(decorateDrawer,0);setTimeout(decorateDrawer,40);
      }
    });
    window.addEventListener('pageshow',()=>scheduleRender(20));
    window.addEventListener('aurora2:state',()=>scheduleRender(0));
    window.addEventListener('aurora:squad-former-history',()=>scheduleRender(0));
    window.addEventListener('storage',event=>{if(STATE_KEYS.includes(event.key))scheduleRender(20)});

    const pitch=document.getElementById('squadPitchPlayers');
    const bench=document.getElementById('squadPitchBench');
    const drawer=document.getElementById('squadDrawerContent');
    const waiting=document.getElementById('bridgeWaitingTop');
    const observer=new MutationObserver(()=>scheduleRender(15));
    if (pitch) observer.observe(pitch,{childList:true,subtree:true});
    if (bench) observer.observe(bench,{childList:true,subtree:true});
    if (drawer) observer.observe(drawer,{childList:true,subtree:true});
    if (waiting) observer.observe(waiting,{childList:true,subtree:true,characterData:true});
  }

  function boot(){
    bind();
    render();
    loadHistoryModule().then(module => {
      render();
      module?.refresh?.().catch(()=>{});
    });
    setTimeout(render,120);setTimeout(render,500);
  }
  window.AuroraSquadFinalPolish={build:BUILD,render,readOnly:true};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
