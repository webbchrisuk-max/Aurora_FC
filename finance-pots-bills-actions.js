(() => {
  'use strict';

  const BUILD = '20260820-finance-pots-bills-actions-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';
  let ready = false;
  let lastError = null;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const isHolding = value => norm(value) === 'holding pot';
  const isoNow = () => new Date().toISOString();
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthKey = key => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
    d.setMonth(d.getMonth() + 1);
    return monthKey(d);
  };
  const clone = value => {
    try { return structuredClone(value); }
    catch (_) { return JSON.parse(JSON.stringify(value)); }
  };

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) { return null; }
  }

  function backupCurrent(rawText, reason) {
    if (!rawText) return;
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') return;
    localStorage.setItem(BACKUP_KEY, rawText);
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify({ at: isoNow(), reason, schemaVersion: Number(parsed.schemaVersion) || null }));
  }

  function commitFinance(mutator, reason) {
    const raw = localStorage.getItem(STATE_KEY);
    const current = readState();
    if (!current?.finance) throw new Error('AURORA_FINANCE_STATE_NOT_FOUND');
    backupCurrent(raw, reason);
    const draft = clone(current);
    const nextFinance = mutator(clone(draft.finance), draft);
    if (!nextFinance || typeof nextFinance !== 'object') throw new Error('FINANCE_MUTATION_INVALID');
    const now = isoNow();
    const next = { ...draft, updatedAt: now, finance: { ...nextFinance, lastCalculatedAt: now } };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    return next;
  }

  function uid(prefix) {
    try {
      if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    } catch (_) {}
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function dateISO(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addMonthsClamped(d, months) {
    const x = new Date(d.getTime()), day = x.getDate();
    x.setDate(1); x.setMonth(x.getMonth() + months);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
    return x;
  }
  function nextDue(date, frequency) {
    const d = parseLocalDate(date);
    if (!d) return '';
    if (frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (frequency === '4-weeks') d.setDate(d.getDate() + 28);
    else if (frequency === '5-weeks') d.setDate(d.getDate() + 35);
    else if (frequency === 'monthly') return dateISO(addMonthsClamped(d, 1));
    else if (frequency === 'yearly') return dateISO(addMonthsClamped(d, 12));
    return dateISO(d);
  }
  function commitmentType(bill) {
    if (['fixed_monthly','rolling_monthly','recurring_yearly','one_off'].includes(bill?.commitmentType)) return bill.commitmentType;
    if (bill?.frequency === 'yearly') return 'recurring_yearly';
    if (bill?.frequency === 'monthly') return bill?.due ? 'fixed_monthly' : 'rolling_monthly';
    return 'one_off';
  }

  function actionHost() {
    return document.getElementById('potsPanel');
  }

  function installStyles() {
    if (document.getElementById('financePotsBillsActionsStyle')) return;
    const style = document.createElement('style');
    style.id = 'financePotsBillsActionsStyle';
    style.textContent = `
      .finance-actions-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}.finance-actions-toolbar button,.finance-editor-actions button,.finance-row-actions button{border:1px solid rgba(110,231,255,.22);background:rgba(5,20,34,.86);color:#dff6ff;border-radius:10px;padding:9px 12px;font:700 10px/1.1 inherit;cursor:pointer}.finance-actions-toolbar button:hover,.finance-editor-actions button:hover,.finance-row-actions button:hover{border-color:rgba(110,231,255,.55)}.finance-editor-actions .danger,.finance-row-actions .danger{border-color:rgba(255,104,104,.34);color:#ffb2b2}.finance-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.finance-editor-card{border:1px solid rgba(110,231,255,.14);border-radius:16px;background:rgba(3,14,25,.72);padding:16px}.finance-editor-card[hidden]{display:none!important}.finance-editor-card h4{margin:0 0 12px;color:#eef7ff}.finance-editor-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.finance-editor-fields label{display:flex;flex-direction:column;gap:5px;color:#8ea6b7;font-size:10px}.finance-editor-fields input,.finance-editor-fields select{width:100%;box-sizing:border-box;border:1px solid rgba(110,231,255,.16);background:#071522;color:#eef7ff;border-radius:9px;padding:10px}.finance-editor-fields .wide{grid-column:1/-1}.finance-editor-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.finance-action-list{display:grid;gap:8px;margin-top:12px}.finance-action-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid rgba(110,231,255,.10);border-radius:12px;background:rgba(4,16,28,.55)}.finance-action-row strong{display:block;color:#eef7ff}.finance-action-row span{display:block;color:#8096a7;font-size:10px;margin-top:4px}.finance-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.finance-action-status{margin-top:10px;color:#8ea6b7;font-size:10px}.finance-action-status.good{color:#85e6aa}.finance-action-status.bad{color:#ff9f9f}@media(max-width:760px){.finance-actions-grid{grid-template-columns:1fr}.finance-editor-fields{grid-template-columns:1fr}.finance-action-row{grid-template-columns:1fr}.finance-row-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function installActionsMarkup() {
    const panel = actionHost();
    if (!panel || panel.dataset.auroraPotsBillsActions === '1') return Boolean(panel);
    panel.dataset.auroraPotsBillsActions = '1';
    const section = document.createElement('section');
    section.className = 'finance-panel';
    section.id = 'financePotsBillsActions';
    section.style.marginTop = '12px';
    section.innerHTML = `
      <div class="finance-panel-head"><div><span class="finance-panel-kicker">Finance Actions</span><h3>Pots & Bills Control</h3></div><span class="rule-chip green">BACKED UP WRITES</span></div>
      <div class="finance-actions-toolbar">
        <button type="button" data-action="new-pot">+ Add Pot</button>
        <button type="button" data-action="new-bill">+ Add Bill</button>
        <button type="button" data-action="undo-payment">Undo Last Payment</button>
      </div>
      <div class="finance-actions-grid">
        <div class="finance-editor-card" id="financePotEditor" hidden>
          <h4>Pot Editor</h4>
          <input type="hidden" data-pot="id">
          <div class="finance-editor-fields">
            <label class="wide">Name<input data-pot="name" type="text" maxlength="80"></label>
            <label>Balance<input data-pot="balance" type="number" min="0" step="0.01"></label>
            <label>Target<input data-pot="target" type="number" min="0" step="0.01"></label>
            <label>Funding per payday<input data-pot="funding" type="number" min="0" step="0.01"></label>
            <label>Deadline<input data-pot="deadline" type="date"></label>
            <label>Priority<select data-pot="priority"><option value="1">P1 Critical</option><option value="2">P2 Important</option><option value="3">P3 Flexible</option></select></label>
            <label>Progress mode<select data-pot="goalMode"><option value="balance">Balance</option><option value="funded-progress">Funded progress</option></select></label>
            <label>Already spent<input data-pot="spent" type="number" min="0" step="0.01"></label>
          </div>
          <div class="finance-editor-actions"><button type="button" data-action="save-pot">Save Pot</button><button type="button" data-action="cancel-pot">Cancel</button></div>
        </div>
        <div class="finance-editor-card" id="financeBillEditor" hidden>
          <h4>Bill Editor</h4>
          <input type="hidden" data-bill="id">
          <div class="finance-editor-fields">
            <label class="wide">Name<input data-bill="name" type="text" maxlength="100"></label>
            <label>Amount<input data-bill="amount" type="number" min="0" step="0.01"></label>
            <label>Commitment<select data-bill="type"><option value="one_off">One-off</option><option value="fixed_monthly">Fixed monthly</option><option value="rolling_monthly">Rolling monthly</option><option value="recurring_yearly">Recurring yearly</option></select></label>
            <label>Due date<input data-bill="due" type="date"></label>
            <label>Frequency<select data-bill="frequency"><option value="one-off">One-off</option><option value="weekly">Weekly</option><option value="4-weeks">Every 4 weeks</option><option value="5-weeks">Every 5 weeks</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
            <label>Funding source<select data-bill="funding"></select></label>
            <label>Category<input data-bill="category" type="text" maxlength="60" value="Other"></label>
            <label>Planning<select data-bill="included"><option value="true">Included</option><option value="false">Excluded</option></select></label>
          </div>
          <div class="finance-editor-actions"><button type="button" data-action="save-bill">Save Bill</button><button type="button" data-action="cancel-bill">Cancel</button></div>
        </div>
      </div>
      <div class="finance-action-list" id="financePotActionList"></div>
      <div class="finance-action-list" id="financeBillActionList"></div>
      <div class="finance-action-status" id="financePotsBillsActionStatus">Ready. Every change creates a last-good backup first.</div>`;
    panel.appendChild(section);
    return true;
  }

  function potField(key) { return q(`[data-pot="${key}"]`, document.getElementById('financePotEditor')); }
  function billField(key) { return q(`[data-bill="${key}"]`, document.getElementById('financeBillEditor')); }
  function status(message, tone = '') {
    const el = document.getElementById('financePotsBillsActionStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `finance-action-status ${tone}`.trim();
  }

  function setBillFundingOptions(selected = '') {
    const select = billField('funding');
    if (!select) return;
    const s = readState();
    const pots = (s?.finance?.pots || []).filter(p => !p.archived);
    const options = ['Current Account', ...pots.map(p => p.name).filter(Boolean)];
    select.innerHTML = [...new Set(options)].map(name => `<option value="${String(name).replaceAll('&','&amp;').replaceAll('"','&quot;')}">${String(name).replaceAll('&','&amp;').replaceAll('<','&lt;')}</option>`).join('');
    select.value = options.includes(selected) ? selected : 'Current Account';
  }

  function newPot() {
    const box = document.getElementById('financePotEditor');
    if (!box) return;
    ['id','name','balance','target','funding','deadline','spent'].forEach(k => { const f = potField(k); if (f) f.value = ''; });
    potField('priority').value = '2'; potField('goalMode').value = 'balance';
    box.hidden = false; box.scrollIntoView({ behavior:'smooth', block:'center' });
  }
  function editPot(id) {
    const p = (readState()?.finance?.pots || []).find(x => x.id === id);
    if (!p) return;
    const box = document.getElementById('financePotEditor');
    potField('id').value = p.id || ''; potField('name').value = p.name || ''; potField('balance').value = num(p.balance).toFixed(2); potField('target').value = num(p.target).toFixed(2); potField('funding').value = num(p.fundingOverride || p.fundingPerPayday).toFixed(2); potField('deadline').value = p.deadline || ''; potField('priority').value = String(Number(p.priority) || 2); potField('goalMode').value = p.goalMode === 'funded-progress' ? 'funded-progress' : 'balance'; potField('spent').value = num(p.spent).toFixed(2);
    box.hidden = false; box.scrollIntoView({ behavior:'smooth', block:'center' });
  }
  function savePot() {
    const id = potField('id').value || uid('POT');
    const name = String(potField('name').value || '').trim();
    if (!name) throw new Error('Enter a pot name.');
    commitFinance(finance => {
      const pots = [...(finance.pots || [])];
      const index = pots.findIndex(p => p.id === id);
      const existing = index >= 0 ? pots[index] : null;
      const holding = isHolding(name);
      const item = {
        ...(existing || {}), id, name,
        balance: num(potField('balance').value), target: num(potField('target').value),
        fundingOverride: holding ? 0 : num(potField('funding').value),
        fundingPerPayday: holding ? 0 : num(existing?.fundingPerPayday),
        deadline: holding ? '' : String(potField('deadline').value || ''),
        priority: Number(potField('priority').value || 2),
        goalMode: holding ? 'balance' : (potField('goalMode').value === 'funded-progress' ? 'funded-progress' : 'balance'),
        spent: holding ? 0 : (potField('goalMode').value === 'funded-progress' ? num(potField('spent').value) : 0),
        archived: Boolean(existing?.archived), createdAt: existing?.createdAt || isoNow(), updatedAt: isoNow()
      };
      if (index >= 0) pots[index] = item; else pots.push(item);
      return { ...finance, pots };
    }, 'pre-finance-pot-save');
    document.getElementById('financePotEditor').hidden = true;
    status(`${name} saved.`, 'good'); renderActionLists();
  }
  function togglePot(id) {
    commitFinance(finance => ({ ...finance, pots:(finance.pots || []).map(p => p.id === id ? { ...p, archived:!p.archived, updatedAt:isoNow() } : p) }), 'pre-finance-pot-archive');
    status('Pot archive state updated.', 'good'); renderActionLists();
  }

  function newBill() {
    const box = document.getElementById('financeBillEditor');
    ['id','name','amount','due'].forEach(k => { const f=billField(k); if(f) f.value=''; });
    billField('type').value='one_off'; billField('frequency').value='one-off'; billField('category').value='Other'; billField('included').value='true';
    setBillFundingOptions('Current Account'); box.hidden=false; box.scrollIntoView({behavior:'smooth',block:'center'}); updateBillDateRequirement();
  }
  function editBill(id) {
    const b = (readState()?.finance?.bills || []).find(x => x.id === id);
    if (!b) return;
    const box=document.getElementById('financeBillEditor');
    billField('id').value=b.id||''; billField('name').value=b.name||''; billField('amount').value=num(b.amount).toFixed(2); billField('type').value=commitmentType(b); billField('due').value=b.due||''; billField('frequency').value=b.frequency||'one-off'; billField('category').value=b.category||'Other'; billField('included').value=b.included===false?'false':'true'; setBillFundingOptions(b.fundingSource||'Current Account'); box.hidden=false; box.scrollIntoView({behavior:'smooth',block:'center'}); updateBillDateRequirement();
  }
  function updateBillDateRequirement() {
    const type=billField('type')?.value||'one_off'; const due=billField('due'); if(!due)return;
    const rolling=type==='rolling_monthly'; due.disabled=rolling; due.required=type==='fixed_monthly'||type==='recurring_yearly'; if(rolling)due.value='';
    if(type==='recurring_yearly') billField('frequency').value='yearly';
    else if(type==='fixed_monthly'||type==='rolling_monthly') billField('frequency').value='monthly';
    else if(type==='one_off' && billField('frequency').value==='monthly') billField('frequency').value='one-off';
  }
  function saveBill() {
    const id=billField('id').value||uid('BILL'); const name=String(billField('name').value||'').trim(); if(!name)throw new Error('Enter a bill name.');
    const type=billField('type').value||'one_off'; const due=type==='rolling_monthly'?'':String(billField('due').value||'');
    if((type==='fixed_monthly'||type==='recurring_yearly')&&!due)throw new Error('Choose a genuine due date for this commitment.');
    commitFinance(finance=>{
      const bills=[...(finance.bills||[])]; const index=bills.findIndex(b=>b.id===id); const existing=index>=0?bills[index]:null;
      const item={...(existing||{}),id,name,amount:num(billField('amount').value),due,frequency:billField('frequency').value||'one-off',commitmentType:type,recurrence:type==='one_off'?'none':type==='recurring_yearly'?'yearly':'monthly',occurrenceMonth:type==='rolling_monthly'?(commitmentType(existing)==='rolling_monthly'&&existing?.occurrenceMonth?existing.occurrenceMonth:monthKey()):'',fundingSource:billField('funding').value||'Current Account',category:String(billField('category').value||'').trim()||'Other',included:billField('included').value!=='false',paid:Boolean(existing?.paid),actualPaid:num(existing?.actualPaid),archived:Boolean(existing?.archived),createdAt:existing?.createdAt||isoNow(),updatedAt:isoNow()};
      if(index>=0)bills[index]=item;else bills.push(item); return {...finance,bills};
    },'pre-finance-bill-save');
    document.getElementById('financeBillEditor').hidden=true; status(`${name} saved.`, 'good'); renderActionLists();
  }
  function toggleBill(id) {
    commitFinance(finance=>({...finance,bills:(finance.bills||[]).map(b=>b.id===id?{...b,archived:!b.archived,updatedAt:isoNow()}:b)}),'pre-finance-bill-archive'); status('Bill archive state updated.','good'); renderActionLists();
  }
  function deleteBill(id) {
    const current=readState(); const bill=(current?.finance?.bills||[]).find(b=>b.id===id); if(!bill)return;
    if(!confirm(`Permanently delete "${bill.name}"?`))return;
    commitFinance(finance=>({...finance,bills:(finance.bills||[]).filter(b=>b.id!==id)}),'pre-finance-bill-delete'); status(`${bill.name} deleted.`,'good'); renderActionLists();
  }
  function completeBill(id) {
    const current=readState(); const bill=(current?.finance?.bills||[]).find(b=>b.id===id); if(!bill||bill.archived||bill.paid||bill.included===false)return;
    const raw=prompt(`Actual amount paid for ${bill.name}`, num(bill.amount).toFixed(2)); if(raw===null)return; const actual=num(raw); if(actual<=0)throw new Error('Enter an actual amount greater than £0.');
    commitFinance(finance=>{
      const bills=[...(finance.bills||[])], pots=[...(finance.pots||[])], payments=[...(finance.payments||[])]; const bi=bills.findIndex(b=>b.id===id); if(bi<0)return finance;
      const beforeBill=clone(bills[bi]); const pi=pots.findIndex(p=>!p.archived&&p.name===beforeBill.fundingSource); const beforePot=pi>=0?clone(pots[pi]):null;
      if(pi>=0){ const balance=num(pots[pi].balance); if(actual>balance+0.005)throw new Error(`${pots[pi].name} does not have enough cash for this payment.`); pots[pi]={...pots[pi],balance:Number((balance-actual).toFixed(2)),updatedAt:isoNow()}; }
      payments.unshift({id:uid('PAY'),billId:id,billName:beforeBill.name,amount:actual,paidAt:isoNow(),fundingSource:beforeBill.fundingSource||'Current Account',reversed:false,reversedAt:null,beforeBill,beforePot});
      if(commitmentType(beforeBill)==='one_off') bills[bi]={...beforeBill,paid:true,actualPaid:actual,updatedAt:isoNow()};
      else if(commitmentType(beforeBill)==='rolling_monthly') bills[bi]={...beforeBill,due:'',occurrenceMonth:nextMonthKey(beforeBill.occurrenceMonth||monthKey()),paid:false,actualPaid:0,updatedAt:isoNow()};
      else bills[bi]={...beforeBill,due:nextDue(beforeBill.due,beforeBill.frequency),paid:false,actualPaid:0,updatedAt:isoNow()};
      return {...finance,bills,pots,payments};
    },'pre-finance-bill-payment'); status(`${bill.name} payment recorded.`,'good'); renderActionLists();
  }
  function undoLastPayment() {
    const current=readState(); const payments=current?.finance?.payments||[]; const payment=payments.find(p=>!p.reversed&&p.beforeBill); if(!payment){status('No reversible Finance payment found.');return;}
    commitFinance(finance=>{
      const bills=[...(finance.bills||[])],pots=[...(finance.pots||[])],nextPayments=[...(finance.payments||[])]; const bi=bills.findIndex(b=>b.id===payment.beforeBill.id); if(bi>=0)bills[bi]=clone(payment.beforeBill); else bills.push(clone(payment.beforeBill));
      if(payment.beforePot){const pi=pots.findIndex(p=>p.id===payment.beforePot.id);if(pi>=0)pots[pi]=clone(payment.beforePot);else pots.push(clone(payment.beforePot));}
      const pIndex=nextPayments.findIndex(p=>p.id===payment.id); if(pIndex>=0)nextPayments[pIndex]={...nextPayments[pIndex],reversed:true,reversedAt:isoNow()};
      return {...finance,bills,pots,payments:nextPayments};
    },'pre-finance-payment-undo'); status(`Undid payment for ${payment.billName||'bill'}.`,'good'); renderActionLists();
  }

  function renderActionLists() {
    const s=readState(); if(!s?.finance)return;
    const pots=s.finance.pots||[], bills=s.finance.bills||[];
    const potHost=document.getElementById('financePotActionList'); const billHost=document.getElementById('financeBillActionList');
    if(potHost) potHost.innerHTML=`<div class="finance-panel-head"><div><span class="finance-panel-kicker">Pot Actions</span><h3>Manage Pots</h3></div><span class="finance-panel-note">${pots.length} saved</span></div>${pots.length?pots.map(p=>`<div class="finance-action-row"><div><strong>${String(p.name||'Untitled').replaceAll('&','&amp;').replaceAll('<','&lt;')}</strong><span>${p.archived?'Archived':'Active'} • £${num(p.balance).toFixed(2)} balance • £${num(p.target).toFixed(2)} target</span></div><div class="finance-row-actions"><button type="button" data-pot-edit="${p.id}">Edit</button><button type="button" data-pot-toggle="${p.id}">${p.archived?'Restore':'Archive'}</button></div></div>`).join(''):'<div class="finance-notice">No pots saved.</div>'}`;
    if(billHost) billHost.innerHTML=`<div class="finance-panel-head"><div><span class="finance-panel-kicker">Bill Actions</span><h3>Manage Bills</h3></div><span class="finance-panel-note">${bills.length} saved</span></div>${bills.length?bills.map(b=>`<div class="finance-action-row"><div><strong>${String(b.name||'Untitled').replaceAll('&','&amp;').replaceAll('<','&lt;')}</strong><span>${b.archived?'Archived':b.paid?'Paid':b.included===false?'Excluded':'Active'} • £${num(b.amount).toFixed(2)} • ${b.due||b.occurrenceMonth||'No date'} • ${b.fundingSource||'Current Account'}</span></div><div class="finance-row-actions">${!b.archived&&!b.paid&&b.included!==false?`<button type="button" data-bill-complete="${b.id}">Complete</button>`:''}<button type="button" data-bill-edit="${b.id}">Edit</button><button type="button" data-bill-toggle="${b.id}">${b.archived?'Restore':'Archive'}</button><button class="danger" type="button" data-bill-delete="${b.id}">Delete</button></div></div>`).join(''):'<div class="finance-notice">No bills saved.</div>'}`;
    setBillFundingOptions(billField('funding')?.value||'Current Account');
  }

  function handleClick(event) {
    const button=event.target.closest('button'); if(!button)return;
    try {
      if(button.dataset.action==='new-pot')newPot();
      else if(button.dataset.action==='new-bill')newBill();
      else if(button.dataset.action==='save-pot')savePot();
      else if(button.dataset.action==='cancel-pot')document.getElementById('financePotEditor').hidden=true;
      else if(button.dataset.action==='save-bill')saveBill();
      else if(button.dataset.action==='cancel-bill')document.getElementById('financeBillEditor').hidden=true;
      else if(button.dataset.action==='undo-payment')undoLastPayment();
      else if(button.dataset.potEdit)editPot(button.dataset.potEdit);
      else if(button.dataset.potToggle)togglePot(button.dataset.potToggle);
      else if(button.dataset.billEdit)editBill(button.dataset.billEdit);
      else if(button.dataset.billToggle)toggleBill(button.dataset.billToggle);
      else if(button.dataset.billDelete)deleteBill(button.dataset.billDelete);
      else if(button.dataset.billComplete)completeBill(button.dataset.billComplete);
    } catch(error){lastError=String(error?.message||error||'Unknown error');console.error('[Aurora Finance Pots/Bills actions]',lastError);status(lastError,'bad');}
  }

  function boot() {
    let tries=0;
    const wait=()=>{
      if(window.AuroraFinancePotsBillsReadonly?.ready && installActionsMarkup()){
        installStyles();
        const root=document.getElementById('financePotsBillsActions'); root.addEventListener('click',handleClick);
        billField('type')?.addEventListener('change',updateBillDateRequirement);
        renderActionLists();
        window.addEventListener('aurora2:state',()=>setTimeout(renderActionLists,0));
        window.AuroraFinancePotsBillsActions=Object.freeze({build:BUILD,ready:true,scope:'finance.pots + finance.bills + finance.payments',backupBeforeWrite:true,lastError});
        ready=true; return;
      }
      tries+=1; if(tries<600)setTimeout(wait,25);
    };
    wait();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);
})();
