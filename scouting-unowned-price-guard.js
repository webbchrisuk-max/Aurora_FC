(() => {
  'use strict';

  // Emergency stability shim.
  // The previous compatibility guard rewrote Scouting state in response to
  // aurora2:state events while the main Scouting engine could reassess the
  // same targets back to DATA PENDING. That created a render/state ping-pong
  // on iPad/Safari. Price-gate separation will be implemented inside the
  // canonical Scouting engine instead of by a competing state writer.
  const BUILD = '20260823-scouting-unowned-price-guard-disabled-1';

  window.AuroraScoutingUnownedPriceGuard = Object.freeze({
    build: BUILD,
    ready: true,
    disabled: true,
    readOnly: true,
    reason: 'STATE_LOOP_STABILITY_HOLD'
  });
})();
