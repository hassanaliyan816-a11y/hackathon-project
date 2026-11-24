// Trust scores. Every change goes through the ledger so any score can be explained.
const { MIN, HttpError, db, userById } = require('./core');

function addTrust(userId, delta, reason, issueId = null) {
  const u = userById(userId);
  if (!u || u.role !== 'student') return;
  const before = u.trust;
  u.trust = Math.max(0, Math.min(100, u.trust + delta));
  db().ledger.push({ id: db().seq.ledger++, userId, delta: u.trust - before, requested: delta, reason, issueId, ts: Date.now() });
}

// How much a student's report or vote counts: score/50, between 0.1 and 2. Brand-new accounts count half for 5 minutes.
const trustWeight = trust => Math.max(0.1, Math.min(2, trust / 50));
const ageFactor = (user, atTs = Date.now()) => ((atTs - user.createdAt) < 5 * MIN ? 0.5 : 1);
const isNewAccount = (user, atTs) => (atTs - user.createdAt) < 10 * MIN;

function trustView(userId) {
  const u = userById(userId);
  if (!u) throw new HttpError(404, 'No such user.');
  const entries = db().ledger.filter(l => l.userId === userId).sort((a, b) => b.ts - a.ts);
  return {
    user: { id: u.id, name: u.name, role: u.role, trust: u.trust, weight: Math.round(trustWeight(u.trust) * 100) / 100, createdAt: u.createdAt },
    explanation: 'Everyone starts at 50. Score = 50 + sum of the changes below (kept between 0 and 100). Vote/report weight = score/50 (min 0.1, max 2); brand-new accounts count half for their first 5 minutes.',
    entries,
  };
}

module.exports = { addTrust, trustWeight, ageFactor, isNewAccount, trustView };
