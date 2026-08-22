(() => {
  'use strict';

  const BUILD = '20260822-browser-sync-1';
  const STATE_KEY = 'aurora2:state:v1';
  const BACKUP_KEY = 'aurora2:state:backup:lastgood';
  const SESSION_KEY = 'aurora2:cloud:session:v1';
  const LEGACY_SESSION_KEY = 'aurora_cloud_rest_session_v1';
  const DEVICE_ID_KEY = 'aurora2:browser-sync:device-id:v1';
  const DEVICE_NAME_KEY = 'aurora2:browser-sync:device-name:v1';
  const META_KEY = 'aurora2:browser-sync:meta:v1';
  const API_KEY = 'AIzaSyCWniUugILvyvTqXCnpQQQ352V0ECKPKo0';
  const PROJECT_ID = 'aurora-city-fc';
  const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;
  const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const DOC_NAME = 'aurora2-browser-state';
  const BACKUP_DOC_NAME = 'aurora2-browser-backup';
  const MAX_BYTES = 850000;
  const SECRET_KEY = /(password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|endpoint)/i;
  const VOLATILE_HASH_KEYS = new Set(['updatedAt','lastSyncAt','lastHealthAt','lastCheckedAt','lastRunAt','lastAttemptAt','refreshedAt','syncedAt','lastRefreshAt','lastError','durationMs']);

  if (window.__AuroraBrowserSyncBuild === BUILD) return;
  window.__AuroraBrowserSyncBuild = BUILD;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const safeParse = (value, fallback = null) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
  const now = () => new Date().toISOString();
  let currentUser = null;
  let cloudCache = null;
  let phase = 'STARTING';
  let working = false;
  let lastError = '';
  const listeners = new Set();

  function nativeFetch(input, init = {}) {
    const shieldNative = window.AuroraStage3GShield?.nativeFetch;
    return typeof shieldNative === 'function' ? shieldNative(input, init) : window.fetch(input, init);
  }

  function readRawState() {
    return safeParse(localStorage.getItem(STATE_KEY) || 'null', null);
  }

  function browserName() {
    const ua = navigator.userAgent || '';
    if (/CriOS/i.test(ua)) return 'Chrome';
    if (/FxiOS/i.test(ua)) return 'Firefox';
    if (/EdgiOS/i.test(ua)) return 'Edge';
    if (/Brave/i.test(ua) || navigator.brave) return 'Brave';
    if (/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) return 'Safari';
    return 'Browser';
  }

  function defaultDeviceName() {
    const ua = navigator.userAgent || '';
    const ipad = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const device = ipad ? 'iPad' : /iPhone/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'PC' : /Macintosh|Mac OS/i.test(ua) ? 'Mac' : 'Device';
    return `Aurora ${device} • ${browserName()}`;
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function getDeviceName() {
    return localStorage.getItem(DEVICE_NAME_KEY) || defaultDeviceName();
  }

  function setDeviceName(value) {
    const clean = String(value || '').trim().slice(0, 70) || defaultDeviceName();
    localStorage.setItem(DEVICE_NAME_KEY, clean);
    emit();
    return clean;
  }

  function meta() {
    return {
      lastSyncAt: null,
      lastUploadAt: null,
      lastDownloadAt: null,
      remoteRevision: 0,
      remoteHash: '',
      ...(safeParse(localStorage.getItem(META_KEY) || '{}', {}) || {})
    };
  }

  function saveMeta(patch) {
    const next = { ...meta(), ...patch };
    localStorage.setItem(META_KEY, JSON.stringify(next));
    return next;
  }

  function scrubSecrets(value) {
    if (Array.isArray(value)) return value.map(scrubSecrets);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    Object.entries(value).forEach(([key, child]) => {
      if (SECRET_KEY.test(key)) return;
      out[key] = scrubSecrets(child);
    });
    return out;
  }

  function cloudSafeState(raw) {
    const state = scrubSecrets(clone(raw || {}));
    delete state.connection;
    if (state.registration && typeof state.registration === 'object') delete state.registration.backend;
    if (state.income && typeof state.income === 'object') {
      delete state.income.backend;
      delete state.income.runwaySummary;
    }
    if (state.squad && typeof state.squad === 'object') delete state.squad.canonicalSync;
    if (state.scouting && typeof state.scouting === 'object') delete state.scouting.universe;
    return state;
  }

  function canonicalForHash(value) {
    if (Array.isArray(value)) return value.map(canonicalForHash);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).sort().forEach(key => {
        if (VOLATILE_HASH_KEYS.has(key)) return;
        out[key] = canonicalForHash(value[key]);
      });
      return out;
    }
    return value;
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  async function stateHash(value) {
    return sha256(JSON.stringify(canonicalForHash(cloudSafeState(value))));
  }

  function byteSize(value) {
    const text = JSON.stringify(value);
    return new TextEncoder().encode(text).length;
  }

  function loadSession() {
    let session = safeParse(localStorage.getItem(SESSION_KEY) || 'null', null);
    if (session?.refreshToken && session?.uid) return session;
    const legacy = safeParse(localStorage.getItem(LEGACY_SESSION_KEY) || 'null', null);
    if (legacy?.refreshToken && legacy?.uid) {
      session = {
        idToken: legacy.idToken || '',
        refreshToken: legacy.refreshToken,
        uid: legacy.uid,
        email: legacy.email || '',
        expiresAt: Number(legacy.expiresAt) || 0
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    }
    return null;
  }

  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    const data = text ? safeParse(text, { raw: text }) : {};
    if (!response.ok) {
      const message = data?.error?.message || data?.error?.status || data?.raw || `Request failed (${response.status}).`;
      const error = new Error(message);
      error.code = data?.error?.status || String(response.status);
      throw error;
    }
    return data;
  }

  async function signInRequest(email, password) {
    const response = await nativeFetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), password: String(password || ''), returnSecureToken: true })
    });
    return readJsonResponse(response);
  }

  async function refreshRequest(refreshToken) {
    const response = await nativeFetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString()
    });
    return readJsonResponse(response);
  }

  async function ensureToken(force = false) {
    let session = loadSession();
    if (!session) throw new Error('Sign in to Aurora Browser Sync first.');
    if (!force && session.idToken && Number(session.expiresAt) - Date.now() > 90000) {
      currentUser = { uid: session.uid, email: session.email || '' };
      return session.idToken;
    }
    const refreshed = await refreshRequest(session.refreshToken);
    session = {
      ...session,
      idToken: refreshed.id_token,
      refreshToken: refreshed.refresh_token || session.refreshToken,
      uid: refreshed.user_id || session.uid,
      expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000
    };
    saveSession(session);
    currentUser = { uid: session.uid, email: session.email || '' };
    return session.idToken;
  }

  async function authFetch(url, options = {}, retry = true) {
    const token = await ensureToken(false);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const response = await nativeFetch(url, { ...options, headers });
    if (response.status === 401 && retry) {
      await ensureToken(true);
      return authFetch(url, options, false);
    }
    return response;
  }

  function firestoreValue(value) {
    if (value == null) return null;
    if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return value.booleanValue;
    if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
    return null;
  }

  function parseDocument(doc) {
    if (!doc) return null;
    const row = { _updateTime: doc.updateTime || '', _createTime: doc.createTime || '' };
    Object.entries(doc.fields || {}).forEach(([key, value]) => { row[key] = firestoreValue(value); });
    return row;
  }

  function firestoreFields(record) {
    const fields = {};
    Object.entries(record || {}).forEach(([key, value]) => {
      if (value === undefined) return;
      if (typeof value === 'boolean') fields[key] = { booleanValue: value };
      else if (typeof value === 'number' && Number.isFinite(value)) fields[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      else if (key.endsWith('At') && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) fields[key] = { timestampValue: value };
      else fields[key] = { stringValue: String(value ?? '') };
    });
    return fields;
  }

  function docPath(name, uid = currentUser?.uid) {
    return `users/${uid}/cloud/${name}`;
  }

  async function getDocument(name) {
    const response = await authFetch(`${FIRESTORE_BASE}/${docPath(name)}`, { method: 'GET', cache: 'no-store' });
    if (response.status === 404) return null;
    return parseDocument(await readJsonResponse(response));
  }

  async function writeDocument(name, record, expectedUpdateTime = '') {
    const query = new URLSearchParams();
    if (expectedUpdateTime) query.set('currentDocument.updateTime', expectedUpdateTime);
    const suffix = query.toString() ? `?${query}` : '';
    const response = await authFetch(`${FIRESTORE_BASE}/${docPath(name)}${suffix}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: firestoreFields(record) })
    });
    return parseDocument(await readJsonResponse(response));
  }

  function decodeCloud(row) {
    if (!row) return null;
    const state = safeParse(row.payload || 'null', null);
    if (!state || typeof state !== 'object') throw new Error('Browser cloud state is unreadable. No local data was changed.');
    return {
      state,
      hash: String(row.hash || ''),
      revision: Number(row.revision) || 0,
      savedAt: row.savedAt || row._updateTime || '',
      deviceId: String(row.deviceId || ''),
      deviceName: String(row.deviceName || ''),
      updateTime: row._updateTime || ''
    };
  }

  async function inspect() {
    if (!currentUser) await ensureToken(false);
    working = true;
    phase = 'CHECKING';
    lastError = '';
    emit();
    try {
      const row = await getDocument(DOC_NAME);
      cloudCache = decodeCloud(row);
      phase = cloudCache ? 'READY' : 'NO_CLOUD_MASTER';
      if (cloudCache) saveMeta({ remoteRevision: cloudCache.revision, remoteHash: cloudCache.hash });
      emit();
      return cloudCache;
    } catch (error) {
      phase = 'ERROR';
      lastError = String(error?.message || error);
      emit();
      throw error;
    } finally {
      working = false;
      emit();
    }
  }

  async function signIn(email, password) {
    working = true;
    phase = 'SIGNING_IN';
    lastError = '';
    emit();
    try {
      const auth = await signInRequest(email, password);
      const session = {
        idToken: auth.idToken,
        refreshToken: auth.refreshToken,
        uid: auth.localId,
        email: auth.email || String(email || '').trim(),
        expiresAt: Date.now() + Number(auth.expiresIn || 3600) * 1000
      };
      saveSession(session);
      currentUser = { uid: session.uid, email: session.email || '' };
      await inspect();
      return status();
    } catch (error) {
      clearSession();
      currentUser = null;
      phase = 'ERROR';
      lastError = String(error?.message || error);
      emit();
      throw error;
    } finally {
      working = false;
      emit();
    }
  }

  function signOut() {
    clearSession();
    currentUser = null;
    cloudCache = null;
    phase = 'SIGNED_OUT';
    lastError = '';
    emit();
  }

  async function uploadMaster() {
    if (!currentUser) await ensureToken(false);
    const raw = readRawState();
    if (!raw || typeof raw !== 'object') throw new Error('No Aurora state exists in this browser.');
    const safe = cloudSafeState(raw);
    const bytes = byteSize(safe);
    if (bytes > MAX_BYTES) throw new Error(`Browser state is ${Math.round(bytes / 1024)} KB, above the safe cloud limit.`);
    working = true;
    phase = 'UPLOADING';
    emit();
    try {
      const latestRow = await getDocument(DOC_NAME);
      const latest = decodeCloud(latestRow);
      if (latest) {
        await writeDocument(BACKUP_DOC_NAME, {
          version: 1,
          payload: JSON.stringify(latest.state),
          hash: latest.hash,
          revision: latest.revision,
          savedAt: now(),
          sourceSavedAt: latest.savedAt,
          deviceId: getDeviceId(),
          deviceName: getDeviceName()
        });
      }
      const hash = await stateHash(safe);
      const revision = (latest?.revision || 0) + 1;
      const savedAt = now();
      const written = await writeDocument(DOC_NAME, {
        version: 1,
        schemaVersion: Number(raw.schemaVersion) || 0,
        payload: JSON.stringify(safe),
        hash,
        revision,
        savedAt,
        deviceId: getDeviceId(),
        deviceName: getDeviceName()
      }, latest?.updateTime || '');
      cloudCache = decodeCloud(written);
      saveMeta({ lastSyncAt: savedAt, lastUploadAt: savedAt, remoteRevision: revision, remoteHash: hash });
      phase = 'SYNCED';
      emit();
      return cloudCache;
    } catch (error) {
      phase = 'ERROR';
      lastError = String(error?.message || error);
      emit();
      throw error;
    } finally {
      working = false;
      emit();
    }
  }

  function mergeLocalOnly(current, incoming) {
    const next = clone(incoming || {});
    if (current?.connection !== undefined) next.connection = clone(current.connection);
    if (current?.registration?.backend !== undefined) next.registration = { ...(next.registration || {}), backend: clone(current.registration.backend) };
    if (current?.income?.backend !== undefined || current?.income?.runwaySummary !== undefined) {
      next.income = { ...(next.income || {}) };
      if (current.income?.backend !== undefined) next.income.backend = clone(current.income.backend);
      if (current.income?.runwaySummary !== undefined) next.income.runwaySummary = clone(current.income.runwaySummary);
    }
    if (current?.squad?.canonicalSync !== undefined) next.squad = { ...(next.squad || {}), canonicalSync: clone(current.squad.canonicalSync) };
    if (current?.scouting?.universe !== undefined) next.scouting = { ...(next.scouting || {}), universe: clone(current.scouting.universe) };
    next.updatedAt = now();
    return next;
  }

  async function downloadCloud() {
    if (!currentUser) await ensureToken(false);
    working = true;
    phase = 'DOWNLOADING';
    emit();
    try {
      const latestRow = await getDocument(DOC_NAME);
      const latest = decodeCloud(latestRow);
      if (!latest) throw new Error('No Browser Sync cloud master exists yet.');
      const current = readRawState() || {};
      localStorage.setItem(BACKUP_KEY, JSON.stringify(current));
      const next = mergeLocalOnly(current, latest.state);
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
      cloudCache = latest;
      const stamp = now();
      saveMeta({ lastSyncAt: stamp, lastDownloadAt: stamp, remoteRevision: latest.revision, remoteHash: latest.hash });
      phase = 'SYNCED';
      window.dispatchEvent(new CustomEvent('aurora2:state', { detail: { source: 'aurora-browser-sync', direction: 'download', revision: latest.revision } }));
      emit();
      return next;
    } catch (error) {
      phase = 'ERROR';
      lastError = String(error?.message || error);
      emit();
      throw error;
    } finally {
      working = false;
      emit();
    }
  }

  function status() {
    const m = meta();
    return {
      build: BUILD,
      phase,
      working,
      lastError,
      signedIn: Boolean(currentUser),
      user: currentUser ? { email: currentUser.email || '' } : null,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      browser: browserName(),
      cloudExists: Boolean(cloudCache),
      cloudRevision: cloudCache?.revision || m.remoteRevision || 0,
      cloudSavedAt: cloudCache?.savedAt || null,
      cloudDeviceName: cloudCache?.deviceName || '',
      cloudHash: cloudCache?.hash || m.remoteHash || '',
      lastSyncAt: m.lastSyncAt,
      lastUploadAt: m.lastUploadAt,
      lastDownloadAt: m.lastDownloadAt
    };
  }

  function emit() {
    const detail = status();
    listeners.forEach(fn => { try { fn(detail); } catch (_) {} });
    window.dispatchEvent(new CustomEvent('aurora:browser-sync', { detail }));
    renderUi();
    return detail;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    try { fn(status()); } catch (_) {}
    return () => listeners.delete(fn);
  }

  function ago(value) {
    if (!value) return 'Never';
    const stamp = new Date(value).getTime();
    if (!Number.isFinite(stamp)) return String(value);
    const mins = Math.max(0, Math.round((Date.now() - stamp) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    return hours < 48 ? `${hours}h ago` : new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  function ensureUi() {
    if (document.getElementById('browserSyncPanel')) return;
    const main = document.querySelector('main.health-page');
    if (!main) return;
    const support = main.querySelector('.snapshot-panel');
    const section = document.createElement('section');
    section.id = 'browserSyncPanel';
    section.className = 'health-panel browser-sync-panel';
    section.innerHTML = `
      <div class="health-panel-head"><div><small>BROWSER SYNC</small><h2>Safari ↔ Brave State</h2><p class="health-copy">A dedicated raw-state mirror keeps current Aurora fields intact. Upload and download are explicit, backed up, and separate from the protected legacy Cloud Sync document.</p></div><span id="browserSyncBadge" class="health-badge">CHECKING</span></div>
      <div class="browser-sync-grid">
        <div><small>THIS BROWSER</small><strong id="browserSyncDevice">—</strong><span id="browserSyncLocal">Local Aurora state</span></div>
        <div><small>CLOUD MASTER</small><strong id="browserSyncCloud">—</strong><span id="browserSyncCloudMeta">No browser mirror checked</span></div>
        <div><small>LAST SYNC</small><strong id="browserSyncLast">Never</strong><span>Manual protected transfer</span></div>
      </div>
      <div id="browserSyncSignedOut" class="browser-sync-auth" hidden>
        <input id="browserSyncEmail" type="email" autocomplete="username" placeholder="Aurora Cloud email">
        <input id="browserSyncPassword" type="password" autocomplete="current-password" placeholder="Aurora Cloud password">
        <button id="browserSyncSignIn" type="button">Sign in to Browser Sync</button>
      </div>
      <div id="browserSyncSignedIn" class="browser-sync-actions" hidden>
        <button id="browserSyncRefresh" type="button">Refresh Cloud Check</button>
        <button id="browserSyncDownload" type="button">Use Cloud Copy Here</button>
        <button id="browserSyncUpload" type="button" class="danger">Save This Browser as Master</button>
        <button id="browserSyncSignOut" type="button">Sign Out</button>
      </div>
      <p id="browserSyncNote" class="health-copy">Checking Browser Sync…</p>`;
    if (support) support.insertAdjacentElement('beforebegin', section); else main.appendChild(section);

    const style = document.createElement('style');
    style.textContent = `
      .browser-sync-panel{border-color:rgba(110,231,255,.2)}
      .browser-sync-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
      .browser-sync-grid>div{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:15px;background:rgba(0,0,0,.14)}
      .browser-sync-grid small{display:block;color:#708999;font:800 9px/1.2 system-ui;letter-spacing:.1em;margin-bottom:7px}
      .browser-sync-grid strong{display:block;font:900 16px/1.25 system-ui}.browser-sync-grid span{display:block;color:#79909d;font-size:11px;margin-top:5px}
      .browser-sync-auth,.browser-sync-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
      .browser-sync-auth input{min-width:190px;flex:1;border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:12px;background:#07111c;color:#eefaff}
      .browser-sync-auth button,.browser-sync-actions button{border:1px solid rgba(110,231,255,.22);border-radius:11px;padding:11px 13px;background:rgba(8,47,73,.28);color:#dff9ff;font-weight:800}
      .browser-sync-actions button.danger{border-color:rgba(251,191,36,.28);color:#fde68a;background:rgba(120,53,15,.16)}
      .browser-sync-auth[hidden],.browser-sync-actions[hidden]{display:none!important}
      @media(max-width:760px){.browser-sync-grid{grid-template-columns:1fr}.browser-sync-auth input{min-width:100%}}
    `;
    document.head.appendChild(style);

    document.getElementById('browserSyncSignIn')?.addEventListener('click', async () => {
      const email = document.getElementById('browserSyncEmail')?.value || '';
      const password = document.getElementById('browserSyncPassword')?.value || '';
      try { await signIn(email, password); if (document.getElementById('browserSyncPassword')) document.getElementById('browserSyncPassword').value = ''; }
      catch (_) {}
    });
    document.getElementById('browserSyncRefresh')?.addEventListener('click', () => inspect().catch(() => {}));
    document.getElementById('browserSyncSignOut')?.addEventListener('click', signOut);
    document.getElementById('browserSyncDownload')?.addEventListener('click', async () => {
      if (!cloudCache) return;
      if (!confirm(`Use the Browser Sync cloud copy from ${cloudCache.deviceName || 'another browser'}?\n\nAurora will create a last-good backup of this browser before replacing cloud-managed state. Local backend/runtime settings stay on this device.`)) return;
      try { await downloadCloud(); setTimeout(() => location.reload(), 500); } catch (_) {}
    });
    document.getElementById('browserSyncUpload')?.addEventListener('click', async () => {
      const warning = cloudCache
        ? `Replace Browser Sync revision #${cloudCache.revision} from ${cloudCache.deviceName || 'the cloud'} with this browser?\n\nThe existing cloud copy is backed up first.`
        : 'Create the Browser Sync cloud master from this browser?';
      if (!confirm(warning)) return;
      try { await uploadMaster(); } catch (_) {}
    });
  }

  function renderUi() {
    ensureUi();
    const panel = document.getElementById('browserSyncPanel');
    if (!panel) return;
    const s = status();
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const badge = document.getElementById('browserSyncBadge');
    const signedOut = document.getElementById('browserSyncSignedOut');
    const signedIn = document.getElementById('browserSyncSignedIn');
    if (signedOut) signedOut.hidden = s.signedIn;
    if (signedIn) signedIn.hidden = !s.signedIn;
    set('browserSyncDevice', s.deviceName);
    set('browserSyncLocal', `Browser: ${s.browser} • ID ${String(s.deviceId).slice(0, 8)}…`);
    set('browserSyncCloud', s.cloudExists ? `Revision #${s.cloudRevision}` : 'No cloud master');
    set('browserSyncCloudMeta', s.cloudExists ? `${s.cloudDeviceName || 'Unknown browser'} • ${ago(s.cloudSavedAt)}` : 'Create one from the browser you trust as current.');
    set('browserSyncLast', ago(s.lastSyncAt));
    const note = s.lastError ? s.lastError : !s.signedIn ? 'Sign in with the same Aurora Cloud account in each browser. Passwords are used only for Firebase sign-in and are never saved by Browser Sync.' : s.working ? `${s.phase.replaceAll('_',' ')}…` : s.cloudExists ? 'Cloud mirror found. Use Cloud Copy Here to bring this browser up to date, or save this browser as master when this is the copy you trust.' : 'No Browser Sync master exists yet. Create it from the browser containing the correct Aurora state.';
    set('browserSyncNote', note);
    if (badge) {
      badge.textContent = s.lastError ? 'ERROR' : !s.signedIn ? 'SIGNED OUT' : s.working ? 'WORKING' : s.cloudExists ? 'READY' : 'SETUP';
      badge.className = `health-badge ${s.lastError ? 'block' : s.signedIn && s.cloudExists ? 'good' : 'warn'}`;
    }
    const download = document.getElementById('browserSyncDownload');
    const upload = document.getElementById('browserSyncUpload');
    const refresh = document.getElementById('browserSyncRefresh');
    if (download) download.disabled = s.working || !s.cloudExists;
    if (upload) upload.disabled = s.working;
    if (refresh) refresh.disabled = s.working;
  }

  async function initialise() {
    ensureUi();
    const session = loadSession();
    if (!session) {
      phase = 'SIGNED_OUT';
      emit();
      return;
    }
    currentUser = { uid: session.uid, email: session.email || '' };
    try { await ensureToken(false); await inspect(); }
    catch (_) { emit(); }
  }

  window.AuroraBrowserSync = Object.freeze({
    build: BUILD,
    status,
    subscribe,
    signIn,
    signOut,
    inspect,
    uploadMaster,
    downloadCloud,
    getDeviceId,
    getDeviceName,
    setDeviceName,
    cloudSafeState,
    stateHash
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
