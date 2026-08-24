(() => {
  'use strict';

  const BUILD = '20260824-scouting-controller-consolidated-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const NETWORK_URLS = [
    'https://webbchrisuk-max.github.io/aurora-fc-2/AuroraMaster.json',
    'https://raw.githubusercontent.com/webbchrisuk-max/aurora-fc-2/main/AuroraMaster.json'
  ];
  const NETWORK_SYNC_MS = 6 * 60 * 60 * 1000;
  const NETWORK_RENDER_LIMIT = 120;
  const AUTO_BENCH_TOTAL = 12;
  const AUTO_BENCH_MIN_STRENGTH = 60;
  const AUTO_BENCH_MAX_YIELD = 12;
  const HARD_GATES = Object.freeze({
    minDividendSafety: 35,
    cleanDividendSafety: 60,
    minConfidence: 50,
    cleanConfidence: 75,
    cautionYield: 10,
    pendingCoverage: 0.55
  });
  const FACTORS = ['dividendSafety','incomeScore','valuationScore','portfolioFit','dividendGrowth','businessQuality'];
  const WEIGHTS = Object.freeze({
    sustainable: Object.freeze({dividendSafety:25,incomeScore:20,valuationScore:20,portfolioFit:15,dividendGrowth:10,businessQuality:10}),
    maximum: Object.freeze({dividendSafety:20,incomeScore:45,valuationScore:10,portfolioFit:10,dividendGrowth:5,businessQuality:10})
  });
  const MEMBERSHIP_SOURCES = Object.freeze([
    {id:'FTSE_100',label:'FTSE 100',page:'FTSE_100_Index',region:'UK',exchange:'LSE',currency:'GBP'},
    {id:'FTSE_250',label:'FTSE 250',page:'FTSE_250_Index',region:'UK',exchange:'LSE',currency:'GBP'},
    {id:'SP_500',label:'S&P 500',page:'List_of_S%26P_500_companies',region:'US',exchange:'US',currency:'USD'},
    {id:'STOXX_600',label:'STOXX Europe 600',page:'STOXX_Europe_600',region:'EUROPE',exchange:'STOXX',currency:'EUR'},
    {id:'TSX_COMPOSITE',label:'S&P/TSX Composite',page:'S%26P/TSX_Composite_Index',region:'CANADA',exchange:'TSX',currency:'CAD'},
    {id:'ASX_200',label:'S&P/ASX 200',page:'S%26P/ASX_200',region:'AUSTRALIA',exchange:'ASX',currency:'AUD'},
    {id:'NIKKEI_225',label:'Nikkei 225',page:'Nikkei_225',region:'OTHER',exchange:'TSE',currency:'JPY'}
  ]);

  const arr = value => Array.isArray(value) ? value : [];
  const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const now = () => new Date().toISOString();
  const num = value => {
    if (value == null || value === '') return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const n0 = value => num(value) ?? 0;
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const upper = value => String(value ?? '').trim().toUpperCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const cleanMarketSymbol = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const displayTicker = value => cleanMarketSymbol(value).replace(/^LON:/, '').replace(/\.L$/i, '');
  const activeTicker = value => {
    const ticker = displayTicker(value);
    return /^[A-Z0-9-]+\.[A-Z]{1,4}$/.test(ticker) ? ticker.split('.')[0] : ticker;
  };
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`.toUpperCase();

  let working = false;
  let networkRows = [];

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function makeState(base) {
    const state = obj(base);
    return {
      ...state,
      scouting: {
        version: 1,
        status: 'SCOUTING_REVIEW',
        strategy: 'sustainable',
        targets: [],
        replacementBasket: [],
        decisionHistory: [],
        importedFromLegacy: false,
        source: 'AURORA2_SCOUTING',
        updatedAt: null,
        ...obj(state.scouting)
      },
      transfer: {...obj(state.transfer)},
      squad: {...obj(state.squad), holdings: arr(state.squad?.holdings)}
    };
  }

  function writeState(mutator) {
    const current = makeState(readState());
    let next;
    try { next = makeState(mutator(current)); } catch (error) { console.error(error); return current; }
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(current));
      localStorage.setItem(STATE_KEY, JSON.stringify({...next, updatedAt: now()}));
      window.dispatchEvent(new CustomEvent('aurora2:state', {detail:{source:'scouting-restored', build:BUILD}}));
    } catch (error) {
      console.error('[Aurora Scouting Restore] state write failed', error);
    }
    return next;
  }

  function field(row, keys) {
    for (const key of keys) if (row && row[key] != null && row[key] !== '') return row[key];
    return null;
  }

  function yieldPctFrom(value) {
    const raw = String(value ?? '').trim();
    let y = num(raw);
    if (y == null) return 0;
    if (y > 0 && y <= 1 && !raw.includes('%')) y *= 100;
    return y > 0 && y < 100 ? y : 0;
  }

  function deriveYield(row) {
    const explicit = yieldPctFrom(field(row, ['yield_pct','dividend_yield','yieldPct','yield','forward_yield','forwardYield']));
    if (explicit > 0) return {yieldPct:explicit, source:'reported'};
    const annualDps = Math.max(0, n0(field(row, ['annual_dps','annualDps','annual_dividend_per_share','annualDividendPerShare','forward_dps','forwardDps'])));
    const livePrice = Math.max(0, n0(field(row, ['live_price','livePrice','price','current_price','currentPrice','live_price_native'])));
    if (annualDps > 0 && livePrice > 0) {
      const derived = annualDps / livePrice * 100;
      if (derived > 0 && derived < 100) return {yieldPct:derived, source:'DPS ÷ price', annualDps, livePrice};
    }
    const income500 = Math.max(0, n0(field(row, ['income_from_500','incomeFrom500','annual_income_from_500'])));
    if (income500 > 0) {
      const derived = income500 / 500 * 100;
      if (derived > 0 && derived < 100) return {yieldPct:derived, source:'£500 income', income500};
    }
    return {yieldPct:0, source:'missing'};
  }

  function regionFor(row, symbol) {
    const text = `${field(row,['region','country','market','exchange']) || ''} ${symbol || ''} ${field(row,['currency']) || ''}`.toLowerCase();
    if (/\b(uk|united kingdom|lse|london|gbp|gbx)\b/.test(text) || /\.l$/i.test(symbol || '')) return 'UK';
    if (/\b(usa|united states|us|nasdaq|nyse|amex|usd)\b/.test(text)) return 'US';
    if (/\b(canada|tsx|cad)\b/.test(text)) return 'CANADA';
    if (/\b(australia|asx|aud)\b/.test(text)) return 'AUSTRALIA';
    if (/\b(europe|eur|stoxx|xetra|epa|etr)\b/.test(text)) return 'EUROPE';
    return 'OTHER';
  }

  function evidenceCount(row) {
    const keys = [
      ['buy_strength','buyStrength'],['promotion_impact_score','impact','promotionImpactScore'],
      ['dividend_yield','yield_pct','yieldPct'],['annual_dps','annualDps','forward_dps','forwardDps'],
      ['live_price','livePrice','live_price_gbp','livePriceGbp'],['valuation_score','valuationScore'],
      ['payout_score','dividend_safety','dividendSafety'],['growth_score','dividendGrowthScore'],
      ['sector'],['country','market'],['currency']
    ];
    return keys.reduce((count, group) => count + (field(row, group) != null ? 1 : 0), 0);
  }

  function likelyScoutingRow(row, path) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    if (/holding|transaction|dividend|bill|pot|finance|route|mission|house|account|payment/i.test(path)) return false;
    let symbol = cleanMarketSymbol(field(row, ['ticker','symbol','code','Ticker']));
    let name = String(field(row, ['company_name','name','company','companyName','security_name']) || '').trim();
    if (symbol.replace(/[^A-Z]/gi, '').toUpperCase() === 'RETURNEDWATCHLIST') {
      symbol = cleanMarketSymbol(field(row, ['company_name','symbol','code']));
      name = String(field(row, ['scout_status','name','company']) || symbol).trim();
    }
    if (!symbol || !name) return false;
    const scoutingPath = /scout|watch|trial|candidate|global|intelligence/i.test(path);
    const scoutingFields = ['buy_strength','scout_status','scout_rating','promotion_impact_score','trial_status','trial_rank','trial_verdict','watchlist_status','yield_score','payout_score','growth_score','role_score']
      .some(key => row[key] != null && row[key] !== '');
    return scoutingPath || scoutingFields;
  }

  function canonicalExchange(row, region, symbol) {
    const raw = upper(field(row, ['exchange','market','exchangeCode']));
    const aliases = {LON:'LSE',XLON:'LSE',LONDON:'LSE',XNAS:'NASDAQ',NAS:'NASDAQ',XNYS:'NYSE',TOR:'TSX',XTSE:'TSX'};
    if (aliases[raw]) return aliases[raw];
    if (raw && !['UK','US','USA','WORLD','OTHER'].includes(raw)) return raw;
    if (region === 'UK') return 'LSE';
    if (region === 'US') return 'US';
    if (region === 'CANADA') return 'TSX';
    if (region === 'AUSTRALIA') return 'ASX';
    if (region === 'EUROPE') return 'STOXX';
    return 'UNKNOWN';
  }

  function normalizeNetworkRow(row, path, sourceGeneratedAt) {
    let rawSymbol = cleanMarketSymbol(field(row, ['ticker','symbol','code','Ticker']));
    let name = String(field(row, ['company_name','name','company','companyName','security_name']) || displayTicker(rawSymbol)).trim();
    if (rawSymbol.replace(/[^A-Z]/gi, '').toUpperCase() === 'RETURNEDWATCHLIST') {
      rawSymbol = cleanMarketSymbol(field(row, ['company_name','symbol','code']));
      name = String(field(row, ['scout_status','name','company']) || displayTicker(rawSymbol)).trim();
    }
    if (!rawSymbol || !name) return null;

    const region = regionFor(row, rawSymbol);
    const exchange = canonicalExchange(row, region, rawSymbol);
    const ticker = displayTicker(rawSymbol);
    const currency = upper(field(row, ['currency','currency_code']) || (region === 'UK' ? 'GBP' : region === 'US' ? 'USD' : ''));
    const liveGbpRaw = field(row, ['live_price_gbp','livePriceGbp']);
    const liveNative = field(row, ['live_price','livePrice','price','live_price_native']);
    const livePriceGbp = Math.max(0, n0(liveGbpRaw != null ? liveGbpRaw : (currency === 'GBP' ? liveNative : 0)));
    const yieldEvidence = deriveYield(row);
    const annualDps = Math.max(0, n0(field(row, ['annual_dps','annualDps','annual_dividend_per_share','annualDividendPerShare','forward_dps','forwardDps'])));
    const incomeFrom500 = Math.max(0, n0(field(row, ['income_from_500','incomeFrom500','annual_income_from_500'])));
    const securityId = `${exchange}:${ticker.replace(/\./g,'-')}`;
    return {
      id:`NET-${region}-${ticker.replace(/[^A-Z0-9]+/g,'-')}`,
      securityId,
      marketSymbol:rawSymbol,
      ticker,
      name,
      region,
      country:String(field(row,['country','market']) || region).trim(),
      exchange,
      currency,
      sector:String(field(row,['sector','industry']) || '').trim(),
      role:String(field(row,['role','squad_role','chemistry_role']) || '').trim(),
      sourceStatus:String(field(row,['scout_status','watchlist_status','trial_status','status']) || 'MONITOR'),
      legacyStrength:Math.max(0, n0(field(row,['buy_strength','buyStrength']))),
      legacyImpact:Math.max(0, n0(field(row,['promotion_impact_score','promotionImpactScore','impact']))),
      legacyYieldPct:Number(yieldEvidence.yieldPct.toFixed(4)),
      legacyYieldSource:yieldEvidence.source,
      legacyAnnualDps:Number(annualDps.toFixed(8)),
      legacyIncomeFrom500:Number(incomeFrom500.toFixed(6)),
      legacyPriceNative:Number(Math.max(0,n0(liveNative)).toFixed(8)),
      legacyPriceGbp:Number(livePriceGbp.toFixed(6)),
      legacyValuation:String(field(row,['valuation_status','valuation']) || '').trim(),
      legacyValuationScore:Math.max(0,n0(field(row,['valuation_score','valuationScore']))),
      legacyPayoutScore:Math.max(0,n0(field(row,['payout_score','dividend_safety','dividendSafety']))),
      legacyGrowthScore:Math.max(0,n0(field(row,['growth_score','dividendGrowthScore']))),
      legacyBusinessQuality:Math.max(0,n0(field(row,['business_quality','businessQuality','quality_score','qualityScore']))),
      legacyPayoutRisk:String(field(row,['payout_risk','payoutRisk','chemistry_risk']) || '').trim(),
      legacyVerdict:String(field(row,['trial_verdict','manager_note','notes']) || '').trim(),
      preferredAccount:String(field(row,['preferredAccount','preferred_account','account','broker']) || 'CHECK'),
      brokerEligibility:field(row,['brokerEligibility','broker_eligibility','eligible_accounts']),
      legacyCheckedAt:String(field(row,['date_checked','last_updated','updated_at','updatedAt']) || sourceGeneratedAt || ''),
      evidenceCount:evidenceCount(row),
      memberships:[],
      dataStatus:evidenceCount(row) > 0 ? 'AVAILABLE' : 'MISSING',
      sourcePath:path,
      source:'AURORA1_GLOBAL_NETWORK',
      sourceUpdatedAt:sourceGeneratedAt || null,
      updatedAt:now()
    };
  }

  function collectNetworkRows(master) {
    const found = [];
    const sourceGeneratedAt = String(master?.meta?.generated_at || master?.meta?.updated_at || '');
    const seenObjects = new Set();
    function walk(value, path, depth) {
      if (depth > 5 || value == null) return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (likelyScoutingRow(item, path)) {
            const normalized = normalizeNetworkRow(item, path, sourceGeneratedAt);
            if (normalized) found.push(normalized);
          } else if (item && typeof item === 'object') walk(item, `${path}[${index}]`, depth + 1);
        });
        return;
      }
      if (typeof value !== 'object' || seenObjects.has(value)) return;
      seenObjects.add(value);
      Object.entries(value).forEach(([key, child]) => { if (key !== 'meta') walk(child, path ? `${path}.${key}` : key, depth + 1); });
    }
    walk(master, '', 0);
    return mergeByIdentity(found);
  }

  function canonicalTicker(ticker, exchange) {
    let value = cleanMarketSymbol(ticker).replace(/^LON:/, '').replace(/^NYSE:|^NASDAQ:|^AMEX:/, '');
    if (upper(exchange) === 'LSE') value = value.replace(/\.L$/,'');
    if (upper(exchange) === 'US') value = value.replace(/\./g,'-');
    return value;
  }

  function normalizeMembership(row) {
    const exchange = upper(row.exchange) || (row.region === 'UK' ? 'LSE' : row.region === 'US' ? 'US' : 'UNKNOWN');
    const ticker = canonicalTicker(row.ticker || row.marketSymbol, exchange);
    if (!ticker) return null;
    return {...row,ticker,marketSymbol:row.marketSymbol || ticker,exchange,securityId:`${exchange}:${ticker}`,id:`${exchange}:${ticker}`,memberships:[...new Set(arr(row.memberships))],dataStatus:row.dataStatus || 'MISSING'};
  }

  function mergeByIdentity(rows) {
    const map = new Map();
    rows.forEach(raw => {
      const row = normalizeMembership(raw);
      if (!row) return;
      const prior = map.get(row.securityId);
      if (!prior) { map.set(row.securityId, row); return; }
      const evidence = n0(row.evidenceCount) > n0(prior.evidenceCount) ? row : prior;
      const merged = {...prior,...evidence,memberships:[...new Set([...arr(prior.memberships),...arr(row.memberships)])],sources:[...new Set([...arr(prior.sources),...arr(row.sources)])]};
      const fill = key => {
        const missing = merged[key] == null || merged[key] === '' || (typeof merged[key] === 'number' && !(merged[key] > 0));
        const candidates = [prior[key], row[key]];
        if (missing) merged[key] = candidates.find(value => value != null && value !== '' && (typeof value !== 'number' || value > 0)) ?? merged[key];
      };
      ['legacyYieldPct','legacyYieldSource','legacyAnnualDps','legacyIncomeFrom500','legacyPriceNative','legacyPriceGbp','legacyValuation','legacyValuationScore','legacyPayoutScore','legacyGrowthScore','legacyBusinessQuality','legacyPayoutRisk','sector','role','country','currency','legacyVerdict','legacyCheckedAt','preferredAccount','brokerEligibility'].forEach(fill);
      map.set(row.securityId, merged);
    });
    return [...map.values()];
  }

  function membershipApiUrl(source) {
    return `https://en.wikipedia.org/w/api.php?action=parse&page=${source.page}&prop=text&formatversion=2&format=json&origin=*`;
  }

  function parseMembershipHtml(html, source) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const rows = [];
    doc.querySelectorAll('table.wikitable').forEach(table => {
      const allRows = [...table.querySelectorAll('tr')];
      const headerRow = allRows.find(tr => tr.querySelectorAll('th').length >= 2);
      const headers = [...(headerRow?.querySelectorAll('th') || [])].map(cell => norm(cell.textContent));
      const tickerIndex = headers.findIndex(value => /^(ticker|symbol|epic|ticker symbol|stock symbol|code)$/.test(value));
      const companyIndex = headers.findIndex(value => /^(company|constituent|security|company name|name)$/.test(value));
      if (tickerIndex < 0 || companyIndex < 0) return;
      allRows.slice(allRows.indexOf(headerRow) + 1).forEach(tr => {
        const cells = [...tr.querySelectorAll('th,td')];
        const ticker = cleanMarketSymbol(cells[tickerIndex]?.textContent).replace(/\[[^\]]*\]/g,'');
        const name = String(cells[companyIndex]?.textContent || '').replace(/\[[^\]]*\]/g,'').trim();
        if (!ticker || !name) return;
        rows.push({ticker,marketSymbol:ticker,name,region:source.region,country:source.region,exchange:source.exchange,currency:source.currency,memberships:[source.label],source:'INDEX_MEMBERSHIP',sources:[`Wikipedia:${source.page}`],sourceStatus:'UNSCOUTED',dataStatus:'MISSING',evidenceCount:0,updatedAt:now()});
      });
    });
    return rows;
  }

  async function fetchMembershipUniverse() {
    const settled = await Promise.allSettled(MEMBERSHIP_SOURCES.map(async source => {
      const response = await fetch(membershipApiUrl(source), {cache:'no-store'});
      if (!response.ok) throw new Error(`${source.label}: HTTP ${response.status}`);
      const payload = await response.json();
      const rows = parseMembershipHtml(payload?.parse?.text, source);
      if (!rows.length) throw new Error(`${source.label}: no constituent table found`);
      return rows;
    }));
    return {
      rows:settled.flatMap(result => result.status === 'fulfilled' ? result.value : []),
      errors:settled.filter(result => result.status === 'rejected').map(result => String(result.reason?.message || result.reason))
    };
  }

  async function fetchNetworkMaster() {
    let lastError = null;
    for (const url of NETWORK_URLS) {
      try {
        const response = await fetch(`${url}?v=${Date.now()}`, {cache:'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return {data:await response.json(), url};
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Global scouting source unavailable');
  }

  function coverage(rows) {
    const regions = {UK:0,US:0,EUROPE:0,CANADA:0,AUSTRALIA:0,OTHER:0};
    rows.forEach(row => { const key = regions[row.region] != null ? row.region : 'OTHER'; regions[key]++; });
    return {...regions,total:rows.length,WORLD:rows.length-regions.UK-regions.US,withEvidence:rows.filter(row=>n0(row.evidenceCount)>0).length,missingData:rows.filter(row=>n0(row.evidenceCount)===0).length};
  }

  function incomeScoreFromYield(yieldPct) {
    const y = Math.max(0,n0(yieldPct));
    if (!y) return null;
    if (y <= 2) return clamp(35 + y * 12.5);
    if (y <= 6) return clamp(60 + (y - 2) * 8);
    if (y <= 8) return clamp(92 + (y - 6) * 4);
    if (y <= 10) return clamp(100 - (y - 8) * 5);
    return clamp(90 - (y - 10) * 10, 30, 90);
  }

  function currentHoldings(state) {
    return arr(state?.squad?.holdings).filter(row => !['SOLD','ARCHIVED'].includes(upper(row?.status)) && n0(row?.shares) > 0);
  }

  function holdingValue(row) {
    return Math.max(0,n0(row?.marketValueGbp) || n0(row?.shares) * n0(row?.livePriceGbp));
  }

  function missionBudget(state) {
    for (const value of [state?.mission?.budget,state?.mission?.amount,state?.transfer?.route?.budget,state?.transfer?.route?.totalBudget,state?.finance?.releaseAmount,state?.finance?.payday?.releaseAmount]) {
      const parsed = num(value); if (parsed != null && parsed > 0) return parsed;
    }
    return 1000;
  }

  function portfolioFit(target, state) {
    const holdings = currentHoldings(state);
    const total = holdings.reduce((sum,row)=>sum+holdingValue(row),0);
    if (total <= 0) return {score:70,tickerPct:0,sectorPct:0};
    const ticker = activeTicker(target?.ticker);
    const sector = norm(target?.sector);
    const add = missionBudget(state);
    const tickerValue = holdings.filter(row=>activeTicker(row?.ticker)===ticker).reduce((sum,row)=>sum+holdingValue(row),0);
    const sectorValue = sector ? holdings.filter(row=>norm(row?.sector)===sector).reduce((sum,row)=>sum+holdingValue(row),0) : 0;
    const after = total + add;
    const tickerPct = (tickerValue + add) / after * 100;
    const sectorPct = sector ? (sectorValue + add) / after * 100 : 0;
    let score = 92;
    if (tickerPct > 2) score -= Math.min(48,(tickerPct-2)*2.5);
    if (sector && sectorPct > 25) score -= Math.min(30,(sectorPct-25)*1.2);
    if (tickerValue === 0) score += 3;
    return {score:Math.round(clamp(score,20,95)),tickerPct:Number(tickerPct.toFixed(2)),sectorPct:Number(sectorPct.toFixed(2))};
  }

  function factorCoverage(factors, weights) {
    let present = 0, total = 0;
    FACTORS.forEach(key => { const weight = n0(weights[key]); total += weight; if (num(factors[key]) != null) present += weight; });
    return total > 0 ? present / total : 0;
  }

  function weightedScore(factors, weights, confidence) {
    let sum = 0, weight = 0;
    FACTORS.forEach(key => { const value = num(factors[key]), w = n0(weights[key]); if (value == null || w <= 0) return; sum += clamp(value) * w; weight += w; });
    if (weight <= 0) return null;
    const coverage = factorCoverage(factors, weights);
    const raw = sum / weight;
    return Math.round(clamp(raw * (.66 + .34 * coverage) * (.78 + .22 * (clamp(confidence)/100))));
  }

  function confidenceForNetwork(row) {
    const signals = [row.legacyPriceGbp>0,row.legacyYieldPct>0,row.legacyPayoutScore>0,row.legacyValuationScore>0,row.legacyGrowthScore>0,row.legacyBusinessQuality>0,n0(row.evidenceCount)>=5].filter(Boolean).length;
    return Math.round(clamp(35 + signals * 9, 35, 92));
  }

  function preferredAccountFor(target, state) {
    const direct = upper(target?.preferredAccount);
    if (direct === 'IG' || direct.includes('IG ISA')) return 'IG';
    if (direct === 'T212' || direct.includes('212')) return 'T212';
    const sameTicker = activeTicker(target?.ticker);
    const holding = currentHoldings(state).find(row=>activeTicker(row?.ticker)===sameTicker);
    const account = upper(holding?.account || holding?.broker || holding?.preferredAccount);
    if (account === 'IG' || account.includes('IG ISA')) return 'IG';
    if (account === 'T212' || account.includes('212')) return 'T212';
    return 'CHECK';
  }

  function assessTarget(raw, state) {
    const ticker = activeTicker(raw?.ticker || raw?.marketSymbol);
    const yieldPct = Math.max(0,n0(raw?.yieldPct ?? raw?.legacyYieldPct));
    const livePriceGbp = Math.max(0,n0(raw?.livePriceGbp ?? raw?.legacyPriceGbp));
    const dividendSafety = num(raw?.dividendSafety ?? raw?.legacyPayoutScore);
    const incomeScore = num(raw?.incomeScore) ?? incomeScoreFromYield(yieldPct);
    const valuationScore = num(raw?.valuationScore ?? raw?.legacyValuationScore);
    const dividendGrowth = num(raw?.dividendGrowth ?? raw?.legacyGrowthScore);
    const businessQuality = num(raw?.businessQuality ?? raw?.legacyBusinessQuality);
    const fit = portfolioFit(raw,state);
    const factors = {dividendSafety,incomeScore,valuationScore,portfolioFit:fit.score,dividendGrowth,businessQuality};
    const confidence = Math.round(clamp(num(raw?.confidence) ?? confidenceForNetwork(raw),0,100));
    const sustainableCoverage = factorCoverage(factors,WEIGHTS.sustainable);
    const maximumCoverage = factorCoverage(factors,WEIGHTS.maximum);
    const coveragePct = Math.round(Math.min(sustainableCoverage,maximumCoverage)*1000)/10;
    const sustainableScore = weightedScore(factors,WEIGHTS.sustainable,confidence) ?? 0;
    const maximumScore = weightedScore(factors,WEIGHTS.maximum,confidence) ?? 0;
    const reasons = [];
    let status = 'pass';
    if (ticker === 'TSCO') { status='block'; reasons.push('TSCO is a locked legacy / 2029 holding and is excluded from active buys.'); }
    if (/suspend|cancel|omit/.test(norm(raw?.dividendStatus || raw?.sourceStatus))) { status='block'; reasons.push('Dividend is suspended or cancelled.'); }
    if (/very high|extreme/.test(norm(raw?.payoutRisk || raw?.legacyPayoutRisk))) { status='block'; reasons.push('Payout risk is very high.'); }
    if (dividendSafety != null && dividendSafety < HARD_GATES.minDividendSafety) { status='block'; reasons.push('Dividend-safety evidence is below the purchase gate.'); }
    if (confidence < HARD_GATES.minConfidence) { status='block'; reasons.push('Evidence confidence is below the purchase gate.'); }
    if (raw?.brokerEligible === false || raw?.brokerEligibility === false) { status='block'; reasons.push('Broker eligibility is explicitly unavailable.'); }
    let pending = false;
    if (status !== 'block') {
      if (!(yieldPct > 0)) { pending=true; reasons.push('Recurring dividend yield evidence is missing.'); }
      if (dividendSafety == null) { pending=true; reasons.push('Dividend-safety evidence is still missing.'); }
      if (Math.min(sustainableCoverage,maximumCoverage) < HARD_GATES.pendingCoverage) { pending=true; reasons.push(`Only ${coveragePct}% of weighted factor evidence is available.`); }
      if (pending) status='pending';
    }
    const preferredAccount = preferredAccountFor(raw,state);
    if (status === 'pass' && ((dividendSafety ?? 0) < HARD_GATES.cleanDividendSafety || confidence < HARD_GATES.cleanConfidence || yieldPct > HARD_GATES.cautionYield || preferredAccount === 'CHECK' || Math.min(sustainableCoverage,maximumCoverage) < .8)) {
      status='caution';
      if ((dividendSafety ?? 0) < HARD_GATES.cleanDividendSafety) reasons.push('Dividend safety is below the clean-pass threshold.');
      if (confidence < HARD_GATES.cleanConfidence) reasons.push('Evidence confidence needs review.');
      if (yieldPct > HARD_GATES.cautionYield) reasons.push('Yield is above 10% and requires controlled sizing.');
      if (preferredAccount === 'CHECK') reasons.push('Preferred broker still needs confirmation.');
      if (Math.min(sustainableCoverage,maximumCoverage) < .8) reasons.push(`Evidence coverage is ${coveragePct}%; controlled sizing only.`);
    }
    if (!(livePriceGbp > 0) && status !== 'block') reasons.push('Execution price is not a Scouting gate; current price must be resolved before allocation / registration.');
    if (!reasons.length) reasons.push('Clears the canonical income, safety, valuation and portfolio-fit gates.');
    const strategy = state?.scouting?.strategy === 'maximum' ? 'maximum' : 'sustainable';
    const activeScore = strategy === 'maximum' ? maximumScore : sustainableScore;
    let recommendation = 'WATCH';
    if (status === 'block') recommendation='BLOCK';
    else if (status === 'pending') recommendation='DATA PENDING';
    else if (status === 'caution') recommendation='CAUTION';
    else if (activeScore >= 80) recommendation='STRONG BUY';
    else if (activeScore >= 70) recommendation='BUY';
    const reason = `${recommendation} • Sustainable ${sustainableScore}/100 • Maximum ${maximumScore}/100 • ${yieldPct>0?yieldPct.toFixed(2)+'% yield • ':''}${reasons.join(' ')}`;
    return {...raw,ticker,name:String(raw?.name||ticker||'Target'),preferredAccount,yieldPct:Number(yieldPct.toFixed(4)),livePriceGbp:Number(livePriceGbp.toFixed(6)),confidence,dataQuality:confidence,dividendSafety,incomeScore,valuationScore,portfolioFit:fit.score,dividendGrowth,businessQuality,sustainableScore,maximumScore,status,recommendation,eligibilityReasons:reasons,reason,evidenceCoverage:coveragePct,projectedPortfolio:{tickerPct:fit.tickerPct,sectorPct:fit.sectorPct,testAmountGbp:missionBudget(state)},eligibleForTransfer:status==='pass'||status==='caution',executionPriceStatus:livePriceGbp>0?'AVAILABLE':'REQUIRED_AT_EXECUTION',livePriceRequiredAtExecution:!(livePriceGbp>0),scoutingPriceIndependent:true,approvedForTransfer:false,scoringEngine:'AURORA_SCOUTING_INTELLIGENCE_3_RESTORED',scoringEngineVersion:'3.0.1-restored',source:String(raw?.source||'AURORA1_GLOBAL_AUTO_BENCH'),lastAssessedAt:now(),updatedAt:now()};
  }

  function autoPromotionProfile(row) {
    const y = Math.max(0,n0(row.legacyYieldPct));
    const strength = Math.max(0,n0(row.legacyStrength));
    const impact = Math.max(0,n0(row.legacyImpact));
    const safety = Math.max(0,n0(row.legacyPayoutScore));
    const valuation = Math.max(0,n0(row.legacyValuationScore));
    const growth = Math.max(0,n0(row.legacyGrowthScore));
    const evidence = Math.max(0,n0(row.evidenceCount));
    const status = norm(row.sourceStatus);
    const risk = norm(row.legacyPayoutRisk);
    const ticker = activeTicker(row.marketSymbol);
    const blockers = [];
    if (ticker === 'TSCO') blockers.push('locked legacy ticker');
    if (!(y > 0)) blockers.push('no dividend yield');
    if (y > AUTO_BENCH_MAX_YIELD) blockers.push('yield above auto-promotion ceiling');
    if (strength < AUTO_BENCH_MIN_STRENGTH) blockers.push('legacy scout strength below 60');
    if (evidence < 3) blockers.push('thin evidence');
    if (/suspend|cancel|omit|avoid|sell/.test(status)) blockers.push('negative source status');
    if (/very high|extreme/.test(risk)) blockers.push('payout risk too high');
    const fundamentalSignals = [safety>0,valuation>0,growth>0,row.legacyPriceGbp>0||row.legacyPriceNative>0].filter(Boolean).length;
    if (fundamentalSignals < 1) blockers.push('no supporting fundamental/price evidence');
    const incomeFit = incomeScoreFromYield(y) || 0;
    const evidenceScore = clamp(evidence*12.5,0,100);
    const priority = strength*.38 + impact*.20 + incomeFit*.12 + (safety||55)*.10 + (valuation||55)*.08 + (growth||50)*.05 + evidenceScore*.07;
    return {eligible:blockers.length===0,blockers,priority:Number(priority.toFixed(3)),strength,impact,yieldPct:y,safety,valuation,growth,evidence};
  }

  function autoCandidateFromNetwork(row, state) {
    const profile = autoPromotionProfile(row);
    return assessTarget({
      id:`AUTO-${row.id}`,
      securityId:row.securityId,
      exchange:row.exchange,
      ticker:activeTicker(row.marketSymbol),
      name:row.name,
      preferredAccount:row.preferredAccount || 'CHECK',
      brokerEligibility:row.brokerEligibility,
      sector:row.sector,
      country:row.country,
      currency:row.currency,
      livePriceGbp:row.legacyPriceGbp,
      yieldPct:row.legacyYieldPct,
      confidence:confidenceForNetwork(row),
      dividendSafety:row.legacyPayoutScore || null,
      valuationScore:row.legacyValuationScore || null,
      dividendGrowth:row.legacyGrowthScore || null,
      businessQuality:row.legacyBusinessQuality || null,
      payoutRisk:row.legacyPayoutRisk,
      sourceStatus:row.sourceStatus,
      autoManaged:true,
      autoPriority:profile.priority,
      autoRegion:row.region,
      source:'AURORA1_GLOBAL_AUTO_BENCH',
      sourceUpdatedAt:row.sourceUpdatedAt || row.legacyCheckedAt || null,
      memberships:arr(row.memberships),
      createdAt:now()
    },state);
  }

  function rankTargets(targets, strategy) {
    const orderStatus = target => target.status === 'pass' ? 0 : target.status === 'caution' ? 1 : target.status === 'pending' ? 2 : 3;
    const sustainable = [...targets].sort((a,b)=>orderStatus(a)-orderStatus(b)||n0(b.sustainableScore)-n0(a.sustainableScore)||n0(b.confidence)-n0(a.confidence)||n0(b.yieldPct)-n0(a.yieldPct));
    sustainable.forEach((target,index)=>target.rank=index+1);
    const maximum = [...targets].sort((a,b)=>orderStatus(a)-orderStatus(b)||n0(b.maximumScore)-n0(a.maximumScore)||n0(b.confidence)-n0(a.confidence)||n0(b.yieldPct)-n0(a.yieldPct));
    const maxRank = new Map(maximum.map((target,index)=>[target.securityId||target.id||target.ticker,index+1]));
    sustainable.forEach(target=>target.maximumRank=maxRank.get(target.securityId||target.id||target.ticker)||0);
    if (strategy === 'maximum') return [...sustainable].sort((a,b)=>n0(a.maximumRank)-n0(b.maximumRank));
    return sustainable;
  }

  function selectAutoBench(state) {
    const universe = arr(state.scouting?.universe);
    const currentTargets = arr(state.scouting?.targets);
    const manual = currentTargets.filter(target=>target.autoManaged!==true && !String(target.source||'').includes('GLOBAL_AUTO_BENCH'));
    const slots = Math.max(0,AUTO_BENCH_TOTAL-manual.length);
    const manualTickers = new Set(manual.map(target=>activeTicker(target.ticker)));
    const qualified = universe.map(row=>({row,profile:autoPromotionProfile(row)})).filter(item=>item.profile.eligible).filter(item=>!manualTickers.has(activeTicker(item.row.marketSymbol))).sort((a,b)=>b.profile.priority-a.profile.priority||b.profile.strength-a.profile.strength||b.profile.yieldPct-a.profile.yieldPct);
    const picked = [], used = new Set();
    const take = (region,count) => {
      for (const item of qualified) {
        if (picked.length >= slots || count <= 0) break;
        if (used.has(item.row.securityId) || item.row.region !== region) continue;
        picked.push(item); used.add(item.row.securityId); count--;
      }
    };
    if (slots >= 6) { take('US',Math.min(2,slots)); take('EUROPE',Math.min(1,Math.max(0,slots-picked.length))); }
    for (const item of qualified) {
      if (picked.length >= slots) break;
      if (used.has(item.row.securityId)) continue;
      picked.push(item); used.add(item.row.securityId);
    }
    const automatic = picked.map(item=>autoCandidateFromNetwork(item.row,state));
    const manualAssessed = manual.map(target=>assessTarget(target,state));
    return {targets:rankTargets([...manualAssessed,...automatic],state.scouting?.strategy),qualified:qualified.length,autoCount:automatic.length,manualCount:manualAssessed.length};
  }

  function scoutingLocked(state) {
    return !!state?.transfer?.route?.locked || ['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(upper(state?.mission?.status));
  }

  function invalidateApproval(state) {
    return {...state,scouting:{...state.scouting,status:'SCOUTING_REVIEW',approvedBatchId:null,targets:arr(state.scouting?.targets).map(target=>({...target,approvedForTransfer:false,approvedAt:null,approvalBatchId:null})),updatedAt:now()}};
  }

  async function syncGlobalNetwork(force = true) {
    if (working) return arr(readState()?.scouting?.universe);
    working = true;
    setBusy(true, 'SYNCING GLOBAL NETWORK…');
    try {
      const [legacyResult,membership] = await Promise.all([
        fetchNetworkMaster().then(value=>({value})).catch(error=>({error})),
        fetchMembershipUniverse()
      ]);
      const master = legacyResult.value?.data || {};
      const legacy = collectNetworkRows(master);
      const universe = mergeByIdentity([...membership.rows,...legacy]).sort((a,b)=>arr(b.memberships).length-arr(a.memberships).length||n0(b.legacyStrength)-n0(a.legacyStrength)||n0(b.evidenceCount)-n0(a.evidenceCount)||String(a.ticker).localeCompare(String(b.ticker)));
      if (!universe.length) throw new Error('No valid scouting rows found in the restored network');
      networkRows = universe;
      const counts = coverage(universe);
      const errors = [...membership.errors,legacyResult.error?.message].filter(Boolean);
      let state = writeState(current => ({...invalidateApproval(current),scouting:{...invalidateApproval(current).scouting,universe,networkMeta:{status:errors.length?'PARTIAL':'CONNECTED',sourceUrl:legacyResult.value?.url||'',sourceGeneratedAt:String(master?.meta?.generated_at||master?.meta?.updated_at||''),lastSyncAt:now(),lastError:errors.join(' • '),counts},source:'AURORA2_SCOUTING_GLOBAL_RESTORED',updatedAt:now()}}));
      const bench = selectAutoBench(state);
      state = writeState(current => ({...invalidateApproval(current),scouting:{...invalidateApproval(current).scouting,targets:bench.targets,autoBench:{enabled:true,targetSize:AUTO_BENCH_TOTAL,qualified:bench.qualified,autoCount:bench.autoCount,manualCount:bench.manualCount,lastRunAt:now(),status:'CURRENT'},networkMeta:current.scouting.networkMeta,universe:current.scouting.universe,source:'AURORA2_SCOUTING_GLOBAL_RESTORED',updatedAt:now()}}));
      render(state);
      toast(`Global Network restored • ${universe.length.toLocaleString('en-GB')} stocks monitored • ${bench.autoCount} automatic scouts active.`);
      return universe;
    } catch (error) {
      console.error('[Aurora Scouting Restore] network sync failed', error);
      const state = writeState(current=>({...current,scouting:{...current.scouting,networkMeta:{...obj(current.scouting?.networkMeta),status:'ERROR',lastAttemptAt:now(),lastError:String(error.message||error)}}}));
      render(state);
      toast(`Network sync failed: ${String(error.message||error)}`);
      return [];
    } finally {
      working = false;
      setBusy(false);
    }
  }

  function runScouting() {
    const state = makeState(readState());
    if (scoutingLocked(state)) { toast('Transfer is locked. Scouting cannot change the active shortlist.'); return; }
    if (!arr(state.scouting?.universe).length) { syncGlobalNetwork(true); return; }
    const bench = selectAutoBench(state);
    const next = writeState(current=>({...invalidateApproval(current),scouting:{...invalidateApproval(current).scouting,universe:current.scouting.universe,networkMeta:current.scouting.networkMeta,targets:bench.targets,autoBench:{...obj(current.scouting?.autoBench),enabled:true,targetSize:AUTO_BENCH_TOTAL,qualified:bench.qualified,autoCount:bench.autoCount,manualCount:bench.manualCount,lastRunAt:now(),status:'CURRENT'},source:'AURORA2_SCOUTING_GLOBAL_RESTORED',updatedAt:now()}}));
    render(next);
    toast(`Scouting rerun • ${bench.targets.length} active candidates ranked under both strategy lenses.`);
  }

  function approveShortlist() {
    const state = makeState(readState());
    if (scoutingLocked(state)) { toast('Transfer is already locked. Unlock it before changing the approved shortlist.'); return; }
    const ranked = rankTargets(arr(state.scouting?.targets).map(target=>assessTarget(target,state)),state.scouting?.strategy);
    const eligible = ranked.filter(target=>target.eligibleForTransfer && target.status !== 'block' && target.status !== 'pending');
    if (!eligible.length) { toast('No candidate currently clears the Scouting evidence gates.'); return; }
    const approvedAt = now();
    const approvalBatchId = uid('SHORTLIST');
    const history = {id:uid('SCOUT'),approvedAt,missionId:state.mission?.id||null,count:eligible.length,strategy:state.scouting?.strategy||'sustainable',topTicker:eligible[0]?.ticker||null,source:'AURORA_SCOUTING_INTELLIGENCE_3_RESTORED'};
    const eligibleIds = new Set(eligible.map(target=>target.securityId||target.id));
    const next = writeState(current=>({...current,scouting:{...current.scouting,status:'SCOUTING_READY',approvedBatchId,targets:ranked.map(target=>({...target,approvedForTransfer:eligibleIds.has(target.securityId||target.id),approvedAt:eligibleIds.has(target.securityId||target.id)?approvedAt:null,approvalBatchId:eligibleIds.has(target.securityId||target.id)?approvalBatchId:null})),decisionHistory:[history,...arr(current.scouting?.decisionHistory)].slice(0,20),source:'AURORA_SCOUTING_INTELLIGENCE_3_RESTORED',updatedAt:now()}}));
    render(next);
    toast(`${eligible.length} Scouting candidate${eligible.length===1?'':'s'} approved for Transfer.`);
  }

  function setStrategy(strategy) {
    const nextStrategy = strategy === 'maximum' ? 'maximum' : 'sustainable';
    const state = makeState(readState());
    if (scoutingLocked(state)) { toast('Transfer is locked. Strategy cannot change until the route is unlocked.'); render(state); return; }
    const assessed = rankTargets(arr(state.scouting?.targets).map(target=>assessTarget(target,{...state,scouting:{...state.scouting,strategy:nextStrategy}})),nextStrategy);
    const next = writeState(current=>({...invalidateApproval(current),scouting:{...invalidateApproval(current).scouting,strategy:nextStrategy,targets:assessed,universe:current.scouting.universe,networkMeta:current.scouting.networkMeta,source:'AURORA_SCOUTING_INTELLIGENCE_3_RESTORED',updatedAt:now()}}));
    render(next);
    toast(`${nextStrategy==='maximum'?'Maximum Income':'Sustainable Income'} scouting lens selected. Reapprove the shortlist when ready.`);
  }

  function statusLabel(target) {
    if (target.approvedForTransfer) return 'APPROVED';
    if (target.status === 'pass') return 'PASS';
    if (target.status === 'caution') return 'CAUTION';
    if (target.status === 'pending') return 'DATA PENDING';
    return 'BLOCKED';
  }

  function renderTargets(state) {
    const host = document.getElementById('scoutingTargetRows');
    if (!host) return;
    const strategy = state.scouting?.strategy === 'maximum' ? 'maximum' : 'sustainable';
    const rows = rankTargets(arr(state.scouting?.targets),strategy);
    if (!rows.length) { host.innerHTML='<div class="scout-empty">No active candidates yet. Sync the Global Network to rebuild the bench.</div>'; return; }
    host.innerHTML = rows.map(target=>{
      const score = strategy==='maximum'?n0(target.maximumScore):n0(target.sustainableScore);
      const rank = strategy==='maximum'?n0(target.maximumRank):n0(target.rank);
      const cls = target.approvedForTransfer?'approved':target.status==='pass'?'pass':target.status==='caution'?'caution':target.status==='pending'?'pending':'blocked';
      return `<article class="scout-target ${cls}">
        <div class="scout-target-rank">#${rank||'—'}</div>
        <div class="scout-target-name"><strong>${esc(target.ticker)} <span>${esc(target.name)}</span></strong><small>${esc(target.sector||target.country||'Unclassified')} • ${esc(arr(target.memberships).slice(0,2).join(' · ')||target.source||'Global Network')}</small></div>
        <div class="scout-metric"><b>${score||'—'}</b><span>${strategy==='maximum'?'Maximum':'Sustainable'}</span></div>
        <div class="scout-metric"><b>${n0(target.yieldPct)>0?n0(target.yieldPct).toFixed(2)+'%':'—'}</b><span>Yield</span></div>
        <div class="scout-metric"><b>${n0(target.evidenceCoverage)>0?n0(target.evidenceCoverage).toFixed(0)+'%':'—'}</b><span>Evidence</span></div>
        <div class="scout-metric"><b>${esc(target.preferredAccount||'CHECK')}</b><span>Broker</span></div>
        <div class="scout-status ${cls}">${esc(statusLabel(target))}</div>
      </article>`;
    }).join('');
  }

  function renderNetwork(state) {
    const rows = arr(state.scouting?.universe);
    networkRows = rows;
    const host = document.getElementById('networkRows');
    if (!host) return;
    const query = norm(document.getElementById('networkSearchInput')?.value || '');
    const region = upper(document.getElementById('networkRegion')?.value || 'ALL');
    let filtered = rows.filter(row=>{
      if (region !== 'ALL' && upper(row.region)!==region) return false;
      if (!query) return true;
      return norm(`${row.ticker} ${row.name} ${row.country} ${row.sector} ${arr(row.memberships).join(' ')}`).includes(query);
    });
    filtered = filtered.sort((a,b)=>n0(b.legacyStrength)-n0(a.legacyStrength)||n0(b.evidenceCount)-n0(a.evidenceCount)||n0(b.legacyYieldPct)-n0(a.legacyYieldPct));
    const shown = filtered.slice(0,NETWORK_RENDER_LIMIT);
    const count = document.getElementById('networkShown');
    if (count) count.textContent = `${shown.length.toLocaleString('en-GB')} shown of ${filtered.length.toLocaleString('en-GB')} matches • ${rows.length.toLocaleString('en-GB')} monitored`;
    if (!shown.length) { host.innerHTML='<tr><td colspan="8">No Global Network rows match this filter.</td></tr>'; return; }
    host.innerHTML = shown.map((row,index)=>{
      const profile = autoPromotionProfile(row);
      return `<tr>
        <td>${index+1}</td>
        <td><strong>${esc(row.ticker)}</strong><span>${esc(row.name)}</span></td>
        <td><b>${esc(row.region)}</b><span>${esc(arr(row.memberships).slice(0,2).join(' · ')||row.exchange||'')}</span></td>
        <td>${esc(row.sector||'—')}</td>
        <td>${n0(row.legacyYieldPct)>0?n0(row.legacyYieldPct).toFixed(2)+'%':'—'}</td>
        <td>${n0(row.legacyStrength)>0?n0(row.legacyStrength).toFixed(0):'—'}</td>
        <td>${n0(row.evidenceCount)} signals</td>
        <td><span class="network-elig ${profile.eligible?'eligible':'watch'}">${profile.eligible?'BENCH ELIGIBLE':'MONITOR'}</span></td>
      </tr>`;
    }).join('');
  }

  function render(state = makeState(readState())) {
    if (!state) return;
    const universe = arr(state.scouting?.universe);
    const targets = arr(state.scouting?.targets);
    const approved = targets.filter(target=>target.approvedForTransfer===true);
    const blocked = targets.filter(target=>target.status==='block');
    const pending = targets.filter(target=>target.status==='pending');
    const counts = state.scouting?.networkMeta?.counts || coverage(universe);
    const strategy = state.scouting?.strategy === 'maximum' ? 'maximum' : 'sustainable';
    const ranked = rankTargets(targets,strategy);
    const top = ranked[0];
    const meta = obj(state.scouting?.networkMeta);
    const set = (id,value) => { const el=document.getElementById(id); if(el) el.textContent=value; };
    set('networkTotal',Number(counts.total||universe.length).toLocaleString('en-GB'));
    set('networkUK',Number(counts.UK||0).toLocaleString('en-GB'));
    set('networkUS',Number(counts.US||0).toLocaleString('en-GB'));
    set('networkWorld',Number(counts.WORLD||0).toLocaleString('en-GB'));
    set('networkEvidence',Number(counts.withEvidence||0).toLocaleString('en-GB'));
    set('activeCandidates',targets.length.toLocaleString('en-GB'));
    set('approvedCandidates',approved.length.toLocaleString('en-GB'));
    set('blockedCandidates',(blocked.length+pending.length).toLocaleString('en-GB'));
    set('topCandidate',top?`${top.ticker} • ${strategy==='maximum'?n0(top.maximumScore):n0(top.sustainableScore)}/100`:'—');
    set('networkStatus',upper(meta.status||'NOT SYNCED').replaceAll('_',' '));
    set('networkLastSync',meta.lastSyncAt?new Date(meta.lastSyncAt).toLocaleString('en-GB'):'Not yet synced');
    set('scoutingStatus',upper(state.scouting?.status||'SCOUTING_REVIEW').replaceAll('_',' '));
    const netError = document.getElementById('networkError');
    if (netError) { netError.textContent=meta.lastError||''; netError.hidden=!meta.lastError; }
    document.querySelectorAll('[data-strategy]').forEach(button=>button.classList.toggle('active',button.dataset.strategy===strategy));
    const approve = document.getElementById('approveShortlist');
    if (approve) { approve.disabled=scoutingLocked(state)||!targets.some(target=>assessTarget(target,state).eligibleForTransfer); approve.textContent=state.scouting?.status==='SCOUTING_READY'?`Approved ${approved.length}`:'Approve Shortlist'; }
    renderTargets(state);
    renderNetwork(state);
    window.AuroraRestoredScouting = Object.freeze({build:BUILD,universe:universe.length,active:targets.length,approved:approved.length,strategy,status:state.scouting?.status||'SCOUTING_REVIEW',networkStatus:meta.status||'NOT_SYNCED'});
  }

  function toast(message) {
    let el = document.getElementById('scoutingToast');
    if (!el) { el=document.createElement('div'); el.id='scoutingToast'; el.className='scouting-toast'; document.body.appendChild(el); }
    el.textContent=message; el.classList.add('show'); clearTimeout(window.__scoutingToastTimer); window.__scoutingToastTimer=setTimeout(()=>el.classList.remove('show'),3200);
  }

  function setBusy(busy, text) {
    const button = document.getElementById('syncGlobalNetwork');
    if (button) { button.disabled=busy; button.textContent=busy?(text||'Working…'):'Sync Global Network'; }
    document.documentElement.dataset.scoutingBusy = busy ? 'true' : 'false';
  }

  function bind() {
    document.getElementById('syncGlobalNetwork')?.addEventListener('click',()=>syncGlobalNetwork(true));
    document.getElementById('runScouting')?.addEventListener('click',runScouting);
    document.getElementById('approveShortlist')?.addEventListener('click',approveShortlist);
    document.querySelectorAll('[data-strategy]').forEach(button=>button.addEventListener('click',()=>setStrategy(button.dataset.strategy)));
    document.getElementById('networkSearchInput')?.addEventListener('input',()=>renderNetwork(makeState(readState())));
    document.getElementById('networkRegion')?.addEventListener('change',()=>renderNetwork(makeState(readState())));
    window.addEventListener('focus',()=>render(makeState(readState())));
    window.addEventListener('pageshow',()=>render(makeState(readState())));
    window.addEventListener('aurora2:state',()=>render(makeState(readState())));
    window.addEventListener('storage',event=>{ if ([STATE_KEY,BACKUP_KEY].includes(event.key)) render(makeState(readState())); });
  }

  function boot() {
    bind();
    const state = makeState(readState());
    render(state);
    const rows = arr(state.scouting?.universe);
    const last = Date.parse(state.scouting?.networkMeta?.lastSyncAt || '');
    const stale = !Number.isFinite(last) || Date.now()-last > NETWORK_SYNC_MS;
    if (!rows.length || stale) syncGlobalNetwork(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();