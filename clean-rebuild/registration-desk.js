(() => {
  'use strict';
  const BUILD='20260827-registration-command-board-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const shares=v=>num(v).toLocaleString('en-GB',{maximumFractionDigits:6});
  const accountLabel=v=>{const s=upper(v);if(s==='IG'||s.includes('IG ISA'))return'IG ISA';if(s.includes('212'))return'Trading 212 ISA';return String(v||'—')};
  const isCashLeg=leg=>upper(leg?.fundingSource)==='BROKER_CASH';

  function context(){
    const A=window.AuroraClean;if(!A)return null;
    const state=A.readState(),mission=state.transfer?.mission,route=state.transfer?.route;
    if(!mission||!route||route.locked!==true||String(route.missionId||'')!==String(mission.id||''))return{state,mission,route,legs:[],receipts:[]};
    const legs=[...(route.allocations||[]),...(route.brokerCashAllocations||[])].filter(r=>num(r.amount)>0).map((r,i)=>({...r,legId:String(r.legId||r.id||`LEG-${i+1}`)}));
    const receipts=(state.registration?.receipts||[]).filter(r=>String(r.missionId||'')===String(mission.id||''));
    return{state,mission,route,legs,receipts};
  }
  const receiptFor=(ctx,leg)=>ctx.receipts.find(r=>String(r.legId||r.allocationId||'')===String(leg.legId||''));
  const planned=ctx=>ctx.legs.reduce((s,r)=>s+num(r.amount),0);
  const confirmed=ctx=>ctx.receipts.reduce((s,r)=>s+num(r.totalCostGbp),0);
  const expectedIncome=ctx=>ctx.legs.reduce((s,r)=>s+num(r.expectedAnnualIncome),0);
  const confirmedIncome=ctx=>ctx.receipts.reduce((s,r)=>s+num(r.expectedAnnualIncomeGbp),0);

  function ensureHost(){
    let host=$('registrationCommandBoard');if(host)return host;
    const hero=document.querySelector('header.registration-hero');if(!hero)return null;
    host=document.createElement('section');host.id='registrationCommandBoard';host.className='registration-command';hero.insertAdjacentElement('afterend',host);
    document.body.classList.add('registration-command-enhanced');
    return host;
  }

  function statusFor(ctx,leg,rec){
    if(rec?.settledAt||upper(ctx.mission?.status)==='COMPLETE')return['SETTLED','settled'];
    if(rec?.backendConfirmed)return['CONFIRMED','confirmed'];
    const selected=String($('regLeg')?.value||'')===String(leg.legId||'');
    const hasEntry=selected&&num($('regShares')?.value)>0&&num($('regPrice')?.value)>0;
    if(hasEntry)return['ENTERED','entered'];
    return['WAITING','waiting'];
  }

  function render(){
    const host=ensureHost();if(!host)return;
    const ctx=context();
    if(!ctx?.mission||!ctx?.route||!ctx.legs.length){
      host.innerHTML='<div class="registration-command-head"><div><p class="eyebrow">MISSION EXECUTION BOARD</p><h2>Waiting for Transfer</h2><p>No locked purchase route is available yet.</p></div><span class="registration-command-badge wait">WAITING</span></div>';
      return;
    }
    const done=ctx.legs.filter(l=>receiptFor(ctx,l)).length,total=ctx.legs.length,totalPlanned=planned(ctx),actual=confirmed(ctx),variance=actual-totalPlanned,financeActual=ctx.receipts.filter(r=>upper(r.fundingSource||'FINANCE')!=='BROKER_CASH').reduce((s,r)=>s+num(r.totalCostGbp),0),brokerActual=ctx.receipts.filter(r=>upper(r.fundingSource)==='BROKER_CASH').reduce((s,r)=>s+num(r.totalCostGbp),0),income=expectedIncome(ctx),incomeConfirmed=confirmedIncome(ctx),progress=total?Math.round(done/total*100):0,complete=upper(ctx.mission.status)==='COMPLETE',ready=done===total&&!complete;
    const badge=complete?['COMPLETE','complete']:ready?['READY TO SETTLE','ready']:[`${done}/${total} CONFIRMED`,'wait'];
    const rows=ctx.legs.map((leg,i)=>{const rec=receiptFor(ctx,leg),st=statusFor(ctx,leg,rec),diff=rec?num(rec.totalCostGbp)-num(leg.amount):0;return `<tr data-leg-id="${esc(leg.legId)}"><td><span class="ticker">${esc(upper(leg.ticker))}</span><br><small>${esc(leg.name||leg.ticker||'')}</small></td><td>#${i+1}</td><td>${isCashLeg(leg)?`${esc(accountLabel(leg.lockedAccount))} cash`:'Finance'}</td><td>${money(leg.amount)}</td><td>${rec?esc(accountLabel(rec.account)):'—'}</td><td>${rec?shares(rec.shares):'—'}</td><td>${rec?money(rec.totalCostGbp):'—'}</td><td class="${diff>0?'registration-negative':diff<0?'registration-positive':''}">${rec?`${diff>0?'+':''}${money(diff)}`:'—'}</td><td>${money(leg.expectedAnnualIncome||rec?.expectedAnnualIncomeGbp||0)}/yr</td><td><span class="registration-state ${st[1]}">${st[0]}</span></td></tr>`}).join('');
    const next=complete?'Mission settled into Squad.':ready?'Every locked leg has a confirmed receipt. Settlement is ready.':`Confirm ${total-done} remaining broker execution${total-done===1?'':'s'} before settlement.`;
    host.innerHTML=`<div class="registration-command-head"><div><p class="eyebrow">MISSION EXECUTION BOARD</p><h2>Broker reality at a glance</h2><p>Planned Transfer route compared with confirmed execution receipts. Tap a row to select that leg in the execution form.</p></div><span class="registration-command-badge ${badge[1]}">${badge[0]}</span></div><div class="registration-summary-grid"><article class="registration-summary-card"><span>LOCKED ROUTE</span><strong>${total} leg${total===1?'':'s'}</strong><small>${esc(ctx.route.strategy||'Approved route')}</small></article><article class="registration-summary-card"><span>PLANNED CAPITAL</span><strong>${money(totalPlanned)}</strong><small>Finance + broker cash</small></article><article class="registration-summary-card"><span>ACTUAL CONFIRMED</span><strong>${money(actual)}</strong><small>${done}/${total} receipts</small></article><article class="registration-summary-card"><span>MISSION VARIANCE</span><strong class="${variance>0?'registration-negative':variance<0?'registration-positive':''}">${variance>0?'+':''}${money(variance)}</strong><small>actual vs locked route</small></article><article class="registration-summary-card"><span>EXPECTED INCOME</span><strong>${money(income)}/yr</strong><small>${money(income/12)}/month</small></article></div><div class="registration-board-wrap"><table class="registration-board"><thead><tr><th>Holding</th><th>Leg</th><th>Funding</th><th>Planned</th><th>Broker</th><th>Shares</th><th>Actual Cost</th><th>Variance</th><th>Income</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div><div class="registration-settlement"><h3>Settlement Preview</h3><p>What the current confirmed receipts will contribute when Registration settles the mission into Squad.</p><div class="registration-settlement-grid"><div class="registration-settlement-item"><span>FINANCE SPEND</span><strong>${money(financeActual)}</strong></div><div class="registration-settlement-item"><span>BROKER CASH USED</span><strong>${money(brokerActual)}</strong></div><div class="registration-settlement-item"><span>SHARES CONFIRMED</span><strong>${shares(ctx.receipts.reduce((s,r)=>s+num(r.shares),0))}</strong></div><div class="registration-settlement-item"><span>INCOME CONFIRMED</span><strong>${money(incomeConfirmed)}/yr</strong></div></div><div class="registration-progress"><div style="width:${progress}%"></div></div><div class="registration-next-action">${esc(next)}</div></div>`;
    host.querySelectorAll('[data-leg-id]').forEach(row=>row.addEventListener('click',()=>{const select=$('regLeg');if(select){select.value=row.dataset.legId;select.dispatchEvent(new Event('change',{bubbles:true}));select.scrollIntoView({behavior:'smooth',block:'center'});}}));
  }

  function boot(){if(!window.AuroraClean){setTimeout(boot,60);return}render();window.addEventListener('aurora-clean:state',render);['regLeg','regShares','regPrice','regFees','regAccount','regTradeDate'].forEach(id=>$(id)?.addEventListener('input',render));window.AuroraRegistrationDesk=Object.freeze({BUILD,render});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
