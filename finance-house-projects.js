(() => {
  'use strict';

  const BUILD = '20260820-finance-house-projects-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const BACKUP_META_KEY = 'aurora2:state:backup:meta';
  const DEFAULT_ROOMS = ['Games Room','Living Room','Hallway','Kitchen','Whole House'];
  let ready = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const num = value => {
    const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const norm = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(num(value));
  const isoNow = () => new Date().toISOString();
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify({
      at: isoNow(), reason, schemaVersion: Number(parsed.schemaVersion) || null
    }));
  }

  function uid(prefix) {
    try { if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`; } catch (_) {}
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function findHousePotIndex(pots) {
    let idx = pots.findIndex(p => ['house fund','house'].includes(norm(p?.name)));
    if (idx >= 0) return idx;
    idx = pots.findIndex(p => String(p?.id || '').toLowerCase().includes('house'));
    if (idx >= 0) return idx;
    return pots.findIndex(p => /\bhouse\b/.test(norm(p?.name)));
  }

  function defaultHouseProject(finance) {
    const hp = finance?.houseProject && typeof finance.houseProject === 'object' ? clone(finance.houseProject) : {};
    hp.rooms = Array.isArray(hp.rooms) && hp.rooms.length
      ? [...new Set(hp.rooms.map(x => String(x).trim()).filter(Boolean))]
      : [...DEFAULT_ROOMS];
    hp.entries = Array.isArray(hp.entries) ? hp.entries : [];
    hp.actions = Array.isArray(hp.actions) ? hp.actions : [];
    hp.openingHistoricalSpend = num(hp.openingHistoricalSpend);
    hp.target = num(hp.target);
    return hp;
  }

  function syncHousePot(finance, createIfMissing = false) {
    const next = { ...finance };
    const hp = defaultHouseProject(next);
    const pots = [...(next.pots || [])];
    let pi = findHousePotIndex(pots);
    const spend = hp.openingHistoricalSpend + hp.entries
      .filter(e => e.status === 'paid' || e.status === 'historical')
      .reduce((sum, e) => sum + num(e.actual), 0);

    if (pi < 0 && createIfMissing) {
      pots.push({
        id: uid('POT-HOUSE'), name: 'House Fund', balance: 0, target: hp.target,
        fundingOverride: 0, fundingPerPayday: 0, deadline: '', priority: 1,
        goalMode: 'funded-progress', spent: Number(spend.toFixed(2)), archived: false,
        createdAt: isoNow(), updatedAt: isoNow()
      });
      pi = pots.length - 1;
    }

    if (pi >= 0) {
      const current = pots[pi];
      const target = hp.target > 0 ? hp.target : num(current.target);
      hp.target = target;
      pots[pi] = {
        ...current,
        target,
        goalMode: 'funded-progress',
        spent: Number(spend.toFixed(2)),
        archived: false,
        updatedAt: isoNow()
      };
    }

    next.houseProject = hp;
    next.pots = pots;
    return next;
  }

  function commitHouse(mutator, reason, createHousePot = false) {
    const raw = localStorage.getItem(STATE_KEY);
    const state = readState();
    if (!state?.finance) throw new Error('AURORA_FINANCE_STATE_NOT_FOUND');
    backupCurrent(raw, reason);
    const draft = clone(state);
    let finance = { ...(draft.finance || {}) };
    finance.houseProject = defaultHouseProject(finance);
    finance = mutator(finance, draft) || finance;
    finance = syncHousePot(finance, createHousePot);
    const now = isoNow();
    const next = { ...draft, updatedAt: now, finance: { ...finance, lastCalculatedAt: now } };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aurora2:state', { detail: next }));
    return next;
  }

  function snapshot() {
    const state = readState();
    const finance = state?.finance || {};
    const hp = defaultHouseProject(finance);
    const pots = finance.pots || [];
    const pi = findHousePotIndex(pots);
    const pot = pi >= 0 ? pots[pi] : null;
    const cash = num(pot?.balance);
    const target = num(hp.target || pot?.target);
    const reserved = hp.entries.filter(e => e.status === 'reserved').reduce((s, e) => s + num(e.estimated), 0);
    const entrySpend = hp.entries.filter(e => e.status === 'paid' || e.status === 'historical').reduce((s, e) => s + num(e.actual), 0);
    const spent = num(hp.openingHistoricalSpend) + entrySpend;
    const funded = cash + spent;
    const remaining = Math.max(0, target - funded);
    const available = Math.max(0, cash - reserved);
    const progress = target > 0 ? Math.min(100, funded / target * 100) : (funded > 0 ? 100 : 0);
    const rooms = hp.rooms.map((room, index) => {
      const rows = hp.entries.filter(e => e.room === room);
      const estimated = rows.reduce((s, e) => s + num(e.estimated), 0);
      const actual = rows.filter(e => e.status === 'paid' || e.status === 'historical').reduce((s, e) => s + num(e.actual), 0);
      const pending = rows.filter(e => e.status === 'reserved').reduce((s, e) => s + num(e.estimated), 0);
      return { room, index, rows, estimated, actual, pending, variance: estimated - actual };
    });
    return { state, finance, hp, pot, pi, cash, target, reserved, spent, funded, remaining, available, progress, rooms };
  }

  function installStyles() {
    if (document.getElementById('financeHouseProjectsStyle')) return;
    const style = document.createElement('style');
    style.id = 'financeHouseProjectsStyle';
    style.textContent = `
      #housePanel .house-hero-new{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(220px,.5fr);gap:12px;margin-top:18px}
      #housePanel .house-progress-panel{display:flex;flex-direction:column;justify-content:center;text-align:center}
      #housePanel .house-progress-panel>strong{font-size:38px;line-height:1;color:#dff6ff;margin:8px 0}
      #housePanel .house-progress-track{height:8px;background:rgba(110,231,255,.10);border-radius:999px;overflow:hidden;margin-top:10px}
      #housePanel .house-progress-track i{display:block;height:100%;width:0;background:linear-gradient(90deg,#6ee7ff,#8cf7be);border-radius:inherit}
      #housePanel .house-kpis-new{display:grid;grid-template-columns:repeat(7,minmax(125px,1fr));gap:10px;margin:12px 0}
      #housePanel .house-kpis-new article{border:1px solid rgba(110,231,255,.12);border-radius:14px;background:rgba(4,16,28,.62);padding:13px}
      #housePanel .house-kpis-new small,#housePanel .house-kpis-new span{display:block;color:#8299aa;font-size:10px}
      #housePanel .house-kpis-new strong{display:block;color:#eef7ff;font-size:18px;margin:5px 0}
      #housePanel .house-room-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
      #housePanel .house-room{border:1px solid rgba(110,231,255,.12);border-radius:14px;background:rgba(4,16,28,.58);padding:14px}
      #housePanel .house-room h3{margin:0 0 8px;color:#eef7ff}.house-room-meta{color:#8398aa;font-size:10px;line-height:1.55}
      #housePanel .progress-mini{height:5px;background:rgba(110,231,255,.10);border-radius:99px;overflow:hidden;margin:10px 0}.progress-mini i{display:block;height:100%;background:linear-gradient(90deg,#6ee7ff,#85e6aa)}
      #housePanel .house-room-actions,#housePanel .house-entry-actions,#housePanel .finance-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
      #housePanel button{border:1px solid rgba(110,231,255,.22);background:rgba(5,20,34,.86);color:#dff6ff;border-radius:10px;padding:9px 12px;font:700 10px/1.1 inherit;cursor:pointer}
      #housePanel button.danger{border-color:rgba(255,104,104,.34);color:#ffb2b2}#housePanel button.primary{border-color:rgba(133,230,170,.35);color:#a8f5c1}
      #housePanel .house-entry-list,#housePanel .house-history{display:grid;gap:8px;margin-top:12px}
      #housePanel .house-entry{border:1px solid rgba(110,231,255,.10);border-radius:13px;background:rgba(4,16,28,.55);padding:13px}.house-entry-head{display:flex;justify-content:space-between;gap:12px}.house-entry-meta{color:#8197a8;font-size:10px;line-height:1.55;margin-top:4px}
      #housePanel .house-pill{display:inline-flex;border:1px solid rgba(110,231,255,.18);border-radius:99px;padding:5px 8px;font-size:9px}.house-pill.watch{color:#ffd38a;border-color:rgba(255,211,138,.28)}.house-pill.good{color:#8ff0b3;border-color:rgba(143,240,179,.28)}
      #housePanel .house-actual{display:flex;gap:6px;align-items:center}#housePanel .house-actual input{width:105px}
      #housePanel .house-editor-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#housePanel .house-editor-fields .wide{grid-column:1/-1}
      #housePanel .house-editor-fields label{display:flex;flex-direction:column;gap:5px;color:#8ea6b7;font-size:10px}#housePanel input,#housePanel select{width:100%;box-sizing:border-box;border:1px solid rgba(110,231,255,.16);background:#071522;color:#eef7ff;border-radius:9px;padding:10px}
      #housePanel .house-history-row{border:1px solid rgba(110,231,255,.08);border-radius:11px;padding:10px;background:rgba(4,16,28,.45)}.house-history-row strong,.house-history-row span{display:block}.house-history-row span{font-size:10px;color:#8197a8;margin-top:3px}
      #housePanel .house-empty{padding:18px;text-align:center;color:#8197a8;border:1px dashed rgba(110,231,255,.14);border-radius:12px}
      #housePanel .house-status{margin-top:10px;color:#8ea6b7;font-size:10px}.house-status.good{color:#85e6aa}.house-status.bad{color:#ff9f9f}
      @media(max-width:1100px){#housePanel .house-kpis-new{grid-template-columns:repeat(4,minmax(130px,1fr))}#housePanel .house-room-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:760px){#housePanel .house-hero-new,#housePanel .house-editor-fields{grid-template-columns:1fr}#housePanel .house-kpis-new{grid-template-columns:repeat(2,minmax(0,1fr))}#housePanel .house-room-grid{grid-template-columns:1fr}.house-entry-head{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function installMarkup() {
    const host = document.getElementById('housePanel');
    if (!host) return false;
    host.innerHTML = `
      <section class="house-hero-new">
        <article class="finance-panel house-rule-panel">
          <span class="finance-panel-kicker">House Funding Rule</span>
          <h3>Every payment belongs to a room.</h3>
          <p>Reserved work uses the estimated cost. When the work is paid, only the actual cost leaves the House Fund. A saving is released back into available cash automatically.</p>
          <div class="finance-notice good"><b>Funded progress = current House Fund cash + confirmed actual house spending.</b><br>Reserved estimates reduce available cash but do not count as spent until paid.</div>
        </article>
        <article class="finance-panel house-progress-panel">
          <small>PROJECT FUNDED</small><strong id="houseProgressPct">0%</strong><span id="houseProgressCaption">£0.00 funded of £0.00</span>
          <div class="house-progress-track"><i id="houseProgressBar"></i></div>
        </article>
      </section>

      <section class="house-kpis-new">
        <article><small>Project Target</small><strong id="houseTargetKpi">£0.00</strong><span>Whole renovation</span></article>
        <article><small>House Fund Cash</small><strong id="houseCashKpi">£0.00</strong><span>Current available pot</span></article>
        <article><small>Estimated Reserved</small><strong id="houseReservedKpi">£0.00</strong><span>Upcoming work</span></article>
        <article><small>Available After Costs</small><strong id="houseAvailableKpi">£0.00</strong><span>Cash after reservations</span></article>
        <article><small>Actual Spent</small><strong id="houseSpentKpi">£0.00</strong><span>Confirmed historical + paid</span></article>
        <article><small>Total Funded</small><strong id="houseFundedKpi">£0.00</strong><span>Cash + actual spending</span></article>
        <article><small>Remaining</small><strong id="houseRemainingKpi">£0.00</strong><span>Still to fund</span></article>
      </section>

      <section class="finance-panel">
        <div class="finance-panel-head"><div><span class="finance-panel-kicker">Renovation Control</span><h3>Room Dashboard</h3></div><span class="finance-panel-note">Estimated • actual • reserved</span></div>
        <div class="house-room-grid" id="houseRoomGrid"></div>
        <div class="finance-actions"><button type="button" data-house-action="add-room">+ Add Room</button></div>
      </section>

      <section class="finance-command-grid two" style="margin-top:12px">
        <article class="finance-panel" id="houseEntryEditor">
          <div class="finance-panel-head"><div><span class="finance-panel-kicker">House Ledger</span><h3 id="houseEditorTitle">Add House Payment</h3></div><span class="rule-chip green">BACKED UP WRITES</span></div>
          <input id="houseEntryId" type="hidden">
          <div class="house-editor-fields">
            <label class="wide">Description<input id="houseEntryName" maxlength="100" placeholder="e.g. Games room plastering"></label>
            <label>Room<select id="houseEntryRoom"></select></label>
            <label>Estimated cost<input id="houseEntryEstimated" type="number" min="0" step="0.01"></label>
            <label>Actual cost<input id="houseEntryActual" type="number" min="0" step="0.01"><small>Can be entered later for reserved work.</small></label>
            <label>Due / paid date<input id="houseEntryDue" type="date"></label>
            <label>Category<input id="houseEntryCategory" value="House project"></label>
            <label>Record type<select id="houseEntryType"><option value="reserved">Reserved / upcoming</option><option value="historical">Already paid / historical</option></select><small>Historical records never deduct today’s House Fund cash.</small></label>
            <label class="wide">Notes<input id="houseEntryNotes" placeholder="Optional"></label>
          </div>
          <div class="finance-actions"><button class="primary" type="button" data-house-action="save-entry">Save Payment</button><button type="button" data-house-action="clear-entry">Clear</button></div>
          <div id="houseStatus" class="house-status">House Ledger owns renovation payments. Do not duplicate these as normal Bills.</div>
        </article>

        <article class="finance-panel">
          <div class="finance-panel-head"><div><span class="finance-panel-kicker">Project Controls</span><h3>House Setup</h3></div></div>
          <div class="house-editor-fields">
            <label>Project target<input id="houseProjectTarget" type="number" min="0" step="0.01"></label>
            <label>Current House Fund balance<input id="houseCurrentBalance" type="number" min="0" step="0.01"><small>Reconcile the real cash currently available in your House Fund.</small></label>
            <label class="wide">Opening historical spend<input id="houseOpeningSpent" type="number" min="0" step="0.01"><small>Legacy spend not represented by an individual ledger entry.</small></label>
          </div>
          <div class="finance-notice"><b>Balance changes are cash corrections, not spending.</b><br>Changing the House Fund balance updates available cash and funded progress, but does not create a paid House Ledger item.</div>
          <div class="finance-actions"><button type="button" data-house-action="save-setup">Save House Setup & Balance</button></div>
        </article>
      </section>

      <section class="finance-command-grid two" style="margin-top:12px">
        <article class="finance-panel">
          <div class="finance-panel-head"><div><span class="finance-panel-kicker">Renovation Ledger</span><h3>House Payments</h3></div><span class="finance-panel-note" id="houseLedgerMeta">0 records</span></div>
          <div class="house-entry-list" id="houseLedgerList"></div>
        </article>
        <article class="finance-panel">
          <div class="finance-panel-head"><div><span class="finance-panel-kicker">Audit Trail</span><h3>House Action History</h3></div><span class="finance-panel-note">Payments & undo trail</span></div>
          <div class="house-history" id="houseActionHistory"></div>
        </article>
      </section>`;
    host.dataset.auroraHouseProjects = '1';
    return true;
  }

  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function setValue(id, value) { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = value ?? ''; }
  function getValue(id) { return document.getElementById(id)?.value || ''; }
  function setStatus(message, tone = '') {
    const el = document.getElementById('houseStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `house-status ${tone}`.trim();
  }

  function renderRoomSelect(m) {
    const select = document.getElementById('houseEntryRoom');
    if (!select) return;
    const current = select.value;
    select.innerHTML = m.hp.rooms.map(room => `<option value="${esc(room)}">${esc(room)}</option>`).join('');
    if (m.hp.rooms.includes(current)) select.value = current;
  }

  function render(m = snapshot()) {
    if (!m.state?.finance) return;
    setText('houseTargetKpi', money(m.target));
    setText('houseCashKpi', money(m.cash));
    setText('houseReservedKpi', money(m.reserved));
    setText('houseAvailableKpi', money(m.available));
    setText('houseSpentKpi', money(m.spent));
    setText('houseFundedKpi', money(m.funded));
    setText('houseRemainingKpi', money(m.remaining));
    setText('houseProgressPct', `${Math.round(m.progress)}%`);
    setText('houseProgressCaption', `${money(m.funded)} funded of ${money(m.target)}`);
    const bar = document.getElementById('houseProgressBar'); if (bar) bar.style.width = `${m.progress.toFixed(1)}%`;

    const roomHost = document.getElementById('houseRoomGrid');
    if (roomHost) roomHost.innerHTML = m.rooms.length ? m.rooms.map(r => `
      <article class="house-room"><h3>${esc(r.room)}</h3>
        <div class="house-room-meta">Estimated ${money(r.estimated)} • Actual ${money(r.actual)}<br>Reserved ${money(r.pending)} • Variance ${money(r.variance)}</div>
        <div class="progress-mini"><i style="width:${r.estimated > 0 ? Math.min(100, r.actual / r.estimated * 100) : 0}%"></i></div>
        <div class="house-room-actions"><button type="button" data-house-room-rename="${esc(r.room)}">Rename</button><button class="danger" type="button" data-house-room-delete="${esc(r.room)}">Remove</button></div>
      </article>`).join('') : '<div class="house-empty">No rooms yet.</div>';

    const rank = { reserved: 0, paid: 1, historical: 2 };
    const rows = [...m.hp.entries].sort((a, b) =>
      (rank[a.status] ?? 3) - (rank[b.status] ?? 3)
      || String(a.due || '9999').localeCompare(String(b.due || '9999'))
      || String(a.name || '').localeCompare(String(b.name || '')));
    setText('houseLedgerMeta', `${rows.length} record${rows.length === 1 ? '' : 's'}`);
    const ledger = document.getElementById('houseLedgerList');
    if (ledger) ledger.innerHTML = rows.length ? rows.map(e => {
      const pill = e.status === 'reserved' ? '<span class="house-pill watch">RESERVED</span>' : e.status === 'paid' ? '<span class="house-pill good">PAID</span>' : '<span class="house-pill good">HISTORICAL</span>';
      return `<article class="house-entry"><div class="house-entry-head"><div><strong>${esc(e.name)}</strong><div class="house-entry-meta">${esc(e.room || 'Unassigned')} • ${esc(e.category || 'House project')} • ${esc(e.due || 'No date')}<br>Estimated ${money(e.estimated)} • Actual ${money(e.actual)}${e.notes ? ` • ${esc(e.notes)}` : ''}</div></div>${pill}</div><div class="house-entry-actions">${e.status === 'reserved' ? `<div class="house-actual"><label>Actual</label><input type="number" min="0" step="0.01" value="${num(e.actual || e.estimated).toFixed(2)}" data-house-actual="${esc(e.id)}"></div><button class="primary" type="button" data-house-pay="${esc(e.id)}">Mark Paid</button>` : ''}<button type="button" data-house-edit="${esc(e.id)}">Edit</button>${e.status === 'paid' && e.deducted ? `<button type="button" data-house-undo="${esc(e.id)}">Undo</button>` : ''}<button class="danger" type="button" data-house-entry-delete="${esc(e.id)}">Delete</button></div></article>`;
    }).join('') : '<div class="house-empty">No House payments yet. Add a reserved or historical payment.</div>';

    const actions = [...(m.hp.actions || [])].slice(0, 20);
    const history = document.getElementById('houseActionHistory');
    if (history) history.innerHTML = actions.length ? actions.map(a => `<div class="house-history-row"><strong>${esc(a.label || a.type || 'House action')}</strong><span>${money(a.amount)} • ${new Date(a.at || Date.now()).toLocaleString('en-GB')}${a.reversed ? ' • UNDONE' : ''}</span></div>`).join('') : '<div class="house-empty">No House actions yet.</div>';

    setValue('houseProjectTarget', m.target || '');
    setValue('houseCurrentBalance', num(m.cash).toFixed(2));
    setValue('houseOpeningSpent', m.hp.openingHistoricalSpend || 0);
    renderRoomSelect(m);
  }

  function resetEditor() {
    ['houseEntryId','houseEntryName','houseEntryEstimated','houseEntryActual','houseEntryDue','houseEntryNotes'].forEach(id => setValue(id, ''));
    setValue('houseEntryCategory', 'House project');
    setValue('houseEntryType', 'reserved');
    setText('houseEditorTitle', 'Add House Payment');
  }

  function editEntry(id) {
    const m = snapshot();
    const e = m.hp.entries.find(x => x.id === id); if (!e) return;
    setValue('houseEntryId', e.id); setValue('houseEntryName', e.name); setValue('houseEntryRoom', e.room);
    setValue('houseEntryEstimated', e.estimated); setValue('houseEntryActual', e.actual); setValue('houseEntryDue', e.due);
    setValue('houseEntryCategory', e.category || 'House project'); setValue('houseEntryType', e.status === 'reserved' ? 'reserved' : 'historical'); setValue('houseEntryNotes', e.notes || '');
    setText('houseEditorTitle', 'Edit House Payment');
    document.getElementById('houseEntryEditor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function saveEntry() {
    const id = getValue('houseEntryId') || uid('HOUSE');
    const name = getValue('houseEntryName').trim();
    const room = getValue('houseEntryRoom');
    const estimated = num(getValue('houseEntryEstimated'));
    const actual = num(getValue('houseEntryActual'));
    const type = getValue('houseEntryType') || 'reserved';
    const due = getValue('houseEntryDue');
    const category = getValue('houseEntryCategory').trim() || 'House project';
    const notes = getValue('houseEntryNotes').trim();
    if (!name) throw new Error('Enter a house payment description.');
    if (type === 'reserved' && estimated <= 0) throw new Error('Reserved work needs an estimated cost above £0.');
    if (type === 'historical' && actual <= 0) throw new Error('Historical spending needs the actual amount paid.');

    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      const entries = [...hp.entries];
      const idx = entries.findIndex(e => e.id === id);
      const old = idx >= 0 ? entries[idx] : null;
      const pots = [...(finance.pots || [])];
      const pi = findHousePotIndex(pots);
      if (old?.status === 'paid' && old?.deducted && pi >= 0) {
        pots[pi] = { ...pots[pi], balance: num(pots[pi].balance) + num(old.actual), updatedAt: isoNow() };
      }
      const entry = {
        ...(old || {}), id, name, room,
        estimated: type === 'historical' ? (estimated || actual) : estimated,
        actual,
        status: type === 'historical' ? 'historical' : 'reserved',
        deducted: false,
        paidDate: type === 'historical' ? (old?.paidDate || due || today()) : '',
        due, category, notes,
        createdAt: old?.createdAt || isoNow(), updatedAt: isoNow()
      };
      if (idx >= 0) entries[idx] = entry; else entries.push(entry);
      return { ...finance, pots, houseProject: { ...hp, entries, updatedAt: isoNow() } };
    }, 'finance-house-save-entry');
    resetEditor(); setStatus('House payment saved.', 'good'); render();
  }

  function payEntry(id) {
    const input = document.querySelector(`[data-house-actual="${CSS.escape(id)}"]`);
    const actual = num(input?.value);
    if (actual <= 0) throw new Error('Enter the actual cost before marking this payment paid.');
    let message = 'Payment recorded.';
    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      const entries = [...hp.entries];
      const actions = [...hp.actions];
      const ei = entries.findIndex(e => e.id === id);
      if (ei < 0 || entries[ei].status !== 'reserved') return finance;
      const pots = [...(finance.pots || [])];
      const pi = findHousePotIndex(pots);
      if (pi < 0) throw new Error('House Fund pot is missing. Save House Setup first.');
      if (num(pots[pi].balance) + 0.009 < actual) throw new Error(`House Fund has ${money(pots[pi].balance)}, not enough for ${money(actual)}.`);
      const beforeEntry = clone(entries[ei]);
      const beforePot = clone(pots[pi]);
      pots[pi] = { ...pots[pi], balance: Math.max(0, num(pots[pi].balance) - actual), updatedAt: isoNow() };
      entries[ei] = { ...entries[ei], actual, status: 'paid', deducted: true, paidDate: today(), updatedAt: isoNow() };
      actions.unshift({ id: uid('HOUSEACT'), type: 'payment', entryId: id, label: `${entries[ei].name} paid`, amount: actual, at: isoNow(), reversed: false, reversedAt: null, beforeEntry, beforePot });
      const diff = num(beforeEntry.estimated) - actual;
      message = `${entries[ei].name} paid at ${money(actual)}${Math.abs(diff) > 0.009 ? ` • ${diff >= 0 ? money(diff) + ' under estimate' : money(Math.abs(diff)) + ' over estimate'}` : ''}.`;
      return { ...finance, pots, houseProject: { ...hp, entries, actions, updatedAt: isoNow() } };
    }, 'finance-house-pay-entry');
    setStatus(message, 'good'); render();
  }

  function undoEntry(id) {
    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      const entries = [...hp.entries];
      const actions = [...hp.actions];
      const ei = entries.findIndex(e => e.id === id);
      if (ei < 0 || entries[ei].status !== 'paid' || !entries[ei].deducted) return finance;
      const pots = [...(finance.pots || [])];
      const pi = findHousePotIndex(pots);
      if (pi < 0) throw new Error('House Fund pot is missing.');
      const amount = num(entries[ei].actual);
      pots[pi] = { ...pots[pi], balance: num(pots[pi].balance) + amount, updatedAt: isoNow() };
      entries[ei] = { ...entries[ei], status: 'reserved', deducted: false, actual: 0, paidDate: '', updatedAt: isoNow() };
      const action = actions.find(a => a.entryId === id && a.type === 'payment' && !a.reversed);
      if (action) { action.reversed = true; action.reversedAt = isoNow(); }
      return { ...finance, pots, houseProject: { ...hp, entries, actions, updatedAt: isoNow() } };
    }, 'finance-house-undo-entry');
    setStatus('Payment undone and cash restored to the House Fund.', 'good'); render();
  }

  function deleteEntry(id) {
    const m = snapshot();
    const current = m.hp.entries.find(e => e.id === id); if (!current) return;
    if (!confirm(`Delete ${current.name}?${current.status === 'paid' && current.deducted ? ' Its cash deduction will be restored.' : ''}`)) return;
    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      const entries = [...hp.entries];
      const ei = entries.findIndex(e => e.id === id); if (ei < 0) return finance;
      const e = entries[ei];
      const pots = [...(finance.pots || [])];
      const pi = findHousePotIndex(pots);
      if (e.status === 'paid' && e.deducted && pi >= 0) pots[pi] = { ...pots[pi], balance: num(pots[pi].balance) + num(e.actual), updatedAt: isoNow() };
      entries.splice(ei, 1);
      return { ...finance, pots, houseProject: { ...hp, entries, updatedAt: isoNow() } };
    }, 'finance-house-delete-entry');
    setStatus('House payment deleted.', 'good'); render();
  }

  function saveSetup() {
    const target = num(getValue('houseProjectTarget'));
    const opening = num(getValue('houseOpeningSpent'));
    const requestedBalance = num(getValue('houseCurrentBalance'));
    let beforeBalance = 0;
    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      const pots = [...(finance.pots || [])];
      let pi = findHousePotIndex(pots);
      if (pi < 0) {
        pots.push({ id: uid('POT-HOUSE'), name: 'House Fund', balance: requestedBalance, target, fundingOverride: 0, fundingPerPayday: 0, deadline: '', priority: 1, goalMode: 'funded-progress', spent: opening, archived: false, createdAt: isoNow(), updatedAt: isoNow() });
        pi = pots.length - 1;
      } else {
        beforeBalance = num(pots[pi].balance);
        pots[pi] = { ...pots[pi], balance: requestedBalance, target, goalMode: 'funded-progress', archived: false, updatedAt: isoNow() };
      }
      const actions = [...hp.actions];
      if (Math.abs(beforeBalance - requestedBalance) > 0.009) actions.unshift({ id: uid('HOUSEACT'), type: 'balance-correction', label: 'House Fund balance corrected', amount: Math.abs(requestedBalance - beforeBalance), at: isoNow(), reversed: false });
      return { ...finance, pots, houseProject: { ...hp, target, openingHistoricalSpend: opening, actions, updatedAt: isoNow() } };
    }, 'finance-house-save-setup', true);
    setStatus(`House setup saved. House Fund balance is ${money(requestedBalance)}.`, 'good'); render();
  }

  function addRoom() {
    const raw = prompt('New room name:', '');
    const name = String(raw ?? '').trim(); if (!name) return;
    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      if (!hp.rooms.some(r => norm(r) === norm(name))) hp.rooms.push(name);
      return { ...finance, houseProject: { ...hp, updatedAt: isoNow() } };
    }, 'finance-house-add-room');
    render();
  }

  function renameRoom(oldName) {
    const name = String(prompt('Rename room:', oldName) ?? '').trim();
    if (!name || name === oldName) return;
    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      hp.rooms = hp.rooms.map(r => r === oldName ? name : r);
      hp.entries = hp.entries.map(e => e.room === oldName ? { ...e, room: name, updatedAt: isoNow() } : e);
      hp.updatedAt = isoNow();
      return { ...finance, houseProject: hp };
    }, 'finance-house-rename-room');
    render();
  }

  function deleteRoom(name) {
    const m = snapshot();
    if (m.hp.entries.some(e => e.room === name)) throw new Error('Move or delete that room’s payments before removing the room.');
    if (!confirm(`Remove room ${name}?`)) return;
    commitHouse(finance => {
      const hp = defaultHouseProject(finance);
      hp.rooms = hp.rooms.filter(r => r !== name);
      hp.updatedAt = isoNow();
      return { ...finance, houseProject: hp };
    }, 'finance-house-delete-room');
    render();
  }

  function handleClick(event) {
    const button = event.target.closest('button'); if (!button) return;
    try {
      const action = button.dataset.houseAction;
      if (action === 'save-entry') saveEntry();
      else if (action === 'clear-entry') resetEditor();
      else if (action === 'save-setup') saveSetup();
      else if (action === 'add-room') addRoom();
      else if (button.dataset.houseRoomRename) renameRoom(button.dataset.houseRoomRename);
      else if (button.dataset.houseRoomDelete) deleteRoom(button.dataset.houseRoomDelete);
      else if (button.dataset.houseEdit) editEntry(button.dataset.houseEdit);
      else if (button.dataset.housePay) payEntry(button.dataset.housePay);
      else if (button.dataset.houseUndo) undoEntry(button.dataset.houseUndo);
      else if (button.dataset.houseEntryDelete) deleteEntry(button.dataset.houseEntryDelete);
    } catch (error) {
      console.error('[Aurora House Projects]', error);
      setStatus(String(error?.message || error || 'House action failed.'), 'bad');
    }
  }

  function boot() {
    if (ready) return;
    let tries = 0;
    const wait = () => {
      const state = readState();
      const host = document.getElementById('housePanel');
      if (state?.finance && host) {
        installStyles(); installMarkup();
        host.addEventListener('click', handleClick);
        render();
        window.addEventListener('aurora2:state', () => setTimeout(render, 0));
        window.addEventListener('storage', event => { if (event.key === STATE_KEY) render(); });
        window.AuroraFinanceHouseProjects = Object.freeze({
          build: BUILD, ready: true,
          scope: 'finance.houseProject + House Fund pot',
          backupBeforeWrite: true,
          rules: 'reserved estimates reduce available cash; paid actuals deduct House Fund; historical spend does not deduct current cash'
        });
        ready = true;
        return;
      }
      tries += 1;
      if (tries < 600) setTimeout(wait, 25);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  else setTimeout(boot, 0);
})();