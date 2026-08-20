(() => {
  'use strict';

  const BUILD = '20260820-finance-mission-release-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';
  const TERMINAL = new Set(['COMPLETE', 'COMPLETED', 'CANCELLED']);

  const round = value => Number((Math.max(0, Number(value) || 0)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(round(value));

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function backupCurrent(rawText, reason) {
    if (!rawText) return;
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') return;
    localStorage.setItem(BACKUP_KEY, rawText);
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify({
      at: new Date().toISOString(),
      reason,
      schemaVersion: Number(parsed.schemaVersion) || null
    }));
  }

  function uid(prefix) {
    try {
      if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    } catch (_) {}
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function terminalMission(mission) {
    return !mission || TERMINAL.has(String(mission.status || '').toUpperCase());
  }

  function createMission(state, candidate) {
    const stamp = new Date().toISOString();
    const id = uid('MISSION');
    const amount = round(candidate.releaseAmount);
    const paydayDate = String(candidate.paydayDate || '');
    return {
      id,
      mission_id: id,
      paydayDate,
      sourceRelease: { paydayDate, releaseAmount: amount },
      createdAt: stamp,
      transferAmount: amount,
      approvedBudget: amount,
      availableCash: amount,
      strategy: String(state?.scouting?.strategy || ''),
      allocationPlan: null,
      brokerRoutes: [],
      legIds: [],
      amountAllocated: 0,
      amountRemaining: amount,
      actualInvested: 0,
      executionStatus: 'DRAFT',
      registrationStatus: { registered: 0, total: 0 },
      status: 'DRAFT',
      completionTimestamp: null,
      updatedAt: stamp,
      source: 'Finance',
      financeSnapshot: { ...(candidate.financeSnapshot || {}) }
    };
  }

  function recordedPurchases(state, mission) {
    if (!mission) return false;
    const id = String(mission.id || '');
    const route = state?.transfer?.route;
    const routeHasRegistered = String(route?.missionId || '') === id && (route?.allocations || []).some(leg =>
      String(leg?.status || '').toUpperCase() === 'REGISTERED' || Boolean(leg?.transactionId)
    );
    const draftsHaveConfirmed = (state?.transfer?.registrationDrafts || []).some(draft =>
      String(draft?.missionId || '') === id && String(draft?.status || '').toUpperCase() === 'CONFIRMED'
    );
    const receiptsExist = (state?.registration?.receipts || []).some(receipt => String(receipt?.missionId || '') === id);
    return routeHasRegistered || draftsHaveConfirmed || receiptsExist;
  }

  function commit(next, reason) {
    const raw = localStorage.getItem(STATE_KEY);
    backupCurrent(raw, reason);
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
  }

  function releaseMission() {
    const current = readState();
    if (!current?.finance) throw new Error('AURORA_FINANCE_STATE_NOT_FOUND');
    const candidate = current.finance.paydayReleaseCandidate;
    if (!candidate || String(candidate.status || '') !== 'READY') {
      throw new Error('Save the Payday Plan first so Finance can capture a verified release.');
    }

    const amount = round(candidate.releaseAmount);
    const safe = round(candidate.safeSurplus);
    if (amount <= 0) throw new Error('There is no positive safe release to send to Transfer.');
    if (amount > safe + 0.005) throw new Error(`Release blocked: ${money(amount)} is above the captured safe surplus of ${money(safe)}.`);

    if (current.mission && !terminalMission(current.mission)) {
      throw new Error('The current Transfer mission is still in progress. Complete or cancel it before releasing a new mission.');
    }

    if (!confirm(`Release ${money(amount)} to Transfer as the exact frozen Finance budget?`)) return;

    const now = new Date().toISOString();
    const previousMission = current.mission || null;
    const mission = createMission(current, candidate);
    const previousId = String(previousMission?.id || '');
    const drafts = (current.transfer?.registrationDrafts || []).filter(draft => {
      const belongsToPrevious = previousId && String(draft?.missionId || '') === previousId;
      return !belongsToPrevious || String(draft?.status || '').toUpperCase() === 'CONFIRMED';
    });

    const next = {
      ...current,
      updatedAt: now,
      finance: {
        ...current.finance,
        plan: { ...(current.finance.plan || {}), releaseAmount: amount },
        lastReleasedAt: now,
        paydayReleaseCandidate: {
          ...candidate,
          status: 'RELEASED',
          releasedAt: now,
          releasedMissionId: mission.id
        },
        missionHistory: previousMission && terminalMission(previousMission)
          ? [previousMission, ...(current.finance.missionHistory || [])].slice(0, 24)
          : (current.finance.missionHistory || [])
      },
      mission,
      transfer: {
        ...(current.transfer || {}),
        route: null,
        registrationDrafts: drafts,
        executionChecks: {},
        updatedAt: now
      },
      alerts: [
        { id: uid('ALERT'), title: `Finance released ${money(amount)}`, note: 'Investment mission is ready for Scouting and Transfer.', when: 'now' },
        ...(current.alerts || []).filter(item => !String(item?.title || '').startsWith('Finance released '))
      ].slice(0, 8)
    };

    commit(next, `pre-finance-mission-release:${candidate.id || candidate.paydayDate || 'candidate'}`);
    setMessage(`${money(amount)} released to Transfer as a frozen DRAFT mission.`, 'good');
    setTimeout(() => window.location.reload(), 350);
  }

  function cancelMission() {
    const current = readState();
    const mission = current?.mission;
    if (!mission || terminalMission(mission)) throw new Error('There is no active mission to cancel.');
    if (recordedPurchases(current, mission)) {
      throw new Error('Mission cancellation is blocked because Registration has already recorded purchases.');
    }
    if (!confirm(`Cancel the current ${money(mission.approvedBudget)} Finance mission? No registered purchase will be removed.`)) return;

    const raw = localStorage.getItem(STATE_KEY);
    const now = new Date().toISOString();
    const candidate = current.finance?.paydayReleaseCandidate;
    const drafts = (current.transfer?.registrationDrafts || []).filter(draft => {
      const belongs = String(draft?.missionId || '') === String(mission.id || '');
      return !belongs || String(draft?.status || '').toUpperCase() === 'CONFIRMED';
    });

    const next = {
      ...current,
      updatedAt: now,
      finance: {
        ...current.finance,
        paydayReleaseCandidate: candidate && String(candidate.releasedMissionId || '') === String(mission.id || '')
          ? { ...candidate, status: round(candidate.releaseAmount) > 0 ? 'READY' : 'EMPTY', releasedAt: null, releasedMissionId: null }
          : candidate
      },
      mission: {
        ...mission,
        status: 'CANCELLED',
        executionStatus: 'CANCELLED',
        cancelledAt: now,
        cancelledBy: 'Finance',
        cancelReason: 'User cancelled before Registration',
        updatedAt: now
      },
      transfer: {
        ...(current.transfer || {}),
        route: null,
        registrationDrafts: drafts,
        executionChecks: {},
        updatedAt: now
      },
      alerts: [
        { id: uid('ALERT'), title: `Finance cancelled ${money(mission.approvedBudget)} mission`, note: 'The released investment mission was cancelled before Registration. The payday plan was left unchanged.', when: 'now' },
        ...(current.alerts || [])
      ].slice(0, 8)
    };

    backupCurrent(raw, `pre-finance-mission-cancel:${mission.id || 'mission'}`);
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    setMessage('Mission cancelled. The verified payday release is available to release again.', 'good');
    setTimeout(() => window.location.reload(), 350);
  }

  function setMessage(message, tone = '') {
    const el = document.getElementById('financeMissionReleaseStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `finance-action-status ${tone}`.trim();
  }

  function refresh() {
    const state = readState();
    if (!state?.finance) return;
    const candidate = state.finance.paydayReleaseCandidate;
    const mission = state.mission;
    const release = document.querySelector('[data-finance-mission-release]');
    const cancel = document.querySelector('[data-finance-mission-cancel]');
    if (!release || !cancel) return;

    const inFlight = Boolean(mission && !terminalMission(mission));
    const ready = Boolean(candidate && String(candidate.status || '') === 'READY' && round(candidate.releaseAmount) > 0);
    release.disabled = !ready || inFlight;
    release.textContent = ready ? `Release ${money(candidate.releaseAmount)} to Transfer` : 'Release to Transfer';

    cancel.hidden = !inFlight || recordedPurchases(state, mission);
    cancel.disabled = !inFlight || recordedPurchases(state, mission);

    if (inFlight) {
      setMessage(`Current mission ${mission.id || ''}: ${money(mission.approvedBudget)} • ${String(mission.status || 'DRAFT').replaceAll('_', ' ')}. Finance will not overwrite it.`, '');
    } else if (ready) {
      setMessage(`Verified release ready: ${money(candidate.releaseAmount)} from a captured safe surplus of ${money(candidate.safeSurplus)}.`, 'good');
    } else if (candidate && String(candidate.status || '') === 'RELEASED') {
      setMessage(`The captured ${money(candidate.releaseAmount)} release has already been sent to Transfer.`, 'good');
    } else if (candidate && String(candidate.status || '') === 'EMPTY') {
      setMessage('The saved payday produced no positive safe release.', '');
    } else {
      setMessage('Save Payday Plan once to prepare a verified Transfer release.', '');
    }
  }

  function installStyles() {
    if (document.getElementById('financeMissionReleaseStyles')) return;
    const style = document.createElement('style');
    style.id = 'financeMissionReleaseStyles';
    style.textContent = `
      .finance-mission-release-controls{margin-top:14px;padding-top:14px;border-top:1px solid rgba(110,231,255,.12)}
      .finance-mission-release-buttons{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .finance-mission-release-buttons button{border:1px solid rgba(110,231,255,.24);background:rgba(5,20,34,.9);color:#e6f8ff;border-radius:10px;padding:10px 13px;font:700 10px/1.1 inherit;cursor:pointer}
      .finance-mission-release-buttons button:disabled{opacity:.45;cursor:not-allowed}
      .finance-mission-release-buttons .release{border-color:rgba(89,255,154,.4);color:#9dffbf}
      .finance-mission-release-buttons .danger{border-color:rgba(255,104,104,.35);color:#ffb0b0}
    `;
    document.head.appendChild(style);
  }

  function install() {
    const panel = document.querySelector('#paydayPanel .finance-panel:last-child');
    if (!panel) return false;
    if (panel.querySelector('[data-finance-mission-release]')) return true;

    installStyles();
    const host = document.createElement('div');
    host.className = 'finance-mission-release-controls';
    host.innerHTML = `
      <div class="finance-panel-kicker">Transfer Mission Gate</div>
      <div class="finance-mission-release-buttons">
        <button class="release" type="button" data-finance-mission-release>Release to Transfer</button>
        <button class="danger" type="button" data-finance-mission-cancel hidden>Cancel Mission</button>
      </div>
      <div class="finance-action-status" id="financeMissionReleaseStatus">Checking saved payday release…</div>`;
    panel.appendChild(host);

    host.querySelector('[data-finance-mission-release]').addEventListener('click', () => {
      try { releaseMission(); }
      catch (error) {
        const message = String(error?.message || error || 'Unknown release error');
        console.error('[Aurora Finance mission release]', message);
        setMessage(message, 'bad');
      }
    });
    host.querySelector('[data-finance-mission-cancel]').addEventListener('click', () => {
      try { cancelMission(); }
      catch (error) {
        const message = String(error?.message || error || 'Unknown cancellation error');
        console.error('[Aurora Finance mission cancel]', message);
        setMessage(message, 'bad');
      }
    });

    window.addEventListener('aurora2:state', () => setTimeout(refresh, 0));
    refresh();
    window.AuroraFinanceMissionRelease = Object.freeze({
      build: BUILD,
      ready: true,
      exactFrozenBudget: true,
      blocksMissionOverwrite: true,
      blocksCancellationAfterRegistration: true,
      backupBeforeWrite: true
    });
    return true;
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (window.AuroraFinanceReleaseCandidate?.ready && install()) return;
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
