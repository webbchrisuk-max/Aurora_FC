(() => {
  'use strict';

  const BUILD = '20260820-stage4b-finance-house-probe-1';
  const PRIORITY = 50;
  const currentFile = (window.location.pathname.split('/').pop() || '').toLowerCase();
  const isFinanceProbe = currentFile.startsWith('finance-stage4b') || currentFile === 'finance.html';
  let houseLoaded = false;
  let houseWriteAttempts = 0;
  let houseUpdateAttempts = 0;
  let renderCalls = 0;
  let wrapped = false;

  function ownerPriority() { return Number(window.AuroraStageOwner?.priority || 0); }
  function claimStage() {
    if (ownerPriority() > PRIORITY) return false;
    window.AuroraStageOwner = { stage: '4B', build: BUILD, priority: PRIORITY };
    document.documentElement.dataset.auroraStageOwner = '4B';
    return true;
  }

  function setGlobalStatus() {
    if (ownerPriority() > PRIORITY) return;
    claimStage();
    document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 4B'; });
    document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'FINANCE HOUSE PROBE'; });
    document.querySelectorAll('.department-hero small, .hero small').forEach((node) => {
      node.textContent = String(node.textContent || '').replace(/STAGE 3[HI]|STAGE 4A|STAGE 4B/gi, 'STAGE 4B');
    });
  }

  function ensurePanel() {
    if (!isFinanceProbe || document.getElementById('stage4bHousePanel')) return;
    const main = document.querySelector('main.page') || document.querySelector('main') || document.body;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'stage4bHousePanel';
    panel.innerHTML = '<small>STAGE 4B RUNTIME CHECK</small><h2 id="stage4bHouseStatus">Finance House: WAITING…</h2><p id="stage4bHouseNote">Waiting for the verified Funding layer before loading the exact old House engine.</p>';
    main.appendChild(panel);
  }

  function report(label, note) {
    setGlobalStatus();
    ensurePanel();
    const title = document.getElementById('stage4bHouseStatus');
    const text = document.getElementById('stage4bHouseNote');
    if (title) title.textContent = `Finance House: ${label}`;
    if (text) text.textContent = `${note} House write attempts blocked: ${houseWriteAttempts}. House update attempts blocked: ${houseUpdateAttempts}. Render calls: ${renderCalls}.`;
    window.AuroraStage4B = Object.freeze({
      build: BUILD,
      houseLoaded,
      houseWriteAttempts,
      houseUpdateAttempts,
      renderCalls,
      stateWritesEnabled: false,
      stageOwner: window.AuroraStageOwner?.stage || null
    });
  }

  function wrapCoreForHouse() {
    if (wrapped) return true;
    const core = window.Aurora2?.core;
    if (!core?.read || typeof core.write !== 'function' || typeof core.update !== 'function') return false;
    const previousWrite = core.write;
    const previousUpdate = core.update;

    core.write = function auroraStage4BHouseWrite(nextState) {
      houseWriteAttempts += 1;
      const result = previousWrite(nextState);
      report('ACTIVE ✅', 'House attempted a derived Core write; the underlying 4A true read-only shield prevented persistence.');
      return result;
    };

    core.update = function auroraStage4BHouseUpdate(mutator) {
      houseUpdateAttempts += 1;
      const result = previousUpdate(mutator);
      report('ACTIVE ✅', 'House attempted a Core update; the underlying 4A true read-only shield prevented persistence.');
      return result;
    };

    wrapped = true;
    window.AuroraStage4BHouseShield = Object.freeze({ previousWrite, previousUpdate });
    return true;
  }

  function runHouseRender() {
    if (!window.Aurora2?.house?.renderAll) return;
    try {
      renderCalls += 1;
      window.Aurora2.house.renderAll();
      report('ACTIVE ✅', 'The exact House engine completed its startup render/derived-state pass without persistence.');
    } catch (error) {
      report('ERROR ❌', `House render threw: ${String(error?.message || error)}`);
    }
  }

  function loadHouse() {
    if (!wrapCoreForHouse()) return false;
    if (window.AuroraStage4BHouseLoadStarted) return true;
    window.AuroraStage4BHouseLoadStarted = true;
    report('LOADING…', 'Loading the exact old finance-house.js on top of Funding.');

    const script = document.createElement('script');
    script.src = '/Aurora_FC/finance-house.js?v=20260820-stage4b-finance-house-probe-1';
    script.async = false;
    script.addEventListener('load', () => {
      houseLoaded = Boolean(window.Aurora2?.house);
      report(houseLoaded ? 'ACTIVE ✅' : 'FAILED ❌', houseLoaded ? 'The exact old House engine loaded. Running its startup render explicitly.' : 'House script loaded but did not expose Aurora2.house.');
      setTimeout(runHouseRender, 0);
      setTimeout(runHouseRender, 250);
      setTimeout(runHouseRender, 1500);
    }, { once: true });
    script.addEventListener('error', () => report('FAILED ❌', 'The exact old finance-house.js failed to load.'), { once: true });
    document.head.appendChild(script);
    return true;
  }

  claimStage();
  setGlobalStatus();
  ensurePanel();

  if (!isFinanceProbe) return;

  let tries = 0;
  const wait = () => {
    const fundingReady = Boolean(window.AuroraStage4A?.fundingLoaded);
    const shieldReady = Boolean(window.AuroraStage4AFundingShield?.status?.().trueReadonlyShield);
    if (fundingReady && shieldReady && loadHouse()) return;
    tries += 1;
    if (tries > 400) {
      report('FAILED ❌', 'The corrected Stage 4A Funding layer did not become ready for House.');
      return;
    }
    setTimeout(wait, 25);
  };
  wait();
})();
