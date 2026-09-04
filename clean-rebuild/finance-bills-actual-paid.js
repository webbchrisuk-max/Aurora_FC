(()=>{
'use strict';
const BUILD='20260904-finance-bills-actual-paid-3-disabled';

function boot(){
  window.AuroraFinanceBillsActualPaid=Object.freeze({
    BUILD,
    authority:'finance-bills-monthly.js / data-paid-bill',
    status:'disabled-duplicate-interceptor'
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
