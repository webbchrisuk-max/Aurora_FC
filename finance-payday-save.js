(() => {
  'use strict';

  const BUILD = '20260820-finance-payday-save-3';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';
  const FIELD_KEYS = ['paydayDate','openingCash','expectedWages','wagesReceived','extraCash','protectedCash','releaseAmount'];
  const PAYDAY_BASELINE = Object.freeze({
    expectedWages: 2100,
    wagesReceived: 0,
    protectedCash: 300
  });
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

  function nextCycleBaseline(plan) {
    return {
      ...(plan || {}),
      expectedWages: PAYDAY_BASELINE.expectedWages,
      wagesReceived: PAYDAY_BASELINE.wagesReceived,
      protectedCash: PAYDAY_BASELINE.protectedCash
    };
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
      if (note) note.textContent = message || 'Payday plan saved. Next-cycle baseline restored to £2,100 expected wages, £0 wages received and £300 protected spending.';
    } else if (mode === 'saving') {
      if (title) title.textContent = 'Saving Payday plan';
      if (chip) chip.textContent = 'SAVING';
      if (note) note.textContent = 'Saving the plan, then restoring the next-payday wage baseline.';
    } else if (mode === 'error') {
      if (title) title.textContent = 'Payday save blocked';
      if (chip) chip.textContent = 'ERROR';
      if (note) note.textContent = message || 'Nothing was saved.';
    } else {
      if (title) title.textContent = 'Payday plan editor';
      if (chip) chip.textContent = 'READY TO SAVE';
      if (note) note.textContent = 'Preview the actual wage, then save. The next cycle resets to £2,100 expected / £0 received / £300 protected.';
    }
  }

  function bindReadyState() {
    inputs().forEach((field) => {
      if (field.dataset.auroraPaydaySaveBound === '1') return;
      field.dataset.auroraPaydaySaveBound = '1';
      const restore = () => setTimeout(() => { if (!saving) setPanelState('ready'); }, 0);
      field.addEventListener('input', restore);
      field.addEventListener('change', restore);
    });

    const reset = q('[data-finance-preview-reset]');
    if (reset && reset.dataset.auroraPaydaySaveBound !== '1') {
      reset.dataset.auroraPaydaySaveBound = '1';
      reset.addEventListener('click', () => setTimeout(() => { if (!saving) setPanelState('ready'); }, 0));
    }
  }

  function ensureSaveButton() {
    const panel = q('#paydayPanel .finance-panel:last-child');
    if (!panel) return;

    let button = panel.querySelector('[data-finance-payday-save]');
    if (!button) {
      button = document.createElement('button');
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
          const enteredPlan = readPlanFromFields();
          const savedPlan = nextCycleBaseline(enteredPlan);
          persistPlan(savedPlan);
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
    }

    bindReadyState();
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
          paydayBaseline: { ...PAYDAY_BASELINE },
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
