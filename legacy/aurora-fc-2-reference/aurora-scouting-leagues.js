(function(w){
'use strict';

/* Presentation authority only: scores and ranks are produced by Scouting. */
const LEAGUES=[
  {id:'champions',name:'Champions League'},
  {id:'premier',name:'Premier League'},
  {id:'championship',name:'Championship'},
  {id:'league-one',name:'League One'}
];
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const arr=v=>Array.isArray(v)?v:[];
const strategy=v=>String(v||'').toLowerCase()==='maximum'?'maximum':'sustainable';

function rankOf(target,lens){
  const rank=num(strategy(lens)==='maximum'?target?.maximumRank:target?.rank);
  return rank>0?rank:Number.MAX_SAFE_INTEGER;
}
function scoreOf(target,lens){
  return num(strategy(lens)==='maximum'?target?.maximumScore:target?.sustainableScore);
}
function ranked(targets,lens){
  return arr(targets).filter(Boolean).slice().sort((a,b)=>
    rankOf(a,lens)-rankOf(b,lens)||scoreOf(b,lens)-scoreOf(a,lens)||
    String(a.ticker||'').localeCompare(String(b.ticker||''))
  );
}
function leagueForPosition(position,total){
  if(position<1||total<1)return null;
  return LEAGUES[Math.min(3,Math.floor((position-1)*4/total))];
}
function table(targets,lens){
  const eligible=ranked(targets,lens).filter(t=>String(t.status||'').toLowerCase()!=='block');
  const positions=new Map(eligible.map((t,i)=>[t,i+1]));
  return ranked(targets,lens).map(target=>{
    const position=positions.get(target)||0;
    return {target,rank:rankOf(target,lens),score:scoreOf(target,lens),position,
      league:leagueForPosition(position,eligible.length)};
  });
}
function incomePerThousand(target){return Math.max(0,num(target?.yieldPct))*10}

w.AuroraScoutingLeagues=Object.freeze({LEAGUES,strategy,rankOf,scoreOf,ranked,leagueForPosition,table,incomePerThousand});
})(window);
