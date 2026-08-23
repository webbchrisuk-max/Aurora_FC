(() => {
  'use strict';

  const BUILD = '20260823-stage3i-notifications-endpoint-loop-guard-2';
  const STAGE = '3I';
  let blockedUpdates = 0;
  let allowedNotificationUpdates = 0;
  let suppressedEndpointHealthWrites = 0;
  let originalUpdate = null;

  const cleanPageHref = (value) => String(value || '').split('#')[0].split('?')[0].toLowerCase();
  const clone = (value) => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };

  function currentStageOwner() {
    return String(document.documentElement.dataset.auroraStageOwner || '');
  }

  function ownsGlobalStage() {
    const owner = currentStageOwner();
    return !owner || owner === STAGE;
  }

  function claimStageIfUnowned() {
    if (!currentStageOwner()) document.documentElement.dataset.auroraStageOwner = STAGE;
  }

  function stampNavigation() {
    if (!ownsGlobalStage()) return;
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach((link) => {
      const target = cleanPageHref(link.getAttribute('href'));
      if (!/^(index|finance|scouting|transfer|registration|squad|income|match-report|club-control|system-health)\.html$/i.test(target)) return;
      link.setAttribute('href', `${target}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function ensureHeaderNotificationStyle() {
    if (document.getElementById('auroraStage3iHeaderNotificationStyle')) return;
    const style = document.createElement('style');
    style.id = 'auroraStage3iHeaderNotificationStyle';
    style.textContent = `
      .topbar #auroraNotificationBell.aurora-header-notification {
        position: relative !important;
        inset: auto !important;
        flex: 0 0 38px;
        width: 38px;
        height: 38px;
        min-width: 38px;
        margin: 0 12px 0 auto;
        padding: 0;
        display: grid;
        place-items: center;
        border: 1px solid rgba(82,217,255,.22);
        border-radius: 10px;
        background: rgba(13,31,47,.72);
        color: #bfefff;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.02);
        z-index: 4;
      }
      .topbar #auroraNotificationBell.aurora-header-notification > span { display:grid; place-items:center; }
      .topbar #auroraNotificationBell.aurora-header-notification svg { width:19px; height:19px; }
      .topbar #auroraNotificationBell.aurora-header-notification + .status { margin-left:0; }
      @media (max-width:720px) {
        .topbar #auroraNotificationBell.aurora-header-notification {
          flex-basis:34px; width:34px; height:34px; min-width:34px; margin-right:8px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function mountNotificationBell() {
    const bell = document.getElementById('auroraNotificationBell');
    const topbar = document.querySelector('.topbar');
    const status = topbar?.querySelector('.status');
    if (!bell || !topbar) return false;
    ensureHeaderNotificationStyle();
    bell.classList.add('aurora-header-notification');
    if (bell.parentElement !== topbar) {
      if (status) topbar.insertBefore(bell, status);
      else topbar.appendChild(bell);
    } else if (status && bell.nextElementSibling !== status) {
      topbar.insertBefore(bell, status);
    }
    return true;
  }

  function settleNotificationBell() {
    [0, 50, 200, 600, 1500].forEach((delay) => setTimeout(mountNotificationBell, delay));
  }

  function setStage(statusLabel = 'WAITING…') {
    claimStageIfUnowned();
    if (ownsGlobalStage()) {
      document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 3I'; });
      document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'NOTIFICATIONS STABLE'; });
      document.querySelectorAll('.hero small, .department-hero small').forEach((node) => {
        node.textContent = String(node.textContent || '').replace(/STAGE 3H/gi, 'STAGE 3I');
      });
      stampNavigation();
    }

    let panel = document.getElementById('stage3iNotificationPanel');
    if (!panel && document.querySelector('.hero')) {
      panel = document.createElement('section');
      panel.className = 'panel';
      panel.id = 'stage3iNotificationPanel';
      panel.innerHTML = '<small>STAGE 3I RUNTIME CHECK</small><h2 id="stage3iNotificationStatus">Notification Engine: WAITING…</h2><p id="stage3iNotificationNote">Loading the Aurora Notification Centre with notification-only state persistence.</p>';
      document.querySelector('.hero')?.insertAdjacentElement('afterend', panel);
    }

    const status = document.getElementById('stage3iNotificationStatus');
    if (status) status.textContent = `Notification Engine: ${statusLabel}`;
  }

  function updatePanel(label, note) {
    setStage(label);
    const text = document.getElementById('stage3iNotificationNote');
    if (text && note) text.textContent = note;
  }

  function statusSnapshot() {
    let notifications = null;
    try { notifications = window.AuroraNotifications?.status?.() || null; } catch (_) {}
    return {
      build: BUILD,
      stageOwner: currentStageOwner(),
      loaded: Boolean(window.AuroraNotifications),
      allowedNotificationUpdates,
      blockedUpdates,
      suppressedEndpointHealthWrites,
      notificationWritesEnabled: true,
      nonNotificationWritesBlocked: true,
      notifications,
      bellInHeader: document.getElementById('auroraNotificationBell')?.parentElement?.classList?.contains('topbar') || false
    };
  }

  function report(extra = {}) {
    const payload = { ...statusSnapshot(), ...extra };
    window.AuroraStage3I = Object.freeze(payload);
    document.documentElement.dataset.auroraNotificationsReadonly = payload.loaded ? 'stable' : 'waiting';
    window.dispatchEvent(new CustomEvent('aurora:stage3i-notifications', { detail: payload }));
  }

  function onlyNotificationsChanged(current, proposed) {
    if (!proposed || typeof proposed !== 'object') return false;
    const keys = new Set([...Object.keys(current || {}), ...Object.keys(proposed || {})]);
    keys.delete('notifications');
    keys.delete('updatedAt');
    for (const key of keys) {
      try {
        if (JSON.stringify(current?.[key]) !== JSON.stringify(proposed?.[key])) return false;
      } catch (_) {
        if (current?.[key] !== proposed?.[key]) return false;
      }
    }
    try {
      return JSON.stringify(current?.notifications) !== JSON.stringify(proposed?.notifications);
    } catch (_) {
      return current?.notifications !== proposed?.notifications;
    }
  }

  function isEndpointMissingHealthOnlyWrite(current, proposed) {
    try {
      const before = clone(current?.notifications || {});
      const after = clone(proposed?.notifications || {});
      const beforeHealth = clone(before?.healthState || {});
      const afterHealth = clone(after?.healthState || {});

      if (String(afterHealth?.data2 || '') !== 'ENDPOINT_MISSING') return false;
      if (String(beforeHealth?.data2 || '') === 'ENDPOINT_MISSING') return false;

      delete before.healthState;
      delete after.healthState;
      if (JSON.stringify(before) !== JSON.stringify(after)) return false;

      delete beforeHealth.data2;
      delete afterHealth.data2;
      return JSON.stringify(beforeHealth) === JSON.stringify(afterHealth);
    } catch (_) {
      return false;
    }
  }

  function installUpdateShield() {
    const core = window.Aurora2?.core;
    if (!core?.read || !core?.update) return false;
    if (originalUpdate) return true;
    originalUpdate = core.update;

    core.update = function auroraStage3iNotificationOnlyUpdate(mutator) {
      const current = core.read();
      let proposed = null;
      try {
        const draft = clone(current);
        const result = typeof mutator === 'function' ? mutator(draft) : { ...draft, ...(mutator || {}) };
        proposed = result && typeof result === 'object' ? result : draft;
      } catch (_) {
        blockedUpdates += 1;
        report({ phase: 'UPDATE_PROBE_FAILED' });
        return current;
      }

      if (onlyNotificationsChanged(current, proposed)) {
        if (isEndpointMissingHealthOnlyWrite(current, proposed)) {
          suppressedEndpointHealthWrites += 1;
          updatePanel('ACTIVE ✅', `Notification Centre is stable. AuroraData 2 endpoint-missing health bookkeeping is runtime-only on this browser, preventing notification state loops. Suppressed endpoint health writes: ${suppressedEndpointHealthWrites}.`);
          settleNotificationBell();
          report({ phase: 'ENDPOINT_MISSING_HEALTH_WRITE_SUPPRESSED' });
          return current;
        }

        allowedNotificationUpdates += 1;
        const saved = originalUpdate(() => proposed);
        const info = window.AuroraNotifications?.status?.();
        updatePanel('ACTIVE ✅', `Notification Centre is stable. Notification records/read state can persist, so repeated conflict toasts are deduplicated. Allowed notification updates: ${allowedNotificationUpdates}. Non-notification writes remain shielded.`);
        settleNotificationBell();
        report({ phase: 'NOTIFICATION_UPDATE_ALLOWED', notifications: info || null });
        return saved;
      }

      blockedUpdates += 1;
      const info = window.AuroraNotifications?.status?.();
      const count = Number(info?.total || current?.notifications?.records?.length || 0);
      updatePanel('ACTIVE ✅', `Notification Centre is stable. Existing records: ${count}. Non-notification core writes blocked by this stage: ${blockedUpdates}.`);
      settleNotificationBell();
      report({ phase: 'NON_NOTIFICATION_UPDATE_BLOCKED' });
      return current;
    };
    return true;
  }

  function loadNotifications() {
    if (!installUpdateShield()) {
      updatePanel('FAILED ❌', 'Aurora Core update API was not ready for the Notifications safety gate.');
      report({ error: 'CORE_UPDATE_NOT_READY' });
      return;
    }

    if (window.AuroraNotifications) {
      const info = window.AuroraNotifications.status?.() || {};
      updatePanel('ACTIVE ✅', `Notification Centre was already loaded. Existing records: ${Number(info.total || 0)}. Notification-only state persistence is enabled.`);
      settleNotificationBell();
      report({ loaded: true, reused: true });
      return;
    }

    updatePanel('LOADING…', 'Loading the Aurora Notification Centre with notification-only state persistence.');
    const script = document.createElement('script');
    script.src = '/aurora-fc-2/aurora-notifications.js?v=20260823-stage3i-endpoint-loop-guard-2';
    script.async = false;
    script.dataset.auroraStage3 = 'notifications-stable';
    script.addEventListener('load', () => {
      document.documentElement.dataset.auroraNotifications = 'loaded';
      settleNotificationBell();
      setTimeout(() => {
        const info = window.AuroraNotifications?.status?.() || {};
        mountNotificationBell();
        updatePanel('ACTIVE ✅', `Notification Centre is active. Existing records: ${Number(info.total || 0)}. Notification state persists for dedupe/read/dismiss while endpoint-missing health bookkeeping stays runtime-only.`);
        report({ loaded: true, phase: 'ACTIVE' });
      }, 500);
    }, { once: true });
    script.addEventListener('error', () => {
      document.documentElement.dataset.auroraNotifications = 'failed';
      updatePanel('FAILED ❌', 'The Aurora Notification Centre failed to load.');
      report({ loaded: false, error: 'NOTIFICATIONS_LOAD_FAILED' });
    }, { once: true });
    document.head.appendChild(script);
  }

  setStage('WAITING…');
  ensureHeaderNotificationStyle();

  let tries = 0;
  const wait = () => {
    if (window.Aurora2?.core?.read && window.AuroraRelease) {
      loadNotifications();
      return;
    }
    tries += 1;
    if (tries > 320) {
      updatePanel('FAILED ❌', 'Core or Release Guard did not become ready in time for Notifications.');
      report({ error: 'DEPENDENCY_WAIT_TIMEOUT' });
      return;
    }
    setTimeout(wait, 25);
  };
  wait();
})();
