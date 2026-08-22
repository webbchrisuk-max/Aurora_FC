(() => {
  'use strict';

  const BUILD = '20260822-transfer-chairman-strategy-comparison-2-remount-recovery';
  if (window.__auroraTransferChairmanStrategyComparison === BUILD) return;
  window.__auroraTransferChairmanStrategyComparison = BUILD;

  let collecting = false;
  let scheduled = 0;
  let recoveryAttempts = 0;

  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(num(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));

  function styles() {
    if (document.getElementById('transferChairmanStrategyComparisonStyles')) return;
    const style = document.createElement('style');
    style.id = 'transferChairmanStrategyComparisonStyles';
    style.textContent = `
      .co-strategy-compare{margin-top:16px}.co-strategy-compare>h4{margin:0 0 9px;font:950 15px/1.2 system-ui}.co-strategy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.co-strategy-card{appearance:none;text-align:left;padding:14px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(0,0,0,.14);color:#eee7ef;cursor:pointer}.co-strategy-card.active{border-color:rgba(243,201,105,.31);background:rgba(243,201,105,.055)}.co-strategy-card h5{margin:0;font:950 14px/1.2 system-ui}.co-strategy-tags{display:flex;gap:5px;flex-wrap:wrap;min-height:20px;margin-top:7px}.co-strategy-tags b{padding:4px 6px;border-radius:999px;border:1px solid rgba(89,255,154,.18);color:#9affbd;background:rgba(89,255,154,.035);font:850 6px/1 system-ui;letter-spacing:.07em}.co-strategy-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.co-strategy-metrics span{display:block;padding:7px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(255,255,255,.012)}.co-strategy-metrics small{display:block;color:#817a84;font:750 7px/1.2 system-ui;text-transform:uppercase}.co-strategy-metrics strong{display:block;margin-top:4px;font:900 11px/1.2 system-ui}.co-strategy-note{margin-top:7px;color:#756e78;font:700 7px/1.35 system-ui}.co-strategy-empty{color:#8c8390}.co-strategy-card .good{color:#9affbd}.co-strategy-card .bad{color:#ff9ca8}@media(max-width:820px){.co-strategy-grid{grid-template-columns:1fr}.co-strategy-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:520px){.co-strategy-metrics{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function chairmanHost() {
    return document.getElementById('transferChairmanOffers');
  }

  function chairmanReady() {
    return Boolean(window.AuroraTransferChairmanOffers?.ready);
  }

  function deskStillLoading() {
    const host = chairmanHost();
    if (!host) return false;
    if (chairmanReady()) return false;
    return /LOADING REVIEW|Checking current Squad holdings|Loading Squad profit triggers/i.test(host.textContent || '');
  }

  function safeHold(message) {
    const host = chairmanHost();
    if (!host || chairmanReady()) return;
    const chip = host.querySelector('.co-chip');
    if (chip) chip.textContent = 'SAFE HOLD';
    const empty = host.querySelector('.co-empty');
    if (empty) empty.textContent = message;
    host.dataset.chairmanReady = 'error';
  }

  function kickExisting(reason) {
    const api = window.AuroraTransferChairmanOffers;
    if (!api?.ready) return false;
    try {
      if (typeof api.refresh === 'function') api.refresh(`recovery:${reason}`);
      else window.dispatchEvent(new CustomEvent('aurora2:state',{detail:{source:'transfer-chairman-remount',reason}}));
    } catch (_) {
      window.dispatchEvent(new CustomEvent('aurora2:state',{detail:{source:'transfer-chairman-remount',reason}}));
    }
    return true;
  }

  function recoverChairman(reason='settle') {
    const host = chairmanHost();
    if (!host) return;
    if (kickExisting(reason)) {
      setTimeout(schedule,80);
      return;
    }
    if (!deskStillLoading()) return;
    if (recoveryAttempts >= 1) {
      safeHold('Chairman engine did not initialise after one clean retry. No portfolio data was changed.');
      return;
    }

    recoveryAttempts += 1;
    window.__auroraTransferChairmanOffers = '';
    const oldRecovery = document.getElementById('transferChairmanRecoveryScript');
    if (oldRecovery) oldRecovery.remove();

    const script = document.createElement('script');
    script.id = 'transferChairmanRecoveryScript';
    script.src = `transfer-chairman-offers.js?v=20260822-transfer-chairman-offers-3-remount-${Date.now()}`;
    script.async = true;
    script.onload = () => setTimeout(() => {
      if (kickExisting('reloaded')) {
        setTimeout(schedule,80);
      } else {
        safeHold('Chairman engine file loaded but did not initialise. No portfolio data was changed.');
      }
    },120);
    script.onerror = () => safeHold('Chairman engine file could not be loaded. No portfolio data was changed.');
    document.head.appendChild(script);
  }

  function snapshot() {
    const api = window.AuroraTransferChairmanOffers;
    const current = api?.current;
    if (!api?.ready || !current) return null;
    const allocations = Array.isArray(current.allocations) ? current.allocations : [];
    const allocated = allocations.reduce((sum,row)=>sum + num(row?.amount),0);
    const cash = num(current.cashReleased);
    const surrendered = num(current.incomeSurrendered);
    const replacement = num(current.replacementIncome);
    const net = num(current.netAnnual);
    return {
      lens:String(api.lens || 'sustainable'),
      ticker:String(current.ticker || ''),
      account:String(current.account || ''),
      cashReleased:cash,
      incomeSurrendered:surrendered,
      replacementIncome:replacement,
      netAnnual:net,
      netMonthly:net / 12,
      coverage:surrendered > 0 ? replacement / surrendered * 100 : replacement > 0 ? 100 : 0,
      allocated,
      holdback:Math.max(0,cash - allocated),
      legs:allocations.length,
      verdict:String(current.verdict || 'REVIEW')
    };
  }

  function chooseLens(name) {
    const button = document.querySelector(`#transferChairmanOffers [data-co-lens="${name}"]`);
    if (!button) return false;
    button.click();
    return true;
  }

  function collect() {
    if (collecting) return;
    const api = window.AuroraTransferChairmanOffers;
    if (!api?.ready || !api.current) return;
    collecting = true;
    const original = String(api.lens || 'sustainable');
    const rows = [];
    try {
      for (const name of ['sustainable','maximum','custom']) {
        if (!chooseLens(name)) continue;
        const row = snapshot();
        if (row) rows.push({...row,name});
      }
      if (String(window.AuroraTransferChairmanOffers?.lens || '') !== original) chooseLens(original);
    } finally {
      collecting = false;
    }
    render(rows,original);
  }

  function render(rows,activeLens) {
    styles();
    const route = document.querySelector('#transferChairmanOffers .co-route');
    const caseHost = document.querySelector('#transferChairmanOffers .co-case');
    if (!caseHost || !rows.length) return;
    document.getElementById('coStrategyComparison')?.remove();
    const valid = rows.filter(row=>row.legs > 0);
    const bestIncome = valid.length ? Math.max(...valid.map(row=>row.replacementIncome)) : null;
    const mostCash = rows.length ? Math.max(...rows.map(row=>row.holdback)) : null;
    const label = name => name === 'maximum' ? 'Maximum Income' : name === 'custom' ? 'Custom Basket' : 'Sustainable Income';
    const panel = document.createElement('div');
    panel.id = 'coStrategyComparison';
    panel.className = 'co-strategy-compare';
    panel.innerHTML = `<h4>Three-way strategy comparison</h4><div class="co-strategy-grid">${rows.map(row=>{
      const tags = [];
      if (bestIncome !== null && row.legs > 0 && Math.abs(row.replacementIncome-bestIncome) < .005) tags.push('BEST INCOME');
      if (mostCash !== null && Math.abs(row.holdback-mostCash) < .005) tags.push('MOST CASH RETAINED');
      return `<button type="button" class="co-strategy-card ${row.name===activeLens?'active':''}" data-co-compare-lens="${esc(row.name)}"><h5>${esc(label(row.name))}</h5><div class="co-strategy-tags">${tags.map(tag=>`<b>${tag}</b>`).join('')}</div><div class="co-strategy-metrics"><span><small>Replacement income</small><strong class="good">${money(row.replacementIncome)}/yr</strong></span><span><small>Net annual</small><strong class="${row.netAnnual>=0?'good':'bad'}">${row.netAnnual>=0?'+':''}${money(row.netAnnual)}</strong></span><span><small>Income coverage</small><strong>${row.coverage.toFixed(1)}%</strong></span><span><small>Cash deployed</small><strong>${money(row.allocated)}</strong></span><span><small>Holdback</small><strong>${money(row.holdback)}</strong></span><span><small>Purchase legs</small><strong>${row.legs}</strong></span></div><div class="co-strategy-note">Chairman verdict: ${esc(row.verdict)}</div></button>`;
    }).join('')}</div>`;
    if (route) route.insertAdjacentElement('beforebegin',panel); else caseHost.appendChild(panel);
    panel.querySelectorAll('[data-co-compare-lens]').forEach(button=>button.addEventListener('click',()=>chooseLens(button.dataset.coCompareLens)));
    window.AuroraTransferChairmanStrategyComparison = Object.freeze({build:BUILD,ready:true,rows:rows.map(row=>({...row}))});
  }

  function schedule() {
    if (collecting) return;
    clearTimeout(scheduled);
    scheduled = setTimeout(collect,40);
  }

  function bootRecovery() {
    setTimeout(()=>recoverChairman('initial-250'),250);
    setTimeout(()=>recoverChairman('initial-1200'),1200);
  }

  styles();
  window.addEventListener('aurora:transfer-chairman-offers',schedule);
  window.addEventListener('pageshow',()=>{recoverChairman('pageshow');schedule();});
  window.addEventListener('focus',()=>recoverChairman('focus'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>{setTimeout(schedule,120);bootRecovery();},{once:true});
  else {setTimeout(schedule,120);bootRecovery();}
})();