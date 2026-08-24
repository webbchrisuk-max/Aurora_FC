(() => {
  'use strict';

  const BUILD = '20260824-phase2-shared-shell-6';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const NAV = Object.freeze({
    'index.html': ['🏟', 'Nexus Headquarters', 'Master club command'],
    'finance.html': ['💷', 'Finance Command', 'Cash, payday and pots'],
    'scouting.html': ['🔎', 'Scouting Centre', 'Evidence and recruitment'],
    'transfer.html': ['🔄', 'Transfer Centre', 'Deployment planning'],
    'registration.html': ['📝', 'Registration Desk', 'Broker execution'],
    'squad.html': ['⚽', 'Squad Hub', 'Canonical holdings'],
    'income.html': ['💰', 'Income Centre', 'Dividend truth'],
    'match-report.html': ['🏆', 'Match Report', 'Daily full-time review'],
    'club-control.html': ['⚙️', 'Club Control', 'Preferences and controls'],
    'system-health.html': ['🛡️', 'System Health', 'Integrity and diagnostics']
  });

  const cleanPageHref = value => String(value || '').split('#')[0].split('?')[0].toLowerCase();

  function repairSidebarMarkup() {
    document.querySelectorAll('.club-nav nav>a[href]').forEach(link => {
      const href = cleanPageHref(link.getAttribute('href'));
      const meta = NAV[href];
      if (meta && !link.querySelector(':scope > span')) {
        const [icon, label, description] = meta;
        link.innerHTML = `${icon} <span><b>${label}</b><em>${description}</em></span>`;
      }
    });
  }

  function stampInternalNavigation() {
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach(link => {
      const target = cleanPageHref(link.getAttribute('href'));
      if (!NAV[target]) return;
      link.setAttribute('href', `${target}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function loadPhase2IncomeProjection() {
    if (currentFile !== 'income.html') return;
    if (window.__AuroraIncomeTarget2000Projection || [...document.scripts].some(script => String(script.src || '').includes('income-target2000-projection.js'))) return;
    const script = document.createElement('script');
    script.src = 'income-target2000-projection.js?v=20260824-phase2-income-2000-projection-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'income-target-2000';
    document.head.appendChild(script);
  }

  function loadIncomeExactCostAuthority() {
    if (currentFile !== 'income.html') return;
    if (window.__AuroraIncomeReinvestmentExactCostAuthority || [...document.scripts].some(script => String(script.src || '').includes('income-reinvestment-exact-cost-authority.js'))) return;
    const script = document.createElement('script');
    script.src = 'income-reinvestment-exact-cost-authority.js?v=20260824-income-reinvestment-exact-cost-authority-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'income-exact-reinvestment-cost-authority';
    document.head.appendChild(script);
  }

  function loadIncomeBrokerCashTruthGuard() {
    if (currentFile !== 'income.html') return;
    if (window.__AuroraIncomeBrokerCashTruthGuard || [...document.scripts].some(script => String(script.src || '').includes('income-broker-cash-truth-guard.js'))) return;
    const script = document.createElement('script');
    script.src = 'income-broker-cash-truth-guard.js?v=20260824-income-broker-cash-truth-guard-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'income-broker-cash-truth';
    document.head.appendChild(script);
  }

  function loadPhase2FormerReentryEvidence() {
    if (currentFile !== 'squad.html') return;
    if (window.__AuroraFormerReentryMarketEvidence || [...document.scripts].some(script => String(script.src || '').includes('squad-former-reentry-market-evidence.js'))) return;
    const script = document.createElement('script');
    script.src = 'squad-former-reentry-market-evidence.js?v=20260824-squad-former-reentry-market-evidence-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'former-reentry-market-evidence';
    document.head.appendChild(script);
  }

  function loadPhase2RegistrationSettlement() {
    if (currentFile !== 'registration.html') return;
    if (window.__AuroraRegistrationPhase2Settlement || [...document.scripts].some(script => String(script.src || '').includes('registration-phase2-settlement.js'))) return;
    const script = document.createElement('script');
    script.src = 'registration-phase2-settlement.js?v=20260824-phase2-registration-settlement-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'registration-broker-cash-settlement';
    document.head.appendChild(script);
  }

  function loadRegistrationReinvestmentReceipts() {
    if (currentFile !== 'registration.html') return;
    if (window.__AuroraRegistrationReinvestmentReceipts || [...document.scripts].some(script => String(script.src || '').includes('registration-reinvestment-receipts.js'))) return;
    const script = document.createElement('script');
    script.src = 'registration-reinvestment-receipts.js?v=20260824-registration-reinvestment-receipts-1';
    script.async = false;
    script.dataset.auroraPhase2 = 'registration-reinvestment-proof';
    document.head.appendChild(script);
  }

  repairSidebarMarkup();
  document.documentElement.dataset.auroraShell = 'ready';
  document.documentElement.dataset.auroraShellBuild = BUILD;
  document.documentElement.dataset.auroraCloudAuthority = 'browser-sync';

  document.querySelectorAll('.club-nav a[href]').forEach(link => {
    const href = cleanPageHref(link.getAttribute('href'));
    const target = href || 'index.html';
    const isNexusAlias = currentFile === 'auroracityfc_nexusv2.html' && target === 'index.html';
    link.classList.toggle('active', target === currentFile || isNexusAlias);
  });

  stampInternalNavigation();
  loadPhase2IncomeProjection();
  loadIncomeExactCostAuthority();
  loadIncomeBrokerCashTruthGuard();
  loadPhase2FormerReentryEvidence();
  loadPhase2RegistrationSettlement();
  loadRegistrationReinvestmentReceipts();

  window.AuroraShell = Object.freeze({
    build: BUILD,
    ready: true,
    navigation: 'native-html-versioned',
    dataConnected: false,
    sessionEnabled: false,
    dynamicLoading: true,
    coreProbe: true,
    platformProbe: true,
    syncManagerProbe: true,
    firebaseReadProbe: true,
    clubCommandProbe: true,
    cloudLifecycleDryRun: false,
    legacyCloudRuntime: 'RETIRED',
    cloudAuthority: 'BROWSER_SYNC',
    cloudWritesEnabled: false,
    localCloudApplyEnabled: false
  });

  document.dispatchEvent(new CustomEvent('aurora:shell-ready', {
    detail: {
      build: BUILD,
      navigation: 'native-html-versioned',
      firebaseReadProbe: true,
      clubCommandProbe: true,
      legacyCloudRuntime: 'RETIRED',
      cloudAuthority: 'BROWSER_SYNC'
    }
  }));

  const markState = (overrides = {}) => {
    window.AuroraStage3 = Object.freeze({
      build: BUILD,
      coreLoaded: false,
      platformLoaded: false,
      syncLoaded: false,
      firebaseReadProbeLoaded: false,
      firebaseReadStatus: 'WAITING',
      clubCommandLoaded: false,
      cloudLifecycleProbeLoaded: false,
      cloudLifecycleStatus: 'RETIRED',
      cloudLifecyclePhase: 'BROWSER_SYNC_AUTHORITY',
      legacyCloudRuntime: 'RETIRED',
      cloudAuthority: 'BROWSER_SYNC',
      cloudWritesEnabled: false,
      localCloudApplyEnabled: false,
      notificationsLoaded: false,
      dataConnected: false,
      ...overrides
    });
  };
  markState();

  window.addEventListener('aurora:firebase-read-probe', event => {
    const detail = event.detail || {};
    document.documentElement.dataset.auroraFirebaseRead = String(detail.status || 'unknown').toLowerCase();
    markState({
      coreLoaded: true,
      platformLoaded: true,
      syncLoaded: true,
      firebaseReadProbeLoaded: true,
      firebaseReadStatus: detail.status || 'UNKNOWN'
    });
  });

  const clubCommand = document.createElement('script');
  clubCommand.src = '/Aurora_FC/aurora-club-command.js?v=20260823-browser-sync-authority-shell-1';
  clubCommand.async = false;
  clubCommand.dataset.auroraStage3 = 'club-command-read-only';
  clubCommand.addEventListener('load', () => {
    document.documentElement.dataset.auroraClubCommand = 'loaded';
    markState({
      coreLoaded: true,
      platformLoaded: true,
      syncLoaded: true,
      firebaseReadProbeLoaded: true,
      clubCommandLoaded: true
    });
    document.dispatchEvent(new CustomEvent('aurora:club-command-probe-ready', {
      detail: { build: BUILD, clubCommandLoaded: true, cloudAuthority: 'BROWSER_SYNC' }
    }));
  }, { once: true });
  clubCommand.addEventListener('error', () => {
    document.documentElement.dataset.auroraClubCommand = 'failed';
    markState({
      coreLoaded: true,
      platformLoaded: true,
      syncLoaded: true,
      firebaseReadProbeLoaded: true,
      clubCommandLoaded: false,
      error: 'CLUB_COMMAND_LOAD_FAILED'
    });
  }, { once: true });

  const readProbe = document.createElement('script');
  readProbe.src = 'aurora-firebase-read-probe.js?v=20260823-browser-sync-authority-shell-1';
  readProbe.async = false;
  readProbe.dataset.auroraStage3 = 'firebase-read-only';
  readProbe.addEventListener('load', () => {
    document.documentElement.dataset.auroraFirebaseReadProbe = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true, firebaseReadProbeLoaded: true });
    document.head.appendChild(clubCommand);
  }, { once: true });
  readProbe.addEventListener('error', () => {
    document.documentElement.dataset.auroraFirebaseReadProbe = 'failed';
    markState({
      coreLoaded: true,
      platformLoaded: true,
      syncLoaded: true,
      firebaseReadProbeLoaded: false,
      error: 'FIREBASE_READ_PROBE_LOAD_FAILED'
    });
  }, { once: true });

  const sync = document.createElement('script');
  sync.src = '/Aurora_FC/aurora-sync-manager.js?v=20260823-browser-sync-authority-shell-1';
  sync.async = false;
  sync.dataset.auroraStage3 = 'sync-manager-browser-sync-authority';
  sync.addEventListener('load', () => {
    document.documentElement.dataset.auroraSyncManager = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: true });
    document.head.appendChild(readProbe);
  }, { once: true });
  sync.addEventListener('error', () => {
    document.documentElement.dataset.auroraSyncManager = 'failed';
    markState({ coreLoaded: true, platformLoaded: true, syncLoaded: false, error: 'SYNC_MANAGER_LOAD_FAILED' });
  }, { once: true });

  const platform = document.createElement('script');
  platform.src = '/Aurora_FC/aurora-platform.js?v=20260823-browser-sync-authority-shell-1';
  platform.async = false;
  platform.dataset.auroraStage3 = 'core-plus-platform';
  platform.addEventListener('load', () => {
    document.documentElement.dataset.auroraPlatform = 'loaded';
    markState({ coreLoaded: true, platformLoaded: true });
    document.head.appendChild(sync);
  }, { once: true });
  platform.addEventListener('error', () => {
    document.documentElement.dataset.auroraPlatform = 'failed';
    markState({ coreLoaded: true, platformLoaded: false, error: 'PLATFORM_LOAD_FAILED' });
  }, { once: true });

  const core = document.createElement('script');
  core.src = '/Aurora_FC/aurora-core.js?v=20260823-browser-sync-authority-shell-1';
  core.async = false;
  core.dataset.auroraStage3 = 'core-plus-platform-plus-sync-browser-sync-authority';
  core.addEventListener('load', () => {
    document.documentElement.dataset.auroraCore = 'loaded';
    markState({ coreLoaded: true });
    document.head.appendChild(platform);
  }, { once: true });
  core.addEventListener('error', () => {
    document.documentElement.dataset.auroraCore = 'failed';
    markState({ coreLoaded: false, error: 'CORE_LOAD_FAILED' });
  }, { once: true });

  document.head.appendChild(core);
})();