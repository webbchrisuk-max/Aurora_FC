(() => {
  'use strict';

  const BUILD='20260901-chairman-actions-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const now=()=>new Date().toISOString();
  const accountCode=v=>{const s=upper(v);if(s.includes('212'))return'T212';if(s==='IG'||s.includes('IG ISA'))return'IG';return s};
  const keyFor=r=>String(r?.id||r?.offerId||`${accountCode(r?.account)}|${upper(r?.ticker)}`);

  function replacementOf(r){
    const x=r?.replacement&&typeof r.replacement==='object'?r.replacement:{};
    return {
      ticker:upper(x.ticker||r?.replacementTicker||r?.candidateTicker||''),
      name:x.name||r?.replacementName||r?.candidateName||'',
      account:x.account||r?.replacementAccount||r?.account||'',
      sector:x.sector||r?.replacementSector||'',
      price:num(x.price??x.livePriceGbp??r?.replacementPrice),
      yieldPct:num(x.yieldPct??x.dividendYield??r?.replacementYieldPct),
      expectedAnnualIncome:num(x.expectedAnnualIncome??x.annualIncomeGbp??r?.replacementAnnualIncomeGbp),
      incomeUpliftPct:num(x.incomeUpliftPct??r?.incomeUpliftPct),
      concentrationPct:num(x.concentrationPct??r?.replacementConcentrationPct)
    };
  }

  function holdingFor(review,state){
    return (state?.squad?.holdings||[]).find(h=>upper(h.ticker)===upper(review?.ticker)&&accountCode(h.account)===accountCode(review?.account)&&!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h.status||'ACTIVE')))||null;
  }

  function decisionFor(review,state){
    const key=keyFor(review);
    return (state?.transfer?.chairmanOffers||[]).find(o=>String(o.backendReviewKey||o.id||'')===key)||null;
  }

  function validate(review,state){
    const errors=[];
    const rep=replacementOf(review);
    const holding=holdingFor(review,state);
    if(!review?.executable)errors.push('Backend review is not executable.');
    if(!holding)errors.push('Current Squad holding was not found.');
    if(!rep.ticker)errors.push('Backend review has no replacement ticker.');
    if(accountCode(rep.account)!==accountCode(review?.account))errors.push('Replacement must stay in the same broker account.');
    if(!(rep.expectedAnnualIncome>0)&&!(rep.yieldPct>0))errors.push('Replacement income evidence is missing.');
    if(num(rep.incomeUpliftPct)>0&&num(rep.incomeUpliftPct)<8)errors.push('Replacement income uplift is below the +8% Chairman rule.');
    return {errors,rep,holding};
  }

  function accept(key){
    const A=window.AuroraClean,snap=window.AuroraChairmanSnapshot?.getSnapshot?.();
    if(!A||!snap)return;
    const review=(snap.reviews||[]).find(r=>keyFor(r)===key);if(!review)return;
    const state=A.readState(),existing=decisionFor(review,state);
    if(existing&&['ACCEPTED','EXECUTING','COMPLETE'].includes(upper(existing.status||existing.settlementStatus))){alert('This Chairman case is already accepted.');return;}
    const {errors,rep,holding}=validate(review,state);
    if(errors.length){alert(`This case cannot be accepted yet:\n\n${errors.join('\n')}`);return;}
    const saleShares=Math.max(0,num(review.shares)||num(holding.shares));
    const acceptedPrice=Math.max(0,num(review.livePriceGbp??review.price??holding.livePriceGbp));
    const marketValue=Math.max(0,num(review.marketValueGbp)||(saleShares*acceptedPrice));
    const offerId=`CHAIR-${accountCode(review.account)}-${upper(review.ticker)}-${Date.now()}`;
    const routeId=`CHAIR-ROUTE-${accountCode(review.account)}-${upper(review.ticker)}-${Date.now()}`;
    if(!confirm(`Accept Chairman case?\n\nSELL ${upper(review.ticker)} · ${review.account}\nReplacement ${rep.ticker} · ${rep.account}\nCapital return ${num(review.gainPct).toFixed(2)}%\nIncome uplift ${rep.incomeUpliftPct?rep.incomeUpliftPct.toFixed(2)+'%':'backend approved'}\n\nThis freezes the route for Registration. No broker trade is executed automatically.`))return;
    A.updateState(next=>{
      next.transfer=next.transfer&&typeof next.transfer==='object'?next.transfer:{};
      next.transfer.chairmanOffers=Array.isArray(next.transfer.chairmanOffers)?next.transfer.chairmanOffers:[];
      next.transfer.chairmanReplacementRoutes=Array.isArray(next.transfer.chairmanReplacementRoutes)?next.transfer.chairmanReplacementRoutes:[];
      const decision={id:offerId,backendReviewKey:key,status:'ACCEPTED',acceptedAt:now(),source:'BACKEND_CHAIRMAN_SNAPSHOT',ticker:upper(review.ticker),name:review.name||review.ticker,account:review.account,gainPct:num(review.gainPct),marketValueGbp:marketValue,annualIncomeGbp:num(review.annualIncomeGbp),replacement:rep,replacementVerdict:review.replacementStatus||'BACKEND_EXECUTABLE',settlementStatus:'READY_FOR_REGISTRATION'};
      const idx=next.transfer.chairmanOffers.findIndex(o=>String(o.backendReviewKey||o.id||'')===key);
      if(idx>=0)next.transfer.chairmanOffers[idx]=decision;else next.transfer.chairmanOffers.push(decision);
      next.transfer.chairmanReplacementRoutes.push({id:routeId,offerId,status:'READY_FOR_REGISTRATION',createdAt:now(),source:'BACKEND_CHAIRMAN_SNAPSHOT',locked:true,sale:{ticker:upper(review.ticker),name:review.name||review.ticker,account:review.account,shares:saleShares,acceptedPrice,marketValueGbp:marketValue,annualIncomeGbp:num(review.annualIncomeGbp),gainPct:num(review.gainPct)},replacement:{ticker:rep.ticker,name:rep.name||rep.ticker,account:rep.account,sector:rep.sector,price:rep.price,yieldPct:rep.yieldPct,expectedAnnualIncome:rep.expectedAnnualIncome,incomeUpliftPct:rep.incomeUpliftPct,concentrationPct:rep.concentrationPct}});
      next.transfer.activeChairmanReplacementRouteId=routeId;
      next.transfer.lastChairmanDecisionAt=now();
    });
    window.dispatchEvent(new CustomEvent('aurora:chairman-decision',{detail:{BUILD,key,decision:'ACCEPTED'}}));
    window.AuroraChairmanSnapshot?.render?.();
    alert('Chairman case accepted and frozen for Registration.');
  }

  function withdraw(key){
    const A=window.AuroraClean,snap=window.AuroraChairmanSnapshot?.getSnapshot?.();
    if(!A||!snap)return;
    const review=(snap.reviews||[]).find(r=>keyFor(r)===key);if(!review)return;
    const state=A.readState(),existing=decisionFor(review,state);
    if(existing&&['ACCEPTED','EXECUTING','COMPLETE'].includes(upper(existing.status||existing.settlementStatus))){alert('Accepted or executing Chairman cases must be completed through Registration.');return;}
    if(!confirm(`Withdraw Chairman review for ${upper(review.ticker)}?\n\nThis closes the current clean decision. It does not sell anything.`))return;
    A.updateState(next=>{
      next.transfer=next.transfer&&typeof next.transfer==='object'?next.transfer:{};
      next.transfer.chairmanOffers=Array.isArray(next.transfer.chairmanOffers)?next.transfer.chairmanOffers:[];
      const record={id:`CHAIR-WITHDRAWN-${Date.now()}`,backendReviewKey:key,status:'WITHDRAWN',withdrawnAt:now(),source:'BACKEND_CHAIRMAN_SNAPSHOT',ticker:upper(review.ticker),name:review.name||review.ticker,account:review.account,gainPct:num(review.gainPct),marketValueGbp:num(review.marketValueGbp),annualIncomeGbp:num(review.annualIncomeGbp)};
      const idx=next.transfer.chairmanOffers.findIndex(o=>String(o.backendReviewKey||o.id||'')===key);
      if(idx>=0)next.transfer.chairmanOffers[idx]=record;else next.transfer.chairmanOffers.push(record);
      next.transfer.lastChairmanDecisionAt=now();
    });
    window.dispatchEvent(new CustomEvent('aurora:chairman-decision',{detail:{BUILD,key,decision:'WITHDRAWN'}}));
    window.AuroraChairmanSnapshot?.render?.();
  }

  function onClick(e){
    const acceptBtn=e.target.closest('[data-chairman-accept]');if(acceptBtn){accept(acceptBtn.dataset.chairmanAccept);return;}
    const withdrawBtn=e.target.closest('[data-chairman-withdraw]');if(withdrawBtn)withdraw(withdrawBtn.dataset.chairmanWithdraw);
  }

  document.addEventListener('click',onClick);
  window.AuroraChairmanActions=Object.freeze({BUILD,accept,withdraw,keyFor,replacementOf,validate});
})();
