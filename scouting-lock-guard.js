(() => {
  'use strict';

  const STATE_KEY = 'aurora2:state:v1';
  const originalSetItem = Storage.prototype.setItem;
  const originalGetItem = Storage.prototype.getItem;

  function locked(state) {
    return !!state?.transfer?.route?.locked || ['LOCKED','PARTIALLY_REGISTERED','COMPLETE'].includes(String(state?.mission?.status || '').toUpperCase());
  }

  Storage.prototype.setItem = function(key, value) {
    if (this === localStorage && key === STATE_KEY) {
      try {
        const current = JSON.parse(originalGetItem.call(this, key) || 'null');
        if (locked(current)) {
          const next = JSON.parse(String(value));
          if (next?.scouting && current?.scouting) {
            next.scouting = {
              ...next.scouting,
              status: current.scouting.status,
              strategy: current.scouting.strategy,
              targets: current.scouting.targets,
              approvedBatchId: current.scouting.approvedBatchId,
              decisionHistory: current.scouting.decisionHistory,
              activeMeta: current.scouting.activeMeta
            };
            value = JSON.stringify(next);
          }
        }
      } catch (_) {}
    }
    return originalSetItem.call(this, key, value);
  };

  window.AuroraScoutingLockGuard = Object.freeze({build:'20260820-scouting-lock-guard-1', ready:true});
})();
