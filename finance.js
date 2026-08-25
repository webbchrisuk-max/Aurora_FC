/* Aurora City FC — Finance Payday Control Engine — restored calculator-only runtime */
(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const PAYDAYS_PER_YEAR=13;
  const PAY_CYCLE_DAYS=28;
  const HOLDING_TARGET_CYCLES=3;

  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const cleanName=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
  const isHoldingPotName=v=>cleanName(v)==='holding pot';
  const dateISO=d=>d instanceof Date&&!Number.isNaN(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';

  function parseLocalDate(v){if(!v)return null;const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?null:d}
  function addDays(d,days){const x=new Date(d.getTime());x.setDate(x.getDate()+days);return x}
  function addMonthsClamped(d,months){const x=new Date(d.getTime()),day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+months);x.setDate(Math.min(day,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));return x}
  function nextDue(date,frequency){const d=parseLocalDate(date);if(!d)return'';if(frequency==='weekly')d.setDate(d.getDate()+7);else if(frequency==='4-weeks')d.setDate(d.getDate()+28);else if(frequency==='5-weeks')d.setDate(d.getDate()+35);else if(frequency==='monthly')return dateISO(addMonthsClamped(d,1));else if(frequency==='yearly')return dateISO(addMonthsClamped(d,12));else return date;return dateISO(d)}
  function activePots(state){return arr(state?.finance?.pots).filter(p=>!p?.archived)}
  function activeBills(state){return arr(state?.finance?.bills).filter(b=>!b?.archived)}
  function potFunded(p){const balance=num(p?.balance);return p?.goalMode==='funded-progress'?balance+num(p?.spent):balance}
  function potGap(p){return Math.max(0,num(p?.target)-potFunded(p))}
  function holdingPot(state){return activePots(state).find(p=>isHoldingPotName(p?.name))||null}

  function occurrenceCountForUndatedBill(bill,payday,nextPayday){
    if(!payday||!nextPayday)return 0;
    const days=Math.max(1,Math.round((nextPayday-payday)/86400000));
    const frequency=String(bill?.frequency||'one-off');
    if(frequency==='weekly')return Math.max(1,Math.ceil(days/7));
    if(frequency==='4-weeks')return Math.max(1,Math.ceil(days/28));
    if(frequency==='5-weeks')return Math.max(1,Math.ceil(days/35));
    if(frequency==='monthly')return Math.max(1,Math.round(days/30.4375));
    return 0;
  }

  function projectBillOccurrences(bill,payday,nextPayday){
    if(!bill||bill.paid||bill.archived||bill.included===false||!payday||!nextPayday)return[];
    const amount=num(bill.amount);if(amount<=0)return[];
    const frequency=String(bill.frequency||'one-off'),due=parseLocalDate(bill.due),out=[];
    if(!due){
      const count=occurrenceCountForUndatedBill(bill,payday,nextPayday);
      for(let i=0;i<count;i++)out.push({billId:bill.id,billName:bill.name,amount,date:'',fundingSource:bill.fundingSource,frequency,estimated:true,overdue:false});
      return out;
    }
    if(frequency==='one-off'){
      if(due<nextPayday)out.push({billId:bill.id,billName:bill.name,amount,date:dateISO(due),fundingSource:bill.fundingSource,frequency,estimated:false,overdue:due<payday});
      return out;
    }
    let cursor=new Date(due),guard=0;
    if(cursor<payday){
      out.push({billId:bill.id,billName:bill.name,amount,date:dateISO(cursor),fundingSource:bill.fundingSource,frequency,estimated:false,overdue:true});
      let next=parseLocalDate(nextDue(dateISO(cursor),frequency));
      while(next&&next<payday&&guard++<120){const after=parseLocalDate(nextDue(dateISO(next),frequency));if(!after||after.getTime()===next.getTime())break;next=after}
      cursor=next;
    }
    guard=0;
    while(cursor&&cursor<nextPayday&&guard++<120){
      if(!(out.length&&out[0].overdue&&out[0].date===dateISO(cursor)))out.push({billId:bill.id,billName:bill.name,amount,date:dateISO(cursor),fundingSource:bill.fundingSource,frequency,estimated:false,overdue:false});
      const next=parseLocalDate(nextDue(dateISO(cursor),frequency));if(!next||next.getTime()===cursor.getTime())break;cursor=next;
    }
    return out;
  }

  function summarizeOccurrences(rows){
    const map=new Map();
    rows.forEach(o=>{const x=map.get(o.billId)||{billId:o.billId,name:o.billName,count:0,total:0,estimated:false,overdue:false};x.count++;x.total+=num(o.amount);x.estimated=x.estimated||!!o.estimated;x.overdue=x.overdue||!!o.overdue;map.set(o.billId,x)});
    return [...map.values()].sort((a,b)=>b.total-a.total||String(a.name).localeCompare(String(b.name)));
  }

  function holdingDynamicForecast(holdingBills,annualOccurrences,payday,annualContribution,hp){
    const minimumFloor=num(hp?.target),cycleTotals=Array.from({length:HOLDING_TARGET_CYCLES},()=>0),cycleCounts=Array.from({length:HOLDING_TARGET_CYCLES},()=>0);
    if(!payday)return{minimumFloor,calculatedTarget:0,dynamicTarget:minimumFloor,cycleTotals,cycleCounts,peakCycle:0};
    annualOccurrences.forEach(o=>{if(!o.date)return;const d=parseLocalDate(o.date);if(!d)return;const diff=Math.floor((d-payday)/86400000),idx=diff<0?0:Math.floor(diff/PAY_CYCLE_DAYS);if(idx>=0&&idx<HOLDING_TARGET_CYCLES){cycleTotals[idx]+=num(o.amount);cycleCounts[idx]++}});
    holdingBills.filter(b=>!parseLocalDate(b.due)).forEach(b=>{const amount=num(b.amount);for(let i=0;i<HOLDING_TARGET_CYCLES;i++){const start=addDays(payday,i*PAY_CYCLE_DAYS),end=addDays(start,PAY_CYCLE_DAYS),count=occurrenceCountForUndatedBill(b,start,end);cycleTotals[i]+=amount*count;cycleCounts[i]+=count}});
    let cumulative=0,calculatedTarget=0,peakCycle=0;
    cycleTotals.forEach((amount,i)=>{cumulative+=amount;const required=Math.max(0,cumulative-annualContribution*i);if(required>calculatedTarget){calculatedTarget=required;peakCycle=i+1}});
    calculatedTarget=Number(calculatedTarget.toFixed(2));
    return{minimumFloor:Number(minimumFloor.toFixed(2)),calculatedTarget,dynamicTarget:Number(Math.max(minimumFloor,calculatedTarget).toFixed(2)),cycleTotals:cycleTotals.map(v=>Number(v.toFixed(2))),cycleCounts,peakCycle};
  }

  function autoCommitments(state,plan){
    const payday=parseLocalDate(plan?.paydayDate),nextPayday=payday?addDays(payday,PAY_CYCLE_DAYS):null,annualEnd=payday?addDays(payday,PAY_CYCLE_DAYS*PAYDAYS_PER_YEAR):null;
    const bills=activeBills(state).filter(b=>!b.paid&&b.included!==false),cycleOccurrences=[];
    bills.forEach(b=>cycleOccurrences.push(...projectBillOccurrences(b,payday,nextPayday)));
    const currentAccountOccurrences=cycleOccurrences.filter(o=>String(o.fundingSource||'')==='Current Account');
    const currentAccountBills=[...new Set(currentAccountOccurrences.map(o=>o.billId))].map(id=>bills.find(b=>b.id===id)).filter(Boolean);
    const billsDue=Number(currentAccountOccurrences.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const hp=holdingPot(state),holdingBills=bills.filter(b=>isHoldingPotName(b.fundingSource)),holdingOccurrences=cycleOccurrences.filter(o=>isHoldingPotName(o.fundingSource)),annualHoldingOccurrences=[];
    holdingBills.forEach(b=>annualHoldingOccurrences.push(...projectBillOccurrences(b,payday,annualEnd)));
    const holdingRequired=Number(holdingOccurrences.reduce((s,o)=>s+num(o.amount),0).toFixed(2)),annualHoldingTotal=Number(annualHoldingOccurrences.reduce((s,o)=>s+num(o.amount),0).toFixed(2)),annualHoldingContribution=Number((annualHoldingTotal/PAYDAYS_PER_YEAR).toFixed(2));
    const holdingBalance=Number(num(hp?.balance).toFixed(2)),dynamic=holdingDynamicForecast(holdingBills,annualHoldingOccurrences,payday,annualHoldingContribution,hp),holdingProjectedBeforeTopUp=Number((holdingBalance+annualHoldingContribution).toFixed(2)),holdingTopUp=Number((payday?Math.max(0,dynamic.dynamicTarget-holdingProjectedBeforeTopUp):0).toFixed(2)),holdingAfterFunding=Number((holdingProjectedBeforeTopUp+holdingTopUp).toFixed(2));
    const potsDue=Number(activePots(state).filter(p=>!isHoldingPotName(p.name)).reduce((s,p)=>s+Math.min(potGap(p),num(p.fundingPerPayday)),0).toFixed(2));
    return{billsDue,potsDue,bills:currentAccountBills,billOccurrences:currentAccountOccurrences,allOccurrences:cycleOccurrences,payday:payday?dateISO(payday):'',nextPayday:nextPayday?dateISO(nextPayday):'',annualEnd:annualEnd?dateISO(annualEnd):'',holdingPot:hp,holdingOccurrences,holdingSummary:summarizeOccurrences(holdingOccurrences),annualHoldingOccurrences,annualHoldingSummary:summarizeOccurrences(annualHoldingOccurrences),annualHoldingTotal,annualHoldingContribution,holdingRequired,holdingBalance,holdingTopUp,holdingSurplus:Number(Math.max(0,holdingAfterFunding-holdingRequired).toFixed(2)),holdingDynamicTarget:dynamic.dynamicTarget,holdingCalculatedTarget:dynamic.calculatedTarget,holdingMinimumFloor:dynamic.minimumFloor,holdingCycleTotals:dynamic.cycleTotals,holdingCycleCounts:dynamic.cycleCounts,holdingPeakCycle:dynamic.peakCycle,holdingAfterFunding,holdingProjectedBeforeTopUp,holdingTargetHeadroom:Number((holdingAfterFunding-dynamic.dynamicTarget).toFixed(2)),holdingTargetCycles:HOLDING_TARGET_CYCLES};
  }

  function stateWithFundingPreview(state,plan){
    const build=A()?.funding?.buildPlan;if(typeof build!=='function')return{state,fundingPlan:state?.finance?.fundingPolicy?.lastPlan||null};
    try{const seeded={...state,finance:{...state.finance,plan:{...(state.finance?.plan||{}),...plan}}},result=build(seeded);return{state:{...seeded,finance:{...seeded.finance,pots:result.pots,fundingPolicy:result.policy}},fundingPlan:result.policy?.lastPlan||null}}catch(_){return{state,fundingPlan:state?.finance?.fundingPolicy?.lastPlan||null}}
  }

  function calc(plan,state=A()?.core?.read?.()||{}){
    const expectedWages=num(plan?.expectedWages??plan?.netPay),wagesReceived=num(plan?.wagesReceived??plan?.netPay),wageDifference=Number((wagesReceived-expectedWages).toFixed(2)),wageExtra=Math.max(0,wageDifference),wageShortfall=Math.max(0,-wageDifference);
    const preview=stateWithFundingPreview(state,{...plan,expectedWages,wagesReceived,netPay:wagesReceived}),auto=autoCommitments(preview.state,plan||{}),fundingPlan=preview.fundingPlan||{},wageExtraToPots=Number(num(fundingPlan.extraAllocated).toFixed(2)),wageExtraRemaining=Number(Math.max(0,wageExtra-wageExtraToPots).toFixed(2));
    const normalized={...(plan||{}),expectedWages,wagesReceived,netPay:wagesReceived,wageDifference,wageExtra,wageShortfall,wageExtraToPots,wageExtraRemaining,billsDue:auto.billsDue,potsDue:auto.potsDue,annualBillFunding:auto.annualHoldingContribution,holdingPotTopUp:auto.holdingTopUp};
    const totalCash=Number((num(normalized.openingCash)+wagesReceived+num(normalized.extraCash)).toFixed(2)),commitments=Number((auto.billsDue+auto.annualHoldingContribution+auto.holdingTopUp+auto.potsDue+num(normalized.otherPlanned)).toFixed(2)),safeSurplus=Number(Math.max(0,totalCash-commitments-num(normalized.protectedCash)).toFixed(2));
    return{totalCash,commitments,safeSurplus,auto,plan:normalized,fundingPlan};
  }

  function paydayFundingPreview(state,plan){
    const c=calc(plan,state),rows=arr(c.fundingPlan?.rows).map(r=>({id:String(r.id||''),name:String(r.name||'Pot'),amount:Number(num(r.amount).toFixed(2)),reason:String(r.reason||'')})).filter(r=>r.id&&r.amount>.005),goalPotsTotal=Number(rows.reduce((s,r)=>s+r.amount,0).toFixed(2)),holdingContribution=Number((num(c.auto.annualHoldingContribution)+num(c.auto.holdingTopUp)).toFixed(2));
    return{c,rows,goalPotsTotal,holdingContribution,total:Number((goalPotsTotal+holdingContribution).toFixed(2))};
  }

  function nextPaydayPlan(plan){
    const payday=parseLocalDate(plan?.paydayDate),nextDate=payday?dateISO(addDays(payday,PAY_CYCLE_DAYS)):'',expected=num(plan?.expectedWages??plan?.netPay);
    return{...(plan||{}),paydayDate:nextDate,openingCash:0,expectedWages:expected,wagesReceived:expected,netPay:expected,wageDifference:0,wageExtra:0,wageShortfall:0,wageExtraToPots:0,wageExtraRemaining:0,extraCash:0,otherPlanned:0,releaseAmount:0,billsDue:0,potsDue:0,annualBillFunding:0,holdingPotTopUp:0};
  }

  w.Aurora2=w.Aurora2||{};
  w.Aurora2.financePaydayControl=Object.freeze({paydayFundingPreview,nextPaydayPlan,calc,autoCommitments,projectBillOccurrences,nextDue});
})(window);
