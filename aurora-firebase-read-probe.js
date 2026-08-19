(() => {
  'use strict';

  const API_KEY = 'AIzaSyCWniUugILvyvTqXCnpQQQ352V0ECKPKo0';
  const PROJECT_ID = 'aurora-city-fc';
  const SESSION_KEY = 'aurora2:cloud:session:v1';
  const LEGACY_SESSION_KEY = 'aurora_cloud_rest_session_v1';
  const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token?key=' + API_KEY;
  const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';

  const state = {
    mode: 'READ_ONLY',
    status: 'STARTING',
    signedIn: false,
    refreshedToken: false,
    firestoreRead: false,
    cloudDocumentExists: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null
  };

  const emit = () => {
    window.AuroraFirebaseReadProbe = Object.freeze({ ...state });
    window.dispatchEvent(new CustomEvent('aurora:firebase-read-probe', { detail: { ...state } }));
  };

  const safeParse = (value, fallback = null) => {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  };

  const loadSession = () => {
    const current = safeParse(localStorage.getItem(SESSION_KEY) || 'null', null);
    if (current?.refreshToken && current?.uid) return current;
    const legacy = safeParse(localStorage.getItem(LEGACY_SESSION_KEY) || 'null', null);
    if (legacy?.refreshToken && legacy?.uid) {
      return {
        idToken: legacy.idToken || '',
        refreshToken: legacy.refreshToken,
        uid: legacy.uid,
        email: legacy.email || '',
        expiresAt: Number(legacy.expiresAt) || 0
      };
    }
    return null;
  };

  const refreshToken = async (session) => {
    const response = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken
      }).toString()
    });
    const text = await response.text();
    const data = safeParse(text, {});
    if (!response.ok) throw new Error(data?.error?.message || `Token refresh failed (${response.status})`);
    const next = {
      ...session,
      idToken: data.id_token,
      refreshToken: data.refresh_token || session.refreshToken,
      uid: data.user_id || session.uid,
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    state.refreshedToken = true;
    return next;
  };

  const ensureSession = async () => {
    let session = loadSession();
    if (!session) return null;
    state.signedIn = true;
    if (!session.idToken || Number(session.expiresAt) - Date.now() <= 90000) {
      session = await refreshToken(session);
    }
    return session;
  };

  const readCloudDocument = async (session) => {
    const path = `users/${session.uid}/cloud/aurora2-state`;
    const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.idToken}` },
      cache: 'no-store'
    });
    state.firestoreRead = true;
    if (response.status === 404) {
      state.cloudDocumentExists = false;
      return;
    }
    if (!response.ok) {
      const text = await response.text();
      const data = safeParse(text, {});
      throw new Error(data?.error?.message || `Firestore read failed (${response.status})`);
    }
    await response.text();
    state.cloudDocumentExists = true;
  };

  const run = async () => {
    emit();
    try {
      const session = await ensureSession();
      if (!session) {
        state.status = 'SIGNED_OUT';
      } else {
        state.status = 'READING';
        emit();
        await readCloudDocument(session);
        state.status = 'READ_OK';
      }
    } catch (error) {
      state.status = 'ERROR';
      state.error = String(error?.message || error);
    } finally {
      state.finishedAt = new Date().toISOString();
      emit();
      document.documentElement.dataset.auroraFirebaseRead = state.status.toLowerCase();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
