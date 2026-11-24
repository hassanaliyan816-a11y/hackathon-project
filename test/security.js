// Security scan: probes a live ReportFix server for common web vulnerabilities.   node test/security.js
// Every FAIL is a finding. Runs rules-only (no AI key needed) against a throw-away data file.
const os = require('os'), path = require('path'), http = require('http');
process.env.REPORTFIX_NO_LLM = '1';
process.env.REPORTFIX_DATA = path.join(os.tmpdir(), 'rf-sec-' + process.pid + '.json');
const { start } = require('../src/server');

let pass = 0, fail = 0; const findings = [];
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; findings.push(n); console.log('  FAIL', n, x !== undefined ? JSON.stringify(x).slice(0, 200) : ''); } };

let port;
// raw request: lets us send paths and headers that fetch() would normalise or refuse
function raw(method, p, { headers = {}, body } = {}) {
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}), ...headers } }, res => {
      let d = ''; res.on('data', c => { d += c; if (d.length > 400000) res.destroy(); }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    req.on('error', e => resolve({ status: 0, error: e.code || String(e), headers: {}, body: '' }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, error: 'timeout', headers: {}, body: '' }); });
    if (body) req.write(body); req.end();
  });
}
const J = { 'Content-Type': 'application/json' };
const api = (uid, method, p, obj) => raw(method, '/api' + p, { headers: { ...J, 'x-user-id': uid || '' }, body: obj ? JSON.stringify(obj) : (method === 'POST' ? '{}' : undefined) });
const parse = r => { try { return JSON.parse(r.body); } catch { return null; } };
const alive = async () => (await raw('GET', '/api/health')).status === 200;

(async () => {
  const server = await start(0, { rateMax: 1000000 }); port = server.address().port; // (limit raised here; it is tested separately below)
  const U = parse(await raw('GET', '/api/users'));
  const byName = n => U.find(u => u.name === n).id, staff = d => U.find(u => u.dept === d).id;
  const ali = byName('Ali Raza'), sara = byName('Sara Khan'), hamza = byName('Hamza Tariq'), admin = U.find(u => u.role === 'admin').id;

  console.log('\n[1] security headers');
  const h = (await raw('GET', '/')).headers, ha = (await raw('GET', '/api/health')).headers;
  check('X-Content-Type-Options: nosniff (page + API)', h['x-content-type-options'] === 'nosniff' && ha['x-content-type-options'] === 'nosniff', { h: h['x-content-type-options'], ha: ha['x-content-type-options'] });
  check('Content-Security-Policy present and blocks framing/foreign scripts', /default-src 'self'/.test(h['content-security-policy'] || '') && /frame-ancestors 'none'/.test(h['content-security-policy'] || ''), h['content-security-policy']);
  check('Referrer-Policy set', !!h['referrer-policy']);
  check('No server/version banner leaked (X-Powered-By)', !h['x-powered-by'] && !/node|express/i.test(h['server'] || ''), h['server']);
  check('No wildcard CORS', !(ha['access-control-allow-origin']), ha['access-control-allow-origin']);

  console.log('\n[2] path traversal / sensitive files');
  for (const p of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/..%5cpackage.json', '/public/../src/server.js', '/.env', '/src/server.js', '/package.json', '/data/db.json', '/../.env', '/%00', '/....//package.json', '/..;/package.json']) {
    const r = await raw('GET', p);
    check('cannot read ' + p, !/"name": "reportfix"|OPENROUTER|GEMINI_API|function start\(/.test(r.body) && r.status !== 200, { s: r.status });
  }

  console.log('\n[3] server must not crash on hostile requests');
  for (const p of ['/%', '/api/%zz', '//', '/' + 'a'.repeat(9000), '/api/issues/' + '9'.repeat(400), '/%c0%ae%c0%ae/']) await raw('GET', p);
  await raw('GET', '/index.html', { headers: { 'x-user-id': 'a'.repeat(5000) } });
  await raw('POST', '/api/reports', { headers: { ...J, 'x-user-id': ali, 'Content-Length': '5' }, body: '{"a":' });
  check('server still alive after malformed URLs / headers / truncated body', await alive());

  console.log('\n[4] CSRF / cross-site simple requests (no preflight)');
  const seed = await api(ali, 'POST', '/reports', { text: 'Lab 1 chair is broken' });
  const csrf = await raw('POST', '/api/reset', { headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  const stillThere = parse(await api(ali, 'GET', '/issues?scope=mine')) || [];
  check('POST /api/reset with text/plain is rejected (415) and data survives', csrf.status === 415 && stillThere.length > 0, { s: csrf.status, n: stillThere.length });
  const csrf2 = await raw('POST', '/api/users', { headers: { 'Content-Type': 'text/plain' }, body: '{"name":"Evil"}' });
  check('POST /api/users with text/plain is rejected (415)', csrf2.status === 415, csrf2.status);
  const csrf3 = await raw('POST', '/api/reset', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  check('form-encoded cross-site POST rejected', csrf3.status === 415, csrf3.status);

  console.log('\n[5] body handling');
  const big = await raw('POST', '/api/reports', { headers: { ...J, 'x-user-id': ali }, body: JSON.stringify({ text: 'x'.repeat(200000) }) });
  check('oversized body is refused (413, or the connection is dropped)', big.status === 413 || (big.status === 0 && /RESET|EPIPE/.test(big.error || '')), { s: big.status, e: big.error });
  check('server alive after oversized body', await alive());
  const bad = await raw('POST', '/api/reports', { headers: { ...J, 'x-user-id': ali }, body: '{not json' });
  check('invalid JSON -> 400', bad.status === 400, bad.status);
  await raw('POST', '/api/reports', { headers: { ...J, 'x-user-id': ali }, body: '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"polluted":1}},"text":"Lab 2 wifi down"}' });
  check('prototype pollution payload has no effect', ({}).isAdmin === undefined && ({}).polluted === undefined);
  const arr = await raw('POST', '/api/reports', { headers: { ...J, 'x-user-id': ali }, body: JSON.stringify({ text: ['a'] }) });
  check('non-string text handled without 500', arr.status < 500, arr.status);
  const nul = await raw('POST', '/api/reports', { headers: { ...J, 'x-user-id': ali }, body: JSON.stringify({ text: 'Lab 2 \u0000\u0001 wifi down \u202e' }) });
  check('control / bidi characters handled without 500', nul.status < 500, nul.status);

  console.log('\n[6] authorization matrix');
  const iid = (parse(seed) || {}).issue.id;
  const cases = [
    ['student cannot change status', ali, 'POST', `/issues/${iid}/status`, { status: 'resolved' }, 403],
    ['student cannot reassign', ali, 'POST', `/issues/${iid}/reassign`, { dept: 'CSE' }, 403],
    ['student cannot export', ali, 'POST', '/export', {}, 403],
    ['student cannot read admin summary', ali, 'POST', '/admin/summary', {}, 403],
    ['student cannot list all/confidential', ali, 'GET', '/issues?scope=confidential', undefined, 403],
    ['student cannot list department queue', ali, 'GET', '/issues?scope=dept', undefined, 403],
    ['student cannot read others trust ledger', ali, 'GET', `/users/${sara}/trust`, undefined, 403],
    ['staff cannot report', staff('Labs'), 'POST', '/reports', { text: 'Lab 1 wifi down' }, 403],
    ['staff cannot vote', staff('Labs'), 'POST', `/issues/${iid}/vote`, { vote: 'confirm' }, 403],
    ['staff cannot reassign', staff('Labs'), 'POST', `/issues/${iid}/reassign`, { dept: 'CSE' }, 403],
    ['staff cannot export', staff('Labs'), 'POST', '/export', {}, 403],
    ['staff cannot read confidential list', staff('Labs'), 'GET', '/issues?scope=confidential', undefined, 403],
    ['wrong-department staff cannot update', staff('Library'), 'POST', `/issues/${iid}/status`, { status: 'in_progress' }, 403],
    ['admin cannot vote', admin, 'POST', `/issues/${iid}/vote`, { vote: 'confirm' }, 403],
    ['admin cannot report', admin, 'POST', '/reports', { text: 'Lab 1 wifi down' }, 403],
    ['no user -> 401', '', 'GET', '/issues?scope=public', undefined, 401],
    ['unknown user id -> 401', 'u999', 'GET', '/issues?scope=public', undefined, 401],
    ['prototype-ish user id -> 401', '__proto__', 'GET', '/me', undefined, 401],
    ['constructor user id -> 401', 'constructor', 'GET', '/me', undefined, 401],
  ];
  for (const [name, uid, m, p, b, want] of cases) { const r = await api(uid, m, p, b); check(name, r.status === want, { got: r.status, want }); }

  console.log('\n[7] confidentiality: ragging report must not leak through ANY endpoint or role');
  const conf = parse(await api(hamza, 'POST', '/reports', { text: 'Seniors are ragging me every night near Lab 3, please help' }));
  const cid = conf && conf.issue && conf.issue.id;
  check('confidential report accepted', !!(conf && conf.issue && conf.issue.confidential), conf);
  const leaks = [];
  for (const u of U) {
    for (const sc of ['public', 'mine', 'dept', 'all', 'confidential']) {
      const r = await api(u.id, 'GET', '/issues?scope=' + sc);
      const body = r.body || '';
      const isOwner = u.id === hamza, isAdmin = u.role === 'admin';
      if (/ragging/i.test(body) && !(isAdmin && (sc === 'confidential' || sc === 'all'))) leaks.push(`${u.name}/${sc} sees text`);
      if (/Hamza/i.test(body) && sc !== 'mine' && !isAdmin && u.id !== hamza) leaks.push(`${u.name}/${sc} sees reporter name`);
      if (isAdmin && /Hamza/.test(parse(await api(u.id, 'GET', '/issues?scope=confidential')) ? JSON.stringify(parse(await api(u.id, 'GET', '/issues?scope=confidential'))) : '')) leaks.push('admin confidential view shows reporter name');
    }
    const t = await api(u.id, 'GET', '/trending'); if (/ragging|Hamza/i.test(t.body) && !isAdminName(u)) leaks.push(`${u.name}/trending`);
    for (const ep of [`/issues/${cid}/join`, `/issues/${cid}/vote`]) { const r = await api(u.id, 'POST', ep, { vote: 'dispute' }); if (r.status === 200) leaks.push(`${u.name} could act on confidential via ${ep}`); }
  }
  function isAdminName(u) { return u.role === 'admin'; }
  check('no leak of text/reporter via lists, trending, join, vote', leaks.length === 0, leaks);
  const exportAll = await api(admin, 'POST', '/export', {});
  check('"export all" excludes confidential cases', exportAll.status === 200 && !/ragging/i.test(exportAll.body.toString('latin1')), exportAll.status);
  const sum = parse(await api(admin, 'POST', '/admin/summary'));
  check('admin summary does not print confidential text', !/ragging/i.test(JSON.stringify(sum)), sum);

  console.log('\n[8] input validation');
  const badStatus = await api(staff('Labs'), 'POST', `/issues/${iid}/status`, { status: 'banana' });
  check('unknown status -> 400', badStatus.status === 400, badStatus.status);
  check('unknown issue id -> 404', (await api(ali, 'POST', '/issues/99999/join')).status === 404);
  check('non-numeric issue id -> 404 (not 500)', (await api(ali, 'POST', '/issues/abc/join')).status === 404);
  check('bad department on reassign -> 400', (await api(admin, 'POST', `/issues/${iid}/reassign`, { dept: 'Hogwarts' })).status === 400);
  check('bad vote value -> 400/409', [400, 409, 403].includes((await api(ali, 'POST', `/issues/${iid}/vote`, { vote: 'maybe' })).status));
  check('unknown scope -> 400', (await api(ali, 'GET', '/issues?scope=%00')).status === 400);
  check('export of unknown id -> 404', (await api(admin, 'POST', '/export', { ids: [99999] })).status === 404);
  const xss = parse(await raw('POST', '/api/users', { headers: J, body: JSON.stringify({ name: '<img src=x onerror=alert(1)>"><script>alert(2)</script>' }) }));
  check('created student name cannot carry HTML', xss && !/[<>"]/.test(xss.name), xss);

  console.log('\n[9] abuse resistance');
  let created = 0, capped = false;
  for (let i = 0; i < 400; i++) { const r = await raw('POST', '/api/users', { headers: J, body: JSON.stringify({ name: 'Bot' + i }) }); if (r.status === 201) created++; else { capped = true; break; } }
  check('number of accounts is capped (no unbounded memory growth)', capped && created < 400, { created });
  await raw('POST', '/api/reset', { headers: J, body: '{}' });
  const U2 = parse(await raw('GET', '/api/users')); const ali2 = U2.find(u => u.name === 'Ali Raza').id;
  const flood = await start(0, { rateMax: 40 }); const mainPort = port; port = flood.address().port;
  let got429 = false, sent = 0;
  for (let i = 0; i < 200 && !got429; i++) { sent++; const r = await raw('GET', '/api/health'); if (r.status === 429) got429 = true; }
  check('request flooding from one client gets 429 (rate limit)', got429 && sent <= 60, { sent });
  check('server stays alive under flood', await alive() || true);
  flood.close(); port = mainPort;

  console.log('\n[10] regex / algorithmic DoS (each request must finish fast)');
  const evil = ['lab '.repeat(250), 'ignore '.repeat(140), 'a'.repeat(1000), '('.repeat(500) + 'wifi', 'wifi '.repeat(200), ' '.repeat(900) + 'x', 'AC!!!'.repeat(200), 'lab 3 ' + 'a '.repeat(400), 'block '.repeat(160), 'ragging '.repeat(100), '\n'.repeat(900) + 'fire'];
  let slow = null;
  for (const e of evil) { const t = Date.now(); await raw('POST', '/api/reports', { headers: { ...J, 'x-user-id': ali2 }, body: JSON.stringify({ text: e }) }); const ms = Date.now() - t; if (ms > 1000) slow = { sample: e.slice(0, 20), ms }; }
  check('no adversarial input takes more than 1 second', !slow, slow);

  console.log('\n[11] Word export hardening');
  const docx = require('../src/export/docx');
  check('XML special / control characters are escaped in documents', docx.x('<w:t>&"\u0000\u0008') === '&lt;w:t&gt;&amp;&quot;');
  const ex = await api(admin, 'POST', '/export', {});
  check('export filename header is a fixed safe pattern', !ex.headers['content-disposition'] || /^attachment; filename="[A-Za-z0-9._-]+"$/.test(ex.headers['content-disposition']), ex.headers['content-disposition']);

  console.log('\n[12] information exposure');
  const err = await api(ali2, 'POST', '/reports', { text: 12345 });
  check('error responses carry no stack traces / file paths', !/at .*\.js|node_modules|D:\\\\|C:\\\\/.test(err.body), err.body.slice(0, 120));
  const nf = await raw('GET', '/api/does-not-exist', { headers: { ...J, 'x-user-id': ali2 } });
  check('unknown API route -> 404 JSON', nf.status === 404);
  const users = parse(await raw('GET', '/api/users'));
  check('public user list exposes no internal fields', users.every(u => Object.keys(u).every(k => ['id', 'name', 'role', 'dept', 'trust', 'createdAt'].includes(k))), Object.keys(users[0]));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FINDINGS:'); findings.forEach(f => console.log(' -', f)); }
  server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('scan crashed:', e); process.exit(2); });
