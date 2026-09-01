(() => {
  'use strict';

  const BUILD='20260901-payday-summary-cards-6-emergency-interest';
  const BILL_AUDIT_SRC='finance-bill-audit.js?v=20260901-clean-bill-audit-3-actual-paid-loader';
  const HOUSE_BREAKDOWN_SRC='finance-house-room-breakdown.js?v=20260831-finance-house-room-breakdown-3-fresh-user-rooms';
  const EMERGENCY_INTEREST_SRC='finance-emergency-interest.js?v=20260901-finance-emergency-interest-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));

  function loadBillAudit(){
    if(window.AuroraFinanceBillAudit||[...document.scripts].some(s=>String(s.src||'').includes('finance-bill-audit.js')))return;
    const script=document.createElement('script');script.src=BILL_AUDIT_SRC;script.defer=true;document.head.appendChild(script);
  }

  function loadHouseBreakdown(){
    if(window.AuroraFinanceHouseRoomBreakdown||[...document.scripts].some(s=>String(s.src||'').includes('finance-house-room-breakdown.js')))return;
    const script=document.createElement('script');script.src=HOUSE_BREAKDOWN_SRC;script.defer=true;document.head.appendChild(script);
  }

  function loadEmergencyInterest(){
    if(window.AuroraFinanceEmergencyInterest||[...document.scripts].some(s=>String(s.src||'').includes('finance-emergency-interest.js')))return;
    const script=document.createElement('script');script.src=EMERGENCY_INTEREST_SRC;script.defer=true;document.head.appendChild(script);
  }

  function housePot(state){
    return (state?.finance?.pots||[]).find(p=>!p?.archived&&(String(p.id||'')==='house_fund'||norm(p.name).includes('house')))||null;
  }

  function houseSummary(state){
    const h=state?.finance?.houseProject||{};
    const p=housePot(state)||{};
    const entries=Array.isArray(h.entries)?h.entries:[];
    const reserved=round(entries.filter(e=>e.status==='reserved').reduce((s,e)=>s+num(e.estimated),0));
    const ledgerActual=round(entries.filter(e=>e.status==='paid'||e.status==='historical').reduce((s,e)=>s+num(e.actual),0));
    const spent=round(num(h.openingHistoricalSpend)+ledgerActual);
    const cash=round(p.balance);
    const target=round(p.target||h.target);
    const available=round(Math.max(0,cash-reserved));
    const funded=round(cash+spent);
    const remaining=round(Math.max(0,target-funded));
    return {cash,reserved,available,spent,funded,target,remaining};
  }

  function ensureStyle(){
    if($('financePaydaySummaryStyle'))return;
    const style=document.createElement('style');
    style.id='financePaydaySummaryStyle';
    style.textContent=`
      .payday-pot-summaries{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0 0 16px}
      .payday-pot-summary{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.11);border-radius:22px;padding:18px;background:linear-gradient(145deg,rgba(13,28,47,.96),rgba(5,13,25,.97));box-shadow:0 16px 44px rgba(0,0,0,.28)}
      .payday-pot-summary:before{content:'';position:absolute;left:0;right:0;top:0;height:3px}
      .payday-pot-summary.holding:before{background:linear-gradient(90deg,#22d3ee,#34d399)}
      .payday-pot-summary.house:before{background:linear-gradient(90deg,#f5c152,#22d3ee)}
      .payday-pot-summary-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .payday-pot-summary-head p{margin:0;color:#7f95ad;font-size:10px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}
      .payday-pot-summary-head h3{margin:5px 0 0;font-size:22px;letter-spacing:-.5px}
      .payday-pot-summary-badge{border:1px solid rgba(52,211,153,.28);background:rgba(52,211,153,.09);color:#8af0b9;border-radius:999px;padding:5px 9px;font-size:9px;font-weight:950;letter-spacing:.08em;white-space:nowrap}
      .payday-pot-summary-main{font-size:34px;font-weight:1000;letter-spacing:-1px;color:#eaf7ff;margin:4px 0 14px}
      .payday-pot-summary.holding .payday-pot-summary-main{color:#8ff3fb}
      .payday-pot-summary.house .payday-pot-summary-main{color:#f6d27e}
      .payday-pot-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .payday-pot-summary-stat{border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:10px;background:rgba(255,255,255,.025)}
      .payday-pot-summary-stat span{display:block;color:#7890a8;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .payday-pot-summary-stat strong{display:block;margin-top:4px;font-size:17px;color:#eef8ff}
      @media(max-width:760px){.payday-pot-summaries{grid-template-columns:1fr}.payday-pot-summary{padding:14px}}
    `;
    document.head.appendChild(style);
  }

  function ensureCards(){
    if($('paydayPotSummaries'))return;
    const payday=document.querySelector('main[data-finance-tab="payday"]');
    if(!payday)return;
    const wrap=document.createElement('section');
    wrap.id='paydayPotSummaries';
    wrap.className='payday-pot-summaries';
    wrap.innerHTML=`
      <article class="payday-pot-summary holding">
        <div class="payday-pot-summary-head"><div><p>Protected money</p><h3>Holding Pot</h3></div><span class="payday-pot-summary-badge">LIVE</span></div>
        <div class="payday-pot-summary-main" id="paydayHoldingBalance">£0.00</div>
        <div class="payday-pot-summary-grid">
          <div class="payday-pot-summary-stat"><span>Next-cycle requirement</span><strong id="paydayHoldingRequirement">£0.00</strong></div>
          <div class="payday-pot-summary-stat"><span>Projected payday balance</span><strong id="paydayHoldingProjected">£0.00</strong></div>
          <div class="payday-pot-summary-stat"><span>Base contribution</span><strong id="paydayHoldingBase">£0.00</strong></div>
          <div class="payday-pot-summary-stat"><span>Safety top-up</span><strong id="paydayHoldingTopup">£0.00</strong></div>
        </div>
      </article>
      <article class="payday-pot-summary house">
        <div class="payday-pot-summary-head"><div><p>Renovation money</p><h3>House Fund</h3></div><span class="payday-pot-summary-badge">LIVE</span></div>
        <div class="payday-pot-summary-main" id="paydayHouseCash">£0.00</div>
        <div class="payday-pot-summary-grid">
          <div class="payday-pot-summary-stat"><span>Reserved</span><strong id="paydayHouseReserved">£0.00</strong></div>
          <div class="payday-pot-summary-stat"><span>Available after costs</span><strong id="paydayHouseAvailable">£0.00</strong></div>
          <div class="payday-pot-summary-stat"><span>Actual spent</span><strong id="paydayHouseSpent">£0.00</strong></div>
          <div class="payday-pot-summary-stat"><span>Remaining to fund</span><strong id="paydayHouseRemaining">£0.00</strong></div>
        </div>
      </article>`;
    payday.insertBefore(wrap,payday.firstElementChild);
  }

  function render(){
    const A=window.AuroraClean;
    if(!A?.readState)return;
    ensureStyle();ensureCards();
    const state=A.readState();
    const h=state.finance?.stage3HoldingPot||{};
    const house=houseSummary(state);
    const set=(id,v)=>{const el=$(id);if(el)el.textContent=money(v)};
    set('paydayHoldingBalance',h.currentBalance??state.finance?.holdingPotBalance);
    set('paydayHoldingRequirement',h.cycleRequired);
    set('paydayHoldingProjected',h.projectedPaydayBalance);
    set('paydayHoldingBase',h.baseContribution);
    set('paydayHoldingTopup',h.safetyTopUp);
    set('paydayHouseCash',house.cash);
    set('paydayHouseReserved',house.reserved);
    set('paydayHouseAvailable',house.available);
    set('paydayHouseSpent',house.spent);
    set('paydayHouseRemaining',house.remaining);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return}
    loadBillAudit();
    loadHouseBreakdown();
    render();
    loadEmergencyInterest();
    window.addEventListener('aurora-clean:state',render);
    window.addEventListener('pageshow',render);
    window.AuroraFinancePaydaySummaries=Object.freeze({BUILD,render});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();