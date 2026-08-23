(() => {
  'use strict';

  const BUILD = '20260823-stage3g-cloud-lifecycle-autosync-hold-2';
  const CLOUD_META_KEY = 'aurora2:cloud:meta:v1';
  const SIGNAL_WATCH_KEY = 'aurora2:scouting:signal-watch:v2';
  let firestoreWriteBlocks = 0;
  let coreWriteBlocks = 0;
  let localMetaBlocks = 0;
  let autoSyncDisableWrites = 0;

  function cloudStatus() {
    try { return window.AuroraCloudSync?.status?.() || null; } catch (_) { return null; }
  }

  function report(status, detail = {}) {
    const state = cloudStatus();
    const payload = {
      build: BUILD,
      status,
      phase: detail.phase || state?.phase || 'WAITING',
      cloudModuleLoaded: Boolean(window.AuroraCloudSync),
      firestoreWritesBlocked: firestoreWriteBlocks,
      coreWritesBlocked: coreWriteBlocks,
      localMetaWritesBlocked: localMetaBlocks,
      autoSyncDisableWrites,
      cloudWritesEnabled: false,
      localApplyEnabled: false,
      backgroundAutoSyncEnabled: false,
      ...detail
    };
    document.documentElement.dataset.auroraCloudLifecycle = String(status || 'unknown').toLowerCase();
    document.documentElement.dataset.auroraCloudPhase = String(payload.phase || 'unknown').toLowerCase();

    const panel = document.getElementById('stage3gCloudLifecycleStatus');
    const note = document.getElementById('stage3gCloudLifecycleNote');
    if (panel) {
      const label = status === 'ACTIVE' ? 'ACTIVE ✅' : status === 'FAILED' ? 'FAILED ❌' : 'LOADING…';
      panel.textContent = `Cloud Lifecycle: ${label}`;
    }
    if (note) {
      const phase = payload.phase ? `Phase: ${payload.phase}. ` : '';
      note.textContent = `${phase}Cloud sign-in/read is available. Background auto-sync is paused on this dry-run shell to prevent repeated state refreshes.`;
    }
    window.dispatchEvent(new CustomEvent('aurora:stage3g-cloud-lifecycle', { detail: payload }));
  }

  if (!window.Aurora2?.core?.read || !window.Aurora2?.core?.write) {
    report('FAILED', { phase: 'CORE_NOT_READY', error: 'CORE_NOT_READY' });
    return;
  }

  const originalCoreWrite = window.Aurora2.core.write;
  window.Aurora2.core.write = function auroraStage3gDryRunCoreWrite() {
    coreWriteBlocks += 1;
    report('ACTIVE', { phase: 'LOCAL_APPLY_BLOCKED' });
    return window.Aurora2.core.read();
  };

  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function auroraStage3gSetItem(key, value) {
    const storageKey = String(key);
    if (this === window.localStorage && storageKey === CLOUD_META_KEY) {
      let allowAutoSyncDisable = false;
      try {
        const parsed = JSON.parse(String(value || '{}'));
        allowAutoSyncDisable = parsed && parsed.autoSync === false;
      } catch (_) {}
      if (allowAutoSyncDisable) {
        autoSyncDisableWrites += 1;
        return nativeSetItem.call(this, key, value);
      }
      localMetaBlocks += 1;
      report('ACTIVE', { phase: 'LOCAL_META_WRITE_BLOCKED' });
      return;
    }
    if (this === window.localStorage && storageKey === SIGNAL_WATCH_KEY) {
      localMetaBlocks += 1;
      report('ACTIVE', { phase: 'LOCAL_META_WRITE_BLOCKED' });
      return;
    }
    return nativeSetItem.call(this, key, value);
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function auroraStage3gFetch(input, init = {}) {
    let url = '';
    try { url = typeof input === 'string' ? input : String(input?.url || input || ''); } catch (_) {}
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    try {
      const parsed = new URL(url, location.href);
      if (parsed.hostname === 'firestore.googleapis.com' && method === 'PATCH') {
        firestoreWriteBlocks += 1;
        report('ACTIVE', { phase: 'FIRESTORE_WRITE_BLOCKED' });
        return Promise.reject(new TypeError('AURORA_STAGE3G_FIRESTORE_PATCH_BLOCKED'));
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  report('LOADING', { phase: 'LOADING_CLOUD_MODULE' });

  const cloud = document.createElement('script');
  cloud.src = '/aurora-fc-2/aurora-cloud-sync.js?v=20260823-stage3g-cloud-autosync-hold-2';
  cloud.async = false;
  cloud.dataset.auroraStage3 = 'cloud-lifecycle-dry-run';
  cloud.addEventListener('load', () => {
    document.documentElement.dataset.auroraCloudSync = 'loaded';

    // Critical stability rule: this shell is a dry-run/read shell. Keep cloud
    // authentication and reads available, but do not let every aurora2:state
    // event wake a background sync cycle after sign-in.
    try { window.AuroraCloudSync?.setAutoSync?.(false); } catch (_) {}

    report('ACTIVE', { phase: 'MODULE_LOADED_AUTOSYNC_PAUSED' });

    try {
      window.AuroraCloudSync?.subscribe?.((state) => {
        report('ACTIVE', { phase: state?.phase || 'ACTIVE', cloudState: state || null });
      });
    } catch (_) {}

    const ready = window.AuroraCloudSync?.ready;
    if (ready && typeof ready.then === 'function') {
      ready.then((state) => {
        try { window.AuroraCloudSync?.setAutoSync?.(false); } catch (_) {}
        report('ACTIVE', { phase: state?.phase || 'READY', cloudReady: true, cloudState: state || null });
      }).catch((error) => {
        report('ACTIVE', { phase: 'READY_ERROR_SHIELDED', error: String(error?.message || error || '') });
      });
    }
  }, { once: true });
  cloud.addEventListener('error', () => {
    document.documentElement.dataset.auroraCloudSync = 'failed';
    report('FAILED', { phase: 'CLOUD_MODULE_LOAD_FAILED', error: 'CLOUD_MODULE_LOAD_FAILED' });
  }, { once: true });
  document.head.appendChild(cloud);

  window.AuroraStage3GShield = Object.freeze({
    build: BUILD,
    active: true,
    originalCoreWrite,
    nativeFetch,
    nativeSetItem,
    status: () => ({
      firestoreWriteBlocks,
      coreWriteBlocks,
      localMetaBlocks,
      autoSyncDisableWrites,
      backgroundAutoSyncEnabled: false,
      cloud: cloudStatus()
    })
  });
})();