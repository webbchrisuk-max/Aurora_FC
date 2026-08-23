(() => {
  'use strict';

  const BUILD = '20260823-legacy-cloud-retired-browser-sync-authority-1';

  // The legacy Aurora Cloud state runtime is intentionally retired on the
  // rebuilt Aurora_FC shell. Browser Sync is the single cross-browser state
  // authority. Keeping the old Firestore state engine alive alongside Browser
  // Sync caused duplicate conflict/status lifecycles and repeated UI refreshes
  // on Chromium browsers.
  //
  // This shim performs NO cloud reads, writes, local state application,
  // timers, subscriptions, fetch interception or Storage interception.

  const detail = Object.freeze({
    build: BUILD,
    status: 'ACTIVE',
    phase: 'LEGACY_CLOUD_RETIRED',
    legacyCloudRetired: true,
    browserSyncAuthority: true,
    cloudWritesEnabled: false,
    localApplyEnabled: false,
    backgroundAutoSyncEnabled: false
  });

  window.AuroraLegacyCloudRetired = Object.freeze({
    build: BUILD,
    active: true,
    browserSyncAuthority: true,
    reason: 'DUPLICATE_CLOUD_AUTHORITY_REMOVED'
  });

  // Preserve the diagnostic API shape without installing any runtime shields.
  window.AuroraStage3GShield = Object.freeze({
    build: BUILD,
    active: false,
    retired: true,
    browserSyncAuthority: true,
    status: () => ({
      legacyCloudRetired: true,
      browserSyncAuthority: true,
      firestoreWriteBlocks: 0,
      coreWriteBlocks: 0,
      localMetaBlocks: 0,
      backgroundAutoSyncEnabled: false
    })
  });

  document.documentElement.dataset.auroraCloudLifecycle = 'retired';
  document.documentElement.dataset.auroraCloudPhase = 'legacy-cloud-retired';

  // One startup signal only. No repeating cloud heartbeat.
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('aurora:stage3g-cloud-lifecycle', { detail }));
  });
})();
