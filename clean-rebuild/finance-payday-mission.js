(() => {
  'use strict';

  const BUILD='20260902-payday-mission-breakdown-2-manual-available-cash';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function ensureStyle(){
    if($('financePaydayMissionStyle'))return;
    const style=document.createElement('style');
    style.id='financePaydayMissionStyle';
    style.textContent=`
      .payday-mission-plan{border:1px solid rgba(34,211,238,.24);background:linear-gradient(145deg,rgba(8,25,42,.97),rgba(5,14,26,.98));border-radius:22px;padding:20px;margin:0 0 18px;box-shadow:0 18px 48px rgba(0,0,0,.26)}
      .payday-mission-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.payday-mission-head h2{margin:4px 0 0}.payday-mission-head p{margin:0;color:#91a6ba}.payday-mission-ready{border:1px solid rgba(52,211,153,.28);background:rgba(52,211,153,.08);border-radius:16px;padding:10px 14px;min-width:190px}.payday-mission-ready span{display:block;color:#8db5a6;font-size:10px;font-weight:900;letter-spacing:.08em}.payday-mission-ready strong{display:block;margin-top:4px;font-size:25px;color:#91f4bd}
      .payday-mission-list{display:grid;gap:10px}.payday-mission-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:12px 14px;background:rgba(255,255,255,.025)}.payday-mission-row .step{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.22);font-weight:950;color:#94eff6}.payday-mission-row strong{display:block;font-size:16px}.payday-mission-row small{display:block;color:#8399ad;margin-top:3px}.payday-mission-row .amount{font-size:19px;font-weight:950;white-space:nowrap}.payday-mission-row.release{border-color:rgba(52,211,153,.26);background:rgba(52,211,153,.06)}.payday-mission-row.release .step{background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.25);color:#8df0b8}.payday-mission-row.release .amount{color:#8df0b8}.payday-mission-empty{padding:14px;border-radius:14px;border:1px dashed rgba(255,255,255,.12);color:#93a6b8}.payday-mission-note{margin:12px 0 0;color:#879bae}
      @media(max-width:700px){.payday-mission-head{display:grid}.payday-mission-ready{min-width:0}.payday-mission-row{grid-template-columns:38px minmax(0,1fr)}.payday-mission-row .amount{grid-column:2}}
    `;
    document.head.appendChild(style);
  }

  function paydayMain(){return document.querySelector('main[data-finance-tab="payday"]')}

  function simplifyOldStages(){
    const main=paydayMain();if(!main)return;
    [...main.querySelectorAll(':scope > section')].forEach(section=>{
      const eyebrow=String(section.querySelector('.eyebrow')?.textContent||'').toUpperCase();
      if(/^STAGE [2345]\b/.test(eyebrow)||eyebrow.includes('STAGE 5 AUDIT')||eyebrow.includes('BEFORE PAYDAY'))section.hidden=true;
    });
    const title=$('financeTabTitle');if(title){const h=title.querySelector('h2'),p=title.querySelector('p:last-child');if(h)h.textContent='Payday allocation plan';if(p)p.textContent='Confirm the wage received, then follow the exact moves Aurora calculates.'}
    const stage1=[...main.querySelectorAll(':scope > section')].find(s=>String(s.querySelector('.eyebrow')?.textContent||'').toUpperCase().startsWith('STAGE 1')||String(s.querySelector('.eyebrow')?.textContent||'').toUpperCase().startsWith('PAYDAY MONEY RECEIVED'));
    if(stage1){const eye=stage1.querySelector('.eyebrow'),h=stage1.querySelector('h2'),desc=stage1.querySelector('.section-heading > p');if(eye)eye.textContent='PAYDAY MONEY RECEIVED';if(h)h.textContent='Confirm the money that arrived';if(desc)desc.textContent='Enter the actual wage received and the cash genuinely available on payday. Aurora will rebuild the full allocation from those figures.'}
  }

  function ensurePlan(){
    const main=paydayMain();if(!main)return null;
    let host=$('paydayMissionPlan');if(host)return host;
    host=document.createElement('section');host.id='paydayMissionPlan';host.className='payday-mission-plan';
    const stage6=[...main.querySelectorAll(':scope > section')].find(s=>String(s.querySelector('.eyebrow')?.textContent||'').toUpperCase().startsWith('STAGE 6'));
    if(stage6)main.insertBefore(host,stage6);else main.appendChild(host);
    return host;
  }

  function buildRows(state){
    const f=state.finance||{},h=f.stage3HoldingPot||{},p=f.stage4PotFunding||{},d=f.stage5PaydayDecision||{};
    const rows=[];
    const received=num(f.wagesReceived),available=num(f.availableCash);
    if(received>0)rows.push({name:'Payday received',detail:`Actual wage received ${money(received)} · cash available to allocate ${money(available)}.`,amount:received,type:'info'});
    if(num(d.currentAccountBills)>0)rows.push({name:'Leave for Current Account bills',detail:'Bills due in this payday cycle.',amount:d.currentAccountBills});
    const holdingMove=num(d.baseHoldingContribution)+num(d.holdingSafetyTopUp);
    if(holdingMove>0)rows.push({name:'Move to Holding Pot',detail:`Required ${money(h.dynamicTarget||h.cycleRequired)} · projected after funding ${money(h.afterFunding)}.`,amount:holdingMove});
    (Array.isArray(p.rows)?p.rows:[]).filter(r=>num(r.amount)>0).forEach(r=>rows.push({name:`Move to ${String(r.name||'Pot')}`,detail:String(r.reason||'Payday pot allocation.'),amount:r.amount}));
    if(num(d.protectedCash)>0)rows.push({name:'Leave protected cash untouched',detail:'Cash explicitly reserved outside the payday allocation.',amount:d.protectedCash});
    rows.push({name:'Stage 6 · Mission release',detail:'This is the amount left after every required move above.',amount:num(d.maximumSafeRelease),type:'release'});
    return rows;
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    ensureStyle();simplifyOldStages();const host=ensurePlan();if(!host)return;
    const state=A.readState(),d=state.finance?.stage5PaydayDecision||null,rows=d?buildRows(state):[];
    host.innerHTML=`<div class="payday-mission-head"><div><p class="eyebrow">PAYDAY BREAKDOWN</p><h2>Where your payday money goes</h2><p>Update Cash Truth and Aurora recalculates every required move in order.</p></div><div class="payday-mission-ready"><span>READY FOR STAGE 6</span><strong>${money(d?.maximumSafeRelease||0)}</strong></div></div><div class="payday-mission-list">${rows.length?rows.map((r,i)=>`<div class="payday-mission-row ${r.type==='release'?'release':''}"><div class="step">${i+1}</div><div><strong>${esc(r.name)}</strong><small>${esc(r.detail)}</small></div><div class="amount">${r.type==='info'?'':r.type==='release'?'READY ':''}${money(r.amount)}</div></div>`).join(''):'<div class="payday-mission-empty">Enter the actual wages received and cash available on payday, then press <strong>Update Cash Truth</strong>. Aurora will show the exact Holding Pot, bill, pot and Stage 6 release instructions here.</div>'}</div><p class="payday-mission-note">The detailed Stage 2–5 calculations still run in the background; they are simply hidden from Payday Control so you only see the actions you need to take.</p>`;
  }

  function rebuildFromPay(){
    const E=window.AuroraFinanceEngine;if(!E)return;
    E.commitCashTruth();E.commitBills();E.commitHolding();E.commitPots();E.commitDecision();
    setTimeout(render,0);
  }

  function boot(){
    if(!window.AuroraClean||!window.AuroraFinanceEngine){setTimeout(boot,60);return}
    simplifyOldStages();render();
    $('financeCalculate')?.addEventListener('click',()=>setTimeout(rebuildFromPay,0));
    $('financeUseActualPay')?.addEventListener('click',()=>setTimeout(rebuildFromPay,0));
    window.addEventListener('aurora-clean:state',render);window.addEventListener('pageshow',render);
    window.AuroraFinancePaydayMission=Object.freeze({BUILD,render,rebuildFromPay});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
