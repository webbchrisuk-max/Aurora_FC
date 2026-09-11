(() => {
  'use strict';

  const BUILD='20260911-scouting-verdict-reasons-1';
  const upper=v=>String(v||'').trim().toUpperCase();
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};

  function reasonFor(row){
    if(!row)return'';
    const verdict=upper(row.verdict);
    if(verdict==='BUY'||verdict==='STRONG BUY')return'';

    const readiness=upper(row.readiness);
    if(readiness&&readiness!=='COMPLETE')return readiness;

    if(row.decisionState?.block)return'DECISION ENGINE VETO';
    if(row.decisionState?.watch)return'DECISION ENGINE WATCH';
    if(upper(row.risk)==='HIGH')return'HIGH PAYOUT RISK';
    if(upper(row.risk)==='UNKNOWN')return'NEEDS PAYOUT RISK';
    if(!(num(row.livePriceGbp)>0&&num(row.fairValueGbp)>0))return'NEEDS FAIR VALUE';
    if(num(row.upsidePct)<-10)return'OVERVALUED · >10% ABOVE FAIR VALUE';
    if(num(row.buyStrength)<=0)return'NEEDS BUY STRENGTH';
    if(num(row.networkScore)<68)return'SCORE BELOW BUY THRESHOLD';
    if(num(row.buyStrength)<50)return'BUY STRENGTH BELOW BUY GATE';
    return'WATCH · BUY GATES NOT YET PASSED';
  }

  function apply(){
    const net=window.AuroraScoutingNetwork,A=window.AuroraClean;
    if(!net?.rankings||!A?.readState)return;
    const rows=net.rankings(A.readState());
    const byTicker=new Map(rows.map(r=>[upper(r.ticker),r]));

    document.querySelectorAll('.scout-table tbody tr').forEach(tr=>{
      const tickerEl=tr.querySelector('[data-scout-ticker]');
      const verdictEl=tr.querySelector('.scout-verdict');
      if(!tickerEl||!verdictEl)return;
      const row=byTicker.get(upper(tickerEl.dataset.scoutTicker||tickerEl.textContent));
      if(!row)return;
      const verdict=upper(row.verdict);
      const cell=verdictEl.closest('td');
      if(!cell)return;
      cell.querySelectorAll('.scout-verdict-reason').forEach(el=>el.remove());
      if(verdict==='BUY'||verdict==='STRONG BUY')return;
      const reason=reasonFor(row);
      if(!reason)return;
      const sub=document.createElement('span');
      sub.className='scout-sub scout-verdict-reason';
      sub.textContent=reason;
      cell.appendChild(sub);
      verdictEl.title=reason;
    });
  }

  function boot(){
    if(!window.AuroraClean||!window.AuroraScoutingNetwork){setTimeout(boot,80);return;}
    apply();
    const host=document.getElementById('scoutingNetwork');
    if(host){
      const observer=new MutationObserver(()=>requestAnimationFrame(apply));
      observer.observe(host,{childList:true,subtree:true});
      window.AuroraScoutingVerdictReasonsObserver=observer;
    }
    window.addEventListener('aurora-clean:state',()=>setTimeout(apply,0));
    window.addEventListener('pageshow',apply);
    window.AuroraScoutingVerdictReasons=Object.freeze({BUILD,apply,reasonFor});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
