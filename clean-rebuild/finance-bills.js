(() => {
  'use strict';

  const PAYDAYS_PER_YEAR = 13;
  const PAY_CYCLE_DAYS = 28;
  const HOLDING_TARGET_CYCLES = 1;
  const NORMAL_POT_PAYDAY_CAP = 300;
  const ROLLOVER_TARGET = 350;
  const ROLLOVER_PER_PAYDAY = 100;
  const LIVE_STATE_KEYS = ['aurora2:state:v1','aurora2:state:backup:lastgood'];
  const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? Math.max(0,n) : 0; };
  const money = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const iso = d => d instanceof Date && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
  const parseDate = v => { if(!v) return null; const d = new Date(`${String(v).slice(0,10)}T12:00:00`); return Number.isNaN(d.getTime()) ? null : d; };
  const addDays = (d,n) => { const x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; };
  const addMonthsClamped = (d,n) => { const x = new Date(d.getTime()), day=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+n); x.setDate(Math.min(day,new Date(x.getFullYear(),x.getMonth()+1,0).getDate())); return x; };
  const clean = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g,' ');
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isHoldingPot = v => clean(v) === 'holding pot';
  const isRolloverPot = v => norm(v).includes('rollover');

  function nextDue(date,frequency){
    const d=parseDate(date); if(!d) return '';
    if(frequency==='weekly') d.setDate(d.getDate()+7);
    else if(frequency==='4-weeks') d.setDate(d.getDate()+28);
    else if(frequency==='5-weeks') d.setDate(d.getDate()+35);
    else if(frequency==='monthly') return iso(addMonthsClamped(d,1));
    else if(frequency==='yearly') return iso(addMonthsClamped(d,12));
    else return date;
    return iso(d);
  }

  function occurrenceCountForUndatedBill(bill,start,end){
    if(!start||!end) return 0;
    const days=Math.max(1,Math.round((end-start)/86400000)), f=String(bill?.frequency||'one-off');
    if(f==='weekly') return Math.max(1,Math.ceil(days/7));
    if(f==='4-weeks') return Math.max(1,Math.ceil(days/28));
    if(f==='5-weeks') return Math.max(1,Math.ceil(days/35));
    if(f==='monthly') return Math.max(1,Math.round(days/30.4375));
    return 0;
  }

  function projectBillOccurrences(bill,start,end){
    if(!bill || bill.paid || bill.archived || bill.included===false || !start || !end) return [];
    const amount=num(bill.amount); if(amount<=0) return [];
    const frequency=String(bill.frequency||'one-off'), due=parseDate(bill.due||bill.dueDate), out=[];
    if(!due){
      const count=occurrenceCountForUndatedBill(bill,start,end);
      for(let i=0;i<count;i++) out.push({billId:bill.id,billName:bill.name,amount,date:'',fundingSource:bill.fundingSource||'Holding Pot',frequency,estimated:true,overdue:false});
      return out;
    }
    if(frequency==='one-off'){
      if(due<end) out.push({billId:bill.id,billName:bill.name,amount,date:iso(due),fundingSource:bill.fundingSource||'Holding Pot',frequency,estimated:false,overdue:due<start});
      return out;
    }
    let cursor=new Date(due), guard=0;
    if(cursor<start){
      out.push({billId:bill.id,billName:bill.name,amount,date:iso(cursor),fundingSource:bill.fundingSource||'Holding Pot',frequency,estimated:false,overdue:true});
      let next=parseDate(nextDue(iso(cursor),frequency));
      while(next && next<start && guard++<120){ const after=parseDate(nextDue(iso(next),frequency)); if(!after||after.getTime()===next.getTime()) break; next=after; }
      cursor=next;
    }
    guard=0;
    while(cursor && cursor<end && guard++<120){
      if(!(out.length && out[0].overdue && out[0].date===iso(cursor))) out.push({billId:bill.id,billName:bill.name,amount,date:iso(cursor),fundingSource:bill.fundingSource||'Holding Pot',frequency,estimated:false,overdue:false});
      const next=parseDate(nextDue(iso(cursor),frequency)); if(!next||next.getTime()===cursor.getTime()) break; cursor=next;
    }
    return out;
  }

  function readLiveFinance(){
    for(const key of LIVE_STATE_KEYS){
      try{
        const state=JSON.parse(localStorage.getItem(key)||'null');
        if(state?.finance && typeof state.finance==='object') return {key,finance:state.finance};
      }catch(_){ }
    }
    return {key:'',finance:null};
  }

  function normaliseBill(row,index){
    return {
      id:String(row?.id||`BILL-${index+1}`), name:String(row?.name||`Bill ${index+1}`), amount:num(row?.amount),
      due:String(row?.due||row?.dueDate||'').slice(0,10), frequency:String(row?.frequency||'monthly'),
      fundingSource:String(row?.fundingSource||'Holding Pot'), included:row?.included!==false, paid:!!row?.paid, archived:!!row?.archived
    };
  }

  function normalisePot(row,index){
    return {
      id:String(row?.id||`POT-${index+1}`), name:String(row?.name||`Pot ${index+1}`), balance:Number(num(row?.balance).toFixed(2)),
      target:Number(num(row?.target).toFixed(2)), spent:Number(num(row?.spent).toFixed(2)), goalMode:String(row?.goalMode||''),
      deadline:String(row?.deadline||row?.completeBy||row?.targetDate||'').slice(0,10), fundingOverride:Number(num(row?.fundingOverride).toFixed(2)),
      priority:[1,2,3].includes(Number(row?.priority))?Number(row.priority):2, archived:!!row?.archived, note:String(row?.note||'')
    };
  }

  function importBills(){
    const aurora=window.AuroraClean; if(!aurora) return {ok:false,message:'Clean runtime is not ready.'};
    const live=readLiveFinance(), rows=Array.isArray(live.finance?.bills)?live.finance.bills:[];
    if(!rows.length) return {ok:false,message:'No live Aurora bills were found in this browser state.'};
    const cleanRows=rows.map(normaliseBill).filter(row=>row.name&&row.amount>0);
    aurora.updateState(state=>{ state.finance.bills=cleanRows; state.finance.billImportSource=live.key; state.finance.billImportAt=new Date().toISOString(); });
    return {ok:true,message:`Imported ${cleanRows.length} live bill(s) from ${live.key}.`};
  }

  function importPots(){
    const aurora=window.AuroraClean; if(!aurora) return {ok:false,message:'Clean runtime is not ready.'};
    const live=readLiveFinance(), rows=Array.isArray(live.finance?.pots)?live.finance.pots:[];
    if(!rows.length) return {ok:false,message:'No live Aurora pots were found in this browser state.'};
    const pots=rows.map(normalisePot).filter(row=>row.name);
    const hp=pots.find(row=>!row.archived&&isHoldingPot(row.name));
    aurora.updateState(state=>{
      state.finance.pots=pots;
      if(hp){ state.finance.holdingPotBalance=hp.balance; state.finance.holdingPotTarget=hp.target; }
      state.finance.potImportSource=live.key;
      state.finance.potImportAt=new Date().toISOString();
    });
    return {ok:true,message:`Imported ${pots.length} live pot(s) from ${live.key}.`};
  }

  function findHoldingPot(finance){ return (Array.isArray(finance?.pots)?finance.pots:[]).find(row=>!row?.archived&&isHoldingPot(row?.name))||null; }

  function importHoldingPot(){
    const aurora=window.AuroraClean; if(!aurora) return {ok:false,message:'Clean runtime is not ready.'};
    const live=readLiveFinance();
    if(!live.finance) return {ok:false,message:'No live Aurora Finance state was found in this browser.'};
    const pot=findHoldingPot(live.finance);
    if(!pot) return {ok:false,message:'No active Holding Pot was found in the live Aurora Finance state.'};
    const balance=Number(num(pot.balance).toFixed(2)), target=Number(num(pot.target).toFixed(2));
    aurora.updateState(state=>{ state.finance.holdingPotBalance=balance; state.finance.holdingPotTarget=target; state.finance.holdingPotImportSource=live.key; state.finance.holdingPotImportAt=new Date().toISOString(); });
    return {ok:true,message:`Imported Holding Pot balance ${money(balance)}${target?` and floor ${money(target)}`:''} from ${live.key}.`};
  }

  function plan(state){
    const bills=(state.finance?.bills||[]).filter(row=>!row.archived&&row.included!==false&&!row.paid&&num(row.amount)>0);
    const payday=parseDate(state.finance?.paydayDate)||new Date(); payday.setHours(12,0,0,0);
    const nextPayday=addDays(payday,PAY_CYCLE_DAYS), annualEnd=addDays(payday,PAY_CYCLE_DAYS*PAYDAYS_PER_YEAR);
    const cycle=[]; bills.forEach(b=>cycle.push(...projectBillOccurrences(b,payday,nextPayday)));
    const current=cycle.filter(o=>clean(o.fundingSource)==='current account');
    const holdingBills=bills.filter(b=>isHoldingPot(b.fundingSource)), holdingCycle=cycle.filter(o=>isHoldingPot(o.fundingSource));
    const annualHolding=[]; holdingBills.forEach(b=>annualHolding.push(...projectBillOccurrences(b,payday,annualEnd)));
    const currentAccountDue=Number(current.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const holdingCycleRequired=Number(holdingCycle.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const annualHoldingTotal=Number(annualHolding.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const holdingPerPayday=Number((annualHoldingTotal/PAYDAYS_PER_YEAR).toFixed(2));
    return {payday:iso(payday),nextPayday:iso(nextPayday),billCount:bills.length,currentAccountDue,holdingCycleRequired,annualHoldingTotal,holdingPerPayday,cycle,holdingCycle,annualHolding,holdingBills};
  }

  function holdingPlan(state,billPlan){
    const payday=parseDate(billPlan.payday), nextPayday=parseDate(billPlan.nextPayday), today=new Date(); today.setHours(12,0,0,0);
    const holdingBills=billPlan.holdingBills||[], prePayday=[];
    if(payday && payday>today) holdingBills.forEach(b=>prePayday.push(...projectBillOccurrences(b,today,payday)));
    const spendBeforePayday=Number(prePayday.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const currentBalance=Number(num(state.finance?.holdingPotBalance).toFixed(2)), minimumFloor=Number(num(state.finance?.holdingPotTarget).toFixed(2));
    const projectedPaydayBalance=Number(Math.max(0,currentBalance-spendBeforePayday).toFixed(2));
    const prePaydayShortfall=Number(Math.max(0,spendBeforePayday-currentBalance).toFixed(2));
    const baseContribution=Number(num(billPlan.holdingPerPayday).toFixed(2));
    const cycleTotals=Array.from({length:HOLDING_TARGET_CYCLES},()=>0);
    if(payday && nextPayday){ billPlan.holdingCycle.forEach(o=>{ cycleTotals[0]+=num(o.amount); }); }
    const calculatedTarget=Number((cycleTotals[0]||0).toFixed(2)), dynamicTarget=Number(Math.max(minimumFloor,calculatedTarget).toFixed(2));
    const projectedBeforeTopUp=Number((projectedPaydayBalance+baseContribution).toFixed(2));
    const safetyTopUp=Number(Math.max(0,dynamicTarget-projectedBeforeTopUp).toFixed(2)), afterFunding=Number((projectedBeforeTopUp+safetyTopUp).toFixed(2));
    return {currentBalance,minimumFloor,spendBeforePayday,projectedPaydayBalance,prePaydayShortfall,baseContribution,calculatedTarget,dynamicTarget,safetyTopUp,projectedBeforeTopUp,afterFunding,headroom:Number((afterFunding-dynamicTarget).toFixed(2)),cycleRequired:Number(num(billPlan.holdingCycleRequired).toFixed(2)),targetCycles:HOLDING_TARGET_CYCLES,prePayday};
  }

  function potFunded(p){ return p?.goalMode==='funded-progress' ? num(p.balance)+num(p.spent) : num(p.balance); }
  function potGap(p){ return Math.max(0,num(p.target)-potFunded(p)); }
  function excludedPot(p){
    const name=norm(p?.name);
    return !p || p.archived || potGap(p)<=.009 || isRolloverPot(p.name) || name==='holding pot' || name==='spending pot' || name==='ig trading';
  }
  function deadlineInfo(p,payday){
    const gap=potGap(p), deadline=parseDate(p.deadline), pd=parseDate(payday);
    if(!deadline||!pd||gap<=.009) return {hasDeadline:!!deadline,gap,required:0,paydays:0};
    const diff=deadline.getTime()-pd.getTime(), cycles=Math.floor(diff/(PAY_CYCLE_DAYS*86400000));
    const paydays=diff>=0?Math.max(1,cycles+1):0;
    return {hasDeadline:true,gap,required:paydays>0?gap/paydays:gap,paydays};
  }
  function addAllocation(map,pot,amount,reason,required=0){
    const old=map.get(pot.id)||{amount:0,reasons:[],required:0};
    old.amount+=Math.max(0,amount); old.required=Math.max(old.required,required||0);
    if(reason&&!old.reasons.includes(reason)) old.reasons.push(reason); map.set(pot.id,old);
  }
  function allocatePriority(candidates,remaining,allocations){
    for(const row of candidates.sort((a,b)=>a.priority-b.priority||b.gap-a.gap||String(a.pot.name).localeCompare(String(b.pot.name)))){
      if(remaining<=.009) break;
      const current=allocations.get(row.pot.id)?.amount||0, need=Math.max(0,row.gap-current), take=Math.min(remaining,need);
      if(take>.009){ addAllocation(allocations,row.pot,take,`P${row.priority} priority funding`); remaining-=take; }
    }
    return remaining;
  }

  function potFundingPlan(state){
    const pots=(state.finance?.pots||[]).filter(p=>!p?.archived);
    const expected=num(state.finance?.expectedWages), received=num(state.finance?.wagesReceived), wageDifference=Number((received-expected).toFixed(2));
    const extraBudget=Math.max(0,wageDifference), optionalBudget=Math.min(extraBudget,NORMAL_POT_PAYDAY_CAP), payday=state.finance?.paydayDate||'';
    const rollover=pots.find(p=>isRolloverPot(p.name))||null, rolloverBalance=Number(num(rollover?.balance).toFixed(2));
    const rolloverGap=Number(Math.max(0,ROLLOVER_TARGET-rolloverBalance).toFixed(2));
    const rolloverContribution=rollover?Number(Math.min(optionalBudget,ROLLOVER_PER_PAYDAY,rolloverGap).toFixed(2)):0;
    const candidates=pots.filter(p=>!excludedPot(p)).map(p=>({pot:p,gap:potGap(p),priority:[1,2,3].includes(Number(p.priority))?Number(p.priority):2,deadline:deadlineInfo(p,payday)}));
    const allocations=new Map(); let requiredFunding=0, deadlineRequired=0;
    candidates.forEach(row=>{
      const deadlineNeed=row.deadline.hasDeadline?Math.min(row.gap,Math.max(0,row.deadline.required)):0;
      const manual=Math.min(row.gap,num(row.pot.fundingOverride));
      const required=Math.min(row.gap,Math.max(deadlineNeed,manual));
      if(deadlineNeed>.009) deadlineRequired+=deadlineNeed;
      if(required>.009){
        const reasons=[];
        if(deadlineNeed>.009) reasons.push(`Required for ${row.pot.deadline} · ${row.deadline.paydays>0?row.deadline.paydays+' payday'+(row.deadline.paydays===1?'':'s')+' left':'deadline passed'} · pace only`);
        if(manual>deadlineNeed+.009) reasons.push('Manual minimum');
        addAllocation(allocations,row.pot,required,reasons.join(' · '),deadlineNeed); requiredFunding+=required;
      }
    });
    if(rollover&&rolloverContribution>.009) addAllocation(allocations,rollover,rolloverContribution,`Payday Rollover · ${money(ROLLOVER_TARGET)} target · max ${money(ROLLOVER_PER_PAYDAY)} per payday`);
    const optionalAfterRollover=Math.max(0,optionalBudget-rolloverContribution);
    const extraCandidates=candidates.filter(row=>!row.deadline.hasDeadline);
    const remaining=allocatePriority(extraCandidates,optionalAfterRollover,allocations);
    const optionalPriority=Number((optionalAfterRollover-remaining).toFixed(2));
    const rows=[];
    pots.forEach(p=>{ const a=allocations.get(p.id); if(a&&a.amount>.009) rows.push({id:p.id,name:p.name,amount:Number(Math.min(potGap(p),a.amount).toFixed(2)),required:Number((a.required||0).toFixed(2)),reason:a.reasons.join(' · '),deadline:p.deadline||''}); });
    const total=Number(rows.reduce((s,r)=>s+r.amount,0).toFixed(2));
    return {potCount:pots.length,expectedWages:expected,wagesReceived:received,wageDifference,extraBudget:Number(extraBudget.toFixed(2)),optionalCap:NORMAL_POT_PAYDAY_CAP,optionalBudget:Number(optionalBudget.toFixed(2)),requiredFunding:Number(requiredFunding.toFixed(2)),deadlineRequired:Number(deadlineRequired.toFixed(2)),rolloverBalance,rolloverGap,rolloverContribution,optionalAfterRollover:Number(optionalAfterRollover.toFixed(2)),optionalPriority,total,rows};
  }

  function render(){
    const aurora=window.AuroraClean; if(!aurora) return;
    const state=aurora.readState(), p=plan(state), hp=holdingPlan(state,p), pots=potFundingPlan(state);
    const text=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    const paydayInput=document.getElementById('financePaydayDate'); if(paydayInput && !paydayInput.value) paydayInput.value=state.finance?.paydayDate||p.payday;
    text('financeBillCount',String(p.billCount)); text('financeCurrentAccountDue',money(p.currentAccountDue)); text('financeHoldingAnnual',money(p.annualHoldingTotal)); text('financeHoldingPerPayday',money(p.holdingPerPayday)); text('financeBillWindow',`${p.payday} → ${p.nextPayday}`);
    const rows=document.getElementById('financeStage2BillRows'); if(rows) rows.innerHTML=p.cycle.length?p.cycle.map(o=>`<li><strong>${esc(o.billName)}</strong> — ${money(o.amount)} — ${esc(o.fundingSource||'')} — ${o.date?esc(o.date):'estimated'}${o.overdue?' — OVERDUE':''}</li>`).join(''):'<li>No bill occurrences in the next 28-day payday cycle.</li>';
    const status=document.getElementById('financeBillImportStatus'); if(status && state.finance?.billImportAt) status.textContent=`Live bills imported ${new Date(state.finance.billImportAt).toLocaleString('en-GB')} · ${state.finance.billImportSource||'Aurora state'}`;

    text('financeHoldingBalanceStage3',money(hp.currentBalance)); text('financeHoldingSpendBeforePayday',money(hp.spendBeforePayday)); text('financeHoldingProjectedPayday',money(hp.projectedPaydayBalance)); text('financeHoldingBaseContribution',money(hp.baseContribution)); text('financeHoldingDynamicTarget',money(hp.dynamicTarget)); text('financeHoldingTopUpStage3',money(hp.safetyTopUp)); text('financeHoldingAfterFunding',money(hp.afterFunding)); text('financeHoldingCycleRequired',money(hp.cycleRequired)); text('financeHoldingFloor',money(hp.minimumFloor)); text('financeHoldingPrePaydayShortfall',money(hp.prePaydayShortfall)); text('financeHoldingHeadroom',money(hp.headroom));
    const hpStatus=document.getElementById('financeHoldingImportStatus'); if(hpStatus && state.finance?.holdingPotImportAt) hpStatus.textContent=`Holding Pot imported ${new Date(state.finance.holdingPotImportAt).toLocaleString('en-GB')} · ${state.finance.holdingPotImportSource||'Aurora state'}`;
    const hpRows=document.getElementById('financeStage3PrePaydayRows'); if(hpRows) hpRows.innerHTML=hp.prePayday.length?hp.prePayday.map(o=>`<li><strong>${esc(o.billName)}</strong> — ${money(o.amount)} — ${o.date?esc(o.date):'estimated'}${o.overdue?' — OVERDUE':''}</li>`).join(''):'<li>No Holding Pot spend is projected before payday.</li>';

    text('financePotCount',String(pots.potCount)); text('financePotWageDifference',money(pots.wageDifference)); text('financePotRequired',money(pots.requiredFunding)); text('financePotOptionalBudget',money(pots.optionalBudget)); text('financePotRollover',money(pots.rolloverContribution)); text('financePotOptionalPriority',money(pots.optionalPriority)); text('financePotTotal',money(pots.total));
    const potStatus=document.getElementById('financePotImportStatus'); if(potStatus && state.finance?.potImportAt) potStatus.textContent=`Pots imported ${new Date(state.finance.potImportAt).toLocaleString('en-GB')} · ${state.finance.potImportSource||'Aurora state'}`;
    const potRows=document.getElementById('financeStage4PotRows'); if(potRows) potRows.innerHTML=pots.rows.length?pots.rows.map(r=>`<li><strong>${esc(r.name)}</strong> — ${money(r.amount)}${r.required>0?` — required ${money(r.required)}`:''} — ${esc(r.reason)}</li>`).join(''):'<li>No Stage 4 pot funding is required from the current payday inputs.</li>';

    const nextBills={...p,holdingBills:undefined,calculatedAt:state.finance?.stage2Bills?.calculatedAt||new Date().toISOString()};
    const nextHolding={...hp,calculatedAt:state.finance?.stage3HoldingPot?.calculatedAt||new Date().toISOString()};
    const nextPots={...pots,calculatedAt:state.finance?.stage4PotFunding?.calculatedAt||new Date().toISOString()};
    if(JSON.stringify(state.finance?.stage2Bills||{})!==JSON.stringify(nextBills) || JSON.stringify(state.finance?.stage3HoldingPot||{})!==JSON.stringify(nextHolding) || JSON.stringify(state.finance?.stage4PotFunding||{})!==JSON.stringify(nextPots)) aurora.updateState(next=>{ next.finance.stage2Bills=nextBills; next.finance.stage3HoldingPot=nextHolding; next.finance.stage4PotFunding=nextPots; });
  }

  let writing=false;
  function safeRender(){ if(writing) return; writing=true; try{render();}finally{writing=false;} }
  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return;}
    document.getElementById('financeImportBills')?.addEventListener('click',()=>{const result=importBills(); const el=document.getElementById('financeBillImportStatus'); if(el)el.textContent=result.message; safeRender();});
    document.getElementById('financeImportHoldingPot')?.addEventListener('click',()=>{const result=importHoldingPot(); const el=document.getElementById('financeHoldingImportStatus'); if(el)el.textContent=result.message; safeRender();});
    document.getElementById('financeImportPots')?.addEventListener('click',()=>{const result=importPots(); const el=document.getElementById('financePotImportStatus'); if(el)el.textContent=result.message; safeRender();});
    document.getElementById('financePaydayDate')?.addEventListener('change',event=>{window.AuroraClean.updateState(state=>{state.finance.paydayDate=String(event.target.value||'').slice(0,10);state.finance.stage2Bills=null;state.finance.stage3HoldingPot=null;state.finance.stage4PotFunding=null;});safeRender();});
    document.getElementById('financeRecalculateBills')?.addEventListener('click',safeRender); document.getElementById('financeRecalculateHolding')?.addEventListener('click',safeRender); document.getElementById('financeRecalculatePots')?.addEventListener('click',safeRender);
    safeRender(); window.addEventListener('aurora-clean:state',safeRender);
    window.AuroraFinanceBills=Object.freeze({plan,holdingPlan,potFundingPlan,projectBillOccurrences,nextDue,importBills,importHoldingPot,importPots});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();