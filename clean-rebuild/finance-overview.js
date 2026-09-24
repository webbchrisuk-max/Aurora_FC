(() => {
  'use strict';

  const BUILD='20260924-finance-overview-1';
  const DEFAULTS=Object.freeze({
    monzoInvested:5138.78,
    monzoCurrent:5249.97,
    monzoPerformancePct:1.82,
    brokerCash:828.86,
    tescoCurrent:0,
    tescoMaturityEstimate:0,
    tescoMaturityDate:'2029-03-01',
    updatedAt:'2026-09-24T19:18:00.000Z'
  });

  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const n=v=>{const x=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(x)?Math.max(0,x):0};
  const round=v=>Number(n(v).toFixed(2));
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v));
  const pct=v=>`${Number(v||0).toFixed(2)}%`;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function potType(p){
    const t=String(p?.type||'').trim().toLowerCase();
    if(t)return t;
    const name=norm(p?.name);
    if(name.includes('investment'))return'investment';
    if(name.includes('emergency'))return'emergency';
    if(name.includes('house'))return'house_project';
    if(name.includes('isa'))return'fixed_isa';
    return'goal';
  }

  function ensureAssets(state){
    state.finance=state.finance||{};
    const current=state.finance.overviewAssets&&typeof state.finance.overviewAssets==='object'
      ? state.finance.overviewAssets
      : {};
    state.finance.overviewAssets={...DEFAULTS,...current};
    return state.finance.overviewAssets;
  }

  function readAssets(state){
    return {...DEFAULTS,...(state?.finance?.overviewAssets||{})};
  }

  function activePots(state){
    return arr(state?.finance?.pots).filter(p=>!p?.archived);
  }

  function emergencyPot(pots){
    return pots.find(p=>potType(p)==='emergency'||norm(p.name).includes('emergency'))||null;
  }

  function housePot(pots){
    return pots.find(p=>potType(p)==='house_project'||String(p.id||'')==='house_fund'||norm(p.name).includes('house'))||null;
  }

  function monzoInvestmentPot(pots){
    return pots.find(p=>{
      if(potType(p)!=='investment')return false;
      const provider=norm(p.accountProvider);
      const name=norm(p.name);
      return provider.includes('monzo')||name.includes('investment');
    })||null;
  }

  function portfolioMetrics(state){
    const rows=arr(state?.squad?.holdings).filter(h=>n(h.shares)>0);
    return rows.reduce((out,h)=>{
      out.market+=n(h.marketValueGbp);
      out.book+=n(h.bookCostGbp);
      out.income+=n(h.annualIncomeGbp);
      return out;
    },{market:0,book:0,income:0,count:rows.length});
  }

  function metrics(state){
    const pots=activePots(state);
    const assets=readAssets(state);
    const emergency=emergencyPot(pots);
    const house=housePot(pots);
    const monzoPot=monzoInvestmentPot(pots);
    const potTotal=round(pots.reduce((s,p)=>s+n(p.balance),0));
    const monzoBook=round(monzoPot?.balance||0);
    const potsForGrand=round(Math.max(0,potTotal-monzoBook));
    const portfolio=portfolioMetrics(state);
    const monzoGain=round(n(assets.monzoCurrent)-n(assets.monzoInvested));
    const grand=round(
      potsForGrand+
      n(assets.monzoCurrent)+
      portfolio.market+
      n(assets.brokerCash)+
      n(assets.tescoCurrent)
    );
    return {
      pots,assets,emergency,house,monzoPot,potTotal,monzoBook,potsForGrand,portfolio,monzoGain,grand
    };
  }

  function setText(id,value){const el=$(id);if(el)el.textContent=value}

  function renderPots(rows){
    const host=$('financeOverviewPotRows');if(!host)return;
    if(!rows.length){host.innerHTML='<p>No active pots saved.</p>';return}
    host.innerHTML=rows.map(p=>`<article class="finance-overview-row">
      <div><strong>${esc(p.name||'Pot')}</strong><small>${esc(potType(p).replace(/_/g,' '))}</small></div>
      <b>${money(p.balance)}</b>
    </article>`).join('');
  }

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const state=A.readState(),m=metrics(state);
    setText('financeOverviewGrand',money(m.grand));
    setText('financeOverviewPotsTotal',money(m.potTotal));
    setText('financeOverviewEmergency',money(m.emergency?.balance||0));
    setText('financeOverviewHouse',money(m.house?.balance||0));
    setText('financeOverviewMonzoCurrent',money(m.assets.monzoCurrent));
    setText('financeOverviewMonzoInvested',money(m.assets.monzoInvested));
    setText('financeOverviewMonzoGain',`${m.monzoGain>=0?'+':''}${money(m.monzoGain)} · ${pct(m.assets.monzoPerformancePct)}`);
    setText('financeOverviewShares',money(m.portfolio.market));
    setText('financeOverviewSharesBook',`${m.portfolio.count} positions · book ${money(m.portfolio.book)}`);
    setText('financeOverviewIncome',money(m.portfolio.income));
    setText('financeOverviewBrokerCash',money(m.assets.brokerCash));
    setText('financeOverviewTesco',n(m.assets.tescoCurrent)>0?money(m.assets.tescoCurrent):'Set value');
    setText('financeOverviewTescoForecast',n(m.assets.tescoMaturityEstimate)>0
      ? `Maturity estimate ${money(m.assets.tescoMaturityEstimate)} · ${String(m.assets.tescoMaturityDate||'').slice(0,10)}`
      : 'Current Tesco value not set yet');
    setText('financeOverviewDedupNote',m.monzoPot
      ? `Grand total uses the live Monzo Investments value instead of the ${money(m.monzoBook)} investment-pot book balance, so it is not counted twice.`
      : 'Grand total uses each tracked asset once.');
    const status=$('financeOverviewLiveStatus');
    if(status)status.textContent=m.portfolio.count
      ? `LIVE · ${m.portfolio.count} share positions loaded`
      : 'Share portfolio not loaded yet';
    renderPots(m.pots);
  }

  function ensureDialog(){
    let d=$('financeOverviewEditDialog');if(d)return d;
    d=document.createElement('dialog');
    d.id='financeOverviewEditDialog';
    d.className='finance-overview-dialog';
    d.innerHTML=`<form method="dialog" id="financeOverviewEditForm">
      <div class="finance-overview-dialog-head"><div><p>FINANCE OVERVIEW</p><h3>Edit external assets</h3></div><button type="button" data-finance-overview-close>×</button></div>
      <div class="finance-overview-form">
        <label>Monzo Investments · invested (£)<input id="financeOverviewEditMonzoInvested" type="number" min="0" step="0.01"></label>
        <label>Monzo Investments · current value (£)<input id="financeOverviewEditMonzoCurrent" type="number" min="0" step="0.01"></label>
        <label>Monzo performance (%)<input id="financeOverviewEditMonzoPct" type="number" step="0.01"></label>
        <label>Broker cash total (£)<input id="financeOverviewEditBrokerCash" type="number" min="0" step="0.01"></label>
        <label>Tesco current value (£)<input id="financeOverviewEditTesco" type="number" min="0" step="0.01"></label>
        <label>Tesco maturity estimate (£)<input id="financeOverviewEditTescoForecast" type="number" min="0" step="0.01"></label>
        <label>Tesco maturity date<input id="financeOverviewEditTescoDate" type="date"></label>
      </div>
      <div class="finance-overview-dialog-actions"><button type="button" data-finance-overview-cancel>Cancel</button><button type="submit" class="finance-primary">Save Finance Values</button></div>
    </form>`;
    document.body.appendChild(d);
    d.querySelector('[data-finance-overview-close]').addEventListener('click',()=>d.close());
    d.querySelector('[data-finance-overview-cancel]').addEventListener('click',()=>d.close());
    d.addEventListener('click',e=>{if(e.target===d)d.close()});
    return d;
  }

  function edit(){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return;
    const a=readAssets(A.readState()),d=ensureDialog();
    $('financeOverviewEditMonzoInvested').value=n(a.monzoInvested).toFixed(2);
    $('financeOverviewEditMonzoCurrent').value=n(a.monzoCurrent).toFixed(2);
    $('financeOverviewEditMonzoPct').value=Number(a.monzoPerformancePct||0).toFixed(2);
    $('financeOverviewEditBrokerCash').value=n(a.brokerCash).toFixed(2);
    $('financeOverviewEditTesco').value=n(a.tescoCurrent)?n(a.tescoCurrent).toFixed(2):'';
    $('financeOverviewEditTescoForecast').value=n(a.tescoMaturityEstimate)?n(a.tescoMaturityEstimate).toFixed(2):'';
    $('financeOverviewEditTescoDate').value=String(a.tescoMaturityDate||'').slice(0,10);
    $('financeOverviewEditForm').onsubmit=e=>{
      e.preventDefault();
      A.updateState(state=>{
        const x=ensureAssets(state);
        x.monzoInvested=round($('financeOverviewEditMonzoInvested').value);
        x.monzoCurrent=round($('financeOverviewEditMonzoCurrent').value);
        x.monzoPerformancePct=Number($('financeOverviewEditMonzoPct').value)||0;
        x.brokerCash=round($('financeOverviewEditBrokerCash').value);
        x.tescoCurrent=round($('financeOverviewEditTesco').value);
        x.tescoMaturityEstimate=round($('financeOverviewEditTescoForecast').value);
        x.tescoMaturityDate=String($('financeOverviewEditTescoDate').value||'').slice(0,10);
        x.updatedAt=new Date().toISOString();
      });
      d.close();
      render();
    };
    d.showModal();
  }

  async function refreshPortfolio(){
    const status=$('financeOverviewLiveStatus');
    try{
      if(status)status.textContent='Refreshing share portfolio…';
      const client=window.AuroraData2Client;
      if(!client?.get)throw new Error('Backend client unavailable');
      const result=await client.get('getSquadSnapshot',{});
      if(!result?.ok||!Array.isArray(result.holdings))throw new Error(result?.message||'Invalid squad snapshot');
      window.AuroraClean?.updateState?.(state=>{
        state.squad=state.squad&&typeof state.squad==='object'?state.squad:{};
        state.squad.holdings=result.holdings;
        state.squad.importedAt=result.generatedAt||new Date().toISOString();
        state.squad.source=result.source||'AURORADATA_BACKEND_SINGLE_AUTHORITY';
      });
      render();
    }catch(err){
      if(status)status.textContent='Using last saved share portfolio';
    }
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    const state=window.AuroraClean.readState();
    if(!state.finance?.overviewAssets){
      window.AuroraClean.updateState(next=>{ensureAssets(next)});
    }
    document.getElementById('financeOverviewEdit')?.addEventListener('click',edit);
    document.getElementById('financeOverviewRefresh')?.addEventListener('click',()=>refreshPortfolio());
    window.addEventListener('aurora-clean:state',render);
    window.addEventListener('pageshow',render);
    render();
    setTimeout(()=>refreshPortfolio(),250);
    window.AuroraFinanceOverview=Object.freeze({BUILD,DEFAULTS,metrics,render,refreshPortfolio});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();