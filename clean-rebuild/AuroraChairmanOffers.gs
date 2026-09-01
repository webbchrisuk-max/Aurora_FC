/* Aurora City FC — Chairman Offers backend authority
 *
 * Google Sheet authority: IncomingOffers
 * Actions:
 *   listChairmanOffers  (READ)
 *   saveChairmanOffers  (WRITE)
 *
 * Existing legacy IncomingOffers rows are preserved. Clean Transfer Centre
 * rows are identified by source = "Aurora Clean Chairman Offers".
 */

const AURORA_CHAIRMAN_SPREADSHEET_ID = '10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
const AURORA_CHAIRMAN_SHEET = 'IncomingOffers';
const AURORA_CHAIRMAN_SOURCE = 'Aurora Clean Chairman Offers';
const AURORA_CHAIRMAN_PAYLOAD_HEADER = 'clean_payload_json';

function auroraListChairmanOffers_(payload) {
  const sheet = auroraChairmanSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { ok: true, source: 'INCOMING_OFFERS_BACKEND', offers: [], count: 0 };
  }

  const headers = values[0].map(v => String(v || '').trim());
  const sourceCol = headers.indexOf('source');
  const payloadCol = headers.indexOf(AURORA_CHAIRMAN_PAYLOAD_HEADER);
  const offerIdCol = headers.indexOf('offer_id');
  const rows = [];

  values.slice(1).forEach(row => {
    if (sourceCol < 0 || String(row[sourceCol] || '').trim() !== AURORA_CHAIRMAN_SOURCE) return;

    let offer = null;
    if (payloadCol >= 0 && row[payloadCol]) {
      try { offer = JSON.parse(String(row[payloadCol])); } catch (_) {}
    }

    if (!offer || typeof offer !== 'object') {
      offer = auroraChairmanOfferFromLegacyRow_(headers, row);
    }

    if (offer && (offer.id || (offerIdCol >= 0 && row[offerIdCol]))) {
      offer.id = offer.id || String(row[offerIdCol]);
      rows.push(offer);
    }
  });

  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    ok: true,
    source: 'INCOMING_OFFERS_BACKEND',
    generatedAt: new Date().toISOString(),
    count: rows.length,
    offers: rows
  };
}

function auroraSaveChairmanOffers_(payload) {
  const offers = Array.isArray(payload && payload.offers) ? payload.offers : [];
  const sheet = auroraChairmanSheet_();
  const headers = auroraChairmanEnsureHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const idCol = headers.indexOf('offer_id');
  const sourceCol = headers.indexOf('source');
  const existing = new Map();

  data.slice(1).forEach((row, i) => {
    const id = idCol >= 0 ? String(row[idCol] || '').trim() : '';
    const src = sourceCol >= 0 ? String(row[sourceCol] || '').trim() : '';
    if (id && src === AURORA_CHAIRMAN_SOURCE) existing.set(id, i + 2);
  });

  let created = 0;
  let updated = 0;
  const seen = new Set();

  offers.forEach(raw => {
    if (!raw || typeof raw !== 'object') return;
    const offer = JSON.parse(JSON.stringify(raw));
    const id = String(offer.id || '').trim();
    if (!id) return;
    seen.add(id);

    const rowValues = auroraChairmanRow_(headers, offer);
    const rowNumber = existing.get(id);
    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, headers.length).setValues([rowValues]);
      updated++;
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([rowValues]);
      created++;
    }
  });

  // Offers removed from clean state are not deleted: mark them WITHDRAWN so the
  // sheet remains an audit trail across devices.
  existing.forEach((rowNumber, id) => {
    if (seen.has(id)) return;
    const statusCol = headers.indexOf('status');
    const updatedCol = headers.indexOf('updated_at');
    if (statusCol >= 0) sheet.getRange(rowNumber, statusCol + 1).setValue('WITHDRAWN');
    if (updatedCol >= 0) sheet.getRange(rowNumber, updatedCol + 1).setValue(new Date());
  });

  return {
    ok: true,
    source: 'INCOMING_OFFERS_BACKEND',
    savedAt: new Date().toISOString(),
    count: offers.length,
    created: created,
    updated: updated
  };
}

function auroraChairmanSheet_() {
  const ss = SpreadsheetApp.openById(AURORA_CHAIRMAN_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(AURORA_CHAIRMAN_SHEET);
  if (!sheet) throw new Error('IncomingOffers sheet not found.');
  auroraChairmanEnsureHeaders_(sheet);
  return sheet;
}

function auroraChairmanEnsureHeaders_(sheet) {
  const lastCol = Math.max(1, sheet.getLastColumn());
  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
  if (!headers.includes(AURORA_CHAIRMAN_PAYLOAD_HEADER)) {
    const col = headers.length + 1;
    sheet.getRange(1, col).setValue(AURORA_CHAIRMAN_PAYLOAD_HEADER);
    headers.push(AURORA_CHAIRMAN_PAYLOAD_HEADER);
  }
  return headers;
}

function auroraChairmanRow_(headers, offer) {
  const now = new Date();
  const values = {
    offer_id: offer.id,
    created_at: auroraChairmanDate_(offer.createdAt) || now,
    offer_type: 'CHAIRMAN INCOME RECYCLING OFFER',
    authenticity: 'AURORA CLEAN BACKEND',
    bidder_name: 'Aurora Chairman',
    bidder_badge: 'ACFC',
    ticker: offer.ticker || '',
    name: offer.name || offer.ticker || '',
    account: offer.account || '',
    scenario_type: offer.source === 'MANUAL' ? 'MANUAL' : 'AUTO +6%',
    status: String(offer.status || 'WATCHING').toUpperCase(),
    requested_shares: auroraChairmanNum_(offer.shares),
    current_shares: auroraChairmanNum_(offer.originalHoldingShares || offer.shares),
    current_price: auroraChairmanNum_(offer.lastLivePrice),
    offer_price: auroraChairmanNum_(offer.targetPrice),
    price_unit: 'GBP',
    currency: 'GBP',
    premium_pct: auroraChairmanNum_(offer.triggerGainPct || 6) / 100,
    current_value_gbp: auroraChairmanNum_(offer.shares) * auroraChairmanNum_(offer.lastLivePrice),
    offer_value_gbp: auroraChairmanNum_(offer.shares) * auroraChairmanNum_(offer.targetPrice),
    book_cost_released_gbp: auroraChairmanNum_(offer.shares) * auroraChairmanNum_(offer.avgCostGbp),
    est_gain_loss_gbp: (auroraChairmanNum_(offer.shares) * auroraChairmanNum_(offer.lastLivePrice)) - (auroraChairmanNum_(offer.shares) * auroraChairmanNum_(offer.avgCostGbp)),
    annual_income_lost_gbp: auroraChairmanNum_(offer.annualIncomeSurrendered),
    replacement_income_needed_gbp: auroraChairmanNum_(offer.replacementProjectedAnnualIncome),
    concentration_before_pct: '',
    concentration_after_pct: auroraChairmanNum_(offer.replacementPostTickerPct) / 100,
    reason: offer.notes || (offer.source === 'MANUAL' ? 'Manual Chairman offer.' : 'Auto +6% income-recycling offer.'),
    director_verdict: offer.replacementTicker ? ('Replacement: ' + offer.replacementTicker + ' · ' + (offer.replacementConfidence || 'QUALIFIED')) : 'Awaiting qualified replacement',
    source: AURORA_CHAIRMAN_SOURCE,
    source_url: '',
    expires_at: '',
    linked_sell_ticket: '',
    counter_price: '',
    counter_shares: '',
    updated_at: now,
    clean_payload_json: JSON.stringify(offer)
  };

  return headers.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');
}

function auroraChairmanOfferFromLegacyRow_(headers, row) {
  const get = name => {
    const i = headers.indexOf(name);
    return i >= 0 ? row[i] : '';
  };
  return {
    id: String(get('offer_id') || ''),
    ticker: String(get('ticker') || ''),
    name: String(get('name') || ''),
    account: String(get('account') || ''),
    shares: auroraChairmanNum_(get('requested_shares')),
    originalHoldingShares: auroraChairmanNum_(get('current_shares')),
    targetPrice: auroraChairmanNum_(get('offer_price')),
    lastLivePrice: auroraChairmanNum_(get('current_price')),
    annualIncomeSurrendered: auroraChairmanNum_(get('annual_income_lost_gbp')),
    status: String(get('status') || 'WATCHING'),
    createdAt: auroraChairmanIso_(get('created_at')),
    source: 'BACKEND_RECOVERED'
  };
}

function auroraChairmanNum_(value) {
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function auroraChairmanDate_(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function auroraChairmanIso_(value) {
  const d = auroraChairmanDate_(value);
  return d ? d.toISOString() : '';
}

function testAuroraChairmanOffers() {
  Logger.log(JSON.stringify(auroraListChairmanOffers_({}), null, 2));
}
