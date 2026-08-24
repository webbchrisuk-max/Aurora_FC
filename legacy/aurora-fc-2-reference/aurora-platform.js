(function(w){
'use strict';

const OWNERS=Object.freeze({
  finance:['finance','mission'],
  scouting:['scouting'],
  transfer:['transfer'],
  registration:['registration','squad'],
  squad:[],
  income:['income','portfolio.annualIncome','portfolio.monthlyIncome','portfolio.bestDividendPlayer'],
  nexus:[],
  'club-control':[]
});

const READ_ONLY=new Set(['nexus','squad','club-control']);
const now=()=>new Date().toISOString();
const arr=v=>Array.isArray(v)?v:[];
const num=v=>Number.isFinite(Number(v))?Number(v):0;

function department(){
  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  if(page==='index.html'||page==='')return 'nexus';
  return page.replace(/\.html$/,'');
}

function canWrite(dept,path){
  const d=String(dept||department()).toLowerCase();
  if(READ_ONLY.has(d))return false;
  const roots=OWNERS[d]||[];
  const p=String(path||'');
  return roots.some(root=>p===root||p.startsWith(root+'.'));
}

function integrity(){
  const core=w.Aurora2?.core;
  if(!core?.read)return {ok:false,errors:[{code:'CORE_MISSING',message:'Aurora Core is unavailable.'}],warnings:[],checkedAt:now()};
  return core.validate?core.validate(core.read()):{ok:true,errors:[],warnings:[{code:'LEGACY_CORE',message:'Core validation API is unavailable.'}],checkedAt:now()};
}

function stateSummary(){
  const s=w.Aurora2?.core?.read?.();
  if(!s)return null;
  const holdings=arr(s.squad?.holdings).filter(h=>['ACTIVE','LOCKED'].includes(String(h.status||'').toUpperCase())&&num(h.shares)>0);
  return {
    schemaVersion:s.schemaVersion,
    connection:String(s.connection?.status||'NOT_CONNECTED'),
    activePositions:holdings.length,
    activeTickers:new Set(holdings.map(h=>String(h.ticker||'').toUpperCase()).filter(Boolean)).size,
    financePots:arr(s.finance?.pots).filter(p=>!p.archived).length,
    financeBills:arr(s.finance?.bills).filter(b=>!b.archived).length,
    scoutingTargets:arr(s.scouting?.targets).length,
    routeStatus:s.transfer?.route?.status||null,
    missionStatus:s.mission?.status||null,
    incomeEvents:arr(s.income?.calendar).length,
    updatedAt:s.updatedAt||null
  };
}

function diagnostics(){
  const core=w.Aurora2?.core;
  return {
    at:now(),
    release:w.AuroraRelease||null,
    department:department(),
    ownership:{readOnly:[...READ_ONLY],owners:OWNERS},
    core:core?.diagnostics?.()||null,
    integrity:integrity(),
    state:stateSummary(),
    sync:w.AuroraSyncManager?.status?.()||null
  };
}

w.AuroraPlatform={
  version:1,
  release:'AURORA2_STABLE_CORE_V1',
  OWNERS,
  department,
  canWrite,
  integrity,
  diagnostics
};
})(window);
