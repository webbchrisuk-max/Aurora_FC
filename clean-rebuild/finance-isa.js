(() => {
  'use strict';

  const KEY='aurora-clean:isa-tracker-v1';
  const BUILD='20260924-finance-isa-2-roundup-sync';
  const SNAPSHOT={
    taxYear:'2026/27',
    annualAllowance:20000,
    monzoCash:753.04,
    monzoStocks:5200.00,
    trading212:9440.00,
    igCurrentNet:0.00,
    igFlexibleReplacement:50510.31,
    snapshotDate:'2026-09-24'
  };

  const ids={
    annualAllowance:'isaAnnualAllowance',
    monzoCash:'isaMonzoCash',
    monzoStocks:'isaMonzoStocks',
    trading212:'isaTrading212',
    igCurrentNet:'isaIgCurrentNet',
    igFlexibleReplacement:'isaIgFlexibleReplacement'
  };

  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(v)||0);
  const num=id=>Math.max(0,Number(document.getElementById(id)?.value)||0);
  const round2=v=>Number((Number(v)||0).toFixed(2));

  function readInputs(){
    return {
      taxYear:'2026/27',
      annualAllowance:num(ids.annualAllowance),
      monzoCash:num(ids.monzoCash),
      monzoStocks:num(ids.monzoStocks),
      trading212:num(ids.trading212),
      igCurrentNet:num(ids.igCurrentNet),
      igFlexibleReplacement:num(ids.igFlexibleReplacement)
    };
  }

  function writeInputs(v){
    Object.entries(ids).forEach(([key,id])=>{
      const el=document.getElementById(id);
      if(el) el.value=Number(v?.[key] ?? SNAPSHOT[key]).toFixed(2);
    });
  }

  function currentSaved(){
    try{
      const state=window.AuroraClean?.readState?.();
      const saved=state?.finance?.isaTracker;
      if(saved && saved.taxYear==='2026/27') return saved;
    }catch(_){}
    try{
      const local=JSON.parse(localStorage.getItem(KEY)||'null');
      if(local && local.taxYear==='2026/27') return local;
    }catch(_){}
    return SNAPSHOT;
  }

  function calculate(v){
    const used=round2(v.monzoCash+v.monzoStocks+v.trading212+v.igCurrentNet);
    const rawLeft=round2(v.annualAllowance-used);
    const normalLeft=Math.max(0,rawLeft);
    const exceeded=Math.max(0,-rawLeft);
    const igAdditionalMax=round2(normalLeft+v.igFlexibleReplacement);
    return {used,normalLeft,exceeded,igAdditionalMax};
  }

  function text(id,value){
    const el=document.getElementById(id);
    if(el) el.textContent=value;
  }

  function render(){
    const v=readInputs();
    const c=calculate(v);
    text('isaAnnualOut',money(v.annualAllowance));
    text('isaUsedOut',money(c.used));
    text('isaLeftOut',money(c.normalLeft));
    text('isaFlexibleOut',money(v.igFlexibleReplacement));
    text('isaIgMaxOut',money(c.igAdditionalMax));
    text('isaAnyGuard',money(c.normalLeft));
    text('isaFlexibleGuard',money(v.igFlexibleReplacement));
    text('isaIgGuard',money(c.igAdditionalMax));
    text('isaExceededOut',money(c.exceeded));

    const over=document.getElementById('isaOverGuard');
    if(over) over.hidden=c.exceeded===0;

    const badge=document.getElementById('isaStatusBadge');
    if(badge){
      badge.textContent=c.exceeded>0?'CHECK ALLOWANCE':(c.normalLeft===0?'NORMAL ALLOWANCE FULL':'ON TRACK');
      badge.classList.toggle('warn',c.exceeded>0);
    }
  }

  function save(){
    const v={...readInputs(),updatedAt:new Date().toISOString()};
    try{
      if(window.AuroraClean?.updateState){
        window.AuroraClean.updateState(state=>{
          state.finance=state.finance||{};
          state.finance.isaTracker=v;
        });
      }
    }catch(_){}
    try{localStorage.setItem(KEY,JSON.stringify(v));}catch(_){}
    render();
    const meta=document.getElementById('isaSavedAt');
    if(meta) meta.textContent='Saved: '+new Date(v.updatedAt).toLocaleString('en-GB');
  }

  function refreshFromState(){
    const saved=currentSaved();
    writeInputs(saved);
    render();
    const meta=document.getElementById('isaSavedAt');
    if(meta) meta.textContent=saved.updatedAt
      ? 'Updated: '+new Date(saved.updatedAt).toLocaleString('en-GB')
      : 'Snapshot: 24/09/2026';
  }

  function reset(){
    writeInputs(SNAPSHOT);
    try{localStorage.removeItem(KEY);}catch(_){}
    try{
      if(window.AuroraClean?.updateState){
        window.AuroraClean.updateState(state=>{
          state.finance=state.finance||{};
          state.finance.isaTracker={...SNAPSHOT,updatedAt:new Date().toISOString()};
        });
      }
    }catch(_){}
    render();
    const meta=document.getElementById('isaSavedAt');
    if(meta) meta.textContent='Snapshot restored: 24/09/2026';
  }

  function init(){
    if(!document.getElementById('isaAnnualAllowance')) return;
    const saved=currentSaved();
    writeInputs(saved);
    render();
    Object.values(ids).forEach(id=>document.getElementById(id)?.addEventListener('input',render));
    document.getElementById('isaSave')?.addEventListener('click',save);
    document.getElementById('isaReset')?.addEventListener('click',reset);
    const meta=document.getElementById('isaSavedAt');
    if(meta) meta.textContent=saved.updatedAt
      ? 'Saved: '+new Date(saved.updatedAt).toLocaleString('en-GB')
      : 'Snapshot: 24/09/2026';
    window.AuroraFinanceISA=Object.freeze({BUILD,SNAPSHOT,calculate,render,refreshFromState});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();