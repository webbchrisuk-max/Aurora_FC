(() => {
  'use strict';

  const BUILD='20260925-scouting-stadium-2-fast-render';
  const SHORTLIST_KEY='aurora-clean:scouting-shortlist:v1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const unique=arr=>[...new Set(arr.filter(Boolean))];

  const DIVISIONS=[
    {name:'Premier League',key:'premier',icon:'♛',note:'Elite reports and immediate recruitment-meeting contenders.'},
    {name:'Championship',key:'championship',icon:'◆',note:'Strong promotion candidates with credible Aurora potential.'},
    {name:'League One',key:'league-one',icon:'▲',note:'Development reports that still require supporting evidence.'},
    {name:'League Two',key:'league-two',icon:'●',note:'Early-stage, lower-conviction or blocked candidates.'}
  ];

  let view={rows:[],source:'Aurora scouting engine',updatedAt:null,shortlist:new Set(loadShortlist()),selected:null};

  function loadShortlist(){
    try{const raw=JSON.parse(localStorage.getItem(SHORTLIST_KEY)||'[]');return Array.isArray(raw)?raw:[]}
    catch(_){return[]}
  }
  function saveShortlist(){
    localStorage.setItem(SHORTLIST_KEY,JSON.stringify([...view.shortlist]));
    if($('kpiMeeting'))$('kpiMeeting').textContent=String(view.shortlist.size);
  }
  function toast(message){
    const el=$('toast');if(!el)return;
    el.textContent=message;el.classList.add('show');
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1800);
  }
  function brokerLabel(row){
    return window.AuroraScoutingExecutionProfiles?.accountLabel?.(row)
      ||(upper(row?.preferredBroker).includes('IG')?'IG ISA':upper(row?.preferredBroker).includes('212')?'Trading 212 ISA':'Broker review');
  }
  function nativeMoney(value,currency){
    const n=num(value),c=upper(currency);
    if(!(n>0))return'—';
    if(c==='AUD')return`A$${n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}`;
    if(c==='USD')return`US$${n.toFixed(2)}`;
    if(c==='EUR')return`€${n.toFixed(2)}`;
    if(c==='GBP')return`£${n.toFixed(2)}`;
    return`${c?c+' ':''}${n.toFixed(2)}`;
  }
  function group(row){
    const text=`${row.role||''} ${row.sector||''}`.toLowerCase();
    if(/income|reit|property|dividend|real estate/.test(text))return'Income & Property';
    if(/financial|bank|insurance|asset management/.test(text))return'Financials';
    if(/quality|defensive|retail|consumer|tobacco/.test(text))return'Quality & Defensive';
    if(/cyclical|commodity|utility|construction|mining|materials|energy/.test(text))return'Cyclical & Utilities';
    return'General Recruitment';
  }
  function groupIcon(name){return({'Income & Property':'£','Financials':'▦','Quality & Defensive':'◆','Cyclical & Utilities':'↻','General Recruitment':'⌕'})[name]||'⌕'}
  function valuation(row){
    const up=num(row.upside);
    if(!(row.live>0&&row.fair>0))return'Unknown';
    if(up>=8)return'Undervalued';
    if(up<=-8)return'Overvalued';
    return'Neutral';
  }
  function confidence(row){
    const score=num(row.ranking);
    const quality=num(row.dataQuality);
    let out=score*.78+quality*.22;
    if(row.buyReady)out+=5;
    if(row.risk==='LOW')out+=3;
    return Math.round(clamp(out,35,98));
  }
  function normalize(input){
    const p=window.AuroraScoutingExecutionProfiles?.resolve?.(input)||input||{};
    const live=num(p.livePriceGbp),fair=num(p.fairValueGbp);
    const upside=Number.isFinite(num(p.upsidePct))&&num(p.upsidePct)!==0?num(p.upsidePct):(live>0&&fair>0?(fair/live-1)*100:0);
    const ranking=num(p.networkScore||p.score);
    return {
      ...p,
      ticker:upper(p.ticker),
      company_name:String(p.name||p.company_name||p.ticker||'').trim(),
      live,fair,upside,
      strength:num(p.buyStrength),
      impact:ranking,
      yieldPct:num(p.yieldPct),
      risk:upper(p.risk||p.payoutRisk||'UNKNOWN'),
      ranking,
      valuation:valuation({live,fair,upside}),
      verdict:upper(p.verdict||p.stage||'WATCH'),
      stage:String(p.stage||p.pipelineStage||'Development Watch'),
      role:String(p.role||''),
      sector:String(p.sector||''),
      buyReady:p.buyReady===true,
      held:p.held===true,
      broker:brokerLabel(p),
      marketSymbol:String(p.marketSymbol||p.ticker||''),
      executionMarket:String(p.executionMarket||p.market||''),
      executionCurrency:String(p.executionCurrency||p.currency||''),
      analystView:String(p.analystView||''),
      analystTarget:num(p.analystPriceTargetNative),
      brokerBuy:num(p.brokerBuyPriceNative),
      brokerYield:num(p.brokerYieldPct),
      dataQuality:num(p.dataQuality),
      source:String(p.source||''),
      notes:String(p.notes||''),
      readiness:String(p.readiness||p.evidenceStatus||'')
    };
  }
  function cleanRows(){
    const A=window.AuroraClean;if(!A?.readState)return[];
    const state=A.readState();
    const authority=window.AuroraScoutingNetwork?.rankings;
    const raw=typeof authority==='function'?authority(state):A.scoutingRankings(state);
    view.source=state.scouting?.enrichment?.workbook||state.scouting?.universeSource||state.scouting?.universeDiagnostics?.primaryWorkbook||'Aurora clean scouting engine';
    view.updatedAt=state.scouting?.enrichment?.lastRunAt||state.scouting?.universeLoadedAt||new Date().toISOString();
    return (Array.isArray(raw)?raw:[]).map(normalize).filter(r=>r.ticker).sort((a,b)=>b.ranking-a.ranking||b.yieldPct-a.yieldPct||a.ticker.localeCompare(b.ticker));
  }
  function divisionFor(row,rows=view.rows){
    const index=rows.findIndex(r=>r.ticker===row.ticker);
    if(index<0)return DIVISIONS[3];
    const band=Math.max(1,Math.ceil(rows.length/4));
    return DIVISIONS[Math.min(3,Math.floor(index/band))];
  }
  function divisionPosition(row){
    const d=divisionFor(row),same=view.rows.filter(r=>divisionFor(r).key===d.key);
    return same.findIndex(r=>r.ticker===row.ticker)+1;
  }
  function hiddenGem(row){return !row.held&&row.buyReady&&row.yieldPct>=5&&row.risk!=='HIGH'}
  function riskClass(row){return row.risk==='LOW'?'risk-low':row.risk==='HIGH'?'risk-high':'risk-medium'}
  function verdictClass(row){return /BUY/.test(row.verdict)?'verdict-buy':/BLOCK/.test(row.verdict)?'verdict-blocked':'verdict-watch'}
  function formFor(ticker){
    let h=0;for(const c of String(ticker))h=(h*31+c.charCodeAt(0))>>>0;
    return Array.from({length:5},(_,i)=>{const n=(h>>(i*3))%10;return n<5?'W':n<8?'D':'L'});
  }
  function shortName(name){return String(name||'').replace(/\b(plc|corp|corporation|group|limited|ltd|company|holdings?)\b/ig,'').replace(/\s+/g,' ').trim()}
  function xiPositions(){return[
    {left:50,top:88,role:'GK'},{left:17,top:68,role:'LB'},{left:39,top:69,role:'CB'},{left:61,top:69,role:'CB'},{left:83,top:68,role:'RB'},
    {left:24,top:46,role:'CM'},{left:50,top:47,role:'CM'},{left:76,top:46,role:'CM'},{left:22,top:21,role:'LW'},{left:50,top:18,role:'ST'},{left:78,top:21,role:'RW'}
  ]}

  function renderHeader(){
    const date=view.updatedAt?new Date(view.updatedAt):null;
    $('sourceLabel').textContent=view.source;
    $('updatedLabel').textContent=date&&!Number.isNaN(date.getTime())?date.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Updated now';
    $('livePill').textContent=view.rows.length?'LIVE DATA':'CONNECTING';
    $('livePill').classList.toggle('live',view.rows.length>0);
    $('commandTitle').textContent=view.rows.length?`${view.rows.length} candidates under observation`:'Scanning Aurora network';
  }
  function renderKpis(){
    const rows=view.rows,buyReady=rows.filter(r=>r.buyReady),gems=rows.filter(hiddenGem),low=rows.filter(r=>r.risk==='LOW');
    const best=[...rows].sort((a,b)=>b.yieldPct-a.yieldPct)[0];
    $('kpiScouted').textContent=String(rows.length);
    $('kpiProspects').textContent=String(buyReady.length);
    $('kpiGems').textContent=String(gems.length);
    $('kpiLowRisk').textContent=String(low.length);
    $('kpiIncome').textContent=best?.ticker||'—';
    $('kpiIncomeSub').textContent=best?`${best.yieldPct.toFixed(3)}% forward yield`:'Highest forward yield';
    $('kpiMeeting').textContent=String(view.shortlist.size);
  }
  function renderFlagship(){
    const ranked=view.rows;
    const top=ranked.find(r=>r.buyReady)||ranked[0];
    if(!top)return;
    $('directorTicker').textContent=top.ticker;
    $('directorName').textContent=`${top.company_name} is today's leading target`;
    const target=top.analystTarget>0?` · analyst target ${nativeMoney(top.analystTarget,top.analystPriceTargetCurrency||top.executionCurrency)}`:'';
    const analyst=top.analystView?` · ${top.analystView}`:'';
    $('directorReason').textContent=`${top.verdict} · ${top.yieldPct.toFixed(3)}% yield · ${top.broker} · ${top.readiness||'clean evidence review'}${target}${analyst}`;
    $('directorScore').textContent=`${confidence(top)}%`;
    $('directorMetrics').innerHTML=[
      `Yield ${top.yieldPct.toFixed(3)}%`,top.broker,top.executionMarket||'Market review',top.buyReady?'BUY READY':'RESEARCH',top.analystTarget>0?`Target ${nativeMoney(top.analystTarget,top.analystPriceTargetCurrency||top.executionCurrency)}`:''
    ].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('');
    $('directorOpen').onclick=()=>openDetail(top.ticker);
    $('rumourText').textContent=ranked.slice(0,5).map((r,i)=>`${i===0?'Director recommends':'Scout update'}: ${r.ticker} — ${r.verdict} · ${r.yieldPct.toFixed(3)}% · ${r.broker}`).join('   •   ')||'Aurora scouting network connected.';
  }
  function renderBestXI(){
    const ranked=view.rows,positions=xiPositions(),pitch=$('bestXiPitch');
    pitch.innerHTML='<i class="centre-circle"></i>'+ranked.slice(0,11).map((r,i)=>{
      const p=positions[i]||{left:50,top:50,role:'SC'};
      return `<button class="xi-player" type="button" data-open="${esc(r.ticker)}" style="left:${p.left}%;top:${p.top}%">
        <span class="xi-avatar">${esc(r.ticker.slice(0,4))}<i class="xi-role">${p.role}</i></span>
        <strong>${esc(r.ticker)}</strong><small>${esc(shortName(r.company_name)||r.company_name)}</small><span class="xi-rating">${Math.round(r.ranking)} scout</span>
      </button>`;
    }).join('');
    const bench=ranked.slice(11,16);
    $('bestXiBench').innerHTML=bench.length?bench.map(r=>`<button class="bench-card" type="button" data-open="${esc(r.ticker)}"><span class="bench-avatar">${esc(r.ticker.slice(0,4))}</span><span><strong>${esc(r.ticker)}</strong><span>${Math.round(r.ranking)} rating · ${confidence(r)}% confidence</span></span></button>`).join(''):'<div class="scout-empty">No bench players available yet.</div>';
  }
  function renderFormer(){
    const former=view.rows.filter(r=>/FORMER|RE-SCOUT|EXITED|SOLD/.test(upper(`${r.source} ${r.notes} ${r.stage}`)));
    $('formerCount').textContent=`${former.length} player${former.length===1?'':'s'}`;
    $('formerList').innerHTML=former.length?former.slice(0,12).map(r=>`<article class="former-row"><span class="former-avatar">${esc(r.ticker.slice(0,4))}</span><div><h4>${esc(r.company_name)}</h4><p>${esc(r.notes||'Former holding under fresh review.')}</p></div><em>${esc(r.verdict)}</em></article>`).join(''):'<div class="scout-empty">No former players are currently waiting for re-scouting.</div>';
  }
  function renderRadar(){
    const field=$('radarField');field.querySelectorAll('.radar-blip').forEach(n=>n.remove());
    const rows=view.rows.slice(0,12);$('radarCount').textContent=`Top ${rows.length} reports`;
    rows.forEach(row=>{
      const x=10+clamp(row.strength,0,100)*.8;
      const y=84-clamp(row.upside,-20,35)*1.45;
      const b=document.createElement('button');b.type='button';
      b.className=`radar-blip ${/BLOCK/.test(row.verdict)?'blocked':row.buyReady?'':'watch'}`;
      b.style.left=`${clamp(x,7,93)}%`;b.style.top=`${clamp(y,8,92)}%`;b.textContent=row.ticker;
      b.title=`${row.company_name} · score ${row.ranking.toFixed(1)} · upside ${row.upside.toFixed(1)}%`;
      b.onclick=()=>openDetail(row.ticker);field.appendChild(b);
    });
  }
  function renderRecommendations(){
    $('recommendList').innerHTML=view.rows.slice(0,7).map((r,i)=>`<button class="recommend-card" type="button" data-open="${esc(r.ticker)}"><span class="rank">${i+1}</span><span class="recommend-main"><strong>${esc(r.ticker)} · ${esc(r.company_name)}</strong><span>${esc(r.valuation)} · ${r.yieldPct.toFixed(3)}% · ${esc(r.broker)}</span></span><span class="recommend-score"><strong>${Math.round(r.ranking)}</strong><span>Scout rank</span></span></button>`).join('');
  }
  function assignmentDescription(name){
    return ({
      'Income & Property':'Income-led candidates, REITs and property-linked opportunities.',
      'Financials':'Banks, insurers and financial services candidates.',
      'Quality & Defensive':'Defensive cash-flow, consumer and quality-income candidates.',
      'Cyclical & Utilities':'Materials, mining, utilities and economically sensitive candidates.',
      'General Recruitment':'Candidates that need broader investigation before specialist assignment.'
    })[name]||'General candidate assessment.';
  }
  function renderAssignments(){
    const groups={};view.rows.forEach(r=>(groups[group(r)]??=[]).push(r));
    const entries=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length);
    $('assignmentCount').textContent=`${entries.length} assignments`;
    $('assignmentGrid').innerHTML=entries.map(([name,rows])=>{
      const best=[...rows].sort((a,b)=>b.ranking-a.ranking)[0];
      return `<article class="assignment"><div class="assignment-top"><span class="assignment-icon">${groupIcon(name)}</span><span class="status-pill">${rows.length} reports</span></div><h3>${esc(name)}</h3><p>${esc(assignmentDescription(name))}</p><footer><span>Lead: ${esc(best?.ticker||'—')}</span><span>${best?Math.round(best.ranking):0} rating</span></footer></article>`;
    }).join('');
  }
  function pipelineBucket(row){
    if(view.shortlist.has(row.ticker))return'Recruitment Meeting';
    if(/BLOCK/.test(row.verdict))return'Development Watch';
    if(/RECRUITMENT MEETING/i.test(row.stage))return'Recruitment Meeting';
    if(/FULL REPORT/i.test(row.stage))return'Full Report';
    if(/DEEP SCOUT/i.test(row.stage))return'Deep Scout';
    if(/DEVELOPMENT/i.test(row.stage))return'Development Watch';
    return'New Discovery';
  }
  function renderPipeline(){
    const stages=['New Discovery','Development Watch','Deep Scout','Full Report','Recruitment Meeting'];
    const counts=Object.fromEntries(stages.map(s=>[s,0]));view.rows.forEach(r=>counts[pipelineBucket(r)]++);
    $('pipelineGrid').innerHTML=stages.map((s,i)=>`<article class="pipeline-stage"><small>STAGE ${i+1}</small><strong>${counts[s]}</strong><span>${esc(s)}</span></article>`).join('');
  }
  function populateFilters(){
    $('leagueFilter').innerHTML='<option value="">All divisions</option>'+DIVISIONS.map(d=>`<option value="${d.key}">${d.name}</option>`).join('');
    $('roleFilter').innerHTML='<option value="">All assignments</option>'+unique(view.rows.map(group)).map(x=>`<option>${esc(x)}</option>`).join('');
    $('riskFilter').innerHTML='<option value="">All risk levels</option>'+unique(view.rows.map(r=>r.risk)).map(x=>`<option>${esc(x)}</option>`).join('');
  }
  function filteredRows(){
    const q=String($('searchInput')?.value||'').trim().toLowerCase(),div=$('leagueFilter')?.value||'',role=$('roleFilter')?.value||'',risk=$('riskFilter')?.value||'',sort=$('sortFilter')?.value||'rank';
    const rows=view.rows.filter(r=>{
      const hay=`${r.ticker} ${r.company_name} ${r.sector} ${r.role} ${r.broker} ${r.marketSymbol} ${r.executionMarket} ${r.analystView}`.toLowerCase();
      return(!q||hay.includes(q))&&(!div||divisionFor(r).key===div)&&(!role||group(r)===role)&&(!risk||r.risk===risk);
    });
    const sorters={rank:(a,b)=>b.ranking-a.ranking,strength:(a,b)=>b.strength-a.strength,yield:(a,b)=>b.yieldPct-a.yieldPct,upside:(a,b)=>b.upside-a.upside};
    return rows.sort(sorters[sort]||sorters.rank);
  }
  function renderReports(){
    const rows=filteredRows(),selected=$('leagueFilter')?.value||'',divs=selected?DIVISIONS.filter(d=>d.key===selected):DIVISIONS;
    $('resultCount').textContent=`${rows.length} report${rows.length===1?'':'s'} across ${divs.length} division${divs.length===1?'':'s'}`;
    $('reportGrid').innerHTML=divs.map(d=>leagueMarkup(d,rows.filter(r=>divisionFor(r).key===d.key))).join('');
  }
  function leagueMarkup(div,rows){
    const body=rows.length?rows.map(r=>leagueRow(r)).join(''):`<tr><td colspan="10"><div class="scout-empty">No matching reports in ${esc(div.name)}.</div></td></tr>`;
    return `<article class="scout-league"><header class="league-head"><div class="league-title"><span class="league-crest">${div.icon}</span><div><h3>${esc(div.name)}</h3><p>${esc(div.note)}</p></div></div><span class="league-count">${rows.length} club${rows.length===1?'':'s'}</span></header><div class="league-table-wrap"><table class="league-table"><thead><tr><th>Pos</th><th>Club</th><th>Scout desk</th><th>Score</th><th>Yield</th><th>Broker</th><th>Valuation</th><th>Risk</th><th>Verdict</th><th>Report</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
  }
  function leagueRow(r){
    const short=view.shortlist.has(r.ticker);
    return `<tr><td><strong>#${divisionPosition(r)}</strong></td><td><div class="club-cell"><strong>${esc(r.ticker)}</strong><span>${esc(r.company_name)} · ${esc(r.marketSymbol||r.ticker)}</span></div></td><td><span class="desk-pill">${esc(group(r))}</span></td><td><strong>${r.ranking.toFixed(1)}</strong></td><td><strong>${r.yieldPct.toFixed(3)}%</strong></td><td><span class="status-pill">${esc(r.broker)}</span></td><td>${esc(r.valuation)}<br><small>${r.live>0&&r.fair>0?`${r.upside>=0?'+':''}${r.upside.toFixed(1)}%`:'—'}</small></td><td><span class="${riskClass(r)}">${esc(r.risk)}</span></td><td><span class="${verdictClass(r)}">${esc(r.verdict)}</span></td><td><div class="league-actions"><button type="button" data-open="${esc(r.ticker)}">Open</button><button type="button" data-shortlist="${esc(r.ticker)}" class="${short?'active':''}">${short?'In XI':'Shortlist'}</button></div></td></tr>`;
  }
  function renderMeeting(){
    const rows=[...view.shortlist].map(t=>view.rows.find(r=>r.ticker===t)).filter(Boolean);
    $('meetingGrid').innerHTML=rows.length?rows.map(r=>`<article class="meeting-card"><h3>${esc(r.ticker)} · ${esc(r.company_name)}</h3><p>${esc(r.verdict)} · ${r.yieldPct.toFixed(3)}% yield · ${esc(r.broker)} · score ${r.ranking.toFixed(1)}</p><button type="button" data-remove="${esc(r.ticker)}">Remove from meeting</button></article>`).join(''):'<div class="scout-empty">No candidates shortlisted yet. Add reports from the league tables or full scout report.</div>';
  }
  function toggleShortlist(ticker){
    if(view.shortlist.has(ticker)){view.shortlist.delete(ticker);toast(`${ticker} removed from recruitment meeting`)}
    else{view.shortlist.add(ticker);toast(`${ticker} added to recruitment meeting`)}
    saveShortlist();renderKpis();renderPipeline();renderReports();renderMeeting();
    if(view.selected===ticker)openDetail(ticker,true);
  }
  function detailStat(label,value){return`<div class="detail-stat"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`}
  function openDetail(ticker,refreshOnly=false){
    const r=view.rows.find(x=>x.ticker===ticker);if(!r)return;view.selected=ticker;
    const shortlisted=view.shortlist.has(ticker);
    const analystTarget=r.analystTarget>0?nativeMoney(r.analystTarget,r.analystPriceTargetCurrency||r.executionCurrency):'—';
    const brokerBuy=r.brokerBuy>0?nativeMoney(r.brokerBuy,r.executionCurrency):'—';
    $('detailContent').innerHTML=`<div class="detail-hero"><button class="detail-close" id="detailCloseBtn" type="button">×</button><small>${esc(r.executionMarket||r.market||'AURORA SCOUT')} · ${esc(r.broker)}</small><h2>${esc(r.ticker)} — ${esc(r.company_name)}</h2><p>${esc(r.sector||'Sector unclassified')} · ${esc(group(r))}</p><span class="detail-score">Chief scout score ${r.ranking.toFixed(1)}</span></div>
      <div class="detail-grid">
        ${detailStat('Forward yield',`${r.yieldPct.toFixed(3)}%`)}
        ${detailStat('Broker yield',r.brokerYield>0?`${r.brokerYield.toFixed(3)}%`:'—')}
        ${detailStat('Buy account',r.broker)}
        ${detailStat('Market symbol',r.marketSymbol||r.ticker)}
        ${detailStat('Broker buy snapshot',brokerBuy)}
        ${detailStat('Analyst target',analystTarget)}
        ${detailStat('Analyst view',r.analystView||'—')}
        ${detailStat('Live price (GBP)',r.live>0?money(r.live):'—')}
        ${detailStat('Fair value (GBP)',r.fair>0?money(r.fair):'—')}
        ${detailStat('Valuation upside',r.live>0&&r.fair>0?`${r.upside>=0?'+':''}${r.upside.toFixed(1)}%`:'—')}
        ${detailStat('Buy strength',`${Math.round(r.strength)}/100`)}
        ${detailStat('Data quality',`${Math.round(r.dataQuality)}%`)}
      </div>
      <div class="detail-section"><h3>Scout verdict</h3><p>${esc(r.verdict)} · ${esc(r.stage)} · ${esc(r.readiness||'Evidence status unavailable')}.</p></div>
      <div class="detail-section"><h3>Execution route</h3><p>${esc(r.broker)} · ${esc(r.executionMarket||'market review')} · ${esc(r.executionCurrency||'currency review')} · symbol ${esc(r.marketSymbol||r.ticker)}.</p></div>
      <div class="detail-section"><h3>Income profile</h3><p>At the current ${r.yieldPct.toFixed(3)}% forward yield, £500 would project about ${money(500*r.yieldPct/100)} annual income and £2,000 about ${money(2000*r.yieldPct/100)} before tax, fees, FX changes or dividend changes.</p></div>
      <div class="detail-actions"><button id="detailShortlistBtn" type="button">${shortlisted?'Remove from meeting':'Add to recruitment meeting'}</button><a href="transfer.html">Open Transfer Centre</a></div>`;
    $('detailCloseBtn').onclick=closeDetail;$('detailShortlistBtn').onclick=()=>toggleShortlist(ticker);
    if(!refreshOnly)document.body.classList.add('scout-detail-open');
  }
  function closeDetail(){document.body.classList.remove('scout-detail-open');view.selected=null}

  function render(){
    view.rows=cleanRows();
    renderHeader();renderKpis();renderFlagship();renderBestXI();renderFormer();renderRadar();renderRecommendations();renderAssignments();renderPipeline();
    const league=$('leagueFilter')?.value,role=$('roleFilter')?.value,risk=$('riskFilter')?.value,sort=$('sortFilter')?.value,search=$('searchInput')?.value;
    populateFilters();
    if($('leagueFilter')&&league!==undefined)$('leagueFilter').value=league;
    if($('roleFilter')&&role!==undefined)$('roleFilter').value=role;
    if($('riskFilter')&&risk!==undefined)$('riskFilter').value=risk;
    if($('sortFilter')&&sort)$('sortFilter').value=sort;
    if($('searchInput')&&search!==undefined)$('searchInput').value=search;
    renderReports();renderMeeting();
  }

  let timer=null;
  function schedule(delay=250){clearTimeout(timer);timer=setTimeout(render,delay)}
  function bind(){
    ['searchInput','leagueFilter','roleFilter','riskFilter','sortFilter'].forEach(id=>{
      $(id)?.addEventListener(id==='searchInput'?'input':'change',renderReports);
    });
    document.addEventListener('click',event=>{
      const open=event.target.closest('[data-open]');if(open){openDetail(open.dataset.open);return}
      const shortlist=event.target.closest('[data-shortlist]');if(shortlist){toggleShortlist(shortlist.dataset.shortlist);return}
      const remove=event.target.closest('[data-remove]');if(remove){toggleShortlist(remove.dataset.remove);return}
    });
    $('clearMeetingBtn')?.addEventListener('click',()=>{view.shortlist.clear();saveShortlist();renderKpis();renderPipeline();renderReports();renderMeeting();toast('Recruitment meeting cleared')});
    $('detailOverlay')?.addEventListener('click',closeDetail);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail()});
  }
  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return}
    bind();render();
    window.addEventListener('aurora-clean:state',()=>schedule(120));
    window.addEventListener('aurora:market-prices',()=>schedule(160));
    window.addEventListener('pageshow',event=>{if(event.persisted)schedule(80)});
    window.AuroraScoutingStadium=Object.freeze({BUILD,render,openDetail,toggleShortlist});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();