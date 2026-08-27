(() => {
  'use strict';

  const BUILD='20260827-clean-squad-pnl-colours-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const price=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:4}).format(num(v));
  const pct=v=>`${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;
  const pnlColour=v=>num(v)>0?'#5df29a':num(v)<0?'#ff6b7a':'#9aa9ba';
  const closed=new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  let refreshing=false;

  function active(row){return !closed.has(upper(row?.status||'ACTIVE'))&&num(row?.shares)>0}
  function metrics(row){
    const shares=Math.max(0,num(row?.shares));
    const book=Math.max(0,num(row?.bookCostGbp));
    const live=Math.max(0,num(row?.livePriceGbp??row?.priceGbp));
    const market=Math.max(0,num(row?.marketValueGbp)||(shares*live));
    const pnl=market-book;
    const pnlPct=book>0?pnl/book*100:0;
    const annual=Math.max(0,num(row?.annualIncomeGbp)||(shares*Math.max(0,num(row?.annualDpsGbp))));
    return{shares,book,live,market,pnl,pnlPct,annual};
  }

  function render(){
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState();
    const rows=(state.squad?.holdings||[]).filter(active).map(row=>({row,m:metrics(row)})).sort((a,b)=>b.m.market-a.m.market||b.m.annual-a.m.annual||String(a.row.ticker||'').localeCompare(String(b.row.ticker||'')));
    const totalBook=rows.reduce((s,x)=>s+x.m.book,0);
    const totalMarket=rows.reduce((s,x)=>s+x.m.market,0);
    const totalPnl=totalMarket-totalBook;
    const totalPnlPct=totalBook>0?totalPnl/totalBook*100:0;
    const totalIncome=rows.reduce((s,x)=>s+x.m.annual,0);
    const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
    set('squadCount',`${rows.length} account position(s)`);
    set('squadMarketValue',money(totalMarket));
    set('squadBookValue',money(totalBook));
    set('squadProfitLoss',`${totalPnl>=0?'+':''}${money(totalPnl)}`);
    set('squadProfitLossPct',pct(totalPnlPct));
    const totalColour=pnlColour(totalPnl);
    if($('squadProfitLoss'))$('squadProfitLoss').style.color=totalColour;
    if($('squadProfitLossPct'))$('squadProfitLossPct').style.color=totalColour;
    set('squadAnnualIncome',money(totalIncome));
    set('squadMonthlyIncome',money(totalIncome/12));
    set('squadSource',state.squad?.importedAt?`Market holdings refreshed ${new Date(state.squad.importedAt).toLocaleString('en-GB')} · ${state.squad.source||'Aurora live state'}`:'Waiting for live holdings refresh');
    const host=$('squadRows');
    if(host)host.innerHTML=rows.length?rows.map(({row,m})=>`<li class="holding-card"><div class="holding-head"><div><span class="holding-ticker">${esc(row.ticker)}</span><strong class="holding-name">${esc(row.name||row.ticker)}</strong></div><span class="holding-broker">${esc(row.account||'Unspecified')}</span></div><div class="holding-metrics"><div class="holding-metric"><span>SHARES</span><strong>${m.shares.toLocaleString('en-GB',{maximumFractionDigits:6})}</strong></div><div class="holding-metric"><span>LIVE PRICE</span><strong>${m.live>0?price(m.live):'—'}</strong></div><div class="holding-metric"><span>MARKET VALUE</span><strong>${money(m.market)}</strong></div><div class="holding-metric"><span>BOOK VALUE</span><strong>${money(m.book)}</strong></div><div class="holding-metric"><span>PROFIT / LOSS</span><strong style="color:${pnlColour(m.pnl)}">${m.pnl>=0?'+':''}${money(m.pnl)} · ${pct(m.pnlPct)}</strong></div><div class="holding-metric"><span>ANNUAL INCOME</span><strong>${money(m.annual)}</strong></div></div></li>`).join(''):'<li>No active holdings yet.</li>';
  }

  async function refreshLive(reason='manual'){
    if(refreshing)return;refreshing=true;
    const btn=$('squadImportReal');if(btn){btn.disabled=true;btn.textContent='Refreshing…'}
    try{
      const authority=window.AuroraMarketPriceAuthority||window.AuroraSquadLivePriceAuthority;
      if(authority?.refresh)await authority.refresh(reason);
      const result=window.AuroraClean?.importRealHoldings?.();
      const status=$('squadImportStatus');
      if(status)status.textContent=result?.ok?`${result.message} Live prices, market value and P/L refreshed.`:(result?.message||'Live holdings refresh unavailable.');
      render();
    }catch(error){const status=$('squadImportStatus');if(status)status.textContent=`Live holdings refresh failed: ${String(error?.message||error)}`}
    finally{refreshing=false;if(btn){btn.disabled=false;btn.textContent='Refresh Live Holdings'}}
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    const btn=$('squadImportReal');
    if(btn&&!btn.dataset.squadRefreshBound){btn.dataset.squadRefreshBound='true';btn.addEventListener('click',()=>refreshLive('manual'));}
    window.addEventListener('aurora-clean:state',render);
    window.addEventListener('aurora:market-prices',render);
    render();
    setTimeout(()=>refreshLive('squad-startup'),250);
    window.AuroraCleanSquad=Object.freeze({BUILD,render,refreshLive,metrics});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();