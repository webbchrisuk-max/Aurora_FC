(() => {
  'use strict';

  const BUILD = '20260824-phase2-registration-settlement-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:registration:phase2:backup:lastgood';
  const DATA_CLIENT_SRC = '/Aurora_FC/aurora-data2-client.js?v=20260824-phase2-registration-settlement-1';
  const CONTRACT_SRC = 'aurora-transfer-mission.js?v=20260824-phase2-registration-settlement-1';
  const EPSILON = 0.005;

  if (window.__AuroraRegistrationPhase2Settlement) return;
  window.__AuroraRegistrationPhase2Settlement = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(round2(value));

  function accountCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'IG' || raw.includes('IG ISA')) return 'IG';
    if (raw === 'T212' || raw.includes('212')) return 'T212';
    return 'CHECK';
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

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function writeState(next, previous) {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(previous)); } catch (_) {}
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', {
      detail: { source: 'registration-phase2-settlement', build: BUILD }
    }));
  }

  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    const key = src.split('?')[0];
    const existing = [...document.scripts].find(script => String(script.src || '').includes(key));
    if (existing) {
      return new Promise((resolve, reject) => {
        let tries = 0;
        const wait = () => {
          if (ready()) return resolve();
          tries += 1;
          if (tries > 300) return reject(new Error(`${key} did not become ready.`));
          setTimeout(wait, 25);
        };
        wait();
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.addEventListener('load', () => ready() ? resolve() : reject(new Error(`${key} loaded without its API.`)), { once: true });
      script.addEventListener('error', () => reject(new Error(`Could not load ${key}.`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function lockedContext() {
    const state = readState();
    const mission = state?.mission;
    const route = state?.transfer?.route;
    if (!state || !mission || !route) return null;
    if (String(mission.status || '').toUpperCase() !== 'LOCKED' || route.locked !== true) return null;
    if (String(route.missionId || '') !== String(mission.id || '')) return null;
    const allocations = arr(route.allocations).filter(row => num(row?.amount) > 0);
    const selectedId = String(document.getElementById('brokerPreviewLeg')?.value || '');
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
    const totalNative = shares * unitPrice + feesNative;
    const totalCostGbp = currency === 'GBP' ? totalNative : totalNative * fxRateToGbp;
    const tradeDate = String(document.getElementById('brokerPreviewDate')?.value || '').trim();
    return { shares, priceInput, priceUnit, currency, fxRateToGbp, feesNative, totalCostGbp, tradeDate };
  }

  function settlementReference(transactionId) {
    return `ADJ:REG-PURCHASE:${String(transactionId || '').trim()}`;
  }

  function ledgerHas(snapshot, reference) {
    return arr(snapshot?.ledger).some(row => String(row?.reference || '') === reference);
  }

  function balanceFor(snapshot, account) {
    const balances = snapshot?.balances || snapshot?.balance || {};
    if (account === 'IG') return round2(balances.IG ?? balances.ig ?? balances['IG ISA']);
    if (account === 'T212') return round2(balances.T212 ?? balances.t212 ?? balances['Trading 212'] ?? balances['Trading 212 ISA']);
    return 0;
  }

  async function settleBrokerCash(client, { transactionId, account, ticker, plannedBrokerCash, actualCostGbp }) {
    const ac = accountCode(account);
    const planned = round2(plannedBrokerCash);
    const actual = round2(actualCostGbp);
    const debit = round2(Math.min(planned, actual));
    if (!['IG', 'T212'].includes(ac) || debit < EPSILON) {
      return { status: 'NO_BROKER_CASH', account: ac, debitGbp: 0, reference: '' };
    }

    const reference = settlementReference(transactionId);
    const before = await client.post('brokerCashSnapshot', {});
    if (ledgerHas(before, reference)) {
      return { status: 'ALREADY_SETTLED', account: ac, debitGbp: debit, reference, snapshot: before };
    }

    const available = balanceFor(before, ac);
    if (available + 0.01 < debit) {
      return { status: 'CASH_SHORTFALL', account: ac, debitGbp: debit, availableGbp: available, reference, snapshot: before };
    }

    try {
      const adjusted = await client.post('adjustBrokerCash', {
        account: ac,
        changeGbp: -debit,
        reference,
        note: `Registration purchase settlement • ${String(ticker || '').toUpperCase()} • ${transactionId}`
      });
      const snapshot = adjusted?.snapshot || await client.post('brokerCashSnapshot', {});
      return { status: 'SETTLED', account: ac, debitGbp: debit, reference, snapshot };
    } catch (error) {
      return { status: 'SETTLEMENT_FAILED', account: ac, debitGbp: debit, reference, error: String(error?.message || error) };
    }
  }

  function setStatus(text, className) {
    const node = document.getElementById('brokerPreviewState');
    if (node) { node.textContent = text; node.className = className || ''; }
  }

  function setNote(html) {
    const note = document.querySelector('#registrationBrokerPreview .reg-execution-note');
    if (note) note.innerHTML = html;
  }

  function fundingSummary(leg) {
    const finance = round2(leg?.financeAmount ?? leg?.amount);
    const broker = round2(leg?.brokerCashAmount);
    const total = round2(leg?.totalPurchaseAmount ?? (finance + broker));
    return { finance, broker, total };
  }

  function ensureFundingStrip(ctx) {
    const section = document.getElementById('registrationBrokerPreview');
    if (!section || !ctx?.leg) return;
    let strip = document.getElementById('registrationPhase2FundingStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'registrationPhase2FundingStrip';
      strip.style.cssText = 'margin-top:12px;border:1px solid rgba(89,255,154,.16);border-radius:14px;padding:13px;background:rgba(89,255,154,.035);color:#a9bbb2;font:700 11px/1.55 system-ui';
      const actions = section.querySelector('.reg-execution-actions');
      if (actions) actions.insertAdjacentElement('beforebegin', strip);
      else section.appendChild(strip);
    }
    const funding = fundingSummary(ctx.leg);
    const label = accountCode(ctx.leg.account) === 'IG' ? 'IG ISA' : 'Trading 212 ISA';
    strip.innerHTML = `<strong style="color:#b6ffcf">Phase 2 funding:</strong> ${money(funding.finance)} new Finance cash + ${money(funding.broker)} existing ${label} cash = ${money(funding.total)} planned buying power. Existing broker cash is settled only after AuroraData 2 confirms the purchase.`;
  }

  async function registerSelected() {
    const ctx = lockedContext();
    const actual = actualInput();
    const client = window.AuroraData2Client;
    const contract = window.AuroraTransferMission;
    const button = document.getElementById('registerOneLeg');
    if (!ctx || !client?.post || !contract?.validateRegistration || !button) return;
    if (ctx.receipt) return arm();

    const check = contract.validateRegistration(ctx.state, {
      missionId: ctx.mission.id,
      legId: ctx.legId,
      allocationId: ctx.leg.id || ctx.legId,
      ticker: ctx.leg.ticker,
      account: ctx.leg.account,
      shares: actual.shares,
      price: actual.priceInput
    });
    const errors = [...(check?.errors || [])];
    if (!actual.tradeDate) errors.push('Trade date is required.');
    if (!(actual.totalCostGbp > 0)) errors.push('Actual GBP cost must be greater than zero.');
    if (actual.currency !== 'GBP' && !(actual.fxRateToGbp > 0)) errors.push('FX to GBP must be greater than zero.');
    if (errors.length) return alert(`Registration was not sent.\n\n${errors.join('\n')}`);

    const config = client.config?.() || {};
    if (!config.endpoint || !config.token) return alert('AuroraData 2 is not connected in this browser. Nothing was sent.');

    const funding = fundingSummary(ctx.leg);
    if (!confirm(`Register ${ctx.leg.ticker} with AuroraData 2?\n\nPlanned buying power: ${money(funding.total)}\nExisting broker cash planned: ${money(funding.broker)}\nActual trade: ${money(actual.totalCostGbp)}\n\nAfter confirmation, only same-broker cash will be debited.`)) return;

    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(ctx.state)); }
    catch (_) { return alert('Registration was not sent because Aurora could not create the safety backup.'); }

    const stable = hash(`${ctx.mission.id}|${ctx.route.id}|${ctx.legId}`);
    const transactionId = `TX-P2-${stable}`;
    const clientRequestId = `REQ-P2-${stable}`;
    const account = accountCode(ctx.leg.account);
    const ticker = String(ctx.leg.ticker || '').toUpperCase();
    const payload = {
      transaction: {
        transactionId, clientRequestId, tradeDate: actual.tradeDate, account, ticker,
        name: ctx.leg.name || ticker, side: 'BUY', shares: actual.shares,
        priceInput: actual.priceInput,
        priceUnit: actual.currency === 'GBP' && actual.priceUnit === 'PENCE' ? 'PENCE' : 'GBP',
        currency: actual.currency, fxRateToGbp: actual.fxRateToGbp, feesNative: actual.feesNative,
        totalCostGbp: actual.totalCostGbp,
        missionId: ctx.mission.id, routeId: ctx.route.id,
        allocationId: ctx.leg.id || ctx.legId, legId: ctx.legId,
        strategy: ctx.route.strategy || '', expectedAnnualIncomeGbp: num(ctx.leg.expectedAnnualIncome)
      },
      missionSnapshot: {
        missionId: ctx.mission.id, paydayDate: ctx.mission.paydayDate || '',
        approvedBudget: num(ctx.mission.approvedBudget), status: ctx.mission.status,
        source: 'AURORA2_FINANCE'
      },
      routeSnapshot: {
        routeId: ctx.route.id, missionId: ctx.route.missionId, strategy: ctx.route.strategy || '',
        financeBudget: num(ctx.route.financeBudget), allocated: num(ctx.route.allocated),
        remaining: num(ctx.route.remaining), status: ctx.route.status, locked: !!ctx.route.locked,
        allocations: ctx.route.allocations
      }
    };

    button.disabled = true;
    button.textContent = 'Confirming purchase…';
    setStatus('CONFIRMING PURCHASE', 'warn');
    setNote('<strong>Phase 2 write:</strong> AuroraData 2 is confirming the purchase. Broker cash will not be touched unless the purchase is confirmed first.');

    try {
      const result = await client.post('registerPurchase', payload);
      if (!result?.confirmed || !result?.transaction) throw new Error('AuroraData 2 did not return a confirmed transaction.');
      if (String(result.transaction.transactionId || '') !== transactionId) throw new Error('Confirmed transaction ID did not match the request.');

      const totalCostGbp = round2(result.transaction.totalCostGbp ?? actual.totalCostGbp);
      const cashSettlement = await settleBrokerCash(client, {
        transactionId,
        account,
        ticker,
        plannedBrokerCash: funding.broker,
        actualCostGbp: totalCostGbp
      });
      const confirmedAt = result.confirmedAt || new Date().toISOString();

      const fresh = readState();
      if (!fresh || String(fresh.mission?.id || '') !== String(ctx.mission.id) || String(fresh.transfer?.route?.id || '') !== String(ctx.route.id)) {
        throw new Error('Aurora state changed while Registration was confirming the purchase. Backend confirmation exists; local reconciliation was held.');
      }

      const receipt = {
        id: result.receiptId || result.backendReceiptId || `RECEIPT-${hash(transactionId)}`,
        backendReceiptId: result.receiptId || result.backendReceiptId || '',
        transactionId, routeId: ctx.route.id, missionId: ctx.mission.id,
        allocationId: ctx.leg.id || ctx.legId, legId: ctx.legId,
        account, ticker, totalCostGbp, confirmedAt, duplicate: !!result.duplicate,
        financeAmountPlanned: funding.finance,
        brokerCashAmountPlanned: funding.broker,
        brokerCashDebitedGbp: round2(cashSettlement.debitGbp),
        brokerCashSettlementStatus: cashSettlement.status,
        brokerCashSettlementReference: cashSettlement.reference || '',
        source: 'AURORADATA2_PHASE2'
      };
      const receipts = [receipt, ...arr(fresh.registration?.receipts).filter(row => String(row?.transactionId || '') !== transactionId)].slice(0, 100);
      const next = {
        ...fresh,
        connection: { ...(fresh.connection || {}), mode: 'AuroraData2', status: 'CONNECTED', spreadsheetId: client.spreadsheetId },
        registration: {
          ...(fresh.registration || {}),
          backend: { ...(fresh.registration?.backend || {}), status: 'CONNECTED', spreadsheetId: client.spreadsheetId, lastHealthAt: confirmedAt, lastError: null },
          receipts,
          updatedAt: confirmedAt
        },
        alerts: [
          {
            id: `ALERT-${hash(transactionId)}`,
            title: 'Purchase registered',
            note: `${ticker} • ${account} • ${money(totalCostGbp)} confirmed • broker cash ${cashSettlement.status.toLowerCase().replaceAll('_',' ')}.`,
            when: 'now', createdAt: confirmedAt
          },
          ...arr(fresh.alerts).filter(row => String(row?.id || '') !== `ALERT-${hash(transactionId)}`)
        ].slice(0, 8),
        updatedAt: confirmedAt
      };
      writeState(next, fresh);

      if (cashSettlement.status === 'SETTLED' || cashSettlement.status === 'ALREADY_SETTLED' || cashSettlement.status === 'NO_BROKER_CASH') {
        setStatus('PURCHASE + CASH RECONCILED', 'good');
        setNote(`<strong>Confirmed and reconciled:</strong> ${ticker} • ${money(totalCostGbp)}. ${funding.broker > 0 ? `${money(cashSettlement.debitGbp)} existing ${account === 'IG' ? 'IG ISA' : 'Trading 212 ISA'} cash settled.` : 'No existing broker cash was required.'}`);
      } else {
        setStatus('PURCHASE CONFIRMED • CASH CHECK', 'warn');
        setNote(`<strong>Purchase confirmed:</strong> ${ticker} • ${money(totalCostGbp)}. Broker-cash settlement is ${cashSettlement.status.replaceAll('_',' ')} and is flagged for reconciliation; Aurora will not double-debit it.`);
      }
    } catch (error) {
      setStatus('REGISTRATION HELD', 'bad');
      setNote(`<strong>Registration held:</strong> ${String(error?.message || error)}`);
      alert(`Registration was not completed locally.\n\n${String(error?.message || error)}`);
    } finally {
      setTimeout(arm, 80);
    }
  }

  function arm() {
    const section = document.getElementById('registrationBrokerPreview');
    if (!section) return false;
    const actions = section.querySelector('.reg-execution-actions');
    if (!actions) return false;
    let button = document.getElementById('registerOneLeg');
    if (!button) {
      button = actions.querySelector('button:last-child');
      if (!button) return false;
      button.id = 'registerOneLeg';
    }

    const ctx = lockedContext();
    const actual = actualInput();
    const client = window.AuroraData2Client;
    const contract = window.AuroraTransferMission;
    const config = client?.config?.() || {};
    const valid = Boolean(ctx && !ctx.receipt && contract?.validateRegistration && actual.shares > 0 && actual.priceInput > 0 && actual.totalCostGbp > 0 && actual.tradeDate && (actual.currency === 'GBP' || actual.fxRateToGbp > 0));

    if (ctx) ensureFundingStrip(ctx);
    if (ctx?.receipt) {
      button.disabled = true;
      button.textContent = 'Already confirmed';
      setStatus('PURCHASE CONFIRMED', 'good');
    } else if (!client?.post || !contract?.validateRegistration) {
      button.disabled = true;
      button.textContent = 'Loading Phase 2 controls…';
    } else if (!config.endpoint || !config.token) {
      button.disabled = true;
      button.textContent = 'AuroraData 2 not connected';
    } else {
      button.disabled = !valid;
      button.textContent = valid ? 'Register & Settle One Leg' : 'Complete execution details';
    }

    const chip = section.querySelector('.reg-execution-chip');
    if (chip) chip.textContent = 'PHASE 2 • PURCHASE + CASH SETTLEMENT';
    const pill = document.querySelector('.registration-pill.readonly');
    if (pill) pill.textContent = 'LOCKED ROUTE • CONTROLLED SETTLEMENT';
    const top = document.querySelector('.topbar .status b');
    if (top) top.textContent = 'SETTLEMENT';

    if (!button.dataset.phase2SettlementBound) {
      button.dataset.phase2SettlementBound = 'true';
      button.addEventListener('click', registerSelected);
    }

    window.AuroraRegistrationPhase2Settlement = Object.freeze({
      build: BUILD, ready: true,
      selectedLegId: ctx?.legId || null,
      brokerCashPlanned: round2(ctx?.leg?.brokerCashAmount),
      financeCashPlanned: round2(ctx?.leg?.financeAmount ?? ctx?.leg?.amount),
      alreadyConfirmed: Boolean(ctx?.receipt),
      writeEnabled: Boolean(valid && config.endpoint && config.token),
      settlementReference,
      settleBrokerCash
    });
    return true;
  }

  async function boot() {
    try {
      await loadScript(CONTRACT_SRC, () => Boolean(window.AuroraTransferMission?.validateRegistration));
      await loadScript(DATA_CLIENT_SRC, () => Boolean(window.AuroraData2Client?.post));
    } catch (error) {
      console.warn('[Aurora Phase 2 Registration]', String(error?.message || error));
    }

    let tries = 0;
    const wait = () => {
      tries += 1;
      if (arm() || tries > 600) return;
      setTimeout(wait, 25);
    };
    wait();

    const refresh = event => {
      if (!event?.target?.id || String(event.target.id).startsWith('brokerPreview')) setTimeout(arm, 0);
    };
    document.addEventListener('input', refresh);
    document.addEventListener('change', refresh);
    window.addEventListener('aurora2:state', () => setTimeout(arm, 60));
    window.addEventListener('pageshow', () => setTimeout(arm, 80));
    window.addEventListener('focus', () => setTimeout(arm, 80));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();