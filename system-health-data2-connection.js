(() => {
  'use strict';

  const BUILD = '20260823-system-health-data2-connection-1';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function setStatus(label, tone = 'waiting', note = '') {
    const badge = document.getElementById('data2ConnectionBadge');
    const status = document.getElementById('data2ConnectionStatus');
    const meta = document.getElementById('data2ConnectionMeta');
    if (badge) {
      badge.textContent = label;
      badge.className = `health-badge ${tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : ''}`.trim();
    }
    if (status) status.textContent = label;
    if (meta) meta.textContent = note;
  }

  function ensureStyles() {
    if (document.getElementById('auroraData2ConnectionStyles')) return;
    const style = document.createElement('style');
    style.id = 'auroraData2ConnectionStyles';
    style.textContent = `
      .data2-connect-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px;margin-top:18px}
      .data2-connect-field{display:flex;flex-direction:column;gap:7px}
      .data2-connect-field label{font:900 9px/1.2 Inter,system-ui;letter-spacing:.12em;color:#75dff7;text-transform:uppercase}
      .data2-connect-field input{width:100%;box-sizing:border-box;border:1px solid rgba(93,207,245,.2);border-radius:10px;background:rgba(5,13,22,.72);color:#eaf8ff;padding:12px 13px;font:600 12px/1.3 Inter,system-ui;outline:none}
      .data2-connect-field input:focus{border-color:rgba(93,207,245,.62);box-shadow:0 0 0 3px rgba(93,207,245,.08)}
      .data2-connect-status{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px}
      .data2-connect-status>div{padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(5,12,20,.45)}
      .data2-connect-status small{display:block;font:800 8px/1.2 Inter,system-ui;letter-spacing:.12em;color:#68899a;text-transform:uppercase;margin-bottom:5px}
      .data2-connect-status strong{display:block;color:#eaf8ff;font:800 12px/1.3 Inter,system-ui}
      .data2-connect-note{margin-top:12px;color:#7894a4;font-size:10px;line-height:1.55}
      .data2-connect-note b{color:#c7f4ff}
      @media(max-width:760px){.data2-connect-grid,.data2-connect-status{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    if (document.getElementById('auroraData2ConnectionPanel')) return true;
    const anchor = document.querySelector('.cloud-panel') || document.querySelector('.health-grid');
    if (!anchor) return false;

    ensureStyles();

    const panel = document.createElement('section');
    panel.className = 'health-panel';
    panel.id = 'auroraData2ConnectionPanel';
    panel.innerHTML = `
      <div class="health-panel-head">
        <div>
          <small>AURORADATA 2 CONNECTION</small>
          <h2>Apps Script Connection</h2>
          <p class="health-copy">Save the Apps Script web-app URL and private token once in this browser. Every Aurora page in this browser uses the same connection automatically.</p>
        </div>
        <span id="data2ConnectionBadge" class="health-badge">CHECKING</span>
      </div>

      <div class="data2-connect-grid">
        <div class="data2-connect-field">
          <label for="data2EndpointInput">Apps Script web-app URL</label>
          <input id="data2EndpointInput" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec">
        </div>
        <div class="data2-connect-field">
          <label for="data2TokenInput">Private token</label>
          <input id="data2TokenInput" type="password" autocomplete="new-password" placeholder="Enter private token">
        </div>
      </div>

      <div class="health-actions" style="margin-top:14px">
        <button id="data2SaveTest" type="button">Save & Test Connection</button>
        <button id="data2ShowToken" type="button">Show Token</button>
        <button id="data2Clear" class="danger" type="button">Clear Connection</button>
      </div>

      <div class="data2-connect-status">
        <div><small>Connection</small><strong id="data2ConnectionStatus">Checking…</strong></div>
        <div><small>Endpoint</small><strong id="data2EndpointStatus">—</strong></div>
        <div><small>Token</small><strong id="data2TokenStatus">—</strong></div>
      </div>

      <p class="data2-connect-note" id="data2ConnectionMeta"><b>Security:</b> the endpoint and private token stay in this browser's local storage and are not uploaded to Browser Sync/cloud.</p>
    `;

    anchor.parentNode.insertBefore(panel, anchor);

    const client = window.AuroraData2Client;
    const endpointInput = document.getElementById('data2EndpointInput');
    const tokenInput = document.getElementById('data2TokenInput');
    const endpointStatus = document.getElementById('data2EndpointStatus');
    const tokenStatus = document.getElementById('data2TokenStatus');
    const showToken = document.getElementById('data2ShowToken');

    function refresh() {
      const cfg = client?.config?.() || {};
      if (endpointInput) endpointInput.value = cfg.endpoint || '';
      if (tokenInput) tokenInput.value = cfg.token || '';
      if (endpointStatus) endpointStatus.textContent = cfg.endpoint ? 'SAVED' : 'MISSING';
      if (tokenStatus) tokenStatus.textContent = cfg.token ? 'SAVED' : 'MISSING';
      if (cfg.endpoint && cfg.token) setStatus('READY', 'good', 'Connection details are saved locally in this browser. Use Save & Test Connection to verify the backend now.');
      else setStatus('NOT CONNECTED', 'waiting', 'Enter the Apps Script web-app URL and private token, then save and test the connection.');
    }

    document.getElementById('data2SaveTest')?.addEventListener('click', async () => {
      const endpoint = String(endpointInput?.value || '').trim();
      const token = String(tokenInput?.value || '').trim();
      if (!endpoint || !token) {
        setStatus('MISSING DETAILS', 'bad', 'Both the Apps Script web-app URL and private token are required.');
        return;
      }

      client.saveConfig(endpoint, token);
      if (endpointStatus) endpointStatus.textContent = 'SAVED';
      if (tokenStatus) tokenStatus.textContent = 'SAVED';
      setStatus('TESTING…', 'waiting', 'Saved locally. Testing AuroraData 2 now…');

      try {
        const result = await client.health();
        setStatus('CONNECTED', 'good', `AuroraData 2 confirmed the connection${Number.isFinite(Number(result?.transactions)) ? ` • ${Number(result.transactions)} recent registrations visible` : ''}. All Aurora pages in this browser can now use it.`);
        window.dispatchEvent(new CustomEvent('aurora:data2-connection-saved', { detail: { build: BUILD, connected: true } }));
      } catch (error) {
        setStatus('TEST FAILED', 'bad', String(error?.message || error || 'AuroraData 2 connection test failed.'));
      }
    });

    showToken?.addEventListener('click', () => {
      if (!tokenInput) return;
      const showing = tokenInput.type === 'text';
      tokenInput.type = showing ? 'password' : 'text';
      showToken.textContent = showing ? 'Show Token' : 'Hide Token';
    });

    document.getElementById('data2Clear')?.addEventListener('click', () => {
      client.clearConfig?.();
      if (endpointInput) endpointInput.value = '';
      if (tokenInput) tokenInput.value = '';
      if (endpointStatus) endpointStatus.textContent = 'MISSING';
      if (tokenStatus) tokenStatus.textContent = 'MISSING';
      setStatus('CLEARED', 'waiting', 'The AuroraData 2 connection has been removed from this browser only.');
    });

    refresh();
    return true;
  }

  let tries = 0;
  const wait = () => {
    if (window.AuroraData2Client && mount()) return;
    tries += 1;
    if (tries < 240) setTimeout(wait, 50);
  };
  wait();
})();
