(() => {
  'use strict';

  const BUILD='20260904-finance-bills-monthly-3-display-only';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const parseDate=v=>{if(!v)return null;const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?null:d};
  const today=()=>{const d=new Date();d.setHours(12,0,0,0);return d};
  const monthKey=v=>{const d=parseDate(v);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'undated'};
  const monthLabel=key=>{if(key==='undated')return'Date not set';const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});};
  const dueLabel=v=>{const d=parseDate(v);return d?d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'No due date';};

  function ensureStyles(){
    if($('financeBillsMonthlyStyles'))return;
    const style=document.createElement('style');
    style.id='financeBillsMonthlyStyles';
    style.textContent=`
      .bill-month-board{display:grid;gap:16px;margin-top:16px}
      .bill-month{border:1px solid rgba(255,255,255,.08);border-radius:18px;overflow:hidden;background:rgba(5,15,27,.45)}
      .bill-month-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;background:linear-gradient(90deg,rgba(40,170,235,.12),rgba(255,255,255,.02));border-bottom:1px solid rgba(255,255,255,.07)}
      .bill-month-head h3{margin:0;font-size:1.05rem}.bill-month-head strong{font-size:1.15rem;color:#7fe4ff}
      .bill-month .finance-manage-card{border:0;border-bottom:1px solid rgba(255,255,255,.055);border-radius:0;margin:0}.bill-month .finance-manage-card:last-child{border-bottom:0}
      .bill-overdue{color:#ff9a8f!important}.bill-paid-history{margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}
      .bill-paid-history details{border:1px solid rgba(255,255,255,.07);border-radius:16px;background:rgba(255,255,255,.02);overflow:hidden}.bill-paid-history summary{cursor:pointer;padding:14px 16px;font-weight:900}
      .bill-history-row{display:flex;justify-content:space-between;gap:16px;padding:11px 16px;border-top:1px solid rgba(255,255,255,.05)}.bill-history-row span{color:#91a5b7}
      .bill-manager-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0}.bill-manager-summary>div{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.025)}.bill-manager-summary span{display:block;color:#8199ae;font-size:.72rem;font-weight:900;letter-spacing:.07em}.bill-manager-summary strong{display:block;margin-top:5px;font-size:1.3rem}
      @media(max-width:700px){.bill-manager-summary{grid-template-columns:1fr}.bill-month-head,.bill-history-row{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function activeBills(state){return arr(state.finance?.bills).filter(b=>!b.archived&&b.included!==false&&!b.paid&&num(b.amount)>0);}
  function history(state){return arr(state.finance?.billPayments).slice().sort((a,b)=>String(b.paidAt||'').localeCompare(String(a.paidAt||'')));}

  function render(){
    const A=window.AuroraClean,host=$('financeBillCards');if(!A||!host)return;
    ensureStyles();
    const state=A.readState();
    const rows=activeBills(state).sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999'))||String(a.name||'').localeCompare(String(b.name||'')));
    const payments=history(state);
    const groups=new Map();
    rows.forEach(b=>{const key=monthKey(b.due);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b)});
    const monthOrder=[...groups.keys()].sort((a,b)=>a==='undated'?1:b==='undated'?-1:a.localeCompare(b));
    const nextOccurrenceTotal=round(rows.reduce((s,b)=>s+num(b.amount),0));
    const cycle=state.finance?.stage2Bills;
    const cycleOutstanding=round((cycle?.cycle||[]).reduce((s,r)=>s+num(r.amount),0));
    const paidTotal=round(payments.reduce((s,p)=>s+num(p.amount),0));

    const board=monthOrder.length?`<div class="bill-month-board">${monthOrder.map(key=>{
      const bills=groups.get(key)||[],total=round(bills.reduce((s,b)=>s+num(b.amount),0));
      return `<section class="bill-month"><div class="bill-month-head"><h3>${esc(monthLabel(key))}</h3><strong>${money(total)}</strong></div>${bills.map(b=>{
        const due=parseDate(b.due),overdue=due&&due<today();
        return `<article class="finance-manage-card" data-bill-card="${esc(b.id)}"><div><strong>${esc(b.name)}</strong><span>${money(b.amount)} · ${esc(b.frequency||'monthly')} · ${esc(b.fundingSource||'Holding Pot')}</span><small class="${overdue?'bill-overdue':''}">${esc(dueLabel(b.due))}${overdue?' · OVERDUE':''}</small></div><div class="finance-manage-actions"><button data-edit-bill="${esc(b.id)}">Edit</button><button class="danger" data-delete-bill="${esc(b.id)}">Delete</button></div></article>`;
      }).join('')}</section>`;
    }).join('')}</div>`:'<p>No outstanding bills saved.</p>';

    const historyHtml=payments.length?`<div class="bill-paid-history"><details><summary>Paid History · ${payments.length} payment${payments.length===1?'':'s'} · ${money(paidTotal)}</summary>${payments.map(p=>`<div class="bill-history-row"><div><strong>${esc(p.name||'Bill')}</strong><span> · ${esc(p.fundingSource||'')} · due ${esc(p.due||'—')}</span></div><div><strong>${money(p.amount)}</strong><span> · paid ${esc(String(p.paidAt||'').slice(0,10))}</span></div></div>`).join('')}</details></div>`:'';

    host.innerHTML=`<div class="bill-manager-summary"><div><span>ACTIVE BILLS</span><strong>${rows.length}</strong></div><div><span>NEXT OCCURRENCES</span><strong>${money(nextOccurrenceTotal)}</strong></div><div><span>CURRENT PAYDAY CYCLE OUTSTANDING</span><strong>${money(cycleOutstanding)}</strong></div></div>${board}${historyHtml}`;
    window.dispatchEvent(new CustomEvent('aurora-finance:bills-rendered'));
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    render();
    window.addEventListener('aurora-clean:state',()=>setTimeout(render,0));
    window.addEventListener('pageshow',()=>setTimeout(render,0));
    window.AuroraFinanceBillsMonthly=Object.freeze({BUILD,render});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
