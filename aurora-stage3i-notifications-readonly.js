(() => {
  'use strict';

  const BUILD = '20260820-stage3i-notifications-readonly-3';
  const STAGE = '3I';
  let blockedUpdates = 0;
  let originalUpdate = null;

  const cleanPageHref = (value) => String(value || '').split('#')[0].split('?')[0].toLowerCase();

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
      document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'NOTIFICATIONS READ-ONLY'; });
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
      panel.innerHTML = '<small>STAGE 3I RUNTIME CHECK</small><h2 id="stage3iNotificationStatus">Notification Engine: WAITING…</h2><p id="stage3iNotificationNote">Waiting for Release Guard before loading the exact old Notification Centre in read-only mode.</p>';
      const hero = document.querySelector('.hero');
      hero.insertAdjacentElement('afterend', panel);
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
      blockedUpdates,
      notifications,
      bellInHeader: document.getElementById('auroraNotificationBell')?.parentElement?.classList?.contains('topbar') || false
    };
  }

  function report(extra = {}) {
    const payload = { ...statusSnapshot(), ...extra };
    window.AuroraStage3I = Object.freeze(payload);
    document.documentElement.dataset.auroraNotificationsReadonly = payload.loaded ? 'loaded' : 'waiting';
    window.dispatchEvent(new CustomEvent('aurora:stage3i-notifications', { detail: payload }));
  }

  function installUpdateShield() {
    const core = window.Aurora2?.core;
    if (!core?.read || !core?.update) return false;
    if (originalUpdate) return true;
    originalUpdate = core.update;
    core.update = function auroraStage3iReadonlyUpdate(mutator) {
      blockedUpdates += 1;
      const current = core.read();
      try { if (typeof mutator === 'function') mutator(current); } catch (_) {}
      const info = window.AuroraNotifications?.status?.();
      const count = Number(info?.total || current?.notifications?.records?.length || 0);
      updatePanel('ACTIVE ✅', `Exact Notification Centre is running read-only. Existing records rendered: ${count}. Notification state writes blocked: ${blockedUpdates}. Release Guard and the shielded Cloud lifecycle remain active.`);
      settleNotificationBell();
      report({ phase: 'UPDATE_BLOCKED' });
      return current;
    };
    return true;
  }

  function loadNotifications() {
    if (!installUpdateShield()) {
      updatePanel('FAILED ❌', 'Aurora Core update API was not ready for the Notifications read-only shield.');
      report({ error: 'CORE_UPDATE_NOT_READY' });
      return;
    }

    if (window.AuroraNotifications) {
      const info = window.AuroraNotifications.status?.() || {};
      updatePanel('ACTIVE ✅', `Notification Centre was already loaded. Existing records: ${Number(info.total || 0)}. State updates remain blocked for this probe.`);
      settleNotificationBell();
      report({ loaded: true, reused: true });
      return;
    }

    updatePanel('LOADING…', 'Loading the exact old Aurora Notification Centre. Existing records may render, but core notification writes are blocked for this probe.');
    const script = document.createElement('script');
    script.src = '/aurora-fc-2/aurora-notifications.js?v=20260820-stage3i-notifications-readonly-3';
    script.async = false;
    script.dataset.auroraStage3 = 'notifications-readonly';
    script.addEventListener('load', () => {
      document.documentElement.dataset.auroraNotifications = 'loaded';
      settleNotificationBell();
      setTimeout(() => {
        const info = window.AuroraNotifications?.status?.() || {};
        mountNotificationBell();
        updatePanel('ACTIVE ✅', `Exact Notification Centre is active in read-only mode. Existing records rendered: ${Number(info.total || 0)}. Notification state writes blocked: ${blockedUpdates}. Its state listeners and 5-minute evaluation timer are installed.`);
        report({ loaded: true, phase: 'ACTIVE' });
      }, 500);
    }, { once: true });
    script.addEventListener('error', () => {
      document.documentElement.dataset.auroraNotifications = 'failed';
      updatePanel('FAILED ❌', 'The old Notification Centre failed to load.');
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
      updatePanel('FAILED ❌', 'Core or Release Guard did not become ready in time for the Notifications probe.');
      report({ error: 'DEPENDENCY_WAIT_TIMEOUT' });
      return;
    }
    setTimeout(wait, 25);
  };
  wait();
})();
