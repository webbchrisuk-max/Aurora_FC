(() => {
  'use strict';

  const BUILD='20260901-squad-backend-sync-1';
  const CONNECTION_KEY='aurora:data2:registration-connection:v2';
  const POLL_MS=30*1000;
  let busy=false;

  function config(){
    try{
      const x=JSON.parse(localStorage.getItem(CONNECTION_KEY)||'{}');
      return {endpoint:String(x.endpoint||'').trim(),token:String(x.token||'').trim()};
    }catch(_){return {endpoint:'',token:''}}
  }

  function jsonp(action){
    const c=config();
    if(!c.endpoint||!c.token)return Promise.reject(new Error('Aurora backend connection is not configured.'));
    return new Promise((resolve,reject)=>{
      const cb='auroraSquadSync'+Date.now()+Math.random().toString(36).slice(2);
      const s=document.createElement('script');
      let done=false;
      const timer=setTimeout(()=>finish(new Error('Squad backend sync timed out.')),15000);
      function finish(err,val){
        if(done)return;done=true;clearTimeout(timer);
        try{delete window[cb]}catch(_){window[cb]=undefined}
        try{s.remove()}catch(_){}
        err?reject(err):resolve(val||{});
      }
      window[cb]=r=>r?.ok===false?finish(new Error(r.message||'Squad backend sync failed.')):finish(null,r);
      const u=new URL(c.endpoint.replace(/\/dev(?:[?#].*)?$/i,'/exec'));
      u.searchParams.set('action',action);
      u.searchParams.set('token',c.token);
      u.searchParams.set('callback',cb);
      u.searchParams.set('_',Date.now());
      s.src=u.toString();s.async=true;s.referrerPolicy='no-referrer';
      s.onerror=()=>finish(new Error('Could not reach Aurora backend.'));
      document.head.appendChild(s);
    });
  }

  async function sync(reason='manual'){
    if(busy)return {ok:false,busy:true};
    busy=true;
    const btn=document.getElementById('squadImportReal');
    const status=document.getElementById('squadImportStatus');
    if(btn){btn.disabled=true;btn.textContent='Refreshing…';}
    if(status)status.textContent='Requesting single Squad snapshot from Aurora backend…';
    try{
      const result=await jsonp('getSquadSnapshot');
      if(!result?.ok||!Array.isArray(result.holdings))throw new Error(result?.message||'Invalid Squad snapshot.');
      const A=window.AuroraClean;
      if(!A?.updateState)throw new Error('Aurora Clean state is unavailable.');
      A.updateState(state=>{
        state.squad=state.squad&&typeof state.squad==='object'?state.squad:{};
        state.squad.holdings=result.holdings;
        state.squad.importedAt=result.generatedAt||new Date().toISOString();
        state.squad.source=result.source||'AURORADATA_BACKEND_SINGLE_AUTHORITY';
        state.squad.priceSource='AURORADATA_LIVEPRICES_BACKEND';
        state.squad.backendSyncReason=reason;
        state.squad.backendHoldingCount=result.holdingCount;
        state.squad.backendQuoteCount=result.quoteCount;
      });
      if(status)status.textContent=`${result.holdingCount||result.holdings.length} live position(s) loaded from Aurora backend.`;
      return result;
    }catch(error){
      if(status)status.textContent=`Squad backend not ready: ${String(error?.message||error)}`;
      throw error;
    }finally{
      busy=false;
      if(btn){btn.disabled=false;btn.textContent='Refresh Live Squad';}
    }
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,80);return;}
    const btn=document.getElementById('squadImportReal');
    if(btn&&!btn.dataset.backendSyncBound){
      btn.dataset.backendSyncBound='true';
      btn.disabled=false;
      btn.textContent='Refresh Live Squad';
      btn.addEventListener('click',()=>sync('manual').catch(()=>{}));
    }
    sync('startup').catch(()=>{});
    window.addEventListener('pageshow',()=>sync('pageshow').catch(()=>{}));
    window.addEventListener('focus',()=>sync('focus').catch(()=>{}));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync('visible').catch(()=>{});});
    const timer=setInterval(()=>sync('interval').catch(()=>{}),POLL_MS);
    window.AuroraSquadBackendSync=Object.freeze({BUILD,sync,timer});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
