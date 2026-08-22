(function () {
  'use strict';
  var BUILD = '20260822-transfer-chairman-v3-launcher-2';
  var HANDOFF_BUILD = '20260822-transfer-chairman-live-handoff-1';
  var ENGINE_BUILD = '20260822-transfer-chairman-v3-engine-1';
  var host = document.getElementById('transferChairmanOffers');

  function safeHold(message) {
    host = document.getElementById('transferChairmanOffers');
    if (!host) return;
    host.setAttribute('data-state', 'error');
    host.innerHTML = '<div class="co-head"><div><span class="co-kicker">Chairman\'s Offers • V3</span><h2>Profit Rotation Desk</h2><p>The standalone Chairman engine could not be loaded.</p></div><span class="co-chip">SAFE HOLD</span></div><div class="co-empty"><strong>V3 startup held.</strong><br>' + String(message || 'Unknown loader error') + '<br><br>No holdings, cash, Scouting or Registration data was changed.</div>';
  }

  function styles() {
    if (document.getElementById('transferChairmanV3StrategyStyles')) return;
    var style = document.createElement('style');
    style.id = 'transferChairmanV3StrategyStyles';
    style.textContent = '.co-strategy-compare{margin-top:16px}.co-strategy-compare>h4{margin:0 0 9px;font:950 15px/1.2 system-ui}.co-strategy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.co-strategy-card{appearance:none;text-align:left;padding:14px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(0,0,0,.14);color:#eee7ef;cursor:pointer}.co-strategy-card.active{border-color:rgba(243,201,105,.31);background:rgba(243,201,105,.055)}.co-strategy-card h5{margin:0;font:950 14px/1.2 system-ui}.co-strategy-tags{display:flex;gap:5px;flex-wrap:wrap;min-height:10px;margin-top:7px}.co-strategy-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.co-strategy-metrics span{display:block;padding:7px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:rgba(255,255,255,.012)}.co-strategy-metrics small{display:block;color:#817a84;font:750 7px/1.2 system-ui;text-transform:uppercase}.co-strategy-metrics strong{display:block;margin-top:4px;font:900 11px/1.2 system-ui}.co-strategy-note{margin-top:7px;color:#756e78;font:700 7px/1.35 system-ui}.co-strategy-card .good{color:#9affbd}.co-strategy-card .bad{color:#ff9ca8}@media(max-width:820px){.co-strategy-grid{grid-template-columns:1fr}.co-strategy-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}';
    document.head.appendChild(style);
  }

  function launchEngine() {
    styles();
    try { delete window.__auroraTransferChairmanOffers; } catch (_) { window.__auroraTransferChairmanOffers = null; }
    var previous = document.getElementById('auroraTransferChairmanV3Script');
    if (previous) previous.remove();
    var script = document.createElement('script');
    script.id = 'auroraTransferChairmanV3Script';
    script.src = 'transfer-chairman-v3.js?v=' + ENGINE_BUILD;
    script.async = false;
    script.onload = function () {
      window.__auroraTransferChairmanV3Launcher = BUILD;
      setTimeout(function () {
        var api = window.AuroraTransferChairmanOffers;
        if (!api || api.build !== ENGINE_BUILD) safeHold('V3 loaded but did not publish its ready API.');
      }, 250);
    };
    script.onerror = function () { safeHold('Browser could not fetch transfer-chairman-v3.js.'); };
    document.head.appendChild(script);
  }

  function loadHandoffThenLaunch() {
    var ready = window.AuroraTransferChairmanLiveHandoff;
    if (ready && ready.build === HANDOFF_BUILD) { launchEngine(); return; }
    var previous = document.getElementById('auroraTransferChairmanLiveHandoffScript');
    if (previous) previous.remove();
    var script = document.createElement('script');
    script.id = 'auroraTransferChairmanLiveHandoffScript';
    script.src = 'transfer-chairman-live-handoff.js?v=' + HANDOFF_BUILD;
    script.async = false;
    script.onload = function () {
      var handoff = window.AuroraTransferChairmanLiveHandoff;
      if (!handoff || handoff.build !== HANDOFF_BUILD) { safeHold('Transfer broker handoff did not initialise.'); return; }
      launchEngine();
    };
    script.onerror = function () { safeHold('Browser could not fetch the Transfer broker handoff.'); };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadHandoffThenLaunch, { once:true });
  else loadHandoffThenLaunch();
})();