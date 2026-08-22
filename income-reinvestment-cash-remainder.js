(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-cash-remainder-1';
  const EPSILON = 0.005;
  if (window.__auroraIncomeReinvestmentCashRemainder) return;
  window.__auroraIncomeReinvestmentCashRemainder = BUILD;

  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(round2(value));

  function hash(value) {
    let h = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function accountCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'IG' || raw.includes('IG ISA')) return 'IG';
    if (raw === 'T212' || raw.includes('212')) return 'T212';
    return 'CHECK';
  }

  function ticker(value) {
    return String(value || '').trim().toUpperCase().replace(/^LON:/, '').replace(/\.L$/, '').replace(/\.GB$/, '');
  }

  function toast(message) {
    const el = document.getElementById('incomeToast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(window.__incomeRemainderToastTimer);
    window.__incomeRemainderToastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function parseLegs(note) {
    const match = String(note || '').match(/(?:^|\s)RI2=([^\s]+)/);
    if (!match) return [];
    return String(match[1] || '').split('|').map(encoded => {
      const [destination = '', sharesRaw = '', priceRaw = ''] = encoded.split('~');
      return {
        destination,
        shares: Math.max(0, num(sharesRaw)),
        priceGbp: Math.max(0, num(priceRaw))
      };
    }).filter(leg => leg.destination);
  }

  function explicitRemainder() {
    const input = document.getElementById('cashReinvestCashRemaining');
    if (!input) return { supplied: false, amount: 0 };
    const raw = String(input.value ?? '').trim();
    if (raw === '') return { supplied: false, amount: 0 };
    return { supplied: true, amount: round2(raw) };
  }

  function resolveRemainder(payload) {
    const amountGbp = round2(payload?.amountGbp);
    const explicit = explicitRemainder();
    if (explicit.supplied) {
      if (explicit.amount > amountGbp + 0.01) return { valid: false, amount: explicit.amount, source: 'BROKER_EXACT', reason: 'Remainder cannot exceed the dividend amount.' };
      return { valid: true, amount: explicit.amount, source: 'BROKER_EXACT' };
    }

    const legs = parseLegs(payload?.note);
    if (!legs.length || legs.some(leg => !(leg.shares > 0) || !(leg.priceGbp > 0))) {
      return { valid: true, amount: null, source: 'NOT_CALCULATED' };
    }
    const spent = round2(legs.reduce((sum, leg) => sum + (leg.shares * leg.priceGbp), 0));
    return { valid: true, amount: round2(Math.max(0, amountGbp - spent)), source: 'CALCULATED', spent };
  }

  function adjustmentReference(dividendReference) {
    return `ADJ:RI-REMAINDER:${hash(dividendReference)}`;
  }

  function hasAdjustment(snapshot, reference) {
    return Array.isArray(snapshot?.ledger) && snapshot.ledger.some(row => String(row?.reference || '') === reference);
  }

  async function applyRemainder(post, { account, dividendTicker, dividendReference, amount, source }) {
    const ac = accountCode(account);
    const tk = ticker(dividendTicker);
    const remainder = round2(amount);
    if (!['IG', 'T212'].includes(ac) || !tk || !dividendReference) throw new Error('Broker, ticker and dividend reference are required for unused cash.');
    if (remainder < EPSILON) return { status: 'NO_CASH_REMAINDER', amount: 0 };

    const reference = adjustmentReference(dividendReference);
    const before = await post('brokerCashSnapshot', {});
    if (hasAdjustment(before, reference)) {
      return { status: 'ALREADY_APPLIED', amount: remainder, snapshot: before, reference };
    }

    const result = await post('adjustBrokerCash', {
      account: ac,
      changeGbp: remainder,
      reference,
      note: `Unused dividend cash after auto-reinvestment • ${tk} • ${source === 'BROKER_EXACT' ? 'broker confirmed' : 'calculated remainder'}`
    });
    const snapshot = result?.snapshot || await post('brokerCashSnapshot', {});
    return { status: 'APPLIED', amount: remainder, snapshot, reference };
  }

  function reinvestedRow(row) {
    const type = String(row?.type || '').toUpperCase().replace(/[^A-Z]+/g, '_');
    return type.includes('DIVIDEND_REINVESTED');
  }

  function latestMatchingSettlement(snapshot, account, tk) {
    const ac = accountCode(account);
    const symbol = ticker(tk);
    return (Array.isArray(snapshot?.ledger) ? snapshot.ledger : []).find(row =>
      reinvestedRow(row) && accountCode(row?.account) === ac && ticker(row?.ticker) === symbol && String(row?.reference || '').startsWith('DIV:')
    ) || null;
  }

  function installUi() {
    const panel = document.getElementById('cashReinvestFields');
    if (!panel || document.getElementById('cashReinvestCashRemainderRow')) return Boolean(panel);

    const status = document.getElementById('cashReinvestStatus');
    const row = document.createElement('div');
    row.id = 'cashReinvestCashRemainderRow';
    row.style.cssText = 'display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:10px;align-items:end;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07)';
    row.innerHTML = `
      <div class="field">
        <label>Unused cash remaining £</label>
        <input id="cashReinvestCashRemaining" type="number" min="0" step="0.01" placeholder="Leave blank to calculate">
        <small style="display:block;margin-top:4px;color:#8f819e;font-size:8px;line-height:1.4">If the broker shows an exact cash remainder, enter it here. Broker truth wins over rounded share-price maths.</small>
      </div>
      <button class="income-btn" id="cashReinvestApplyRemainder" type="button">Apply unused cash only</button>
    `;
    if (status) status.insertAdjacentElement('beforebegin', row);
    else panel.appendChild(row);

    document.getElementById('cashReinvestApplyRemainder')?.addEventListener('click', manualApply);
    return true;
  }

  async function manualApply() {
    const client = window.AuroraData2Client;
    if (!client?.post) return toast('AuroraData 2 client is not available.');
    const exact = explicitRemainder();
    const account = accountCode(document.getElementById('cashRecordAccount')?.value);
    const tk = ticker(document.getElementById('cashRecordTicker')?.value);
    if (!exact.supplied || exact.amount < EPSILON) return toast('Enter the exact unused broker cash amount first.');
    if (!['IG', 'T212'].includes(account) || !tk) return toast('Choose the broker and dividend ticker first.');

    const button = document.getElementById('cashReinvestApplyRemainder');
    if (button) { button.disabled = true; button.textContent = 'Reconciling cash…'; }
    try {
      const snapshot = await client.post('brokerCashSnapshot', {});
      const settlement = latestMatchingSettlement(snapshot, account, tk);
      if (!settlement) throw new Error(`No recorded auto-reinvested ${tk} dividend was found for this broker.`);
      const outcome = await applyRemainder(client.post.bind(client), {
        account,
        dividendTicker: tk,
        dividendReference: String(settlement.reference || ''),
        amount: exact.amount,
        source: 'BROKER_EXACT'
      });
      if (outcome.status === 'ALREADY_APPLIED') toast(`${money(exact.amount)} unused cash was already held in the ${account === 'IG' ? 'IG ISA' : 'Trading 212 ISA'} cash pot.`);
      else toast(`${money(exact.amount)} unused dividend cash added to the ${account === 'IG' ? 'IG ISA' : 'Trading 212 ISA'} cash pot.`);
      document.getElementById('cashReinvestCashRemaining').value = '';
      setTimeout(() => document.getElementById('refreshBrokerCash')?.click(), 80);
    } catch (error) {
      toast(`Unused cash reconciliation failed: ${String(error?.message || error)}`);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Apply unused cash only'; }
    }
  }

  function patchClient() {
    const client = window.AuroraData2Client;
    if (!client?.post || client.__incomeRemainderWrapped) return Boolean(client?.post);
    const originalPost = client.post.bind(client);
    client.__incomeRemainderWrapped = true;

    client.post = async function incomeRemainderPost(action, payload = {}) {
      const name = String(action || '').trim();
      if (name !== 'recordDividendSettlement' || String(payload?.mode || '').toUpperCase() !== 'REINVESTED') {
        return originalPost(name, payload);
      }

      const resolved = resolveRemainder(payload);
      if (!resolved.valid) throw new Error(resolved.reason || 'Invalid unused cash remainder.');
      const nextPayload = { ...payload };
      if (resolved.amount !== null) {
        nextPayload.note = `${String(payload?.note || '').trim()} • RCASH=${round2(resolved.amount).toFixed(2)} • RCASHSRC=${resolved.source}`.trim();
      }

      const result = await originalPost(name, nextPayload);
      let cashOutcome = null;
      if (resolved.amount !== null && resolved.amount >= EPSILON) {
        cashOutcome = await applyRemainder(originalPost, {
          account: nextPayload.account,
          dividendTicker: nextPayload.ticker,
          dividendReference: nextPayload.reference,
          amount: resolved.amount,
          source: resolved.source
        });
        if (result && typeof result === 'object') {
          result.reinvestmentCashRemainder = cashOutcome;
          if (cashOutcome?.snapshot) result.snapshot = cashOutcome.snapshot;
        }
        setTimeout(() => toast(`${money(resolved.amount)} unused dividend cash held in ${accountCode(nextPayload.account) === 'IG' ? 'IG ISA' : 'Trading 212 ISA'}.`), 500);
      }
      const input = document.getElementById('cashReinvestCashRemaining');
      if (input) input.value = '';
      return result;
    };
    return true;
  }

  function start() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const clientReady = patchClient();
      const uiReady = installUi();
      if ((clientReady && uiReady) || tries > 300) clearInterval(timer);
    }, 50);
    const observer = new MutationObserver(() => installUi());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.AuroraIncomeReinvestmentCashRemainder = Object.freeze({
    build: BUILD,
    applyRemainder,
    adjustmentReference,
    installUi
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();