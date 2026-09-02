(() => {
  'use strict';

  const BUILD='20260902-clean-backend-client-2-income-get';
  const CONNECTION_KEY='aurora:data2:registration-connection:v2';

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
      const cb='auroraBackend'+Date.now()+Math.random().toString(36).slice(2);
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

  // Read actions use JSONP because the clean site is hosted on GitHub Pages.
  // Keeping a get() alias preserves the existing Income Centre contract.
  function get(action,payload){
    return jsonp(action,payload||{});
  }

  window.AuroraData2Client=Object.freeze({BUILD,config,get,post,jsonp});
})();
