const fs = require('fs');
const path = require('path');

const FILE = process.env.REPORTFIX_DATA || path.join(__dirname, '..', '..', 'data', 'db.json');
let db = null;

const DAY = 86400000;
function seed() {
  const now = Date.now();
  const d = { users: [], issues: [], ledger: [], seq: { issue: 1, user: 1, report: 1, ledger: 1 }, createdAt: now };
  const addUser = (name, role, dept, ageDays, entries = []) => {
    const u = { id: 'u' + d.seq.user++, name, role, dept: dept || null, createdAt: now - ageDays * DAY, trust: 50 };
    d.users.push(u);
    for (const [delta, reason] of entries) {
      d.ledger.push({ id: d.seq.ledger++, userId: u.id, delta, reason: reason + ' (seeded history for demo)', issueId: null, ts: now - ageDays * DAY / 2 });
      u.trust = Math.max(0, Math.min(100, u.trust + delta));
    }
    return u;
  };
  addUser('Ali Raza', 'student', null, 40, [[+10, 'Earlier reports confirmed real by students'], [+10, 'Earlier votes matched the final outcome']]);
  addUser('Sara Khan', 'student', null, 60, [[+20, 'Earlier reports confirmed real by students'], [+15, 'Earlier votes matched the final outcome']]);
  addUser('Hamza Tariq', 'student', null, 20, [[+5, 'One earlier report confirmed real']]);
  addUser('Ayesha Noor', 'student', null, 25, [[-10, 'One earlier report marked invalid by staff']]);
  addUser('Bilal Ahmed', 'student', null, 15, [[-20, 'Earlier spam reports'], [-10, 'Earlier fake report marked invalid']]);
  for (const dept of ['EE', 'CSE', 'IS', 'Library', 'Cafeteria', 'Labs']) addUser(`${dept} Staff`, 'staff', dept, 200);
  addUser('Registrar (Admin)', 'admin', null, 300);
  return d;
}

function load() {
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = seed(); save(); }
  return db;
}
function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch { }
}
function get() { return db || load(); }
function reset() { db = seed(); save(); return db; }

module.exports = { get, save, reset };
