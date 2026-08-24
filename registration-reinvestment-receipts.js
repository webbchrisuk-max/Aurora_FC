(() => {
  'use strict';

  const BUILD = '20260824-registration-reinvestment-receipts-1';
  const STATE_KEY = 'aurora2:state:v1';
  if (window.__AuroraRegistrationReinvestmentReceipts) return;
  window.__AuroraRegistrationReinvestmentReceipts = BUILD;

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, num(value)));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const tickerCode = value => String(value || '').trim().toUpperCase().replace(/^LON:/, '').replace(/\.L$/, '').replace(/\.GB$/, '');

  function readState() {
    try {
      const live = window.Aurora2?.core?.read?.();
      if (live && typeof live === 'object') return live;
    } catch (_) {}
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function proofRows(state) {
    const promotions = arr(state?.registration?.reinvestmentPromotions);
    const receipts = arr(state?.registration?.receipts);
    const holdings = arr(state?.squad?.holdings);

    const txIds = new Set([
      ...promotions.map(row => String(row?.transactionId || '')).filter(Boolean),
      ...receipts.filter(row => String(row?.kind || '').toUpperCase() === 'DIVIDEND_REINVESTMENT').map(row => String(row?.transactionId || '')).filter(Boolean)
    ]);

    return [...txIds].map(transactionId => {
      const promotion = promotions.find(row => String(row?.transactionId || '') === transactionId) || null;
      const receipt = receipts.find(row => String(row?.transactionId || '') === transactionId) || null;
      const ticker = tickerCode(promotion?.ticker || receipt?.ticker);
      const account = String(promotion?.account || receipt?.account || '').toUpperCase();
      const holding = holdings.find(row => tickerCode(row?.ticker) === ticker && String(row?.account || '').toUpperCase().includes(account === 'IG' ? 'IG' : account === 'T212' ? '212' : account)) || null;
      const promoted = String(promotion?.status || '').toUpperCase() === 'PROMOTED';
      const squadMatched = !!holding && String(holding?.lastTransactionId || '') === transactionId && !!String(holding?.lastRegistrationReceiptId || '');
      const registered = !!receipt && !!String(receipt?.id || receipt?.backendReceiptId || '');
      return {
        transactionId, promotion, receipt, holding, ticker, account,
        registered, promoted, squadMatched,
        confirmedAt: receipt?.confirmedAt || promotion?.promotedAt || '',
        shares: num(receipt?.shares ?? promotion?.shares),
        cost: num(receipt?.totalCostGbp),
        receiptId: receipt?.id || receipt?.backendReceiptId || promotion?.receiptId || '',
        dividendReference: receipt?.dividendReference || promotion?.dividendReference || ''
      };
    }).sort((a, b) => String(b.confirmedAt).localeCompare(String(a.confirmedAt)));
  }

  function ensureStyles() {
    if (document.getElementById('registrationReinvestmentReceiptStyles')) return;
    const style = document.createElement('style');
    style.id = 'registrationReinvestmentReceiptStyles';
    style.textContent = `
      .reg-ri-proof{margin-top:22px;border:1px solid rgba(89,255,154,.16);border-radius:24px;padding:26px;background:linear-gradient(180deg,rgba(4,20,19,.94),rgba(3,10,16,.96));box-shadow:0 18px 50px rgba(0,0,0,.2)}
      .reg-ri-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.reg-ri-head h2{margin:0;font:900 clamp(28px,5vw,42px)/1 system-ui}.reg-ri-head p{max-width:820px;color:#879ba3;line-height:1.55}.reg-ri-chip{border:1px solid rgba(89,255,154,.25);border-radius:999px;padding:9px 12px;color:#a9ffc5;font:800 10px/1 system-ui;letter-spacing:.1em;text-transform:uppercase}
      .reg-ri-list{display:grid;gap:11px;margin-top:18px}.reg-ri-row{display:grid;grid-template-columns:minmax(170px,1.1fr) repeat(3,minmax(120px,.65fr)) minmax(220px,1.2fr);gap:12px;align-items:center;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:15px;background:rgba(0,0,0,.14)}.reg-ri-row small{display:block;color:#70858b;font:800 8px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase}.reg-ri-row strong{display:block;margin-top:5px;font:900 13px/1.25 system-ui}.reg-ri-status.ok{color:#9affbd}.reg-ri-status.wait{color:#ffe29a}.reg-ri-status.bad{color:#ff9ba6}.reg-ri-meta{color:#6f838b;font:650 9px/1.45 system-ui;overflow-wrap:anywhere}.reg-ri-empty{margin-top:18px;border:1px dashed rgba(255,213,107,.18);border-radius:16px;padding:18px;color:#bba77c}
      @media(max-width:950px){.reg-ri-row{grid-template-columns:1fr 1fr}.reg-ri-row>div:last-child{grid-column:1/-1}}@media(max-width:560px){.reg-ri-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    let section = document.getElementById('registrationReinvestmentReceipts');
    if (section) return section;
    const anchor = document.querySelector('.reg-allocations') || document.querySelector('.registration-page section:last-of-type');
    if (!anchor) return null;
    section = document.createElement('section');
    section.id = 'registrationReinvestmentReceipts';
    section.className = 'reg-ri-proof';
    anchor.insertAdjacentElement('afterend', section);
    return section;
  }

  function render() {
    ensureStyles();
    const section = ensureSection();
    if (!section) return;
    const state = readState();
    const rows = state ? proofRows(state) : [];
    const fullyPromoted = rows.filter(row => row.registered && row.promoted && row.squadMatched).length;
    section.innerHTML = `
      <div class="reg-ri-head"><div><span class="registration-kicker">Dividend Reinvestment Proof</span><h2>Registration Receipts & Squad Promotion</h2><p>This is separate from the locked Transfer-route intake. A reinvestment leg is complete only when its AuroraData 2 receipt, PROMOTED record and matching Squad holding all agree on the same transaction.</p></div><span class="reg-ri-chip">${fullyPromoted}/${rows.length} FULLY PROMOTED</span></div>
      ${rows.length ? `<div class="reg-ri-list">${rows.map(row => {
        const complete = row.registered && row.promoted && row.squadMatched;
        return `<article class="reg-ri-row">
          <div><small>Reinvestment</small><strong>${esc(row.ticker || 'UNKNOWN')} • ${esc(row.account === 'IG' ? 'IG ISA' : row.account === 'T212' ? 'Trading 212 ISA' : row.account || 'CHECK')}</strong><div class="reg-ri-meta">${esc(row.dividendReference || row.transactionId)}</div></div>
          <div><small>Registration</small><strong class="reg-ri-status ${row.registered ? 'ok' : 'wait'}">${row.registered ? '✓ REGISTERED' : 'PENDING'}</strong><div class="reg-ri-meta">${row.shares ? `${row.shares.toLocaleString('en-GB',{maximumFractionDigits:8})} shares` : 'shares unavailable'}${row.cost ? ` • ${money(row.cost)}` : ''}</div></div>
          <div><small>Promotion</small><strong class="reg-ri-status ${row.promoted ? 'ok' : 'wait'}">${row.promoted ? '✓ PROMOTED' : 'PENDING'}</strong><div class="reg-ri-meta">${esc(row.promotion?.status || 'No promotion record')}</div></div>
          <div><small>Squad</small><strong class="reg-ri-status ${row.squadMatched ? 'ok' : 'wait'}">${row.squadMatched ? '✓ SQUAD UPDATED' : 'PENDING'}</strong><div class="reg-ri-meta">${row.holding ? `${num(row.holding.shares).toLocaleString('en-GB',{maximumFractionDigits:8})} total shares` : 'No matching holding proof'}</div></div>
          <div><small>Receipt proof</small><strong class="reg-ri-status ${complete ? 'ok' : 'wait'}">${complete ? 'COMPLETE' : 'CHECK REQUIRED'}</strong><div class="reg-ri-meta">Receipt ${esc(row.receiptId || '—')}<br>TX ${esc(row.transactionId)}${row.confirmedAt ? `<br>${esc(row.confirmedAt)}` : ''}</div></div>
        </article>`;
      }).join('')}</div>` : '<div class="reg-ri-empty">No dividend-reinvestment Registration receipts are present in the current Aurora state yet.</div>'}
    `;
    window.AuroraRegistrationReinvestmentReceipts = Object.freeze({ build: BUILD, rows: rows.length, fullyPromoted, ready: true });
  }

  const boot = () => { render(); setTimeout(render, 350); setTimeout(render, 1200); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.addEventListener('storage', event => { if (event.key === STATE_KEY) render(); });
  window.addEventListener('aurora2:state', render);
  window.addEventListener('aurora:browser-sync-applied', render);
})();
