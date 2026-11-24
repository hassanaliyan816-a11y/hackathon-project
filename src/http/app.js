// HTTP layer: security headers, rate limit, routing, permissions lookup, error handling.
// Business rules are in ../domain; this file only translates requests into domain calls.
const config = require('../config');
const Store = require('../storage/store');
const D = require('../domain');
const LLM = require('../ai/llm');
const { PLACES, DEPTS } = require('../domain/campus');
const { buildReport } = require('../export/report');
const { applySecurityHeaders, rateLimiter, requireJson, readJson } = require('./security');
const { serveStatic } = require('./static');

const { HttpError } = D;
const ID = '(\\d{1,9})'; // issue ids are plain numbers

/* ---------- routes ----------
   Each route: [method, path pattern, options, handler]. auth:false means no user needed (judge access).
   A handler receives { user, params, query, body() } and returns a JSON-able value, or { status, json },
   or { status, headers, raw } for a file download. */
const routes = [];
const route = (method, pattern, opts, handler) => routes.push({ method, re: new RegExp('^' + pattern + '$'), auth: opts.auth !== false, handler });

// public: health, campus info, user list, create student, reset (the judge-access features)
route('GET', '/api/health', { auth: false }, () => ({ ok: true, llm: LLM.enabled(), llmCalls: LLM.state.calls, llmOk: LLM.state.ok, llmModel: LLM.state.model || null, llmLastError: LLM.state.lastError }));
route('GET', '/api/meta', { auth: false }, () => ({ places: PLACES.map(p => ({ name: p.name, dept: p.dept })), depts: DEPTS }));
route('GET', '/api/users', { auth: false }, () => Store.get().users.map(D.publicUser));
route('POST', '/api/users', { auth: false }, async ({ body }) => { const u = D.createStudent((await body()).name); return { status: 201, json: { id: u.id, name: u.name, role: u.role, trust: u.trust } }; });
route('POST', '/api/reset', { auth: false }, () => { Store.reset(); return { ok: true }; });

// everything below needs the acting user (picked in the UI, no password)
route('GET', '/api/me', {}, ({ user }) => D.publicUser(user));
route('POST', '/api/reports', {}, async ({ user, body }) => D.submitReport(user, (await body()).text));
route('GET', '/api/issues', {}, ({ user, query }) => D.listIssues(user, query.get('scope') || 'public'));
route('POST', `/api/issues/${ID}/join`, {}, ({ user, params }) => D.join(user, params[0]));
route('POST', `/api/issues/${ID}/vote`, {}, async ({ user, params, body }) => D.vote(user, params[0], (await body()).vote));
route('POST', `/api/issues/${ID}/status`, {}, async ({ user, params, body }) => { const b = await body(); return D.setStatus(user, params[0], b.status, b.note); });
route('POST', `/api/issues/${ID}/reassign`, {}, async ({ user, params, body }) => D.reassign(user, params[0], (await body()).dept));
route('GET', '/api/users/([\\w-]{1,20})/trust', {}, ({ user, params }) => {
  if (user.role === 'student' && user.id !== params[0]) throw new HttpError(403, 'You can only view your own trust history.');
  return D.trustView(params[0]);
});
route('GET', '/api/trending', {}, () => D.trending());
route('POST', '/api/admin/summary', {}, async ({ user }) => { if (user.role !== 'admin') throw new HttpError(403, 'Admin only.'); return D.adminSummary(); });
route('POST', '/api/export', {}, async ({ user, body }) => {
  const b = await body();
  const ids = Array.isArray(b.ids) ? b.ids.slice(0, 25).map(Number).filter(Number.isSafeInteger) : [];
  const out = await buildReport(user, ids);
  return { status: 200, raw: out.buffer, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Access-Control-Expose-Headers': 'Content-Disposition, X-Report-AI', 'X-Report-AI': out.aiUsed ? 'yes' : 'no' } };
});

/* ---------- plumbing ---------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function createHandler({ rateMax } = {}) {
  const allow = rateLimiter({ max: rateMax || config.rateLimitPerMin() });

  return async function handle(req, res) {
    applySecurityHeaders(res);

    // Only a plain absolute path is accepted ("//host" style or malformed targets are refused, never parsed).
    const target = req.url || '';
    if (!/^\/[^\s]*$/.test(target) || target.startsWith('//')) return sendJson(res, 400, { error: 'Bad request.' });
    const url = new URL(target, 'http://localhost');
    const pathname = url.pathname;

    // static page and assets
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
      const f = serveStatic(pathname);
      if (f.status !== 200) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      res.writeHead(200, { ...f.headers, 'Content-Length': f.body.length });
      return res.end(req.method === 'HEAD' ? undefined : f.body);
    }

    try {
      if (!allow(req.socket.remoteAddress || 'unknown')) { res.setHeader('Retry-After', '30'); throw new HttpError(429, 'Too many requests. Please slow down.'); }
      D.tick(); // closes resolved issues nobody credibly disputed within the verification window

      let matched = null, params = null, pathKnown = false;
      for (const r of routes) {
        const m = r.re.exec(pathname); if (!m) continue;
        pathKnown = true;
        if (r.method === req.method) { matched = r; params = m.slice(1); break; }
      }
      if (!matched) throw new HttpError(pathKnown ? 405 : 404, pathKnown ? 'Method not allowed.' : 'No such endpoint.');
      if (req.method === 'POST') requireJson(req);

      let user = null;
      if (matched.auth) {
        user = D.userById(String(req.headers['x-user-id'] || '').slice(0, 40));
        if (!user) throw new HttpError(401, 'Pick a user first.');
      }
      let cached; const body = () => (cached ??= readJson(req));
      const out = await matched.handler({ user, params, query: url.searchParams, body });

      if (out && out.raw) { res.writeHead(out.status || 200, { ...out.headers, 'Content-Length': out.raw.length, 'Cache-Control': 'no-store' }); return res.end(out.raw); }
      if (out && out.json !== undefined) return sendJson(res, out.status || 200, out.json);
      return sendJson(res, 200, out);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 413) res.setHeader('Connection', 'close');
        sendJson(res, e.status, { error: e.message, ...(e.extra || {}) });
        if (e.status === 413) res.on('finish', () => req.destroy());
        return;
      }
      console.error('Unexpected error:', e);
      return sendJson(res, 500, { error: 'Server error.' });
    }
  };
}

module.exports = { createHandler };
