(() => {
  'use strict';

  const BUILD = '20260822-browser-auto-sync-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const META_KEY = 'aurora2:browser-auto-sync:meta:v1';
  const CORE_SRC = 'aurora-browser-sync.js?v=20260822-browser-sync-1';
  const MASTER_DEBOUNCE_MS = 2800;
  const MASTER_POLL_MS = 10000;
  const FOLLOWER_POLL_MS = 12000;

  if (window.__AuroraBrowserAutoSync === BUILD) return;
  window.__AuroraBrowserAutoSync = BUILD;

  let running = false;
  let timer = 0;
  let masterDebounce = 0;
  let role = 'WAITING';
  let lastError = '';
  let lastAction = '';
  let lastActionAt = null;
  let stopped = false;

  const now = () => new Date().toISOString();
  const safeParse = (value, fallback = null) => { try { return JSON.parse(value); } catch (_) { return fallback; } };

  function readMeta() {
    return {
      role: 'WAITING',
      lastAppliedRevision: 0,
      lastSeenRevision: 0,
      lastMasterUploadAt: null,
      lastFollowerApplyAt: null,
      ...(safeParse(localStorage.getItem(META_KEY) || '{}', {}) || {})
    };
  }

  function saveMeta(patch) {
    const next = { ...readMeta(), ...patch };
    try { localStorage.setItem(META_KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function rawState() {
    return safeParse(localStorage.getItem(STATE_KEY) || 'null', null);
  }

  function isQuotaError(error) {
    const name = String(error?.name || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return name.includes('quota') || message.includes('quota') || message.includes('storage limit');
  }

  function emit(extra = {}) {
    const detail = {
      build: BUILD,
      running,
      role,
      lastError,
      lastAction,
      lastActionAt,
      meta: readMeta(),
      ...extra
    };
    window.AuroraBrowserAutoSync = Object.freeze({
      build: BUILD,
      status: () => detail,
      syncNow: () => cycle('manual'),
      stop: () => { stopped = true; clearTimeout(timer); clearTimeout(masterDebounce); },
      start: () => { if (stopped) { stopped = false; schedule(50); } }
    });
    window.dispatchEvent(new CustomEvent('aurora:browser-auto-sync', { detail }));
    return detail;
  }

  function loadCore() {
    if (window.AuroraBrowserSync) return Promise.resolve(window.AuroraBrowserSync);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => String(script.src || '').includes('aurora-browser-sync.js'));
      if (existing) {
        let tries = 0;
        const wait = setInterval(() => {
          tries += 1;
          if (window.AuroraBrowserSync) { clearInterval(wait); resolve(window.AuroraBrowserSync); }
          else if (tries > 120) { clearInterval(wait); reject(new Error('Browser Sync core did not become ready.')); }
        }, 50);
        return;
      }
      const script = document.createElement('script');
      script.src = CORE_SRC;
      script.async = false;
      script.addEventListener('load', () => {
        let tries = 0;
        const wait = setInterval(() => {
          tries += 1;
          if (window.AuroraBrowserSync) { clearInterval(wait); resolve(window.AuroraBrowserSync); }
          else if (tries > 120) { clearInterval(wait); reject(new Error('Browser Sync core loaded but API was unavailable.')); }
        }, 50);
      }, { once: true });
      script.addEventListener('error', () => reject(new Error('Automatic Browser Sync failed to load.')), { once: true });
      document.head.appendChild(script);
    });
  }

  async function quotaSafeDownload(api) {
    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;
    let pendingBackup = null;
    let backupWasSkipped = false;
    let backupWasRemovedForSpace = false;

    Storage.prototype.setItem = function auroraAutoQuotaSafeSetItem(key, value) {
      if (this !== window.localStorage) return nativeSetItem.call(this, key, value);
      const storageKey = String(key);

      if (storageKey === BACKUP_KEY) {
        pendingBackup = String(value ?? '');
        try { return nativeSetItem.call(this, key, value); }
        catch (error) {
          if (!isQuotaError(error)) throw error;
          backupWasSkipped = true;
          return undefined;
        }
      }

      if (storageKey === STATE_KEY) {
        try { return nativeSetItem.call(this, key, value); }
        catch (error) {
          if (!isQuotaError(error)) throw error;
          try {
            nativeRemoveItem.call(this, BACKUP_KEY);
            backupWasRemovedForSpace = true;
          } catch (_) {}
          return nativeSetItem.call(this, key, value);
        }
      }

      return nativeSetItem.call(this, key, value);
    };

    try {
      const result = await api.downloadCloud();
      if ((backupWasSkipped || backupWasRemovedForSpace) && pendingBackup) {
        try { nativeSetItem.call(window.localStorage, BACKUP_KEY, pendingBackup); } catch (_) {}
      }
      return result;
    } finally {
      Storage.prototype.setItem = nativeSetItem;
    }
  }

  async function determineRole(api) {
    const status = api.status?.() || {};
    if (!status.signedIn) return 'SIGNED_OUT';
    if (!status.cloudExists) return 'NO_MASTER';
    if (status.cloudDeviceId && status.deviceId && status.cloudDeviceId === status.deviceId) return 'MASTER';
    return 'FOLLOWER';
  }

  async function masterPass(api, reason) {
    const state = rawState();
    if (!state) return;
    const statusBefore = api.status?.() || {};
    const localHash = await api.stateHash(state);
    const cloudHash = String(statusBefore.cloudHash || '');
    if (cloudHash && localHash === cloudHash) {
      saveMeta({ role: 'MASTER', lastSeenRevision: Number(statusBefore.cloudRevision) || 0 });
      return;
    }

    lastAction = 'MASTER_UPLOAD';
    lastActionAt = now();
    emit({ reason });
    const remote = await api.uploadMaster();
    const after = api.status?.() || {};
    saveMeta({
      role: 'MASTER',
      lastSeenRevision: Number(after.cloudRevision) || Number(remote?.revision) || 0,
      lastMasterUploadAt: now()
    });
  }

  async function followerPass(api, reason) {
    const cloud = await api.inspect();
    const status = api.status?.() || {};
    if (!cloud || !status.cloudExists) return;

    const local = rawState();
    if (!local) return;
    const localHash = await api.stateHash(local);
    const cloudHash = String(status.cloudHash || cloud.hash || '');
    const revision = Number(status.cloudRevision || cloud.revision || 0);
    saveMeta({ role: 'FOLLOWER', lastSeenRevision: revision });

    if (cloudHash && localHash === cloudHash) {
      const m = readMeta();
      if (revision > Number(m.lastAppliedRevision || 0)) saveMeta({ lastAppliedRevision: revision });
      return;
    }

    lastAction = 'FOLLOWER_APPLY';
    lastActionAt = now();
    emit({ reason, revision });
    await quotaSafeDownload(api);
    saveMeta({
      role: 'FOLLOWER',
      lastAppliedRevision: revision,
      lastSeenRevision: revision,
      lastFollowerApplyAt: now()
    });

    try { sessionStorage.setItem('aurora2:browser-auto-sync:last-reload', String(revision)); } catch (_) {}
    setTimeout(() => location.reload(), 450);
  }

  async function cycle(reason = 'timer') {
    if (stopped || running || document.visibilityState === 'hidden') return;
    running = true;
    lastError = '';
    emit({ reason });
    try {
      const api = await loadCore();
      if (api.ready && typeof api.ready.then === 'function') {
        try { await Promise.race([api.ready, new Promise(resolve => setTimeout(resolve, 5000))]); } catch (_) {}
      }

      let status = api.status?.() || {};
      if (!status.signedIn) {
        role = 'SIGNED_OUT';
        saveMeta({ role });
        return;
      }

      if (!status.cloudExists) {
        try { await api.inspect(); } catch (_) {}
        status = api.status?.() || {};
      }

      role = await determineRole(api);
      saveMeta({ role });

      if (role === 'MASTER') await masterPass(api, reason);
      else if (role === 'FOLLOWER') await followerPass(api, reason);
    } catch (error) {
      lastError = String(error?.message || error || 'Automatic Browser Sync failed.');
      emit({ reason });
    } finally {
      running = false;
      emit({ reason });
      schedule(role === 'MASTER' ? MASTER_POLL_MS : FOLLOWER_POLL_MS);
    }
  }

  function schedule(delay) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => cycle('scheduled'), Math.max(250, Number(delay) || FOLLOWER_POLL_MS));
  }

  function queueMasterChange(reason = 'state-change') {
    if (role !== 'MASTER' || stopped) return;
    clearTimeout(masterDebounce);
    masterDebounce = setTimeout(() => cycle(reason), MASTER_DEBOUNCE_MS);
  }

  window.addEventListener('aurora2:state', () => queueMasterChange('aurora-state'));
  window.addEventListener('storage', event => {
    if (event.key === STATE_KEY) {
      if (role === 'MASTER') queueMasterChange('storage-change');
      else schedule(350);
    }
  });
  window.addEventListener('focus', () => schedule(250));
  window.addEventListener('online', () => schedule(300));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(250);
  });

  emit();
  schedule(600);
})();
