(() => {
  'use strict';

  const BUILD = '20260820-squad-pitch-profiles-1';
  const STATE_KEYS = ['aurora2:state:v1', 'aurora2:state:backup:lastgood'];
  const POSITIONS = [
    ['ST',50,13],
    ['LW',19,29],['RW',81,29],
    ['LCM',27,48],['CM',50,53],['RCM',73,48],
    ['LB',16,71],['LCB',38,78],['RCB',62,78],['RB',84,71],
    ['GK',50,91]
  ];

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
  const money = value => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const upper = value => String(value || '').trim().toUpperCase();
  const ticker = value => upper(value).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');

  let stateCache = {};
  let playersCache = [];
  let drawerTicker = '';
  let drawerOrder = [];

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
    return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(status) && num(row?.shares) > 0;
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
    const avg = shares > 0 && book > 0 ? book / shares : Math.max(0,num(row?.avgCostGbp));
    const profit = value - book;
    return {shares,book,price,value,dps,income,avg,profit};
  }

  function firstText(rows, keys, fallback='') {
    for (const row of rows) for (const key of keys) {
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

  function aggregate(state) {
    const rows = arr(state?.squad?.holdings).filter(activeHolding);
    const map = new Map();
    rows.forEach(row => {
      const tk = ticker(row?.ticker);
      if (!tk) return;
      if (!map.has(tk)) map.set(tk, {ticker:tk,name:row?.name || tk,rows:[],shares:0,value:0,book:0,income:0,accounts:new Set(),locked:false});
      const player = map.get(tk);
      const m = holdingMetrics(row);
      player.rows.push(row);
      player.shares += m.shares;
      player.value += m.value;
      player.book += m.book;
      player.income += m.income;
      player.accounts.add(accountLabel(row?.account));
      player.locked = player.locked || !!row?.locked || upper(row?.status)==='LOCKED';
      if (!player.name || player.name === tk) player.name = row?.name || tk;
    });
    return [...map.values()].map(player => ({
      ...player,
      accounts:[...player.accounts],
      profit:player.value-player.book,
      profitPct:player.book > 0 ? (player.value-player.book)/player.book*100 : 0,
      livePrice:player.shares > 0 ? player.value/player.shares : 0,
      avgCost:player.shares > 0 ? player.book/player.shares : 0,
      annualDps:player.shares > 0 ? player.income/player.shares : 0,
      yieldPct:player.value > 0 ? player.income/player.value*100 : 0,
      sector:firstText(player.rows,['sector','Sector'],'Unclassified'),
      role:firstText(player.rows,['role','Role','squadRole'],'Squad holding')
    })).sort((a,b)=>b.value-a.value || a.ticker.localeCompare(b.ticker));
  }

  function totalValue() { return playersCache.reduce((sum,p)=>sum+p.value,0); }
  function totalIncome() { return playersCache.reduce((sum,p)=>sum+p.income,0); }

  function scoutRow(tk) {
    const candidates = [
      ...arr(stateCache?.scouting?.targets),
      ...arr(stateCache?.scouting?.shortlist),
      ...arr(stateCache?.scouting?.activeBench),
      ...arr(stateCache?.scouting?.players)
    ];
    return candidates.find(row => ticker(row?.ticker || row?.symbol) === tk) || null;
  }
  function routeAllocation(tk) {
    return arr(stateCache?.transfer?.route?.allocations).find(row => ticker(row?.ticker || row?.symbol || row?.securityId) === tk) || null;
  }
  function nextDividend(tk) {
    const candidates = [
      ...arr(stateCache?.income?.calendar),
      ...arr(stateCache?.income?.dividends),
      ...arr(stateCache?.dividends?.calendar),
      ...arr(stateCache?.dividends)
    ];
    const now = Date.now();
    return candidates.map(row => ({row,time:Date.parse(row?.payDate || row?.paymentDate || row?.date || row?.exDate || '')}))
      .filter(item => ticker(item.row?.ticker)===tk && Number.isFinite(item.time) && item.time>=now)
      .sort((a,b)=>a.time-b.time)[0]?.row || null;
  }

  function scoreFor(player) {
    const scout = scoutRow(player.ticker);
    const score = firstNumber(scout,['sustainableScore','score','confidence','maximumScore','auroraScore']);
    return score;
  }
  function profileCall(player) {
    const scout = scoutRow(player.ticker);
    const eligibility = upper(scout?.eligibility || scout?.status || scout?.recommendation);
    if (eligibility.includes('BLOCK')) return 'Safety gate — blocked from new buying';
    if (eligibility.includes('PENDING')) return 'Data pending — keep under review';
    if (player.profit < 0) return 'Below book cost — monitor position';
    if (player.yieldPct >= 8) return 'High-income first-team player';
    if (player.income > 0) return 'Established income contributor';
    return 'Core first-team holding';
  }
  function profileDetail(player) {
    const valueTotal = totalValue(), incomeTotal = totalIncome();
    const vw = valueTotal ? player.value/valueTotal*100 : 0;
    const iw = incomeTotal ? player.income/incomeTotal*100 : 0;
    return `${player.ticker} contributes ${iw.toFixed(1)}% of annual Squad income and ${vw.toFixed(1)}% of total Squad value.`;
  }
  function signMoney(value) { return `${num(value)>=0?'+':''}${money(value)}`; }
  function signPct(value) { return `${num(value)>=0?'+':''}${num(value).toFixed(2)}%`; }
  function bar(label,value) {
    const clamped = Math.max(0,Math.min(100,num(value)));
    return `<div class="squad-drawer-bar"><div class="squad-drawer-bar-head"><span>${esc(label)}</span><b>${Math.round(clamped)}/100</b></div><div class="squad-drawer-bar-track"><i style="width:${clamped}%"></i></div></div>`;
  }

  function renderPitch() {
    const host = document.getElementById('squadPitchPlayers');
    const bench = document.getElementById('squadPitchBench');
    if (!host || !bench) return;
    const starters = playersCache.slice(0,11);
    const subs = playersCache.slice(11);
    drawerOrder = playersCache.map(player=>player.ticker);

    const xiValue = starters.reduce((sum,p)=>sum+p.value,0);
    const xiIncome = starters.reduce((sum,p)=>sum+p.income,0);
    const xiProfit = starters.reduce((sum,p)=>sum+p.profit,0);
    const valueTotal = totalValue();
    const set = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    set('pitchXIValue', money(xiValue));
    set('pitchXIValueMeta', valueTotal>0 ? `${(xiValue/valueTotal*100).toFixed(1)}% of Squad` : '0.0% of Squad');
    set('pitchXIIncome', money(xiIncome));
    set('pitchXIProfit', `${xiProfit>=0?'+':''}${money(xiProfit)}`);
    set('pitchBenchMeta', `${subs.length} PLAYER${subs.length===1?'':'S'}`);

    if (!starters.length) {
      host.innerHTML = '<div class="squad-empty" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:70%;pointer-events:auto">No canonical Squad holdings are connected yet.</div>';
    } else {
      host.innerHTML = starters.map((player,index) => {
        const [slot,left,top] = POSITIONS[index] || ['SUB',50,50];
        const state = player.profit>=0 ? 'profit' : 'loss';
        return `<button type="button" class="squad-pitch-player ${state}${drawerTicker===player.ticker?' selected':''}" style="left:${left}%;top:${top}%" data-squad-pitch-player="${esc(player.ticker)}" title="Open ${esc(player.name)} profile"><b><i>${slot}</i>${esc(player.ticker)}</b><span>${money(player.value)} • ${player.profit>=0?'+':''}${money(player.profit)}</span></button>`;
      }).join('');
    }

    if (!subs.length) {
      bench.innerHTML = '<div class="squad-empty">All available Squad players are in the Value XI.</div>';
    } else {
      bench.innerHTML = subs.map((player,index) => `<article class="squad-bench-card" tabindex="0" role="button" data-squad-bench-player="${esc(player.ticker)}"><strong>${index+12}. ${esc(player.ticker)} — ${esc(player.name)}</strong><span>${esc(player.accounts.join(' + ') || 'Squad')} • ${esc(player.sector)}</span><div class="squad-bench-metrics"><div><small>Value</small><b>${money(player.value)}</b></div><div><small>P/L</small><b class="${player.profit>=0?'good':'bad'}">${player.profit>=0?'+':''}${money(player.profit)}</b></div><div><small>Income</small><b>${money(player.income)}/yr</b></div><div><small>Yield</small><b>${player.yieldPct.toFixed(2)}%</b></div></div></article>`).join('');
    }
  }

  function openDrawer(tk) {
    const player = playersCache.find(row=>row.ticker===ticker(tk));
    if (!player) return;
    drawerTicker = player.ticker;
    const score = scoreFor(player);
    const scout = scoutRow(player.ticker);
    const route = routeAllocation(player.ticker);
    const dividend = nextDividend(player.ticker);
    const valueTotal = Math.max(1,totalValue());
    const incomeTotal = Math.max(1,totalIncome());
    const maxValue = Math.max(1,...playersCache.map(row=>row.value));
    const maxIncome = Math.max(1,...playersCache.map(row=>row.income));
    const valueInfluence = player.value/maxValue*100;
    const incomeInfluence = player.income/maxIncome*100;
    const bookPosition = Math.max(0,Math.min(100,50+player.profitPct*3));
    const rating = score === null ? null : Math.max(0,Math.min(100,score));

    const title = document.getElementById('squadDrawerTitle');
    const subtitle = document.getElementById('squadDrawerSubtitle');
    const content = document.getElementById('squadDrawerContent');
    if (title) title.textContent = `${player.ticker} — ${player.name}`;
    if (subtitle) subtitle.textContent = `${player.role} • ${player.sector} • ${player.accounts.join(' / ')}`;
    if (content) content.innerHTML = `
      <div class="squad-drawer-hero">
        <div class="squad-drawer-rating" style="--rating-progress:${rating===null?0:rating*3.6}deg"><span>${rating===null?'—':`${Math.round(rating)}/100`}</span></div>
        <div><h3>${esc(profileCall(player))}</h3><p>${esc(profileDetail(player))}</p></div>
      </div>
      <div class="squad-drawer-metrics">
        <div class="squad-drawer-metric"><small>Market value</small><strong>${money(player.value)}</strong></div>
        <div class="squad-drawer-metric"><small>Shares</small><strong>${player.shares.toLocaleString('en-GB',{maximumFractionDigits:8})}</strong></div>
        <div class="squad-drawer-metric"><small>Live price</small><strong>${money(player.livePrice)}</strong></div>
        <div class="squad-drawer-metric"><small>Average cost</small><strong>${money(player.avgCost)}</strong></div>
        <div class="squad-drawer-metric"><small>Profit / loss</small><strong class="${player.profit>=0?'good':'bad'}">${signMoney(player.profit)} • ${signPct(player.profitPct)}</strong></div>
        <div class="squad-drawer-metric"><small>Book cost</small><strong>${money(player.book)}</strong></div>
        <div class="squad-drawer-metric"><small>Annual income</small><strong>${money(player.income)}</strong></div>
        <div class="squad-drawer-metric"><small>Monthly income</small><strong>${money(player.income/12)}</strong></div>
        <div class="squad-drawer-metric"><small>Dividend yield</small><strong>${player.yieldPct.toFixed(2)}%</strong></div>
        <div class="squad-drawer-metric"><small>Portfolio weight</small><strong>${(player.value/valueTotal*100).toFixed(1)}%</strong></div>
      </div>
      <div class="squad-drawer-section"><h4>Tactical contribution</h4>${bar('Value influence',valueInfluence)}${bar('Income influence',incomeInfluence)}${bar('Book-cost position',bookPosition)}${bar('Aurora / scouting score',rating ?? 0)}</div>
      <div class="squad-drawer-section"><h4>Broker dressing rooms</h4><div class="squad-drawer-card">${player.rows.map(row=>{const m=holdingMetrics(row);return `<div class="squad-broker-row"><strong>${esc(accountLabel(row?.account))}</strong><span>${m.shares.toLocaleString('en-GB',{maximumFractionDigits:8})} shares • ${money(m.value)}</span><em class="${m.profit>=0?'good':'bad'}">${signMoney(m.profit)}</em></div>`;}).join('')}</div></div>
      <div class="squad-drawer-section"><h4>Aurora intelligence</h4>
        ${scout?`<div class="squad-drawer-card"><b>Scouting:</b> ${esc(scout?.recommendation || scout?.eligibility || scout?.status || 'Tracked')}<br>${firstNumber(scout,['sustainableScore'])!==null?`Sustainable ${Math.round(firstNumber(scout,['sustainableScore']))}/100 • `:''}${firstNumber(scout,['maximumScore'])!==null?`Maximum ${Math.round(firstNumber(scout,['maximumScore']))}/100`:''}${scout?.reason || scout?.note ? `<br>${esc(scout?.reason || scout?.note)}` : ''}</div>`:'<div class="squad-drawer-card"><b>Scouting:</b> No active scouting assessment is attached to this holding.</div>'}
        ${route?`<div class="squad-drawer-card"><b>Transfer route:</b> ${money(route?.amount || route?.allocationGbp || 0)} currently allocated${firstNumber(route,['expectedAnnualIncome'])!==null?` • ${money(firstNumber(route,['expectedAnnualIncome']))} expected annual income`:''}.</div>`:'<div class="squad-drawer-card"><b>Transfer route:</b> Not part of the current recommended purchase route.</div>'}
        ${dividend?`<div class="squad-drawer-card"><b>Next dividend:</b> ${esc(dividend?.payDate || dividend?.paymentDate || dividend?.date || 'Scheduled')}${firstNumber(dividend,['amount'])!==null?` • ${money(firstNumber(dividend,['amount']))}`:''}</div>`:''}
        ${player.locked?'<div class="squad-drawer-card"><b>Squad status:</b> Locked / protected from normal Transfer activity.</div>':''}
      </div>
      <div class="squad-drawer-section"><h4>Manager interpretation</h4><div class="squad-drawer-card"><b>${esc(profileCall(player))}</b><br>The position is ${player.profit>=0?'above':'below'} book cost by ${money(Math.abs(player.profit))}, contributes ${(player.income/incomeTotal*100).toFixed(1)}% of Squad income, and currently produces ${money(player.income)} a year in dividend income.</div></div>`;

    const backdrop = document.getElementById('squadPlayerDrawerBackdrop');
    const drawer = document.getElementById('squadPlayerDrawer');
    if (backdrop) backdrop.hidden = false;
    if (drawer) { drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false'); }
    document.body.classList.add('squad-drawer-open');
    renderPitch();
  }

  function closeDrawer() {
    drawerTicker = '';
    const backdrop = document.getElementById('squadPlayerDrawerBackdrop');
    const drawer = document.getElementById('squadPlayerDrawer');
    if (backdrop) backdrop.hidden = true;
    if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true'); }
    document.body.classList.remove('squad-drawer-open');
    renderPitch();
  }
  function stepDrawer(direction) {
    if (!drawerOrder.length) return;
    let index = Math.max(0,drawerOrder.indexOf(drawerTicker));
    index = (index + direction + drawerOrder.length) % drawerOrder.length;
    openDrawer(drawerOrder[index]);
  }

  function render() {
    stateCache = readState();
    playersCache = aggregate(stateCache);
    renderPitch();
    if (drawerTicker && playersCache.some(row=>row.ticker===drawerTicker)) openDrawer(drawerTicker);
    else if (drawerTicker) closeDrawer();
  }

  function bind() {
    document.addEventListener('click', event => {
      const pitchPlayer = event.target.closest('[data-squad-pitch-player]');
      if (pitchPlayer) { openDrawer(pitchPlayer.dataset.squadPitchPlayer); return; }
      const benchPlayer = event.target.closest('[data-squad-bench-player]');
      if (benchPlayer) { openDrawer(benchPlayer.dataset.squadBenchPlayer); return; }
      if (event.target.closest('#squadDrawerClose') || event.target === document.getElementById('squadPlayerDrawerBackdrop')) { closeDrawer(); return; }
      if (event.target.closest('#squadDrawerPrevious')) { stepDrawer(-1); return; }
      if (event.target.closest('#squadDrawerNext')) { stepDrawer(1); return; }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drawerTicker) closeDrawer();
      const benchPlayer = event.target.closest?.('[data-squad-bench-player]');
      if (benchPlayer && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDrawer(benchPlayer.dataset.squadBenchPlayer); }
    });
    window.addEventListener('pageshow',render);
    window.addEventListener('aurora2:state',()=>setTimeout(render,0));
    window.addEventListener('storage',event=>{ if (STATE_KEYS.includes(event.key)) render(); });
  }

  function boot() { bind(); render(); }
  window.AuroraSquadPitchProfiles = {build:BUILD,render,openPlayer:openDrawer,closePlayer:closeDrawer,readOnly:true};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
