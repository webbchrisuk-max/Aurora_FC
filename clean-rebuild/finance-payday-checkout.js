(() => {
  'use strict';

  const BUILD='20260923-payday-checkout-2-tiered-scouting';
  const DEPENDENCIES=[
    ['AuroraData2Client','aurora-backend-client.js?v=20260910-registration-backend-client-path-fix-1'],
    ['AuroraScoutingUniverse','scouting-universe.js?v=20260910-scouting-universe-2-auroradata2'],
    ['AuroraScoutingMarketWatch','scouting-market-watch.js?v=20260910-scouting-market-watch-3-storage-safe'],
    ['AuroraScoutingEnrichment','scouting-enrichment.js?v=20260923-scouting-enrichment-3-evidence-priority'],
    ['AuroraScoutingNetwork','scouting-network.js?v=20260923-scouting-network-5-ready-tiers'],
    ['AuroraScoutingAllocation','scouting-allocation.js?v=20260923-scouting-allocation-5-tiered-ready'],
    ['AuroraTransferStage2','transfer-stage2.js?v=20260911-transfer-funding-plan-8-locked-authority'],
    ['AuroraTransferBrokerAssign','transfer-broker-assign.js?v=20260911-transfer-broker-assign-4-stable-render']
  ];
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const round=v=>Number(Math.max(0,num(v)).toFixed(2));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let busy=false;

  function brokerCode(value){
    const s=upper(value?.lockedAccount||value?.account||value?.broker||value?.preferredBroker||value?.platform||value);
    if(s.includes('212'))return'T212';
    if(s.includes('IG'))return'IG';
    return'';
  }

  function activeMission(m){
    return !!m&&!['COMPLETE','CANCELLED'].includes(upper(m.status))&&num(m.budget)>0;
  }

  function missionLegs(state){
    const route=state.transfer?.route;
    if(!route)return[];
    return [...(route.allocations||[]),...(route.brokerCashAllocations||[])].filter(r=>num(r.amount)>0);
  }

  function receiptsForMission(state,missionId){
    return (state.registration?.receipts||[]).filter(r=>String(r.missionId||'')===String(missionId||''));
  }

  function ensureStyle(){
    if($('auroraPaydayCheckoutStyles'))return;
    const s=document.createElement('style');
    s.id='auroraPaydayCheckoutStyles';
    s.textContent='.payday-checkout{border:1px solid rgba(80,220,255,.24);border-radius:24px;padding:18px;background:linear-gradient(145deg,rgba(8,28,46,.96),rgba(8,17,31,.96));box-shadow:0 22px 60px rgba(0,0,0,.2)}.payday-checkout-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.payday-checkout-head h2{margin:4px 0}.payday-checkout-badge{padding:7px 11px;border-radius:999px;border:1px solid rgba(103,232,249,.3);color:#9af4ff;font-size:11px;font-weight:900;letter-spacing:.08em}.payday-checkout-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.payday-step{border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:12px;background:rgba(255,255,255,.025)}.payday-step span{display:block;font-size:11px;letter-spacing:.08em;color:#8ea2b8}.payday-step strong{display:block;margin-top:6px}.payday-step.done{border-color:rgba(74,222,128,.3)}.payday-step.ready{border-color:rgba(96,165,250,.35)}.payday-step.warn{border-color:rgba(251,191,36,.3)}.payday-checkout-actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.payday-checkout-actions button,.payday-checkout-actions a{display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:13px;font-weight:900;text-decoration:none}.payday-checkout-primary{background:#176b43!important;border-color:#2a9b65!important;color:#effff7!important}.payday-checkout-secondary{background:rgba(255,255,255,.05);color:#ddecf7;border:1px solid rgba(255,255,255,.12)}.payday-checkout-status{margin:12px 0;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.035);color:#b7c8d9}.payday-checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.payday-checkout-card{border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:15px;background:rgba(255,255,255,.025)}.payday-checkout-card h3{margin:0 0 10px}.payday-checkout-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}.payday-checkout-kpi{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:12px}.payday-checkout-kpi span{display:block;color:#8ea2b8;font-size:11px}.payday-checkout-kpi strong{display:block;margin-top:5px;font-size:20px}.payday-checkout-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.payday-checkout-row{display:grid;grid-template-columns:minmax(70px,.7fr) minmax(110px,1.4fr) minmax(90px,.7fr);gap:10px;align-items:center;padding:10px;border-radius:13px;background:rgba(255,255,255,.035)}.payday-checkout-row small{display:block;color:#8ea2b8;margin-top:3px}.payday-checkout-row .amt{text-align:right;font-weight:900}.payday-broker-box{display:grid;grid-template-columns:1fr 1fr;gap:10px}.payday-broker{border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:14px}.payday-broker span{display:block;color:#8ea2b8;font-size:11px}.payday-broker strong{display:block;font-size:26px;margin-top:5px}.payday-checkout-note{font-size:12px;color:#8ea2b8;line-height:1.5;margin-top:12px}@media(max-width:760px){.payday-checkout-steps{grid-template-columns:1fr 1fr}.payday-checkout-grid,.payday-checkout-kpis,.payday-broker-box{grid-template-columns:1fr}.payday-checkout-row{grid-template-columns:80px 1fr}.payday-checkout-row .amt{grid-column:1/-1;text-align:left}.payday-checkout-actions button,.payday-checkout-actions a{width:100%}}';
    document.head.appendChild(s);
  }

  function ensureHost(){
    let host=$('paydayInvestmentCheckout');
    if(host)return host;
    const payday=document.querySelector('main[data-finance-tab="payday"]');
    if(!payday)return null;
    host=document.createElement('section');
    host.id='paydayInvestmentCheckout';
    host.className='department-section payday-checkout';
    const first=payday.querySelector('.department-section');
    if(first)first.insertAdjacentElement('afterend',host);else payday.prepend(host);
    return host;
  }

  function loadScript(globalName,src){
    if(window[globalName])return Promise.resolve(window[globalName]);
    const found=[...document.scripts].find(s=>String(s.src||'').includes(src.split('?')[0]));
    if(found){
      return new Promise((resolve,reject)=>{
        const start=Date.now();
        const timer=setInterval(()=>{
          if(window[globalName]){clearInterval(timer);resolve(window[globalName]);}
          else if(Date.now()-start>15000){clearInterval(timer);reject(new Error(globalName+' did not become ready.'));}
        },60);
      });
    }
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=src;s.async=false;
      s.onload=()=>{
        const start=Date.now();
        const timer=setInterval(()=>{
          if(window[globalName]){clearInterval(timer);resolve(window[globalName]);}
          else if(Date.now()-start>15000){clearInterval(timer);reject(new Error(globalName+' did not initialise.'));}
        },60);
      };
      s.onerror=()=>reject(new Error('Could not load '+src));
      document.head.appendChild(s);
    });
  }

  async function ensureEngines(){
    for(const [name,src] of DEPENDENCIES)await loadScript(name,src);
  }

  function setStatus(text){
    const el=$('paydayCheckoutStatus');if(el)el.textContent=text;
  }

  async function refreshScouting(){
    setStatus('Refreshing Aurora scouting evidence and payday candidates…');
    await window.AuroraScoutingUniverse?.refresh?.();
    await window.AuroraScoutingMarketWatch?.load?.();
    await window.AuroraScoutingEnrichment?.sweep?.('payday-checkout');
    window.AuroraScoutingAllocation?.refresh?.();
  }

  function autoAssignBrokers(){
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState(),route=state.transfer?.route;
    if(!route||route.locked)return;
    const rows=Array.isArray(route.allocations)?route.allocations:[];
    const running={IG:0,T212:0};
    rows.forEach(r=>{const b=brokerCode(r);if(b)running[b]+=num(r.amount);});
    const holdings=(state.squad?.holdings||[]).filter(h=>num(h.shares)>0&&!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h.status)));
    rows.forEach(r=>{
      if(brokerCode(r))return;
      const same=holdings.filter(h=>upper(h.ticker)===upper(r.ticker));
      const brokers=[...new Set(same.map(h=>brokerCode(h)).filter(Boolean))];
      let chosen='';
      if(brokers.length===1)chosen=brokers[0];
      else chosen=running.IG<=running.T212?'IG':'T212';
      window.AuroraTransferBrokerAssign?.assign?.(r.legId||'',r.ticker||'',chosen);
      running[chosen]+=num(r.amount);
    });
  }

  async function buildPlan(){
    if(busy)return;busy=true;render();
    try{
      const A=window.AuroraClean;if(!A)throw new Error('Aurora Finance is not ready.');
      let state=A.readState(),mission=state.transfer?.mission;
      if(!activeMission(mission)){
        const release=window.AuroraFinanceStage6?.releaseMission?.();
        if(!release?.ok)throw new Error(release?.message||'Finance could not release the investment mission.');
      }
      await ensureEngines();
      await refreshScouting();
      state=A.readState();
      const plan=state.scouting?.allocationPlan;
      if(!plan?.allocations?.length)throw new Error('No buy-ready payday candidates passed Aurora’s current evidence gates.');
      setStatus('Payday plan ready for review.');
    }catch(e){setStatus('Checkout could not build the plan: '+String(e?.message||e));}
    finally{busy=false;render();}
  }

  async function approvePlan(){
    if(busy)return;busy=true;render();
    try{
      await ensureEngines();
      const A=window.AuroraClean;if(!A)throw new Error('Aurora is not ready.');
      let state=A.readState();
      if(upper(state.scouting?.allocationPlan?.status)!=='APPROVED'){
        window.AuroraScoutingAllocation?.approvePlan?.();
      }
      window.AuroraTransferStage2?.buildRoute?.();
      autoAssignBrokers();
      await window.AuroraTransferStage2?.refreshCash?.();
      window.AuroraTransferStage2?.rebuildBrokerCash?.();
      setStatus('Plan approved. Broker routing has been prepared for you.');
    }catch(e){setStatus('Could not prepare broker routing: '+String(e?.message||e));}
    finally{busy=false;render();}
  }

  async function confirmTransfers(){
    if(busy)return;busy=true;render();
    try{
      await ensureEngines();
      const state=window.AuroraClean?.readState?.();
      const route=state?.transfer?.route;
      if(!route?.allocations?.length)throw new Error('Build the broker route first.');
      if(!window.AuroraTransferStage2?.routeBrokerReady?.(route))throw new Error('Every purchase needs a broker before the route can be locked.');
      const ok=window.AuroraTransferStage2?.lockRoute?.();
      if(!ok)throw new Error('The route could not be locked.');
      setStatus('Broker route locked. Use the shopping list below when you buy.');
    }catch(e){setStatus('Could not lock the broker route: '+String(e?.message||e));}
    finally{busy=false;render();}
  }

  function candidateFor(state,ticker){
    return (state.scouting?.candidates||[]).find(r=>upper(r.ticker)===upper(ticker))||null;
  }

  function planRows(state){
    const p=state.scouting?.allocationPlan;
    if(!p?.allocations?.length)return'<li class="payday-checkout-row"><div>—</div><div>No plan built yet.</div><div class="amt">—</div></li>';
    return p.allocations.map(r=>{
      const c=candidateFor(state,r.ticker),price=num(c?.livePriceGbp),approx=price>0?num(r.amount)/price:0;
      const why=[r.tier||'',r.held?'Existing holding':'New opportunity',num(r.networkScore||r.score)>0?'Score '+num(r.networkScore||r.score).toFixed(1):'',num(r.yieldPct)>0?num(r.yieldPct).toFixed(2)+'% yield':'',r.verdict||''].filter(Boolean).join(' · ');
      return '<li class="payday-checkout-row"><div><strong>#'+esc(r.selectionRank||'')+' '+esc(r.ticker)+'</strong><small>'+esc(r.name||'')+'</small></div><div>'+esc(why)+'<small>'+money(r.expectedAnnualIncome)+' projected annual income'+(approx>0?' · ~'+approx.toLocaleString('en-GB',{maximumFractionDigits:4})+' shares at current evidence price':'')+'</small></div><div class="amt">'+money(r.amount)+'</div></li>';
    }).join('');
  }

  function routeRows(state){
    const route=state.transfer?.route;
    const rows=missionLegs(state);
    if(!rows.length)return'<li class="payday-checkout-row"><div>—</div><div>Broker route not prepared yet.</div><div class="amt">—</div></li>';
    return rows.map(r=>{
      const b=brokerCode(r),broker=b==='IG'?'IG ISA':b==='T212'?'Trading 212 ISA':'Broker pending';
      const funding=upper(r.fundingSource)==='BROKER_CASH'?'Existing broker cash':'New payday money';
      return '<li class="payday-checkout-row"><div><strong>'+esc(r.ticker)+'</strong><small>'+esc(broker)+'</small></div><div>'+esc(funding)+'<small>'+money(r.expectedAnnualIncome)+' projected annual income</small></div><div class="amt">'+money(r.amount)+'</div></li>';
    }).join('');
  }

  function render(){
    ensureStyle();
    const host=ensureHost();if(!host||!window.AuroraClean)return;
    const state=window.AuroraClean.readState(),decision=state.finance?.stage5PaydayDecision,mission=state.transfer?.mission,plan=state.scouting?.allocationPlan,route=state.transfer?.route;
    const safe=round(decision?.maximumSafeRelease),missionReady=activeMission(mission),planReady=missionReady&&Array.isArray(plan?.allocations)&&plan.allocations.length>0&&String(plan.missionId||'')===String(mission.id||''),approved=planReady&&upper(plan.status)==='APPROVED',routeReady=approved&&route&&String(route.missionId||'')===String(mission.id||'')&&Array.isArray(route.allocations)&&route.allocations.length>0,locked=routeReady&&route.locked===true;
    const receipts=receiptsForMission(state,mission?.id),legs=missionLegs(state),done=legs.length&&receipts.length>=legs.length;
    const tp=route?.transferPlan||{IG:0,T212:0,total:0,untransferred:0};
    const badge=done?'COMPLETE':locked?'SHOPPING LIST READY':routeReady?'BROKER ROUTE READY':planReady?'PLAN READY':safe>0?'READY TO BUILD':'WAITING FOR FINANCE';
    host.innerHTML=
      '<div class="payday-checkout-head"><div><p class="eyebrow finance-eyebrow">PAYDAY INVESTMENT CHECKOUT</p><h2>One place from free cash to broker shopping list</h2><p>Finance, Scouting and Transfer still do the work underneath. You review the plan here instead of handing money through each department manually.</p></div><span class="payday-checkout-badge">'+esc(badge)+'</span></div>'+
      '<div class="payday-checkout-steps">'+
        '<div class="payday-step '+(safe>0?'done':'warn')+'"><span>1 · FINANCE</span><strong>'+(safe>0?money(safe)+' free':'Waiting')+'</strong></div>'+
        '<div class="payday-step '+(planReady?'done':missionReady?'ready':'warn')+'"><span>2 · SCOUTING</span><strong>'+(planReady?(plan.allocations.length+' picks'):(missionReady?'Ready to scout':'Waiting'))+'</strong></div>'+
        '<div class="payday-step '+(locked?'done':routeReady?'ready':'warn')+'"><span>3 · BROKER ROUTE</span><strong>'+(locked?'Locked':routeReady?'Ready to confirm':'Waiting')+'</strong></div>'+
        '<div class="payday-step '+(done?'done':locked?'ready':'warn')+'"><span>4 · PURCHASES</span><strong>'+(done?'Complete':locked?(receipts.length+'/'+legs.length+' recorded'):'Waiting')+'</strong></div>'+
      '</div>'+
      '<div class="payday-checkout-kpis"><div class="payday-checkout-kpi"><span>SAFE PAYDAY MONEY</span><strong>'+money(safe)+'</strong></div><div class="payday-checkout-kpi"><span>PLAN ALLOCATED</span><strong>'+money(plan?.allocated||0)+'</strong></div><div class="payday-checkout-kpi"><span>PROJECTED EXTRA INCOME</span><strong>'+money(plan?.projectedAnnualIncome||route?.expectedAnnualIncome||0)+'/yr</strong></div></div>'+
      '<div id="paydayCheckoutStatus" class="payday-checkout-status">'+
        (busy?'Aurora is working through the payday chain…':locked?'Route locked. Transfer the displayed amounts, make the listed purchases, then record the real executions.':routeReady?'Review the broker split, transfer the amounts, then confirm the route.':planReady?'Review the proposed allocation, then approve it to prepare the broker route.':safe>0?'Press Build Payday Investment Plan. Aurora will refresh the scouting evidence and create the proposal here.':'Finance must calculate a positive Maximum Safe Release first.')+
      '</div>'+
      '<div class="payday-checkout-actions">'+
        '<button id="paydayCheckoutBuild" class="payday-checkout-primary" '+(busy||safe<=0||planReady?'disabled':'')+'>Build Payday Investment Plan</button>'+
        '<button id="paydayCheckoutApprove" class="payday-checkout-primary" '+(busy||!planReady||routeReady?'disabled':'')+'>Approve Plan & Prepare Brokers</button>'+
        '<button id="paydayCheckoutConfirm" class="payday-checkout-primary" '+(busy||!routeReady||locked?'disabled':'')+'>I Have Transferred · Lock Shopping List</button>'+
        (locked?'<a class="payday-checkout-secondary" href="registration.html">Record Purchases</a>':'<a class="payday-checkout-secondary" href="scouting.html">Advanced Scouting</a>')+
        (routeReady&&!locked?'<a class="payday-checkout-secondary" href="transfer.html">Review / Change Brokers</a>':'')+
      '</div>'+
      '<div class="payday-checkout-grid">'+
        '<article class="payday-checkout-card"><h3>Proposed purchases</h3><ul class="payday-checkout-list">'+planRows(state)+'</ul></article>'+
        '<article class="payday-checkout-card"><h3>Broker transfer summary</h3><div class="payday-broker-box"><div class="payday-broker"><span>TRANSFER TO IG</span><strong>'+money(tp.IG||0)+'</strong></div><div class="payday-broker"><span>TRANSFER TO TRADING 212</span><strong>'+money(tp.T212||0)+'</strong></div></div><p class="payday-checkout-note">Aurora cannot move money or place broker orders itself. The figures above are the prepared route; you remain in control of the actual transfers and purchases.</p><h3>Shopping list</h3><ul class="payday-checkout-list">'+routeRows(state)+'</ul></article>'+
      '</div>'+
      '<p class="payday-checkout-note">The share ranking shown here comes from Aurora’s current saved strategy and evidence gates. Use Advanced Scouting whenever you want to inspect the full evidence before approving a purchase plan.</p>';
    $('paydayCheckoutBuild')?.addEventListener('click',buildPlan);
    $('paydayCheckoutApprove')?.addEventListener('click',approvePlan);
    $('paydayCheckoutConfirm')?.addEventListener('click',confirmTransfers);
  }

  function boot(){
    if(!window.AuroraClean||!window.AuroraFinanceStage6){setTimeout(boot,60);return;}
    render();
    window.addEventListener('aurora-clean:state',()=>setTimeout(render,0));
    window.AuroraPaydayCheckout=Object.freeze({BUILD,render,buildPlan,approvePlan,confirmTransfers,autoAssignBrokers,ensureEngines});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();