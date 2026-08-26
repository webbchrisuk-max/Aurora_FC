(() => {
  'use strict';

  const BUILD='20260826-nexus-intelligence-child-renderer-1';
  const STATE_KEY='aurora2:state:v1';
  const INCOME_SUMMARY_KEY='aurora2:income:summary:v1';
  const INCOME_CALENDAR_KEY='aurora2:income:calendar-local:v1';
  const TERMINAL=new Set(['COMPLETE','COMPLETED','CANCELLED','ARCHIVED','CONFIRMED']);

  if(window.__AuroraNexusHeadquartersIntelligence===BUILD) return;
  window.__AuroraNexusHeadquartersIntelligence=BUILD;

  const arr=v=>Array.isArray(v)?v:[];
  const upper=v=>String(v||'').trim().toUpperCase();
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const readJson=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}};
  const dateKey=v=>{const t=String(v||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(t)?t:'';};
  const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const setText=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};

  function formatDate(value,withYear=false){
    const key=dateKey(value); if(!key) return 'Not dated';
    const [y,m,d]=key.split('-').map(Number);
    return new Date(y,m-1,d,12).toLocaleDateString('en-GB',withYear?{day:'numeric',month:'short',year:'numeric'}:{day:'numeric',month:'short'});
  }
  function formatTime(value){const d=new Date(value||0);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
  function activeBill(b){return !b?.archived&&!b?.paid&&b?.included!==false;}
  function nextBill(s){return arr(s?.finance?.bills).filter(activeBill).map(b=>({...b,_date:dateKey(b?.due)})).filter(b=>b._date).sort((a,b)=>a._date.localeCompare(b._date))[0]||null;}

  function attentionItems(s){
    const today=todayKey();
    const active=arr(s?.finance?.bills).filter(activeBill);
    const overdue=active.filter(b=>dateKey(b?.due)&&dateKey(b.due)<today);
    const dueToday=active.filter(b=>dateKey(b?.due)===today);
    const finance=overdue.length?{tone:'bad',icon:'🔴',source:'Finance',title:`${overdue.length} overdue bill${overdue.length===1?'':'s'}`,detail:'Payments are waiting to be completed.',href:'finance.html#potsPanel'}:dueToday.length?{tone:'bad',icon:'🔴',source:'Finance',title:`${dueToday.length} bill${dueToday.length===1?'':'s'} due today`,detail:'Complete today’s payments in Finance.',href:'finance.html#potsPanel'}:{tone:'good',icon:'🟢',source:'Finance',title:'Bills up to date',detail:'Nothing is overdue or due today.',href:'finance.html#potsPanel'};

    const pending=arr(s?.transfer?.registrationDrafts).filter(r=>!TERMINAL.has(upper(r?.status)));
    const registration=pending.length?{tone:'warn',icon:'🟠',source:'Registration',title:`${pending.length} registration${pending.length===1?'':'s'} pending`,detail:'Broker execution still needs confirmation.',href:'registration.html'}:{tone:'good',icon:'🟢',source:'Registration',title:'Registration clear',detail:'No pending transfer registrations found.',href:'registration.html'};

    const mission=s?.mission||{}, status=upper(mission?.status), budget=Math.max(0,num(mission?.approvedBudget));
    const transfer=budget>0&&!['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(status)?{tone:'info',icon:'🔵',source:'Transfer',title:`Mission ${status||'ACTIVE'}`,detail:`${money(Math.max(0,num(mission?.amountRemaining??budget-num(mission?.amountAllocated))))} remains in the current mission.`,href:'transfer.html'}:{tone:'good',icon:'🟢',source:'Transfer',title:'No active transfer mission',detail:'No released mission currently needs action.',href:'transfer.html'};

    const cached=readJson(INCOME_SUMMARY_KEY,{})||{};
    const annual=num(cached?.annualIncomeGbp??cached?.annualIncome??cached?.annual);
    const dated=arr(readJson(INCOME_CALENDAR_KEY,[])).filter(e=>dateKey(e?.payDate||e?.pay_date)).length+arr(s?.income?.calendar).filter(e=>dateKey(e?.payDate||e?.pay_date)).length;
    const income=annual>0&&dated<8?{tone:'warn',icon:'🟠',source:'Income',title:'Dividend calendar needs dates',detail:`Only ${dated} dated dividend event${dated===1?'':'s'} currently feed the runway.`,href:'income.html'}:{tone:'good',icon:'🟢',source:'Income',title:'Income engine active',detail:annual>0?`${money(annual)}/year forward income is being tracked.`:'Income Centre is available for the latest run-rate.',href:'income.html'};
    return [finance,registration,transfer,income];
  }

  function nextDividend(s){
    const cached=readJson(INCOME_SUMMARY_KEY,{})||{};
    if(cached?.nextDividend||cached?.next) return cached.nextDividend||cached.next;
    return [...arr(s?.income?.calendar),...arr(readJson(INCOME_CALENDAR_KEY,[]))].filter(e=>dateKey(e?.payDate||e?.pay_date)>=todayKey()).sort((a,b)=>dateKey(a?.payDate||a?.pay_date).localeCompare(dateKey(b?.payDate||b?.pay_date)))[0]||null;
  }

  function portfolioSummary(s){
    const holdings=arr(s?.squad?.holdings).filter(h=>!['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0);
    const tickers=new Set(holdings.map(h=>upper(h?.ticker||h?.name)).filter(Boolean));
    let value=0; holdings.forEach(h=>{const direct=num(h?.marketValueGbp??h?.currentValueGbp??h?.market_value_gbp),shares=num(h?.shares),price=num(h?.livePriceGbp??h?.priceGbp??h?.live_price_gbp);value+=direct||(shares*price);});
    return {positions:holdings.length,players:tickers.size,value};
  }

  function managerBriefing(s,items){
    const now=new Date(),greeting=now.getHours()<12?'Morning briefing':now.getHours()<17?'Afternoon briefing':'Evening briefing';
    const income=readJson(INCOME_SUMMARY_KEY,{})||{},annual=num(income?.annualIncomeGbp??income?.annualIncome??income?.annual),monthly=num(income?.monthlyIncomeGbp??income?.monthlyIncome??income?.monthly)||annual/12;
    const pot=arr(s?.finance?.pots).find(p=>!p?.archived&&String(p?.name||'').trim().toLowerCase()==='holding pot');
    const p=portfolioSummary(s),mission=s?.mission||{},missionActive=num(mission?.approvedBudget)>0&&!['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(upper(mission?.status));
    const urgent=items.filter(x=>x.tone==='bad'||x.tone==='warn'),next=urgent[0]||(missionActive?items[2]:items[0]);
    return {greeting,headline:urgent.length?`${urgent.length} item${urgent.length===1?'':'s'} need your attention`:'Club position is under control',report:urgent.length?`Aurora has ${urgent.length} manager item${urgent.length===1?'':'s'} to review. ${next.title}. The rest of the club remains available through the quick-look departments below.`:'No urgent manager action is currently showing. Finance, portfolio, income and system state are available below for a quick review.',money:`${pot?money(pot.balance):'—'} Holding Pot • ${monthly?money(monthly)+'/month income':'income checking'}`,portfolio:`${p.players} holdings • ${p.value?money(p.value):'value checking'}`,nextMove:next.title,nextHref:next.href,nextSource:next.source};
  }

  function recentActivity(s){
    const rows=[];
    arr(s?.finance?.payments).slice(0,6).forEach(p=>{const at=p?.paidAt||p?.createdAt||p?.updatedAt;if(at)rows.push({at,icon:'💷',title:`${p?.billName||'Bill'} completed`,detail:`${money(p?.amount)} • ${p?.fundingSource||'Finance'}`,href:'finance.html#potsPanel'});});
    arr(s?.registration?.receipts).slice(0,5).forEach(r=>{const at=r?.confirmedAt||r?.registeredAt||r?.createdAt||r?.updatedAt;if(at)rows.push({at,icon:'📝',title:`${r?.ticker||r?.name||'Trade'} registered`,detail:r?.account||r?.broker||'Registration',href:'registration.html'});});
    const mission=s?.mission;if(mission?.updatedAt||mission?.createdAt)rows.push({at:mission.updatedAt||mission.createdAt,icon:'🔄',title:`Transfer mission ${upper(mission?.status||'updated')}`,detail:num(mission?.approvedBudget)?`${money(mission.approvedBudget)} approved budget`:'Transfer mission changed',href:'transfer.html'});
    if(s?.updatedAt)rows.push({at:s.updatedAt,icon:'🏟️',title:'Club state updated',detail:'Canonical Aurora state changed',href:'index.html'});
    return rows.filter(x=>!Number.isNaN(new Date(x.at).getTime())).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,8);
  }

  function ensureStyles(){
    if(document.getElementById('nexusManagerInboxStyles'))return;
    const style=document.createElement('style');style.id='nexusManagerInboxStyles';style.textContent=`.nx-manager-dashboard{margin-top:20px}.nx-manager-brief{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:16px}.nx-manager-report{padding:22px;border:1px solid rgba(110,231,255,.18);border-radius:18px;background:linear-gradient(145deg,rgba(8,25,42,.94),rgba(3,12,23,.92))}.nx-manager-report h2{margin:5px 0 8px;font-size:28px}.nx-manager-report p{color:#9eb3c2;line-height:1.6;margin:0}.nx-report-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}.nx-report-grid div{padding:12px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06)}.nx-report-grid small{display:block;color:#6f91a4;font-size:9px}.nx-report-grid strong{display:block;color:#eefaff;margin-top:5px;font-size:12px}.nx-manager-next{padding:20px;border-radius:18px;border:1px solid rgba(255,196,82,.22);background:rgba(33,24,8,.44);display:flex;flex-direction:column;justify-content:space-between}.nx-manager-next small{color:#e8bd62;font-size:9px}.nx-manager-next strong{font-size:20px;margin:8px 0;color:#fff}.nx-manager-next p{color:#a99875;font-size:11px}.nx-inbox-nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.nx-inbox-nav a{padding:9px 12px;border-radius:999px;border:1px solid rgba(110,231,255,.18);background:rgba(5,20,34,.75);color:#c9eff8;text-decoration:none;font-size:10px;font-weight:800}.nx-inbox-source{display:inline-flex;margin-top:7px;padding:3px 7px;border-radius:999px;background:rgba(255,255,255,.05);font-size:8px;color:#7fa0b3}.nx-activity-list{display:grid;gap:9px}.nx-activity-item{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:11px;align-items:center;padding:11px 12px;border:1px solid rgba(110,231,255,.09);border-radius:12px;background:rgba(4,16,28,.5);text-decoration:none}.nx-activity-item strong{display:block;color:#edf9ff;font-size:11px}.nx-activity-item span{display:block;color:#7993a4;font-size:9px;margin-top:3px}.nx-activity-item time{font-size:8px;color:#66808f}@media(max-width:900px){.nx-manager-brief{grid-template-columns:1fr}.nx-report-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.nx-report-grid{grid-template-columns:1fr}.nx-manager-report h2{font-size:23px}}`;document.head.appendChild(style);
  }

  function mount(){
    ensureStyles();
    if(!document.getElementById('nxManagerDashboard')){
      const hero=document.querySelector('.nx-hero');if(hero){const section=document.createElement('section');section.className='nx-section nx-manager-dashboard';section.id='nxManagerDashboard';section.innerHTML=`<div class="nx-section-head"><div><span class="nx-kicker">MANAGER DASHBOARD</span><h2>Your Briefing & Inbox</h2></div><p>Read the report, deal with what needs attention, then jump straight to the department that owns the action.</p></div><div class="nx-manager-brief"><article class="nx-manager-report"><span class="nx-kicker" id="nxBriefGreeting">MANAGER BRIEFING</span><h2 id="nxBriefHeadline">Reading club state…</h2><p id="nxBriefReport">Aurora is preparing your current club briefing.</p><div class="nx-report-grid"><div><small>Money</small><strong id="nxBriefMoney">Checking…</strong></div><div><small>Portfolio</small><strong id="nxBriefPortfolio">Checking…</strong></div><div><small>Priority</small><strong id="nxBriefPriority">Checking…</strong></div></div><div class="nx-inbox-nav"><a href="#nxManagerInbox">📥 Inbox</a><a href="finance.html">💷 Finance</a><a href="transfer.html">🔄 Transfer</a><a href="registration.html">📝 Registration</a><a href="squad.html">⚽ Squad</a><a href="income.html">💰 Income</a></div></article><aside class="nx-manager-next"><div><small>NEXT MANAGER MOVE</small><strong id="nxBriefNext">Checking…</strong><p id="nxBriefNextMeta">Aurora is deciding which department deserves your attention first.</p></div><a class="nx-action" id="nxBriefNextLink" href="index.html">Open department →</a></aside></div>`;hero.insertAdjacentElement('afterend',section);}
      const inbox=document.getElementById('nxAttentionGrid')?.closest('.nx-section');if(inbox){inbox.id='nxManagerInbox';const k=inbox.querySelector('.nx-kicker');if(k)k.textContent='MANAGER INBOX';const h=inbox.querySelector('h2');if(h)h.textContent='Needs Your Attention';}
    }
    if(!document.getElementById('nxRecentActivity')){const health=document.querySelector('.nx-health-strip')?.closest('.nx-section'),section=document.createElement('section');section.className='nx-section';section.id='nxRecentActivity';section.innerHTML='<div class="nx-section-head"><div><span class="nx-kicker">RECENT ACTIVITY</span><h2>What Just Changed</h2></div><p>A short audit-style view of recent club-state changes.</p></div><div class="nx-panel"><div class="nx-activity-list" id="nxActivityList"></div></div>';if(health)health.parentNode.insertBefore(section,health);else document.querySelector('.nexus-page')?.appendChild(section);}
  }

  function render(providedState){
    mount(); const s=providedState&&typeof providedState==='object'?providedState:(readJson(STATE_KEY,{})||{}),items=attentionItems(s);
    const host=document.getElementById('nxAttentionGrid');if(host)host.innerHTML=items.map(item=>`<a class="nx-command-card nx-attention-card nx-inbox-card" href="${esc(item.href)}" data-tone="${esc(item.tone)}"><div class="icon">${item.icon}</div><small>INBOX</small><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span><em class="nx-inbox-source">${esc(item.source)}</em><b>OPEN ${esc(item.source).toUpperCase()} →</b></a>`).join('');
    const brief=managerBriefing(s,items);setText('nxBriefGreeting',brief.greeting.toUpperCase());setText('nxBriefHeadline',brief.headline);setText('nxBriefReport',brief.report);setText('nxBriefMoney',brief.money);setText('nxBriefPortfolio',brief.portfolio);setText('nxBriefPriority',brief.nextMove);setText('nxBriefNext',brief.nextMove);setText('nxBriefNextMeta',`${brief.nextSource} owns this action.`);const link=document.getElementById('nxBriefNextLink');if(link)link.href=brief.nextHref;
    const bill=nextBill(s);setText('nxComingBill',bill?`${bill.name||'Bill'} • ${money(bill.amount)}`:'No dated bill');setText('nxComingBillMeta',bill?formatDate(bill.due):'Finance');
    const div=nextDividend(s),divTicker=String(div?.ticker||div?.name||'Dividend'),divAmount=num(div?.amountGbp??div?.amount??div?.value);setText('nxComingDividend',div?`${divTicker}${divAmount?` • ${money(divAmount)}`:''}`:'No dated dividend');setText('nxComingDividendMeta',div?formatDate(div?.payDate||div?.pay_date):'Income');
    const payday=s?.finance?.plan?.paydayDate||'';setText('nxComingPayday',payday?formatDate(payday,true):'Not set');setText('nxComingPaydayMeta','Finance payday');
    const mission=s?.mission||{},status=upper(mission?.status),active=num(mission?.approvedBudget)>0&&!['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(status);setText('nxComingTransfer',active?(status||'ACTIVE'):'No active mission');setText('nxComingTransferMeta',active?`${money(mission?.amountRemaining??mission?.approvedBudget)} remaining`:'Transfer');
    const now=new Date();setText('nxComingReport',now.getHours()>=17?'Latest report':'5:00 PM today');setText('nxComingReportMeta','Match Report');
    const activity=document.getElementById('nxActivityList'),rows=recentActivity(s);if(activity)activity.innerHTML=rows.length?rows.map(row=>`<a class="nx-activity-item" href="${esc(row.href)}"><i>${row.icon}</i><div><strong>${esc(row.title)}</strong><span>${esc(row.detail)}</span></div><time>${esc(formatTime(row.at))}</time></a>`).join(''):'<div class="nx-route-status">No recent activity is recorded in the current canonical state.</div>';
    document.documentElement.dataset.nexusIntelligence=BUILD;
  }

  window.AuroraNexusHeadquartersIntelligence=Object.freeze({build:BUILD,render,mode:'child-renderer',ownsScheduling:false});
})();