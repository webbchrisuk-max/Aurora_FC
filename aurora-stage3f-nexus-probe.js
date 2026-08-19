(() => {
  'use strict';

  const BUILD = '20260819-stage3f-club-command-visual-1';
  const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (!['index.html', 'auroracityfc_nexusv2.html'].includes(page)) return;

  function ensurePanel() {
    let panel = document.getElementById('auroraStage3fRuntimePanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'auroraStage3fRuntimePanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <small>STAGE 3F RUNTIME CHECK</small>
      <h2>Club Command: <span data-probe-state>LOADING…</span></h2>
      <p data-probe-copy>Waiting for the read-only Club Command module to finish loading. Its live-price request and 60-second refresh timer are the active test.</p>
    `;

    const hero = document.querySelector('main.page .hero');
    if (hero) hero.insertAdjacentElement('afterend', panel);
    else document.querySelector('main.page')?.prepend(panel);
    return panel;
  }

  function paint(state, copy) {
    const panel = ensurePanel();
    const stateNode = panel?.querySelector('[data-probe-state]');
    const copyNode = panel?.querySelector('[data-probe-copy]');
    if (stateNode) stateNode.textContent = state;
    if (copyNode && copy) copyNode.textContent = copy;
    panel?.setAttribute('data-state', state.toLowerCase());
  }

  paint('LOADING…');

  const current = document.documentElement.dataset.auroraClubCommand;
  if (current === 'loaded') {
    paint('ACTIVE ✅', 'Club Command loaded successfully. The live-price request and 60-second refresh timer are now running; cloud writes remain disabled.');
  } else if (current === 'failed') {
    paint('FAILED ❌', 'Club Command failed to load. The Stage 3E recovery checkpoint remains available.');
  }

  document.addEventListener('aurora:club-command-probe-ready', () => {
    paint('ACTIVE ✅', 'Club Command loaded successfully. The live-price request and 60-second refresh timer are now running; cloud writes remain disabled.');
  });

  window.setTimeout(() => {
    const status = document.documentElement.dataset.auroraClubCommand;
    if (status === 'loaded') {
      paint('ACTIVE ✅', 'Club Command loaded successfully. The live-price request and 60-second refresh timer are now running; cloud writes remain disabled.');
    } else if (status === 'failed') {
      paint('FAILED ❌', 'Club Command failed to load. The Stage 3E recovery checkpoint remains available.');
    } else {
      paint('STILL LOADING…', 'Club Command has not reported ready yet. Keep this page open while the probe completes.');
    }
  }, 4000);

  window.AuroraStage3FVisualProbe = Object.freeze({ build: BUILD, ready: true });
})();
