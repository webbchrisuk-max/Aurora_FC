(() => {
  'use strict';

  const BUILD = '20260820-stage4c-finance-main-probe-2';
  const PRIORITY = 60;
  const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();
  const isFinanceProbe = currentFile.startsWith('finance-stage4c');

  let houseLoaded = false;
  let financeLoaded = false;
  let legacyDomNodes = 0;
  let startupRuns = 0;
  let stateEventsSent = 0;
  let houseWriteAttempts = 0;
  let houseUpdateAttempts = 0;
  let financeWriteAttempts = 0;
  let financeUpdateAttempts = 0;
  let stateWriteAttempts = 0;
  let stateUpdateAttempts = 0;
  let runtimeErrors = [];
  let phase = 'idle';
  let coreWrapped = false;

  function ownerPriority() { return Number(window.AuroraStageOwner?.priority || 0); }
  function claimStage() {
    if (ownerPriority() > PRIORITY) return false;
    window.AuroraStageOwner = { stage: '4C', build: BUILD, priority: PRIORITY };
    document.documentElement.dataset.auroraStageOwner = '4C';
    return true;
  }

  function stampNavigation() {
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach((link) => {
      const raw = String(link.getAttribute('href') || '');
      if (!raw || raw.startsWith('#')) return;
      const target = raw.split('#')[0].split('?')[0];
      const file = target.split('/').pop() || '';
      const allowed = /^(index|finance|scouting|transfer|registration|squad|income|match-report|club-control|system-health)\.html$/i.test(file)
        || /^auroracityfc_nexusv2\.html$/i.test(file)
        || /^finance-stage4c\.html$/i.test(file);
      if (!allowed) return;
      const nextTarget = /^finance\.html$/i.test(file) ? 'finance-stage4c.html' : target;
      link.setAttribute('href', `${nextTarget}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function setGlobalStatus() {
    if (ownerPriority() > PRIORITY) return;
    claimStage();
    document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 4C'; });
    document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'FINANCE MAIN ENGINE PROBE'; });
    document.querySelectorAll('.department-hero small, .hero small').forEach((node) => {
      node.textContent = String(node.textContent || '').replace(/STAGE 3[HI]|STAGE 4[A-C]/gi, 'STAGE 4C');
    });
    stampNavigation();
  }

  function ensurePanel() {
    if (!isFinanceProbe || document.getElementById('stage4cFinancePanel')) return;
    const main = document.querySelector('main.page') || document.querySelector('main') || document.body;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'stage4cFinancePanel';
    panel.innerHTML = '<small>STAGE 4C RUNTIME CHECK</small><h2 id="stage4cFinanceStatus">Finance Main: WAITING…</h2><p id="stage4cFinanceNote">Waiting for the verified Funding shield before mounting the old Finance DOM harness.</p>';
    main.appendChild(panel);
  }

  function report(label, note) {
    setGlobalStatus();
    ensurePanel();
    const title = document.getElementById('stage4cFinanceStatus');
    const text = document.getElementById('stage4cFinanceNote');
    if (title) title.textContent = `Finance Main: ${label}`;
    if (text) {
      text.textContent = `${note} Legacy DOM nodes: ${legacyDomNodes}. Startup runs: ${startupRuns}. State refreshes: ${stateEventsSent}. `
        + `House writes/updates blocked: ${houseWriteAttempts}/${houseUpdateAttempts}. `
        + `Finance writes/updates blocked: ${financeWriteAttempts}/${financeUpdateAttempts}. `
        + `State-cycle writes/updates blocked: ${stateWriteAttempts}/${stateUpdateAttempts}. `
        + `Runtime errors: ${runtimeErrors.length}.`;
    }
    window.AuroraStage4C = Object.freeze({
      build: BUILD,
      houseLoaded,
      financeLoaded,
      legacyDomNodes,
      startupRuns,
      stateEventsSent,
      houseWriteAttempts,
      houseUpdateAttempts,
      financeWriteAttempts,
      financeUpdateAttempts,
      stateWriteAttempts,
      stateUpdateAttempts,
      runtimeErrors: [...runtimeErrors],
      stateWritesEnabled: false,
      stageOwner: window.AuroraStageOwner?.stage || null
    });
  }

  function recordError(value) {
    const msg = String(value?.message || value || 'Unknown error');
    if (!runtimeErrors.includes(msg)) runtimeErrors.push(msg);
    report('ERROR ❌', `Runtime error captured: ${msg}`);
  }

  window.addEventListener('error', (event) => {
    if (isFinanceProbe) recordError(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isFinanceProbe) recordError(event.reason || 'Unhandled promise rejection');
  });

  function wrapCore() {
    if (coreWrapped) return true;
    const core = window.Aurora2?.core;
    if (!core?.read || typeof core.write !== 'function' || typeof core.update !== 'function') return false;
    const previousWrite = core.write;
    const previousUpdate = core.update;

    core.write = function auroraStage4CWrite(nextState) {
      if (phase === 'house') houseWriteAttempts += 1;
      else if (phase === 'finance') financeWriteAttempts += 1;
      else if (phase === 'state') stateWriteAttempts += 1;
      const result = previousWrite(nextState);
      report('ACTIVE ✅', 'A Core write was intercepted by the verified read-only stack.');
      return result;
    };

    core.update = function auroraStage4CUpdate(mutator) {
      if (phase === 'house') houseUpdateAttempts += 1;
      else if (phase === 'finance') financeUpdateAttempts += 1;
      else if (phase === 'state') stateUpdateAttempts += 1;
      const result = previousUpdate(mutator);
      report('ACTIVE ✅', 'A Core update was intercepted by the verified read-only stack.');
      return result;
    };

    coreWrapped = true;
    window.AuroraStage4CShield = Object.freeze({ previousWrite, previousUpdate });
    return true;
  }

  function loadHouse() {
    if (window.Aurora2?.house?.renderAll) {
      houseLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/aurora-fc-2/finance-house.js?v=20260820-stage4c-finance-main-probe-2';
      script.async = false;
      script.addEventListener('load', () => {
        houseLoaded = Boolean(window.Aurora2?.house?.renderAll);
        if (!houseLoaded) { reject(new Error('HOUSE_API_MISSING')); return; }
        phase = 'house';
        try { window.Aurora2.house.renderAll(); } catch (error) { phase = 'idle'; reject(error); return; }
        phase = 'idle';
        report('LOADING…', 'House loaded and completed a protected render. Mounting the exact old Finance DOM next.');
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error('HOUSE_LOAD_FAILED')), { once: true });
      document.head.appendChild(script);
    });
  }

  async function mountLegacyFinanceDom() {
    const response = await fetch('/aurora-fc-2/finance.html?v=20260820-stage4c-finance-main-probe-2', { cache: 'no-store' });
    if (!response.ok) throw new Error(`FINANCE_HTML_${response.status}`);
    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const legacyMain = parsed.querySelector('main.shell-page');
    if (!legacyMain) throw new Error('FINANCE_DOM_MAIN_MISSING');

    document.getElementById('stage4cLegacyFinanceHarness')?.remove();
    const harness = document.createElement('div');
    harness.id = 'stage4cLegacyFinanceHarness';
    harness.setAttribute('aria-hidden', 'true');
    Object.assign(harness.style, {
      position: 'absolute', left: '-20000px', top: '0', width: '1400px', minHeight: '7000px',
      pointerEvents: 'none', opacity: '0.001', zIndex: '-1', overflow: 'hidden'
    });
    harness.innerHTML = legacyMain.outerHTML + '<div id="toast" class="finance-toast"></div>';
    document.body.appendChild(harness);
    legacyDomNodes = harness.querySelectorAll('*').length;
    report('LOADING…', 'The exact old Finance command DOM is mounted off-screen. Loading finance.js and capturing its startup callback.');
  }

  function invokeCapturedHandler(entry) {
    try {
      const handler = entry.handler;
      if (typeof handler === 'function') handler.call(document, new Event('DOMContentLoaded'));
      else if (handler && typeof handler.handleEvent === 'function') handler.handleEvent(new Event('DOMContentLoaded'));
      return true;
    } catch (error) {
      recordError(error);
      return false;
    }
  }

  function loadFinanceMain() {
    return new Promise((resolve, reject) => {
      const captured = [];
      const originalAdd = document.addEventListener;
      document.addEventListener = function auroraStage4CCapture(type, handler, options) {
        if (type === 'DOMContentLoaded') {
          captured.push({ handler, options });
          return;
        }
        return originalAdd.call(document, type, handler, options);
      };

      const restore = () => { document.addEventListener = originalAdd; };
      const script = document.createElement('script');
      script.src = '/aurora-fc-2/finance.js?v=20260820-stage4c-finance-main-probe-2';
      script.async = false;
      script.addEventListener('load', () => {
        restore();
        financeLoaded = true;
        phase = 'finance';
        captured.forEach((entry) => {
          if (invokeCapturedHandler(entry)) startupRuns += 1;
        });
        phase = 'idle';
        report('ACTIVE ✅', `The exact main Finance engine loaded and ${captured.length} captured startup callback${captured.length === 1 ? '' : 's'} executed behind the read-only shield.`);
        resolve();
      }, { once: true });
      script.addEventListener('error', () => {
        restore();
        reject(new Error('FINANCE_JS_LOAD_FAILED'));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function sendStateRefresh(delay) {
    setTimeout(() => {
      phase = 'state';
      stateEventsSent += 1;
      try { window.dispatchEvent(new CustomEvent('aurora2:state', { detail: { stage4cProbe: true, sequence: stateEventsSent } })); }
      catch (error) { recordError(error); }
      phase = 'idle';
      report(runtimeErrors.length ? 'ERROR ❌' : 'ACTIVE ✅', 'A controlled aurora2:state refresh completed across Funding, House and the main Finance engine.');
    }, delay);
  }

  async function runProbe() {
    try {
      if (!wrapCore()) throw new Error('CORE_SHIELD_NOT_READY');
      report('LOADING…', 'The corrected Funding/Core shield is active. Loading the exact House engine.');
      await loadHouse();
      await mountLegacyFinanceDom();
      phase = 'house';
      try { window.Aurora2?.house?.renderAll?.(); } finally { phase = 'idle'; }
      await loadFinanceMain();
      sendStateRefresh(250);
      sendStateRefresh(1200);
      sendStateRefresh(3000);
    } catch (error) {
      recordError(error);
    }
  }

  claimStage();
  setGlobalStatus();
  ensurePanel();

  if (!isFinanceProbe) {
    window.AuroraStage4C = Object.freeze({ build: BUILD, financeLoaded: false, stateWritesEnabled: false, stageOwner: '4C' });
    return;
  }

  let tries = 0;
  const wait = () => {
    const fundingReady = Boolean(window.AuroraStage4A?.fundingLoaded);
    const shieldReady = Boolean(window.AuroraStage4AFundingShield?.status?.().trueReadonlyShield);
    if (fundingReady && shieldReady) { runProbe(); return; }
    tries += 1;
    if (tries > 480) { recordError(new Error('FUNDING_SHIELD_WAIT_TIMEOUT')); return; }
    setTimeout(wait, 25);
  };
  wait();
})();