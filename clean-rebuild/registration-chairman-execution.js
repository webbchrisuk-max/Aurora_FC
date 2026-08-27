(() => {
  'use strict';

  const BUILD='20260827-registration-chairman-execution-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const round=v=>Number(num(v).toFixed(2));
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const now=()=>new Date().toISOString();
  const accountCode=v=>{const s=upper(v);if(s.includes('212'))return'T212';if(s==='IG'||s.includes('IG ISA'))return'IG';return''};
  const activeStatus=s=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(s||'ACTIVE'));

  function routes(state){return Array.isArray(state.transfer?.chairmanReplacementRoutes)?state.transfer.chairmanReplacementRoutes:[]}
  function currentRoute(state){const id=state.transfer?.activeChairmanReplacementRouteId;return routes(state).find(r=>r.id===id)||routes(state).find(r=>['READY_FOR_REGISTRATION','EXECUTING'].includes(upper(r.status)))||null}
  function receipts(state,routeId){return (Array.isArray(state.registration?.chairmanReceipts)?state.registration.chairmanReceipts:[]).filter(r=>r.routeId===routeId)}
  function receipt(state,routeId,side){return receipts(state,routeId).find(r=>upper(r.side)===upper(side))||null}

  function ensureUi(){
    let host=$('chairmanExecutionDesk');if(host)return host;
    const handoff=$('chairmanRegistrationHandoff');if(!handoff)return null;
    host=document.createElement('section');host.id='chairmanExecutionDesk';host.className='department-section';handoff.insertAdjacentElement('afterend',host);return host;
  }

  function saleActual(){const shares=Math.max(0,num($('chairSellShares')?.value)),price=Math.max(0,num($('chairSellPrice')?.value)),fees=Math.max(0,num($('chairSellFees')?.value));return{shares,price,fees,tradeDate:String($('chairSellDate')?.value||''),gross:round(shares*price),net:round((shares*price)-fees)}}
  function buyActual(){const shares=Math.max(0,num($('chairBuyShares')?.value)),price=Math.max(0,num($('chairBuyPrice')?.value)),fees=Math.max(0,num($('chairBuyFees')?.value));return{shares,price,fees,tradeDate:String($('chairBuyDate')?.value||''),gross:round(shares*price),total:round((shares*price)+fees)}}

  function seedForm(route,state){
    const saleRec=receipt(state,route.id,'SELL'),buyRec=receipt(state,route.id,'BUY');
    if($('chairSellTicker'))$('chairSellTicker').value=route.sale?.ticker||'';
    if($('chairSellAccount'))$('chairSellAccount').value=route.sale?.account||'';
    if($('chairSellShares')&&!$('chairSellShares').value)$('chairSellShares').value=String(saleRec?.shares??route.sale?.shares??'');
    if($('chairSellPrice')&&!$('chairSellPrice').value)$('chairSellPrice').value=String(saleRec?.price??route.sale?.acceptedPrice??'');
    if($('chairSellFees')&&!$('chairSellFees').value)$('chairSellFees').value=String(saleRec?.fees??0);
    if($('chairSellDate')&&!$('chairSellDate').value)$('chairSellDate').value=saleRec?.tradeDate||today();
    if($('chairBuyTicker'))$('chairBuyTicker').value=route.replacement?.ticker||'';
    if($('chairBuyAccount'))$('chairBuyAccount').value=route.replacement?.account||route.sale?.account||'';
    if($('chairBuyShares')&&!$('chairBuyShares').value&&buyRec)$('chairBuyShares').value=String(buyRec.shares||'');
    if($('chairBuyPrice')&&!$('chairBuyPrice').value&&buyRec)$('chairBuyPrice').value=String(buyRec.price||'');
    if($('chairBuyFees')&&!$('chairBuyFees').value)$('chairBuyFees').value=String(buyRec?.fees??0);
    if($('chairBuyDate')&&!$('chairBuyDate').value)$('chairBuyDate').value=buyRec?.tradeDate||today();
  }

  function validationSale(route,a){const e=[];if(!a.tradeDate)e.push('Sale trade date is required.');if(!(a.shares>0))e.push('Shares sold must be greater than zero.');if(a.shares>num(route.sale?.shares)+0.000001)e.push('Shares sold exceed the accepted Chairman route.');if(!(a.price>0))e.push('Sale execution price must be greater than zero.');if(!(a.net>0))e.push('Net sale proceeds must be greater than zero.');return e}
  function validationBuy(route,a,saleRec){const e=[];if(!saleRec)e.push('Confirm the sale execution first.');if(!a.tradeDate)e.push('Replacement trade date is required.');if(!(a.shares>0))e.push('Replacement shares bought must be greater than zero.');if(!(a.price>0))e.push('Replacement execution price must be greater than zero.');if(!(a.total>0))e.push('Replacement total cost must be greater than zero.');if(saleRec&&a.total>num(saleRec.netProceeds)+0.005)e.push(`Replacement cost ${money(a.total)} exceeds net sale proceeds ${money(saleRec.netProceeds)}.`);if(accountCode(route.replacement?.account)!==accountCode(route.sale?.account))e.push('Chairman replacement must remain in the same broker account.');return e}

  function confirmSale(){const A=window.AuroraClean;if(!A)return;const state=A.readState(),route=currentRoute(state);if(!route)return;const a=saleActual(),errors=validationSale(route,a);if(errors.length){alert(errors.join('\n'));return}if(!confirm(`Confirm real sale execution?\n\n${route.sale.ticker} · ${route.sale.account}\n${a.shares} shares @ ${money(a.price)}\nFees ${money(a.fees)}\nNet proceeds ${money(a.net)}\n\nSquad will not change until the replacement buy is also confirmed and you settle the route.`))return;
    A.updateState(next=>{next.registration=next.registration||{};next.registration.chairmanReceipts=Array.isArray(next.registration.chairmanReceipts)?next.registration.chairmanReceipts:[];if(next.registration.chairmanReceipts.some(r=>r.routeId===route.id&&upper(r.side)==='SELL'))return;next.registration.chairmanReceipts.push({id:`CHAIR-SELL-${route.id}`,routeId:route.id,offerId:route.offerId,side:'SELL',account:route.sale.account,ticker:route.sale.ticker,shares:a.shares,price:a.price,fees:a.fees,grossProceeds:a.gross,netProceeds:a.net,tradeDate:a.tradeDate,confirmedAt:now(),source:'BROKER_REALITY_MANUAL_CONFIRMATION'});const r=routes(next).find(x=>x.id===route.id);if(r)r.status='EXECUTING'});render()}

  function confirmBuy(){const A=window.AuroraClean;if(!A)return;const state=A.readState(),route=currentRoute(state);if(!route)return;const saleRec=receipt(state,route.id,'SELL'),a=buyActual(),errors=validationBuy(route,a,saleRec);if(errors.length){alert(errors.join('\n'));return}if(!confirm(`Confirm real replacement purchase?\n\n${route.replacement.ticker} · ${route.replacement.account}\n${a.shares} shares @ ${money(a.price)}\nFees ${money(a.fees)}\nTotal cost ${money(a.total)}\n\nThis remains frozen until you settle the completed Chairman route.`))return;
    A.updateState(next=>{next.registration=next.registration||{};next.registration.chairmanReceipts=Array.isArray(next.registration.chairmanReceipts)?next.registration.chairmanReceipts:[];if(next.registration.chairmanReceipts.some(r=>r.routeId===route.id&&upper(r.side)==='BUY'))return;next.registration.chairmanReceipts.push({id:`CHAIR-BUY-${route.id}`,routeId:route.id,offerId:route.offerId,side:'BUY',account:route.replacement.account,ticker:route.replacement.ticker,shares:a.shares,price:a.price,fees:a.fees,totalCostGbp:a.total,tradeDate:a.tradeDate,expectedAnnualIncomeGbp:num(route.replacement.expectedAnnualIncome),yieldPct:num(route.replacement.yieldPct),confirmedAt:now(),source:'BROKER_REALITY_MANUAL_CONFIRMATION'});const r=routes(next).find(x=>x.id===route.id);if(r)r.status='READY_TO_SETTLE'});render()}

  function settle(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),route=currentRoute(state);if(!route)return;const saleRec=receipt(state,route.id,'SELL'),buyRec=receipt(state,route.id,'BUY');if(!saleRec||!buyRec){alert('Both Chairman broker executions must be confirmed before settlement.');return}if(!confirm(`Settle Chairman route into Squad?\n\nSELL ${saleRec.ticker}: ${saleRec.shares} shares\nBUY ${buyRec.ticker}: ${buyRec.shares} shares\nNet sale proceeds: ${money(saleRec.netProceeds)}\nReplacement cost: ${money(buyRec.totalCostGbp)}\n\nThis will update clean Squad holdings and the forward income run-rate.`))return;
    A.updateState(next=>{
      const holdings=Array.isArray(next.squad?.holdings)?next.squad.holdings:[];
      const sell=holdings.find(h=>activeStatus(h.status)&&upper(h.ticker)===upper(saleRec.ticker)&&accountCode(h.account)===accountCode(saleRec.account));
      if(!sell)throw new Error('Sale holding was not found in Squad.');
      const oldShares=Math.max(0,num(sell.shares));if(saleRec.shares>oldShares+0.000001)throw new Error('Confirmed sale exceeds current Squad shares.');
      const soldRatio=oldShares>0?Math.min(1,saleRec.shares/oldShares):1;
      const remainingShares=Math.max(0,oldShares-saleRec.shares);
      const oldBook=Math.max(0,num(sell.bookCostGbp));const oldIncome=Math.max(0,num(sell.annualIncomeGbp));
      sell.shares=Number(remainingShares.toFixed(6));sell.bookCostGbp=round(oldBook*(1-soldRatio));sell.annualIncomeGbp=round(oldIncome*(1-soldRatio));sell.avgCostGbp=remainingShares>0?round(sell.bookCostGbp/remainingShares):0;sell.marketValueGbp=round(remainingShares*num(sell.livePriceGbp));sell.updatedAt=now();if(remainingShares<=0.000001){sell.shares=0;sell.status='SOLD';sell.closedAt=now();sell.marketValueGbp=0;sell.annualIncomeGbp=0}

      let buy=holdings.find(h=>activeStatus(h.status)&&upper(h.ticker)===upper(buyRec.ticker)&&accountCode(h.account)===accountCode(buyRec.account));
      const annualDps=buyRec.price>0?buyRec.price*(num(route.replacement.yieldPct)/100):0;const addedIncome=round(buyRec.shares*annualDps);
      if(buy){const prevShares=Math.max(0,num(buy.shares)),prevBook=Math.max(0,num(buy.bookCostGbp)),newShares=prevShares+buyRec.shares,newBook=prevBook+num(buyRec.totalCostGbp);buy.shares=Number(newShares.toFixed(6));buy.bookCostGbp=round(newBook);buy.avgCostGbp=newShares>0?round(newBook/newShares):0;buy.livePriceGbp=buyRec.price;buy.marketValueGbp=round(newShares*buyRec.price);buy.annualDpsGbp=num(buy.annualDpsGbp)>0?num(buy.annualDpsGbp):annualDps;buy.annualIncomeGbp=round(num(buy.annualIncomeGbp)+addedIncome);buy.status='ACTIVE';buy.updatedAt=now()}
      else{buy={holdingId:`CHAIRMAN-${accountCode(buyRec.account)}-${upper(buyRec.ticker)}`,account:buyRec.account,ticker:upper(buyRec.ticker),name:route.replacement.name||buyRec.ticker,shares:Number(buyRec.shares.toFixed(6)),bookCostGbp:round(buyRec.totalCostGbp),avgCostGbp:round(buyRec.totalCostGbp/buyRec.shares),livePriceGbp:buyRec.price,marketValueGbp:round(buyRec.shares*buyRec.price),annualDpsGbp:annualDps,annualIncomeGbp:addedIncome,sector:route.replacement.sector||'',role:'CHAIRMAN_REPLACEMENT',status:'ACTIVE',source:'CHAIRMAN_SETTLEMENT',updatedAt:now()};holdings.push(buy)}
      next.squad=next.squad||{};next.squad.holdings=holdings;next.squad.importedAt=now();next.squad.source='CLEAN_CHAIRMAN_SETTLEMENT';
      next.income=next.income||{};next.income.lastRecalculatedAt=now();next.income.lastChairmanUpliftGbp=round(addedIncome-(oldIncome*soldRatio));
      const r=routes(next).find(x=>x.id===route.id);if(r){r.status='COMPLETE';r.settledAt=now();r.actual={saleNetProceeds:round(saleRec.netProceeds),replacementCost:round(buyRec.totalCostGbp),cashRemainder:round(saleRec.netProceeds-buyRec.totalCostGbp),incomeRemoved:round(oldIncome*soldRatio),incomeAdded:addedIncome,incomeUplift:round(addedIncome-(oldIncome*soldRatio))}}
      const offer=(next.transfer?.chairmanOffers||[]).find(o=>o.id===route.offerId);if(offer){offer.settlementStatus='COMPLETE';offer.settledAt=now();offer.actualIncomeUpliftGbp=round(addedIncome-(oldIncome*soldRatio))}
      next.transfer.activeChairmanReplacementRouteId=null;
      (next.registration.chairmanReceipts||[]).forEach(rec=>{if(rec.routeId===route.id)rec.settledAt=now()});
    });
    alert('Chairman route settled into Squad. Income now reflects the replacement holding.');render();
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;const host=ensureUi();if(!host)return;const state=A.readState(),route=currentRoute(state);if(!route){host.hidden=true;host.innerHTML='';return}host.hidden=false;const saleRec=receipt(state,route.id,'SELL'),buyRec=receipt(state,route.id,'BUY');
    host.innerHTML=`<div class="section-heading"><div><p class="eyebrow">CHAIRMAN BROKER REALITY</p><h2>Confirm sale + replacement purchase</h2></div><span class="stage-badge">${esc(route.status||'READY')}</span></div><p>The route is frozen to ${esc(route.sale?.account||'the source broker')}. Enter the actual broker executions. Squad and Income do not change until both receipts are confirmed and the route is settled.</p><h3>1 · Confirm sale</h3><div class="finance-form-grid"><label>Ticker<input id="chairSellTicker" readonly></label><label>Broker<input id="chairSellAccount" readonly></label><label>Shares sold<input id="chairSellShares" type="number" min="0" step="0.000001" inputmode="decimal" ${saleRec?'readonly':''}></label><label>Execution price £<input id="chairSellPrice" type="number" min="0" step="0.0001" inputmode="decimal" ${saleRec?'readonly':''}></label><label>Fees £<input id="chairSellFees" type="number" min="0" step="0.01" inputmode="decimal" ${saleRec?'readonly':''}></label><label>Trade date<input id="chairSellDate" type="date" ${saleRec?'disabled':''}></label></div><div class="finance-result-grid"><article class="finance-result-card"><span>NET SALE PROCEEDS</span><strong id="chairSaleNet">${saleRec?money(saleRec.netProceeds):'£0.00'}</strong><small>Gross sale less fees</small></article></div><div class="finance-actions"><button id="chairConfirmSell" class="finance-primary" type="button" ${saleRec?'disabled':''}>${saleRec?'Sale Confirmed ✓':'Confirm Sale Execution'}</button></div><h3>2 · Confirm replacement buy</h3><div class="finance-form-grid"><label>Ticker<input id="chairBuyTicker" readonly></label><label>Broker<input id="chairBuyAccount" readonly></label><label>Shares bought<input id="chairBuyShares" type="number" min="0" step="0.000001" inputmode="decimal" ${buyRec?'readonly':''}></label><label>Execution price £<input id="chairBuyPrice" type="number" min="0" step="0.0001" inputmode="decimal" ${buyRec?'readonly':''}></label><label>Fees £<input id="chairBuyFees" type="number" min="0" step="0.01" inputmode="decimal" ${buyRec?'readonly':''}></label><label>Trade date<input id="chairBuyDate" type="date" ${buyRec?'disabled':''}></label></div><div class="finance-result-grid"><article class="finance-result-card"><span>AVAILABLE FROM SALE</span><strong>${saleRec?money(saleRec.netProceeds):'WAITING FOR SALE'}</strong><small>Replacement spend cannot exceed actual net proceeds</small></article><article class="finance-result-card"><span>ACTUAL BUY COST</span><strong id="chairBuyCost">${buyRec?money(buyRec.totalCostGbp):'£0.00'}</strong><small>Shares × price + fees</small></article></div><div class="finance-actions"><button id="chairConfirmBuy" class="finance-primary" type="button" ${!saleRec||buyRec?'disabled':''}>${buyRec?'Replacement Confirmed ✓':'Confirm Replacement Purchase'}</button></div><h3>3 · Settle into Squad + Income</h3><div class="finance-actions"><button id="chairSettleRoute" class="finance-primary" type="button" ${!saleRec||!buyRec?'disabled':''}>Settle Chairman Route</button></div><p>${saleRec&&buyRec?'Both broker executions are frozen. Settlement will now update the clean Squad holding quantities/costs and therefore the Income Centre run-rate.':'Waiting for both broker executions.'}</p>`;
    seedForm(route,state);
    $('chairConfirmSell')?.addEventListener('click',confirmSale);$('chairConfirmBuy')?.addEventListener('click',confirmBuy);$('chairSettleRoute')?.addEventListener('click',settle);
    const recalc=()=>{const s=saleActual(),b=buyActual();if($('chairSaleNet')&&!saleRec)$('chairSaleNet').textContent=money(Math.max(0,s.net));if($('chairBuyCost')&&!buyRec)$('chairBuyCost').textContent=money(Math.max(0,b.total))};
    ['chairSellShares','chairSellPrice','chairSellFees','chairBuyShares','chairBuyPrice','chairBuyFees'].forEach(id=>$(id)?.addEventListener('input',recalc));recalc();
  }

  function boot(){if(!window.AuroraClean){setTimeout(boot,60);return}render();window.addEventListener('aurora-clean:state',render);window.AuroraRegistrationChairmanExecution=Object.freeze({BUILD,render,confirmSale,confirmBuy,settle})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();