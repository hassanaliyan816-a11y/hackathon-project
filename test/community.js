// Community-layer checks: confirm/dispute, credibility, auto-close, trust ledger.   node test/community.js
const os = require('os'), path = require('path');
process.env.REPORTFIX_NO_LLM = '1';
process.env.REPORTFIX_VERIFY_MIN = '0.02'; // 1.2 seconds, so the auto-close can be tested quickly
process.env.REPORTFIX_DATA = path.join(os.tmpdir(), 'rf-comm-' + process.pid + '.json');
const { start } = require('../src/server');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, x !== undefined ? JSON.stringify(x) : ''); } };
(async () => {
  const s = await start(0); const base = 'http://localhost:' + s.address().port;
  const call = async (uid, m, p, b) => { const r = await fetch(base + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', 'x-user-id': uid || '' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
  const U = (await call('', 'GET', '/users')).data; const id = n => U.find(u => u.name === n).id; const staff = d => U.find(u => u.dept === d).id;
  const ali = id('Ali Raza'), sara = id('Sara Khan'), hamza = id('Hamza Tariq'), bilal = id('Bilal Ahmed');
  const trust = async u => (await call(u, 'GET', '/users/' + u + '/trust')).data;
  const rep = (u, t) => call(u, 'POST', '/reports', { text: t }).then(r => r.data);
  const status = async (uid, id2) => (await call(uid, 'GET', '/issues?scope=mine')).data.find(i => i.id === id2);
  const resolve = (d, i) => call(staff(d), 'POST', `/issues/${i}/status`, { status: 'resolved', note: 'done' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  console.log('[A] confirmations close an issue and award trust (not auto-closed yet)');
  process.env.REPORTFIX_VERIFY_MIN = '30';
  let r = await rep(ali, 'Lab 1 projector not working'); const A = r.issue.id; await rep(sara, 'lab 1 projector band hai'); await resolve('Labs', A);
  const t0 = (await trust(ali)).user.trust;
  await call(ali, 'POST', `/issues/${A}/vote`, { vote: 'confirm' }); const v = await call(sara, 'POST', `/issues/${A}/vote`, { vote: 'confirm' });
  check('two confirms close the issue', v.data.status === 'closed', v.data.status);
  const t1 = await trust(ali); check('confirmer gains trust, ledger explains it', t1.user.trust > t0 && /fix/i.test(t1.entries[0].reason), t1.entries.slice(0, 2));

  console.log('[B] only affected students may vote or join after a fix');
  r = await rep(ali, 'Lab 2 AC not working'); const B = r.issue.id; await resolve('Labs', B);
  check('join after resolved blocked (409)', (await call(hamza, 'POST', `/issues/${B}/join`)).status === 409);
  check('non-affected vote blocked (403)', (await call(hamza, 'POST', `/issues/${B}/vote`, { vote: 'dispute' })).status === 403);

  console.log('[C] a lone very-low-trust voice cannot reopen a fix');
  r = await rep(bilal, 'Lab 4 chair is broken'); const C = r.issue.id; await resolve('Labs', C);
  const bt = (await trust(bilal)).user.trust;
  const dv = await call(bilal, 'POST', `/issues/${C}/vote`, { vote: 'dispute' });
  check(`trust ${bt} (<30): dispute recorded but issue stays resolved`, bt < 30 && dv.data.status === 'resolved', { bt, s: dv.data.status });

  console.log('[D] a credible dispute still reopens');
  r = await rep(ali, 'Lab 3 window is broken'); const D = r.issue.id; await resolve('Labs', D);
  const d1 = await call(ali, 'POST', `/issues/${D}/vote`, { vote: 'dispute' });
  check('trust >= 30 sole affected student reopens', d1.data.status === 'reopened', d1.data.status);

  console.log('[E] resolved + nobody credibly disputes -> auto-closes after the window');
  process.env.REPORTFIX_VERIFY_MIN = '0.02';
  r = await rep(sara, 'Library AC not working'); const E = r.issue.id; await resolve('Library', E);
  check('still resolved immediately', (await status(sara, E)).status === 'resolved');
  await sleep(1500);
  const e1 = await status(sara, E); check('closed automatically after the window', e1.status === 'closed', e1.status);
  const lowC = await status(bilal, C); check('issue with only a non-credible dispute also auto-closes', lowC.status === 'closed', lowC.status);
  const ae = (await call(U.find(u => u.role === 'admin').id, 'GET', '/issues?scope=dept')).data.find(i => i.id === E);
  check('history says why it closed', ae.history.some(h => /automatically/i.test(h.text)));

  console.log('[F] staff marking a report fake costs the reporter trust');
  r = await rep(hamza, 'Lab 5 window broken'); const F = r.issue.id; const b4 = (await trust(hamza)).user.trust;
  await call(staff('Labs'), 'POST', `/issues/${F}/status`, { status: 'invalid' });
  check('reporter loses trust', (await trust(hamza)).user.trust < b4);

  console.log(`\n${pass} passed, ${fail} failed`); s.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
