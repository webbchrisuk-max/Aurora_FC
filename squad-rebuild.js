(() => {
  'use strict';

  const BUILD = '20260820-squad-readonly-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const upper = value => String(value || '').trim().toUpperCase();
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
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

  function ticker(value) {
    return upper(value).replace(/^LON:/, '').replace(/\.L$/, '').replace(/\.GB$/, '');
  }

  function activeHolding(row) {
    const status = upper(row?.status || 'ACTIVE');
    return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(status) && num(row?.shares) > 0;
  }

  function holdingMetrics(row) {
    const shares = Math.max(0, num(row?.shares));
    const book = Math.max(0, num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp));
    const price = Math.max(0, num(row?.livePriceGbp ?? row?.priceGbp ?? row?.live_price_gbp));
    const directValue = Math.max(0, num(row?.marketValueGbp ?? row?.currentValueGbp ?? row?.market_value_gbp));
    const value = shares > 0 && price > 0 ? shares * price : directValue;
    const dps = Math.max(0, num(row?.annualDpsGbp ?? row?.annualDps ?? row?.annual_dps_gbp));
    const directIncome = Math.max(0, num(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? row?.annualIncome));
    const income = shares > 0 && dps > 0 ? shares * dps : directIncome;
    const profit = value - book;
    const avg = shares > 0 && book > 0 ? book / shares : Math.max(0, num(row?.avgCostGbp));
    const yoc = book > 0 ? income / book * 100 : 0;
    return {shares, book, price, value, dps, income, profit, avg, yoc};
  }

  function squadRows(state) {
    return arr(state?.squad?.holdings).filter(activeHolding);
  }

  function metrics(state) {
    const rows = squadRows(state);
    const totals = rows.reduce((acc, row) => {
      const m = holdingMetrics(row);
      acc.value += m.value;
      acc.book += m.book;
      acc.income += m.income;
      return acc;
    }, {value:0, book:0, income:0});
    const byTicker = new Map();
    rows.forEach(row => {
      const tk = ticker(row?.ticker);
      if (!tk) return;
      const m = holdingMetrics(row);
      const current = byTicker.get(tk) || {ticker:tk, name:row?.name || tk, value:0, book:0, income:0, profit:0, positions:0};
      current.value += m.value;
      current.book += m.book;
      current.income += m.income;
      current.profit += m.profit;
      current.positions += 1;
      byTicker.set(tk, current);
    });
    const players = [...byTicker.values()];
    const sortDesc = key => [...players].sort((a,b) => num(b[key]) - num(a[key]));
    const valueCaptain = sortDesc('value')[0] || null;
    const incomeCaptain = sortDesc('income')[0] || null;
    const profitLeader = sortDesc('profit')[0] || null;
    const drag = [...players].sort((a,b) => num(a.profit) - num(b.profit))[0] || null;
    const top5Value = sortDesc('value').slice(0,5).reduce((sum,row) => sum + row.value, 0);
    return {
      rows, byTicker, players,
      value:totals.value, book:totals.book, income:totals.income, monthly:totals.income/12,
      profit:totals.value - totals.book, yoc:totals.book > 0 ? totals.income/totals.book*100 : 0,
      valueCaptain, incomeCaptain, profitLeader, drag,
      top5Pct:totals.value > 0 ? top5Value/totals.value*100 : 0
    };
  }

  function confirmedDrafts(state) {
    return arr(state?.transfer?.registrationDrafts).filter(row => upper(row?.status) === 'CONFIRMED');
  }

  function receiptRows(state) {
    const receipts = arr(state?.registration?.receipts);
    const drafts = confirmedDrafts(state);
    const draftMap = new Map(drafts.map(row => [String(row?.transactionId || ''), row]));
    return receipts.map(receipt => ({receipt, draft:draftMap.get(String(receipt?.transactionId || '')) || null}));
  }

  function receiptPromoted(state, item) {
    const tk = ticker(item.receipt?.ticker || item.draft?.ticker);
    const acct = accountCode(item.receipt?.account || item.draft?.account);
    const expectedShares = num(item.draft?.newShares);
    const match = squadRows(state).find(row => ticker(row?.ticker) === tk && accountCode(row?.account) === acct);
    if (!match) return false;
    if (expectedShares > 0) return Math.abs(num(match.shares) - expectedShares) < 0.000001;
    return true;
  }

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function classFlag(id, className, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle(className, !!on);
  }

  function renderKpis(state, m, bridge) {
    text('squadValue', money(m.value));
    text('squadBook', money(m.book));
    text('squadProfit', `${m.profit >= 0 ? '+' : ''}${money(m.profit)}`);
    text('squadIncome', money(m.income));
    text('squadMonthly', `${money(m.monthly)} / month`);
    text('squadPlayers', m.players.length.toLocaleString('en-GB'));
    text('squadPositions', `${m.rows.length} account positions`);
    text('squadYoc', `${m.yoc.toFixed(2)}%`);
    text('bridgeWaitingTop', bridge.waiting.toLocaleString('en-GB'));
    text('heroSnapshot', m.rows.length ? `${m.players.length} players • ${m.rows.length} account positions` : 'No canonical holdings connected yet');
    classFlag('squadProfitCard', 'negative', m.profit < 0);
  }

  function renderLeadership(m) {
    const setCaptain = (prefix, row, value, empty='—') => {
      text(`${prefix}Ticker`, row?.ticker || empty);
      text(`${prefix}Value`, row ? value(row) : empty);
    };
    setCaptain('valueCaptain', m.valueCaptain, row => money(row.value));
    setCaptain('incomeCaptain', m.incomeCaptain, row => `${money(row.income)} / yr`);
    setCaptain('profitLeader', m.profitLeader, row => `${row.profit >= 0 ? '+' : ''}${money(row.profit)}`);
    const drag = m.drag && m.drag.profit < 0 ? m.drag : null;
    setCaptain('biggestDrag', drag, row => money(row.profit));
    text('top5Concentration', `${m.top5Pct.toFixed(1)}%`);
    const bar=document.getElementById('top5Bar'); if(bar) bar.style.width=`${Math.min(100,m.top5Pct)}%`;
  }

  function renderAccounts(m) {
    const accountRows = [
      ['IG','igValue','igMeta'],
      ['T212','t212Value','t212Meta'],
      ['CHECK','reviewValue','reviewMeta']
    ];
    accountRows.forEach(([code,valueId,metaId]) => {
      const rows = m.rows.filter(row => accountCode(row?.account) === code);
      const value = rows.reduce((sum,row) => sum + holdingMetrics(row).value, 0);
      text(valueId, money(value));
      text(metaId, `${rows.length} position${rows.length === 1 ? '' : 's'}`);
    });
  }

  function holdingSourceLabel(row) {
    const src = upper(row?.source || 'AURORA2_SQUAD').replaceAll('_',' ');
    return src || 'AURORA2 SQUAD';
  }

  function filteredHoldings(m) {
    const query = norm(document.getElementById('holdingSearch')?.value || '');
    const account = upper(document.getElementById('holdingAccount')?.value || 'ALL');
    return [...m.rows].filter(row => {
      if (account !== 'ALL' && accountCode(row?.account) !== account) return false;
      if (!query) return true;
      return norm(`${row?.ticker} ${row?.name} ${row?.sector} ${row?.role}`).includes(query);
    }).sort((a,b) => holdingMetrics(b).value - holdingMetrics(a).value || ticker(a?.ticker).localeCompare(ticker(b?.ticker)));
  }

  function renderRegister(m) {
    const host = document.getElementById('holdingRows');
    if (!host) return;
    const rows = filteredHoldings(m);
    text('registerCount', `${rows.length} shown`);
    if (!rows.length) {
      host.innerHTML = '<div class="squad-empty">No canonical holdings match this filter.</div>';
      return;
    }
    const total = Math.max(1, m.value);
    host.innerHTML = rows.map(row => {
      const hm = holdingMetrics(row);
      const weight = hm.value / total * 100;
      const locked = !!row?.locked || upper(row?.status) === 'LOCKED';
      return `<article class="holding-card ${locked ? 'locked' : ''}">
        <div class="holding-main">
          <div class="holding-shirt">${esc(ticker(row?.ticker) || '—')}</div>
          <div class="holding-name"><strong>${esc(ticker(row?.ticker))} <span>${esc(row?.name || ticker(row?.ticker))}</span></strong><small>${esc(row?.sector || 'Sector not set')} • ${esc(accountLabel(row?.account))}</small></div>
          <div class="holding-flags"><span>${weight.toFixed(2)}% squad</span>${locked ? '<b>LOCKED</b>' : ''}</div>
        </div>
        <div class="holding-metrics">
          <div><small>Shares</small><strong>${hm.shares.toLocaleString('en-GB',{maximumFractionDigits:8})}</strong></div>
          <div><small>Value</small><strong>${money(hm.value)}</strong></div>
          <div><small>Book Cost</small><strong>${money(hm.book)}</strong></div>
          <div><small>P / L</small><strong class="${hm.profit >= 0 ? 'good' : 'bad'}">${hm.profit >= 0 ? '+' : ''}${money(hm.profit)}</strong></div>
          <div><small>Annual Income</small><strong>${money(hm.income)}</strong></div>
          <div><small>Yield on Cost</small><strong>${hm.yoc.toFixed(2)}%</strong></div>
        </div>
        <div class="holding-footer"><span>${esc(holdingSourceLabel(row))}</span><span>${hm.price > 0 ? `Live ${money(hm.price)}` : 'Live price missing'}</span></div>
      </article>`;
    }).join('');
  }

  function renderCore(m) {
    const host = document.getElementById('coreFive');
    if (!host) return;
    const rows = [...m.players].sort((a,b) => b.value-a.value).slice(0,5);
    if (!rows.length) {
      host.innerHTML = '<div class="squad-empty">Core Five will appear when canonical holdings are connected.</div>';
      return;
    }
    host.innerHTML = rows.map((row,index) => `<div class="core-row"><b>#${index+1}</b><div><strong>${esc(row.ticker)} • ${esc(row.name)}</strong><span>${money(row.value)} • ${money(row.income)}/yr</span></div><em>${m.value > 0 ? (row.value/m.value*100).toFixed(1) : '0.0'}%</em></div>`).join('');
  }

  function renderBalance(m) {
    const brokerHost = document.getElementById('brokerBars');
    if (brokerHost) {
      const codes = ['IG','T212','CHECK'];
      brokerHost.innerHTML = codes.map(code => {
        const value = m.rows.filter(row=>accountCode(row?.account)===code).reduce((sum,row)=>sum+holdingMetrics(row).value,0);
        const pct = m.value > 0 ? value/m.value*100 : 0;
        return `<div class="balance-row"><span>${esc(accountLabel(code))}</span><div><i style="width:${Math.min(100,pct)}%"></i></div><strong>${pct.toFixed(1)}%</strong></div>`;
      }).join('');
    }
    const sectorHost = document.getElementById('sectorRows');
    if (sectorHost) {
      const sectors = new Map();
      m.rows.forEach(row => {
        const sector = String(row?.sector || 'Unclassified').trim() || 'Unclassified';
        sectors.set(sector, (sectors.get(sector)||0)+holdingMetrics(row).value);
      });
      const rows = [...sectors].sort((a,b)=>b[1]-a[1]).slice(0,8);
      sectorHost.innerHTML = rows.length ? rows.map(([sector,value]) => `<div class="sector-row"><span>${esc(sector)}</span><strong>${m.value > 0 ? (value/m.value*100).toFixed(1) : '0.0'}%</strong></div>`).join('') : '<div class="squad-empty">No sector depth yet.</div>';
    }
  }

  function renderHealth(m) {
    const accountReview = m.rows.filter(row => accountCode(row?.account) === 'CHECK').length;
    const missingBook = m.rows.filter(row => holdingMetrics(row).book <= 0).length;
    const missingPrice = m.rows.filter(row => holdingMetrics(row).price <= 0 && holdingMetrics(row).value <= 0).length;
    const missingIncome = m.rows.filter(row => holdingMetrics(row).income <= 0).length;
    const locked = m.rows.filter(row => row?.locked || upper(row?.status)==='LOCKED').length;
    const set = (id,count,okText,warnText) => {
      text(`${id}Count`, String(count));
      text(`${id}Meta`, count ? warnText : okText);
      classFlag(id, 'warn', count > 0);
    };
    set('healthAccount', accountReview, 'All active positions have broker scope.', 'positions need broker scope');
    set('healthBook', missingBook, 'Book cost present on every active position.', 'positions are missing book cost');
    set('healthPrice', missingPrice, 'Market value / price evidence is available.', 'positions need price evidence');
    set('healthIncome', missingIncome, 'Income evidence is available.', 'positions need dividend evidence');
    text('lockedCount', String(locked));
  }

  function renderBridge(state) {
    const host = document.getElementById('registrationBridgeRows');
    const items = receiptRows(state);
    const waiting = items.filter(item => !receiptPromoted(state,item));
    const promoted = items.filter(item => receiptPromoted(state,item));
    text('bridgeWaiting', String(waiting.length));
    text('bridgeConfirmed', String(items.length));
    text('bridgePromoted', String(promoted.length));
    const gate = document.getElementById('squadBridgeGate');
    if (gate) {
      gate.className = `squad-gate ${waiting.length ? 'hold' : 'ready'}`;
      gate.innerHTML = waiting.length
        ? `<strong>PROMOTION HELD</strong><span>${waiting.length} confirmed Registration receipt${waiting.length===1?' is':'s are'} waiting for the controlled receipt → Squad write stage.</span>`
        : '<strong>BRIDGE CLEAR</strong><span>No confirmed Registration receipts are waiting to be promoted into Squad.</span>';
    }
    if (!host) return {items,waiting,promoted};
    if (!items.length) {
      host.innerHTML = '<div class="squad-empty">No AuroraData 2 Registration receipts are stored on this device yet.</div>';
      return {items,waiting,promoted};
    }
    host.innerHTML = items.slice(0,12).map(item => {
      const receipt = item.receipt, draft = item.draft;
      const promotedFlag = receiptPromoted(state,item);
      const shares = num(draft?.shares);
      const cost = num(receipt?.totalCostGbp ?? draft?.totalCostGbp);
      const newShares = num(draft?.newShares);
      return `<div class="bridge-row ${promotedFlag?'promoted':'waiting'}"><div><strong>${esc(ticker(receipt?.ticker || draft?.ticker))} • ${esc(accountLabel(receipt?.account || draft?.account))}</strong><span>${shares>0?`${shares.toLocaleString('en-GB',{maximumFractionDigits:8})} shares • `:''}${money(cost)} • ${esc(receipt?.transactionId || draft?.transactionId || 'receipt')}</span></div><div><b>${promotedFlag?'IN SQUAD':'WAITING'}</b>${newShares>0?`<span>Target shares ${newShares.toLocaleString('en-GB',{maximumFractionDigits:8})}</span>`:''}</div></div>`;
    }).join('');
    return {items,waiting,promoted};
  }

  function renderStatus(state, m, bridge) {
    const source = String(state?.squad?.source || (m.rows.length ? 'AURORA2_STATE' : 'NOT_CONNECTED')).replaceAll('_',' ');
    text('squadSource', source);
    text('squadUpdated', state?.squad?.updatedAt ? new Date(state.squad.updatedAt).toLocaleString('en-GB') : 'Not yet written by clean rebuild');
    const status = document.getElementById('squadAuthorityStatus');
    if (status) {
      if (m.rows.length) {
        status.textContent = bridge.waiting.length ? 'CANONICAL READ • BRIDGE HELD' : 'CANONICAL READ';
        status.className = 'authority-chip live';
      } else {
        status.textContent = bridge.waiting.length ? 'REGISTRATION RECEIPTS READY' : 'HOLDINGS NOT CONNECTED';
        status.className = 'authority-chip hold';
      }
    }
    text('nextAction', bridge.waiting.length ? 'Connect confirmed receipts to Squad' : m.rows.length ? 'Review first-team data health' : 'Connect canonical holdings authority');
    text('nextActionMeta', bridge.waiting.length
      ? 'Registration has confirmed broker reality. The next controlled stage will promote those receipts into account-scoped Squad holdings.'
      : m.rows.length
        ? 'Squad is reading existing canonical holdings without changing them.'
        : 'This read-only rebuild will not invent or import holdings automatically.');
  }

  function render() {
    const state = readState();
    const m = metrics(state);
    const bridge = renderBridge(state);
    renderKpis(state,m,bridge);
    renderLeadership(m);
    renderAccounts(m);
    renderRegister(m);
    renderCore(m);
    renderBalance(m);
    renderHealth(m);
    renderStatus(state,m,bridge);
    window.AuroraSquadReadonly = Object.freeze({
      build:BUILD, ready:true, readOnly:true,
      holdings:m.rows.length, players:m.players.length,
      value:Number(m.value.toFixed(2)), annualIncome:Number(m.income.toFixed(2)),
      confirmedReceipts:bridge.items.length, waitingReceipts:bridge.waiting.length
    });
  }

  function bind() {
    document.getElementById('holdingSearch')?.addEventListener('input', render);
    document.getElementById('holdingAccount')?.addEventListener('change', render);
    document.getElementById('clearSquadFilters')?.addEventListener('click', () => {
      const search = document.getElementById('holdingSearch');
      const account = document.getElementById('holdingAccount');
      if (search) search.value='';
      if (account) account.value='ALL';
      render();
    });
    window.addEventListener('focus',render);
    window.addEventListener('pageshow',render);
    window.addEventListener('aurora2:state',render);
    window.addEventListener('storage', event => { if ([STATE_KEY,BACKUP_KEY].includes(event.key)) render(); });
  }

  function boot() { bind(); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();