(() => {
  'use strict';

  const BUILD='20260829-income-broker-reconcile-2-backend-write';
  const CASH_CACHE_KEY='aurora-clean:broker-cash-snapshot:v1';
  const RECON_KEY='aurora-clean:broker-cash-reconciliation:v1';
  const T212_RATE_DEFAULT=3.8;
  const EPS=0.005;
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(num(v).toFixed(2));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const dailyMoney=v=>`£${num(v).toFixed(5)}`;
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}};
  const accountLabel=code=>code==='IG'?'IG ISA':'Trading 212 ISA';
  let busy=false;

  function cashSnapshot(){return read(CASH_CACHE_KEY)?.snapshot||null;}
  function recordedBalance(account){return num(cashSnapshot()?.balances?.[account]);}
  function reconciliation(){return read(RECON_KEY)||{};}
  function savedFor(account){return reconciliation()?.[account]||null;}
  function setSaved(account,row){const state=reconciliation();state[account]=row;write(RECON_KEY,state);return row;}

  function ensureStyles(){
    if(document.getElementById('incomeBrokerReconcileStyles'))return;
    const style=document.createElement('style');
    style.id='incomeBrokerReconcileStyles';
    style.textContent=`
      .broker-reconcile{border:1px solid rgba(80,200,255,.24);background:linear-gradient(145deg,rgba(8,25,42,.96),rgba(6,16,29,.98))}
      .broker-reconcile-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 16px}
      .broker-reconcile-card{padding:15px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}
      .broker-reconcile-card span,.broker-reconcile-card small{display:block}.broker-reconcile-card span{font-size:.72rem;font-weight:900;letter-spacing:.08em;color:#7fa2bd}.broker-reconcile-card strong{display:block;margin:5px 0;font-size:1.3rem}.broker-reconcile-card small{color:#8da1b4}
      .broker-reconcile-form{display:grid;grid-template-columns:1.1fr 1fr 1fr 1fr;gap:12px;align-items:end}
      .broker-reconcile-form label{display:grid;gap:6px;font-weight:800}.broker-reconcile-form input,.broker-reconcile-form select{min-width:0}
      .broker-reconcile-status{margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(245,193,82,.08);border:1px solid rgba(245,193,82,.22)}
      .broker-reconcile-status strong{color:#f2cf7a}.broker-reconcile-status.ok{background:rgba(60,211,153,.08);border-color:rgba(60,211,153,.24)}.broker-reconcile-status.ok strong{color:#82efba}
      .broker-reconcile-status.error{background:rgba(255,92,118,.08);border-color:rgba(255,92,118,.24)}.broker-reconcile-status.error strong{color:#ff9aab}
      .broker-interest-card{border-color:rgba(168,85,247,.28);background:linear-gradient(145deg,rgba(73,38,110,.16),rgba(15,21,38,.94))}
      .broker-reconcile-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
      @media(max-width:1000px){.broker-reconcile-grid{grid-template-columns:1fr 1fr}.broker-reconcile-form{grid-template-columns:1fr 1fr}}
      @media(max-width:640px){.broker-reconcile-grid,.broker-reconcile-form{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensure(){
    let host=$('brokerCashReconcile');if(host)return host;
    const anchor=$('dividendSettlement');if(!anchor)return null;
    host=document.createElement('section');host.id='brokerCashReconcile';host.className='department-section broker-reconcile';anchor.insertAdjacentElement('afterend',host);return host;
  }

  function selectedAccount(){return $('brokerReconAccount')?.value==='IG'?'IG':'T212';}
  function actualInput(){return Math.max(0,num($('brokerReconActual')?.value));}
  function rateInput(){return Math.max(0,num($('brokerReconRate')?.value));}
  function calcInterest(balance,rate){const annual=balance*(rate/100);return{annual,daily:annual/365,monthly:annual/12};}

  async function refreshBackendCash(){
    const client=window.AuroraData2Client;
    if(!client?.post)throw new Error('AuroraData 2 client unavailable');
    const snapshot=await client.post('brokerCashSnapshot',{});
    if(!snapshot?.balances)throw new Error('Incomplete broker cash snapshot');
    write(CASH_CACHE_KEY,{savedAt:new Date().toISOString(),snapshot});
    return snapshot;
  }

  function render(){
    ensureStyles();const host=ensure();if(!host)return;
    const account=selectedAccount()||'T212',recorded=recordedBalance(account),saved=savedFor(account);
    const actual=saved?num(saved.actualBalanceGbp):recorded;
    const rate=saved&&Number.isFinite(num(saved.interestRatePct))?num(saved.interestRatePct):(account==='T212'?T212_RATE_DEFAULT:0);
    const diff=round(actual-recorded),interest=calcInterest(actual,rate),savedAt=saved?.observedAt?new Date(saved.observedAt):null;
    const matched=Math.abs(diff)<EPS;
    let status='';
    if(saved){
      const cls=saved.status==='ERROR'?'error':matched?'ok':'';
      const title=saved.status==='ERROR'?'RECONCILIATION WRITE FAILED':matched?'MATCHED':'PENDING BACKEND RECONCILIATION';
      status=`<div class="broker-reconcile-status ${cls}"><strong>${title}</strong><div>${accountLabel(account)} actual balance ${money(actual)} · AuroraData ledger ${money(recorded)} · adjustment ${diff>=0?'+':''}${money(diff)}${savedAt&&!Number.isNaN(savedAt)?` · observed ${savedAt.toLocaleString('en-GB')}`:''}${saved?.lastError?` · ${String(saved.lastError)}`:''}</div></div>`;
    }else status='<div class="broker-reconcile-status"><strong>NO MANUAL RECONCILIATION SAVED</strong><div>Enter the broker actual cash balance to compare it with AuroraData.</div></div>';

    host.innerHTML=`
      <div class="section-heading"><div><p class="eyebrow">BROKER CASH RECONCILIATION</p><h2>Match Aurora to the broker</h2></div><p>Broker evidence is reconciled through an audited AuroraData cash adjustment.</p></div>
      <div class="broker-reconcile-grid">
        <article class="broker-reconcile-card"><span>AURORADATA RECORDED</span><strong>${money(recorded)}</strong><small>${accountLabel(account)} ledger balance</small></article>
        <article class="broker-reconcile-card"><span>ACTUAL BROKER BALANCE</span><strong>${money(actual)}</strong><small>${saved?'Manual broker evidence':'No manual evidence saved'}</small></article>
        <article class="broker-reconcile-card"><span>RECONCILIATION DIFFERENCE</span><strong>${diff>=0?'+':''}${money(diff)}</strong><small>Actual minus AuroraData</small></article>
        <article class="broker-reconcile-card broker-interest-card"><span>EST. DAILY CASH INTEREST</span><strong>${dailyMoney(interest.daily)}</strong><small>${rate.toFixed(2)}% rate · ${money(interest.annual)}/yr estimate</small></article>
      </div>
      <div class="broker-reconcile-form">
        <label>Broker<select id="brokerReconAccount"><option value="T212" ${account==='T212'?'selected':''}>Trading 212 ISA</option><option value="IG" ${account==='IG'?'selected':''}>IG ISA</option></select></label>
        <label>Actual broker balance £<input id="brokerReconActual" type="number" min="0" step="0.01" inputmode="decimal" value="${actual.toFixed(2)}"></label>
        <label>Cash interest rate %<input id="brokerReconRate" type="number" min="0" step="0.01" inputmode="decimal" value="${rate.toFixed(2)}" ${account==='IG'?'disabled':''}></label>
        <label>Evidence date/time<input id="brokerReconObserved" type="datetime-local"></label>
      </div>
      <div class="broker-reconcile-actions"><button id="brokerReconSave" type="button" class="finance-primary" ${busy?'disabled':''}>${busy?'Reconciling…':'Save & Reconcile Broker Balance'}</button><button id="brokerReconClear" type="button" ${busy?'disabled':''}>Clear Manual Reconciliation</button></div>
      ${status}
      <p><strong>Safety:</strong> Aurora writes only the exact difference between the latest backend balance and the broker balance. The adjustment uses a deterministic reference, then Aurora refreshes the ledger and confirms the result before showing MATCHED.</p>
    `;

    const observed=$('brokerReconObserved');if(observed&&!observed.value){const d=savedAt&&!Number.isNaN(savedAt)?savedAt:new Date();observed.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
    $('brokerReconAccount')?.addEventListener('change',render);$('brokerReconActual')?.addEventListener('input',preview);$('brokerReconRate')?.addEventListener('input',preview);$('brokerReconSave')?.addEventListener('click',save);$('brokerReconClear')?.addEventListener('click',clear);
  }

  function preview(){
    const account=selectedAccount(),recorded=recordedBalance(account),actual=actualInput(),rate=account==='T212'?rateInput():0,diff=round(actual-recorded),interest=calcInterest(actual,rate);
    const cards=document.querySelectorAll('#brokerCashReconcile .broker-reconcile-card strong');if(cards[1])cards[1].textContent=money(actual);if(cards[2])cards[2].textContent=`${diff>=0?'+':''}${money(diff)}`;if(cards[3])cards[3].textContent=dailyMoney(interest.daily);
    const small=document.querySelector('#brokerCashReconcile .broker-interest-card small');if(small)small.textContent=`${rate.toFixed(2)}% rate · ${money(interest.annual)}/yr estimate`;
  }

  async function save(){
    if(busy)return;
    const account=selectedAccount(),actual=round(actualInput()),rate=account==='T212'?rateInput():0;if(!Number.isFinite(actual)||actual<0)return;
    const observedRaw=$('brokerReconObserved')?.value||'',observedAt=observedRaw?new Date(observedRaw).toISOString():new Date().toISOString();
    busy=true;render();
    try{
      const latest=await refreshBackendCash();
      const before=round(latest?.balances?.[account]),diff=round(actual-before);
      const reference=`RECON:${account}:${actual.toFixed(2)}:FROM:${before.toFixed(2)}`;
      let row={account,actualBalanceGbp:actual,interestRatePct:Number(rate.toFixed(4)),recordedBalanceAtSaveGbp:before,observedAt,savedAt:new Date().toISOString(),status:Math.abs(diff)<EPS?'MATCHED':'PENDING_BACKEND_RECONCILIATION',source:'MANUAL_BROKER_EVIDENCE',reference,lastError:''};
      setSaved(account,row);
      if(Math.abs(diff)>=EPS){
        await window.AuroraData2Client.post('adjustBrokerCash',{account,changeGbp:diff,reference,note:`Broker cash reconciliation · ${accountLabel(account)} · broker actual ${money(actual)} · backend before ${money(before)} · observed ${observedAt}`});
      }
      const confirmed=await refreshBackendCash(),after=round(confirmed?.balances?.[account]),remaining=round(actual-after);
      row={...row,backendBalanceAfterGbp:after,confirmedAt:new Date().toISOString(),status:Math.abs(remaining)<EPS?'MATCHED':'PENDING_BACKEND_RECONCILIATION'};setSaved(account,row);
      window.dispatchEvent(new CustomEvent('aurora:broker-cash-reconciled',{detail:{account,actualBalanceGbp:actual,backendBalanceGbp:after,status:row.status,reference}}));
      document.getElementById('refreshBrokerCash')?.click();
    }catch(error){
      const prev=savedFor(account)||{};setSaved(account,{...prev,account,actualBalanceGbp:actual,interestRatePct:Number(rate.toFixed(4)),observedAt,savedFor:prev.savedAt||new Date().toISOString(),status:'ERROR',lastError:String(error?.message||error)});
    }finally{busy=false;render();}
  }

  function clear(){if(busy)return;const account=selectedAccount(),state=reconciliation();delete state[account];write(RECON_KEY,state);render();}

  function boot(){
    render();document.getElementById('refreshBrokerCash')?.addEventListener('click',()=>setTimeout(render,1300));window.addEventListener('focus',render);window.addEventListener('storage',e=>{if([CASH_CACHE_KEY,RECON_KEY].includes(e.key))render();});window.addEventListener('aurora:broker-cash-reconciled',()=>setTimeout(render,0));setInterval(()=>{if(document.visibilityState==='visible')render()},15000);
    window.AuroraBrokerCashReconcile=Object.freeze({BUILD,render,reconciliation,recordedBalance,refreshBackendCash});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
