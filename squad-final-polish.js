(() => {
  'use strict';

  const BUILD = '20260823-squad-former-player-reentry-2';
  const STATE_KEYS = ['aurora2:state:v1', 'aurora2:state:backup:lastgood'];
  const CLOSED = new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  const VERIFIED_EXIT_HISTORY = Object.freeze({
    IITU:Object.freeze({date:'2026-08-05',shares:64.18067352,book:1870.61,proceeds:2451.06,realised:580.45,exitPrice:38.19,account:'Trading 212 ISA',reason:'Verified AuroraData sale record'}),
    VWRA:Object.freeze({date:'2026-08-05',shares:40.42249269,book:5274.69,proceeds:5804.81,realised:530.12,exitPrice:143.82,account:'Trading 212 ISA',reason:'Verified AuroraData sale record'}),
    LGEN:Object.freeze({date:'2026-07-03',shares:8102,book:19706.12,proceeds:23715.97,realised:4009.85,exitPrice:2.92736,account:'IG ISA',reason:'Exited for house funding'}),
    SDLF:Object.freeze({date:'2026-07-03',shares:1692,book:11111.08,proceeds:14413.47,realised:3302.39,exitPrice:8.5186,account:'IG ISA',reason:'Exited for house funding'}),
    MNG:Object.freeze({date:'2026-06-29',shares:5737,book:13258.48,proceeds:19160.31,realised:5901.83,exitPrice:3.34004,account:'IG ISA',reason:'Exited for house project funding'})
  });
  const VERIFIED_REENTRY_SCOUT = Object.freeze({
    IITU:Object.freeze({ticker:'IITU',scoutStatus:'SCOUT',watchlistStatus:'SCOUT',buyStrength:35,livePrice:37.52,valuationStatus:'Overvalued',notes:'Former holding auto re-scout — current re-entry evidence is too weak for the income strategy. Keep out of Transfer.',lastUpdated:'2026-08-23'}),
    VWRA:Object.freeze({ticker:'VWRA',scoutStatus:'SCOUT',watchlistStatus:'SCOUT',buyStrength:34,livePrice:143.0095568,valuationStatus:'Overvalued',notes:'Former holding auto re-scout — current re-entry evidence is too weak for the income strategy. Keep out of Transfer.',lastUpdated:'2026-08-23'})
  });

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
  function displayDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Date not recorded';
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return raw;
    return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(time));
  }
  function verifiedExit(row) { return VERIFIED_EXIT_HISTORY[ticker(row?.ticker)] || null; }
  function historicalNumber(row, keys, fallbackValue=null) {
    const stored=firstNumber(row,keys);
    if (stored !== null && stored !== 0) return stored;
    return fallbackValue ?? stored;
  }

  function scoutingRows() {
    const s=stateCache?.scouting || {};
    return [
      ...arr(s.targets),
      ...arr(s.shortlist),
      ...arr(s.activeBench),
      ...arr(s.players),
      ...arr(s.watchlist),
      ...arr(s.returnedWatchlist)
    ];
  }
  function currentScout(tk) {
    const target=ticker(tk);
    const live=scoutingRows().find(row=>ticker(row?.ticker || row?.symbol || row?.securityId)===target) || null;
    if (live) {
      const livePrice=firstNumber(live,['livePriceGbp','livePrice','live_price_gbp','live_price','priceGbp','price']);
      const hasUsefulPrice=livePrice !== null && livePrice > 0;
      const text=`${firstText(live,['status','scoutStatus','scout_status'])} ${firstText(live,['managerNote','manager_note','notes','note'])}`;
      if (hasUsefulPrice || /PASS|APPROVED|READY|BUY|ACCUMULATE|BLOCK|REJECT|NO BUY|TOO WEAK|OVERVALUED/i.test(text)) return live;
    }
    return VERIFIED_REENTRY_SCOUT[target] || null;
  }
  function reentrySignal(row) {
    const tk=ticker(row?.ticker);
    const scout=currentScout(tk);
    if (!scout) return {label:'NO CURRENT SCOUT',tone:'',note:'No fresh Scouting evidence is currently attached to this former holding.',price:null,fair:null,gap:null};

    const priceRaw=firstNumber(scout,['livePriceGbp','livePrice','live_price_gbp','live_price','priceGbp','price']);
    const fairRaw=firstNumber(scout,['fairValueGbp','fairValue','fair_value_gbp','fair_value']);
    const price=priceRaw !== null && priceRaw > 0 ? priceRaw : null;
    const fair=fairRaw !== null && fairRaw > 0 ? fairRaw : null;
    const score=firstNumber(scout,['buyStrength','buy_strength','sustainableScore','score','confidence','scoutRating']);
    const status=upper(firstText(scout,['status','scoutStatus','scout_status','watchlistStatus','watchlist_status','eligibility','recommendation']));
    const valuation=upper(firstText(scout,['valuationStatus','valuation_status']));
    const notes=upper(firstText(scout,['managerNote','manager_note','notes','note']));
    const blocked=/BLOCK|REJECT|KEEP OUT|TOO WEAK|NO BUY/.test(`${status} ${notes}`);
    const eligible=scout?.eligibleForTransfer===true || /PASS|APPROVED|READY|ACCUMULATE|BUY/.test(status);
    const gap=price!==null && fair!==null ? (price/fair-1)*100 : null;

    if (blocked) return {label:'WATCH / NOT YET',tone:'bad',note:'Current Scouting evidence is still too weak for re-entry.',price,fair,gap};
    if (eligible && (gap===null || gap<=5) && (score===null || score>=60)) return {label:'GOOD RE-ENTRY',tone:'good',note:'Current Scouting evidence supports a fresh re-entry review.',price,fair,gap};
    if (gap!==null && Math.abs(gap)<=5) return {label:'CLOSE TO FAIR VALUE',tone:'good',note:'Current price is within roughly 5% of Scouting fair value.',price,fair,gap};
    if (gap!==null && gap>5) return {label:'ABOVE FAIR VALUE',tone:'bad',note:'Current price remains above Scouting fair value.',price,fair,gap};
    if (/OVERVALUED/.test(valuation)) return {label:'WATCH / NOT YET',tone:'bad',note:'Scouting still considers the current valuation expensive.',price,fair,gap};
    return {label:'WATCH',tone:'',note:'Scouting is monitoring the former holding, but there is no strong re-entry signal yet.',price,fair,gap};
  }

  function activeRows() { return arr(stateCache?.squad?.holdings).filter(activeHolding); }
  function formerRows() { return arr(stateCache?.squad?.holdings).filter(formerHolding); }
  function lockedRows() { return activeRows().filter(row => !!row?.locked || upper(row?.status) === 'LOCKED'); }

  function lockedTickerInfo(tk) {
    const rows = activeRows().filter(row => ticker(row?.ticker) === ticker(tk));
    const locked = rows.some(row => !!row?.locked || upper(row?.status) === 'LOCKED');
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
      <article class="squad-status-tile former"><small>👋 Former Players</small><strong id="statusFormer">0</strong><span>archived account records</span></article>`;
    register.parentNode.insertBefore(rail,register);
    return rail;
  }

  function renderStatusRail() {
    if (!ensureStatusRail()) return;
    const active = activeRows();
    const players = new Set(active.map(row=>ticker(row?.ticker)).filter(Boolean));
    const protectedPlayers = new Set(lockedRows().map(row=>ticker(row?.ticker)).filter(Boolean));
    const former = formerRows();
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
        <div><span class="squad-kicker">Club History • Read Only</span><h2>Former Players</h2><p>Sold, exited, closed and archived Squad records stay visible here as club history. Current Scouting evidence is also shown so former players can be reconsidered without changing the canonical Squad.</p></div>
        <span class="authority-chip" id="formerPlayerCount">0 records</span>
      </div>
      <div class="filters"><input class="squad-history-search" id="formerPlayerSearch" placeholder="Search former ticker, company or broker"></div>
      <div class="squad-history-grid" id="formerPlayerGrid"></div>
      <div class="squad-history-note">Historical figures use stored Squad exit fields first. Re-entry status uses live browser Scouting evidence where available, with verified AuroraScout snapshots for legacy former holdings when needed. Missing valuation is never invented.</div>`;
    register.insertAdjacentElement('afterend',section);
    section.querySelector('#formerPlayerSearch')?.addEventListener('input',renderFormerPlayers);
    return section;
  }

  function renderFormerPlayers() {
    if (!ensureFormerSection()) return;
    const host = document.getElementById('formerPlayerGrid');
    const count = document.getElementById('formerPlayerCount');
    if (!host || !count) return;
    const q = String(document.getElementById('formerPlayerSearch')?.value || '').trim().toLowerCase();
    const rows = formerRows()
      .filter(row => !q || `${row?.ticker||''} ${row?.name||''} ${accountLabel(row?.account)} ${row?.sector||''}`.toLowerCase().includes(q))
      .sort((a,b) => {
        const ah=verifiedExit(a), bh=verifiedExit(b);
        const ad=Date.parse(firstText(a,['soldAt','closedAt','archivedAt','date','tradeDate'],ah?.date || firstText(a,['updatedAt'])))||0;
        const bd=Date.parse(firstText(b,['soldAt','closedAt','archivedAt','date','tradeDate'],bh?.date || firstText(b,['updatedAt'])))||0;
        return bd-ad || ticker(a?.ticker).localeCompare(ticker(b?.ticker));
      });
    count.textContent = `${rows.length} record${rows.length===1?'':'s'}`;
    if (!rows.length) {
      host.innerHTML = `<div class="squad-empty">${q?'No former players match this search.':'No archived Squad records are stored yet.'}</div>`;
      return;
    }
    host.innerHTML = rows.map(row => {
      const m=holdingMetrics(row);
      const history=verifiedExit(row);
      const status=upper(row?.status || 'ARCHIVED');
      const dateRaw=firstText(row,['soldAt','closedAt','archivedAt','date','tradeDate']) || history?.date || firstText(row,['updatedAt']);
      const when=displayDate(dateRaw);
      const historicalShares=historicalNumber(row,['lastShares','sharesBeforeSale','previousShares','shares'],history?.shares ?? null);
      const book=historicalNumber(row,['exitBookCostGbp','bookCostAtExitGbp','previousBookCostGbp','bookCostGbp','book_cost_gbp','costBasisGbp'],m.book>0?m.book:(history?.book ?? null));
      const proceeds=historicalNumber(row,['saleProceedsGbp','actualProceedsGbp','exitValueGbp','lastValueGbp','proceedsGbp'],m.value>0?m.value:(history?.proceeds ?? null));
      const realised=historicalNumber(row,['realisedProfitGbp','realizedProfitGbp','realisedPnlGbp','realizedPnlGbp','profitLossGbp','profit_loss_gbp'],history?.realised ?? null);
      const exitPrice=historicalNumber(row,['executionPriceGbp','exitPriceGbp','salePriceGbp','lastPriceGbp'],history?.exitPrice ?? null);
      const annualIncome=historicalNumber(row,['annualIncomeAtExitGbp','annualIncomeLostGbp','annualIncomeGbp','annual_income_gbp','annualIncome'],m.income>0?m.income:null);
      const account=accountCode(row?.account)==='CHECK' && history?.account ? history.account : accountLabel(row?.account);
      const note=firstText(row,['exitReason','saleReason','reason','note','notes']) || history?.reason || '';
      const pnlClass=realised===null?'':(realised>=0?'good':'bad');
      const reentry=reentrySignal(row);
      const priceMeta=reentry.price!==null ? `Current ${money(reentry.price)}` : 'Current price unavailable';
      const fairMeta=reentry.fair!==null ? `Fair value ${money(reentry.fair)}` : 'Fair value not supplied';
      const gapMeta=reentry.gap!==null ? ` • ${reentry.gap>=0?'+':''}${reentry.gap.toFixed(1)}% vs fair value` : '';
      return `<article class="squad-former-card">
        <div class="squad-former-head"><div><strong>${esc(ticker(row?.ticker))} — ${esc(row?.name || ticker(row?.ticker))}</strong><span>${esc(account)} • ${esc(when)}</span></div><b class="squad-former-status">${esc(status)}</b></div>
        <div class="squad-former-metrics">
          <div><small>Shares exited</small><b>${historicalShares===null?'—':historicalShares.toLocaleString('en-GB',{maximumFractionDigits:8})}</b></div>
          <div><small>Book cost</small><b>${book===null?'—':money(book)}</b></div>
          <div><small>Exit proceeds</small><b>${proceeds===null?'—':money(proceeds)}</b></div>
          <div><small>Realised P/L</small><b class="${pnlClass}">${realised===null?'—':`${realised>=0?'+':''}${money(realised)}`}</b></div>
          <div><small>Exit price</small><b>${exitPrice===null?'—':money(exitPrice)}</b></div>
          <div><small>Annual income at exit</small><b>${annualIncome===null?'—':money(annualIncome)}</b></div>
        </div>
        <div class="squad-history-note"><b class="${reentry.tone}">RE-ENTRY • ${esc(reentry.label)}</b><br>${esc(reentry.note)}<br><span>${esc(priceMeta)} • ${esc(fairMeta)}${esc(gapMeta)}</span></div>
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

  function boot(){bind();render();setTimeout(render,120);setTimeout(render,500);}
  window.AuroraSquadFinalPolish={build:BUILD,render,readOnly:true};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();