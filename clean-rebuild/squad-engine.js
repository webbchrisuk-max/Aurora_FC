(() => {
  'use strict';

  const BUILD='20260827-clean-squad-table-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const price=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:4}).format(num(v));
  const pct=v=>`${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;
  const pnlColour=v=>num(v)>0?'#5df29a':num(v)<0?'#ff6b7a':'#9aa9ba';
  const pnlClass=v=>num(v)>0?'squad-table-profit':num(v)<0?'squad-table-loss':'squad-table-flat';
  const closed=new Set(['SOLD','ARCHIVED','CLOSED','EXITED']);
  let refreshing=false;

  function active(row){return !closed.has(upper(row?.status||'ACTIVE'))&&num(row?.shares)>0}
  function key(row){return `${upper(row?.account)}|${upper(row?.ticker)}`}
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
    if(host){
      const body=rows.map(({row,m},i)=>{
        const weight=totalMarket>0?m.market/totalMarket*100:0;
        const role=i<11?'MATCHDAY XI':'BENCH';
        return `<tr tabindex="0" data-player-key="${esc(key(row))}" aria-label="Open ${esc(row.ticker)} player report"><td class="squad-table-rank">${i+1}</td><td class="squad-table-name"><strong>${esc(upper(row.ticker))}</strong><small>${esc(row.name||row.ticker)}</small></td><td><span class="squad-table-role">${role}</span></td><td><span class="squad-table-broker">${esc(row.account||'Unspecified')}</span></td><td>${m.shares.toLocaleString('en-GB',{maximumFractionDigits:6})}</td><td>${m.live>0?price(m.live):'—'}</td><td>${money(m.market)}</td><td>${money(m.book)}</td><td class="${pnlClass(m.pnl)}">${m.pnl>=0?'+':''}${money(m.pnl)}</td><td class="${pnlClass(m.pnl)}">${pct(m.pnlPct)}</td><td>${money(m.annual)}/yr</td><td>${weight.toFixed(1)}%</td><td><span class="squad-table-open">REPORT →</span></td></tr>`;
      }).join('');
      host.innerHTML=rows.length?`<div class="squad-table-wrap"><table class="squad-table"><thead><tr><th>#</th><th>HOLDING</th><th>ROLE</th><th>BROKER</th><th>SHARES</th><th>LIVE PRICE</th><th>MARKET VALUE</th><th>BOOK COST</th><th>P/L</th><th>P/L %</th><th>ANNUAL INCOME</th><th>WEIGHT</th><th></th></tr></thead><tbody>${body}</tbody></table></div><div class="squad-table-foot"><span>Matchday XI = largest 11 positions by market value.</span><span>Tap any row for the full Aurora Player Report.</span></div>`:'<div class="squad-table-wrap"><div style="padding:18px">No active holdings yet.</div></div>';
      host.querySelectorAll('[data-player-key]').forEach(row=>{
        const open=()=>window.AuroraSquadMatchday?.openDrawer?.(row.dataset.playerKey);
        row.addEventListener('click',open);
        row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
      });
    }
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