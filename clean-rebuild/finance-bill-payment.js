(() => {
  'use strict';

  const BUILD='20260904-finance-bill-payment-4-direct-button-handler';
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isHolding=v=>norm(v)==='holding pot';
  const recurring=f=>['weekly','4-weeks','5-weeks','monthly','yearly'].includes(String(f||'').toLowerCase());

  function parseDate(v){
    if(!v)return null;
    const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime())?null:d;
  }

  function iso(d){
    if(!d||Number.isNaN(d.getTime()))return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function nextDue(value,frequency){
    const f=String(frequency||'one-off').toLowerCase();
    const d=parseDate(value)||new Date();
    d.setHours(12,0,0,0);
    if(f==='weekly')d.setDate(d.getDate()+7);
    else if(f==='4-weeks')d.setDate(d.getDate()+28);
    else if(f==='5-weeks')d.setDate(d.getDate()+35);
    else if(f==='monthly'){
      const day=d.getDate();
      d.setDate(1);d.setMonth(d.getMonth()+1);
      d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
    }else if(f==='yearly'){
      const day=d.getDate(),month=d.getMonth();
      d.setFullYear(d.getFullYear()+1);
      if(d.getMonth()!==month)d.setDate(0);else d.setDate(day);
    }else return '';
    return iso(d);
  }

  function ensureStyles(){
    if(document.getElementById('financeBillPaymentStyles'))return;
    const style=document.createElement('style');
    style.id='financeBillPaymentStyles';
    style.textContent=`
      .bill-pay-fresh{background:#176b43!important;border-color:#2a9b65!important;color:#effff7!important;font-weight:900!important}
      .bill-pay-fresh:hover{background:#1e7f50!important}
      .bill-pay-fresh:disabled{opacity:.55;cursor:wait}
    `;
    document.head.appendChild(style);
  }

  function recalcAll(){
    const E=window.AuroraFinanceEngine;
    if(!E)return;
    try{E.commitBills();}catch(_){}
    try{E.commitHolding();}catch(_){}
    try{E.commitPots();}catch(_){}
    try{E.commitDecision();}catch(_){}
  }

  function payBill(id,button){
    const A=window.AuroraClean;
    if(!A?.readState||!A?.updateState){
      alert('Aurora Finance is not ready yet. Refresh the page and try again.');
      return;
    }

    const state=A.readState();
    const bill=arr(state.finance?.bills).find(b=>String(b.id)===String(id));
    if(!bill){
      alert('This bill could not be found. Refresh the page and try again.');
      return;
    }

    const expected=round(bill.amount);
    const raw=prompt(`Actual amount paid for ${bill.name||'this bill'}`,expected.toFixed(2));
    if(raw===null)return;
    const actual=round(raw);
    if(!(actual>0)){
      alert('Enter the actual amount paid.');
      return;
    }

    const fundingSource=String(bill.fundingSource||'Holding Pot');
    const frequency=String(bill.frequency||'one-off').toLowerCase();
    const previousDue=String(bill.due||'').slice(0,10);
    const paidAt=new Date().toISOString();

    if(button){
      button.disabled=true;
      button.textContent='Saving…';
    }

    try{
      A.updateState(next=>{
        next.finance=next.finance||{};
        next.finance.bills=arr(next.finance.bills);
        next.finance.pots=arr(next.finance.pots);

        const index=next.finance.bills.findIndex(b=>String(b.id)===String(id));
        if(index<0)throw new Error('Bill disappeared before payment could be saved.');
        const b=next.finance.bills[index];

        let holdingBefore=null;
        let holdingAfter=null;

        if(isHolding(fundingSource)){
          const holdingPot=next.finance.pots.find(p=>!p?.archived&&isHolding(p?.name));
          holdingBefore=round(holdingPot?.balance ?? next.finance.holdingPotBalance);
          if(actual>holdingBefore){
            throw new Error(`Holding Pot only has £${holdingBefore.toFixed(2)} available.`);
          }
          holdingAfter=round(holdingBefore-actual);
          next.finance.holdingPotBalance=holdingAfter;
          if(holdingPot)holdingPot.balance=holdingAfter;
          next.finance.lastHoldingPotSpendAt=paidAt;
          next.finance.lastHoldingPotSpendAmount=actual;
          next.finance.lastHoldingPotSpendBillId=String(b.id);
        }

        next.finance.billPayments=arr(next.finance.billPayments);
        next.finance.billPayments.push({
          id:`BILLPAY-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          billId:String(b.id),
          name:String(b.name||'Bill'),
          amount:actual,
          expectedAmount:expected,
          variance:round(actual-expected),
          frequency,
          fundingSource,
          due:previousDue,
          paidAt,
          source:'FINANCE_BILL_PAYMENT_DIRECT_V2',
          holdingBalanceBefore:holdingBefore,
          holdingBalanceAfter:holdingAfter
        });

        if(recurring(frequency)){
          b.lastPaidAt=paidAt;
          b.lastPaidAmount=actual;
          b.lastPaidDue=previousDue;
          b.due=nextDue(previousDue,frequency);
          b.paid=false;
        }else{
          next.finance.bills.splice(index,1);
        }

        next.finance.stage2Bills=null;
        next.finance.stage3HoldingPot=null;
        next.finance.stage4PotFunding=null;
        next.finance.stage5PaydayDecision=null;
        next.finance.lastSafeRelease=0;
        next.finance.lastManagerChangeAt=paidAt;
        next.finance.lastManagerChangeReason=`Bill paid: ${b.name}`;
      });

      recalcAll();
      window.AuroraFinanceBillsMonthly?.render?.();
    }catch(err){
      if(button){button.disabled=false;button.textContent='✓ Mark as Paid';}
      alert(String(err&&err.message?err.message:err));
    }
  }

  function injectButtons(){
    ensureStyles();
    document.querySelectorAll('[data-bill-card]').forEach(card=>{
      const id=String(card.getAttribute('data-bill-card')||'').trim();
      if(!id)return;
      const actions=card.querySelector('.finance-manage-actions');
      if(!actions)return;

      let button=actions.querySelector('[data-bill-pay-fresh]');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='bill-pay-fresh';
        button.setAttribute('data-bill-pay-fresh',id);
        button.textContent='✓ Mark as Paid';
        actions.prepend(button);
      }

      if(button.dataset.billPayBound==='1')return;
      button.dataset.billPayBound='1';
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        payBill(id,button);
      });
    });
  }

  function boot(){
    injectButtons();
    window.addEventListener('aurora-finance:bills-rendered',injectButtons);
    window.addEventListener('pageshow',()=>setTimeout(injectButtons,0));
    window.addEventListener('aurora-clean:state',()=>setTimeout(injectButtons,0));
    window.AuroraFinanceBillPayment=Object.freeze({BUILD,injectButtons,payBill});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
