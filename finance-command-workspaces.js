(() => {
  'use strict';

  const BUILD = '20260823-finance-command-workspaces-1';
  const WORKSPACES = ['overviewPanel','paydayPanel','potsPanel','housePanel'];
  const DEFAULT = 'overviewPanel';

  if (window.__AuroraFinanceCommandWorkspaces === BUILD) return;
  window.__AuroraFinanceCommandWorkspaces = BUILD;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function validWorkspace(value) {
    return WORKSPACES.includes(String(value || '').replace(/^#/, ''))
      ? String(value || '').replace(/^#/, '')
      : DEFAULT;
  }

  function workspaceFromHref(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname) return null;
      return WORKSPACES.includes(url.hash.slice(1)) ? url.hash.slice(1) : null;
    } catch (_) {
      return null;
    }
  }

  function setActiveTab(id) {
    $$('.finance-section-nav .tab').forEach(tab => {
      const active = workspaceFromHref(tab.getAttribute('href')) === id;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
  }

  function show(id, options = {}) {
    id = validWorkspace(id);
    WORKSPACES.forEach(workspaceId => {
      const panel = document.getElementById(workspaceId);
      if (!panel) return;
      const active = workspaceId === id;
      panel.hidden = !active;
      panel.classList.toggle('finance-workspace-active', active);
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    setActiveTab(id);
    document.body.dataset.financeWorkspace = id;

    if (options.history !== false) {
      const next = `${location.pathname}${location.search}#${id}`;
      if (options.replace) history.replaceState({ financeWorkspace:id }, '', next);
      else if (location.hash !== `#${id}`) history.pushState({ financeWorkspace:id }, '', next);
    }

    if (options.scroll !== false) {
      const anchor = $('.finance-section-nav') || $('.finance-command-hero') || document.querySelector('main');
      if (anchor) {
        const top = Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - 82);
        window.scrollTo({ top, behavior: options.instant ? 'auto' : 'smooth' });
      }
    }

    window.dispatchEvent(new CustomEvent('aurora:finance-workspace', { detail:{ id, build:BUILD } }));
    return id;
  }

  function clickHandler(event) {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const id = workspaceFromHref(link.getAttribute('href'));
    if (!id) return;
    event.preventDefault();
    show(id, { history:true, scroll:true });
  }

  function keyHandler(event) {
    if (!event.target.closest('.finance-section-nav')) return;
    const tabs = $$('.finance-section-nav .tab');
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    let next = null;
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    if (!next) return;
    event.preventDefault();
    next.focus();
    const id = workspaceFromHref(next.getAttribute('href'));
    if (id) show(id, { history:true, scroll:false });
  }

  function start() {
    const nav = $('.finance-section-nav');
    if (nav) nav.setAttribute('role', 'tablist');
    $$('.finance-section-nav .tab').forEach(tab => {
      tab.setAttribute('role', 'tab');
      const id = workspaceFromHref(tab.getAttribute('href'));
      if (id) tab.setAttribute('aria-controls', id);
    });
    WORKSPACES.forEach(id => {
      const panel = document.getElementById(id);
      if (panel) panel.setAttribute('role', 'tabpanel');
    });

    document.addEventListener('click', clickHandler, true);
    document.addEventListener('keydown', keyHandler);
    window.addEventListener('popstate', () => show(validWorkspace(location.hash), { history:false, scroll:false }));
    window.addEventListener('hashchange', () => show(validWorkspace(location.hash), { history:false, scroll:false }));

    show(validWorkspace(location.hash), { history:false, scroll:false, instant:true });
  }

  window.AuroraFinanceCommandWorkspaces = Object.freeze({ build:BUILD, show, current:() => validWorkspace(document.body.dataset.financeWorkspace) });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
