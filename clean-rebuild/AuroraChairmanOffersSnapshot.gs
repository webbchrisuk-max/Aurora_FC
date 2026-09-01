/* Aurora City FC — Chairman Offers clean rebuild, phase 2
 *
 * READ-ONLY backend authority for Chairman review candidates.
 *
 * Action: getChairmanOffersSnapshot (READ)
 *
 * Source of truth:
 *   auroraGetSquadSnapshot_() = Holdings + LivePrices backend authority
 *
 * This phase does NOT create, save, withdraw, accept or execute offers.
 * It only identifies live holdings that have reached the Chairman review bands.
 */

const AURORA_CHAIRMAN_V2_SOURCE = 'AURORA_CHAIRMAN_V2_BACKEND';
const AURORA_CHAIRMAN_V2_REVIEW_PCT = 6;
const AURORA_CHAIRMAN_V2_STRONG_REVIEW_PCT = 10;
const AURORA_CHAIRMAN_V2_EXCLUDED_TICKERS = ['TSCO'];

function auroraGetChairmanOffersSnapshot_(payload) {
  if (typeof auroraGetSquadSnapshot_ !== 'function') {
    throw new Error('Squad backend authority is unavailable.');
  }

  const squad = auroraGetSquadSnapshot_({});
  if (!squad || squad.ok !== true || !Array.isArray(squad.holdings)) {
    throw new Error('Invalid Squad backend snapshot.');
  }

  const reviews = squad.holdings
    .filter(function (holding) {
      const ticker = auroraChairmanV2Ticker_(holding.ticker);
      const gainPct = auroraChairmanV2Num_(holding.profitLossPct);
      if (!ticker) return false;
      if (AURORA_CHAIRMAN_V2_EXCLUDED_TICKERS.indexOf(ticker) >= 0) return false;
      return gainPct >= AURORA_CHAIRMAN_V2_REVIEW_PCT;
    })
    .map(function (holding) {
      const ticker = auroraChairmanV2Ticker_(holding.ticker);
      const gainPct = auroraChairmanV2Num_(holding.profitLossPct);
      const tier = gainPct >= AURORA_CHAIRMAN_V2_STRONG_REVIEW_PCT
        ? 'STRONG_REVIEW'
        : 'REVIEW';

      return {
        reviewId: 'CHAIRMAN-' + ticker + '-' + auroraChairmanV2AccountKey_(holding.account),
        ticker: ticker,
        name: String(holding.name || ticker),
        account: String(holding.account || 'Unspecified'),
        status: 'REVIEW',
        tier: tier,
        triggerPct: tier === 'STRONG_REVIEW'
          ? AURORA_CHAIRMAN_V2_STRONG_REVIEW_PCT
          : AURORA_CHAIRMAN_V2_REVIEW_PCT,
        gainPct: gainPct,
        shares: auroraChairmanV2Num_(holding.shares),
        avgCostGbp: auroraChairmanV2Num_(holding.avgCostGbp),
        livePriceGbp: auroraChairmanV2Num_(holding.livePriceGbp),
        marketValueGbp: auroraChairmanV2Num_(holding.marketValueGbp),
        bookCostGbp: auroraChairmanV2Num_(holding.bookCostGbp),
        profitLossGbp: auroraChairmanV2Num_(holding.profitLossGbp),
        annualIncomeGbp: auroraChairmanV2Num_(holding.annualIncomeGbp),
        dayChangePct: holding.dayChangePct == null ? null : auroraChairmanV2Num_(holding.dayChangePct),
        tradeTime: String(holding.tradeTime || ''),
        replacementStatus: 'NOT_EVALUATED',
        executable: false,
        source: AURORA_CHAIRMAN_V2_SOURCE
      };
    });

  reviews.sort(function (a, b) {
    if (b.gainPct !== a.gainPct) return b.gainPct - a.gainPct;
    return b.marketValueGbp - a.marketValueGbp;
  });

  const strongReviewCount = reviews.filter(function (row) {
    return row.tier === 'STRONG_REVIEW';
  }).length;

  return {
    ok: true,
    source: AURORA_CHAIRMAN_V2_SOURCE,
    authority: squad.source || 'AURORADATA_BACKEND_SINGLE_AUTHORITY',
    generatedAt: new Date().toISOString(),
    thresholds: {
      reviewPct: AURORA_CHAIRMAN_V2_REVIEW_PCT,
      strongReviewPct: AURORA_CHAIRMAN_V2_STRONG_REVIEW_PCT
    },
    excludedTickers: AURORA_CHAIRMAN_V2_EXCLUDED_TICKERS.slice(),
    holdingCount: squad.holdingCount || squad.holdings.length,
    reviewCount: reviews.length,
    strongReviewCount: strongReviewCount,
    executableCount: 0,
    reviews: reviews,
    offerCount: 0,
    offers: []
  };
}

function auroraChairmanV2Ticker_(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^LON:/, '')
    .replace(/\.L$/, '')
    .replace(/\.GB$/, '');
}

function auroraChairmanV2AccountKey_(value) {
  return String(value || 'UNSPECIFIED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');
}

function auroraChairmanV2Num_(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function testAuroraChairmanOffersSnapshot() {
  const result = auroraGetChairmanOffersSnapshot_({});
  Logger.log(JSON.stringify(result, null, 2));
}
