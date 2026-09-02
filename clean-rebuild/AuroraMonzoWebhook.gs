/* Aurora City FC — Monzo IFTTT Webhook receiver
 * Add this file to the existing Aurora Apps Script web app.
 *
 * POST actions:
 *   monzoCardPurchase
 *   monzoPaydayNotification
 * GET action:
 *   listMonzoRoundups
 *
 * The existing Aurora token/authentication check must run before either handler.
 */

const AURORA_MONZO_SHEET = 'MonzoRoundups';
const AURORA_MONZO_PAYDAY_SHEET = 'MonzoPaydayNotifications';
const AURORA_MONZO_MULTIPLIER = 5;
const AURORA_MONZO_MIN_ROUNDUP_PURCHASE_GBP = 1;

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

function auroraMonzoPaydaySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AURORA_MONZO_PAYDAY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AURORA_MONZO_PAYDAY_SHEET);
    sheet.appendRow([
      'event_id','received_at','notification_received_at','app_name','device_name',
      'notification_title','notification_message','detected_amount_gbp','status','notes'
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

  // Aurora rule: purchases below £1 never create a round-up.
  // Whole-pound purchases also naturally produce a zero round-up.
  const roundUpBase = amount < AURORA_MONZO_MIN_ROUNDUP_PURCHASE_GBP
    ? 0
    : Number((Math.ceil(amount) - amount).toFixed(2));
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

function auroraExtractGbpAmountFromNotification_(title, message) {
  const text = [title, message].filter(Boolean).join(' ');
  const matches = [...text.matchAll(/(?:£|GBP\s*)(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi)];
  if (!matches.length) return null;

  // Prefer the largest positive GBP figure if a notification contains more than one amount.
  const amounts = matches
    .map(m => Number(String(m[1]).replace(/,/g, '')))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!amounts.length) return null;
  return Number(Math.max.apply(null, amounts).toFixed(2));
}

function auroraHandleMonzoPaydayNotification_(payload) {
  payload = payload || {};

  const title = String(payload.notificationTitle || '').trim();
  const message = String(payload.notificationMessage || payload.notificationText || '').trim();
  const appName = String(payload.appName || '').trim();
  const deviceName = String(payload.deviceName || '').trim();
  const notificationReceivedAt = String(payload.receivedAt || new Date().toISOString()).trim();

  if (!title && !message) throw new Error('Monzo payday notification must include a title or message.');

  const detectedAmount = auroraExtractGbpAmountFromNotification_(title, message);
  const receivedAt = new Date().toISOString();
  const eventSeed = [notificationReceivedAt, appName, deviceName, title, message].join('|');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, eventSeed, Utilities.Charset.UTF_8);
  const eventId = 'pay_' + digest.slice(0, 12).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  const sheet = auroraMonzoPaydaySheet_();

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
    if (ids.includes(eventId)) {
      const rowIndex = ids.indexOf(eventId) + 2;
      const existing = sheet.getRange(rowIndex, 1, 1, 10).getValues()[0];
      return {
        ok: true,
        duplicate: true,
        eventId,
        detectedAmountGbp: Number(existing[7] || 0) || null,
        status: String(existing[8] || 'DUPLICATE')
      };
    }
  }

  // First capture safely. Finance should only auto-accept once the real Monzo wage
  // notification wording/reference has been observed and a reliable rule is configured.
  const status = detectedAmount !== null ? 'PAYDAY_CANDIDATE' : 'AMOUNT_NOT_DETECTED';
  const notes = detectedAmount !== null
    ? 'Captured from Monzo Android notification; awaiting wage identity rule.'
    : 'Captured, but no GBP amount could be parsed from the notification.';

  sheet.appendRow([
    eventId,
    receivedAt,
    notificationReceivedAt,
    appName,
    deviceName,
    title,
    message,
    detectedAmount === null ? '' : detectedAmount,
    status,
    notes
  ]);

  return {
    ok: true,
    duplicate: false,
    eventId,
    notificationTitle: title,
    notificationMessage: message,
    detectedAmountGbp: detectedAmount,
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

/* Manual Apps Script tests. These appear in the Run function selector. */
function testMonzoRoundupUnderOnePound() {
  const result = auroraHandleMonzoCardPurchase_({
    transactionId: 'TEST-UNDER-1-' + Date.now(),
    transactionTime: new Date().toISOString(),
    merchant: 'Aurora Test',
    amount: 0.88
  });
  Logger.log(JSON.stringify(result));
  return result;
}

function testMonzoRoundupNormalPurchase() {
  const result = auroraHandleMonzoCardPurchase_({
    transactionId: 'TEST-ROUNDUP-' + Date.now(),
    transactionTime: new Date().toISOString(),
    merchant: 'Aurora Test',
    amount: 1.38
  });
  Logger.log(JSON.stringify(result));
  return result;
}

function testMonzoPaydayNotification() {
  const result = auroraHandleMonzoPaydayNotification_({
    notificationTitle: 'Money received',
    notificationMessage: 'You received £2,500.00 from Aurora Test Employer',
    appName: 'Monzo',
    receivedAt: new Date().toISOString(),
    deviceName: 'Aurora Test Device'
  });
  Logger.log(JSON.stringify(result));
  return result;
}

/* Existing router integration:
 *
 * POST router:
 *   if (action === 'monzoCardPurchase') {
 *     return auroraHandleMonzoCardPurchase_(payload);
 *   }
 *   if (action === 'monzoPaydayNotification') {
 *     return auroraHandleMonzoPaydayNotification_(payload);
 *   }
 *
 * GET/JSONP router:
 *   if (action === 'listMonzoRoundups') {
 *     return auroraListMonzoRoundups_(params.limit);
 *   }
 */
