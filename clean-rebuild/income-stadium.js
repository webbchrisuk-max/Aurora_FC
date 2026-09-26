(() => {
  'use strict';

  const BUILD='20260926-income-stadium-1';
  const SNAP='aurora-clean:income-snapshot:v1';
  const CASH='aurora-clean:broker-cash-snapshot:v1';
  const TARGET_MONTHLY=2000;
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const pct=v=>`${num(v).toFixed(2)}%`;
  const active=h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0;
  const account=v=>{const s=upper(v);if(s==='IG'||s.includes('IG ISA'))return'IG ISA';if(s==='T212'||s.includes('212'))return'Trading 212 ISA';return String(v||'—')};
  let timer=null;

  function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
  function parseDate(value){
    if(value===null||value===undefined||value==='')return null;
    if(typeof value==='number'&&Number.isFinite(value)){const d=new Date(Date.UTC(1899,11,30)+Math.round(value)*86400000);return Number.isNaN(d.getTime())?null:d;}
    const raw=String(value).trim(),iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
  }
  function displayDate(d){return d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'TBC'}
  function stateRows(state){
    const rows=arr(state?.squad?.holdings).filter(active).map(h=>{
      const shares=Math.max(0,num(h.shares)),annual=Math.max(0,num(h.annualIncomeGbp)||shares*num(h.annualDpsGbp)),market=Math.max(0,num(h.marketValueGbp)||shares*num(h.livePriceGbp??h.priceGbp));
      const live=Math.max(0,num(h.livePriceGbp??h.priceGbp));
      return{ticker:upper(h.ticker),name:String(h.name||h.ticker||''),account:account(h.account),annual,monthly:annual/12,market,shares,live,yieldPct:market>0?annual/market*100:0};
    }).filter(r=>r.ticker&&r.annual>0);
    return rows.sort((a,b)=>b.annual-a.annual);
  }
  function dividendRows(){
    const snap=read(SNAP)?.snapshot||{};
    const start=new Date();start.setHours(0,0,0,0);
    return arr(snap.dividends).map(raw=>{
      const date=parseDate(raw.payDate??raw.pay_date??raw.paymentDate??raw.payment_date);
      const exDate=parseDate(raw.exDate??raw.ex_date);
      const expected=Math.max(0,num(raw.expectedAmountGbp??raw.expected_amount_gbp??raw.grossDividendGbp??raw.gross_dividend_gbp)||num(raw.sharesEligible??raw.shares_eligible)*num(raw.dividendPerShareGbp??raw.dividend_per_share_gbp));
      return{ticker:upper(raw.ticker||raw.symbol),name:String(raw.name||raw.company||raw.ticker||''),account:account(raw.account),date,exDate,expected,status:upper(raw.status||'FORECAST')};
    }).filter(r=>r.ticker&&r.date&&r.date>=start&&!/PAID|ARCHIVED|CANCELLED|CANCELED|MISSED/.test(r.status)).sort((a,b)=>a.date-b.date||b.expected-a.expected);
  }
  function cashMetrics(){
    const snap=read(CASH)?.snapshot||{};
    const balances=snap.balances||{};
    const year=new Date().getFullYear();
    const received=arr(snap.ledger).filter(r=>{
      const d=new Date(r.recordedAt||r.date||''),ref=upper(r.reference||r.type||r.note||'');
      return !Number.isNaN(d.getTime())&&d.getFullYear()===year&&num(r.cashChangeGbp)>0&&(ref.includes('DIV')||ref.includes('DIVIDEND'));
    }).reduce((s,r)=>s+num(r.cashChangeGbp),0);
    return{ig:num(balances.IG),t212:num(balances.T212),received};
  }
  function monthlyRunway(rows){
    const start=new Date();start.setDate(1);start.setHours(0,0,0,0);
    return Array.from({length:12},(_,i)=>{
      const d=new Date(start.getFullYear(),start.getMonth()+i,1),n=new Date(start.getFullYear(),start.getMonth()+i+1,1);
      const events=rows.filter(r=>r.date>=d&&r.date<n);
      return{date:d,total:events.reduce((s,r)=>s+r.expected,0),count:events.length};
    });
  }
  function totals(rows){
    const annual=rows.reduce((s,r)=>s+r.annual,0),market=rows.reduce((s,r)=>s+r.market,0);
    return{annual,monthly:annual/12,market,yieldPct:market>0?annual/market*100:0};
  }
  function renderKpis(holdings,dividends,cash){
    const t=totals(holdings),now=new Date();
    const in30=dividends.filter(r=>r.date-now<=30*86400000).reduce((s,r)=>s+r.expected,0);
    const in90=dividends.filter(r=>r.date-now<=90*86400000).reduce((s,r)=>s+r.expected,0);
    $('incomeHeroAnnual').textContent=money(t.annual);
    $('incomeHeroMonthly').textContent=money(t.monthly);
    $('incomeHeroReceived').textContent=money(cash.received);
    $('incomeHero30').textContent=money(in30);
    $('incomeHero90').textContent=money(in90);
    $('incomeHeroAnnualSub').textContent=`${pct(t.yieldPct)} current portfolio yield · ${holdings.length} income-producing positions`;
    const top=holdings[0]||null,best=[...holdings].sort((a,b)=>b.yieldPct-a.yieldPct)[0]||null,next=dividends[0]||null,biggest=[...dividends].sort((a,b)=>b.expected-a.expected)[0]||null;
    const set=(id,val)=>{const e=$(id);if(e)e.textContent=val};
    set('incomeTopTicker',top?.ticker||'—');set('incomeTopDetail',top?`${money(top.annual)}/yr · ${top.account}`:'Waiting for Squad income');
    set('incomeNextTicker',next?.ticker||'—');set('incomeNextDetail',next?`${displayDate(next.date)} · ${money(next.expected)} · ${next.account}`:'No dated future dividend');
    set('incomeBestYieldTicker',best?.ticker||'—');set('incomeBestYieldDetail',best?`${pct(best.yieldPct)} · ${money(best.annual)}/yr`:'Waiting for Squad income');
    set('incomeBiggestTicker',biggest?.ticker||'—');set('incomeBiggestDetail',biggest?`${money(biggest.expected)} · ${displayDate(biggest.date)}`:'No future dated payment');
  }
  function renderFixtures(rows){
    const host=$('incomeFixtureRows');if(!host)return;
    host.innerHTML=rows.length?rows.slice(0,10).map((r,i)=>`<div class="income-fixture"><span class="date">${displayDate(r.date)}</span><span class="ticker">${esc(r.ticker)}</span><span class="name">${esc(r.name||'Dividend fixture')}</span><span class="broker">${esc(r.account)}</span><span class="amount">${money(r.expected)}</span><span class="status">${esc(r.status||'FORECAST')}</span></div>`).join(''):'<div style="padding:16px;color:#7f968d">No future dated dividends currently supplied by AuroraData 2.</div>';
    setText('incomeFixtureCount',`${rows.length} UPCOMING`);
  }
  function renderRunway(rows){
    const data=monthlyRunway(rows),host=$('incomeRunwayChart');if(!host)return;
    const max=Math.max(1,...data.map(x=>x.total)),total=data.reduce((s,x)=>s+x.total,0);
    host.innerHTML=data.map(x=>`<div class="income-runway-col"><strong>${x.total>0?money(x.total).replace('.00',''):'—'}</strong><div class="income-runway-bar" style="height:${Math.max(3,x.total/max*155)}px"></div><span>${x.date.toLocaleDateString('en-GB',{month:'short'})}</span></div>`).join('');
    setText('incomeRunwayTotal',`12-month dated runway · ${money(total)} across ${data.reduce((s,x)=>s+x.count,0)} payment${data.reduce((s,x)=>s+x.count,0)===1?'':'s'}`);
  }
  function renderLeague(rows){
    const host=$('incomeLeagueBody');if(!host)return;
    const total=rows.reduce((s,r)=>s+r.annual,0),max=rows[0]?.annual||1;
    host.innerHTML=rows.length?rows.map((r,i)=>`<tr><td class="rank">#${i+1}</td><td><span class="ticker">${esc(r.ticker)}</span><div class="muted">${esc(r.name)}</div></td><td>${esc(r.account)}</td><td><strong>${money(r.annual)}</strong></td><td>${money(r.monthly)}</td><td>${pct(r.yieldPct)}</td><td>${total>0?(r.annual/total*100).toFixed(1):'0.0'}%<div class="income-share-track"><i style="width:${Math.min(100,r.annual/max*100)}%"></i></div></td></tr>`).join(''):'<tr><td colspan="7">No confirmed Squad income yet.</td></tr>';
  }
  function renderGoal(holdings,dividends,cash){
    const t=totals(holdings),progress=Math.min(100,t.monthly/TARGET_MONTHLY*100),gap=Math.max(0,TARGET_MONTHLY-t.monthly),next=dividends[0]||null,top=holdings[0]||null;
    setText('incomeGoalCurrent',money(t.monthly));
    setText('incomeGoalPct',`${progress.toFixed(1)}%`);
    const bar=$('incomeGoalBar');if(bar)bar.style.width=`${progress}%`;
    setText('incomeGoalGap',money(gap));
    setText('incomeGoalAnnual',money(t.annual));
    setText('incomeGoalReceived',money(cash.received));
    setText('incomeGoalNext',next?`${next.ticker} · ${displayDate(next.date)}`:'No dated fixture');
    setText('incomeGoalLeader',top?top.ticker:'—');
  }
  function setText(id,value){const e=$(id);if(e)e.textContent=value}
  function render(){
    const A=window.AuroraClean;if(!A)return;
    const holdings=stateRows(A.readState()),dividends=dividendRows(),cash=cashMetrics();
    renderKpis(holdings,dividends,cash);renderFixtures(dividends);renderRunway(dividends);renderLeague(holdings);renderGoal(holdings,dividends,cash);
  }
  function schedule(delay=100){clearTimeout(timer);timer=setTimeout(render,delay)}
  function observeBridge(){
    const target=$('incomeConnectionDetail')||$('incomeUpcomingRows');
    if(!target||!window.MutationObserver)return;
    new MutationObserver(()=>schedule(60)).observe(target,{childList:true,subtree:true,characterData:true});
  }
  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    observeBridge();render();
    window.addEventListener('aurora-clean:state',()=>schedule(80));
    window.addEventListener('focus',()=>schedule(80));
    document.addEventListener('click',e=>{if(e.target?.id==='incomeRefresh'||e.target?.id==='refreshBrokerCash')for(const d of [250,800,1600])setTimeout(()=>schedule(0),d)});
    window.AuroraIncomeStadium=Object.freeze({BUILD,render});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();