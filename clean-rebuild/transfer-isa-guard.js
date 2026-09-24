(() => {
  'use strict';
  const BUILD='20260924-transfer-isa-guard-1';
  const KEY='aurora-clean:transfer-isa-guard:v1';
  const ISA_KEY='aurora-clean:isa-tracker-v1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};

  function settings(){const s=read(KEY)||{};return{useIgFlex:!!s.useIgFlex}}
  function isa(state){
    const v=state?.finance?.isaTracker||read(ISA_KEY)||{};
    const annual=num(v.annualAllowance)||20000;
    const used=num(v.monzoCash)+num(v.monzoStocks)+num(v.trading212)+num(v.igCurrentNet);
    return{annual,used,normalLeft:Math.max(0,annual-used),flex:num(v.igFlexibleReplacement)};
  }
  function plan(state){
    const route=state?.transfer?.route;
    if(route?.locked)return route;
    return window.AuroraTransferStage2?.fundedPlan?.(state)||route||null;
  }
  function check(state){
    const p=plan(state),i=isa(state),s=settings(),tp=p?.transferPlan||{};
    const ig=num(tp.IG),t212=num(tp.T212),fresh=ig+t212;
    let normal=i.normalLeft;
    const normalT212=Math.min(t212,normal);normal-=normalT212;
    const t212Uncovered=Math.max(0,t212-normalT212);
    const normalIg=Math.min(ig,normal);normal-=normalIg;
    const igExcess=Math.max(0,ig-normalIg);
    const flexCover=s.useIgFlex?Math.min(i.flex,igExcess):0;
    const uncovered=t212Uncovered+Math.max(0,igExcess-flexCover);
    return{...i,...s,ig,t212,fresh,igExcess,t212Uncovered,flexCover,uncovered,ok:uncovered<0.005,locked:!!p?.locked};
  }
  function ensure(){
    let host=$('transferIsaGuard');if(host)return host;
    const target=$('transferStage2Mission')?.closest('.department-section')||document.querySelector('.transfer-split .department-section');
    if(!target)return null;
    host=document.createElement('div');host.id='transferIsaGuard';host.className='transfer-isa-guard';
    const status=$('transferStage2Mission')?.parentElement;
    if(status)status.insertAdjacentElement('beforebegin',host);else target.appendChild(host);
    return host;
  }
  function render(){
    const A=window.AuroraClean,host=ensure();if(!A||!host)return;
    const state=A.readState(),c=check(state);
    const tone=c.ok?'good':'bad';
    let detail='No fresh ISA transfer is currently planned.';
    if(c.fresh>0&&c.ok)detail=money(c.fresh)+' fresh transfer fits the selected ISA capacity.';
    if(c.fresh>0&&!c.ok)detail=money(c.uncovered)+' of the planned fresh transfer has no valid ISA capacity under the current guard.';
    host.innerHTML='<div class="transfer-isa-guard-head"><div><span>ISA TRANSFER GUARD</span><strong class="'+tone+'">'+(c.ok?'ROUTE WITHIN ISA CAPACITY':'CHECK ISA CAPACITY')+'</strong><small>'+detail+'</small></div><div><span>NORMAL 2026/27 LEFT</span><strong>'+money(c.normalLeft)+'</strong><small>Planned: IG '+money(c.ig)+' · T212 '+money(c.t212)+'</small></div></div><label><input id="transferUseIgFlex" type="checkbox" '+(c.useIgFlex?'checked':'')+'> Use valid IG flexible replacement capacity for IG transfers only ('+money(c.flex)+')</label>'+(c.igExcess>0?'<p>IG amount above normal allowance: <b>'+money(c.igExcess)+'</b> · flex cover selected: <b>'+money(c.flexCover)+'</b>.</p>':'')+(c.t212Uncovered>0?'<p class="warn">Trading 212 requires <b>'+money(c.t212Uncovered)+'</b> more normal ISA allowance; IG flexible replacement cannot cover T212.</p>':'');
    $('transferUseIgFlex')?.addEventListener('change',e=>{write(KEY,{useIgFlex:!!e.target.checked});render();setTimeout(enforce,0)});
    enforce(c);
  }
  function enforce(existing){
    const A=window.AuroraClean;if(!A?.readState)return;
    const c=existing||check(A.readState()),btn=$('transferStage2Lock');
    if(!btn||c.locked)return;
    btn.dataset.isaGuardOk=c.ok?'1':'0';
    if(!c.ok)btn.disabled=true;
  }
  function intercept(e){
    const btn=e.target.closest?.('#transferStage2Lock');if(!btn)return;
    const A=window.AuroraClean;if(!A?.readState)return;
    const c=check(A.readState());
    if(c.ok)return;
    e.preventDefault();e.stopImmediatePropagation();
    alert('Transfer route not locked. '+money(c.uncovered)+' of the planned fresh ISA transfer is outside the ISA capacity currently selected.');
  }
  let timer=null;
  function schedule(){clearTimeout(timer);timer=setTimeout(render,60)}
  function boot(){
    if(!window.AuroraClean||!window.AuroraTransferStage2){setTimeout(boot,60);return}
    document.addEventListener('click',intercept,true);
    window.addEventListener('aurora-clean:state',schedule);
    window.addEventListener('pageshow',schedule);
    schedule();
    window.AuroraTransferIsaGuard=Object.freeze({BUILD,check,render});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();