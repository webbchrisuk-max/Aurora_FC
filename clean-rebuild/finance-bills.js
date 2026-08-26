(() => {
  'use strict';

  const PAYDAYS_PER_YEAR = 13;
  const PAY_CYCLE_DAYS = 28;
  const HOLDING_TARGET_CYCLES = 1;
  const LIVE_STATE_KEYS = ['aurora2:state:v1','aurora2:state:backup:lastgood'];
  const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? Math.max(0,n) : 0; };
  const money = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const iso = d => d instanceof Date && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
  const parseDate = v => { if(!v) return null; const d = new Date(`${String(v).slice(0,10)}T12:00:00`); return Number.isNaN(d.getTime()) ? null : d; };
  const addDays = (d,n) => { const x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; };
  const addMonthsClamped = (d,n) => { const x = new Date(d.getTime()), day=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+n); x.setDate(Math.min(day,new Date(x.getFullYear(),x.getMonth()+1,0).getDate())); return x; };
  const clean = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g,' ');
  const isHoldingPot = v => clean(v) === 'holding pot';

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

  function readLiveBills(){
    const live=readLiveFinance();
    const rows=Array.isArray(live.finance?.bills)?live.finance.bills:[];
    return {key:live.key,rows};
  }

  function normaliseBill(row,index){
    return {
      id:String(row?.id||`BILL-${index+1}`),
      name:String(row?.name||`Bill ${index+1}`),
      amount:num(row?.amount),
      due:String(row?.due||row?.dueDate||'').slice(0,10),
      frequency:String(row?.frequency||'monthly'),
      fundingSource:String(row?.fundingSource||'Holding Pot'),
      included:row?.included!==false,
      paid:!!row?.paid,
      archived:!!row?.archived
    };
  }

  function importBills(){
    const aurora=window.AuroraClean; if(!aurora) return {ok:false,message:'Clean runtime is not ready.'};
    const live=readLiveBills();
    if(!live.rows.length) return {ok:false,message:'No live Aurora bills were found in this browser state.'};
    const rows=live.rows.map(normaliseBill).filter(row=>row.name&&row.amount>0);
    aurora.updateState(state=>{ state.finance.bills=rows; state.finance.billImportSource=live.key; state.finance.billImportAt=new Date().toISOString(); });
    return {ok:true,message:`Imported ${rows.length} live bill(s) from ${live.key}.`};
  }

  function findHoldingPot(finance){
    return (Array.isArray(finance?.pots)?finance.pots:[]).find(row=>!row?.archived&&isHoldingPot(row?.name))||null;
  }

  function importHoldingPot(){
    const aurora=window.AuroraClean; if(!aurora) return {ok:false,message:'Clean runtime is not ready.'};
    const live=readLiveFinance();
    if(!live.finance) return {ok:false,message:'No live Aurora Finance state was found in this browser.'};
    const pot=findHoldingPot(live.finance);
    if(!pot) return {ok:false,message:'No active Holding Pot was found in the live Aurora Finance state.'};
    const balance=Number(num(pot.balance).toFixed(2));
    const target=Number(num(pot.target).toFixed(2));
    aurora.updateState(state=>{
      state.finance.holdingPotBalance=balance;
      state.finance.holdingPotTarget=target;
      state.finance.holdingPotImportSource=live.key;
      state.finance.holdingPotImportAt=new Date().toISOString();
    });
    return {ok:true,message:`Imported Holding Pot balance ${money(balance)}${target?` and floor ${money(target)}`:''} from ${live.key}.`};
  }

  function plan(state){
    const bills=(state.finance?.bills||[]).filter(row=>!row.archived&&row.included!==false&&!row.paid&&num(row.amount)>0);
    const payday=parseDate(state.finance?.paydayDate)||new Date(); payday.setHours(12,0,0,0);
    const nextPayday=addDays(payday,PAY_CYCLE_DAYS), annualEnd=addDays(payday,PAY_CYCLE_DAYS*PAYDAYS_PER_YEAR);
    const cycle=[]; bills.forEach(b=>cycle.push(...projectBillOccurrences(b,payday,nextPayday)));
    const current=cycle.filter(o=>clean(o.fundingSource)==='current account');
    const holdingBills=bills.filter(b=>isHoldingPot(b.fundingSource));
    const holdingCycle=cycle.filter(o=>isHoldingPot(o.fundingSource));
    const annualHolding=[]; holdingBills.forEach(b=>annualHolding.push(...projectBillOccurrences(b,payday,annualEnd)));
    const currentAccountDue=Number(current.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const holdingCycleRequired=Number(holdingCycle.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const annualHoldingTotal=Number(annualHolding.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const holdingPerPayday=Number((annualHoldingTotal/PAYDAYS_PER_YEAR).toFixed(2));
    return {payday:iso(payday),nextPayday:iso(nextPayday),billCount:bills.length,currentAccountDue,holdingCycleRequired,annualHoldingTotal,holdingPerPayday,cycle,holdingCycle,annualHolding,holdingBills};
  }

  function holdingPlan(state,billPlan){
    const payday=parseDate(billPlan.payday), nextPayday=parseDate(billPlan.nextPayday);
    const today=new Date(); today.setHours(12,0,0,0);
    const holdingBills=billPlan.holdingBills||[];
    const prePayday=[];
    if(payday && payday>today) holdingBills.forEach(b=>prePayday.push(...projectBillOccurrences(b,today,payday)));
    const spendBeforePayday=Number(prePayday.reduce((s,o)=>s+num(o.amount),0).toFixed(2));
    const currentBalance=Number(num(state.finance?.holdingPotBalance).toFixed(2));
    const minimumFloor=Number(num(state.finance?.holdingPotTarget).toFixed(2));
    const projectedPaydayBalance=Number(Math.max(0,currentBalance-spendBeforePayday).toFixed(2));
    const prePaydayShortfall=Number(Math.max(0,spendBeforePayday-currentBalance).toFixed(2));
    const baseContribution=Number(num(billPlan.holdingPerPayday).toFixed(2));

    const cycleTotals=Array.from({length:HOLDING_TARGET_CYCLES},()=>0);
    if(payday && nextPayday){
      billPlan.holdingCycle.forEach(o=>{ cycleTotals[0]+=num(o.amount); });
      holdingBills.filter(b=>!parseDate(b.due||b.dueDate)).forEach(b=>{
        const count=occurrenceCountForUndatedBill(b,payday,nextPayday);
        if(!billPlan.holdingCycle.some(o=>o.billId===b.id&&o.estimated)) cycleTotals[0]+=num(b.amount)*count;
      });
    }
    const calculatedTarget=Number((cycleTotals[0]||0).toFixed(2));
    const dynamicTarget=Number(Math.max(minimumFloor,calculatedTarget).toFixed(2));
    const projectedBeforeTopUp=Number((projectedPaydayBalance+baseContribution).toFixed(2));
    const safetyTopUp=Number(Math.max(0,dynamicTarget-projectedBeforeTopUp).toFixed(2));
    const afterFunding=Number((projectedBeforeTopUp+safetyTopUp).toFixed(2));
    const headroom=Number((afterFunding-dynamicTarget).toFixed(2));

    return {
      currentBalance,minimumFloor,spendBeforePayday,projectedPaydayBalance,prePaydayShortfall,
      baseContribution,calculatedTarget,dynamicTarget,safetyTopUp,projectedBeforeTopUp,afterFunding,headroom,
      cycleRequired:Number(num(billPlan.holdingCycleRequired).toFixed(2)),targetCycles:HOLDING_TARGET_CYCLES,prePayday
    };
  }

  function render(){
    const aurora=window.AuroraClean; if(!aurora) return;
    const state=aurora.readState(), p=plan(state), hp=holdingPlan(state,p);
    const text=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    const paydayInput=document.getElementById('financePaydayDate');
    if(paydayInput && !paydayInput.value) paydayInput.value=state.finance?.paydayDate||p.payday;

    text('financeBillCount',String(p.billCount));
    text('financeCurrentAccountDue',money(p.currentAccountDue));
    text('financeHoldingAnnual',money(p.annualHoldingTotal));
    text('financeHoldingPerPayday',money(p.holdingPerPayday));
    text('financeBillWindow',`${p.payday} → ${p.nextPayday}`);

    const rows=document.getElementById('financeStage2BillRows');
    if(rows){
      rows.innerHTML=p.cycle.length?p.cycle.map(o=>`<li><strong>${esc(o.billName)}</strong> — ${money(o.amount)} — ${esc(o.fundingSource||'')} — ${o.date?esc(o.date):'estimated'}${o.overdue?' — OVERDUE':''}</li>`).join(''):'<li>No bill occurrences in the next 28-day payday cycle.</li>';
    }
    const status=document.getElementById('financeBillImportStatus');
    if(status && state.finance?.billImportAt) status.textContent=`Live bills imported ${new Date(state.finance.billImportAt).toLocaleString('en-GB')} · ${state.finance.billImportSource||'Aurora state'}`;

    text('financeHoldingBalanceStage3',money(hp.currentBalance));
    text('financeHoldingSpendBeforePayday',money(hp.spendBeforePayday));
    text('financeHoldingProjectedPayday',money(hp.projectedPaydayBalance));
    text('financeHoldingBaseContribution',money(hp.baseContribution));
    text('financeHoldingDynamicTarget',money(hp.dynamicTarget));
    text('financeHoldingTopUpStage3',money(hp.safetyTopUp));
    text('financeHoldingAfterFunding',money(hp.afterFunding));
    text('financeHoldingCycleRequired',money(hp.cycleRequired));
    text('financeHoldingFloor',money(hp.minimumFloor));
    text('financeHoldingPrePaydayShortfall',money(hp.prePaydayShortfall));
    text('financeHoldingHeadroom',money(hp.headroom));
    const hpStatus=document.getElementById('financeHoldingImportStatus');
    if(hpStatus && state.finance?.holdingPotImportAt) hpStatus.textContent=`Holding Pot imported ${new Date(state.finance.holdingPotImportAt).toLocaleString('en-GB')} · ${state.finance.holdingPotImportSource||'Aurora state'}`;
    const hpRows=document.getElementById('financeStage3PrePaydayRows');
    if(hpRows){
      hpRows.innerHTML=hp.prePayday.length?hp.prePayday.map(o=>`<li><strong>${esc(o.billName)}</strong> — ${money(o.amount)} — ${o.date?esc(o.date):'estimated'}${o.overdue?' — OVERDUE':''}</li>`).join(''):'<li>No Holding Pot spend is projected before payday.</li>';
    }

    const nextBills={...p,holdingBills:undefined,calculatedAt:state.finance?.stage2Bills?.calculatedAt||new Date().toISOString()};
    const nextHolding={...hp,prePayday:hp.prePayday,calculatedAt:state.finance?.stage3HoldingPot?.calculatedAt||new Date().toISOString()};
    const oldBills=JSON.stringify(state.finance?.stage2Bills||{}), oldHolding=JSON.stringify(state.finance?.stage3HoldingPot||{});
    if(oldBills!==JSON.stringify(nextBills) || oldHolding!==JSON.stringify(nextHolding)){
      aurora.updateState(next=>{ next.finance.stage2Bills=nextBills; next.finance.stage3HoldingPot=nextHolding; });
    }
  }

  let writing=false;
  function safeRender(){ if(writing) return; writing=true; try{render();}finally{writing=false;} }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return;}
    document.getElementById('financeImportBills')?.addEventListener('click',()=>{const result=importBills(); const el=document.getElementById('financeBillImportStatus'); if(el)el.textContent=result.message; safeRender();});
    document.getElementById('financeImportHoldingPot')?.addEventListener('click',()=>{const result=importHoldingPot(); const el=document.getElementById('financeHoldingImportStatus'); if(el)el.textContent=result.message; safeRender();});
    document.getElementById('financePaydayDate')?.addEventListener('change',event=>{window.AuroraClean.updateState(state=>{state.finance.paydayDate=String(event.target.value||'').slice(0,10);state.finance.stage2Bills=null;state.finance.stage3HoldingPot=null;});safeRender();});
    document.getElementById('financeRecalculateBills')?.addEventListener('click',safeRender);
    document.getElementById('financeRecalculateHolding')?.addEventListener('click',safeRender);
    safeRender();
    window.addEventListener('aurora-clean:state',safeRender);
    window.AuroraFinanceBills=Object.freeze({plan,holdingPlan,projectBillOccurrences,nextDue,importBills,importHoldingPot});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();