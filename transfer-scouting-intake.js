(() => {
  'use strict';

  const BUILD = '20260822-transfer-scouting-intake-3';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';

  const arr = value => Array.isArray(value) ? value : [];
  const num = value => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`.toUpperCase();

  function ticker(value) {
    return String(value || '').replace(/^LON:/i, '').replace(/\.L$/i, '').replace(/\.GB$/i, '').replace(/\..*$/, '').toUpperCase().trim();
  }

  function exchange(value) {
    const raw = String(value || '').trim().toUpperCase();
    const aliases = {LON:'LSE',XLON:'LSE',LONDON:'LSE',XNAS:'NASDAQ',NAS:'NASDAQ',XNYS:'NYSE',TOR:'TSX',XTSE:'TSX'};
    return aliases[raw] || raw;
  }

  function accountCode(value) {
    const lower = String(value || '').toLowerCase();
    if (lower.includes('212')) return 'T212';
    if (/\big\b/.test(lower) || lower.includes('ig isa')) return 'IG';
    const upper = String(value || '').toUpperCase();
    return upper === 'IG' || upper === 'T212' ? upper : 'CHECK';
  }

  function accountLabel(value) {
    const code = accountCode(value);
    return code === 'IG' ? 'IG ISA' : code === 'T212' ? 'Trading 212 ISA' : 'CHECK';
  }

  function securityId(record) {
    const explicit = String(record?.securityId || record?.security_id || record?.id || '').trim();
    if (explicit) return explicit;
    return `${exchange(record?.exchange || record?.exchangeCode) || 'UNKNOWN'}:${ticker(record?.ticker || record?.symbol)}`;
  }

  function sameSecurity(a, b) {
    const aId = String(a?.securityId || a?.security_id || '').trim();
    const bId = String(b?.securityId || b?.security_id || '').trim();
    if (aId && bId && aId === bId) return true;
    const aTicker = ticker(a?.ticker || a?.symbol);
    const bTicker = ticker(b?.ticker || b?.symbol);
    if (!aTicker || aTicker !== bTicker) return false;
    const aEx = exchange(a?.exchange || a?.exchangeCode);
    const bEx = exchange(b?.exchange || b?.exchangeCode);
    return !aEx || !bEx || aEx === bEx;
  }

  function eligibilityAccounts(value) {
    if (Array.isArray(value)) return value.map(accountCode).filter(code => code !== 'CHECK');
    if (typeof value === 'string') {
      const text = value.trim();
      if ((text.startsWith('[') || text.startsWith('{')) && text.length > 1) {
        try { return eligibilityAccounts(JSON.parse(text)); } catch (_) {}
      }
      return text.split(/[,|/]/).map(accountCode).filter(code => code !== 'CHECK');
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).filter(([,allowed]) => allowed === true).map(([key]) => accountCode(key)).filter(code => code !== 'CHECK');
    }
    return [];
  }

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function writeState(next, previous, source) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(previous));
      localStorage.setItem(STATE_KEY, JSON.stringify({...next, updatedAt:now()}));
      window.dispatchEvent(new CustomEvent('aurora2:state', {detail:{source:source || 'transfer-scouting-intake',build:BUILD}}));
      return true;
    } catch (error) {
      console.error('[Transfer Scouting Intake] state write failed', error);
      return false;
    }
  }

  function activeScore(target, strategy) {
    return strategy === 'maximum' ? num(target?.maximumScore) : num(target?.sustainableScore);
  }

  function activeRank(target, strategy) {
    const explicit = strategy === 'maximum' ? num(target?.maximumRank) : num(target?.rank);
    return explicit > 0 ? explicit : 9999;
  }

  function blockedTarget(target) {
    const status = String(target?.status || '').toLowerCase();
    const recommendation = String(target?.recommendation || '').toUpperCase();
    return status === 'block' || status === 'pending' || recommendation === 'BLOCK' || recommendation === 'DATA PENDING';
  }

  function approvedTarget(target) {
    return !blockedTarget(target) && target?.approvedForTransfer === true;
  }

  function selectableTarget(target) {
    if (!target || blockedTarget(target) || target.transferPermitted === false) return false;
    if (target.eligibleForTransfer === true || target.approvedForTransfer === true) return true;
    const status = String(target.status || '').toLowerCase();
    const recommendation = String(target.recommendation || '').toUpperCase();
    return status === 'pass' || status === 'caution' || ['BUY','STRONG BUY','CAUTION'].includes(recommendation);
  }

  function sortedTargets(state) {
    const strategy = String(state?.scouting?.strategy || 'sustainable').toLowerCase() === 'maximum' ? 'maximum' : 'sustainable';
    const rows = arr(state?.scouting?.targets);
    return {
      strategy,
      rows:[...rows].sort((a,b) => {
        const approvedDelta = Number(approvedTarget(b)) - Number(approvedTarget(a));
        if (approvedDelta) return approvedDelta;
        return activeRank(a,strategy) - activeRank(b,strategy) || activeScore(b,strategy) - activeScore(a,strategy);
      })
    };
  }

  function preferenceFor(state, target) {
    const prefs = state?.transfer?.brokerPreferences || {};
    const byId = prefs[securityId(target)];
    const byTicker = prefs[ticker(target?.ticker)];
    const raw = byId ?? byTicker;
    return accountCode(raw && typeof raw === 'object' ? raw.account : raw);
  }

  function resolveBroker(state, target) {
    const direct = accountCode(target?.preferredAccount || target?.account || target?.broker);
    const remembered = preferenceFor(state,target);
    const explicit = eligibilityAccounts(target?.brokerEligibility);
    if (target?.IG === true || target?.ig === true || target?.igIsaSupported === true || target?.igISASupported === true || target?.supportsIgIsa === true) explicit.push('IG');
    if (target?.T212 === true || target?.t212 === true || target?.trading212IsaSupported === true || target?.trading212ISASupported === true || target?.supportsTrading212Isa === true) explicit.push('T212');

    const platformRule = arr(state?.transfer?.platformRules).find(row => String(row?.active ?? 'true').toLowerCase() !== 'false' && sameSecurity(target,row));
    const platformAccounts = eligibilityAccounts(platformRule?.allowed_accounts || platformRule?.allowedAccounts);
    const platformPreferred = accountCode(platformRule?.preferred_account || platformRule?.preferredAccount);

    const configAccounts = arr(state?.transfer?.brokerEligibility)
      .concat(arr(state?.transfer?.brokerConfiguration),arr(state?.transfer?.eligibleSecurities))
      .filter(row => sameSecurity(target,row))
      .flatMap(row => eligibilityAccounts(row?.brokerEligibility || row?.accounts || row?.eligibleAccounts));

    const targetExchange = exchange(target?.exchange || target?.exchangeCode);
    const marketAccounts = arr(state?.transfer?.marketSupport)
      .concat(arr(state?.transfer?.exchangeSupport))
      .filter(row => exchange(row?.exchange || row?.market) === targetExchange)
      .flatMap(row => eligibilityAccounts(row?.accounts || row?.eligibleAccounts || row?.brokerEligibility));

    const previousRoute = arr(state?.transfer?.route?.allocations)
      .concat(arr(state?.transfer?.routeEvidence))
      .filter(row => sameSecurity(target,row))
      .map(row => accountCode(row?.account || row?.broker || row?.preferredAccount))
      .filter(code => code !== 'CHECK');

    const owned = arr(state?.squad?.holdings)
      .filter(row => num(row?.shares) > 0 && !['SOLD','ARCHIVED','CLOSED','EXITED'].includes(String(row?.status || '').toUpperCase()) && sameSecurity(target,row))
      .map(row => accountCode(row?.account || row?.broker || row?.preferredAccount))
      .filter(code => code !== 'CHECK');

    const tiers = [
      {source:'Platform rule',accounts:platformAccounts},
      {source:'Security eligibility',accounts:explicit},
      {source:'Transfer broker config',accounts:configAccounts},
      {source:'Exchange support',accounts:marketAccounts}
    ];
    const chosen = tiers.find(tier => tier.accounts.length) || null;
    const eligible = [...new Set(chosen?.accounts || [])];

    const candidates = [
      {account:platformPreferred,source:'Platform preferred broker'},
      {account:remembered,source:'Saved Transfer preference'},
      ...previousRoute.map(account => ({account,source:'Previous Transfer route'})),
      ...owned.map(account => ({account,source:'Existing holding'})),
      {account:direct,source:'Scouting preferred broker'}
    ].filter(item => item.account !== 'CHECK');

    let selected = candidates.find(item => !eligible.length || eligible.includes(item.account));
    if (!selected && eligible.length === 1) selected = {account:eligible[0],source:chosen?.source || 'Broker eligibility'};
    if (!selected && eligible.length > 1) selected = {account:eligible.includes('IG') ? 'IG' : eligible[0],source:`${chosen?.source || 'Broker eligibility'} • auto default`};

    return {
      account:selected?.account || 'CHECK',
      source:selected?.source || (eligible.length ? chosen?.source : 'No broker evidence'),
      eligible,
      remembered,
      resolved:Boolean(selected?.account && selected.account !== 'CHECK')
    };
  }

  function routeLocked(state) {
    return Boolean(state?.transfer?.route?.locked) || ['LOCKED','PARTIALLY_REGISTERED','COMPLETE','COMPLETED'].includes(String(state?.mission?.status || '').toUpperCase());
  }

  function toast(message) {
    let el = document.getElementById('transferScoutingToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'transferScoutingToast';
      el.className = 'transfer-scouting-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(window.__transferScoutingToastTimer);
    window.__transferScoutingToastTimer = setTimeout(() => el.classList.remove('show'),2800);
  }

  function ensureStyles() {
    if (document.getElementById('transferScoutingIntakeStyles')) return;
    const style = document.createElement('style');
    style.id = 'transferScoutingIntakeStyles';
    style.textContent = `
      .scouting-intake{margin-top:22px;border:1px solid rgba(110,231,255,.12);border-radius:24px;background:linear-gradient(180deg,rgba(7,18,28,.94),rgba(8,8,16,.94));padding:26px}
      .scouting-intake-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.scouting-intake-head h2{margin:0;font:900 clamp(28px,5vw,44px)/1 system-ui}.scouting-intake-head p{margin:8px 0 0;color:#8ea1ad;max-width:760px;line-height:1.5}.scouting-intake-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.scouting-intake-chip{border:1px solid rgba(110,231,255,.25);border-radius:999px;padding:10px 13px;color:#a9f4ff;font:800 10px/1 system-ui;letter-spacing:.12em;text-transform:uppercase}.scouting-approve-btn{appearance:none;border:1px solid rgba(89,255,154,.34);border-radius:12px;padding:11px 14px;background:rgba(89,255,154,.07);color:#9affbd;font:900 11px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.scouting-approve-btn:disabled{opacity:.42;cursor:not-allowed}.scouting-approve-btn.approved{border-color:rgba(110,231,255,.26);background:rgba(110,231,255,.05);color:#b8f5ff}
      .scouting-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:20px}.scouting-kpis div{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:15px;background:rgba(0,0,0,.14)}.scouting-kpis small{display:block;color:#718692;font:800 10px/1.2 system-ui;text-transform:uppercase;letter-spacing:.12em;margin-bottom:7px}.scouting-kpis strong{font:900 18px/1.2 system-ui}
      .scouting-list{display:grid;gap:10px;margin-top:18px}.scouting-row{display:grid;grid-template-columns:54px minmax(0,1.45fr) minmax(90px,.55fr) minmax(90px,.55fr) minmax(180px,.95fr) auto;gap:12px;align-items:center;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px;background:rgba(0,0,0,.12)}.scouting-rank{font:900 18px/1 system-ui;color:#ff8996}.scouting-name b{display:block;font:900 16px/1.2 system-ui}.scouting-name span,.scouting-cell span{display:block;color:#7e8e98;font:700 9px/1.35 system-ui;text-transform:uppercase;letter-spacing:.07em;margin-top:4px}.scouting-cell strong{font:900 14px/1.2 system-ui}.scouting-broker-cell select{margin-top:8px;width:100%;max-width:170px;border:1px solid rgba(110,231,255,.18);border-radius:9px;background:#0b1018;color:#eafaff;padding:7px 8px;font:750 11px/1 system-ui}.scouting-broker-cell .resolved{color:#9affbd}.scouting-broker-cell .unresolved{color:#ffe29a}.scouting-approval{justify-self:start;border-radius:999px;padding:8px 10px;font:800 10px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(255,255,255,.1)}.scouting-approval.approved{color:#94ffb9;border-color:rgba(89,255,154,.3);background:rgba(89,255,154,.05)}.scouting-approval.review{color:#ffe29a;border-color:rgba(255,213,107,.28);background:rgba(255,213,107,.04)}.scouting-approval.blocked{color:#ffabb4;border-color:rgba(255,79,97,.28);background:rgba(255,79,97,.05)}
      .scouting-empty{margin-top:18px;border:1px dashed rgba(110,231,255,.16);border-radius:16px;padding:18px;color:#8699a4}.scouting-gate{margin-top:16px;border-radius:16px;padding:15px;border:1px solid rgba(255,255,255,.08);color:#9aabb4}.scouting-gate.ready{border-color:rgba(89,255,154,.28);color:#a9ffc6}.scouting-gate.hold{border-color:rgba(255,213,107,.25);color:#ffe4a6}.transfer-scouting-toast{position:fixed;left:50%;bottom:24px;z-index:9999;transform:translate(-50%,12px);opacity:0;pointer-events:none;border:1px solid rgba(110,231,255,.25);border-radius:12px;background:#071019;color:#dff9ff;padding:11px 15px;font:800 12px/1.3 system-ui;transition:.18s ease;box-shadow:0 16px 40px rgba(0,0,0,.35)}.transfer-scouting-toast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:900px){.scouting-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.scouting-row{grid-template-columns:42px minmax(0,1fr)}.scouting-cell,.scouting-approval{grid-column:2}.scouting-broker-cell select{max-width:220px}.scouting-approval{margin-top:2px}}
      @media(max-width:540px){.scouting-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.scouting-intake-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    let section = document.getElementById('transferScoutingIntake');
    if (section) return section;
    const missionShell = document.getElementById('transferMissionShell');
    if (!missionShell) return null;
    section = document.createElement('section');
    section.id = 'transferScoutingIntake';
    section.className = 'scouting-intake';
    missionShell.insertAdjacentElement('afterend',section);
    return section;
  }

  function approveShortlist() {
    const state = readState();
    if (!state) return;
    if (routeLocked(state)) { toast('Transfer route is locked. The shortlist cannot be changed.'); return; }
    const rows = arr(state?.scouting?.targets);
    const eligible = rows.filter(selectableTarget);
    if (!eligible.length) { toast('No PASS / CAUTION Scouting targets are currently eligible for approval.'); return; }

    const approvedAt = now();
    const approvalBatchId = uid('SHORTLIST');
    const ids = new Set(eligible.map(target => securityId(target)));
    const history = {
      id:uid('SCOUT'),approvedAt,missionId:state?.mission?.id || null,count:eligible.length,
      strategy:String(state?.scouting?.strategy || 'sustainable'),topTicker:eligible[0]?.ticker || null,
      source:'TRANSFER_SHORTLIST_APPROVAL'
    };
    const next = {
      ...state,
      scouting:{
        ...(state.scouting || {}),
        status:'SCOUTING_READY',
        approvedBatchId:approvalBatchId,
        targets:rows.map(target => {
          const approved = ids.has(securityId(target));
          return {...target,approvedForTransfer:approved,approvedAt:approved ? approvedAt : null,approvalBatchId:approved ? approvalBatchId : null};
        }),
        decisionHistory:[history,...arr(state?.scouting?.decisionHistory)].slice(0,20),
        updatedAt:approvedAt
      }
    };
    if (writeState(next,state,'transfer-shortlist-approval')) toast(`${eligible.length} target${eligible.length === 1 ? '' : 's'} approved for Transfer.`);
  }

  function saveBroker(targetId,tickerValue,account) {
    const state = readState();
    if (!state || routeLocked(state)) { toast('Transfer route is locked. Broker routing cannot be changed.'); return; }
    const code = accountCode(account);
    const transfer = {...(state.transfer || {})};
    const prefs = {...(transfer.brokerPreferences || {})};
    const key = String(targetId || tickerValue || '').trim();
    const tk = ticker(tickerValue);
    if (code === 'CHECK') {
      if (key) delete prefs[key];
      if (tk) delete prefs[tk];
    } else {
      const value = {account:code,source:'TRANSFER_SHORTLIST_USER',updatedAt:now()};
      if (key) prefs[key] = value;
      if (tk) prefs[tk] = value;
    }
    transfer.brokerPreferences = prefs;
    const next = {...state,transfer};
    if (writeState(next,state,'transfer-broker-preference')) toast(code === 'CHECK' ? `${tk || 'Target'} broker returned to Auto.` : `${tk || 'Target'} routed to ${accountLabel(code)}.`);
  }

  function render() {
    ensureStyles();
    const host = ensureSection();
    const state = readState();
    if (!host || !state) return;

    const {strategy,rows} = sortedTargets(state);
    const scoutingStatus = String(state?.scouting?.status || 'SCOUTING_REVIEW').toUpperCase();
    const approved = rows.filter(approvedTarget);
    const blocked = rows.filter(blockedTarget);
    const selectable = rows.filter(selectableTarget);
    const brokerRows = rows.map(target => ({target,route:resolveBroker(state,target)}));
    const brokerResolved = brokerRows.filter(item => item.route.resolved).length;
    const ready = scoutingStatus === 'SCOUTING_READY' && approved.length > 0;
    const label = strategy === 'maximum' ? 'Maximum Income' : 'Sustainable Income';
    const visible = rows.slice(0,8);
    const locked = routeLocked(state);

    host.innerHTML = `
      <div class="scouting-intake-head">
        <div><span class="transfer-kicker">Stage T2 • Scouting Intake</span><h2>Approved shortlist</h2><p>Transfer uses Scouting's canonical PASS / CAUTION evidence without rescoring it. You can approve that shortlist here and confirm the broker route before allocations are built.</p></div>
        <div class="scouting-intake-actions">
          <span class="scouting-intake-chip">${esc(label)}</span>
          <button type="button" id="transferApproveShortlist" class="scouting-approve-btn ${ready ? 'approved' : ''}" ${locked || !selectable.length || ready ? 'disabled' : ''}>${ready ? `Shortlist Approved • ${approved.length}` : 'Approve Shortlist'}</button>
        </div>
      </div>
      <div class="scouting-kpis">
        <div><small>Scouting status</small><strong>${esc(scoutingStatus.replaceAll('_',' '))}</strong></div>
        <div><small>Active targets</small><strong>${rows.length}</strong></div>
        <div><small>Approved</small><strong>${approved.length}</strong></div>
        <div><small>Broker resolved</small><strong>${brokerResolved}/${rows.length}</strong></div>
        <div><small>Blocked / pending</small><strong>${blocked.length}</strong></div>
      </div>
      ${visible.length ? `<div class="scouting-list">${visible.map((target,index) => {
        const blockedFlag = blockedTarget(target);
        const approvedFlag = approvedTarget(target);
        const rank = activeRank(target,strategy) < 9999 ? activeRank(target,strategy) : index + 1;
        const score = activeScore(target,strategy);
        const yieldValue = Math.max(0,num(target?.yieldPct));
        const route = resolveBroker(state,target);
        const preference = preferenceFor(state,target);
        const approvalClass = blockedFlag ? 'blocked' : approvedFlag ? 'approved' : 'review';
        const approvalText = blockedFlag ? (String(target?.status || '').toLowerCase() === 'pending' ? 'PENDING' : 'BLOCKED') : approvedFlag ? 'APPROVED' : 'REVIEW';
        const options = [
          `<option value="CHECK" ${preference === 'CHECK' ? 'selected' : ''}>Auto / evidence</option>`,
          `<option value="IG" ${preference === 'IG' ? 'selected' : ''}>IG ISA</option>`,
          `<option value="T212" ${preference === 'T212' ? 'selected' : ''}>Trading 212 ISA</option>`
        ].join('');
        return `<div class="scouting-row">
          <div class="scouting-rank">#${rank}</div>
          <div class="scouting-name"><b>${esc(target?.ticker || '—')} • ${esc(target?.name || 'Target')}</b><span>${esc(target?.recommendation || target?.status || 'Pending')}</span></div>
          <div class="scouting-cell"><strong>${score ? `${score}/100` : '—'}</strong><span>${esc(label)} score</span></div>
          <div class="scouting-cell"><strong>${yieldValue ? `${yieldValue.toFixed(2)}%` : '—'}</strong><span>Yield</span></div>
          <div class="scouting-cell scouting-broker-cell">
            <strong class="${route.resolved ? 'resolved' : 'unresolved'}">${esc(accountLabel(route.account))}</strong>
            <span>${esc(route.source)}${route.eligible.length ? ` • eligible ${route.eligible.map(accountLabel).join(' / ')}` : ''}</span>
            <select data-broker-id="${esc(securityId(target))}" data-broker-ticker="${esc(target?.ticker || '')}" aria-label="Broker route for ${esc(target?.ticker || 'target')}" ${locked ? 'disabled' : ''}>${options}</select>
          </div>
          <span class="scouting-approval ${approvalClass}">${approvalText}</span>
        </div>`;
      }).join('')}</div>` : '<div class="scouting-empty">No canonical Scouting targets are currently stored on this device.</div>'}
      <div class="scouting-gate ${ready ? 'ready' : 'hold'}"><strong>${ready ? 'SCOUTING SHORTLIST READY' : 'SCOUTING SHORTLIST NOT READY'}</strong><br>${ready ? `${approved.length} approved target${approved.length === 1 ? '' : 's'} can feed the allocation engine. Broker evidence is resolved for ${brokerResolved} of ${rows.length} active targets.` : selectable.length ? `${selectable.length} PASS / CAUTION target${selectable.length === 1 ? '' : 's'} can be approved here. Confirm any CHECK broker rows before expecting a purchase route.` : 'No PASS / CAUTION target currently clears the Scouting handoff gate.'}</div>`;

    document.getElementById('transferApproveShortlist')?.addEventListener('click',approveShortlist);
    host.querySelectorAll('select[data-broker-id]').forEach(select => select.addEventListener('change',() => saveBroker(select.dataset.brokerId,select.dataset.brokerTicker,select.value)));

    document.documentElement.dataset.transferScoutingIntake = ready ? 'ready' : 'hold';
    window.AuroraTransferScoutingIntake = Object.freeze({
      build:BUILD,ready:true,readOnly:false,strategy,scoutingStatus,activeTargets:rows.length,
      approvedTargets:approved.length,blockedTargets:blocked.length,brokerResolvedTargets:brokerResolved,
      allocationGateReady:ready,approvedIds:approved.map(target => securityId(target))
    });
  }

  function boot() {
    render();
    window.addEventListener('pageshow',render);
    window.addEventListener('focus',render);
    window.addEventListener('aurora2:state',render);
    window.addEventListener('storage',event => { if (event.key === STATE_KEY || event.key === BACKUP_KEY) render(); });
    document.addEventListener('visibilitychange',() => { if (document.visibilityState === 'visible') render(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
