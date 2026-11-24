// Web-security helpers: response headers, a per-client rate limiter, and safe JSON body reading.
const { HttpError } = require('../domain/core');
const config = require('../config');

// Sent with every response. The page uses inline scripts and styles, so CSP allows 'unsafe-inline' for those only;
// everything else (framing, foreign scripts, plugins, form posts elsewhere, <base> tricks) is blocked.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const applySecurityHeaders = res => { for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v); };

// Allows `max` calls per `windowMs` for each key (the client's network address). Old entries are cleaned up.
function rateLimiter({ max, windowMs = 60000 }) {
  const hits = new Map();
  let lastSweep = Date.now();
  return key => {
    const now = Date.now();
    if (now - lastSweep > windowMs) { for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k); lastSweep = now; }
    let h = hits.get(key);
    if (!h || now - h.start > windowMs) { h = { start: now, n: 0 }; hits.set(key, h); }
    return ++h.n <= max;
  };
}

// POST bodies must be JSON. A cross-site web form or <img> cannot send that content type without the browser asking permission first,
// so other websites cannot trigger actions (like "reset data") in a judge's browser.
function requireJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Content-Type must be application/json.');
}

function readJson(req, limit = config.BODY_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []; let done = false;
    const fail = e => { if (!done) { done = true; reject(e); } };
    req.on('data', c => { size += c.length; if (size > limit) { chunks.length = 0; req.pause(); fail(new HttpError(413, 'Request too large.')); } else if (!done) chunks.push(c); });
    req.on('end', () => {
      if (done) return; done = true;
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s) return resolve({});
      try { const j = JSON.parse(s); resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); } catch { reject(new HttpError(400, 'Bad JSON.')); }
    });
    req.on('error', () => fail(new HttpError(400, 'Request aborted.')));
    req.on('aborted', () => fail(new HttpError(400, 'Request aborted.')));
  });
}

module.exports = { applySecurityHeaders, rateLimiter, requireJson, readJson };
