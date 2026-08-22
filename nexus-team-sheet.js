(() => {
  'use strict';
  const BUILD='20260822-nexus-team-sheet-1';
  const STATE_KEY='aurora2:state:v1';
  const BACKUP_KEY='aurora2:state:backup:lastgood';
  if(window.__AuroraNexusTeamSheet===BUILD)return;
  window.__AuroraNexusTeamSheet=BUILD;
  const arr=v=>Array.isArray(v)?v:[];
  const raw=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null};
  const num=v=>raw(v)??0;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const ticker=v=>String(v||'').trim().toUpperCase().replace(/^LON:/,'').replace(/\.L$/,'').replace(/\.GB$/,'').replace(/\..*$/,'');
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(v)||0);
  const pct=v=>`${Number(v)>0?'+':''}${(Number(v)||0).toFixed(2)}%`;
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
  function state(){return readJson(STATE_KEY)||readJson(BACKUP_KEY)||{}}
  function active(row){return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(String(row?.status||'ACTIVE').toUpperCase())&&num(row?.shares)>0}
  function metrics(row){const shares=num(row?.shares);const price=num(row?.livePriceGbp??row?.priceGbp??row?.live_price_gbp);const direct=num(row?.marketValueGbp??row?.currentValueGbp??row?.market_value_gbp);const value=shares>0&&price>0?shares*price:direct;const day=raw(row?.dailyChangePct??row?.dayChangePct??row?.todayChangePct??row?.changePct??row?.daily_change_pct??row?.day_change_pct);return{shares,value,day}}
  function players(){const map=new Map();arr(state()?.squad?.holdings).filter(active).forEach(row=>{const tk=ticker(row?.ticker||row?.name);if(!tk)return;const m=metrics(row);const x=map.get(tk)||{ticker:tk,name:String(row?.name||tk),value:0,shares:0,day:null,accounts:new Set()};x.value+=m.value;x.shares+=m.shares;if(x.day===null&&m.day!==null)x.day=m.day;const account=String(row?.account||'').toLowerCase();x.accounts.add(account.includes('212')?'T212':account.includes('ig')?'IG':'CHECK');map.set(tk,x)});return[...map.values()].map(x=>({...x,accounts:[...x.accounts]})).sort((a,b)=>b.value-a.value)}
  function ensureHost(){const bars=document.getElementById('nxBrokerBars');if(!bars)return null;let host=document.getElementById('nxTeamSheet');if(host)return host;host=document.createElement('section');host.id='nxTeamSheet';host.className='nx-team-sheet';bars.insertAdjacentElement('afterend',host);return host}
  function cls(day){return day===null?'flat':day>0.0001?'up':day<-.0001?'down':'flat'}
  function dayLabel(day){return day===null?'No daily feed':day>0?`▲ ${pct(day)}`:day<0?`▼ ${pct(day)}`:`• ${pct(day)}`}
  function open(tk){window.AuroraNexusPitchInteraction?.openDrawer?.(tk)}
  function render(){const host=ensureHost();if(!host)return;const all=players(),xi=all.slice(0,11),bench=all.slice(11,18),reserves=all.slice(18);host.innerHTML=`<div class="nx-team-head"><div><small>TEAM SHEET</small><strong>Starting XI</strong></div><span>${all.length} unique securities in the squad</span></div><div class="nx-team-list">${xi.map((p,i)=>`<button type="button" class="nx-team-row ${cls(p.day)}" data-team-player="${esc(p.ticker)}"><span class="nx-shirt">${i+1}</span><span class="nx-team-copy"><b>${esc(p.ticker)}</b><em>${esc(p.name)} • ${esc(p.accounts.join(' / '))}</em></span><span class="nx-team-value"><strong>${esc(money(p.value))}</strong><span>${esc(dayLabel(p.day))}</span></span></button>`).join('')}</div><div class="nx-bench-wrap"><div class="nx-bench-title"><strong>Bench</strong><span>Substitutes 12–18</span></div><div class="nx-bench">${bench.length?bench.map((p,i)=>`<button type="button" class="nx-bench-player ${cls(p.day)}" data-team-player="${esc(p.ticker)}"><i>${i+12}</i><b>${esc(p.ticker)}</b></button>`).join(''):'<span class="nx-reserves-note">No additional squad holdings outside the Starting XI.</span>'}</div>${reserves.length?`<div class="nx-reserves-note">Reserves: ${reserves.map(p=>esc(p.ticker)).join(' • ')}</div>`:''}</div>`;host.querySelectorAll('[data-team-player]').forEach(btn=>btn.addEventListener('click',()=>open(btn.dataset.teamPlayer)))}
  function boot(){render();window.addEventListener('aurora2:state',()=>setTimeout(render,0));window.addEventListener('aurora:market-live',()=>setTimeout(render,0));window.addEventListener('aurora:browser-auto-sync',()=>setTimeout(render,0));window.addEventListener('pageshow',()=>setTimeout(render,120));[500,1500,3000].forEach(ms=>setTimeout(render,ms))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.AuroraNexusTeamSheet=Object.freeze({build:BUILD,render});
})();
