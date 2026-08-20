(() => {
  'use strict';

  const BUILD = '20260820-transfer-route-storage-guard-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const ROUTE_BACKUP_KEY = 'aurora2:transfer:route:backup:lastgood';

  if (window.AuroraTransferRouteStorageGuard?.ready) return;

  const originalSetItem = Storage.prototype.setItem;
  const originalGetItem = Storage.prototype.getItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  const arr = value => Array.isArray(value) ? value : [];

  function isQuotaError(error) {
    const name = String(error?.name || '');
    const message = String(error?.message || error || '');
    return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota|storage.*full/i.test(message);
  }

  function compactPayload(rawValue) {
    try {
      const parsed = JSON.parse(String(rawValue || 'null'));
      const state = parsed?.state;
      if (!state || typeof state !== 'object') return rawValue;
      const missionId = String(state?.mission?.id || '');
      const relevantDrafts = arr(state?.transfer?.registrationDrafts).filter(draft =>
        !missionId || String(draft?.missionId || '') === missionId || String(draft?.status || '').toUpperCase() === 'CONFIRMED'
      );
      return JSON.stringify({
        version: 2,
        savedAt: parsed.savedAt || new Date().toISOString(),
        stateUpdatedAt: state?.updatedAt || null,
        mission: state?.mission || null,
        transfer: {
          route: state?.transfer?.route || null,
          registrationDrafts: relevantDrafts,
          executionChecks: state?.transfer?.executionChecks || {}
        }
      });
    } catch (_) {
      return rawValue;
    }
  }

  function compactExistingRouteBackup() {
    try {
      const existing = originalGetItem.call(localStorage, ROUTE_BACKUP_KEY);
      if (!existing) return;
      const compact = compactPayload(existing);
      if (String(compact).length >= String(existing).length) return;
      originalRemoveItem.call(localStorage, ROUTE_BACKUP_KEY);
      try { originalSetItem.call(localStorage, ROUTE_BACKUP_KEY, compact); }
      catch (error) {
        if (!isQuotaError(error)) throw error;
      }
    } catch (error) {
      console.warn('[Aurora Transfer storage guard] Existing route backup could not be compacted.', error);
    }
  }

  Storage.prototype.setItem = function(key, value) {
    if (this !== localStorage) return originalSetItem.call(this, key, value);

    if (String(key) === ROUTE_BACKUP_KEY) {
      const compact = compactPayload(value);
      try {
        return originalSetItem.call(this, key, compact);
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        try { originalRemoveItem.call(this, ROUTE_BACKUP_KEY); } catch (_) {}
        console.warn('[Aurora Transfer storage guard] Optional route backup omitted because browser storage is full.');
        return;
      }
    }

    try {
      return originalSetItem.call(this, key, value);
    } catch (error) {
      const importantWrite = String(key) === BACKUP_KEY || String(key) === STATE_KEY;
      if (!importantWrite || !isQuotaError(error)) throw error;

      try { originalRemoveItem.call(this, ROUTE_BACKUP_KEY); } catch (_) {}
      return originalSetItem.call(this, key, value);
    }
  };

  compactExistingRouteBackup();

  window.AuroraTransferRouteStorageGuard = Object.freeze({
    build: BUILD,
    ready: true,
    routeBackupCompacted: true,
    preservesCanonicalState: true,
    preservesLastGoodBackup: true
  });
})();
