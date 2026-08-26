(() => {
  'use strict';

  const STAGE1_SRC='finance-stage1.js?v=20260826-clean-finance-stage1-owner-1';
  const AUTO_REFRESH_SRC='finance-auto-refresh.js?v=20260826-clean-finance-auto-refresh-1';
  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(Number(value || 0));
  const round2 = value => Number(Number(value || 0).toFixed(2));
  const upper = value => String(value || '').trim().toUpperCase();
  const activeMission = mission => !!mission && !['COMPLETE','CANCELLED'].includes(upper(mission.status));
  const missionId = () => `MISSION-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  function loadStage1(){
    if(window.AuroraFinanceStage1||[...document.scripts].some(s=>String(s.src||'').includes('finance-stage1.js')))return;
    const script=document.createElement('script');script.src=STAGE1_SRC;script.defer=true;document.head.appendChild(script);
  }

  function loadAutoRefresh(){
    if(window.AuroraFinanceAutoRefresh||[...document.scripts].some(s=>String(s.src||'').includes('finance-auto-refresh.js')))return;
    const script=document.createElement('script');script.src=AUTO_REFRESH_SRC;script.defer=true;document.head.appendChild(script);
  }

  function cashTruthMatches(state,decision){
    if(!decision)return false;
    const f=state.finance||{};
    return Math.abs(round2(decision.availableCash)-round2(f.availableCash))<0.01&&
      Math.abs(round2(decision.protectedCash)-round2(f.protectedCash))<0.01;
  }

  function releaseMission() {
    const aurora = window.AuroraClean;
    if (!aurora) return {ok:false,message:'Clean runtime is not ready.'};
    const state = aurora.readState();
    const decision = state.finance?.stage5PaydayDecision;
    if (!decision || round2(decision.maximumSafeRelease) <= 0) {
      return {ok:false,message:'Stage 5 must be calculated and have a positive Maximum Safe Release first.'};
    }
    if (!cashTruthMatches(state,decision)) {
      return {ok:false,message:'Stage 5 is stale because Stage 1 Cash Truth has changed. Recalculate the Payday Decision before releasing a mission.'};
    }
    if (activeMission(state.transfer?.mission)) {
      return {ok:false,message:`An active mission already exists: ${state.transfer.mission.id}.`};
    }

    const budget = round2(decision.maximumSafeRelease);
    const releasedAt = new Date().toISOString();
    let created = null;

    aurora.updateState(next => {
      const frozen = next.finance?.stage5PaydayDecision;
      if (!frozen || round2(frozen.maximumSafeRelease) !== budget || !cashTruthMatches(next,frozen)) return;
      created = {
        id: missionId(), budget, approvedBudget: budget, status: 'DRAFT', source: 'Finance Stage 6',
        createdAt: releasedAt, updatedAt: releasedAt, releasedAt,
        stage5CalculatedAt: frozen.calculatedAt || null,
        financeSnapshot: {
          availableCash: round2(frozen.availableCash), commitments: round2(frozen.commitments),
          protectedCash: round2(frozen.protectedCash), totalReserved: round2(frozen.totalReserved),
          maximumSafeRelease: budget,
          stage2CalculatedAt: next.finance?.stage2Bills?.calculatedAt || null,
          stage3CalculatedAt: next.finance?.stage3HoldingPot?.calculatedAt || null,
          stage4CalculatedAt: next.finance?.stage4PotFunding?.calculatedAt || null,
          stage5CalculatedAt: frozen.calculatedAt || null
        }
      };
      next.transfer.mission = created;
      next.transfer.route = null;
      next.finance.stage6MissionRelease = {missionId: created.id,budget,releasedAt,stage5CalculatedAt: frozen.calculatedAt || null};
      if (next.scouting) next.scouting.allocationPlan = null;
    });

    return created
      ? {ok:true,message:`Released ${money(budget)} to mission ${created.id}.`,mission:created}
      : {ok:false,message:'Mission release was blocked because the Finance snapshot changed.'};
  }

  function render() {
    const aurora = window.AuroraClean;if (!aurora) return;
    const state = aurora.readState(),decision = state.finance?.stage5PaydayDecision,mission = state.transfer?.mission,release = state.finance?.stage6MissionRelease;
    const amount=document.getElementById('financeStage6Amount'),status=document.getElementById('financeStage6Status'),detail=document.getElementById('financeStage6Detail'),button=document.getElementById('financeReleaseMission');
    const current=!!decision&&cashTruthMatches(state,decision);
    if (amount) amount.textContent = decision ? money(decision.maximumSafeRelease) : '£0.00';
    if (status) status.textContent = activeMission(mission) ? `${mission.status} · ${mission.id}` : current ? 'READY TO RELEASE' : 'RECALCULATE STAGE 5';
    if (detail) detail.textContent = activeMission(mission)
      ? `${money(mission.budget)} released by Finance${mission.releasedAt ? ` · ${new Date(mission.releasedAt).toLocaleString('en-GB')}` : ''}`
      : !current&&decision ? 'Stage 1 Cash Truth no longer matches the frozen Stage 5 decision.'
      : release ? `Previous mission ${release.missionId} is no longer active.` : 'No investment mission has been released yet.';
    if (button) button.disabled = !decision || round2(decision.maximumSafeRelease) <= 0 || !current || activeMission(mission);
  }

  function bind() {
    const aurora = window.AuroraClean;if (!aurora) return false;
    document.getElementById('financeReleaseMission')?.addEventListener('click', () => {const result=releaseMission();const detail=document.getElementById('financeStage6Detail');if(detail)detail.textContent=result.message;render();});
    window.addEventListener('aurora-clean:state', render);render();window.AuroraFinanceStage6=Object.freeze({releaseMission,render,cashTruthMatches});return true;
  }

  function boot(){loadStage1();loadAutoRefresh();if(!bind())setTimeout(boot,50);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();