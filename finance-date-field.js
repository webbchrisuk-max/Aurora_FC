(() => {
  'use strict';

  const BUILD = '20260820-finance-date-display-1';

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
    if (!input || input.dataset.auroraDateWrapped === '1') return Boolean(input);

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
