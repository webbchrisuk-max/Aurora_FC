(() => {
  'use strict';

  const BUILD='20260905-finance-emergency-roundups-4-monzo-only-authority';
  const MULTIPLIER=5;
  const MIN_ROUNDUP_PURCHASE_GBP=1;
  const RECONCILE_KEY='20260903_MONZO_GROW_1274_08';
  const RECONCILE_FROM=1273.52;
  const RECONCILE_TO=1274.08;
  const CURRENT_RECONCILE_KEY='20260905_MONZO_GROW_1283_88';
  const CURRENT_RECONCILE_FROM=1286.38;
  const CURRENT_RECONCILE_TO=1283.88;
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));

  function emergencyPot(state){
    return arr(state?.finance?.pots).find(p=>!p?.archived&&(norm(p.name)==='emergency pot'||norm(p.name).includes('emergency')))||null;
  }

  function roundupFor(amount){
    const a=round(amount);
    if(a<MIN_ROUNDUP_PURCHASE_GBP)return 0;
    const pennies=Math.round(a*100);
    const remainder=pennies%100;
    const base=remainder===0?0:(100-remainder)/100;
    return round(base*MULTIPLIER);
  }

  function ensureMeta(state){
    state.finance=state.finance||{};
    state.finance.emergencyRoundups=state.finance.emergencyRoundups&&typeof state.finance.emergencyRoundups==='object'?state.finance.emergencyRoundups:{};
    const m=state.finance.emergencyRoundups;
    m.multiplier=MULTIPLIER;
    m.minimumPurchaseGbp=MIN_ROUNDUP_PURCHASE_GBP;
    m.history=arr(m.history);
    m.processed=m.processed&&typeof m.processed==='object'?m.processed:{};
    m.repairs=m.repairs&&typeof m.repairs==='object'?m.repairs:{};
    state.finance.cardSpends=arr(state.finance.cardSpends);
    return m;
  }

  function sourceRows(state){
    // Automatic Emergency Pot credits now come from card-spend rows only.
    // Monzo webhook/sheet rows carry webhookRoundUpCredit and are authoritative.
    // Paid bills and paid house-project entries must NEVER generate a local roundup.
    const card=arr(state.finance?.cardSpends).map(p=>({
      key:`card:${p.id}`,
      id:p.id,
      amount:round(p.amount),
      name:String(p.name||'Card spend'),
      date:String(p.spentAt||''),
      source:'CARD_SPEND',
      cardSource:String(p.source||''),
      monzoTransactionId:String(p.monzoTransactionId||''),
      authoritativeCredit:p.webhookRoundUpCredit===undefined||p.webhookRoundUpCredit===null?null:round(p.webhookRoundUpCredit)
    }));
    return card.filter(x=>x.amount>0);
  }

  function creditForSource(row){
    // Monzo webhook/sheet is the authority whenever it supplied a credit,
    // including an explicit £0.00 for purchases below £1.
    if(row&&row.authoritativeCredit!==null&&row.authoritativeCredit!==undefined){
      return round(row.authoritativeCredit);
    }
    // Manual card spends can still use the explicit Aurora x5 rule.
    return roundupFor(row?.amount);
  }

  function initializeIfNeeded(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return false;
    const state=A.readState(),pot=emergencyPot(state);if(!pot)return false;
    const existing=state.finance?.emergencyRoundups;
    if(existing?.initializedAt)return true;
    const now=new Date().toISOString();
    A.updateState(next=>{
      const m=ensureMeta(next);
      sourceRows(next).forEach(x=>{m.processed[x.key]=true});
      m.initializedAt=now;
      m.source='MONZO_ROUNDUP_AUTHORITY';
    });
    return true;
  }

  function reconcileKnownGrowBalance(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return {reconciled:false};
    const state=A.readState(),pot=emergencyPot(state);if(!pot)return {reconciled:false};
    const meta=state.finance?.emergencyRoundups||{};
    if(meta.repairs?.[RECONCILE_KEY])return {reconciled:false,alreadyDone:true};
    if(round(pot.balance)!==RECONCILE_FROM)return {reconciled:false,skipped:true,current:round(pot.balance)};

    A.updateState(next=>{
      const p=emergencyPot(next);if(!p||round(p.balance)!==RECONCILE_FROM)return;
      const m=ensureMeta(next);
      if(m.repairs[RECONCILE_KEY])return;
      const before=round(p.balance);
      p.balance=RECONCILE_TO;
      const delta=Number((RECONCILE_TO-before).toFixed(2));
      m.repairs[RECONCILE_KEY]={
        reconciledAt:new Date().toISOString(),
        balanceBefore:before,
        balanceAfter:RECONCILE_TO,
        delta,
        reason:'Reconciled Aurora Emergency/Grow Pot to confirmed Monzo Grow Pot balance after earlier local roundup correction.'
      };
      next.finance.lastManagerChangeAt=new Date().toISOString();
      next.finance.lastManagerChangeReason=`Grow Pot reconciled to Monzo (${money(RECONCILE_TO)})`;
    });
    return {reconciled:true,from:RECONCILE_FROM,to:RECONCILE_TO,delta:Number((RECONCILE_TO-RECONCILE_FROM).toFixed(2))};
  }

  function reconcileCurrentConfirmedMonzoBalance(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return {reconciled:false};
    const state=A.readState(),pot=emergencyPot(state);if(!pot)return {reconciled:false};
    const meta=state.finance?.emergencyRoundups||{};
    if(meta.repairs?.[CURRENT_RECONCILE_KEY])return {reconciled:false,alreadyDone:true};
    if(round(pot.balance)!==CURRENT_RECONCILE_FROM)return {reconciled:false,skipped:true,current:round(pot.balance)};

    A.updateState(next=>{
      const p=emergencyPot(next);if(!p||round(p.balance)!==CURRENT_RECONCILE_FROM)return;
      const m=ensureMeta(next);
      if(m.repairs[CURRENT_RECONCILE_KEY])return;
      const before=round(p.balance);
      p.balance=CURRENT_RECONCILE_TO;
      const delta=Number((CURRENT_RECONCILE_TO-before).toFixed(2));
      m.repairs[CURRENT_RECONCILE_KEY]={
        reconciledAt:new Date().toISOString(),
        balanceBefore:before,
        balanceAfter:CURRENT_RECONCILE_TO,
        delta,
        reason:'One-time reconciliation to the user-confirmed Monzo Grow Pot balance. Future automatic credits are sourced from Monzo webhook/sheet rows only.'
      };
      next.finance.lastManagerChangeAt=new Date().toISOString();
      next.finance.lastManagerChangeReason=`Grow Pot reconciled to confirmed Monzo balance (${money(CURRENT_RECONCILE_TO)})`;
    });
    return {reconciled:true,from:CURRENT_RECONCILE_FROM,to:CURRENT_RECONCILE_TO,delta:Number((CURRENT_RECONCILE_TO-CURRENT_RECONCILE_FROM).toFixed(2))};
  }

  function processDue(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return [];
    const state=A.readState(),pot=emergencyPot(state);if(!pot)return [];
    const meta=state.finance?.emergencyRoundups;
    if(!meta?.initializedAt){initializeIfNeeded();return []}
    const due=sourceRows(state).filter(x=>!meta.processed?.[x.key]);
    if(!due.length)return [];
    const results=[];
    A.updateState(next=>{
      const p=emergencyPot(next);if(!p)return;
      const m=ensureMeta(next);
      due.forEach(x=>{
        if(m.processed[x.key])return;
        const credit=creditForSource(x);
        m.processed[x.key]=true;
        const before=round(p.balance);
        if(credit>0){
          p.balance=round(before+credit);
          const row={
            id:`ROUNDUP-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
            sourceKey:x.key,
            source:x.source,
            name:x.name,
            spendAmount:x.amount,
            normalRoundup:round(credit/MULTIPLIER),
            multiplier:MULTIPLIER,
            amount:credit,
            balanceBefore:before,
            balanceAfter:round(p.balance),
            postedAt:new Date().toISOString(),
            creditAuthority:x.authoritativeCredit!==null?'MONZO_WEBHOOK':'AURORA_MANUAL_CARD_SPEND'
          };
          m.history.push(row);results.push(row);
          p.lastRoundupAmount=credit;p.lastRoundupAt=row.postedAt;
        }
      });
      m.lastProcessedAt=new Date().toISOString();
      m.totalRoundups=round(m.history.reduce((s,r)=>s+num(r.amount),0));
      m.source='MONZO_ROUNDUP_AUTHORITY';
      next.finance.lastManagerChangeAt=m.lastProcessedAt;
      next.finance.lastManagerChangeReason=results.length?`Emergency Pot Monzo round-up added (${results.length})`:'Emergency Pot Monzo round-up scan';
    });
    return results;
  }

  function logCardSpend(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return;
    const raw=prompt('Card spend amount','0.00');if(raw===null)return;
    const amount=round(raw);if(amount<=0){alert('Enter a card spend above £0.00.');return}
    const name=prompt('What was the spend?','Card purchase');if(name===null)return;
    const credit=roundupFor(amount);
    if(!confirm(`${money(amount)} spend\nRound-up x5: ${money(credit)} to Emergency Pot\n\nAdd this manual spend?`))return;
    A.updateState(next=>{
      ensureMeta(next);
      next.finance.cardSpends.push({id:`CARDSPEND-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name:String(name||'Card purchase'),amount,spentAt:new Date().toISOString(),source:'MANUAL_CARD_SPEND'});
    });
    processDue();
    setTimeout(render,0);
  }

  function ensureUi(){
    const card=document.getElementById('paydayEmergencyCard');if(!card)return;
    let grid=card.querySelector('.payday-pot-summary-grid');if(!grid)return;
    if(!document.getElementById('paydayEmergencyRoundupTotal')){
      const total=document.createElement('div');total.className='payday-pot-summary-stat';total.innerHTML='<span>Round-ups added</span><strong id="paydayEmergencyRoundupTotal">£0.00</strong>';grid.appendChild(total);
      const last=document.createElement('div');last.className='payday-pot-summary-stat';last.innerHTML='<span>Last round-up</span><strong id="paydayEmergencyLastRoundup">—</strong>';grid.appendChild(last);
    }
    if(!document.getElementById('paydayEmergencyLogSpend')){
      const actions=document.createElement('div');actions.className='finance-actions';actions.style.marginTop='12px';actions.innerHTML='<button id="paydayEmergencyLogSpend" type="button">+ Log Card Spend</button>';card.appendChild(actions);
    }
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const state=A.readState(),pot=emergencyPot(state);if(!pot)return;
    ensureUi();
    const m=state.finance?.emergencyRoundups||{},history=arr(m.history),last=history[history.length-1];
    const total=document.getElementById('paydayEmergencyRoundupTotal');if(total)total.textContent=money(history.reduce((s,r)=>s+num(r.amount),0));
    const lastEl=document.getElementById('paydayEmergencyLastRoundup');if(lastEl)lastEl.textContent=last?`${money(last.amount)} from ${money(last.spendAmount)}`:'Tracking started';
  }

  function boot(){
    if(!window.AuroraClean||!document.getElementById('paydayEmergencyCard')){setTimeout(boot,80);return}
    initializeIfNeeded();
    reconcileKnownGrowBalance();
    reconcileCurrentConfirmedMonzoBalance();
    processDue();
    render();
    document.addEventListener('click',e=>{if(e.target.closest?.('#paydayEmergencyLogSpend'))logCardSpend()});
    window.addEventListener('aurora-clean:state',()=>{const r=processDue();setTimeout(render,r.length?10:0)});
    window.addEventListener('pageshow',()=>{reconcileKnownGrowBalance();reconcileCurrentConfirmedMonzoBalance();processDue();setTimeout(render,0)});
    window.AuroraFinanceEmergencyRoundups=Object.freeze({BUILD,MULTIPLIER,MIN_ROUNDUP_PURCHASE_GBP,roundupFor,creditForSource,reconcileKnownGrowBalance,reconcileCurrentConfirmedMonzoBalance,processDue,render,logCardSpend});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();