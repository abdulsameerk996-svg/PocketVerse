/*
 * Serves `dist/` the way Cloudflare Pages will.
 *
 *   npm run preview:web
 *
 * A plain static server is not good enough for checking this build: expo-sqlite
 * needs the cross-origin isolation headers or the database never opens, and
 * deep links need the SPA fallback. Both are configured for production in
 * `public/_headers` and `public/_redirects`, and both are mirrored here so a
 * local pass actually means something.
 *
 * Zero dependencies on purpose — this is a verification tool, not a runtime.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'dist');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(ROOT)) {
  console.error(`No build at ${ROOT}\nRun:  npm run build:web`);
  process.exit(1);
}

function send(res, status, body, type, extraHeaders) {
  res.writeHead(status, {
    'Content-Type': type,
    // The pair that expo-sqlite's worker depends on. Mirrors public/_headers.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    send(res, 400, 'Bad request', 'text/plain; charset=utf-8');
    return;
  }

  // Contain the served tree — no traversal out of dist/.
  const candidate = path.join(ROOT, pathname);
  const resolved = path.normalize(candidate);
  if (!resolved.startsWith(ROOT)) {
    send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }

  let file = resolved;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  // Static export writes /play as play.html; try that before falling back.
  if (!fs.existsSync(file) && fs.existsSync(`${resolved}.html`)) {
    file = `${resolved}.html`;
  }
  // The `_redirects` rule: anything unmatched is the app shell.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, 'index.html');
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    send(res, 200, buf, type);
  });
});

server.listen(PORT, () => {
  console.log(`\n  PocketVerse (production build)`);
  console.log(`  http://localhost:${PORT}\n`);
  console.log(`  Serving   ${ROOT}`);
  console.log(`  Headers   COOP: same-origin · COEP: require-corp`);
  console.log(`  Fallback  unmatched paths → index.html\n`);
});
