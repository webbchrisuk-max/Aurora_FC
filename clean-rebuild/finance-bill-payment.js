(() => {
  'use strict';

  const BUILD='20260903-finance-bill-payment-1';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));
  const norm=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

  function addMonths(dateString,months){
    const d=new Date(`${String(dateString||today()).slice(0,10)}T12:00:00`);
    if(Number.isNaN(d.getTime()))return '';
    const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+months);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function addDays(dateString,days){
    const d=new Date(`${String(dateString||today()).slice(0,10)}T12:00:00`);
    if(Number.isNaN(d.getTime()))return '';
    d.setDate(d.getDate()+days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function nextDue(dateString,frequency){
    const f=norm(frequency);
    const base=String(dateString||today()).slice(0,10);
    if(f==='weekly')return addDays(base,7);
    if(f==='4 weeks'||f==='4 week'||f==='4-weeks')return addDays(base,28);
    if(f==='5 weeks'||f==='5 week'||f==='5-weeks')return addDays(base,35);
    if(f==='monthly')return addMonths(base,1);
    if(f==='yearly'||f==='annual'||f==='annually')return addMonths(base,12);
    return '';
  }

  function holdingPot(finance){
    return arr(finance?.pots).find(p=>!p?.archived&&norm(p?.name)==='holding pot')||null;
  }

  function invalidate(finance){
    finance.stage2Bills=null;
    finance.stage3HoldingPot=null;
    finance.stage4PotFunding=null;
    finance.stage5PaydayDecision=null;
    finance.lastSafeRelease=0;
    finance.lastManagerChangeAt=new Date().toISOString();
    finance.lastManagerChangeReason='Bill payment recorded';
  }

  function recalc(){
    const E=window.AuroraFinanceEngine;
    if(!E)return;
    try{E.commitBills();E.commitHolding();E.commitPots();E.commitDecision()}catch(err){console.warn('Aurora bill payment recalc failed',err)}
  }

  function paymentHistory(finance){
    finance.billPaymentHistory=arr(finance.billPaymentHistory);
    return finance.billPaymentHistory;
  }

  function paymentSignature(bill,amount){
    return [String(bill?.id||''),String(bill?.due||'NO_DUE').slice(0,10),round(amount)].join('|');
  }

  function hasPayment(finance,signature){
    return paymentHistory(finance).some(x=>String(x?.signature||'')===signature);
  }

  function applyPayment(id){
    const A=window.AuroraClean;
    if(!A?.readState||!A?.updateState)return;
    const state=A.readState();
    const bill=arr(state.finance?.bills).find(b=>String(b?.id||'')===String(id));
    if(!bill)return;

    const entered=prompt(`Actual amount paid for ${bill.name}`,round(bill.amount).toFixed(2));
    if(entered===null)return;
    const amount=round(entered);
    if(!(amount>0)){alert('Enter an amount greater than £0.');return}

    const signature=paymentSignature(bill,amount);
    if(hasPayment(state.finance,signature)){
      alert('Aurora has already recorded this bill payment.');
      return;
    }

    const source=norm(bill.fundingSource||'Holding Pot');
    if(source==='holding pot'){
      const pot=holdingPot(state.finance);
      const available=round(pot?pot.balance:state.finance?.holdingPotBalance);
      if(amount>available+0.009){
        alert(`Holding Pot only has ${money(available)}. This payment was not applied.`);
        return;
      }
    }

    const oldDue=String(bill.due||'').slice(0,10);
    const frequency=String(bill.frequency||'one-off');
    const recurring=norm(frequency)!=='one off'&&norm(frequency)!=='one-off'&&norm(frequency)!=='once';
    const newDue=recurring?nextDue(oldDue||today(),frequency):'';
    const paidAt=new Date().toISOString();

    A.updateState(s=>{
      const finance=s.finance;
      const b=arr(finance.bills).find(x=>String(x?.id||'')===String(id));
      if(!b)return;
      const sig=paymentSignature(b,amount);
      if(hasPayment(finance,sig))return;

      if(norm(b.fundingSource||'Holding Pot')==='holding pot'){
        const pot=holdingPot(finance);
        const current=round(pot?pot.balance:finance.holdingPotBalance);
        const after=round(Math.max(0,current-amount));
        finance.holdingPotBalance=after;
        if(pot)pot.balance=after;
      }

      paymentHistory(finance).push({
        id:`BILLPAY-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        signature:sig,
        billId:String(b.id||''),
        billName:String(b.name||'Bill'),
        amount,
        fundingSource:String(b.fundingSource||'Holding Pot'),
        due:oldDue,
        paidAt,
        nextDue:newDue
      });

      b.lastPaidAt=paidAt;
      b.lastPaidAmount=amount;
      b.lastPaidDue=oldDue;
      if(recurring){b.due=newDue;b.paid=false}else{b.paid=true;b.paidDate=today()}
      invalidate(finance);
    });

    setTimeout(()=>{recalc();injectButtons()},0);
    alert(source==='holding pot'
      ? `${bill.name} paid. ${money(amount)} has been deducted from the Holding Pot${newDue?` and the next due date is ${newDue}`:''}.`
      : `${bill.name} paid. ${money(amount)} recorded from ${bill.fundingSource||'Current Account'}${newDue?` and the next due date is ${newDue}`:''}.`);
  }

  function injectButtons(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const finance=A.readState().finance||{};
    arr(finance.bills).filter(b=>!b?.archived).forEach(b=>{
      const edit=document.querySelector(`[data-edit-bill="${CSS.escape(String(b.id||''))}"]`);
      const actions=edit?.parentElement;if(!actions||actions.querySelector(`[data-pay-bill="${CSS.escape(String(b.id||''))}"]`))return;
      const btn=document.createElement('button');
      btn.type='button';btn.dataset.payBill=String(b.id||'');
      const lastSig=paymentSignature(b,num(b.lastPaidAmount||b.amount));
      const already=b.paid&&hasPayment(finance,lastSig);
      btn.textContent=already?'Paid':(b.paid?'Apply Payment':'Mark Paid');
      if(already)btn.disabled=true;
      actions.insertBefore(btn,edit||actions.firstChild);
    });
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,80);return}
    injectButtons();
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-pay-bill]');if(!btn)return;
      e.preventDefault();applyPayment(btn.dataset.payBill);
    });
    window.addEventListener('aurora-clean:state',()=>setTimeout(injectButtons,0));
    window.addEventListener('pageshow',injectButtons);
    window.AuroraFinanceBillPayment=Object.freeze({BUILD,applyPayment,injectButtons,recalc});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
