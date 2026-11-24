// Verification of fixes. After staff mark an issue resolved, the students it affected confirm or dispute it.
const { MIN, db, save, userById, logEvent } = require('./core');
const { addTrust, trustWeight, ageFactor } = require('./trust');

// A fix can only be reopened if at least one disputer is credible; a lone very-low-trust voice cannot do it.
const CREDIBLE_TRUST = 30;
// If nobody credibly disputes a resolved fix within this window it closes (silence = the fix stands). Adjustable, in minutes.
const verifyMs = () => (parseFloat(process.env.REPORTFIX_VERIFY_MIN) || 30) * MIN;

// Only students who reported or joined before the fix was marked resolved may vote.
const affected = issue => issue.supporters.filter(s => s.joinedAt <= (issue.resolvedAt || 0));

function evalVotes(issue) {
  const aff = affected(issue);
  let T = 0, C = 0, D = 0, disputers = 0, confirmers = 0, credibleDisputers = 0;
  for (const s of aff) {
    const u = userById(s.userId); if (!u) continue;
    const w = trustWeight(u.trust) * ageFactor(u, s.joinedAt);
    T += w;
    const v = issue.votes[s.userId];
    if (v === 'confirm') { C += w; confirmers++; }
    if (v === 'dispute') { D += w; disputers++; if (u.trust >= CREDIBLE_TRUST) credibleDisputers++; }
  }
  return { T, C, D, thr: Math.min(1.5, 0.5 * T), disputers, confirmers, credibleDisputers, affected: aff.length };
}

// The numbers shown to people for an issue that is awaiting verification.
function voteProgress(issue) {
  const ev = evalVotes(issue);
  return { affected: ev.affected, confirms: ev.confirmers, disputes: ev.disputers, autoCloseMin: Math.max(0, Math.ceil((issue.resolvedAt + verifyMs() - Date.now()) / MIN)) };
}

// Reopen on enough credible disputes, close on enough confirmations. Trust moves to whoever turned out right.
function settleVotes(issue) {
  if (issue.status !== 'resolved') return;
  const ev = evalVotes(issue);
  if (ev.D >= ev.thr && ev.D > ev.C && ev.credibleDisputers >= 1) {
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

// Called on every API request: close resolved issues nobody credibly disputed within the verification window.
function tick() {
  const now = Date.now(); let changed = false;
  for (const i of db().issues) {
    if (i.status !== 'resolved' || !i.resolvedAt || now - i.resolvedAt < verifyMs()) continue;
    i.status = 'closed';
    logEvent(i, `Closed automatically: no credible dispute within ${Math.round(verifyMs() / MIN * 10) / 10} minute(s) of the fix being reported.`);
    for (const [uid, v] of Object.entries(i.votes)) if (v === 'confirm') addTrust(uid, +2, `Confirmed the fix on issue #${i.id} and nobody credibly disputed it`, i.id);
    changed = true;
  }
  if (changed) save();
}

module.exports = { verifyMs, affected, evalVotes, voteProgress, settleVotes, tick };
