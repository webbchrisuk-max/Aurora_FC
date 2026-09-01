(() => {
  'use strict';

  const BUILD='20260901-squad-live-score-1';
  const upper=v=>String(v||'').trim().toUpperCase();
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const key=r=>`${upper(r?.account)}|${upper(r?.ticker||r?.symbol)}`;

  function scoreText(value){
    const n=num(value);
    const rounded=Math.abs(n)<0.005?0:n;
    return `${rounded>0?'+':''}${rounded.toFixed(2)}`;
  }

  function scoreClass(value){
    const n=num(value);
    return n>0?'profit':n<0?'loss':'flat';
  }

  function apply(){
    const A=window.AuroraClean;
    if(!A)return;
    const state=A.readState();
    const rows=Array.isArray(state?.squad?.holdings)?state.squad.holdings:[];
    const map=new Map(rows.map(r=>[key(r),r]));

    document.querySelectorAll('.squad-pitch-player[data-player-key]').forEach(player=>{
      const row=map.get(String(player.dataset.playerKey||'').toUpperCase());
      if(!row)return;
      const score=row.dailyChangePct ?? row.dayChangePct ?? row.todayChangePct ?? row.daily_change_pct;
      if(score===undefined||score===null||String(score).trim()==='')return;
      const ring=player.querySelector('.squad-form-ring');
      if(!ring)return;
      ring.textContent=scoreText(score);
      ring.classList.remove('profit','loss','flat');
      ring.classList.add(scoreClass(score));
      ring.title=`Today's live move ${scoreText(score)}%`;
      ring.setAttribute('aria-label',`Today's live move ${scoreText(score)} percent`);
    });
  }

  function schedule(){setTimeout(apply,0);setTimeout(apply,100);}
  function boot(){
    schedule();
    window.addEventListener('aurora-clean:state',schedule);
    window.addEventListener('aurora:market-prices',schedule);
    window.addEventListener('pageshow',schedule);
    window.addEventListener('focus',schedule);
    const observer=new MutationObserver(schedule);
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.AuroraSquadLiveScore=Object.freeze({BUILD,apply});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
