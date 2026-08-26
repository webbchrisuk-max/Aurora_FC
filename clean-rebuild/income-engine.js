(() => {
  'use strict';

  const BUILD='20260826-clean-income-dividend-calendar-1';
  const CACHE_KEY='aurora-clean:income-snapshot:v1';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const round=v=>Number(num(v).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const accountLabel=v=>{const s=upper(v);if(s==='IG'||s.includes('IG ISA'))return'IG ISA';if(s==='T212'||s.includes('212'))return'Trading 212 ISA';return String(v||'—')};

  function parseDate(value){
    if(value===null||value===undefined||value==='')return null;
    if(typeof value==='number'&&Number.isFinite(value)){
      const ms=Date.UTC(1899,11,30)+Math.round(value)*86400000;
      const d=new Date(ms);return Number.isNaN(d.getTime())?null:d;
    }
    const raw=String(value).trim();
    const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
  }
  const dateKey=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';
  const displayDate=d=>d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'Date not supplied';
  const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};

  function normaliseDividend(raw={}){
    const payDate=parseDate(raw.payDate??raw.pay_date??raw.paymentDate??raw.payment_date);
    const exDate=parseDate(raw.exDate??raw.ex_date);
    const shares=Math.max(0,num(raw.sharesEligible??raw.shares_eligible??raw.eligibleShares));
    const dps=Math.max(0,num(raw.dividendPerShareGbp??raw.dividend_per_share_gbp??raw.dpsGbp));
    const expected=Math.max(0,num(raw.expectedAmountGbp??raw.expected_amount_gbp??raw.grossDividendGbp??raw.gross_dividend_gbp));
    const actual=Math.max(0,num(raw.actualAmountGbp??raw.actual_amount_gbp??raw.receivedGbp??raw.received_gbp));
    const computed=expected>0?expected:(shares>0&&dps>0?round(shares*dps):0);
    return{
      id:String(raw.id||raw.dividendId||raw.dividend_id||`${upper(raw.account)}|${upper(raw.ticker)}|${dateKey(payDate)}`),
      account:String(raw.account||''),ticker:upper(raw.ticker||raw.symbol),name:String(raw.name||raw.company||raw.ticker||''),
      payDate,exDate,sharesEligible:shares,dps,expectedAmount:computed,actualAmount:actual,
      status:upper(raw.status||'FORECAST'),source:String(raw.source||''),notes:String(raw.notes||'')
    };
  }

  function readCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch(_){return null}}
  function writeCache(snapshot){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:new Date().toISOString(),snapshot}))}catch(_){}}

  function squadMetrics(state){
    const holdings=arr(state.squad?.holdings).filter(h=>upper(h.status||'ACTIVE')!=='ARCHIVED');
    const rows=holdings.map(h=>({
      ticker:upper(h.ticker),name:String(h.name||h.ticker||''),account:String(h.account||''),shares:Math.max(0,num(h.shares)),
      annual:Math.max(0,num(h.annualIncomeGbp||num(h.shares)*num(h.annualDpsGbp))),book:Math.max(0,num(h.bookCostGbp))
    })).filter(r=>r.ticker&&r.annual>0).sort((a,b)=>b.annual-a.annual);
    const annual=round(rows.reduce((s,r)=>s+r.annual,0));
    return{rows,annual,monthly:round(annual/12)};
  }

  function snapshotRows(snapshot){
    const map=new Map();
    arr(snapshot?.dividends).forEach(raw=>{const e=normaliseDividend(raw);if(!e.ticker)return;const key=e.id||`${upper(e.account)}|${e.ticker}|${dateKey(e.payDate)}`;map.set(key,e)});
    return[...map.values()];
  }

  function futureRows(snapshot){
    const start=today();
    return snapshotRows(snapshot).filter(e=>{
      if(!e.payDate||e.payDate<start)return false;
      if(/ARCHIVED|CANCELLED|CANCELED|MISSED/.test(e.status))return false;
      return true;
    }).sort((a,b)=>a.payDate-b.payDate||b.expectedAmount-a.expectedAmount);
  }

  function monthlyRunway(rows,months=12){
    const start=new Date();start.setDate(1);start.setHours(0,0,0,0);
    const out=[];
    for(let i=0;i<months;i++){
      const d=new Date(start.getFullYear(),start.getMonth()+i,1);
      const next=new Date(start.getFullYear(),start.getMonth()+i+1,1);
      const events=rows.filter(r=>r.payDate>=d&&r.payDate<next);
      out.push({date:d,total:round(events.reduce((s,r)=>s+r.expectedAmount,0)),count:events.length});
    }
    return out;
  }

  function render(snapshot,source='LIVE'){
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState(),metrics=squadMetrics(state),rows=futureRows(snapshot),next=rows[0]||null;
    const in30=round(rows.filter(r=>r.payDate-today()<=30*86400000).reduce((s,r)=>s+r.expectedAmount,0));
    const in90=round(rows.filter(r=>r.payDate-today()<=90*86400000).reduce((s,r)=>s+r.expectedAmount,0));
    const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
    set('incomeAnnual',money(metrics.annual));set('incomeMonthly',money(metrics.monthly));set('incomeNextPayment',next?money(next.expectedAmount):'—');
    set('incomeNextPaymentMeta',next?`${next.ticker} · ${displayDate(next.payDate)}`:'No future dated payment in AuroraData 2');
    set('incomeNext90',money(in90));set('incomeNext30',money(in30));
    set('incomeConnection',source==='LIVE'?'CONNECTED':source==='CACHE'?'CACHED':'CHECK CONNECTION');
    set('incomeConnectionDetail',source==='LIVE'?`${rows.length} upcoming dividend event(s) loaded from AuroraData 2.`:source==='CACHE'?'Showing the last verified AuroraData 2 dividend snapshot.':'AuroraData 2 dividend snapshot is unavailable. Forward income still comes from Squad.');

    const list=$('incomeUpcomingRows');
    if(list)list.innerHTML=rows.length?rows.map((r,i)=>{
      const ex=r.exDate?` · ex ${displayDate(r.exDate)}`:'';
      const eligibility=r.sharesEligible>0?`${r.sharesEligible.toLocaleString('en-GB',{maximumFractionDigits:6})} eligible shares`:'eligibility locks at/after ex-date';
      return `<li><strong>#${i+1} ${esc(r.ticker)} · ${money(r.expectedAmount)}</strong> — ${esc(accountLabel(r.account))} — pay ${esc(displayDate(r.payDate))}${esc(ex)} — ${esc(eligibility)} — ${esc(r.status)}</li>`;
    }).join(''):'<li>No future dated dividends currently supplied by AuroraData 2.</li>';

    const runway=monthlyRunway(rows,12),monthHost=$('incomeMonthlyRunway');
    if(monthHost)monthHost.innerHTML=runway.map(m=>`<li><strong>${esc(m.date.toLocaleDateString('en-GB',{month:'long',year:'numeric'}))}</strong> — ${money(m.total)} — ${m.count} dated payment${m.count===1?'':'s'}</li>`).join('');

    const producers=$('incomeProducerRows');
    if(producers)producers.innerHTML=metrics.rows.length?metrics.rows.map((r,i)=>`<li><strong>#${i+1} ${esc(r.ticker)} · ${money(r.annual)}/yr</strong> — ${esc(accountLabel(r.account))} — ${money(r.annual/12)}/month average — ${r.shares.toLocaleString('en-GB',{maximumFractionDigits:6})} shares</li>`).join(''):'<li>No confirmed Squad income yet.</li>';
  }

  async function refresh(){
    const client=window.AuroraData2Client;
    if(!client){render(readCache()?.snapshot||null,'ERROR');return;}
    const cfg=client.config?.()||{};
    if(!cfg.endpoint||!cfg.token){render(readCache()?.snapshot||null,readCache()?'CACHE':'ERROR');return;}
    try{
      const result=await client.get('incomeSnapshot',{});
      if(!result||result.ok===false||!Array.isArray(result.dividends))throw new Error('Incomplete income snapshot');
      writeCache(result);render(result,'LIVE');
    }catch(error){
      const cached=readCache();render(cached?.snapshot||null,cached?'CACHE':'ERROR');
    }
  }

  function boot(){
    if(!window.AuroraClean||!window.AuroraData2Client){setTimeout(boot,60);return;}
    render(readCache()?.snapshot||null,readCache()?'CACHE':'ERROR');
    $('incomeRefresh')?.addEventListener('click',refresh);
    window.addEventListener('aurora-clean:state',()=>render(readCache()?.snapshot||null,readCache()?'CACHE':'ERROR'));
    refresh();
    window.AuroraCleanIncome=Object.freeze({BUILD,refresh,normaliseDividend,squadMetrics,futureRows});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
