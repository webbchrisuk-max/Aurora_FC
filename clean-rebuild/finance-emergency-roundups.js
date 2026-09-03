(() => {
  'use strict';

  const BUILD='20260903-finance-emergency-roundups-2-webhook-authority';
  const MULTIPLIER=5;
  const MIN_ROUNDUP_PURCHASE_GBP=1;
  const REPAIR_KEY='20260903_MONZO_UNDER_1_OVERROUNDUP';
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
    const bills=arr(state.finance?.billPayments).map(p=>({
      key:`bill:${p.id}`,id:p.id,amount:round(p.amount),name:String(p.name||'Bill payment'),date:String(p.paidAt||''),source:'BILL_PAYMENT',authoritativeCredit:null
    }));
    const house=arr(state.finance?.houseProject?.entries).filter(e=>e.status==='paid').map(e=>({
      key:`house:${e.id}:${e.paidDate||e.actual}`,id:e.id,amount:round(e.actual),name:String(e.name||'House payment'),date:String(e.paidDate||''),source:'HOUSE_PAYMENT',authoritativeCredit:null
    }));
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
    return [...bills,...house,...card].filter(x=>x.amount>0);
  }

  function creditForSource(row){
    if(row&&row.authoritativeCredit!==null&&row.authoritativeCredit!==undefined){
      return round(row.authoritativeCredit);
    }
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
      m.source='AURORA_EMERGENCY_ROUNDUP_X5';
    });
    return true;
  }

  function repairHistoricalMonzoUnderOnePoundOvercredit(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return {repaired:false,amount:0};
    const state=A.readState(),pot=emergencyPot(state);if(!pot)return {repaired:false,amount:0};
    const currentMeta=state.finance?.emergencyRoundups||{};
    if(currentMeta.repairs?.[REPAIR_KEY])return {repaired:false,amount:0,alreadyDone:true};

    let repairedAmount=0;
    let repairedRows=0;

    A.updateState(next=>{
      const p=emergencyPot(next);if(!p)return;
      const m=ensureMeta(next);
      if(m.repairs[REPAIR_KEY])return;

      const underOneMonzo=sourceRows(next).filter(x=>
        x.source==='CARD_SPEND'&&
        x.cardSource==='MONZO_IFTTT_WEBHOOK'&&
        x.amount>0&&
        x.amount<MIN_ROUNDUP_PURCHASE_GBP&&
        x.authoritativeCredit===0
      );
      const keys=new Set(underOneMonzo.map(x=>x.key));
      const keep=[];

      m.history.forEach(row=>{
        const sourceKey=String(row?.sourceKey||'');
        const amount=round(row?.amount);
        if(keys.has(sourceKey)&&amount>0){
          repairedAmount=round(repairedAmount+amount);
          repairedRows++;
          return;
        }
        keep.push(row);
      });

      if(repairedAmount>0){
        p.balance=round(Math.max(0,round(p.balance)-repairedAmount));
        p.lastRoundupRepairAmount=repairedAmount;
        p.lastRoundupRepairAt=new Date().toISOString();
      }

      m.history=keep;
      m.totalRoundups=round(m.history.reduce((s,r)=>s+num(r.amount),0));
      m.repairs[REPAIR_KEY]={
        repairedAt:new Date().toISOString(),
        repairedAmount,
        repairedRows,
        reason:'Removed locally recalculated x5 credits for Monzo purchases under £1 where webhook credit was £0.00.'
      };
      next.finance.lastManagerChangeAt=new Date().toISOString();
      next.finance.lastManagerChangeReason=repairedAmount>0
        ?`Corrected Monzo under-£1 round-up overcredit (${money(repairedAmount)})`
        :'Verified Monzo under-£1 round-up repair';
    });

    return {repaired:repairedAmount>0,amount:repairedAmount,rows:repairedRows};
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
            creditAuthority:x.authoritativeCredit!==null?'MONZO_WEBHOOK':'AURORA_LOCAL_RULE'
          };
          m.history.push(row);results.push(row);
          p.lastRoundupAmount=credit;p.lastRoundupAt=row.postedAt;
        }
      });
      m.lastProcessedAt=new Date().toISOString();
      m.totalRoundups=round(m.history.reduce((s,r)=>s+num(r.amount),0));
      next.finance.lastManagerChangeAt=m.lastProcessedAt;
      next.finance.lastManagerChangeReason=results.length?`Emergency Pot round-up x5 added (${results.length})`:'Emergency Pot round-up scan';
    });
    return results;
  }

  function logCardSpend(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return;
    const raw=prompt('Card spend amount','0.00');if(raw===null)return;
    const amount=round(raw);if(amount<=0){alert('Enter a card spend above £0.00.');return}
    const name=prompt('What was the spend?','Card purchase');if(name===null)return;
    const credit=roundupFor(amount);
    if(!confirm(`${money(amount)} spend\nRound-up x5: ${money(credit)} to Emergency Pot\n\nAdd this spend?`))return;
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
    repairHistoricalMonzoUnderOnePoundOvercredit();
    processDue();
    render();
    document.addEventListener('click',e=>{if(e.target.closest?.('#paydayEmergencyLogSpend'))logCardSpend()});
    window.addEventListener('aurora-clean:state',()=>{const r=processDue();setTimeout(render,r.length?10:0)});
    window.addEventListener('pageshow',()=>{repairHistoricalMonzoUnderOnePoundOvercredit();processDue();setTimeout(render,0)});
    window.AuroraFinanceEmergencyRoundups=Object.freeze({BUILD,MULTIPLIER,MIN_ROUNDUP_PURCHASE_GBP,roundupFor,creditForSource,repairHistoricalMonzoUnderOnePoundOvercredit,processDue,render,logCardSpend});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();