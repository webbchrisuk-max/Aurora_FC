(() => {
  'use strict';

  const BUILD = '20260820-finance-pot-delete-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';

  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const isHolding = value => norm(value) === 'holding pot';
  const isoNow = () => new Date().toISOString();

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function setStatus(message, tone = '') {
    const el = document.getElementById('financePotsBillsActionStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `finance-action-status ${tone}`.trim();
  }

  function backupCurrent(rawText, reason) {
    if (!rawText) return;
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') return;
    localStorage.setItem(BACKUP_KEY, rawText);
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify({
      at: isoNow(),
      reason,
      schemaVersion: Number(parsed.schemaVersion) || null
    }));
  }

  function deletePot(id) {
    const raw = localStorage.getItem(STATE_KEY);
    const current = readState();
    if (!current?.finance) throw new Error('AURORA_FINANCE_STATE_NOT_FOUND');

    const pots = Array.isArray(current.finance.pots) ? current.finance.pots : [];
    const pot = pots.find(item => String(item?.id || '') === String(id || ''));
    if (!pot) throw new Error('POT_NOT_FOUND');

    if (isHolding(pot.name)) {
      alert('The Holding Pot is part of Aurora\'s Finance safety system and cannot be permanently deleted. You can edit its balance or protection settings instead.');
      return;
    }

    const bills = Array.isArray(current.finance.bills) ? current.finance.bills : [];
    const linkedBills = bills.filter(bill => norm(bill?.fundingSource) === norm(pot.name));
    const linkedText = linkedBills.length
      ? `\n\n${linkedBills.length} saved bill${linkedBills.length === 1 ? '' : 's'} currently use this pot. They will be moved to Current Account so Finance is not left with a broken funding source.`
      : '';

    const confirmed = confirm(`Permanently delete \"${pot.name || 'this pot'}\"?${linkedText}\n\nA last-good backup will be created first.`);
    if (!confirmed) return;

    backupCurrent(raw, `pre-finance-pot-delete:${pot.id || pot.name || 'unknown'}`);

    const now = isoNow();
    const nextBills = bills.map(bill => {
      if (norm(bill?.fundingSource) !== norm(pot.name)) return bill;
      return { ...bill, fundingSource: 'Current Account', updatedAt: now };
    });

    const next = {
      ...current,
      updatedAt: now,
      finance: {
        ...current.finance,
        pots: pots.filter(item => String(item?.id || '') !== String(id || '')),
        bills: nextBills,
        lastCalculatedAt: now
      }
    };

    localStorage.setItem(STATE_KEY, JSON.stringify(next));

    const editorId = document.querySelector('#financePotEditor [data-pot="id"]');
    if (editorId && String(editorId.value || '') === String(id || '')) {
      editorId.value = '';
      const editor = document.getElementById('financePotEditor');
      if (editor) editor.hidden = true;
    }

    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    setStatus(`${pot.name || 'Pot'} permanently deleted. Backup saved first.${linkedBills.length ? ` ${linkedBills.length} linked bill${linkedBills.length === 1 ? '' : 's'} moved to Current Account.` : ''}`, 'good');
  }

  function decoratePotRows() {
    const host = document.getElementById('financePotActionList');
    if (!host) return false;

    host.querySelectorAll('.finance-action-row').forEach(row => {
      const actions = row.querySelector('.finance-row-actions');
      if (!actions || actions.querySelector('[data-pot-delete]')) return;

      const source = actions.querySelector('[data-pot-edit]') || actions.querySelector('[data-pot-toggle]');
      const id = source?.dataset?.potEdit || source?.dataset?.potToggle || '';
      if (!id) return;

      const state = readState();
      const pot = (state?.finance?.pots || []).find(item => String(item?.id || '') === String(id));
      if (!pot || isHolding(pot.name)) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'danger';
      button.dataset.potDelete = id;
      button.textContent = 'Delete';
      actions.appendChild(button);
    });

    return true;
  }

  function bind() {
    const root = document.getElementById('financePotsBillsActions');
    if (!root || root.dataset.auroraPotDeleteBound === '1') return false;
    root.dataset.auroraPotDeleteBound = '1';

    root.addEventListener('click', event => {
      const button = event.target.closest('[data-pot-delete]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        deletePot(button.dataset.potDelete);
      } catch (error) {
        const message = String(error?.message || error || 'Unknown delete error');
        console.error('[Aurora Finance pot delete]', message);
        setStatus(`Pot delete failed: ${message}`, 'bad');
      }
    });

    const host = document.getElementById('financePotActionList');
    if (host) {
      const observer = new MutationObserver(() => queueMicrotask(decoratePotRows));
      observer.observe(host, { childList: true, subtree: true });
    }

    decoratePotRows();
    window.addEventListener('aurora2:state', () => setTimeout(decoratePotRows, 0));
    window.AuroraFinancePotDelete = Object.freeze({
      build: BUILD,
      ready: true,
      permanentDelete: true,
      holdingPotProtected: true,
      backupBeforeDelete: true,
      linkedBillsReassignedTo: 'Current Account'
    });
    return true;
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (window.AuroraFinancePotsBillsActions?.ready && bind()) return;
      tries += 1;
      if (tries < 600) setTimeout(wait, 25);
    };
    wait();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  } else {
    setTimeout(boot, 0);
  }
})();
