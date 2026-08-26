(() => {
  'use strict';

  const BUILD='20260826-clean-finance-stage1-owner-1';
  const MIGRATION_KEY='aurora-clean:finance:protected-cash-migration:v1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));

  function render(){
    const A=window.AuroraClean;if(!A)return;
    const f=A.readState().finance||{};
    const values={financeExpectedWages:f.expectedWages,financeWagesReceived:f.wagesReceived,financeAvailable:f.availableCash,financeProtected:f.protectedCash};
    Object.entries(values).forEach(([id,value])=>{const el=$(id);if(el&&document.activeElement!==el)el.value=round(value).toFixed(2)});
  }

  function migrateProtectedCash(){
    const A=window.AuroraClean;if(!A)return;
    let done=false;try{done=localStorage.getItem(MIGRATION_KEY)==='done'}catch(_){}
    if(done)return;
    const state=A.readState();
    if(round(state.finance?.protectedCash)<=0){
      A.updateState(next=>{
        next.finance.protectedCash=300;
        next.finance.stage5PaydayDecision=null;
        next.finance.lastSafeRelease=null;
        next.finance.protectedCashRecoveredAt=new Date().toISOString();
      });
    }
    try{localStorage.setItem(MIGRATION_KEY,'done')}catch(_){}
  }

  function commitCashTruth(){
    const A=window.AuroraClean;if(!A)return;
    const raw={
      expected:String($('financeExpectedWages')?.value??'').trim(),
      received:String($('financeWagesReceived')?.value??'').trim(),
      available:String($('financeAvailable')?.value??'').trim(),
      protected:String($('financeProtected')?.value??'').trim()
    };
    if(Object.values(raw).some(v=>v==='')){alert('Complete all four Stage 1 cash fields before updating Cash Truth.');return}
    const expected=round(raw.expected),received=round(raw.received),available=round(raw.available),protectedCash=round(raw.protected);
    A.updateState(state=>{
      const wagesChanged=Math.abs(num(state.finance.expectedWages)-expected)>.004||Math.abs(num(state.finance.wagesReceived)-received)>.004;
      state.finance.expectedWages=expected;
      state.finance.wagesReceived=received;
      state.finance.availableCash=available;
      state.finance.protectedCash=protectedCash;
      state.finance.cashTruthUpdatedAt=new Date().toISOString();
      if(wagesChanged)state.finance.stage4PotFunding=null;
      state.finance.stage5PaydayDecision=null;
      state.finance.lastSafeRelease=null;
    });
    render();
  }

  function useActualPay(){
    const received=$('financeWagesReceived'),available=$('financeAvailable');
    if(received&&available)available.value=round(received.value).toFixed(2);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,50);return}
    migrateProtectedCash();
    $('financeCalculate')?.addEventListener('click',commitCashTruth);
    $('financeUseActualPay')?.addEventListener('click',useActualPay);
    window.addEventListener('aurora-clean:state',render);
    render();
    window.AuroraFinanceStage1=Object.freeze({BUILD,commitCashTruth,render});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();