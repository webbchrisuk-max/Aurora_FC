(() => {
  'use strict';

  const BUILD = '20260822-nexus-pitch-interaction-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  let selectedTicker = '';

  if (window.__AuroraNexusPitchInteraction === BUILD) return;
  window.__AuroraNexusPitchInteraction = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const raw = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const num = value => raw(value) ?? 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const ticker = value => String(value || '').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'').replace(/\..*$/,'');
  const upper = value => String(value || '').trim().toUpperCase();
  const money = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)) : '—';
  const signedMoney = value => Number.isFinite(Number(value)) ? `${Number(value) > 0 ? '+' : ''}${money(value)}` : '—';
  const pct = value => Number.isFinite(Number(value)) ? `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%` : '—';

  function readJson(key, fallback = null) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch (_) { return fallback; }
  }

  function state() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      const value = readJson(key, null);
      if (value && typeof value === 'object') return value;
    }
    return {};
  }

  function accountCode(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('212')) return 'T212';
    if (text.includes('ig')) return 'IG';
    return 'CHECK';
  }

  function accountLabel(code) {
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212' : 'Account review';
  }

  function activeHolding(row) {
    const status = upper(row?.status || 'ACTIVE');
    return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(status) && num(row?.shares) > 0;
  }

  function holdingMetrics(row) {
    const shares = Math.max(0, num(row?.shares));
    const book = Math.max(0, num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp ?? shares * num(row?.avgCostGbp)));
    const price = Math.max(0, num(row?.livePriceGbp ?? row?.priceGbp ?? row?.live_price_gbp));
    const directValue = Math.max(0, num(row?.marketValueGbp ?? row?.currentValueGbp ?? row?.market_value_gbp));
    const value = shares > 0 && price > 0 ? shares * price : directValue;
    const dps = Math.max(0, num(row?.annualDpsGbp ?? row?.annualDps ?? row?.annual_dps_gbp));
    const directIncome = Math.max(0, num(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? row?.annualIncome));
    const income = shares > 0 && dps > 0 ? shares * dps : directIncome;
    const dayPct = raw(row?.dailyChangePct ?? row?.dayChangePct ?? row?.todayChangePct ?? row?.changePct ?? row?.daily_change_pct ?? row?.day_change_pct);
    let dayGbp = raw(row?.dailyChangeGbp ?? row?.dayChangeGbp ?? row?.todayChangeGbp ?? row?.changeGbp ?? row?.daily_change_gbp ?? row?.day_change_gbp);
    if (dayGbp === null && dayPct !== null && price > 0 && shares > 0 && dayPct > -99.9) {
      const previous = price / (1 + dayPct / 100);
      dayGbp = (price - previous) * shares;
    }
    return {shares,book,price,value,income,profit:value-book,dayPct,dayGbp};
  }

  function liveRows() {
    try {
      return arr(window.AuroraClubCommand?.marketRows?.()).map(row => ({
        ticker: ticker(row?.ticker || row?.symbol),
        price: raw(row?.price),
        changePct: raw(row?.change ?? row?.day_change ?? row?.dayChangePct),
        tradeTime: row?.tradeTime || row?.trade_time || row?.timestamp || ''
      })).filter(row => row.ticker && row.price !== null && row.price > 0 && row.changePct !== null && row.changePct > -99.9);
    } catch (_) {
      return [];
    }
  }

  function contribution(price, changePct, shares) {
    if (!(price > 0) || changePct === null || !(shares > 0) || changePct <= -99.9) return null;
    const previous = price / (1 + changePct / 100);
    return (price - previous) * shares;
  }

  function companyBook() {
    const s = state();
    const live = new Map(liveRows().map(row => [row.ticker, row]));
    const map = new Map();

    arr(s?.squad?.holdings).filter(activeHolding).forEach(row => {
      const tk = ticker(row?.ticker || row?.marketSymbol || row?.name);
      if (!tk) return;
      const hm = holdingMetrics(row);
      const current = map.get(tk) || {
        ticker: tk,
        name: String(row?.name || tk),
        sector: String(row?.sector || 'Unclassified'),
        role: String(row?.role || 'Squad holding'),
        shares: 0,
        book: 0,
        storedValue: 0,
        income: 0,
        fallbackDayGbp: 0,
        fallbackDayEvidence: 0,
        fallbackDayPct: null,
        accounts: new Set(),
        rows: []
      };
      current.shares += hm.shares;
      current.book += hm.book;
      current.storedValue += hm.value;
      current.income += hm.income;
      current.accounts.add(accountCode(row?.account));
      current.rows.push(row);
      if (hm.dayGbp !== null) { current.fallbackDayGbp += hm.dayGbp; current.fallbackDayEvidence += 1; }
      if (current.fallbackDayPct === null && hm.dayPct !== null) current.fallbackDayPct = hm.dayPct;
      if ((!current.sector || current.sector === 'Unclassified') && row?.sector) current.sector = String(row.sector);
      if ((!current.role || current.role === 'Squad holding') && row?.role) current.role = String(row.role);
      map.set(tk, current);
    });

    return new Map([...map.entries()].map(([tk, item]) => {
      const market = live.get(tk) || null;
      const price = market?.price ?? (item.shares > 0 ? item.storedValue / item.shares : 0);
      const value = market?.price ? market.price * item.shares : item.storedValue;
      const dayPct = market ? market.changePct : item.fallbackDayPct;
      const liveContribution = market ? contribution(market.price, market.changePct, item.shares) : null;
      const dayGbp = liveContribution !== null ? liveContribution : (item.fallbackDayEvidence ? item.fallbackDayGbp : null);
      const profit = value - item.book;
      const yieldPct = value > 0 ? item.income / value * 100 : 0;
      return [tk, {
        ...item,
        accounts: [...item.accounts],
        price,
        value,
        profit,
        profitPct: item.book > 0 ? profit / item.book * 100 : 0,
        yieldPct,
        dayPct,
        dayGbp,
        source: market ? 'LivePrices' : (item.fallbackDayEvidence || item.fallbackDayPct !== null ? 'Squad daily evidence' : 'No daily evidence'),
        tradeTime: market?.tradeTime || ''
      }];
    }));
  }

  function scoutingFor(s, tk) {
    return arr(s?.scouting?.targets).find(row => ticker(row?.ticker || row?.name) === tk) || null;
  }

  function ensureDrawer() {
    if (document.getElementById('nxPlayerDrawer')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="nx-player-drawer-backdrop" id="nxPlayerDrawerBackdrop" hidden></div>
      <aside class="nx-player-drawer" id="nxPlayerDrawer" aria-hidden="true" aria-label="Holding analysis">
        <header class="nx-drawer-head">
          <div><span class="nx-drawer-kicker">Squad analysis</span><h2 id="nxDrawerTitle">Holding</h2><p id="nxDrawerSubtitle">Canonical company view</p></div>
          <button class="nx-drawer-close" id="nxDrawerClose" type="button" aria-label="Close holding analysis">×</button>
        </header>
        <div class="nx-drawer-content" id="nxDrawerContent"></div>
      </aside>`);
  }

  function movementClass(changePct) {
    if (changePct === null) return 'none';
    if (changePct > 0.0001) return 'up';
    if (changePct < -0.0001) return 'down';
    return 'flat';
  }

  function decoratePitch() {
    const book = companyBook();
    const nodes = document.querySelectorAll('#nxPitchPlayers .nx-player');
    nodes.forEach(node => {
      const tk = ticker(node.querySelector('b')?.textContent || node.dataset.nxPlayer || '');
      if (!tk) return;
      const row = book.get(tk);
      node.dataset.nxPlayer = tk;
      node.setAttribute('role','button');
      node.setAttribute('tabindex','0');
      node.setAttribute('aria-label', row ? `${row.name}, ${row.dayPct === null ? 'daily movement unavailable' : pct(row.dayPct)}, open analysis` : `${tk}, open analysis`);
      node.classList.remove('nx-up','nx-down','nx-flat');
      const movement = movementClass(row?.dayPct ?? null);
      if (movement === 'up') node.classList.add('nx-up');
      else if (movement === 'down') node.classList.add('nx-down');
      else node.classList.add('nx-flat');
      node.classList.toggle('is-selected', selectedTicker === tk);

      let day = node.querySelector('.nx-player-day');
      if (!day) {
        day = document.createElement('em');
        day.className = 'nx-player-day';
        node.appendChild(day);
      }
      day.textContent = row?.dayPct === null || row?.dayPct === undefined ? '• feed pending' : `${row.dayPct > 0 ? '▲' : row.dayPct < 0 ? '▼' : '•'} ${pct(row.dayPct)}`;
      if (row) node.title = `${row.name} • ${row.dayPct === null ? 'daily movement pending' : pct(row.dayPct)} • tap for analysis`;
    });

    const note = document.getElementById('nxPitchNote');
    if (note && nodes.length) {
      const rows = [...nodes].map(node => book.get(ticker(node.dataset.nxPlayer))).filter(Boolean);
      const covered = rows.filter(row => row.dayPct !== null).length;
      const up = rows.filter(row => row.dayPct !== null && row.dayPct > 0).length;
      const down = rows.filter(row => row.dayPct !== null && row.dayPct < 0).length;
      note.textContent = `${nodes.length} largest unique holdings by value • ${up} up • ${down} down • ${covered}/${rows.length} with daily evidence. Tap a player for full company analysis.`;
    }
  }

  function renderDrawer(tk) {
    const s = state();
    const row = companyBook().get(ticker(tk));
    if (!row) return false;
    const scout = scoutingFor(s, row.ticker);
    const scoutScore = raw(scout?.score ?? scout?.confidence ?? scout?.sustainableScore ?? scout?.maximumScore);
    const recommendation = String(scout?.recommendation || scout?.status || 'Not currently in Scouting').replaceAll('_',' ');
    const moveClass = movementClass(row.dayPct);
    const moveText = row.dayPct === null ? 'Feed pending' : `${row.dayPct > 0 ? '▲ ' : row.dayPct < 0 ? '▼ ' : ''}${pct(row.dayPct)}`;
    const managerView = row.dayPct !== null && row.dayPct > 0.5 ? 'Strong live form today.' : row.dayPct !== null && row.dayPct < -0.5 ? 'Under pressure in today’s session.' : row.profit < 0 ? 'Below book cost — monitor the position rather than chase it.' : row.income > 0 ? 'Established income contributor in the current squad.' : 'Current canonical squad holding.';

    const title = document.getElementById('nxDrawerTitle');
    const subtitle = document.getElementById('nxDrawerSubtitle');
    const content = document.getElementById('nxDrawerContent');
    if (title) title.textContent = `${row.ticker} — ${row.name}`;
    if (subtitle) subtitle.textContent = `${row.role} • ${row.sector} • ${row.accounts.map(accountLabel).join(' / ')}`;
    if (content) content.innerHTML = `
      <div class="nx-drawer-form ${moveClass}"><span>Today's form</span><strong>${esc(moveText)}</strong></div>
      <div class="nx-drawer-metrics">
        <div class="nx-drawer-metric"><small>Live price</small><strong>${row.price > 0 ? esc(money(row.price)) : 'Feed pending'}</strong></div>
        <div class="nx-drawer-metric"><small>Today's contribution</small><strong class="${row.dayGbp > 0 ? 'good' : row.dayGbp < 0 ? 'bad' : ''}">${row.dayGbp === null ? 'Feed pending' : esc(signedMoney(row.dayGbp))}</strong></div>
        <div class="nx-drawer-metric"><small>Market value</small><strong>${esc(money(row.value))}</strong></div>
        <div class="nx-drawer-metric"><small>Shares</small><strong>${row.shares.toLocaleString('en-GB',{maximumFractionDigits:6})}</strong></div>
        <div class="nx-drawer-metric"><small>Profit / loss</small><strong class="${row.profit >= 0 ? 'good' : 'bad'}">${esc(signedMoney(row.profit))} • ${esc(pct(row.profitPct))}</strong></div>
        <div class="nx-drawer-metric"><small>Book cost</small><strong>${esc(money(row.book))}</strong></div>
        <div class="nx-drawer-metric"><small>Annual income</small><strong>${esc(money(row.income))}</strong></div>
        <div class="nx-drawer-metric"><small>Dividend yield</small><strong>${row.yieldPct.toFixed(2)}%</strong></div>
      </div>
      <div class="nx-drawer-card"><b>Daily evidence:</b> ${esc(row.source)}${row.tradeTime ? ` • ${esc(String(row.tradeTime))}` : ''}. Green means the security is up today; red means it is down today.</div>
      <div class="nx-drawer-card"><b>Scouting:</b> ${esc(recommendation)}${scoutScore !== null ? ` • ${scoutScore.toFixed(0)}/100` : ''}.</div>
      <div class="nx-drawer-card"><b>Manager view:</b> ${esc(managerView)}</div>
      <div class="nx-drawer-links"><a class="nx-drawer-link" href="squad.html">Open in Squad →</a><a class="nx-drawer-link" href="scouting.html">Open Scouting →</a></div>`;
    return true;
  }

  function openDrawer(tk) {
    ensureDrawer();
    const normalized = ticker(tk);
    if (!renderDrawer(normalized)) return;
    selectedTicker = normalized;
    decoratePitch();
    const backdrop = document.getElementById('nxPlayerDrawerBackdrop');
    const drawer = document.getElementById('nxPlayerDrawer');
    if (backdrop) backdrop.hidden = false;
    if (drawer) {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden','false');
    }
  }

  function closeDrawer() {
    selectedTicker = '';
    const backdrop = document.getElementById('nxPlayerDrawerBackdrop');
    const drawer = document.getElementById('nxPlayerDrawer');
    if (backdrop) backdrop.hidden = true;
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden','true');
    }
    decoratePitch();
  }

  function refresh() {
    decoratePitch();
    if (selectedTicker) renderDrawer(selectedTicker);
    document.documentElement.dataset.nexusPitchInteraction = 'live';
  }

  function onClick(event) {
    const player = event.target.closest?.('#nxPitchPlayers .nx-player');
    if (player) {
      openDrawer(player.dataset.nxPlayer || player.querySelector('b')?.textContent || '');
      return;
    }
    if (event.target.closest?.('#nxDrawerClose') || event.target === document.getElementById('nxPlayerDrawerBackdrop')) closeDrawer();
  }

  function onKey(event) {
    if (event.key === 'Escape') { closeDrawer(); return; }
    const player = event.target.closest?.('#nxPitchPlayers .nx-player');
    if (player && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openDrawer(player.dataset.nxPlayer || player.querySelector('b')?.textContent || '');
    }
  }

  function boot() {
    ensureDrawer();
    refresh();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('aurora2:state', () => setTimeout(refresh, 0));
    window.addEventListener('aurora:market-live', () => setTimeout(refresh, 0));
    window.addEventListener('aurora:browser-auto-sync', () => setTimeout(refresh, 0));
    window.addEventListener('focus', () => setTimeout(refresh, 120));
    window.addEventListener('pageshow', () => setTimeout(refresh, 120));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(refresh, 120); });
    [500,1200,2500,5000].forEach(delay => setTimeout(refresh, delay));
    setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 2500);
  }

  window.AuroraNexusPitchInteraction = Object.freeze({build:BUILD,refresh,openDrawer,closeDrawer,snapshot:() => [...companyBook().values()]});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
