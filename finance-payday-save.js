(() => {
  'use strict';

  const BUILD = '20260820-finance-payday-save-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';
  const FIELD_KEYS = ['paydayDate','openingCash','expectedWages','wagesReceived','extraCash','protectedCash','releaseAmount'];
  let saving = false;
  let lastError = null;

  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];

  function readPrimaryState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function inputs() {
    return qa('#paydayPanel .finance-field-grid .field input');
  }

  function readPlanFromFields() {
    const fields = inputs();
    if (fields.length < 7) throw new Error('PAYDAY_FIELDS_NOT_READY');

    const paydayDate = String(fields[0]?.value || '').trim();
    if (paydayDate && !/^\d{4}-\d{2}-\d{2}$/.test(paydayDate)) {
      throw new Error('PAYDAY_DATE_INVALID');
    }

    const plan = { paydayDate };
    FIELD_KEYS.slice(1).forEach((key, index) => {
      const raw = Number(fields[index + 1]?.value);
      if (!Number.isFinite(raw) || raw < 0) throw new Error(`PAYDAY_FIELD_INVALID:${key}`);
      plan[key] = Number(raw.toFixed(2));
    });
    return plan;
  }

  function backupCurrentState(rawText) {
    if (!rawText) return;
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') return;
      localStorage.setItem(BACKUP_KEY, rawText);
      localStorage.setItem(BACKUP_META_KEY, JSON.stringify({
        at: new Date().toISOString(),
        reason: 'pre-finance-payday-plan-save',
        schemaVersion: Number(parsed.schemaVersion) || null
      }));
    } catch (error) {
      throw new Error(`PAYDAY_BACKUP_FAILED:${error?.message || error}`);
    }
  }

  function persistPlan(plan) {
    const raw = localStorage.getItem(STATE_KEY);
    const current = readPrimaryState();
    if (!current) throw new Error('AURORA_PRIMARY_STATE_NOT_FOUND');

    backupCurrentState(raw);

    const now = new Date().toISOString();
    const next = {
      ...current,
      updatedAt: now,
      finance: {
        ...(current.finance || {}),
        plan: {
          ...(current.finance?.plan || {}),
          ...plan
        },
        lastCalculatedAt: now
      }
    };

    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    return next;
  }

  function setPanelState(mode, message) {
    const panel = q('#paydayPanel .finance-panel:last-child');
    if (!panel) return;
    const title = panel.querySelector('h3');
    const chip = panel.querySelector('.rule-chip');
    const note = panel.querySelector('p');

    if (mode === 'saved') {
      if (title) title.textContent = 'Payday plan saved';
      if (chip) chip.textContent = 'SAVED';
      if (note) note.textContent = message || 'The seven Payday Planner fields were saved. No mission, pot or House action was triggered.';
    } else if (mode === 'saving') {
      if (title) title.textContent = 'Saving Payday plan';
      if (chip) chip.textContent = 'SAVING';
      if (note) note.textContent = 'Writing only finance.plan and creating a pre-save local backup.';
    } else if (mode === 'error') {
      if (title) title.textContent = 'Payday save blocked';
      if (chip) chip.textContent = 'ERROR';
      if (note) note.textContent = message || 'Nothing was saved.';
    } else {
      if (title) title.textContent = 'Live preview only';
      if (chip) chip.textContent = 'READY TO SAVE';
      if (note) note.textContent = 'Preview your changes first, then save only the seven Payday Planner fields.';
    }
  }

  function ensureSaveButton() {
    const panel = q('#paydayPanel .finance-panel:last-child');
    if (!panel || panel.querySelector('[data-finance-payday-save]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mini-link-btn';
    button.dataset.financePaydaySave = '1';
    button.textContent = 'Save Payday Plan';
    button.style.marginLeft = '8px';

    button.addEventListener('click', () => {
      if (saving) return;
      saving = true;
      lastError = null;
      button.disabled = true;
      button.textContent = 'Saving…';
      setPanelState('saving');

      try {
        const plan = readPlanFromFields();
        persistPlan(plan);
        setPanelState('saved');
        button.textContent = 'Saved ✓';
        setTimeout(() => {
          window.location.reload();
        }, 700);
      } catch (error) {
        lastError = String(error?.message || error || 'Unknown save error');
        console.error('[Aurora Finance payday save]', lastError);
        setPanelState('error', `Nothing was saved. ${lastError}`);
        button.disabled = false;
        button.textContent = 'Save Payday Plan';
        saving = false;
      }
    });

    const reset = panel.querySelector('[data-finance-preview-reset]');
    if (reset?.parentNode) reset.parentNode.insertBefore(button, reset.nextSibling);
    else panel.appendChild(button);

    setPanelState('ready');
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      const previewReady = Boolean(window.AuroraFinancePaydayPreview?.ready);
      const dateReady = Boolean(window.AuroraFinanceDateField?.ready);
      if (previewReady && dateReady && inputs().length >= 7) {
        ensureSaveButton();
        window.AuroraFinancePaydaySave = Object.freeze({
          build: BUILD,
          ready: true,
          scope: 'finance.plan only',
          fields: [...FIELD_KEYS],
          lastError
        });
        return;
      }
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
