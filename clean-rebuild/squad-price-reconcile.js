(() => {
  'use strict';

  /* Compatibility filename retained only because transfer.html already loads it.
   * This is NOT the old price reconciler. It is now a backend-only bridge.
   */
  const BUILD='20260901-transfer-squad-backend-bridge-1';
  const CONNECTION_KEY='aurora:data2:registration-connection:v2';
  const POLL_MS=30*1000;
  let busy=false;

  function config(){
    try{
      const x=JSON.parse(localStorage.getItem(CONNECTION_KEY)||'{}');
      return {endpoint:String(x.endpoint||'').trim(),token:String(x.token||'').trim()};
    }catch(_){return {endpoint:'',token:''}}
  }

  function endpoint(){
    const c=config();
    if(!c.endpoint||!c.token)throw new Error('Aurora backend connection is not configured.');
    return {url:c.endpoint.replace(/\/dev(?:[?#].*)?$/i,'/exec'),token:c.token};
  }

  async function post(action,payload){
    const c=endpoint();
    const body=new URLSearchParams();
    body.set('token',c.token);
    body.set('payload',JSON.stringify({...(payload||{}),action:String(action||'').trim()}));
    const response=await fetch(c.url,{method:'POST',body,redirect:'follow',credentials:'omit'});
    if(!response.ok)throw new Error(`Aurora backend HTTP ${response.status}`);
    const result=await response.json();
    if(result?.ok===false)throw new Error(result.message||`Aurora backend action failed: ${action}`);
    return result;
  }

  function jsonp(action,payload){
    const c=endpoint();
    return new Promise((resolve,reject)=>{
      const cb='auroraTransferSquad'+Date.now()+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      let done=false;
      const timer=setTimeout(()=>finish(new Error(`Aurora backend timed out: ${action}`)),15000);
      function finish(err,val){
        if(done)return;done=true;clearTimeout(timer);
        try{delete window[cb]}catch(_){window[cb]=undefined}
        try{script.remove()}catch(_){}
        err?reject(err):resolve(val||{});
      }
      window[cb]=r=>r?.ok===false?finish(new Error(r.message||`Aurora backend action failed: ${action}`)):finish(null,r);
      const u=new URL(c.url);
      u.searchParams.set('action',String(action||'').trim());
      u.searchParams.set('token',c.token);
      u.searchParams.set('callback',cb);
      u.searchParams.set('_',Date.now());
      Object.entries(payload||{}).forEach(([k,v])=>{
        if(v!==undefined&&v!==null&&typeof v!=='object')u.searchParams.set(k,String(v));
      });
      script.src=u.toString();script.async=true;script.referrerPolicy='no-referrer';
      script.onerror=()=>finish(new Error(`Could not reach Aurora backend: ${action}`));
      document.head.appendChild(script);
    });
  }

  if(!window.AuroraData2Client){
    window.AuroraData2Client=Object.freeze({BUILD:'20260901-transfer-inline-backend-client-1',config,post,jsonp});
  }

  async function sync(reason='startup'){
    if(busy)return {ok:false,busy:true};
    busy=true;
    try{
      const result=await jsonp('getSquadSnapshot',{});
      if(!result?.ok||!Array.isArray(result.holdings))throw new Error(result?.message||'Invalid Squad snapshot.');
      const A=window.AuroraClean;
      if(!A?.updateState)throw new Error('Aurora Clean state is unavailable.');
      A.updateState(state=>{
        state.squad=state.squad&&typeof state.squad==='object'?state.squad:{};
        state.squad.holdings=result.holdings;
        state.squad.importedAt=result.generatedAt||new Date().toISOString();
        state.squad.source=result.source||'AURORADATA_BACKEND_SINGLE_AUTHORITY';
        state.squad.priceSource='AURORADATA_LIVEPRICES_BACKEND';
        state.squad.backendSyncReason=`TRANSFER_${reason}`;
        state.squad.backendHoldingCount=result.holdingCount;
        state.squad.backendQuoteCount=result.quoteCount;
        state.transfer=state.transfer&&typeof state.transfer==='object'?state.transfer:{};
        state.transfer.squadAuthority={
          source:state.squad.source,
          generatedAt:state.squad.importedAt,
          holdingCount:result.holdingCount||result.holdings.length,
          quoteCount:result.quoteCount||0
        };
      });
      window.dispatchEvent(new CustomEvent('aurora:transfer-squad-authority',{detail:{reason,result}}));
      return result;
    }finally{
      busy=false;
    }
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,80);return}
    sync('startup').catch(()=>{});
    window.addEventListener('pageshow',()=>sync('pageshow').catch(()=>{}));
    window.addEventListener('focus',()=>sync('focus').catch(()=>{}));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync('visible').catch(()=>{});});
    const timer=setInterval(()=>sync('interval').catch(()=>{}),POLL_MS);
    window.AuroraTransferSquadAuthority=Object.freeze({BUILD,sync,timer});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
