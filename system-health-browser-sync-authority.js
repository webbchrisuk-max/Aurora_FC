(() => {
  'use strict';
  const BUILD = '20260823-system-health-browser-sync-authority-2';

  const makeStatus = () => {
    const s = window.AuroraBrowserSync?.status?.();
    if (!s) return null;
    return {
      phase: s.lastError ? 'ERROR' : (s.signedIn ? (s.cloudExists ? 'READY' : 'SETUP') : 'SIGNED_OUT'),
      signedIn: Boolean(s.signedIn),
      online: navigator.onLine !== false,
      bootstrapped: Boolean(s.cloudExists),
      cloudExists: Boolean(s.cloudExists),
      conflicts: [],
      autoSync: false,
      deviceName: s.deviceName || 'Aurora Device',
      deviceId: s.deviceId || '',
      user: s.user || null,
      cloudDeviceName: s.cloudDeviceName || '',
      cloudRevision: Number(s.cloudRevision || 0),
      cloudSavedAt: s.cloudSavedAt || null,
      lastSyncAt: s.lastSyncAt || null,
      lastUploadAt: s.lastUploadAt || null,
      lastDownloadAt: s.lastDownloadAt || null,
      lastError: s.lastError || ''
    };
  };

  function installAdapter() {
    if (!window.AuroraBrowserSync?.status) return false;
    window.AuroraCloudSync = Object.freeze({
      version: 'browser-sync-authority-adapter',
      status: makeStatus,
      subscribe(fn) {
        return window.AuroraBrowserSync?.subscribe?.(() => {
          try { fn(makeStatus()); } catch (_) {}
        }) || (() => {});
      }
    });
    return true;
  }

  function installSyncManagerReadAdapter() {
    const manager = window.AuroraSyncManager;
    if (!manager || typeof manager.status !== 'function') return false;
    if (window.__AuroraSystemHealthSyncStatusSource) return true;

    const sourceStatus = manager.status.bind(manager);
    window.__AuroraSystemHealthSyncStatusSource = sourceStatus;

    const wrappedStatus = () => {
      const base = sourceStatus() || {};
      const browser = window.AuroraBrowserSync?.status?.() || {};
      const browserItem = {
        status: browser.lastError ? 'ERROR' : (browser.signedIn && browser.cloudExists ? 'CONNECTED' : 'CHECK'),
        lastError: browser.lastError || '',
        lastSuccessAt: browser.lastSyncAt || browser.cloudSavedAt || browser.lastUploadAt || browser.lastDownloadAt || null
      };
      return {
        ...base,
        detail: {
          ...(base.detail || {}),
          browserSync: browserItem
        }
      };
    };

    try {
      manager.status = wrappedStatus;
      return manager.status === wrappedStatus;
    } catch (_) {
      return false;
    }
  }

  function relabel() {
    const panel = document.querySelector('.cloud-panel');
    if (!panel) return;
    const eyebrow = panel.querySelector('.health-panel-head small');
    const heading = panel.querySelector('.health-panel-head h2');
    const copy = panel.querySelector('.health-panel-head .health-copy');
    if (eyebrow) eyebrow.textContent = 'BROWSER SYNC';
    if (heading) heading.textContent = 'Cross-Browser State';
    if (copy) copy.textContent = 'Browser Sync is the single cross-browser state authority. Transfers are explicit and backed up; the retired legacy cloud runtime is no longer active.';

    document.querySelectorAll('.cloud-kpi small').forEach(node => { node.textContent = 'Browser Sync'; });
    const writeMode = document.getElementById('cloudWriteMode');
    const writeMeta = document.getElementById('cloudWriteMeta');
    const applyMode = document.getElementById('cloudApplyMode');
    const applyMeta = document.getElementById('cloudApplyMeta');
    if (writeMode) writeMode.textContent = 'MANUAL';
    if (writeMeta) writeMeta.textContent = 'Explicit Save This Browser as Master only';
    if (applyMode) applyMode.textContent = 'MANUAL';
    if (applyMeta) applyMeta.textContent = 'Explicit Use Cloud Copy Here only';
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const cloudReady = installAdapter();
      const syncReady = installSyncManagerReadAdapter();
      if ((cloudReady && syncReady) || tries > 80) {
        clearInterval(timer);
        relabel();
        setTimeout(() => window.AuroraSystemHealthRestored?.run?.(), 50);
      }
    }, 50);
  }

  window.AuroraSystemHealthBrowserSyncAuthority = Object.freeze({build:BUILD,ready:true});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
