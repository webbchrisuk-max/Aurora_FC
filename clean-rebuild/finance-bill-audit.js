(() => {
  'use strict';
  const BUILD='20260901-clean-bill-audit-4-holding-deduction-loader';
  const MONTHLY_BILLS_SRC='finance-bills-monthly.js?v=20260829-finance-bills-monthly-paid-1';
  const ACTUAL_PAID_SRC='finance-bills-actual-paid.js?v=20260901-finance-bills-actual-paid-2-holding-deduction';
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const active=b=>b&&!b.archived&&b.included!==false&&!b.paid&&num(b.amount)>0;
  const exactKey=b=>[norm(b.name),num(b.amount).toFixed(2),String(b.frequency||'').toLowerCase(),norm(b.fundingSource)].join('|');
  const nearKey=b=>[norm(b.name).replace(/\b(shop|payment|bill)\b/g,'').replace(/\s+/g,' ').trim(),num(b.amount).toFixed(2),norm(b.fundingSource)].join('|');

  function loadActualPaid(){
    if(window.AuroraFinanceBillsActualPaid||[...document.scripts].some(s=>String(s.src||'').includes('finance-bills-actual-paid.js')))return;
    const script=document.createElement('script');script.src=ACTUAL_PAID_SRC;script.defer=true;document.head.appendChild(script);
  }

  function loadMonthlyBills(){
    if(window.AuroraFinanceBillsMonthly||[...document.scripts].some(s=>String(s.src||'').includes('finance-bills-monthly.js')))return;
    const script=document.createElement('script');
    script.src=MONTHLY_BILLS_SRC;
    script.defer=true;
    document.head.appendChild(script);
  }

  function groups(rows,keyFn){
    const map=new Map();
    rows.forEach(b=>{const k=keyFn(b);const arr=map.get(k)||[];arr.push(b);map.set(k,arr)});
    return [...map.values()].filter(g=>g.length>1);
  }

  function audit(state){
    const rows=(state?.finance?.bills||[]).filter(active);
    const exact=groups(rows,exactKey);
    const near=groups(rows,nearKey).filter(g=>!exact.some(e=>e.some(x=>g.includes(x))));
    const names=new Map();
    rows.forEach(b=>{const k=norm(b.name);const arr=names.get(k)||[];arr.push(b);names.set(k,arr)});
    const repeatedNames=[...names.values()].filter(g=>g.length>1);
    return {activeCount:rows.length,exact,near,repeatedNames};
  }

  function ensurePanel(){
    let host=document.getElementById('financeBillAudit');
    if(host)return host;
    const billsMain=document.querySelector('main[data-finance-tab="bills"]');
    if(!billsMain)return null;
    host=document.createElement('section');host.id='financeBillAudit';host.className='department-section finance-breakdown';
    host.innerHTML='<div class="section-heading"><div><p class="eyebrow finance-eyebrow">BILL AUDIT</p><h2>Duplicate check</h2></div><span id="financeBillAuditStatus">Checking…</span></div><div id="financeBillAuditBody"></div>';
    billsMain.insertBefore(host,billsMain.firstElementChild);
    return host;
  }

  function billLine(b){return `<li><strong>${b.name||'Unnamed bill'}</strong> · ${money(b.amount)} · ${b.frequency||'one-off'} · ${b.fundingSource||'Holding Pot'}${b.due?` · ${b.due}`:''}</li>`}

  function render(){
    const A=window.AuroraClean;if(!A?.readState)return;
    const host=ensurePanel();if(!host)return;
    const result=audit(A.readState());
    const status=document.getElementById('financeBillAuditStatus');
    const body=document.getElementById('financeBillAuditBody');
    const suspects=[...result.exact,...result.near];
    if(status)status.textContent=suspects.length?`${result.activeCount} active · ${suspects.length} duplicate group(s)`:`${result.activeCount} active · no duplicate groups found`;
    if(!body)return;
    if(!suspects.length){body.innerHTML='<p>No exact or near-duplicate active bills detected.</p>';return}
    body.innerHTML=`${result.exact.length?`<h3>Exact duplicates</h3>${result.exact.map((g,i)=>`<article class="finance-manage-card"><div><strong>Exact group ${i+1}</strong><ul>${g.map(billLine).join('')}</ul></div></article>`).join('')}`:''}${result.near.length?`<h3>Possible duplicates</h3>${result.near.map((g,i)=>`<article class="finance-manage-card"><div><strong>Review group ${i+1}</strong><ul>${g.map(billLine).join('')}</ul></div></article>`).join('')}`:''}`;
  }

  function boot(){if(!window.AuroraClean){setTimeout(boot,50);return}loadActualPaid();loadMonthlyBills();render();window.addEventListener('aurora-clean:state',render);window.addEventListener('pageshow',render);window.AuroraFinanceBillAudit=Object.freeze({BUILD,audit,render});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();