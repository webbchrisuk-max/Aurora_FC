/* Aurora City FC — Transfer-owned Income Strategy v1.2
 * Sustainable / Maximum is a Transfer deployment choice.
 * Scouting calculates both score sets and owns eligibility/approval.
 * Strategy selection + route rebuild is committed as one Aurora state write so
 * cloud sync can never observe a temporary "strategy changed, route missing" state.
 */
(function(w){
  'use strict';
  if(w.__AURORA_TRANSFER_STRATEGY_V12__)return;
  w.__AURORA_TRANSFER_STRATEGY_V12__=true;

  const A=()=>w.Aurora2;
  const now=()=>new Date().toISOString();
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const cleanTicker=v=>String(v||'').replace(/^LON:/i,'').replace(/\.L$/i,'').replace(/\.GB$/i,'').toUpperCase().trim();
  const valid=v=>String(v||'').toLowerCase()==='maximum'?'maximum':'sustainable';
  const label=v=>valid(v)==='maximum'?'Maximum Income':'Sustainable Income';
  const file=()=>String(location.pathname||'').split('/').pop().toLowerCase();
  const isTransfer=()=>file()==='transfer.html';
  const isScouting=()=>file()==='scouting.html';
  let changing=false;

  function registeredCount(state){
    try{
      const ids=w.AuroraTransferMission?.registeredLegIds?.(state);
      if(ids&&typeof ids.size==='number')return ids.size;
    }catch(_){}
    return arr(state?.transfer?.registrationDrafts)
      .filter(row=>String(row?.status||'').toUpperCase()==='CONFIRMED').length;
  }

  function executionLocked(state){
    const status=String(state?.mission?.status||'').toUpperCase();
    return registeredCount(state)>0 || ['PARTIALLY_REGISTERED','COMPLETE','COMPLETED'].includes(status);
  }

  function approvedRouteLocked(state){
    return !!state?.transfer?.route?.locked || String(state?.mission?.status||'').toUpperCase()==='LOCKED';
  }

  function ownedStrategy(state){
    return valid(state?.transfer?.settings?.strategy || state?.scouting?.strategy || 'sustainable');
  }

  function migrateOwnership(){
    const core=A()?.core;
    if(!core?.read||!core?.update)return null;
    const state=core.read();
    const alreadyOwned=state?.transfer?.strategyOwner==='TRANSFER';
    const initial=alreadyOwned
      ? ownedStrategy(state)
      : valid(state?.scouting?.strategy || state?.transfer?.settings?.strategy || 'sustainable');
    const needsWrite=!alreadyOwned || valid(state?.transfer?.settings?.strategy)!==initial || valid(state?.scouting?.strategy)!==initial;
    if(!needsWrite)return state;
    return core.update(s=>({
      ...s,
      scouting:{...s.scouting,strategy:initial,updatedAt:s.scouting?.updatedAt||now()},
      transfer:{
        ...s.transfer,
        strategyOwner:'TRANSFER',
        settings:{...s.transfer?.settings,strategy:initial},
        updatedAt:now()
      }
    }));
  }

  function installStyles(){
    if(document.getElementById('aurora-transfer-strategy-styles'))return;
    const style=document.createElement('style');
    style.id='aurora-transfer-strategy-styles';
    style.textContent=`
      .transfer-strategy-owner{display:grid;gap:10px;margin-top:14px}
      .transfer-strategy-choices{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      .transfer-strategy-choice{appearance:none;-webkit-appearance:none;display:grid;gap:5px;min-height:92px;padding:13px;text-align:left;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.015);color:#d8d2d4;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      .transfer-strategy-choice strong{font-size:12px;color:#f3edf0}.transfer-strategy-choice span{font-size:7px;line-height:1.45;color:#81767b}
      .transfer-strategy-choice.active{border-color:rgba(245,200,91,.42);background:linear-gradient(135deg,rgba(245,200,91,.11),rgba(255,95,119,.045));box-shadow:inset 0 0 0 1px rgba(245,200,91,.08)}
      .transfer-strategy-choice.active strong{color:#ffe19b}.transfer-strategy-choice:disabled{opacity:.45;cursor:not-allowed}
      .transfer-strategy-status{min-height:18px;color:#a89a91;font-size:7px;line-height:1.45}.transfer-strategy-status.good{color:#aaffc5}.transfer-strategy-status.warn{color:#ffe19b}.transfer-strategy-status.block{color:#ffb5c2}
      .scouting-strategy-moved{display:grid;gap:10px}.scouting-strategy-moved strong{font-size:14px}.scouting-strategy-moved p{margin:0;color:#8d8790;font-size:9px;line-height:1.55}
      .scouting-strategy-moved .strategy-readout{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px;border:1px solid rgba(88,244,255,.14);border-radius:12px;background:rgba(88,244,255,.025)}
      .scouting-strategy-moved .strategy-readout small{color:#58f4ff;font-size:7px;font-weight:900;letter-spacing:.09em}.scouting-strategy-moved .strategy-readout b{color:#e9fcff;font-size:11px}
      @media(max-width:700px){.transfer-strategy-choices{grid-template-columns:1fr}.transfer-strategy-choice{min-height:76px}}
    `;
    document.head.appendChild(style);
  }

  function transferCard(){return document.getElementById('scoutingStrategyCard')}

  function renderTransfer(state=A()?.core?.read?.()){
    if(!isTransfer()||!state)return;
    installStyles();
    const strategy=ownedStrategy(state);
    const hardLocked=executionLocked(state);
    const routeLocked=approvedRouteLocked(state);
    const card=transferCard();
    if(card && card.dataset.transferStrategyOwner!=='1'){
      card.dataset.transferStrategyOwner='1';
      card.innerHTML=`
        <div class="transfer-strategy-owner">
          <div class="transfer-strategy-choices" role="radiogroup" aria-label="Transfer income strategy">
            <button type="button" class="transfer-strategy-choice" data-transfer-strategy="sustainable" role="radio" aria-checked="false">
              <strong>Sustainable Income</strong>
              <span>Balances income, dividend safety, valuation and portfolio fit when Aurora allocates the payday budget.</span>
            </button>
            <button type="button" class="transfer-strategy-choice" data-transfer-strategy="maximum" role="radio" aria-checked="false">
              <strong>Maximum Income</strong>
              <span>Prioritises the highest supported income opportunity while keeping the same Scouting and broker gates.</span>
            </button>
          </div>
          <div class="transfer-strategy-status" id="transferStrategyStatus"></div>
        </div>`;
    }

    document.querySelectorAll('[data-transfer-strategy]').forEach(button=>{
      const active=button.dataset.transferStrategy===strategy;
      button.classList.toggle('active',active);
      button.setAttribute('aria-checked',String(active));
      button.disabled=hardLocked;
    });

    const status=document.getElementById('transferStrategyStatus');
    if(status){
      status.className='transfer-strategy-status '+(hardLocked?'block':routeLocked?'warn':'good');
      status.textContent=hardLocked
        ?`${label(strategy)} is fixed because broker execution has already started.`
        :routeLocked
          ?`${label(strategy)} is approved. Choosing the other strategy will rebuild the recommendation before any purchase is registered.`
          :state.transfer?.route
            ?`${label(strategy)} recommendation is live below.`
            :`${label(strategy)} controls target ranking and payday allocation in Transfer.`;
    }

    const panel=card?.closest('.strategy-panel');
    const head=panel?.querySelector('.transfer-panel-head');
    const kicker=head?.querySelector('.transfer-panel-kicker');
    const title=head?.querySelector('h3');
    const copy=head?.querySelector('.transfer3-head-copy');
    const note=head?.querySelector('.transfer-panel-note');
    if(kicker)kicker.textContent='Transfer Strategy';
    if(title)title.textContent='Choose Income Strategy';
    if(copy)copy.textContent='Choose how Transfer deploys the Finance-authorised payday budget across the approved Scouting shortlist.';
    if(note)note.textContent='Transfer-owned';

    const board=document.getElementById('targetBoardStrategy');
    if(board){
      board.textContent=strategy==='maximum'?'Maximum':'Sustainable';
      const small=board.parentElement?.querySelector('small');
      if(small)small.textContent='selected in Transfer';
    }

    const authority=document.getElementById('routeStrategyReadout');
    if(authority){
      const small=authority.parentElement?.querySelector('small');
      if(small)small.textContent='Transfer Strategy';
      if(!state.transfer?.route)authority.textContent=label(strategy);
    }
  }

  function renderScouting(state=A()?.core?.read?.()){
    if(!isScouting()||!state)return;
    installStyles();
    const strategy=ownedStrategy(state);
    const section=document.getElementById('scoutingLensSection');
    const lensPanel=section?.querySelector('.lens-panel');
    if(lensPanel && lensPanel.dataset.transferStrategyOwner!=='1'){
      lensPanel.dataset.transferStrategyOwner='1';
      lensPanel.innerHTML=`
        <div class="scouting-panel-head">
          <div><span class="scouting-panel-kicker">Dual Scoring</span><h3>Income Scores for Transfer</h3><p class="scouting3-head-copy">Scouting calculates both Sustainable and Maximum scores. Transfer Centre chooses which one controls payday deployment.</p></div>
          <span class="scouting-panel-note">Research only</span>
        </div>
        <div class="scouting-strategy-moved">
          <div class="strategy-readout"><div><small>TRANSFER SELECTION</small><strong>Current deployment strategy</strong></div><b id="scoutingTransferStrategyReadout">—</b></div>
          <p>The shortlist eligibility gates do not change. Sustainable and Maximum scores remain available for comparison; the manager now makes the deployment choice in Transfer Centre.</p>
          <a class="scouting-btn primary" href="transfer.html">Choose Strategy in Transfer →</a>
        </div>`;
    }
    const readout=document.getElementById('scoutingTransferStrategyReadout');
    if(readout)readout.textContent=label(strategy);

    const jump=[...document.querySelectorAll('[data-scout-jump="scoutingLensSection"]')][0];
    if(jump)jump.textContent='Income Scores';
    const lensKpi=document.getElementById('scouting11Lens');
    if(lensKpi){
      lensKpi.textContent=label(strategy);
      const meta=lensKpi.parentElement?.querySelector('span');
      if(meta)meta.textContent='Transfer-selected ranking';
    }
  }

  function decorateAllocation(state,a){
    const targets=arr(state?.scouting?.targets);
    const target=targets.find(t=>String(t.securityId||'')&&String(t.securityId)===String(a.securityId||'')) ||
      targets.find(t=>String(t.id||'')===String(a.targetId||'')) ||
      targets.find(t=>cleanTicker(t.ticker)===cleanTicker(a.ticker));
    const evidence=A()?.transferEngine?.resolveMarketPrice?.(state,target||a)||a?.priceEvidence||{};
    const estimatedPrice=Math.max(0,num(evidence?.priceGbp||a?.priceEvidence?.priceGbp));
    return {
      ...a,
      estimatedPriceGbp:estimatedPrice,
      estimatedShares:estimatedPrice>0?Math.floor(num(a.amount)/estimatedPrice):null,
      quoteUpdatedAt:evidence?.timestamp||a?.priceEvidence?.timestamp||null
    };
  }

  function buildForStrategy(state,nextStrategy){
    const engine=A()?.transferEngine;
    if(!engine?.buildMissionPlan)return {ok:false,reason:'TRANSFER_ENGINE_UNAVAILABLE'};
    return engine.buildMissionPlan(state,{
      missionContract:w.AuroraTransferMission,
      now:now(),
      idFactory:p=>A().core.uid(p),
      decorateAllocation:a=>decorateAllocation(state,a)
    });
  }

  function selectStrategy(nextStrategy){
    if(changing)return;
    const core=A()?.core;
    if(!core?.read||!core?.update)return;
    nextStrategy=valid(nextStrategy);
    const before=core.read();

    if(executionLocked(before)){
      renderTransfer(before);
      const status=document.getElementById('transferStrategyStatus');
      if(status)status.textContent='Strategy cannot change after a real purchase has been registered.';
      return;
    }

    const previous=ownedStrategy(before);
    if(previous===nextStrategy){renderTransfer(before);return;}

    changing=true;
    let buildResult=null;
    let after;
    try{
      after=core.update(current=>{
        let working=current;
        if(approvedRouteLocked(working)){
          const offered=w.AuroraTransferMission?.rollbackAction?.(working);
          if(offered?.action!=='UNLOCK_ROUTE')throw new Error(offered?.label||'This approved route cannot be changed.');
          working=w.AuroraTransferMission.rollback(working,'UNLOCK_ROUTE','Change Transfer income strategy',now());
        }

        working={
          ...working,
          scouting:{...working.scouting,strategy:nextStrategy,updatedAt:working.scouting?.updatedAt||now()},
          transfer:{
            ...working.transfer,
            strategyOwner:'TRANSFER',
            settings:{...working.transfer?.settings,strategy:nextStrategy},
            updatedAt:now()
          }
        };

        const ready=String(working.scouting?.status||'').toUpperCase()==='SCOUTING_READY';
        const budget=Number(working.mission?.approvedBudget)||0;
        const missionStatus=String(working.mission?.status||'').toUpperCase();
        if(ready&&budget>0&&['DRAFT','READY'].includes(missionStatus)){
          buildResult=buildForStrategy(working,nextStrategy);
          if(buildResult?.ok){
            return {
              ...working,
              mission:buildResult.mission,
              transfer:{...working.transfer,route:buildResult.route,updatedAt:now()}
            };
          }
        }

        return {
          ...working,
          transfer:{...working.transfer,route:null,updatedAt:now()}
        };
      });
    }catch(error){
      changing=false;
      renderTransfer(core.read());
      const status=document.getElementById('transferStrategyStatus');
      if(status){status.className='transfer-strategy-status block';status.textContent=error?.message||'Strategy could not be changed.'}
      return;
    }

    changing=false;
    renderTransfer(after);
    renderScouting(after);

    const status=document.getElementById('transferStrategyStatus');
    if(status&&!after.transfer?.route){
      status.className='transfer-strategy-status warn';
      const reasons={
        NO_FINANCE_MISSION:'Finance has not released a Transfer budget yet.',
        MISSION_NOT_PLANNABLE:'The current Finance mission cannot be replanned.',
        SCOUTING_NOT_READY:'Approve the Scouting shortlist before building a recommendation.',
        NO_ELIGIBLE_TARGETS:'No eligible targets match the current broker rules.',
        TRANSFER_ENGINE_UNAVAILABLE:'The Transfer recommendation engine is unavailable.'
      };
      status.textContent=reasons[buildResult?.reason]||`${label(nextStrategy)} selected. Build the route when Finance and Scouting are ready.`;
    }
  }

  function wire(){
    document.addEventListener('click',event=>{
      const choice=event.target.closest?.('[data-transfer-strategy]');
      if(choice){
        event.preventDefault();
        event.stopPropagation();
        selectStrategy(choice.dataset.transferStrategy);
      }
    });
    w.addEventListener('aurora2:state',event=>{
      if(changing)return;
      const state=event.detail||A()?.core?.read?.();
      renderTransfer(state);
      renderScouting(state);
    });
  }

  function init(){
    if(!isTransfer()&&!isScouting())return;
    const state=migrateOwnership()||A()?.core?.read?.();
    wire();
    renderTransfer(state);
    renderScouting(state);
    setTimeout(()=>{
      const fresh=A()?.core?.read?.();
      renderTransfer(fresh);
      renderScouting(fresh);
    },120);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(window);
