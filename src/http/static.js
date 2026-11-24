// Serves the files in /public (the web page, logo and photo) and nothing else.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };

// Returns { status, headers, body } for a request path. Only plain names like /index.html or /img/logo.png are accepted:
// no "..", no encoded characters, no backslashes, no hidden files. The resolved file must also sit inside /public.
function serveStatic(pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  if (!/^\/[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-]+)*(\.[A-Za-z0-9]+)?$/.test(rel)) return { status: 404 };
  const full = path.resolve(config.PUBLIC_DIR, '.' + rel);
  const inside = path.relative(config.PUBLIC_DIR, full);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return { status: 404 };
  const type = TYPES[path.extname(full).toLowerCase()];
  if (!type) return { status: 404 };
  let stat; try { stat = fs.statSync(full); } catch { return { status: 404 }; }
  if (!stat.isFile()) return { status: 404 };
  return { status: 200, headers: { 'Content-Type': type, 'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'public, max-age=300' }, body: fs.readFileSync(full) };
}

module.exports = { serveStatic };
