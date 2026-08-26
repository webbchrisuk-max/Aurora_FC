(() => {
  'use strict';

  const BUILD = '20260826-nexus-single-render-authority-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const INCOME_SUMMARY_KEY = 'aurora2:income:summary:v1';
  const INCOME_CALENDAR_KEY = 'aurora2:income:calendar-local:v1';
  const TERMINAL = new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED']);
  const PITCH_POSITIONS = [[50,88],[18,72],[39,69],[61,69],[82,72],[28,48],[50,43],[72,48],[18,22],[50,15],[82,22]];

  if (window.__AuroraNexusFinal === BUILD) return;
  window.__AuroraNexusFinal = BUILD;

  const arr = v => Array.isArray(v) ? v : [];
  const raw = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(String(value).replace(/[^0-9.-]/g,''));
    return Number.isFinite(n) ? n : null;
  };
  const num = value => raw(value) ?? 0;
  const upper = value => String(value || '').trim().toUpperCase();
  const ticker = value => upper(value).replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'');
  const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(value));
  const signedMoney = value => `${num(value) > 0 ? '+' : ''}${money(value)}`;
  const pct = value => `${num(value) > 0 ? '+' : ''}${num(value).toFixed(2)}%`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  function readJson(key,fallback=null){ try { return JSON.parse(localStorage.getItem(key)||'null') ?? fallback; } catch(_) { return fallback; } }
  function readState(){
    for(const key of [STATE_KEY,BACKUP_KEY]){
      const state=readJson(key,null);
      if(state && typeof state==='object') return state;
    }
    return {};
  }
  function text(id,value){ const el=document.getElementById(id); if(el) el.textContent=value; }
  function accountCode(value){ const t=String(value||'').toLowerCase(); return t.includes('212')?'T212':t.includes('ig')?'IG':'CHECK'; }
  function activeHolding(row){ return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(row?.status||'ACTIVE')) && num(row?.shares)>0; }

  function holdingMetrics(row){
    const shares=Math.max(0,num(row?.shares));
    const book=Math.max(0,num(row?.bookCostGbp ?? row?.book_cost_gbp ?? row?.costBasisGbp ?? shares*num(row?.avgCostGbp)));
    const price=Math.max(0,num(row?.livePriceGbp ?? row?.priceGbp ?? row?.live_price_gbp));
    const directValue=Math.max(0,num(row?.marketValueGbp ?? row?.currentValueGbp ?? row?.market_value_gbp));
    const value=shares>0 && price>0 ? shares*price : directValue;
    const dps=Math.max(0,num(row?.annualDpsGbp ?? row?.annualDps ?? row?.annual_dps_gbp));
    const directIncome=Math.max(0,num(row?.annualIncomeGbp ?? row?.annual_income_gbp ?? row?.annualIncome));
    const income=shares>0 && dps>0 ? shares*dps : directIncome;
    const dayPct=raw(row?.dailyChangePct ?? row?.dayChangePct ?? row?.todayChangePct ?? row?.changePct ?? row?.daily_change_pct);
    let dayGbp=raw(row?.dailyChangeGbp ?? row?.dayChangeGbp ?? row?.todayChangeGbp ?? row?.changeGbp);
    if(dayGbp===null && dayPct!==null && price>0 && shares>0 && dayPct>-99.9){ const previous=price/(1+dayPct/100); dayGbp=(price-previous)*shares; }
    return {shares,book,price,value,income,profit:value-book,dayPct,dayGbp};
  }

  function portfolio(state){
    const rows=arr(state?.squad?.holdings).filter(activeHolding);
    const map=new Map(); let value=0,book=0,income=0,today=0,todayEvidence=0;
    rows.forEach(row=>{
      const tk=ticker(row?.ticker||row?.name); if(!tk) return;
      const m=holdingMetrics(row); value+=m.value; book+=m.book; income+=m.income;
      if(m.dayGbp!==null){ today+=m.dayGbp; todayEvidence++; }
      const item=map.get(tk)||{ticker:tk,name:row?.name||tk,value:0,book:0,income:0,profit:0,positions:0,accounts:new Set()};
      item.value+=m.value; item.book+=m.book; item.income+=m.income; item.profit+=m.profit; item.positions++; item.accounts.add(accountCode(row?.account)); map.set(tk,item);
    });
    const players=[...map.values()].map(x=>({...x,accounts:[...x.accounts]}));
    const marketToday=raw(state?.market?.portfolioTodayChangeGbp ?? state?.market?.portfolio_today_change_gbp);
    const todayGbp=marketToday!==null?marketToday:(todayEvidence?today:null);
    const marketPct=raw(state?.market?.portfolioTodayChangePct ?? state?.market?.portfolio_today_change_pct);
    const todayPct=marketPct!==null?marketPct:(todayGbp!==null && value-todayGbp>0 ? todayGbp/(value-todayGbp)*100 : null);
    return {rows,players,value,book,income,profit:value-book,todayGbp,todayPct};
  }

  function incomeSummary(state,p){
    const cached=readJson(INCOME_SUMMARY_KEY,{})||{};
    const annual=raw(cached?.annualIncomeGbp ?? cached?.annualIncome ?? cached?.annual) ?? p.income;
    const monthly=raw(cached?.monthlyIncomeGbp ?? cached?.monthlyIncome ?? cached?.monthly) ?? annual/12;
    let next=cached?.nextDividend || cached?.next || null;
    if(!next){
      next=[...arr(state?.income?.calendar),...arr(readJson(INCOME_CALENDAR_KEY,[]))].filter(event=>{
        const key=String(event?.payDate||event?.pay_date||'').slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
        const d=new Date(`${key}T12:00:00`); return d.getTime()>=Date.now()-86400000 && !['CANCELLED','ARCHIVED'].includes(upper(event?.status));
      }).sort((a,b)=>String(a?.payDate||a?.pay_date).localeCompare(String(b?.payDate||b?.pay_date)))[0]||null;
    }
    return {annual,monthly,next};
  }

  function financeSummary(state){
    const finance=state?.finance||{}, plan=finance.plan||{};
    const pot=arr(finance.pots).find(p=>!p?.archived && String(p?.name||'').trim().toLowerCase()==='holding pot');
    let safeRelease=raw(finance?.paydayReleaseCandidate?.releaseAmount ?? finance?.paydayReleaseCandidate?.safeSurplus ?? plan?.releaseAmount) ?? 0;
    let commitments=raw(finance?.paydayReleaseCandidate?.commitments) ?? 0;
    try{
      const control=window.Aurora2?.financePaydayControl;
      if(typeof control?.paydayFundingPreview==='function'){
        const preview=control.paydayFundingPreview(state,plan)?.c;
        if(preview){ safeRelease=Math.max(0,num(preview.safeSurplus)); commitments=Math.max(0,num(preview.commitments)); }
      }
    }catch(_){}
    return {holdingPot:Math.max(0,num(pot?.balance)),safeRelease,commitments,protectedCash:Math.max(0,num(plan?.protectedCash)),paydayDate:String(plan?.paydayDate||'')};
  }

  function missionSummary(state){
    const mission=state?.mission||null,status=upper(mission?.status);
    const active=Boolean(mission && num(mission?.approvedBudget)>0 && !TERMINAL.has(status));
    const route=active && state?.transfer?.route && (!state.transfer.route.missionId || String(state.transfer.route.missionId)===String(mission?.id||'')) ? state.transfer.route : null;
    const allocations=arr(route?.allocations).filter(r=>num(r?.amount)>0);
    const allocated=allocations.reduce((s,r)=>s+num(r?.amount),0)||Math.max(0,num(mission?.amountAllocated));
    const budget=active?Math.max(0,num(mission?.approvedBudget)):0;
    const remaining=active?Math.max(0,num(mission?.amountRemaining ?? budget-allocated)):0;
    return {mission,active,status:active?(status||'DRAFT'):'NO ACTIVE MISSION',route,allocations,budget,allocated,remaining,strategy:String(mission?.strategy||state?.scouting?.strategy||state?.transfer?.selectedStrategy||'Not selected')};
  }

  function scoutingSummary(state){
    const targets=arr(state?.scouting?.targets);
    const ready=targets.filter(r=>r?.eligibleForTransfer===true && ['PASS','CAUTION','READY','APPROVED'].includes(upper(r?.status||'PASS')));
    const blocked=targets.filter(r=>r?.restricted || ['BLOCK','BLOCKED','RESTRICTED','REJECTED'].includes(upper(r?.status)));
    const best=[...ready].sort((a,b)=>num(b?.score??b?.confidence??b?.sustainableScore??b?.maximumScore)-num(a?.score??a?.confidence??a?.sustainableScore??a?.maximumScore))[0]||null;
    return {targets,ready,blocked,best};
  }

  function registrationSummary(state,m){
    const receipts=arr(state?.registration?.receipts), drafts=arr(state?.transfer?.registrationDrafts);
    const confirmed=receipts.length+drafts.filter(r=>upper(r?.status)==='CONFIRMED').length;
    const missionReceipts=m.active?receipts.filter(r=>String(r?.missionId||'')===String(m.mission?.id||'')):[];
    return {receipts,confirmed,missionReceipts};
  }

  function matchSummary(state,p){
    const md=state?.matchday||state?.matchReport||state?.matchdayReport||{};
    const reports=[md?.latest,md?.report,...arr(md?.reports),...arr(state?.portfolio?.matchdayReports)].filter(Boolean);
    const today=new Date();
    const current=reports.find(row=>{
      const value=row?.report_date||row?.reportDate||row?.generated_at||row?.generatedAt||row?.created_at||row?.createdAt||row?.timestamp||row?.date||'';
      const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?`${value}T12:00:00`:value);
      return !Number.isNaN(d.getTime()) && d.getFullYear()===today.getFullYear() && d.getMonth()===today.getMonth() && d.getDate()===today.getDate();
    });
    if(current) return {status:'FULL TIME',result:String(current?.verdict||current?.market_result||current?.marketResult||current?.result||'FULL TIME').toUpperCase(),summary:String(current?.summary||current?.manager_report||current?.managerReport||'Published Match Report available.')};
    const move=p.todayPct, provisional=move===null?'IN SESSION':move>.05?'WINNING':move<-.05?'LOSING':'LEVEL';
    return {status:today.getHours()>=17?'AWAITING REPORT':'IN SESSION',result:provisional,summary:move===null?'Waiting for enough market evidence to call today’s session.':`${pct(move)} current portfolio movement before the 5PM full-time report.`};
  }

  function syncSummary(){
    const s=window.AuroraBrowserAutoSync?.status?.()||{};
    return {role:String(s?.role||s?.meta?.role||'WAITING').toUpperCase(),error:String(s?.lastError||'')};
  }

  function managerOrder(m,s,f){
    if(m.active){
      if(['LOCKED','PARTIALLY_REGISTERED'].includes(m.status)) return ['Complete Registration','A locked Transfer route is waiting for broker execution to be recorded.','registration.html'];
      if(m.status==='DRAFT') return ['Build the Transfer route',`${money(m.budget)} has been released by Finance and is waiting for allocation.`,'transfer.html'];
      return ['Review active mission',`${m.status.replaceAll('_',' ')} • ${money(m.remaining)} remaining.`,'transfer.html'];
    }
    if(s.best) return [`Scouting has ${ticker(s.best?.ticker||s.best?.name)} ready`,`${s.ready.length} Transfer-eligible target${s.ready.length===1?'':'s'} currently pass the evidence gate.`,'scouting.html'];
    if(f.safeRelease>0) return ['Finance has a safe release',`${money(f.safeRelease)} is available in the current payday forecast, but no mission is active.`,'finance.html'];
    return ['Hold team shape','No urgent mission gate is currently waiting.','match-report.html'];
  }

  function renderLeaders(p){
    const byValue=[...p.players].sort((a,b)=>b.value-a.value), byIncome=[...p.players].sort((a,b)=>b.income-a.income), byProfit=[...p.players].sort((a,b)=>b.profit-a.profit), byDrag=[...p.players].sort((a,b)=>a.profit-b.profit);
    [["nxValueCaptain",byValue[0],r=>money(r.value)],["nxIncomeCaptain",byIncome[0],r=>`${money(r.income)}/yr`],["nxProfitLeader",byProfit[0],r=>`${r.profit>=0?'+':''}${money(r.profit)}`],["nxBiggestDrag",byDrag[0]?.profit<0?byDrag[0]:null,r=>money(r.profit)]].forEach(([prefix,row,value])=>{ text(`${prefix}Ticker`,row?.ticker||'—'); text(`${prefix}Value`,row?value(row):'—'); });
    const broker=new Map([['IG',0],['T212',0],['CHECK',0]]); p.rows.forEach(row=>broker.set(accountCode(row?.account),(broker.get(accountCode(row?.account))||0)+holdingMetrics(row).value));
    const host=document.getElementById('nxBrokerBars'); if(host) host.innerHTML=[...broker.entries()].map(([code,value])=>{ const share=p.value>0?value/p.value*100:0,label=code==='IG'?'IG ISA':code==='T212'?'Trading 212':'Review'; return `<div class="nx-bar-row"><span>${label}</span><div><i style="width:${Math.min(100,share).toFixed(1)}%"></i></div><strong>${share.toFixed(1)}%</strong></div>`; }).join('');
  }

  function renderPitch(p){
    const host=document.getElementById('nxPitchPlayers'); if(!host) return;
    const rows=[...p.players].sort((a,b)=>b.value-a.value).slice(0,11);
    host.innerHTML=rows.map((row,i)=>{ const pos=PITCH_POSITIONS[i]||[50,50]; return `<div class="nx-player" style="left:${pos[0]}%;top:${pos[1]}%" title="${esc(row.name)}"><b>${esc(row.ticker)}</b><span>${esc(money(row.value))}</span></div>`; }).join('');
    text('nxPitchNote',rows.length?`${rows.length} largest unique holdings by current canonical value. Multi-broker positions are combined.`:'Starting XI will appear when canonical Squad holdings are available.');
  }

  function render(){
    const state=readState(), p=portfolio(state), income=incomeSummary(state,p), f=financeSummary(state), m=missionSummary(state), s=scoutingSummary(state), r=registrationSummary(state,m), match=matchSummary(state,p), sync=syncSummary(), order=managerOrder(m,s,f);

    text('nxManagerOrder',order[0]); text('nxManagerNote',order[1]); const managerLink=document.getElementById('nxManagerLink'); if(managerLink) managerLink.href=order[2];
    text('nxPortfolioValue',money(p.value)); text('nxPortfolioMeta',`${p.players.length} players • ${p.rows.length} account positions`);
    text('nxTodayMove',p.todayGbp===null?'Awaiting feed':signedMoney(p.todayGbp)); text('nxTodayMoveMeta',p.todayPct===null?'Daily evidence incomplete':pct(p.todayPct));
    const move=document.getElementById('nxTodayMove'); if(move){ move.classList.remove('good','bad'); if(num(p.todayGbp)>0) move.classList.add('good'); else if(num(p.todayGbp)<0) move.classList.add('bad'); }

    // One income authority everywhere on Nexus.
    text('nxAnnualIncome',money(income.annual)); text('nxMonthlyIncome',`${money(income.monthly)} / month`);
    text('nxIncomeMonthly',`${money(income.monthly)}/m`); text('nxIncomeAnnualSide',`${money(income.annual)}/yr`);
    const p625=Math.max(0,Math.min(100,income.monthly/625*100)), p2000=Math.max(0,Math.min(100,income.monthly/2000*100));
    const b625=document.getElementById('nxProgress625'); if(b625) b625.style.width=`${p625}%`; const b2000=document.getElementById('nxProgress2000'); if(b2000) b2000.style.width=`${p2000}%`;
    text('nxProgress625Text',`${p625.toFixed(1)}%`); text('nxProgress2000Text',`${p2000.toFixed(1)}%`);
    const next=income.next; text('nxNextDividend',next ? (typeof next==='string'?next:`${ticker(next?.ticker||next?.name)||'Dividend'} • ${String(next?.payDate||next?.pay_date||'').slice(0,10)||'date pending'}`) : 'Calendar building');

    text('nxHoldingPotHero',money(f.holdingPot)); text('nxSafeReleaseHero',money(f.safeRelease)); text('nxHoldingPot',money(f.holdingPot)); text('nxSafeRelease',money(f.safeRelease)); text('nxProtectedCash',money(f.protectedCash)); text('nxPaydayDate',f.paydayDate||'—');
    text('nxMissionStatus',m.status.replaceAll('_',' ')); text('nxMissionBudget',money(m.budget)); text('nxMissionAllocated',money(m.allocated)); text('nxMissionRemaining',money(m.remaining)); text('nxMissionStrategy',m.strategy);
    const route=document.getElementById('nxRouteStatus'); if(route) route.textContent=m.active?`${m.allocations.length} allocation leg${m.allocations.length===1?'':'s'} • ${m.route?.locked===true?'route locked':'route not yet locked'} • mission ${m.mission?.id||'active'}.`:'Finance and Transfer are clear. No active investment mission is currently consuming the next payday forecast.';

    text('nxFinanceStatus',money(f.safeRelease)); text('nxFinanceMeta',`Safe release • Holding Pot ${money(f.holdingPot)}`);
    text('nxScoutingStatus',s.ready.length?`${s.ready.length} READY`:'MONITORING'); text('nxScoutingMeta',s.best?`${ticker(s.best?.ticker||s.best?.name)} leads the eligible list`:`${s.blocked.length} restricted • ${s.targets.length} tracked`);
    text('nxTransferStatus',m.status.replaceAll('_',' ')); text('nxTransferMeta',m.active?`${money(m.budget)} budget • ${m.allocations.length} route leg${m.allocations.length===1?'':'s'}`:'No live Finance mission');
    text('nxRegistrationStatus',r.confirmed?`${r.confirmed} RECEIPT${r.confirmed===1?'':'S'}`:'READY'); text('nxRegistrationMeta',m.active?`${r.missionReceipts.length} receipt${r.missionReceipts.length===1?'':'s'} on current mission`:'Broker execution truth');
    text('nxSquadStatus',`${p.players.length} PLAYERS`); text('nxSquadMeta',`${money(p.value)} canonical value`); text('nxIncomeStatus',`${money(income.monthly)}/m`); text('nxIncomeMeta',`${money(income.annual)} annual forward income`);
    text('nxMatchStatus',match.status); text('nxMatchMeta',match.result); text('nxMatchReportStatus',match.status); text('nxMatchResult',match.result); text('nxMatchSummary',match.summary);
    text('nxSystemStatus',sync.role==='MASTER'?'MASTER':sync.role==='FOLLOWER'?'FOLLOWER':'CHECKING'); text('nxSystemMeta',sync.error?'Auto sync needs attention':'Browser state protection active');
    text('nxHealthState',state?.schemaVersion?`Schema ${state.schemaVersion}`:'State connected'); text('nxHealthSquad',`${p.rows.length} positions`); text('nxHealthSync',sync.role||'WAITING'); text('nxHealthUpdated',state?.updatedAt?new Date(state.updatedAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'No timestamp');

    renderLeaders(p); renderPitch(p);
    document.documentElement.dataset.nexusFinal='live';
    document.documentElement.dataset.nexusRenderAuthority=BUILD;
    window.AuroraNexusFinal=Object.freeze({build:BUILD,ready:true,portfolioValue:p.value,annualIncome:income.annual,monthlyIncome:income.monthly,missionStatus:m.status,autoSyncRole:sync.role});

    // Intelligence is a child renderer only. It owns no timers/listeners.
    try { window.AuroraNexusHeadquartersIntelligence?.render?.(state); } catch(err) { console.warn('[Aurora Nexus] intelligence render failed',err); }
  }

  let scheduled=false;
  function schedule(delay=0){
    if(scheduled && delay===0) return;
    if(delay){ setTimeout(()=>schedule(0),delay); return; }
    scheduled=true;
    requestAnimationFrame(()=>{ scheduled=false; render(); });
  }

  function boot(){
    render();
    window.addEventListener('aurora2:state',()=>schedule());
    window.addEventListener('aurora:browser-auto-sync',()=>schedule());
    window.addEventListener('storage',e=>{ if([STATE_KEY,BACKUP_KEY,INCOME_SUMMARY_KEY,INCOME_CALENDAR_KEY].includes(e.key)) schedule(); });
    window.addEventListener('focus',()=>schedule());
    window.addEventListener('pageshow',()=>schedule());
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') schedule(); });
    [400,1200,3000].forEach(schedule);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();