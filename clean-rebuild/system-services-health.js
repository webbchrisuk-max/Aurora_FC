(() => {
  'use strict';

  const BUILD = '20260826-system-services-health-1';
  const $ = id => document.getElementById(id);
  const arr = v => Array.isArray(v) ? v : [];
  const upper = v => String(v || '').trim().toUpperCase();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = v => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
  const when = value => {
    if (!value) return 'Never';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const ageHours = value => {
    const t = new Date(value || 0).getTime();
    return Number.isFinite(t) && t > 0 ? (Date.now() - t) / 3600000 : Infinity;
  };

  let running = false;
  let latest = [];

  function paint(rows) {
    latest = rows;
    const host = $('serviceHealthRows');
    if (host) host.innerHTML = rows.map(row => `<li><strong>${row.ok ? 'PASS' : row.warn ? 'WARN' : 'FAIL'}</strong> — ${esc(row.label)}${row.detail ? ` · ${esc(row.detail)}` : ''}</li>`).join('');
    const pass = rows.filter(r => r.ok).length;
    const fail = rows.filter(r => !r.ok && !r.warn).length;
    const warn = rows.filter(r => r.warn).length;
    if ($('serviceHealthSummary')) $('serviceHealthSummary').textContent = `${pass} passed · ${warn} warning${warn===1?'':'s'} · ${fail} failed`;
    if ($('serviceHealthBuild')) $('serviceHealthBuild').textContent = BUILD;
    const badge = $('serviceHealthBadge');
    if (badge) badge.textContent = fail ? 'ATTENTION' : warn ? 'CHECK' : 'LIVE';
  }

  function row(label, ok, detail='', warn=false) { return {label, ok:!!ok, detail:String(detail||''), warn:!!warn && !ok}; }

  async function run() {
    if (running) return;
    running = true;
    const button = $('runServiceHealth');
    if (button) button.disabled = true;
    const rows = [];
    try {
      const client = window.AuroraData2Client;
      rows.push(row('AuroraData 2 client loaded', !!client, client ? `v${client.version || 'unknown'}` : 'Client unavailable'));
      if (!client) { paint(rows); return; }

      const cfg = client.config?.() || {};
      const configured = !!cfg.endpoint && !!cfg.token;
      rows.push(row('AuroraData 2 connection configured', configured, configured ? 'Endpoint and private token present in this browser' : 'Open Registration and save the AuroraData 2 connection'));
      if (!configured) { paint(rows); return; }

      try {
        const health = await client.health();
        rows.push(row('AuroraData 2 backend reachable', health?.connected === true || health?.ok !== false, health?.spreadsheetId ? `Spreadsheet ${health.spreadsheetId}` : 'Backend responded'));
      } catch (error) {
        rows.push(row('AuroraData 2 backend reachable', false, error?.message || error));
      }

      let snapshot = null;
      try {
        snapshot = await client.post('incomeSnapshot', {});
        const dividends = arr(snapshot?.dividends);
        rows.push(row('Income snapshot readable', Array.isArray(snapshot?.dividends), `${dividends.length} dividend record${dividends.length===1?'':'s'}`));
        const future = dividends.filter(d => {
          const pay = new Date(d.payDate || d.pay_date || 0).getTime();
          return Number.isFinite(pay) && pay >= new Date().setHours(0,0,0,0) && !['ARCHIVED','CANCELLED'].includes(upper(d.status));
        });
        rows.push(row('Upcoming dividend calendar available', future.length > 0, future.length ? `${future.length} future dated payment${future.length===1?'':'s'}` : 'No future dated dividend records currently returned', future.length === 0));
        const dated = dividends.filter(d => d.payDate || d.pay_date);
        rows.push(row('Dividend records carry payment dates', dividends.length === 0 || dated.length > 0, dividends.length ? `${dated.length}/${dividends.length} have pay dates` : 'No dividend records to inspect', dividends.length > 0 && dated.length === 0));
      } catch (error) {
        rows.push(row('Income snapshot readable', false, error?.message || error));
      }

      try {
        const engine = await client.post('dividendEngineStatus', {});
        const installed = !!engine?.installed;
        rows.push(row('Automatic dividend update trigger installed', installed, installed ? 'Scheduled dividend updates are enabled' : 'No automatic dividend trigger reported'));

        const last = engine?.lastSummary || {};
        const lastAt = last.finishedAt || last.completedAt || engine?.lastRunAt || engine?.lastSuccessfulRunAt || '';
        const lastOk = !!lastAt && ageHours(lastAt) <= 48;
        rows.push(row('Dividend engine has run recently', lastOk, lastAt ? `Last run ${when(lastAt)}${ageHours(lastAt) > 48 ? ' · older than 48 hours' : ''}` : 'No completed run timestamp reported', !!lastAt && !lastOk));

        const engineFailed = engine?.ok === false || upper(last.status) === 'ERROR' || upper(last.status) === 'FAILED';
        rows.push(row('Latest dividend engine run healthy', !engineFailed, engineFailed ? (last.error || engine.message || 'Latest run reported an error') : 'No engine failure reported'));

        const reviews = Number(engine?.openReviewCount || 0);
        rows.push(row('Dividend review queue clear', reviews === 0, reviews ? `${reviews} dividend item${reviews===1?'':'s'} need review` : 'No open dividend reviews', reviews > 0));

        if (engine?.alphaVantage && typeof engine.alphaVantage === 'object') {
          rows.push(row('Dividend market-data source configured', !!engine.alphaVantage.configured, engine.alphaVantage.configured ? 'Market-data source connected' : 'Market-data source not configured', !engine.alphaVantage.configured));
        }
      } catch (error) {
        rows.push(row('Dividend engine status readable', false, error?.message || error));
      }

      if (snapshot) {
        const dividends = arr(snapshot.dividends);
        const confirmed = dividends.filter(d => ['CONFIRMED','PAID'].includes(upper(d.status)));
        rows.push(row('Confirmed dividend data present', confirmed.length > 0, `${confirmed.length} confirmed/paid record${confirmed.length===1?'':'s'}`, confirmed.length === 0));
        const expected = confirmed.reduce((s,d)=>s+Math.max(0,Number(d.expectedAmountGbp ?? d.expected_amount_gbp ?? d.grossDividendGbp ?? d.gross_dividend_gbp ?? 0)||0),0);
        rows.push(row('Dividend amounts are calculable', Number.isFinite(expected), `Confirmed expected cash ${money(expected)}`));
      }
    } finally {
      paint(rows);
      running = false;
      if (button) button.disabled = false;
    }
  }

  function boot() {
    if (!window.AuroraData2Client) { setTimeout(boot, 50); return; }
    $('runServiceHealth')?.addEventListener('click', run);
    run();
    window.AuroraSystemServicesHealth = Object.freeze({BUILD, run, latest:()=>latest.slice()});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
