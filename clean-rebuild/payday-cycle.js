(() => {
  'use strict';

  const BUILD='20260826-payday-cycle-controller-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(num(v).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const now=()=>new Date().toISOString();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const clone=v=>JSON.parse(JSON.stringify(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const annualIncome=state=>(state.squad?.holdings||[]).reduce((s,h)=>s+Math.max(0,num(h.annualIncomeGbp||num(h.shares)*num(h.annualDpsGbp))),0);
  const sum=(rows,key)=>(rows||[]).reduce((s,r)=>s+num(r?.[key]),0);

  function ensure(state){
    state.paydayCycle=state.paydayCycle&&typeof state.paydayCycle==='object'?state.paydayCycle:{};
    state.paydayCycle.history=Array.isArray(state.paydayCycle.history)?state.paydayCycle.history:[];
    state.paydayCycle.sequence=Math.max(0,Number(state.paydayCycle.sequence||0));
    return state.paydayCycle;
  }

  function status(state){
    const f=state.finance||{},stage5=f.stage5PaydayDecision,mission=state.transfer?.mission,route=state.transfer?.route,plan=state.scouting?.allocationPlan,receipts=state.registration?.receipts||[];
    const missionStatus=upper(mission?.status||'NONE');
    const missionReceipts=mission?receipts.filter(r=>String(r.missionId||'')===String(mission.id||'')):[];
    const locked=route?.locked===true&&mission&&String(route.missionId||'')===String(mission.id||'');
    const allConfirmed=locked&&(route.allocations||[]).length>0&&(route.allocations||[]).every(a=>missionReceipts.some(r=>String(r.legId||r.allocationId||'')===String(a.legId||a.id||'')));
    const steps=[
      {key:'finance',label:'Finance',ok:!!stage5&&num(stage5.maximumSafeRelease)>=0,detail:stage5?`${money(stage5.maximumSafeRelease)} proved`:'Stages 1–5 need calculation'},
      {key:'mission',label:'Mission Release',ok:!!mission&&num(mission.budget)>0&&!['CANCELLED'].includes(missionStatus),detail:mission?`${missionStatus} · ${money(mission.budget)}`:'Waiting for Stage 6'},
      {key:'scouting',label:'Scouting',ok:!!plan?.allocations?.length&&String(plan.missionId||'')===String(mission?.id||''),detail:plan?.allocations?.length?`${plan.allocations.length} allocation(s) · ${money(plan.allocated)}`:'Waiting for allocation'},
      {key:'transfer',label:'Transfer',ok:locked,detail:locked?`Locked · ${(route.allocations||[]).length} leg(s)`:'Waiting for locked route'},
      {key:'registration',label:'Registration',ok:missionStatus==='COMPLETE'||allConfirmed,detail:missionStatus==='COMPLETE'?'Mission settled':locked?`${missionReceipts.length}/${(route.allocations||[]).length} execution(s) confirmed`:'Waiting for Transfer'},
      {key:'complete',label:'Payday Complete',ok:missionStatus==='COMPLETE'&&route?.settled===true,detail:missionStatus==='COMPLETE'?`Actual ${money(mission.actualCostGbp||sum(missionReceipts,'totalCostGbp'))}`:'Not completed yet'}
    ];
    let headline='PAYDAY NOT STARTED',tone='idle';
    if(stage5&&!mission){headline='READY TO RELEASE';tone='ready';}
    if(mission&&missionStatus==='DRAFT'){headline='SCOUTING REQUIRED';tone='active';}
    if(mission&&['READY','ALLOCATED'].includes(missionStatus)){headline='TRANSFER REQUIRED';tone='active';}
    if(mission&&missionStatus==='LOCKED'){headline='REGISTRATION REQUIRED';tone='active';}
    if(missionStatus==='COMPLETE'){headline='PAYDAY COMPLETE';tone='complete';}
    const ready=!!stage5&&num(stage5.maximumSafeRelease)>0;
    return{steps,headline,tone,ready,stage5,mission,route,plan,missionReceipts,missionStatus,allConfirmed};
  }

  function archiveCompleted({silent=false}={}){
    const A=window.AuroraClean;if(!A)return{ok:false,message:'Aurora state is unavailable.'};
    const state=A.readState(),s=status(state),mission=s.mission;
    if(!mission||s.missionStatus!=='COMPLETE'||s.route?.settled!==true)return{ok:false,message:'Only a fully completed and settled payday mission can be archived.'};
    const cycle=ensure(state),existing=cycle.history.find(h=>String(h.missionId||'')===String(mission.id||''));
    if(existing)return{ok:true,existing:true,record:existing,message:'This completed mission is already archived.'};
    const receipts=s.missionReceipts.map(clone),actualCost=round(mission.actualCostGbp||sum(receipts,'totalCostGbp'));
    const record={
      id:`PAYDAY-${Date.now()}`,
      cycleNumber:cycle.sequence+1,
      missionId:mission.id,
      archivedAt:now(),
      paydayDate:String(state.finance?.paydayDate||''),
      finance:{stage5:clone(state.finance?.stage5PaydayDecision||null),budget:round(mission.budget)},
      scouting:{strategy:String(state.scouting?.strategy||''),allocationPlan:clone(s.plan||null)},
      transfer:{route:clone(s.route||null)},
      registration:{receiptCount:receipts.length,actualCostGbp:actualCost,receipts},
      outcome:{annualIncomeGbp:round(annualIncome(state)),positionCount:(state.squad?.holdings||[]).length}
    };
    A.updateState(next=>{const c=ensure(next);if(!c.history.some(h=>String(h.missionId||'')===String(mission.id||''))){c.history.unshift(record);c.sequence=record.cycleNumber;c.lastArchivedAt=record.archivedAt;}});
    if(!silent)render();
    return{ok:true,record,message:`Archived payday #${record.cycleNumber}.`};
  }

  function startNewCycle(){
    const A=window.AuroraClean;if(!A)return;
    let state=A.readState(),s=status(state);
    if(s.mission&&s.missionStatus!=='COMPLETE'){
      alert(`New payday blocked. The current Finance mission is ${s.missionStatus}. Complete or deliberately cancel that mission before starting another payday.`);return;
    }
    if(s.mission&&s.missionStatus==='COMPLETE'){
      const archived=archiveCompleted({silent:true});if(!archived.ok){alert(archived.message);return;}state=A.readState();s=status(state);
    }
    const historyCount=ensure(state).history.length;
    if(!confirm(`Start a new payday cycle?\n\nThis clears only working payday data:\n• frozen Stage 2–5 calculations\n• Stage 6 mission\n• Scouting approvals/allocation\n• Transfer route\n• Registration working receipts\n\nIt DOES NOT change holdings, bills, pots, dividends or ${historyCount} archived payday record(s).`))return;
    A.updateState(next=>{
      ensure(next);
      next.finance.stage2Bills=null;next.finance.stage3HoldingPot=null;next.finance.stage4PotFunding=null;next.finance.stage5PaydayDecision=null;next.finance.lastSafeRelease=0;
      next.scouting.allocationPlan=null;next.scouting.candidates=(next.scouting.candidates||[]).map(c=>({...c,approved:false}));
      next.transfer.mission=null;next.transfer.route=null;
      next.registration=next.registration||{};next.registration.receipts=[];next.registration.lastSettlement=null;
      next.paydayCycle.startedAt=now();next.paydayCycle.lastResetAt=now();
    });
    render();
  }

  function renderHistory(state){
    const cycle=ensure(state),rows=cycle.history||[],target=$('paydayHistoryRows');
    if($('paydayHistoryCount'))$('paydayHistoryCount').textContent=String(rows.length);
    if(!target)return;
    target.innerHTML=rows.length?rows.slice(0,12).map(r=>`<li class="payday-history-row"><strong>Payday #${r.cycleNumber||'?'}${r.paydayDate?` · ${esc(r.paydayDate)}`:''}</strong><span>Budget ${money(r.finance?.budget)} · actual ${money(r.registration?.actualCostGbp)} · ${(r.registration?.receiptCount||0)} trade(s)</span><span>Annual income after settlement ${money(r.outcome?.annualIncomeGbp)} · ${(r.outcome?.positionCount||0)} positions</span></li>`).join(''):'<li>No completed payday missions archived yet.</li>';
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),s=status(state);
    if($('paydayReadiness')){$('paydayReadiness').textContent=s.headline;$('paydayReadiness').dataset.tone=s.tone;}
    if($('paydayReadinessDetail'))$('paydayReadinessDetail').textContent=s.stage5?`Finance Stage 5: ${money(s.stage5.maximumSafeRelease)}${s.mission?` · Mission ${s.missionStatus} ${money(s.mission.budget)}`:''}`:'Build Finance Stages 1–5 to begin the next payday.';
    if($('paydayChecklist'))$('paydayChecklist').innerHTML=s.steps.map(step=>`<li class="payday-step ${step.ok?'done':'waiting'}"><span>${step.ok?'✓':'○'}</span><strong>${esc(step.label)}</strong><small>${esc(step.detail)}</small></li>`).join('');
    if($('paydayCycleAction')){$('paydayCycleAction').textContent=s.missionStatus==='COMPLETE'?'Archive & Start New Payday':'Start New Payday Cycle';}
    if($('paydayArchiveAction'))$('paydayArchiveAction').disabled=s.missionStatus!=='COMPLETE';
    renderHistory(state);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return}
    window.AuroraClean.updateState(state=>{ensure(state);});
    $('paydayCycleAction')?.addEventListener('click',startNewCycle);
    $('paydayArchiveAction')?.addEventListener('click',()=>{const r=archiveCompleted();if(!r.ok)alert(r.message);});
    window.addEventListener('aurora-clean:state',render);render();
    window.AuroraPaydayCycle=Object.freeze({BUILD,status,archiveCompleted,startNewCycle,render});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();