(() => {
  'use strict';

  const BUILD = '20260820-squad-former-history-1';
  const LEGACY_URLS = [
    'https://webbchrisuk-max.github.io/aurora-fc-2/AuroraMaster.json',
    'https://raw.githubusercontent.com/webbchrisuk-max/aurora-fc-2/main/AuroraMaster.json'
  ];
  const CLOSED = new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);

  const VERIFIED = [
    {
      ticker:'MNG', name:'M&G PLC', account:'IG ISA', status:'SOLD', soldAt:'2026-06-29',
      sharesSold:5737, executionPriceDisplay:'334.004p', netProceedsGbp:19160.31,
      bookCostGbp:13258.48, realisedProfitGbp:5901.83, feesGbp:1.50,
      sector:'FINANCIALS', source:'AuroraData Holdings',
      note:'Sold 5,737 MNG at 334.004p on 29/06/2026. Proceeds £19,160.31 after £1.50 charges. Original book cost £13,258.48; realised profit approx £5,901.83.'
    },
    {
      ticker:'SDLF', name:'STANDARD LIFE HOLDINGS', account:'IG ISA', status:'SOLD', soldAt:'2026-07-03',
      sharesSold:1692, executionPriceDisplay:'851.86p', netProceedsGbp:14413.47,
      bookCostGbp:11111.08, realisedProfitGbp:3302.39, feesGbp:null,
      sector:'FINANCIALS', source:'AuroraData Holdings',
      note:'Sold 1,692 Standard Life plc at 851.86p on 03/07/2026. Total proceeds £14,413.47. Original book cost £11,111.08; realised profit approx £3,302.39.'
    },
    {
      ticker:'LGEN', name:'LEGAL & GENERAL', account:'IG ISA', status:'SOLD', soldAt:'2026-07-03',
      sharesSold:8102, executionPriceDisplay:'292.736p', grossProceedsGbp:23717.47, netProceedsGbp:23715.97,
      bookCostGbp:19706.12, realisedProfitGbp:4009.85, feesGbp:1.50,
      sector:'FINANCIALS', source:'AuroraData Holdings',
      note:'Sold 8,102 Legal & General Group PLC at 292.736p on 03/07/2026. Consideration £23,717.47 less £1.50 PTM levy; total proceeds £23,715.97. Original book cost £19,706.12; realised profit approx £4,009.85.'
    },
    {
      ticker:'UKW', name:'GREENCOAT WIND', account:'IG ISA', status:'SOLD', soldAt:'2026-08-04',
      sharesSold:7021, executionPriceDisplay:'115.6p', netProceedsGbp:8116.276, feesGbp:0,
      bookCostGbp:7328.79, realisedProfitGbp:null, sector:'RENEWABLE ENERGY',
      ticketId:'SELL-1785843006225-C9D07369', transactionId:'SALE-1785843273023',
      source:'AuroraData SellDesk • EXECUTED',
      note:'Completed manually with broker and recorded in Aurora. Sold 7,021 UKW at 115.6p on 04/08/2026; net proceeds £8,116.28.'
    },
    {
      ticker:'VWRA', name:'VANGUARD FTSE ALL-WORLD', account:'Trading 212 ISA', status:'SOLD', soldAt:'2026-08-05',
      sharesSold:40.42249269, executionPriceDisplay:'£143.82', netProceedsGbp:5804.812899, feesGbp:8.75,
      bookCostGbp:null, realisedProfitGbp:null, sector:'GLOBAL EQUINITY ETF',
      ticketId:'SELL-1785916806080-6DDAF449', transactionId:'SALE-1785917115882',
      source:'AuroraData SellDesk • EXECUTED',
      note:'Completed manually with broker and recorded in Aurora. Sold 40.42249269 VWRA at £143.82 on 05/08/2026; net proceeds £5,804.81.'
    },
    {
      ticker:'IITU', name:'ISHARES S&P 500', account:'Trading 212 ISA', status:'SOLD', soldAt:'2026-08-05',
      sharesSold:64.18067352, executionPriceDisplay:'3819p (£38.19)', netProceedsGbp:2451.06, feesGbp:null,
      bookCostGbp:null, realisedProfitGbp:580.45, sector:'TECHNOLOGY ETF', orderId:'EO55214293578',
      source:'AuroraData Holdings',
      note:'Sold full IITU position on 05/08/2026: 64.18067352 shares at 3819p (£38.19). Proceeds £2,451.06; realised profit £580.45.'
    }
  ];

  const arr = value => Array.isArray(value) ? value : [];
  const upper = value => String(value || '').trim().toUpperCase();
  const ticker = value => upper(value).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const maybeNum = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g,''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const first = (row, keys) => {
    for (const key of keys) {
      if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
    }
    return null;
  };
  const account = value => {
    const text = norm(value);
    if (/trade ?212|trading ?212|t212/.test(text)) return 'Trading 212 ISA';
    if (/\big\b|ig isa/.test(text)) return 'IG ISA';
    return String(value || 'Account Review').trim() || 'Account Review';
  };

  let historyRows = VERIFIED.map(row => ({...row}));
  let status = {source:'AuroraData verified snapshot', legacyLoaded:false, lastError:''};
  let loading = null;

  function rowsFromValue(value) {
    if (Array.isArray(value)) {
      if (!value.length) return [];
      if (value.every(item => item && typeof item === 'object' && !Array.isArray(item))) return value;
      return [];
    }
    if (!value || typeof value !== 'object') return [];
    for (const key of ['rows','values','data']) {
      if (!Array.isArray(value[key])) continue;
      const candidate = value[key];
      if (candidate.every(item => item && typeof item === 'object' && !Array.isArray(item))) return candidate;
      const headers = Array.isArray(value.headers)
        ? value.headers.map(String)
        : Array.isArray(value.columns)
          ? value.columns.map((item,index) => String(item?.label || item?.name || item || `column_${index+1}`))
          : [];
      if (headers.length && candidate.every(Array.isArray)) {
        return candidate.map(row => {
          const out = {};
          headers.forEach((header,index) => { out[header] = row[index]; });
          return out;
        });
      }
    }
    if (Array.isArray(value.cols) && Array.isArray(value.rows)) {
      const headers = value.cols.map((col,index) => String(col?.label || col?.id || `column_${index+1}`));
      return value.rows.map(row => {
        const cells = Array.isArray(row?.c) ? row.c : [];
        const out = {};
        headers.forEach((header,index) => { out[header] = cells[index]?.v ?? cells[index]?.f ?? ''; });
        return out;
      });
    }
    return [];
  }

  function readTab(master, label) {
    const wanted = norm(label).replace(/\s/g,'');
    const containers = [master,master?.data,master?.tabs,master?.sheets,master?.feeds,master?.tables,master?.payload]
      .filter(value => value && typeof value === 'object');
    for (const container of containers) {
      for (const key of Object.keys(container)) {
        if (norm(key).replace(/\s/g,'') !== wanted) continue;
        const rows = rowsFromValue(container[key]);
        if (rows.length) return rows;
      }
    }
    return [];
  }

  function isoDateFromText(text) {
    const match = String(text || '').match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!match) return '';
    return `${match[3]}-${String(match[2]).padStart(2,'0')}-${String(match[1]).padStart(2,'0')}`;
  }
  function moneyFromNote(note, labels) {
    const text = String(note || '');
    for (const label of labels) {
      const match = text.match(new RegExp(`${label}\\s*(?:approx\\s*)?£([0-9,]+(?:\\.[0-9]+)?)`,'i'));
      if (match) return maybeNum(match[1]);
    }
    return null;
  }
  function sharesFromNote(note) {
    const text = String(note || '');
    let match = text.match(/sold\s+([0-9,]+(?:\.[0-9]+)?)\s+(?:[A-Z0-9.]+|[^.]{1,40}?)\s+at\s+/i);
    if (!match) match = text.match(/:\s*([0-9,]+(?:\.[0-9]+)?)\s+shares\s+at\s+/i);
    if (!match) match = text.match(/([0-9,]+(?:\.[0-9]+)?)\s+shares\s+at\s+/i);
    return match ? maybeNum(match[1]) : null;
  }
  function priceFromNote(note) {
    const text = String(note || '');
    const gbp = text.match(/\bat\s+£([0-9,]+(?:\.[0-9]+)?)/i);
    if (gbp) return `£${gbp[1]}`;
    const pence = text.match(/\bat\s+([0-9,]+(?:\.[0-9]+)?)p\b/i);
    if (pence) {
      const bracket = text.match(/\bat\s+[0-9,]+(?:\.[0-9]+)?p\s*\(£([0-9,]+(?:\.[0-9]+)?)\)/i);
      return bracket ? `${pence[1]}p (£${bracket[1]})` : `${pence[1]}p`;
    }
    return '';
  }
  function feesFromNote(note) {
    const text = String(note || '');
    const match = text.match(/(?:after|less)\s+£([0-9,]+(?:\.[0-9]+)?)\s+(?:charges?|PTM levy|fees?)/i);
    return match ? maybeNum(match[1]) : null;
  }
  function idFromNote(note, label) {
    const match = String(note || '').match(new RegExp(`${label}\\s+([A-Z0-9-]+)`,'i'));
    return match ? match[1] : '';
  }

  function legacyRecord(row) {
    const tk = ticker(first(row,['ticker','Ticker','symbol','Symbol']));
    if (!tk) return null;
    const rawStatus = upper(first(row,['status','Status','position_status','holding_status']) || '');
    const shares = maybeNum(first(row,['shares','Shares','quantity','Quantity','units','Units'])) || 0;
    const note = String(first(row,['manager_note','managerNote','Manager Note','notes','note','Note']) || '').trim();
    const hasExitEvidence = CLOSED.has(rawStatus) || /\b(sold|exited|closed|archived)\b/i.test(note);
    if (!hasExitEvidence) return null;
    const soldAt = isoDateFromText(note) || String(first(row,['sold_at','soldAt','closed_at','closedAt','date_checked','date','Date']) || '').trim();
    const proceeds = moneyFromNote(note,['Net proceeds','Total proceeds','Proceeds']);
    const book = moneyFromNote(note,['Original book cost','book cost']);
    const profit = moneyFromNote(note,['realised profit']);
    return {
      ticker:tk,
      name:String(first(row,['name','Name','company','Company','company_name','Company Name']) || tk),
      account:account(first(row,['account','Account','platform','Platform','broker','Broker'])),
      status:'SOLD',
      soldAt,
      sharesSold:sharesFromNote(note),
      executionPriceDisplay:priceFromNote(note),
      netProceedsGbp:proceeds,
      bookCostGbp:book,
      realisedProfitGbp:profit,
      feesGbp:feesFromNote(note),
      sector:String(first(row,['sector','Sector']) || ''),
      ticketId:idFromNote(note,'Ticket'),
      transactionId:idFromNote(note,'Transaction'),
      orderId:idFromNote(note,'order'),
      source:'Aurora legacy Holdings export',
      note
    };
  }

  function meaningful(value) {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    return true;
  }
  function mergeRecord(base, next) {
    const out = {...(base || {})};
    Object.entries(next || {}).forEach(([key,value]) => {
      if (!meaningful(value)) return;
      if (typeof value === 'number' && value === 0 && meaningful(out[key]) && out[key] !== 0) return;
      out[key] = value;
    });
    return out;
  }
  function mergeRows(...groups) {
    const map = new Map();
    groups.flat().filter(Boolean).forEach(row => {
      const tk = ticker(row?.ticker);
      if (!tk) return;
      const key = `${tk}|${account(row?.account)}`;
      map.set(key, mergeRecord(map.get(key), {...row,ticker:tk,account:account(row?.account),status:'SOLD'}));
    });
    return [...map.values()].sort((a,b) => String(b.soldAt || '').localeCompare(String(a.soldAt || '')) || a.ticker.localeCompare(b.ticker));
  }

  function emit() {
    window.dispatchEvent(new CustomEvent('aurora:squad-former-history', {
      detail:{count:historyRows.length,source:status.source,legacyLoaded:status.legacyLoaded,lastError:status.lastError}
    }));
  }

  async function refresh() {
    if (loading) return loading;
    loading = (async () => {
      let legacy = [];
      let source = '';
      let lastError = '';
      for (const url of LEGACY_URLS) {
        try {
          const response = await fetch(`${url}${url.includes('?')?'&':'?'}v=${Date.now()}`,{cache:'no-store'});
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const master = await response.json();
          legacy = readTab(master,'Holdings').map(legacyRecord).filter(Boolean);
          if (legacy.length) { source = url; break; }
        } catch (error) {
          lastError = String(error?.message || error || 'History source unavailable');
        }
      }
      historyRows = mergeRows(legacy, VERIFIED);
      status = {
        source:source ? 'Aurora legacy Holdings + verified AuroraData sale history' : 'AuroraData verified sale history',
        legacyLoaded:!!source,
        lastError:source ? '' : lastError
      };
      emit();
      return historyRows.slice();
    })().finally(() => { loading = null; });
    return loading;
  }

  window.AuroraSquadFormerPlayers = {
    build:BUILD,
    readOnly:true,
    rows:() => historyRows.map(row => ({...row})),
    status:() => ({...status}),
    refresh
  };

  setTimeout(() => refresh().catch(() => emit()),0);
})();
