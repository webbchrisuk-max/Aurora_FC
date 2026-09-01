(() => {
  'use strict';

  const BUILD='20260901-squad-backend-live-score-1';
  const upper=v=>String(v||'').trim().toUpperCase();
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const key=r=>`${upper(r?.account)}|${upper(r?.ticker||r?.symbol)}`;

  function scoreValue(row){
    const raw=row?.dailyChangePct ?? row?.dayChangePct;
    if(raw===undefined||raw===null||String(raw).trim()==='')return null;
    return num(raw);
  }

  function scoreText(value){
    const n=Math.abs(value)<0.005?0:value;
    return `${n>0?'+':''}${n.toFixed(2)}`;
  }

  function scoreClass(value){
    return value>0?'profit':value<0?'loss':'flat';
  }

  function apply(){
    const A=window.AuroraClean;
    if(!A?.readState)return;
    const state=A.readState();
    const rows=Array.isArray(state?.squad?.holdings)?state.squad.holdings:[];
    const map=new Map(rows.map(row=>[key(row),row]));

    document.querySelectorAll('.squad-pitch-player[data-player-key]').forEach(player=>{
      const row=map.get(String(player.dataset.playerKey||'').toUpperCase());
      if(!row)return;
      const score=scoreValue(row);
      if(score===null)return;
      const ring=player.querySelector('.squad-form-ring');
      if(!ring)return;
      ring.textContent=scoreText(score);
      ring.classList.remove('profit','loss','flat');
      ring.classList.add(scoreClass(score));
      ring.title=`Today's live move ${scoreText(score)}%`;
      ring.setAttribute('aria-label',`Today's live move ${scoreText(score)} percent`);
    });
  }

  function schedule(){
    setTimeout(apply,0);
    setTimeout(apply,80);
  }

  function boot(){
    schedule();
    window.addEventListener('aurora-clean:state',schedule);
    window.addEventListener('pageshow',schedule);
    window.addEventListener('focus',schedule);
    window.AuroraSquadBackendLiveScore=Object.freeze({BUILD,apply});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
