// All counting, rules and permissions live here as plain code (no AI).
const Store = require('./store');
const { triage } = require('./triage');
const { TYPES, TIERS, DEPTS, PLACES, routeDept } = require('./campus');
const LLM = require('./llm');
const { norm } = require('./rules');

const MIN = 60000;
const TIER_BASE = { low: 20, medium: 40, high: 60, critical: 100 };
const OPEN = ['new', 'in_progress', 'reopened'];

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const db = () => Store.get();
const userById = id => db().users.find(u => u.id === id);
const issueById = id => db().issues.find(i => i.id === Number(id));

/* ---------------- trust (every change goes through the ledger) ---------------- */
function addTrust(userId, delta, reason, issueId = null) {
  const u = userById(userId); if (!u || u.role !== 'student') return;
  const before = u.trust;
  u.trust = Math.max(0, Math.min(100, u.trust + delta));
  db().ledger.push({ id: db().seq.ledger++, userId, delta: u.trust - before, requested: delta, reason, issueId, ts: Date.now() });
}
const trustWeight = t => Math.max(0.1, Math.min(2, t / 50));
function ageFactor(u, atTs = Date.now()) { return (atTs - u.createdAt) < 5 * MIN ? 0.5 : 1; }
const isNewAccount = (u, atTs) => (atTs - u.createdAt) < 10 * MIN;

/* ---------------- supporters, weights, brigading ---------------- */
function supporterWeights(issue) {
  // each supporter: {user, joinedAt, weight}. Brand-new accounts that pile on together are capped as a group.
  const list = issue.supporters.map(s => {
    const u = userById(s.userId);
    return u ? { s, u, w: trustWeight(u.trust) * ageFactor(u, s.joinedAt), isNew: isNewAccount(u, s.joinedAt) } : null;
  }).filter(Boolean);
  const fresh = list.filter(x => x.isNew).sort((a, b) => a.s.joinedAt - b.s.joinedAt);
  let brigade = false;
  for (let i = 0; i + 2 < fresh.length; i++) {
    if (fresh[i + 2].s.joinedAt - fresh[i].s.joinedAt <= 2 * MIN) { brigade = true; break; }
  }
  if (brigade) {
    const sum = fresh.reduce((a, x) => a + x.w, 0);
    if (sum > 1) fresh.forEach(x => { x.w = x.w * (1 / sum); });
  }
  return { list, brigade };
}

function importance(issue) {
  const base = TYPES[issue.type].tier;
  if (issue.confidential) return { baseTier: base, tier: base, score: TIER_BASE[base], weighted: 0, distinct: 1, credible: 1, brigading: false };
  const { list, brigade } = supporterWeights(issue);
  const W = list.reduce((a, x) => a + x.w, 0);
  const distinct = list.length;
  const credible = list.filter(x => x.u.trust >= 40).length;
  let tier = base;
  // crowd can lift an issue one tier at a time, never into "critical" (only real danger is critical), never by one voice
  if (base === 'low' && distinct >= 3 && credible >= 2 && W >= 3) tier = 'medium';
  else if (base === 'medium' && distinct >= 5 && credible >= 3 && W >= 6) tier = 'high';
  const crowd = base === 'critical' ? Math.min(10, 4 * Math.log2(1 + W)) : Math.min(18, 6 * Math.log2(1 + W));
  const score = TIER_BASE[tier] + crowd;
  return { baseTier: base, tier, score: Math.round(score * 10) / 10, weighted: Math.round(W * 100) / 100, distinct, credible, brigading: brigade };
}

/* ---------------- votes on resolved issues ---------------- */
function affected(issue) {
  const rt = issue.resolvedAt || 0;
  return issue.supporters.filter(s => s.joinedAt <= rt);
}
function evalVotes(issue) {
  const aff = affected(issue);
  let T = 0, C = 0, D = 0, disputers = 0, confirmers = 0;
  for (const s of aff) {
    const u = userById(s.userId); if (!u) continue;
    const w = trustWeight(u.trust) * ageFactor(u, s.joinedAt);
    T += w;
    const v = issue.votes[s.userId];
    if (v === 'confirm') { C += w; confirmers++; }
    if (v === 'dispute') { D += w; disputers++; }
  }
  const thr = Math.min(1.5, 0.5 * T);
  return { T, C, D, thr, disputers, confirmers, affected: aff.length };
}
function logEvent(issue, text) { issue.history.push({ ts: Date.now(), text }); }

function settleVotes(issue) {
  if (issue.status !== 'resolved') return;
  const ev = evalVotes(issue);
  if (ev.D >= ev.thr && ev.D > ev.C && ev.disputers >= 1) {
    issue.status = 'reopened'; issue.reopenCount++;
    logEvent(issue, `Reopened: affected students disputed the fix (dispute weight ${ev.D.toFixed(2)} vs confirm ${ev.C.toFixed(2)}).`);
    for (const [uid, v] of Object.entries(issue.votes)) {
      if (v === 'dispute') addTrust(uid, +3, `Disputed a fix on issue #${issue.id} and was proven right (issue reopened)`, issue.id);
      if (v === 'confirm') addTrust(uid, -3, `Confirmed a fix on issue #${issue.id} that most affected students disputed`, issue.id);
    }
    issue.votes = {}; issue.resolvedAt = null; issue.resolvedNote = null;
  } else if (ev.C >= ev.thr && ev.C > ev.D && ev.confirmers >= 1) {
    issue.status = 'closed';
    logEvent(issue, `Closed: affected students confirmed the fix (confirm weight ${ev.C.toFixed(2)} vs dispute ${ev.D.toFixed(2)}).`);
    for (const s of issue.supporters) addTrust(s.userId, +2, `Issue #${issue.id} was confirmed real and fixed`, issue.id);
    for (const [uid, v] of Object.entries(issue.votes)) {
      if (v === 'confirm') addTrust(uid, +2, `Confirmed the fix on issue #${issue.id} and the fix held`, issue.id);
      if (v === 'dispute') addTrust(uid, -3, `Disputed a fix on issue #${issue.id} that most students confirmed`, issue.id);
    }
  }
}

/* ---------------- reports ---------------- */
async function submitReport(user, text) {
  if (user.role !== 'student') throw new HttpError(403, 'Only students can submit reports.');
  const d = db(); const now = Date.now();
  const mine = d.issues.flatMap(i => i.reports.filter(r => r.userId === user.id));
  const recent = mine.filter(r => now - r.ts < MIN);
  user._recentAttempts = (user._recentAttempts || []).filter(t => now - t < MIN); user._recentAttempts.push(now);
  if (user._recentAttempts.length > 6) {
    if (!user._spamFlagAt || now - user._spamFlagAt > MIN) { user._spamFlagAt = now; addTrust(user.id, -3, 'Spam: more than 6 reports in one minute'); Store.save(); }
    throw new HttpError(429, 'Too many reports in a minute. Please slow down.', { trust: user.trust });
  }
  const key = norm(text);
  if (mine.some(r => norm(r.text) === key && now - r.ts < 10 * MIN)) {
    addTrust(user.id, -2, 'Spam: sent the same report again within 10 minutes'); Store.save();
    return { outcome: 'duplicate', message: 'You already sent this exact report a moment ago. It was not counted again.' };
  }

  const t = await triage(text);

  if (t.injection) addTrust(user.id, -8, 'Report contained instructions aimed at the system (ignored)');
  if (t.status === 'clarify') { Store.save(); return { outcome: 'clarify', message: t.message, places: t.places, mention: t.mention || null, injection: !!t.injection, code: t.code }; }

  // placeReport is fully synchronous, so grouping can never race with another request
  return placeReport(user, text, t, Date.now());
}

const groupKey = t => `${t.place.id}|${t.type}|${t.subject || ''}`;

function newIssue(user, text, t, now) {
  const d = db();
  const issue = {
    id: d.seq.issue++, key: t.confidential ? null : groupKey(t),
    placeId: t.place ? t.place.id : null, type: t.type, dept: t.dept, confidential: !!t.confidential,
    reason: t.reason, status: 'new', reopenCount: 0, createdAt: now,
    reports: [], supporters: [], votes: {}, resolvedAt: null, resolvedNote: null, history: [], flags: {}, summary: t.summary, safety: !!t.safety,
  };
  d.issues.push(issue);
  logEvent(issue, t.confidential ? 'Confidential case opened.' : `Opened and routed to ${t.dept} (${t.label} at ${t.place.name}).`);
  return issue;
}

function placeReport(user, text, t, now) {
  const d = db();
  const report = { id: d.seq.report++, userId: user.id, text: String(text).slice(0, 1000), ts: now, injection: !!t.injection };
  let issue = null, outcome = 'created';

  if (!t.confidential) {
    const sameKey = d.issues.filter(i => !i.confidential && i.key === groupKey(t));
    issue = sameKey.find(i => OPEN.includes(i.status));
    const resolved = sameKey.find(i => i.status === 'resolved');
    if (!issue && resolved) {
      const isAff = affected(resolved).some(s => s.userId === user.id);
      if (isAff) {
        resolved.reports.push(report);
        resolved.votes[user.id] = 'dispute';
        logEvent(resolved, 'An affected student reported the problem again (counted as a dispute).');
        settleVotes(resolved); Store.save();
        return { outcome: 'dispute_via_report', message: `Issue #${resolved.id} was marked resolved, but you reported it again. This counts as your dispute of the fix.`, issue: viewIssue(resolved, user) };
      }
    }
  }
  if (issue) {
    outcome = 'joined';
    if (issue.supporters.some(s => s.userId === user.id)) {
      Store.save(); return { outcome: 'already_joined', message: `You are already counted on issue #${issue.id}.`, issue: viewIssue(issue, user) };
    }
    issue.reports.push(report);
    issue.supporters.push({ userId: user.id, joinedAt: now, via: 'report' });
    logEvent(issue, 'Another student reported the same problem (counted as "me too").');
  } else {
    issue = newIssue(user, text, t, now);
    issue.reports.push(report);
    issue.supporters.push({ userId: user.id, joinedAt: now, via: 'report' });
  }
  checkBrigading(issue);
  Store.save();
  return { outcome, triage: { dept: t.dept, place: t.place && t.place.name, type: t.label, tier: t.tier, reason: t.reason, language: t.language, usedAI: t.usedAI, injectionIgnored: !!t.injection }, issue: viewIssue(issue, user) };
}

function checkBrigading(issue) {
  if (issue.confidential) return;
  const { list, brigade } = supporterWeights(issue);
  if (brigade && !issue.flags.brigading) {
    issue.flags.brigading = true;
    logEvent(issue, 'Flag: several brand-new accounts joined within two minutes; their combined weight is capped.');
    for (const x of list.filter(x => x.isNew)) addTrust(x.u.id, -2, `Suspected coordinated activity on issue #${issue.id} (brand-new accounts)`, issue.id);
  }
}

function join(user, issueId) {
  const issue = issueById(issueId);
  if (!issue || issue.confidential) throw new HttpError(404, 'Issue not found.');
  if (user.role !== 'student') throw new HttpError(403, 'Only students can join issues.');
  if (!OPEN.includes(issue.status)) throw new HttpError(409, 'This issue is not open for new "me too" votes.');
  if (issue.supporters.some(s => s.userId === user.id)) throw new HttpError(409, 'You already joined this issue.');
  issue.supporters.push({ userId: user.id, joinedAt: Date.now(), via: 'join' });
  logEvent(issue, 'A student joined ("me too").');
  checkBrigading(issue); Store.save();
  return viewIssue(issue, user);
}

function vote(user, issueId, v) {
  const issue = issueById(issueId);
  if (!issue || issue.confidential) throw new HttpError(404, 'Issue not found.');
  if (user.role !== 'student') throw new HttpError(403, 'Only affected students can vote.');
  if (!['confirm', 'dispute'].includes(v)) throw new HttpError(400, 'Vote must be "confirm" or "dispute".');
  if (issue.status !== 'resolved') throw new HttpError(409, 'Voting is only open after staff mark the issue resolved.');
  if (!affected(issue).some(s => s.userId === user.id)) throw new HttpError(403, 'Only students affected by this issue (who reported or joined it before it was resolved) may vote.');
  issue.votes[user.id] = v;
  logEvent(issue, `A student voted: ${v}.`);
  settleVotes(issue); Store.save();
  return viewIssue(issue, user);
}

function setStatus(user, issueId, status, note) {
  const issue = issueById(issueId);
  if (!issue) throw new HttpError(404, 'Issue not found.');
  if (user.role === 'student') throw new HttpError(403, 'Students cannot change issue status.');
  if (user.role === 'staff' && (issue.confidential || issue.dept !== user.dept)) throw new HttpError(403, 'You can only update your own department\'s issues.');
  if (user.role === 'admin' || user.role === 'staff') {
    if (issue.confidential && user.role !== 'admin') throw new HttpError(403, 'Confidential cases are admin-only.');
  }
  const now = Date.now();
  if (status === 'in_progress') {
    if (!['new', 'reopened'].includes(issue.status)) throw new HttpError(409, `Cannot start work from status "${issue.status}".`);
    issue.status = 'in_progress'; logEvent(issue, `${user.name} started work.`);
  } else if (status === 'resolved') {
    if (!OPEN.includes(issue.status)) throw new HttpError(409, `Cannot resolve from status "${issue.status}".`);
    issue.status = 'resolved'; issue.resolvedAt = now; issue.resolvedNote = String(note || '').slice(0, 300) || null; issue.votes = {};
    logEvent(issue, `${user.name} marked it resolved${issue.resolvedNote ? ': ' + issue.resolvedNote : ''}. Affected students are asked to confirm.`);
    if (issue.confidential) { issue.status = 'closed'; logEvent(issue, 'Confidential case closed by admin.'); }
  } else if (status === 'invalid') {
    if (issue.status === 'closed') throw new HttpError(409, 'Already closed.');
    issue.status = 'invalid'; logEvent(issue, `${user.name} marked it invalid / fake.`);
    if (issue.supporters.length) {
      addTrust(issue.supporters[0].userId, -15, `Report on issue #${issue.id} was marked invalid/fake by ${user.role === 'admin' ? 'admin' : user.dept + ' staff'}`, issue.id);
      for (const s of issue.supporters.slice(1)) addTrust(s.userId, -3, `Joined issue #${issue.id} which was marked invalid`, issue.id);
    }
  } else if (status === 'closed' && user.role === 'admin') {
    issue.status = 'closed'; logEvent(issue, 'Closed by admin.');
  } else throw new HttpError(400, 'Unknown status.');
  Store.save();
  return viewIssue(issue, user);
}

function reassign(user, issueId, dept) {
  if (user.role !== 'admin') throw new HttpError(403, 'Only admin can reassign.');
  const issue = issueById(issueId);
  if (!issue || issue.confidential) throw new HttpError(404, 'Issue not found.');
  if (!DEPTS.includes(dept)) throw new HttpError(400, 'Unknown department.');
  issue.dept = dept; logEvent(issue, `Admin reassigned it to ${dept}.`); Store.save();
  return viewIssue(issue, user);
}

/* ---------------- views (what each role may see) ---------------- */
function placeName(i) { const p = PLACES.find(p => p.id === i.placeId); return p ? p.name : null; }

function viewIssue(issue, viewer) {
  const imp = importance(issue);
  const mineSup = issue.supporters.some(s => s.userId === viewer.id);
  if (issue.confidential) {
    if (viewer.role === 'admin') {
      return { id: issue.id, confidential: true, title: 'Confidential case', status: issue.status, tier: 'critical', score: 100, dept: 'ADMIN', reason: issue.reason,
        texts: issue.reports.map(r => ({ text: r.text, ts: r.ts, reporter: 'Anonymous (identity withheld)' })), history: issue.history, createdAt: issue.createdAt };
    }
    if (viewer.role === 'student' && mineSup) {
      return { id: issue.id, confidential: true, title: 'Your confidential report', status: issue.status, tier: 'critical', dept: null, mine: true,
        reason: 'Received. Only the admin can see this case. It is not on any public board and no department sees it.', createdAt: issue.createdAt };
    }
    return null;
  }
  const v = {
    id: issue.id, confidential: false, title: `${TYPES[issue.type].label}${issue.key && issue.key.split('|')[2] ? ' (' + issue.key.split('|')[2] + ')' : ''} - ${placeName(issue)}`, type: issue.type, typeLabel: TYPES[issue.type].label,
    place: placeName(issue), dept: issue.dept, status: issue.status, baseTier: imp.baseTier, tier: imp.tier, score: imp.score,
    supporters: imp.distinct, weightedSupport: imp.weighted, credibleSupporters: imp.credible, brigading: imp.brigading, safety: issue.safety,
    reason: issue.reason, reopenCount: issue.reopenCount, resolvedNote: issue.resolvedNote, createdAt: issue.createdAt, mine: mineSup,
  };
  if (viewer.role === 'student') {
    v.canJoin = !mineSup && OPEN.includes(issue.status);
    v.canVote = issue.status === 'resolved' && affected(issue).some(s => s.userId === viewer.id);
    v.myVote = issue.votes[viewer.id] || null;
    if (issue.status === 'resolved') { const ev = evalVotes(issue); v.voteProgress = { affected: ev.affected, confirms: ev.confirmers, disputes: ev.disputers }; }
    v.history = mineSup ? issue.history.slice(-8) : undefined;
  } else {
    v.history = issue.history;
    v.texts = issue.reports.map(r => ({ text: r.text, ts: r.ts, reporter: viewer.role === 'admin' ? (userById(r.userId) || {}).name : undefined, injection: r.injection }));
    if (viewer.role === 'admin') {
      v.supporterList = issue.supporters.map(s => { const u = userById(s.userId) || {}; return { name: u.name, trust: u.trust, via: s.via }; });
    }
    if (issue.status === 'resolved') { const ev = evalVotes(issue); v.voteProgress = { affected: ev.affected, confirms: ev.confirmers, disputes: ev.disputers }; }
  }
  return v;
}

function listIssues(user, scope) {
  const d = db();
  let items = d.issues;
  if (scope === 'mine') items = items.filter(i => i.supporters.some(s => s.userId === user.id));
  else if (scope === 'public') items = items.filter(i => !i.confidential && !['invalid'].includes(i.status));
  else if (scope === 'dept') {
    if (user.role !== 'staff' && user.role !== 'admin') throw new HttpError(403, 'Staff only.');
    items = items.filter(i => !i.confidential && (user.role === 'admin' || i.dept === user.dept));
  } else if (scope === 'all') {
    if (user.role !== 'admin') throw new HttpError(403, 'Admin only.');
  } else if (scope === 'confidential') {
    if (user.role !== 'admin') throw new HttpError(403, 'Admin only.');
    items = items.filter(i => i.confidential);
  } else throw new HttpError(400, 'Unknown scope.');
  return items.map(i => viewIssue(i, user)).filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0) || b.createdAt - a.createdAt);
}

function trustView(userId) {
  const u = userById(userId); if (!u) throw new HttpError(404, 'No such user.');
  const entries = db().ledger.filter(l => l.userId === userId).sort((a, b) => b.ts - a.ts);
  return { user: { id: u.id, name: u.name, role: u.role, trust: u.trust, weight: Math.round(trustWeight(u.trust) * 100) / 100, createdAt: u.createdAt },
    explanation: `Everyone starts at 50. Score = 50 + sum of the changes below (kept between 0 and 100). Vote/report weight = score/50 (min 0.1, max 2); brand-new accounts count half for their first 5 minutes.`,
    entries };
}

function trending() {
  const now = Date.now();
  return db().issues.filter(i => !i.confidential && OPEN.includes(i.status)).map(i => {
    const recent = i.supporters.filter(s => now - s.joinedAt < 60 * MIN);
    return { i, recent: recent.length };
  }).filter(x => x.recent > 0).sort((a, b) => b.recent - a.recent).slice(0, 5).map(x => ({ ...viewIssue(x.i, { id: null, role: 'student' }), recentJoins: x.recent }));
}

async function adminSummary() {
  const open = db().issues.filter(i => !i.confidential && OPEN.includes(i.status));
  const confidentialCount = db().issues.filter(i => i.confidential && i.status !== 'closed').length;
  const views = open.map(i => ({ ...viewIssue(i, { id: null, role: 'staff', dept: i.dept }) }));
  views.sort((a, b) => b.score - a.score);
  const digest = `Open issues: ${open.length}. Open confidential cases: ${confidentialCount}.\n` +
    views.slice(0, 15).map(v => `#${v.id} [${v.tier}] ${v.title} dept=${v.dept} status=${v.status} students=${v.supporters}${v.reopenCount ? ' reopened x' + v.reopenCount : ''}${v.brigading ? ' SUSPECTED-BRIGADING' : ''}`).join('\n');
  const ai = await LLM.summarize(digest);
  if (ai) return { source: 'ai', text: ai };
  const lines = [`${open.length} open issue(s); ${confidentialCount} open confidential case(s).`];
  views.slice(0, 5).forEach(v => lines.push(`#${v.id} ${v.title} - ${v.tier}, ${v.supporters} student(s), ${v.status}`));
  return { source: 'rules', text: lines.join('\n') };
}

function createStudent(name) {
  name = String(name || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Please enter a name.');
  const u = { id: 'u' + db().seq.user++, name, role: 'student', dept: null, createdAt: Date.now(), trust: 50 };
  db().users.push(u); Store.save();
  return u;
}

module.exports = { HttpError, userById, submitReport, join, vote, setStatus, reassign, listIssues, viewIssue, trustView, trending, adminSummary, createStudent, importance, issueById };
