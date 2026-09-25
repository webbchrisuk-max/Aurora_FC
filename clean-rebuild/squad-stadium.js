(() => {
  'use strict';

  const BUILD='20260925-squad-stadium-1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const price=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:4}).format(num(v));
  const pct=v=>`${num(v)>=0?'+':'−'}${Math.abs(num(v)).toFixed(2)}%`;
  const signedMoney=v=>`${num(v)>=0?'+':'−'}£${Math.abs(num(v)).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const active=s=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(s||'ACTIVE'));

  const slots=[
    {pos:'ST',top:16,left:50},{pos:'LW',top:31,left:20},{pos:'RW',top:31,left:80},
    {pos:'LCM',top:50,left:25},{pos:'CM',top:53,left:50},{pos:'RCM',top:50,left:75},
    {pos:'LB',top:73,left:16},{pos:'LCB',top:77,left:38},{pos:'RCB',top:77,left:62},{pos:'RB',top:73,left:84},{pos:'GK',top:91,left:50}
  ];

  let showFull=false,sortMode='matchday',selectedKey='',renderTimer=null;

  function rowKey(r){return `${upper(r?.account)}|${upper(r?.ticker)}`}
  function holding(row){
    const shares=Math.max(0,num(row?.shares));
    const book=Math.max(0,num(row?.bookCostGbp));
    const live=Math.max(0,num(row?.livePriceGbp??row?.priceGbp));
    const market=Math.max(0,num(row?.marketValueGbp)||(shares*live));
    const annual=Math.max(0,num(row?.annualIncomeGbp)||(shares*Math.max(0,num(row?.annualDpsGbp))));
    const pnl=market-book,pnlPct=book>0?pnl/book*100:0;
    const dailyRaw=row?.dailyChangePct??row?.dayChangePct;
    const daily=(dailyRaw===undefined||dailyRaw===null||String(dailyRaw).trim()==='')?null:num(dailyRaw);
    return{row,shares,book,live,market,annual,pnl,pnlPct,daily,weight:0};
  }
  function rows(state){
    const list=(state.squad?.holdings||[]).filter(r=>active(r.status)&&num(r.shares)>0).map(holding).sort((a,b)=>b.market-a.market||b.annual-a.annual||upper(a.row.ticker).localeCompare(upper(b.row.ticker)));
    const total=list.reduce((s,x)=>s+x.market,0);
    list.forEach(x=>x.weight=total>0?x.market/total*100:0);
    return list;
  }
  function metrics(list){
    const market=list.reduce((s,x)=>s+x.market,0),book=list.reduce((s,x)=>s+x.book,0),annual=list.reduce((s,x)=>s+x.annual,0),pnl=market-book,pnlPct=book>0?pnl/book*100:0;
    const first=list.slice(0,11),captain=list[0]||null;
    const topEarner=[...list].sort((a,b)=>b.annual-a.annual)[0]||null;
    const inForm=[...first].sort((a,b)=>b.pnlPct-a.pnlPct)[0]||null;
    const recovery=[...list].sort((a,b)=>a.pnlPct-b.pnlPct)[0]||null;
    const brokers=[...new Set(list.map(x=>String(x.row.account||'Unspecified')).filter(Boolean))];
    const sectors=new Map();
    list.forEach(x=>{const s=String(x.row.sector||'Unclassified');sectors.set(s,(sectors.get(s)||0)+x.market)});
    const sectorRows=[...sectors.entries()].sort((a,b)=>b[1]-a[1]);
    return{market,book,annual,monthly:annual/12,pnl,pnlPct,first,captain,topEarner,inForm,recovery,brokers,sectorRows,largestSector:sectorRows[0]||['Unclassified',0]};
  }
  function setText(id,value){const el=$(id);if(el)el.textContent=value}
  function pnlClass(v){return num(v)>0?'sq-green':num(v)<0?'sq-red':'sq-muted'}
  function sourceLabel(row){
    const src=String(row?.priceSource||row?.source||'').replace(/_/g,' ');
    return src||'Aurora backend';
  }
  function sourceTime(row){
    const raw=row?.priceUpdatedAt||row?.brokerPriceObservedAt||row?.lastPriceReconciledAt||row?.sourceUpdatedAt||row?.updatedAt;
    const d=new Date(raw||'');
    return Number.isFinite(d.getTime())?d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'time unavailable';
  }
  function nextDividend(state,x){
    const list=Array.isArray(state.income?.dividends)?state.income.dividends:[];
    const d=list.filter(r=>upper(r.ticker)===upper(x.row.ticker)&&!['PAID','ARCHIVED','CANCELLED','CANCELED'].includes(upper(r.status))).sort((a,b)=>String(a.payDate||a.paymentDate||'').localeCompare(String(b.payDate||b.paymentDate||'')))[0];
    if(!d)return'No dated clean dividend evidence';
    const date=d.payDate||d.paymentDate||d.pay_date||'Date pending',amt=num(d.expectedAmountGbp??d.expected_amount_gbp);
    return `${date}${amt>0?` · ${money(amt)}`:''}`;
  }
  function chairmanStatus(state,x){
    const offers=Array.isArray(state.transfer?.chairmanOffers)?state.transfer.chairmanOffers:[];
    const o=offers.find(o=>upper(o.ticker)===upper(x.row.ticker)&&upper(o.account)===upper(x.row.account)&&!['WITHDRAWN','EXPIRED'].includes(upper(o.status)));
    if(!o)return{label:'NO ACTIVE CASE',detail:'No open Chairman review for this holding.'};
    const rep=o.replacement||{};
    return{label:upper(o.status||'WATCHING'),detail:rep.ticker?`Replacement ${upper(rep.ticker)} · ${num(rep.incomeUpliftPct).toFixed(1)}% income uplift`:(o.replacementVerdict||'No qualified replacement currently.')};
  }

  function renderSummary(list,m,state){
    setText('squadStadiumPnl',`${signedMoney(m.pnl)} · ${pct(m.pnlPct)}`);
    setText('squadStadiumMarket',money(m.market));
    setText('squadStadiumBook',money(m.book));
    setText('squadStadiumAnnual',money(m.annual));
    setText('squadStadiumMonthly',money(m.monthly));
    setText('squadStadiumCount',`Across ${list.length} active account position${list.length===1?'':'s'} · live squad authority`);
    setText('squadStadiumYield',`${m.market>0?(m.annual/m.market*100).toFixed(2):'0.00'}% forward yield on market value`);
    const imported=state.squad?.importedAt;
    setText('squadStadiumSource',list.length?`${state.squad?.source||'Aurora backend'}${imported?` · refreshed ${new Date(imported).toLocaleString('en-GB')}`:''}`:'Waiting for Aurora backend squad snapshot…');

    const cards=[
      ['Captain',m.captain,'Largest holding by market value',m.captain?`${money(m.captain.market)} · ${m.captain.weight.toFixed(1)}% squad weight`:'—'],
      ['Top Earner',m.topEarner,'Highest annual dividend income',m.topEarner?`${money(m.topEarner.annual)} / yr · ${m.topEarner.row.account||''}`:'—'],
      ['In-Form Player',m.inForm,'Best P/L % within the Matchday XI',m.inForm?`${pct(m.inForm.pnlPct)} · ${signedMoney(m.inForm.pnl)}`:'—'],
      ['Recovery Watch',m.recovery,'Weakest current P/L %',m.recovery?`${pct(m.recovery.pnlPct)} · ${signedMoney(m.recovery.pnl)}`:'—']
    ];
    cards.forEach(([label,x,sub,detail],i)=>{
      setText(['squadCaptainTicker','squadTopEarnerTicker','squadInFormTicker','squadRecoveryTicker'][i],x?upper(x.row.ticker):'—');
      setText(['squadCaptainDetail','squadTopEarnerDetail','squadInFormDetail','squadRecoveryDetail'][i],detail);
      const button=$(['squadCaptainCard','squadTopEarnerCard','squadInFormCard','squadRecoveryCard'][i]);
      if(button){button.onclick=()=>x&&openPlayer(rowKey(x.row));button.setAttribute('aria-label',`${label}: ${x?x.row.ticker:'unavailable'}`)}
    });

    setText('squadReportForm',pct(m.pnlPct));
    const form=$('squadReportForm');if(form){form.className=m.pnl>=0?'sq-green':'sq-red'}
    setText('squadReportIncome',money(m.annual));
    setText('squadReportIncomeSub',`${m.market>0?(m.annual/m.market*100).toFixed(2):'0.00'}% current yield`);
    setText('squadReportConcentration',m.captain?`${m.captain.weight.toFixed(1)}%`:'0.0%');
    setText('squadReportBrokers',String(m.brokers.length));
    setText('squadReportBrokersSub',m.brokers.join(' + ')||'No brokers');
    setText('squadReportSectors',String(m.sectorRows.length));
    setText('squadReportSectorsSub','Tracked sectors');

    const [sectorName,sectorValue]=m.largestSector;
    const sectorPct=m.market>0?sectorValue/m.market*100:0;
    $('squadTrainingAlerts').innerHTML=[
      `<div class="squad-stadium-alert"><strong>⚠ Concentration Watch</strong><p>${m.captain?`${esc(upper(m.captain.row.ticker))} is ${m.captain.weight.toFixed(1)}% of current market value. Keep new-money diversification in mind.`:'No concentration data yet.'}</p></div>`,
      `<div class="squad-stadium-alert red"><strong>● Recovery Watch</strong><p>${m.recovery?`${esc(upper(m.recovery.row.ticker))} is currently ${pct(m.recovery.pnlPct)} (${signedMoney(m.recovery.pnl)}).`:'No recovery watch candidate.'}</p></div>`,
      `<div class="squad-stadium-alert"><strong>◎ Sector Balance</strong><p>${esc(String(sectorName).replace(/_/g,' '))} is the largest sector grouping at ${sectorPct.toFixed(1)}% of market value.</p></div>`
    ].join('');
  }

  function renderPitch(list){
    const pitch=$('squadStadiumPitch');if(!pitch)return;
    pitch.innerHTML='';
    list.slice(0,11).forEach((x,i)=>{
      const slot=slots[i],key=rowKey(x.row),daily=x.daily;
      const displayMove=daily===null?x.pnlPct:daily;
      const btn=document.createElement('button');
      btn.type='button';btn.className=`squad-stadium-player squad-pitch-player${i===0?' is-captain':''}`;
      btn.dataset.playerKey=key;btn.style.left=`${slot.left}%`;btn.style.top=`${slot.top}%`;
      btn.innerHTML=`<span class="squad-stadium-pos">${slot.pos}</span>${i===0?'<span class="squad-stadium-cap">C</span>':''}<div class="squad-stadium-shirt">${esc(upper(x.row.ticker))}</div><span class="squad-form-ring ${displayMove>0?'profit':displayMove<0?'loss':'flat'}">${pct(displayMove)}</span><small>${esc(x.row.account||'')} · ${x.weight.toFixed(1)}%</small>`;
      btn.onclick=()=>openPlayer(key);pitch.appendChild(btn);
    });
  }

  function renderBench(list){
    const bench=$('squadStadiumBench');if(!bench)return;
    const depth=list.slice(11,18);
    setText('squadBenchCount',`${Math.max(0,list.length-11)} DEPTH`);
    bench.innerHTML=depth.length?depth.map((x,i)=>`<div class="squad-stadium-bench-row" data-player-key="${esc(rowKey(x.row))}"><span>#${i+12}</span><strong>${esc(upper(x.row.ticker))}</strong><span>${esc(x.row.name||x.row.ticker)}</span><span>${esc(x.row.account||'')}</span><span class="${x.pnlPct>=0?'gain':'loss'}">${pct(x.pnlPct)}</span></div>`).join(''):'<div class="sq-muted" style="padding:12px">No bench positions available.</div>';
    bench.querySelectorAll('[data-player-key]').forEach(el=>el.onclick=()=>openPlayer(el.dataset.playerKey));
  }

  function tableRows(list){
    const arr=[...list];
    if(sortMode==='pnl')arr.sort((a,b)=>b.pnl-a.pnl);
    else if(sortMode==='pnlpct')arr.sort((a,b)=>b.pnlPct-a.pnlPct);
    else if(sortMode==='annual')arr.sort((a,b)=>b.annual-a.annual);
    else if(sortMode==='weight')arr.sort((a,b)=>b.weight-a.weight);
    else arr.sort((a,b)=>b.market-a.market||b.annual-a.annual);
    return arr;
  }
  function renderTable(list){
    const body=$('squadStadiumBody');if(!body)return;
    const arr=tableRows(list),visible=showFull?arr:arr.slice(0,11);
    body.innerHTML=visible.map((x,i)=>{
      const role=sortMode==='matchday'?(i<11?(slots[i]?.pos||'XI'):'BENCH'):(x.row.role||x.row.sector||'Squad');
      return `<tr data-player-key="${esc(rowKey(x.row))}"><td>${i+1}</td><td><strong>${esc(upper(x.row.ticker))}</strong><div class="sq-muted">${esc(x.row.name||x.row.ticker)}</div></td><td>${esc(role)}</td><td><span class="squad-stadium-broker">${esc(x.row.account||'')}</span></td><td>${money(x.market)}</td><td>${money(x.book)}</td><td class="${pnlClass(x.pnl)}">${signedMoney(x.pnl)}</td><td class="${pnlClass(x.pnlPct)}">${pct(x.pnlPct)}</td><td>${money(x.annual)}</td><td>${x.weight.toFixed(1)}%</td></tr>`;
    }).join('');
    body.querySelectorAll('[data-player-key]').forEach(el=>el.onclick=()=>openPlayer(el.dataset.playerKey));
    const toggle=$('squadToggleFull');if(toggle)toggle.textContent=showFull?'Show Matchday XI ↑':'Show Full Squad ↓';
  }

  function openPlayer(key){
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState(),list=rows(state),x=list.find(v=>rowKey(v.row)===key);if(!x)return;
    selectedKey=key;
    const chair=chairmanStatus(state,x);
    const captain=list[0]&&rowKey(list[0].row)===key;
    const incomeLeader=[...list].sort((a,b)=>b.annual-a.annual)[0];
    const isIncomeLeader=incomeLeader&&rowKey(incomeLeader.row)===key;
    const content=$('squadStadiumDrawerContent');
    content.innerHTML=`<button class="squad-stadium-drawer-close" id="squadStadiumDrawerClose" type="button">×</button>
      <div class="squad-stadium-eyebrow">${esc(x.row.account||'')} · ${esc(x.row.sector||'Sector unclassified')}</div>
      <h2>${esc(upper(x.row.ticker))}</h2><p>${esc(x.row.name||x.row.ticker)}${captain?' · CAPTAIN':''}${isIncomeLeader?' · TOP EARNER':''}</p>
      <div class="squad-stadium-drawer-grid">
        <div><span>MARKET VALUE</span><strong>${money(x.market)}</strong></div><div><span>BOOK COST</span><strong>${money(x.book)}</strong></div>
        <div><span>P/L</span><strong class="${pnlClass(x.pnl)}">${signedMoney(x.pnl)}</strong></div><div><span>P/L %</span><strong class="${pnlClass(x.pnlPct)}">${pct(x.pnlPct)}</strong></div>
        <div><span>ANNUAL INCOME</span><strong>${money(x.annual)}</strong></div><div><span>WEIGHT</span><strong>${x.weight.toFixed(1)}%</strong></div>
        <div><span>SHARES</span><strong>${x.shares.toLocaleString('en-GB',{maximumFractionDigits:6})}</strong></div><div><span>LIVE PRICE</span><strong>${x.live>0?price(x.live):'—'}</strong></div>
      </div>
      <div class="squad-stadium-drawer-section"><h3>Squad role</h3><p>${esc(x.row.role||'First-team holding')} · ${esc(x.row.account||'Broker unclassified')}.</p></div>
      <div class="squad-stadium-drawer-section"><h3>Income report</h3><p>Next dividend: ${esc(nextDividend(state,x))}<br>Forward run-rate: ${money(x.annual)}/yr · ${money(x.annual/12)}/month average.</p></div>
      <div class="squad-stadium-drawer-section"><h3>Chairman's Office</h3><p><strong>${esc(chair.label)}</strong><br>${esc(chair.detail)}</p></div>
      <div class="squad-stadium-drawer-section"><h3>Price evidence</h3><p>${esc(sourceLabel(x.row))} · ${esc(sourceTime(x.row))}</p></div>`;
    $('squadStadiumDrawerClose').onclick=closeDrawer;
    document.body.classList.add('squad-drawer-open');
  }
  function closeDrawer(){document.body.classList.remove('squad-drawer-open');selectedKey=''}

  function render(){
    const A=window.AuroraClean;if(!A)return;
    const state=A.readState(),list=rows(state),m=metrics(list);
    renderSummary(list,m,state);renderPitch(list);renderBench(list);renderTable(list);
    if(selectedKey&&list.some(x=>rowKey(x.row)===selectedKey))openPlayer(selectedKey);
  }
  function schedule(delay=100){clearTimeout(renderTimer);renderTimer=setTimeout(render,delay)}
  function bind(){
    document.querySelectorAll('[data-squad-sort]').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('[data-squad-sort]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');sortMode=btn.dataset.squadSort||'matchday';render();
    }));
    $('squadToggleFull')?.addEventListener('click',()=>{showFull=!showFull;render()});
    $('squadStadiumDrawerBack')?.addEventListener('click',closeDrawer);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
  }
  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    bind();render();
    window.addEventListener('aurora-clean:state',()=>schedule(80));
    window.addEventListener('aurora:market-prices',()=>schedule(120));
    window.addEventListener('pageshow',()=>schedule(80));
    window.AuroraSquadStadium=Object.freeze({BUILD,render,openPlayer,closeDrawer});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();