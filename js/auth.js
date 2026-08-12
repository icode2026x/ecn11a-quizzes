/* ============================================================
   Google Sign-In + Firestore cloud sync for quiz progress.
   Uses Firebase JS SDK via CDN (ES modules).
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const Cloud = {
  ready: false,
  user: null,
  app: null,
  auth: null,
  db: null,
  syncing: false,
  lastCloudWrite: 0,
  _debounceTimer: null,
  _listeners: []
};

function isConfigured() {
  return !!(window.FIREBASE_CONFIGURED && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
}

function notify() {
  Cloud._listeners.forEach((fn) => {
    try { fn(Cloud.user); } catch (e) { console.error(e); }
  });
  if (typeof window.renderAuthUI === "function") window.renderAuthUI();
  if (typeof window.render === "function") {
    try { window.render(); } catch (e) { /* ignore during early boot */ }
  }
}

function userDocRef(uid) {
  return doc(Cloud.db, "users", uid);
}

function collectLocalSessions() {
  const sessions = {};
  if (!window.Store) return sessions;
  Store.getAllSessionQuizIds().forEach((quizId) => {
    const s = Store.loadSession(quizId);
    if (s) sessions[quizId] = s;
  });
  return sessions;
}

function applySessions(sessions) {
  if (!sessions) return;
  Object.keys(sessions).forEach((quizId) => {
    localStorage.setItem("ecn11a_quiz_session_" + quizId, JSON.stringify(sessions[quizId]));
  });
}

function trimAttempts(attempts) {
  const out = {};
  Object.keys(attempts || {}).forEach((quizId) => {
    const entry = attempts[quizId] || { history: [], best: null };
    const history = Array.isArray(entry.history) ? entry.history.slice(0, 25) : [];
    out[quizId] = { history, best: entry.best || null };
  });
  return out;
}

function mergeAttempts(local, cloud) {
  const ids = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  const merged = {};
  ids.forEach((id) => {
    const a = local[id] || { history: [], best: null };
    const b = cloud[id] || { history: [], best: null };
    const map = new Map();
    [...(b.history || []), ...(a.history || [])].forEach((h) => {
      const key = String(h.date) + "|" + h.score + "|" + h.total + "|" + (h.mode || "");
      if (!map.has(key)) map.set(key, h);
    });
    const history = Array.from(map.values()).sort((x, y) => (y.date || 0) - (x.date || 0)).slice(0, 25);
    let best = null;
    history.forEach((h) => {
      if (!best || h.percent > best.percent) best = h;
    });
    if (!best) best = a.best || b.best || null;
    merged[id] = { history, best };
  });
  return merged;
}

function mergeModules(localMods, cloudMods) {
  const byId = new Map();
  (cloudMods || []).forEach((m) => byId.set(m.id, m));
  (localMods || []).forEach((m) => {
    const existing = byId.get(m.id);
    if (!existing) {
      byId.set(m.id, m);
      return;
    }
    /* Prefer whichever module has more quiz content; keep union of quizzes by id. */
    const quizMap = new Map();
    (existing.quizzes || []).forEach((q) => quizMap.set(q.id, q));
    (m.quizzes || []).forEach((q) => {
      const prev = quizMap.get(q.id);
      if (!prev || (q.questions || []).length >= (prev.questions || []).length) {
        quizMap.set(q.id, q);
      }
    });
    byId.set(m.id, {
      ...existing,
      ...m,
      name: m.name || existing.name,
      description: m.description || existing.description,
      quizzes: Array.from(quizMap.values())
    });
  });
  return Array.from(byId.values());
}

async function pullAndMerge() {
  if (!Cloud.user || !Cloud.db || !window.Store) return;
  Cloud.syncing = true;
  try {
    const snap = await getDoc(userDocRef(Cloud.user.uid));
    const localUpdated = Store.state.updatedAt || 0;
    const localSessions = collectLocalSessions();

    if (!snap.exists()) {
      await pushCloud(true);
      if (typeof showToast === "function") showToast("Cloud save ready — progress will sync.", "success");
      return;
    }

    const cloud = snap.data() || {};
    const cloudUpdated = cloud.updatedAtMs || 0;

    const modules = mergeModules(Store.state.modules, cloud.modules);
    const attempts = mergeAttempts(Store.state.attempts, cloud.attempts);
    const sessions = Object.assign({}, cloud.sessions || {}, localSessions);

    Store.state.modules = modules;
    Store.state.attempts = attempts;
    Store.state.updatedAt = Math.max(localUpdated, cloudUpdated, Date.now());
    window.saveState(Store.state);
    applySessions(sessions);

    await pushCloud(true);
    if (typeof showToast === "function") {
      showToast("Signed in — progress synced across devices.", "success");
    }
  } catch (err) {
    console.error("Cloud sync failed:", err);
    if (typeof showToast === "function") {
      showToast("Signed in, but cloud sync failed. Check Firestore rules.", "error");
    }
  } finally {
    Cloud.syncing = false;
    notify();
  }
}

async function pushCloud(force) {
  if (!Cloud.user || !Cloud.db || !window.Store) return;
  if (Cloud.syncing && !force) return;
  const payload = {
    modules: Store.state.modules,
    attempts: trimAttempts(Store.state.attempts),
    sessions: collectLocalSessions(),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
    email: Cloud.user.email || "",
    displayName: Cloud.user.displayName || "",
    photoURL: Cloud.user.photoURL || ""
  };
  await setDoc(userDocRef(Cloud.user.uid), payload, { merge: true });
  Cloud.lastCloudWrite = Date.now();
}

function scheduleCloudPush() {
  if (!Cloud.user || !isConfigured()) return;
  clearTimeout(Cloud._debounceTimer);
  Cloud._debounceTimer = setTimeout(() => {
    pushCloud(false).catch((e) => console.error("Cloud push failed:", e));
  }, 700);
}

async function initFirebase() {
  if (!isConfigured()) {
    Cloud.ready = false;
    window.CloudAuth = api;
    return;
  }

  try {
    Cloud.app = initializeApp(window.FIREBASE_CONFIG);
    Cloud.auth = getAuth(Cloud.app);
    Cloud.db = getFirestore(Cloud.app);
    Cloud.ready = true;

    try {
      await getRedirectResult(Cloud.auth);
    } catch (e) {
      console.warn("Redirect sign-in result:", e);
    }

    onAuthStateChanged(Cloud.auth, async (user) => {
      Cloud.user = user;
      notify();
      if (user) await pullAndMerge();
    });
  } catch (err) {
    console.error("Firebase init failed:", err);
    Cloud.ready = false;
    if (typeof showToast === "function") {
      showToast("Firebase failed to start. Check firebase-config.js.", "error");
    }
  }

  window.CloudAuth = api;
}

const api = {
  isConfigured,
  getUser() { return Cloud.user; },
  isReady() { return Cloud.ready; },
  isSyncing() { return Cloud.syncing; },
  onChange(fn) { Cloud._listeners.push(fn); },
  scheduleCloudPush,
  pushNow: () => pushCloud(true),

  async signInWithGoogle() {
    if (!isConfigured()) {
      if (typeof showToast === "function") {
        showToast("Cloud login is not configured yet. See Settings → Cloud Sync.", "error");
      }
      return;
    }
    if (!Cloud.auth) await initFirebase();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      /* Popup works well on desktop; iOS Safari often needs redirect. */
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(Cloud.auth, provider);
      } else {
        await signInWithPopup(Cloud.auth, provider);
      }
    } catch (err) {
      if (err && err.code === "auth/popup-blocked") {
        await signInWithRedirect(Cloud.auth, provider);
        return;
      }
      console.error(err);
      if (typeof showToast === "function") {
        showToast(err.message || "Google sign-in failed.", "error");
      }
    }
  },

  async signOutUser() {
    if (!Cloud.auth) return;
    await signOut(Cloud.auth);
    Cloud.user = null;
    notify();
    if (typeof showToast === "function") showToast("Signed out. Local progress stays on this device.", "success");
  }
};

window.CloudAuth = api;
initFirebase();
