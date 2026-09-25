(() => {
  'use strict';

  const BUILD='20260925-transfer-broker-assign-6-scouting-route-lock';
  const upper=v=>String(v||'').trim().toUpperCase();
  const brokerCode=row=>{
    const a=upper(row?.lockedAccount||row?.account||row?.broker||row?.preferredBroker||row?.platform);
    if(a.includes('212'))return'T212';
    if(a.includes('IG'))return'IG';
    return'';
  };
  const financeRows=state=>Array.isArray(state?.transfer?.route?.allocations)?state.transfer.route.allocations:[];
  function executionSpec(row,account){
    const underlying=window.AuroraClean?.canonicalScoutingTicker?.(row?.underlyingTicker||row?.ticker)||upper(row?.underlyingTicker||row?.ticker);
    if(underlying==='FMG'&&account==='IG')return{underlyingTicker:'FMG',executionTicker:'FMG',executionMarket:'ASX',executionCurrency:'AUD',securityName:'Fortescue Ltd'};
    if(underlying==='FMG'&&account==='T212')return{underlyingTicker:'FMG',executionTicker:'FVJ',executionMarket:'GETTEX',executionCurrency:'EUR',securityName:'Fortescue'};
    return{underlyingTicker:underlying,executionTicker:upper(row?.ticker),executionMarket:'',executionCurrency:''};
  }

  function assign(legId,ticker,account){
    const A=window.AuroraClean;
    if(!A?.updateState||!['IG','T212'].includes(account))return false;
    let changed=false;
    A.updateState(state=>{
      const route=state.transfer?.route;
      if(!route||route.locked)return;
      const rows=Array.isArray(route.allocations)?route.allocations:[];
      const row=rows.find(r=>(legId&&String(r.legId||'')===String(legId))||(!legId&&upper(r.ticker)===upper(ticker)));
      if(!row||brokerCode(row)===account)return;
      const fixedBroker=row.brokerLocked===true?brokerCode(row):'';
      if(fixedBroker&&fixedBroker!==account)return;
      row.lockedAccount=account;
      row.account=account;
      Object.assign(row,executionSpec(row,account));
      row.brokerAssignedAt=new Date().toISOString();
      changed=true;
    });
    if(changed){
      setTimeout(()=>{
        window.AuroraTransferStage2?.rebuildBrokerCash?.();
        window.AuroraTransferStage2?.render?.();
        window.AuroraTransferIntelligence?.render?.();
        render();
      },0);
    }
    return changed;
  }

  function buttons(row){
    if(!row)return'';
    const leg=String(row.legId||''),ticker=upper(row.ticker),current=brokerCode(row),fixed=row.brokerLocked===true;
    const btn=(code,label)=>`<button type="button" data-assign-broker="${code}" data-leg-id="${leg}" data-ticker="${ticker}" class="${current===code?'is-selected':''}" aria-pressed="${current===code?'true':'false'}" ${current===code||fixed?'disabled':''}>${label}${current===code?' ✓':''}</button>`;
    if(fixed&&current)return `<div class="transfer-broker-assign" data-broker-controls="${leg||ticker}" data-selected-broker="${current}"><span>Scouting route locked</span>${btn(current,current==='IG'?'IG ISA':'Trading 212 ISA')}</div>`;
    return `<div class="transfer-broker-assign" data-broker-controls="${leg||ticker}" data-selected-broker="${current}"><span>${current?'Broker':'Assign broker'}</span>${btn('IG','IG ISA')}${btn('T212','Trading 212 ISA')}</div>`;
  }

  function upsert(host,row){
    if(!host||!row)return;
    const key=String(row.legId||upper(row.ticker)),current=brokerCode(row);
    const existing=[...host.querySelectorAll('.transfer-broker-assign')].find(el=>String(el.dataset.brokerControls||'')===key);
    if(existing&&String(existing.dataset.selectedBroker||'')===current)return;
    const html=buttons(row);
    if(existing)existing.outerHTML=html;else host.insertAdjacentHTML('beforeend',html);
  }

  function injectPreview(state){
    const route=state.transfer?.route;if(!route||route.locked)return;
    const finance=financeRows(state);
    document.querySelectorAll('.transfer-deploy-list .transfer-deploy-row').forEach((el,index)=>{
      if(index>=finance.length)return;
      upsert(el,finance[index]);
    });
  }

  function injectShortlist(state){
    const route=state.transfer?.route;if(!route||route.locked)return;
    const finance=financeRows(state);
    document.querySelectorAll('.transfer-shortlist .transfer-short-row').forEach((el,index)=>{
      const text=upper(el.querySelector('.transfer-short-name strong')?.textContent?.split('·')[0]);
      const row=finance[index]||finance.find(r=>upper(r.ticker)===text);
      if(!row)return;
      upsert(el.querySelector('.transfer-short-meta')||el,row);
    });
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const state=A.readState();injectPreview(state);injectShortlist(state);
  }

  function scheduleRender(){
    clearTimeout(scheduleRender.timer);
    scheduleRender.timer=setTimeout(render,0);
  }

  function onClick(event){
    const btn=event.target.closest('[data-assign-broker]');if(!btn)return;
    event.preventDefault();
    assign(btn.dataset.legId||'',btn.dataset.ticker||'',upper(btn.dataset.assignBroker));
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    document.addEventListener('click',onClick);
    window.addEventListener('aurora-clean:state',scheduleRender);
    window.addEventListener('aurora:market-prices',scheduleRender);
    window.addEventListener('pageshow',scheduleRender);
    render();
    setTimeout(render,0);
    setTimeout(render,100);
    window.AuroraTransferBrokerAssign=Object.freeze({BUILD,render,assign,executionSpec});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();