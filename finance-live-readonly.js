(() => {
  'use strict';

  const BUILD = '20260826-finance-runtime-data-authority-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  let blockedWrites = 0;
  let blockedUpdates = 0;
  let runtimeErrors = [];
  let ready = false;

  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(Number(value) || 0);
  const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const clone = value => { try { return structuredClone(value); } catch (_) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; } } };

  function rawState(){
    for(const key of [STATE_KEY,BACKUP_KEY]){
      try{const parsed=JSON.parse(localStorage.getItem(key)||'null');if(parsed&&typeof parsed==='object')return parsed}catch(_){}
    }
    return null;
  }

  function installReadonlyAuroraFacade(){
    const existing=window.Aurora2||{};
    window.Aurora2={...existing,core:{
      read(){return clone(rawState()||{})},
      write(nextState){blockedWrites++;refreshSnapshot();return clone(nextState||rawState()||{})},
      update(mutator){blockedUpdates++;const candidate=clone(rawState()||{});try{const result=typeof mutator==='function'?mutator(candidate):candidate;refreshSnapshot();return clone(result||candidate)}catch(error){recordError(error);return candidate}}
    },ui:{...(existing.ui||{}),money,escape:escapeHtml,text(id,value){const node=document.getElementById(id);if(node)node.textContent=value}}};
  }

  function loadIsolated(src){
    return new Promise((resolve,reject)=>{
      const originalDocAdd=document.addEventListener.bind(document),originalWinAdd=window.addEventListener.bind(window),docAdd=document.addEventListener,winAdd=window.addEventListener;
      document.addEventListener=function(type,handler,options){if(type==='DOMContentLoaded')return;return originalDocAdd(type,handler,options)};
      window.addEventListener=function(type,handler,options){if(type==='aurora2:state')return;return originalWinAdd(type,handler,options)};
      const restore=()=>{document.addEventListener=docAdd;window.addEventListener=winAdd};
      const script=document.createElement('script');script.src=src;script.async=false;
      script.addEventListener('load',()=>{restore();resolve()},{once:true});
      script.addEventListener('error',()=>{restore();reject(new Error(`LOAD_FAILED:${src}`))},{once:true});
      document.head.appendChild(script);
    });
  }

  function holdingPot(state){return (state?.finance?.pots||[]).find(p=>!p.archived&&String(p.name||'').trim().toLowerCase()==='holding pot')||null}

  function publish(values={}){
    window.AuroraFinanceLiveReadonly=Object.freeze({
      build:BUILD,ready,mode:'CALCULATION_ONLY',domOwner:false,
      blockedWrites,blockedUpdates,runtimeErrors:[...runtimeErrors],values
    });
    document.documentElement.dataset.financeLiveReadonly=ready?'calculation-only':'starting';
    window.dispatchEvent(new CustomEvent('aurora:finance-runtime-snapshot',{detail:{build:BUILD,ready,values}}));
  }

  function refreshSnapshot(){
    if(!ready){publish();return}
    const state=rawState();if(!state?.finance){recordError(new Error('FINANCE_STATE_NOT_FOUND'));return}
    const plan={...(state.finance.plan||{})},control=window.Aurora2?.financePaydayControl;
    if(typeof control?.paydayFundingPreview!=='function'){recordError(new Error('PAYDAY_PREVIEW_API_MISSING'));return}
    let preview;try{preview=control.paydayFundingPreview(state,plan)}catch(error){recordError(error);return}
    const c=preview?.c||{},normalized=c.plan||plan,auto=c.auto||{},hp=holdingPot(state),hpBalance=Math.max(0,Number(hp?.balance)||0);
    publish({
      openingCash:Number(normalized.openingCash||0),
      wagesReceived:Number(normalized.wagesReceived||0),
      commitments:Number(c.commitments||0),
      protectedCash:Number(normalized.protectedCash||0),
      safeSurplus:Number(c.safeSurplus||0),
      holdingPotBalance:hpBalance,
      holdingSpendBeforePayday:Number(auto.holdingSpendBeforePayday||0),
      holdingProjectedBalanceAtPayday:Number(auto.holdingProjectedBalanceAtPayday||0),
      holdingPotTopUp:Number(auto.holdingTopUp||0),
      rolloverBalance:Number(auto.rolloverBalance||0),
      rolloverContribution:Number(auto.rolloverContribution||0),
      rolloverTarget:Number(auto.rolloverTarget||350)
    });
  }

  function recordError(error){
    const message=String(error?.message||error||'Unknown error');
    if(!runtimeErrors.includes(message))runtimeErrors.push(message);
    console.warn('[Aurora Finance runtime]',message);
    publish(window.AuroraFinanceLiveReadonly?.values||{});
  }

  async function init(){
    try{
      if(!rawState())throw new Error('FINANCE_STATE_NOT_FOUND');
      installReadonlyAuroraFacade();
      await loadIsolated('/Aurora_FC/finance-funding.js?v=20260825-rollover-first-cap-1');
      await loadIsolated('/Aurora_FC/finance.js?v=20260825-payday-engine-rollover-first-1');
      ready=true;refreshSnapshot();
      window.addEventListener('aurora2:state',()=>setTimeout(refreshSnapshot,0));
      window.addEventListener('storage',event=>{if(event.key===STATE_KEY||event.key===BACKUP_KEY)setTimeout(refreshSnapshot,0)});
    }catch(error){recordError(error)}
  }

  publish();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})();