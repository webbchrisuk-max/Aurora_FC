(() => {
  'use strict';

  const BUILD = '20260820-transfer-scouting-intake-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Math.max(0, Number(value) || 0));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function readState() {
    for (const key of [STATE_KEY, BACKUP_KEY]) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return null;
  }

  function activeScore(target, strategy) {
    return strategy === 'maximum' ? num(target.maximumScore) : num(target.sustainableScore);
  }

  function activeRank(target, strategy) {
    const explicit = strategy === 'maximum' ? num(target.maximumRank) : num(target.rank);
    return explicit > 0 ? explicit : 9999;
  }

  function approvedTarget(target) {
    const blocked = String(target?.status || '').toLowerCase() === 'block' || String(target?.recommendation || '').toUpperCase() === 'BLOCK';
    return !blocked && target?.approvedForTransfer === true;
  }

  function sortedTargets(state) {
    const strategy = String(state?.scouting?.strategy || 'sustainable').toLowerCase() === 'maximum' ? 'maximum' : 'sustainable';
    const rows = Array.isArray(state?.scouting?.targets) ? state.scouting.targets : [];
    return {
      strategy,
      rows: [...rows].sort((a, b) => {
        const approvedDelta = Number(approvedTarget(b)) - Number(approvedTarget(a));
        if (approvedDelta) return approvedDelta;
        return activeRank(a, strategy) - activeRank(b, strategy) || activeScore(b, strategy) - activeScore(a, strategy);
      })
    };
  }

  function ensureStyles() {
    if (document.getElementById('transferScoutingIntakeStyles')) return;
    const style = document.createElement('style');
    style.id = 'transferScoutingIntakeStyles';
    style.textContent = `
      .scouting-intake{margin-top:22px;border:1px solid rgba(110,231,255,.12);border-radius:24px;background:linear-gradient(180deg,rgba(7,18,28,.94),rgba(8,8,16,.94));padding:26px}
      .scouting-intake-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.scouting-intake-head h2{margin:0;font:900 clamp(28px,5vw,44px)/1 system-ui}.scouting-intake-head p{margin:8px 0 0;color:#8ea1ad;max-width:760px;line-height:1.5}.scouting-intake-chip{border:1px solid rgba(110,231,255,.25);border-radius:999px;padding:10px 13px;color:#a9f4ff;font:800 10px/1 system-ui;letter-spacing:.12em;text-transform:uppercase}
      .scouting-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px}.scouting-kpis div{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:15px;background:rgba(0,0,0,.14)}.scouting-kpis small{display:block;color:#718692;font:800 10px/1.2 system-ui;text-transform:uppercase;letter-spacing:.12em;margin-bottom:7px}.scouting-kpis strong{font:900 18px/1.2 system-ui}
      .scouting-list{display:grid;gap:10px;margin-top:18px}.scouting-row{display:grid;grid-template-columns:54px minmax(0,1.5fr) minmax(90px,.6fr) minmax(100px,.7fr) minmax(115px,.8fr);gap:12px;align-items:center;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px;background:rgba(0,0,0,.12)}.scouting-rank{font:900 18px/1 system-ui;color:#ff8996}.scouting-name b{display:block;font:900 16px/1.2 system-ui}.scouting-name span,.scouting-cell span{display:block;color:#7e8e98;font:700 10px/1.3 system-ui;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}.scouting-cell strong{font:900 15px/1.2 system-ui}.scouting-approval{justify-self:start;border-radius:999px;padding:8px 10px;font:800 10px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(255,255,255,.1)}.scouting-approval.approved{color:#94ffb9;border-color:rgba(89,255,154,.3);background:rgba(89,255,154,.05)}.scouting-approval.review{color:#ffe29a;border-color:rgba(255,213,107,.28);background:rgba(255,213,107,.04)}.scouting-approval.blocked{color:#ffabb4;border-color:rgba(255,79,97,.28);background:rgba(255,79,97,.05)}
      .scouting-empty{margin-top:18px;border:1px dashed rgba(110,231,255,.16);border-radius:16px;padding:18px;color:#8699a4}.scouting-gate{margin-top:16px;border-radius:16px;padding:15px;border:1px solid rgba(255,255,255,.08);color:#9aabb4}.scouting-gate.ready{border-color:rgba(89,255,154,.28);color:#a9ffc6}.scouting-gate.hold{border-color:rgba(255,213,107,.25);color:#ffe4a6}
      @media(max-width:760px){.scouting-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.scouting-row{grid-template-columns:42px minmax(0,1fr);align-items:start}.scouting-cell,.scouting-approval{grid-column:2}.scouting-approval{margin-top:2px}}
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
    missionShell.insertAdjacentElement('afterend', section);
    return section;
  }

  function render() {
    ensureStyles();
    const host = ensureSection();
    const state = readState();
    if (!host || !state) return;

    const {strategy, rows} = sortedTargets(state);
    const scoutingStatus = String(state?.scouting?.status || 'SCOUTING_REVIEW').toUpperCase();
    const approved = rows.filter(approvedTarget);
    const blocked = rows.filter(row => String(row?.status || '').toLowerCase() === 'block' || String(row?.recommendation || '').toUpperCase() === 'BLOCK');
    const ready = scoutingStatus === 'SCOUTING_READY' && approved.length > 0;
    const label = strategy === 'maximum' ? 'Maximum Income' : 'Sustainable Income';
    const visible = rows.slice(0, 8);

    host.innerHTML = `
      <div class="scouting-intake-head">
        <div><span class="transfer-kicker">Stage T2 • Scouting Intake</span><h2>Approved shortlist</h2><p>Transfer reads the canonical Scouting targets exactly as approved. It does not rescore securities and it does not allocate cash at this stage.</p></div>
        <span class="scouting-intake-chip">${esc(label)}</span>
      </div>
      <div class="scouting-kpis">
        <div><small>Scouting status</small><strong>${esc(scoutingStatus.replaceAll('_',' '))}</strong></div>
        <div><small>Active targets</small><strong>${rows.length}</strong></div>
        <div><small>Approved for Transfer</small><strong>${approved.length}</strong></div>
        <div><small>Blocked</small><strong>${blocked.length}</strong></div>
      </div>
      ${visible.length ? `<div class="scouting-list">${visible.map((target, index) => {
        const blockedTarget = String(target?.status || '').toLowerCase() === 'block' || String(target?.recommendation || '').toUpperCase() === 'BLOCK';
        const approvedTargetFlag = approvedTarget(target);
        const rank = activeRank(target, strategy) < 9999 ? activeRank(target, strategy) : index + 1;
        const score = activeScore(target, strategy);
        const yieldPct = Math.max(0, num(target?.yieldPct));
        const broker = String(target?.preferredAccount || 'CHECK').toUpperCase();
        const approvalClass = blockedTarget ? 'blocked' : approvedTargetFlag ? 'approved' : 'review';
        const approvalText = blockedTarget ? 'BLOCKED' : approvedTargetFlag ? 'APPROVED' : 'REVIEW';
        return `<div class="scouting-row">
          <div class="scouting-rank">#${rank}</div>
          <div class="scouting-name"><b>${esc(target?.ticker || '—')} • ${esc(target?.name || 'Target')}</b><span>${esc(target?.recommendation || target?.status || 'Pending')}</span></div>
          <div class="scouting-cell"><strong>${score ? `${score}/100` : '—'}</strong><span>${esc(label)} score</span></div>
          <div class="scouting-cell"><strong>${yieldPct ? `${yieldPct.toFixed(2)}%` : '—'}</strong><span>Yield</span></div>
          <div class="scouting-cell"><strong>${esc(broker)}</strong><span>Preferred broker</span></div>
          <span class="scouting-approval ${approvalClass}">${approvalText}</span>
        </div>`;
      }).join('')}</div>` : '<div class="scouting-empty">No canonical Scouting targets are currently stored on this device.</div>'}
      <div class="scouting-gate ${ready ? 'ready' : 'hold'}"><strong>${ready ? 'SCOUTING SHORTLIST READY' : 'SCOUTING SHORTLIST NOT READY'}</strong><br>${ready ? `${approved.length} approved target${approved.length === 1 ? '' : 's'} can feed the allocation engine next.` : 'Transfer will not build allocations until Scouting is marked SCOUTING_READY and at least one target is approved.'}</div>`;

    document.documentElement.dataset.transferScoutingIntake = ready ? 'ready' : 'hold';
    window.AuroraTransferScoutingIntake = Object.freeze({
      build: BUILD,
      ready: true,
      readOnly: true,
      strategy,
      scoutingStatus,
      activeTargets: rows.length,
      approvedTargets: approved.length,
      blockedTargets: blocked.length,
      allocationGateReady: ready,
      approvedIds: approved.map(target => String(target.id || target.securityId || target.ticker || ''))
    });
  }

  function boot() {
    render();
    window.addEventListener('pageshow', render);
    window.addEventListener('focus', render);
    window.addEventListener('aurora2:state', render);
    window.addEventListener('storage', event => {
      if (event.key === STATE_KEY || event.key === BACKUP_KEY) render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
