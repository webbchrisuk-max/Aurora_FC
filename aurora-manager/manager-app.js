(() => {
  'use strict';

  const BUILD='20260926-aurora-investment-manager-2-transfer-room';
  const PAYDAY_KEY='aurora-manager:payday:v1';
  const SHORTLIST_KEY='aurora-manager:shortlist:v1';
  const TRANSFER_QUEUE_KEY='aurora-manager:transfer-queue:v1';
  const INCOME_SNAPSHOT='aurora-clean:income-snapshot:v1';
  const CASH_SNAPSHOT='aurora-clean:broker-cash-snapshot:v1';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const pct=v=>`${num(v)>=0?'+':'−'}${Math.abs(num(v)).toFixed(2)}%`;
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}};
  const active=h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0;
  const nowLabel=()=>new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  let timer=null;

  const NAV=[
    ['index.html','🏠','Manager Home','home'],
    ['payday.html','💷','Payday','payday'],
    ['scouting.html','🔎','Scouting','scouting'],
    ['transfer.html','🔁','Transfer','transfer'],
    ['../clean-rebuild/registration.html','🧾','Registration','engine'],
    ['../clean-rebuild/squad.html','⚽','Squad','engine'],
    ['../clean-rebuild/income.html','📈','Income','engine']
  ];

  function state(){return window.AuroraClean?.readState?.()||{finance:{},scouting:{candidates:[]},transfer:{},squad:{holdings:[]}}}
  function safeRelease(s){
    try{return Math.max(0,num(window.AuroraClean?.safeRelease?.(s.finance)))}catch(_){return Math.max(0,num(s.finance?.lastSafeRelease))}
  }
  function holdings(s){
    const list=arr(s.squad?.holdings).filter(active).map(h=>{
      const shares=num(h.shares),book=Math.max(0,num(h.bookCostGbp)),market=Math.max(0,num(h.marketValueGbp)||shares*num(h.livePriceGbp??h.priceGbp));
      const annual=Math.max(0,num(h.annualIncomeGbp)||shares*num(h.annualDpsGbp));
      const pnl=market-book;
      return{ticker:upper(h.ticker),name:String(h.name||h.ticker||''),account:String(h.account||''),shares,book,market,annual,pnl,pnlPct:book>0?pnl/book*100:0};
    });
    return list.sort((a,b)=>b.market-a.market);
  }
  function portfolio(s){
    const list=holdings(s),market=list.reduce((a,b)=>a+b.market,0),book=list.reduce((a,b)=>a+b.book,0),annual=list.reduce((a,b)=>a+b.annual,0),pnl=market-book;
    return{list,market,book,annual,monthly:annual/12,pnl,pnlPct:book>0?pnl/book*100:0};
  }
  function rankings(s){
    try{
      if(window.AuroraScoutingNetwork?.rankings)return window.AuroraScoutingNetwork.rankings(s);
      if(window.AuroraClean?.scoutingRankings)return window.AuroraClean.scoutingRankings(s);
    }catch(_){}
    return arr(s.scouting?.candidates).map(r=>({...r,networkScore:num(r.networkScore||r.score||r.buyStrength),yieldPct:num(r.yieldPct)})).sort((a,b)=>num(b.networkScore)-num(a.networkScore));
  }
  function managerPayday(){return read(PAYDAY_KEY)||null}
  function shortlist(){return arr(read(SHORTLIST_KEY)?.rows)}
  function brokerCash(){
    const snap=read(CASH_SNAPSHOT)?.snapshot||{};
    return{ig:num(snap.balances?.IG),t212:num(snap.balances?.T212)};
  }
  function nextDividend(){
    const snap=read(INCOME_SNAPSHOT)?.snapshot||{};
    const today=new Date();today.setHours(0,0,0,0);
    const rows=arr(snap.dividends).map(r=>{
      const d=new Date((r.payDate??r.pay_date??r.paymentDate??r.payment_date) || '');
      return{ticker:upper(r.ticker||r.symbol),date:d,amount:num(r.expectedAmountGbp??r.expected_amount_gbp??r.grossDividendGbp),status:upper(r.status||'FORECAST')};
    }).filter(r=>r.ticker&&!Number.isNaN(r.date.getTime())&&r.date>=today&&!/PAID|CANCELLED|CANCELED|ARCHIVED|MISSED/.test(r.status)).sort((a,b)=>a.date-b.date);
    return rows[0]||null;
  }
  function nativeMoney(value,currency){
    const n=num(value),c=upper(currency);
    if(!(n>0))return'—';
    if(c==='AUD')return`A$${n.toFixed(2)}`;
    if(c==='USD')return`US$${n.toFixed(2)}`;
    if(c==='EUR')return`€${n.toFixed(2)}`;
    return money(n);
  }

  function shell(){
    const page=document.body.dataset.managerPage||'home',host=$('managerTopbar');if(!host)return;
    host.innerHTML=`<div class="am-brand"><div class="am-crest">AFC</div><div class="am-brand-copy"><strong>Aurora City FC</strong><span>Investment Manager</span></div></div>
      <nav class="am-nav">${NAV.map(([href,icon,label,kind])=>`<a href="${href}" class="${page===kind?'active':''} ${kind==='engine'?'engine':''}" title="${esc(label)}"><b>${icon}</b><span>${esc(label)}</span></a>`).join('')}</nav>
      <div class="am-top-status"><i class="am-live-dot"></i><span id="amTopStatus">Clean engine connected</span></div>`;
  }
  function toast(message){
    const el=$('amToast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(window.__amToast);window.__amToast=setTimeout(()=>el.classList.remove('show'),2600);
  }

  function renderHome(){
    const s=state(),p=portfolio(s),r=rankings(s),buy=r.filter(x=>x.buyReady),top=buy[0]||r[0]||null,pay=managerPayday(),short=shortlist(),next=nextDividend();
    const approved=safeRelease(s),mission=num(s.transfer?.mission?.budget),budget=num(pay?.shareBudget)||mission||approved;
    const nextAction=!pay?.status||pay.status!=='RELEASED'
      ?{title:'Open Payday Room',copy:'Confirm what arrived and release this month’s recruitment budget.',href:'payday.html',label:'Start payday →'}
      :!short.length
        ?{title:'Enter the Scouting Room',copy:`${money(pay.recruitmentPower||pay.shareBudget)} recruitment power is ready for the scouts.`,href:'scouting.html',label:'Start scouting →'}
        :{title:'Take the shortlist to Transfer',copy:`${short.length} prospect${short.length===1?'':'s'} selected by the manager.`,href:'transfer.html',label:'Open Transfer Centre →'};

    $('amHomeNextTitle').textContent=nextAction.title;$('amHomeNextCopy').textContent=nextAction.copy;$('amHomeNextLink').href=nextAction.href;$('amHomeNextLink').textContent=nextAction.label;
    $('amHomePortfolio').textContent=money(p.market);$('amHomePnl').textContent=`${p.pnl>=0?'+':''}${money(p.pnl)} · ${pct(p.pnlPct)}`;
    $('amHomeIncome').textContent=money(p.annual);$('amHomeMonthly').textContent=`${money(p.monthly)}/month`;
    $('amHomeBudget').textContent=money(budget);$('amHomeScouts').textContent=String(r.length);$('amHomeReady').textContent=`${buy.length} buy-ready`;
    $('amHomeNextDiv').textContent=next?next.ticker:'—';$('amHomeNextDivSub').textContent=next?`${next.date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} · ${money(next.amount)}`:'No dated fixture';

    const stages=[
      ['💷','Payday',pay?.status==='RELEASED'?'Budget released':'Awaiting manager','payday.html',pay?.status==='RELEASED'?'ready':'action'],
      ['🔎','Scouting',buy.length?`${buy.length} buy-ready`:`${r.length} reports`,'scouting.html',buy.length?'ready':''],
      ['🔁','Transfer',mission>0?`${money(mission)} mission`:'Awaiting shortlist','transfer.html',mission>0?'ready':''],
      ['🧾','Registration',`${arr(s.registration?.receipts).length} receipts`,'../clean-rebuild/registration.html',''],
      ['⚽','Squad',`${p.list.length} positions`,'../clean-rebuild/squad.html',p.list.length?'ready':''],
      ['📈','Income',`${money(p.annual)}/yr`,'../clean-rebuild/income.html',p.annual>0?'ready':'']
    ];
    $('amHomeFlow').innerHTML=stages.map(([icon,title,meta,href,cls])=>`<a class="am-flow-card ${cls}" href="${href}"><div class="am-flow-icon">${icon}</div><small>DEPARTMENT</small><strong>${title}</strong><span>${meta}</span></a>`).join('');

    const briefs=[
      ['💼','Recruitment Budget',budget>0?`${money(budget)} available for this recruitment cycle`:'No manager budget released yet',budget>0?'READY':'WAITING'],
      ['🔎','Chief Scout',top?`${upper(top.ticker)} · ${num(top.networkScore||top.score).toFixed(1)}/100 · ${num(top.yieldPct).toFixed(3)}% yield`:'Scouting reports not ready',top?'LIVE':'WAITING'],
      ['📈','Income Fixture',next?`${next.ticker} due ${next.date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} · ${money(next.amount)}`:'No dated dividend fixture','LIVE']
    ];
    $('amHomeBriefing').innerHTML=briefs.map(([icon,title,detail,status])=>`<div class="am-brief"><div class="am-brief-icon">${icon}</div><div><strong>${title}</strong><span>${detail}</span></div><em>${status}</em></div>`).join('');

    const incomeProgress=Math.min(100,p.monthly/2000*100);
    $('amHomeIncomeProgress').style.width=`${incomeProgress}%`;
    $('amHomeObjectives').innerHTML=`
      <div class="am-objective"><span>MONTHLY INCOME OBJECTIVE</span><strong>${money(p.monthly)} / £2,000</strong><small>${incomeProgress.toFixed(1)}% complete</small></div>
      <div class="am-objective"><span>PORTFOLIO FORM</span><strong class="${p.pnl>=0?'good':''}">${pct(p.pnlPct)}</strong><small>${p.pnl>=0?'Positive squad form':'Recovery phase'}</small></div>
      <div class="am-objective"><span>SCOUTING DEPTH</span><strong>${r.length} reports</strong><small>${buy.length} cleared for recruitment</small></div>`;
    $('amHeroScore').textContent=buy.length?String(buy.length):String(r.length);$('amHeroScoreLabel').textContent=buy.length?'BUY-READY PROSPECTS':'ACTIVE SCOUT REPORTS';
  }

  function paydayDefaults(){
    const s=state(),cash=brokerCash(),approved=safeRelease(s),saved=managerPayday()||{};
    return{
      payReceived:num(saved.payReceived)||num(s.finance?.wagesReceived)||num(s.finance?.expectedWages),
      extraIncome:num(saved.extraIncome),
      shareBudget:num(saved.shareBudget)||approved,
      approved,cash
    };
  }
  function recalcPayday(){
    const pay=Math.max(0,num($('amPayReceived')?.value)),extra=Math.max(0,num($('amPayExtra')?.value)),budget=Math.max(0,num($('amPayBudget')?.value)),cash=brokerCash(),broker=cash.ig+cash.t212,power=budget+broker;
    $('amPayPower').textContent=money(power);$('amPayBudgetSummary').textContent=money(budget);$('amPayBrokerCash').textContent=money(broker);$('amPayIncomeSummary').textContent=money(pay+extra);
    $('amPayIG').textContent=money(cash.ig);$('amPayT212').textContent=money(cash.t212);
    return{pay,extra,budget,cash,broker,power};
  }
  function renderPayday(){
    const d=paydayDefaults();
    $('amPayReceived').value=d.payReceived?d.payReceived.toFixed(2):'';
    $('amPayExtra').value=d.extraIncome?d.extraIncome.toFixed(2):'';
    $('amPayBudget').value=d.shareBudget?d.shareBudget.toFixed(2):'';
    $('amFinanceApproved').textContent=money(d.approved);
    ['amPayReceived','amPayExtra','amPayBudget'].forEach(id=>$(id)?.addEventListener('input',recalcPayday));
    $('amUseApproved')?.addEventListener('click',()=>{$('amPayBudget').value=d.approved.toFixed(2);recalcPayday()});
    document.querySelectorAll('[data-budget-pct]').forEach(btn=>btn.addEventListener('click',()=>{$('amPayBudget').value=(d.approved*num(btn.dataset.budgetPct)/100).toFixed(2);recalcPayday()}));
    $('amReleaseBudget')?.addEventListener('click',()=>{
      const v=recalcPayday();
      const row={status:'RELEASED',payReceived:v.pay,extraIncome:v.extra,shareBudget:v.budget,brokerCash:v.cash,recruitmentPower:v.power,financeApprovedBudget:d.approved,createdAt:new Date().toISOString()};
      write(PAYDAY_KEY,row);
      $('amPaydayResult').classList.add('show');$('amPaydayReleased').textContent=money(v.budget);$('amPaydayPowerReleased').textContent=money(v.power);
      toast('Recruitment budget released to Aurora Manager.');
    });
    recalcPayday();
    const saved=managerPayday();if(saved?.status==='RELEASED'){$('amPaydayResult').classList.add('show');$('amPaydayReleased').textContent=money(saved.shareBudget);$('amPaydayPowerReleased').textContent=money(saved.recruitmentPower)}
  }

  const pitchSlots=[
    [50,14],[19,30],[50,31],[81,30],[27,50],[50,52],[73,50],[18,72],[39,76],[61,76],[82,72]
  ];
  function shortlistHas(ticker){return shortlist().some(x=>upper(x.ticker)===upper(ticker))}
  function saveShortlist(rows){write(SHORTLIST_KEY,{rows,updatedAt:new Date().toISOString()});renderShortlistPanel(rankings(state()))}
  function toggleShortlist(row){
    const current=shortlist(),ticker=upper(row.ticker),exists=current.some(x=>upper(x.ticker)===ticker);
    const next=exists?current.filter(x=>upper(x.ticker)!==ticker):[...current,{ticker,name:row.name||ticker,broker:window.AuroraScoutingExecutionProfiles?.accountLabel?.(row)||'Broker review',score:num(row.networkScore||row.score),yieldPct:num(row.yieldPct),addedAt:new Date().toISOString()}];
    saveShortlist(next);toast(exists?`${ticker} removed from shortlist`:`${ticker} added to shortlist`);
  }
  function renderShortlistPanel(ranks){
    const host=$('amScoutShortlist');if(!host)return;
    const list=shortlist();
    host.innerHTML=list.length?list.map((x,i)=>`<div class="am-shortlist-row"><strong>#${i+1} ${esc(x.ticker)}</strong><div><strong>${esc(x.name||x.ticker)}</strong><span>${esc(x.broker||'Broker review')} · ${num(x.yieldPct).toFixed(3)}% yield</span></div><button data-remove-short="${esc(x.ticker)}">Remove</button></div>`).join(''):'<div class="am-brief"><div class="am-brief-icon">📋</div><div><strong>No manager shortlist yet</strong><span>Add prospects from the pitch or league tables.</span></div></div>';
    host.querySelectorAll('[data-remove-short]').forEach(btn=>btn.onclick=()=>{
      const next=shortlist().filter(x=>upper(x.ticker)!==upper(btn.dataset.removeShort));saveShortlist(next);toast(`${btn.dataset.removeShort} removed`);
      renderScoutingTables(ranks);
    });
    $('amScoutShortCount').textContent=`${list.length} SELECTED`;if($('amScoutShortCountBadge'))$('amScoutShortCountBadge').textContent=`${list.length} SELECTED`; 
  }
  function openScout(row){
    if(!row)return;
    const broker=window.AuroraScoutingExecutionProfiles?.accountLabel?.(row)||'Broker review';
    const target=nativeMoney(row.analystPriceTargetNative,row.analystPriceTargetCurrency||row.executionCurrency||row.currency);
    const div=$('amDrawerContent');
    div.innerHTML=`<button class="am-drawer-close" id="amDrawerClose">×</button><div class="am-kicker"><i></i>Chief Scout Dossier</div><h2>${esc(upper(row.ticker))}</h2><p>${esc(row.name||row.ticker)} · ${esc(row.sector||'Sector unclassified')}</p>
      <div class="am-drawer-grid">
        <div><span>NETWORK SCORE</span><strong>${num(row.networkScore||row.score).toFixed(1)}/100</strong></div>
        <div><span>VERDICT</span><strong>${esc(row.verdict||row.signal||'WATCH')}</strong></div>
        <div><span>FORWARD YIELD</span><strong>${num(row.yieldPct).toFixed(3)}%</strong></div>
        <div><span>BUY ACCOUNT</span><strong>${esc(broker)}</strong></div>
        <div><span>MARKET</span><strong>${esc(row.executionMarket||row.market||'—')}</strong></div>
        <div><span>ANALYST TARGET</span><strong>${esc(target)}</strong></div>
        <div><span>ANALYST VIEW</span><strong>${esc(row.analystView||'—')}</strong></div>
        <div><span>PAYOUT RISK</span><strong>${esc(row.risk||row.payoutRisk||'UNKNOWN')}</strong></div>
        <div><span>PIPELINE</span><strong>${esc(row.stage||'SCOUTING')}</strong></div>
        <div><span>READINESS</span><strong>${esc(row.readiness||row.evidenceStatus||'Research')}</strong></div>
      </div>
      <div class="am-hero-actions"><button class="am-btn primary" id="amDrawerShort">${shortlistHas(row.ticker)?'Remove from shortlist':'Add to shortlist'}</button></div>`;
    $('amDrawerClose').onclick=closeDrawer;$('amDrawerShort').onclick=()=>{toggleShortlist(row);openScout(row);renderScoutingTables(rankings(state()))};
    $('amDrawerBack').classList.add('open');$('amDrawer').classList.add('open');
  }
  function closeDrawer(){$('amDrawerBack')?.classList.remove('open');$('amDrawer')?.classList.remove('open')}
  function renderScoutingTables(allRanks){
    const q=String($('amScoutSearch')?.value||'').trim().toLowerCase(),filter=String($('amScoutTier')?.value||'ALL');
    let rows=allRanks.filter(r=>!q||`${r.ticker} ${r.name} ${r.sector}`.toLowerCase().includes(q));
    if(filter!=='ALL')rows=rows.filter(r=>(r.tier||'WATCH')===filter);
    const groups=[['PREMIER','Premier League'],['ELITE','Championship'],['READY','League One'],['WATCH','League Two / Research']];
    $('amScoutLeagues').innerHTML=groups.map(([tier,label])=>{
      const list=rows.filter(r=>(r.tier||'WATCH')===tier).slice(0,tier==='WATCH'?30:20);
      return `<section class="am-league"><div class="am-league-head"><strong>${label}</strong><span>${list.length} report${list.length===1?'':'s'}</span></div><div class="am-table-wrap"><table class="am-table"><thead><tr><th>#</th><th>SHARE</th><th>SCORE</th><th>YIELD</th><th>BROKER</th><th>VERDICT</th><th>STATUS</th></tr></thead><tbody>${list.length?list.map((r,i)=>{
        const broker=window.AuroraScoutingExecutionProfiles?.accountLabel?.(r)||'Broker review';
        return `<tr data-scout-row="${esc(r.ticker)}"><td>#${i+1}</td><td><span class="ticker">${esc(r.ticker)}</span><div>${esc(r.name||r.ticker)}</div></td><td>${num(r.networkScore||r.score).toFixed(1)}</td><td>${num(r.yieldPct).toFixed(3)}%</td><td>${esc(broker)}</td><td class="${r.buyReady?'good':r.verdict==='BLOCKED'?'bad':'warn'}">${esc(r.verdict||'WATCH')}</td><td><button class="am-btn secondary" data-short-row="${esc(r.ticker)}">${shortlistHas(r.ticker)?'Selected ✓':'Shortlist'}</button></td></tr>`;
      }).join(''):'<tr><td colspan="7">No reports in this division.</td></tr>'}</tbody></table></div></section>`;
    }).join('');
    $('amScoutLeagues').querySelectorAll('[data-scout-row]').forEach(tr=>tr.onclick=e=>{if(e.target.closest('button'))return;openScout(allRanks.find(r=>upper(r.ticker)===upper(tr.dataset.scoutRow)))});
    $('amScoutLeagues').querySelectorAll('[data-short-row]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const r=allRanks.find(x=>upper(x.ticker)===upper(btn.dataset.shortRow));if(r){toggleShortlist(r);renderScoutingTables(allRanks)}});
  }
  function renderScouting(){
    const s=state(),r=rankings(s),buy=r.filter(x=>x.buyReady),top=buy[0]||r[0]||null,pay=managerPayday(),budget=num(pay?.recruitmentPower||pay?.shareBudget)||safeRelease(s);
    $('amScoutBudget').textContent=money(budget);$('amScoutReportCount').textContent=String(r.length);$('amScoutReadyCount').textContent=String(buy.length);if($('amScoutReadyCountMirror'))$('amScoutReadyCountMirror').textContent=String(buy.length);
    if(top){
      $('amScoutTopTicker').textContent=top.ticker;$('amScoutTopName').textContent=`${top.name||top.ticker} is leading the recruitment board`;$('amScoutTopReason').textContent=`${num(top.yieldPct).toFixed(3)}% yield · ${top.verdict||'WATCH'} · ${window.AuroraScoutingExecutionProfiles?.accountLabel?.(top)||'Broker review'}`;
      $('amScoutTopScore').textContent=`${num(top.networkScore||top.score).toFixed(1)}`;
      $('amScoutTopTags').innerHTML=[top.tier||'WATCH',top.executionMarket||top.market||'MARKET',top.analystView||'',top.readiness||''].filter(Boolean).map(x=>`<span class="am-tag">${esc(x)}</span>`).join('');
      $('amScoutTopOpen').onclick=()=>openScout(top);
    }else{$('amScoutTopName').textContent='Awaiting live scout reports';$('amScoutTopReason').textContent='The clean scouting engine has not returned candidates yet.'}
    const pitch=$('amScoutPitch');pitch.innerHTML='';
    r.slice(0,11).forEach((row,i)=>{
      const [left,topPos]=pitchSlots[i],btn=document.createElement('button');btn.className='am-prospect';btn.style.left=left+'%';btn.style.top=topPos+'%';btn.type='button';
      btn.innerHTML=`<strong>${esc(row.ticker)}</strong><span>${num(row.networkScore||row.score).toFixed(0)}</span><small>${num(row.yieldPct).toFixed(2)}%</small>`;btn.onclick=()=>openScout(row);pitch.appendChild(btn);
    });
    renderShortlistPanel(r);renderScoutingTables(r);
    $('amScoutSearch').oninput=()=>renderScoutingTables(r);$('amScoutTier').onchange=()=>renderScoutingTables(r);
    $('amDrawerBack').onclick=closeDrawer;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()},{once:true});
  }

  function transferQueue(){return arr(read(TRANSFER_QUEUE_KEY)?.rows)}
  function saveTransferQueue(rows){write(TRANSFER_QUEUE_KEY,{rows,updatedAt:new Date().toISOString()})}
  function routeBroker(row){
    const a=upper(row?.lockedAccount||row?.account||row?.broker||row?.preferredBroker||row?.platform);
    if(a.includes('212'))return'Trading 212 ISA';
    if(a.includes('IG'))return'IG ISA';
    try{return window.AuroraScoutingExecutionProfiles?.accountLabel?.(row)||'Broker review'}catch(_){return'Broker review'}
  }
  function cleanRouteRows(s){
    const route=s.transfer?.route||{};
    return [...arr(route.allocations),...arr(route.brokerCashAllocations)].filter(r=>num(r.amount)>0);
  }
  function transferCandidates(s){
    const ranks=rankings(s),byTicker=new Map(ranks.map(r=>[upper(r.ticker),r]));
    const short=shortlist(),queue=transferQueue();
    const source=(short.length?short:ranks.filter(r=>r.buyReady).slice(0,10));
    return source.map((x,i)=>{
      const r=byTicker.get(upper(x.ticker))||x;
      const route=cleanRouteRows(s).filter(z=>upper(z.ticker)===upper(r.ticker));
      const amount=route.reduce((sum,z)=>sum+num(z.amount),0);
      const cleanBroker=route.length?routeBroker(route[0]):routeBroker(r);
      const queued=queue.some(q=>upper(q.ticker)===upper(r.ticker));
      return{...r,managerRank:i+1,routeAmount:amount,managerBroker:cleanBroker,queued};
    });
  }
  function toggleTransferQueue(row){
    const rows=transferQueue(),ticker=upper(row.ticker),exists=rows.some(x=>upper(x.ticker)===ticker);
    const next=exists?rows.filter(x=>upper(x.ticker)!==ticker):[...rows,{
      ticker,name:row.name||ticker,broker:row.managerBroker||routeBroker(row),
      score:num(row.networkScore||row.score),yieldPct:num(row.yieldPct),
      amount:num(row.routeAmount),queuedAt:new Date().toISOString()
    }];
    saveTransferQueue(next);
    toast(exists?`${ticker} removed from transfer queue`:`${ticker} queued for transfer review`);
    renderTransfer();
  }
  function transferOrderLevel(row){
    const price=num(row.brokerBuyPriceNative||row.livePriceNative||row.marketPriceNative||row.priceNative);
    if(!(price>0))return'Market';
    return nativeMoney(price,row.executionCurrency||row.currency);
  }
  function renderTransfer(){
    const s=state(),pay=managerPayday(),cash=brokerCash(),candidates=transferCandidates(s),queue=transferQueue(),route=s.transfer?.route||{},mission=s.transfer?.mission||null;
    const newBudget=num(pay?.shareBudget)||num(mission?.budget)||safeRelease(s);
    const brokerCashTotal=cash.ig+cash.t212;
    const routePower=num(route.totalAllocated)||num(pay?.recruitmentPower)||newBudget+brokerCashTotal;
    const primary=candidates[0]||null;
    const primaryBroker=primary?.managerBroker||'Broker review';
    const pending=queue.length||arr(route.allocations).length;

    setTextSafe('amTransferBudget',money(newBudget));
    setTextSafe('amTransferBrokerCash',money(brokerCashTotal));
    setTextSafe('amTransferPower',money(routePower));
    setTextSafe('amTransferRoute',primaryBroker);
    setTextSafe('amTransferPending',String(pending));
    setTextSafe('amTransferReadyCount',String(candidates.length));
    setTextSafe('amTransferBoardCount',`${candidates.length} TARGET${candidates.length===1?'':'S'}`);

    const nextTitle=route.locked?'Route locked for Registration':queue.length?'Manager queue ready for final review':candidates.length?'Review the recruitment shortlist':'Return to Scouting';
    const nextCopy=route.locked?'The clean transfer route is frozen. Registration can now confirm real broker execution.':queue.length?`${queue.length} target${queue.length===1?' is':'s are'} queued for the final transfer decision.`:candidates.length?'Review broker route, score and current order evidence before moving to the clean execution chain.':'No recruitment targets are available yet.';
    setTextSafe('amTransferNextAction',nextTitle);
    setTextSafe('amTransferNextCopy',nextCopy);

    const flow=[
      ['🔎','Scout',candidates.length?'Reports ready':'Awaiting reports',candidates.length?'ready':''],
      ['✅','Verify',candidates.filter(r=>r.buyReady).length?`${candidates.filter(r=>r.buyReady).length} cleared`:'Evidence review',candidates.some(r=>r.buyReady)?'ready':''],
      ['🧑‍💼','Approve',queue.length?`${queue.length} queued`:'Manager decision',queue.length?'ready':'action'],
      ['🧭','Route',route.allocations?.length?(route.locked?'Locked':'Built'):'Broker routing',''],
      ['🤝','Buy',mission?.status||'Awaiting execution',''],
      ['👕','Register',route.locked?'Ready for desk':'After execution',route.locked?'ready':'']
    ];
    const flowHost=$('amTransferFlow');
    if(flowHost)flowHost.innerHTML=flow.map(([icon,title,meta,cls])=>`<div class="am-flow-card ${cls}"><div class="am-flow-icon">${icon}</div><small>TRANSFER STAGE</small><strong>${title}</strong><span>${meta}</span></div>`).join('');

    const body=$('amTransferBoardRows');
    if(body){
      body.innerHTML=candidates.length?candidates.map((r,i)=>`<tr data-transfer-row="${esc(r.ticker)}">
        <td>#${i+1}</td>
        <td><span class="ticker">${esc(upper(r.ticker))}</span><div>${esc(r.name||r.ticker)}</div></td>
        <td>${num(r.networkScore||r.score).toFixed(1)}</td>
        <td>${num(r.yieldPct).toFixed(3)}%</td>
        <td><span class="am-route-pill">${esc(r.managerBroker||'Broker review')}</span></td>
        <td>${esc(transferOrderLevel(r))}</td>
        <td>${r.routeAmount>0?money(r.routeAmount):'—'}</td>
        <td><button class="am-btn secondary" data-transfer-review="${esc(r.ticker)}">Review</button> <button class="am-btn ${r.queued?'gold':'primary'}" data-transfer-queue="${esc(r.ticker)}">${r.queued?'Queued ✓':'Queue'}</button></td>
      </tr>`).join(''):'<tr><td colspan="8">No transfer targets yet. Build the manager shortlist in Scouting.</td></tr>';
      body.querySelectorAll('[data-transfer-review]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openScout(candidates.find(r=>upper(r.ticker)===upper(btn.dataset.transferReview)))});
      body.querySelectorAll('[data-transfer-queue]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const row=candidates.find(r=>upper(r.ticker)===upper(btn.dataset.transferQueue));if(row)toggleTransferQueue(row)});
      body.querySelectorAll('[data-transfer-row]').forEach(tr=>tr.onclick=e=>{if(e.target.closest('button'))return;openScout(candidates.find(r=>upper(r.ticker)===upper(tr.dataset.transferRow)))});
    }

    const desk=$('amTransferNegotiationList');
    if(desk){
      const chosen=queue.length?queue:candidates.slice(0,4);
      const labels=['Primary target','Backup target','Value target','Income target'];
      const icons=['🎯','🛡️','📊','🪙'];
      desk.innerHTML=chosen.length?chosen.slice(0,4).map((r,i)=>`<div class="am-brief"><div class="am-brief-icon">${icons[i]||'📋'}</div><div><strong>${labels[i]||'Transfer target'} · ${esc(upper(r.ticker))}</strong><span>${esc(r.name||r.ticker)} · ${num(r.score||r.networkScore).toFixed(1)} score · ${num(r.yieldPct).toFixed(3)}% yield · ${esc(r.broker||r.managerBroker||routeBroker(r))}</span></div><em>${queue.some(q=>upper(q.ticker)===upper(r.ticker))?'QUEUED':'LIVE'}</em></div>`).join(''):'<div class="am-brief"><div class="am-brief-icon">📋</div><div><strong>No active negotiation list</strong><span>Return to Scouting and shortlist the prospects you want Transfer to review.</span></div><em>WAITING</em></div>';
    }

    const summary=$('amTransferSummary');
    if(summary){
      summary.innerHTML=`<div class="am-transfer-summary-card"><span>MANAGER SHORTLIST</span><strong>${shortlist().length}</strong><small>Selected in the Scouting Room</small></div>
        <div class="am-transfer-summary-card"><span>TRANSFER QUEUE</span><strong>${queue.length}</strong><small>Targets awaiting the final decision</small></div>
        <div class="am-transfer-summary-card"><span>CLEAN ROUTE</span><strong>${route.locked?'LOCKED':route.allocations?.length?'BUILT':'WAITING'}</strong><small>${route.locked?'Ready for Registration':route.allocations?.length?'Broker route prepared':'Classic engine remains authoritative'}</small></div>`;
    }
    if($('amDrawerBack'))$('amDrawerBack').onclick=closeDrawer;
  }
  function setTextSafe(id,value){const el=$(id);if(el)el.textContent=value}


  function transferBrokerCode(row){
    const a=upper(row?.lockedAccount||row?.account||row?.broker||row?.preferredBroker||row?.platform);
    if(a.includes('212'))return'T212';
    if(a.includes('IG'))return'IG';
    return'';
  }
  function transferBrokerLabel(row){
    const code=transferBrokerCode(row);
    if(code==='IG')return'IG ISA';
    if(code==='T212')return'Trading 212 ISA';
    try{return window.AuroraScoutingExecutionProfiles?.accountLabel?.(row)||'Broker review'}catch(_){return'Broker review'}
  }
  function transferCandidateMap(s){
    const map=new Map();
    rankings(s).forEach(r=>map.set(upper(r.ticker),r));
    return map;
  }
  function transferRows(s){
    const route=s.transfer?.route;
    const map=transferCandidateMap(s);
    if(Array.isArray(route?.allocations)&&route.allocations.length){
      return route.allocations.filter(r=>num(r.amount)>0).map((r,i)=>{
        const scout=map.get(upper(r.underlyingTicker||r.ticker))||map.get(upper(r.ticker))||{};
        return{
          source:'ROUTE',rank:num(r.selectionRank)||i+1,ticker:upper(r.underlyingTicker||r.ticker),executionTicker:upper(r.executionTicker||r.ticker),
          name:r.name||scout.name||r.ticker,amount:num(r.amount),score:num(r.score||scout.networkScore||scout.score),yieldPct:num(r.yieldPct||scout.yieldPct),
          broker:transferBrokerLabel(r),market:r.executionMarket||scout.executionMarket||scout.market||'',currency:r.executionCurrency||scout.executionCurrency||'',
          orderLevel:num(scout.brokerBuyPriceNative||scout.livePriceNative||scout.priceNative),locked:route.locked===true,fundingSource:r.fundingSource||'FINANCE'
        };
      });
    }
    const plan=s.scouting?.allocationPlan;
    if(Array.isArray(plan?.allocations)&&plan.allocations.length){
      return plan.allocations.filter(r=>num(r.amount)>0).map((r,i)=>{
        const scout=map.get(upper(r.ticker))||{};
        return{
          source:'PLAN',rank:num(r.selectionRank)||i+1,ticker:upper(r.ticker),executionTicker:upper(r.executionTicker||r.ticker),
          name:r.name||scout.name||r.ticker,amount:num(r.amount),score:num(r.score||scout.networkScore||scout.score),yieldPct:num(r.yieldPct||scout.yieldPct),
          broker:transferBrokerLabel(r),market:r.executionMarket||scout.executionMarket||'',currency:r.executionCurrency||scout.executionCurrency||'',
          orderLevel:num(scout.brokerBuyPriceNative||scout.livePriceNative||scout.priceNative),locked:false,fundingSource:'FINANCE'
        };
      });
    }
    const short=shortlist();
    return short.map((x,i)=>{
      const scout=map.get(upper(x.ticker))||{};
      return{
        source:'SHORTLIST',rank:i+1,ticker:upper(x.ticker),executionTicker:upper(scout.executionTicker||x.ticker),
        name:x.name||scout.name||x.ticker,amount:0,score:num(x.score||scout.networkScore||scout.score),yieldPct:num(x.yieldPct||scout.yieldPct),
        broker:x.broker||transferBrokerLabel(scout),market:scout.executionMarket||scout.market||'',currency:scout.executionCurrency||'',
        orderLevel:num(scout.brokerBuyPriceNative||scout.livePriceNative||scout.priceNative),locked:false,fundingSource:''
      };
    });
  }
  function transferCashSnapshot(){
    const transfer=read('aurora-clean:transfer-broker-cash:v1')?.snapshot||{};
    if(transfer?.balances)return{ig:num(transfer.balances.IG),t212:num(transfer.balances.T212)};
    return brokerCash();
  }
  function renderTransferWorkflow(s){
    const mission=s.transfer?.mission,plan=s.scouting?.allocationPlan,route=s.transfer?.route,receipts=arr(s.registration?.receipts).filter(r=>!mission?.id||String(r.missionId||'')===String(mission.id||''));
    const stage=route?.locked?5:route?.allocations?.length?4:upper(plan?.status)==='APPROVED'?3:shortlist().length?2:1;
    document.querySelectorAll('[data-transfer-step]').forEach(el=>{
      const n=num(el.dataset.transferStep);
      el.classList.toggle('ready',n<stage);
      el.classList.toggle('action',n===stage);
    });
    const labels={
      1:['Scout','Build the manager shortlist'],
      2:['Verify','Approve the Scouting payday plan'],
      3:['Approve','Build the broker-funded transfer route'],
      4:['Route','Review brokers and lock the route'],
      5:['Buy','Execute the broker orders'],
      6:['Register','Confirm purchases into the Squad']
    };
    const [title,copy]=labels[Math.min(6,Math.max(1,stage))];
    setTextSafe('amTransferNextAction',title);
    setTextSafe('amTransferNextCopy',copy);
    setTextSafe('amTransferPending',String(route?.locked?Math.max(0,transferRows(s).length-receipts.length):transferRows(s).length));
  }
  function setTextSafe(id,value){const el=$(id);if(el)el.textContent=value}
  function renderTransfer(){
    const s=state(),rows=transferRows(s),cash=transferCashSnapshot(),pay=managerPayday(),mission=s.transfer?.mission,route=s.transfer?.route;
    const newBudget=num(mission?.budget)||num(pay?.shareBudget)||safeRelease(s);
    const brokerTotal=cash.ig+cash.t212;
    const totalPower=num(route?.totalAllocated)||num(pay?.recruitmentPower)||(newBudget+brokerTotal);
    const primary=rows[0]||null;
    const routeCount=rows.filter(r=>/IG ISA|Trading 212/.test(r.broker)).length;

    setTextSafe('amTransferBudget',money(newBudget));
    setTextSafe('amTransferBrokerCash',money(brokerTotal));
    setTextSafe('amTransferPower',money(totalPower));
    setTextSafe('amTransferRoute',primary?.broker||'Awaiting route');
    setTextSafe('amTransferReadyCount',String(rows.length));
    setTextSafe('amTransferBoardCount',`${rows.length} TARGET${rows.length===1?'':'S'}`);
    setTextSafe('amTransferCashSplit',`IG ${money(cash.ig)} · T212 ${money(cash.t212)}`);
    setTextSafe('amTransferRouteStatus',route?.locked?'LOCKED FOR REGISTRATION':route?.allocations?.length?'ROUTE BUILT · REVIEW + LOCK':upper(s.scouting?.allocationPlan?.status)==='APPROVED'?'APPROVED SCOUTING PLAN READY':'WAITING FOR APPROVED SCOUTING PLAN');

    const body=$('amTransferBoardRows');
    if(body){
      body.innerHTML=rows.length?rows.map((r,i)=>{
        const order=r.orderLevel>0?nativeMoney(r.orderLevel,r.currency):'—';
        const amount=r.amount>0?money(r.amount):'—';
        return `<tr data-transfer-row="${esc(r.ticker)}"><td>#${r.rank||i+1}</td><td><span class="ticker">${esc(r.ticker)}</span><div>${esc(r.name||r.ticker)}${r.executionTicker&&r.executionTicker!==r.ticker?` · → ${esc(r.executionTicker)}`:''}</div></td><td>${r.score.toFixed(1)}</td><td>${r.yieldPct.toFixed(3)}%</td><td><span class="am-route-pill">${esc(r.broker)}</span></td><td>${amount}</td><td>${esc(order)}</td><td><button class="am-btn secondary" data-transfer-review="${esc(r.ticker)}">Review</button></td></tr>`;
      }).join(''):'<tr><td colspan="8">No transfer targets yet. Build a shortlist in Scouting first.</td></tr>';
      body.querySelectorAll('[data-transfer-review]').forEach(btn=>btn.onclick=()=>{
        const scout=rankings(s).find(x=>upper(x.ticker)===upper(btn.dataset.transferReview));
        if(scout)openScout(scout);
        else toast(`${btn.dataset.transferReview} is in the transfer route but has no open scout dossier.`);
      });
    }

    const negotiation=$('amTransferNegotiationList');
    if(negotiation){
      const roles=['Primary target','Backup target','Income target','Value target'];
      negotiation.innerHTML=rows.length?rows.slice(0,4).map((r,i)=>`<div class="am-brief"><div class="am-brief-icon">${i===0?'🎯':i===1?'🛡️':i===2?'💷':'📊'}</div><div><strong>${roles[i]||'Target'} · ${esc(r.ticker)}</strong><span>${esc(r.name||r.ticker)} · ${r.score.toFixed(1)} score · ${r.yieldPct.toFixed(3)}% · ${esc(r.broker)}</span></div><em>${r.source==='ROUTE'?(route?.locked?'LOCKED':'ROUTED'):r.source==='PLAN'?'APPROVED':'SHORTLIST'}</em></div>`).join(''):'<div class="am-brief"><div class="am-brief-icon">📋</div><div><strong>No transfer targets yet</strong><span>Return to Scouting and build the recruitment shortlist.</span></div><em>WAITING</em></div>';
    }

    const summary=$('amTransferSummary');
    if(summary){
      const allocated=rows.reduce((sum,r)=>sum+r.amount,0);
      summary.innerHTML=`<div class="am-transfer-card"><span>TRANSFER SUMMARY</span><strong>${rows.length} target${rows.length===1?'':'s'}</strong><small>${money(allocated)} currently allocated · ${routeCount} broker route${routeCount===1?'':'s'} resolved</small></div>
        <div class="am-transfer-card"><span>ROUTE STATUS</span><strong>${route?.locked?'Locked':'Editable'}</strong><small>${route?.locked?'Ready for the Registration Desk':'Build or review the current Clean route'}</small></div>`;
    }

    const build=$('amTransferBuild'),lock=$('amTransferLock'),register=$('amTransferRegister');
    if(build){
      const can=!!window.AuroraTransferStage2?.buildRoute&&!!mission&&upper(s.scouting?.allocationPlan?.status)==='APPROVED'&&!route?.locked;
      build.disabled=!can;
      build.textContent=route?.allocations?.length?'Rebuild Clean Route':'Build Approved Route';
      build.onclick=()=>{const ok=window.AuroraTransferStage2?.buildRoute?.();toast(ok===false?'Route could not be built yet. Check the approved Scouting plan.':'Transfer route build requested.');setTimeout(()=>schedule(50),120)};
    }
    if(lock){
      const can=!!window.AuroraTransferStage2?.lockRoute&&!!route?.allocations?.length&&!route?.locked;
      lock.disabled=!can;
      lock.textContent=route?.locked?'Route Locked ✓':'Save + Lock Route';
      lock.onclick=()=>{const ok=window.AuroraTransferStage2?.lockRoute?.();toast(ok===false?'Route is not ready to lock.':'Transfer route lock requested.');setTimeout(()=>schedule(50),120)};
    }
    if(register){
      register.href='../clean-rebuild/registration.html';
      register.classList.toggle('is-disabled',!route?.locked);
      register.setAttribute('aria-disabled',route?.locked?'false':'true');
      register.onclick=e=>{if(!route?.locked){e.preventDefault();toast('Lock the transfer route before Registration.')}};
    }

    renderTransferWorkflow(s);
    $('amDrawerBack')&&( $('amDrawerBack').onclick=closeDrawer );
  }

  function render(){
    shell();
    const page=document.body.dataset.managerPage;
    if(page==='home')renderHome();
    else if(page==='payday')renderPayday();
    else if(page==='scouting')renderScouting();
    else if(page==='transfer')renderTransfer();
    else if(page==='transfer')renderTransfer();
    const status=$('amTopStatus');if(status)status.textContent=`Clean engine · ${nowLabel()}`;
  }
  function schedule(delay=100){clearTimeout(timer);timer=setTimeout(render,delay)}
  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    render();
    window.addEventListener('aurora-clean:state',()=>schedule(100));
    window.addEventListener('storage',()=>schedule(100));
    window.AuroraInvestmentManager=Object.freeze({BUILD,render,rankings,managerPayday,shortlist,renderTransfer,transferQueue});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();