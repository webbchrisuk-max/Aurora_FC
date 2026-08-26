(() => {
  'use strict';

  const BUILD='20260826-clean-registration-real-1';
  const EPS=0.005;
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(Math.max(0,num(v)).toFixed(2));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(round(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const upper=v=>String(v||'').trim().toUpperCase();
  const now=()=>new Date().toISOString();
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const hash=value=>{let h=2166136261;for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')};
  const accountCode=v=>{const s=upper(v);if(s.includes('212'))return'T212';if(s==='IG'||s.includes('IG ISA'))return'IG';return''};
  const accountLabel=v=>accountCode(v)==='IG'?'IG ISA':accountCode(v)==='T212'?'Trading 212 ISA':String(v||'');

  function routeContext(){
    const a=window.AuroraClean;if(!a)return null;
    const state=a.readState(),mission=state.transfer?.mission,route=state.transfer?.route;
    if(!mission||!route||route.locked!==true||upper(mission.status)!=='LOCKED'||String(route.missionId||'')!==String(mission.id||''))return null;
    const allocations=(route.allocations||[]).filter(r=>num(r.amount)>0).map((r,index)=>({...r,legId:String(r.legId||r.id||`LEG-${hash(`${mission.id}|${route.id}|${index}|${r.ticker}|${r.amount}`)}`)}));
    const receipts=(state.registration?.receipts||[]).filter(r=>String(r.missionId||'')===String(mission.id));
    return{state,mission,route,allocations,receipts};
  }

  function selected(ctx){const id=String($('regLeg')?.value||'');return ctx?.allocations.find(r=>r.legId===id)||ctx?.allocations[0]||null}
  function receiptFor(ctx,leg){return ctx?.receipts.find(r=>String(r.legId||'')===String(leg?.legId||''))||null}
  function confirmedTotal(ctx){return round((ctx?.receipts||[]).reduce((s,r)=>s+num(r.totalCostGbp),0))}

  function actual(){
    const shares=Math.max(0,num($('regShares')?.value));
    const priceInput=Math.max(0,num($('regPrice')?.value));
    const priceUnit=upper($('regPriceUnit')?.value||'GBP');
    const currency=upper($('regCurrency')?.value||'GBP');
    const fxRateToGbp=currency==='GBP'?1:Math.max(0,num($('regFx')?.value));
    const feesNative=Math.max(0,num($('regFees')?.value));
    const unitPriceNative=priceUnit==='PENCE'?priceInput/100:priceInput;
    const grossCostNative=shares*unitPriceNative;
    const totalCostNative=grossCostNative+feesNative;
    const totalCostGbp=currency==='GBP'?totalCostNative:totalCostNative*fxRateToGbp;
    return{shares,priceInput,priceUnit,currency,fxRateToGbp,feesNative,unitPriceNative,grossCostNative,totalCostNative,totalCostGbp,tradeDate:String($('regTradeDate')?.value||''),account:String($('regAccount')?.value||'')};
  }

  function validation(ctx,leg,a){
    const errors=[];
    if(!ctx||!leg)errors.push('A locked Transfer route is required.');
    if(!accountCode(a.account))errors.push('Choose IG ISA or Trading 212 ISA.');
    if(!a.tradeDate)errors.push('Trade date is required.');
    if(!(a.shares>0))errors.push('Shares must be greater than zero.');
    if(!(a.priceInput>0))errors.push('Execution price must be greater than zero.');
    if(!/^[A-Z]{3}$/.test(a.currency))errors.push('Currency must be a three-letter code.');
    if(a.currency!=='GBP'&&!(a.fxRateToGbp>0))errors.push('FX rate to GBP must be greater than zero.');
    if(!(a.totalCostGbp>0))errors.push('Actual GBP cost must be greater than zero.');
    const existing=receiptFor(ctx,leg);if(existing)errors.push('This locked leg already has a confirmed receipt.');
    const remaining=round(num(ctx?.mission?.budget)-confirmedTotal(ctx));
    if(a.totalCostGbp>remaining+EPS)errors.push(`Actual cost ${money(a.totalCostGbp)} exceeds the remaining Finance mission budget ${money(remaining)}.`);
    return errors;
  }

  function seedForm(ctx,leg){
    if(!leg)return;
    const existing=receiptFor(ctx,leg);
    $('regTicker').value=leg.ticker||'';
    $('regPlanned').value=round(leg.amount).toFixed(2);
    if(!$('regTradeDate').value)$('regTradeDate').value=today();
    if(existing){
      $('regAccount').value=accountLabel(existing.account);
      $('regShares').value=existing.shares;
      $('regPrice').value=existing.priceInput;
      $('regPriceUnit').value=existing.priceUnit||'GBP';
      $('regCurrency').value=existing.currency||'GBP';
      $('regFx').value=existing.fxRateToGbp||1;
      $('regFees').value=existing.feesNative||0;
      $('regTradeDate').value=existing.tradeDate||today();
    }else{
      $('regAccount').value='';$('regShares').value='';$('regPrice').value='';$('regPriceUnit').value='GBP';$('regCurrency').value='GBP';$('regFx').value='1';$('regFees').value='0';
    }
  }

  function render(){
    const ctx=routeContext();
    const status=$('registrationStatus'),list=$('registrationRows'),select=$('regLeg'),confirm=$('regConfirm'),settle=$('regSettle');
    if(!ctx){
      if(status)status.textContent='Waiting for a locked Transfer route';
      if(list)list.innerHTML='<li>No locked route.</li>';
      if(select)select.innerHTML='<option>No locked route</option>';
      if(confirm)confirm.disabled=true;if(settle)settle.disabled=true;
      return;
    }
    const old=select?.value;
    if(select){select.innerHTML=ctx.allocations.map((r,i)=>`<option value="${esc(r.legId)}">#${i+1} ${esc(r.ticker)} · ${money(r.amount)}</option>`).join('');if(ctx.allocations.some(r=>r.legId===old))select.value=old;}
    const leg=selected(ctx),confirmed=confirmedTotal(ctx),remaining=round(num(ctx.mission.budget)-confirmed),done=ctx.allocations.filter(r=>receiptFor(ctx,r)).length;
    if(status)status.textContent=`${done}/${ctx.allocations.length} executions confirmed · ${money(confirmed)} actual · ${money(remaining)} mission cash remaining`;
    if(list)list.innerHTML=ctx.allocations.map((r,i)=>{const rec=receiptFor(ctx,r);return `<li class="reg-route-row"><strong>#${i+1} ${esc(r.ticker)}</strong><span>Planned ${money(r.amount)}</span><span>${rec?`${esc(accountLabel(rec.account))} · ${Number(rec.shares).toLocaleString('en-GB',{maximumFractionDigits:6})} shares · actual ${money(rec.totalCostGbp)}`:'WAITING FOR BROKER EXECUTION'}</span><strong>${rec?'CONFIRMED ✓':'WAITING'}</strong></li>`}).join('');
    if(leg&&String($('regTicker')?.value||'')!==String(leg.ticker||''))seedForm(ctx,leg);
    const a=actual(),planned=round(leg?.amount),difference=Number((a.totalCostGbp-planned).toFixed(2));
    $('regActualCost').textContent=money(a.totalCostGbp);$('regVariance').textContent=`${difference>0?'+':''}${money(difference)}`;$('regRemaining').textContent=money(remaining);
    const rec=receiptFor(ctx,leg);if(confirm)confirm.disabled=!!rec||!leg;
    const allDone=ctx.allocations.length>0&&done===ctx.allocations.length;
    if(settle)settle.disabled=!allDone||upper(ctx.mission.status)==='COMPLETE';
    $('registrationReceipts').textContent=`${ctx.receipts.length} receipt(s) recorded for this mission`;
    $('regMission').textContent=`${ctx.mission.status} · ${money(ctx.mission.budget)} · ${ctx.mission.id}`;
    const client=window.AuroraData2Client,config=client?.config?.()||{};$('regConnection').textContent=config.endpoint&&config.token?'CONNECTED':'NOT CONNECTED';
  }

  async function confirmExecution(){
    const ctx=routeContext(),leg=selected(ctx),a=actual(),errors=validation(ctx,leg,a);
    if(errors.length){alert(errors.join('\n'));return}
    const client=window.AuroraData2Client,config=client?.config?.()||{};
    if(!client?.post||!config.endpoint||!config.token){alert('AuroraData 2 is not connected. Save the Apps Script endpoint and private token first. Nothing was registered.');return}
    const stable=hash(`${ctx.mission.id}|${ctx.route.id}|${leg.legId}`),transactionId=`TX-CLEAN-${stable}`,clientRequestId=`REQ-CLEAN-${stable}`;
    const account=accountCode(a.account),ticker=upper(leg.ticker),planned=round(leg.amount),prior=(ctx.state.squad?.holdings||[]).find(h=>accountCode(h.account)===account&&upper(h.ticker)===ticker&&!['SOLD','ARCHIVED'].includes(upper(h.status)));
    const payload={transaction:{transactionId,clientRequestId,tradeDate:a.tradeDate,account,ticker,name:leg.name||ticker,side:'BUY',shares:a.shares,priceInput:a.priceInput,priceUnit:a.priceUnit,currency:a.currency,fxRateToGbp:a.fxRateToGbp,feesNative:a.feesNative,totalCostGbp:round(a.totalCostGbp),missionId:ctx.mission.id,routeId:ctx.route.id,allocationId:leg.legId,legId:leg.legId,strategy:ctx.route.strategy||'',expectedAnnualIncomeGbp:num(leg.expectedAnnualIncome)},priorHolding:prior||null,missionSnapshot:{missionId:ctx.mission.id,approvedBudget:num(ctx.mission.approvedBudget||ctx.mission.budget),status:ctx.mission.status,source:'CLEAN_FINANCE_STAGE6'},routeSnapshot:{routeId:ctx.route.id,missionId:ctx.route.missionId,strategy:ctx.route.strategy||'',allocated:num(ctx.route.allocations?.reduce((s,r)=>s+num(r.amount),0)),locked:true,allocations:ctx.route.allocations}};
    if(!confirm(`Confirm ${ticker} with AuroraData 2?\n\nPlanned: ${money(planned)}\nActual: ${money(a.totalCostGbp)}\nShares: ${a.shares}\nBroker: ${accountLabel(account)}\n\nSquad will NOT change until every locked leg is confirmed.`))return;
    const button=$('regConfirm');button.disabled=true;button.textContent='Confirming with AuroraData 2…';
    try{
      const result=await client.post('registerPurchase',payload);
      if(!result?.confirmed||!result?.transaction)throw new Error('AuroraData 2 did not return a confirmed transaction.');
      if(String(result.transaction.transactionId||'')!==transactionId)throw new Error('Backend transaction ID did not match this locked leg.');
      window.AuroraClean.updateState(state=>{
        state.registration=state.registration||{receipts:[]};state.registration.receipts=state.registration.receipts||[];
        const exists=state.registration.receipts.some(r=>r.transactionId===transactionId||r.legId===leg.legId&&r.missionId===ctx.mission.id);if(exists)return;
        state.registration.receipts.push({id:result.receiptId||result.backendReceiptId||`RECEIPT-${stable}`,backendReceiptId:result.receiptId||result.backendReceiptId||'',transactionId,clientRequestId,missionId:ctx.mission.id,routeId:ctx.route.id,legId:leg.legId,allocationId:leg.legId,account,ticker,name:leg.name||ticker,side:'BUY',tradeDate:a.tradeDate,shares:a.shares,priceInput:a.priceInput,priceUnit:a.priceUnit,currency:a.currency,fxRateToGbp:a.fxRateToGbp,grossCostNative:round(a.grossCostNative),feesNative:round(a.feesNative),totalCostNative:round(a.totalCostNative),totalCostGbp:round(result.transaction.totalCostGbp??a.totalCostGbp),plannedAmount:planned,differenceGbp:Number((round(result.transaction.totalCostGbp??a.totalCostGbp)-planned).toFixed(2)),yieldPct:num(leg.yieldPct),expectedAnnualIncomeGbp:num(leg.expectedAnnualIncome),previousShares:num(prior?.shares),previousBookCostGbp:num(prior?.bookCostGbp),confirmedAt:result.confirmedAt||now(),backendConfirmed:true,duplicate:!!result.duplicate,settledAt:null});
      });
      seedNextUnconfirmed();
    }catch(error){alert(`Registration failed. Nothing was settled into Squad.\n\n${error?.message||error}`)}finally{button.textContent='Confirm Selected Execution';render()}
  }

  function seedNextUnconfirmed(){const ctx=routeContext();if(!ctx)return;const next=ctx.allocations.find(r=>!receiptFor(ctx,r));if(next&&$('regLeg')){$('regLeg').value=next.legId;seedForm(ctx,next)}}

  function settleMission(){
    const ctx=routeContext();if(!ctx)return;
    const missing=ctx.allocations.filter(r=>!receiptFor(ctx,r));if(missing.length){alert(`${missing.length} locked leg(s) still need broker confirmation.`);return}
    const actualTotal=confirmedTotal(ctx);if(actualTotal>num(ctx.mission.budget)+EPS){alert('Settlement blocked because confirmed execution cost exceeds the Finance mission budget.');return}
    if(!confirm(`Settle this completed mission into Squad?\n\nConfirmed cost: ${money(actualTotal)}\nPurchases: ${ctx.allocations.length}\n\nThis will update real clean Squad holdings and mark the mission COMPLETE.`))return;
    window.AuroraClean.updateState(state=>{
      const receipts=(state.registration?.receipts||[]).filter(r=>r.missionId===ctx.mission.id&&!r.settledAt);
      receipts.forEach(r=>{
        const account=accountLabel(r.account),ticker=upper(r.ticker),existing=(state.squad.holdings||[]).find(h=>accountCode(h.account)===accountCode(account)&&upper(h.ticker)===ticker&&!['SOLD','ARCHIVED'].includes(upper(h.status)));
        const cost=round(r.totalCostGbp),shares=Math.max(0,num(r.shares)),unitGbp=shares>0?cost/shares:0;
        if(existing){
          const oldShares=num(existing.shares),oldBook=num(existing.bookCostGbp),newShares=oldShares+shares,newBook=oldBook+cost;
          existing.shares=newShares;existing.bookCostGbp=round(newBook);existing.avgCostGbp=newShares>0?newBook/newShares:0;
          if(!(num(existing.livePriceGbp)>0))existing.livePriceGbp=unitGbp;
          existing.marketValueGbp=round(newShares*num(existing.livePriceGbp||unitGbp));
          const annualIncome=cost*num(r.yieldPct)/100;existing.annualIncomeGbp=round(num(existing.annualIncomeGbp)+annualIncome);existing.annualDpsGbp=newShares>0?num(existing.annualIncomeGbp)/newShares:0;existing.status='ACTIVE';
          r.previousShares=oldShares;r.newShares=newShares;r.previousBookCostGbp=oldBook;r.newBookCostGbp=round(newBook);
        }else{
          const annualIncome=cost*num(r.yieldPct)/100;
          state.squad.holdings.push({holdingId:`CLEAN-${accountCode(account)}-${ticker}`,account,ticker,name:r.name||ticker,shares,bookCostGbp:cost,avgCostGbp:unitGbp,livePriceGbp:unitGbp,marketValueGbp:cost,annualDpsGbp:shares>0?annualIncome/shares:0,annualIncomeGbp:round(annualIncome),sector:'',role:'',status:'ACTIVE',locked:false,lockReason:'',source:'CLEAN_REGISTRATION',sourceUpdatedAt:now()});
          r.previousShares=0;r.newShares=shares;r.previousBookCostGbp=0;r.newBookCostGbp=cost;
        }
        r.settledAt=now();r.settlementStatus='SQUAD_SETTLED';
      });
      state.squad.importedAt=now();state.squad.source='CLEAN_REGISTRATION';
      state.transfer.mission.status='COMPLETE';state.transfer.mission.completedAt=now();state.transfer.mission.actualCostGbp=actualTotal;state.transfer.mission.updatedAt=now();
      state.transfer.route.settled=true;state.transfer.route.settledAt=now();state.transfer.route.actualCostGbp=actualTotal;
      state.registration.lastSettlement={missionId:ctx.mission.id,routeId:ctx.route.id,actualCostGbp:actualTotal,receiptCount:receipts.length,settledAt:now()};
    });
    render();alert('Mission settled into Squad successfully.');
  }

  async function checkConnection(){const client=window.AuroraData2Client;if(!client?.health){alert('AuroraData 2 client is not loaded.');return}try{const r=await client.health();$('regConnection').textContent='CONNECTED';$('regConnectionDetail').textContent=`AuroraData 2 confirmed${r?.transactions!=null?` · ${r.transactions} recent registration(s)`:''}.`;}catch(e){$('regConnection').textContent='NOT CONNECTED';$('regConnectionDetail').textContent=e?.message||String(e)}}
  function saveConnection(){const client=window.AuroraData2Client;if(!client?.saveConfig)return;client.saveConfig($('regEndpoint').value,$('regToken').value);$('regToken').value='';render();checkConnection()}

  function bind(){
    $('regLeg')?.addEventListener('change',()=>{const ctx=routeContext();seedForm(ctx,selected(ctx));render()});
    ['regShares','regPrice','regPriceUnit','regCurrency','regFx','regFees'].forEach(id=>$(id)?.addEventListener('input',render));
    $('regConfirm')?.addEventListener('click',confirmExecution);$('regSettle')?.addEventListener('click',settleMission);$('regSaveConnection')?.addEventListener('click',saveConnection);$('regCheckConnection')?.addEventListener('click',checkConnection);
    window.addEventListener('aurora-clean:state',render);render();const ctx=routeContext();if(ctx)seedForm(ctx,selected(ctx));render();
    window.AuroraRegistrationEngine=Object.freeze({BUILD,routeContext,render,confirmExecution,settleMission});
  }
  function boot(){if(!window.AuroraClean||!window.AuroraData2Client){setTimeout(boot,50);return}bind()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();