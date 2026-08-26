(() => {
  'use strict';

  const BUILD='20260826-finance-window-boundaries-2-stage1-owner';
  const PAYDAYS_PER_YEAR=13, PAY_CYCLE_DAYS=28, OPTIONAL_CAP=300, ROLLOVER_TARGET=350, ROLLOVER_MAX=100;
  const LIVE_KEYS=['aurora2:state:v1','aurora2:state:backup:lastgood'];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const upper=v=>String(v??'').trim().toUpperCase();
  const isHolding=v=>norm(v)==='holding pot', isRollover=v=>norm(v).includes('rollover');
  const parseDate=v=>{if(!v)return null;const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?null:d};
  const iso=d=>d&&!Number.isNaN(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const addMonths=(d,n)=>{const x=new Date(d),day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+n);x.setDate(Math.min(day,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));return x};
  const todayAtNoon=()=>{const d=new Date();d.setHours(12,0,0,0);return d};

  function nextDue(date,f){const d=parseDate(date);if(!d)return'';if(f==='weekly')d.setDate(d.getDate()+7);else if(f==='4-weeks')d.setDate(d.getDate()+28);else if(f==='5-weeks')d.setDate(d.getDate()+35);else if(f==='monthly')return iso(addMonths(d,1));else if(f==='yearly')return iso(addMonths(d,12));else return date;return iso(d)}
  function undatedCount(b,s,e){const days=Math.max(1,Math.round((e-s)/86400000)),f=String(b.frequency||'one-off');if(f==='weekly')return Math.max(1,Math.ceil(days/7));if(f==='4-weeks')return Math.max(1,Math.ceil(days/28));if(f==='5-weeks')return Math.max(1,Math.ceil(days/35));if(f==='monthly')return Math.max(1,Math.round(days/30.4375));return 0}
  function occurrenceRow(b,amount,date,estimated,overdue){return{billId:b.id,billName:b.name,amount,date,fundingSource:b.fundingSource||'Holding Pot',frequency:String(b.frequency||'one-off'),estimated:!!estimated,overdue:!!overdue}}

  function occurrences(b,s,e,options={}){
    if(!b||b.paid||b.archived||b.included===false||!s||!e||num(b.amount)<=0)return[];
    const amount=round(b.amount),f=String(b.frequency||'one-off'),due=parseDate(b.due||b.dueDate),out=[],includeOverdue=options.includeOverdue===true,today=options.today||todayAtNoon();
    if(!due){for(let i=0;i<undatedCount(b,s,e);i++)out.push(occurrenceRow(b,amount,'',true,false));return out}
    if(f==='one-off'){
      if(due>=s&&due<e)out.push(occurrenceRow(b,amount,iso(due),false,due<today));
      else if(includeOverdue&&due<s&&due<today)out.push(occurrenceRow(b,amount,iso(due),false,true));
      return out;
    }
    let cursor=new Date(due),guard=0;
    if(cursor<s){
      if(includeOverdue&&cursor<today)out.push(occurrenceRow(b,amount,iso(cursor),false,true));
      let n=parseDate(nextDue(iso(cursor),f));
      while(n&&n<s&&guard++<240){const a=parseDate(nextDue(iso(n),f));if(!a||a.getTime()===n.getTime())break;n=a}
      cursor=n;
    }
    guard=0;
    while(cursor&&cursor<e&&guard++<240){
      const date=iso(cursor),duplicateOverdue=out.length&&out[0].overdue&&out[0].date===date;
      if(!duplicateOverdue)out.push(occurrenceRow(b,amount,date,false,cursor<today));
      const n=parseDate(nextDue(date,f));if(!n||n.getTime()===cursor.getTime())break;cursor=n;
    }
    return out;
  }

  function readLive(){for(const key of LIVE_KEYS){try{const s=JSON.parse(localStorage.getItem(key)||'null');if(s?.finance)return{key,finance:s.finance}}catch(_){}}return{key:'',finance:null}}
  function liveHolding(){const live=readLive(),pot=(live.finance?.pots||[]).find(p=>!p?.archived&&isHolding(p?.name));return pot?{key:live.key,balance:round(pot.balance),target:round(pot.target)}:null}
  function normaliseBill(r,i){return{id:String(r?.id||`BILL-${i+1}`),name:String(r?.name||`Bill ${i+1}`),amount:round(r?.amount),due:String(r?.due||r?.dueDate||'').slice(0,10),frequency:String(r?.frequency||'monthly'),fundingSource:String(r?.fundingSource||'Holding Pot'),included:r?.included!==false,paid:!!r?.paid,archived:!!r?.archived}}
  function normalisePot(r,i){return{id:String(r?.id||`POT-${i+1}`),name:String(r?.name||`Pot ${i+1}`),balance:round(r?.balance),target:round(r?.target),spent:round(r?.spent),goalMode:String(r?.goalMode||''),deadline:String(r?.deadline||r?.completeBy||r?.targetDate||'').slice(0,10),fundingOverride:round(r?.fundingOverride),priority:[1,2,3].includes(Number(r?.priority))?Number(r.priority):2,archived:!!r?.archived,note:String(r?.note||'')}}

  function calcBills(state){
    const bills=(state.finance?.bills||[]).filter(b=>!b.archived&&b.included!==false&&!b.paid&&num(b.amount)>0);
    const payday=parseDate(state.finance?.paydayDate)||todayAtNoon();payday.setHours(12,0,0,0);const next=addDays(payday,PAY_CYCLE_DAYS),yearEnd=addDays(payday,PAY_CYCLE_DAYS*PAYDAYS_PER_YEAR);
    const cycle=[];bills.forEach(b=>cycle.push(...occurrences(b,payday,next,{includeOverdue:false})));
    const current=cycle.filter(o=>norm(o.fundingSource)==='current account'),holdingBills=bills.filter(b=>isHolding(b.fundingSource)),holdingCycle=cycle.filter(o=>isHolding(o.fundingSource)),annual=[];holdingBills.forEach(b=>annual.push(...occurrences(b,payday,yearEnd,{includeOverdue:false})));
    return{payday:iso(payday),nextPayday:iso(next),billCount:bills.length,currentAccountDue:round(current.reduce((s,o)=>s+o.amount,0)),holdingCycleRequired:round(holdingCycle.reduce((s,o)=>s+o.amount,0)),annualHoldingTotal:round(annual.reduce((s,o)=>s+o.amount,0)),holdingPerPayday:round(annual.reduce((s,o)=>s+o.amount,0)/PAYDAYS_PER_YEAR),cycle,holdingCycle,holdingBills,calculatedAt:new Date().toISOString(),build:BUILD};
  }

  function calcHolding(state,bills){
    const payday=parseDate(bills.payday),today=todayAtNoon(),pre=[];
    if(payday&&payday>today)(bills.holdingBills||[]).forEach(b=>pre.push(...occurrences(b,today,payday,{includeOverdue:true,today})));
    const currentBalance=round(state.finance?.holdingPotBalance),spendBeforePayday=round(pre.reduce((s,o)=>s+o.amount,0)),projectedPaydayBalance=round(Math.max(0,currentBalance-spendBeforePayday)),baseContribution=round(bills.holdingPerPayday),minimumFloor=round(state.finance?.holdingPotTarget),cycleRequired=round(bills.holdingCycleRequired),dynamicTarget=round(Math.max(minimumFloor,cycleRequired)),projectedBeforeTopUp=round(projectedPaydayBalance+baseContribution),safetyTopUp=round(Math.max(0,dynamicTarget-projectedBeforeTopUp)),afterFunding=round(projectedBeforeTopUp+safetyTopUp);
    return{currentBalance,spendBeforePayday,projectedPaydayBalance,prePaydayShortfall:round(Math.max(0,spendBeforePayday-currentBalance)),baseContribution,minimumFloor,cycleRequired,calculatedTarget:cycleRequired,dynamicTarget,safetyTopUp,projectedBeforeTopUp,afterFunding,headroom:round(afterFunding-dynamicTarget),prePayday:pre,calculatedAt:new Date().toISOString(),build:BUILD};
  }

  const funded=p=>p?.goalMode==='funded-progress'?num(p.balance)+num(p.spent):num(p.balance),gap=p=>Math.max(0,num(p.target)-funded(p));
  function deadline(p,payday){const g=gap(p),d=parseDate(p.deadline),pd=parseDate(payday);if(!d||!pd||g<=.009)return{has:!!d,required:0,paydays:0};const diff=d-pd,cycles=Math.floor(diff/(PAY_CYCLE_DAYS*86400000)),paydays=diff>=0?Math.max(1,cycles+1):0;return{has:true,required:paydays>0?g/paydays:g,paydays}}
  function calcPots(state){
    const pots=(state.finance?.pots||[]).filter(p=>!p.archived),expected=num(state.finance?.expectedWages),received=num(state.finance?.wagesReceived),wageDifference=round(received-expected),optionalBudget=round(Math.min(Math.max(0,wageDifference),OPTIONAL_CAP)),alloc=new Map(),payday=state.finance?.paydayDate||'';
    const rollover=pots.find(p=>isRollover(p.name)),rolloverGap=round(Math.max(0,ROLLOVER_TARGET-num(rollover?.balance))),rolloverContribution=rollover?round(Math.min(optionalBudget,ROLLOVER_MAX,rolloverGap)):0;
    const candidates=pots.filter(p=>{const n=norm(p.name);return gap(p)>.009&&!isRollover(p.name)&&n!=='holding pot'&&n!=='spending pot'&&n!=='ig trading'}).map(p=>({pot:p,gap:gap(p),priority:p.priority||2,deadline:deadline(p,payday)}));
    let requiredFunding=0;candidates.forEach(r=>{const dn=r.deadline.has?Math.min(r.gap,Math.max(0,r.deadline.required)):0,manual=Math.min(r.gap,num(r.pot.fundingOverride)),required=Math.min(r.gap,Math.max(dn,manual));if(required>.009){alloc.set(r.pot.id,{amount:required,required:dn,reasons:[dn>.009?`Required for ${r.pot.deadline} · ${r.deadline.paydays} payday(s) left · pace only`:'Manual minimum']});requiredFunding+=required}});
    if(rollover&&rolloverContribution>.009)alloc.set(rollover.id,{amount:rolloverContribution,required:0,reasons:[`Payday Rollover · ${money(ROLLOVER_TARGET)} target · max ${money(ROLLOVER_MAX)} per payday`]});
    let remaining=Math.max(0,optionalBudget-rolloverContribution);for(const r of candidates.filter(r=>!r.deadline.has).sort((a,b)=>a.priority-b.priority||b.gap-a.gap)){if(remaining<=.009)break;const existing=alloc.get(r.pot.id)?.amount||0,take=Math.min(remaining,Math.max(0,r.gap-existing));if(take>.009){const a=alloc.get(r.pot.id)||{amount:0,required:0,reasons:[]};a.amount+=take;a.reasons.push(`P${r.priority} priority funding`);alloc.set(r.pot.id,a);remaining-=take}}
    const rows=pots.map(p=>{const a=alloc.get(p.id);return a?{id:p.id,name:p.name,amount:round(Math.min(gap(p),a.amount)),required:round(a.required),reason:a.reasons.join(' · ')}:null}).filter(Boolean),total=round(rows.reduce((s,r)=>s+r.amount,0));
    return{potCount:pots.length,wageDifference,optionalBudget,requiredFunding:round(requiredFunding),rolloverContribution,optionalPriority:round(Math.max(0,optionalBudget-rolloverContribution-remaining)),total,rows,calculatedAt:new Date().toISOString(),build:BUILD};
  }

  function calcDecision(state,bills,holding,pots){
    if(!bills||!holding||!pots)return null;
    const availableCash=round(state.finance?.availableCash),currentAccountBills=round(bills.currentAccountDue),baseHoldingContribution=round(holding.baseContribution),holdingSafetyTopUp=round(holding.safetyTopUp),potFunding=round(pots.total),protectedCash=round(state.finance?.protectedCash),commitments=round(currentAccountBills+baseHoldingContribution+holdingSafetyTopUp+potFunding),totalReserved=round(commitments+protectedCash),maximumSafeRelease=round(Math.max(0,availableCash-totalReserved));
    return{availableCash,currentAccountBills,baseHoldingContribution,holdingSafetyTopUp,potFunding,protectedCash,commitments,totalReserved,maximumSafeRelease,calculatedAt:new Date().toISOString(),build:BUILD};
  }

  function setState(mutator){window.AuroraClean.updateState(mutator)}
  function invalidateDownstream(s,reason){
    s.finance.stage5PaydayDecision=null;s.finance.lastSafeRelease=0;
    const mission=s.transfer?.mission,receipts=s.registration?.receipts||[],hasReceipts=mission&&receipts.some(r=>String(r.missionId||'')===String(mission.id||''));
    if(mission&&!['COMPLETE','CANCELLED'].includes(upper(mission.status))&&!hasReceipts){s.transfer.mission=null;s.transfer.route=null;s.scouting.allocationPlan=null;s.finance.lastMissionInvalidatedAt=new Date().toISOString();s.finance.lastMissionInvalidatedReason=reason||'Finance changed';}
  }
  function commitCashTruth(){
    const expected=num(document.getElementById('financeExpectedWages')?.value),received=num(document.getElementById('financeWagesReceived')?.value),available=num(document.getElementById('financeAvailable')?.value),protectedCash=num(document.getElementById('financeProtected')?.value);
    setState(s=>{s.finance.expectedWages=round(expected);s.finance.wagesReceived=round(received);s.finance.availableCash=round(available);s.finance.protectedCash=round(protectedCash);s.finance.cashTruthUpdatedAt=new Date().toISOString();invalidateDownstream(s,'Stage 1 cash truth changed');});
  }
  function commitBills(){const state=window.AuroraClean.readState(),b=calcBills(state);setState(s=>{s.finance.stage2Bills=b;s.finance.stage3HoldingPot=null;invalidateDownstream(s,'Stage 2 bills changed')});return b}
  function commitHolding(){
    let state=window.AuroraClean.readState(),b=state.finance?.stage2Bills;if(!b)return null;
    if(round(state.finance?.holdingPotBalance)<=0){const live=liveHolding();if(live&&live.balance>0){setState(s=>{s.finance.holdingPotBalance=live.balance;s.finance.holdingPotTarget=live.target;s.finance.holdingPotImportAt=new Date().toISOString();s.finance.holdingPotImportSource=`${live.key}:AUTO_RECOVERY`});state=window.AuroraClean.readState();}}
    const h=calcHolding(state,b);setState(s=>{s.finance.stage3HoldingPot=h;invalidateDownstream(s,'Stage 3 Holding Pot changed')});return h;
  }
  function commitPots(){const state=window.AuroraClean.readState(),p=calcPots(state);setState(s=>{s.finance.stage4PotFunding=p;invalidateDownstream(s,'Stage 4 pot funding changed')});return p}
  function commitDecision(){const state=window.AuroraClean.readState(),d=calcDecision(state,state.finance?.stage2Bills,state.finance?.stage3HoldingPot,state.finance?.stage4PotFunding);if(d)setState(s=>{s.finance.stage5PaydayDecision=d;s.finance.lastSafeRelease=d.maximumSafeRelease});return d}

  function importBills(){const live=readLive(),rows=live.finance?.bills||[];if(!rows.length)return'No live Aurora bills found.';setState(s=>{s.finance.bills=rows.map(normaliseBill);s.finance.billImportAt=new Date().toISOString();s.finance.billImportSource=live.key;s.finance.stage2Bills=null;s.finance.stage3HoldingPot=null;invalidateDownstream(s,'Live bills imported')});commitBills();return`Imported ${rows.length} live bill(s).`}
  function importHolding(){const live=liveHolding();if(!live)return'No live Holding Pot found.';setState(s=>{s.finance.holdingPotBalance=live.balance;s.finance.holdingPotTarget=live.target;s.finance.holdingPotImportAt=new Date().toISOString();s.finance.holdingPotImportSource=live.key;s.finance.stage3HoldingPot=null;invalidateDownstream(s,'Live Holding Pot imported')});commitHolding();return`Imported Holding Pot ${money(live.balance)}.`}
  function importPots(){const live=readLive(),rows=live.finance?.pots||[];if(!rows.length)return'No live Aurora pots found.';setState(s=>{s.finance.pots=rows.map(normalisePot);s.finance.potImportAt=new Date().toISOString();s.finance.potImportSource=live.key;s.finance.stage4PotFunding=null;invalidateDownstream(s,'Live pots imported')});commitPots();return`Imported ${rows.length} live pot(s).`}

  function render(){
    const state=window.AuroraClean.readState(),b=state.finance?.stage2Bills,h=state.finance?.stage3HoldingPot,p=state.finance?.stage4PotFunding,d=state.finance?.stage5PaydayDecision,text=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v},value=(id,v)=>{const e=document.getElementById(id);if(e&&document.activeElement!==e)e.value=Number(v||0).toFixed(2)};
    value('financeExpectedWages',state.finance?.expectedWages);value('financeWagesReceived',state.finance?.wagesReceived);value('financeAvailable',state.finance?.availableCash);value('financeProtected',state.finance?.protectedCash);
    const date=document.getElementById('financePaydayDate');if(date&&document.activeElement!==date)date.value=state.finance?.paydayDate||'';
    text('financeBillWindow',b?`${b.payday} → ${b.nextPayday}`:'Recalculate Stage 2');text('financeBillCount',String(b?.billCount||0));text('financeCurrentAccountDue',money(b?.currentAccountDue));text('financeHoldingAnnual',money(b?.annualHoldingTotal));text('financeHoldingPerPayday',money(b?.holdingPerPayday));
    text('financeHoldingBalanceStage3',money(h?.currentBalance));text('financeHoldingSpendBeforePayday',money(h?.spendBeforePayday));text('financeHoldingProjectedPayday',money(h?.projectedPaydayBalance));text('financeHoldingBaseContribution',money(h?.baseContribution));text('financeHoldingDynamicTarget',money(h?.dynamicTarget));text('financeHoldingTopUpStage3',money(h?.safetyTopUp));text('financeHoldingCycleRequired',money(h?.cycleRequired));text('financeHoldingFloor',money(h?.minimumFloor));text('financeHoldingAfterFunding',money(h?.afterFunding));text('financeHoldingPrePaydayShortfall',money(h?.prePaydayShortfall));text('financeHoldingHeadroom',money(h?.headroom));
    text('financePotCount',String(p?.potCount||0));text('financePotWageDifference',money(p?.wageDifference));text('financePotOptionalBudget',money(p?.optionalBudget));text('financePotRequired',money(p?.requiredFunding));text('financePotRollover',money(p?.rolloverContribution));text('financePotOptionalPriority',money(p?.optionalPriority));text('financePotTotal',money(p?.total));
    text('financeDecisionCash',money(d?.availableCash));text('financeDecisionBills',money(d?.currentAccountBills));text('financeDecisionHoldingBase',money(d?.baseHoldingContribution));text('financeDecisionHoldingTopUp',money(d?.holdingSafetyTopUp));text('financeDecisionPots',money(d?.potFunding));text('financeDecisionProtected',money(d?.protectedCash));text('financeDecisionCommitments',money(d?.commitments));text('financeDecisionReserved',money(d?.totalReserved));text('financeDecisionSafeRelease',money(d?.maximumSafeRelease));
    text('financeDecisionStage1Comparison',d?'Stage 5 uses frozen proved Stage 2–4 snapshots.':'Stage 5 not calculated yet.');
    const billRows=document.getElementById('financeStage2BillRows');if(billRows)billRows.innerHTML=b?.cycle?.length?b.cycle.map(o=>`<li><strong>${esc(o.billName)}</strong> — ${money(o.amount)} — ${esc(o.fundingSource)} — ${o.date||'estimated'}</li>`).join(''):'<li>Recalculate Stage 2 to load bill occurrences.</li>';
    const hpRows=document.getElementById('financeStage3PrePaydayRows');if(hpRows)hpRows.innerHTML=h?.prePayday?.length?h.prePayday.map(o=>`<li><strong>${esc(o.billName)}</strong> — ${money(o.amount)} — ${o.date||'estimated'}${o.overdue?' — OVERDUE':''}</li>`).join(''):'<li>No frozen Stage 3 projection yet.</li>';
    const potRows=document.getElementById('financeStage4PotRows');if(potRows)potRows.innerHTML=p?.rows?.length?p.rows.map(r=>`<li><strong>${esc(r.name)}</strong> — ${money(r.amount)} — ${esc(r.reason)}</li>`).join(''):'<li>No frozen Stage 4 plan yet.</li>';
    const decRows=document.getElementById('financeStage5DecisionRows');if(decRows)decRows.innerHTML=d?`<li>Available cash: <strong>${money(d.availableCash)}</strong></li><li>Current Account bills: <strong>− ${money(d.currentAccountBills)}</strong></li><li>Base Holding Pot: <strong>− ${money(d.baseHoldingContribution)}</strong></li><li>Holding Pot top-up: <strong>− ${money(d.holdingSafetyTopUp)}</strong></li><li>Stage 4 pots: <strong>− ${money(d.potFunding)}</strong></li><li>Protected cash: <strong>− ${money(d.protectedCash)}</strong></li><li><strong>Maximum Safe Release: ${money(d.maximumSafeRelease)}</strong></li>`:'<li>Recalculate Stage 5 after Stages 2–4 are proved.</li>';
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return}
    document.getElementById('financeUseActualPay')?.addEventListener('click',()=>{const received=document.getElementById('financeWagesReceived'),available=document.getElementById('financeAvailable');if(received&&available)available.value=received.value;commitCashTruth();render()});
    document.getElementById('financeCalculate')?.addEventListener('click',()=>{commitCashTruth();render()});
    document.getElementById('financeImportBills')?.addEventListener('click',()=>{textStatus('financeBillImportStatus',importBills());render()});
    document.getElementById('financeImportHoldingPot')?.addEventListener('click',()=>{textStatus('financeHoldingImportStatus',importHolding());render()});
    document.getElementById('financeImportPots')?.addEventListener('click',()=>{textStatus('financePotImportStatus',importPots());render()});
    document.getElementById('financeRecalculateBills')?.addEventListener('click',()=>{commitBills();render()});
    document.getElementById('financeRecalculateHolding')?.addEventListener('click',()=>{const h=commitHolding();textStatus('financeHoldingImportStatus',h?`Stage 3 frozen at ${money(h.currentBalance)} current balance · ${money(h.safetyTopUp)} top-up.`:'Recalculate Stage 2 first.');render()});
    document.getElementById('financeRecalculatePots')?.addEventListener('click',()=>{commitPots();render()});
    document.getElementById('financeRecalculateDecision')?.addEventListener('click',()=>{const d=commitDecision();textStatus('financeDecisionStage1Comparison',d?'Stage 5 locked to proved Stage 2–4 snapshots.':'Recalculate Stages 2, 3 and 4 first.');render()});
    document.getElementById('financePaydayDate')?.addEventListener('change',e=>{setState(s=>{s.finance.paydayDate=String(e.target.value||'').slice(0,10);s.finance.stage2Bills=null;s.finance.stage3HoldingPot=null;invalidateDownstream(s,'Payday date changed')});render()});
    render();window.addEventListener('aurora-clean:state',render);window.AuroraFinanceEngine=Object.freeze({BUILD,calcBills,calcHolding,calcPots,calcDecision,commitCashTruth,commitBills,commitHolding,commitPots,commitDecision});
  }
  function textStatus(id,msg){const e=document.getElementById(id);if(e)e.textContent=msg}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();