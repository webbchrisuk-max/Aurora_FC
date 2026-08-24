(function(w){
'use strict';

const STATUS_KEY='aurora2:sync:status:v1';
const services=new Map();
const running=new Map();
const now=()=>new Date().toISOString();
const visible=()=>document.visibilityState!=='hidden';

// Tell compatible sync modules not to install independent timers.
w.AuroraSyncManaged=true;

function readStatus(){
  try{return JSON.parse(localStorage.getItem(STATUS_KEY)||'{}')||{}}
  catch(_){return {}}
}
function writeStatus(next){
  try{localStorage.setItem(STATUS_KEY,JSON.stringify(next))}catch(_){}
  w.dispatchEvent(new CustomEvent('aurora2:sync-status',{detail:next}));
  return next;
}
function patchStatus(name,patch){
  const all=readStatus();
  all[name]={...(all[name]||{}),...patch};
  all.updatedAt=now();
  return writeStatus(all);
}
function register(name,run,options={}){
  if(!name||typeof run!=='function')throw new Error('Sync service requires a name and function.');
  services.set(name,{
    name,run,
    intervalMs:Math.max(60000,Number(options.intervalMs)||15*60*1000),
    startup:options.startup!==false,
    onVisible:options.onVisible!==false,
    critical:Boolean(options.critical)
  });
  patchStatus(name,{status:'REGISTERED',intervalMs:services.get(name).intervalMs});
  return services.get(name);
}
function due(name){
  const svc=services.get(name);if(!svc)return false;
  const row=readStatus()[name]||{};
  const t=new Date(row.lastRunAt||0).getTime();
  return !Number.isFinite(t)||Date.now()-t>=svc.intervalMs;
}
async function run(name,{force=false,reason='schedule'}={}){
  const svc=services.get(name);if(!svc)throw new Error(`Unknown sync service: ${name}`);
  if(running.has(name))return running.get(name);
  if(!force&&!due(name))return null;

  const started=performance.now();
  patchStatus(name,{status:'RUNNING',lastRunAt:now(),lastReason:reason,lastError:null});
  const promise=(async()=>{
    try{
      const result=await svc.run();
      const serviceStatus=(w.AuroraHoldingsSync?.status&&name==='holdings')?w.AuroraHoldingsSync.status():null;
      if(serviceStatus?.status==='ERROR')throw new Error(serviceStatus.lastError||'Holdings sync failed.');
      patchStatus(name,{status:'CONNECTED',lastSuccessAt:now(),durationMs:Math.round(performance.now()-started),lastError:null});
      return result;
    }catch(err){
      patchStatus(name,{status:'ERROR',durationMs:Math.round(performance.now()-started),lastError:String(err?.message||err)});
      console.warn(`Aurora sync service ${name} failed:`,err);
      return null;
    }finally{
      running.delete(name);
    }
  })();
  running.set(name,promise);
  return promise;
}
async function runDue(reason='schedule'){
  if(!visible())return;
  for(const [name,svc] of services){
    if(due(name))await run(name,{reason});
  }
}
async function runAll(reason='manual'){
  for(const name of services.keys())await run(name,{force:true,reason});
}
function status(){return {managed:true,services:[...services.keys()],running:[...running.keys()],detail:readStatus()}}

function loadScript(src,key){
  return new Promise((resolve,reject)=>{
    const found=document.querySelector(`script[data-aurora-managed="${key}"]`);
    if(found){
      if(found.dataset.loaded==='1')resolve();
      else found.addEventListener('load',()=>resolve(),{once:true});
      return;
    }
    const s=document.createElement('script');
    s.src=src;s.dataset.auroraManaged=key;
    s.onload=()=>{s.dataset.loaded='1';resolve()};
    s.onerror=()=>reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

async function backendHealth(){
  if(!w.AuroraData2Client?.health)throw new Error('The shared Aurora Data client is not loaded.');
  return w.AuroraData2Client.health();
}

async function bootstrap(){
  try{
    await loadScript('aurora-holdings-sync.js?v=110-managed','holdings');
    if(w.AuroraHoldingsSync?.sync){
      register('holdings',()=>w.AuroraHoldingsSync.sync(),{intervalMs:15*60*1000,critical:true});
    }
  }catch(err){
    patchStatus('holdings',{status:'ERROR',lastError:String(err?.message||err)});
  }

  register('backend-health',backendHealth,{intervalMs:10*60*1000,critical:true});

  setTimeout(()=>runDue('startup'),500);
  setInterval(()=>runDue('interval'),60*1000);
  document.addEventListener('visibilitychange',()=>{
    if(visible())setTimeout(()=>runDue('foreground'),150);
  });
}

w.AuroraSyncManager={version:1,register,run,runAll,runDue,due,status};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});
else bootstrap();
})(window);
