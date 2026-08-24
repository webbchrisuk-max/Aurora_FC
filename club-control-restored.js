(() => {
  'use strict';

  const BUILD = '20260824-club-control-consolidated-1';
  const PREF_KEY = 'aurora:club-control:preferences:v1';
  const LOG_KEY = 'aurora:club-control:activity:v1';
  const DEFAULTS = Object.freeze({
    reducedMotion: false,
    compactPanels: false,
    showTechnicalBuilds: false,
    showNotificationBell: true
  });
  if (window.__auroraClubControlRestored) return;
  window.__auroraClubControlRestored = BUILD;

  const $ = id => document.getElementById(id);
  const arr = value => Array.isArray(value) ? value : [];
  const now = () => new Date().toISOString();
  let clearCacheArmed = false;
  let clearCacheTimer = 0;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function prefs() {
    return { ...DEFAULTS, ...(readJson(PREF_KEY, {}) || {}) };
  }
  function savePrefs(next) {
    const value = { ...DEFAULTS, ...next, updatedAt: now(), build: BUILD };
    writeJson(PREF_KEY, value);
    applyPrefs(value);
    logAction('PREFERENCES SAVED', preferenceSummary(value));
    render();
    window.dispatchEvent(new CustomEvent('aurora:club-control-preferences', { detail: value }));
    return value;
  }
  function preferenceSummary(value = prefs()) {
    return `${value.reducedMotion ? 'Reduced motion' : 'Full motion'} • ${value.compactPanels ? 'Compact panels' : 'Comfortable panels'} • ${value.showNotificationBell ? 'Bell shown' : 'Bell hidden'}`;
  }
  function applyPrefs(value = prefs()) {
    const root = document.documentElement;
    root.classList.toggle('cc-reduced-motion', !!value.reducedMotion);
    root.classList.toggle('cc-compact', !!value.compactPanels);
    root.classList.toggle('cc-hide-build', !value.showTechnicalBuilds);
    applyBellVisibility(value.showNotificationBell !== false);
  }
  function applyBellVisibility(show) {
    const bell = $('auroraNotificationBell');
    if (!bell) return false;
    bell.style.display = show ? '' : 'none';
    bell.setAttribute('aria-hidden', show ? 'false' : 'true');
    return true;
  }
  function toast(message) {
    const el = $('ccToast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(window.__auroraClubControlToast);
    window.__auroraClubControlToast = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function logAction(action, detail = '') {
    const current = arr(readJson(LOG_KEY, []));
    const next = [{ at: now(), action: String(action || 'ACTION'), detail: String(detail || '') }, ...current].slice(0, 30);
    writeJson(LOG_KEY, next);
  }
  function notificationStatus() {
    try { return window.AuroraNotifications?.status?.() || null; }
    catch (_) { return null; }
  }
  function releaseStatus() {
    const release = window.AuroraRelease;
    if (!release) return { label:'WAITING', detail:'Release Guard not ready' };
    const build = String(release?.build || release?.version || 'ACTIVE');
    return { label:'GUARDED', detail:build };
  }
  function shellStatus() {
    const shell = window.AuroraShell;
    return shell?.ready ? { label:'READY', detail:shell.build || 'Shell ready' } : { label:'WAITING', detail:'Shell loading' };
  }
  function notificationsRuntime() {
    const stage = window.AuroraStage3I;
    const status = notificationStatus();
    if (status) return { label:'ACTIVE', detail:`${Number(status.unread || 0)} unread • ${Number(status.active || 0)} active` };
    if (stage?.loaded) return { label:'ACTIVE', detail:'Notification engine loaded' };
    return { label:'WAITING', detail:'Notification engine loading' };
  }
  async function serviceWorkerStatus() {
    if (!('serviceWorker' in navigator)) return { label:'UNAVAILABLE', detail:'Browser service worker unsupported' };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { label:'ACTIVE', detail:reg.active ? 'App worker active' : 'Worker registered' } : { label:'NONE', detail:'No service worker registration found' };
    } catch (_) { return { label:'CHECK', detail:'Could not inspect service worker' }; }
  }
  function setText(id, value) {
    document.querySelectorAll(`[id="${id}"]`).forEach(el => { el.textContent = value ?? '—'; });
  }
  function restampHeader() {
    document.querySelectorAll('.topbar .status span').forEach(node => { node.textContent = 'CLUB CONTROL'; });
    document.querySelectorAll('.topbar .status b').forEach(node => { node.textContent = 'SAFE PREFERENCES'; });
  }
  function renderPreferences(value = prefs()) {
    const bindings = {
      ccReducedMotion: value.reducedMotion,
      ccCompactPanels: value.compactPanels,
      ccShowTechnical: value.showTechnicalBuilds,
      ccShowNotificationBell: value.showNotificationBell
    };
    Object.entries(bindings).forEach(([id, checked]) => {
      const input = $(id);
      if (input && input.checked !== !!checked) input.checked = !!checked;
    });
    setText('ccDisplayMode', value.compactPanels ? 'COMPACT' : 'COMFORTABLE');
    setText('ccMotionMode', value.reducedMotion ? 'REDUCED' : 'FULL');
    setText('ccBellMode', value.showNotificationBell ? 'SHOWN' : 'HIDDEN');
    setText('ccPreferenceSummary', preferenceSummary(value));
  }
  function renderNotifications() {
    const status = notificationStatus();
    setText('ccNotificationEngine', status ? 'ACTIVE' : 'WAITING');
    setText('ccUnread', status ? String(Number(status.unread || 0)) : '—');
    setText('ccActiveNotifications', status ? String(Number(status.active || 0)) : '—');
    setText('ccArchivedNotifications', status ? String(Number(status.archived || 0)) : '—');
    setText('ccTotalNotifications', status ? String(Number(status.total || 0)) : '—');
    const open = $('ccOpenNotifications');
    const mark = $('ccMarkAllRead');
    if (open) open.disabled = !window.AuroraNotifications?.open;
    if (mark) mark.disabled = !window.AuroraNotifications?.markAllRead || !status?.unread;
  }
  function renderRuntime() {
    const shell = shellStatus();
    const release = releaseStatus();
    const notifications = notificationsRuntime();
    setText('ccShellState', shell.label);
    setText('ccShellDetail', shell.detail);
    setText('ccReleaseState', release.label);
    setText('ccReleaseDetail', release.detail);
    setText('ccNotifyState', notifications.label);
    setText('ccNotifyDetail', notifications.detail);
    setText('ccShellBuild', window.AuroraShell?.build || 'Waiting');
    setText('ccNotificationBuild', window.AuroraStage3I?.build || window.AuroraNotifications?.version || 'Waiting');
    setText('ccReleaseBuild', window.AuroraRelease?.build || window.AuroraRelease?.version || 'Waiting');
    setText('ccControlBuild', BUILD);
  }
  function renderLog() {
    const host = $('ccActivityLog');
    if (!host) return;
    const rows = arr(readJson(LOG_KEY, []));
    host.innerHTML = rows.length ? rows.slice(0, 10).map(row => {
      const date = new Date(row.at);
      const time = Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      return `<div class="cc-log-row"><time>${time}</time><span>${escapeHtml(row.detail || row.action)}</span><b>${escapeHtml(row.action)}</b></div>`;
    }).join('') : '<div class="cc-safe-card"><strong>No Club Control changes yet</strong><p>Only safe presentation and housekeeping actions are recorded here.</p></div>';
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[ch]));
  }
  async function renderServiceWorker() {
    const status = await serviceWorkerStatus();
    setText('ccWorkerState', status.label);
    setText('ccWorkerDetail', status.detail);
  }
  function render() {
    const value = prefs();
    applyPrefs(value);
    renderPreferences(value);
    renderNotifications();
    renderRuntime();
    renderLog();
    restampHeader();
    renderServiceWorker();
  }
  function bindToggle(id, field) {
    $(id)?.addEventListener('change', event => {
      const current = prefs();
      savePrefs({ ...current, [field]: !!event.target.checked });
      toast('Club Control preference saved.');
    });
  }
  function openNotifications() {
    if (!window.AuroraNotifications?.open) return toast('Notification Centre is still loading.');
    window.AuroraNotifications.open();
    logAction('NOTIFICATIONS OPENED', 'Opened the existing Aurora Notification Centre.');
    renderLog();
  }
  function markAllRead() {
    const api = window.AuroraNotifications;
    const before = api?.status?.();
    if (!api?.markAllRead) return toast('Notification Centre is still loading.');
    api.markAllRead();
    logAction('NOTIFICATIONS READ', `${Number(before?.unread || 0)} unread notification${Number(before?.unread || 0) === 1 ? '' : 's'} marked read.`);
    toast('Notifications marked read.');
    setTimeout(render, 80);
  }
  function resetPreferences() {
    writeJson(PREF_KEY, { ...DEFAULTS, updatedAt:now(), build:BUILD });
    applyPrefs(DEFAULTS);
    logAction('PREFERENCES RESET', 'Restored Club Control presentation defaults.');
    toast('Presentation preferences restored to defaults.');
    render();
  }
  async function checkForUpdate() {
    if (!('serviceWorker' in navigator)) return toast('Service worker updates are unavailable in this browser.');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return toast('No service worker is currently registered.');
      await reg.update();
      logAction('APP UPDATE CHECK', 'Asked the registered service worker to check for a newer Aurora build.');
      toast('Aurora update check completed.');
      renderServiceWorker();
    } catch (error) {
      toast(`Update check failed: ${String(error?.message || error)}`);
    }
  }
  async function clearAppCaches() {
    const button = $('ccClearCaches');
    if (!clearCacheArmed) {
      clearCacheArmed = true;
      if (button) button.textContent = 'Press again to clear app cache';
      toast('Press the cache button again within 6 seconds to confirm.');
      clearTimeout(clearCacheTimer);
      clearCacheTimer = setTimeout(() => {
        clearCacheArmed = false;
        if (button) button.textContent = 'Clear cached app files';
      }, 6000);
      return;
    }
    clearCacheArmed = false;
    clearTimeout(clearCacheTimer);
    try {
      const keys = 'caches' in window ? await caches.keys() : [];
      await Promise.all(keys.map(key => caches.delete(key)));
      logAction('APP CACHE CLEARED', `${keys.length} browser cache${keys.length===1?'':'s'} cleared. Local Aurora data was not deleted.`);
      if (button) button.textContent = 'Reloading…';
      location.reload();
    } catch (error) {
      if (button) button.textContent = 'Clear cached app files';
      toast(`Cache clear failed: ${String(error?.message || error)}`);
    }
  }
  function reloadAurora() {
    logAction('PAGE RELOAD', 'Reloaded Club Control without deleting local data.');
    location.reload();
  }

  function bind() {
    bindToggle('ccReducedMotion','reducedMotion');
    bindToggle('ccCompactPanels','compactPanels');
    bindToggle('ccShowTechnical','showTechnicalBuilds');
    bindToggle('ccShowNotificationBell','showNotificationBell');
    $('ccOpenNotifications')?.addEventListener('click', openNotifications);
    $('ccMarkAllRead')?.addEventListener('click', markAllRead);
    $('ccResetPreferences')?.addEventListener('click', resetPreferences);
    $('ccCheckUpdate')?.addEventListener('click', checkForUpdate);
    $('ccClearCaches')?.addEventListener('click', clearAppCaches);
    $('ccReloadAurora')?.addEventListener('click', reloadAurora);
    window.addEventListener('aurora:stage3i-notifications', () => setTimeout(render,50));
    window.addEventListener('aurora:shell-ready', () => setTimeout(render,50));
    window.addEventListener('focus', () => setTimeout(render,80));
    const observer = new MutationObserver(() => applyBellVisibility(prefs().showNotificationBell !== false));
    observer.observe(document.body,{childList:true,subtree:true});
    [100,500,1200,2500].forEach(delay => setTimeout(render,delay));
    setInterval(() => { if (document.visibilityState === 'visible') renderNotifications(); },15000);
  }

  window.AuroraClubControlPreferences = Object.freeze({
    build: BUILD,
    read: prefs,
    save: savePrefs,
    apply: applyPrefs,
    defaults: DEFAULTS
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { applyPrefs(); bind(); render(); }, { once:true });
  else { applyPrefs(); bind(); render(); }
})();
