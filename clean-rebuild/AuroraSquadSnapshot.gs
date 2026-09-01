/* Aurora City FC — Single Squad Snapshot backend authority
 *
 * READ action: getSquadSnapshot
 *
 * Source of truth:
 *   Holdings   = ownership, broker, shares, cost basis, income
 *   LivePrices = live price, day change %, trade time
 *
 * No browser holdings, no broker-price fallback, no last-known-good cache.
 */

const AURORA_SQUAD_SPREADSHEET_ID = '10MdgQKc4tParno7pNkz40eBGz308wxHu1u3gvJe_WsE';
const AURORA_SQUAD_HOLDINGS_SHEET = 'Holdings';
const AURORA_SQUAD_PRICES_SHEET = 'LivePrices';

function auroraGetSquadSnapshot_(payload) {
  const ss = SpreadsheetApp.openById(AURORA_SQUAD_SPREADSHEET_ID);
  const holdingsSheet = ss.getSheetByName(AURORA_SQUAD_HOLDINGS_SHEET);
  const pricesSheet = ss.getSheetByName(AURORA_SQUAD_PRICES_SHEET);

  if (!holdingsSheet) throw new Error('Holdings sheet not found in AuroraData.');
  if (!pricesSheet) throw new Error('LivePrices sheet not found in AuroraData.');

  const holdingsRows = auroraSquadObjects_(holdingsSheet);
  const priceRows = auroraSquadObjects_(pricesSheet);
  const priceMap = new Map();

  priceRows.forEach(function (row) {
    const ticker = auroraSquadTicker_(row.symbol || row.ticker);
    const price = auroraSquadNumber_(row.price);
    if (!ticker || !(price > 0)) return;

    const dayRaw = row.day_change_pct ?? row.change_pct ?? row.daychangepct;
    const dayChangePct = dayRaw === '' || dayRaw === null || dayRaw === undefined
      ? null
      : auroraSquadNumber_(dayRaw);

    priceMap.set(ticker, {
      price: price,
      dayChangePct: dayChangePct,
      tradeTime: auroraSquadTradeTime_(row.trade_time || row.tradetime)
    });
  });

  const closed = new Set(['SOLD', 'ARCHIVED', 'CLOSED', 'EXITED']);
  const holdings = [];

  holdingsRows.forEach(function (row) {
    const status = String(row.status || 'ACTIVE').trim().toUpperCase();
    const shares = Math.max(0, auroraSquadNumber_(row.shares));
    const ticker = auroraSquadTicker_(row.ticker || row.symbol);

    if (!ticker || !(shares > 0) || closed.has(status)) return;

    const quote = priceMap.get(ticker);
    if (!quote || !(quote.price > 0)) {
      throw new Error('No LivePrices quote found for active holding ' + ticker + '.');
    }

    const bookCostGbp = Math.max(0, auroraSquadNumber_(row.book_cost ?? row.bookcost));
    const annualDpsGbp = Math.max(0, auroraSquadNumber_(row.annual_dps ?? row.annualdps));
    const sheetAnnualIncome = Math.max(0, auroraSquadNumber_(row.annual_dps_total ?? row.annualdpstotal));
    const annualIncomeGbp = sheetAnnualIncome || (shares * annualDpsGbp);

    if (!(bookCostGbp > 0)) {
      throw new Error('Book cost missing for active holding ' + ticker + ' (' + String(row.account || 'Unspecified') + ').');
    }

    const livePriceGbp = quote.price;
    const marketValueGbp = shares * livePriceGbp;
    const profitLossGbp = marketValueGbp - bookCostGbp;
    const profitLossPct = (profitLossGbp / bookCostGbp) * 100;

    holdings.push({
      account: String(row.account || 'Unspecified'),
      ticker: ticker,
      name: String(row.name || ticker),
      sector: String(row.sector || ''),
      role: String(row.role || ''),
      status: status,
      shares: shares,
      bookCostGbp: bookCostGbp,
      avgCostGbp: bookCostGbp / shares,
      livePriceGbp: livePriceGbp,
      marketValueGbp: marketValueGbp,
      profitLossGbp: profitLossGbp,
      profitLossPct: profitLossPct,
      annualDpsGbp: annualDpsGbp,
      annualIncomeGbp: annualIncomeGbp,
      dayChangePct: quote.dayChangePct,
      dailyChangePct: quote.dayChangePct,
      tradeTime: quote.tradeTime,
      priceUpdatedAt: quote.tradeTime,
      priceSource: 'AURORADATA_LIVEPRICES_BACKEND',
      holdingsSource: 'AURORADATA_HOLDINGS_BACKEND'
    });
  });

  holdings.sort(function (a, b) {
    return b.marketValueGbp - a.marketValueGbp;
  });

  const totals = holdings.reduce(function (out, row) {
    out.marketValueGbp += row.marketValueGbp;
    out.bookCostGbp += row.bookCostGbp;
    out.profitLossGbp += row.profitLossGbp;
    out.annualIncomeGbp += row.annualIncomeGbp;
    return out;
  }, {
    marketValueGbp: 0,
    bookCostGbp: 0,
    profitLossGbp: 0,
    annualIncomeGbp: 0
  });

  totals.profitLossPct = totals.bookCostGbp > 0
    ? (totals.profitLossGbp / totals.bookCostGbp) * 100
    : 0;

  return {
    ok: true,
    source: 'AURORADATA_BACKEND_SINGLE_AUTHORITY',
    spreadsheetId: AURORA_SQUAD_SPREADSHEET_ID,
    generatedAt: new Date().toISOString(),
    holdingCount: holdings.length,
    quoteCount: priceMap.size,
    totals: totals,
    holdings: holdings
  };
}

function auroraSquadObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(auroraSquadHeaderKey_);

  return values.slice(1).map(function (row) {
    const out = {};
    headers.forEach(function (header, index) {
      if (header) out[header] = row[index];
    });
    return out;
  });
}

function auroraSquadHeaderKey_(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/%/g, 'pct')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function auroraSquadTicker_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^LON:/, '')
    .replace(/\.L$/, '')
    .replace(/\.GB$/, '');
}

function auroraSquadNumber_(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function auroraSquadTradeTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  const n = auroraSquadNumber_(value);
  if (n > 25000) {
    const date = new Date((n - 25569) * 86400000);
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  const parsed = new Date(value || '');
  return !isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function testAuroraSquadSnapshot() {
  const result = auroraGetSquadSnapshot_({});
  Logger.log(JSON.stringify(result, null, 2));
}
