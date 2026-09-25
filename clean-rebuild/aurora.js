(() => {
  'use strict';

  const BUILD = '20260925-shell-10-copilot';
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
      const link=document.createElement('link');link.rel='stylesheet';link.href='aurora-sidebar.css?v=20260904-mobile-nav-7-fullscreen';link.dataset.auroraSidebar='style';document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-aurora-sidebar]')){
      const script=document.createElement('script');script.src='aurora-sidebar.js?v=20260904-mobile-nav-7-fullscreen';script.defer=true;script.dataset.auroraSidebar='script';document.head.appendChild(script);
    }
  }
  function renderNavigation(){
    const nav=byId('auroraNav');if(!nav)return;
    const current=currentPageFile();
    const links=pageLinks().map(([href,label])=>{const active=href===current;return`<a href="${href}"${active?' aria-current="page"':''}>${active?'<strong>':''}${esc(label)}${active?'</strong>':''}</a>`;}).join('');
    nav.setAttribute('aria-label','Aurora Clean navigation');
    nav.innerHTML=`<details id="auroraCleanMenu"><summary>☰ Aurora Menu</summary><div role="navigation" aria-label="Aurora departments">${links}</div></details>`;
    const details=byId('auroraCleanMenu');
    const desktop=window.matchMedia('(min-width:900px)');
    const syncSidebar=()=>{if(details)details.open=desktop.matches;};
    syncSidebar();
    if(desktop.addEventListener)desktop.addEventListener('change',syncSidebar);else desktop.addListener?.(syncSidebar);
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

  const SCOUTING_TICKER_ALIASES=Object.freeze({
    FVJ:'FMG',
    FSUGY:'FMG'
  });
  function canonicalScoutingTicker(value){
    const ticker=upper(value);
    return SCOUTING_TICKER_ALIASES[ticker]||ticker;
  }
  function aggregateSquadByTicker(state){
    const map=new Map();
    (state.squad?.holdings||[]).forEach(row=>{
      const executionTicker=upper(row?.ticker);if(!executionTicker)return;
      const ticker=canonicalScoutingTicker(executionTicker);
      const current=map.get(ticker)||{ticker,name:String(row?.name||ticker),sector:String(row?.sector||''),bookCostGbp:0,marketValueGbp:0,annualIncomeGbp:0,executionTickers:[]};
      current.bookCostGbp+=Math.max(0,num(row?.bookCostGbp));
      current.marketValueGbp+=Math.max(0,num(row?.marketValueGbp||(num(row?.shares)*num(row?.livePriceGbp))));
      current.annualIncomeGbp+=holdingAnnualIncome(row);
      if(!current.sector&&row?.sector)current.sector=String(row.sector);
      if(!current.executionTickers.includes(executionTicker))current.executionTickers.push(executionTicker);
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
    window.AuroraClean=Object.freeze({BUILD,STATE_KEY,readState,writeState,updateState,safeRelease,financeSummary,releasedMissionBudget,annualIncome,importRealHoldings,scoutingRankings,seedScoutingFromSquad,canonicalScoutingTicker,SCOUTING_TICKER_ALIASES});
    const page=document.body?.dataset?.page||'',handlers=pages[page];if(!handlers)return;
    handlers[1]?.();handlers[0]?.();
    if(handlers[0])window.addEventListener('aurora-clean:state',handlers[0]);
    if(handlers[0])window.addEventListener('storage',event=>{if(event.key===STATE_KEY)handlers[0]?.();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* Aurora Assistant · shell-level */
(() => {
  'use strict';

  const ASSISTANT_BUILD='20260925-aurora-copilot-2';
  const SESSION_OPEN='aurora-clean:assistant-open:v2';
  const SESSION_PENDING='aurora-clean:assistant-pending:v2';
  const SESSION_HISTORY='aurora-clean:assistant-history:v2';

  const PAGE_ALIASES={
    'registration-real':'registration',
    'squad-real':'squad',
    'income-real':'income',
    'system-health-real':'system-health'
  };

  const PAGE_URLS={
    nexus:'index.html',
    finance:'finance.html',
    scouting:'scouting.html',
    transfer:'transfer.html',
    registration:'registration.html',
    squad:'squad.html',
    income:'income.html',
    'match-report':'match-report.html',
    'system-health':'system-health.html',
    'club-control':'club-control.html'
  };

  const PAGE_COPY={
    nexus:{eyebrow:'AURORA AI · NEXUS',title:'Nexus co-pilot',message:'I can read the Clean state, find what needs attention and take you to the right department.'},
    finance:{eyebrow:'AURORA AI · FINANCE',title:'Finance co-pilot',message:'Ask about the safe release, ISA allowance, pots, bills, house fund or payday position.'},
    transfer:{eyebrow:'AURORA AI · TRANSFER',title:'Transfer co-pilot',message:'I can explain the current mission, show route status and refresh broker cash. Locks and approvals stay with you.'},
    scouting:{eyebrow:'AURORA AI · SCOUTING',title:'Scouting co-pilot',message:'I can report candidate and plan status, highlight this page and route you into Transfer when you are ready.'},
    registration:{eyebrow:'AURORA AI · REGISTRATION',title:'Registration co-pilot',message:'I can tell you whether a locked route is waiting here and take you back to Transfer or on to Squad.'},
    squad:{eyebrow:'AURORA AI · SQUAD',title:'Squad co-pilot',message:'I can summarise your holdings and forward income, then take you into Income or Match Report.'},
    income:{eyebrow:'AURORA AI · INCOME',title:'Income co-pilot',message:'I can summarise forward income and move between Income, Squad and Match Report.'},
    'match-report':{eyebrow:'AURORA AI · MATCH REPORT',title:'Match Report co-pilot',message:'I can build a fresh report snapshot or take you to the department behind a result.'},
    'system-health':{eyebrow:'AURORA AI · SYSTEM HEALTH',title:'System Health co-pilot',message:'I can run the page’s live service checks and help you jump to the affected department.'},
    'club-control':{eyebrow:'AURORA AI · CLUB CONTROL',title:'Club Control co-pilot',message:'I can explain the clean-chain position and navigate administration without running destructive controls.'}
  };

  const QUICK_ACTIONS={
    nexus:[['What needs attention?','attention'],['Finance','open finance'],['Transfer','open transfer'],['System Health','open system health']],
    finance:[['What needs attention?','attention'],['ISA Allowance','show isa allowance'],['House','show house improvements'],['Payday','show payday']],
    transfer:[['What needs attention?','attention'],['Refresh Broker Cash','refresh broker cash'],['Scouting','open scouting'],['Registration','open registration']],
    scouting:[['What needs attention?','attention'],['Page Status','page status'],['Transfer','open transfer'],['Finance','open finance']],
    registration:[['What needs attention?','attention'],['Page Status','page status'],['Transfer','open transfer'],['Squad','open squad']],
    squad:[['What needs attention?','attention'],['Page Status','page status'],['Income','open income'],['Match Report','open match report']],
    income:[['What needs attention?','attention'],['Page Status','page status'],['Squad','open squad'],['Match Report','open match report']],
    'match-report':[['Build Snapshot','build match report'],['What needs attention?','attention'],['Nexus','open nexus'],['Finance','open finance']],
    'system-health':[['Run Service Checks','run service checks'],['What needs attention?','attention'],['Nexus','open nexus'],['Club Control','open club control']],
    'club-control':[['What needs attention?','attention'],['Nexus','open nexus'],['System Health','open system health'],['Page Status','page status']]
  };

  const money=value=>new Intl.NumberFormat('en-GB',{
    style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2
  }).format(Number(value)||0);

  const upper=value=>String(value||'').trim().toUpperCase();
  const num=value=>{
    const n=Number(String(value??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };

  function pageName(){
    const raw=String(document.body?.dataset?.page||'nexus');
    return PAGE_ALIASES[raw]||raw;
  }

  function safeState(){
    try{return window.AuroraClean?.readState?.()||null;}
    catch(_){return null;}
  }

  function readJSON(key){
    try{return JSON.parse(localStorage.getItem(key)||'null');}
    catch(_){return null;}
  }

  function writeSession(key,value){
    try{sessionStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value));}
    catch(_){}
  }

  function readSession(key){
    try{return sessionStorage.getItem(key);}
    catch(_){return null;}
  }

  function readHistory(){
    try{
      const rows=JSON.parse(readSession(SESSION_HISTORY)||'[]');
      return Array.isArray(rows)?rows.slice(-14):[];
    }catch(_){return[];}
  }

  function saveHistory(rows){
    try{writeSession(SESSION_HISTORY,rows.slice(-14));}
    catch(_){}
  }

  function missionActive(mission){
    return !!mission && !['COMPLETE','CANCELLED'].includes(upper(mission.status)) && num(mission.budget)>0;
  }

  function financeSummary(state){
    try{
      return window.AuroraClean?.financeSummary?.(state?.finance)||null;
    }catch(_){return null;}
  }

  function annualIncome(state){
    try{
      const v=window.AuroraClean?.annualIncome?.(state);
      return Number.isFinite(Number(v))?Number(v):0;
    }catch(_){return 0;}
  }

  function isaSummary(state){
    const tracker=state?.finance?.isaTracker||readJSON('aurora-clean:isa-tracker-v1')||{};
    const annual=Math.max(0,num(tracker.annualAllowance)||20000);
    const used=Math.max(0,num(tracker.monzoCash)+num(tracker.monzoStocks)+num(tracker.trading212)+num(tracker.igCurrentNet));
    return{
      annual,
      used,
      left:Math.max(0,annual-used),
      flexible:Math.max(0,num(tracker.igFlexibleReplacement))
    };
  }

  function buildAttention(state){
    if(!state)return[{level:'warn',title:'Clean state unavailable',detail:'Aurora AI could not read the current Clean state.',page:'system-health'}];

    const items=[];
    const frozen=state.finance?.stage5PaydayDecision;
    const mission=state.transfer?.mission;
    const route=state.transfer?.route;
    const plan=state.scouting?.allocationPlan;
    const receipts=Array.isArray(state.registration?.receipts)?state.registration.receipts:[];
    const holdings=Array.isArray(state.squad?.holdings)?state.squad.holdings:[];

    if(!frozen){
      items.push({level:'warn',title:'Finance payday decision not frozen',detail:'Complete the Finance payday chain before Transfer can rely on a final safe-release figure.',page:'finance',tab:'payday',target:'#financeTabTitle'});
    }

    if(missionActive(mission)){
      if(!plan?.allocations?.length){
        items.push({level:'warn',title:'Scouting plan needed',detail:'An active Finance mission exists, but there is no allocation plan ready for Transfer.',page:'scouting'});
      }else if(upper(plan.status)!=='APPROVED'){
        items.push({level:'warn',title:'Scouting plan awaiting approval',detail:'The allocation plan exists but is not yet marked APPROVED.',page:'scouting'});
      }else if(!route?.allocations?.length){
        items.push({level:'warn',title:'Transfer route not built',detail:'The approved Scouting plan is ready for Transfer to build a broker route.',page:'transfer',target:'#transferStage2Rows'});
      }else if(route?.locked!==true){
        items.push({level:'warn',title:'Transfer route not locked',detail:'A route exists but still needs broker resolution and your explicit lock action.',page:'transfer',target:'#transferStage2RouteStatus'});
      }else if(upper(mission.status)!=='COMPLETE'){
        items.push({level:'warn',title:'Registration execution pending',detail:'The Transfer route is locked and is waiting for the Registration stage to finish.',page:'registration'});
      }
    }

    if(route?.locked===true && upper(mission?.status)!=='COMPLETE' && receipts.length===0 && !items.some(x=>x.page==='registration')){
      items.push({level:'warn',title:'No Registration receipt yet',detail:'The locked route has no recorded Registration receipt in the Clean state.',page:'registration'});
    }

    if(!holdings.length){
      items.push({level:'info',title:'Squad holdings are empty',detail:'Squad has no holdings in the Clean state to report.',page:'squad'});
    }

    const summary=financeSummary(state);
    if(frozen && summary && summary.safeSurplus>0 && !missionActive(mission)){
      items.push({level:'info',title:'Safe release is available',detail:money(summary.safeSurplus)+' is currently shown as maximum safe release, with no active Transfer mission.',page:'finance',tab:'payday',target:'#financeDecisionSafe'});
    }

    return items.slice(0,6);
  }

  function contextualDetail(page,state){
    if(!state)return 'Clean Build · state unavailable';
    try{
      if(page==='finance'){
        const f=financeSummary(state);
        return f?'Safe release '+money(f.safeSurplus)+' · protected '+money(f.protectedCash):'Finance state connected';
      }
      if(page==='transfer'){
        const mission=state.transfer?.mission;
        return missionActive(mission)
          ? 'Mission '+String(mission.status||'ACTIVE')+' · '+money(mission.budget)
          : 'No active transfer mission';
      }
      if(page==='scouting'){
        const count=Array.isArray(state.scouting?.candidates)?state.scouting.candidates.length:0;
        return count+' candidate'+(count===1?'':'s')+' · strategy '+String(state.scouting?.strategy||'—');
      }
      if(page==='registration'){
        const route=state.transfer?.route;
        const receipts=Array.isArray(state.registration?.receipts)?state.registration.receipts.length:0;
        return (route?.locked?'Locked route ready':'No locked route')+' · '+receipts+' receipt'+(receipts===1?'':'s');
      }
      if(page==='squad'){
        const count=Array.isArray(state.squad?.holdings)?state.squad.holdings.length:0;
        return count+' holding'+(count===1?'':'s')+' · '+money(annualIncome(state))+' annual income';
      }
      if(page==='income')return money(annualIncome(state))+' annual · '+money(annualIncome(state)/12)+' monthly';
      if(page==='match-report')return state.matchReport?.lastBuiltAt?'Last snapshot '+new Date(state.matchReport.lastBuiltAt).toLocaleString('en-GB'):'No saved report snapshot yet';
      if(page==='nexus')return buildAttention(state).length+' item'+(buildAttention(state).length===1?'':'s')+' on the attention scan';
    }catch(_){}
    return 'Clean Build · page aware · online';
  }

  function installAssistant(){
    if(document.getElementById('auroraAssistant'))return;

    const root=document.createElement('div');
    root.id='auroraAssistant';
    root.className='aurora-assistant';
    root.innerHTML=[
      '<section id="auroraAssistantPanel" class="aurora-assistant-panel" hidden aria-label="Aurora AI co-pilot">',
        '<header class="aurora-assistant-head">',
          '<span class="aurora-assistant-mini"><img src="assets/aurora-assistant.webp" alt=""></span>',
          '<div class="aurora-assistant-heading"><small id="auroraAssistantEyebrow">AURORA AI</small><strong id="auroraAssistantTitle">Co-pilot ready</strong><span id="auroraAssistantDetail">Clean Build · online</span></div>',
          '<button type="button" class="aurora-assistant-close" aria-label="Close Aurora assistant">×</button>',
        '</header>',
        '<div id="auroraAssistantQuick" class="aurora-assistant-quick" aria-label="Quick commands"></div>',
        '<div id="auroraAssistantMessages" class="aurora-assistant-messages" aria-live="polite"></div>',
        '<form id="auroraAssistantForm" class="aurora-assistant-form">',
          '<label for="auroraAssistantInput">Ask Aurora</label>',
          '<div><input id="auroraAssistantInput" type="text" autocomplete="off" placeholder="Try: what needs attention?"><button type="submit">Send</button></div>',
        '</form>',
        '<footer class="aurora-assistant-footer">Navigation and read-only commands can run directly. Money movement, route locks and execution still require your normal Aurora controls.</footer>',
      '</section>',
      '<span class="aurora-assistant-label" aria-hidden="true">AURORA AI</span>',
      '<button type="button" class="aurora-assistant-launcher" aria-label="Open Aurora AI co-pilot" aria-controls="auroraAssistantPanel" aria-expanded="false">',
        '<img src="assets/aurora-assistant.webp" alt="">',
        '<span class="aurora-assistant-status" aria-hidden="true"></span>',
        '<span id="auroraAssistantAlertCount" class="aurora-assistant-alert-count" hidden></span>',
      '</button>'
    ].join('');

    document.body.appendChild(root);

    const panel=root.querySelector('#auroraAssistantPanel');
    const launcher=root.querySelector('.aurora-assistant-launcher');
    const close=root.querySelector('.aurora-assistant-close');
    const messages=root.querySelector('#auroraAssistantMessages');
    const form=root.querySelector('#auroraAssistantForm');
    const input=root.querySelector('#auroraAssistantInput');
    const quick=root.querySelector('#auroraAssistantQuick');
    const alertCount=root.querySelector('#auroraAssistantAlertCount');

    let history=readHistory();

    function addMessage(role,text,actions,remember=true){
      const wrap=document.createElement('article');
      wrap.className='aurora-assistant-message '+(role==='user'?'is-user':'is-ai');

      const badge=document.createElement('span');
      badge.className='aurora-assistant-message-role';
      badge.textContent=role==='user'?'YOU':'AURORA';
      wrap.appendChild(badge);

      const p=document.createElement('p');
      p.textContent=String(text||'');
      wrap.appendChild(p);

      if(Array.isArray(actions)&&actions.length){
        const row=document.createElement('div');
        row.className='aurora-assistant-message-actions';
        actions.forEach(action=>{
          const b=document.createElement('button');
          b.type='button';
          b.textContent=action.label;
          b.dataset.aiCommand=action.command;
          row.appendChild(b);
        });
        wrap.appendChild(row);
      }

      messages.appendChild(wrap);
      messages.scrollTop=messages.scrollHeight;

      if(remember){
        history.push({role,text:String(text||'')});
        history=history.slice(-14);
        saveHistory(history);
      }
    }

    function addAttention(items){
      const wrap=document.createElement('article');
      wrap.className='aurora-assistant-message is-ai';
      const badge=document.createElement('span');
      badge.className='aurora-assistant-message-role';
      badge.textContent='AURORA';
      wrap.appendChild(badge);

      const p=document.createElement('p');
      p.textContent=items.length
        ? items.length+' item'+(items.length===1?'':'s')+' found in the Clean chain.'
        : 'Nothing in the Clean state currently needs your attention.';
      wrap.appendChild(p);

      if(items.length){
        const list=document.createElement('div');
        list.className='aurora-assistant-attention-list';
        items.forEach(item=>{
          const card=document.createElement('button');
          card.type='button';
          card.className='aurora-assistant-attention '+(item.level==='warn'?'is-warn':'is-info');
          card.dataset.aiPage=item.page||'nexus';
          if(item.tab)card.dataset.aiTab=item.tab;
          if(item.target)card.dataset.aiTarget=item.target;
          const strong=document.createElement('strong');
          strong.textContent=item.title;
          const small=document.createElement('span');
          small.textContent=item.detail;
          card.append(strong,small);
          list.appendChild(card);
        });
        wrap.appendChild(list);
      }
      messages.appendChild(wrap);
      messages.scrollTop=messages.scrollHeight;
    }

    function highlight(selector){
      if(!selector)return false;
      let target=null;
      try{target=document.querySelector(selector);}catch(_){}
      if(!target)return false;
      document.querySelectorAll('.aurora-ai-highlight').forEach(el=>el.classList.remove('aurora-ai-highlight'));
      target.classList.add('aurora-ai-highlight');
      target.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>target.classList.remove('aurora-ai-highlight'),4200);
      return true;
    }

    function selectFinanceTab(tab,target){
      const allowed=['overview','payday','bills','pots','house','isa'];
      if(!allowed.includes(tab))tab='overview';
      try{sessionStorage.setItem('aurora-clean:finance-tab',tab);}catch(_){}
      document.querySelectorAll('.finance-tabbar button[data-tab]').forEach(button=>{
        button.setAttribute('aria-selected',button.dataset.tab===tab?'true':'false');
      });
      document.querySelectorAll('[data-finance-tab]').forEach(section=>{
        section.hidden=section.dataset.financeTab!==tab;
      });
      try{window.AuroraFinanceTabs?.select?.(tab);}catch(_){}
      setTimeout(()=>highlight(target||('[data-finance-tab="'+tab+'"]')),80);
    }

    function navigate(page,opts={}){
      if(!PAGE_URLS[page])return false;
      writeSession(SESSION_OPEN,'1');
      if(opts.tab)writeSession('aurora-clean:finance-tab',opts.tab);
      if(opts.pending)writeSession(SESSION_PENDING,opts.pending);
      location.href=PAGE_URLS[page];
      return true;
    }

    function pageStatus(page,state){
      if(!state)return 'I cannot read the Clean state right now. Open System Health to investigate.';
      if(page==='finance'){
        const f=financeSummary(state);
        if(!f)return 'Finance state is present, but I cannot calculate the current summary.';
        return 'Finance shows '+money(f.availableCash)+' available cash, '+money(f.totalReserved)+' reserved and a maximum safe release of '+money(f.safeSurplus)+'.';
      }
      if(page==='transfer'){
        const mission=state.transfer?.mission,route=state.transfer?.route;
        if(!missionActive(mission))return 'There is no active Transfer mission right now.';
        return 'Transfer mission '+String(mission.status||'ACTIVE')+' has '+money(mission.budget)+' of Finance authority. The route is '+(route?.locked?'locked':route?.allocations?.length?'built but not locked':'not built yet')+'.';
      }
      if(page==='scouting'){
        const rows=Array.isArray(state.scouting?.candidates)?state.scouting.candidates:[];
        const plan=state.scouting?.allocationPlan;
        return 'Scouting has '+rows.length+' candidate'+(rows.length===1?'':'s')+', strategy '+String(state.scouting?.strategy||'—')+', and the allocation plan is '+String(plan?.status||'not created')+'.';
      }
      if(page==='registration'){
        const receipts=Array.isArray(state.registration?.receipts)?state.registration.receipts.length:0;
        return 'Registration sees '+(state.transfer?.route?.locked?'a locked Transfer route':'no locked Transfer route')+' and '+receipts+' recorded receipt'+(receipts===1?'':'s')+'.';
      }
      if(page==='squad'){
        const rows=Array.isArray(state.squad?.holdings)?state.squad.holdings:[];
        return 'Squad has '+rows.length+' holding'+(rows.length===1?'':'s')+' and '+money(annualIncome(state))+' of forward annual income in the Clean state.';
      }
      if(page==='income'){
        const annual=annualIncome(state);
        return 'Forward income is '+money(annual)+' a year, about '+money(annual/12)+' a month.';
      }
      if(page==='match-report'){
        return state.matchReport?.lastBuiltAt
          ? 'The last saved Match Report snapshot was built '+new Date(state.matchReport.lastBuiltAt).toLocaleString('en-GB')+'.'
          : 'There is no saved Match Report snapshot yet.';
      }
      if(page==='club-control'){
        const history=Array.isArray(state.finance?.paydayHistory)?state.finance.paydayHistory.length:0;
        return 'Club Control sees '+history+' archived payday cycle'+(history===1?'':'s')+' and Transfer mission status '+String(state.transfer?.mission?.status||'NONE')+'.';
      }
      if(page==='system-health')return 'System Health owns live service diagnostics. I can run the page checks, but I do not mark them healthy until the page reports the result.';
      const attention=buildAttention(state);
      return attention.length
        ? 'Nexus attention scan currently finds '+attention.length+' item'+(attention.length===1?'':'s')+'.'
        : 'Nexus attention scan finds no unresolved Clean-state items.';
    }

    function explainSafeRelease(state){
      const f=financeSummary(state);
      if(!f)return 'I cannot calculate the safe release from the current Finance state.';
      return 'Aurora currently has '+money(f.availableCash)+' available. It reserves '+money(f.commitments)+' of commitments, '+money(f.holdingTopUp)+' for Holding Pot safety, '+money(f.potsDue)+' for pot funding and '+money(f.protectedCash)+' as protected cash. That leaves a maximum safe release of '+money(f.safeSurplus)+'.';
    }

    function showIsa(state){
      const isa=isaSummary(state);
      return 'ISA tracker: '+money(isa.used)+' used from '+money(isa.annual)+', leaving '+money(isa.left)+'. Flexible replacement room currently recorded: '+money(isa.flexible)+'.';
    }

    function runSafeAction(id,label){
      const button=document.getElementById(id);
      if(!button){
        addMessage('ai',label+' is not available on this page yet.');
        return false;
      }
      if(button.disabled){
        addMessage('ai',label+' is currently disabled by the page.');
        highlight('#'+id);
        return false;
      }
      button.click();
      addMessage('ai',label+' started using the page’s existing control.');
      highlight('#'+id);
      return true;
    }

    function help(){
      addMessage('ai','Try commands such as “what needs attention?”, “page status”, “show ISA allowance”, “show house improvements”, “why is my safe release lower?”, “open Transfer”, “refresh broker cash”, or “build match report”. I will not execute purchases, lock routes or reset data from chat.');
    }

    function handleCommand(raw,echo=true){
      const command=String(raw||'').trim();
      if(!command)return;
      const q=command.toLowerCase().replace(/\s+/g,' ').trim();
      if(echo)addMessage('user',command);

      const page=pageName();
      const state=safeState();

      if(/^(help|commands|what can you do|what can you do\?)$/.test(q)){help();return;}
      if(q==='attention'||q.includes('needs attention')||q.includes('need my attention')||q.includes('what should i do')||q.includes('anything to do')){
        addAttention(buildAttention(state));return;
      }
      if(q==='status'||q.includes('page status')||q.includes('what is happening')||q.includes("what's happening")){
        addMessage('ai',pageStatus(page,state));return;
      }
      if(q.includes('why')&&(q.includes('invest')||q.includes('safe release')||q.includes('available money')) || q.includes('explain safe release') || q==='safe release'){
        addMessage('ai',explainSafeRelease(state),[{label:'Open Payday',command:'show payday'}]);return;
      }
      if(q.includes('isa')&&(q.includes('left')||q.includes('allowance')||q.includes('used')||q.includes('remaining')) && !q.startsWith('show ') && !q.startsWith('open ')){
        addMessage('ai',showIsa(state),[{label:'Show ISA',command:'show isa allowance'}]);return;
      }
      if(q.includes('portfolio status')||q.includes('squad status')){
        addMessage('ai',pageStatus('squad',state),[{label:'Open Squad',command:'open squad'}]);return;
      }
      if(q.includes('transfer mission')||q.includes('transfer status')){
        addMessage('ai',pageStatus('transfer',state),[{label:'Open Transfer',command:'open transfer'}]);return;
      }
      if(q.includes('income status')||q.includes('dividend income')){
        addMessage('ai',pageStatus('income',state),[{label:'Open Income',command:'open income'}]);return;
      }

      const financeTabs=[
        {match:/\bisa\b/,tab:'isa',target:'#isaStatusBadge',label:'ISA Allowance'},
        {match:/house|renovation/,tab:'house',target:'.house-project-section',label:'House Improvements'},
        {match:/\bbills?\b/,tab:'bills',target:'#financeBillCards',label:'Bills'},
        {match:/\bpots?\b/,tab:'pots',target:'#financePotCards',label:'Pots'},
        {match:/payday/,tab:'payday',target:'#financeTabTitle',label:'Payday Control'},
        {match:/finance overview|overview/,tab:'overview',target:'[data-finance-tab="overview"]',label:'Finance Overview'}
      ];
      if(q.startsWith('show ')||q.startsWith('open ')||q.startsWith('highlight ')||q.startsWith('take me to ')){
        const tabHit=financeTabs.find(x=>x.match.test(q));
        if(tabHit){
          if(page!=='finance'){
            navigate('finance',{tab:tabHit.tab,pending:'show '+tabHit.label.toLowerCase()});
          }else{
            selectFinanceTab(tabHit.tab,tabHit.target);
            addMessage('ai',tabHit.label+' is on screen and highlighted.');
          }
          return;
        }
      }

      if(q.includes('refresh broker cash')){
        if(page!=='transfer'){navigate('transfer',{pending:'refresh broker cash'});return;}
        runSafeAction('transferRefreshCash','Broker cash refresh');return;
      }

      if(q.includes('refresh investments')){
        if(page!=='finance'){navigate('finance',{tab:'overview',pending:'refresh investments'});return;}
        selectFinanceTab('overview','#financeOverviewRefresh');
        setTimeout(()=>runSafeAction('financeOverviewRefresh','Investment refresh'),120);
        return;
      }

      if(q.includes('build match report')||q.includes('build snapshot')){
        if(page!=='match-report'){navigate('match-report',{pending:'build match report'});return;}
        runSafeAction('buildMatchReport','Match Report snapshot');return;
      }

      if(q.includes('run service checks')||q.includes('service check')){
        if(page!=='system-health'){navigate('system-health',{pending:'run service checks'});return;}
        runSafeAction('runServiceHealth','System Health checks');return;
      }

      const nav=[
        ['system health','system-health'],['club control','club-control'],['match report','match-report'],
        ['registration','registration'],['scouting','scouting'],['transfer','transfer'],
        ['finance','finance'],['squad','squad'],['income','income'],['nexus','nexus'],['home','nexus']
      ];
      if(q.startsWith('open ')||q.startsWith('go to ')||q.startsWith('take me to ')){
        const hit=nav.find(([word])=>q.includes(word));
        if(hit){navigate(hit[1]);return;}
      }

      if(q.includes('lock route')||q.includes('buy ')||q.includes('purchase ')||q.includes('register route')||q.includes('reset')){
        addMessage('ai','I will take you to the relevant control, but I will not execute that consequential action from chat.',[
          {label:'Open Transfer',command:'open transfer'},
          {label:'Open Registration',command:'open registration'},
          {label:'Open Club Control',command:'open club control'}
        ]);
        return;
      }

      addMessage('ai','I do not have a safe local command for that yet. Type “help” to see what I can do, or use “page status” and “what needs attention?”.');
    }

    function renderQuick(){
      quick.replaceChildren();
      (QUICK_ACTIONS[pageName()]||QUICK_ACTIONS.nexus).forEach(([label,command])=>{
        const button=document.createElement('button');
        button.type='button';
        button.textContent=label;
        button.dataset.aiCommand=command;
        quick.appendChild(button);
      });
    }

    function refresh(){
      const page=pageName();
      const copy=PAGE_COPY[page]||{eyebrow:'AURORA AI',title:'Aurora co-pilot',message:'I’m available across the Clean build.'};
      const state=safeState();
      root.querySelector('#auroraAssistantEyebrow').textContent=copy.eyebrow;
      root.querySelector('#auroraAssistantTitle').textContent=copy.title;
      root.querySelector('#auroraAssistantDetail').textContent=contextualDetail(page,state);
      renderQuick();

      const count=buildAttention(state).filter(item=>item.level==='warn').length;
      alertCount.hidden=count===0;
      alertCount.textContent=String(count);
      launcher.classList.toggle('has-alert',count>0);
    }

    function setOpen(open){
      panel.hidden=!open;
      launcher.setAttribute('aria-expanded',String(open));
      root.classList.toggle('is-open',open);
      writeSession(SESSION_OPEN,open?'1':'0');
      if(open){
        refresh();
        if(!messages.children.length){
          if(history.length){
            history.forEach(row=>addMessage(row.role,row.text,null,false));
          }else{
            addMessage('ai',PAGE_COPY[pageName()]?.message||'Aurora co-pilot ready.',[
              {label:'What needs attention?',command:'attention'},
              {label:'Page status',command:'page status'}
            ]);
          }
        }
        setTimeout(()=>input.focus({preventScroll:true}),50);
      }
    }

    root.addEventListener('click',event=>{
      const commandButton=event.target.closest('[data-ai-command]');
      if(commandButton){
        handleCommand(commandButton.dataset.aiCommand,false);
        return;
      }
      const attentionButton=event.target.closest('[data-ai-page]');
      if(attentionButton){
        const targetPage=attentionButton.dataset.aiPage;
        const tab=attentionButton.dataset.aiTab||'';
        const target=attentionButton.dataset.aiTarget||'';
        if(targetPage===pageName()){
          if(targetPage==='finance'&&tab)selectFinanceTab(tab,target);
          else if(target)highlight(target);
        }else{
          const pending=targetPage==='finance'&&tab?'show '+tab:'page status';
          navigate(targetPage,{tab:tab||undefined,pending});
        }
      }
    });

    form.addEventListener('submit',event=>{
      event.preventDefault();
      const value=input.value;
      input.value='';
      handleCommand(value,true);
    });

    launcher.addEventListener('click',()=>setOpen(panel.hidden));
    close.addEventListener('click',()=>setOpen(false));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!panel.hidden)setOpen(false);
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();setOpen(true);
      }
    });
    document.addEventListener('pointerdown',event=>{
      if(!panel.hidden&&!root.contains(event.target)&&!event.target.closest('.aurora-ai-highlight'))setOpen(false);
    });

    window.addEventListener('aurora-clean:state',refresh);
    window.addEventListener('storage',event=>{
      if(event.key==='aurora-clean:state:v1')refresh();
    });

    refresh();

    if(readSession(SESSION_OPEN)==='1')setOpen(true);

    const pending=readSession(SESSION_PENDING);
    if(pending){
      try{sessionStorage.removeItem(SESSION_PENDING);}catch(_){}
      setTimeout(()=>{
        setOpen(true);
        handleCommand(pending,false);
      },350);
    }

    window.AuroraAssistant=Object.freeze({
      BUILD:ASSISTANT_BUILD,
      open:()=>setOpen(true),
      close:()=>setOpen(false),
      command:command=>{setOpen(true);handleCommand(command,false);},
      attention:()=>buildAttention(safeState()),
      highlight
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAssistant,{once:true});
  else installAssistant();
})();

