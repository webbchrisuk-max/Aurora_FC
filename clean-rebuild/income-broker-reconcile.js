(() => {
  'use strict';

  const BUILD='20260829-income-broker-reconcile-1';
  const CASH_CACHE_KEY='aurora-clean:broker-cash-snapshot:v1';
  const RECON_KEY='aurora-clean:broker-cash-reconciliation:v1';
  const T212_RATE_DEFAULT=3.8;
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const read=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}};
  const accountLabel=code=>code==='IG'?'IG ISA':'Trading 212 ISA';

  function cashSnapshot(){return read(CASH_CACHE_KEY)?.snapshot||null;}
  function recordedBalance(account){return num(cashSnapshot()?.balances?.[account]);}
  function reconciliation(){return read(RECON_KEY)||{};}
  function savedFor(account){return reconciliation()?.[account]||null;}

  function ensureStyles(){
    if(document.getElementById('incomeBrokerReconcileStyles'))return;
    const style=document.createElement('style');
    style.id='incomeBrokerReconcileStyles';
    style.textContent=`
      .broker-reconcile{border:1px solid rgba(80,200,255,.24);background:linear-gradient(145deg,rgba(8,25,42,.96),rgba(6,16,29,.98));}
      .broker-reconcile-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 16px}
      .broker-reconcile-card{padding:15px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}
      .broker-reconcile-card span,.broker-reconcile-card small{display:block}.broker-reconcile-card span{font-size:.72rem;font-weight:900;letter-spacing:.08em;color:#7fa2bd}.broker-reconcile-card strong{display:block;margin:5px 0;font-size:1.3rem}.broker-reconcile-card small{color:#8da1b4}
      .broker-reconcile-form{display:grid;grid-template-columns:1.1fr 1fr 1fr 1fr;gap:12px;align-items:end}
      .broker-reconcile-form label{display:grid;gap:6px;font-weight:800}.broker-reconcile-form input,.broker-reconcile-form select{min-width:0}
      .broker-reconcile-status{margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(245,193,82,.08);border:1px solid rgba(245,193,82,.22)}
      .broker-reconcile-status strong{color:#f2cf7a}.broker-reconcile-status.ok{background:rgba(60,211,153,.08);border-color:rgba(60,211,153,.24)}.broker-reconcile-status.ok strong{color:#82efba}
      .broker-interest-card{border-color:rgba(168,85,247,.28);background:linear-gradient(145deg,rgba(73,38,110,.16),rgba(15,21,38,.94))}
      .broker-reconcile-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
      @media(max-width:1000px){.broker-reconcile-grid{grid-template-columns:1fr 1fr}.broker-reconcile-form{grid-template-columns:1fr 1fr}}
      @media(max-width:640px){.broker-reconcile-grid,.broker-reconcile-form{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensure(){
    let host=$('brokerCashReconcile');
    if(host)return host;
    const anchor=$('dividendSettlement');
    if(!anchor)return null;
    host=document.createElement('section');
    host.id='brokerCashReconcile';
    host.className='department-section broker-reconcile';
    anchor.insertAdjacentElement('afterend',host);
    return host;
  }

  function selectedAccount(){return $('brokerReconAccount')?.value==='IG'?'IG':'T212';}
  function actualInput(){return Math.max(0,num($('brokerReconActual')?.value));}
  function rateInput(){return Math.max(0,num($('brokerReconRate')?.value));}

  function calcInterest(balance,rate){
    const annual=balance*(rate/100);
    return {annual,daily:annual/365,monthly:annual/12};
  }

  function render(){
    ensureStyles();
    const host=ensure();if(!host)return;
    const account=selectedAccount()||'T212';
    const recorded=recordedBalance(account);
    const saved=savedFor(account);
    const actual=saved?num(saved.actualBalanceGbp):recorded;
    const rate=saved&&Number.isFinite(num(saved.interestRatePct))?num(saved.interestRatePct):(account==='T212'?T212_RATE_DEFAULT:0);
    const diff=actual-recorded;
    const interest=calcInterest(actual,rate);
    const savedAt=saved?.observedAt?new Date(saved.observedAt):null;
    const status=saved
      ? `<div class="broker-reconcile-status ${Math.abs(diff)<0.005?'ok':''}"><strong>${Math.abs(diff)<0.005?'MATCHED':'PENDING BACKEND RECONCILIATION'}</strong><div>${accountLabel(account)} actual balance ${money(actual)} · AuroraData ledger ${money(recorded)} · adjustment ${diff>=0?'+':''}${money(diff)}${savedAt&&!Number.isNaN(savedAt)?` · observed ${savedAt.toLocaleString('en-GB')}`:''}</div></div>`
      : `<div class="broker-reconcile-status"><strong>NO MANUAL RECONCILIATION SAVED</strong><div>Enter the broker's actual cash balance to compare it with AuroraData.</div></div>`;

    host.innerHTML=`
      <div class="section-heading"><div><p class="eyebrow">BROKER CASH RECONCILIATION</p><h2>Match Aurora to the broker</h2></div><p>Manual evidence never silently rewrites the AuroraData ledger.</p></div>
      <div class="broker-reconcile-grid">
        <article class="broker-reconcile-card"><span>AURORADATA RECORDED</span><strong>${money(recorded)}</strong><small>${accountLabel(account)} ledger balance</small></article>
        <article class="broker-reconcile-card"><span>ACTUAL BROKER BALANCE</span><strong>${money(actual)}</strong><small>${saved?'Manual broker evidence':'No manual evidence saved'}</small></article>
        <article class="broker-reconcile-card"><span>RECONCILIATION DIFFERENCE</span><strong>${diff>=0?'+':''}${money(diff)}</strong><small>Actual minus AuroraData</small></article>
        <article class="broker-reconcile-card broker-interest-card"><span>EST. DAILY CASH INTEREST</span><strong>${money(interest.daily)}</strong><small>${rate.toFixed(2)}% rate · ${money(interest.annual)}/yr estimate</small></article>
      </div>
      <div class="broker-reconcile-form">
        <label>Broker<select id="brokerReconAccount"><option value="T212" ${account==='T212'?'selected':''}>Trading 212 ISA</option><option value="IG" ${account==='IG'?'selected':''}>IG ISA</option></select></label>
        <label>Actual broker balance £<input id="brokerReconActual" type="number" min="0" step="0.01" inputmode="decimal" value="${actual.toFixed(2)}"></label>
        <label>Cash interest rate %<input id="brokerReconRate" type="number" min="0" step="0.01" inputmode="decimal" value="${rate.toFixed(2)}" ${account==='IG'?'disabled':''}></label>
        <label>Evidence date/time<input id="brokerReconObserved" type="datetime-local"></label>
      </div>
      <div class="broker-reconcile-actions"><button id="brokerReconSave" type="button" class="finance-primary">Save Actual Broker Balance</button><button id="brokerReconClear" type="button">Clear Manual Reconciliation</button></div>
      ${status}
      <p><strong>Safety:</strong> this records the broker truth and the exact adjustment required. It does not invent a backend ledger transaction. Until AuroraData exposes a reconciliation write action, Transfer/Registration continue to use the authoritative AuroraData cash ledger.</p>
    `;

    const observed=$('brokerReconObserved');
    if(observed&&!observed.value){
      const d=savedAt&&!Number.isNaN(savedAt)?savedAt:new Date();
      const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
      observed.value=local;
    }

    $('brokerReconAccount')?.addEventListener('change',()=>render());
    $('brokerReconActual')?.addEventListener('input',preview);
    $('brokerReconRate')?.addEventListener('input',preview);
    $('brokerReconSave')?.addEventListener('click',save);
    $('brokerReconClear')?.addEventListener('click',clear);
  }

  function preview(){
    const account=selectedAccount(),recorded=recordedBalance(account),actual=actualInput(),rate=account==='T212'?rateInput():0,diff=actual-recorded,interest=calcInterest(actual,rate);
    const cards=document.querySelectorAll('#brokerCashReconcile .broker-reconcile-card strong');
    if(cards[1])cards[1].textContent=money(actual);
    if(cards[2])cards[2].textContent=`${diff>=0?'+':''}${money(diff)}`;
    if(cards[3])cards[3].textContent=money(interest.daily);
    const small=document.querySelector('#brokerCashReconcile .broker-interest-card small');if(small)small.textContent=`${rate.toFixed(2)}% rate · ${money(interest.annual)}/yr estimate`;
  }

  function save(){
    const account=selectedAccount(),actual=actualInput(),rate=account==='T212'?rateInput():0;
    if(!Number.isFinite(actual)||actual<0)return;
    const observedRaw=$('brokerReconObserved')?.value||'';
    const observedAt=observedRaw?new Date(observedRaw).toISOString():new Date().toISOString();
    const state=reconciliation();
    state[account]={account,actualBalanceGbp:Number(actual.toFixed(2)),interestRatePct:Number(rate.toFixed(4)),recordedBalanceAtSaveGbp:Number(recordedBalance(account).toFixed(2)),observedAt,savedAt:new Date().toISOString(),status:'PENDING_BACKEND_RECONCILIATION',source:'MANUAL_BROKER_EVIDENCE'};
    write(RECON_KEY,state);
    render();
  }

  function clear(){
    const account=selectedAccount(),state=reconciliation();
    delete state[account];
    write(RECON_KEY,state);
    render();
  }

  function boot(){
    render();
    document.getElementById('refreshBrokerCash')?.addEventListener('click',()=>setTimeout(render,1300));
    window.addEventListener('focus',render);
    window.addEventListener('storage',e=>{if([CASH_CACHE_KEY,RECON_KEY].includes(e.key))render();});
    setInterval(()=>{if(document.visibilityState==='visible')render()},15000);
    window.AuroraBrokerCashReconcile=Object.freeze({BUILD,render,reconciliation,recordedBalance});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
