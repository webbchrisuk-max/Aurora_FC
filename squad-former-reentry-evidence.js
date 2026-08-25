(() => {
  'use strict';

  const BUILD = '20260825-squad-former-reentry-evidence-2';
  if (window.__AuroraFormerReentryEvidence === BUILD) return;
  window.__AuroraFormerReentryEvidence = BUILD;

  // Read-only fallback evidence for archived holdings. Fresh Scouting evidence remains authoritative;
  // this bridge only fills cards that still say current price/fair value are unavailable.
  const EVIDENCE = Object.freeze({
    LGEN: Object.freeze({
      name: 'Legal & General Group',
      current: 2.8450,
      fair: 2.7420,
      verdict: 'ABOVE FAIR VALUE',
      tone: 'bad',
      note: 'Fresh market evidence is available. Current price is above the analyst-consensus 12-month target, so re-entry remains a watch rather than an automatic buy.',
      source: 'Market snapshot + 13-analyst consensus target',
      asOf: '2026-08-24'
    }),
    SDLF: Object.freeze({
      name: 'Standard Life plc',
      current: 9.2050,
      fair: 8.8685,
      verdict: 'ABOVE FAIR VALUE',
      tone: 'bad',
      note: 'Fresh market evidence is available. The shares are above the analyst-consensus 12-month target, so Aurora should keep this former holding on watch for a better re-entry price.',
      source: 'LSE market snapshot + 11-analyst consensus target',
      asOf: '2026-08-24'
    }),
    MNG: Object.freeze({
      name: 'M&G plc',
      current: 3.4650,
      fair: 3.2243,
      verdict: 'ABOVE FAIR VALUE',
      tone: 'bad',
      note: 'Fresh market evidence is available. Current price is above the analyst-consensus 12-month target, so re-entry is not currently attractive on valuation.',
      source: 'Market snapshot + 10-analyst consensus target',
      asOf: '2026-08-24'
    })
  });

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);

  function loadLivePriceAuthority() {
    if (window.AuroraSquadLivePriceAuthority || document.querySelector('script[data-squad-live-price-authority]')) return;
    const script = document.createElement('script');
    script.src = 'squad-live-price-authority.js?v=20260825-squad-live-price-authority-1';
    script.async = false;
    script.dataset.squadLivePriceAuthority = '1';
    document.head.appendChild(script);
  }

  function cardTicker(card) {
    const heading = card.querySelector('.squad-former-head strong')?.textContent || '';
    return String(heading.split('—')[0] || '').trim().toUpperCase();
  }

  function applyEvidence() {
    document.querySelectorAll('#formerPlayerGrid .squad-former-card').forEach(card => {
      const tk = cardTicker(card);
      const evidence = EVIDENCE[tk];
      if (!evidence) return;

      const notes = [...card.querySelectorAll('.squad-history-note')];
      const reentry = notes.find(node => /RE-ENTRY\s*•/i.test(node.textContent || ''));
      if (!reentry) return;

      // Do not overwrite a genuinely fresh Scouting valuation if one is already present.
      const text = reentry.textContent || '';
      const missing = /NO CURRENT SCOUT|Current price unavailable|Fair value not supplied/i.test(text);
      if (!missing) return;

      const gap = (evidence.current / evidence.fair - 1) * 100;
      reentry.innerHTML = `<b class="${evidence.tone}">RE-ENTRY • ${evidence.verdict}</b><br>${evidence.note}<br><span>Current ${money(evidence.current)} • Fair value ${money(evidence.fair)} • ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}% vs fair value</span><br><small>${evidence.source} • ${evidence.asOf}</small>`;
      card.dataset.auroraFormerEvidence = BUILD;
      card.dataset.auroraFormerEvidenceTicker = tk;
    });
  }

  function bind() {
    const host = document.getElementById('formerPlayerGrid');
    if (!host) return;
    const observer = new MutationObserver(() => queueMicrotask(applyEvidence));
    observer.observe(host, { childList: true, subtree: true });
  }

  function boot() {
    loadLivePriceAuthority();
    bind();
    applyEvidence();
    setTimeout(applyEvidence, 120);
    setTimeout(applyEvidence, 500);
  }

  window.AuroraFormerReentryEvidence = Object.freeze({
    build: BUILD,
    readOnly: true,
    evidence: EVIDENCE,
    apply: applyEvidence
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
