/* Aurora FC 2.0 — Finance Funding Engine v1.4 — Pace-Only Deadlines */
(function(w){
  'use strict';

  const A=()=>w.Aurora2;
  const PAY_CYCLE_DAYS=28;
  const LEGACY_KEYS=['aurora_wealth_centre','aurora_wealth_centre_backup_v3'];
  let syncing=false;

  function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  function arr(v){return Array.isArray(v)?v:[]}
  function num(v){
    const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?Math.max(0,n):0;
  }
  function norm(v){return String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
  function parse(raw){try{return JSON.parse(raw)}catch(_){return null}}
  function parseDate(v){
    if(!v)return null;
    const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime())?null:d;
  }
  function isoNow(){return new Date().toISOString()}
  function money(v){return A().ui.money(v)}
  function isHousePot(p){return /house/.test(norm(p?.name))||String(p?.id||'').toLowerCase().includes('house')}
  function houseFunded(state,p){
    const hp=obj(state?.finance?.houseProject);
    const spent=num(hp.openingHistoricalSpend)+arr(hp.entries).filter(e=>e.status==='paid'||e.status==='historical').reduce((s,e)=>s+num(e.actual),0);
    return num(p?.balance)+spent;
  }
  function potFunded(p,state=A()?.core?.read?.()){
    const balance=num(p?.balance);
    if(isHousePot(p)&&state?.finance?.houseProject)return houseFunded(state,p);
    return p?.goalMode==='funded-progress'?balance+num(p?.spent):balance;
  }
  function potGap(p,state=A()?.core?.read?.()){return Math.max(0,num(p?.target)-potFunded(p,state))}
  function excludedFromGoalFunding(p){
    const name=norm(p?.name);
    return !p || p.archived || potGap(p,A()?.core?.read?.())<=.009 ||
      name==='holding pot' || name==='spending pot' || name==='ig trading';
  }

  function unwrapLegacy(v){
    if(!v||typeof v!=='object')return null;
    if(Array.isArray(v.editablePots)||v.paydayMission||v.holdingBalance!=null)return v;
    for(const k of ['plannerState','state','data','planner']){
      const n=v[k];
      if(n&&typeof n==='object'&&(Array.isArray(n.editablePots)||n.paydayMission||n.holdingBalance!=null))return n;
    }
    return null;
  }

  function readLegacy(){
    const candidates=[];
    for(const key of LEGACY_KEYS){
      try{
        const state=unwrapLegacy(parse(localStorage.getItem(key)||''));
        if(!state)continue;
        const saved=Date.parse(state?._persistence?.savedAt||state?.updatedAt||'')||Number(state?._persistence?.savedAt)||0;
        candidates.push({key,state,saved});
      }catch(_){}
    }
    candidates.sort((a,b)=>b.saved-a.saved);
    return candidates[0]||null;
  }

  function legacyPotMap(state){
    const map=new Map();
    arr(state?.editablePots).forEach(p=>{
      const keys=[norm(p?.name),norm(p?.id)].filter(Boolean);
      keys.forEach(k=>map.set(k,p));
    });
    return map;
  }

  function legacyGoalBudget(state){
    const mission=obj(state?.paydayMission), inputs=obj(mission.inputs);
    const direct=num(inputs.goalPots);
    if(direct>0)return direct;
    const alternatives=[state?.goalPotBudget,state?.goalPots,state?.paydayGoalPots,state?.paydayMission?.plan?.goalPots];
    for(const v of alternatives){const n=num(v);if(n>0)return n;}
    return 250;
  }

  function legacyStrategy(state){
    const s=String(state?.paydayMission?.inputs?.strategy||'priority');
    return ['priority','balanced','critical'].includes(s)?s:'priority';
  }

  function importLegacyMetadata(state2){
    const legacy=readLegacy();
    if(!legacy)return {state:state2,changed:false,legacy:null};
    const lf=legacy.state, map=legacyPotMap(lf);
    const f=obj(state2.finance), policy={...obj(f.fundingPolicy)};
    let changed=false;
    const pots=arr(f.pots).map(p=>{
      const lp=map.get(norm(p.name))||map.get(norm(String(p.id||'').replace(/^A1-POT-/i,'')));
      if(!lp)return p;
      const deadline=String(p.deadline||lp.deadline||lp.completeBy||lp.targetDate||'').slice(0,10);
      const note=String(p.note||lp.note||'');
      if(deadline!==String(p.deadline||'')||note!==String(p.note||'')){
        changed=true;
        return {...p,deadline,note,updatedAt:isoNow()};
      }
      return p;
    });
    if(!policy.legacyImported){
      policy.goalPotBudget=legacyGoalBudget(lf);
      policy.strategy=legacyStrategy(lf);
      policy.source='AURORA1_MIGRATED';
      policy.legacyImported=true;
      changed=true;
    }
    if(!changed)return {state:state2,changed:false,legacy};
    return {state:{...state2,finance:{...f,pots,fundingPolicy:policy}},changed:true,legacy};
  }

  function initialiseDefaultBudgetIfNeeded(state){
    const f=obj(state?.finance), policy={...obj(f.fundingPolicy)};
    if(Number(policy.engineVersion||0)<3){
      policy.previousExtraPotBudget=num(policy.extraPotBudget??policy.goalPotBudget);
      policy.goalPotBudget=0;
      policy.extraPotBudget=0;
      policy.engineVersion=3;
      policy.source='AURORA2_WAGE_ROUTING';
      policy.legacyImported=true;
      return {state:{...state,finance:{...f,fundingPolicy:policy}},changed:true};
    }
    return {state,changed:false};
  }

  function deadlineInfo(p,payday){
    const gap=potGap(p,A()?.core?.read?.()), deadline=parseDate(p?.deadline), pd=parseDate(payday);
    if(!deadline||!pd||gap<=.009)return {hasDeadline:!!deadline,gap,required:0,paydays:0,deadline};
    const diff=deadline.getTime()-pd.getTime();
    const cycles=Math.floor(diff/(PAY_CYCLE_DAYS*86400000));
    const paydays=diff>=0?Math.max(1,cycles+1):0;
    const required=paydays>0?gap/paydays:gap;
    return {hasDeadline:true,gap,required,paydays,deadline};
  }

  function addAllocation(map,pot,amount,reason,required=0){
    const old=map.get(pot.id)||{amount:0,reasons:[],required:0};
    old.amount+=Math.max(0,amount);
    old.required=Math.max(old.required,required||0);
    if(reason&&!old.reasons.includes(reason))old.reasons.push(reason);
    map.set(pot.id,old);
  }

  function allocatePriority(candidates,remaining,allocations,strategy){
    if(remaining<=.009)return remaining;
    if(strategy==='balanced'){
      let active=candidates.map(x=>({...x,remainingGap:Math.max(0,x.gap-(allocations.get(x.pot.id)?.amount||0))})).filter(x=>x.remainingGap>.009).sort((a,b)=>a.priority-b.priority||b.remainingGap-a.remainingGap);
      while(remaining>.009&&active.length){
        const share=remaining/active.length, next=[];
        for(const row of active){
          const current=allocations.get(row.pot.id)?.amount||0;
          const need=Math.max(0,row.gap-current);
          const take=Math.min(remaining,share,need);
          if(take>.009)addAllocation(allocations,row.pot,take,`Balanced P${row.priority} funding`);
          if(need-take>.009)next.push(row);
          remaining-=take;
        }
        if(next.length===active.length&&share<.01)break;
        active=next;
      }
      return remaining;
    }
    const maxPriority=strategy==='critical'?1:3;
    for(const row of candidates.filter(x=>x.priority<=maxPriority).sort((a,b)=>a.priority-b.priority||b.gap-a.gap||String(a.pot.name).localeCompare(String(b.pot.name)))){
      if(remaining<=.009)break;
      const current=allocations.get(row.pot.id)?.amount||0;
      const need=Math.max(0,row.gap-current);
      const take=Math.min(remaining,need);
      if(take>.009){addAllocation(allocations,row.pot,take,`P${row.priority} priority funding`);remaining-=take;}
    }
    return remaining;
  }

  function reconcileFundingPennies(pots,targetAllocated,state){
    const targetCents=Math.max(0,Math.round(num(targetAllocated)*100));
    let currentCents=pots.reduce((s,p)=>s+Math.round(Math.max(0,num(p.fundingPerPayday))*100),0);
    let delta=targetCents-currentCents;
    if(!delta)return pots;
    const next=pots.map(p=>({...p}));
    const fundedIndexes=next.map((p,i)=>({p,i})).filter(x=>num(x.p.fundingPerPayday)>0).map(x=>x.i);
    if(delta<0){
      let cents=-delta;
      for(const i of [...fundedIndexes].reverse()){
        if(cents<=0)break;
        const have=Math.round(num(next[i].fundingPerPayday)*100),take=Math.min(cents,have);
        next[i].fundingPerPayday=(have-take)/100;cents-=take;
      }
    }else{
      let cents=delta;
      for(const i of [...fundedIndexes].reverse()){
        if(cents<=0)break;
        const gapCents=Math.max(0,Math.round(potGap(next[i],state)*100));
        const have=Math.round(num(next[i].fundingPerPayday)*100),spare=Math.max(0,gapCents-have),add=Math.min(cents,spare);
        next[i].fundingPerPayday=(have+add)/100;cents-=add;
      }
    }
    return next;
  }

  function buildPlan(state){
    const f=obj(state.finance), plan=obj(f.plan), policy=obj(f.fundingPolicy);
    const expectedWages=num(plan.expectedWages!=null?plan.expectedWages:plan.netPay);
    const wagesReceived=num(plan.wagesReceived!=null?plan.wagesReceived:plan.netPay);
    const wageDifference=Number((wagesReceived-expectedWages).toFixed(2));
    const wageShortfall=Math.max(0,-wageDifference);
    const extraBudget=Math.max(0,wageDifference);
    const strategy=['priority','balanced','critical'].includes(policy.strategy)?policy.strategy:'priority';
    const payday=plan.paydayDate||'';
    const pots=arr(f.pots);
    const candidates=pots.filter(p=>!excludedFromGoalFunding(p)).map(p=>({pot:p,gap:potGap(p,state),priority:[1,2,3].includes(Number(p.priority))?Number(p.priority):2,deadline:deadlineInfo(p,payday)}));
    const allocations=new Map();
    let requiredFunding=0,deadlineRequired=0;
    for(const row of candidates){
      const deadlineNeed=row.deadline.hasDeadline?Math.min(row.gap,Math.max(0,row.deadline.required)):0;
      const manual=Math.min(row.gap,num(row.pot.fundingOverride));
      const required=Math.min(row.gap,Math.max(deadlineNeed,manual));
      if(deadlineNeed>.009)deadlineRequired+=deadlineNeed;
      if(required>.009){
        const reasons=[];
        if(deadlineNeed>.009)reasons.push(`Required for ${row.pot.deadline} • ${row.deadline.paydays>0?row.deadline.paydays+' payday'+(row.deadline.paydays===1?'':'s')+' left':'deadline passed'} • pace only`);
        if(manual>deadlineNeed+.009)reasons.push('Manual minimum');
        addAllocation(allocations,row.pot,required,reasons.join(' • '),deadlineNeed);
        requiredFunding+=required;
      }
    }
    const paceOnlyCandidates=candidates.filter(row=>row.deadline.hasDeadline);
    const extraCandidates=candidates.filter(row=>!row.deadline.hasDeadline);
    let remainingExtra=allocatePriority(extraCandidates,extraBudget,allocations,strategy);
    let nextPots=pots.map(p=>{
      const a=allocations.get(p.id),nextFunding=a?Math.min(potGap(p,state),a.amount):0;
      const reason=a?a.reasons.join(' • '):(potGap(p,state)<=.009?'Target funded':excludedFromGoalFunding(p)?'Excluded from goal-pot funding':'No deadline requirement; waiting for optional extra funding');
      return {...p,fundingPerPayday:Number(nextFunding.toFixed(2)),fundingReason:reason,fundingRequired:Number((a?.required||0).toFixed(2))};
    });
    const extraAllocated=Math.max(0,extraBudget-remainingExtra);
    const targetAllocated=Number((requiredFunding+extraAllocated).toFixed(2));
    nextPots=reconcileFundingPennies(nextPots,targetAllocated,state);
    const allocated=Number(nextPots.reduce((s,p)=>s+Math.max(0,num(p.fundingPerPayday)),0).toFixed(2));
    const requiredVisible=Number(nextPots.reduce((s,p)=>s+Math.max(0,num(p.fundingRequired)),0).toFixed(2));
    const rows=nextPots.filter(p=>num(p.fundingPerPayday)>0).map(p=>({id:p.id,name:p.name,amount:Number(num(p.fundingPerPayday).toFixed(2)),required:Number(num(p.fundingRequired).toFixed(2)),reason:p.fundingReason,deadline:p.deadline||''}));
    return {pots:nextPots,policy:{...policy,goalPotBudget:0,extraPotBudget:0,engineVersion:3,strategy,lastCalculatedAt:isoNow(),lastPlan:{paydayDate:payday,budget:Number(extraBudget.toFixed(2)),expectedWages:Number(expectedWages.toFixed(2)),wagesReceived:Number(wagesReceived.toFixed(2)),wageDifference:Number(wageDifference.toFixed(2)),wageShortfall:Number(wageShortfall.toFixed(2)),requiredFunding:Number(requiredVisible.toFixed(2)),deadlineRequired:Number(deadlineRequired.toFixed(2)),deadlineAllocated:Number(deadlineRequired.toFixed(2)),deadlineShortfall:0,extraBudget:Number(extraBudget.toFixed(2)),extraAllocated:Number(extraAllocated.toFixed(2)),paceOnlyCount:paceOnlyCandidates.length,extraEligibleCount:extraCandidates.length,allocated:Number(allocated.toFixed(2)),totalFunding:Number(allocated.toFixed(2)),unallocated:Number(Math.max(0,extraBudget-extraAllocated).toFixed(2)),rows}}};
  }

  function materiallyChanged(a,b){if(arr(a).length!==arr(b).length)return true;for(let i=0;i<a.length;i++){if(a[i].id!==b[i].id)return true;for(const k of ['fundingPerPayday','fundingReason','fundingRequired','deadline','note'])if(String(a[i][k]??'')!==String(b[i][k]??''))return true;}return false;}
  function recalc(){
    if(syncing||!A()?.core)return;syncing=true;
    try{
      let state=A().core.read();const imported=importLegacyMetadata(state);state=imported.state;const initialised=initialiseDefaultBudgetIfNeeded(state);state=initialised.state;const result=buildPlan(state);
      const oldPots=arr(state.finance?.pots),oldPolicy=obj(state.finance?.fundingPolicy);
      const planChanged=JSON.stringify(oldPolicy.lastPlan||null)!==JSON.stringify(result.policy.lastPlan||null)||num(oldPolicy.goalPotBudget)!==num(result.policy.goalPotBudget)||oldPolicy.strategy!==result.policy.strategy||oldPolicy.legacyImported!==result.policy.legacyImported||oldPolicy.source!==result.policy.source;
      if(imported.changed||initialised.changed||materiallyChanged(oldPots,result.pots)||planChanged)A().core.write({...state,finance:{...state.finance,pots:result.pots,fundingPolicy:result.policy}});
    }finally{syncing=false;}
  }
  function render(){if(!A()?.core)return;const s=A().core.read(),p=obj(s.finance?.fundingPolicy),plan=obj(p.lastPlan);const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};set('fundingBudgetValue',money(plan.extraBudget||0));set('fundingAllocatedValue',money(plan.allocated||0));set('fundingDeadlineValue',money(plan.requiredFunding??plan.deadlineAllocated??0));set('fundingUnallocatedValue',money(plan.unallocated||0));}
  w.Aurora2=w.Aurora2||{};
  w.Aurora2.funding={recalc,buildPlan,readLegacy,initialiseDefaultBudgetIfNeeded,reconcileFundingPennies};
})(window);
