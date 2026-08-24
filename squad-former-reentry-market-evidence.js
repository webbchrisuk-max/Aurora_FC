(() => {
  'use strict';

  const BUILD = '20260824-squad-former-reentry-market-evidence-1';
  if (window.__AuroraFormerReentryMarketEvidence === BUILD) return;
  window.__AuroraFormerReentryMarketEvidence = BUILD;

  const EVIDENCE = Object.freeze({
    LGEN: Object.freeze({
      ticker: 'LGEN',
      livePriceGbp: 2.846,
      fairValueGbp: 2.7420,
      asOf: '2026-08-24',
      marketSource: 'Sharecast market price • 24 Aug 2026',
      fairSource: '13-analyst 12-month consensus target • Investing.com',
      recommendation: 'Sell'
    }),
    SDLF: Object.freeze({
      ticker: 'SDLF',
      livePriceGbp: 9.235,
      fairValueGbp: 8.8685,
      asOf: '2026-08-24',
      marketSource: 'Sharecast market price • 24 Aug 2026',
      fairSource: '11-analyst 12-month consensus target • Investing.com',
      recommendation: 'Buy'
    }),
    MNG: Object.freeze({
      ticker: 'MNG',
      livePriceGbp: 3.494,
      fairValueGbp: 3.2243,
      asOf: '2026-08-24',
      marketSource: 'Investing.com market price • 24 Aug 2026',
      fairSource: '10-analyst 12-month consensus target • Investing.com',
      recommendation: 'Neutral'
    })
  });

  const money = value => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(Number(value) || 0);

  function tickerFromCard(card) {
    const title = card?.querySelector('.squad-former-head strong')?.textContent || '';
    return String(title.split('—')[0] || '').trim().toUpperCase();
  }

  function sharesFromCard(card) {
    const metrics = [...(card?.querySelectorAll('.squad-former-metrics > div') || [])];
    const row = metrics.find(node => /shares exited/i.test(node.querySelector('small')?.textContent || ''));
    const raw = row?.querySelector('b')?.textContent || '';
    const value = Number(String(raw).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function verdict(evidence) {
    const gap = evidence.fairValueGbp > 0 ? (evidence.livePriceGbp / evidence.fairValueGbp - 1) * 100 : null;
    if (gap === null) return { label: 'WATCH', tone: '', note: 'Market evidence is available; fair-value evidence still needs review.', gap };
    if (Math.abs(gap) <= 5) return { label: 'CLOSE TO FAIR VALUE', tone: 'good', note: 'Current market price is within roughly 5% of the current analyst-consensus valuation proxy.', gap };
    if (gap > 5) return { label: 'ABOVE FAIR VALUE', tone: 'bad', note: 'Current market price is above the current analyst-consensus valuation proxy.', gap };
    return { label: 'BELOW FAIR VALUE', tone: 'good', note: 'Current market price is below the current analyst-consensus valuation proxy.', gap };
  }

  function addMetric(host, key, label, value, note = '') {
    let node = host.querySelector(`[data-former-market-metric="${key}"]`);
    if (!node) {
      node = document.createElement('div');
      node.dataset.formerMarketMetric = key;
      host.appendChild(node);
    }
    node.innerHTML = `<small>${label}</small><b>${value}</b>${note ? `<span style="display:block;margin-top:4px;color:#718196;font:650 8px/1.25 system-ui">${note}</span>` : ''}`;
  }

  function enhanceCard(card) {
    const ticker = tickerFromCard(card);
    const evidence = EVIDENCE[ticker];
    if (!evidence) return false;

    const metrics = card.querySelector('.squad-former-metrics');
    if (!metrics) return false;

    const shares = sharesFromCard(card);
    const currentStakeValue = shares > 0 ? shares * evidence.livePriceGbp : 0;
    const fairStakeValue = shares > 0 ? shares * evidence.fairValueGbp : 0;
    const signal = verdict(evidence);

    addMetric(metrics, 'current-price', 'Current price', money(evidence.livePriceGbp), 'live market reference');
    addMetric(metrics, 'current-value', 'Former stake today', shares > 0 ? money(currentStakeValue) : '—', 'historical exited shares × current price');
    addMetric(metrics, 'fair-price', 'Fair price proxy', money(evidence.fairValueGbp), '12-month analyst consensus');
    addMetric(metrics, 'fair-value', 'Former stake at fair', shares > 0 ? money(fairStakeValue) : '—', 'historical exited shares × fair-price proxy');

    const notes = [...card.querySelectorAll('.squad-history-note')];
    const reentry = notes.find(node => /RE-ENTRY/i.test(node.textContent || ''));
    if (reentry) {
      const gapText = signal.gap == null ? '' : ` • ${signal.gap >= 0 ? '+' : ''}${signal.gap.toFixed(1)}% vs fair-price proxy`;
      reentry.innerHTML = `<b class="${signal.tone}">RE-ENTRY • ${signal.label}</b><br>${signal.note}<br><span>Current ${money(evidence.livePriceGbp)} • Fair-price proxy ${money(evidence.fairValueGbp)}${gapText}</span><br><span style="opacity:.72">Market: ${evidence.marketSource} • Valuation: ${evidence.fairSource} • consensus ${evidence.recommendation}</span>`;
    }

    card.dataset.formerMarketEvidence = evidence.asOf;
    return true;
  }

  function render() {
    const cards = [...document.querySelectorAll('#formerPlayerGrid .squad-former-card')];
    let enhanced = 0;
    cards.forEach(card => { if (enhanceCard(card)) enhanced += 1; });
    window.AuroraFormerReentryMarketEvidence = Object.freeze({
      build: BUILD,
      ready: true,
      readOnly: true,
      enhanced,
      evidence: EVIDENCE
    });
    document.documentElement.dataset.formerReentryMarketEvidence = enhanced ? 'ready' : 'waiting';
  }

  function boot() {
    render();
    [80, 250, 700, 1600].forEach(delay => setTimeout(render, delay));
    const host = document.getElementById('formerPlayerGrid');
    if (host) new MutationObserver(() => setTimeout(render, 0)).observe(host, { childList: true, subtree: true });
    window.addEventListener('aurora2:state', () => setTimeout(render, 30));
    window.addEventListener('pageshow', () => setTimeout(render, 30));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
