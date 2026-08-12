#!/usr/bin/env node
/* ============================================================
   LAN-friendly static server for ECN 11A Quiz Hub.
   Binds to 0.0.0.0 so phones / other devices on the same Wi‑Fi
   can open the app via this computer's local IP address.

   Usage:  node serve.js
           node serve.js 8080
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.argv[2]) || 8765;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        results.push({ name, address: net.address });
      }
    }
  }
  return results;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(ROOT, cleaned === path.sep || cleaned === "." ? "index.html" : cleaned);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  let filePath = safePath(req.url === "/" ? "/index.html" : req.url);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      /* SPA-style fallback to index for unknown routes */
      if (!path.extname(filePath)) {
        filePath = path.join(ROOT, "index.html");
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const lan = getLanAddresses();
  console.log("");
  console.log("  ECN 11A Quiz Hub is running");
  console.log("  -------------------------------------------");
  console.log(`  This PC:     http://localhost:${PORT}`);
  if (lan.length === 0) {
    console.log("  Other devices: no LAN IPv4 address found.");
    console.log("  Connect to Wi‑Fi, then restart this server.");
  } else {
    lan.forEach(({ name, address }) => {
      console.log(`  Phone / LAN (${name}): http://${address}:${PORT}`);
    });
  }
  console.log("  -------------------------------------------");
  console.log("  Open a phone URL above on the same Wi‑Fi.");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try: node serve.js ${PORT + 1}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
