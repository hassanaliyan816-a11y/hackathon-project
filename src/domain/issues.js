// The life of an issue: reports come in, similar reports are grouped, staff work on them, students verify.
const { MIN, OPEN, HttpError, db, save, issueById, logEvent } = require('./core');
const { DEPTS } = require('./campus');
const { triage } = require('../triage/triage');
const { norm } = require('../triage/rules');
const { addTrust } = require('./trust');
const { checkBrigading } = require('./crowd');
const { affected, settleVotes } = require('./voting');
const { viewIssue } = require('./views');

const groupKey = t => `${t.place.id}|${t.type}|${t.subject || ''}`;

function newIssue(t, now) {
  const issue = {
    id: db().seq.issue++, key: t.confidential ? null : groupKey(t),
    placeId: t.place ? t.place.id : null, type: t.type, dept: t.dept, confidential: !!t.confidential,
    reason: t.reason, status: 'new', reopenCount: 0, createdAt: now,
    reports: [], supporters: [], votes: {}, resolvedAt: null, resolvedNote: null, history: [], flags: {}, summary: t.summary, safety: !!t.safety,
  };
  db().issues.push(issue);
  logEvent(issue, t.confidential ? 'Confidential case opened.' : `Opened and routed to ${t.dept} (${t.label} at ${t.place.name}).`);
  return issue;
}

/* ---------- reports ---------- */

// Student submits text: spam checks, then AI + rules triage, then grouping into an issue.
async function submitReport(user, rawText) {
  if (user.role !== 'student') throw new HttpError(403, 'Only students can submit reports.');
  const text = typeof rawText === 'string' ? rawText : '';
  const now = Date.now();

  // more than 6 attempts in a minute is spam
  user._recentAttempts = (user._recentAttempts || []).filter(t => now - t < MIN); user._recentAttempts.push(now);
  if (user._recentAttempts.length > 6) {
    if (!user._spamFlagAt || now - user._spamFlagAt > MIN) { user._spamFlagAt = now; addTrust(user.id, -3, 'Spam: more than 6 reports in one minute'); save(); }
    throw new HttpError(429, 'Too many reports in a minute. Please slow down.', { trust: user.trust });
  }
  // the same text again within 10 minutes is a duplicate
  const mine = db().issues.flatMap(i => i.reports.filter(r => r.userId === user.id));
  const key = norm(text);
  if (key && mine.some(r => norm(r.text) === key && now - r.ts < 10 * MIN)) {
    addTrust(user.id, -2, 'Spam: sent the same report again within 10 minutes'); save();
    return { outcome: 'duplicate', message: 'You already sent this exact report a moment ago. It was not counted again.' };
  }

  const t = await triage(text);
  if (t.injection) addTrust(user.id, -8, 'Report contained instructions aimed at the system (ignored)');
  if (t.status === 'clarify') { save(); return { outcome: 'clarify', message: t.message, places: t.places, mention: t.mention || null, injection: !!t.injection, code: t.code }; }

  // placeReport is fully synchronous, so grouping can never race with another request
  return placeReport(user, text, t, Date.now());
}

function placeReport(user, text, t, now) {
  const report = { id: db().seq.report++, userId: user.id, text: String(text).slice(0, 1000), ts: now, injection: !!t.injection };
  let issue = null, outcome = 'created';

  if (!t.confidential) {
    const sameKey = db().issues.filter(i => !i.confidential && i.key === groupKey(t));
    issue = sameKey.find(i => OPEN.includes(i.status));
    const resolved = sameKey.find(i => i.status === 'resolved');
    // an affected student reporting a "resolved" problem again counts as disputing the fix
    if (!issue && resolved && affected(resolved).some(s => s.userId === user.id)) {
      resolved.reports.push(report);
      resolved.votes[user.id] = 'dispute';
      logEvent(resolved, 'An affected student reported the problem again (counted as a dispute).');
      settleVotes(resolved); save();
      return { outcome: 'dispute_via_report', message: `Issue #${resolved.id} was marked resolved, but you reported it again. This counts as your dispute of the fix.`, issue: viewIssue(resolved, user) };
    }
  }
  if (issue) {
    outcome = 'joined';
    if (issue.supporters.some(s => s.userId === user.id)) { save(); return { outcome: 'already_joined', message: `You are already counted on issue #${issue.id}.`, issue: viewIssue(issue, user) }; }
    logEvent(issue, 'Another student reported the same problem (counted as "me too").');
  } else issue = newIssue(t, now);
  issue.reports.push(report);
  issue.supporters.push({ userId: user.id, joinedAt: now, via: 'report' });
  checkBrigading(issue); save();
  return { outcome, triage: { dept: t.dept, place: t.place && t.place.name, type: t.label, tier: t.tier, reason: t.reason, language: t.language, usedAI: t.usedAI, injectionIgnored: !!t.injection }, issue: viewIssue(issue, user) };
}

/* ---------- "me too" and verification votes ---------- */

function join(user, issueId) {
  const issue = issueById(issueId);
  if (!issue || issue.confidential) throw new HttpError(404, 'Issue not found.');
  if (user.role !== 'student') throw new HttpError(403, 'Only students can join issues.');
  if (!OPEN.includes(issue.status)) throw new HttpError(409, 'This issue is not open for new "me too" votes.');
  if (issue.supporters.some(s => s.userId === user.id)) throw new HttpError(409, 'You already joined this issue.');
  issue.supporters.push({ userId: user.id, joinedAt: Date.now(), via: 'join' });
  logEvent(issue, 'A student joined ("me too").');
  checkBrigading(issue); save();
  return viewIssue(issue, user);
}

function vote(user, issueId, choice) {
  const issue = issueById(issueId);
  if (!issue || issue.confidential) throw new HttpError(404, 'Issue not found.');
  if (user.role !== 'student') throw new HttpError(403, 'Only affected students can vote.');
  if (!['confirm', 'dispute'].includes(choice)) throw new HttpError(400, 'Vote must be "confirm" or "dispute".');
  if (issue.status !== 'resolved') throw new HttpError(409, 'Voting is only open after staff mark the issue resolved.');
  if (!affected(issue).some(s => s.userId === user.id)) throw new HttpError(403, 'Only students affected by this issue (who reported or joined it before it was resolved) may vote.');
  issue.votes[user.id] = choice;
  logEvent(issue, `A student voted: ${choice}.`);
  settleVotes(issue); save();
  return viewIssue(issue, user);
}

/* ---------- staff and admin actions ---------- */

function setStatus(user, issueId, status, note) {
  const issue = issueById(issueId);
  if (!issue) throw new HttpError(404, 'Issue not found.');
  if (user.role === 'student') throw new HttpError(403, 'Students cannot change issue status.');
  if (user.role === 'staff' && (issue.confidential || issue.dept !== user.dept)) throw new HttpError(403, 'You can only update your own department\'s issues.');
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
  save();
  return viewIssue(issue, user);
}

function reassign(user, issueId, dept) {
  if (user.role !== 'admin') throw new HttpError(403, 'Only admin can reassign.');
  const issue = issueById(issueId);
  if (!issue || issue.confidential) throw new HttpError(404, 'Issue not found.');
  if (!DEPTS.includes(dept)) throw new HttpError(400, 'Unknown department.');
  issue.dept = dept; logEvent(issue, `Admin reassigned it to ${dept}.`); save();
  return viewIssue(issue, user);
}

module.exports = { submitReport, join, vote, setStatus, reassign };
