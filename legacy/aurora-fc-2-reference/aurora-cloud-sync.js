/* Aurora City FC 2.0 — Cross-Device Cloud State v1.0
 * ==========================================================
 * Uses the existing Aurora Firebase account for authentication + Firestore.
 *
 * Aurora 2 data is stored separately from the old Aurora cloud:
 *   users/{uid}/cloud/aurora2-state
 *   users/{uid}/cloud/aurora2-backup
 *
 * Safety model:
 * - A new device NEVER auto-uploads starter/default state.
 * - First device: explicit "Upload This Device as Master".
 * - Other devices: explicit "Download Cloud to This Device".
 * - After bootstrap, automatic synchronisation is enabled.
 * - Departments are conflict-checked separately.
 * - Cloud apply creates a Stable Core local backup first.
 * - Passwords and AuroraData 2 endpoint/token are NEVER placed in cloud state.
 */
(function(w){
'use strict';

if(w.__AURORA2_CLOUD_SYNC_V1__) return;
w.__AURORA2_CLOUD_SYNC_V1__=true;

const API_KEY='AIzaSyCWniUugILvyvTqXCnpQQQ352V0ECKPKo0';
const PROJECT_ID='aurora-city-fc';
const VERSION='1.0.0-cross-device';
const BUNDLE_VERSION=1;

const SESSION_KEY='aurora2:cloud:session:v1';
const LEGACY_SESSION_KEY='aurora_cloud_rest_session_v1';
const DEVICE_ID_KEY='aurora2:cloud:device-id:v1';
const DEVICE_NAME_KEY='aurora2:cloud:device-name:v1';
const META_KEY='aurora2:cloud:meta:v1';
const PRE_APPLY_EXTRA_KEY='aurora2:cloud:preapply-extra:v1';
const SIGNAL_WATCH_KEY='aurora2:scouting:signal-watch:v2';

const AUTH_URL='https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+API_KEY;
const REFRESH_URL='https://securetoken.googleapis.com/v1/token?key='+API_KEY;
const FIRESTORE_BASE='https://firestore.googleapis.com/v1/projects/'+PROJECT_ID+'/databases/(default)/documents';

const CORE_DOMAINS=[
  'finance','scouting','transfer','registration','squad',
  'income','mission','portfolio','decision','alerts','notifications'
];
const EXTRA_DOMAINS=['signalWatch'];
const ALL_DOMAINS=[...CORE_DOMAINS,...EXTRA_DOMAINS];

const VOLATILE_HASH_KEYS=new Set([
  'updatedAt','lastSyncAt','lastHealthAt','lastEngineContactAt','lastCheckedAt',
  'lastSuccessAt','lastRunAt','lastAttemptAt','refreshedAt','syncedAt',
  'lastRefreshAt','durationMs','lastError'
]);

let currentUser=null;
let cloudCache=null;
let working=false;
let action='';
let lastError=null;
let phase='SIGNED_OUT';
let applyingRemote=false;
let localTimer=null;
let managerRegistered=false;
let initComplete=false;
const listeners=new Set();

let resolveReady;
const ready=new Promise(resolve=>{resolveReady=resolve});

function now(){return new Date().toISOString()}
function safeParse(v,fallback=null){try{return JSON.parse(v)}catch(_){return fallback}}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function arr(v){return Array.isArray(v)?v:[]}

function humanError(error){
  const raw=String(error?.message||error||'Cloud request failed.');
  const code=String(error?.code||'');
  const all=(code+' '+raw).toUpperCase();
  if(all.includes('INVALID_PASSWORD')||all.includes('INVALID_LOGIN_CREDENTIALS'))
    return 'The Aurora Cloud email or password is incorrect.';
  if(all.includes('EMAIL_NOT_FOUND'))
    return 'No Aurora Cloud account was found for that email.';
  if(all.includes('USER_DISABLED'))
    return 'This Aurora Cloud account has been disabled.';
  if(all.includes('TOO_MANY_ATTEMPTS'))
    return 'Firebase has temporarily limited sign-in attempts. Wait a few minutes and try again.';
  if(all.includes('PERMISSION_DENIED')||all.includes('403'))
    return 'Aurora Cloud signed in, but Firestore blocked the Aurora 2 cloud document.';
  if(all.includes('FAILED_TO_FETCH')||all.includes('NETWORK')||all.includes('OFFLINE'))
    return 'Aurora Cloud could not be reached. Check the internet connection.';
  if(all.includes('FAILED_PRECONDITION')||all.includes('409'))
    return 'Cloud changed on another device during this sync. Aurora will re-check before writing.';
  return raw.replace(/^Firebase:\s*/i,'');
}

function getDeviceId(){
  let id=localStorage.getItem(DEVICE_ID_KEY);
  if(!id){
    id=globalThis.crypto?.randomUUID?.()||
      `aurora2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY,id);
  }
  return id;
}
function defaultDeviceName(){
  const ua=navigator.userAgent||'';
  const ipad=/iPad/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ipad)return 'Aurora iPad';
  if(/iPhone/i.test(ua))return 'Aurora iPhone';
  if(/Android/i.test(ua))return 'Aurora Phone';
  if(/Windows/i.test(ua))return 'Aurora PC';
  if(/Macintosh|Mac OS/i.test(ua))return 'Aurora Mac';
  return 'Aurora Device';
}
function getDeviceName(){return localStorage.getItem(DEVICE_NAME_KEY)||defaultDeviceName()}
function setDeviceName(value){
  const clean=String(value||'').trim().slice(0,60)||defaultDeviceName();
  localStorage.setItem(DEVICE_NAME_KEY,clean);
  emit();
  return clean;
}

function defaultMeta(){
  return {
    version:1,
    uid:'',
    bootstrapped:false,
    autoSync:true,
    baseHashes:{},
    conflicts:[],
    remoteUpdateTime:'',
    remoteRevision:0,
    lastSyncAt:null,
    lastUploadAt:null,
    lastDownloadAt:null,
    lastCloudSeenAt:null
  };
}
function getMeta(){
  const parsed=safeParse(localStorage.getItem(META_KEY)||'{}',{});
  return {...defaultMeta(),...(parsed&&typeof parsed==='object'?parsed:{}),
    baseHashes:{...(parsed?.baseHashes||{})},
    conflicts:arr(parsed?.conflicts)
  };
}
function saveMeta(patch){
  const next={...getMeta(),...patch};
  if(patch?.baseHashes)next.baseHashes={...patch.baseHashes};
  if(patch?.conflicts)next.conflicts=[...patch.conflicts];
  localStorage.setItem(META_KEY,JSON.stringify(next));
  return next;
}
function resetMetaForUser(uid){
  const m=getMeta();
  if(m.uid&&m.uid!==uid){
    return saveMeta({
      ...defaultMeta(),
      uid,
      autoSync:m.autoSync!==false
    });
  }
  if(!m.uid)return saveMeta({uid});
  return m;
}

function loadSession(){
  let session=safeParse(localStorage.getItem(SESSION_KEY)||'null',null);
  if(session?.refreshToken&&session?.uid)return session;

  // Reuse the old Aurora Firebase session on a device that already has one.
  const legacy=safeParse(localStorage.getItem(LEGACY_SESSION_KEY)||'null',null);
  if(legacy?.refreshToken&&legacy?.uid){
    session={
      idToken:legacy.idToken||'',
      refreshToken:legacy.refreshToken,
      uid:legacy.uid,
      email:legacy.email||'',
      expiresAt:Number(legacy.expiresAt)||0
    };
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    return session;
  }
  return null;
}
function saveSession(session){localStorage.setItem(SESSION_KEY,JSON.stringify(session))}
function clearSession(){localStorage.removeItem(SESSION_KEY)}

async function readJsonResponse(response){
  const text=await response.text();
  const data=text?safeParse(text,{raw:text}):{};
  if(!response.ok){
    const message=data?.error?.message||data?.error?.status||data?.raw||`Request failed (${response.status}).`;
    const error=new Error(message);
    error.code=data?.error?.status||String(response.status);
    throw error;
  }
  return data;
}
async function signInRequest(email,password){
  const response=await fetch(AUTH_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      email:String(email||'').trim(),
      password:String(password||''),
      returnSecureToken:true
    })
  });
  return readJsonResponse(response);
}
async function refreshRequest(refreshToken){
  const response=await fetch(REFRESH_URL,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'refresh_token',
      refresh_token:refreshToken
    }).toString()
  });
  return readJsonResponse(response);
}
async function ensureToken(force=false){
  let session=loadSession();
  if(!session)throw new Error('Sign in to Aurora Cloud first.');

  if(!force&&session.idToken&&Number(session.expiresAt)-Date.now()>90000){
    currentUser={uid:session.uid,email:session.email||''};
    return session.idToken;
  }

  const refreshed=await refreshRequest(session.refreshToken);
  session={
    ...session,
    idToken:refreshed.id_token,
    refreshToken:refreshed.refresh_token||session.refreshToken,
    uid:refreshed.user_id||session.uid,
    expiresAt:Date.now()+Number(refreshed.expires_in||3600)*1000
  };
  saveSession(session);
  currentUser={uid:session.uid,email:session.email||''};
  return session.idToken;
}
async function authFetch(url,options={},retry=true){
  const token=await ensureToken(false);
  const headers=new Headers(options.headers||{});
  headers.set('Authorization','Bearer '+token);
  const response=await fetch(url,{...options,headers});
  if(response.status===401&&retry){
    await ensureToken(true);
    return authFetch(url,options,false);
  }
  return response;
}

function firestoreValue(value){
  if(value==null)return null;
  if(Object.prototype.hasOwnProperty.call(value,'stringValue'))return value.stringValue;
  if(Object.prototype.hasOwnProperty.call(value,'booleanValue'))return value.booleanValue;
  if(Object.prototype.hasOwnProperty.call(value,'integerValue'))return Number(value.integerValue);
  if(Object.prototype.hasOwnProperty.call(value,'doubleValue'))return Number(value.doubleValue);
  if(Object.prototype.hasOwnProperty.call(value,'timestampValue'))return value.timestampValue;
  return null;
}
function parseDocument(doc){
  if(!doc)return null;
  const row={_name:doc.name||'',_updateTime:doc.updateTime||'',_createTime:doc.createTime||''};
  Object.entries(doc.fields||{}).forEach(([k,v])=>row[k]=firestoreValue(v));
  return row;
}
function firestoreFields(record){
  const fields={};
  Object.entries(record||{}).forEach(([key,value])=>{
    if(value===undefined)return;
    if(typeof value==='boolean')fields[key]={booleanValue:value};
    else if(typeof value==='number'&&Number.isFinite(value)){
      fields[key]=Number.isInteger(value)
        ?{integerValue:String(value)}
        :{doubleValue:value};
    }else if(key.endsWith('At')&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)){
      fields[key]={timestampValue:value};
    }else{
      fields[key]={stringValue:String(value??'')};
    }
  });
  return fields;
}
function cloudPath(uid=currentUser?.uid){return `users/${uid}/cloud/aurora2-state`}
function backupPath(uid=currentUser?.uid){return `users/${uid}/cloud/aurora2-backup`}

async function getDocument(path){
  const response=await authFetch(`${FIRESTORE_BASE}/${path}`,{method:'GET',cache:'no-store'});
  if(response.status===404)return null;
  return parseDocument(await readJsonResponse(response));
}
async function writeDocument(path,record,{expectedUpdateTime='',createOnly=false}={}){
  const query=new URLSearchParams();
  if(expectedUpdateTime)query.set('currentDocument.updateTime',expectedUpdateTime);
  if(createOnly)query.set('currentDocument.exists','false');
  const suffix=query.toString()?`?${query}`:'';
  const response=await authFetch(`${FIRESTORE_BASE}/${path}${suffix}`,{
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fields:firestoreFields(record)})
  });
  return parseDocument(await readJsonResponse(response));
}

function canonicalForHash(value){
  if(Array.isArray(value))return value.map(canonicalForHash);
  if(value&&typeof value==='object'){
    const out={};
    Object.keys(value).sort().forEach(key=>{
      if(VOLATILE_HASH_KEYS.has(key))return;
      out[key]=canonicalForHash(value[key]);
    });
    return out;
  }
  return value;
}
async function sha256(text){
  const bytes=new TextEncoder().encode(String(text||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function hashData(value){
  return sha256(JSON.stringify(canonicalForHash(value)));
}
function bundleByteSize(bundle){
  try{return new TextEncoder().encode(JSON.stringify(bundle)).length}
  catch(_){return JSON.stringify(bundle).length}
}

function cloudSafeCoreDomain(name,state){
  const data=clone(state?.[name]??{});

  // Browser/backend health stamps are local runtime state, not club truth.
  if(name==='registration'&&data&&typeof data==='object')delete data.backend;
  if(name==='income'&&data&&typeof data==='object'){
    delete data.backend;
    delete data.runwaySummary; // derived locally from Income-owned truth
  }
  if(name==='squad'&&data&&typeof data==='object')delete data.canonicalSync;
  if(name==='scouting'&&data&&typeof data==='object'){
    // Broad Global Network is a refreshable cache; Active Scouting remains cloud state.
    delete data.universe;
  }
  return data;
}
function readSignalWatch(){
  const rows=safeParse(localStorage.getItem(SIGNAL_WATCH_KEY)||'[]',[]);
  return Array.isArray(rows)?rows:[];
}
async function makeBundle(){
  const A=w.Aurora2;
  if(!A?.core?.read)throw new Error('Stable Core is not ready.');
  const state=A.core.read();
  const domains={};

  for(const name of CORE_DOMAINS){
    const data=cloudSafeCoreDomain(name,state);
    domains[name]={data,hash:await hashData(data)};
  }
  const signal=readSignalWatch();
  domains.signalWatch={data:signal,hash:await hashData(signal)};

  const hashLine=ALL_DOMAINS.map(name=>`${name}:${domains[name]?.hash||''}`).join('|');
  const bundle={
    version:BUNDLE_VERSION,
    schemaVersion:Number(A.core.VERSION||state.schemaVersion||0),
    capturedAt:now(),
    domains,
    hash:await sha256(hashLine)
  };

  const bytes=bundleByteSize(bundle);
  if(bytes>850000){
    throw new Error(`Aurora cloud bundle is ${Math.round(bytes/1024)} KB. It is too large for the safe single-document cloud limit.`);
  }
  return bundle;
}
async function normalizeRemoteBundle(bundle){
  if(!bundle||typeof bundle!=='object'||!bundle.domains)throw new Error('Aurora Cloud state is missing or invalid.');
  const currentVersion=Number(w.Aurora2?.core?.VERSION||0);
  if(Number(bundle.schemaVersion)>currentVersion){
    throw new Error(`Cloud schema v${bundle.schemaVersion} is newer than this device (v${currentVersion}). Update Aurora first.`);
  }
  const domains={};
  for(const name of ALL_DOMAINS){
    const data=clone(bundle.domains?.[name]?.data ?? (name==='signalWatch'?[]:{}));
    const hash=String(bundle.domains?.[name]?.hash||await hashData(data));
    domains[name]={data,hash};
  }
  return {...bundle,domains};
}
function recordToCloud(record){
  if(!record)return null;
  const payload=safeParse(record.payload||'null',null);
  return {
    record,
    bundle:payload,
    hash:String(record.hash||payload?.hash||''),
    revision:Number(record.revision)||0,
    savedAt:record.savedAt||record._updateTime||'',
    deviceId:String(record.deviceId||''),
    deviceName:String(record.deviceName||''),
    updateTime:record._updateTime||''
  };
}
async function fetchCloud(){
  const row=await getDocument(cloudPath());
  if(!row){
    cloudCache=null;
    return null;
  }
  const remote=recordToCloud(row);
  remote.bundle=await normalizeRemoteBundle(remote.bundle);
  cloudCache=remote;
  saveMeta({
    remoteUpdateTime:remote.updateTime,
    remoteRevision:remote.revision,
    lastCloudSeenAt:now()
  });
  return remote;
}
async function writeCloudBundle(bundle,{expectedUpdateTime='',master=false}={}){
  const prior=cloudCache||await fetchCloud();
  const revision=(prior?.revision||0)+1;
  const savedAt=now();
  const record={
    version:VERSION,
    bundleVersion:BUNDLE_VERSION,
    schemaVersion:Number(bundle.schemaVersion)||0,
    payload:JSON.stringify(bundle),
    hash:bundle.hash||'',
    revision,
    savedAt,
    deviceId:getDeviceId(),
    deviceName:getDeviceName()
  };
  const written=await writeDocument(
    cloudPath(),
    record,
    expectedUpdateTime?{expectedUpdateTime}:{}
  );
  const remote=recordToCloud(written);
  remote.bundle=await normalizeRemoteBundle(safeParse(written.payload||JSON.stringify(bundle),bundle));
  cloudCache=remote;
  return remote;
}
async function backupCloud(remote){
  if(!remote?.bundle)return null;
  return writeDocument(backupPath(),{
    version:VERSION,
    bundleVersion:BUNDLE_VERSION,
    schemaVersion:Number(remote.bundle.schemaVersion)||0,
    payload:JSON.stringify(remote.bundle),
    hash:remote.bundle.hash||remote.hash||'',
    revision:remote.revision||0,
    savedAt:now(),
    sourceCloudSavedAt:remote.savedAt||'',
    sourceCloudUpdateTime:remote.updateTime||'',
    deviceId:getDeviceId(),
    deviceName:getDeviceName()
  });
}

function applyCoreDomain(current,name,data){
  const incoming=clone(data||{});
  if(name==='registration'){
    return {...incoming,backend:current.registration?.backend};
  }
  if(name==='income'){
    return {
      ...incoming,
      backend:current.income?.backend,
      runwaySummary:current.income?.runwaySummary
    };
  }
  if(name==='squad'){
    return {...incoming,canonicalSync:current.squad?.canonicalSync};
  }
  return incoming;
}
async function applyRemoteDomains(bundle,names,reason='cloud-download'){
  const A=w.Aurora2;
  if(!A?.core?.read||!A?.core?.write)throw new Error('Stable Core is not ready.');
  const setNames=new Set(names);
  if(!setNames.size)return;

  applyingRemote=true;
  try{
    A.core.backup?.(`pre-${reason}`);
    try{
      localStorage.setItem(PRE_APPLY_EXTRA_KEY,JSON.stringify({
        at:now(),
        signalWatch:readSignalWatch()
      }));
    }catch(_){}

    const current=A.core.read();
    const next={...current};
    CORE_DOMAINS.forEach(name=>{
      if(setNames.has(name)){
        next[name]=applyCoreDomain(current,name,bundle.domains[name]?.data);
      }
    });
    next.updatedAt=now();

    if([...setNames].some(x=>CORE_DOMAINS.includes(x))){
      A.core.write(next);
    }
    if(setNames.has('signalWatch')){
      localStorage.setItem(SIGNAL_WATCH_KEY,JSON.stringify(arr(bundle.domains.signalWatch?.data)));
    }

    w.dispatchEvent(new CustomEvent('aurora2:cloud-applied',{
      detail:{domains:[...setNames],reason}
    }));
  }finally{
    applyingRemote=false;
  }
}

function baseHashesFrom(bundle){
  const out={};
  ALL_DOMAINS.forEach(name=>out[name]=String(bundle?.domains?.[name]?.hash||''));
  return out;
}

function stateSnapshot(extra={}){
  const m=getMeta();
  const remote=cloudCache;
  return {
    version:VERSION,
    transport:'firebase-firestore-rest',
    signedIn:Boolean(currentUser),
    user:currentUser?{uid:currentUser.uid,email:currentUser.email||''}:null,
    online:navigator.onLine,
    phase,
    working,
    action,
    lastError,
    bootstrapped:Boolean(m.bootstrapped),
    autoSync:m.autoSync!==false,
    conflicts:[...arr(m.conflicts)],
    deviceId:getDeviceId(),
    deviceName:getDeviceName(),
    cloudExists:remote?true:(remote===null?false:null),
    cloudRevision:remote?.revision||m.remoteRevision||0,
    cloudSavedAt:remote?.savedAt||null,
    cloudDeviceId:remote?.deviceId||'',
    cloudDeviceName:remote?.deviceName||'',
    cloudHash:remote?.bundle?.hash||remote?.hash||'',
    lastSyncAt:m.lastSyncAt,
    lastUploadAt:m.lastUploadAt,
    lastDownloadAt:m.lastDownloadAt,
    lastCloudSeenAt:m.lastCloudSeenAt,
    ...extra
  };
}
function emit(extra={}){
  const s=stateSnapshot(extra);
  listeners.forEach(fn=>{try{fn(s)}catch(_){}});
  w.dispatchEvent(new CustomEvent('aurora2:cloud-status',{detail:s}));
  return s;
}
function setPhase(next,error=null){
  phase=next;
  lastError=error?String(error):null;
  return emit();
}

async function inspectCloud(){
  if(!currentUser)throw new Error('Sign in to Aurora Cloud first.');
  working=true;action='inspect';emit();
  try{
    const remote=await fetchCloud();
    const m=getMeta();
    if(!m.bootstrapped){
      setPhase(remote?'BOOTSTRAP_DOWNLOAD':'BOOTSTRAP_UPLOAD');
    }else{
      setPhase(remote?'READY':'CLOUD_MISSING');
    }
    return remote;
  }catch(err){
    setPhase('ERROR',humanError(err));
    throw err;
  }finally{
    working=false;action='';emit();
  }
}

async function signIn(email,password){
  if(!navigator.onLine)throw new Error('This device is offline.');
  working=true;action='sign-in';setPhase('SIGNING_IN');
  try{
    const auth=await signInRequest(email,password);
    const session={
      idToken:auth.idToken,
      refreshToken:auth.refreshToken,
      uid:auth.localId,
      email:auth.email||String(email||'').trim(),
      expiresAt:Date.now()+Number(auth.expiresIn||3600)*1000
    };
    saveSession(session);
    currentUser={uid:session.uid,email:session.email||''};
    resetMetaForUser(session.uid);
    await inspectCloud();
    if(getMeta().bootstrapped){
      registerManagedSync();
      setTimeout(()=>syncNow('sign-in'),100);
    }
    return stateSnapshot();
  }catch(err){
    clearSession();
    currentUser=null;
    setPhase('ERROR',humanError(err));
    throw err;
  }finally{
    working=false;action='';emit();
  }
}
function signOut(){
  clearSession();
  currentUser=null;
  cloudCache=null;
  working=false;action='';lastError=null;phase='SIGNED_OUT';
  emit();
}

async function uploadMaster(){
  if(!currentUser)throw new Error('Sign in to Aurora Cloud first.');
  if(!navigator.onLine)throw new Error('This device is offline.');
  working=true;action='upload-master';setPhase('UPLOADING_MASTER');
  try{
    const local=await makeBundle();
    const existing=await fetchCloud();
    if(existing)await backupCloud(existing);
    const remote=await writeCloudBundle(local,{master:true});
    const m=saveMeta({
      uid:currentUser.uid,
      bootstrapped:true,
      autoSync:true,
      baseHashes:baseHashesFrom(local),
      conflicts:[],
      remoteUpdateTime:remote.updateTime,
      remoteRevision:remote.revision,
      lastUploadAt:now(),
      lastSyncAt:now(),
      lastCloudSeenAt:now()
    });
    registerManagedSync();
    setPhase('SYNCED');
    return {ok:true,remote,meta:m};
  }catch(err){
    setPhase('ERROR',humanError(err));
    throw err;
  }finally{
    working=false;action='';emit();
  }
}

async function downloadCloud(){
  if(!currentUser)throw new Error('Sign in to Aurora Cloud first.');
  if(!navigator.onLine)throw new Error('This device is offline.');
  working=true;action='download-cloud';setPhase('DOWNLOADING');
  try{
    const remote=await fetchCloud();
    if(!remote)throw new Error('No Aurora 2 cloud master exists yet.');
    await applyRemoteDomains(remote.bundle,ALL_DOMAINS,'cloud-download');
    const m=saveMeta({
      uid:currentUser.uid,
      bootstrapped:true,
      autoSync:true,
      baseHashes:baseHashesFrom(remote.bundle),
      conflicts:[],
      remoteUpdateTime:remote.updateTime,
      remoteRevision:remote.revision,
      lastDownloadAt:now(),
      lastSyncAt:now(),
      lastCloudSeenAt:now()
    });
    registerManagedSync();
    setPhase('SYNCED');
    return {ok:true,remote,meta:m};
  }catch(err){
    setPhase('ERROR',humanError(err));
    throw err;
  }finally{
    working=false;action='';emit();
  }
}

async function syncPass(reason='manual',retry=0){
  const m=getMeta();
  if(!currentUser)return {ok:false,skipped:'SIGNED_OUT'};
  if(!m.bootstrapped)return {ok:false,skipped:'NOT_BOOTSTRAPPED'};
  if(!navigator.onLine){setPhase('OFFLINE');return {ok:false,skipped:'OFFLINE'}}

  const local=await makeBundle();
  const remote=await fetchCloud();
  if(!remote){
    setPhase('CLOUD_MISSING');
    return {ok:false,skipped:'CLOUD_MISSING'};
  }

  const base={...m.baseHashes};
  const pull=[],push=[],conflicts=[],same=[];
  for(const name of ALL_DOMAINS){
    const localHash=String(local.domains[name]?.hash||'');
    const remoteHash=String(remote.bundle.domains[name]?.hash||'');
    const baseHash=String(base[name]||'');

    if(localHash===remoteHash){
      same.push(name);
      continue;
    }
    if(!baseHash){
      conflicts.push(name);
      continue;
    }

    const localChanged=localHash!==baseHash;
    const remoteChanged=remoteHash!==baseHash;

    if(localChanged&&remoteChanged){
      conflicts.push(name);
    }else if(localChanged){
      push.push(name);
    }else if(remoteChanged){
      pull.push(name);
    }else{
      conflicts.push(name);
    }
  }

  // Pull safe remote departments first.
  if(pull.length){
    await applyRemoteDomains(remote.bundle,pull,'cloud-sync');
  }

  // Merge only safe local departments into the latest remote bundle.
  let finalRemote=remote;
  if(push.length){
    const merged=clone(remote.bundle);
    for(const name of push){
      merged.domains[name]=clone(local.domains[name]);
    }
    merged.capturedAt=now();
    const hashLine=ALL_DOMAINS.map(name=>`${name}:${merged.domains[name]?.hash||''}`).join('|');
    merged.hash=await sha256(hashLine);

    try{
      finalRemote=await writeCloudBundle(merged,{expectedUpdateTime:remote.updateTime});
    }catch(err){
      const message=humanError(err);
      if(retry<1&&(String(err?.code||'').includes('409')||/precondition|changed on another device/i.test(message))){
        return syncPass(reason,1);
      }
      throw err;
    }
  }else{
    finalRemote=remote;
  }

  // Build the new common-base hashes only for departments that are now aligned.
  const afterLocal=await makeBundle();
  const newBase={...base};
  const finalBundle=finalRemote.bundle;
  for(const name of ALL_DOMAINS){
    const lh=String(afterLocal.domains[name]?.hash||'');
    const rh=String(finalBundle.domains[name]?.hash||'');
    if(lh===rh)newBase[name]=lh;
  }

  saveMeta({
    baseHashes:newBase,
    conflicts,
    remoteUpdateTime:finalRemote.updateTime,
    remoteRevision:finalRemote.revision,
    lastSyncAt:now(),
    lastCloudSeenAt:now(),
    lastUploadAt:push.length?now():m.lastUploadAt,
    lastDownloadAt:pull.length?now():m.lastDownloadAt
  });

  if(conflicts.length){
    setPhase('CONFLICT');
  }else{
    setPhase('SYNCED');
  }

  return {ok:conflicts.length===0,reason,pull,push,conflicts};
}

async function syncNow(reason='manual'){
  if(working)return {ok:false,skipped:'BUSY'};
  const m=getMeta();
  if(!currentUser)return {ok:false,skipped:'SIGNED_OUT'};
  if(!m.bootstrapped)return {ok:false,skipped:'NOT_BOOTSTRAPPED'};

  working=true;action='sync';setPhase(navigator.onLine?'SYNCING':'OFFLINE');
  try{
    return await syncPass(reason,0);
  }catch(err){
    setPhase('ERROR',humanError(err));
    throw err;
  }finally{
    working=false;action='';emit();
  }
}

async function useCloudCopy(){
  return downloadCloud();
}
async function replaceCloudWithThisDevice(){
  return uploadMaster();
}

function setAutoSync(enabled){
  const m=saveMeta({autoSync:Boolean(enabled)});
  if(m.autoSync&&m.bootstrapped&&currentUser){
    registerManagedSync();
    setTimeout(()=>syncNow('auto-enabled'),100);
  }
  emit();
  return m.autoSync;
}

function subscribe(fn){
  if(typeof fn!=='function')return ()=>{};
  listeners.add(fn);
  try{fn(stateSnapshot())}catch(_){}
  return ()=>listeners.delete(fn);
}

function scheduleLocalSync(){
  if(applyingRemote)return;
  const m=getMeta();
  if(!currentUser||!m.bootstrapped||m.autoSync===false)return;
  clearTimeout(localTimer);
  localTimer=setTimeout(()=>syncNow('local-change').catch(()=>{}),3500);
}

function registerManagedSync(){
  if(managerRegistered)return true;
  const manager=w.AuroraSyncManager;
  if(!manager?.register)return false;
  manager.register(
    'cloud-state',
    ()=>syncNow('managed-sync'),
    {intervalMs:60*1000,critical:false,startup:false,onVisible:true}
  );
  managerRegistered=true;
  return true;
}
function waitForManager(){
  if(registerManagedSync())return;
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(registerManagedSync()||tries>40)clearInterval(timer);
  },250);
}

async function initialise(){
  const session=loadSession();
  if(session){
    currentUser={uid:session.uid,email:session.email||''};
    resetMetaForUser(session.uid);
    try{
      await ensureToken(false);
      await inspectCloud();
      if(getMeta().bootstrapped){
        waitForManager();
        if(getMeta().autoSync!==false)setTimeout(()=>syncNow('startup').catch(()=>{}),650);
      }
    }catch(err){
      // A stale refresh token should not break Aurora itself.
      lastError=humanError(err);
      phase='ERROR';
    }
  }else{
    phase='SIGNED_OUT';
  }

  initComplete=true;
  resolveReady(stateSnapshot());
  emit();
}

w.addEventListener('aurora2:state',scheduleLocalSync);
w.addEventListener('online',()=>{
  if(currentUser&&getMeta().bootstrapped&&getMeta().autoSync!==false){
    setTimeout(()=>syncNow('online').catch(()=>{}),250);
  }
});
w.addEventListener('offline',()=>setPhase('OFFLINE'));
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&currentUser&&getMeta().bootstrapped&&getMeta().autoSync!==false){
    setTimeout(()=>syncNow('foreground').catch(()=>{}),300);
  }
});

w.AuroraCloudSync={
  version:VERSION,
  bundleVersion:BUNDLE_VERSION,
  ready,
  status:stateSnapshot,
  subscribe,
  signIn,
  signOut,
  inspectCloud,
  uploadMaster,
  downloadCloud,
  syncNow,
  useCloudCopy,
  replaceCloudWithThisDevice,
  setAutoSync,
  getDeviceName,
  setDeviceName,
  getDeviceId,
  makeBundle
};

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initialise,{once:true});
}else{
  initialise();
}

})(window);
