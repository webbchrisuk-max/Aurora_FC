(() => {
  'use strict';
  const BUILD = '20260820-transfer-strategy-loader-1';
  const src = `transfer-strategy-control.js?v=${BUILD}`;
  if ([...document.scripts].some(script => String(script.src || '').includes('transfer-strategy-control.js'))) return;
  const script = document.createElement('script');
  script.src = src;
  script.defer = true;
  document.head.appendChild(script);
})();
