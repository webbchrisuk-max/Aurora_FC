(() => {
  'use strict';

  const BUILD = '20260824-income-broker-cash-truth-guard-1';
  const EXACT_PREFIX = 'ADJ:RI-EXACT-COST:';
  const REV_PREFIX = 'REV:RI-EXACT-COST:';
  const EPS = 0.001;

  if (window.__AuroraIncomeBrokerCashTruthGuard) return;
  window.__AuroraIncomeBrokerCashTruthGuard = BUILD;

  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Number(num(value).toFixed(2));
  const arr = value => Array.isArray(value) ? value : [];

  function changeOf(row) {
    return round2(row?.cashChangeGbp ?? row?.cash_change_gbp ?? row?.changeGbp ?? row?.change_gbp);
  }

  function accountOf(row) {
    const raw = String(row?.account || row?.broker || '').toUpperCase();
    if (raw === 'IG' || raw.includes('IG ISA')) return 'IG';
    if (raw === 'T212' || raw.includes('212')) return 'T212';
    return '';
  }

  function referenceOf(row) {
    return String(row?.reference || row?.ref || '').trim();
  }

  function installWriteGuard() {
    const client = window.AuroraData2Client;
    if (!client?.post || client.__brokerCashTruthGuardWrapped) return false;
    const originalPost = client.post.bind(client);
    client.post = async function(action, payload = {}) {
      const ref = String(payload?.reference || '');
      if (String(action || '') === 'adjustBrokerCash' && ref.startsWith(EXACT_PREFIX)) {
        return {
          confirmed: true,
          skipped: true,
          status: 'EVIDENCE_ONLY_NO_CASH_WRITE',
          reference: ref,
          note: 'Exact reinvestment cost differences are evidence reconciliation only; broker cash is not changed.'
        };
      }
      return originalPost(action, payload);
    };
    client.__brokerCashTruthGuardWrapped = true;
    client.__brokerCashTruthGuardOriginalPost = originalPost;
    return true;
  }

  async function reverseLegacyExactCostAdjustments() {
    const client = window.AuroraData2Client;
    const originalPost = client?.__brokerCashTruthGuardOriginalPost || client?.post?.bind(client);
    if (!client?.post || !originalPost) return { status: 'WAITING' };

    const snapshot = await originalPost('brokerCashSnapshot', {});
    const ledger = arr(snapshot?.ledger);
    const reversals = new Set(
      ledger.map(referenceOf).filter(ref => ref.startsWith(REV_PREFIX))
    );
    const exactRows = ledger.filter(row => referenceOf(row).startsWith(EXACT_PREFIX));
    const applied = [];

    for (const row of exactRows) {
      const originalRef = referenceOf(row);
      const change = changeOf(row);
      const account = accountOf(row);
      if (!account || Math.abs(change) < EPS) continue;
      const reversalRef = `${REV_PREFIX}${originalRef.slice(EXACT_PREFIX.length)}`;
      if (reversals.has(reversalRef)) continue;

      const result = await originalPost('adjustBrokerCash', {
        account,
        changeGbp: round2(-change),
        reference: reversalRef,
        note: `Reverse evidence-only reinvestment cash adjustment • ${originalRef} • restore broker-confirmed cash truth`
      });
      applied.push({ account, changeGbp: round2(-change), reference: reversalRef, result });
    }

    if (applied.length) {
      try { window.AuroraIncomeSettlementReconcile?.refresh?.(); } catch (_) {}
      try { window.AuroraIncomeReinvestmentLedgerUi?.refresh?.(); } catch (_) {}
      window.dispatchEvent(new CustomEvent('aurora:broker-cash-truth-restored', { detail: { build: BUILD, applied } }));
    }
    return { status: applied.length ? 'RESTORED' : 'CURRENT', applied };
  }

  async function boot() {
    let attempts = 0;
    while (attempts < 40 && !window.AuroraData2Client?.post) {
      await new Promise(resolve => setTimeout(resolve, 250));
      attempts += 1;
    }
    if (!window.AuroraData2Client?.post) return;
    installWriteGuard();
    try {
      const result = await reverseLegacyExactCostAdjustments();
      window.AuroraIncomeBrokerCashTruthGuard = Object.freeze({
        build: BUILD,
        ready: true,
        policy: 'BROKER_CONFIRMED_CASH_IS_AUTHORITY',
        exactCostRoundingWritesCash: false,
        lastRepair: result
      });
    } catch (error) {
      window.AuroraIncomeBrokerCashTruthGuard = Object.freeze({
        build: BUILD,
        ready: false,
        error: String(error?.message || error)
      });
    }
  }

  boot();
})();