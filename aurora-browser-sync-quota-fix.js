(() => {
  'use strict';

  const BUILD = '20260822-browser-sync-quota-fix-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';

  if (window.__AuroraBrowserSyncQuotaFix === BUILD) return;
  window.__AuroraBrowserSyncQuotaFix = BUILD;

  const isQuotaError = error => {
    const name = String(error?.name || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return name.includes('quota') || message.includes('quota') || message.includes('storage limit');
  };

  async function quotaSafeDownload() {
    const api = window.AuroraBrowserSync;
    if (!api?.downloadCloud) throw new Error('Browser Sync is not ready.');

    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;
    let pendingBackup = null;
    let backupWasSkipped = false;
    let backupWasRemovedForSpace = false;

    Storage.prototype.setItem = function auroraBrowserSyncQuotaSafeSetItem(key, value) {
      if (this !== window.localStorage) return nativeSetItem.call(this, key, value);
      const storageKey = String(key);

      if (storageKey === BACKUP_KEY) {
        pendingBackup = String(value ?? '');
        try {
          return nativeSetItem.call(this, key, value);
        } catch (error) {
          if (!isQuotaError(error)) throw error;
          // The current working state is still untouched at this point. A
          // duplicate last-good copy must not prevent the authoritative cloud
          // state from being applied on storage-constrained iPad browsers.
          backupWasSkipped = true;
          return undefined;
        }
      }

      if (storageKey === STATE_KEY) {
        try {
          return nativeSetItem.call(this, key, value);
        } catch (error) {
          if (!isQuotaError(error)) throw error;
          // If the browser is full, release only the last-good duplicate and
          // retry the primary-state replacement. The old primary state has not
          // been replaced unless this retry succeeds.
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

      // Once the (usually smaller) cloud state is in place, make one best-effort
      // attempt to restore the pre-download backup. Failure here is non-fatal:
      // Safari remains the cloud master and the freshly applied Chrome state is
      // already valid.
      if ((backupWasSkipped || backupWasRemovedForSpace) && pendingBackup) {
        try { nativeSetItem.call(window.localStorage, BACKUP_KEY, pendingBackup); }
        catch (_) {}
      }

      return result;
    } finally {
      Storage.prototype.setItem = nativeSetItem;
    }
  }

  function setNote(message, tone = '') {
    const note = document.getElementById('browserSyncNote');
    const badge = document.getElementById('browserSyncBadge');
    if (note) note.textContent = message;
    if (badge && tone) {
      badge.textContent = tone;
      badge.className = `health-badge ${tone === 'SYNCED' ? 'good' : 'warn'}`;
    }
  }

  function bind() {
    const button = document.getElementById('browserSyncDownload');
    if (!button || button.dataset.quotaSafeBound === '1') return false;
    button.dataset.quotaSafeBound = '1';

    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const status = window.AuroraBrowserSync?.status?.();
      if (!status?.cloudExists || status?.working) return;

      const source = status.cloudDeviceName || 'the cloud master';
      if (!confirm(`Use the Browser Sync cloud copy from ${source}?\n\nAurora will safely replace this browser's cloud-managed state. If Chrome's local storage is too full for a duplicate backup, Browser Sync will free only backup space and keep the primary state protected until the replacement succeeds.`)) return;

      button.disabled = true;
      setNote('Applying the Safari cloud master to this browser…', 'WORKING');
      try {
        await quotaSafeDownload();
        setNote('Cloud master applied. Reloading Aurora…', 'SYNCED');
        setTimeout(() => location.reload(), 500);
      } catch (error) {
        setNote(String(error?.message || error || 'Browser Sync failed.'), 'ERROR');
        button.disabled = false;
      }
    }, true);

    return true;
  }

  function start() {
    if (bind()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (bind() || tries > 80) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();