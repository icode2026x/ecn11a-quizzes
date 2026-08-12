/* ============================================================
   Persistence layer. LocalStorage for offline use; when signed
   in with Google, changes also sync to Firestore.
   ============================================================ */

const STORAGE_KEY = "ecn11a_quiz_state_v1";
const SESSION_KEY_PREFIX = "ecn11a_quiz_session_";

function uid(prefix) {
  return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    raw = null;
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.updatedAt) parsed.updatedAt = Date.now();
      return parsed;
    } catch (e) {
      /* fall through to reseed */
    }
  }
  const fresh = {
    modules: deepClone(DEFAULT_MODULES),
    attempts: {},
    updatedAt: Date.now()
  };
  saveStateLocal(fresh);
  return fresh;
}

function saveStateLocal(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bumpAndSave(state) {
  state.updatedAt = Date.now();
  saveStateLocal(state);
  if (window.CloudAuth && typeof CloudAuth.scheduleCloudPush === "function") {
    CloudAuth.scheduleCloudPush();
  }
}

const Store = {
  state: loadState(),

  persist() {
    bumpAndSave(this.state);
  },

  replaceState(next) {
    this.state = next;
    bumpAndSave(this.state);
  },

  getModules() {
    return this.state.modules;
  },

  getModule(moduleId) {
    return this.state.modules.find((m) => m.id === moduleId) || null;
  },

  getQuiz(moduleId, quizId) {
    const mod = this.getModule(moduleId);
    if (!mod) return null;
    return mod.quizzes.find((q) => q.id === quizId) || null;
  },

  findQuizAnywhere(quizId) {
    for (const mod of this.state.modules) {
      const quiz = mod.quizzes.find((q) => q.id === quizId);
      if (quiz) return { module: mod, quiz };
    }
    return null;
  },

  addModule({ name, description }) {
    const mod = {
      id: uid("module"),
      name: name || "Untitled Module",
      description: description || "",
      quizzes: [],
      custom: true
    };
    this.state.modules.push(mod);
    this.persist();
    return mod;
  },

  updateModule(moduleId, { name, description }) {
    const mod = this.getModule(moduleId);
    if (!mod) return;
    if (name !== undefined) mod.name = name;
    if (description !== undefined) mod.description = description;
    this.persist();
  },

  deleteModule(moduleId) {
    this.state.modules = this.state.modules.filter((m) => m.id !== moduleId);
    delete this.state.attempts[moduleId];
    this.persist();
  },

  addQuiz(moduleId, { title, type, source, questions }) {
    const mod = this.getModule(moduleId);
    if (!mod) return null;
    const quiz = {
      id: uid("quiz"),
      title: title || "Untitled Quiz",
      type: type || "Other",
      source: source || "",
      questions: questions || [],
      custom: true
    };
    mod.quizzes.push(quiz);
    this.persist();
    return quiz;
  },

  updateQuiz(moduleId, quizId, patch) {
    const quiz = this.getQuiz(moduleId, quizId);
    if (!quiz) return;
    Object.assign(quiz, patch);
    this.persist();
  },

  deleteQuiz(moduleId, quizId) {
    const mod = this.getModule(moduleId);
    if (!mod) return;
    mod.quizzes = mod.quizzes.filter((q) => q.id !== quizId);
    delete this.state.attempts[quizId];
    this.persist();
  },

  addQuestion(moduleId, quizId, question) {
    const quiz = this.getQuiz(moduleId, quizId);
    if (!quiz) return;
    quiz.questions.push({
      id: uid("q"),
      question: question.question,
      options: question.options,
      correct: question.correct,
      explanation: question.explanation || ""
    });
    this.persist();
  },

  updateQuestion(moduleId, quizId, questionId, patch) {
    const quiz = this.getQuiz(moduleId, quizId);
    if (!quiz) return;
    const q = quiz.questions.find((x) => x.id === questionId);
    if (!q) return;
    Object.assign(q, patch);
    this.persist();
  },

  deleteQuestion(moduleId, quizId, questionId) {
    const quiz = this.getQuiz(moduleId, quizId);
    if (!quiz) return;
    quiz.questions = quiz.questions.filter((q) => q.id !== questionId);
    this.persist();
  },

  recordAttempt(quizId, result) {
    if (!this.state.attempts[quizId]) {
      this.state.attempts[quizId] = { history: [], best: null };
    }
    const entry = this.state.attempts[quizId];
    entry.history.unshift(result);
    if (!entry.best || result.percent > entry.best.percent) {
      entry.best = result;
    }
    this.persist();
  },

  getAttempts(quizId) {
    return this.state.attempts[quizId] || { history: [], best: null };
  },

  resetAll() {
    this.state = {
      modules: deepClone(DEFAULT_MODULES),
      attempts: {},
      updatedAt: Date.now()
    };
    this.persist();
  },

  exportData() {
    return JSON.stringify(this.state, null, 2);
  },

  importData(json) {
    const parsed = JSON.parse(json);
    if (!parsed.modules) throw new Error("Invalid data file");
    this.state = {
      modules: parsed.modules,
      attempts: parsed.attempts || {},
      updatedAt: Date.now()
    };
    this.persist();
  },

  /* Sessions live in localStorage so an in-progress quiz survives
     closing the browser until submit. When signed in, they also sync. */
  saveSession(quizId, session) {
    localStorage.setItem(SESSION_KEY_PREFIX + quizId, JSON.stringify(session));
    if (window.CloudAuth && typeof CloudAuth.scheduleCloudPush === "function") {
      CloudAuth.scheduleCloudPush();
    }
  },

  loadSession(quizId) {
    const key = SESSION_KEY_PREFIX + quizId;
    let raw = localStorage.getItem(key);
    if (!raw) {
      try {
        const legacy = sessionStorage.getItem(key);
        if (legacy) {
          localStorage.setItem(key, legacy);
          sessionStorage.removeItem(key);
          raw = legacy;
        }
      } catch (e) { /* ignore */ }
    }
    return raw ? JSON.parse(raw) : null;
  },

  clearSession(quizId) {
    localStorage.removeItem(SESSION_KEY_PREFIX + quizId);
    try { sessionStorage.removeItem(SESSION_KEY_PREFIX + quizId); } catch (e) { /* ignore */ }
    if (window.CloudAuth && typeof CloudAuth.scheduleCloudPush === "function") {
      CloudAuth.scheduleCloudPush();
    }
  },

  getAllSessionQuizIds() {
    const ids = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(SESSION_KEY_PREFIX) === 0) {
        ids.push(key.slice(SESSION_KEY_PREFIX.length));
      }
    }
    return ids;
  }
};

/* Used by auth.js merge path (keeps localStorage write without double-bump loops). */
window.saveState = saveStateLocal;
window.Store = Store;
