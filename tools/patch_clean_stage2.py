from pathlib import Path
p=Path('clean-rebuild/aurora.js')
s=p.read_text()
s=s.replace("const BUILD = '20260826-clean-rebuild-7-scouting-ranking';","const BUILD = '20260826-clean-rebuild-9-scouting-allocation';")

alloc=r'''  function scoutingAllocation(state,budgetOverride){
    const budget=round2(Math.max(0,num(budgetOverride ?? safeRelease(state.finance))));
    const strategy=state.scouting.strategy==='maximum'?'maximum':'sustainable';
    const rows=scoutingRankings(state).filter(row=>row.approved&&row.yieldPct>0);
    if(!budget||!rows.length)return{budget,strategy,approvedCount:rows.length,allocated:0,projectedAnnualIncome:0,allocations:[]};
    const baseCap=strategy==='maximum'?0.65:0.45;
    const capPct=Math.max(baseCap,1/rows.length);
    const items=rows.map(row=>({...row,weight:strategy==='maximum'?Math.max(1,row.score)*Math.max(.25,row.yieldPct):Math.max(1,row.score)*(row.held?Math.max(.45,1-row.exposurePct/100):1.12),amount:0}));
    let remaining=budget,open=[...items];
    while(open.length&&remaining>.004){
      const totalWeight=open.reduce((sum,row)=>sum+row.weight,0)||open.length;
      let capped=false;
      for(const row of [...open]){
        const desired=remaining*(row.weight/totalWeight),cap=budget*capPct,capacity=Math.max(0,cap-row.amount);
        if(desired>capacity+.005){row.amount+=capacity;remaining-=capacity;open=open.filter(item=>item!==row);capped=true;}
      }
      if(!capped){const weight=open.reduce((sum,row)=>sum+row.weight,0)||open.length;open.forEach(row=>{row.amount+=remaining*(row.weight/weight)});remaining=0;}
    }
    let allocations=items.filter(row=>row.amount>.004).map(row=>({ticker:row.ticker,name:row.name,yieldPct:row.yieldPct,score:row.score,held:row.held,amount:round2(row.amount),expectedAnnualIncome:round2(row.amount*row.yieldPct/100)}));
    let allocated=round2(allocations.reduce((sum,row)=>sum+row.amount,0)),delta=round2(budget-allocated);
    if(allocations.length&&Math.abs(delta)>=.01){allocations[0].amount=round2(allocations[0].amount+delta);allocations[0].expectedAnnualIncome=round2(allocations[0].amount*allocations[0].yieldPct/100);}
    allocated=round2(allocations.reduce((sum,row)=>sum+row.amount,0));
    return{budget,strategy,approvedCount:rows.length,allocated,projectedAnnualIncome:round2(allocations.reduce((sum,row)=>sum+row.expectedAnnualIncome,0)),allocations};
  }

'''
marker='  function renderScouting() {'
if 'function scoutingAllocation(' not in s:
    s=s.replace(marker,alloc+marker)

start=s.index('  function renderScouting() {')
end=s.index('\n  function bindScouting()',start)
render=r'''  function renderScouting() {
    const state=readState();
    const strategy=state.scouting.strategy==='maximum'?'maximum':'sustainable';
    if(byId('scoutingStrategy'))byId('scoutingStrategy').value=strategy;
    const budget=safeRelease(state.finance);
    const rows=scoutingRankings(state);
    const plan=scoutingAllocation(state,budget);
    setText('scoutingBudget',money(budget));
    setText('scoutingUniverseCount',String(rows.length));
    setText('scoutingStrategyNote',strategy==='maximum'?'Maximum Income heavily rewards immediate forward yield while still applying a small concentration check.':'Sustainable balances forward income with current holding concentration and diversification.');
    if(rows.length){const top=rows[0];setText('scoutingTopPick',`${top.ticker} · ${top.score.toFixed(1)}`);setText('scoutingTopPickDetail',`${top.yieldPct.toFixed(2)}% yield · ${money(top.expectedAnnualIncome)} estimated annual income if the full payday budget went here.`);}
    else{setText('scoutingTopPick','Waiting for candidates');setText('scoutingTopPickDetail','Load the Aurora universe or add a candidate.');}
    setText('scoutingSeedStatus',state.scouting.seededAt?`Squad universe last seeded ${new Date(state.scouting.seededAt).toLocaleString('en-GB')}.`:'No squad seed run yet.');
    setHtml('scoutingRows',rows.length?rows.map((row,index)=>`<li class="scouting-rank-card${index===0?' top-pick':''}"><div class="scouting-rank-main"><span class="scouting-rank-number">#${index+1}</span><div><strong>${esc(row.ticker)} · ${esc(row.name||row.ticker)}</strong><small>${esc(row.source==='SQUAD'?'Current holding':'External candidate')}${row.sector?` · ${esc(row.sector)}`:''}${row.held?` · ${row.exposurePct<.1?'<0.1':row.exposurePct.toFixed(1)}% current book exposure`:''}</small></div></div><div class="scouting-rank-metric"><span>YIELD</span><strong>${row.yieldPct.toFixed(2)}%</strong></div><div class="scouting-rank-metric"><span>INCOME ON ${money(budget)}</span><strong>${money(row.expectedAnnualIncome)}</strong></div><div class="scouting-rank-metric"><span>SCORE</span><strong>${row.score.toFixed(1)}</strong></div><div class="scouting-rank-actions"><button type="button" data-approve-scout="${esc(row.id||row.ticker)}">${row.approved?'Approved ✓':'Approve'}</button><button type="button" class="secondary" data-remove-scout="${esc(row.id||row.ticker)}">Remove</button></div></li>`).join(''):'<li class="scouting-empty">No candidates yet. Load the Aurora universe to begin.</li>');
    setText('scoutingApprovedCount',String(plan.approvedCount));
    setText('scoutingAllocatedBudget',money(plan.allocated));
    setText('scoutingProjectedIncome',money(plan.projectedAnnualIncome));
    setText('scoutingAllocationNote',plan.allocations.length?`${strategy==='maximum'?'Maximum Income':'Sustainable Income'} optimiser · ${plan.allocations.length} allocation(s) · budget fully assigned without equal-split logic.`:'Approve one or more ranked candidates to build the payday allocation.');
    setHtml('scoutingAllocationRows',plan.allocations.length?plan.allocations.map((row,index)=>`<li><strong>#${index+1} ${esc(row.ticker)}</strong> — ${money(row.amount)} — ${row.yieldPct.toFixed(2)}% yield — projected annual income ${money(row.expectedAnnualIncome)}</li>`).join(''):'<li>No allocation yet.</li>');
  }
'''
s=s[:start]+render+s[end:]

start=s.index('  function buildAllocations(state) {')
end=s.index('\n  function renderTransfer()',start)
s=s[:start]+'''  function buildAllocations(state) {\n    const mission=state.transfer.mission;\n    if(!mission||!['DRAFT','READY'].includes(upper(mission.status)))return[];\n    return scoutingAllocation(state,mission.budget).allocations;\n  }\n'''+s[end:]

start=s.index('  function renderSystemHealth() {')
end=s.index('\n  const pages=',start)
health=r'''  function renderSystemHealth() {
    const state=readState(),f=financeSummary(state.finance),plan=scoutingAllocation(state);
    const checks=[
      ['State readable',!!state],['Finance present',!!state.finance],['Finance calculation valid',Number.isFinite(f.safeSurplus)&&f.safeSurplus>=0],
      ['Finance mission budget safe',!state.transfer.mission?.financeSnapshot||num(state.transfer.mission.budget)<=num(state.transfer.mission.financeSnapshot.safeSurplus)+0.005],
      ['Scouting present',!!state.scouting],['Scouting ranking valid',scoutingRankings(state).every((row,index,rows)=>Number.isFinite(row.score)&&(index===0||rows[index-1].score>=row.score))],
      ['Scouting allocation valid',!plan.allocations.length||Math.abs(plan.allocated-plan.budget)<0.011],['Transfer present',!!state.transfer],['Registration present',!!state.registration],
      ['Squad present',!!state.squad],['Squad holdings valid',Array.isArray(state.squad.holdings)&&state.squad.holdings.every(row=>row.ticker&&num(row.shares)>=0)],['Income present',!!state.income]
    ];
    setHtml('healthRows',checks.map(([label,ok])=>`<li>${esc(label)} — ${ok?'PASS':'FAIL'}</li>`).join(''));setText('healthBuild',BUILD);
  }
'''
s=s[:start]+health+s[end:]
s=s.replace('scoutingRankings,seedScoutingFromSquad','scoutingRankings,scoutingAllocation,seedScoutingFromSquad')
p.write_text(s)
print('patched',p,len(s))
