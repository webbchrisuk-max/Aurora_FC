(() => {
  'use strict';
  const BUILD='20260827-income-command-board-1';
  const TARGET_MONTHLY=2000;
  const SNAP='aurora-clean:income-snapshot:v1';
  const CASH='aurora-clean:broker-cash-snapshot:v1';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
  const upper=v=>String(v||'').trim().toUpperCase();
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const account=v=>{const s=upper(v);if(s==='IG'||s.includes('IG ISA'))return'IG ISA';if(s==='T212'||s.includes('212'))return'Trading 212 ISA';return String(v||'Unspecified')};
  function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
  function active(h){return !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(upper(h?.status||'ACTIVE'))&&num(h?.shares)>0}
  function metrics(state){
    const rows=arr(state.squad?.holdings).filter(active).map(h=>{const shares=num(h.shares),annual=Math.max(0,num(h.annualIncomeGbp)||shares*num(h.annualDpsGbp)),market=Math.max(0,num(h.marketValueGbp)||shares*num(h.livePriceGbp??h.priceGbp));return{ticker:upper(h.ticker),name:String(h.name||h.ticker||''),account:account(h.account),annual,monthly:annual/12,market,shares}}).filter(r=>r.ticker);
    const total=rows.reduce((s,r)=>s+r.annual,0),monthly=total/12;
    const broker=new Map();rows.forEach(r=>broker.set(r.account,(broker.get(r.account)||0)+r.annual));
    return{rows:rows.sort((a,b)=>b.annual-a.annual),annual:total,monthly,broker};
  }
  function future(){
    const snap=read(SNAP)?.snapshot||null;const list=arr(snap?.dividends).map(r=>{const d=new Date(r.payDate??r.pay_date??r.paymentDate??r.payment_date);const expected=Math.max(0,num(r.expectedAmountGbp??r.expected_amount_gbp??r.grossDividendGbp??r.gross_dividend_gbp));return{ticker:upper(r.ticker||r.symbol),account:account(r.account),date:Number.isNaN(d.getTime())?null:d,expected,status:upper(r.status||'FORECAST')}}).filter(r=>r.date&&r.date>=new Date(new Date().setHours(0,0,0,0))&&!/PAID|ARCHIVED|CANCELLED|CANCELED|MISSED/.test(r.status)).sort((a,b)=>a.date-b.date||b.expected-a.expected);
    return list;
  }
  function receivedYtd(){
    const snap=read(CASH)?.snapshot||null;const year=new Date().getFullYear();return arr(snap?.ledger).filter(r=>{const d=new Date(r.recordedAt||r.date||'');const ref=upper(r.reference||r.type||r.note||'');return !Number.isNaN(d.getTime())&&d.getFullYear()===year&&num(r.cashChangeGbp)>0&&(ref.includes('DIV')||ref.includes('DIVIDEND'));}).reduce((s,r)=>s+num(r.cashChangeGbp),0);
  }
  function ensure(){
    let host=$('incomeCommandBoard');if(host)return host;const hero=document.querySelector('header.department-hero');if(!hero)return null;host=document.createElement('section');host.id='incomeCommandBoard';host.className='income-command';hero.insertAdjacentElement('afterend',host);return host;
  }
  function render(){
    const A=window.AuroraClean,host=ensure();if(!A||!host)return;const state=A.readState(),m=metrics(state),next=future(),first=next[0]||null,received=receivedYtd(),progress=Math.min(100,m.monthly/TARGET_MONTHLY*100),gap=Math.max(0,TARGET_MONTHLY-m.monthly),annualTarget=TARGET_MONTHLY*12;
    const in30=next.filter(r=>r.date-new Date()<=30*86400000).reduce((s,r)=>s+r.expected,0),in90=next.filter(r=>r.date-new Date()<=90*86400000).reduce((s,r)=>s+r.expected,0);
    const brokers=['IG ISA','Trading 212 ISA'].map(name=>({name,annual:m.broker.get(name)||0}));const max=m.rows[0]?.annual||1;
    host.innerHTML=`<div class="income-command-hero"><div class="income-command-main"><div class="income-command-kicker">INCOME COMMAND</div><h2 class="income-command-title">${money(m.annual)} annual income</h2><p class="income-command-copy">Confirmed forward income from the current clean Squad.</p><div class="income-command-metrics"><div class="income-command-metric"><span>MONTHLY AVERAGE</span><strong>${money(m.monthly)}</strong></div><div class="income-command-metric"><span>NEXT 30 DAYS</span><strong>${money(in30)}</strong></div><div class="income-command-metric"><span>NEXT 90 DAYS</span><strong>${money(in90)}</strong></div><div class="income-command-metric"><span>RECEIVED YTD</span><strong>${money(received)}</strong></div></div></div><div class="income-target-card"><span>£2,000 / MONTH TARGET</span><strong>${progress.toFixed(1)}%</strong><small>${gap>0?`${money(gap)} per month still to build`:'Target achieved'} · annual target ${money(annualTarget)}</small><div class="income-target-track"><div style="width:${progress}%"></div></div></div></div><div class="income-command-grid"><article class="income-command-panel"><div class="income-command-kicker">BROKER INCOME</div><h3>Where the income sits</h3><div class="income-broker-grid">${brokers.map(b=>`<div class="income-broker-card"><span>${esc(b.name)}</span><strong>${money(b.annual)}/yr</strong><small>${money(b.annual/12)}/month · ${m.annual>0?(b.annual/m.annual*100).toFixed(1):'0.0'}% of income</small></div>`).join('')}</div></article><article class="income-command-panel"><div class="income-command-kicker">NEXT FIXTURE</div><h3>Next dividend</h3>${first?`<div class="income-next-card"><div><strong>${esc(first.ticker)}</strong><span>${esc(first.account)} · ${first.date.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span></div><div class="income-next-amount">${money(first.expected)}</div></div>`:'<div class="income-next-card"><div><strong>No future dated dividend</strong><span>Waiting for AuroraData 2 dividend evidence.</span></div></div>'}</article></div><article class="income-command-panel"><div class="income-command-kicker">INCOME LEAGUE TABLE</div><h3>Which holdings are doing the most work?</h3><div class="income-league-wrap"><table class="income-league"><thead><tr><th>#</th><th>HOLDING</th><th>BROKER</th><th>ANNUAL</th><th>MONTHLY</th><th>SHARE OF INCOME</th></tr></thead><tbody>${m.rows.length?m.rows.map((r,i)=>`<tr><td class="income-league-rank">${i+1}</td><td class="income-league-name"><strong>${esc(r.ticker)}</strong><small>${esc(r.name)}</small></td><td>${esc(r.account)}</td><td><strong>${money(r.annual)}</strong></td><td>${money(r.monthly)}</td><td class="income-league-bar"><div>${m.annual>0?(r.annual/m.annual*100).toFixed(1):'0.0'}%</div><div class="income-league-bar-track"><div style="width:${Math.min(100,r.annual/max*100)}%"></div></div></td></tr>`).join(''):'<tr><td colspan="6">No confirmed Squad income yet.</td></tr>'}</tbody></table></div><div class="income-command-foot">Forward income is read from Squad authority. Dated payments and received broker cash remain owned by AuroraData 2.</div></article>`;
  }
  function boot(){if(!window.AuroraClean){setTimeout(boot,60);return}render();window.addEventListener('aurora-clean:state',render);window.addEventListener('focus',render);document.getElementById('incomeRefresh')?.addEventListener('click',()=>setTimeout(render,1200));setInterval(()=>{if(document.visibilityState==='visible')render()},5000);window.AuroraIncomeCommand=Object.freeze({BUILD,render,TARGET_MONTHLY})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();