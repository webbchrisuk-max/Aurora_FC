(() => {
  'use strict';

  const BUILD='20260904-chairman-snapshot-ui-3-replacement-eval';
  const POLL_MS=30000;
  let busy=false;
  let snapshot=null;

  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const pct=v=>`${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const accountCode=v=>{const s=upper(v);if(s.includes('212'))return'T212';if(s==='IG'||s.includes('IG ISA'))return'IG';return s};
  const keyFor=r=>String(r?.id||r?.offerId||`${accountCode(r?.account)}|${upper(r?.ticker)}`);
  const active=s=>!['SOLD','ARCHIVED','CLOSED','EXITED','BLOCKED','REJECTED'].includes(upper(s||'ACTIVE'));

  function decisionFor(r){
    const state=window.AuroraClean?.readState?.();
    const rows=Array.isArray(state?.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[];
    const key=keyFor(r);
    return rows.find(o=>String(o.backendReviewKey||o.id||'')===key)||null;
  }

  function candidateAccount(r){
    return accountCode(r?.lockedAccount||r?.account||r?.broker||r?.preferredBroker||r?.platform||'');
  }

  function candidateRows(state){
    const plan=state?.scouting?.allocationPlan;
    const approved=upper(plan?.status)==='APPROVED'&&Array.isArray(plan?.allocations)?plan.allocations:[];
    const candidates=Array.isArray(state?.scouting?.candidates)?state.scouting.candidates:[];
    const map=new Map();
    [...approved,...candidates].forEach((r,i)=>{
      const ticker=upper(r?.ticker);if(!ticker||!active(r?.status||r?.verdict||r?.signal||'ACTIVE'))return;
      const prev=map.get(ticker)||{};
      map.set(ticker,{...prev,...r,_rank:num(r?.selectionRank)||num(r?.rank)||i+1});
    });
    return [...map.values()];
  }

  function projectedConcentration(state,review,candidate,capital){
    const rows=(state?.squad?.holdings||[]).filter(h=>active(h?.status)&&num(h?.shares)>0);
    const total=rows.reduce((s,h)=>s+Math.max(0,num(h?.marketValueGbp)||num(h?.shares)*num(h?.livePriceGbp)),0);
    if(!(total>0))return 0;
    const tk=upper(candidate?.ticker);
    const existing=rows.filter(h=>upper(h?.ticker)===tk).reduce((s,h)=>s+Math.max(0,num(h?.marketValueGbp)||num(h?.shares)*num(h?.livePriceGbp)),0);
    return ((existing+Math.max(0,num(capital)))/total)*100;
  }

  function evaluateReplacement(review,state){
    const sourceTicker=upper(review?.ticker);
    const sourceAccount=accountCode(review?.account);
    const capital=Math.max(0,num(review?.marketValueGbp));
    const oldIncome=Math.max(0,num(review?.annualIncomeGbp));
    const maxPct=num(state?.transfer?.settings?.maxPositionPct||state?.scouting?.settings?.maxPositionPct||0);
    const rows=candidateRows(state).map(r=>{
      const ticker=upper(r?.ticker),account=candidateAccount(r),yieldPct=Math.max(0,num(r?.yieldPct||r?.dividendYield||r?.yield));
      const expectedAnnualIncome=capital*yieldPct/100;
      const incomeUpliftPct=oldIncome>0?((expectedAnnualIncome/oldIncome)-1)*100:(expectedAnnualIncome>0?100:0);
      const concentrationPct=projectedConcentration(state,review,r,capital);
      const accountOk=!!account&&account===sourceAccount;
      const incomeOk=yieldPct>0&&incomeUpliftPct>=8;
      const concentrationOk=!maxPct||concentrationPct<=maxPct;
      return {...r,ticker,account,yieldPct,expectedAnnualIncome,incomeUpliftPct,concentrationPct,accountOk,incomeOk,concentrationOk};
    }).filter(r=>r.ticker&&r.ticker!==sourceTicker&&r.accountOk&&r.incomeOk&&r.concentrationOk)
      .sort((a,b)=>num(b.expectedAnnualIncome)-num(a.expectedAnnualIncome)||num(b.score)-num(a.score)||num(a._rank)-num(b._rank));

    const best=rows[0];
    if(!best)return {...review,replacementStatus:'NO_BETTER_REPLACEMENT',executable:false,replacement:null,replacementReason:'No same-account Scouting candidate clears the +8% income rule and concentration checks.'};
    return {...review,replacementStatus:'APPROVED',executable:true,replacement:{ticker:best.ticker,name:best.name||best.ticker,account:best.account==='IG'?'IG ISA':'Trading 212 ISA',sector:best.sector||'',price:num(best.livePriceGbp||best.price),yieldPct:best.yieldPct,expectedAnnualIncome:best.expectedAnnualIncome,incomeUpliftPct:best.incomeUpliftPct,concentrationPct:best.concentrationPct,score:num(best.score)}};
  }

  function enrichSnapshot(result){
    const state=window.AuroraClean?.readState?.()||{};
    const reviews=(result.reviews||[]).map(r=>{
      if(r?.replacement&&r?.executable)return r;
      return evaluateReplacement(r,state);
    });
    return {...result,reviews,reviewCount:reviews.length,strongReviewCount:reviews.filter(r=>upper(r.tier)==='STRONG_REVIEW').length,executableCount:reviews.filter(r=>r.executable).length};
  }

  function replacementLabel(r){
    const x=r?.replacement&&typeof r.replacement==='object'?r.replacement:{};
    const tk=upper(x.ticker||r?.replacementTicker||r?.candidateTicker||'');
    if(tk)return tk;
    return String(r.replacementStatus||'NO_BETTER_REPLACEMENT').replaceAll('_',' ');
  }

  function replacementDetail(r){
    if(r.executable&&r.replacement){
      return `${money(r.replacement.expectedAnnualIncome)} projected income · ${pct(r.replacement.incomeUpliftPct)} uplift`;
    }
    return r.replacementReason||'No qualifying replacement found in the current Scouting universe.';
  }

  function actionHtml(r){
    const key=keyFor(r),d=decisionFor(r),status=upper(d?.status||d?.settlementStatus||'');
    if(['ACCEPTED','READY_FOR_REGISTRATION','EXECUTING','READY_TO_SETTLE','COMPLETE'].includes(status)){
      const label=status==='COMPLETE'?'COMPLETED':'ACCEPTED · REGISTRATION';
      return `<div class="chairman-actions"><span class="stage-badge">${label}</span><a class="chairman-link" href="registration.html">Open Registration</a></div>`;
    }
    if(status==='WITHDRAWN')return '<div class="chairman-actions"><span class="stage-badge">WITHDRAWN</span></div>';
    const noReplacement=!r.executable&&upper(r.replacementStatus)==='NO_BETTER_REPLACEMENT';
    return `<div class="chairman-actions"><button type="button" class="finance-primary" data-chairman-accept="${esc(key)}" ${r.executable?'':'disabled'}>${r.executable?'Accept Offer':noReplacement?'No Better Replacement':'Replacement Review'}</button><button type="button" data-chairman-withdraw="${esc(key)}">Withdraw</button></div>`;
  }

  function render(){
    const root=document.getElementById('chairmanSnapshotRows');
    const count=document.getElementById('chairmanSnapshotCount');
    const strong=document.getElementById('chairmanSnapshotStrong');
    const reviews=document.getElementById('chairmanSnapshotReviews');
    const exec=document.getElementById('chairmanSnapshotExecutable');
    const badge=document.getElementById('chairmanSnapshotBadge');
    if(!root)return;

    const rows=Array.isArray(snapshot?.reviews)?snapshot.reviews:[];
    if(count)count.textContent=String(rows.length);
    if(strong)strong.textContent=String(snapshot?.strongReviewCount||0);
    if(reviews)reviews.textContent=String(snapshot?.reviewCount||rows.length);
    if(exec)exec.textContent=String(snapshot?.executableCount||0);
    if(badge)badge.textContent=snapshot?.ok?'BACKEND LIVE':'WAITING FOR BACKEND';

    if(!rows.length){root.innerHTML='<p>No open Chairman reviews right now.</p>';return;}

    root.innerHTML=rows.map(r=>`<article class="chairman-review-row chairman-review-action-row">
      <div><span class="stage-badge">${esc(r.tier||'REVIEW')}</span><strong>${esc(r.ticker)} · ${esc(r.name)}</strong><small>${esc(r.account)}</small></div>
      <div><span>Capital return</span><strong>${pct(r.gainPct)}</strong><small>${money(r.profitLossGbp)} profit</small></div>
      <div><span>Position value</span><strong>${money(r.marketValueGbp)}</strong><small>${num(r.shares).toLocaleString('en-GB')} shares</small></div>
      <div><span>Annual income</span><strong>${money(r.annualIncomeGbp)}</strong><small>${r.dayChangePct==null?'—':pct(r.dayChangePct)} today</small></div>
      <div><span>Replacement</span><strong>${esc(replacementLabel(r))}</strong><small>${esc(replacementDetail(r))}</small>${actionHtml(r)}</div>
    </article>`).join('');
  }

  async function refresh(reason='manual'){
    if(busy)return;
    const client=window.AuroraData2Client;
    if(!client?.jsonp)return;
    busy=true;
    try{
      const result=await client.jsonp('getChairmanOffersSnapshot',{});
      if(!result?.ok||!Array.isArray(result.reviews))throw new Error(result?.message||'Invalid Chairman snapshot');
      snapshot=enrichSnapshot(result);
      render();
      window.dispatchEvent(new CustomEvent('aurora:chairman-snapshot',{detail:{reason,result:snapshot}}));
    }catch(err){
      console.warn('[Aurora Chairman Snapshot]',err);
      snapshot={ok:false,reviews:[],reviewCount:0,strongReviewCount:0,executableCount:0};
      render();
    }finally{busy=false}
  }

  function boot(){
    if(!window.AuroraData2Client){setTimeout(boot,100);return}
    document.getElementById('chairmanSnapshotRefresh')?.addEventListener('click',()=>refresh('button'));
    refresh('startup');
    window.addEventListener('pageshow',()=>refresh('pageshow'));
    window.addEventListener('focus',()=>refresh('focus'));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh('visible')});
    window.addEventListener('aurora-clean:state',()=>{if(snapshot){snapshot=enrichSnapshot(snapshot);render();}});
    window.addEventListener('aurora:chairman-decision',render);
    const timer=setInterval(()=>refresh('interval'),POLL_MS);
    window.AuroraChairmanSnapshot=Object.freeze({BUILD,refresh,render,getSnapshot:()=>snapshot,timer,keyFor,evaluateReplacement,enrichSnapshot});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
