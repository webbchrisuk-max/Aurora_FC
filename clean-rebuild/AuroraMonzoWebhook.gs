/* Aurora City FC — Monzo IFTTT Webhook receiver
 * Add this file to the existing Aurora Apps Script web app.
 * It is designed to be called from the existing doPost router when action === 'monzoCardPurchase'.
 *
 * Expected payload fields:
 *   action: 'monzoCardPurchase'
 *   transactionId: unique Monzo transaction id
 *   amount: purchase amount in GBP
 *   merchant: merchant / description
 *   transactionTime: optional timestamp
 *
 * The handler is idempotent: the same transactionId is never credited twice.
 * Round-up rule: (ceil(amount) - amount) * 5. Whole-pound spends produce £0.00.
 */

const AURORA_MONZO_SHEET = 'MonzoRoundups';
const AURORA_MONZO_MULTIPLIER = 5;

function auroraHandleMonzoCardPurchase_(payload) {
  payload = payload || {};

  const transactionId = String(payload.transactionId || '').trim();
  const merchant = String(payload.merchant || payload.description || 'Card purchase').trim();
  const transactionTime = String(payload.transactionTime || payload.createdAt || new Date().toISOString()).trim();
  const amount = Number(String(payload.amount ?? '').replace(/[^0-9.-]/g, ''));

  if (!transactionId) {
    throw new Error('Monzo transactionId is required.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Monzo purchase amount must be a positive number.');
  }

  const roundUpBase = Number((Math.ceil(amount) - amount).toFixed(2));
  const roundUpCredit = Number((roundUpBase * AURORA_MONZO_MULTIPLIER).toFixed(2));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AURORA_MONZO_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AURORA_MONZO_SHEET);
    sheet.appendRow([
      'transaction_id','received_at','transaction_time','merchant','purchase_amount_gbp',
      'round_up_base_gbp','multiplier','round_up_credit_gbp','status'
    ]);
  }

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
    amount,
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

/*
 * Integration line for the existing POST router:
 *
 *   if (action === 'monzoCardPurchase') {
 *     return auroraHandleMonzoCardPurchase_(payload);
 *   }
 *
 * Keep the existing token/authentication check BEFORE this handler is called.
 */
