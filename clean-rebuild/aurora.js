(() => {
  'use strict';

  const BUILD = '20260829-clean-rebuild-10-sidebar-shell';
  const STATE_KEY = 'aurora-clean:state:v1';
  const LIVE_STATE_KEYS = ['aurora2:state:v1', 'aurora2:state:backup:lastgood'];

  const DEFAULT_STATE = {
    version: 5,
    finance: {
      expectedWages: 2600,
      wagesReceived: 2600,
      availableCash: 2600,
      commitments: 1086.13,
      protectedCash: 300,
      holdingPotBalance: 0,
      holdingPotTarget: 0,
      bills: [],
      pots: [],
      lastSafeRelease: 1213.87,
      lastPlan: null,
      paydayHistory: [],
      stage2Bills: null,
      stage3HoldingPot: null,
      stage4PotFunding: null,
      stage5PaydayDecision: null
    },
    scouting: {strategy:'sustainable', candidates:[], seededAt:null, allocationPlan:null},
    transfer: {mission:null, route:null},
    registration: {receipts:[]},
    squad: {holdings:[], importedAt:null, source:'CLEAN'},
    income: {dividends:[]},
    matchReport: {lastBuiltAt:null, summary:''}
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = value => Number(num(value).toFixed(2));
  const upper = value => String(value || '').trim().toUpperCase();
  const isoNow = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const byId = id => document.getElementById(id);
  const setText = (id,value) => { const el=byId(id); if(el) el.textContent=value; };
  const setHtml = (id,value) => { const el=byId(id); if(el) el.innerHTML=value; };
  const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function normaliseState(input) {
    const source=input&&typeof input==='object'?input:{};
    const next=clone(DEFAULT_STATE);
    Object.assign(next,source);
    next.finance={...clone(DEFAULT_STATE.finance),...(source.finance||{})};
    next.finance.bills=Array.isArray(source.finance?.bills)?source.finance.bills:[];
    next.finance.pots=Array.isArray(source.finance?.pots)?source.finance.pots:[];
    next.finance.paydayHistory=Array.isArray(source.finance?.paydayHistory)?source.finance.paydayHistory:[];
    next.scouting={...clone(DEFAULT_STATE.scouting),...(source.scouting||{})};
    next.scouting.candidates=Array.isArray(source.scouting?.candidates)?source.scouting.candidates:[];
    next.transfer={...clone(DEFAULT_STATE.transfer),...(source.transfer||{})};
    next.registration={...clone(DEFAULT_STATE.registration),...(source.registration||{})};
    next.registration.receipts=Array.isArray(source.registration?.receipts)?source.registration.receipts:[];
    next.squad={...clone(DEFAULT_STATE.squad),...(source.squad||{})};
    next.squad.holdings=Array.isArray(source.squad?.holdings)?source.squad.holdings:[];
    next.income={...clone(DEFAULT_STATE.income),...(source.income||{})};
    next.income.dividends=Array.isArray(source.income?.dividends)?source.income.dividends:[];
    next.matchReport={...clone(DEFAULT_STATE.matchReport),...(source.matchReport||{})};
    next.version=5;
    return next;
  }

  function readState(){
    try{return normaliseState(JSON.parse(localStorage.getItem(STATE_KEY)||'null'));}
    catch(_){return clone(DEFAULT_STATE);}
  }
  function writeState(next){
    const clean=normaliseState(next);
    localStorage.setItem(STATE_KEY,JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent('aurora-clean:state',{detail:clean}));
    return clean;
  }
  function updateState(mutator){const state=readState();mutator(state);return writeState(state);}

  function readLiveAuroraState(){
    for(const key of LIVE_STATE_KEYS){
      try{const parsed=JSON.parse(localStorage.getItem(key)||'null');if(parsed&&typeof parsed==='object')return{key,state:parsed};}
      catch(_){}
    }
    return null;
  }

  function missionIsActive(mission){return !!mission&&!['COMPLETE','CANCELLED'].includes(upper(mission.status))&&num(mission.budget)>0;}
  function releasedMissionBudget(state){return missionIsActive(state?.transfer?.mission)?round2(Math.max(0,num(state.transfer.mission.budget))):0;}

  function financeSummary(finance){
    const frozen=finance?.stage5PaydayDecision;
    if(frozen&&Number.isFinite(num(frozen.maximumSafeRelease))){
      return {
        availableCash:round2(frozen.availableCash),
        commitments:round2(frozen.commitments),
        billsDue:round2(frozen.currentAccountBills),
        holdingBalance:round2(finance.holdingPotBalance),
        holdingTarget:round2(finance.holdingPotTarget),
        holdingTopUp:round2(frozen.holdingSafetyTopUp),
        potsDue:round2(frozen.potFunding),
        protectedCash:round2(frozen.protectedCash),
        totalReserved:round2(frozen.totalReserved),
        safeSurplus:round2(frozen.maximumSafeRelease)
      };
    }
    const availableCash=Math.max(0,num(finance?.availableCash));
    const commitments=Math.max(0,num(finance?.commitments));
    const protectedCash=Math.max(0,num(finance?.protectedCash));
    return {availableCash:round2(availableCash),commitments:round2(commitments),billsDue:0,holdingBalance:round2(finance?.holdingPotBalance),holdingTarget:round2(finance?.holdingPotTarget),holdingTopUp:0,potsDue:0,protectedCash:round2(protectedCash),totalReserved:round2(commitments+protectedCash),safeSurplus:round2(Math.max(0,availableCash-commitments-protectedCash))};
  }
  function safeRelease(finance){return financeSummary(finance).safeSurplus;}

  function activeLiveHolding(row){
    const status=upper(row?.status||'ACTIVE');
    return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(status)&&num(row?.shares)>0;
  }
  function normaliseHolding(row){
    const shares=Math.max(0,num(row?.shares));
    const bookCostGbp=Math.max(0,num(row?.bookCostGbp??row?.book_cost_gbp??row?.costBasisGbp));
    const avgCostGbp=Math.max(0,num(row?.avgCostGbp??row?.averageCostGbp??(shares>0?bookCostGbp/shares:0)));
    const livePriceGbp=Math.max(0,num(row?.livePriceGbp??row?.priceGbp??row?.live_price_gbp));
    const marketValueGbp=Math.max(0,num(row?.marketValueGbp??row?.currentValueGbp??(shares*livePriceGbp)));
    const annualDpsGbp=Math.max(0,num(row?.annualDpsGbp??row?.annualDps??row?.annual_dps_gbp));
    const annualIncomeGbp=Math.max(0,num(row?.annualIncomeGbp??row?.annual_income_gbp??(shares*annualDpsGbp)));
    return {holdingId:String(row?.holdingId||row?.holding_id||''),account:String(row?.account||row?.broker||'Unspecified'),ticker:String(row?.ticker||row?.symbol||'').replace(/^LON:/i,'').replace(/\.L$/i,'').toUpperCase(),name:String(row?.name||row?.company||row?.ticker||''),shares,bookCostGbp,avgCostGbp,livePriceGbp,marketValueGbp,annualDpsGbp,annualIncomeGbp,sector:String(row?.sector||''),role:String(row?.role||''),status:upper(row?.status||'ACTIVE'),locked:row?.locked===true,lockReason:String(row?.lockReason||'')};
  }
  function importRealHoldings(){
    const live=readLiveAuroraState();
    const rows=Array.isArray(live?.state?.squad?.holdings)?live.state.squad.holdings:[];
    const holdings=rows.filter(activeLiveHolding).map(normaliseHolding).filter(row=>row.ticker&&row.shares>0);
    if(!holdings.length)return{ok:false,count:0,message:'No active holdings were found in the live Aurora browser state.'};
    updateState(state=>{state.squad.holdings=holdings;state.squad.importedAt=isoNow();state.squad.source=live.key;});
    return{ok:true,count:holdings.length,message:`Imported ${holdings.length} active account position(s) from live Aurora.`};
  }

  function holdingAnnualIncome(row){
    const direct=Math.max(0,num(row?.annualIncomeGbp));
    return direct>0?direct:Math.max(0,num(row?.shares))*Math.max(0,num(row?.annualDpsGbp));
  }
  function annualIncome(state){return(state.squad?.holdings||[]).reduce((sum,row)=>sum+holdingAnnualIncome(row),0);}

  function pageLinks(){return[['index.html','🏠 Nexus'],['finance.html','💷 Finance Department'],['scouting.html','🔎 Scouting Centre'],['transfer.html','🔁 Transfer Centre'],['registration.html','🧾 Registration Desk'],['squad.html','⚽ Squad Hub'],['income.html','📈 Income Centre'],['match-report.html','📋 Match Report'],['club-control.html','🧠 Club Control'],['system-health.html','🩺 System Health']];}
  function currentPageFile(){return String(location.pathname.split('/').pop()||'index.html').toLowerCase()||'index.html';}
  function ensureSidebarAssets(){
    if(!document.querySelector('link[data-aurora-sidebar]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='aurora-sidebar.css?v=20260829-aurora-sidebar-1';link.dataset.auroraSidebar='style';document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-aurora-sidebar]')){
      const script=document.createElement('script');script.src='aurora-sidebar.js?v=20260829-aurora-sidebar-1';script.defer=true;script.dataset.auroraSidebar='script';document.head.appendChild(script);
    }
  }
  function renderNavigation(){
    const nav=byId('auroraNav');if(!nav)return;
    const current=currentPageFile();
    const links=pageLinks().map(([href,label])=>{const active=href===current;return`<a href="${href}"${active?' aria-current="page"':''}>${active?'<strong>':''}${esc(label)}${active?'</strong>':''}</a>`;}).join('');
    nav.setAttribute('aria-label','Aurora Clean navigation');
    nav.innerHTML=`<details id="auroraCleanMenu"><summary>☰ Aurora Menu</summary><div role="navigation" aria-label="Aurora departments">${links}</div></details>`;
    ensureSidebarAssets();
  }

  function renderNexus(){
    const state=readState(),income=annualIncome(state),mission=state.transfer.mission;
    setText('nexusFinance',`Stage 5 safe release ${money(safeRelease(state.finance))}`);
    setText('nexusScouting',`${state.scouting.candidates.filter(x=>x.approved).length} approved candidate(s)`);
    setText('nexusTransfer',mission?`${mission.status} ${money(mission.budget)}`:'No mission');
    setText('nexusRegistration',`${state.registration.receipts.length} receipt(s)`);
    setText('nexusSquad',`${state.squad.holdings.length} account position(s)`);
    setText('nexusIncome',`${money(income)} annual / ${money(income/12)} monthly`);
  }

  function aggregateSquadByTicker(state){
    const map=new Map();
    (state.squad?.holdings||[]).forEach(row=>{
      const ticker=upper(row?.ticker);if(!ticker)return;
      const current=map.get(ticker)||{ticker,name:String(row?.name||ticker),sector:String(row?.sector||''),bookCostGbp:0,marketValueGbp:0,annualIncomeGbp:0};
      current.bookCostGbp+=Math.max(0,num(row?.bookCostGbp));
      current.marketValueGbp+=Math.max(0,num(row?.marketValueGbp||(num(row?.shares)*num(row?.livePriceGbp))));
      current.annualIncomeGbp+=holdingAnnualIncome(row);
      if(!current.sector&&row?.sector)current.sector=String(row.sector);
      map.set(ticker,current);
    });
    return[...map.values()];
  }

  function seedScoutingFromSquad(){
    let state=readState();
    if(!(state.squad?.holdings||[]).length){importRealHoldings();state=readState();}
    const positions=state.squad?.holdings||[],aggregates=aggregateSquadByTicker(state);
    if(!aggregates.length){const message='No Squad holdings are available to seed.';updateState(next=>{next.scouting.seedMessage=message;});return{ok:false,count:0,positions:0,message};}
    const message=`Seeded ${aggregates.length} unique candidate(s) from ${positions.length} Squad position(s).`;
    updateState(next=>{
      aggregates.forEach(row=>{
        const yieldPct=row.bookCostGbp>0?(row.annualIncomeGbp/row.bookCostGbp)*100:0;
        const existing=next.scouting.candidates.find(candidate=>upper(candidate.ticker)===row.ticker);
        const candidate={id:existing?.id||`SCOUT-${row.ticker}`,ticker:row.ticker,name:row.name||row.ticker,sector:row.sector||existing?.sector||'',yieldPct:Number(yieldPct.toFixed(4)),source:'SQUAD',approved:!!existing?.approved,updatedAt:isoNow()};
        if(existing)Object.assign(existing,candidate);else next.scouting.candidates.push(candidate);
      });
      next.scouting.seededAt=isoNow();next.scouting.seedMessage=message;
    });
    return{ok:true,count:aggregates.length,positions:positions.length,message};
  }

  function scoutingRankings(state){
    const budget=releasedMissionBudget(state);
    const portfolioRows=aggregateSquadByTicker(state),portfolioBook=portfolioRows.reduce((sum,row)=>sum+row.bookCostGbp,0),sectorBook=new Map();
    portfolioRows.forEach(row=>{const sector=String(row.sector||'').trim();if(sector)sectorBook.set(sector,(sectorBook.get(sector)||0)+row.bookCostGbp);});
    const strategy=state.scouting.strategy==='maximum'?'maximum':'sustainable';
    return(state.scouting.candidates||[]).filter(row=>upper(row.ticker)).map(row=>{
      const ticker=upper(row.ticker),held=portfolioRows.find(item=>item.ticker===ticker),yieldPct=Math.max(0,num(row.yieldPct)),exposurePct=portfolioBook>0&&held?(held.bookCostGbp/portfolioBook)*100:0,sector=String(row.sector||held?.sector||'').trim(),sectorExposurePct=portfolioBook>0&&sector?((sectorBook.get(sector)||0)/portfolioBook)*100:0;
      const yieldScore=Math.min(100,(yieldPct/12)*100),concentrationScore=held?Math.max(0,100-(exposurePct*3.25)):100,diversificationScore=sector?Math.max(0,100-(sectorExposurePct*2.4)):(held?45:70),sourceScore=row.source==='SQUAD'?100:75;
      const score=strategy==='maximum'?(yieldScore*.82)+(concentrationScore*.10)+(diversificationScore*.05)+(sourceScore*.03):(yieldScore*.55)+(concentrationScore*.20)+(diversificationScore*.15)+(sourceScore*.10);
      return{...row,ticker,sector,yieldPct,exposurePct,sectorExposurePct,expectedAnnualIncome:Number((budget*yieldPct/100).toFixed(2)),score:Number(score.toFixed(1)),held:!!held};
    }).sort((a,b)=>b.score-a.score||b.expectedAnnualIncome-a.expectedAnnualIncome||a.ticker.localeCompare(b.ticker));
  }

  function renderScouting(){
    const state=readState(),strategy=state.scouting.strategy==='maximum'?'maximum':'sustainable',budget=releasedMissionBudget(state),rows=scoutingRankings(state);
    if(byId('scoutingStrategy'))byId('scoutingStrategy').value=strategy;
    setText('scoutingBudget',money(budget));
    setText('scoutingUniverseCount',String(rows.length));
    setText('scoutingStrategyNote',strategy==='maximum'?'Maximum Income heavily rewards immediate forward yield while still applying a small concentration check.':'Sustainable balances forward income with current holding concentration and diversification.');
    if(rows.length){const top=rows[0];setText('scoutingTopPick',`${top.ticker} · ${top.score.toFixed(1)}`);setText('scoutingTopPickDetail',budget>0?`${top.yieldPct.toFixed(2)}% yield · ${money(top.expectedAnnualIncome)} estimated annual income if the full released mission budget went here.`:`${top.yieldPct.toFixed(2)}% yield · waiting for Finance Stage 6 mission.`);}else{setText('scoutingTopPick','Waiting for candidates');setText('scoutingTopPickDetail','Load the Aurora universe to rank candidates.');}
    setText('scoutingSeedStatus',state.scouting.seedMessage||(state.scouting.seededAt?`Squad universe last seeded ${new Date(state.scouting.seededAt).toLocaleString('en-GB')}.`:'No squad seed run yet.'));
    setHtml('scoutingRows',rows.length?rows.map((row,index)=>`<li class="scouting-rank-card${index===0?' top-pick':''}"><div class="scouting-rank-main"><span class="scouting-rank-number">#${index+1}</span><div><strong>${esc(row.ticker)} · ${esc(row.name||row.ticker)}</strong><small>${esc(row.source==='SQUAD'?'Current holding':'External candidate')}${row.sector?` · ${esc(row.sector)}`:''}${row.held?` · ${row.exposurePct<0.1&&row.exposurePct>0?'<0.1':row.exposurePct.toFixed(1)}% current book exposure`:''}</small></div></div><div class="scouting-rank-metric"><span>YIELD</span><strong>${row.yieldPct.toFixed(2)}%</strong></div><div class="scouting-rank-metric"><span>INCOME ON ${money(budget)}</span><strong>${money(row.expectedAnnualIncome)}</strong></div><div class="scouting-rank-metric"><span>SCORE</span><strong>${row.score.toFixed(1)}</strong></div><div class="scouting-rank-actions"><button type="button" data-approve-scout="${esc(row.id||row.ticker)}">${row.approved?'Approved ✓':'Approve'}</button><button type="button" class="secondary" data-remove-scout="${esc(row.id||row.ticker)}">Remove</button></div></li>`).join(''):'<li class="scouting-empty">No candidates yet.</li>');
  }

  function bindScouting(){
    byId('scoutingStrategy')?.addEventListener('change',event=>{updateState(state=>{state.scouting.strategy=event.target.value==='maximum'?'maximum':'sustainable';state.scouting.allocationPlan=null;});});
    byId('scoutingSeedSquad')?.addEventListener('click',()=>{seedScoutingFromSquad();});
    byId('addCandidate')?.addEventListener('click',()=>{
      const ticker=upper(byId('candidateTicker')?.value),name=String(byId('candidateName')?.value||'').trim(),yieldPct=Math.max(0,num(byId('candidateYield')?.value)),sector=String(byId('candidateSector')?.value||'').trim();if(!ticker||yieldPct<=0)return;
      updateState(state=>{const existing=state.scouting.candidates.find(row=>upper(row.ticker)===ticker),next={id:existing?.id||uid('SCOUT'),ticker,name:name||existing?.name||ticker,sector:sector||existing?.sector||'',yieldPct:Number(yieldPct.toFixed(4)),source:'MANUAL',approved:!!existing?.approved,updatedAt:isoNow()};if(existing)Object.assign(existing,next);else state.scouting.candidates.push(next);state.scouting.allocationPlan=null;});
      ['candidateTicker','candidateName','candidateYield','candidateSector'].forEach(id=>{if(byId(id))byId(id).value='';});
    });
    byId('scoutingRows')?.addEventListener('click',event=>{
      const approve=event.target.closest('[data-approve-scout]'),remove=event.target.closest('[data-remove-scout]');if(!approve&&!remove)return;
      const key=String((approve||remove).dataset.approveScout||(approve||remove).dataset.removeScout||'');
      updateState(state=>{const index=state.scouting.candidates.findIndex(row=>String(row.id||row.ticker)===key);if(index<0)return;if(approve)state.scouting.candidates[index].approved=!state.scouting.candidates[index].approved;if(remove)state.scouting.candidates.splice(index,1);state.scouting.allocationPlan=null;});
    });
  }

  function renderSquad(){
    const state=readState(),sourceRows=state.squad.holdings||[],totalBook=sourceRows.reduce((sum,row)=>sum+Math.max(0,num(row.bookCostGbp)),0),totalValue=sourceRows.reduce((sum,row)=>sum+Math.max(0,num(row.marketValueGbp||(num(row.shares)*num(row.livePriceGbp)))),0),totalIncome=sourceRows.reduce((sum,row)=>sum+holdingAnnualIncome(row),0),rows=[...sourceRows].sort((a,b)=>holdingAnnualIncome(b)-holdingAnnualIncome(a)||String(a.ticker||'').localeCompare(String(b.ticker||'')));
    setText('squadCount',`${sourceRows.length} account position(s)`);setText('squadSource',state.squad.importedAt?`Source: live Aurora browser state • imported ${new Date(state.squad.importedAt).toLocaleString('en-GB')}`:'Source: clean rebuild only');setText('squadTotals',`Book ${money(totalBook)} • Market ${money(totalValue)} • Annual income ${money(totalIncome)}`);
    setHtml('squadRows',rows.length?rows.map(row=>`<li class="holding-card"><div class="holding-head"><div><span class="holding-ticker">${esc(row.ticker)}</span><strong class="holding-name">${esc(row.name)}</strong></div><span class="holding-broker">${esc(row.account||'Unspecified')}</span></div><div class="holding-metrics"><div class="holding-metric"><span>SHARES</span><strong>${num(row.shares).toFixed(4)}</strong></div><div class="holding-metric"><span>BOOK VALUE</span><strong>${money(row.bookCostGbp)}</strong></div><div class="holding-metric"><span>ANNUAL INCOME</span><strong>${money(holdingAnnualIncome(row))}</strong></div></div></li>`).join(''):'<li>No holdings yet.</li>');
  }
  function bindSquad(){byId('squadImportReal')?.addEventListener('click',()=>{const result=importRealHoldings();setText('squadImportStatus',result.message);});}

  function renderIncome(){const state=readState(),annual=annualIncome(state);setText('incomeAnnual',money(annual));setText('incomeMonthly',money(annual/12));setHtml('incomeDividendRows',state.income.dividends.length?state.income.dividends.map(row=>`<li>${esc(row.ticker)} — ${esc(row.payDate)} — ${money(row.amount)}</li>`).join(''):'<li>No dividend events yet.</li>');}
  function bindIncome(){byId('addDividend')?.addEventListener('click',()=>{const ticker=upper(byId('dividendTicker')?.value),payDate=String(byId('dividendDate')?.value||'').trim(),amount=Math.max(0,num(byId('dividendAmount')?.value));if(!ticker||!payDate)return;updateState(state=>state.income.dividends.push({ticker,payDate,amount}));});}

  function renderRegistration(){const state=readState(),route=state.transfer.route;setText('registrationStatus',route?.locked?'Locked route ready to register':'No locked route');setHtml('registrationRows',route?.locked?route.allocations.map(row=>`<li>${esc(row.ticker)} — ${money(row.amount)}</li>`).join(''):'<li>No executable route.</li>');setText('registrationReceipts',`${state.registration.receipts.length} receipt(s) recorded`);}
  function bindRegistration(){byId('registerRoute')?.addEventListener('click',()=>{updateState(state=>{const route=state.transfer.route;if(!route?.locked||upper(state.transfer.mission?.status)==='COMPLETE')return;route.allocations.forEach(row=>state.registration.receipts.push({id:uid('RECEIPT'),ticker:row.ticker,name:row.name,amount:row.amount,registeredAt:isoNow()}));state.transfer.mission.status='COMPLETE';state.transfer.mission.updatedAt=isoNow();});});}

  function renderMatchReport(){const state=readState(),annual=annualIncome(state);setText('matchSummary',`Holdings: ${state.squad.holdings.length}. Annual income: ${money(annual)}. Transfer mission: ${state.transfer.mission?.status||'NONE'}.`);}
  function bindMatchReport(){byId('buildMatchReport')?.addEventListener('click',()=>{updateState(state=>{const annual=annualIncome(state);state.matchReport.lastBuiltAt=isoNow();state.matchReport.summary=`Holdings ${state.squad.holdings.length}; annual income ${money(annual)}; mission ${state.transfer.mission?.status||'NONE'}.`;});});}

  function renderClubControl(){setText('controlBuild',BUILD);setText('controlStorageKey',STATE_KEY);}
  function bindClubControl(){byId('resetCleanState')?.addEventListener('click',()=>{localStorage.removeItem(STATE_KEY);writeState(clone(DEFAULT_STATE));location.reload();});}

  function renderSystemHealth(){
    const state=readState(),f=financeSummary(state.finance),mission=state.transfer.mission,checks=[['State readable',!!state],['Finance Stage 5 present',!!state.finance?.stage5PaydayDecision],['Finance calculation valid',Number.isFinite(f.safeSurplus)&&f.safeSurplus>=0],['Finance mission matches Stage 5',!mission||!missionIsActive(mission)||Math.abs(num(mission.budget)-num(state.finance?.stage5PaydayDecision?.maximumSafeRelease))<0.01],['Scouting present',!!state.scouting],['Scouting ranking valid',scoutingRankings(state).every((row,index,rows)=>Number.isFinite(row.score)&&(index===0||rows[index-1].score>=row.score))],['Transfer present',!!state.transfer],['Registration present',!!state.registration],['Squad present',!!state.squad],['Squad holdings valid',Array.isArray(state.squad.holdings)&&state.squad.holdings.every(row=>row.ticker&&num(row.shares)>=0)],['Income present',!!state.income]];
    setHtml('healthRows',checks.map(([label,ok])=>`<li>${esc(label)} — ${ok?'PASS':'FAIL'}</li>`).join(''));setText('healthBuild',BUILD);
  }

  const pages={
    nexus:[renderNexus,null],
    finance:[null,null],
    scouting:[renderScouting,bindScouting],
    transfer:[null,null],
    registration:[renderRegistration,bindRegistration],
    squad:[renderSquad,bindSquad],
    income:[renderIncome,bindIncome],
    'match-report':[renderMatchReport,bindMatchReport],
    'club-control':[renderClubControl,bindClubControl],
    'system-health':[renderSystemHealth,null]
  };

  function boot(){
    renderNavigation();
    window.AuroraClean=Object.freeze({BUILD,STATE_KEY,readState,writeState,updateState,safeRelease,financeSummary,releasedMissionBudget,annualIncome,importRealHoldings,scoutingRankings,seedScoutingFromSquad});
    const page=document.body?.dataset?.page||'',handlers=pages[page];if(!handlers)return;
    handlers[1]?.();handlers[0]?.();
    if(handlers[0])window.addEventListener('aurora-clean:state',handlers[0]);
    if(handlers[0])window.addEventListener('storage',event=>{if(event.key===STATE_KEY)handlers[0]?.();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();