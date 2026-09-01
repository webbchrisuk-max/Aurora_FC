/* Aurora City FC — Chairman Offers clean rebuild, phase 1
 *
 * Read-only backend authority for the clean Transfer Centre.
 *
 * Google Sheet authority: IncomingOffers
 * Action: getChairmanOffersSnapshot (READ)
 *
 * This phase does NOT create, update, withdraw or migrate offers.
 * It only reads rows explicitly owned by the new clean rebuild source.
 */

const AURORA_CHAIRMAN_V2_SPREADSHEET_ID = '10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
const AURORA_CHAIRMAN_V2_SHEET = 'IncomingOffers';
const AURORA_CHAIRMAN_V2_SOURCE = 'Aurora Chairman V2';

function auroraGetChairmanOffersSnapshot_(payload) {
  const ss = SpreadsheetApp.openById(AURORA_CHAIRMAN_V2_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(AURORA_CHAIRMAN_V2_SHEET);
  if (!sheet) throw new Error('IncomingOffers sheet not found.');

  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return {
      ok: true,
      source: 'AURORA_CHAIRMAN_V2_BACKEND',
      generatedAt: new Date().toISOString(),
      offerCount: 0,
      offers: []
    };
  }

  const headers = values[0].map(v => String(v || '').trim());
  const col = name => headers.indexOf(name);

  const sourceCol = col('source');
  if (sourceCol < 0) throw new Error('IncomingOffers is missing required source column.');

  const rows = values.slice(1)
    .filter(row => String(row[sourceCol] || '').trim() === AURORA_CHAIRMAN_V2_SOURCE)
    .map(row => ({
      id: auroraChairmanV2Text_(row[col('offer_id')]),
      createdAt: auroraChairmanV2Iso_(row[col('created_at')]),
      ticker: auroraChairmanV2Text_(row[col('ticker')]),
      name: auroraChairmanV2Text_(row[col('name')]),
      account: auroraChairmanV2Text_(row[col('account')]),
      status: auroraChairmanV2Text_(row[col('status')]) || 'WATCHING',
      shares: auroraChairmanV2Num_(row[col('requested_shares')]),
      currentShares: auroraChairmanV2Num_(row[col('current_shares')]),
      currentPrice: auroraChairmanV2Num_(row[col('current_price')]),
      offerPrice: auroraChairmanV2Num_(row[col('offer_price')]),
      premiumPct: auroraChairmanV2Pct_(row[col('premium_pct')]),
      currentValueGbp: auroraChairmanV2Num_(row[col('current_value_gbp')]),
      offerValueGbp: auroraChairmanV2Num_(row[col('offer_value_gbp')]),
      bookCostReleasedGbp: auroraChairmanV2Num_(row[col('book_cost_released_gbp')]),
      estimatedGainLossGbp: auroraChairmanV2Num_(row[col('est_gain_loss_gbp')]),
      annualIncomeLostGbp: auroraChairmanV2Num_(row[col('annual_income_lost_gbp')]),
      replacementIncomeNeededGbp: auroraChairmanV2Num_(row[col('replacement_income_needed_gbp')]),
      reason: auroraChairmanV2Text_(row[col('reason')]),
      directorVerdict: auroraChairmanV2Text_(row[col('director_verdict')]),
      updatedAt: auroraChairmanV2Iso_(row[col('updated_at')]),
      source: AURORA_CHAIRMAN_V2_SOURCE
    }))
    .filter(row => row.id && row.ticker);

  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  return {
    ok: true,
    source: 'AURORA_CHAIRMAN_V2_BACKEND',
    generatedAt: new Date().toISOString(),
    offerCount: rows.length,
    offers: rows
  };
}

function auroraChairmanV2Text_(value) {
  return String(value == null ? '' : value).trim();
}

function auroraChairmanV2Num_(value) {
  if (value === '' || value == null) return 0;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function auroraChairmanV2Pct_(value) {
  if (value === '' || value == null) return 0;
  const text = String(value).trim();
  const n = auroraChairmanV2Num_(value);
  if (!Number.isFinite(n)) return 0;
  return text.includes('%') ? n : (Math.abs(n) <= 1 ? n * 100 : n);
}

function auroraChairmanV2Iso_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function testAuroraChairmanOffersSnapshot() {
  Logger.log(JSON.stringify(auroraGetChairmanOffersSnapshot_({}), null, 2));
}
