(() => {
  'use strict';

  const BUILD = '20260820-finance-payday-save-5';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';
  const FIELD_KEYS = ['paydayDate','openingCash','expectedWages','wagesReceived','extraCash','protectedCash','releaseAmount'];
  const OLD_RESET_BASELINE = Object.freeze({ expectedWages: 2100, wagesReceived: 0, protectedCash: 300 });
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
    if (paydayDate && !/^\d{4}-\d{2}-\d{2}$/.test(paydayDate)) throw new Error('PAYDAY_DATE_INVALID');

    const plan = { paydayDate };
    FIELD_KEYS.slice(1).forEach((key, index) => {
      const raw = Number(fields[index + 1]?.value);
      if (!Number.isFinite(raw) || raw < 0) throw new Error(`PAYDAY_FIELD_INVALID:${key}`);
      plan[key] = Number(raw.toFixed(2));
    });
    return plan;
  }

  function actualPaydayRelease(plan, state) {
    const control = window.Aurora2?.financePaydayControl;
    if (!state?.finance || typeof control?.paydayFundingPreview !== 'function') throw new Error('PAYDAY_PREVIEW_API_NOT_READY');

    const preview = control.paydayFundingPreview(state, plan);
    const safeSurplus = Math.max(0, Number(preview?.c?.safeSurplus) || 0);
    const manuallyEdited = Boolean(window.AuroraFinancePaydayPreview?.releaseManuallyEdited);
    const requested = Math.max(0, Number(plan.releaseAmount) || 0);
    const capturedRelease = manuallyEdited ? Math.min(requested, safeSurplus) : safeSurplus;

    return {
      plan: { ...plan, releaseAmount: Number(capturedRelease.toFixed(2)) },
      safeSurplus: Number(safeSurplus.toFixed(2)),
      manuallyEdited
    };
  }

  function backupCurrentState(rawText, reason = 'pre-finance-payday-plan-save') {
    if (!rawText) return;
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') return;
      localStorage.setItem(BACKUP_KEY, rawText);
      localStorage.setItem(BACKUP_META_KEY, JSON.stringify({
        at: new Date().toISOString(), reason, schemaVersion: Number(parsed.schemaVersion) || null
      }));
    } catch (error) {
      throw new Error(`PAYDAY_BACKUP_FAILED:${error?.message || error}`);
    }
  }

  function persistPlan(plan, extraFinance = {}) {
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
        ...extraFinance,
        plan: { ...(current.finance?.plan || {}), ...plan },
        lastCalculatedAt: now
      }
    };

    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    return next;
  }

  function recoverOldResetIfNeeded() {
    const current = readPrimaryState();
    const finance = current?.finance;
    const plan = finance?.plan || {};
    const candidate = finance?.paydayReleaseCandidate;
    const source = candidate?.sourcePlan;
    if (!finance || finance.paydayResetRecoveryApplied || !source || typeof source !== 'object') return false;

    const looksLikeOldReset =
      Number(plan.expectedWages || 0) === OLD_RESET_BASELINE.expectedWages &&
      Number(plan.wagesReceived || 0) === OLD_RESET_BASELINE.wagesReceived &&
      Number(plan.protectedCash || 0) === OLD_RESET_BASELINE.protectedCash;

    const sourceDiffers =
      Number(source.expectedWages || 0) !== Number(plan.expectedWages || 0) ||
      Number(source.wagesReceived || 0) !== Number(plan.wagesReceived || 0) ||
      Number(source.protectedCash || 0) !== Number(plan.protectedCash || 0);

    if (!looksLikeOldReset || !sourceDiffers) return false;

    const raw = localStorage.getItem(STATE_KEY);
    backupCurrentState(raw, 'pre-finance-payday-reset-recovery');
    const now = new Date().toISOString();
    const restoredPlan = {
      ...(plan || {}),
      ...source,
      releaseAmount: Number(candidate.releaseAmount ?? source.releaseAmount ?? 0)
    };
    const next = {
      ...current,
      updatedAt: now,
      finance: {
        ...finance,
        plan: restoredPlan,
        paydayResetRecoveryApplied: true,
        paydayResetRecoveredAt: now,
        lastCalculatedAt: now
      }
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    return true;
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
      if (note) note.textContent = message || 'The actual payday values and calculated release have been saved. They remain in Finance until the payday cycle is completed or you edit them.';
    } else if (mode === 'saving') {
      if (title) title.textContent = 'Saving Payday plan';
      if (chip) chip.textContent = 'SAVING';
      if (note) note.textContent = 'Calculating the safe release and saving the actual payday values exactly as entered.';
    } else if (mode === 'error') {
      if (title) title.textContent = 'Payday save blocked';
      if (chip) chip.textContent = 'ERROR';
      if (note) note.textContent = message || 'Nothing was saved.';
    } else {
      if (title) title.textContent = 'Payday plan editor';
      if (chip) chip.textContent = 'READY TO SAVE';
      if (note) note.textContent = 'Enter the payday values. Save keeps the actual figures in Finance and captures the verified safe release for Transfer.';
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
          const current = readPrimaryState();
          if (!current) throw new Error('AURORA_PRIMARY_STATE_NOT_FOUND');

          const actual = actualPaydayRelease(enteredPlan, current);
          persistPlan(actual.plan, { paydayResetRecoveryApplied: true });

          const releaseText = new Intl.NumberFormat('en-GB', {
            style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
          }).format(actual.plan.releaseAmount);
          setPanelState('saved', `Saved the actual payday values and captured ${releaseText} as the verified investment release. Nothing has been reset.`);
          button.textContent = 'Saved ✓';
          setTimeout(() => window.location.reload(), 500);
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
        if (recoverOldResetIfNeeded()) {
          setTimeout(() => window.location.reload(), 100);
          return;
        }
        ensureSaveButton();
        window.AuroraFinancePaydaySave = Object.freeze({
          build: BUILD,
          ready: true,
          scope: 'finance.plan only',
          fields: [...FIELD_KEYS],
          saveBehavior: 'preserve actual payday values',
          resetBehavior: 'only on explicit payday completion/reset',
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