(() => {
  'use strict';

  const BUILD = '20260825-finance-live-readonly-payday-engine-4';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  let blockedWrites = 0;
  let blockedUpdates = 0;
  let runtimeErrors = [];
  let ready = false;

  const money = (value) => new Intl.NumberFormat('en-GB', {
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
  const text=(node,value)=>{if(node)node.textContent=value};
  const q=selector=>document.querySelector(selector);
  const qa=selector=>[...document.querySelectorAll(selector)];

  function nextPaydayDate(value){
    if(!value)return null;
    const date=new Date(`${String(value).slice(0,10)}T12:00:00`);if(Number.isNaN(date.getTime()))return null;
    const today=new Date();today.setHours(12,0,0,0);let guard=0;while(date<today&&guard++<30)date.setDate(date.getDate()+28);return date;
  }
  function humanDate(value){const date=value instanceof Date?value:nextPaydayDate(value);return date?date.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'—'}

  function installReadonlyAuroraFacade(){
    const existing=window.Aurora2||{};
    window.Aurora2={...existing,core:{
      read(){return clone(rawState()||{})},
      write(nextState){blockedWrites++;reportStatus();return clone(nextState||rawState()||{})},
      update(mutator){blockedUpdates++;const candidate=clone(rawState()||{});try{const result=typeof mutator==='function'?mutator(candidate):candidate;reportStatus();return clone(result||candidate)}catch(error){recordError(error);return candidate}}
    },ui:{...(existing.ui||{}),money,escape:escapeHtml,text(id,value){text(document.getElementById(id),value)}}};
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

  function render(){
    if(!ready)return;
    const state=rawState();if(!state?.finance){recordError(new Error('FINANCE_STATE_NOT_FOUND'));return}
    const plan={...(state.finance.plan||{})},control=window.Aurora2?.financePaydayControl;
    if(typeof control?.paydayFundingPreview!=='function'){recordError(new Error('PAYDAY_PREVIEW_API_MISSING'));return}
    let preview;try{preview=control.paydayFundingPreview(state,plan)}catch(error){recordError(error);return}
    const c=preview?.c||{},normalized=c.plan||plan,auto=c.auto||{},hp=holdingPot(state),hpBalance=Math.max(0,Number(hp?.balance)||0),payday=nextPaydayDate(normalized.paydayDate);
    const hero=qa('.aurora-fact-grid > div');text(hero[0]?.querySelector('strong'),money(normalized.openingCash));text(hero[1]?.querySelector('strong'),humanDate(payday));text(hero[2]?.querySelector('strong'),money(c.safeSurplus));text(hero[3]?.querySelector('strong'),money(hpBalance));
    const scores=qa('.finance-scoreboard .finance-score');text(scores[0]?.querySelector('strong'),money(normalized.openingCash));text(scores[1]?.querySelector('strong'),money(normalized.wagesReceived));text(scores[1]?.querySelector('span'),`Expected ${money(normalized.expectedWages)}`);text(scores[2]?.querySelector('strong'),money(c.commitments));text(scores[3]?.querySelector('strong'),money(normalized.protectedCash));text(scores[4]?.querySelector('strong'),money(c.safeSurplus));
    const forecast=qa('.finance-legacy-forecast-list > div'),wageDifference=Number(normalized.wageDifference||0),wageExtra=Math.max(0,wageDifference),wageShortfall=Math.max(0,-wageDifference);
    text(forecast[0]?.querySelector('strong'),money(normalized.expectedWages));text(forecast[1]?.querySelector('strong'),money(normalized.wagesReceived));text(forecast[2]?.querySelector('strong'),wageDifference>=0?money(wageExtra):`− ${money(wageShortfall)}`);text(forecast[3]?.querySelector('strong'),money(c.totalCash));text(forecast[4]?.querySelector('strong'),`− ${money(auto.billsDue)}`);text(forecast[5]?.querySelector('strong'),`− ${money(auto.annualHoldingContribution)}`);text(forecast[6]?.querySelector('strong'),`− ${money(auto.holdingTopUp)}`);text(forecast[7]?.querySelector('strong'),`− ${money(auto.potsDue)}`);text(forecast[8]?.querySelector('strong'),`− ${money(normalized.otherPlanned)}`);text(forecast[9]?.querySelector('strong'),`− ${money(normalized.protectedCash)}`);text(forecast[10]?.querySelector('strong'),money(c.safeSurplus));
    const inputs=qa('#paydayPanel .finance-field-grid .field input');
    if(inputs[0])inputs[0].value=String(normalized.paydayDate||'');if(inputs[1])inputs[1].value=Number(normalized.openingCash||0).toFixed(2);if(inputs[2])inputs[2].value=Number(normalized.expectedWages||0).toFixed(2);if(inputs[3])inputs[3].value=Number(normalized.wagesReceived||0).toFixed(2);if(inputs[4])inputs[4].value=Number(normalized.extraCash||0).toFixed(2);if(inputs[5])inputs[5].value=Number(normalized.protectedCash||0).toFixed(2);if(inputs[6])inputs[6].value=Number(normalized.releaseAmount||0).toFixed(2);
    const mission=state.mission,missionAmount=Math.max(0,Number(mission?.approvedBudget)||0);text(q('.mission-panel .mission-amount'),money(missionAmount));text(q('.mission-panel .mission-status'),mission?String(mission.status||'MISSION').replaceAll('_',' '):'NO ACTIVE MISSION');text(q('.mission-panel p'),mission?`${mission.id||'Mission'}${mission.paydayDate?` • released payday ${mission.paydayDate}`:''}`:'No released mission is active.');
    const recon=qa('.reconcile-grid > div');text(recon[0]?.querySelector('strong'),money(c.safeSurplus));text(recon[1]?.querySelector('strong'),money(missionAmount));text(recon[1]?.querySelector('span'),mission?String(mission.status||'MISSION').replaceAll('_',' '):'No active mission');const difference=Number((c.safeSurplus-missionAmount).toFixed(2));text(recon[2]?.querySelector('strong'),`${difference<0?'− ':''}${money(Math.abs(difference))}`);text(recon[2]?.querySelector('span'),mission?(Math.abs(difference)<0.005?'Forecast matches released mission':difference>0?'Next forecast is above current mission':'Current mission is above next forecast'):'No released mission to compare');
    text(q('.finance-version-pill'),'LIVE DATA • PAYDAY READY');
    document.documentElement.dataset.financeLiveReadonly='active';
    window.AuroraFinanceLiveReadonly=Object.freeze({build:BUILD,ready:true,blockedWrites,blockedUpdates,runtimeErrors:[...runtimeErrors],values:{openingCash:Number(normalized.openingCash||0),wagesReceived:Number(normalized.wagesReceived||0),commitments:Number(c.commitments||0),protectedCash:Number(normalized.protectedCash||0),safeSurplus:Number(c.safeSurplus||0),holdingPotBalance:hpBalance,holdingSpendBeforePayday:Number(auto.holdingSpendBeforePayday||0),holdingProjectedBalanceAtPayday:Number(auto.holdingProjectedBalanceAtPayday||0),holdingPotTopUp:Number(auto.holdingTopUp||0)}});
    reportStatus();
  }

  function reportStatus(){const note=q('#paydayPanel .finance-panel:last-child p');if(note)note.textContent=runtimeErrors.length?`Finance encountered ${runtimeErrors.length} runtime error${runtimeErrors.length===1?'':'s'}.`:'Payday calculation engine is connected. Edit the fields and save the plan when ready.'}
  function recordError(error){const message=String(error?.message||error||'Unknown error');if(!runtimeErrors.includes(message))runtimeErrors.push(message);console.warn('[Aurora Finance readonly]',message);reportStatus()}

  async function init(){
    try{
      if(!rawState())throw new Error('FINANCE_STATE_NOT_FOUND');
      installReadonlyAuroraFacade();
      await loadIsolated('/Aurora_FC/finance-funding.js?v=20260825-payday-engine-restore-1');
      await loadIsolated('/Aurora_FC/finance.js?v=20260825-payday-engine-next-cycle-1');
      ready=true;render();
      window.addEventListener('pageshow',render);window.addEventListener('focus',render);window.addEventListener('storage',event=>{if(event.key===STATE_KEY||event.key===BACKUP_KEY)render()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render()});
    }catch(error){recordError(error)}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})();