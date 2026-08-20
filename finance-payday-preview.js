(() => {
  'use strict';

  const BUILD = '20260820-finance-payday-preview-1';
  const FIELD_KEYS = ['paydayDate','openingCash','expectedWages','wagesReceived','extraCash','protectedCash','releaseAmount'];
  let ready = false;
  let dirty = false;
  let draftPlan = null;
  let runtimeErrors = [];

  const money = (value) => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value) || 0);
  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const text = (node, value) => { if (node) node.textContent = value; };

  function financeState() {
    try { return window.Aurora2?.core?.read?.() || null; }
    catch (_) { return null; }
  }

  function inputs() {
    return qa('#paydayPanel .finance-field-grid .field input');
  }

  function nextPaydayDate(value) {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date(); today.setHours(12, 0, 0, 0);
    let guard = 0;
    while (date.getTime() < today.getTime() && guard++ < 30) date.setDate(date.getDate() + 28);
    return date;
  }

  function humanDate(value) {
    const date = value instanceof Date ? value : nextPaydayDate(value);
    if (!date) return '—';
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  function holdingPot(state) {
    return (state?.finance?.pots || []).find(p => !p.archived && String(p.name || '').trim().toLowerCase() === 'holding pot') || null;
  }

  function seedDraftFromState() {
    const state = financeState();
    draftPlan = { ...(state?.finance?.plan || {}) };
    dirty = false;
    seedInputs(draftPlan);
  }

  function seedInputs(plan) {
    const fields = inputs();
    if (fields[0]) fields[0].value = String(plan?.paydayDate || '');
    if (fields[1]) fields[1].value = Number(plan?.openingCash || 0).toFixed(2);
    if (fields[2]) fields[2].value = Number(plan?.expectedWages || 0).toFixed(2);
    if (fields[3]) fields[3].value = Number(plan?.wagesReceived || 0).toFixed(2);
    if (fields[4]) fields[4].value = Number(plan?.extraCash || 0).toFixed(2);
    if (fields[5]) fields[5].value = Number(plan?.protectedCash || 0).toFixed(2);
    if (fields[6]) fields[6].value = Number(plan?.releaseAmount || 0).toFixed(2);
  }

  function readDraftFromInputs() {
    const fields = inputs();
    const next = { ...(draftPlan || financeState()?.finance?.plan || {}) };
    next.paydayDate = String(fields[0]?.value || '');
    ['openingCash','expectedWages','wagesReceived','extraCash','protectedCash','releaseAmount'].forEach((key, index) => {
      const value = Number(fields[index + 1]?.value);
      next[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
    });
    return next;
  }

  function renderDraft() {
    if (!ready) return;
    const state = financeState();
    const control = window.Aurora2?.financePaydayControl;
    if (!state?.finance || typeof control?.paydayFundingPreview !== 'function') return;

    let preview;
    try { preview = control.paydayFundingPreview(state, draftPlan || state.finance.plan || {}); }
    catch (error) { recordError(error); return; }

    const c = preview?.c || {};
    const normalized = c.plan || draftPlan || state.finance.plan || {};
    const auto = c.auto || {};
    const hp = holdingPot(state);
    const hpBalance = Math.max(0, Number(hp?.balance) || 0);
    const payday = nextPaydayDate(normalized.paydayDate);

    const hero = qa('.aurora-fact-grid > div');
    text(hero[0]?.querySelector('strong'), money(normalized.openingCash));
    text(hero[1]?.querySelector('strong'), humanDate(payday));
    text(hero[2]?.querySelector('strong'), money(c.safeSurplus));
    text(hero[3]?.querySelector('strong'), money(hpBalance));

    const scores = qa('.finance-scoreboard .finance-score');
    text(scores[0]?.querySelector('strong'), money(normalized.openingCash));
    text(scores[1]?.querySelector('strong'), money(normalized.wagesReceived));
    text(scores[1]?.querySelector('span'), `Expected ${money(normalized.expectedWages)}`);
    text(scores[2]?.querySelector('strong'), money(c.commitments));
    text(scores[3]?.querySelector('strong'), money(normalized.protectedCash));
    text(scores[4]?.querySelector('strong'), money(c.safeSurplus));

    const forecast = qa('.finance-legacy-forecast-list > div');
    const wageDifference = Number(normalized.wageDifference || 0);
    const wageExtra = Math.max(0, wageDifference);
    const wageShortfall = Math.max(0, -wageDifference);
    text(forecast[0]?.querySelector('strong'), money(normalized.expectedWages));
    text(forecast[1]?.querySelector('strong'), money(normalized.wagesReceived));
    text(forecast[2]?.querySelector('strong'), wageDifference >= 0 ? money(wageExtra) : `− ${money(wageShortfall)}`);
    text(forecast[3]?.querySelector('strong'), money(c.totalCash));
    text(forecast[4]?.querySelector('strong'), `− ${money(auto.billsDue)}`);
    text(forecast[5]?.querySelector('strong'), `− ${money(auto.annualHoldingContribution)}`);
    text(forecast[6]?.querySelector('strong'), `− ${money(auto.holdingTopUp)}`);
    text(forecast[7]?.querySelector('strong'), `− ${money(auto.potsDue)}`);
    text(forecast[8]?.querySelector('strong'), `− ${money(normalized.otherPlanned)}`);
    text(forecast[9]?.querySelector('strong'), `− ${money(normalized.protectedCash)}`);
    text(forecast[10]?.querySelector('strong'), money(c.safeSurplus));

    const mission = state.mission;
    const missionAmount = Math.max(0, Number(mission?.approvedBudget) || 0);
    const recon = qa('.reconcile-grid > div');
    text(recon[0]?.querySelector('strong'), money(c.safeSurplus));
    text(recon[1]?.querySelector('strong'), money(missionAmount));
    const difference = Number((c.safeSurplus - missionAmount).toFixed(2));
    text(recon[2]?.querySelector('strong'), `${difference < 0 ? '− ' : ''}${money(Math.abs(difference))}`);
    text(recon[2]?.querySelector('span'), mission ? (Math.abs(difference) < 0.005 ? 'Forecast matches released mission' : difference > 0 ? 'Next forecast is above current mission' : 'Current mission is above next forecast') : 'No released mission to compare');

    const releaseInput = inputs()[6];
    if (releaseInput) {
      releaseInput.style.outline = Number(normalized.releaseAmount || 0) > Number(c.safeSurplus || 0) + 0.005 ? '2px solid #d97706' : '';
    }

    const pill = q('.finance-version-pill');
    text(pill, dirty ? 'UNSAVED PREVIEW • NOT SAVED' : 'LIVE PREVIEW • EDITABLE');

    const infoPanel = q('#paydayPanel .finance-panel:last-child');
    text(infoPanel?.querySelector('h3'), 'Live preview only');
    text(infoPanel?.querySelector('.rule-chip'), 'NO SAVE');
    const note = infoPanel?.querySelector('p');
    if (note) {
      note.textContent = runtimeErrors.length
        ? `Preview encountered ${runtimeErrors.length} runtime error${runtimeErrors.length === 1 ? '' : 's'}. Aurora state has not been changed.`
        : dirty
          ? `Unsaved preview only. Safe release is ${money(c.safeSurplus)}. Your saved Finance plan has not changed.`
          : 'Payday fields are editable for live calculations. Nothing is saved until the next controlled rebuild step.';
    }

    window.AuroraFinancePaydayPreview = Object.freeze({
      build: BUILD,
      ready: true,
      dirty,
      runtimeErrors: [...runtimeErrors],
      draftPlan: { ...normalized },
      safeSurplus: Number(c.safeSurplus || 0),
      commitments: Number(c.commitments || 0)
    });
  }

  function ensureResetButton() {
    const panel = q('#paydayPanel .finance-panel:last-child');
    if (!panel || panel.querySelector('[data-finance-preview-reset]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mini-link-btn';
    button.dataset.financePreviewReset = '1';
    button.textContent = 'Reset to saved values';
    button.addEventListener('click', () => {
      seedDraftFromState();
      renderDraft();
    });
    panel.appendChild(button);
  }

  function enablePreviewEditing() {
    inputs().forEach((field) => {
      field.disabled = false;
      field.removeAttribute('disabled');
      field.addEventListener('input', () => {
        draftPlan = readDraftFromInputs();
        dirty = true;
        renderDraft();
      });
      field.addEventListener('change', () => {
        draftPlan = readDraftFromInputs();
        dirty = true;
        renderDraft();
      });
    });
    ensureResetButton();
  }

  function restoreAfterBaseRender() {
    setTimeout(() => {
      if (!ready) return;
      if (!dirty) draftPlan = { ...(financeState()?.finance?.plan || {}) };
      seedInputs(draftPlan || {});
      inputs().forEach((field) => { field.disabled = false; field.removeAttribute('disabled'); });
      renderDraft();
    }, 0);
  }

  function recordError(error) {
    const message = String(error?.message || error || 'Unknown error');
    if (!runtimeErrors.includes(message)) runtimeErrors.push(message);
    console.warn('[Aurora Finance payday preview]', message);
    renderDraft();
  }

  function init() {
    let tries = 0;
    const wait = () => {
      const baseReady = Boolean(window.AuroraFinanceLiveReadonly?.ready);
      const apiReady = typeof window.Aurora2?.financePaydayControl?.paydayFundingPreview === 'function';
      if (baseReady && apiReady) {
        ready = true;
        seedDraftFromState();
        enablePreviewEditing();
        renderDraft();
        window.addEventListener('focus', restoreAfterBaseRender);
        window.addEventListener('pageshow', restoreAfterBaseRender);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') restoreAfterBaseRender(); });
        return;
      }
      tries += 1;
      if (tries > 600) { recordError(new Error('FINANCE_READONLY_BASE_WAIT_TIMEOUT')); return; }
      setTimeout(wait, 25);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  else setTimeout(init, 0);
})();
