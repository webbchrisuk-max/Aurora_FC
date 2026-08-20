(() => {
  'use strict';

  const BUILD = '20260820-finance-date-display-3';

  function installStyles() {
    if (document.getElementById('auroraFinanceDateFieldStyles')) return;
    const style = document.createElement('style');
    style.id = 'auroraFinanceDateFieldStyles';
    style.textContent = `
      #paydayPanel .aurora-date-shell{
        position:relative;
        display:block;
        width:100%;
        min-width:0;
        min-height:43px;
      }
      #paydayPanel .aurora-date-display{
        display:flex;
        align-items:center;
        width:100%;
        min-width:0;
        min-height:43px;
        box-sizing:border-box;
        padding:8px 10px;
        border:1px solid rgba(89,255,154,.09);
        border-radius:10px;
        background:rgba(2,9,16,.76);
        color:#edf7ff;
        font:inherit;
        line-height:1.2;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      #paydayPanel .aurora-date-display.is-empty{color:#697e73}
      #paydayPanel .aurora-date-shell:focus-within .aurora-date-display{
        border-color:rgba(89,255,154,.28);
        box-shadow:0 0 0 3px rgba(89,255,154,.04);
      }
      #paydayPanel .aurora-date-shell > input[type="date"]{
        position:absolute !important;
        inset:0 !important;
        z-index:2 !important;
        display:block !important;
        width:100% !important;
        max-width:none !important;
        min-width:0 !important;
        min-inline-size:0 !important;
        height:100% !important;
        min-height:43px !important;
        margin:0 !important;
        padding:0 !important;
        border:0 !important;
        border-radius:10px !important;
        box-sizing:border-box !important;
        opacity:0 !important;
        cursor:pointer !important;
        -webkit-appearance:none !important;
        appearance:none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function formatDate(value) {
    if (!value) return 'Choose date';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function syncDisplay(input, display) {
    if (!input || !display) return;
    display.textContent = formatDate(input.value);
    display.classList.toggle('is-empty', !input.value);
  }

  function install() {
    const input = document.querySelector('#paydayPanel .finance-field-grid .field input[type="date"]');
    if (!input) return false;

    installStyles();

    if (input.dataset.auroraDateWrapped === '1') {
      const display = input.parentElement?.querySelector('.aurora-date-display');
      syncDisplay(input, display);
      return true;
    }

    const field = input.closest('.field');
    if (!field) return false;

    input.dataset.auroraDateWrapped = '1';
    input.setAttribute('aria-label', 'Payday date');

    const shell = document.createElement('div');
    shell.className = 'aurora-date-shell';

    const display = document.createElement('div');
    display.className = 'aurora-date-display';
    display.setAttribute('aria-hidden', 'true');

    input.parentNode.insertBefore(shell, input);
    shell.appendChild(display);
    shell.appendChild(input);

    const update = () => syncDisplay(input, display);
    input.addEventListener('input', update);
    input.addEventListener('change', update);
    input.addEventListener('blur', update);
    input.addEventListener('aurora:date-display-sync', update);

    update();

    const refresh = () => setTimeout(update, 0);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });

    let checks = 0;
    const watcher = setInterval(() => {
      update();
      checks += 1;
      if (checks >= 40) clearInterval(watcher);
    }, 250);

    window.AuroraFinanceDateField = Object.freeze({
      build: BUILD,
      ready: true
    });
    return true;
  }

  function boot() {
    let tries = 0;
    const wait = () => {
      if (install()) return;
      tries += 1;
      if (tries < 400) setTimeout(wait, 25);
    };
    wait();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  } else {
    setTimeout(boot, 0);
  }
})();
