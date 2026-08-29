(() => {
  'use strict';

  const BUILD='20260829-transfer-broker-reconcile-view-1';
  const RECON_KEY='aurora-clean:broker-cash-reconciliation:v1';
  const CASH_CACHE='aurora-clean:transfer-broker-cash:v1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}};

  function recorded(account){
    return num(read(CASH_CACHE)?.snapshot?.balances?.[account]);
  }

  function evidence(account){
    return read(RECON_KEY)?.[account]||null;
  }

  function decorate(account,id){
    const el=$(id);if(!el)return;
    const card=el.closest('.finance-result-card');
    const small=card?.querySelector('small');
    const ledger=recorded(account),saved=evidence(account);
    if(!saved){
      el.textContent=money(ledger);
      if(small)small.textContent=account==='IG'?'Locked to IG purchases':'Locked to Trading 212 purchases';
      return;
    }
    const actual=Math.max(0,num(saved.actualBalanceGbp)),diff=actual-ledger;
    el.textContent=money(actual);
    if(small){
      const sign=diff>=0?'+':'';
      small.textContent=Math.abs(diff)<0.005
        ? `Broker matched · ledger ${money(ledger)}`
        : `Broker actual · ledger ${money(ledger)} · ${sign}${money(diff)} pending reconciliation`;
      small.style.color=Math.abs(diff)<0.005?'':'#f2cf7a';
    }
  }

  function render(){
    decorate('IG','transferCashIG');
    decorate('T212','transferCashT212');
  }

  function boot(){
    render();
    document.getElementById('transferRefreshCash')?.addEventListener('click',()=>setTimeout(render,1400));
    window.addEventListener('aurora-clean:state',()=>setTimeout(render,0));
    window.addEventListener('focus',render);
    window.addEventListener('storage',e=>{if([RECON_KEY,CASH_CACHE].includes(e.key))render();});
    setInterval(()=>{if(document.visibilityState==='visible')render()},3000);
    window.AuroraTransferBrokerReconcileView=Object.freeze({BUILD,render,recorded,evidence});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
