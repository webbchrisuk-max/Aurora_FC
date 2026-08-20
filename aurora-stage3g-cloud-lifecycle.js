(() => {
  'use strict';

  const BUILD = '20260820-stage3g-cloud-lifecycle-dryrun-2';
  const CLOUD_META_KEY = 'aurora2:cloud:meta:v1';
  const SIGNAL_WATCH_KEY = 'aurora2:scouting:signal-watch:v2';
  const BACKGROUND_PAUSE_KEY = 'aurora2:cloud:stage3g-background-pause:v1';
  let firestoreWriteBlocks = 0;
  let coreWriteBlocks = 0;
  let localMetaBlocks = 0;
  let backgroundPaused = false;
  let pauseReason = '';
  let recoveryScheduled = false;

  const arr = value => Array.isArray(value) ? value : [];
  const nativeSetItem = Storage.prototype.setItem;
  try { backgroundPaused = localStorage.getItem(BACKGROUND_PAUSE_KEY) === '1'; } catch (_) {}

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
      cloudWritesEnabled: false,
      localApplyEnabled: false,
      backgroundSyncPaused: backgroundPaused,
      backgroundPauseReason: pauseReason || null,
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
      const paused = backgroundPaused ? ' Background cloud sync is paused while the rebuild shield is active.' : '';
      note.textContent = `${phase}Real Cloud Sync lifecycle is running with Firestore writes and local state application shielded.${paused}`;
    }
    window.dispatchEvent(new CustomEvent('aurora:stage3g-cloud-lifecycle', { detail: payload }));
  }

  function writeCloudAutoSyncNative(enabled) {
    try {
      const parsed = JSON.parse(localStorage.getItem(CLOUD_META_KEY) || '{}') || {};
      parsed.autoSync = Boolean(enabled);
      nativeSetItem.call(localStorage, CLOUD_META_KEY, JSON.stringify(parsed));
      return true;
    } catch (_) {
      return false;
    }
  }

  function pauseBackgroundSync(reason = 'rebuild-shield') {
    backgroundPaused = true;
    pauseReason = String(reason || 'rebuild-shield');
    try { nativeSetItem.call(localStorage, BACKGROUND_PAUSE_KEY, '1'); } catch (_) {}
    writeCloudAutoSyncNative(false);
    report('ACTIVE', { phase: 'BACKGROUND_SYNC_PAUSED', backgroundSyncPaused: true, backgroundPauseReason: pauseReason });
    return true;
  }

  function resumeBackgroundSync(reason = 'manual-resume') {
    backgroundPaused = false;
    pauseReason = String(reason || 'manual-resume');
    try { localStorage.removeItem(BACKGROUND_PAUSE_KEY); } catch (_) {}
    writeCloudAutoSyncNative(true);
    report('ACTIVE', { phase: 'BACKGROUND_SYNC_RESUMED', backgroundSyncPaused: false, backgroundPauseReason: pauseReason });
    return true;
  }

  function wrapSyncManager() {
    const manager = window.AuroraSyncManager;
    if (!manager?.register || manager.__auroraStage3gCloudPauseWrapped) return Boolean(manager?.__auroraStage3gCloudPauseWrapped);
    const originalRegister = manager.register.bind(manager);
    manager.register = function auroraStage3gRegister(name, run, options = {}) {
      if (String(name || '') === 'cloud-state' && typeof run === 'function') {
        return originalRegister(name, async () => {
          if (backgroundPaused) {
            report('ACTIVE', { phase: 'BACKGROUND_SYNC_PAUSED', skipped: 'cloud-state' });
            return { ok: false, skipped: 'STAGE3G_BACKGROUND_PAUSED' };
          }
          return run();
        }, options);
      }
      return originalRegister(name, run, options);
    };
    try {
      Object.defineProperty(manager, '__auroraStage3gCloudPauseWrapped', { value: true, configurable: false, enumerable: false });
    } catch (_) {
      manager.__auroraStage3gCloudPauseWrapped = true;
    }
    return true;
  }

  function isProtectedWriteError(state) {
    return state?.phase === 'ERROR' && /AURORA_STAGE3G_FIRESTORE_PATCH_BLOCKED/i.test(String(state?.lastError || ''));
  }

  function maybeRecoverProtectedError(state) {
    if (!backgroundPaused || recoveryScheduled || !isProtectedWriteError(state)) return;
    if (state?.working || !state?.signedIn || arr(state?.conflicts).length) return;
    recoveryScheduled = true;
    setTimeout(async () => {
      try {
        const current = cloudStatus();
        if (!backgroundPaused || current?.working || !isProtectedWriteError(current) || arr(current?.conflicts).length) return;
        await window.AuroraCloudSync?.inspectCloud?.();
      } catch (_) {
        // A real read/auth/network failure should remain visible to System Health.
      } finally {
        recoveryScheduled = false;
      }
    }, 120);
  }

  if (!window.Aurora2?.core?.read || !window.Aurora2?.core?.write) {
    report('FAILED', { phase: 'CORE_NOT_READY', error: 'CORE_NOT_READY' });
    return;
  }

  wrapSyncManager();
  if (backgroundPaused) writeCloudAutoSyncNative(false);

  const originalCoreWrite = window.Aurora2.core.write;
  window.Aurora2.core.write = function auroraStage3gDryRunCoreWrite() {
    coreWriteBlocks += 1;
    report('ACTIVE', { phase: 'LOCAL_APPLY_BLOCKED' });
    return window.Aurora2.core.read();
  };

  Storage.prototype.setItem = function auroraStage3gSetItem(key, value) {
    if (this === window.localStorage && (String(key) === CLOUD_META_KEY || String(key) === SIGNAL_WATCH_KEY)) {
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

  window.addEventListener('aurora:cloud-conflict-resolver', (event) => {
    const phase = String(event?.detail?.phase || '').toUpperCase();
    if (['PREPARED','APPLYING_CLOUD_COPY','PROMOTING_DEVICE_MASTER','RESOLVED','FAILED'].includes(phase)) {
      pauseBackgroundSync(`resolver-${phase.toLowerCase()}`);
    }
  });

  report('LOADING', { phase: 'LOADING_CLOUD_MODULE' });

  const cloud = document.createElement('script');
  cloud.src = '/aurora-fc-2/aurora-cloud-sync.js?v=20260820-stage3g-cloud-lifecycle-dryrun-2';
  cloud.async = false;
  cloud.dataset.auroraStage3 = 'cloud-lifecycle-dry-run';
  cloud.addEventListener('load', () => {
    document.documentElement.dataset.auroraCloudSync = 'loaded';
    report('ACTIVE', { phase: 'MODULE_LOADED' });

    try {
      window.AuroraCloudSync?.subscribe?.((state) => {
        report('ACTIVE', { phase: state?.phase || 'ACTIVE', cloudState: state || null });
        maybeRecoverProtectedError(state);
      });
    } catch (_) {}

    const ready = window.AuroraCloudSync?.ready;
    if (ready && typeof ready.then === 'function') {
      ready.then((state) => {
        report('ACTIVE', { phase: state?.phase || 'READY', cloudReady: true, cloudState: state || null });
        maybeRecoverProtectedError(state);
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
    pauseBackgroundSync,
    resumeBackgroundSync,
    status: () => ({
      firestoreWriteBlocks,
      coreWriteBlocks,
      localMetaBlocks,
      backgroundSyncPaused: backgroundPaused,
      backgroundPauseReason: pauseReason || null,
      cloud: cloudStatus()
    })
  });
})();
