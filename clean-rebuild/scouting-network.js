(() => {
  'use strict';
  const BUILD='20260910-scouting-network-4-render-fix';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pct=v=>`${num(v).toFixed(2)}%`;
  let page=0,query='',riskFilter='ALL',stageFilter='ALL',sortMode='rank';
  const PAGE_SIZE=100;

  function risk(row){const r=upper(row.payoutRisk);if(/HIGH|SEVERE|VERY HIGH/.test(r))return'HIGH';if(/LOW|SAFE/.test(r))return'LOW';if(/MED|MODERATE/.test(r))return'MEDIUM';return'UNKNOWN'}
  function hasValuation(row){return num(row.livePriceGbp)>0&&num(row.fairValueGbp)>0}
  function upside(row){const live=num(row.livePriceGbp),fair=num(row.fairValueGbp);return live>0&&fair>0?(fair/live-1)*100:0}
  function decisionState(row){
    const action=upper(row.decisionAction),permission=upper(row.buyPermission),gate=upper(row.valuationGate);
    const block=/SELL|AVOID|BLOCK|REJECT|DO NOT BUY|NO BUY/.test(`${action} ${permission} ${gate}`);
    const watch=!block&&/HOLD|WATCH|WAIT|PAUSE|REVIEW/.test(`${action} ${permission} ${gate}`);
    return{action,permission,gate,block,watch};
  }
  function missingEvidence(row,r,strength){const missing=[];if(!(num(row.yieldPct)>0))missing.push('yield');if(!(num(row.livePriceGbp)>0))missing.push('live price');if(!(num(row.annualDpsGbp)>0))missing.push('annual DPS');if(!String(row.sector||'').trim())missing.push('sector');if(r==='UNKNOWN')missing.push('payout risk');if(!hasValuation(row))missing.push('fair value');if(!(strength>0))missing.push('buy strength');return missing}
  function rankingBase(state){
    const A=window.AuroraClean;if(!A)return[];
    const base=A.scoutingRankings(state);
    return base.map(row=>{
      const y=Math.max(0,num(row.yieldPct)),strength=Math.max(0,Math.min(100,num(row.buyStrength))),up=upside(row),r=risk(row),valuationKnown=hasValuation(row),decision=decisionState(row);
      const valuationScore=valuationKnown?Math.max(0,Math.min(100,50+up*2)):20;
      const riskScore=r==='LOW'?100:r==='MEDIUM'?70:r==='HIGH'?15:20;
      const yieldScore=Math.min(100,y/12*100);
      const concentration=Math.max(0,100-num(row.exposurePct)*3.25);
      const diversification=Math.max(0,100-num(row.sectorExposurePct)*2.4);
      const evidence=[y>0,num(row.livePriceGbp)>0,num(row.annualDpsGbp)>0,!!String(row.sector||'').trim(),r!=='UNKNOWN',valuationKnown,strength>0];
      const dataQuality=evidence.filter(Boolean).length/evidence.length*100;
      const strategy=state.scouting?.strategy==='maximum'?'maximum':'sustainable';
      let score;
      if(strategy==='maximum')score=yieldScore*.38+strength*.23+valuationScore*.12+riskScore*.10+concentration*.07+diversification*.04+dataQuality*.06;
      else score=yieldScore*.25+strength*.23+valuationScore*.17+riskScore*.14+concentration*.09+diversification*.06+dataQuality*.06;
      if(valuationKnown&&up<-10)score-=8;
      if(r==='HIGH')score-=10;
      if(decision.watch)score-=4;
      if(decision.block)score-=20;
      score=Math.max(0,Math.min(100,score));
      const missing=missingEvidence(row,r,strength),complete=missing.length===0;
      const hardBlock=decision.block||r==='HIGH';
      const valuationCaution=valuationKnown&&up<-10;
      let verdict='BLOCKED';
      if(!hardBlock&&!decision.watch&&!valuationCaution&&score>=78&&complete&&strength>=60)verdict='STRONG BUY';
      else if(!hardBlock&&!decision.watch&&!valuationCaution&&score>=68&&complete&&strength>=50)verdict='BUY';
      else if(score>=45||y>0)verdict='WATCH';
      let stage='DEVELOPMENT WATCH';
      if(verdict==='STRONG BUY')stage='RECRUITMENT MEETING';
      else if(verdict==='BUY')stage='FULL REPORT';
      else if(verdict==='WATCH'&&score>=55)stage='DEEP SCOUT';
      const evidenceStatus=complete?'COMPLETE':`NEEDS ${missing.map(x=>x.toUpperCase()).join(' + ')}`;
      const cautions=[];
      if(decision.block)cautions.push('DECISION ENGINE VETO');
      else if(decision.watch)cautions.push('DECISION ENGINE WATCH');
      if(r==='HIGH')cautions.push('HIGH PAYOUT RISK');
      if(valuationCaution)cautions.push('>10% ABOVE FAIR VALUE');
      const readiness=cautions.length?cautions.join(' · '):evidenceStatus;
      return{...row,networkScore:Number(score.toFixed(1)),score:Number(score.toFixed(1)),risk:r,upsidePct:up,valuationScore,riskScore,dataQuality,stage,verdict,evidenceComplete:complete,evidenceStatus,readiness,missingEvidence:missing,decisionState:decision};
    }).sort((a,b)=>b.networkScore-a.networkScore||b.yieldPct-a.yieldPct||a.ticker.localeCompare(b.ticker));
  }
  function rankings(state){return rankingBase(state)}
  function coverage(state,rows){const counts=state.scouting?.universeCounts||{};const sourceRows=num(counts.watchlist)+num(counts.global)+num(counts.scout);const unique=rows.length;const validYield=rows.filter(x=>x.yieldPct>0).length;const fullData=rows.filter(x=>x.evidenceComplete).length;const lowRisk=rows.filter(x=>x.risk==='LOW').length;const top=rows.filter(x=>['BUY','STRONG BUY'].includes(x.verdict)).length;const gems=rows.filter(x=>!x.held&&['BUY','STRONG BUY'].includes(x.verdict)&&x.yieldPct>=5).length;const vetoed=rows.filter(x=>x.decisionState?.block).length;return{sourceRows,unique,validYield,fullData,lowRisk,top,gems,vetoed}}
  function ensure(){let host=$('scoutingNetwork');if(host)return host;const hero=document.querySelector('header.scouting-hero');if(!hero)return null;host=document.createElement('div');host.id='scoutingNetwork';host.className='scouting-network-shell';hero.insertAdjacentElement('afterend',host);return host}
  function ensureDrawer(){let b=$('scoutDrawerBackdrop'),d=$('scoutDrawer');if(!b){b=document.createElement('div');b.id='scoutDrawerBackdrop';b.className='scout-drawer-backdrop';document.body.appendChild(b);b.onclick=closeDrawer}if(!d){d=document.createElement('aside');d.id='scoutDrawer';d.className='scout-drawer';d.innerHTML='<button type="button" class="scout-drawer-close">✕</button><div id="scoutDrawerContent"></div>';document.body.appendChild(d);d.querySelector('button').onclick=closeDrawer}return{b,d}}
  function closeDrawer(){ $('scoutDrawerBackdrop')?.classList.remove('open');$('scoutDrawer')?.classList.remove('open'); }
  function openDrawer(ticker){
    const state=window.AuroraClean.readState(),row=rankingBase(state).find(x=>x.ticker===ticker);if(!row)return;
    const {b,d}=ensureDrawer(),c=$('scoutDrawerContent');const reasons=[];
    reasons.push(`${row.yieldPct.toFixed(2)}% forward yield`);
    if(row.buyStrength>0)reasons.push(`${num(row.buyStrength).toFixed(0)}/100 buy strength`);
    if(hasValuation(row))reasons.push(`${row.upsidePct.toFixed(1)}% fair-value upside`);
    if(row.risk==='LOW')reasons.push('low payout risk');
    if(row.held)reasons.push(`${num(row.exposurePct).toFixed(1)}% existing portfolio exposure`);else reasons.push('new diversification candidate');
    if(row.readiness!=='COMPLETE')reasons.push(row.readiness.toLowerCase());
    const sourceText=Array.isArray(row.enrichmentSources)&&row.enrichmentSources.length?row.enrichmentSources.join(' + '):(row.source||'Scouting universe');
    c.innerHTML=`<p class="eyebrow">CHIEF SCOUT REPORT</p><h2>${esc(row.ticker)}</h2><p>${esc(row.name||row.ticker)} · ${esc(row.sector||'Sector unclassified')}</p><div class="scout-drawer-grid"><div class="scout-drawer-stat"><span>NETWORK SCORE</span><strong>${row.networkScore.toFixed(1)}/100</strong></div><div class="scout-drawer-stat"><span>PIPELINE</span><strong>${esc(row.stage)}</strong></div><div class="scout-drawer-stat"><span>FORWARD YIELD</span><strong>${pct(row.yieldPct)}</strong></div><div class="scout-drawer-stat"><span>BUY STRENGTH</span><strong>${num(row.buyStrength).toFixed(0)}/100</strong></div><div class="scout-drawer-stat"><span>FAIR VALUE UPSIDE</span><strong>${hasValuation(row)?`${row.upsidePct.toFixed(1)}%`:'—'}</strong></div><div class="scout-drawer-stat"><span>PAYOUT RISK</span><strong>${esc(row.risk)}</strong></div><div class="scout-drawer-stat"><span>READINESS</span><strong>${esc(row.readiness)}</strong></div><div class="scout-drawer-stat"><span>DATA QUALITY</span><strong>${row.dataQuality.toFixed(0)}%</strong></div><div class="scout-drawer-stat"><span>PORTFOLIO EXPOSURE</span><strong>${num(row.exposurePct).toFixed(1)}%</strong></div><div class="scout-drawer-stat"><span>SECTOR EXPOSURE</span><strong>${num(row.sectorExposurePct).toFixed(1)}%</strong></div></div><h3>Why Aurora ranks it here</h3><p>${esc(reasons.join(' · '))}.</p><h3>Evidence source</h3><p>${esc(sourceText)}${row.evidenceUpdatedAt?` · source updated ${esc(row.evidenceUpdatedAt)}`:''}</p><div class="scout-score-bar"><div style="width:${row.networkScore}%"></div></div><h3>Verdict</h3><span class="scout-verdict ${row.verdict==='STRONG BUY'?'strong':row.verdict==='BUY'?'buy':row.verdict==='WATCH'?'watch':'block'}">${row.verdict}</span><p>${['BUY','STRONG BUY'].includes(row.verdict)?'Evidence and decision gates passed; eligible for the payday recruitment pool.':row.verdict==='WATCH'?`Not eligible for payday allocation yet · ${esc(row.readiness)}.`:'Blocked by risk/decision evidence or insufficient quality.'}</p>`;
    b.classList.add('open');d.classList.add('open');
  }
  function filtered(rows){let out=rows.filter(r=>!query||`${r.ticker} ${r.name} ${r.sector}`.toLowerCase().includes(query.toLowerCase()));if(riskFilter!=='ALL')out=out.filter(r=>r.risk===riskFilter);if(stageFilter!=='ALL')out=out.filter(r=>r.stage===stageFilter);if(sortMode==='yield')out.sort((a,b)=>b.yieldPct-a.yieldPct);else if(sortMode==='strength')out.sort((a,b)=>num(b.buyStrength)-num(a.buyStrength));else if(sortMode==='upside')out.sort((a,b)=>b.upsidePct-a.upsidePct);else out.sort((a,b)=>b.networkScore-a.networkScore);return out}
  function table(rows){const out=filtered(rows),pages=Math.max(1,Math.ceil(out.length/PAGE_SIZE));page=Math.min(page,pages-1);const shown=out.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);return `<div class="scout-controls"><input id="scoutSearch" placeholder="Search ticker, company or sector" value="${esc(query)}"><select id="scoutRisk"><option>ALL</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>UNKNOWN</option></select><select id="scoutStage"><option>ALL</option><option>RECRUITMENT MEETING</option><option>FULL REPORT</option><option>DEEP SCOUT</option><option>DEVELOPMENT WATCH</option></select><select id="scoutSort"><option value="rank">Network rank</option><option value="yield">Yield</option><option value="strength">Buy strength</option><option value="upside">Upside</option></select></div><div class="scout-table-wrap"><table class="scout-table"><thead><tr><th>Rank</th><th>Stock</th><th>Network Score</th><th>Yield</th><th>Buy Strength</th><th>Risk</th><th>Upside</th><th>Exposure</th><th>Pipeline</th><th>Verdict</th></tr></thead><tbody>${shown.map((r,i)=>`<tr><td class="scout-rank">#${page*PAGE_SIZE+i+1}</td><td><span class="scout-ticker scout-why" data-scout-ticker="${esc(r.ticker)}">${esc(r.ticker)}</span><span class="scout-sub">${esc(r.name||r.ticker)} · ${esc(r.sector||'Unclassified')}</span></td><td><strong>${r.networkScore.toFixed(1)}</strong></td><td>${r.yieldPct.toFixed(2)}%</td><td>${num(r.buyStrength).toFixed(0)}</td><td>${r.risk}</td><td>${hasValuation(r)?`${r.upsidePct.toFixed(1)}%`:'—'}</td><td>${num(r.exposurePct).toFixed(1)}%</td><td>${r.stage}</td><td><span class="scout-verdict ${r.verdict==='STRONG BUY'?'strong':r.verdict==='BUY'?'buy':r.verdict==='WATCH'?'watch':'block'}">${r.verdict}</span>${r.readiness!=='COMPLETE'?`<span class="scout-sub">${esc(r.readiness)}</span>`:''}</td></tr>`).join('')}</tbody></table></div><div class="scout-page-actions"><span>Showing ${shown.length?`${page*PAGE_SIZE+1}–${page*PAGE_SIZE+shown.length}`:'0'} of ${out.length} filtered · ${rows.length} total unique</span><div><button id="scoutPrev" ${page===0?'disabled':''}>Previous</button> <button id="scoutNext" ${page>=pages-1?'disabled':''}>Next</button></div></div>`}
  function render(){
    const A=window.AuroraClean;if(!A)return;const state=A.readState(),rows=rankingBase(state),c=coverage(state,rows),host=ensure();if(!host)return;const pipe={};rows.forEach(r=>pipe[r.stage]=(pipe[r.stage]||0)+1);
    host.innerHTML=`<section class="scout-network-panel"><div class="scout-network-head"><div><p class="eyebrow">NATIONAL SCOUTING NETWORK</p><h2>Universe coverage</h2><p>Aurora ranks the entire loaded scouting universe before narrowing it to the final payday recruitment plan.</p></div><span class="scout-network-badge">${c.unique.toLocaleString('en-GB')} UNIQUE STOCKS</span></div><div class="scout-network-grid"><article class="scout-network-kpi"><span>PLAYERS SCOUTED</span><strong>${c.unique.toLocaleString('en-GB')}</strong><small>${c.sourceRows.toLocaleString('en-GB')} Aurora source rows before broad market watch</small></article><article class="scout-network-kpi"><span>TOP PROSPECTS</span><strong>${c.top}</strong><small>BUY / STRONG BUY after all gates</small></article><article class="scout-network-kpi"><span>HIDDEN GEMS</span><strong>${c.gems}</strong><small>new holding · 5%+ yield · buy-ready</small></article><article class="scout-network-kpi"><span>LOW-RISK REPORTS</span><strong>${c.lowRisk}</strong><small>payout risk marked low/safe</small></article><article class="scout-network-kpi"><span>DECISION VETOES</span><strong>${c.vetoed}</strong><small>Decision Engine explicitly blocks buying</small></article><article class="scout-network-kpi"><span>VALID INCOME CANDIDATES</span><strong>${c.validYield}</strong><small>positive forward yield</small></article></div><div class="scout-funnel"><div class="scout-funnel-step"><strong>${c.sourceRows}</strong><span>AURORA SOURCE ROWS</span></div><div class="scout-funnel-step"><strong>${c.unique}</strong><span>UNIQUE TICKERS</span></div><div class="scout-funnel-step"><strong>${c.validYield}</strong><span>VALID YIELD</span></div><div class="scout-funnel-step"><strong>${c.fullData}</strong><span>FULL EVIDENCE</span></div><div class="scout-funnel-step"><strong>${c.top}</strong><span>BUY-READY</span></div></div></section><section class="scout-network-panel"><div class="scout-network-head"><div><p class="eyebrow">SCOUTING PIPELINE</p><h2>From development watch to recruitment meeting</h2><p>Yield, buy strength, valuation, payout risk, concentration, diversification and evidence quality are scored. Decision Engine vetoes, high payout risk and severe overvaluation cannot produce a BUY.</p></div><span class="scout-network-badge">${state.scouting?.strategy==='maximum'?'MAXIMUM INCOME':'SUSTAINABLE INCOME'}</span></div><div class="scout-pipeline"><article class="scout-pipeline-card"><strong>${pipe['DEVELOPMENT WATCH']||0}</strong><span>DEVELOPMENT WATCH</span><small>early/incomplete or blocked cases</small></article><article class="scout-pipeline-card"><strong>${pipe['DEEP SCOUT']||0}</strong><span>DEEP SCOUT</span><small>watchlist / evidence still developing</small></article><article class="scout-pipeline-card"><strong>${pipe['FULL REPORT']||0}</strong><span>FULL REPORT</span><small>BUY · all gates passed</small></article><article class="scout-pipeline-card"><strong>${pipe['RECRUITMENT MEETING']||0}</strong><span>RECRUITMENT MEETING</span><small>STRONG BUY · all gates passed</small></article></div></section><section class="scout-network-panel"><div class="scout-network-head"><div><p class="eyebrow">SCOUTING LEAGUE TABLE</p><h2>Full opportunity pool</h2><p>Search the full universe. Tap a ticker for score drivers, evidence sources and any blocking reason.</p></div><span class="scout-network-badge">TOP ${Math.min(PAGE_SIZE,filtered(rows).length)} ON PAGE</span></div>${table(rows)}</section>`;
    const q=$('scoutSearch'),rf=$('scoutRisk'),sf=$('scoutStage'),sm=$('scoutSort');if(rf)rf.value=riskFilter;if(sf)sf.value=stageFilter;if(sm)sm.value=sortMode;q?.addEventListener('input',e=>{query=e.target.value;page=0;render()});rf?.addEventListener('change',e=>{riskFilter=e.target.value;page=0;render()});sf?.addEventListener('change',e=>{stageFilter=e.target.value;page=0;render()});sm?.addEventListener('change',e=>{sortMode=e.target.value;page=0;render()});$('scoutPrev')?.addEventListener('click',()=>{page=Math.max(0,page-1);render()});$('scoutNext')?.addEventListener('click',()=>{page++;render()});host.querySelectorAll('[data-scout-ticker]').forEach(el=>el.addEventListener('click',()=>openDrawer(el.dataset.scoutTicker)));
  }
  function boot(){if(!window.AuroraClean){setTimeout(boot,50);return}ensureDrawer();render();window.addEventListener('aurora-clean:state',render);window.AuroraScoutingNetwork=Object.freeze({BUILD,rankings,coverage,render,openDrawer})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();