(() => {
  'use strict';

  const BUILD = '20260826-clean-rebuild-5-squad-cards';
  const STATE_KEY = 'aurora-clean:state:v1';
  const LIVE_STATE_KEYS = ['aurora2:state:v1', 'aurora2:state:backup:lastgood'];

  const DEFAULT_STATE = {
    version: 3,
    finance: {
      expectedWages: 2600,
      wagesReceived: 2600,
      availableCash: 2600,
      commitments: 1086.13,
      protectedCash: 300,
      holdingPotBalance: 0,
      holdingPotTarget: 0,
      bills: [],
      pots: [],
      lastSafeRelease: 1213.87,
      lastPlan: null,
      paydayHistory: []
    },
    scouting: { strategy: 'sustainable', candidates: [] },
    transfer: { mission: null, route: null },
    registration: { receipts: [] },
    squad: { holdings: [], importedAt: null, source: 'CLEAN' },
    income: { dividends: [] },
    matchReport: { lastBuiltAt: null, summary: '' }
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const byId = id => document.getElementById(id);
  const setText = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
  const setHtml = (id, value) => { const el = byId(id); if (el) el.innerHTML = value; };
  const isoNow = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const round2 = value => Number(num(value).toFixed(2));
  const upper = value => String(value || '').trim().toUpperCase();

  function normaliseState(input) {
    const source = input && typeof input === 'object' ? input : {};
    const next = clone(DEFAULT_STATE);
    Object.assign(next, source);
    next.finance = {...clone(DEFAULT_STATE.finance), ...(source.finance || {})};
    next.finance.bills = Array.isArray(source.finance?.bills) ? source.finance.bills : [];
    next.finance.pots = Array.isArray(source.finance?.pots) ? source.finance.pots : [];
    next.finance.paydayHistory = Array.isArray(source.finance?.paydayHistory) ? source.finance.paydayHistory : [];
    next.scouting = {...clone(DEFAULT_STATE.scouting), ...(source.scouting || {})};
    next.scouting.candidates = Array.isArray(source.scouting?.candidates) ? source.scouting.candidates : [];
    next.transfer = {...clone(DEFAULT_STATE.transfer), ...(source.transfer || {})};
    next.registration = {...clone(DEFAULT_STATE.registration), ...(source.registration || {})};
    next.registration.receipts = Array.isArray(source.registration?.receipts) ? source.registration.receipts : [];
    next.squad = {...clone(DEFAULT_STATE.squad), ...(source.squad || {})};
    next.squad.holdings = Array.isArray(source.squad?.holdings) ? source.squad.holdings : [];
    next.income = {...clone(DEFAULT_STATE.income), ...(source.income || {})};
    next.income.dividends = Array.isArray(source.income?.dividends) ? source.income.dividends : [];
    next.matchReport = {...clone(DEFAULT_STATE.matchReport), ...(source.matchReport || {})};
    next.version = 3;
    return next;
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return normaliseState(parsed);
    } catch (_) {
      return clone(DEFAULT_STATE);
    }
  }

  function writeState(next) {
    const clean = normaliseState(next);
    localStorage.setItem(STATE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent('aurora-clean:state', {detail: clean}));
    return clean;
  }

  function updateState(mutator) {
    const state = readState();
    mutator(state);
    return writeState(state);
  }

  function readLiveAuroraState() {
    for (const key of LIVE_STATE_KEYS) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return {key, state: parsed};
      } catch (_) {}
    }
    return null;
  }

  function activeLiveHolding(row) {
    const status = upper(row?.status || 'ACTIVE');
    return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(status) && num(row?.shares) > 0;
  }

  function normaliseHolding(row) {
    const shares = Math.max(0, num(row?.shares));
    const bookCostGbp = Math.max(0, num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp));
    const avgCostGbp = Math.max(0, num(row?.avgCostGbp ?? row?.averageCostGbp ?? (shares > 0 ? bookCostGbp / shares : 0)));
    const livePriceGbp = Math.max(0, num(row?.livePriceGbp ?? row?.priceGbp ?? row?.live_price_gbp));
    const marketValueGbp = Math.max(0, num(row?.marketValueGbp ?? row?.currentValueGbp ?? (shares * livePriceGbp)));
    const annualDpsGbp = Math.max(0, num(row?.annualDpsGbp ?? row?.annualDps ?? row?.annual_dps_gbp));
    const annualIncomeGbp = Math.max(0, num(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? (shares * annualDpsGbp)));
    return {
      holdingId: String(row?.holdingId || row?.holding_id || ''),
      account: String(row?.account || row?.broker || 'Unspecified'),
      ticker: String(row?.ticker || row?.symbol || '').replace(/^LON:/i, '').replace(/\.L$/i, '').toUpperCase(),
      name: String(row?.name || row?.company || row?.ticker || ''),
      shares,
      bookCostGbp,
      avgCostGbp,
      livePriceGbp,
      marketValueGbp,
      annualDpsGbp,
      annualIncomeGbp,
      sector: String(row?.sector || ''),
      role: String(row?.role || ''),
      status: upper(row?.status || 'ACTIVE'),
      locked: row?.locked === true,
      lockReason: String(row?.lockReason || '')
    };
  }

  function importRealHoldings() {
    const live = readLiveAuroraState();
    const rows = Array.isArray(live?.state?.squad?.holdings) ? live.state.squad.holdings : [];
    const holdings = rows.filter(activeLiveHolding).map(normaliseHolding).filter(row => row.ticker && row.shares > 0);
    if (!holdings.length) return {ok:false, count:0, message:'No active holdings were found in the live Aurora browser state.'};
    updateState(state => {
      state.squad.holdings = holdings;
      state.squad.importedAt = isoNow();
      state.squad.source = live.key;
    });
    return {ok:true, count:holdings.length, message:`Imported ${holdings.length} active account position(s) from live Aurora.`};
  }

  function activeBills(finance) {
    return (finance.bills || []).filter(row => row.active !== false);
  }

  function activePots(finance) {
    return (finance.pots || []).filter(row => row.active !== false);
  }

  function financeSummary(finance) {
    const availableCash = Math.max(0, num(finance.availableCash));
    const commitments = Math.max(0, num(finance.commitments));
    const protectedCash = Math.max(0, num(finance.protectedCash));
    const billsDue = activeBills(finance).reduce((sum, row) => sum + Math.max(0, num(row.amount)), 0);
    const holdingBalance = Math.max(0, num(finance.holdingPotBalance));
    const holdingTarget = Math.max(0, num(finance.holdingPotTarget));
    const holdingTopUp = Math.max(0, holdingTarget - holdingBalance);
    const potsDue = activePots(finance).reduce((sum, row) => sum + Math.max(0, num(row.plannedContribution)), 0);
    const totalReserved = commitments + billsDue + holdingTopUp + potsDue + protectedCash;
    return {
      availableCash: round2(availableCash), commitments: round2(commitments), billsDue: round2(billsDue),
      holdingBalance: round2(holdingBalance), holdingTarget: round2(holdingTarget), holdingTopUp: round2(holdingTopUp),
      potsDue: round2(potsDue), protectedCash: round2(protectedCash), totalReserved: round2(totalReserved),
      safeSurplus: round2(Math.max(0, availableCash - totalReserved))
    };
  }

  function safeRelease(finance) { return financeSummary(finance).safeSurplus; }

  function missionIsActive(mission) {
    return !!mission && !['COMPLETE','CANCELLED'].includes(upper(mission.status));
  }

  function holdingAnnualIncome(row) {
    const direct = Math.max(0, num(row?.annualIncomeGbp));
    if (direct > 0) return direct;
    return Math.max(0, num(row?.shares)) * Math.max(0, num(row?.annualDpsGbp));
  }

  function annualIncome(state) {
    return (state.squad?.holdings || []).reduce((sum, row) => sum + holdingAnnualIncome(row), 0);
  }

  function pageLinks() {
    return [
      ['index.html','Nexus'], ['finance.html','Finance'], ['scouting.html','Scouting'], ['transfer.html','Transfer'],
      ['registration.html','Registration'], ['squad.html','Squad'], ['income.html','Income'], ['match-report.html','Match Report'],
      ['club-control.html','Club Control'], ['system-health.html','System Health']
    ];
  }

  function currentPageFile() {
    const file = String(location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return file || 'index.html';
  }

  function renderNavigation() {
    const nav = byId('auroraNav');
    if (!nav) return;
    const current = currentPageFile();
    const links = pageLinks().map(([href,label]) => {
      const active = href === current;
      return `<a href="${href}"${active ? ' aria-current="page"' : ''}>${active ? '<strong>' : ''}${esc(label)}${active ? '</strong>' : ''}</a>`;
    }).join('<br>');
    nav.setAttribute('aria-label','Aurora Clean navigation');
    nav.innerHTML = `<details id="auroraCleanMenu"><summary>☰ Aurora Menu</summary><div role="navigation" aria-label="Aurora departments">${links}</div></details>`;
  }

  function renderNexus() {
    const state = readState();
    const income = annualIncome(state);
    setText('nexusFinance', `Safe release ${money(safeRelease(state.finance))}`);
    setText('nexusScouting', `${state.scouting.candidates.filter(x => x.approved).length} approved candidate(s)`);
    setText('nexusTransfer', state.transfer.mission ? `${state.transfer.mission.status} ${money(state.transfer.mission.budget)}` : 'No mission');
    setText('nexusRegistration', `${state.registration.receipts.length} receipt(s)`);
    setText('nexusSquad', `${state.squad.holdings.length} account position(s)`);
    setText('nexusIncome', `${money(income)} annual / ${money(income / 12)} monthly`);
  }

  function readFinanceForm(finance) {
    finance.expectedWages = Math.max(0, num(byId('financeExpectedWages')?.value));
    finance.wagesReceived = Math.max(0, num(byId('financeWagesReceived')?.value));
    finance.availableCash = Math.max(0, num(byId('financeAvailable')?.value));
    finance.commitments = Math.max(0, num(byId('financeCommitments')?.value));
    finance.protectedCash = Math.max(0, num(byId('financeProtected')?.value));
    finance.holdingPotBalance = Math.max(0, num(byId('financeHoldingBalance')?.value));
    finance.holdingPotTarget = Math.max(0, num(byId('financeHoldingTarget')?.value));
  }

  function renderFinance() {
    const state = readState(), finance = state.finance, summary = financeSummary(finance), mission = state.transfer.mission;
    const fields = {
      financeExpectedWages: finance.expectedWages, financeWagesReceived: finance.wagesReceived,
      financeAvailable: finance.availableCash, financeCommitments: finance.commitments,
      financeProtected: finance.protectedCash, financeHoldingBalance: finance.holdingPotBalance,
      financeHoldingTarget: finance.holdingPotTarget
    };
    Object.entries(fields).forEach(([id,value]) => { if (byId(id)) byId(id).value = value; });
    setText('financeWageDifference', money(num(finance.wagesReceived) - num(finance.expectedWages)));
    setText('financeBillsDue', money(summary.billsDue));
    setText('financeHoldingTopUp', money(summary.holdingTopUp));
    setText('financePotsDue', money(summary.potsDue));
    setText('financeReservedTotal', money(summary.totalReserved));
    setText('financeSafeRelease', money(summary.safeSurplus));
    setHtml('financePlanBreakdown', `<li>Available cash: ${money(summary.availableCash)}</li><li>Other commitments: ${money(summary.commitments)}</li><li>Active bills: ${money(summary.billsDue)}</li><li>Holding Pot top-up: ${money(summary.holdingTopUp)}</li><li>Goal pot funding: ${money(summary.potsDue)}</li><li>Protected cash: ${money(summary.protectedCash)}</li><li><strong>Safe release: ${money(summary.safeSurplus)}</strong></li>`);
    setHtml('financeBillsRows', finance.bills.length ? finance.bills.map(row => `<li>${esc(row.name)} — ${money(row.amount)}${row.dueDate ? ` — due ${esc(row.dueDate)}` : ''} — ${row.active === false ? 'PAUSED' : 'ACTIVE'} <button type="button" data-toggle-bill="${esc(row.id)}">${row.active === false ? 'Resume' : 'Pause'}</button> <button type="button" data-delete-bill="${esc(row.id)}">Delete</button></li>`).join('') : '<li>No bills added.</li>');
    setHtml('financePotsRows', finance.pots.length ? finance.pots.map(row => `<li>${esc(row.name)} — balance ${money(row.balance)} / target ${money(row.target)} — fund ${money(row.plannedContribution)} — ${row.active === false ? 'PAUSED' : 'ACTIVE'} <button type="button" data-toggle-pot="${esc(row.id)}">${row.active === false ? 'Resume' : 'Pause'}</button> <button type="button" data-delete-pot="${esc(row.id)}">Delete</button></li>`).join('') : '<li>No goal pots added.</li>');
    if (byId('financeReleaseAmount')) {
      const current = num(byId('financeReleaseAmount').value), max = summary.safeSurplus;
      byId('financeReleaseAmount').max = String(max);
      if (!current || current > max) byId('financeReleaseAmount').value = max.toFixed(2);
    }
    setText('financeMissionStatus', mission ? `${mission.status} — ${money(mission.budget)}${mission.id ? ` — ${mission.id}` : ''}` : 'No active mission');
    if (byId('financeRelease')) byId('financeRelease').disabled = missionIsActive(mission) || summary.safeSurplus <= 0;
    if (byId('financeCancelMission')) byId('financeCancelMission').disabled = !mission || !['DRAFT','READY'].includes(upper(mission.status));
    setText('financeMissionGuard', missionIsActive(mission) ? 'A Finance mission is already in progress. Complete it through Registration, or cancel it before the route is locked.' : summary.safeSurplus > 0 ? `Finance can release up to ${money(summary.safeSurplus)}.` : 'No safe surplus is available to release.');
  }

  function bindFinance() {
    byId('financeCalculate')?.addEventListener('click', () => {
      updateState(state => { readFinanceForm(state.finance); const summary = financeSummary(state.finance); state.finance.lastSafeRelease = summary.safeSurplus; state.finance.lastPlan = {...summary, calculatedAt:isoNow()}; state.finance.paydayHistory.unshift({...summary,id:uid('PLAN'),calculatedAt:isoNow()}); state.finance.paydayHistory = state.finance.paydayHistory.slice(0,24); });
      renderFinance();
    });
    byId('financeUseActualPay')?.addEventListener('click', () => { const actual = Math.max(0,num(byId('financeWagesReceived')?.value)); if (byId('financeAvailable')) byId('financeAvailable').value = actual.toFixed(2); });
    byId('financeAddBill')?.addEventListener('click', () => {
      const name = String(byId('financeBillName')?.value || '').trim(), amount = Math.max(0,num(byId('financeBillAmount')?.value)), dueDate = String(byId('financeBillDate')?.value || '').trim();
      if (!name || amount <= 0) return;
      updateState(state => state.finance.bills.push({id:uid('BILL'),name,amount:round2(amount),dueDate,active:true}));
      ['financeBillName','financeBillAmount','financeBillDate'].forEach(id => { if (byId(id)) byId(id).value=''; }); renderFinance();
    });
    byId('financeAddPot')?.addEventListener('click', () => {
      const name=String(byId('financePotName')?.value||'').trim(), balance=Math.max(0,num(byId('financePotBalance')?.value)), target=Math.max(0,num(byId('financePotTarget')?.value)), plannedContribution=Math.max(0,num(byId('financePotContribution')?.value));
      if (!name) return;
      updateState(state => state.finance.pots.push({id:uid('POT'),name,balance:round2(balance),target:round2(target),plannedContribution:round2(plannedContribution),active:true}));
      ['financePotName','financePotBalance','financePotTarget','financePotContribution'].forEach(id => { if(byId(id)) byId(id).value=''; }); renderFinance();
    });
    byId('financeBillsRows')?.addEventListener('click', event => {
      const toggle=event.target.closest('[data-toggle-bill]'), remove=event.target.closest('[data-delete-bill]'); if(!toggle&&!remove)return;
      updateState(state => { if(toggle){const row=state.finance.bills.find(item=>item.id===toggle.dataset.toggleBill);if(row)row.active=row.active===false;} if(remove)state.finance.bills=state.finance.bills.filter(item=>item.id!==remove.dataset.deleteBill); }); renderFinance();
    });
    byId('financePotsRows')?.addEventListener('click', event => {
      const toggle=event.target.closest('[data-toggle-pot]'), remove=event.target.closest('[data-delete-pot]'); if(!toggle&&!remove)return;
      updateState(state => { if(toggle){const row=state.finance.pots.find(item=>item.id===toggle.dataset.togglePot);if(row)row.active=row.active===false;} if(remove)state.finance.pots=state.finance.pots.filter(item=>item.id!==remove.dataset.deletePot); }); renderFinance();
    });
    byId('financeRelease')?.addEventListener('click', () => {
      updateState(state => { readFinanceForm(state.finance); const summary=financeSummary(state.finance); if(missionIsActive(state.transfer.mission))return; const requested=Math.max(0,num(byId('financeReleaseAmount')?.value)); if(requested<=0||requested>summary.safeSurplus+0.005)return; state.finance.lastSafeRelease=summary.safeSurplus; state.finance.lastPlan={...summary,calculatedAt:isoNow()}; state.transfer.mission={id:uid('MISSION'),budget:round2(requested),approvedBudget:round2(requested),status:'DRAFT',source:'Finance',createdAt:isoNow(),updatedAt:isoNow(),financeSnapshot:{...summary}}; state.transfer.route=null; }); renderFinance();
    });
    byId('financeCancelMission')?.addEventListener('click', () => {
      updateState(state => { const mission=state.transfer.mission; if(!mission||!['DRAFT','READY'].includes(upper(mission.status)))return; mission.status='CANCELLED'; mission.updatedAt=isoNow(); state.transfer.route=null; }); renderFinance();
    });
  }

  function renderScouting() {
    const state=readState(); if(byId('scoutingStrategy'))byId('scoutingStrategy').value=state.scouting.strategy; const rows=state.scouting.candidates||[];
    setHtml('scoutingRows', rows.length ? rows.map((row,index)=>`<li>${esc(row.ticker)} — ${esc(row.name)} — Yield ${num(row.yieldPct).toFixed(2)}% — ${row.approved?'APPROVED':'WATCH'} <button data-approve="${index}">${row.approved?'Unapprove':'Approve'}</button></li>`).join('') : '<li>No candidates yet.</li>');
    document.querySelectorAll('[data-approve]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.approve);updateState(next=>{next.scouting.candidates[index].approved=!next.scouting.candidates[index].approved;});renderScouting();}));
  }

  function bindScouting() {
    byId('scoutingStrategy')?.addEventListener('change',event=>updateState(state=>{state.scouting.strategy=event.target.value;}));
    byId('addCandidate')?.addEventListener('click',()=>{const ticker=String(byId('candidateTicker')?.value||'').trim().toUpperCase(),name=String(byId('candidateName')?.value||'').trim(),yieldPct=Math.max(0,num(byId('candidateYield')?.value));if(!ticker)return;updateState(state=>state.scouting.candidates.push({ticker,name:name||ticker,yieldPct,approved:false}));['candidateTicker','candidateName','candidateYield'].forEach(id=>{if(byId(id))byId(id).value='';});renderScouting();});
  }

  function buildAllocations(state) {
    const mission=state.transfer.mission; if(!mission||!['DRAFT','READY'].includes(upper(mission.status)))return[]; const approved=state.scouting.candidates.filter(row=>row.approved); if(!approved.length||!(mission.budget>0))return[];
    const each=mission.budget/approved.length; const allocations=approved.map(row=>({ticker:row.ticker,name:row.name,yieldPct:row.yieldPct,amount:Number(each.toFixed(2)),expectedAnnualIncome:Number((each*row.yieldPct/100).toFixed(2))}));
    const allocated=allocations.reduce((sum,row)=>sum+row.amount,0),delta=round2(mission.budget-allocated); if(allocations.length&&delta)allocations[allocations.length-1].amount=round2(allocations[allocations.length-1].amount+delta); return allocations;
  }

  function renderTransfer() {
    const state=readState(),mission=state.transfer.mission,route=state.transfer.route; setText('transferMission',mission?`${mission.status} — ${money(mission.budget)}`:'No Finance mission');
    if(route){setHtml('transferRows',route.allocations.map(row=>`<li>${esc(row.ticker)} — ${money(row.amount)} — est. income ${money(row.expectedAnnualIncome)}</li>`).join(''));setText('transferRouteStatus',route.locked?'LOCKED':'PREVIEW');}
    else{const preview=buildAllocations(state);setHtml('transferRows',preview.length?preview.map(row=>`<li>${esc(row.ticker)} — ${money(row.amount)} — est. income ${money(row.expectedAnnualIncome)}</li>`).join(''):'<li>No allocation preview.</li>');setText('transferRouteStatus',preview.length?'PREVIEW READY':'WAITING');}
  }

  function bindTransfer() {
    byId('transferBuild')?.addEventListener('click',()=>{updateState(state=>{const allocations=buildAllocations(state);if(!allocations.length)return;state.transfer.route={id:uid('ROUTE'),missionId:state.transfer.mission.id,strategy:state.scouting.strategy,allocations,locked:false,createdAt:isoNow()};state.transfer.mission.status='READY';state.transfer.mission.updatedAt=isoNow();});renderTransfer();});
    byId('transferLock')?.addEventListener('click',()=>{updateState(state=>{if(!state.transfer.route?.allocations?.length)return;state.transfer.route.locked=true;state.transfer.route.lockedAt=isoNow();state.transfer.mission.status='LOCKED';state.transfer.mission.updatedAt=isoNow();});renderTransfer();});
  }

  function renderRegistration() {
    const state=readState(),route=state.transfer.route; setText('registrationStatus',route?.locked?'Locked route ready to register':'No locked route'); setHtml('registrationRows',route?.locked?route.allocations.map(row=>`<li>${esc(row.ticker)} — ${money(row.amount)}</li>`).join(''):'<li>No executable route.</li>'); setText('registrationReceipts',`${state.registration.receipts.length} receipt(s) recorded`);
  }

  function bindRegistration() {
    byId('registerRoute')?.addEventListener('click',()=>{updateState(state=>{const route=state.transfer.route;if(!route?.locked||upper(state.transfer.mission?.status)==='COMPLETE')return;route.allocations.forEach(row=>{state.registration.receipts.push({id:uid('RECEIPT'),ticker:row.ticker,name:row.name,amount:row.amount,registeredAt:isoNow()});const existing=state.squad.holdings.find(h=>h.ticker===row.ticker&&String(h.account||'')==='Clean Test');const assumedPrice=1,shares=row.amount/assumedPrice,annualDpsGbp=row.yieldPct/100;if(existing){existing.shares+=shares;existing.bookCostGbp+=row.amount;}else{state.squad.holdings.push({account:'Clean Test',ticker:row.ticker,name:row.name,shares,bookCostGbp:row.amount,avgCostGbp:1,livePriceGbp:1,marketValueGbp:row.amount,annualDpsGbp,annualIncomeGbp:shares*annualDpsGbp,status:'ACTIVE'});}});state.transfer.mission.status='COMPLETE';state.transfer.mission.updatedAt=isoNow();});renderRegistration();});
  }

  function renderSquad() {
    const state=readState(),rows=state.squad.holdings||[];
    const totalBook=rows.reduce((sum,row)=>sum+Math.max(0,num(row.bookCostGbp)),0);
    const totalValue=rows.reduce((sum,row)=>sum+Math.max(0,num(row.marketValueGbp || (num(row.shares)*num(row.livePriceGbp)))),0);
    const totalIncome=rows.reduce((sum,row)=>sum+holdingAnnualIncome(row),0);
    setText('squadCount',`${rows.length} account position(s)`);
    setText('squadSource',state.squad.importedAt?`Source: live Aurora browser state • imported ${new Date(state.squad.importedAt).toLocaleString('en-GB')}`:'Source: clean rebuild only');
    setText('squadTotals',`Book ${money(totalBook)} • Market ${money(totalValue)} • Annual income ${money(totalIncome)}`);
    setHtml('squadRows',rows.length?rows.map(row=>`<li class="holding-card"><div class="holding-head"><div><span class="holding-ticker">${esc(row.ticker)}</span><strong class="holding-name">${esc(row.name)}</strong></div><span class="holding-broker">${esc(row.account||'Unspecified')}</span></div><div class="holding-metrics"><div><span>SHARES</span><strong>${num(row.shares).toFixed(4)}</strong></div><div><span>BOOK VALUE</span><strong>${money(row.bookCostGbp)}</strong></div><div><span>ANNUAL INCOME</span><strong>${money(holdingAnnualIncome(row))}</strong></div></div></li>`).join(''):'<li>No holdings yet.</li>');
  }

  function bindSquad() {
    byId('squadImportReal')?.addEventListener('click',()=>{const result=importRealHoldings();setText('squadImportStatus',result.message);renderSquad();});
  }

  function renderIncome() {
    const state=readState(),annual=annualIncome(state); setText('incomeAnnual',money(annual)); setText('incomeMonthly',money(annual/12)); setHtml('incomeDividendRows',state.income.dividends.length?state.income.dividends.map(row=>`<li>${esc(row.ticker)} — ${esc(row.payDate)} — ${money(row.amount)}</li>`).join(''):'<li>No dividend events yet.</li>');
  }

  function bindIncome() {
    byId('addDividend')?.addEventListener('click',()=>{const ticker=String(byId('dividendTicker')?.value||'').trim().toUpperCase(),payDate=String(byId('dividendDate')?.value||'').trim(),amount=Math.max(0,num(byId('dividendAmount')?.value));if(!ticker||!payDate)return;updateState(state=>state.income.dividends.push({ticker,payDate,amount}));renderIncome();});
  }

  function renderMatchReport() {
    const state=readState(),annual=annualIncome(state); setText('matchSummary',`Holdings: ${state.squad.holdings.length}. Annual income: ${money(annual)}. Transfer mission: ${state.transfer.mission?.status||'NONE'}.`);
  }

  function bindMatchReport() {
    byId('buildMatchReport')?.addEventListener('click',()=>{updateState(state=>{const annual=annualIncome(state);state.matchReport.lastBuiltAt=isoNow();state.matchReport.summary=`Holdings ${state.squad.holdings.length}; annual income ${money(annual)}; mission ${state.transfer.mission?.status||'NONE'}.`;});renderMatchReport();});
  }

  function renderClubControl() { setText('controlBuild',BUILD); setText('controlStorageKey',STATE_KEY); }

  function bindClubControl() {
    byId('resetCleanState')?.addEventListener('click',()=>{localStorage.removeItem(STATE_KEY);writeState(clone(DEFAULT_STATE));location.reload();});
  }

  function renderSystemHealth() {
    const state=readState(),f=financeSummary(state.finance); const checks=[['State readable',!!state],['Finance present',!!state.finance],['Finance calculation valid',Number.isFinite(f.safeSurplus)&&f.safeSurplus>=0],['Finance mission budget safe',!state.transfer.mission?.financeSnapshot||num(state.transfer.mission.budget)<=num(state.transfer.mission.financeSnapshot.safeSurplus)+0.005],['Scouting present',!!state.scouting],['Transfer present',!!state.transfer],['Registration present',!!state.registration],['Squad present',!!state.squad],['Squad holdings valid',Array.isArray(state.squad.holdings)&&state.squad.holdings.every(row=>row.ticker&&num(row.shares)>=0)],['Income present',!!state.income]];
    setHtml('healthRows',checks.map(([label,ok])=>`<li>${esc(label)} — ${ok?'PASS':'FAIL'}</li>`).join('')); setText('healthBuild',BUILD);
  }

  const pages={
    nexus:[renderNexus,null], finance:[renderFinance,bindFinance], scouting:[renderScouting,bindScouting], transfer:[renderTransfer,bindTransfer], registration:[renderRegistration,bindRegistration], squad:[renderSquad,bindSquad], income:[renderIncome,bindIncome], 'match-report':[renderMatchReport,bindMatchReport], 'club-control':[renderClubControl,bindClubControl], 'system-health':[renderSystemHealth,null]
  };

  function boot() {
    renderNavigation(); const page=document.body?.dataset?.page||'',handlers=pages[page]; if(!handlers)return; handlers[1]?.(); handlers[0]?.();
    window.addEventListener('aurora-clean:state',handlers[0]); window.addEventListener('storage',event=>{if(event.key===STATE_KEY)handlers[0]?.();});
    window.AuroraClean=Object.freeze({BUILD,STATE_KEY,readState,writeState,updateState,safeRelease,financeSummary,annualIncome,importRealHoldings});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();