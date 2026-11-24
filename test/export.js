// Word export check: node test/export.js  (writes a sample to the OS temp folder and validates the package)
const os = require('os'), path = require('path'), fs = require('fs');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { }
if (process.env.EXPORT_WITH_AI !== '1') process.env.REPORTFIX_NO_LLM = '1';
process.env.REPORTFIX_DATA = path.join(os.tmpdir(), 'rf-exp-' + process.pid + '.json');
const { start } = require('../src/server');
let pass = 0, fail = 0; const check = (n, c, x) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, x !== undefined ? JSON.stringify(x) : ''); } };
(async () => {
  const s = await start(0); const base = 'http://localhost:' + s.address().port;
  const call = (uid, p, b) => fetch(base + '/api' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': uid || '' }, body: JSON.stringify(b || {}) });
  const U = await (await fetch(base + '/api/users')).json();
  const ali = U.find(u => u.name === 'Ali Raza').id, sara = U.find(u => u.name === 'Sara Khan').id, hamza = U.find(u => u.name === 'Hamza Tariq').id, admin = U.find(u => u.role === 'admin').id, isStaff = U.find(u => u.dept === 'IS').id;
  const rep = async (u, t) => (await (await call(u, '/reports', { text: t })).json());
  const a = await rep(ali, 'Lab 3 mein WiFi nahi chal raha'); await rep(sara, 'wifi down in lab3'); await rep(hamza, 'lab 3 wifi not working');
  await call(isStaff, `/issues/${a.issue.id}/status`, { status: 'resolved', note: 'Replaced the router' });
  await call(ali, `/issues/${a.issue.id}/vote`, { vote: 'confirm' });
  const c = await rep(sara, 'Seniors are ragging juniors in Lab 3'); // confidential
  const r1 = await call(admin, '/export', { ids: [a.issue.id] });
  const buf = Buffer.from(await r1.arrayBuffer());
  check('admin export returns a .docx', r1.status === 200 && /wordprocessingml/.test(r1.headers.get('content-type')) && /\.docx/.test(r1.headers.get('content-disposition')) && buf.slice(0, 2).toString() === 'PK', { s: r1.status });
  fs.writeFileSync(path.join(os.tmpdir(), 'ReportFix-sample.docx'), buf);
  check('student cannot export (403)', (await call(ali, '/export', { ids: [a.issue.id] })).status === 403);
  check('staff cannot export (403)', (await call(isStaff, '/export', {})).status === 403);
  const rc = await call(admin, '/export', { ids: [c.issue.id] }); const cb = Buffer.from(await rc.arrayBuffer());
  fs.writeFileSync(path.join(os.tmpdir(), 'ReportFix-confidential.docx'), cb);
  check('confidential case exportable by admin', rc.status === 200 && cb.length > 1000);
  const ra = await call(admin, '/export', {}); check('export all active issues works', ra.status === 200);
  console.log('  sample:', path.join(os.tmpdir(), 'ReportFix-sample.docx'));
  console.log(`\n${pass} passed, ${fail} failed`); s.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
