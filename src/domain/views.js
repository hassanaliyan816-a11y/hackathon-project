// What each role is allowed to see. Every response about an issue is built here, so privacy rules live in one place.
const { MIN, OPEN, HttpError, db, userById } = require('./core');
const { TYPES, PLACES } = require('./campus');
const { importance } = require('./crowd');
const { affected, voteProgress } = require('./voting');

const placeName = issue => { const p = PLACES.find(x => x.id === issue.placeId); return p ? p.name : null; };

function viewIssue(issue, viewer) {
  const imp = importance(issue);
  const mine = issue.supporters.some(s => s.userId === viewer.id);

  // Confidential cases: the admin sees the text but never who wrote it; the reporter sees only a receipt; nobody else sees anything.
  if (issue.confidential) {
    if (viewer.role === 'admin') {
      return { id: issue.id, confidential: true, title: 'Confidential case', status: issue.status, tier: 'critical', score: 100, dept: 'ADMIN', reason: issue.reason,
        texts: issue.reports.map(r => ({ text: r.text, ts: r.ts, reporter: 'Anonymous (identity withheld)' })), history: issue.history, createdAt: issue.createdAt };
    }
    if (viewer.role === 'student' && mine) {
      return { id: issue.id, confidential: true, title: 'Your confidential report', status: issue.status, tier: 'critical', dept: null, mine: true,
        reason: 'Received. Only the admin can see this case. It is not on any public board and no department sees it.', createdAt: issue.createdAt };
    }
    return null;
  }

  const subject = issue.key && issue.key.split('|')[2];
  const v = {
    id: issue.id, confidential: false, title: `${TYPES[issue.type].label}${subject ? ' (' + subject + ')' : ''} - ${placeName(issue)}`,
    type: issue.type, typeLabel: TYPES[issue.type].label, place: placeName(issue), dept: issue.dept, status: issue.status,
    baseTier: imp.baseTier, tier: imp.tier, score: imp.score, supporters: imp.distinct, weightedSupport: imp.weighted, credibleSupporters: imp.credible,
    brigading: imp.brigading, safety: issue.safety, reason: issue.reason, reopenCount: issue.reopenCount, resolvedNote: issue.resolvedNote,
    createdAt: issue.createdAt, mine,
  };
  if (issue.status === 'resolved') v.voteProgress = voteProgress(issue);

  if (viewer.role === 'student') {
    v.canJoin = !mine && OPEN.includes(issue.status);
    v.canVote = issue.status === 'resolved' && affected(issue).some(s => s.userId === viewer.id);
    v.myVote = issue.votes[viewer.id] || null;
    v.history = mine ? issue.history.slice(-8) : undefined;
  } else {
    v.history = issue.history;
    v.texts = issue.reports.map(r => ({ text: r.text, ts: r.ts, reporter: viewer.role === 'admin' ? (userById(r.userId) || {}).name : undefined, injection: r.injection }));
    if (viewer.role === 'admin') v.supporterList = issue.supporters.map(s => { const u = userById(s.userId) || {}; return { name: u.name, trust: u.trust, via: s.via }; });
  }
  return v;
}

const SCOPES = {
  mine: (user, i) => i.supporters.some(s => s.userId === user.id),
  public: (user, i) => !i.confidential && i.status !== 'invalid',
  dept: (user, i) => !i.confidential && (user.role === 'admin' || i.dept === user.dept),
  all: () => true,
  confidential: (user, i) => i.confidential,
};
const SCOPE_ROLES = { dept: ['staff', 'admin'], all: ['admin'], confidential: ['admin'] };

function listIssues(user, scope) {
  if (!Object.prototype.hasOwnProperty.call(SCOPES, scope)) throw new HttpError(400, 'Unknown scope.');
  if (SCOPE_ROLES[scope] && !SCOPE_ROLES[scope].includes(user.role)) throw new HttpError(403, scope === 'dept' ? 'Staff only.' : 'Admin only.');
  return db().issues.filter(i => SCOPES[scope](user, i)).map(i => viewIssue(i, user)).filter(Boolean)
    .sort((a, b) => (b.score || 0) - (a.score || 0) || b.createdAt - a.createdAt);
}

// Issues with the most "me too" joins in the last hour (public data only, never confidential).
function trending() {
  const now = Date.now();
  return db().issues.filter(i => !i.confidential && OPEN.includes(i.status))
    .map(i => ({ i, recent: i.supporters.filter(s => now - s.joinedAt < 60 * MIN).length }))
    .filter(x => x.recent > 0).sort((a, b) => b.recent - a.recent).slice(0, 5)
    .map(x => ({ ...viewIssue(x.i, { id: null, role: 'student' }), recentJoins: x.recent }));
}

module.exports = { viewIssue, listIssues, trending };
