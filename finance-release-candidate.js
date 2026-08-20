(() => {
  'use strict';

  const BUILD = '20260820-finance-release-candidate-1';
  const STATE_KEY = 'aurora2:state:v1';
  let pending = null;
  let writing = false;

  const qa = (selector) => [...document.querySelectorAll(selector)];
  const round = (value) => Number((Math.max(0, Number(value) || 0)).toFixed(2));

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function readPlanFromFields() {
    const fields = qa('#paydayPanel .finance-field-grid .field input');
    if (fields.length < 7) throw new Error('PAYDAY_FIELDS_NOT_READY');
    const paydayDate = String(fields[0]?.value || '').trim();
    return {
      paydayDate,
      openingCash: round(fields[1]?.value),
      expectedWages: round(fields[2]?.value),
      wagesReceived: round(fields[3]?.value),
      extraCash: round(fields[4]?.value),
      protectedCash: round(fields[5]?.value),
      releaseAmount: round(fields[6]?.value)
    };
  }

  function prepareCandidate() {
    const state = readState();
    const control = window.Aurora2?.financePaydayControl;
    if (!state?.finance || typeof control?.paydayFundingPreview !== 'function') {
      throw new Error('PAYDAY_PREVIEW_API_NOT_READY');
    }

    const plan = readPlanFromFields();
    const preview = control.paydayFundingPreview(state, plan);
    const c = preview?.c || {};
    const normalized = c.plan || plan;
    const auto = c.auto || {};
    const safeSurplus = round(c.safeSurplus);
    const manuallyEdited = Boolean(window.AuroraFinancePaydayPreview?.releaseManuallyEdited);
    const requested = round(plan.releaseAmount);
    const amount = manuallyEdited ? round(Math.min(requested, safeSurplus)) : safeSurplus;

    return {
      paydayDate: String(normalized.paydayDate || plan.paydayDate || ''),
      amount,
      safeSurplus,
      sourcePlan: {
        ...plan,
        releaseAmount: amount
      },
      financeSnapshot: {
        totalCash: round(c.totalCash),
        expectedWages: round(normalized.expectedWages),
        wagesReceived: round(normalized.wagesReceived),
        wageDifference: Number((Number(normalized.wageDifference) || 0).toFixed(2)),
        wageExtraToPots: round(normalized.wageExtraToPots),
        billsDue: round(auto.billsDue),
        annualHoldingContribution: round(auto.annualHoldingContribution),
        holdingTopUp: round(auto.holdingTopUp),
        potsDue: round(auto.potsDue),
        protectedCash: round(normalized.protectedCash),
        commitments: round(c.commitments),
        safeSurplus
      },
      manuallyEdited
    };
  }

  function persistCandidate() {
    if (!pending || writing) return;
    const current = readState();
    if (!current?.finance) return;

    writing = true;
    try {
      const now = new Date().toISOString();
      const candidate = {
        id: `PAYDAY-${pending.paydayDate || 'UNDATED'}-${Date.now()}`,
        paydayDate: pending.paydayDate,
        releaseAmount: pending.amount,
        safeSurplus: pending.safeSurplus,
        capturedAt: now,
        status: pending.amount > 0 ? 'READY' : 'EMPTY',
        sourcePlan: pending.sourcePlan,
        financeSnapshot: pending.financeSnapshot,
        manuallyEdited: pending.manuallyEdited
      };
      const next = {
        ...current,
        updatedAt: now,
        finance: {
          ...current.finance,
          paydayReleaseCandidate: candidate,
          lastCalculatedAt: now
        }
      };
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
      pending = null;
      window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    } finally {
      writing = false;
    }
  }

  function bind() {
    const button = document.querySelector('[data-finance-payday-save]');
    if (!button || button.dataset.auroraReleaseCandidateBound === '1') return false;
    button.dataset.auroraReleaseCandidateBound = '1';

    button.addEventListener('click', () => {
      try {
        pending = prepareCandidate();
      } catch (error) {
        pending = null;
        console.warn('[Aurora Finance release candidate]', String(error?.message || error));
      }
    }, true);

    window.addEventListener('aurora2:state', persistCandidate);

    window.AuroraFinanceReleaseCandidate = Object.freeze({
      build: BUILD,
      ready: true,
      source: 'verified payday save',
      exactReleaseCapture: true
    });
    return true;
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (window.AuroraFinancePaydaySave?.ready && bind()) return;
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
