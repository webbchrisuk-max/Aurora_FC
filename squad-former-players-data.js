(() => {
  'use strict';

  const BUILD='20260820-squad-former-history-live-1';
  const CLIENT='/aurora-fc-2/aurora-data2-client.js?v=20260820-squad-former-history-live-1';
  const MASTER_URLS=[
    'https://webbchrisuk-max.github.io/aurora-fc-2/AuroraMaster.json',
    'https://raw.githubusercontent.com/webbchrisuk-max/aurora-fc-2/main/AuroraMaster.json',
    'https://webbchrisuk-max.github.io/aurora-city-fc/AuroraMaster.json'
  ];
  const CLOSED=new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  const arr=v=>Array.isArray(v)?v:[];
  const upper=v=>String(v||'').trim().toUpperCase();
  const tk=v=>upper(v).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const n=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const x=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(x)?x:null};
  const first=(row,keys)=>{for(const key of keys){const v=row?.[key];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v}return null};
  const acct=v=>/trade ?212|trading ?212|t212/.test(norm(v))?'Trading 212 ISA':/\big\b|ig isa/.test(norm(v))?'IG ISA':String(v||'Account Review').trim()||'Account Review';
  let rows=[],state={source:'Checking AuroraData sale history',liveLoaded:false,legacyLoaded:false,lastError:''},loading=null;

  function rowsFromValue(v){
    if(Array.isArray(v)) return v.every(x=>x&&typeof x==='object'&&!Array.isArray(x))?v:[];
    if(!v||typeof v!=='object')return [];
    for(const key of ['rows','values','data']){
      const data=v[key]; if(!Array.isArray(data))continue;
      if(data.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))return data;
      const headers=Array.isArray(v.headers)?v.headers.map(String):Array.isArray(v.columns)?v.columns.map((x,i)=>String(x?.label||x?.name||x||`column_${i+1}`)):[];
      if(headers.length&&data.every(Array.isArray))return data.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
    }
    if(Array.isArray(v.cols)&&Array.isArray(v.rows)){
      const headers=v.cols.map((c,i)=>String(c?.label||c?.id||`column_${i+1}`));
      return v.rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r?.c?.[i]?.v??r?.c?.[i]?.f??''])));
    }
    return [];
  }
  function readTab(master,label){
    const wanted=norm(label).replace(/\s/g,'');
    for(const box of [master,master?.data,master?.tabs,master?.sheets,master?.feeds,master?.tables,master?.payload]){
      if(!box||typeof box!=='object')continue;
      for(const key of Object.keys(box)) if(norm(key).replace(/\s/g,'')===wanted){const found=rowsFromValue(box[key]);if(found.length)return found}
    }
    return [];
  }
  function dateFromText(text){
    const s=String(text||''); let m=s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    m=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); return m?`${m[1]}-${m[2]}-${m[3]}`:'';
  }
  function noteMoney(note,labels){for(const label of labels){const m=String(note||'').match(new RegExp(`${label}\\s*(?:approx\\s*)?£([0-9,]+(?:\\.[0-9]+)?)`,'i'));if(m)return n(m[1])}return null}
  function noteShares(note){const s=String(note||'');const m=s.match(/sold\s+([0-9,]+(?:\.[0-9]+)?)\s+(?:[A-Z0-9.]+|[^.]{1,40}?)\s+at\s+/i)||s.match(/([0-9,]+(?:\.[0-9]+)?)\s+shares\s+at\s+/i);return m?n(m[1]):null}
  function notePrice(note){const s=String(note||'');let m=s.match(/\bat\s+£([0-9,]+(?:\.[0-9]+)?)/i);if(m)return `£${m[1]}`;m=s.match(/\bat\s+([0-9,]+(?:\.[0-9]+)?)p\b/i);if(m)return `${m[1]}p`;m=s.match(/\bat\s+\$([0-9,]+(?:\.[0-9]+)?)/i);return m?`$${m[1]}`:''}
  function noteId(note,label){const m=String(note||'').match(new RegExp(`${label}\\s+([A-Z0-9-]+)`,'i'));return m?m[1]:''}
  function legacyRecord(row){
    const ticker=tk(first(row,['ticker','Ticker','symbol','Symbol'])); if(!ticker)return null;
    const status=upper(first(row,['status','Status','position_status','holding_status'])||''); const shares=n(first(row,['shares','Shares','quantity','Quantity','units','Units']))||0;
    if(!CLOSED.has(status)&&shares>0)return null;
    const note=String(first(row,['manager_note','managerNote','Manager Note','notes','note','Note'])||'').trim();
    return {ticker,name:String(first(row,['name','Name','company','Company','company_name','Company Name'])||ticker),account:acct(first(row,['account','Account','platform','Platform','broker','Broker'])),status:'SOLD',soldAt:dateFromText(note)||String(first(row,['sold_at','soldAt','closed_at','closedAt','date_checked','date','Date'])||''),sharesSold:noteShares(note),executionPriceDisplay:notePrice(note),netProceedsGbp:noteMoney(note,['Net proceeds','Total proceeds','Proceeds']),bookCostGbp:noteMoney(note,['Original book cost','book cost']),realisedProfitGbp:noteMoney(note,['realised profit','realized profit']),feesGbp:noteMoney(note,['Fees','charges','PTM levy']),sector:String(first(row,['sector','Sector'])||''),ticketId:noteId(note,'Ticket'),transactionId:noteId(note,'Transaction'),orderId:noteId(note,'order'),source:'AuroraData Holdings history',note};
  }
  async function getLegacy(){
    let error='';
    for(const url of MASTER_URLS){try{const r=await fetch(`${url}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const master=await r.json();const found=readTab(master,'Holdings').map(legacyRecord).filter(Boolean);if(found.length)return {rows:found,loaded:true,error:''}}catch(e){error=String(e?.message||e)}}
    return {rows:[],loaded:false,error};
  }
  function loadScript(src,ready){
    if(ready())return Promise.resolve();const base=src.split('?')[0];const existing=[...document.scripts].find(s=>String(s.src||'').includes(base));
    if(existing)return new Promise(resolve=>{let tries=0;const wait=()=>ready()?resolve():(tries++>160?resolve():setTimeout(wait,25));wait()});
    return new Promise(resolve=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s)});
  }
  function priceDisplay(price,unit,currency){const value=n(price);if(value===null||value<=0)return '';if(upper(unit)==='PENCE')return `${value.toLocaleString('en-GB',{maximumFractionDigits:4})}p`;if(upper(currency)==='USD'||upper(unit)==='USD')return `$${value.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:6})}`;return `£${value.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:6})}`}
  function ticketFromReg(row){const m=String(row?.note||'').match(/SellDesk ticket\s+([^;.\s]+)/i);return m?m[1]:''}
  async function getLive(legacy){
    await loadScript(CLIENT,()=>!!window.AuroraData2Client);const client=window.AuroraData2Client,cfg=client?.config?.()||{};
    if(!client?.get||!cfg.endpoint||!cfg.token)return {rows:[],loaded:false,error:'AuroraData connection is not configured in this browser.'};
    try{
      const [a,b]=await Promise.all([client.get('listSellTickets',{limit:100,includeClosed:true}),client.get('listRecentRegistrations',{limit:50})]);
      const tickets=arr(a?.tickets).filter(x=>upper(x?.approvalStatus)==='EXECUTED');
      const regs=arr(b?.registrations).filter(x=>upper(x?.side)==='SELL'&&upper(x?.status)==='REGISTERED_SELL');
      const regByTicket=new Map(regs.map(x=>[ticketFromReg(x),x]).filter(([id])=>id));
      const legacyByKey=new Map(legacy.map(x=>[`${tk(x.ticker)}|${acct(x.account)}`,x]));
      const out=[];
      tickets.forEach(ticket=>{
        const reg=regByTicket.get(String(ticket?.ticketId||''))||null;const ticker=tk(ticket?.ticker||reg?.ticker);const account=acct(ticket?.account||reg?.account);const old=legacyByKey.get(`${ticker}|${account}`)||null;const newShares=reg?n(reg?.newShares):null;
        if(newShares!==null?newShares>1e-8:!old)return;
        const proceeds=n(ticket?.actualProceedsGbp)??n(reg?.totalCostGbp);const book=old?.bookCostGbp??null;
        out.push({ticker,name:String(ticket?.name||reg?.name||old?.name||ticker),account,status:'SOLD',soldAt:String(ticket?.executedAt||reg?.tradeDate||old?.soldAt||''),sharesSold:n(reg?.shares)??n(ticket?.proposedShares)??old?.sharesSold??null,executionPriceDisplay:priceDisplay(ticket?.executionPrice??reg?.priceInput,ticket?.priceUnit??reg?.priceUnit,ticket?.currency??reg?.currency)||old?.executionPriceDisplay||'',netProceedsGbp:proceeds,bookCostGbp:book,realisedProfitGbp:proceeds!==null&&book!==null?proceeds-book:old?.realisedProfitGbp??null,feesGbp:upper(ticket?.currency||reg?.currency)==='GBP'?n(ticket?.fees):null,sector:old?.sector||'',ticketId:String(ticket?.ticketId||''),transactionId:String(reg?.transactionId||old?.transactionId||''),source:'AuroraData SellDesk • EXECUTED',note:String(ticket?.executionNote||ticket?.reason||old?.note||'')});
      });
      regs.forEach(reg=>{
        if((n(reg?.newShares)??1)>1e-8)return;const id=ticketFromReg(reg);if(id&&tickets.some(t=>String(t?.ticketId||'')===id))return;const ticker=tk(reg?.ticker),account=acct(reg?.account),old=legacyByKey.get(`${ticker}|${account}`)||null,proceeds=n(reg?.totalCostGbp),book=old?.bookCostGbp??null;
        out.push({ticker,name:String(reg?.name||old?.name||ticker),account,status:'SOLD',soldAt:String(reg?.tradeDate||reg?.submittedAt||old?.soldAt||''),sharesSold:n(reg?.shares)??old?.sharesSold??null,executionPriceDisplay:priceDisplay(reg?.priceInput,reg?.priceUnit,reg?.currency)||old?.executionPriceDisplay||'',netProceedsGbp:proceeds,bookCostGbp:book,realisedProfitGbp:proceeds!==null&&book!==null?proceeds-book:old?.realisedProfitGbp??null,feesGbp:old?.feesGbp??null,sector:old?.sector||'',ticketId:id||old?.ticketId||'',transactionId:String(reg?.transactionId||old?.transactionId||''),source:'AuroraData Registration • REGISTERED_SELL',note:String(reg?.note||old?.note||'')});
      });
      return {rows:out,loaded:true,error:''};
    }catch(e){return {rows:[],loaded:false,error:String(e?.message||e||'AuroraData sale history could not be read.')}}
  }
  function meaningful(v){return !(v===null||v===undefined||v===''||(typeof v==='number'&&!Number.isFinite(v)))}
  function merge(base,next){const out={...(base||{})};for(const [k,v] of Object.entries(next||{})){if(!meaningful(v))continue;if(typeof v==='number'&&v===0&&meaningful(out[k])&&out[k]!==0)continue;out[k]=v}return out}
  function mergeRows(legacy,live){const map=new Map();for(const group of [legacy,live])for(const row of arr(group)){const ticker=tk(row?.ticker);if(!ticker)continue;const key=`${ticker}|${acct(row?.account)}`;map.set(key,merge(map.get(key),{...row,ticker,account:acct(row?.account),status:'SOLD'}))}return [...map.values()].sort((a,b)=>String(b.soldAt||'').localeCompare(String(a.soldAt||''))||a.ticker.localeCompare(b.ticker))}
  function emit(){window.dispatchEvent(new CustomEvent('aurora:squad-former-history',{detail:{count:rows.length,...state}}))}
  async function refresh(){if(loading)return loading;loading=(async()=>{const legacy=await getLegacy(),live=await getLive(legacy.rows);rows=mergeRows(legacy.rows,live.rows);const sources=[];if(live.loaded)sources.push('AuroraData SellDesk / Registration');if(legacy.loaded)sources.push('AuroraData Holdings history');state={source:sources.join(' + ')||'No sale-history source available',liveLoaded:live.loaded,legacyLoaded:legacy.loaded,lastError:[live.error,legacy.error].filter(Boolean).join(' • ')};emit();return rows.map(x=>({...x}))})().finally(()=>{loading=null});return loading}
  window.AuroraSquadFormerPlayers={build:BUILD,readOnly:true,rows:()=>rows.map(x=>({...x})),status:()=>({...state}),refresh};
  setTimeout(()=>refresh().catch(()=>emit()),0);
})();
