(() => {
  'use strict';

  const BUILD = '20260823-finance-bill-complete-finalise-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';

  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  };
  const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const isoNow = () => new Date().toISOString();
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthKey = key => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
    d.setMonth(d.getMonth() + 1);
    return monthKey(d);
  };
  const parseLocalDate = value => {
    if (!value) return null;
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dateISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addMonthsClamped = (d, months) => {
    const x = new Date(d.getTime());
    const day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + months);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
    return x;
  };
  const nextDue = (date, frequency) => {
    const d = parseLocalDate(date);
    if (!d) return '';
    if (frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (frequency === '4-weeks') d.setDate(d.getDate() + 28);
    else if (frequency === '5-weeks') d.setDate(d.getDate() + 35);
    else if (frequency === 'monthly') return dateISO(addMonthsClamped(d, 1));
    else if (frequency === 'yearly') return dateISO(addMonthsClamped(d, 12));
    return dateISO(d);
  };
  const commitmentType = bill => {
    if (['fixed_monthly','rolling_monthly','recurring_yearly','one_off'].includes(bill?.commitmentType)) return bill.commitmentType;
    if (bill?.frequency === 'yearly') return 'recurring_yearly';
    if (bill?.frequency === 'monthly') return bill?.due ? 'fixed_monthly' : 'rolling_monthly';
    return 'one_off';
  };
  const uid = prefix => {
    try { if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`; } catch (_) {}
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return state && typeof state === 'object' ? state : null;
    } catch (_) { return null; }
  }

  function backup(raw, reason) {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      localStorage.setItem(BACKUP_KEY, raw);
      localStorage.setItem(BACKUP_META_KEY, JSON.stringify({ at: isoNow(), reason, schemaVersion: Number(parsed.schemaVersion) || null }));
    } catch (_) {}
  }

  function setStatus(message, tone = 'good') {
    const el = document.getElementById('financePotsBillsActionStatus');
    if (el) {
      el.textContent = message;
      el.className = `finance-action-status ${tone}`;
    }
  }

  function commitBill(id, actual) {
    const raw = localStorage.getItem(STATE_KEY);
    const current = readState();
    if (!current?.finance) throw new Error('Finance state is not available.');
    const finance = clone(current.finance);
    const bills = [...(finance.bills || [])];
    const pots = [...(finance.pots || [])];
    const payments = [...(finance.payments || [])];
    const bi = bills.findIndex(b => b.id === id);
    if (bi < 0) throw new Error('Bill could not be found.');

    const beforeBill = clone(bills[bi]);
    if (beforeBill.archived || beforeBill.paid || beforeBill.included === false) throw new Error('This bill is not available to complete.');

    const paidAt = isoNow();
    const completedDue = beforeBill.due || beforeBill.occurrenceMonth || '';
    const pi = pots.findIndex(p => !p.archived && p.name === beforeBill.fundingSource);
    const beforePot = pi >= 0 ? clone(pots[pi]) : null;

    if (pi >= 0) {
      const balance = num(pots[pi].balance);
      if (actual > balance + 0.005) throw new Error(`${pots[pi].name} does not have enough cash for this payment.`);
      pots[pi] = { ...pots[pi], balance: Number((balance - actual).toFixed(2)), updatedAt: paidAt };
    }

    payments.unshift({
      id: uid('PAY'), billId: id, billName: beforeBill.name, amount: actual,
      paidAt, fundingSource: beforeBill.fundingSource || 'Current Account',
      reversed: false, reversedAt: null, beforeBill, beforePot
    });

    const type = commitmentType(beforeBill);
    const completionMeta = {
      lastPaidAt: paidAt,
      lastActualPaid: actual,
      lastCompletedDue: completedDue,
      lastPaymentStatus: 'COMPLETED'
    };

    if (type === 'one_off') {
      bills[bi] = { ...beforeBill, ...completionMeta, paid: true, actualPaid: actual, updatedAt: paidAt };
    } else if (type === 'rolling_monthly') {
      bills[bi] = {
        ...beforeBill, ...completionMeta,
        due: '',
        occurrenceMonth: nextMonthKey(beforeBill.occurrenceMonth || monthKey()),
        paid: false,
        actualPaid: actual,
        updatedAt: paidAt
      };
    } else {
      const due = nextDue(beforeBill.due, beforeBill.frequency);
      if (!due) throw new Error('The next due date could not be calculated. Edit the bill and check its frequency/date.');
      bills[bi] = {
        ...beforeBill, ...completionMeta,
        due,
        paid: false,
        actualPaid: actual,
        updatedAt: paidAt
      };
    }

    backup(raw, 'pre-finance-bill-payment-finalise');
    const now = isoNow();
    const next = {
      ...current,
      updatedAt: now,
      finance: { ...finance, bills, pots, payments, lastCalculatedAt: now }
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    return bills[bi];
  }

  function handleComplete(event) {
    const button = event.target.closest?.('button[data-bill-complete]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      const current = readState();
      const bill = (current?.finance?.bills || []).find(b => b.id === button.dataset.billComplete);
      if (!bill) throw new Error('Bill could not be found.');
      const raw = prompt(`Actual amount paid for ${bill.name}`, num(bill.amount).toFixed(2));
      if (raw === null) return;
      const actual = Number(String(raw).replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(actual) || actual <= 0) throw new Error('Enter an actual amount greater than £0.');

      button.disabled = true;
      const updated = commitBill(bill.id, actual);
      const nextLabel = updated.paid ? 'Bill completed' : `Next due ${updated.due || updated.occurrenceMonth || 'scheduled'}`;
      setStatus(`${bill.name}: £${actual.toFixed(2)} recorded. ${nextLabel}.`, 'good');
    } catch (error) {
      setStatus(String(error?.message || error || 'Unable to complete bill.'), 'bad');
      console.error('[Aurora Finance Bill Complete Fix]', error);
    }
  }

  document.addEventListener('click', handleComplete, true);

  window.AuroraFinanceBillCompleteFix = Object.freeze({
    build: BUILD,
    ready: true,
    mode: 'finalise-current-occurrence-and-advance-recurring'
  });
})();
