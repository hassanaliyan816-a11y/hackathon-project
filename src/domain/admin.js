// Admin-only tools: the AI briefing and the data behind the Word export.
const { OPEN, HttpError, db, issueById } = require('./core');
const { viewIssue } = require('./views');
const { evalVotes } = require('./voting');
const LLM = require('../ai/llm');

async function adminSummary() {
  const open = db().issues.filter(i => !i.confidential && OPEN.includes(i.status));
  const confidentialCount = db().issues.filter(i => i.confidential && i.status !== 'closed').length;
  const views = open.map(i => viewIssue(i, { id: null, role: 'staff', dept: i.dept })).sort((a, b) => b.score - a.score);
  const digest = `Open issues: ${open.length}. Open confidential cases: ${confidentialCount}.\n` +
    views.slice(0, 15).map(v => `#${v.id} [${v.tier}] ${v.title} dept=${v.dept} status=${v.status} students=${v.supporters}${v.reopenCount ? ' reopened x' + v.reopenCount : ''}${v.brigading ? ' SUSPECTED-BRIGADING' : ''}`).join('\n');
  const ai = await LLM.summarize(digest);
  if (ai) return { source: 'ai', text: ai };
  const lines = [`${open.length} open issue(s); ${confidentialCount} open confidential case(s).`];
  views.slice(0, 5).forEach(v => lines.push(`#${v.id} ${v.title} - ${v.tier}, ${v.supporters} student(s), ${v.status}`));
  return { source: 'rules', text: lines.join('\n') };
}

// Full views plus verification figures for the Word export. With no ids: every active non-confidential issue.
function exportViews(user, ids) {
  if (user.role !== 'admin') throw new HttpError(403, 'Only the admin can export reports.');
  let issues;
  if (Array.isArray(ids) && ids.length) {
    issues = ids.slice(0, 25).map(n => issueById(n)).filter(Boolean);
    if (!issues.length) throw new HttpError(404, 'Issue not found.');
  } else issues = db().issues.filter(i => !i.confidential && ['new', 'in_progress', 'reopened', 'resolved'].includes(i.status));
  if (!issues.length) throw new HttpError(404, 'There are no active issues to export.');
  return issues.slice(0, 25).map(i => {
    const v = viewIssue(i, user);
    if (!i.confidential && ['resolved', 'closed'].includes(i.status)) { const ev = evalVotes(i); v.verification = { affected: ev.affected, confirms: ev.confirmers, disputes: ev.disputers }; }
    return v;
  });
}

module.exports = { adminSummary, exportViews };
