(() => {
  'use strict';

  const money = value => new Intl.NumberFormat('en-GB', {
    style:'currency', currency:'GBP', minimumFractionDigits:2, maximumFractionDigits:2
  }).format(Number(value || 0));
  const round2 = value => Number(Number(value || 0).toFixed(2));
  const upper = value => String(value || '').trim().toUpperCase();
  const activeMission = mission => !!mission && !['COMPLETE','CANCELLED'].includes(upper(mission.status));
  const missionId = () => `MISSION-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

  function releaseMission() {
    const aurora = window.AuroraClean;
    if (!aurora) return {ok:false,message:'Clean runtime is not ready.'};
    const state = aurora.readState();
    const decision = state.finance?.stage5PaydayDecision;
    if (!decision || round2(decision.maximumSafeRelease) <= 0) {
      return {ok:false,message:'Stage 5 must be calculated and have a positive Maximum Safe Release first.'};
    }
    if (activeMission(state.transfer?.mission)) {
      return {ok:false,message:`An active mission already exists: ${state.transfer.mission.id}.`};
    }

    const budget = round2(decision.maximumSafeRelease);
    const releasedAt = new Date().toISOString();
    let created = null;

    aurora.updateState(next => {
      const frozen = next.finance?.stage5PaydayDecision;
      if (!frozen || round2(frozen.maximumSafeRelease) !== budget) return;
      created = {
        id: missionId(),
        budget,
        approvedBudget: budget,
        status: 'DRAFT',
        source: 'Finance Stage 6',
        createdAt: releasedAt,
        updatedAt: releasedAt,
        releasedAt,
        stage5CalculatedAt: frozen.calculatedAt || null,
        financeSnapshot: {
          availableCash: round2(frozen.availableCash),
          commitments: round2(frozen.commitments),
          protectedCash: round2(frozen.protectedCash),
          totalReserved: round2(frozen.totalReserved),
          maximumSafeRelease: budget,
          stage2CalculatedAt: next.finance?.stage2Bills?.calculatedAt || null,
          stage3CalculatedAt: next.finance?.stage3HoldingPot?.calculatedAt || null,
          stage4CalculatedAt: next.finance?.stage4PotFunding?.calculatedAt || null,
          stage5CalculatedAt: frozen.calculatedAt || null
        }
      };
      next.transfer.mission = created;
      next.transfer.route = null;
      next.finance.stage6MissionRelease = {
        missionId: created.id,
        budget,
        releasedAt,
        stage5CalculatedAt: frozen.calculatedAt || null
      };
      if (next.scouting) next.scouting.allocationPlan = null;
    });

    return created
      ? {ok:true,message:`Released ${money(budget)} to mission ${created.id}.`,mission:created}
      : {ok:false,message:'Mission release was blocked because the Stage 5 snapshot changed.'};
  }

  function render() {
    const aurora = window.AuroraClean;
    if (!aurora) return;
    const state = aurora.readState();
    const decision = state.finance?.stage5PaydayDecision;
    const mission = state.transfer?.mission;
    const release = state.finance?.stage6MissionRelease;
    const amount = document.getElementById('financeStage6Amount');
    const status = document.getElementById('financeStage6Status');
    const detail = document.getElementById('financeStage6Detail');
    const button = document.getElementById('financeReleaseMission');

    if (amount) amount.textContent = decision ? money(decision.maximumSafeRelease) : '£0.00';
    if (status) status.textContent = activeMission(mission) ? `${mission.status} · ${mission.id}` : 'READY TO RELEASE';
    if (detail) {
      detail.textContent = activeMission(mission)
        ? `${money(mission.budget)} released by Finance${mission.releasedAt ? ` · ${new Date(mission.releasedAt).toLocaleString('en-GB')}` : ''}`
        : release
          ? `Previous mission ${release.missionId} is no longer active.`
          : 'No investment mission has been released yet.';
    }
    if (button) button.disabled = !decision || round2(decision.maximumSafeRelease) <= 0 || activeMission(mission);
  }

  function bind() {
    const aurora = window.AuroraClean;
    if (!aurora) return false;
    document.getElementById('financeReleaseMission')?.addEventListener('click', () => {
      const result = releaseMission();
      const detail = document.getElementById('financeStage6Detail');
      if (detail) detail.textContent = result.message;
      render();
    });
    window.addEventListener('aurora-clean:state', render);
    render();
    window.AuroraFinanceStage6 = Object.freeze({releaseMission,render});
    return true;
  }

  function boot(){ if(!bind()) setTimeout(boot,50); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();