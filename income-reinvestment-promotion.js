(() => {
  'use strict';

  const BUILD = '20260822-income-reinvestment-promotion-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:squad:promotion:backup:lastgood';
  const RESERVE_KEY = 'aurora2:squad:promotion:reserve';
  const MAX_COST_OVER_DIVIDEND_GBP = 0.25;
  const SHARE_EPSILON = 0.000001;

  const client = window.AuroraData2Client;
  if (!client || typeof client.post !== 'function' || window.__auroraIncomeReinvestmentPromotion) return;
  window.__auroraIncomeReinvestmentPromotion = BUILD;

  const originalPost = client.post.bind(client);
  const arr = value => Array.isArray(value) ? value : [];
  const maybeNum = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const num = value => maybeNum(value) ?? 0;
  const round2 = value => Number(Math.max(0, num(value)).toFixed(2));
  const nowISO = () => new Date().toISOString();

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

  function tickerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/^LON:/, '').replace(/\.L$/, '').replace(/\.GB$/, '');
  }

  function exactTicker(value) {
    const tk = tickerCode(value);
    return /^[A-Z0-9.-]{1,16}$/.test(tk) ? tk : '';
  }

  function readState() {
    try {
      const core = window.Aurora2?.core?.read?.();
      if (core && typeof core === 'object') return core;
    } catch (_) {}
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeState(next) {
    localStorage.removeItem(RESERVE_KEY);
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  }

  function backupState(state) {
    try {
      localStorage.removeItem(BACKUP_KEY);
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        savedAt: nowISO(),
        build: BUILD,
        squad: state?.squad || null,
        registration: state?.registration || null,
        alerts: arr(state?.alerts),
        updatedAt: state?.updatedAt || null
      }));
      localStorage.removeItem(RESERVE_KEY);
      localStorage.setItem(RESERVE_KEY, 'R'.repeat(16000));
      return true;
    } catch (_) {
      return false;
    }
  }

  function parseTradeDate(reference) {
    const match = String(reference || '').match(/(?:^|:)(\d{4}-\d{2}-\d{2})(?:[:]|$)/);
    return match ? match[1] : new Date().toISOString().slice(0, 10);
  }

  function parseLegs(note) {
    const match = String(note || '').match(/(?:^|\s)RI2=([^\s]+)/);
    if (!match) return [];
    return String(match[1] || '').split('|').map((encoded, index) => {
      const [destRaw = '', sharesRaw = '', priceRaw = ''] = encoded.split('~');
      let destination = '';
      try { destination = decodeURIComponent(destRaw); } catch (_) { destination = destRaw; }
      return {
        index,
        destination,
        ticker: exactTicker(destination),
        shares: Math.max(0, num(sharesRaw)),
        priceGbp: Math.max(0, num(priceRaw))
      };
    }).filter(leg => leg.destination);
  }

  function activeHolding(state, account, ticker) {
    return arr(state?.squad?.holdings).find(row =>
      accountCode(row?.account) === account &&
      tickerCode(row?.ticker) === ticker &&
      !['SOLD', 'ARCHIVED', 'CLOSED', 'EXITED'].includes(String(row?.status || '').toUpperCase())
    ) || null;
  }

  function targetFor(state, ticker) {
    return arr(state?.scouting?.targets).find(row => tickerCode(row?.ticker) === ticker) || null;
  }

  function priorHoldingSnapshot(holding) {
    if (!holding) return null;
    return {
      holdingId: holding.id || '',
      account: accountCode(holding.account),
      ticker: tickerCode(holding.ticker),
      name: holding.name || holding.ticker || '',
      shares: num(holding.shares),
      bookCostGbp: num(holding.bookCostGbp),
      avgCostGbp: num(holding.avgCostGbp),
      livePriceGbp: num(holding.livePriceGbp),
      marketValueGbp: num(holding.marketValueGbp),
      profitLossGbp: num(holding.profitLossGbp),
      annualDpsGbp: num(holding.annualDpsGbp),
      annualIncomeGbp: num(holding.annualIncomeGbp),
      sector: holding.sector || '',
      role: holding.role || '',
      status: holding.status || 'ACTIVE',
      locked: !!holding.locked,
      lockReason: holding.lockReason || '',
      source: holding.source || 'AURORA2_SQUAD',
      sourceUpdatedAt: holding.sourceUpdatedAt || null
    };
  }

  function firstPositive(...values) {
    for (const value of values) {
      const n = maybeNum(value);
      if (n !== null && n > 0) return n;
    }
    return 0;
  }

  function promotionLedger(state) {
    return arr(state?.registration?.reinvestmentPromotions);
  }

  function alreadyPromoted(state, transactionId) {
    return promotionLedger(state).some(row => String(row?.transactionId || '') === String(transactionId) && String(row?.status || '').toUpperCase() === 'PROMOTED');
  }

  function transactionIds(context, leg) {
    const stable = hash(`${context.reference}|${context.account}|${leg.index}|${leg.ticker}|${leg.shares}|${leg.priceGbp}`);
    return {
      transactionId: `TX-RI-${stable}`,
      clientRequestId: `REQ-RI-${stable}`,
      missionId: `MISSION-RI-${hash(context.reference)}`,
      routeId: `ROUTE-RI-${hash(context.reference)}`,
      legId: `LEG-RI-${stable}`
    };
  }

  function buildPayload(context, leg, ids, state) {
    const holding = activeHolding(state, context.account, leg.ticker);
    const target = targetFor(state, leg.ticker);
    const totalCostGbp = round2(leg.shares * leg.priceGbp);
    const annualDps = firstPositive(holding?.annualDpsGbp, target?.annualDpsGbp, target?.annualDps, target?.dividendPerShareAnnualGbp, target?.recurringDpsGbp);
    const expectedAnnualIncomeGbp = annualDps > 0 ? leg.shares * annualDps : 0;
    const createdAt = nowISO();

    return {
      transaction: {
        transactionId: ids.transactionId,
        clientRequestId: ids.clientRequestId,
        tradeDate: context.tradeDate,
        account: context.account,
        ticker: leg.ticker,
        name: target?.name || holding?.name || leg.ticker,
        side: 'BUY',
        shares: leg.shares,
        priceInput: leg.priceGbp,
        priceUnit: 'GBP',
        currency: 'GBP',
        fxRateToGbp: 1,
        feesNative: 0,
        totalCostGbp,
        missionId: ids.missionId,
        routeId: ids.routeId,
        allocationId: ids.legId,
        legId: ids.legId,
        strategy: 'DIVIDEND_REINVESTMENT',
        recommendation: target?.recommendation || '',
        confidence: num(target?.confidence),
        expectedAnnualIncomeGbp
      },
      priorHolding: priorHoldingSnapshot(holding),
      missionSnapshot: {
        missionId: ids.missionId,
        paydayDate: context.tradeDate,
        approvedBudget: context.amountGbp,
        status: 'LOCKED',
        totalCash: context.amountGbp,
        commitments: context.totalReadyCostGbp,
        protectedCash: 0,
        safeSurplus: Math.max(0, context.amountGbp - context.totalReadyCostGbp),
        expectedWages: 0,
        wagesReceived: 0,
        wageDifference: 0,
        annualBillFunding: 0,
        potFundingRequired: 0,
        holdingPotTopUp: 0,
        source: 'INCOME_DIVIDEND_REINVESTMENT'
      },
      routeSnapshot: {
        routeId: ids.routeId,
        missionId: ids.missionId,
        strategy: 'DIVIDEND_REINVESTMENT',
        financeBudget: context.amountGbp,
        allocated: context.totalReadyCostGbp,
        remaining: Math.max(0, context.amountGbp - context.totalReadyCostGbp),
        expectedAnnualIncome: 0,
        status: 'LOCKED',
        locked: true,
        createdAt,
        allocations: context.readyLegs.map(item => ({
          id: transactionIds(context, item).legId,
          legId: transactionIds(context, item).legId,
          account: context.account,
          ticker: item.ticker,
          amount: round2(item.shares * item.priceGbp),
          expectedAnnualIncome: 0
        }))
      }
    };
  }

  function canonicalHoldingFromResult(state, context, leg, ids, result) {
    const transaction = result?.transaction || {};
    const existing = activeHolding(state, context.account, leg.ticker);
    const target = targetFor(state, leg.ticker);
    const newShares = maybeNum(transaction.newShares);
    const newBookCost = maybeNum(transaction.newBookCostGbp);
    const newAvgCost = maybeNum(transaction.newAvgCostGbp);
    const previousShares = maybeNum(transaction.previousShares);

    if (!(newShares > 0)) throw new Error(`${leg.ticker}: AuroraData 2 did not return authoritative newShares.`);
    if (!(newBookCost !== null && newBookCost > 0)) throw new Error(`${leg.ticker}: AuroraData 2 did not return authoritative newBookCostGbp.`);
    if (previousShares !== null && newShares + SHARE_EPSILON < previousShares) throw new Error(`${leg.ticker}: backend share total moved backwards on a BUY.`);

    const avgCost = newAvgCost && newAvgCost > 0 ? newAvgCost : newBookCost / newShares;
    const livePrice = firstPositive(existing?.livePriceGbp, target?.livePriceGbp, target?.priceGbp, target?.livePrice);
    const annualDps = firstPositive(existing?.annualDpsGbp, target?.annualDpsGbp, target?.annualDps, target?.dividendPerShareAnnualGbp, target?.recurringDpsGbp);
    const marketValue = livePrice > 0 ? newShares * livePrice : 0;
    const annualIncome = annualDps > 0 ? newShares * annualDps : 0;
    const confirmedAt = result?.confirmedAt || nowISO();

    return {
      ...(existing || {}),
      id: existing?.id || `HOLD-RI-${context.account}-${leg.ticker}-${hash(ids.transactionId).slice(0, 6)}`,
      account: context.account,
      ticker: leg.ticker,
      name: existing?.name || target?.name || leg.ticker,
      shares: newShares,
      bookCostGbp: newBookCost,
      avgCostGbp: avgCost,
      livePriceGbp: livePrice,
      marketValueGbp: marketValue,
      profitLossGbp: livePrice > 0 ? marketValue - newBookCost : num(existing?.profitLossGbp),
      annualDpsGbp: annualDps,
      annualIncomeGbp: annualIncome,
      sector: existing?.sector || target?.sector || target?.sectorName || '',
      role: existing?.role || target?.role || target?.incomeRole || '',
      status: 'ACTIVE',
      locked: !!existing?.locked,
      lockReason: existing?.lockReason || '',
      source: 'AURORADATA2_REGISTRATION_REINVESTMENT',
      sourceUpdatedAt: confirmedAt,
      lastTransactionId: ids.transactionId,
      lastRegistrationReceiptId: result?.receiptId || result?.backendReceiptId || ''
    };
  }

  function applyConfirmedPromotion(context, leg, ids, result) {
    const fresh = readState();
    if (!fresh) throw new Error('Aurora local state is unavailable after backend confirmation.');
    if (alreadyPromoted(fresh, ids.transactionId)) return { status: 'ALREADY_PROMOTED', ticker: leg.ticker, transactionId: ids.transactionId };

    const holding = canonicalHoldingFromResult(fresh, context, leg, ids, result);
    const confirmedAt = result?.confirmedAt || nowISO();
    const transaction = result?.transaction || {};
    const holdings = arr(fresh?.squad?.holdings);
    const existing = activeHolding(fresh, context.account, leg.ticker);
    const nextHoldings = existing
      ? holdings.map(row => row === existing ? holding : row)
      : [holding, ...holdings];

    const receipt = {
      id: result?.receiptId || result?.backendReceiptId || `RECEIPT-RI-${hash(ids.transactionId)}`,
      backendReceiptId: result?.receiptId || result?.backendReceiptId || '',
      transactionId: ids.transactionId,
      routeId: ids.routeId,
      missionId: ids.missionId,
      allocationId: ids.legId,
      legId: ids.legId,
      account: context.account,
      ticker: leg.ticker,
      shares: leg.shares,
      priceInput: leg.priceGbp,
      priceUnit: 'GBP',
      totalCostGbp: round2(transaction.totalCostGbp ?? leg.shares * leg.priceGbp),
      previousShares: num(transaction.previousShares),
      newShares: num(transaction.newShares),
      previousBookCostGbp: num(transaction.previousBookCostGbp),
      newBookCostGbp: num(transaction.newBookCostGbp),
      previousAvgCostGbp: num(transaction.previousAvgCostGbp),
      newAvgCostGbp: num(transaction.newAvgCostGbp),
      confirmedAt,
      duplicate: !!result?.duplicate,
      source: 'AURORADATA2',
      kind: 'DIVIDEND_REINVESTMENT',
      dividendReference: context.reference,
      dividendTicker: context.dividendTicker
    };

    const promotion = {
      id: `PROMO-RI-${hash(ids.transactionId)}`,
      transactionId: ids.transactionId,
      receiptId: receipt.id,
      dividendReference: context.reference,
      account: context.account,
      ticker: leg.ticker,
      shares: leg.shares,
      buyPriceGbp: leg.priceGbp,
      newShares: receipt.newShares,
      newBookCostGbp: receipt.newBookCostGbp,
      newAvgCostGbp: receipt.newAvgCostGbp,
      status: 'PROMOTED',
      promotedAt: confirmedAt,
      build: BUILD
    };

    const next = {
      ...fresh,
      squad: {
        ...(fresh.squad || {}),
        holdings: nextHoldings,
        source: 'AURORADATA2_REGISTRATION',
        updatedAt: confirmedAt
      },
      registration: {
        ...(fresh.registration || {}),
        backend: {
          ...(fresh.registration?.backend || {}),
          status: 'CONNECTED',
          spreadsheetId: client.spreadsheetId || fresh.registration?.backend?.spreadsheetId || '',
          lastHealthAt: confirmedAt,
          lastError: null
        },
        receipts: [receipt, ...arr(fresh.registration?.receipts).filter(row => String(row?.transactionId || '') !== ids.transactionId)].slice(0, 120),
        reinvestmentPromotions: [promotion, ...promotionLedger(fresh).filter(row => String(row?.transactionId || '') !== ids.transactionId)].slice(0, 200),
        updatedAt: confirmedAt
      },
      alerts: [
        {
          id: `ALERT-RI-${hash(ids.transactionId)}`,
          title: 'Dividend reinvestment promoted',
          note: `${leg.ticker} • ${context.account} • ${leg.shares.toLocaleString('en-GB', { maximumFractionDigits: 8 })} shares confirmed and promoted into Squad.`,
          when: 'now',
          createdAt: confirmedAt
        },
        ...arr(fresh.alerts).filter(row => String(row?.id || '') !== `ALERT-RI-${hash(ids.transactionId)}`)
      ].slice(0, 8),
      updatedAt: confirmedAt
    };

    writeState(next);
    window.dispatchEvent(new CustomEvent('aurora2:state', {
      detail: { source: 'income-reinvestment-promotion', build: BUILD, transactionId: ids.transactionId, ticker: leg.ticker }
    }));
    return { status: 'PROMOTED', ticker: leg.ticker, transactionId: ids.transactionId, newShares: receipt.newShares };
  }

  function setButtonProgress(text) {
    const button = document.getElementById('recordDividendCash');
    if (button) button.textContent = text;
  }

  async function promoteSettlement(payload) {
    const account = accountCode(payload?.account);
    const amountGbp = round2(payload?.amountGbp);
    const reference = String(payload?.reference || '').trim();
    const dividendTicker = tickerCode(payload?.ticker);
    const legs = parseLegs(payload?.note);
    const readyLegs = legs.filter(leg => leg.ticker && leg.shares > 0 && leg.priceGbp > 0);
    const heldLegs = legs.filter(leg => !readyLegs.includes(leg));
    const totalReadyCostGbp = round2(readyLegs.reduce((sum, leg) => sum + (leg.shares * leg.priceGbp), 0));
    const context = {
      account, amountGbp, reference, dividendTicker,
      tradeDate: parseTradeDate(reference),
      readyLegs, totalReadyCostGbp
    };

    if (!['IG', 'T212'].includes(account) || !reference || !legs.length) {
      return { promoted: [], held: legs, status: 'NO_PROMOTION_EVIDENCE' };
    }
    if (!readyLegs.length) {
      return { promoted: [], held: heldLegs, status: 'WAITING_FOR_COMPLETE_LEGS' };
    }
    if (totalReadyCostGbp > amountGbp + MAX_COST_OVER_DIVIDEND_GBP) {
      return { promoted: [], held: legs, status: 'COST_EXCEEDS_DIVIDEND', totalReadyCostGbp, amountGbp };
    }

    const config = client.config?.() || {};
    if (!config.endpoint || !config.token) {
      return { promoted: [], held: legs, status: 'BACKEND_NOT_CONNECTED' };
    }

    const initial = readState();
    if (!initial || !backupState(initial)) {
      return { promoted: [], held: legs, status: 'BACKUP_FAILED' };
    }

    const promoted = [];
    const held = [...heldLegs];
    try {
      for (let i = 0; i < readyLegs.length; i += 1) {
        const leg = readyLegs[i];
        if (leg.ticker === 'TSCO') {
          held.push({ ...leg, holdReason: 'LEGACY_LOCKED' });
          continue;
        }
        const ids = transactionIds(context, leg);
        const latest = readState();
        if (latest && alreadyPromoted(latest, ids.transactionId)) {
          promoted.push({ status: 'ALREADY_PROMOTED', ticker: leg.ticker, transactionId: ids.transactionId });
          continue;
        }
        setButtonProgress(`Confirming reinvestment ${i + 1}/${readyLegs.length}…`);
        const state = readState();
        if (!state) {
          held.push({ ...leg, holdReason: 'STATE_UNAVAILABLE' });
          continue;
        }
        const request = buildPayload(context, leg, ids, state);
        try {
          const result = await originalPost('registerPurchase', request);
          if (!result?.confirmed || !result?.transaction) throw new Error('AuroraData 2 did not return a confirmed transaction.');
          if (String(result.transaction.transactionId || '') !== ids.transactionId) throw new Error('Confirmed transaction ID did not match the reinvestment leg.');
          promoted.push(applyConfirmedPromotion(context, leg, ids, result));
        } catch (error) {
          held.push({ ...leg, holdReason: String(error?.message || error) });
        }
      }
    } finally {
      try { localStorage.removeItem(RESERVE_KEY); } catch (_) {}
    }

    const summary = { promoted, held, status: held.length ? (promoted.length ? 'PARTIAL' : 'HELD') : 'PROMOTED' };
    window.dispatchEvent(new CustomEvent('aurora:income-reinvestment-promotion', { detail: { build: BUILD, ...summary, reference } }));
    return summary;
  }

  function toast(text) {
    const el = document.getElementById('incomeToast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(window.__incomePromotionToastTimer);
    window.__incomePromotionToastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function announce(summary) {
    if (!summary) return;
    const promoted = arr(summary.promoted).length;
    const held = arr(summary.held).length;
    if (promoted && !held) {
      toast(`${promoted} reinvestment purchase${promoted === 1 ? '' : 's'} confirmed by Registration and promoted into Squad.`);
    } else if (promoted && held) {
      toast(`${promoted} reinvestment purchase${promoted === 1 ? '' : 's'} promoted into Squad • ${held} leg${held === 1 ? '' : 's'} held for review.`);
    } else if (summary.status === 'COST_EXCEEDS_DIVIDEND') {
      toast('Dividend recorded, but Squad promotion was held because the entered purchase cost exceeds the dividend amount.');
    } else if (held) {
      toast(`Dividend recorded • ${held} reinvestment leg${held === 1 ? '' : 's'} still need Registration confirmation.`);
    }
  }

  function patchPanelCopy() {
    const toolbar = document.querySelector('#cashReinvestFields .income-reinvest-toolbar span');
    if (toolbar && toolbar.textContent !== 'Complete ticker + shares + buy price → AuroraData 2 Registration → canonical Squad. Incomplete legs remain evidence only.') toolbar.textContent = 'Complete ticker + shares + buy price → AuroraData 2 Registration → canonical Squad. Incomplete legs remain evidence only.';
    const head = document.querySelector('#cashReinvestFields .income-reinvest-head span:last-child');
    if (head && head.textContent !== 'ONE DIVIDEND • CONFIRMED LEGS PROMOTE') head.textContent = 'ONE DIVIDEND • CONFIRMED LEGS PROMOTE';
    const status = document.getElementById('cashReinvestStatus');
    if (status && status.textContent.includes('Squad holdings are not changed here.')) {
      status.textContent = status.textContent.replace('Squad holdings are not changed here.', 'Complete legs promote only after AuroraData 2 confirms them.');
    }
  }

  function watchPanel() {
    patchPanelCopy();
    const observer = new MutationObserver(() => patchPanelCopy());
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  client.post = async function reinvestmentPromotionPost(action, payload) {
    const name = String(action || '').trim();
    const result = await originalPost(name, payload || {});
    if (name !== 'recordDividendSettlement' || String(payload?.mode || '').toUpperCase() !== 'REINVESTED') return result;

    let summary;
    try {
      summary = await promoteSettlement(payload || {});
    } catch (error) {
      summary = { promoted: [], held: parseLegs(payload?.note), status: 'HELD', error: String(error?.message || error) };
    }
    if (result && typeof result === 'object') result.reinvestmentPromotion = summary;
    setTimeout(() => announce(summary), 120);
    setTimeout(() => window.AuroraIncomeSettlementReconcile?.refresh?.(), 300);
    return result;
  };

  window.AuroraIncomeReinvestmentPromotion = Object.freeze({
    build: BUILD,
    promoteSettlement,
    parseLegs,
    ledger: () => promotionLedger(readState() || {}),
    backupKey: BACKUP_KEY
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchPanel, { once: true });
  else watchPanel();
})();