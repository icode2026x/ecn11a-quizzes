/* ============================================================
   ECN 11A Quiz Hub — application logic (routing, rendering,
   quiz-taking engine, and content management).
   ============================================================ */

const mainContent = document.getElementById("mainContent");
const moduleNavEl = document.getElementById("moduleNav");
const modalRoot = document.getElementById("modalRoot");
const toastRoot = document.getElementById("toastRoot");

/* ---------------------------- helpers ---------------------------- */

function esc(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (s) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]
  ));
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function scoreColor(pct) {
  if (pct >= 90) return "success";
  if (pct >= 75) return "primary";
  if (pct >= 60) return "warning";
  return "danger";
}

function quizStats(quiz) {
  const attempts = Store.getAttempts(quiz.id);
  return {
    total: quiz.questions.length,
    attemptCount: attempts.history.length,
    best: attempts.best
  };
}

function moduleStats(mod) {
  const quizCount = mod.quizzes.length;
  const questionCount = mod.quizzes.reduce((sum, q) => sum + q.questions.length, 0);
  const bestScores = mod.quizzes
    .map((q) => Store.getAttempts(q.id).best)
    .filter(Boolean)
    .map((b) => b.percent);
  const avg = bestScores.length ? Math.round(bestScores.reduce((a, b) => a + b, 0) / bestScores.length) : null;
  const attempted = mod.quizzes.filter((q) => Store.getAttempts(q.id).history.length > 0).length;
  return { quizCount, questionCount, avg, attempted };
}

function showToast(message, type) {
  const t = document.createElement("div");
  t.className = "toast" + (type ? " " + type : "");
  t.textContent = message;
  toastRoot.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transition = "opacity .25s ease";
    setTimeout(() => t.remove(), 260);
  }, 2600);
}
window.showToast = showToast;

function renderOptionList(q, selected, config) {
  config = config || {};
  const reveal = !!config.reveal;
  const disabled = !!config.disabled;
  return q.options.map((optText, idx) => {
    let cls = "option-item";
    if (selected === idx) cls += " selected";
    if (reveal) {
      if (idx === q.correct) cls += " correct";
      else if (idx === selected) cls += " incorrect";
    }
    if (disabled) cls += " disabled";
    const letter = String.fromCharCode(65 + idx);
    const clickAttr = (!disabled && config.onClick) ? ` onclick="${config.onClick(idx)}"` : "";
    return `<div class="${cls}"${clickAttr}><span class="option-letter">${letter}</span><span>${esc(optText)}</span></div>`;
  }).join("");
}

function scoringMessage(quiz, score, percent) {
  if (quiz.scoringGuide && quiz.scoringGuide.length) {
    const bracket = quiz.scoringGuide.find((b) => score >= b.min && score <= b.max);
    if (bracket) return bracket.label;
  }
  if (percent >= 90) return "Excellent! You have a strong command of this material.";
  if (percent >= 75) return "Good work — review the questions you missed to sharpen your understanding.";
  if (percent >= 60) return "Fair grasp of the material — revisit the concepts behind the questions you missed.";
  return "Keep studying — revisit the source material and try again.";
}

/* ---------------------------- router ---------------------------- */

function parseHash() {
  const hash = location.hash.replace(/^#/, "") || "/";
  return hash.split("/").filter(Boolean);
}

window.addEventListener("hashchange", render);
document.addEventListener("DOMContentLoaded", render);
window.render = render;
window.navigate = navigate;

function navigate(hash) {
  location.hash = hash;
}

/* ---------------------------- auth UI ---------------------------- */

function renderAuthUI() {
  const slot = document.getElementById("authSlot");
  if (!slot) return;
  const configured = window.CloudAuth && CloudAuth.isConfigured();
  const user = window.CloudAuth && CloudAuth.getUser();

  if (!configured) {
    slot.innerHTML = `<button class="btn-google" onclick="navigate('#/settings')" title="Set up cloud sync in Settings">☁ Cloud</button>`;
    return;
  }
  if (!user) {
    slot.innerHTML = `<button class="btn-google" onclick="CloudAuth.signInWithGoogle()" title="Sign in with Google to sync progress">
      <span class="g-icon">G</span> Sign in
    </button>`;
    return;
  }
  const photo = user.photoURL
    ? `<img class="auth-avatar" src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="auth-avatar auth-avatar-fallback">${esc((user.displayName || user.email || "?").slice(0, 1).toUpperCase())}</span>`;
  slot.innerHTML = `
    <div class="auth-user" title="${esc(user.email || "")}">
      ${photo}
      <span class="auth-name">${esc(user.displayName || user.email || "Signed in")}</span>
      <button class="btn-google btn-google-ghost" onclick="CloudAuth.signOutUser()">Sign out</button>
    </div>`;
}
window.renderAuthUI = renderAuthUI;

/* ---------------------------- sidebar ---------------------------- */

function renderSidebar() {
  const parts = parseHash();
  const activeModuleId = (parts[0] === "module" || parts[0] === "quiz") ? parts[1] : null;
  const activeQuizId = parts[0] === "quiz" ? parts[2] : null;

  moduleNavEl.innerHTML = Store.getModules().map((mod) => {
    const isActiveModule = mod.id === activeModuleId;
    const quizzesHtml = isActiveModule ? `<div class="module-nav-quizzes">${
      mod.quizzes.map((q) => {
        const done = Store.getAttempts(q.id).history.length > 0;
        const isActiveQuiz = q.id === activeQuizId;
        return `<button class="quiz-nav-link${isActiveQuiz ? " active" : ""}${done ? " done" : ""}" onclick="navigate('#/quiz/${mod.id}/${q.id}')" title="${esc(q.title)}">
          <span class="quiz-nav-dot"></span><span>${esc(q.title)}</span>
        </button>`;
      }).join("") || `<button class="quiz-nav-link" onclick="navigate('#/module/${mod.id}')" style="font-style:italic;">No quizzes yet</button>`
    }</div>` : "";
    return `<div class="module-nav-item">
      <button class="module-nav-link${isActiveModule ? " active" : ""}" onclick="navigate('#/module/${mod.id}')">
        <span>${esc(mod.name)}</span>
        <span class="module-nav-count">${mod.quizzes.length}</span>
      </button>
      ${quizzesHtml}
    </div>`;
  }).join("");

  document.getElementById("navDashboard").classList.toggle("active", parts.length === 0);
  document.getElementById("navSettings").classList.toggle("active", parts[0] === "settings");
}

function closeSidebarMobile() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarScrim").classList.remove("open");
}

document.getElementById("sidebarToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarScrim").classList.toggle("open");
});
document.getElementById("sidebarScrim").addEventListener("click", closeSidebarMobile);
document.getElementById("navDashboard").addEventListener("click", () => navigate("#/"));
document.getElementById("navSettings").addEventListener("click", () => navigate("#/settings"));
document.getElementById("addModuleBtn").addEventListener("click", () => App.openAddModuleModal());

/* ---------------------------- theme (dark mode) ---------------------------- */

const THEME_KEY = "ecn11a_theme";

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = next === "dark" ? "☀️" : "🌙";
    btn.title = next === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", btn.title);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? "#1e1b4b" : "#4338ca");
}

function toggleTheme() {
  applyTheme(getTheme() === "dark" ? "light" : "dark");
}

document.getElementById("themeToggle").addEventListener("click", toggleTheme);
applyTheme(getTheme());
window.toggleTheme = toggleTheme;
window.getTheme = getTheme;
window.applyTheme = applyTheme;

/* ---------------------------- main render dispatch ---------------------------- */

let _prevRoute = "";

function render() {
  closeSidebarMobile();
  const parts = parseHash();
  renderSidebar();

  const currentRoute = parts.join("/");
  const isTake = parts[0] === "quiz" && parts[3] === "take";
  const wasTake = _prevRoute.endsWith("/take");

  if (parts.length === 0) {
    mainContent.innerHTML = renderDashboard();
  } else if (parts[0] === "module" && parts[1]) {
    mainContent.innerHTML = renderModulePage(parts[1]);
  } else if (isTake) {
    mainContent.innerHTML = renderTakePage(parts[1], parts[2]);
    bindTakeKeyboard();
  } else if (parts[0] === "quiz" && parts[1] && parts[2] && parts[3] === "manage") {
    mainContent.innerHTML = renderManagePage(parts[1], parts[2]);
  } else if (parts[0] === "quiz" && parts[1] && parts[2] && parts[3] === "results") {
    mainContent.innerHTML = renderResultsPage(parts[1], parts[2]);
  } else if (parts[0] === "quiz" && parts[1] && parts[2]) {
    mainContent.innerHTML = renderQuizOverview(parts[1], parts[2]);
  } else if (parts[0] === "settings") {
    mainContent.innerHTML = renderSettingsPage();
  } else {
    mainContent.innerHTML = renderDashboard();
  }

  const routeBase = parts.slice(0, 4).join("/");
  const prevBase = _prevRoute.split("/").slice(0, 4).join("/");
  if (!(isTake && wasTake && routeBase === prevBase)) {
    window.scrollTo(0, 0);
  }
  _prevRoute = currentRoute;

  if (parts[0] === "quiz" && parts[3] === "take") {
    const session = Store.loadSession(parts[2]);
    if (session) {
      App.currentQuizStart = session.startTime;
      startTimerLoop();
      startSessionAutosave(parts[2]);
    } else {
      stopSessionAutosave();
    }
  } else {
    App.currentQuizStart = null;
    clearInterval(timerInterval);
    stopSessionAutosave();
  }
}

/* ---------------------------- dashboard ---------------------------- */

function renderDashboard() {
  const modules = Store.getModules();
  const totalQuizzes = modules.reduce((s, m) => s + m.quizzes.length, 0);
  const totalQuestions = modules.reduce((s, m) => s + m.quizzes.reduce((a, q) => a + q.questions.length, 0), 0);
  const allBest = modules.flatMap((m) => m.quizzes.map((q) => Store.getAttempts(q.id).best)).filter(Boolean);
  const overallAvg = allBest.length ? Math.round(allBest.reduce((a, b) => a + b.percent, 0) / allBest.length) : null;

  const cards = modules.map((mod) => {
    const stats = moduleStats(mod);
    return `<div class="card module-card" onclick="navigate('#/module/${mod.id}')">
      <div class="module-card-top">
        <div class="module-card-icon">${esc(mod.name.replace(/[^0-9]/g, "") || mod.name.slice(0,1))}</div>
        ${stats.avg !== null ? `<span class="badge badge-${scoreColor(stats.avg)}">${stats.avg}% avg</span>` : `<span class="badge">Not started</span>`}
      </div>
      <h3>${esc(mod.name)}</h3>
      <p>${esc(mod.description) || "No description yet — click to add readings, lectures, and quizzes."}</p>
      <div class="module-card-stats">
        <span><b>${stats.quizCount}</b> quiz${stats.quizCount === 1 ? "" : "zes"}</span>
        <span><b>${stats.questionCount}</b> questions</span>
        <span><b>${stats.attempted}</b>/${stats.quizCount} attempted</span>
      </div>
    </div>`;
  }).join("");

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back 👋</h1>
        <p class="page-subtitle">Track readings and lecture quizzes across all six modules, and keep your scores in one place.</p>
      </div>
      <button class="btn btn-primary" onclick="App.openAddModuleModal()">+ Add Module</button>
    </div>

    <div class="grid grid-cols-3" style="margin-bottom:26px;">
      <div class="card card-pad">
        <div class="page-subtitle" style="margin-bottom:6px;">Modules</div>
        <div style="font-size:28px;font-weight:800;">${modules.length}</div>
      </div>
      <div class="card card-pad">
        <div class="page-subtitle" style="margin-bottom:6px;">Quizzes &amp; Questions</div>
        <div style="font-size:28px;font-weight:800;">${totalQuizzes} <span style="font-size:14px;color:var(--text-muted);font-weight:600;">/ ${totalQuestions} questions</span></div>
      </div>
      <div class="card card-pad">
        <div class="page-subtitle" style="margin-bottom:6px;">Overall Average Score</div>
        <div style="font-size:28px;font-weight:800;">${overallAvg !== null ? overallAvg + "%" : "—"}</div>
      </div>
    </div>

    <h2 style="font-size:16px;margin:0 0 14px;">Your Modules</h2>
    <div class="grid grid-cols-3">${cards}</div>
  `;
}

/* ---------------------------- module page ---------------------------- */

function renderModulePage(moduleId) {
  const mod = Store.getModule(moduleId);
  if (!mod) return renderNotFound("Module not found.");

  const rows = mod.quizzes.map((quiz) => {
    const stats = quizStats(quiz);
    return `<div class="quiz-row">
      <div class="quiz-row-main">
        <h4 onclick="navigate('#/quiz/${mod.id}/${quiz.id}')">${esc(quiz.title)}</h4>
        <div class="quiz-row-meta">
          <span class="badge badge-primary">${esc(quiz.type)}</span>
          <span>${stats.total} question${stats.total === 1 ? "" : "s"}</span>
          <span>${stats.attemptCount} attempt${stats.attemptCount === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div class="quiz-row-score">
        ${stats.best ? `<div class="pct" style="color:var(--${scoreColor(stats.best.percent)});">${stats.best.percent}%</div><div class="lbl">best score</div>` : `<div class="lbl">Not attempted</div>`}
      </div>
      <div class="quiz-row-actions">
        <button class="btn btn-secondary btn-sm" onclick="navigate('#/quiz/${mod.id}/${quiz.id}/manage')">Manage</button>
        <button class="btn btn-ghost btn-sm" onclick="App.openEditQuizModal('${mod.id}','${quiz.id}')" title="Edit quiz">✎</button>
        <button class="btn btn-ghost btn-sm" onclick="App.confirmDeleteQuiz('${mod.id}','${quiz.id}')" title="Delete quiz">🗑</button>
      </div>
    </div>`;
  }).join("");

  return `
    <div class="breadcrumb"><a href="#/">Dashboard</a> <span>/</span> <span>${esc(mod.name)}</span></div>
    <div class="page-header">
      <div>
        <h1 class="page-title">${esc(mod.name)}</h1>
        <p class="page-subtitle">${esc(mod.description) || "Add a description covering this module's readings and lectures."}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="App.openEditModuleModal('${mod.id}')">Edit Module</button>
        <button class="btn btn-danger" onclick="App.confirmDeleteModule('${mod.id}')">Delete</button>
        <button class="btn btn-primary" onclick="App.openAddQuizModal('${mod.id}')">+ Add Quiz</button>
      </div>
    </div>

    ${mod.quizzes.length ? rows : `
      <div class="empty-state card">
        <span class="emoji">📝</span>
        <h3>No quizzes yet</h3>
        <p>Add a quiz for a reading or lecture in this module to get started.</p>
        <div style="margin-top:16px;"><button class="btn btn-primary" onclick="App.openAddQuizModal('${mod.id}')">+ Add Quiz</button></div>
      </div>
    `}
  `;
}

function renderNotFound(msg) {
  return `<div class="empty-state card"><span class="emoji">🔍</span><h3>${esc(msg)}</h3><div style="margin-top:16px;"><button class="btn btn-primary" onclick="navigate('#/')">Back to Dashboard</button></div></div>`;
}

/* ---------------------------- quiz overview ---------------------------- */

let selectedMode = {}; // quizId -> 'practice' | 'exam'
window.selectedMode = selectedMode;

function renderQuizOverview(moduleId, quizId) {
  const mod = Store.getModule(moduleId);
  const quiz = mod ? Store.getQuiz(moduleId, quizId) : null;
  if (!mod || !quiz) return renderNotFound("Quiz not found.");

  const stats = quizStats(quiz);
  const session = Store.loadSession(quizId);
  const mode = selectedMode[quizId] || "practice";
  const sessionAnswered = session ? Object.keys(session.answers).length : 0;

  const historyHtml = stats.attemptCount
    ? `<div class="history-list">${Store.getAttempts(quizId).history.slice(0, 8).map((h, i) => `
        <div class="history-row">
          <span>${formatDate(h.date)} · <span class="badge">${h.mode === "exam" ? "Exam" : "Practice"}</span></span>
          <span class="pct" style="color:var(--${scoreColor(h.percent)});">${h.score}/${h.total} (${h.percent}%)</span>
          <button class="btn btn-ghost btn-sm" onclick="App.viewHistoryResult('${quizId}', ${i})">Review</button>
        </div>`).join("")}</div>`
    : `<p class="page-subtitle">No attempts yet. Take the quiz to see your history here.</p>`;

  return `
    <div class="breadcrumb"><a href="#/">Dashboard</a> <span>/</span> <a href="#/module/${mod.id}">${esc(mod.name)}</a> <span>/</span> <span>${esc(quiz.title)}</span></div>

    <div class="quiz-hero">
      <span class="badge">${esc(quiz.type)}${quiz.source && quiz.source !== quiz.type ? " · " + esc(quiz.source) : ""}</span>
      <h1>${esc(quiz.title)}</h1>
      <div class="quiz-hero-meta">
        <div class="stat"><b>${stats.total}</b><span>Questions</span></div>
        <div class="stat"><b>${stats.best ? stats.best.percent + "%" : "—"}</b><span>Best Score</span></div>
        <div class="stat"><b>${stats.attemptCount}</b><span>Attempts</span></div>
      </div>
      ${session ? `<p style="margin:14px 0 0;font-size:13.5px;opacity:.92;">In-progress session saved · ${sessionAnswered}/${stats.total} answered · currently on Q${session.current + 1}. Progress is kept until you submit.</p>` : ""}
      <div class="quiz-hero-actions">
        ${session ? `<button class="btn btn-primary" onclick="App.resumeQuiz('${mod.id}','${quiz.id}')">▶ Resume Quiz (Q${session.current + 1})</button>` : ""}
        <button class="btn ${session ? "btn-secondary" : "btn-primary"}" onclick="App.startQuiz('${mod.id}','${quiz.id}', window.selectedMode['${quiz.id}'] || 'practice')" ${stats.total === 0 ? "disabled" : ""}>${session ? "↺ Start Over" : "▶ Start Quiz"}</button>
        <button class="btn btn-secondary" onclick="navigate('#/quiz/${mod.id}/${quiz.id}/manage')">Manage Questions</button>
      </div>
    </div>

    ${stats.total === 0 ? `<div class="empty-state card"><span class="emoji">➕</span><h3>Add questions to begin</h3><p>This quiz has no questions yet.</p><div style="margin-top:16px;"><button class="btn btn-primary" onclick="navigate('#/quiz/${mod.id}/${quiz.id}/manage')">Manage Questions</button></div></div>` : `
    <h2 style="font-size:15px;margin:0 0 12px;">Choose a mode</h2>
    <div class="mode-choice">
      <div class="mode-card ${mode === "practice" ? "selected" : ""}" onclick="App.setMode('${quiz.id}','practice')">
        <h4>🎯 Practice Mode</h4>
        <p>See whether each answer is correct immediately, with the explanation, as you go.</p>
      </div>
      <div class="mode-card ${mode === "exam" ? "selected" : ""}" onclick="App.setMode('${quiz.id}','exam')">
        <h4>⏱ Exam Mode</h4>
        <p>Answer all questions first, then see your full score and review at the end.</p>
      </div>
    </div>
    `}

    <h2 style="font-size:15px;margin:26px 0 12px;">Attempt History</h2>
    <div class="card card-pad">${historyHtml}</div>
  `;
}

/* ---------------------------- quiz taking ---------------------------- */

function renderTakePage(moduleId, quizId) {
  const mod = Store.getModule(moduleId);
  const quiz = mod ? Store.getQuiz(moduleId, quizId) : null;
  if (!mod || !quiz) return renderNotFound("Quiz not found.");

  let session = Store.loadSession(quizId);
  if (!session) {
    return `<div class="empty-state card"><span class="emoji">⏸</span><h3>No active session</h3><p>Start the quiz from its overview page.</p><div style="margin-top:16px;"><button class="btn btn-primary" onclick="navigate('#/quiz/${mod.id}/${quiz.id}')">Go to Quiz</button></div></div>`;
  }

  const total = quiz.questions.length;
  const idx = Math.min(session.current, total - 1);
  const q = quiz.questions[idx];
  const selected = session.answers[q.id];
  const isPractice = session.mode === "practice";
  const revealed = isPractice && session.revealed[q.id];
  const answeredCount = Object.keys(session.answers).length;

  const qmap = quiz.questions.map((qq, i) => {
    let cls = "qmap-btn";
    if (i === idx) cls += " current";
    const ans = session.answers[qq.id];
    if (ans !== undefined) {
      cls += " answered";
      if (isPractice && session.revealed[qq.id]) {
        cls += ans === qq.correct ? " correct" : " incorrect";
      }
    }
    return `<button class="${cls}" onclick="App.goToQuestion(${i})">${i + 1}</button>`;
  }).join("");

  const optionsHtml = renderOptionList(q, selected, {
    reveal: revealed,
    disabled: revealed,
    onClick: (i) => `App.selectAnswer(${i})`
  });

  let feedback = "";
  if (revealed) {
    const isCorrect = selected === q.correct;
    feedback = `<div class="feedback-box ${isCorrect ? "correct" : "incorrect"}">
      <b>${isCorrect ? "✓ Correct!" : "✗ Not quite."}</b>
      ${q.explanation ? esc(q.explanation) : (isCorrect ? "" : "The correct answer is highlighted above.")}
    </div>`;
  }

  const isLast = idx === total - 1;

  return `
  <div class="breadcrumb"><a href="#/">Dashboard</a> <span>/</span> <a href="#/module/${mod.id}">${esc(mod.name)}</a> <span>/</span> <a href="#/quiz/${mod.id}/${quiz.id}">${esc(quiz.title)}</a> <span>/</span> <span>Taking Quiz</span></div>

  <div class="take-topbar">
    <div>
      <strong>${esc(quiz.title)}</strong>
      <span class="badge" style="margin-left:8px;">${isPractice ? "Practice Mode" : "Exam Mode"}</span>
    </div>
    <div style="display:flex;align-items:center;gap:16px;">
      <span class="timer" id="quizTimer">⏱ 0:00</span>
      <button class="btn btn-ghost btn-sm" onclick="App.exitQuiz('${mod.id}','${quiz.id}')">Save &amp; Exit</button>
    </div>
  </div>

  <div class="progress-bar-track" style="margin-bottom:18px;">
    <div class="progress-bar-fill" style="width:${((idx + 1) / total * 100).toFixed(1)}%;"></div>
  </div>

  <div class="take-layout">
    <div class="take-main">
      <div class="card question-card">
        <div class="question-index">Question ${idx + 1} of ${total}</div>
        <p class="question-text">${esc(q.question)}</p>
        <div class="option-list">${optionsHtml}</div>
        ${feedback}
      </div>

      <div class="take-nav">
        <button class="btn btn-secondary" onclick="App.prevQuestion()" ${idx === 0 ? "disabled" : ""}>← Previous</button>
        <div class="take-nav-center">
          <span class="page-subtitle">${answeredCount}/${total} answered</span>
        </div>
        ${isLast
          ? `<button class="btn btn-primary" onclick="App.submitQuiz('${mod.id}','${quiz.id}')">Submit Quiz ✓</button>`
          : `<button class="btn btn-primary" onclick="App.nextQuestion()">Next →</button>`}
      </div>
      ${!isLast ? `<div style="text-align:right;margin-top:10px;"><button class="btn btn-ghost btn-sm" onclick="App.submitQuiz('${mod.id}','${quiz.id}')">Submit early</button></div>` : ""}
    </div>

    <div class="side-panel card card-pad">
      <div class="qmap-title">Question Map</div>
      <div class="qmap-grid">${qmap}</div>
      <div class="qmap-legend">
        <span><i style="background:var(--primary-light);border:1px solid #c7d2fe;"></i> Answered</span>
        ${isPractice ? `<span><i style="background:var(--success-light);border:1px solid #86efac;"></i> Correct</span><span><i style="background:var(--danger-light);border:1px solid #fca5a5;"></i> Incorrect</span>` : ""}
        <span><i style="background:#fff;border:1px solid var(--border);"></i> Unanswered</span>
      </div>
    </div>
  </div>
  `;
}

function bindTakeKeyboard() {
  document.onkeydown = (e) => {
    const parts = parseHash();
    if (!(parts[0] === "quiz" && parts[3] === "take")) { document.onkeydown = null; return; }
    if (["1", "2", "3", "4", "a", "b", "c", "d", "A", "B", "C", "D"].includes(e.key)) {
      const map = { "1": 0, "2": 1, "3": 2, "4": 3 };
      let i = map[e.key];
      if (i === undefined) i = e.key.toUpperCase().charCodeAt(0) - 65;
      if (i >= 0 && i <= 3) App.selectAnswer(i);
    } else if (e.key === "ArrowRight") { App.nextQuestion(); }
    else if (e.key === "ArrowLeft") { App.prevQuestion(); }
  };
}

let timerInterval = null;
let sessionAutosaveInterval = null;
function startTimerLoop() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const el = document.getElementById("quizTimer");
    if (!el || !App.currentQuizStart) { clearInterval(timerInterval); return; }
    el.textContent = "⏱ " + formatDuration(Date.now() - App.currentQuizStart);
  }, 1000);
}

function startSessionAutosave(quizId) {
  if (!quizId) return;
  clearInterval(sessionAutosaveInterval);
  sessionAutosaveInterval = setInterval(() => {
    try {
      const s = Store.loadSession(quizId);
      if (s) Store.saveSession(quizId, s);
    } catch (e) {
      /* ignore */
    }
  }, 2000);
}

function stopSessionAutosave() {
  clearInterval(sessionAutosaveInterval);
  sessionAutosaveInterval = null;
}

// iOS (Safari) can suspend JS shortly after leaving a page.
// `pagehide` is the most reliable signal to persist in-progress quiz state.
window.addEventListener("pagehide", () => {
  try {
    const parts = parseHash();
    if (parts[0] === "quiz" && parts[3] === "take") {
      const quizId = parts[2];
      const s = Store.loadSession(quizId);
      if (s) Store.saveSession(quizId, s);
    }
  } catch (e) { /* ignore */ }
});

/* ---------------------------- results ---------------------------- */

function renderResultsPage(moduleId, quizId) {
  const mod = Store.getModule(moduleId);
  const quiz = mod ? Store.getQuiz(moduleId, quizId) : null;
  if (!mod || !quiz) return renderNotFound("Quiz not found.");

  const result = App.lastResult && App.lastResult.__quizId === quizId ? App.lastResult : Store.getAttempts(quizId).history[0];
  if (!result) return renderNotFound("No results to show yet — take the quiz first.");

  const filter = App.reviewFilter || "all";
  const items = result.details.filter((d) => {
    if (filter === "correct") return d.isCorrect;
    if (filter === "incorrect") return d.answered && !d.isCorrect;
    if (filter === "unanswered") return !d.answered;
    return true;
  });

  const counts = {
    correct: result.details.filter((d) => d.isCorrect).length,
    incorrect: result.details.filter((d) => d.answered && !d.isCorrect).length,
    unanswered: result.details.filter((d) => !d.answered).length
  };

  const reviewHtml = items.map((d, i) => {
    const optionsHtml = renderOptionList({ options: d.options, correct: d.correct }, d.selected, { reveal: true, disabled: true });
    return `<div class="card review-item">
      <div class="review-item-head">
        <span class="badge ${d.answered ? (d.isCorrect ? "badge-success" : "badge-danger") : "badge-warning"}">${d.answered ? (d.isCorrect ? "Correct" : "Incorrect") : "Unanswered"}</span>
      </div>
      <p class="question-text">${result.details.indexOf(d) + 1}. ${esc(d.question)}</p>
      <div class="option-list">${optionsHtml}</div>
      ${d.explanation ? `<div class="feedback-box ${d.isCorrect ? "correct" : "incorrect"}" style="margin-top:14px;"><b>Explanation</b>${esc(d.explanation)}</div>` : ""}
    </div>`;
  }).join("");

  return `
  <div class="breadcrumb"><a href="#/">Dashboard</a> <span>/</span> <a href="#/module/${mod.id}">${esc(mod.name)}</a> <span>/</span> <a href="#/quiz/${mod.id}/${quiz.id}">${esc(quiz.title)}</a> <span>/</span> <span>Results</span></div>

  <div class="card results-hero">
    <div class="score-ring" style="--pct:${result.percent};"><div class="score-value">${result.percent}%<small>${result.score} / ${result.total}</small></div></div>
    <h2 style="margin:0 0 8px;">${esc(quiz.title)}</h2>
    <p class="results-message">${esc(scoringMessage(quiz, result.score, result.percent))}</p>
    <div style="display:flex;justify-content:center;gap:22px;margin-top:18px;flex-wrap:wrap;font-size:13px;color:var(--text-muted);">
      <span>✓ ${counts.correct} correct</span>
      <span>✗ ${counts.incorrect} incorrect</span>
      <span>– ${counts.unanswered} unanswered</span>
      <span>⏱ ${formatDuration(result.durationMs)}</span>
      <span>${result.mode === "exam" ? "Exam Mode" : "Practice Mode"}</span>
    </div>
    <div class="results-actions">
      <button class="btn btn-primary" onclick="navigate('#/quiz/${mod.id}/${quiz.id}')">Take Again</button>
      <button class="btn btn-secondary" onclick="navigate('#/module/${mod.id}')">Back to Module</button>
    </div>
  </div>

  <div class="review-filters">
    <button class="${filter === "all" ? "active" : ""}" onclick="App.setReviewFilter('all')">All (${result.details.length})</button>
    <button class="${filter === "correct" ? "active" : ""}" onclick="App.setReviewFilter('correct')">Correct (${counts.correct})</button>
    <button class="${filter === "incorrect" ? "active" : ""}" onclick="App.setReviewFilter('incorrect')">Incorrect (${counts.incorrect})</button>
    <button class="${filter === "unanswered" ? "active" : ""}" onclick="App.setReviewFilter('unanswered')">Unanswered (${counts.unanswered})</button>
  </div>

  ${reviewHtml || `<div class="empty-state card"><span class="emoji">🎉</span><h3>Nothing here!</h3></div>`}
  `;
}

/* ---------------------------- manage questions ---------------------------- */

function renderManagePage(moduleId, quizId) {
  const mod = Store.getModule(moduleId);
  const quiz = mod ? Store.getQuiz(moduleId, quizId) : null;
  if (!mod || !quiz) return renderNotFound("Quiz not found.");

  const rows = quiz.questions.map((q, i) => `
    <div class="manage-question-row">
      <div style="min-width:0;">
        <div class="q-num">Question ${i + 1}</div>
        <p class="q-text">${esc(q.question)}</p>
        <div class="q-opts">${q.options.map((o, oi) => `<div class="${oi === q.correct ? "correct-opt" : ""}">${String.fromCharCode(65 + oi)}. ${esc(o)}${oi === q.correct ? " ✓" : ""}</div>`).join("")}</div>
      </div>
      <div class="manage-question-row-actions">
        <button class="btn btn-ghost btn-sm" onclick="App.openEditQuestionModal('${mod.id}','${quiz.id}','${q.id}')">✎</button>
        <button class="btn btn-ghost btn-sm" onclick="App.confirmDeleteQuestion('${mod.id}','${quiz.id}','${q.id}')">🗑</button>
      </div>
    </div>`).join("");

  return `
  <div class="breadcrumb"><a href="#/">Dashboard</a> <span>/</span> <a href="#/module/${mod.id}">${esc(mod.name)}</a> <span>/</span> <a href="#/quiz/${mod.id}/${quiz.id}">${esc(quiz.title)}</a> <span>/</span> <span>Manage Questions</span></div>

  <div class="page-header">
    <div>
      <h1 class="page-title">Manage Questions</h1>
      <p class="page-subtitle">${esc(quiz.title)} · ${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"}</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="App.openBulkImportModal('${mod.id}','${quiz.id}')">📋 Bulk Import</button>
      <button class="btn btn-primary" onclick="App.openAddQuestionModal('${mod.id}','${quiz.id}')">+ Add Question</button>
    </div>
  </div>

  ${quiz.questions.length ? rows : `<div class="empty-state card"><span class="emoji">📄</span><h3>No questions yet</h3><p>Add questions one at a time, or paste a formatted set with Bulk Import.</p></div>`}
  `;
}

/* ---------------------------- settings ---------------------------- */

function renderCloudSettingsSection() {
  const configured = window.CloudAuth && CloudAuth.isConfigured();
  const user = window.CloudAuth && CloudAuth.getUser();
  if (!configured) {
    return `<div class="settings-section card card-pad">
      <h3>☁ Cloud Sync (Google Sign-In)</h3>
      <p>Cloud login is not configured yet. Create a free Firebase project and paste your web app keys into <code>js/firebase-config.js</code>, then redeploy. See <code>DEPLOY.md</code> for step-by-step instructions.</p>
      <p style="margin-top:8px;">Until then, progress is saved only on this device.</p>
    </div>`;
  }
  if (!user) {
    return `<div class="settings-section card card-pad">
      <h3>☁ Cloud Sync</h3>
      <p>Sign in with Google to sync modules, quiz scores, and in-progress sessions across your phone and computer.</p>
      <button class="btn btn-primary" onclick="CloudAuth.signInWithGoogle()">Sign in with Google</button>
    </div>`;
  }
  return `<div class="settings-section card card-pad">
    <h3>☁ Cloud Sync</h3>
    <p>Signed in as <strong>${esc(user.email || user.displayName || "Google user")}</strong>. Progress auto-saves to the cloud when you answer questions or finish quizzes.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="CloudAuth.pushNow().then(()=>showToast('Synced to cloud.','success')).catch(()=>showToast('Sync failed.','error'))">Sync now</button>
      <button class="btn btn-ghost" onclick="CloudAuth.signOutUser()">Sign out</button>
    </div>
  </div>`;
}

function renderSettingsPage() {
  const modules = Store.getModules();
  const totalQuizzes = modules.reduce((s, m) => s + m.quizzes.length, 0);
  const totalQuestions = modules.reduce((s, m) => s + m.quizzes.reduce((a, q) => a + q.questions.length, 0), 0);
  const totalAttempts = Object.values(Store.state.attempts).reduce((s, a) => s + a.history.length, 0);

  return `
  <div class="page-header">
    <div>
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Manage your data — export a backup, import one, or reset everything.</p>
    </div>
  </div>

  <div class="settings-section card card-pad">
    <h3>Overview</h3>
    <p>${modules.length} modules · ${totalQuizzes} quizzes · ${totalQuestions} questions · ${totalAttempts} quiz attempts recorded</p>
  </div>

  ${renderCloudSettingsSection()}

  <div class="settings-section card card-pad">
    <h3>Appearance</h3>
    <p>Current theme: <strong>${getTheme() === "dark" ? "Dark" : "Light"}</strong>. Toggle anytime with the moon/sun button in the top bar.</p>
    <button class="btn btn-secondary" onclick="toggleTheme()">Switch to ${getTheme() === "dark" ? "Light" : "Dark"} Mode</button>
  </div>

  <div class="settings-section card card-pad">
    <h3>Access from phone / other devices</h3>
    <p>Best: open the deployed website URL on your iPhone (after GitHub / Firebase Hosting deploy), then <strong>Sign in with Google</strong> so scores and in-progress quizzes sync.</p>
    <p style="margin-top:8px;">Local only: run <code style="background:var(--bg);padding:2px 6px;border-radius:4px;">node serve.js</code> and open the LAN URL on the same Wi‑Fi.</p>
  </div>

  <div class="settings-section card card-pad">
    <h3>Export data</h3>
    <p>Download all modules, quizzes, questions, and your score history as a JSON file for backup or sharing.</p>
    <button class="btn btn-secondary" onclick="App.exportData()">⬇ Export JSON</button>
  </div>

  <div class="settings-section card card-pad">
    <h3>Import data</h3>
    <p>Restore or merge a previously exported JSON file. This will replace your current modules and history.</p>
    <input type="file" id="importFileInput" accept="application/json" style="display:none;" onchange="App.importDataFile(this)" />
    <button class="btn btn-secondary" onclick="document.getElementById('importFileInput').click()">⬆ Import JSON</button>
  </div>

  <div class="settings-section card card-pad danger-zone">
    <h3 style="color:var(--danger);">Danger zone</h3>
    <p>Resetting restores the six default modules and the original Module 1 question bank, and permanently deletes all custom modules, quizzes, and score history.</p>
    <button class="btn btn-danger" onclick="App.confirmResetAll()">Reset All Data</button>
  </div>
  `;
}

/* ============================================================
   App — action handlers (bound to onclick attributes in views)
   ============================================================ */

const App = {
  currentQuizStart: null,
  lastResult: null,
  reviewFilter: "all",

  /* ---- navigation-triggering actions ---- */

  setMode(quizId, mode) {
    selectedMode[quizId] = mode;
    render();
  },

  setReviewFilter(filter) {
    App.reviewFilter = filter;
    render();
  },

  startQuiz(moduleId, quizId, mode) {
    const quiz = Store.getQuiz(moduleId, quizId);
    if (!quiz || !quiz.questions.length) return;
    const existing = Store.loadSession(quizId);
    if (existing) {
      const answered = Object.keys(existing.answers).length;
      if (!confirm(`You have a saved session (${answered}/${quiz.questions.length} answered). Start over and discard that progress?`)) {
        return;
      }
    }
    const session = {
      quizId, moduleId, mode: mode || "practice",
      answers: {}, revealed: {}, current: 0,
      startTime: Date.now()
    };
    Store.saveSession(quizId, session);
    navigate(`#/quiz/${moduleId}/${quizId}/take`);
  },

  resumeQuiz(moduleId, quizId) {
    const session = Store.loadSession(quizId);
    if (!session) return App.startQuiz(moduleId, quizId, "practice");
    navigate(`#/quiz/${moduleId}/${quizId}/take`);
  },

  exitQuiz(moduleId, quizId) {
    navigate(`#/quiz/${moduleId}/${quizId}`);
  },

  selectAnswer(optionIndex) {
    const parts = parseHash();
    const quizId = parts[2];
    const session = Store.loadSession(quizId);
    if (!session) return;
    const quiz = Store.getQuiz(session.moduleId, session.quizId);
    const q = quiz.questions[session.current];
    if (session.mode === "practice" && session.revealed[q.id]) return;
    session.answers[q.id] = optionIndex;
    if (session.mode === "practice") session.revealed[q.id] = true;
    Store.saveSession(quizId, session);
    render();
  },

  goToQuestion(index) {
    const parts = parseHash();
    const session = Store.loadSession(parts[2]);
    if (!session) return;
    session.current = index;
    Store.saveSession(parts[2], session);
    render();
  },

  nextQuestion() {
    const parts = parseHash();
    const session = Store.loadSession(parts[2]);
    if (!session) return;
    const quiz = Store.getQuiz(session.moduleId, session.quizId);
    session.current = Math.min(session.current + 1, quiz.questions.length - 1);
    Store.saveSession(parts[2], session);
    render();
  },

  prevQuestion() {
    const parts = parseHash();
    const session = Store.loadSession(parts[2]);
    if (!session) return;
    session.current = Math.max(session.current - 1, 0);
    Store.saveSession(parts[2], session);
    render();
  },

  submitQuiz(moduleId, quizId) {
    const session = Store.loadSession(quizId);
    const quiz = Store.getQuiz(moduleId, quizId);
    if (!session || !quiz) return;
    const answeredCount = Object.keys(session.answers).length;
    const unanswered = quiz.questions.length - answeredCount;
    if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;

    let score = 0;
    const details = quiz.questions.map((q) => {
      const sel = session.answers[q.id];
      const isCorrect = sel === q.correct;
      if (isCorrect) score++;
      return { question: q.question, options: q.options, correct: q.correct, explanation: q.explanation, selected: sel, isCorrect, answered: sel !== undefined };
    });
    const total = quiz.questions.length;
    const result = {
      __quizId: quizId,
      score, total, percent: total ? Math.round((score / total) * 100) : 0,
      durationMs: Date.now() - session.startTime,
      mode: session.mode,
      date: Date.now(),
      details
    };
    Store.recordAttempt(quizId, result);
    Store.clearSession(quizId);
    App.lastResult = result;
    App.reviewFilter = "all";
    navigate(`#/quiz/${moduleId}/${quizId}/results`);
  },

  viewHistoryResult(quizId, index) {
    const entry = Store.getAttempts(quizId).history[index];
    if (!entry) return;
    App.lastResult = Object.assign({ __quizId: quizId }, entry);
    App.reviewFilter = "all";
    const found = Store.findQuizAnywhere(quizId);
    if (found) navigate(`#/quiz/${found.module.id}/${quizId}/results`);
  },

  /* ---- module CRUD ---- */

  openAddModuleModal() {
    openModal("Add Module", `
      <div class="form-group"><label>Module Name</label><input class="form-control" id="f_modName" placeholder="e.g. Module 7" /></div>
      <div class="form-group"><label>Description</label><textarea class="form-control" id="f_modDesc" placeholder="What readings and lectures does this module cover?"></textarea></div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitAddModule()">Add Module</button>
    `);
  },
  submitAddModule() {
    const name = document.getElementById("f_modName").value.trim();
    if (!name) return showToast("Please enter a module name.", "error");
    const desc = document.getElementById("f_modDesc").value.trim();
    const mod = Store.addModule({ name, description: desc });
    closeModal();
    showToast("Module added.", "success");
    navigate(`#/module/${mod.id}`);
  },

  openEditModuleModal(moduleId) {
    const mod = Store.getModule(moduleId);
    if (!mod) return;
    openModal("Edit Module", `
      <div class="form-group"><label>Module Name</label><input class="form-control" id="f_modName" /></div>
      <div class="form-group"><label>Description</label><textarea class="form-control" id="f_modDesc"></textarea></div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitEditModule('${moduleId}')">Save Changes</button>
    `);
    document.getElementById("f_modName").value = mod.name;
    document.getElementById("f_modDesc").value = mod.description || "";
  },
  submitEditModule(moduleId) {
    const name = document.getElementById("f_modName").value.trim();
    if (!name) return showToast("Please enter a module name.", "error");
    const desc = document.getElementById("f_modDesc").value.trim();
    Store.updateModule(moduleId, { name, description: desc });
    closeModal();
    showToast("Module updated.", "success");
    render();
  },

  confirmDeleteModule(moduleId) {
    const mod = Store.getModule(moduleId);
    if (!mod) return;
    if (!confirm(`Delete "${mod.name}" and all ${mod.quizzes.length} quiz(zes) in it? This cannot be undone.`)) return;
    Store.deleteModule(moduleId);
    showToast("Module deleted.", "success");
    navigate("#/");
  },

  /* ---- quiz CRUD ---- */

  openAddQuizModal(moduleId) {
    openModal("Add Quiz", `
      <div class="form-group"><label>Quiz Title</label><input class="form-control" id="f_quizTitle" placeholder="e.g. Supply and Demand — Chapter 4" /></div>
      <div class="form-row">
        <div class="form-group"><label>Type</label>
          <select class="form-control" id="f_quizType">${QUIZ_TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
        </div>
        <div class="form-group"><label>Source (optional)</label><input class="form-control" id="f_quizSource" placeholder="e.g. Week 3 reading" /></div>
      </div>
      <p class="form-hint">You can add questions right after creating the quiz.</p>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitAddQuiz('${moduleId}')">Create Quiz</button>
    `);
  },
  submitAddQuiz(moduleId) {
    const title = document.getElementById("f_quizTitle").value.trim();
    if (!title) return showToast("Please enter a quiz title.", "error");
    const type = document.getElementById("f_quizType").value;
    const source = document.getElementById("f_quizSource").value.trim();
    const quiz = Store.addQuiz(moduleId, { title, type, source, questions: [] });
    closeModal();
    showToast("Quiz created — now add some questions.", "success");
    navigate(`#/quiz/${moduleId}/${quiz.id}/manage`);
  },

  openEditQuizModal(moduleId, quizId) {
    const quiz = Store.getQuiz(moduleId, quizId);
    if (!quiz) return;
    openModal("Edit Quiz", `
      <div class="form-group"><label>Quiz Title</label><input class="form-control" id="f_quizTitle" /></div>
      <div class="form-row">
        <div class="form-group"><label>Type</label>
          <select class="form-control" id="f_quizType">${QUIZ_TYPES.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
        </div>
        <div class="form-group"><label>Source (optional)</label><input class="form-control" id="f_quizSource" /></div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitEditQuiz('${moduleId}','${quizId}')">Save Changes</button>
    `);
    document.getElementById("f_quizTitle").value = quiz.title;
    document.getElementById("f_quizType").value = quiz.type;
    document.getElementById("f_quizSource").value = quiz.source || "";
  },
  submitEditQuiz(moduleId, quizId) {
    const title = document.getElementById("f_quizTitle").value.trim();
    if (!title) return showToast("Please enter a quiz title.", "error");
    const type = document.getElementById("f_quizType").value;
    const source = document.getElementById("f_quizSource").value.trim();
    Store.updateQuiz(moduleId, quizId, { title, type, source });
    closeModal();
    showToast("Quiz updated.", "success");
    render();
  },

  confirmDeleteQuiz(moduleId, quizId) {
    const quiz = Store.getQuiz(moduleId, quizId);
    if (!quiz) return;
    if (!confirm(`Delete quiz "${quiz.title}" and all ${quiz.questions.length} question(s)? This cannot be undone.`)) return;
    Store.deleteQuiz(moduleId, quizId);
    showToast("Quiz deleted.", "success");
    render();
  },

  /* ---- question CRUD ---- */

  openAddQuestionModal(moduleId, quizId) {
    openModal("Add Question", questionFormHtml(), `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitAddQuestion('${moduleId}','${quizId}')">Add Question</button>
    `, { wide: true });
  },
  submitAddQuestion(moduleId, quizId) {
    const data = readQuestionForm();
    if (!data) return;
    Store.addQuestion(moduleId, quizId, data);
    closeModal();
    showToast("Question added.", "success");
    render();
  },

  openEditQuestionModal(moduleId, quizId, questionId) {
    const quiz = Store.getQuiz(moduleId, quizId);
    const q = quiz.questions.find((x) => x.id === questionId);
    if (!q) return;
    openModal("Edit Question", questionFormHtml(), `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitEditQuestion('${moduleId}','${quizId}','${questionId}')">Save Changes</button>
    `, { wide: true });
    fillQuestionForm(q);
  },
  submitEditQuestion(moduleId, quizId, questionId) {
    const data = readQuestionForm();
    if (!data) return;
    Store.updateQuestion(moduleId, quizId, questionId, data);
    closeModal();
    showToast("Question updated.", "success");
    render();
  },

  confirmDeleteQuestion(moduleId, quizId, questionId) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    Store.deleteQuestion(moduleId, quizId, questionId);
    showToast("Question deleted.", "success");
    render();
  },

  openBulkImportModal(moduleId, quizId) {
    openModal("Bulk Import Questions", `
      <p class="form-hint" style="margin-bottom:10px;">Paste questions using this format (repeat for each question, separated by a blank line):</p>
      <pre style="background:var(--bg);padding:12px 14px;border-radius:8px;font-size:12px;overflow-x:auto;margin:0 0 14px;">Q: Question text goes here?
A) First option
B) Second option
C) Third option
D) Fourth option
ANSWER: B
EXPLANATION: Optional explanation text.</pre>
      <textarea class="form-control" id="f_bulkText" placeholder="Paste your formatted questions here..." style="min-height:220px;"></textarea>
      <div id="bulkPreview" class="form-hint" style="margin-top:10px;"></div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitBulkImport('${moduleId}','${quizId}')">Import Questions</button>
    `, { wide: true });
  },
  submitBulkImport(moduleId, quizId) {
    const text = document.getElementById("f_bulkText").value;
    const { valid, errors } = parseBulkQuestions(text);
    if (!valid.length) {
      document.getElementById("bulkPreview").innerHTML = `<span style="color:var(--danger);">No valid questions found. Check the format and try again.</span>`;
      return;
    }
    valid.forEach((q) => Store.addQuestion(moduleId, quizId, q));
    closeModal();
    showToast(`Imported ${valid.length} question(s)${errors.length ? `, skipped ${errors.length}` : ""}.`, "success");
    render();
  },

  /* ---- settings actions ---- */

  exportData() {
    const blob = new Blob([Store.exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ecn11a-quiz-data.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Export downloaded.", "success");
  },

  importDataFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.importData(reader.result);
        showToast("Data imported successfully.", "success");
        navigate("#/");
      } catch (e) {
        showToast("Import failed: invalid file.", "error");
      }
      input.value = "";
    };
    reader.readAsText(file);
  },

  confirmResetAll() {
    if (!confirm("This will delete all custom modules, quizzes, and score history, and restore the defaults. Continue?")) return;
    Store.resetAll();
    showToast("All data has been reset.", "success");
    navigate("#/");
  }
};
window.App = App;

/* ---------------------------- question form helpers ---------------------------- */

function questionFormHtml() {
  return `
    <div class="form-group"><label>Question</label><textarea class="form-control" id="f_qText" placeholder="Enter the question text"></textarea></div>
    <div class="form-group"><label>Options (select the correct one)</label>
      ${[0, 1, 2, 3].map((i) => `
        <div class="option-input-row">
          <input type="radio" name="f_qCorrect" value="${i}" id="f_qCorrect${i}" />
          <input class="form-control" id="f_qOpt${i}" placeholder="Option ${String.fromCharCode(65 + i)}" />
        </div>`).join("")}
    </div>
    <div class="form-group"><label>Explanation (optional)</label><textarea class="form-control" id="f_qExplain" placeholder="Why is this the correct answer?"></textarea></div>
  `;
}

function fillQuestionForm(q) {
  document.getElementById("f_qText").value = q.question;
  q.options.forEach((o, i) => { document.getElementById("f_qOpt" + i).value = o; });
  const radio = document.getElementById("f_qCorrect" + q.correct);
  if (radio) radio.checked = true;
  document.getElementById("f_qExplain").value = q.explanation || "";
}

function readQuestionForm() {
  const question = document.getElementById("f_qText").value.trim();
  const options = [0, 1, 2, 3].map((i) => document.getElementById("f_qOpt" + i).value.trim());
  const correctRadio = document.querySelector('input[name="f_qCorrect"]:checked');
  const explanation = document.getElementById("f_qExplain").value.trim();

  if (!question) { showToast("Please enter the question text.", "error"); return null; }
  if (options.some((o) => !o)) { showToast("Please fill in all four options.", "error"); return null; }
  if (!correctRadio) { showToast("Please select the correct answer.", "error"); return null; }

  return { question, options, correct: Number(correctRadio.value), explanation };
}

function parseBulkQuestions(text) {
  const lines = text.split(/\r?\n/);
  const questions = [];
  let current = null;
  let mode = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const qMatch = line.match(/^Q(?:uestion)?\s*\d*\s*[:.)]\s*(.*)$/i);
    const optMatch = line.match(/^([A-Da-d])\s*[).:]\s*(.*)$/);
    const ansMatch = line.match(/^(?:ANSWER|CORRECT)\s*[:.]\s*([A-Da-d])/i);
    const expMatch = line.match(/^(?:EXPLANATION|EXPLAIN)\s*[:.]\s*(.*)$/i);

    if (qMatch) {
      if (current) questions.push(current);
      current = { question: qMatch[1].trim(), options: [null, null, null, null], correct: null, explanation: "" };
      mode = null;
      continue;
    }
    if (!current) continue;
    if (optMatch) {
      const idx = optMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < 4) current.options[idx] = optMatch[2].trim();
      mode = null;
      continue;
    }
    if (ansMatch) {
      current.correct = ansMatch[1].toUpperCase().charCodeAt(0) - 65;
      mode = null;
      continue;
    }
    if (expMatch) {
      current.explanation = expMatch[1].trim();
      mode = "explanation";
      continue;
    }
    if (mode === "explanation") {
      current.explanation += (current.explanation ? " " : "") + line;
      continue;
    }
    if (current.options.every((o) => o === null)) {
      current.question += " " + line;
    }
  }
  if (current) questions.push(current);

  const valid = [];
  const errors = [];
  questions.forEach((q, i) => {
    if (!q.question || q.options.some((o) => !o) || q.correct === null || q.correct < 0 || q.correct > 3) {
      errors.push("Question " + (i + 1) + " is incomplete and was skipped.");
    } else {
      valid.push(q);
    }
  });
  return { valid, errors };
}

/* ---------------------------- modal system ---------------------------- */

function openModal(title, bodyHtml, footerHtml, opts) {
  opts = opts || {};
  modalRoot.innerHTML = `
    <div class="modal-backdrop" onclick="closeModal()"></div>
    <div class="modal-dialog${opts.wide ? " wide" : ""}">
      <div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">${footerHtml}</div>
    </div>
  `;
  modalRoot.classList.add("open");
  modalRoot.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalRoot.classList.remove("open");
  modalRoot.setAttribute("aria-hidden", "true");
  modalRoot.innerHTML = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalRoot.classList.contains("open")) closeModal();
});

/* ---------------------------- boot ---------------------------- */
render();
renderAuthUI();
