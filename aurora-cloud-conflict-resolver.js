(() => {
  'use strict';

  const BUILD = '20260820-cloud-conflict-resolver-1';
  const CLOUD_META_KEY = 'aurora2:cloud:meta:v1';
  const SIGNAL_WATCH_KEY = 'aurora2:scouting:signal-watch:v2';
  const PREPARE_WINDOW_MS = 3 * 60 * 1000;
  let prepared = null;
  let resolving = false;
  let lastResult = null;

  const arr = value => Array.isArray(value) ? value : [];
  const sorted = value => arr(value).map(x => String(x)).sort();
  const sameList = (a,b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

  function deps() {
    return {
      shield: window.AuroraStage3GShield || null,
      cloud: window.AuroraCloudSync || null,
      core: window.Aurora2?.core || null
    };
  }

  function cloudStatus() {
    try { return window.AuroraCloudSync?.status?.() || null; } catch (_) { return null; }
  }

  function isPrepared(status = cloudStatus()) {
    if (!prepared || Date.now() > prepared.expiresAt || !status) return false;
    if (!sameList(status.conflicts, prepared.conflicts)) return false;
    if (Number(status.cloudRevision || 0) !== Number(prepared.cloudRevision || 0)) return false;
    if (String(status.cloudDeviceId || '') !== String(prepared.cloudDeviceId || '')) return false;
    if (String(status.deviceId || '') !== String(prepared.deviceId || '')) return false;
    return true;
  }

  function snapshot() {
    const status = cloudStatus();
    return {
      build: BUILD,
      ready: Boolean(window.AuroraStage3GShield?.active && window.AuroraCloudSync && window.Aurora2?.core?.backup),
      resolving,
      prepared: isPrepared(status),
      preparedAt: prepared?.preparedAt || null,
      expiresAt: prepared?.expiresAt || null,
      conflicts: sorted(status?.conflicts),
      cloudRevision: Number(status?.cloudRevision || 0),
      deviceName: status?.deviceName || 'This device',
      cloudDeviceName: status?.cloudDeviceName || 'Cloud copy',
      lastResult
    };
  }

  function emit(extra = {}) {
    const detail = { ...snapshot(), ...extra };
    window.dispatchEvent(new CustomEvent('aurora:cloud-conflict-resolver', { detail }));
    return detail;
  }

  function requireReady() {
    const { shield, cloud, core } = deps();
    if (!shield?.active || !shield.originalCoreWrite || !shield.nativeFetch || !shield.nativeSetItem) {
      throw new Error('Aurora rebuild shield is not ready for controlled conflict resolution.');
    }
    if (!cloud?.status || !core?.backup || !core?.read) {
      throw new Error('Aurora Cloud or Stable Core is not ready.');
    }
    const status = cloud.status();
    if (!status?.signedIn) throw new Error('Aurora Cloud is not signed in.');
    if (status?.online === false || navigator.onLine === false) throw new Error('This device is offline.');
    if (!arr(status?.conflicts).length) throw new Error('There is no active Aurora Cloud conflict to resolve.');
    return { shield, cloud, core, status };
  }

  function backupCore(core, reason) {
    const ok = core.backup?.(reason);
    if (!ok) throw new Error('Aurora could not create the required last-good local backup.');
    return true;
  }

  async function prepare() {
    if (resolving) throw new Error('A cloud resolution is already running.');
    const { core, status } = requireReady();
    backupCore(core, 'pre-cloud-conflict-resolution-prepare');
    prepared = {
      preparedAt: new Date().toISOString(),
      expiresAt: Date.now() + PREPARE_WINDOW_MS,
      conflicts: sorted(status.conflicts),
      cloudRevision: Number(status.cloudRevision || 0),
      cloudDeviceId: String(status.cloudDeviceId || ''),
      deviceId: String(status.deviceId || '')
    };
    lastResult = null;
    return emit({ phase: 'PREPARED' });
  }

  function validatePrepared() {
    const { shield, cloud, core, status } = requireReady();
    if (!isPrepared(status)) {
      prepared = null;
      emit({ phase: 'PREPARE_EXPIRED' });
      throw new Error('Cloud state changed or the safe-resolution window expired. Prepare the resolution again before choosing a copy.');
    }
    return { shield, cloud, core, status };
  }

  function firestoreTarget(url) {
    try {
      const parsed = new URL(url, location.href);
      if (parsed.hostname !== 'firestore.googleapis.com') return '';
      const path = decodeURIComponent(parsed.pathname || '');
      if (/\/cloud\/aurora2-backup$/i.test(path)) return 'backup';
      if (/\/cloud\/aurora2-state$/i.test(path)) return 'state';
    } catch (_) {}
    return '';
  }

  function restoreAutoSync(nativeSetItem, priorAutoSync) {
    try {
      const current = JSON.parse(localStorage.getItem(CLOUD_META_KEY) || '{}');
      current.autoSync = priorAutoSync !== false;
      nativeSetItem.call(localStorage, CLOUD_META_KEY, JSON.stringify(current));
    } catch (_) {}
  }

  async function withResolutionWindow(mode, context, operation) {
    const { shield, cloud, core } = context;
    const shieldedCoreWrite = core.write;
    const shieldedFetch = window.fetch;
    const shieldedSetItem = Storage.prototype.setItem;
    const originalCoreWrite = shield.originalCoreWrite;
    const nativeFetch = shield.nativeFetch;
    const nativeSetItem = shield.nativeSetItem;
    const priorAutoSync = cloud.status()?.autoSync !== false;
    let permittedCoreWrites = mode === 'cloud' ? 1 : 0;
    const patchQueue = mode === 'device' ? ['backup', 'state'] : [];

    Storage.prototype.setItem = function auroraConflictResolverSetItem(key, value) {
      const name = String(key || '');
      if (this === window.localStorage && (name === CLOUD_META_KEY || (mode === 'cloud' && name === SIGNAL_WATCH_KEY))) {
        return nativeSetItem.call(this, key, value);
      }
      return shieldedSetItem.call(this, key, value);
    };

    core.write = function auroraConflictResolverCoreWrite(next) {
      if (mode === 'cloud' && permittedCoreWrites > 0) {
        permittedCoreWrites -= 1;
        return originalCoreWrite.call(core, next);
      }
      return shieldedCoreWrite.call(core, next);
    };

    window.fetch = function auroraConflictResolverFetch(input, init = {}) {
      let url = '';
      try { url = typeof input === 'string' ? input : String(input?.url || input || ''); } catch (_) {}
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      if (method === 'PATCH') {
        const target = firestoreTarget(url);
        if (target && patchQueue[0] === target) {
          patchQueue.shift();
          return nativeFetch(input, init);
        }
      }
      return shieldedFetch(input, init);
    };

    try {
      try { cloud.setAutoSync?.(false); } catch (_) {}
      return await operation();
    } finally {
      restoreAutoSync(nativeSetItem, priorAutoSync);
      core.write = shieldedCoreWrite;
      window.fetch = shieldedFetch;
      Storage.prototype.setItem = shieldedSetItem;
    }
  }

  async function resolve(mode) {
    if (!['cloud','device'].includes(mode)) throw new Error('Unknown conflict-resolution mode.');
    if (resolving) throw new Error('A cloud resolution is already running.');
    const initial = requireReady();
    if (typeof initial.cloud.inspectCloud === 'function') await initial.cloud.inspectCloud();
    const context = validatePrepared();
    const { cloud, core, status: before } = context;

    backupCore(core, `pre-cloud-conflict-resolution-final-${mode}`);
    resolving = true;
    emit({ phase: mode === 'cloud' ? 'APPLYING_CLOUD_COPY' : 'PROMOTING_DEVICE_MASTER' });

    try {
      const operation = mode === 'cloud'
        ? () => cloud.useCloudCopy()
        : () => cloud.replaceCloudWithThisDevice();
      const result = await withResolutionWindow(mode, context, operation);
      const after = cloud.status?.() || null;
      if (arr(after?.conflicts).length) {
        throw new Error('Aurora completed the copy action but the cloud conflict is still present. No further overwrite was attempted.');
      }
      lastResult = {
        ok: true,
        mode,
        resolvedAt: new Date().toISOString(),
        previousRevision: Number(before?.cloudRevision || 0),
        newRevision: Number(after?.cloudRevision || 0),
        deviceName: after?.deviceName || before?.deviceName || 'This device',
        cloudDeviceName: after?.cloudDeviceName || before?.cloudDeviceName || 'Cloud copy'
      };
      prepared = null;
      emit({ phase: 'RESOLVED', result: lastResult });
      return lastResult;
    } catch (error) {
      lastResult = { ok:false, mode, failedAt:new Date().toISOString(), error:String(error?.message || error) };
      emit({ phase: 'FAILED', error:lastResult.error, result:lastResult });
      throw error;
    } finally {
      resolving = false;
      emit({ phase: 'IDLE' });
    }
  }

  function ensureStyle() {
    if (document.getElementById('auroraCloudResolverStyle')) return;
    const style = document.createElement('style');
    style.id = 'auroraCloudResolverStyle';
    style.textContent = `
      #cloudUseCloud,#cloudUseDevice{display:none!important}
      .cloud-conflict-actions .resolver-prepare{border-color:rgba(251,191,36,.28);color:#fde68a;background:rgba(120,53,15,.14)}
      .cloud-conflict-actions .resolver-cloud{border-color:rgba(56,189,248,.28);color:#dff8ff;background:rgba(8,47,73,.34)}
      .cloud-conflict-actions .resolver-device{border-color:rgba(52,211,153,.28);color:#d8ffe6;background:rgba(6,78,59,.20)}
      .cloud-conflict-actions .resolver-button[hidden]{display:none!important}
      .cloud-resolution-status{display:block!important;margin-top:7px!important;color:#a88f94!important;font-size:8px!important;line-height:1.5!important}
      .cloud-resolution-status.ready{color:#bcebd0!important}
      .cloud-resolution-status.busy{color:#fde68a!important}
      .cloud-resolution-status.error{color:#fecdd3!important}
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    ensureStyle();
    const box = document.getElementById('cloudConflictBox');
    const actions = box?.querySelector('.cloud-conflict-actions');
    const meta = document.getElementById('cloudConflictMeta');
    if (!box || !actions || !meta) return false;

    let status = document.getElementById('cloudResolutionStatus');
    if (!status) {
      status = document.createElement('span');
      status.id = 'cloudResolutionStatus';
      status.className = 'cloud-resolution-status';
      meta.insertAdjacentElement('afterend', status);
    }

    if (!document.getElementById('cloudPrepareResolution')) {
      const prepareButton = document.createElement('button');
      prepareButton.id = 'cloudPrepareResolution';
      prepareButton.type = 'button';
      prepareButton.className = 'resolver-button resolver-prepare';
      prepareButton.textContent = 'Prepare Safe Resolution';
      actions.prepend(prepareButton);

      const cloudButton = document.createElement('button');
      cloudButton.id = 'cloudResolveCloud';
      cloudButton.type = 'button';
      cloudButton.className = 'resolver-button resolver-cloud';
      cloudButton.hidden = true;
      actions.appendChild(cloudButton);

      const deviceButton = document.createElement('button');
      deviceButton.id = 'cloudResolveDevice';
      deviceButton.type = 'button';
      deviceButton.className = 'resolver-button resolver-device';
      deviceButton.hidden = true;
      actions.appendChild(deviceButton);

      prepareButton.addEventListener('click', async () => {
        try {
          prepareButton.disabled = true;
          status.className = 'cloud-resolution-status busy';
          status.textContent = 'Creating a fresh last-good backup and locking the current cloud revision…';
          await prepare();
          updateUi();
        } catch (error) {
          status.className = 'cloud-resolution-status error';
          status.textContent = String(error?.message || error);
          prepareButton.disabled = false;
        }
      });

      cloudButton.addEventListener('click', async () => {
        const s = cloudStatus();
        const cloudName = s?.cloudDeviceName || 'the cloud copy';
        const currentName = s?.deviceName || 'this device';
        const conflicts = sorted(s?.conflicts).join(', ');
        const okay = confirm(`Use ${cloudName} as the winning Aurora copy?\n\nThis will back up ${currentName} first, then make the cloud master authoritative across all Aurora cloud-managed departments on this device.\n\nConflicts: ${conflicts}\n\nContinue?`);
        if (!okay) return;
        await runResolution('cloud', status);
      });

      deviceButton.addEventListener('click', async () => {
        const s = cloudStatus();
        const currentName = s?.deviceName || 'this device';
        const cloudName = s?.cloudDeviceName || 'the current cloud copy';
        const conflicts = sorted(s?.conflicts).join(', ');
        const okay = confirm(`Make ${currentName} the new Aurora Cloud master?\n\nAurora will create a fresh local backup and the cloud engine will back up ${cloudName} before replacing the full Aurora cloud master with this device's cloud-managed state.\n\nConflicts: ${conflicts}\n\nContinue?`);
        if (!okay) return;
        await runResolution('device', status);
      });
    }
    return true;
  }

  async function runResolution(mode, statusNode) {
    const buttons = ['cloudPrepareResolution','cloudResolveCloud','cloudResolveDevice']
      .map(id => document.getElementById(id)).filter(Boolean);
    try {
      buttons.forEach(button => { button.disabled = true; });
      statusNode.className = 'cloud-resolution-status busy';
      statusNode.textContent = mode === 'cloud'
        ? 'Applying the cloud copy through the one-time protected resolution window…'
        : 'Backing up the existing cloud master and promoting this device…';
      const result = await resolve(mode);
      statusNode.className = 'cloud-resolution-status ready';
      statusNode.textContent = `Conflict resolved at ${new Date(result.resolvedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}. Running System Health again…`;
      setTimeout(() => window.AuroraSystemHealthRestored?.run?.(), 100);
      setTimeout(updateUi, 300);
    } catch (error) {
      statusNode.className = 'cloud-resolution-status error';
      statusNode.textContent = String(error?.message || error);
      buttons.forEach(button => { button.disabled = false; });
      setTimeout(() => window.AuroraSystemHealthRestored?.run?.(), 100);
    }
  }

  function updateUi() {
    if (!ensureUi()) return;
    const status = cloudStatus();
    const conflicts = sorted(status?.conflicts);
    const prepareButton = document.getElementById('cloudPrepareResolution');
    const cloudButton = document.getElementById('cloudResolveCloud');
    const deviceButton = document.getElementById('cloudResolveDevice');
    const statusNode = document.getElementById('cloudResolutionStatus');
    if (!prepareButton || !cloudButton || !deviceButton || !statusNode) return;

    const hasConflict = conflicts.length > 0;
    const validPrepared = hasConflict && isPrepared(status);
    const ready = snapshot().ready;
    prepareButton.hidden = !hasConflict;
    prepareButton.disabled = resolving || !ready;
    cloudButton.hidden = !validPrepared;
    deviceButton.hidden = !validPrepared;
    cloudButton.disabled = resolving || !validPrepared;
    deviceButton.disabled = resolving || !validPrepared;
    cloudButton.textContent = `Use ${status?.cloudDeviceName || 'Cloud Copy'}`;
    deviceButton.textContent = `Use ${status?.deviceName || 'This Device'} as Master`;

    if (!hasConflict) {
      statusNode.className = 'cloud-resolution-status ready';
      statusNode.textContent = lastResult?.ok ? 'Cloud conflict cleared. Aurora copies now share a common base.' : 'No active cloud conflict.';
    } else if (resolving) {
      statusNode.className = 'cloud-resolution-status busy';
    } else if (validPrepared) {
      statusNode.className = 'cloud-resolution-status ready';
      const mins = Math.max(1, Math.ceil((prepared.expiresAt - Date.now()) / 60000));
      statusNode.textContent = `Backup ready. Revision #${prepared.cloudRevision} locked for ${mins}m. Choose which copy becomes authoritative.`;
    } else if (!ready) {
      statusNode.className = 'cloud-resolution-status error';
      statusNode.textContent = 'Controlled resolver is waiting for Stable Core, Aurora Cloud and the rebuild shield.';
    } else {
      statusNode.className = 'cloud-resolution-status';
      statusNode.textContent = 'Step 1: prepare a safe resolution. Aurora will create a fresh local backup before either copy can be selected.';
    }
  }

  function start() {
    ensureUi();
    updateUi();
    window.addEventListener('aurora2:cloud-status', () => setTimeout(updateUi, 20));
    window.addEventListener('aurora:stage3g-cloud-lifecycle', () => setTimeout(updateUi, 20));
    window.addEventListener('aurora2:state', () => setTimeout(updateUi, 20));
    window.addEventListener('focus', updateUi);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateUi(); });
    setInterval(updateUi, 2000);
    emit({ phase: 'READY' });
  }

  window.AuroraCloudConflictResolver = Object.freeze({
    build: BUILD,
    status: snapshot,
    prepare,
    resolve
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();