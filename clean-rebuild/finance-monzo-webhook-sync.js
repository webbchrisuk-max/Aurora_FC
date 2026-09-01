(() => {
  'use strict';

  const BUILD='20260901-finance-monzo-webhook-sync-1';
  const CONNECTION_KEY='aurora:data2:registration-connection:v2';
  const POLL_MS=5*60*1000;
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};

  function config(){
    try{
      const x=JSON.parse(localStorage.getItem(CONNECTION_KEY)||'{}');
      return {endpoint:String(x.endpoint||'').trim(),token:String(x.token||'').trim()};
    }catch(_){return {endpoint:'',token:''}}
  }

  function jsonp(action,payload){
    const c=config();
    if(!c.endpoint||!c.token)return Promise.reject(new Error('Aurora backend connection is not configured.'));
    return new Promise((resolve,reject)=>{
      const cb='auroraMonzoSync'+Date.now()+Math.random().toString(36).slice(2);
      const s=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Monzo webhook sync timed out.')),15000);
      let done=false;
      function finish(err,val){if(done)return;done=true;clearTimeout(timer);try{delete window[cb]}catch(_){window[cb]=undefined}try{s.remove()}catch(_){}err?reject(err):resolve(val||{})}
      window[cb]=r=>r?.ok===false?finish(new Error(r.message||'Monzo webhook sync failed.')):finish(null,r);
      const u=new URL(c.endpoint.replace(/\/dev(?:[?#].*)?$/i,'/exec'));
      u.searchParams.set('action',action);u.searchParams.set('token',c.token);u.searchParams.set('callback',cb);u.searchParams.set('_',Date.now());
      Object.entries(payload||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&typeof v!=='object')u.searchParams.set(k,String(v))});
      s.src=u.toString();s.async=true;s.referrerPolicy='no-referrer';s.onerror=()=>finish(new Error('Monzo webhook sync could not reach Aurora backend.'));document.head.appendChild(s);
    });
  }

  function alreadyImported(state,transactionId){
    return arr(state.finance?.cardSpends).some(x=>String(x.monzoTransactionId||'')===String(transactionId)||String(x.id||'')===`MONZO-${transactionId}`);
  }

  async function sync(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return {imported:0};
    const c=config();if(!c.endpoint||!c.token)return {imported:0,skipped:'not-configured'};
    const result=await jsonp('listMonzoRoundups',{limit:200});
    const rows=arr(result.roundups).filter(r=>String(r.transactionId||'').trim()&&num(r.amount)>0);
    const state=A.readState();
    const fresh=rows.filter(r=>!alreadyImported(state,r.transactionId));
    if(!fresh.length)return {imported:0,count:rows.length};

    A.updateState(next=>{
      next.finance=next.finance||{};
      next.finance.cardSpends=arr(next.finance.cardSpends);
      fresh.forEach(r=>{
        if(alreadyImported(next,r.transactionId))return;
        next.finance.cardSpends.push({
          id:`MONZO-${r.transactionId}`,
          monzoTransactionId:String(r.transactionId),
          name:String(r.merchant||'Monzo card purchase'),
          amount:Number(num(r.amount).toFixed(2)),
          spentAt:String(r.transactionTime||r.receivedAt||new Date().toISOString()),
          source:'MONZO_IFTTT_WEBHOOK',
          webhookRoundUpCredit:Number(num(r.roundUpCredit).toFixed(2))
        });
      });
      next.finance.lastMonzoWebhookSyncAt=new Date().toISOString();
      next.finance.lastMonzoWebhookSyncCount=fresh.length;
    });
    setTimeout(()=>window.AuroraFinanceEmergencyRoundups?.processDue?.(),0);
    return {imported:fresh.length,count:rows.length};
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,80);return}
    sync().catch(()=>{});
    window.addEventListener('pageshow',()=>sync().catch(()=>{}));
    window.addEventListener('focus',()=>sync().catch(()=>{}));
    const timer=setInterval(()=>sync().catch(()=>{}),POLL_MS);
    window.AuroraFinanceMonzoWebhookSync=Object.freeze({BUILD,sync,timer});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
