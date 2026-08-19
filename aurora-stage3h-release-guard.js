(() => {
  'use strict';

  const BUILD = '20260820-stage3h-release-guard-probe-2';
  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const CHILDREN = Object.freeze({
    scouting: currentFile === 'scouting.html',
    matchReport: currentFile === 'match-report.html'
  });

  function ownsGlobalStage() {
    const owner = String(document.documentElement.dataset.auroraStageOwner || '');
    return !owner || owner === '3H';
  }

  function setStatus(label, note) {
    if (ownsGlobalStage()) {
      document.querySelectorAll('.status span').forEach((node) => { node.textContent = 'STAGE 3H'; });
      document.querySelectorAll('.status b').forEach((node) => { node.textContent = 'RELEASE GUARD PROBE'; });
    }
    const panel = document.getElementById('stage3hReleaseGuardStatus');
    const text = document.getElementById('stage3hReleaseGuardNote');
    if (panel) panel.textContent = `Release Guard: ${label}`;
    if (text && note) text.textContent = note;
  }

  function stampNavigation() {
    if (!ownsGlobalStage()) return;
    document.querySelectorAll('.club-nav a[href], .direct-links a[href]').forEach((link) => {
      const raw = String(link.getAttribute('href') || '');
      const target = raw.split('#')[0].split('?')[0];
      if (!/^(index|finance|scouting|transfer|registration|squad|income|match-report|club-control|system-health)\.html$/i.test(target)) return;
      link.setAttribute('href', `${target}?auroraBuild=${encodeURIComponent(BUILD)}`);
    });
  }

  function premarkReleaseChildren() {
    if (CHILDREN.scouting) {
      window.AuroraScoutingIntelligence3Migration = window.AuroraScoutingIntelligence3Migration || Object.freeze({ stage3hSuppressed: true });
      window.AuroraScoutingIntelligence3 = window.AuroraScoutingIntelligence3 || Object.freeze({ stage3hSuppressed: true });
      window.AuroraScoutingIntelligence3GlobalBridge = window.AuroraScoutingIntelligence3GlobalBridge || Object.freeze({ stage3hSuppressed: true });
    }
    if (CHILDREN.matchReport) {
      window.AuroraMatchReportLiveAuthority = window.AuroraMatchReportLiveAuthority || Object.freeze({ stage3hSuppressed: true });
    }
  }

  function report(detail = {}) {
    const payload = {
      build: BUILD,
      stageOwner: String(document.documentElement.dataset.auroraStageOwner || ''),
      releaseLoaded: Boolean(window.AuroraRelease),
      scoutingChildrenSuppressed: CHILDREN.scouting,
      matchReportChildSuppressed: CHILDREN.matchReport,
      ...detail
    };
    document.documentElement.dataset.auroraReleaseGuard = payload.releaseLoaded ? 'loaded' : 'waiting';
    window.AuroraStage3H = Object.freeze(payload);
    window.dispatchEvent(new CustomEvent('aurora:stage3h-release-guard', { detail: payload }));
  }

  function loadRelease() {
    if (window.AuroraRelease) {
      setStatus('ACTIVE ✅', 'Aurora Release was already present. Shared Release housekeeping is active; Scouting Intelligence 3 and Match Report authority remain isolated from this probe.');
      report({ releaseLoaded: true, reused: true });
      return;
    }

    premarkReleaseChildren();
    setStatus('LOADING…', 'Loading the exact old Aurora Release module. Page-specific Release child modules are suppressed for this shared-runtime probe.');

    const release = document.createElement('script');
    release.src = '/aurora-fc-2/aurora-release.js?v=20260820-stage3h-release-guard-probe-2';
    release.async = false;
    release.dataset.auroraStage3 = 'release-guard-only';
    release.addEventListener('load', () => {
      document.documentElement.dataset.auroraRelease = 'loaded';
      setStatus('ACTIVE ✅', 'Exact Aurora Release shared housekeeping is active. Its body-wide MutationObserver, delayed housekeeping passes, resize listener and Aurora state listener are running; page-specific child modules remain suppressed.');
      report({ releaseLoaded: true });
    }, { once: true });
    release.addEventListener('error', () => {
      document.documentElement.dataset.auroraRelease = 'failed';
      setStatus('FAILED ❌', 'Aurora Release failed to load.');
      report({ releaseLoaded: false, error: 'RELEASE_LOAD_FAILED' });
    }, { once: true });
    document.head.appendChild(release);
  }

  setStatus('WAITING…', 'Waiting for Aurora Core before loading Release.');
  stampNavigation();

  let tries = 0;
  const wait = () => {
    if (window.Aurora2?.core?.read) {
      loadRelease();
      return;
    }
    tries += 1;
    if (tries > 240) {
      setStatus('FAILED ❌', 'Aurora Core did not become ready in time for the Release probe.');
      report({ releaseLoaded: false, error: 'CORE_WAIT_TIMEOUT' });
      return;
    }
    setTimeout(wait, 25);
  };
  wait();
})();
