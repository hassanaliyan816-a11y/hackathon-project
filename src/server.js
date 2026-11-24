const http = require('http');
const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { }

const Store = require('./store');
const L = require('./logic');
const LLM = require('./llm');
const { PLACES, DEPTS } = require('./campus');

const PUB = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > 20000) { reject(new L.HttpError(413, 'Too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new L.HttpError(400, 'Bad JSON')); } });
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (!p.startsWith('/api/')) {
    const file = p === '/' ? 'index.html' : p.slice(1);
    const full = path.join(PUB, path.normalize(file).replace(/^(\.\.[\/])+/, ''));
    if (!full.startsWith(PUB) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(full));
  }
  const m = req.method;
  try {
    // --- judge access: no auth needed ---
    if (p === '/api/health') return send(res, 200, { ok: true, llm: LLM.enabled(), llmCalls: LLM.state.calls, llmOk: LLM.state.ok, llmLastError: LLM.state.lastError });
    if (p === '/api/meta') return send(res, 200, { places: PLACES.map(x => ({ name: x.name, dept: x.dept })), depts: DEPTS });
    if (p === '/api/users' && m === 'GET') return send(res, 200, Store.get().users.map(u => ({ id: u.id, name: u.name, role: u.role, dept: u.dept, trust: u.role === 'student' ? u.trust : null, createdAt: u.createdAt })));
    if (p === '/api/users' && m === 'POST') { const b = await readBody(req); const u = L.createStudent(b.name); return send(res, 201, { id: u.id, name: u.name, role: u.role, trust: u.trust }); }
    if (p === '/api/reset' && m === 'POST') { Store.reset(); return send(res, 200, { ok: true }); }

    // --- everything else needs a current user (picked in the UI, no password) ---
    const user = L.userById(req.headers['x-user-id'] || '');
    if (!user) throw new L.HttpError(401, 'Pick a user first.');

    if (p === '/api/me') return send(res, 200, { id: user.id, name: user.name, role: user.role, dept: user.dept, trust: user.role === 'student' ? user.trust : null });
    if (p === '/api/reports' && m === 'POST') { const b = await readBody(req); return send(res, 200, await L.submitReport(user, b.text)); }
    if (p === '/api/issues' && m === 'GET') return send(res, 200, L.listIssues(user, url.searchParams.get('scope') || 'public'));
    let mm;
    if ((mm = p.match(/^\/api\/issues\/(\d+)\/join$/)) && m === 'POST') return send(res, 200, L.join(user, mm[1]));
    if ((mm = p.match(/^\/api\/issues\/(\d+)\/vote$/)) && m === 'POST') { const b = await readBody(req); return send(res, 200, L.vote(user, mm[1], b.vote)); }
    if ((mm = p.match(/^\/api\/issues\/(\d+)\/status$/)) && m === 'POST') { const b = await readBody(req); return send(res, 200, L.setStatus(user, mm[1], b.status, b.note)); }
    if ((mm = p.match(/^\/api\/issues\/(\d+)\/reassign$/)) && m === 'POST') { const b = await readBody(req); return send(res, 200, L.reassign(user, mm[1], b.dept)); }
    if ((mm = p.match(/^\/api\/users\/([\w-]+)\/trust$/))) {
      if (user.role === 'student' && user.id !== mm[1]) throw new L.HttpError(403, 'You can only view your own trust history.');
      return send(res, 200, L.trustView(mm[1]));
    }
    if (p === '/api/trending') return send(res, 200, L.trending());
    if (p === '/api/admin/summary' && m === 'POST') { if (user.role !== 'admin') throw new L.HttpError(403, 'Admin only.'); return send(res, 200, await L.adminSummary()); }
    throw new L.HttpError(404, 'No such endpoint.');
  } catch (e) {
    if (e instanceof L.HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
    console.error(e);
    return send(res, 500, { error: 'Server error.' });
  }
}

function start(port = +process.env.PORT || 3000) {
  Store.get();
  const server = http.createServer((req, res) => { handle(req, res); });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

if (require.main === module) {
  start().then(s => console.log(`ReportFix running on http://localhost:${s.address().port}  (AI: ${LLM.enabled() ? 'on' : 'off - rules only'})`));
}
module.exports = { start };
