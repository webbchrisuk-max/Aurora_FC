(() => {
  'use strict';

  const BUILD='20260901-chairman-offers-backend-sync-1';
  const SOURCE='INCOMING_OFFERS_BACKEND';
  const DEBOUNCE_MS=900;
  let booted=false;
  let loading=false;
  let saving=false;
  let saveTimer=null;
  let lastSaved='';
  let lastLoaded='';

  const stable = rows => JSON.stringify((rows||[]).map(r=>({
    id:r?.id||'',
    status:r?.status||'',
    updatedAt:r?.updatedAt||'',
    acceptedAt:r?.acceptedAt||'',
    withdrawnAt:r?.withdrawnAt||'',
    targetPrice:r?.targetPrice||0,
    lastLivePrice:r?.lastLivePrice||0,
    shares:r?.shares||0,
    replacementTicker:r?.replacementTicker||''
  })));

  function client(){
    return window.AuroraData2Client || null;
  }

  function currentOffers(){
    const A=window.AuroraClean;
    if(!A?.readState)return[];
    const state=A.readState();
    return Array.isArray(state.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[];
  }

  async function load(){
    if(loading)return;
    const c=client();
    const A=window.AuroraClean;
    if(!c?.jsonp||!A?.updateState)return;
    loading=true;
    try{
      const result=await c.jsonp('listChairmanOffers',{});
      if(!result?.ok||!Array.isArray(result.offers))throw new Error(result?.message||'Invalid Chairman offers response');
      const remote=result.offers;
      const local=currentOffers();

      // First migration: if the backend has no clean rows yet but this browser
      // already has live clean offers, preserve them by uploading rather than
      // replacing local state with an empty list.
      if(!remote.length&&local.length){
        lastLoaded=stable(local);
        await save(local,'initial-migration');
        return;
      }

      const fingerprint=stable(remote);
      lastLoaded=fingerprint;
      lastSaved=fingerprint;
      A.updateState(state=>{
        state.transfer=state.transfer&&typeof state.transfer==='object'?state.transfer:{};
        state.transfer.chairmanOffers=remote;
        state.transfer.chairmanOffersAuthority={
          source:result.source||SOURCE,
          generatedAt:result.generatedAt||new Date().toISOString(),
          count:result.count??remote.length
        };
      });
      window.dispatchEvent(new CustomEvent('aurora:chairman-offers-backend',{detail:{type:'load',result}}));
    }catch(err){
      console.warn('[Aurora Chairman Offers] load failed',err);
    }finally{
      loading=false;
    }
  }

  async function save(rows=currentOffers(),reason='state-change'){
    if(saving)return;
    const c=client();
    if(!c?.post)return;
    const fingerprint=stable(rows);
    if(fingerprint===lastSaved)return;
    saving=true;
    try{
      const result=await c.post('saveChairmanOffers',{offers:rows});
      if(result?.ok===false)throw new Error(result.message||'Could not save Chairman offers');
      lastSaved=fingerprint;
      lastLoaded=fingerprint;
      window.dispatchEvent(new CustomEvent('aurora:chairman-offers-backend',{detail:{type:'save',reason,result}}));
    }catch(err){
      console.warn('[Aurora Chairman Offers] save failed',err);
    }finally{
      saving=false;
    }
  }

  function queueSave(){
    if(loading)return;
    const rows=currentOffers();
    const fingerprint=stable(rows);
    if(fingerprint===lastLoaded||fingerprint===lastSaved)return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>save(rows,'debounced-state-change'),DEBOUNCE_MS);
  }

  function bind(){
    if(booted)return;
    const A=window.AuroraClean;
    if(!A||!client()){setTimeout(bind,100);return}
    booted=true;
    window.addEventListener('aurora-clean:state',queueSave);
    window.addEventListener('pageshow',()=>load());
    window.addEventListener('focus',()=>load());
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});
    load();
    window.AuroraChairmanOffersBackend=Object.freeze({BUILD,load,save});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
