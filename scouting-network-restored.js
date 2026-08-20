(() => {
  'use strict';

  const BUILD = '20260820-scouting-network-restored-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const NETWORK_SYNC_MS = 6 * 60 * 60 * 1000;
  const ACTIVE_LIMIT = 120;
  const NETWORK_URLS = [
    'https://webbchrisuk-max.github.io/aurora-fc-2/AuroraMaster.json',
    'https://raw.githubusercontent.com/webbchrisuk-max/aurora-fc-2/main/AuroraMaster.json'
  ];

  const SOURCES = Object.freeze([
    { id:'FTSE_100', label:'FTSE 100', page:'FTSE_100_Index', region:'UK', exchange:'LSE', currency:'GBP' },
    { id:'FTSE_250', label:'FTSE 250', page:'FTSE_250_Index', region:'UK', exchange:'LSE', currency:'GBP' },
    { id:'SP_500', label:'S&P 500', page:'List_of_S%26P_500_companies', region:'US', exchange:'US', currency:'USD' },
    { id:'STOXX_600', label:'STOXX Europe 600', page:'STOXX_Europe_600', region:'EUROPE', exchange:'STOXX', currency:'EUR' },
    { id:'TSX_COMPOSITE', label:'S&P/TSX Composite', page:'S%26P/TSX_Composite_Index', region:'CANADA', exchange:'TSX', currency:'CAD' },
    { id:'ASX_200', label:'S&P/ASX 200', page:'S%26P/ASX_200', region:'AUSTRALIA', exchange:'ASX', currency:'AUD' },
    { id:'NIKKEI_225', label:'Nikkei 225', page:'Nikkei_225', region:'OTHER', exchange:'TSE', currency:'JPY' }
  ]);

  const SUSTAINABLE = Object.freeze({ dividendSafety:25, incomeScore:20, valuationScore:20, portfolioFit:15, dividendGrowth:10, businessQuality:10 });
  const MAXIMUM = Object.freeze({ dividendSafety:20, incomeScore:45, valuationScore:10, portfolioFit:10, dividendGrowth:5, businessQuality:10 });
  const GATES = Object.freeze({ minDividendSafety:35, cleanDividendSafety:60, minConfidence:50, cleanConfidence:75, cautionYield:10, pendingCoverage:.55 });

  const arr = v => Array.isArray(v) ? v : [];
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const num = v => {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const n0 = v => num(v) ?? 0;
  const clamp = (v, a=0, b=100) => Math.max(a, Math.min(b, Number(v) || 0));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const upper = v => String(v || '').trim().toUpperCase();
  const clean = v => upper(v).replace(/\s+/g, '');
  const ticker = (v, exchange='') => {
    let t = clean(v).replace(/^LON:/, '').replace(/^NYSE:|^NASDAQ:|^AMEX:/, '');
    if (upper(exchange) === 'LSE') t = t.replace(/\.L$/, '');
    if (upper(exchange) === 'US') t = t.replace(/\./g, '-');
    return t;
  };
  const now = () => new Date().toISOString();
  const field = (row, keys) => { for (const k of keys) if (row && row[k] != null && row[k] !== '') return row[k]; return null; };

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return {};
  }

  function writeState(next) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('aurora2:state', { detail:{ source:'scouting-network-restored', build:BUILD } }));
      return true;
    } catch (error) {
      console.warn('[Aurora Scouting Restore] state write failed', error);
      return false;
    }
  }

  function securityId(exchange, tk) { return `${upper(exchange) || 'UNKNOWN'}:${ticker(tk, exchange)}`; }

  function parseMembershipHtml(html, source) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const rows = [];
    doc.querySelectorAll('table.wikitable').forEach(table => {
      const headers = [...table.querySelectorAll('tr:first-child th')].map(th => th.textContent.trim().toLowerCase());
      if (!headers.length) return;
      const tickerIndex = headers.findIndex(h => /ticker|symbol|epic|code/.test(h));
      const companyIndex = headers.findIndex(h => /company|constituent|security|name/.test(h));
      if (tickerIndex < 0 || companyIndex < 0) return;
      [...table.querySelectorAll('tbody tr')].slice(1).forEach(tr => {
        const cells = [...tr.querySelectorAll('td,th')];
        const rawTicker = cells[tickerIndex]?.textContent?.replace(/\[[^\]]*\]/g, '').trim();
        const name = cells[companyIndex]?.textContent?.replace(/\[[^\]]*\]/g, '').trim();
        const tk = ticker(rawTicker, source.exchange);
        if (!tk || !name || tk.length > 20) return;
        rows.push({
          securityId: securityId(source.exchange, tk), ticker:tk, marketSymbol:tk, name,
          region:source.region, country:source.region, exchange:source.exchange, currency:source.currency,
          memberships:[source.label], source:'INDEX_MEMBERSHIP', sources:[`Wikipedia:${source.page}`],
          dataStatus:'MISSING', evidenceCount:0, updatedAt:now()
        });
      });
    });
    return rows;
  }

  async function fetchMembership(source) {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${source.page}&prop=text&formatversion=2&format=json&origin=*`;
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) throw new Error(`${source.label} HTTP ${res.status}`);
    const json = await res.json();
    return parseMembershipHtml(json?.parse?.text, source);
  }

  async function fetchMembershipUniverse() {
    const state = readState();
    const configured = arr(state?.scouting?.universeConfig?.membershipSourceIds);
    const sources = configured.length ? SOURCES.filter(s => configured.includes(s.id)) : SOURCES;
    const settled = await Promise.allSettled(sources.map(fetchMembership));
    return {
      rows: settled.flatMap(x => x.status === 'fulfilled' ? x.value : []),
      errors: settled.filter(x => x.status === 'rejected').map(x => String(x.reason?.message || x.reason))
    };
  }

  async function fetchNetworkMaster() {
    let lastError = null;
    for (const url of NETWORK_URLS) {
      try {
        const res = await fetch(`${url}?v=${Date.now()}`, { cache:'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { data, url };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Global network source unavailable');
  }

  function inferExchange(row, region='') {
    const ex = upper(field(row, ['exchange','Exchange','market','Market']));
    if (ex) return ex;
    const r = upper(region || field(row, ['region','country','Country']));
    if (r === 'UK' || r === 'GB' || r === 'UNITED KINGDOM') return 'LSE';
    if (r === 'US' || r === 'USA' || r === 'UNITED STATES') return 'US';
    return 'UNKNOWN';
  }

  function positive(v) { const n = num(v); return n != null && n > 0 ? n : null; }
  function pctYield(v) {
    const raw = String(v ?? '').trim();
    let y = num(raw);
    if (y == null) return null;
    if (y > 0 && y <= 1 && !raw.includes('%')) y *= 100;
    return y > 0 && y < 100 ? y : null;
  }

  function evidenceRow(raw, sourceName) {
    const region = upper(field(raw, ['region','country','Country'])) || '';
    const exchange = inferExchange(raw, region);
    const tk = ticker(field(raw, ['ticker','Ticker','symbol','Symbol','epic','EPIC','marketSymbol']), exchange);
    if (!tk) return null;
    const name = String(field(raw, ['name','company','company_name','Company','security']) || tk).trim();
    const yieldPct = pctYield(field(raw, ['yieldPct','yield_pct','dividend_yield','yield','forward_yield','forwardYield']));
    const price = positive(field(raw, ['livePriceGbp','live_price_gbp','live_price','price','current_price','livePrice']));
    const fairValue = positive(field(raw, ['fair_value','fairValue','target_price','targetPrice']));
    return {
      securityId: securityId(exchange, tk), ticker:tk, marketSymbol:tk, name,
      region: region || (exchange === 'LSE' ? 'UK' : exchange === 'US' ? 'US' : 'OTHER'),
      country: String(field(raw, ['country','Country']) || region || ''), exchange,
      currency: upper(field(raw, ['currency','Currency'])) || (exchange === 'LSE' ? 'GBP' : exchange === 'US' ? 'USD' : ''),
      sector: String(field(raw, ['sector','Sector']) || ''), memberships:[],
      source:'NETWORK_EVIDENCE', sources:[sourceName], dataStatus:'AVAILABLE', evidenceCount:1,
      livePriceGbp:price, yieldPct, fairValue,
      dividendSafety:positive(field(raw, ['dividendSafety','dividend_safety','dividendSafetyScore'])),
      incomeScore:positive(field(raw, ['incomeScore','income_score'])),
      valuationScore:positive(field(raw, ['valuationScore','valuation_score'])),
      portfolioFit:positive(field(raw, ['portfolioFit','portfolio_fit'])),
      dividendGrowth:positive(field(raw, ['dividendGrowth','dividend_growth','dividendGrowthScore'])),
      businessQuality:positive(field(raw, ['businessQuality','business_quality','businessQualityScore'])),
      confidence:positive(field(raw, ['confidence','confidence_score','dataQuality'])),
      payoutRisk:String(field(raw, ['payoutRisk','payout_risk']) || ''),
      dividendStatus:String(field(raw, ['dividendStatus','dividend_status']) || ''),
      preferredAccount:String(field(raw, ['preferredAccount','account','broker']) || ''),
      brokerEligibility:field(raw, ['brokerEligibility','broker_eligibility']),
      updatedAt:String(field(raw, ['updatedAt','updated_at','last_updated','date_checked','timestamp']) || now())
    };
  }

  function collectEvidence(master) {
    const keys = ['AuroraScout','Watchlist','Global Watchlist','GlobalWatchlist','AuroraIntelligence','LivePrices'];
    const out = [];
    for (const key of keys) {
      for (const row of arr(master?.[key])) {
        const normalized = evidenceRow(row, key);
        if (normalized) out.push(normalized);
      }
    }
    return out;
  }

  function mergeUniverse(membershipRows, evidenceRows) {
    const byId = new Map();
    for (const raw of [...membershipRows, ...evidenceRows]) {
      if (!raw?.ticker) continue;
      const key = raw.securityId || securityId(raw.exchange, raw.ticker);
      const prior = byId.get(key);
      if (!prior) { byId.set(key, { ...raw, securityId:key, memberships:[...new Set(arr(raw.memberships))], sources:[...new Set(arr(raw.sources))] }); continue; }
      const evidenceFirst = n0(raw.evidenceCount) >= n0(prior.evidenceCount) ? raw : prior;
      byId.set(key, {
        ...prior, ...evidenceFirst, securityId:key,
        memberships:[...new Set([...arr(prior.memberships), ...arr(raw.memberships)])],
        sources:[...new Set([...arr(prior.sources), ...arr(raw.sources)])],
        evidenceCount:Math.max(n0(prior.evidenceCount), n0(raw.evidenceCount)),
        dataStatus:(n0(prior.evidenceCount) || n0(raw.evidenceCount)) ? 'AVAILABLE' : 'MISSING'
      });
    }
    return [...byId.values()].sort((a,b) => n0(b.evidenceCount) - n0(a.evidenceCount) || arr(b.memberships).length - arr(a.memberships).length || a.ticker.localeCompare(b.ticker));
  }

  function incomeFromYield(y) {
    if (!(y > 0)) return null;
    if (y <= 2) return clamp(35 + y * 12.5);
    if (y <= 6) return clamp(60 + (y - 2) * 8);
    if (y <= 8) return clamp(92 + (y - 6) * 4);
    if (y <= 10) return clamp(100 - (y - 8) * 5);
    return clamp(90 - (y - 10) * 10, 30, 90);
  }
  function payoutSafety(v) {
    const s = upper(v);
    if (!s) return null;
    if (s.includes('VERY HIGH')) return 25;
    if (s.includes('HIGH')) return 45;
    if (s.includes('MEDIUM')) return 65;
    if (s.includes('LOW')) return 82;
    return null;
  }
  function valuationFromFair(price, fair) {
    if (!(price > 0 && fair > 0)) return null;
    return Math.round(clamp(55 + (fair / price - 1) * 220, 20, 95));
  }

  function portfolioFit(row, state) {
    if (positive(row.portfolioFit)) return clamp(row.portfolioFit);
    const holdings = arr(state?.squad?.holdings).filter(h => !['SOLD','ARCHIVED'].includes(upper(h?.status)) && n0(h?.shares) > 0);
    if (!holdings.length) return 70;
    const value = h => Math.max(0, n0(h?.marketValueGbp) || n0(h?.shares) * n0(h?.livePriceGbp));
    const total = holdings.reduce((s,h) => s + value(h), 0);
    if (!total) return 70;
    const tk = ticker(row.ticker, row.exchange), sector = upper(row.sector);
    const tickerValue = holdings.filter(h => ticker(h?.ticker, h?.exchange) === tk).reduce((s,h) => s + value(h), 0);
    const sectorValue = sector ? holdings.filter(h => upper(h?.sector) === sector).reduce((s,h) => s + value(h), 0) : 0;
    const budget = positive(state?.mission?.budget) || positive(state?.transfer?.route?.budget) || 1000;
    const after = total + budget;
    const tickerPct = ((tickerValue + budget) / after) * 100;
    const sectorPct = sector ? ((sectorValue + budget) / after) * 100 : 0;
    let score = 92;
    if (tickerPct > 2) score -= Math.min(48, (tickerPct - 2) * 2.5);
    if (sector && sectorPct > 25) score -= Math.min(30, (sectorPct - 25) * 1.2);
    if (tickerValue === 0) score += 3;
    return Math.round(clamp(score, 20, 95));
  }

  function factorCoverage(factors, weights) {
    let present = 0, total = 0;
    for (const [key, weight] of Object.entries(weights)) {
      total += weight;
      if (num(factors[key]) != null) present += weight;
    }
    return total ? present / total : 0;
  }
  function weightedScore(factors, weights, confidence) {
    let sum = 0, weight = 0;
    for (const [key, wgt] of Object.entries(weights)) {
      const v = num(factors[key]);
      if (v == null || wgt <= 0) continue;
      sum += clamp(v) * wgt; weight += wgt;
    }
    if (!weight) return 0;
    const coverage = factorCoverage(factors, weights);
    const raw = sum / weight;
    return Math.round(clamp(raw * (.66 + .34 * coverage) * (.78 + .22 * clamp(confidence) / 100)));
  }

  function assess(row, state) {
    const livePrice = positive(row.livePriceGbp);
    const yieldPct = pctYield(row.yieldPct);
    const dividendSafety = positive(row.dividendSafety) ?? payoutSafety(row.payoutRisk);
    const incomeScore = positive(row.incomeScore) ?? incomeFromYield(yieldPct);
    const valuationScore = positive(row.valuationScore) ?? valuationFromFair(livePrice, positive(row.fairValue));
    const fit = portfolioFit(row, state);
    const dividendGrowth = positive(row.dividendGrowth);
    const businessQuality = positive(row.businessQuality);
    const factors = { dividendSafety, incomeScore, valuationScore, portfolioFit:fit, dividendGrowth, businessQuality };
    const coverage = factorCoverage(factors, SUSTAINABLE);
    const explicitConfidence = positive(row.confidence);
    const confidence = explicitConfidence ?? Math.round(clamp(coverage * 100, 20, 95));
    const sustainableScore = weightedScore(factors, SUSTAINABLE, confidence);
    const maximumScore = weightedScore(factors, MAXIMUM, confidence);
    const reasons = [];
    let status = 'pass';

    if (ticker(row.ticker, row.exchange) === 'TSCO') { status='block'; reasons.push('TSCO is locked legacy / 2029 and excluded from active buys.'); }
    if (/suspend|cancel|omit/i.test(String(row.dividendStatus || ''))) { status='block'; reasons.push('Dividend is suspended or cancelled.'); }
    if (upper(row.payoutRisk).includes('VERY HIGH')) { status='block'; reasons.push('Payout risk is very high.'); }
    if (dividendSafety != null && dividendSafety < GATES.minDividendSafety) { status='block'; reasons.push('Dividend safety is below the purchase gate.'); }
    if (explicitConfidence != null && confidence < GATES.minConfidence) { status='block'; reasons.push('Evidence confidence is below the purchase gate.'); }
    if (row.brokerEligibility === false) { status='block'; reasons.push('Broker eligibility is unavailable.'); }

    if (status !== 'block') {
      if (!(livePrice > 0)) reasons.push('Live price evidence is missing.');
      if (!(yieldPct > 0)) reasons.push('Recurring dividend yield evidence is missing.');
      if (dividendSafety == null) reasons.push('Dividend-safety evidence is missing.');
      if (coverage < GATES.pendingCoverage) reasons.push(`Only ${Math.round(coverage*100)}% of weighted evidence is available.`);
      if (!(livePrice > 0) || !(yieldPct > 0) || dividendSafety == null || coverage < GATES.pendingCoverage) status = 'pending';
    }

    if (status === 'pass' && (dividendSafety < GATES.cleanDividendSafety || confidence < GATES.cleanConfidence || yieldPct > GATES.cautionYield || coverage < .8)) {
      status='caution';
      if (dividendSafety < GATES.cleanDividendSafety) reasons.push('Dividend safety is below the clean-pass threshold.');
      if (confidence < GATES.cleanConfidence) reasons.push('Evidence confidence needs review.');
      if (yieldPct > GATES.cautionYield) reasons.push('Yield is above 10% and requires controlled sizing.');
      if (coverage < .8) reasons.push(`Evidence coverage is ${Math.round(coverage*100)}%; controlled sizing only.`);
    }

    const existingApproval = arr(state?.scouting?.targets).find(t => String(t?.securityId || t?.id || t?.ticker) === String(row.securityId || row.ticker));
    const eligible = status === 'pass' || status === 'caution';
    return {
      ...row,
      id: row.securityId,
      securityId: row.securityId,
      livePriceGbp:livePrice || 0,
      yieldPct:yieldPct || 0,
      dividendSafety, incomeScore, valuationScore, portfolioFit:fit, dividendGrowth, businessQuality,
      confidence, dataQuality:confidence, evidenceCoverage:Number((coverage*100).toFixed(1)),
      sustainableScore, maximumScore, status,
      recommendation: status === 'block' ? 'BLOCK' : status === 'pending' ? 'DATA PENDING' : status === 'caution' ? 'CAUTION' : sustainableScore >= 80 ? 'STRONG BUY' : sustainableScore >= 70 ? 'BUY' : 'WATCH',
      eligibilityReasons: reasons.length ? reasons : ['Clears the canonical income, safety, valuation and portfolio-fit gates.'],
      eligibleForTransfer:eligible,
      approvedForTransfer:eligible && existingApproval?.approvedForTransfer === true,
      scoringEngine:'AURORA_SCOUTING_RESTORED', scoringEngineVersion:'3.0.1-compatible', lastAssessedAt:now()
    };
  }

  function rank(rows, state) {
    const assessed = rows.map(row => assess(row, state));
    const statusOrder = s => s === 'pass' ? 0 : s === 'caution' ? 1 : s === 'pending' ? 2 : 3;
    assessed.sort((a,b) => statusOrder(a.status) - statusOrder(b.status) || b.sustainableScore - a.sustainableScore || b.confidence - a.confidence || b.yieldPct - a.yieldPct);
    assessed.forEach((row, i) => row.rank = i + 1);
    const max = [...assessed].sort((a,b) => statusOrder(a.status) - statusOrder(b.status) || b.maximumScore - a.maximumScore || b.confidence - a.confidence || b.yieldPct - a.yieldPct);
    const maxRank = new Map(max.map((row, i) => [row.securityId, i + 1]));
    assessed.forEach(row => row.maximumRank = maxRank.get(row.securityId) || 0);
    return assessed;
  }

  function counts(universe) {
    const region = r => universe.filter(x => upper(x.region || x.country) === r).length;
    return {
      total:universe.length,
      UK:region('UK'), US:region('US'), EUROPE:region('EUROPE'), CANADA:region('CANADA'), AUSTRALIA:region('AUSTRALIA'),
      OTHER:universe.filter(x => !['UK','US','EUROPE','CANADA','AUSTRALIA'].includes(upper(x.region || x.country))).length,
      evidence:universe.filter(x => n0(x.evidenceCount) > 0).length,
      missing:universe.filter(x => n0(x.evidenceCount) === 0).length
    };
  }

  async function sync(force=true) {
    const button = document.getElementById('scoutSyncButton');
    if (button) { button.disabled = true; button.textContent = 'Syncing…'; }
    renderStatus('SYNCING', 'Rebuilding the global recruitment universe…');
    try {
      const state = readState();
      const [membership, masterResult] = await Promise.all([
        fetchMembershipUniverse(),
        fetchNetworkMaster().catch(error => ({ error }))
      ]);
      const master = masterResult?.data || {};
      const evidence = collectEvidence(master);
      const universe = mergeUniverse(membership.rows, evidence);
      if (!universe.length) throw new Error('No valid scouting rows returned.');

      const evidenceCandidates = universe.filter(row => n0(row.evidenceCount) > 0);
      const ranked = rank(evidenceCandidates, state).slice(0, ACTIVE_LIMIT);
      const networkCounts = counts(universe);
      const next = {
        ...state,
        scouting:{
          ...obj(state.scouting),
          universe,
          targets:ranked,
          status: ranked.some(x => x.approvedForTransfer) ? 'SCOUTING_READY' : 'SCOUTING_REVIEW',
          scoringEngine:'AURORA_SCOUTING_RESTORED', scoringEngineVersion:'3.0.1-compatible',
          network:{
            restored:true, build:BUILD, source:masterResult?.url || 'Wikipedia membership only',
            counts:networkCounts, membershipErrors:membership.errors, syncedAt:now()
          },
          lastFullScanAt:now(), updatedAt:now()
        }
      };
      writeState(next);
      render(next);
      renderStatus('LIVE', `${networkCounts.total.toLocaleString('en-GB')} securities monitored across the restored global network.`);
      return next;
    } catch (error) {
      console.warn('[Aurora Scouting Restore] sync failed', error);
      render(readState());
      renderStatus('DEGRADED', `Network sync failed: ${error?.message || error}`);
      throw error;
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Sync Global Network'; }
    }
  }

  function ensureStyles() {
    if (document.getElementById('scoutingRestoreStyles')) return;
    const style = document.createElement('style');
    style.id = 'scoutingRestoreStyles';
    style.textContent = `
      .scout-restored{margin-top:22px;border:1px solid rgba(110,231,255,.13);border-radius:24px;padding:24px;background:linear-gradient(180deg,rgba(6,17,28,.95),rgba(8,8,15,.95));box-shadow:0 18px 55px rgba(0,0,0,.2)}
      .scout-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.scout-head h2{margin:0;font:900 clamp(28px,5vw,44px)/1 system-ui}.scout-head p{margin:8px 0 0;max-width:780px;color:#8fa2ad;line-height:1.5}.scout-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.scout-btn{border:1px solid rgba(110,231,255,.28);background:rgba(110,231,255,.06);color:#bdf7ff;border-radius:12px;padding:11px 14px;font:800 12px/1 system-ui;cursor:pointer}.scout-btn:disabled{opacity:.55;cursor:wait}.scout-chip{border:1px solid rgba(89,255,154,.28);color:#a9ffc6;border-radius:999px;padding:9px 12px;font:800 10px/1 system-ui;letter-spacing:.1em;text-transform:uppercase}
      .scout-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-top:20px}.scout-kpis div{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px;background:rgba(0,0,0,.15)}.scout-kpis small{display:block;color:#728692;font:800 9px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}.scout-kpis strong{font:900 19px/1.1 system-ui}.scout-status{margin-top:16px;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:13px;color:#94a6af}.scout-status b{color:#dff8ff}.scout-table{display:grid;gap:8px;margin-top:18px}.scout-row{display:grid;grid-template-columns:52px minmax(0,1.4fr) 100px 95px 110px 115px;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;background:rgba(0,0,0,.12)}.scout-rank{font:900 16px/1 system-ui;color:#6ee7ff}.scout-name b{display:block}.scout-name span,.scout-cell span{display:block;color:#71838d;font:700 9px/1.3 system-ui;text-transform:uppercase;letter-spacing:.08em;margin-top:3px}.scout-cell strong{font:900 14px/1.2 system-ui}.scout-state{justify-self:start;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:7px 9px;font:800 9px/1 system-ui;letter-spacing:.08em;text-transform:uppercase}.scout-state.pass{color:#9effbd;border-color:rgba(89,255,154,.28)}.scout-state.caution{color:#ffe39b;border-color:rgba(255,213,107,.28)}.scout-state.pending{color:#b7d7ff;border-color:rgba(110,170,255,.25)}.scout-state.block{color:#ffadb6;border-color:rgba(255,79,97,.28)}.scout-note{margin-top:14px;color:#718792;font:600 12px/1.5 system-ui}
      @media(max-width:900px){.scout-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.scout-row{grid-template-columns:44px minmax(0,1fr);align-items:start}.scout-cell,.scout-state{grid-column:2}.scout-state{margin-top:2px}}
      @media(max-width:560px){.scout-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function ensureHost() {
    let host = document.getElementById('scoutingRestoredNetwork');
    if (host) return host;
    const hero = document.querySelector('.department-hero');
    if (!hero) return null;
    host = document.createElement('section');
    host.id = 'scoutingRestoredNetwork';
    host.className = 'scout-restored';
    hero.insertAdjacentElement('afterend', host);
    return host;
  }

  function renderStatus(state, text) {
    const el = document.getElementById('scoutRestoreStatus');
    if (el) el.innerHTML = `<b>${esc(state)}</b> • ${esc(text)}`;
  }

  function render(state=readState()) {
    ensureStyles();
    const host = ensureHost();
    if (!host) return;
    const universe = arr(state?.scouting?.universe);
    const targets = arr(state?.scouting?.targets);
    const c = obj(state?.scouting?.network?.counts);
    const pass = targets.filter(x => x.status === 'pass').length;
    const caution = targets.filter(x => x.status === 'caution').length;
    const pending = targets.filter(x => x.status === 'pending').length;
    const blocked = targets.filter(x => x.status === 'block').length;
    const approved = targets.filter(x => (x.status === 'pass' || x.status === 'caution') && x.approvedForTransfer === true).length;
    const strategy = String(state?.scouting?.strategy || 'sustainable').toLowerCase() === 'maximum' ? 'maximum' : 'sustainable';
    const visible = targets.slice(0, 12);
    const syncedAt = state?.scouting?.network?.syncedAt ? new Date(state.scouting.network.syncedAt).toLocaleString('en-GB') : 'Not yet synced';

    host.innerHTML = `
      <div class="scout-head">
        <div><span class="scout-chip">● GLOBAL NETWORK RESTORED</span><h2>Scouting Network</h2><p>The broad market universe is back. Aurora monitors the full network, deep-scouts evidence-backed names, applies the original Sustainable/Maximum scoring lenses and keeps Transfer behind the pass/caution approval gate.</p></div>
        <div class="scout-actions"><button class="scout-btn" id="scoutSyncButton">Sync Global Network</button></div>
      </div>
      <div class="scout-kpis">
        <div><small>Monitored</small><strong>${(c.total ?? universe.length).toLocaleString('en-GB')}</strong></div>
        <div><small>Evidence-backed</small><strong>${(c.evidence ?? universe.filter(x=>n0(x.evidenceCount)>0).length).toLocaleString('en-GB')}</strong></div>
        <div><small>Active Scouting</small><strong>${targets.length}</strong></div>
        <div><small>Pass</small><strong>${pass}</strong></div>
        <div><small>Caution</small><strong>${caution}</strong></div>
        <div><small>Approved</small><strong>${approved}</strong></div>
      </div>
      <div class="scout-status" id="scoutRestoreStatus"><b>${universe.length ? 'LIVE' : 'READY'}</b> • Last full scan: ${esc(syncedAt)} • ${pending} pending • ${blocked} blocked.</div>
      ${visible.length ? `<div class="scout-table">${visible.map((row, index) => {
        const score = strategy === 'maximum' ? n0(row.maximumScore) : n0(row.sustainableScore);
        const rankValue = strategy === 'maximum' ? n0(row.maximumRank) || index + 1 : n0(row.rank) || index + 1;
        return `<div class="scout-row">
          <div class="scout-rank">#${rankValue}</div>
          <div class="scout-name"><b>${esc(row.ticker)} • ${esc(row.name)}</b><span>${esc(arr(row.memberships).join(' · ') || row.sector || 'Network evidence')}</span></div>
          <div class="scout-cell"><strong>${score || '—'}</strong><span>${strategy} score</span></div>
          <div class="scout-cell"><strong>${row.yieldPct ? `${Number(row.yieldPct).toFixed(2)}%` : '—'}</strong><span>Yield</span></div>
          <div class="scout-cell"><strong>${row.evidenceCoverage != null ? `${Number(row.evidenceCoverage).toFixed(0)}%` : '—'}</strong><span>Evidence</span></div>
          <span class="scout-state ${esc(row.status || 'pending')}">${esc(row.status || 'pending')}</span>
        </div>`;
      }).join('')}</div>` : '<div class="scout-note">No active candidates yet. Run the global sync to rebuild the scouting universe.</div>'}
      <div class="scout-note">Coverage: ${(c.UK ?? 0).toLocaleString('en-GB')} UK • ${(c.US ?? 0).toLocaleString('en-GB')} US • ${(c.EUROPE ?? 0).toLocaleString('en-GB')} Europe • ${(c.CANADA ?? 0).toLocaleString('en-GB')} Canada • ${(c.AUSTRALIA ?? 0).toLocaleString('en-GB')} Australia • ${(c.OTHER ?? 0).toLocaleString('en-GB')} other. Missing-evidence names stay monitored but cannot reach Transfer.</div>`;

    document.getElementById('scoutSyncButton')?.addEventListener('click', () => sync(true).catch(() => {}), { once:true });
    document.documentElement.dataset.auroraScoutingNetwork = universe.length ? 'restored' : 'ready';
    window.AuroraScoutingNetworkRestore = Object.freeze({ build:BUILD, restored:universe.length > 0, monitored:universe.length, active:targets.length, approved, sync });
  }

  function boot() {
    render();
    const state = readState();
    const last = Date.parse(state?.scouting?.network?.syncedAt || '');
    const stale = !Number.isFinite(last) || Date.now() - last > NETWORK_SYNC_MS;
    if (stale) sync(false).catch(() => {});
    window.addEventListener('pageshow', () => render());
    window.addEventListener('focus', () => render());
    window.addEventListener('aurora2:state', () => render());
    window.addEventListener('storage', event => { if (event.key === STATE_KEY || event.key === BACKUP_KEY) render(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();