(() => {
  'use strict';

  const BUILD = '20260823-system-health-stability-2';
  const NOISY = new Set([
    'aurora2:state',
    'aurora:stage3i-notifications',
    'aurora:stage3g-cloud-lifecycle'
  ]);
  const nativeAdd = window.addEventListener.bind(window);
  const wrapped = new WeakMap();

  window.addEventListener = function auroraHealthBufferedAdd(type, listener, options) {
    if (!NOISY.has(String(type)) || typeof listener !== 'function') {
      return nativeAdd(type, listener, options);
    }

    let byType = wrapped.get(listener);
    if (!byType) {
      byType = new Map();
      wrapped.set(listener, byType);
    }
    if (byType.has(type)) return nativeAdd(type, byType.get(type), options);

    let timer = null;
    let latestEvent = null;
    const buffered = function auroraHealthBufferedEvent(event) {
      latestEvent = event;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const next = latestEvent;
        latestEvent = null;
        try { listener.call(window, next); } catch (error) { console.error('[System Health Stability]', error); }
      }, 400);
    };
    byType.set(type, buffered);
    return nativeAdd(type, buffered, options);
  };

  document.documentElement.dataset.auroraHealthStability = 'buffered';
  window.AuroraSystemHealthStability = Object.freeze({
    build: BUILD,
    active: true,
    debounceMs: 400,
    events: [...NOISY]
  });

  if (!document.querySelector('script[data-aurora-data2-connection-panel]')) {
    const script = document.createElement('script');
    script.src = 'system-health-data2-connection.js?v=20260823-system-health-data2-connection-1';
    script.defer = true;
    script.dataset.auroraData2ConnectionPanel = '1';
    document.head.appendChild(script);
  }
})();