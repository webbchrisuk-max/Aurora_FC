(() => {
  'use strict';

  const BUILD='20260910-transfer-broker-assign-1';
  const upper=v=>String(v||'').trim().toUpperCase();
  const brokerCode=row=>{
    const a=upper(row?.lockedAccount||row?.account||row?.broker||row?.preferredBroker||row?.platform);
    if(a.includes('212'))return'T212';
    if(a.includes('IG'))return'IG';
    return'';
  };
  const financeRows=state=>Array.isArray(state?.transfer?.route?.allocations)?state.transfer.route.allocations:[];

  function assign(legId,ticker,account){
    const A=window.AuroraClean;
    if(!A?.updateState||!['IG','T212'].includes(account))return false;
    let changed=false;
    A.updateState(state=>{
      const route=state.transfer?.route;
      if(!route||route.locked)return;
      const rows=Array.isArray(route.allocations)?route.allocations:[];
      const row=rows.find(r=>(legId&&String(r.legId||'')===String(legId))||(!legId&&upper(r.ticker)===upper(ticker)));
      if(!row)return;
      row.lockedAccount=account;
      row.account=account;
      row.brokerAssignedAt=new Date().toISOString();
      changed=true;
    });
    return changed;
  }

  function buttons(row){
    if(!row||brokerCode(row))return'';
    const leg=String(row.legId||'');
    const ticker=upper(row.ticker);
    return `<div class="transfer-broker-assign" data-broker-controls="${leg||ticker}"><span>Assign broker</span><button type="button" data-assign-broker="IG" data-leg-id="${leg}" data-ticker="${ticker}">IG ISA</button><button type="button" data-assign-broker="T212" data-leg-id="${leg}" data-ticker="${ticker}">Trading 212 ISA</button></div>`;
  }

  function injectPreview(state){
    const route=state.transfer?.route;
    if(!route||route.locked)return;
    const finance=financeRows(state);
    document.querySelectorAll('.transfer-deploy-list .transfer-deploy-row').forEach((el,index)=>{
      if(index>=finance.length)return;
      const row=finance[index];
      if(brokerCode(row)||el.querySelector('.transfer-broker-assign'))return;
      const html=buttons(row);if(html)el.insertAdjacentHTML('beforeend',html);
    });
  }

  function injectShortlist(state){
    const route=state.transfer?.route;
    if(!route||route.locked)return;
    const finance=financeRows(state);
    document.querySelectorAll('.transfer-shortlist .transfer-short-row').forEach((el,index)=>{
      const row=finance[index]||finance.find(r=>upper(r.ticker)===upper(el.querySelector('.transfer-short-name strong')?.textContent?.split('·')[0]));
      if(!row||brokerCode(row)||el.querySelector('.transfer-broker-assign'))return;
      const host=el.querySelector('.transfer-short-meta')||el;
      const html=buttons(row);if(html)host.insertAdjacentHTML('beforeend',html);
    });
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const state=A.readState();
    injectPreview(state);
    injectShortlist(state);
  }

  function onClick(event){
    const btn=event.target.closest('[data-assign-broker]');
    if(!btn)return;
    event.preventDefault();
    const account=upper(btn.dataset.assignBroker);
    if(assign(btn.dataset.legId||'',btn.dataset.ticker||'',account))setTimeout(render,0);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    document.addEventListener('click',onClick);
    const observer=new MutationObserver(()=>render());
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('aurora-clean:state',()=>setTimeout(render,0));
    window.addEventListener('pageshow',render);
    render();
    window.AuroraTransferBrokerAssign=Object.freeze({BUILD,render,assign});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
