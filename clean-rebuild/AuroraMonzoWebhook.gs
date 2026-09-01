/* Aurora City FC — Monzo IFTTT Webhook receiver
 * Add this file to the existing Aurora Apps Script web app.
 *
 * POST action: monzoCardPurchase
 * GET action:  listMonzoRoundups
 *
 * The existing Aurora token/authentication check must run before either handler.
 */

const AURORA_MONZO_SHEET = 'MonzoRoundups';
const AURORA_MONZO_MULTIPLIER = 5;

function auroraMonzoSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AURORA_MONZO_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AURORA_MONZO_SHEET);
    sheet.appendRow([
      'transaction_id','received_at','transaction_time','merchant','purchase_amount_gbp',
      'round_up_base_gbp','multiplier','round_up_credit_gbp','status'
    ]);
  }
  return sheet;
}

function auroraHandleMonzoCardPurchase_(payload) {
  payload = payload || {};

  const transactionId = String(payload.transactionId || '').trim();
  const merchant = String(payload.merchant || payload.description || 'Card purchase').trim();
  const transactionTime = String(payload.transactionTime || payload.createdAt || new Date().toISOString()).trim();
  const amount = Number(String(payload.amount ?? '').replace(/[^0-9.-]/g, ''));

  if (!transactionId) throw new Error('Monzo transactionId is required.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monzo purchase amount must be a positive number.');

  const roundUpBase = Number((Math.ceil(amount) - amount).toFixed(2));
  const roundUpCredit = Number((roundUpBase * AURORA_MONZO_MULTIPLIER).toFixed(2));
  const sheet = auroraMonzoSheet_();

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
    if (ids.includes(transactionId)) {
      const rowIndex = ids.indexOf(transactionId) + 2;
      const existing = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
      return {
        ok: true,
        duplicate: true,
        transactionId,
        merchant: existing[3] || merchant,
        amount: Number(existing[4] || amount),
        roundUpBase: Number(existing[5] || 0),
        multiplier: Number(existing[6] || AURORA_MONZO_MULTIPLIER),
        roundUpCredit: Number(existing[7] || 0),
        status: String(existing[8] || 'DUPLICATE')
      };
    }
  }

  const receivedAt = new Date().toISOString();
  const status = roundUpCredit > 0 ? 'READY_FOR_EMERGENCY_POT' : 'NO_ROUNDUP';

  sheet.appendRow([
    transactionId,
    receivedAt,
    transactionTime,
    merchant,
    Number(amount.toFixed(2)),
    roundUpBase,
    AURORA_MONZO_MULTIPLIER,
    roundUpCredit,
    status
  ]);

  return {
    ok: true,
    duplicate: false,
    transactionId,
    merchant,
    amount: Number(amount.toFixed(2)),
    roundUpBase,
    multiplier: AURORA_MONZO_MULTIPLIER,
    roundUpCredit,
    status
  };
}

function auroraListMonzoRoundups_(limit) {
  const sheet = auroraMonzoSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, count: 0, roundups: [] };

  limit = Math.max(1, Math.min(200, Number(limit) || 100));
  const start = Math.max(2, lastRow - limit + 1);
  const values = sheet.getRange(start, 1, lastRow - start + 1, 9).getValues();
  const roundups = values.map(r => ({
    transactionId: String(r[0] || ''),
    receivedAt: String(r[1] || ''),
    transactionTime: String(r[2] || ''),
    merchant: String(r[3] || 'Card purchase'),
    amount: Number(r[4] || 0),
    roundUpBase: Number(r[5] || 0),
    multiplier: Number(r[6] || AURORA_MONZO_MULTIPLIER),
    roundUpCredit: Number(r[7] || 0),
    status: String(r[8] || '')
  })).filter(r => r.transactionId);

  return { ok: true, count: roundups.length, roundups };
}

/* Existing router integration:
 *
 * POST router:
 *   if (action === 'monzoCardPurchase') {
 *     return auroraHandleMonzoCardPurchase_(payload);
 *   }
 *
 * GET/JSONP router:
 *   if (action === 'listMonzoRoundups') {
 *     return auroraListMonzoRoundups_(params.limit);
 *   }
 */
