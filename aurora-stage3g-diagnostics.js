(() => {
  'use strict';

  function ensurePanel() {
    if (document.getElementById('stage3gDiagnostics')) return;
    const anchor = document.getElementById('stage3gCloudLifecycleStatus')?.closest('.panel');
    if (!anchor) return;

    const panel = document.createElement('section');
    panel.id = 'stage3gDiagnostics';
    panel.className = 'panel';
    panel.innerHTML = '<small>STAGE 3G DIAGNOSTICS</small><h2 id="stage3gDiagTitle">Checking Cloud Sync…</h2><p id="stage3gDiagText">Reading shield counters and Cloud Sync status.</p>';
    anchor.insertAdjacentElement('afterend', panel);
  }

  function render() {
    ensurePanel();
    const title = document.getElementById('stage3gDiagTitle');
    const text = document.getElementById('stage3gDiagText');
    if (!title || !text) return;

    let shield = null;
    let cloud = null;
    try { shield = window.AuroraStage3GShield?.status?.() || null; } catch (_) {}
    try { cloud = window.AuroraCloudSync?.status?.() || shield?.cloud || null; } catch (_) {}

    const phase = cloud?.phase || 'WAITING';
    const error = cloud?.lastError || 'none';
    const fw = Number(shield?.firestoreWriteBlocks || 0);
    const cw = Number(shield?.coreWriteBlocks || 0);
    const mw = Number(shield?.localMetaBlocks || 0);

    title.textContent = `Cloud phase: ${phase}`;
    text.textContent = `Last error: ${error}. Shield counters — Firestore writes blocked: ${fw}; Core applies blocked: ${cw}; local metadata writes blocked: ${mw}.`;
  }

  document.addEventListener('DOMContentLoaded', render, { once: true });
  window.addEventListener('aurora:stage3g-cloud-lifecycle', render);
  setInterval(render, 1000);
})();
