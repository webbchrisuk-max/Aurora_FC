(() => {
  'use strict';

  const BUILD = '20260820-finance-live-finalize-2';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED']);

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Math.max(0, Number(value) || 0));

  const cleanName = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const isHoldingPotName = value => cleanName(value) === 'holding pot';

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function activeMission(state) {
    const mission = state?.mission;
    return Boolean(mission && mission.status && !TERMINAL.has(String(mission.status).toUpperCase()));
  }

  function readinessAudit(state, c) {
    const activeBills = (state?.finance?.bills || []).filter(bill => !bill?.archived && !bill?.paid && bill?.included !== false);
    const critical = [];
    const warnings = [];

    activeBills.forEach(bill => {
      const frequency = String(bill?.frequency || 'one-off');
      if ((frequency === 'yearly' || frequency === 'one-off') && !parseLocalDate(bill?.due)) {
        critical.push(`${bill?.name || 'Bill'}: ${frequency} bill needs a due date`);
      }
      if (!String(bill?.fundingSource || '').trim()) {
        critical.push(`${bill?.name || 'Bill'}: funding source is missing`);
      }
    });

    const holdingFunded = activeBills.filter(bill => isHoldingPotName(bill?.fundingSource));
    const holdingPot = c?.auto?.holdingPot || (state?.finance?.pots || []).find(pot => !pot?.archived && isHoldingPotName(pot?.name));
    if (holdingFunded.length && !holdingPot) {
      critical.push(`Holding Pot is missing but ${holdingFunded.length} active bill${holdingFunded.length === 1 ? '' : 's'} use it`);
    }

    const fundingPlan = c?.fundingPlan || state?.finance?.fundingPolicy?.lastPlan;
    const scheduled = Math.max(0, Number(c?.auto?.potsDue) || 0);
    if (fundingPlan && Math.abs((Number(fundingPlan.allocated) || 0) - scheduled) > 0.011) {
      warnings.push(`Pot funding view is out of sync by ${money(Math.abs((Number(fundingPlan.allocated) || 0) - scheduled))}`);
    }

    const yesterday = Date.now() - 86400000;
    const stale = activeBills.filter(bill => {
      const due = parseLocalDate(bill?.due);
      return due && String(bill?.frequency || 'one-off') === 'one-off' && due.getTime() < yesterday;
    });
    if (stale.length) warnings.push(`${stale.length} overdue one-off bill${stale.length === 1 ? '' : 's'} still active`);

    const hasActiveMission = activeMission(state);
    return {
      critical,
      warnings,
      billStatus: critical.some(item => /bill needs a due date|funding source/.test(item)) ? 'ACTION' : 'READY',
      holdingStatus: holdingFunded.length ? (holdingPot ? 'READY' : 'MISSING') : 'NOT NEEDED',
      goalStatus: `${money(scheduled)} SCHEDULED`,
      missionStatus: hasActiveMission ? 'LOCKED' : 'OPEN',
      hasActiveMission
    };
  }

  function renderReadiness() {
    const state = readState();
    const control = window.Aurora2?.financePaydayControl;
    const items = [...document.querySelectorAll('.readiness-grid .readiness-item')];
    const badge = document.querySelector('.readiness-panel .readiness-badge');
    if (!state?.finance || typeof control?.paydayFundingPreview !== 'function' || items.length < 4 || !badge) return false;

    let c;
    try {
      c = control.paydayFundingPreview(state, state.finance.plan || {})?.c || {};
    } catch (error) {
      console.warn('[Aurora Finance readiness]', String(error?.message || error));
      return false;
    }

    const audit = readinessAudit(state, c);
    const values = [audit.billStatus, audit.holdingStatus, audit.goalStatus, audit.missionStatus];
    items.slice(0, 4).forEach((item, index) => {
      const strong = item.querySelector('strong');
      if (strong) strong.textContent = values[index];
    });

    if (audit.critical.length) {
      badge.className = 'readiness-badge block';
      badge.textContent = 'ACTION REQUIRED';
    } else if (audit.warnings.length) {
      badge.className = 'readiness-badge warn';
      badge.textContent = 'READY WITH NOTES';
    } else if (audit.hasActiveMission) {
      badge.className = 'readiness-badge ready';
      badge.textContent = 'MISSION ACTIVE';
    } else {
      badge.className = 'readiness-badge ready';
      badge.textContent = 'FINANCE READY';
    }

    let list = document.getElementById('financePlanningGaps');
    if (!list) {
      list = document.createElement('div');
      list.id = 'financePlanningGaps';
      list.className = 'planning-gap-list';
      document.querySelector('.readiness-panel .readiness-grid')?.insertAdjacentElement('afterend', list);
    }
    if (list) {
      const notes = [...audit.critical, ...audit.warnings];
      list.replaceChildren();
      notes.forEach(note => {
        const row = document.createElement('div');
        row.textContent = note;
        list.appendChild(row);
      });
    }

    document.documentElement.dataset.financeReadiness = 'live';
    window.AuroraFinanceReadiness = Object.freeze({
      build: BUILD,
      ready: true,
      billStatus: audit.billStatus,
      holdingStatus: audit.holdingStatus,
      goalStatus: audit.goalStatus,
      missionStatus: audit.missionStatus,
      critical: [...audit.critical],
      warnings: [...audit.warnings]
    });
    return true;
  }

  function apply() {
    const status = document.querySelector('.topbar .status');
    if (status) {
      const span = status.querySelector('span');
      const strong = status.querySelector('b');
      if (span) span.textContent = 'FINANCE';
      if (strong) strong.textContent = 'LIVE COMMAND';
    }

    const pill = document.querySelector('.finance-version-pill');
    if (pill) pill.textContent = 'LIVE DATA • CONTROLLED WRITES';

    const paydaySide = document.querySelector('#paydayPanel .finance-panel:last-child');
    if (paydaySide) {
      const kicker = paydaySide.querySelector('.finance-panel-kicker');
      if (kicker && /rebuild step|functionality/i.test(kicker.textContent || '')) kicker.textContent = 'Payday Operations';
    }

    renderReadiness();
    document.documentElement.dataset.financeLiveFinalized = 'true';
  }

  function boot() {
    apply();
    window.addEventListener('pageshow', () => setTimeout(apply, 0));
    window.addEventListener('focus', () => setTimeout(apply, 0));
    window.addEventListener('aurora2:state', () => setTimeout(apply, 0));
    window.addEventListener('storage', event => {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY) setTimeout(apply, 0);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setTimeout(apply, 0);
    });
    [100, 300, 700, 1200, 2500, 5000].forEach(delay => setTimeout(apply, delay));
    window.AuroraFinanceLiveFinalize = Object.freeze({ build: BUILD, ready: true, readiness: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
