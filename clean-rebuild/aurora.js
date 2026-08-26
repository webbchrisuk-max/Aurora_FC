(() => {
  'use strict';

  const BUILD = '20260826-clean-rebuild-1';
  const STATE_KEY = 'aurora-clean:state:v1';

  const DEFAULT_STATE = {
    version: 1,
    finance: {
      availableCash: 2600,
      commitments: 1086.13,
      protectedCash: 300,
      lastSafeRelease: 1213.87
    },
    scouting: {
      strategy: 'sustainable',
      candidates: []
    },
    transfer: {
      mission: null,
      route: null
    },
    registration: {
      receipts: []
    },
    squad: {
      holdings: []
    },
    income: {
      dividends: []
    },
    matchReport: {
      lastBuiltAt: null,
      summary: ''
    }
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

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : clone(DEFAULT_STATE);
    } catch (_) {
      return clone(DEFAULT_STATE);
    }
  }

  function writeState(next) {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora-clean:state', {detail: next}));
    return next;
  }

  function updateState(mutator) {
    const state = readState();
    mutator(state);
    return writeState(state);
  }

  function safeRelease(finance) {
    return Math.max(0, num(finance.availableCash) - num(finance.commitments) - num(finance.protectedCash));
  }

  function annualIncome(state) {
    return (state.squad?.holdings || []).reduce((sum, row) => {
      return sum + Math.max(0, num(row.shares)) * Math.max(0, num(row.annualDpsGbp));
    }, 0);
  }

  function pageLinks() {
    return [
      ['index.html','Nexus'],
      ['finance.html','Finance'],
      ['scouting.html','Scouting'],
      ['transfer.html','Transfer'],
      ['registration.html','Registration'],
      ['squad.html','Squad'],
      ['income.html','Income'],
      ['match-report.html','Match Report'],
      ['club-control.html','Club Control'],
      ['system-health.html','System Health']
    ];
  }

  function renderNavigation() {
    const nav = byId('auroraNav');
    if (!nav) return;
    nav.innerHTML = pageLinks().map(([href, label]) => `<a href="${href}">${label}</a>`).join(' | ');
  }

  function renderNexus() {
    const state = readState();
    const income = annualIncome(state);
    setText('nexusFinance', `Safe release ${money(safeRelease(state.finance))}`);
    setText('nexusScouting', `${state.scouting.candidates.filter(x => x.approved).length} approved candidate(s)`);
    setText('nexusTransfer', state.transfer.mission ? `${state.transfer.mission.status} ${money(state.transfer.mission.budget)}` : 'No mission');
    setText('nexusRegistration', `${state.registration.receipts.length} receipt(s)`);
    setText('nexusSquad', `${state.squad.holdings.length} holding(s)`);
    setText('nexusIncome', `${money(income)} annual / ${money(income / 12)} monthly`);
  }

  function renderFinance() {
    const state = readState();
    const finance = state.finance;
    if (byId('financeAvailable')) byId('financeAvailable').value = finance.availableCash;
    if (byId('financeCommitments')) byId('financeCommitments').value = finance.commitments;
    if (byId('financeProtected')) byId('financeProtected').value = finance.protectedCash;
    setText('financeSafeRelease', money(safeRelease(finance)));
    setText('financeMissionStatus', state.transfer.mission ? `${state.transfer.mission.status} — ${money(state.transfer.mission.budget)}` : 'No active mission');
  }

  function bindFinance() {
    byId('financeCalculate')?.addEventListener('click', () => {
      updateState(state => {
        state.finance.availableCash = num(byId('financeAvailable')?.value);
        state.finance.commitments = num(byId('financeCommitments')?.value);
        state.finance.protectedCash = num(byId('financeProtected')?.value);
        state.finance.lastSafeRelease = safeRelease(state.finance);
      });
      renderFinance();
    });

    byId('financeRelease')?.addEventListener('click', () => {
      updateState(state => {
        const budget = safeRelease(state.finance);
        state.finance.lastSafeRelease = budget;
        state.transfer.mission = {
          id: `MISSION-${Date.now()}`,
          budget,
          status: 'DRAFT',
          createdAt: new Date().toISOString()
        };
        state.transfer.route = null;
      });
      renderFinance();
    });
  }

  function renderScouting() {
    const state = readState();
    if (byId('scoutingStrategy')) byId('scoutingStrategy').value = state.scouting.strategy;
    const rows = state.scouting.candidates || [];
    setHtml('scoutingRows', rows.length ? rows.map((row, index) => `
      <li>
        ${esc(row.ticker)} — ${esc(row.name)} — Yield ${num(row.yieldPct).toFixed(2)}% — ${row.approved ? 'APPROVED' : 'WATCH'}
        <button data-approve="${index}">${row.approved ? 'Unapprove' : 'Approve'}</button>
      </li>`).join('') : '<li>No candidates yet.</li>');
    document.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.approve);
      updateState(next => { next.scouting.candidates[index].approved = !next.scouting.candidates[index].approved; });
      renderScouting();
    }));
  }

  function bindScouting() {
    byId('scoutingStrategy')?.addEventListener('change', event => {
      updateState(state => { state.scouting.strategy = event.target.value; });
    });
    byId('addCandidate')?.addEventListener('click', () => {
      const ticker = String(byId('candidateTicker')?.value || '').trim().toUpperCase();
      const name = String(byId('candidateName')?.value || '').trim();
      const yieldPct = Math.max(0, num(byId('candidateYield')?.value));
      if (!ticker) return;
      updateState(state => {
        state.scouting.candidates.push({ticker, name: name || ticker, yieldPct, approved: false});
      });
      byId('candidateTicker').value = '';
      byId('candidateName').value = '';
      byId('candidateYield').value = '';
      renderScouting();
    });
  }

  function buildAllocations(state) {
    const mission = state.transfer.mission;
    if (!mission || !['DRAFT','READY'].includes(String(mission.status).toUpperCase())) return [];
    const approved = state.scouting.candidates.filter(row => row.approved);
    if (!approved.length || !(mission.budget > 0)) return [];
    const each = mission.budget / approved.length;
    return approved.map(row => ({
      ticker: row.ticker,
      name: row.name,
      yieldPct: row.yieldPct,
      amount: Number(each.toFixed(2)),
      expectedAnnualIncome: Number((each * row.yieldPct / 100).toFixed(2))
    }));
  }

  function renderTransfer() {
    const state = readState();
    const mission = state.transfer.mission;
    setText('transferMission', mission ? `${mission.status} — ${money(mission.budget)}` : 'No Finance mission');
    const route = state.transfer.route;
    if (route) {
      setHtml('transferRows', route.allocations.map(row => `<li>${esc(row.ticker)} — ${money(row.amount)} — est. income ${money(row.expectedAnnualIncome)}</li>`).join(''));
      setText('transferRouteStatus', route.locked ? 'LOCKED' : 'PREVIEW');
    } else {
      const preview = buildAllocations(state);
      setHtml('transferRows', preview.length ? preview.map(row => `<li>${esc(row.ticker)} — ${money(row.amount)} — est. income ${money(row.expectedAnnualIncome)}</li>`).join('') : '<li>No allocation preview.</li>');
      setText('transferRouteStatus', preview.length ? 'PREVIEW READY' : 'WAITING');
    }
  }

  function bindTransfer() {
    byId('transferBuild')?.addEventListener('click', () => {
      updateState(state => {
        const allocations = buildAllocations(state);
        if (!allocations.length) return;
        state.transfer.route = {
          id: `ROUTE-${Date.now()}`,
          missionId: state.transfer.mission.id,
          strategy: state.scouting.strategy,
          allocations,
          locked: false
        };
        state.transfer.mission.status = 'READY';
      });
      renderTransfer();
    });
    byId('transferLock')?.addEventListener('click', () => {
      updateState(state => {
        if (!state.transfer.route?.allocations?.length) return;
        state.transfer.route.locked = true;
        state.transfer.mission.status = 'LOCKED';
      });
      renderTransfer();
    });
  }

  function renderRegistration() {
    const state = readState();
    const route = state.transfer.route;
    setText('registrationStatus', route?.locked ? 'Locked route ready to register' : 'No locked route');
    setHtml('registrationRows', route?.locked ? route.allocations.map(row => `<li>${esc(row.ticker)} — ${money(row.amount)}</li>`).join('') : '<li>No executable route.</li>');
    setText('registrationReceipts', `${state.registration.receipts.length} receipt(s) recorded`);
  }

  function bindRegistration() {
    byId('registerRoute')?.addEventListener('click', () => {
      updateState(state => {
        const route = state.transfer.route;
        if (!route?.locked) return;
        route.allocations.forEach(row => {
          const receipt = {
            id: `RECEIPT-${Date.now()}-${row.ticker}`,
            ticker: row.ticker,
            name: row.name,
            amount: row.amount,
            registeredAt: new Date().toISOString()
          };
          state.registration.receipts.push(receipt);
          const existing = state.squad.holdings.find(h => h.ticker === row.ticker);
          const assumedPrice = 1;
          const shares = row.amount / assumedPrice;
          const annualDpsGbp = row.yieldPct / 100;
          if (existing) {
            existing.shares += shares;
            existing.bookCostGbp += row.amount;
          } else {
            state.squad.holdings.push({
              ticker: row.ticker,
              name: row.name,
              shares,
              bookCostGbp: row.amount,
              annualDpsGbp,
              status: 'ACTIVE'
            });
          }
        });
        state.transfer.mission.status = 'COMPLETE';
      });
      renderRegistration();
    });
  }

  function renderSquad() {
    const state = readState();
    setHtml('squadRows', state.squad.holdings.length ? state.squad.holdings.map(row => `<li>${esc(row.ticker)} — ${num(row.shares).toFixed(2)} shares — book ${money(row.bookCostGbp)}</li>`).join('') : '<li>No holdings yet.</li>');
    setText('squadCount', `${state.squad.holdings.length} holding(s)`);
  }

  function renderIncome() {
    const state = readState();
    const annual = annualIncome(state);
    setText('incomeAnnual', money(annual));
    setText('incomeMonthly', money(annual / 12));
    setHtml('incomeDividendRows', state.income.dividends.length ? state.income.dividends.map(row => `<li>${esc(row.ticker)} — ${esc(row.payDate)} — ${money(row.amount)}</li>`).join('') : '<li>No dividend events yet.</li>');
  }

  function bindIncome() {
    byId('addDividend')?.addEventListener('click', () => {
      const ticker = String(byId('dividendTicker')?.value || '').trim().toUpperCase();
      const payDate = String(byId('dividendDate')?.value || '').trim();
      const amount = Math.max(0, num(byId('dividendAmount')?.value));
      if (!ticker || !payDate) return;
      updateState(state => { state.income.dividends.push({ticker, payDate, amount}); });
      renderIncome();
    });
  }

  function renderMatchReport() {
    const state = readState();
    const annual = annualIncome(state);
    const summary = `Holdings: ${state.squad.holdings.length}. Annual income: ${money(annual)}. Transfer mission: ${state.transfer.mission?.status || 'NONE'}.`;
    setText('matchSummary', summary);
  }

  function bindMatchReport() {
    byId('buildMatchReport')?.addEventListener('click', () => {
      updateState(state => {
        const annual = annualIncome(state);
        state.matchReport.lastBuiltAt = new Date().toISOString();
        state.matchReport.summary = `Holdings ${state.squad.holdings.length}; annual income ${money(annual)}; mission ${state.transfer.mission?.status || 'NONE'}.`;
      });
      renderMatchReport();
    });
  }

  function renderClubControl() {
    setText('controlBuild', BUILD);
    setText('controlStorageKey', STATE_KEY);
  }

  function bindClubControl() {
    byId('resetCleanState')?.addEventListener('click', () => {
      localStorage.removeItem(STATE_KEY);
      writeState(clone(DEFAULT_STATE));
      location.reload();
    });
  }

  function renderSystemHealth() {
    const state = readState();
    const checks = [
      ['State readable', !!state],
      ['Finance present', !!state.finance],
      ['Scouting present', !!state.scouting],
      ['Transfer present', !!state.transfer],
      ['Registration present', !!state.registration],
      ['Squad present', !!state.squad],
      ['Income present', !!state.income]
    ];
    setHtml('healthRows', checks.map(([label, ok]) => `<li>${esc(label)} — ${ok ? 'PASS' : 'FAIL'}</li>`).join(''));
    setText('healthBuild', BUILD);
  }

  const pages = {
    nexus: [renderNexus, null],
    finance: [renderFinance, bindFinance],
    scouting: [renderScouting, bindScouting],
    transfer: [renderTransfer, bindTransfer],
    registration: [renderRegistration, bindRegistration],
    squad: [renderSquad, null],
    income: [renderIncome, bindIncome],
    'match-report': [renderMatchReport, bindMatchReport],
    'club-control': [renderClubControl, bindClubControl],
    'system-health': [renderSystemHealth, null]
  };

  function boot() {
    renderNavigation();
    const page = document.body?.dataset?.page || '';
    const handlers = pages[page];
    if (!handlers) return;
    handlers[1]?.();
    handlers[0]?.();
    window.addEventListener('aurora-clean:state', handlers[0]);
    window.addEventListener('storage', event => { if (event.key === STATE_KEY) handlers[0]?.(); });
    window.AuroraClean = Object.freeze({BUILD, STATE_KEY, readState, writeState, updateState, safeRelease, annualIncome});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
