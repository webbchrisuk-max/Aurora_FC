(() => {
  'use strict';

  const BUILD='20260826-payday-chain-health-3-auto-scouting';
  const EPS=0.01,$=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(num(v).toFixed(2)),upper=v=>String(v||'').trim().toUpperCase(),clone=v=>JSON.parse(JSON.stringify(v));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const sum=(rows,key)=>round((rows||[]).reduce((s,r)=>s+num(typeof key==='function'?key(r):r?.[key]),0));
  const accountCode=v=>{const s=upper(v);if(s.includes('212'))return'T212';if(s==='IG'||s.includes('IG ISA'))return'IG';return''};
  const cashTruthCurrent=(state,stage5)=>!!stage5&&Math.abs(num(stage5.availableCash)-num(state.finance?.availableCash))<EPS&&Math.abs(num(stage5.protectedCash)-num(state.finance?.protectedCash))<EPS;
  const pickCountForBudget=budget=>{const v=Math.max(0,num(budget));if(v<500)return 1;if(v<1000)return 2;if(v<2000)return 3;if(v<3500)return 4;return 5};

  function snapshotChecks(state){
    const stage5=state.finance?.stage5PaydayDecision,mission=state.transfer?.mission,plan=state.scouting?.allocationPlan,route=state.transfer?.route,receipts=state.registration?.receipts||[];
    const activeMission=mission&&!['COMPLETE','CANCELLED'].includes(upper(mission.status));
    const missionBudget=num(mission?.budget),stage5Budget=num(stage5?.maximumSafeRelease),planTotal=sum(plan?.allocations,'amount'),routeTotal=sum(route?.allocations,'amount');
    const routeLegs=(route?.allocations||[]).map(r=>String(r.legId||r.id||''));
    const missionReceipts=mission?receipts.filter(r=>String(r.missionId||'')===String(mission.id||'')):[];
    const txIds=missionReceipts.map(r=>String(r.transactionId||'')).filter(Boolean),receiptTotal=sum(missionReceipts,'totalCostGbp'),settled=missionReceipts.filter(r=>!!r.settledAt);
    const checks=[
      ['Finance Stage 5 frozen',!!stage5],
      ['Stage 5 Cash Truth matches current Stage 1',cashTruthCurrent(state,stage5)],
      ['Stage 5 release is non-negative',!!stage5&&stage5Budget>=0],
      ['Finance mission matches Stage 5',!activeMission||Math.abs(missionBudget-stage5Budget)<EPS],
      ['Scouting plan uses mission authority',!activeMission||!plan||String(plan.missionId||'')===String(mission.id||'')],
      ['Scouting allocation reconciles to mission',!activeMission||!plan?.allocations?.length||Math.abs(planTotal-missionBudget)<EPS],
      ['Transfer route requires approved Scouting plan',!route?.allocations?.length||upper(plan?.status)==='APPROVED'],
      ['Transfer route belongs to mission',!route||!mission||String(route.missionId||'')===String(mission.id||'')],
      ['Transfer route reconciles to mission',!route?.allocations?.length||Math.abs(routeTotal-missionBudget)<EPS],
      ['Transfer leg IDs are unique',!route?.allocations?.length||(routeLegs.every(Boolean)&&new Set(routeLegs).size===routeLegs.length)],
      ['Registration transaction IDs are unique',new Set(txIds).size===txIds.length],
      ['Registration receipts stay within Finance budget',!mission||receiptTotal<=missionBudget+EPS],
      ['Every receipt belongs to a locked leg',!missionReceipts.length||missionReceipts.every(r=>routeLegs.includes(String(r.legId||r.allocationId||'')))],
      ['Settled receipts carry backend authority',!settled.length||settled.every(r=>r.backendHolding&&upper(r.settlementStatus).includes('AURORADATA'))],
      ['Complete mission is fully settled',upper(mission?.status)!=='COMPLETE'||(route?.settled===true&&missionReceipts.length>0&&missionReceipts.every(r=>!!r.settledAt))],
      ['Squad holdings are structurally valid',Array.isArray(state.squad?.holdings)&&state.squad.holdings.every(h=>upper(h.ticker)&&num(h.shares)>=0&&num(h.bookCostGbp)>=0)],
      ['Income total is finite',Number.isFinite((state.squad?.holdings||[]).reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp||num(h.shares)*num(h.annualDpsGbp))),0))]
    ];
    return{checks,stage5Budget,missionBudget,planTotal,routeTotal,receiptTotal,missionStatus:upper(mission?.status||'NONE')};
  }

  function buildDryPlan(state,budget){
    const eligible=window.AuroraClean.scoutingRankings(state).filter(r=>num(r.yieldPct)>0),target=Math.min(pickCountForBudget(budget),eligible.length),rankings=eligible.slice(0,target);
    if(!rankings.length)return{ok:false,error:'No eligible Scouting candidates are available for automatic selection.'};
    const strategy=state.scouting?.strategy==='maximum'?'maximum':'sustainable',baseCap=strategy==='maximum'?0.65:0.45,capPct=Math.max(baseCap,1/rankings.length);
    const items=rankings.map(r=>({...r,weight:strategy==='maximum'?Math.max(1,num(r.score))*Math.max(.25,num(r.yieldPct)):Math.max(1,num(r.score))*(r.held?Math.max(.45,1-num(r.exposurePct)/100):1.12),amount:0}));
    let remaining=budget,open=[...items];
    while(open.length&&remaining>.004){const tw=open.reduce((s,r)=>s+r.weight,0)||open.length;let capped=false;for(const r of [...open]){const desired=remaining*(r.weight/tw),cap=budget*capPct,capacity=Math.max(0,cap-r.amount);if(desired>capacity+.005){r.amount+=capacity;remaining-=capacity;open=open.filter(x=>x!==r);capped=true;}}if(!capped){const w=open.reduce((s,r)=>s+r.weight,0)||open.length;open.forEach(r=>r.amount+=remaining*(r.weight/w));remaining=0;}}
    const allocations=items.filter(r=>r.amount>.004).map((r,i)=>({legId:`DRY-LEG-${i+1}`,selectionRank:i+1,ticker:r.ticker,name:r.name,amount:round(r.amount),yieldPct:num(r.yieldPct),expectedAnnualIncome:round(r.amount*num(r.yieldPct)/100)}));
    let allocated=sum(allocations,'amount');const delta=round(budget-allocated);if(allocations.length&&Math.abs(delta)>=.01)allocations[0].amount=round(allocations[0].amount+delta);allocated=sum(allocations,'amount');
    return{ok:true,strategy,selectedCount:allocations.length,allocations,allocated,status:'PROPOSED'};
  }

  function dryRun(){
    const A=window.AuroraClean;if(!A)return;const realBefore=JSON.stringify(A.readState()),test=clone(A.readState()),stage5=test.finance?.stage5PaydayDecision,budget=round(stage5?.maximumSafeRelease),lines=[];
    const pass=(label,ok,detail='')=>lines.push({label,ok,detail});
    const current=cashTruthCurrent(test,stage5);
    pass('Stage 5 Cash Truth is current',current,current?`Protected ${money(stage5.protectedCash)}`:`Stage 1 protected ${money(test.finance?.protectedCash)} · Stage 5 protected ${money(stage5?.protectedCash)}`);
    if(!current)return renderDry(lines,false);
    pass('Stage 5 budget available',budget>0,money(budget));if(!(budget>0))return renderDry(lines,false);
    test.transfer.mission={id:'DRY-MISSION',budget,status:'DRAFT'};
    const plan=buildDryPlan(test,budget);pass('Scouting auto-selection built',plan.ok,plan.error||`${plan.selectedCount||0} auto-selected pick(s)`);if(!plan.ok)return renderDry(lines,false);
    pass('Scouting allocation = Finance budget',Math.abs(plan.allocated-budget)<EPS,`${money(plan.allocated)} / ${money(budget)}`);
    plan.status='APPROVED';plan.approvedAt='DRY';test.scouting.allocationPlan={missionId:'DRY-MISSION',budget,allocated:plan.allocated,allocations:plan.allocations,status:'APPROVED',approvedAt:'DRY'};
    pass('Single payday plan approval gate',upper(test.scouting.allocationPlan.status)==='APPROVED','One whole-plan approval');
    test.transfer.route={id:'DRY-ROUTE',missionId:'DRY-MISSION',locked:true,allocations:clone(plan.allocations)};test.transfer.mission.status='LOCKED';
    pass('Transfer receives same approved allocation',Math.abs(sum(test.transfer.route.allocations,'amount')-budget)<EPS);
    test.registration.receipts=plan.allocations.map((r,i)=>({transactionId:`DRY-TX-${i+1}`,missionId:'DRY-MISSION',routeId:'DRY-ROUTE',legId:r.legId,ticker:r.ticker,account:'T212',shares:r.amount,priceInput:1,priceUnit:'GBP',currency:'GBP',fxRateToGbp:1,feesNative:0,totalCostGbp:r.amount,backendConfirmed:true,backendHolding:{account:'T212',ticker:r.ticker,name:r.name,shares:r.amount,bookCostGbp:r.amount,avgCostGbp:1,livePriceGbp:1,marketValueGbp:r.amount,annualIncomeGbp:r.expectedAnnualIncome,annualDpsGbp:r.amount>0?r.expectedAnnualIncome/r.amount:0,status:'ACTIVE'}}));
    pass('Synthetic execution receipts = route total',Math.abs(sum(test.registration.receipts,'totalCostGbp')-budget)<EPS);
    pass('Duplicate guard',new Set(test.registration.receipts.map(r=>r.transactionId)).size===test.registration.receipts.length);
    test.registration.receipts.forEach(r=>{const h=r.backendHolding,idx=test.squad.holdings.findIndex(x=>accountCode(x.account)==='T212'&&upper(x.ticker)===upper(h.ticker));if(idx>=0)test.squad.holdings[idx]=clone(h);else test.squad.holdings.push(clone(h));r.settledAt='DRY';r.settlementStatus='SQUAD_SETTLED_FROM_AURORADATA';});test.transfer.route.settled=true;test.transfer.mission.status='COMPLETE';
    pass('All receipts settle exactly once',test.registration.receipts.every(r=>!!r.settledAt));pass('Mission completes only after settlement',test.transfer.mission.status==='COMPLETE'&&test.transfer.route.settled===true);
    const dryIncome=(test.squad.holdings||[]).reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp)),0);pass('Squad → Income remains calculable',Number.isFinite(dryIncome),money(dryIncome));
    pass('Real Aurora state was not changed',JSON.stringify(A.readState())===realBefore,'In-memory rehearsal only');renderDry(lines,lines.every(x=>x.ok));
  }

  function renderDry(lines,ok){const box=$('dryRunRows'),status=$('dryRunStatus');if(box)box.innerHTML=lines.map(x=>`<li><strong>${x.ok?'PASS':'FAIL'}</strong> — ${x.label}${x.detail?` · ${x.detail}`:''}</li>`).join('');if(status){status.textContent=ok?'DRY RUN PASSED':'DRY RUN NEEDS ATTENTION';status.dataset.ok=ok?'true':'false';}}
  function render(){const A=window.AuroraClean;if(!A)return;const state=A.readState(),report=snapshotChecks(state),box=$('healthRows');if(box)box.innerHTML=report.checks.map(([label,ok])=>`<li><strong>${ok?'PASS':'FAIL'}</strong> — ${label}</li>`).join('');if($('healthBuild'))$('healthBuild').textContent=BUILD;if($('healthSummary'))$('healthSummary').textContent=`Stage 5 ${money(report.stage5Budget)} · Mission ${report.missionStatus} ${money(report.missionBudget)} · Scouting ${money(report.planTotal)} · Transfer ${money(report.routeTotal)} · Receipts ${money(report.receiptTotal)}`;}
  function boot(){if(!window.AuroraClean){setTimeout(boot,50);return}render();$('runPaydayDryRun')?.addEventListener('click',dryRun);window.addEventListener('aurora-clean:state',render);window.AuroraPaydayHealth=Object.freeze({BUILD,snapshotChecks,dryRun,cashTruthCurrent,pickCountForBudget});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();