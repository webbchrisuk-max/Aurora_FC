(function () {
  'use strict';

  var BUILD = '20260822-transfer-chairman-income-guard-1';

  function num(value) {
    var parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function money(value) {
    return new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.max(0, num(value)));
  }
  function parseMoney(text) {
    return num(String(text || '').replace(/,/g, ''));
  }

  function cardNetAnnual(card) {
    if (!card) return 0;
    var spans = Array.prototype.slice.call(card.querySelectorAll('.co-strategy-metrics span'));
    var row = spans.find(function (span) {
      var small = span.querySelector('small');
      return small && String(small.textContent || '').trim().toLowerCase() === 'net annual';
    });
    var strong = row && row.querySelector('strong');
    return strong ? parseMoney(strong.textContent) : 0;
  }

  function apply() {
    var api = window.AuroraTransferChairmanOffers;
    if (!api || !api.current) return;
    var current = api.current;
    var surrendered = Math.max(0, num(current.incomeSurrendered));
    var replacement = Math.max(0, num(current.replacementIncome));
    var net = num(current.netAnnual);
    var cash = Math.max(0, num(current.cashReleased));
    var shortfall = Math.max(0, surrendered - replacement);
    var breakEvenYield = cash > 0 ? surrendered / cash * 100 : 0;

    var alert = document.querySelector('#transferChairmanOffers .co-dividend-alert');
    if (alert && breakEvenYield > 0 && alert.textContent.indexOf('Break-even replacement yield') < 0) {
      alert.insertAdjacentText('beforeend', ' • Break-even replacement yield ' + breakEvenYield.toFixed(2) + '%.');
    }

    var cards = document.querySelectorAll('#transferChairmanOffers .co-strategy-card');
    Array.prototype.forEach.call(cards, function (card) {
      var note = card.querySelector('.co-strategy-note');
      var cardNet = cardNetAnnual(card);
      if (note && cardNet < -0.005) note.textContent = 'Chairman verdict: HOLD — income not replaceable';
    });

    if (net < -0.005) {
      var verdict = document.querySelector('#transferChairmanOffers .co-verdict');
      if (verdict) {
        verdict.classList.remove('strong','attractive','review','wait');
        verdict.classList.add('keep');
        var title = verdict.querySelector('.co-verdict-head strong');
        var copy = verdict.querySelector('p');
        if (title) title.textContent = 'HOLD — INCOME NOT REPLACEABLE';
        if (copy) copy.textContent = 'Best supported replacement route produces ' + money(replacement) + '/yr against ' + money(surrendered) + '/yr surrendered — a shortfall of ' + money(shortfall) + '/yr. The profit trigger stays open, but Chairman will not recommend selling until replacement income can be maintained or improved.';
      }
      current.economicDecision = 'HOLD_INCOME_NOT_REPLACEABLE';
      current.incomeShortfall = shortfall;
      current.breakEvenReplacementYield = breakEvenYield;
    } else {
      current.economicDecision = 'INCOME_MAINTAINED_OR_IMPROVED';
      current.incomeShortfall = 0;
      current.breakEvenReplacementYield = breakEvenYield;
    }

    window.AuroraTransferChairmanIncomeGuard = Object.freeze({
      build:BUILD,
      ready:true,
      readOnly:true,
      active:true,
      economicDecision:current.economicDecision,
      incomeShortfall:current.incomeShortfall,
      breakEvenReplacementYield:current.breakEvenReplacementYield
    });
  }

  window.addEventListener('aurora:transfer-chairman-offers', function () { setTimeout(apply, 0); });
  window.addEventListener('pageshow', function () { setTimeout(apply, 100); });
  window.addEventListener('focus', function () { setTimeout(apply, 100); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(apply, 100); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(apply, 350); }, {once:true});
  else setTimeout(apply, 350);
})();