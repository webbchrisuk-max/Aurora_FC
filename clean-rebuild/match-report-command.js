(() => {
  'use strict';

  const BUILD='20260924-match-report-command-1';
  const SNAPSHOT_KEY='aurora-clean:match-report-snapshot:v2';
  const CASH_CACHE='aurora-clean:transfer-broker-cash:v1';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(num(v).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const active=h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0;
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};

  function potType(p){
    const type=String(p?.type||'').toLowerCase();
    if(type)return type;
    const name=String(p?.name||'').toLowerCase();
    if(name.includes('emergency'))return'emergency';
    if(name.includes('house'))return'house_project';
    if(name.includes('investment'))return'investment';
    return'goal';
  }

  function isa(state){
    const v=state?.finance?.isaTracker||read('aurora-clean:isa-tracker-v1')||{};
    const annual=Math.max(0,num(v.annualAllowance)||20000);
    const used=round(num(v.monzoCash)+num(v.monzoStocks)+num(v.trading212)+num(v.igCurrentNet));
    return{annual,used,left:Math.max(0,round(annual-used)),flex:Math.max(0,num(v.igFlexibleReplacement))};
  }

  function portfolio(state){
    const rows=arr(state?.squad?.holdings).filter(active);
    const market=round(rows.reduce((s,h)=>s+Math.max(0,num(h.marketValueGbp)||num(h.shares)*num(h.livePriceGbp)),0));
    const book=round(rows.reduce((s,h)=>s+Math.max(0,num(h.bookCostGbp)),0));
    const annual=round(rows.reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp)||num(h.shares)*num(h.annualDpsGbp)),0));
    return{rows,market,book,pnl:round(market-book),annual,monthly:round(annual/12)};
  }

  function pots(state){
    const rows=arr(state?.finance?.pots).filter(p=>!p?.archived);
    const total=round(rows.reduce((s,p)=>s+Math.max(0,num(p.balance)),0));
    const emergency=rows.find(p=>potType(p)==='emergency'||String(p.name||'').toLowerCase().includes('emergency'));
    const house=rows.find(p=>potType(p)==='house_project'||String(p.id||'')==='house_fund'||String(p.name||'').toLowerCase().includes('house'));
    const investment=rows.find(p=>potType(p)==='investment'&&(String(p.accountProvider||'').toLowerCase().includes('monzo')||String(p.name||'').toLowerCase().includes('investment')));
    return{rows,total,emergency:Math.max(0,num(emergency?.balance)),house:Math.max(0,num(house?.balance)),investmentBook:Math.max(0,num(investment?.balance))};
  }

  function externalAssets(state){
    const a=state?.finance?.overviewAssets||{};
    const tescoSip=Math.max(0,num(a.tescoSipCurrent));
    const options=Math.max(0,Math.round(num(a.tescoOptions)));
    const pricePence=Math.max(0,num(a.tescoSharePricePence));
    const tesco=round(tescoSip+options*(pricePence/100));
    return{
      monzo:Math.max(0,num(a.monzoCurrent)),
      monzoInvested:Math.max(0,num(a.monzoInvested)),
      tesco,
      brokerCash:Math.max(0,num(a.brokerCash))
    };
  }

  function cash(){
    const c=read(CASH_CACHE)?.snapshot?.balances||{};
    return{IG:Math.max(0,num(c.IG)),T212:Math.max(0,num(c.T212)),total:round(num(c.IG)+num(c.T212))};
  }

  function route(state){
    const mission=state?.transfer?.mission||null,route=state?.transfer?.route||null;
    const allocations=[...(route?.allocations||[]),...(route?.brokerCashAllocations||[])];
    const receipts=arr(state?.registration?.receipts).filter(r=>!mission||String(r.missionId||'')===String(mission.id||''));
    return{mission,route,allocations,receipts};
  }

  function metrics(state){
    const pf=portfolio(state),ps=pots(state),ex=externalAssets(state),is=isa(state),bc=cash(),rt=route(state);
    const monzoSubstitute=ex.monzo>0?ex.monzo:ps.investmentBook;
    const potTotalForGrand=round(Math.max(0,ps.total-ps.investmentBook));
    const broker=bc.total>0?bc.total:ex.brokerCash;
    const grand=round(potTotalForGrand+monzoSubstitute+pf.market+broker+ex.tesco);
    return{pf,ps,ex,is,bc,rt,grand};
  }

  function fmtDate(v){
    if(!v)return'—';
    const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const state=A.readState(),m=metrics(state);
    const missionStatus=upper(m.rt.mission?.status||'NONE');
    const routeStatus=m.rt.route?.locked?'LOCKED':m.rt.route?.allocations?.length?'READY':'WAITING';
    const report=$('matchReportCommand');if(!report)return;
    report.innerHTML=`
      <section class="match-report-hero">
        <div><span>FINANCIAL POSITION</span><strong>${money(m.grand)}</strong><small>Total tracked finances without double-counting the Monzo investment pot</small></div>
        <div><span>PORTFOLIO</span><strong>${money(m.pf.market)}</strong><small>${m.pf.rows.length} active positions · P/L ${m.pf.pnl>=0?'+':''}${money(m.pf.pnl)}</small></div>
        <div><span>ANNUAL INCOME</span><strong>${money(m.pf.annual)}</strong><small>${money(m.pf.monthly)} monthly average</small></div>
        <div><span>ISA ALLOWANCE LEFT</span><strong>${money(m.is.left)}</strong><small>${money(m.is.used)} of ${money(m.is.annual)} used</small></div>
      </section>

      <section class="department-section">
        <div class="section-heading"><div><p class="eyebrow">FINANCE SNAPSHOT</p><h2>Cash, pots and long-term assets</h2></div><p>Current browser + Aurora state</p></div>
        <div class="match-report-grid">
          <article><span>ALL POTS</span><strong>${money(m.ps.total)}</strong><small>${m.ps.rows.length} active pots</small></article>
          <article><span>EMERGENCY POT</span><strong>${money(m.ps.emergency)}</strong><small>Monzo Cash ISA emergency balance</small></article>
          <article><span>HOUSE FUND</span><strong>${money(m.ps.house)}</strong><small>Current renovation cash</small></article>
          <article><span>MONZO INVESTMENTS</span><strong>${money(m.ex.monzo)}</strong><small>Invested ${money(m.ex.monzoInvested)}</small></article>
          <article><span>TESCO</span><strong>${money(m.ex.tesco)}</strong><small>Current value using saved share-price snapshot</small></article>
          <article><span>BROKER CASH</span><strong>${money(m.bc.total||m.ex.brokerCash)}</strong><small>IG ${money(m.bc.IG)} · T212 ${money(m.bc.T212)}</small></article>
        </div>
      </section>

      <section class="department-section">
        <div class="section-heading"><div><p class="eyebrow">PAYDAY CHAIN</p><h2>Current mission status</h2></div><p>${esc(missionStatus)}</p></div>
        <div class="match-report-grid">
          <article><span>FINANCE MISSION</span><strong>${missionStatus}</strong><small>${m.rt.mission?money(m.rt.mission.budget):'No live mission'}</small></article>
          <article><span>TRANSFER ROUTE</span><strong>${routeStatus}</strong><small>${m.rt.allocations.length} funded leg${m.rt.allocations.length===1?'':'s'}</small></article>
          <article><span>REGISTRATION</span><strong>${m.rt.receipts.length}</strong><small>confirmed receipt${m.rt.receipts.length===1?'':'s'} for current mission</small></article>
          <article><span>SQUAD REFRESH</span><strong>${state.squad?.importedAt?'LIVE':'CHECK'}</strong><small>${fmtDate(state.squad?.importedAt)}</small></article>
        </div>
      </section>

      <section class="department-section">
        <div class="section-heading"><div><p class="eyebrow">RECENT EXECUTION</p><h2>Latest confirmed purchases</h2></div></div>
        <div class="match-report-list">${recentReceipts(state)}</div>
      </section>`;
    const saved=read(SNAPSHOT_KEY);
    const meta=$('matchReportMeta');if(meta)meta.textContent=saved?.builtAt?`Last report snapshot: ${fmtDate(saved.builtAt)}`:'No saved report snapshot yet.';
    const summary=$('matchSummary');if(summary)summary.textContent=`Portfolio ${money(m.pf.market)} · Annual income ${money(m.pf.annual)} · ISA left ${money(m.is.left)} · Total tracked finances ${money(m.grand)}.`;
  }

  function recentReceipts(state){
    const rows=[...arr(state?.registration?.receipts)].sort((a,b)=>new Date(b.confirmedAt||0)-new Date(a.confirmedAt||0)).slice(0,8);
    if(!rows.length)return'<div class="match-report-empty">No confirmed Registration receipts in the current browser state.</div>';
    return rows.map(r=>`<article><div><strong>${esc(upper(r.ticker))}</strong><small>${esc(r.account||'')} · ${fmtDate(r.confirmedAt)}</small></div><div><strong>${money(r.totalCostGbp)}</strong><small>${num(r.shares).toLocaleString('en-GB',{maximumFractionDigits:6})} shares</small></div></article>`).join('');
  }

  function build(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const state=A.readState(),m=metrics(state);
    const snapshot={builtAt:new Date().toISOString(),portfolioMarket:m.pf.market,annualIncome:m.pf.annual,isaLeft:m.is.left,totalTracked:m.grand,missionStatus:upper(m.rt.mission?.status||'NONE')};
    write(SNAPSHOT_KEY,snapshot);
    try{A.updateState?.(s=>{s.matchReport=s.matchReport||{};s.matchReport.lastBuiltAt=snapshot.builtAt;s.matchReport.summary=`Portfolio ${money(m.pf.market)}; annual income ${money(m.pf.annual)}; ISA left ${money(m.is.left)}; tracked finances ${money(m.grand)}.`;});}catch(_){}
    render();
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return}
    $('buildMatchReport')?.addEventListener('click',build);
    window.addEventListener('aurora-clean:state',render);
    window.addEventListener('pageshow',render);
    render();
    window.AuroraMatchReportCommand=Object.freeze({BUILD,render,build,metrics});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();