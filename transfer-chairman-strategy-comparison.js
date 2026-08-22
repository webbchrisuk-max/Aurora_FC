(function () {
  'use strict';
  var BUILD = '20260822-transfer-chairman-v3-launcher-2-simulation-pool';
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

  function loadSimulationPool() {
    var old = document.getElementById('auroraChairmanSimulationPoolScript');
    if (old) old.remove();
    var extra = document.createElement('script');
    extra.id = 'auroraChairmanSimulationPoolScript';
    extra.src = 'transfer-chairman-simulation-pool.js?v=20260822-chairman-simulation-pool-1';
    extra.async = false;
    extra.onerror = function () { console.warn('[Aurora Chairman] simulation pool could not be loaded; core V3 remains available.'); };
    document.head.appendChild(extra);
  }

  function launch() {
    styles();
    try { delete window.__auroraTransferChairmanOffers; } catch (_) { window.__auroraTransferChairmanOffers = null; }
    var previous = document.getElementById('auroraTransferChairmanV3Script');
    if (previous) previous.remove();
    var script = document.createElement('script');
    script.id = 'auroraTransferChairmanV3Script';
    script.src = 'transfer-chairman-v3.js?v=20260822-transfer-chairman-v3-engine-1';
    script.async = false;
    script.onload = function () {
      window.__auroraTransferChairmanV3Launcher = BUILD;
      loadSimulationPool();
      setTimeout(function () {
        var api = window.AuroraTransferChairmanOffers;
        if (!api || api.build !== '20260822-transfer-chairman-v3-engine-1') safeHold('V3 loaded but did not publish its ready API.');
      }, 250);
    };
    script.onerror = function () { safeHold('Browser could not fetch transfer-chairman-v3.js.'); };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once:true });
  else launch();
})();