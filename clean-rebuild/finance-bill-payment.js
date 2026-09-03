(() => {
  'use strict';

  const BUILD='20260903-finance-bill-payment-2-single-authority';

  function removeDuplicateControls(){
    document.querySelectorAll('[data-pay-bill]').forEach(btn=>btn.remove());
  }

  function boot(){
    removeDuplicateControls();

    const observer=new MutationObserver(()=>removeDuplicateControls());
    observer.observe(document.documentElement,{childList:true,subtree:true});

    window.addEventListener('pageshow',removeDuplicateControls);
    window.addEventListener('aurora-clean:state',()=>setTimeout(removeDuplicateControls,0));

    window.AuroraFinanceBillPayment=Object.freeze({
      BUILD,
      removeDuplicateControls,
      authority:'finance-bills-actual-paid.js / data-paid-bill'
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
