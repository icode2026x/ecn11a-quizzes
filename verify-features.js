/* Quick verification of sessions, dark mode, and LAN server helpers. */
const { JSDOM } = require("./.test-harness/node_modules/jsdom");
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const errors = [];
let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; console.log("  PASS:", msg); }
  else { fail++; console.log("  FAIL:", msg); errors.push(msg); }
}

(async () => {
  console.log("\n=== 1) Session persistence (localStorage) ===");
  const dom = new JSDOM(html, {
    url: "http://localhost/index.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.console.error = (...a) => errors.push(a.join(" "));
    }
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.confirm = () => true;

  function load(file) {
    const el = window.document.createElement("script");
    el.textContent = fs.readFileSync(path.join(root, file), "utf8");
    window.document.body.appendChild(el);
  }
  load("js/data.js");
  load("js/storage.js");
  load("js/app.js");
  await new Promise((r) => setTimeout(r, 100));

  assert(typeof window.Store.saveSession === "function", "Store.saveSession exists");
  assert(typeof window.Store.loadSession === "function", "Store.loadSession exists");

  const quizId = "m1-colonial-economy-labor-force";
  const moduleId = "module-1";
  window.Store.clearSession(quizId);

  window.App.startQuiz(moduleId, quizId, "practice");
  await new Promise((r) => setTimeout(r, 40));

  const key = "ecn11a_quiz_session_" + quizId;
  const rawLocal = window.localStorage.getItem(key);
  const rawSession = window.sessionStorage.getItem(key);
  assert(!!rawLocal, "Session saved to localStorage");
  assert(!rawSession, "Session NOT stored only in sessionStorage");

  window.App.selectAnswer(1);
  await new Promise((r) => setTimeout(r, 40));
  window.App.goToQuestion(4);
  await new Promise((r) => setTimeout(r, 40));
  window.App.selectAnswer(2);
  await new Promise((r) => setTimeout(r, 40));

  const mid = JSON.parse(window.localStorage.getItem(key));
  assert(Object.keys(mid.answers).length === 2, "Answers accumulate in saved session (" + Object.keys(mid.answers).length + ")");
  assert(mid.current === 4, "Current question index persisted");

  /* Simulate closing browser: new JSDOM with same localStorage dump */
  const savedDump = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    savedDump[k] = window.localStorage.getItem(k);
  }

  const dom2 = new JSDOM(html, {
    url: "http://localhost/index.html",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  const w2 = dom2.window;
  w2.scrollTo = () => {};
  Object.keys(savedDump).forEach((k) => w2.localStorage.setItem(k, savedDump[k]));
  function load2(file) {
    const el = w2.document.createElement("script");
    el.textContent = fs.readFileSync(path.join(root, file), "utf8");
    w2.document.body.appendChild(el);
  }
  load2("js/data.js");
  load2("js/storage.js");
  load2("js/app.js");
  await new Promise((r) => setTimeout(r, 100));

  const resumed = w2.Store.loadSession(quizId);
  assert(!!resumed, "Session still loadable after fresh page load");
  assert(Object.keys(resumed.answers).length === 2, "Resumed session keeps answered count");
  assert(resumed.current === 4, "Resumed session keeps current question");

  w2.location.hash = "#/quiz/" + moduleId + "/" + quizId;
  await new Promise((r) => setTimeout(r, 40));
  const hero = w2.document.querySelector(".quiz-hero");
  assert(hero && /In-progress session saved/.test(hero.textContent), "Overview shows in-progress session banner");
  assert(hero && /Resume Quiz/.test(hero.textContent), "Resume Quiz button present");

  console.log("\n=== 2) Dark mode ===");
  assert(typeof w2.toggleTheme === "function", "toggleTheme is available");
  assert(typeof w2.applyTheme === "function", "applyTheme is available");
  assert(!!w2.document.getElementById("themeToggle"), "Theme toggle button in DOM");

  const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
  assert(css.includes('[data-theme="dark"]'), "Dark theme CSS variables exist");
  assert(css.includes(".theme-toggle-btn"), "Theme toggle button styles exist");

  w2.applyTheme("light");
  assert(w2.document.documentElement.getAttribute("data-theme") === "light", "applyTheme('light') sets attribute");
  assert(w2.localStorage.getItem("ecn11a_theme") === "light", "Light theme persisted");
  assert(w2.document.getElementById("themeToggle").textContent === "🌙", "Toggle shows moon in light mode");

  w2.toggleTheme();
  assert(w2.document.documentElement.getAttribute("data-theme") === "dark", "toggleTheme switches to dark");
  assert(w2.localStorage.getItem("ecn11a_theme") === "dark", "Dark theme persisted");
  assert(w2.document.getElementById("themeToggle").textContent === "☀️", "Toggle shows sun in dark mode");

  const meta = w2.document.querySelector('meta[name="theme-color"]');
  assert(meta && meta.getAttribute("content") === "#1e1b4b", "theme-color meta updates for dark");

  /* Theme survives reload */
  const themeDump = w2.localStorage.getItem("ecn11a_theme");
  const dom3 = new JSDOM(html.replace(
    /document\.documentElement\.setAttribute\("data-theme", theme\);/,
    'document.documentElement.setAttribute("data-theme", theme);'
  ), {
    url: "http://localhost/index.html",
    runScripts: "dangerously",
    pretendToBeVisual: true
  });
  /* Pre-seed storage before scripts that read it — early head script runs at parse.
     Recreate with storage preloaded via beforeParse. */
  const dom3b = new JSDOM(html, {
    url: "http://localhost/index.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(win) {
      win.localStorage.setItem("ecn11a_theme", "dark");
    }
  });
  assert(dom3b.window.document.documentElement.getAttribute("data-theme") === "dark", "Early head script restores dark theme before paint");

  console.log("\n=== 3) LAN server (serve.js) ===");
  assert(fs.existsSync(path.join(root, "serve.js")), "serve.js exists");
  const serveSrc = fs.readFileSync(path.join(root, "serve.js"), "utf8");
  assert(serveSrc.includes('listen(PORT, "0.0.0.0"'), "Server binds to 0.0.0.0 (all interfaces)");
  assert(serveSrc.includes("networkInterfaces"), "Server prints LAN IP addresses");

  /* Boot serve.js-equivalent briefly and fetch index over 127.0.0.1 */
  await new Promise((resolve, reject) => {
    const child = require("child_process").spawn(
      process.execPath,
      [path.join(root, "serve.js"), "8799"],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let settled = false;
    const cleanup = (ok, msg) => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (e) {}
      if (ok) resolve(msg);
      else reject(new Error(msg));
    };
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });
    setTimeout(async () => {
      try {
        assert(/localhost:8799/.test(out), "Server prints localhost URL");
        assert(/Phone \/ LAN|no LAN IPv4/.test(out), "Server prints phone/LAN guidance");
        const res = await new Promise((resFn, rejFn) => {
          http.get("http://127.0.0.1:8799/", (r) => {
            let body = "";
            r.on("data", (c) => body += c);
            r.on("end", () => resFn({ status: r.statusCode, body }));
          }).on("error", rejFn);
        });
        assert(res.status === 200, "HTTP 200 from server");
        assert(/ECN 11A Quiz Hub/.test(res.body), "Serves index.html content");
        const cssRes = await new Promise((resFn, rejFn) => {
          http.get("http://127.0.0.1:8799/css/styles.css", (r) => {
            let body = "";
            r.on("data", (c) => body += c);
            r.on("end", () => resFn({ status: r.statusCode, body }));
          }).on("error", rejFn);
        });
        assert(cssRes.status === 200 && cssRes.body.includes("data-theme"), "Serves CSS with dark theme");
        cleanup(true);
      } catch (e) {
        cleanup(false, e.message);
      }
    }, 800);
    child.on("error", (e) => cleanup(false, e.message));
  }).catch((e) => {
    fail++;
    console.log("  FAIL: server live test —", e.message);
    errors.push(e.message);
  });

  const lan = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) lan.push(net.address);
    }
  }
  console.log("\n  Detected LAN IPv4 address(es):", lan.length ? lan.join(", ") : "(none — connect to Wi‑Fi)");

  console.log("\n=== SUMMARY ===");
  console.log(`Passed: ${pass}  Failed: ${fail}`);
  if (errors.length) {
    console.log("Errors:");
    errors.forEach((e) => console.log(" -", e));
    process.exit(1);
  }
  console.log("All feature checks passed.");
})();
