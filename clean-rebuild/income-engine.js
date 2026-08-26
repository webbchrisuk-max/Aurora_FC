(() => {
  'use strict';

  const BUILD='20260826-clean-income-portfolio-value-3';
  const CACHE_KEY='aurora-clean:income-snapshot:v1';
  const CASH_CACHE_KEY='aurora-clean:broker-cash-snapshot:v1';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const round=v=>Number(num(v).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const accountCode=v=>{const s=upper(v);if(s==='IG'||s.includes('IG ISA'))return'IG';if(s==='T212'||s.includes('212'))return'T212';return''};
  const accountLabel=v=>accountCode(v)==='IG'?'IG ISA':accountCode(v)==='T212'?'Trading 212 ISA':String(v||'—');
  let currentSnapshot=null,currentCash=null,busy=false;

  function parseDate(value){
    if(value===null||value===undefined||value==='')return null;
    if(typeof value==='number'&&Number.isFinite(value)){const d=new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000);return Number.isNaN(d.getTime())?null:d;}
    const raw=String(value).trim(),iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
  }
  const dateKey=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';
  const displayDate=d=>d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'Date not supplied';
  const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  const setValue=(id,v)=>{const e=$(id);if(e)e.value=v??''};
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}
  function toast(message){const e=$('incomeToast');if(!e)return;e.textContent=String(message||'');e.hidden=false;clearTimeout(window.__incomeCleanToast);window.__incomeCleanToast=setTimeout(()=>{e.hidden=true},3200)}

  function normaliseDividend(raw={}){
    const payDate=parseDate(raw.payDate??raw.pay_date??raw.paymentDate??raw.payment_date),exDate=parseDate(raw.exDate??raw.ex_date);
    const shares=Math.max(0,num(raw.sharesEligible??raw.shares_eligible??raw.eligibleShares));
    const dps=Math.max(0,num(raw.dividendPerShareGbp??raw.dividend_per_share_gbp??raw.dpsGbp));
    const expected=Math.max(0,num(raw.expectedAmountGbp??raw.expected_amount_gbp??raw.grossDividendGbp??raw.gross_dividend_gbp));
    const actual=Math.max(0,num(raw.actualAmountGbp??raw.actual_amount_gbp??raw.receivedGbp??raw.received_gbp));
    return{
      id:String(raw.id||raw.dividendId||raw.dividend_id||`${accountCode(raw.account)}|${upper(raw.ticker)}|${dateKey(payDate)}`),
      account:accountCode(raw.account),ticker:upper(raw.ticker||raw.symbol),name:String(raw.name||raw.company||raw.ticker||''),
      payDate,exDate,sharesEligible:shares,dps,expectedAmount:expected>0?expected:(shares>0&&dps>0?round(shares*dps):0),actualAmount:actual,
      status:upper(raw.status||'FORECAST'),source:String(raw.source||''),notes:String(raw.notes||''),raw
    };
  }

  function squadMetrics(state){
    const holdings=arr(state.squad?.holdings).filter(h=>!['ARCHIVED','SOLD','CLOSED','EXITED'].includes(upper(h.status||'ACTIVE'))&&num(h.shares)>0);
    const all=holdings.map(h=>{
      const shares=Math.max(0,num(h.shares));
      const book=Math.max(0,num(h.bookCostGbp));
      const live=Math.max(0,num(h.livePriceGbp??h.priceGbp));
      const market=Math.max(0,num(h.marketValueGbp)||(shares*live));
      const annual=Math.max(0,num(h.annualIncomeGbp||shares*num(h.annualDpsGbp)));
      return{ticker:upper(h.ticker),name:String(h.name||h.ticker||''),account:String(h.account||''),shares,annual,book,market,pnl:market-book};
    }).filter(r=>r.ticker);
    const rows=all.filter(r=>r.annual>0).sort((a,b)=>b.annual-a.annual);
    const annual=round(all.reduce((s,r)=>s+r.annual,0));
    const book=round(all.reduce((s,r)=>s+r.book,0));
    const market=round(all.reduce((s,r)=>s+r.market,0));
    const pnl=round(market-book);
    const pnlPct=book>0?(pnl/book)*100:0;
    return{rows,annual,monthly:round(annual/12),book,market,pnl,pnlPct,positions:all.length};
  }
  function snapshotRows(snapshot){const map=new Map();arr(snapshot?.dividends).forEach(raw=>{const e=normaliseDividend(raw);if(e.ticker)map.set(e.id,e)});return[...map.values()]}
  function futureRows(snapshot){const start=today();return snapshotRows(snapshot).filter(e=>e.payDate&&e.payDate>=start&&!/ARCHIVED|CANCELLED|CANCELED|MISSED|PAID/.test(e.status)).sort((a,b)=>a.payDate-b.payDate||b.expectedAmount-a.expectedAmount)}
  function settlementRows(snapshot){return snapshotRows(snapshot).filter(e=>!/ARCHIVED|CANCELLED|CANCELED|MISSED|PAID/.test(e.status)).sort((a,b)=>{const at=a.payDate?.getTime()||0,bt=b.payDate?.getTime()||0;return bt-at||a.ticker.localeCompare(b.ticker)})}
  function monthlyRunway(rows,months=12){const start=new Date();start.setDate(1);start.setHours(0,0,0,0);const out=[];for(let i=0;i<months;i++){const d=new Date(start.getFullYear(),start.getMonth()+i,1),next=new Date(start.getFullYear(),start.getMonth()+i+1,1),events=rows.filter(r=>r.payDate>=d&&r.payDate<next);out.push({date:d,total:round(events.reduce((s,r)=>s+r.expectedAmount,0)),count:events.length})}return out}

  function renderCash(snapshot){
    currentCash=snapshot||currentCash;
    const b=currentCash?.balances||{};
    set('cashBalanceIG',money(b.IG));set('cashBalanceT212',money(b.T212));
    set('cashStatus',currentCash?'CONNECTED':'CHECK');
    const rows=arr(currentCash?.ledger).slice(0,12),host=$('cashLedger');
    if(host)host.innerHTML=rows.length?rows.map(r=>`<li><strong>${esc(accountLabel(r.account))} · ${num(r.cashChangeGbp)>=0?'+':''}${money(r.cashChangeGbp)}</strong> — ${esc(upper(r.ticker)||String(r.type||'DIVIDEND').replaceAll('_',' '))} — ${r.recordedAt?esc(new Date(r.recordedAt).toLocaleString('en-GB')):''} — balance ${money(r.balanceAfterGbp)}</li>`).join(''):'<li>No broker cash activity recorded yet.</li>';
  }

  function populateSettlement(snapshot){
    const rows=settlementRows(snapshot),select=$('cashRecordDividend');if(!select)return;
    const previous=select.value;
    select.innerHTML='<option value="">Choose dividend…</option>'+rows.map(r=>`<option value="${esc(r.id)}">${esc(r.ticker)} · ${esc(displayDate(r.payDate))} · ${money(r.expectedAmount)} · ${esc(accountLabel(r.account))}</option>`).join('');
    if(rows.some(r=>r.id===previous))select.value=previous;
    syncSettlementForm();
  }
  function selectedDividend(){const id=$('cashRecordDividend')?.value;return snapshotRows(currentSnapshot).find(r=>r.id===id)||null}
  function syncSettlementForm(){
    const r=selectedDividend();
    if(!r){setValue('cashRecordTicker','');setValue('cashRecordExpected','');return;}
    setValue('cashRecordTicker',r.ticker);setValue('cashRecordExpected',r.expectedAmount?money(r.expectedAmount):'—');
    if(r.account)setValue('cashRecordAccount',r.account);
    if(!num($('cashRecordAmount')?.value))setValue('cashRecordAmount',r.expectedAmount||'');
    if(!$('cashRecordDate')?.value)setValue('cashRecordDate',dateKey(r.payDate)||dateKey(today()));
  }

  function render(snapshot,source='LIVE'){
    currentSnapshot=snapshot||currentSnapshot;
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState(),metrics=squadMetrics(state),rows=futureRows(currentSnapshot),next=rows[0]||null;
    const in30=round(rows.filter(r=>r.payDate-today()<=30*86400000).reduce((s,r)=>s+r.expectedAmount,0)),in90=round(rows.filter(r=>r.payDate-today()<=90*86400000).reduce((s,r)=>s+r.expectedAmount,0));
    set('incomeMarketValue',money(metrics.market));set('incomeBookValue',money(metrics.book));set('incomePortfolioPnl',`${metrics.pnl>=0?'+':''}${money(metrics.pnl)}`);set('incomePortfolioPnlPct',`${metrics.pnlPct>=0?'+':''}${metrics.pnlPct.toFixed(2)}%`);
    set('incomeAnnual',money(metrics.annual));set('incomeMonthly',money(metrics.monthly));set('incomeNextPayment',next?money(next.expectedAmount):'—');set('incomeNextPaymentMeta',next?`${next.ticker} · ${displayDate(next.payDate)}`:'No future dated payment in AuroraData 2');set('incomeNext90',money(in90));set('incomeNext30',money(in30));
    set('incomeConnection',source==='LIVE'?'CONNECTED':source==='CACHE'?'CACHED':'CHECK CONNECTION');set('incomeConnectionDetail',source==='LIVE'?`${rows.length} upcoming dividend event(s) loaded from AuroraData 2.`:source==='CACHE'?'Showing the last verified AuroraData 2 dividend snapshot.':'AuroraData 2 dividend snapshot unavailable. Forward income still comes from Squad.');
    const list=$('incomeUpcomingRows');if(list)list.innerHTML=rows.length?rows.map((r,i)=>`<li><strong>#${i+1} ${esc(r.ticker)} · ${money(r.expectedAmount)}</strong> — ${esc(accountLabel(r.account))} — pay ${esc(displayDate(r.payDate))}${r.exDate?` · ex ${esc(displayDate(r.exDate))}`:''} — ${r.sharesEligible>0?`${r.sharesEligible.toLocaleString('en-GB',{maximumFractionDigits:6})} eligible shares`:'eligibility locks at/after ex-date'} — ${esc(r.status)} <button type="button" data-record-dividend="${esc(r.id)}">Record Received</button></li>`).join(''):'<li>No future dated dividends currently supplied by AuroraData 2.</li>';
    const runway=monthlyRunway(rows,12),monthHost=$('incomeMonthlyRunway');if(monthHost)monthHost.innerHTML=runway.map(m=>`<li><strong>${esc(m.date.toLocaleDateString('en-GB',{month:'long',year:'numeric'}))}</strong> — ${money(m.total)} — ${m.count} dated payment${m.count===1?'':'s'}</li>`).join('');
    const producers=$('incomeProducerRows');if(producers)producers.innerHTML=metrics.rows.length?metrics.rows.map((r,i)=>`<li><strong>#${i+1} ${esc(r.ticker)} · ${money(r.annual)}/yr</strong> — ${esc(accountLabel(r.account))} — ${money(r.annual/12)}/month average — market ${money(r.market)} — ${r.shares.toLocaleString('en-GB',{maximumFractionDigits:6})} shares</li>`).join(''):'<li>No confirmed Squad income yet.</li>';
    populateSettlement(currentSnapshot);
  }

  async function post(action,payload={}){const c=window.AuroraData2Client;if(!c?.post)throw new Error('AuroraData 2 client unavailable');return c.post(action,payload)}
  async function refreshCash(){try{const r=await post('brokerCashSnapshot',{});if(!r?.balances||!Array.isArray(r.ledger))throw new Error('Incomplete broker cash snapshot');currentCash=r;writeJson(CASH_CACHE_KEY,{savedAt:new Date().toISOString(),snapshot:r});renderCash(r)}catch(e){const c=readJson(CASH_CACHE_KEY);renderCash(c?.snapshot||null);set('cashStatus',c?'CACHED':'CHECK')}}
  async function refresh(){const client=window.AuroraData2Client;if(!client){render(readJson(CACHE_KEY)?.snapshot||null,'ERROR');return}const cfg=client.config?.()||{};if(!cfg.endpoint||!cfg.token){const c=readJson(CACHE_KEY);render(c?.snapshot||null,c?'CACHE':'ERROR');return}try{const result=await client.get('incomeSnapshot',{});if(!result||result.ok===false||!Array.isArray(result.dividends))throw new Error('Incomplete income snapshot');writeJson(CACHE_KEY,{savedAt:new Date().toISOString(),snapshot:result});render(result,'LIVE')}catch(e){const c=readJson(CACHE_KEY);render(c?.snapshot||null,c?'CACHE':'ERROR')}await refreshCash()}

  async function recordDividend(){
    if(busy)return;const dividend=selectedDividend(),account=accountCode($('cashRecordAccount')?.value),amount=Math.max(0,num($('cashRecordAmount')?.value)),receivedDate=$('cashRecordDate')?.value||dateKey(today());
    if(!dividend){toast('Choose the dividend you received.');return}if(!['IG','T212'].includes(account)){toast('Choose IG ISA or Trading 212 ISA.');return}if(amount<=0){toast('Enter the exact dividend amount received.');return}
    const reference=`DIV:${account}:${dividend.ticker}:${receivedDate}:${amount.toFixed(2)}`;
    busy=true;const btn=$('recordDividendCash');if(btn)btn.disabled=true;
    try{
      const result=await post('recordDividendSettlement',{account,ticker:dividend.ticker,amountGbp:round(amount),mode:'CASH',reference,note:`Income Centre clean settlement · dividend ${dividend.id} · expected ${money(dividend.expectedAmount)} · received ${receivedDate}`});
      renderCash(result?.snapshot||await post('brokerCashSnapshot',{}));
      setValue('cashRecordAmount','');setValue('cashRecordDividend','');setValue('cashRecordTicker','');setValue('cashRecordExpected','');
      await refresh();toast(result?.duplicate?'This dividend receipt was already recorded.':`${dividend.ticker} dividend recorded to ${accountLabel(account)} · ${money(amount)} added to broker cash.`);
    }catch(e){toast(`Dividend receipt failed: ${String(e?.message||e)}`)}finally{busy=false;if(btn)btn.disabled=false}
  }

  function boot(){
    if(!window.AuroraClean||!window.AuroraData2Client){setTimeout(boot,60);return}
    const c=readJson(CACHE_KEY),cc=readJson(CASH_CACHE_KEY);render(c?.snapshot||null,c?'CACHE':'ERROR');renderCash(cc?.snapshot||null);
    $('incomeRefresh')?.addEventListener('click',refresh);$('refreshBrokerCash')?.addEventListener('click',refreshCash);$('cashRecordDividend')?.addEventListener('change',()=>{setValue('cashRecordAmount','');syncSettlementForm()});$('recordDividendCash')?.addEventListener('click',recordDividend);
    document.addEventListener('click',e=>{const b=e.target.closest?.('[data-record-dividend]');if(!b)return;setValue('cashRecordDividend',b.dataset.recordDividend);setValue('cashRecordAmount','');syncSettlementForm();$('dividendSettlement')?.scrollIntoView({behavior:'smooth',block:'start'})});
    window.addEventListener('aurora-clean:state',()=>render(currentSnapshot||c?.snapshot||null,currentSnapshot?'LIVE':c?'CACHE':'ERROR'));
    refresh();window.AuroraCleanIncome=Object.freeze({BUILD,refresh,refreshCash,recordDividend,normaliseDividend,squadMetrics,futureRows});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
