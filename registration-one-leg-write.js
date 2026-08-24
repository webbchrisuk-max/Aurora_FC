(() => {
  'use strict';

  const BUILD = '20260820-registration-one-leg-write-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:registration:write:backup:lastgood';
  const RESERVE_KEY = 'aurora2:registration:write:reserve';
  const ROUTE_BACKUP_KEY = 'aurora2:transfer:route:backup:lastgood';
  const FULL_BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const DATA_CLIENT_SRC = '/Aurora_FC/aurora-data2-client.js?v=20260820-registration-one-leg-write-1';
  const CONTRACT_SRC = 'aurora-transfer-mission.js?v=20260820-registration-one-leg-write-1';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(round2(value));

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function accountCode(value) {
    const lower = String(value || '').toLowerCase();
    if (lower.includes('212')) return 'T212';
    if (/\big\b/.test(lower) || lower.includes('ig isa')) return 'IG';
    const upper = String(value || '').toUpperCase();
    return upper === 'IG' || upper === 'T212' ? upper : 'CHECK';
  }

  function hash(value) {
    let h = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    const existing = [...document.scripts].find(script => String(script.src || '').includes(src.split('?')[0]));
    if (existing) {
      return new Promise((resolve, reject) => {
        let tries = 0;
        const wait = () => {
          if (ready()) return resolve();
          tries += 1;
          if (tries > 300) return reject(new Error('Registration dependency did not become ready.'));
          setTimeout(wait, 25);
        };
        wait();
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.addEventListener('load', () => ready() ? resolve() : reject(new Error('Registration dependency loaded without its API.')), { once: true });
      script.addEventListener('error', () => reject(new Error(`Could not load ${src.split('?')[0]}.`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function selectedContext() {
    const state = readState();
    const mission = state?.mission;
    const route = state?.transfer?.route;
    const status = String(mission?.status || '').toUpperCase();
    if (!state || !mission || !route || route.locked !== true || status !== 'LOCKED' || String(route.missionId || '') !== String(mission.id || '')) return null;
    const select = document.getElementById('brokerPreviewLeg');
    const selectedId = String(select?.value || '');
    const allocations = arr(route.allocations).filter(row => num(row?.amount) > 0);
    const leg = allocations.find(row => String(row?.id || row?.legId || '') === selectedId) || allocations[0] || null;
    if (!leg) return null;
    const legId = String(leg.legId || leg.id || '');
    const receipt = arr(state?.registration?.receipts).find(row =>
      String(row?.missionId || '') === String(mission.id || '') &&
      String(row?.legId || row?.allocationId || '') === legId
    );
    return { state, mission, route, leg, legId, receipt };
  }

  function actualInput() {
    const shares = Math.max(0, num(document.getElementById('brokerPreviewShares')?.value));
    const priceInput = Math.max(0, num(document.getElementById('brokerPreviewPrice')?.value));
    const priceUnit = String(document.getElementById('brokerPreviewPriceUnit')?.value || 'GBP').toUpperCase();
    const currency = String(document.getElementById('brokerPreviewCurrency')?.value || 'GBP').trim().toUpperCase();
    const fxRateToGbp = currency === 'GBP' ? 1 : Math.max(0, num(document.getElementById('brokerPreviewFx')?.value));
    const feesNative = Math.max(0, num(document.getElementById('brokerPreviewFees')?.value));
    const unitPrice = priceUnit === 'PENCE' ? priceInput / 100 : priceInput;
    const grossCostNative = shares * unitPrice;
    const totalCostNative = grossCostNative + feesNative;
    const totalCostGbp = currency === 'GBP' ? totalCostNative : totalCostNative * fxRateToGbp;
    const tradeDate = String(document.getElementById('brokerPreviewDate')?.value || '').trim();
    return { shares, priceInput, priceUnit, currency, fxRateToGbp, feesNative, unitPrice, grossCostNative, totalCostNative, totalCostGbp, tradeDate };
  }

  function localHolding(state, account, ticker) {
    const code = accountCode(account);
    const symbol = String(ticker || '').toUpperCase();
    return arr(state?.squad?.holdings).find(row =>
      accountCode(row?.account) === code &&
      String(row?.ticker || '').toUpperCase() === symbol &&
      !['SOLD','ARCHIVED'].includes(String(row?.status || '').toUpperCase())
    ) || null;
  }

  function scoutingTarget(state, ticker) {
    const symbol = String(ticker || '').toUpperCase();
    return arr(state?.scouting?.targets).find(row => String(row?.ticker || '').toUpperCase() === symbol) || null;
  }

  function priorHoldingSnapshot(holding) {
    if (!holding) return null;
    return {
      holdingId: holding.id || '', account: accountCode(holding.account), ticker: String(holding.ticker || '').toUpperCase(), name: holding.name || holding.ticker,
      shares: num(holding.shares), bookCostGbp: num(holding.bookCostGbp), avgCostGbp: num(holding.avgCostGbp), livePriceGbp: num(holding.livePriceGbp),
      marketValueGbp: num(holding.marketValueGbp), profitLossGbp: num(holding.profitLossGbp), annualDpsGbp: num(holding.annualDpsGbp),
      annualIncomeGbp: num(holding.annualIncomeGbp), sector: holding.sector || '', role: holding.role || '', status: holding.status || 'ACTIVE',
      locked: !!holding.locked, lockReason: holding.lockReason || '', source: holding.source || 'AURORA2_SQUAD', sourceUpdatedAt: holding.sourceUpdatedAt || null
    };
  }

  function compactBackup(state, ctx) {
    const snapshot = {
      savedAt: new Date().toISOString(),
      build: BUILD,
      mission: state.mission || null,
      route: state.transfer?.route || null,
      registrationDrafts: arr(state.transfer?.registrationDrafts),
      receipts: arr(state.registration?.receipts),
      selectedLegId: ctx.legId
    };
    try {
      localStorage.removeItem(BACKUP_KEY);
      localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshot));
      return true;
    } catch (_) {
      return false;
    }
  }

  function reserveCapacity() {
    try {
      localStorage.removeItem(RESERVE_KEY);
      localStorage.setItem(RESERVE_KEY, 'R'.repeat(14000));
      return true;
    } catch (_) {
      return false;
    }
  }

  function writeConfirmedState(next) {
    localStorage.removeItem(RESERVE_KEY);
    const text = JSON.stringify(next);
    try {
      localStorage.setItem(STATE_KEY, text);
      return;
    } catch (first) {
      try { localStorage.removeItem(ROUTE_BACKUP_KEY); } catch (_) {}
      try {
        localStorage.setItem(STATE_KEY, text);
        return;
      } catch (second) {
        try { localStorage.removeItem(FULL_BACKUP_KEY); } catch (_) {}
        localStorage.setItem(STATE_KEY, text);
      }
    }
  }

  function buildPayload(ctx, actual) {
    const { state, mission, route, leg, legId } = ctx;
    const account = accountCode(leg.account);
    const ticker = String(leg.ticker || '').toUpperCase();
    const target = scoutingTarget(state, ticker);
    const holding = localHolding(state, account, ticker);
    const stable = hash(`${mission.id}|${route.id}|${legId}`);
    const transactionId = `TX-R3-${stable}`;
    const clientRequestId = `REQ-R3-${stable}`;
    const planned = round2(leg.amount);
    const difference = round2(actual.totalCostGbp - planned);
    const confirmedAt = new Date().toISOString();

    const draft = {
      id: `REGDRAFT-R3-${stable}`, routeId: route.id, missionId: mission.id, allocationId: leg.id || legId, legId,
      transactionId, clientRequestId, tradeDate: actual.tradeDate, account, ticker, name: leg.name || ticker, side: 'BUY',
      shares: actual.shares, priceInput: actual.priceInput, priceUnit: (actual.currency === 'GBP' && actual.priceUnit === 'PENCE') ? 'PENCE' : 'GBP',
      currency: actual.currency, fxRateToGbp: actual.fxRateToGbp, grossCostNative: actual.grossCostNative, feesNative: actual.feesNative,
      totalCostNative: actual.totalCostNative, totalCostGbp: actual.totalCostGbp, plannedAmount: planned, differenceGbp: difference,
      expectedAnnualIncomeGbp: num(leg.expectedAnnualIncome), status: 'CONFIRMED', error: '', createdAt: confirmedAt, updatedAt: confirmedAt
    };

    const payload = {
      transaction: {
        transactionId, clientRequestId, tradeDate: actual.tradeDate, account, ticker, name: leg.name || ticker, side: 'BUY', shares: actual.shares,
        priceInput: actual.priceInput, priceUnit: draft.priceUnit, currency: actual.currency, fxRateToGbp: actual.fxRateToGbp, feesNative: actual.feesNative,
        totalCostGbp: actual.totalCostGbp, missionId: mission.id, routeId: route.id, allocationId: leg.id || legId, legId,
        strategy: route.strategy || '', recommendation: target?.recommendation || '', confidence: num(target?.confidence),
        expectedAnnualIncomeGbp: num(leg.expectedAnnualIncome)
      },
      priorHolding: priorHoldingSnapshot(holding),
      missionSnapshot: {
        missionId: mission.id, paydayDate: mission.paydayDate || '', approvedBudget: num(mission.approvedBudget), status: mission.status,
        totalCash: num(mission.financeSnapshot?.totalCash), commitments: num(mission.financeSnapshot?.commitments), protectedCash: num(mission.financeSnapshot?.protectedCash),
        safeSurplus: num(mission.financeSnapshot?.safeSurplus), expectedWages: num(mission.financeSnapshot?.expectedWages), wagesReceived: num(mission.financeSnapshot?.wagesReceived),
        wageDifference: num(mission.financeSnapshot?.wageDifference), annualBillFunding: num(mission.financeSnapshot?.annualBillFunding),
        potFundingRequired: num(mission.financeSnapshot?.potsDue), holdingPotTopUp: num(mission.financeSnapshot?.holdingPotTopUp), source: 'AURORA2_FINANCE'
      },
      routeSnapshot: {
        routeId: route.id, missionId: route.missionId, strategy: route.strategy || '', financeBudget: num(route.financeBudget), allocated: num(route.allocated),
        remaining: num(route.remaining), expectedAnnualIncome: num(route.income ?? route.expectedAnnualIncome), status: route.status, locked: !!route.locked,
        createdAt: route.createdAt, allocations: route.allocations
      }
    };
    return { payload, draft };
  }

  function setStatus(text, className) {
    const state = document.getElementById('brokerPreviewState');
    if (state) {
      state.textContent = text;
      state.className = className || '';
    }
  }

  function note(text) {
    const section = document.getElementById('registrationBrokerPreview');
    const node = section?.querySelector('.reg-execution-note');
    if (node) node.innerHTML = text;
  }

  async function registerOne() {
    const button = document.getElementById('registerOneLeg');
    const ctx = selectedContext();
    const actual = actualInput();
    if (!button || !ctx) return;
    if (ctx.receipt) { arm(); return; }

    const contract = window.AuroraTransferMission;
    const client = window.AuroraData2Client;
    const check = contract?.validateRegistration?.(ctx.state, {
      missionId: ctx.mission.id, legId: ctx.legId, allocationId: ctx.leg.id || ctx.legId,
      ticker: ctx.leg.ticker, account: ctx.leg.account, shares: actual.shares, price: actual.priceInput
    });
    const errors = [...(check?.errors || [])];
    if (!actual.tradeDate) errors.push('Trade date is required.');
    if (!/^[A-Z]{3}$/.test(actual.currency)) errors.push('Currency must use a three-letter code.');
    if (actual.currency !== 'GBP' && !(actual.fxRateToGbp > 0)) errors.push('FX to GBP must be greater than zero.');
    if (!(actual.totalCostGbp > 0)) errors.push('Actual GBP cost must be greater than zero.');
    if (errors.length) {
      alert(`Registration was not sent.\n\n${errors.join('\n')}`);
      return;
    }

    const config = client?.config?.() || {};
    if (!config.endpoint || !config.token) {
      alert('AuroraData 2 is not connected in this browser. Nothing was sent.');
      arm();
      return;
    }

    const planned = round2(ctx.leg.amount);
    if (!confirm(`Register ${ctx.leg.ticker} with AuroraData 2?\n\nPlanned: ${money(planned)}\nActual: ${money(actual.totalCostGbp)}\nShares: ${actual.shares}\n\nThis confirms ONE purchase leg. Squad will remain unchanged.`)) return;

    if (!compactBackup(ctx.state, ctx)) {
      alert('Registration was not sent because Aurora could not create the safety backup. Nothing has changed.');
      return;
    }
    if (!reserveCapacity()) {
      alert('Registration was not sent because this browser does not have enough safe local storage for the confirmation receipt. Nothing has changed.');
      return;
    }

    const built = buildPayload(ctx, actual);
    button.disabled = true;
    button.textContent = 'Confirming with AuroraData 2…';
    setStatus('WRITING ONE LEG', 'warn');
    note('<strong>Controlled write in progress:</strong> AuroraData 2 is confirming this one frozen leg. Squad remains held.');

    try {
      const result = await client.post('registerPurchase', built.payload);
      if (!result?.confirmed || !result?.transaction) throw new Error('AuroraData 2 did not return a confirmed transaction.');
      if (String(result.transaction.transactionId || '') !== String(built.draft.transactionId)) throw new Error('Confirmed transaction ID did not match the request.');

      const confirmedAt = result.confirmedAt || new Date().toISOString();
      const totalCostGbp = round2(result.transaction.totalCostGbp ?? actual.totalCostGbp);
      const receipt = {
        id: result.receiptId || result.backendReceiptId || `RECEIPT-${hash(built.draft.transactionId)}`,
        backendReceiptId: result.receiptId || result.backendReceiptId || '',
        transactionId: built.draft.transactionId,
        routeId: ctx.route.id,
        missionId: ctx.mission.id,
        allocationId: ctx.leg.id || ctx.legId,
        legId: ctx.legId,
        account: accountCode(ctx.leg.account),
        ticker: String(ctx.leg.ticker || '').toUpperCase(),
        totalCostGbp,
        confirmedAt,
        duplicate: !!result.duplicate,
        source: 'AURORADATA2'
      };
      const confirmedDraft = {
        ...built.draft,
        totalCostGbp,
        backendReceiptId: receipt.backendReceiptId,
        confirmedAt,
        status: 'CONFIRMED',
        updatedAt: confirmedAt,
        previousShares: num(result.transaction.previousShares),
        newShares: num(result.transaction.newShares),
        previousBookCostGbp: num(result.transaction.previousBookCostGbp),
        newBookCostGbp: num(result.transaction.newBookCostGbp),
        previousAvgCostGbp: num(result.transaction.previousAvgCostGbp),
        newAvgCostGbp: num(result.transaction.newAvgCostGbp)
      };

      const fresh = readState();
      if (!fresh || String(fresh.mission?.id || '') !== String(ctx.mission.id) || String(fresh.transfer?.route?.id || '') !== String(ctx.route.id)) {
        throw new Error('Aurora state changed while the broker confirmation was in flight. The backend receipt exists, but local reconciliation was stopped for safety.');
      }
      const nextDrafts = [confirmedDraft, ...arr(fresh.transfer?.registrationDrafts).filter(row =>
        String(row?.id || '') !== confirmedDraft.id &&
        !(String(row?.routeId || '') === String(ctx.route.id) && String(row?.allocationId || row?.legId || '') === String(ctx.legId))
      )];
      const nextReceipts = [receipt, ...arr(fresh.registration?.receipts).filter(row => String(row?.transactionId || '') !== receipt.transactionId)].slice(0, 100);
      const next = {
        ...fresh,
        connection: { ...(fresh.connection || {}), mode: 'AuroraData2', status: 'CONNECTED', spreadsheetId: client.spreadsheetId },
        transfer: { ...(fresh.transfer || {}), registrationDrafts: nextDrafts, updatedAt: confirmedAt },
        registration: {
          ...(fresh.registration || {}),
          backend: { ...(fresh.registration?.backend || {}), status: 'CONNECTED', spreadsheetId: client.spreadsheetId, lastHealthAt: confirmedAt, lastError: null },
          receipts: nextReceipts,
          updatedAt: confirmedAt
        },
        alerts: [
          { id: `ALERT-${hash(receipt.transactionId)}`, title: 'Purchase registered', note: `${receipt.ticker} • ${receipt.account} • ${money(receipt.totalCostGbp)} confirmed. Squad update held for controlled test.`, when: 'now', createdAt: confirmedAt },
          ...arr(fresh.alerts).filter(row => row?.title !== 'Purchase registered')
        ].slice(0, 8),
        updatedAt: confirmedAt
      };

      writeConfirmedState(next);
      window.dispatchEvent(new CustomEvent('aurora2:state', { detail: { source: 'registration-one-leg-write', build: BUILD, legId: ctx.legId } }));
      setStatus('ONE LEG CONFIRMED', 'good');
      note(`<strong>Confirmed by AuroraData 2:</strong> ${receipt.ticker} • ${money(receipt.totalCostGbp)}. Registration receipt saved. Squad is still unchanged.`);
      alert(`${receipt.ticker} confirmed successfully.\n\n${money(receipt.totalCostGbp)} registered with AuroraData 2.\nSquad has NOT been updated.`);
    } catch (error) {
      localStorage.removeItem(RESERVE_KEY);
      setStatus('WRITE HELD', 'bad');
      note(`<strong>Registration held:</strong> ${String(error?.message || error)} Squad remains unchanged.`);
      alert(`Registration was not completed locally.\n\n${String(error?.message || error)}`);
    } finally {
      localStorage.removeItem(RESERVE_KEY);
      setTimeout(arm, 40);
    }
  }

  function arm() {
    const section = document.getElementById('registrationBrokerPreview');
    if (!section) return;
    const actions = section.querySelector('.reg-execution-actions');
    if (!actions) return;
    let button = document.getElementById('registerOneLeg');
    if (!button) {
      button = actions.querySelector('button:last-child');
      if (!button) return;
      button.id = 'registerOneLeg';
    }

    const ctx = selectedContext();
    const actual = actualInput();
    const client = window.AuroraData2Client;
    const contract = window.AuroraTransferMission;
    const config = client?.config?.() || {};
    const valid = Boolean(ctx && !ctx.receipt && contract?.validateRegistration && actual.shares > 0 && actual.priceInput > 0 && actual.totalCostGbp > 0 && actual.tradeDate && (actual.currency === 'GBP' || actual.fxRateToGbp > 0));

    if (ctx?.receipt) {
      button.disabled = true;
      button.textContent = 'Already confirmed';
      setStatus('ONE LEG CONFIRMED', 'good');
    } else if (!client || !contract) {
      button.disabled = true;
      button.textContent = 'Loading write controls…';
    } else if (!config.endpoint || !config.token) {
      button.disabled = true;
      button.textContent = 'AuroraData 2 not connected';
    } else {
      button.disabled = !valid;
      button.textContent = valid ? 'Register & Confirm One Leg' : 'Complete execution details';
    }

    const chip = section.querySelector('.reg-execution-chip');
    if (chip) chip.textContent = 'ONE-LEG WRITE • SQUAD HELD';
    const pill = document.querySelector('.registration-pill.readonly');
    if (pill) pill.textContent = 'LOCKED ROUTE • ONE-LEG WRITE';
    const top = document.querySelector('.topbar .status b');
    if (top) top.textContent = 'ONE-LEG REGISTER';
    const flowMeta = document.getElementById('regFlowExecutionMeta');
    if (flowMeta) flowMeta.textContent = 'One locked leg can be confirmed with AuroraData 2; Squad remains held';
    const flowCards = document.querySelectorAll('.reg-flow article');
    if (flowCards[2]) {
      const span = flowCards[2].querySelector('span');
      const flag = flowCards[2].querySelector('b');
      if (span) span.textContent = 'One-leg canonical write enabled for controlled testing.';
      if (flag) flag.textContent = 'CONTROLLED';
    }
    if (flowCards[3]) {
      const span = flowCards[3].querySelector('span');
      const flag = flowCards[3].querySelector('b');
      if (span) span.textContent = 'Squad update remains deliberately disconnected.';
      if (flag) flag.textContent = 'HELD';
    }
    const footer = document.querySelector('.stage-note');
    if (footer) footer.innerHTML = '<strong>Registration R3 — one-leg canonical write.</strong> AuroraData 2 can confirm one selected locked purchase leg. A compact recovery snapshot is taken first, and Squad remains disabled for this test.';

    if (!button.dataset.oneLegBound) {
      button.dataset.oneLegBound = 'true';
      button.addEventListener('click', registerOne);
    }

    window.AuroraRegistrationOneLegWrite = Object.freeze({
      build: BUILD,
      ready: true,
      backendConfigured: Boolean(config.endpoint && config.token),
      selectedLegId: ctx?.legId || null,
      alreadyConfirmed: Boolean(ctx?.receipt),
      writeEnabled: Boolean(valid && config.endpoint && config.token),
      squadWriteEnabled: false
    });
  }

  async function boot() {
    try { localStorage.removeItem(RESERVE_KEY); } catch (_) {}
    try {
      await loadScript(CONTRACT_SRC, () => Boolean(window.AuroraTransferMission?.validateRegistration));
      await loadScript(DATA_CLIENT_SRC, () => Boolean(window.AuroraData2Client?.post));
    } catch (error) {
      console.warn('[Aurora Registration R3]', String(error?.message || error));
    }

    let tries = 0;
    const wait = () => {
      if (window.AuroraRegistrationBrokerPreview?.ready && document.getElementById('registrationBrokerPreview')) {
        arm();
        return;
      }
      tries += 1;
      if (tries < 600) setTimeout(wait, 25);
    };
    wait();

    document.addEventListener('input', event => {
      if (String(event.target?.id || '').startsWith('brokerPreview')) setTimeout(arm, 0);
    });
    document.addEventListener('change', event => {
      if (String(event.target?.id || '').startsWith('brokerPreview')) setTimeout(arm, 0);
    });
    window.addEventListener('aurora2:state', () => setTimeout(arm, 40));
    window.addEventListener('pageshow', () => setTimeout(arm, 80));
    window.addEventListener('focus', () => setTimeout(arm, 80));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
