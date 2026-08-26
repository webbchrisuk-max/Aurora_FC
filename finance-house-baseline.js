(() => {
  'use strict';

  const BUILD = '20260826-house-baseline-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';
  const VERSION = '20260826-house-baseline-v1';
  const CASH = 18771.14;
  const OPENING_HISTORICAL_SPEND = 153.98;
  const ROOMS = ['Games Room','Living Room','Hallway','Kitchen','Whole House'];
  const SNAPSHOT = {
    'Games Room': { estimated: 2302.77, actual: 2157.85, reserved: 0 },
    'Living Room': { estimated: 4964.89, actual: 654.89, reserved: 4300 },
    'Hallway': { estimated: 2594.00, actual: 194.00, reserved: 2400.00 },
    'Kitchen': { estimated: 5215.00, actual: 95.00, reserved: 5120.00 },
    'Whole House': { estimated: 5360.00, actual: 241.73, reserved: 5100.00 }
  };

  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const isoNow = () => new Date().toISOString();
  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  };

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function findHousePotIndex(pots) {
    let idx = pots.findIndex(p => ['house fund','house'].includes(norm(p?.name)));
    if (idx >= 0) return idx;
    idx = pots.findIndex(p => String(p?.id || '').toLowerCase().includes('house'));
    if (idx >= 0) return idx;
    return pots.findIndex(p => /\bhouse\b/.test(norm(p?.name)));
  }

  function canonicalEntries() {
    const at = isoNow();
    const rows = [];
    ROOMS.forEach((room, index) => {
      const x = SNAPSHOT[room];
      const completedEstimate = Math.max(0, x.estimated - x.reserved);
      if (x.actual > 0 || completedEstimate > 0) {
        rows.push({
          id: `HOUSE-BASE-${index + 1}-ACTUAL`,
          name: `${room} completed spend`,
          estimated: Number(completedEstimate.toFixed(2)),
          actual: x.actual,
          due: '',
          room,
          category: 'House project',
          status: 'historical',
          deducted: false,
          paidDate: '',
          notes: 'Corrected House Project baseline — 26 Aug 2026',
          createdAt: at,
          updatedAt: at
        });
      }
      if (x.reserved > 0) {
        rows.push({
          id: `HOUSE-BASE-${index + 1}-RESERVED`,
          name: `${room} remaining reserved work`,
          estimated: x.reserved,
          actual: 0,
          due: '',
          room,
          category: 'House project',
          status: 'reserved',
          deducted: false,
          paidDate: '',
          notes: 'Corrected House Project baseline — 26 Aug 2026',
          createdAt: at,
          updatedAt: at
        });
      }
    });
    return rows;
  }

  function backup(raw, state) {
    try {
      if (raw) localStorage.setItem(BACKUP_KEY, raw);
      localStorage.setItem(BACKUP_META_KEY, JSON.stringify({
        at: isoNow(),
        reason: 'finance-house-baseline-correction',
        schemaVersion: Number(state?.schemaVersion) || null
      }));
    } catch (_) {}
  }

  function reconcile() {
    const raw = localStorage.getItem(STATE_KEY);
    const state = readState();
    if (!state?.finance) return false;
    const currentHp = state.finance.houseProject && typeof state.finance.houseProject === 'object'
      ? state.finance.houseProject : {};
    if (currentHp.figureCorrectionVersion === VERSION) return true;

    backup(raw, state);
    const next = clone(state);
    const finance = { ...(next.finance || {}) };
    const pots = [...(finance.pots || [])];
    let pi = findHousePotIndex(pots);
    const now = isoNow();
    const actualSpent = 3497.45;
    const totalFunded = Number((CASH + actualSpent).toFixed(2));
    const currentTarget = num(currentHp.target || (pi >= 0 ? pots[pi]?.target : 0));
    const target = currentTarget > 0 ? Math.min(currentTarget, totalFunded) : totalFunded;

    if (pi < 0) {
      pots.push({
        id: 'POT-HOUSE-FUND',
        name: 'House Fund',
        balance: CASH,
        target,
        fundingOverride: 0,
        fundingPerPayday: 0,
        deadline: '',
        priority: 1,
        goalMode: 'funded-progress',
        spent: actualSpent,
        archived: false,
        createdAt: now,
        updatedAt: now
      });
      pi = pots.length - 1;
    } else {
      pots[pi] = {
        ...pots[pi],
        name: pots[pi].name || 'House Fund',
        balance: CASH,
        target,
        goalMode: 'funded-progress',
        spent: actualSpent,
        archived: false,
        updatedAt: now
      };
    }

    const houseProject = {
      ...currentHp,
      target,
      openingHistoricalSpend: OPENING_HISTORICAL_SPEND,
      rooms: [...ROOMS],
      entries: canonicalEntries(),
      actions: Array.isArray(currentHp.actions) ? currentHp.actions : [],
      figureCorrectionVersion: VERSION,
      figureCorrectionAt: now,
      updatedAt: now
    };

    finance.pots = pots;
    finance.houseProject = houseProject;
    finance.lastCalculatedAt = now;
    next.finance = finance;
    next.updatedAt = now;

    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    setTimeout(() => window.AuroraFinanceHouseProjects?.render?.(), 0);
    return true;
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (reconcile()) {
        window.AuroraFinanceHouseBaseline = Object.freeze({
          build: BUILD,
          ready: true,
          correctionVersion: VERSION,
          houseFundCash: CASH,
          estimatedReserved: 16920.00,
          availableAfterCosts: 1851.14,
          actualSpent: 3497.45,
          totalFunded: 22268.59,
          remainingToFund: 0
        });
        return;
      }
      tries += 1;
      if (tries < 400) setTimeout(wait, 25);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();