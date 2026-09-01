(() => {
  'use strict';

  const BUILD='20260901-chairman-snapshot-ui-2-actions';
  const POLL_MS=30000;
  let busy=false;
  let snapshot=null;

  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0));
  const pct=v=>`${Number(v||0)>=0?'+':''}${Number(v||0).toFixed(2)}%`;
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const accountCode=v=>{const s=upper(v);if(s.includes('212'))return'T212';if(s==='IG'||s.includes('IG ISA'))return'IG';return s};
  const keyFor=r=>String(r?.id||r?.offerId||`${accountCode(r?.account)}|${upper(r?.ticker)}`);

  function decisionFor(r){
    const state=window.AuroraClean?.readState?.();
    const rows=Array.isArray(state?.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[];
    const key=keyFor(r);
    return rows.find(o=>String(o.backendReviewKey||o.id||'')===key)||null;
  }

  function replacementLabel(r){
    const x=r?.replacement&&typeof r.replacement==='object'?r.replacement:{};
    const tk=upper(x.ticker||r?.replacementTicker||r?.candidateTicker||'');
    if(tk)return tk;
    return String(r.replacementStatus||'NOT_EVALUATED').replaceAll('_',' ');
  }

  function actionHtml(r){
    const key=keyFor(r),d=decisionFor(r),status=upper(d?.status||d?.settlementStatus||'');
    if(['ACCEPTED','READY_FOR_REGISTRATION','EXECUTING','READY_TO_SETTLE','COMPLETE'].includes(status)){
      const label=status==='COMPLETE'?'COMPLETED':'ACCEPTED · REGISTRATION';
      return `<div class="chairman-actions"><span class="stage-badge">${label}</span><a class="chairman-link" href="registration.html">Open Registration</a></div>`;
    }
    if(status==='WITHDRAWN')return '<div class="chairman-actions"><span class="stage-badge">WITHDRAWN</span></div>';
    return `<div class="chairman-actions"><button type="button" class="finance-primary" data-chairman-accept="${esc(key)}" ${r.executable?'':'disabled'}>${r.executable?'Accept Offer':'Awaiting Replacement'}</button><button type="button" data-chairman-withdraw="${esc(key)}">Withdraw</button></div>`;
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

    if(!rows.length){
      root.innerHTML='<p>No open Chairman reviews right now.</p>';
      return;
    }

    root.innerHTML=rows.map(r=>`<article class="chairman-review-row chairman-review-action-row">
      <div><span class="stage-badge">${esc(r.tier||'REVIEW')}</span><strong>${esc(r.ticker)} · ${esc(r.name)}</strong><small>${esc(r.account)}</small></div>
      <div><span>Capital return</span><strong>${pct(r.gainPct)}</strong><small>${money(r.profitLossGbp)} profit</small></div>
      <div><span>Position value</span><strong>${money(r.marketValueGbp)}</strong><small>${Number(r.shares||0).toLocaleString('en-GB')} shares</small></div>
      <div><span>Annual income</span><strong>${money(r.annualIncomeGbp)}</strong><small>${pct(r.dayChangePct)} today</small></div>
      <div><span>Replacement</span><strong>${esc(replacementLabel(r))}</strong><small>${r.executable?'Backend approved for decision':'Replacement review still in progress'}</small>${actionHtml(r)}</div>
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
      snapshot=result;
      render();
      window.dispatchEvent(new CustomEvent('aurora:chairman-snapshot',{detail:{reason,result}}));
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
    window.addEventListener('aurora-clean:state',render);
    window.addEventListener('aurora:chairman-decision',render);
    const timer=setInterval(()=>refresh('interval'),POLL_MS);
    window.AuroraChairmanSnapshot=Object.freeze({BUILD,refresh,render,getSnapshot:()=>snapshot,timer,keyFor});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
