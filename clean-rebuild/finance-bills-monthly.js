(() => {
  'use strict';

  const BUILD='20260904-finance-bills-monthly-paid-2-authoritative';
  const $=id=>document.getElementById(id);
  const arr=v=>Array.isArray(v)?v:[];
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.max(0,n):0};
  const round=v=>Number(num(v).toFixed(2));
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v));
  const parseDate=v=>{if(!v)return null;const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?null:d};
  const iso=d=>d&&!Number.isNaN(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';
  const today=()=>{const d=new Date();d.setHours(12,0,0,0);return d};
  const monthKey=v=>{const d=parseDate(v);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'undated'};
  const monthLabel=key=>{if(key==='undated')return'Date not set';const [y,m]=key.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});};
  const dueLabel=v=>{const d=parseDate(v);return d?d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}):'No due date';};
  const recurring=f=>['weekly','4-weeks','5-weeks','monthly','yearly'].includes(String(f||'').toLowerCase());
  const isHolding=v=>norm(v)==='holding pot';

  function nextDue(value,frequency){
    const f=String(frequency||'one-off').toLowerCase();
    const d=parseDate(value)||today();
    if(f==='weekly')d.setDate(d.getDate()+7);
    else if(f==='4-weeks')d.setDate(d.getDate()+28);
    else if(f==='5-weeks')d.setDate(d.getDate()+35);
    else if(f==='monthly'){
      const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+1);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
    } else if(f==='yearly'){
      const day=d.getDate(),month=d.getMonth();d.setFullYear(d.getFullYear()+1);if(d.getMonth()!==month)d.setDate(0);else d.setDate(day);
    } else return '';
    return iso(d);
  }

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
      .bill-paid-btn{background:#176b43!important;border-color:#2a9b65!important;color:#effff7!important;font-weight:900}
      .bill-paid-btn:hover{background:#1e7f50!important}
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
    const state=A.readState(),rows=activeBills(state).sort((a,b)=>String(a.due||'9999').localeCompare(String(b.due||'9999'))||String(a.name||'').localeCompare(String(b.name||''))),payments=history(state);
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
        return `<article class="finance-manage-card"><div><strong>${esc(b.name)}</strong><span>${money(b.amount)} · ${esc(b.frequency||'monthly')} · ${esc(b.fundingSource||'Holding Pot')}</span><small class="${overdue?'bill-overdue':''}">${esc(dueLabel(b.due))}${overdue?' · OVERDUE':''}</small></div><div class="finance-manage-actions"><button class="bill-paid-btn" data-paid-bill="${esc(b.id)}">✓ Mark as Paid</button><button data-edit-bill="${esc(b.id)}">Edit</button><button class="danger" data-delete-bill="${esc(b.id)}">Delete</button></div></article>`;
      }).join('')}</section>`;
    }).join('')}</div>`:'<p>No outstanding bills saved.</p>';

    const historyHtml=payments.length?`<div class="bill-paid-history"><details><summary>Paid History · ${payments.length} payment${payments.length===1?'':'s'} · ${money(paidTotal)}</summary>${payments.map(p=>`<div class="bill-history-row"><div><strong>${esc(p.name||'Bill')}</strong><span> · ${esc(p.fundingSource||'')} · due ${esc(p.due||'—')}</span></div><div><strong>${money(p.amount)}</strong><span> · paid ${esc(String(p.paidAt||'').slice(0,10))}</span></div></div>`).join('')}</details></div>`:'';

    host.innerHTML=`<div class="bill-manager-summary"><div><span>ACTIVE BILLS</span><strong>${rows.length}</strong></div><div><span>NEXT OCCURRENCES</span><strong>${money(nextOccurrenceTotal)}</strong></div><div><span>CURRENT PAYDAY CYCLE OUTSTANDING</span><strong>${money(cycleOutstanding)}</strong></div></div>${board}${historyHtml}`;
  }

  function recalcAll(){
    const E=window.AuroraFinanceEngine;if(!E)return;
    try{E.commitBills();}catch(_){}
    try{E.commitHolding();}catch(_){}
    try{E.commitPots();}catch(_){}
    try{E.commitDecision();}catch(_){}
  }

  function markPaid(id){
    const A=window.AuroraClean;if(!A?.readState||!A?.updateState)return;
    const state=A.readState();
    const bill=arr(state.finance?.bills).find(b=>String(b.id)===String(id));
    if(!bill)return;

    const expected=round(bill.amount);
    const raw=prompt(`Actual amount paid for ${bill.name||'this bill'}`,expected.toFixed(2));
    if(raw===null)return;
    const actual=round(raw);
    if(!(actual>0)){alert('Enter the actual amount paid.');return;}

    const paidAt=new Date().toISOString();
    const previousDue=String(bill.due||'').slice(0,10);
    const frequency=String(bill.frequency||'one-off').toLowerCase();
    const fundingSource=String(bill.fundingSource||'Holding Pot');

    A.updateState(next=>{
      next.finance=next.finance||{};
      const b=arr(next.finance.bills).find(x=>String(x.id)===String(id));
      if(!b)return;

      let holdingBalanceBefore=null;
      let holdingBalanceAfter=null;

      if(isHolding(fundingSource)){
        const holdingPot=arr(next.finance.pots).find(p=>!p?.archived&&isHolding(p?.name));
        holdingBalanceBefore=round(holdingPot?.balance ?? next.finance.holdingPotBalance);
        holdingBalanceAfter=round(Math.max(0,holdingBalanceBefore-actual));
        next.finance.holdingPotBalance=holdingBalanceAfter;
        if(holdingPot)holdingPot.balance=holdingBalanceAfter;
        next.finance.lastHoldingPotSpendAt=paidAt;
        next.finance.lastHoldingPotSpendAmount=actual;
        next.finance.lastHoldingPotSpendBillId=String(b.id);
      }

      next.finance.billPayments=arr(next.finance.billPayments);
      next.finance.billPayments.push({
        id:`BILLPAY-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        billId:String(b.id),
        name:String(b.name||'Bill'),
        amount:actual,
        expectedAmount:expected,
        variance:round(actual-expected),
        frequency,
        fundingSource,
        due:previousDue,
        paidAt,
        source:'FINANCE_BILLS_GREEN_MARK_PAID',
        holdingBalanceBefore,
        holdingBalanceAfter
      });

      b.lastPaidAt=paidAt;
      b.lastPaidAmount=actual;
      b.lastExpectedAmount=expected;
      b.lastPaidVariance=round(actual-expected);
      b.lastPaidDue=previousDue;

      if(recurring(frequency)){
        b.due=nextDue(previousDue,frequency);
        b.paid=false;
      }else{
        b.paid=true;
        b.paidDate=paidAt.slice(0,10);
      }

      next.finance.stage2Bills=null;
      next.finance.stage3HoldingPot=null;
      next.finance.stage4PotFunding=null;
      next.finance.stage5PaydayDecision=null;
      next.finance.lastSafeRelease=0;
      next.finance.lastManagerChangeAt=paidAt;
      next.finance.lastManagerChangeReason=`Bill paid: ${b.name}${isHolding(fundingSource)?` · Holding Pot ${money(holdingBalanceBefore)} → ${money(holdingBalanceAfter)}`:''}`;
    });

    recalcAll();
    setTimeout(render,0);
  }

  function boot(){
    if(!window.AuroraClean){setTimeout(boot,60);return;}
    render();
    document.addEventListener('click',e=>{
      const btn=e.target.closest?.('[data-paid-bill]');
      if(!btn)return;
      e.preventDefault();
      e.stopPropagation();
      markPaid(btn.dataset.paidBill);
    });
    window.addEventListener('aurora-clean:state',()=>setTimeout(render,0));
    window.AuroraFinanceBillsMonthly=Object.freeze({BUILD,render,markPaid});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
