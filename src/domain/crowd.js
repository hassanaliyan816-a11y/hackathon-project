// Crowd priority: how many credible, independent students back an issue, and how brand-new accounts piling on are capped.
const { MIN, userById, logEvent } = require('./core');
const { TYPES } = require('./campus');
const { addTrust, trustWeight, ageFactor, isNewAccount } = require('./trust');

const TIER_BASE = { low: 20, medium: 40, high: 60, critical: 100 };

// Each supporter gets a weight from their trust. Three or more brand-new accounts joining within two minutes share a combined weight of 1.
function supporterWeights(issue) {
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
    if (sum > 1) fresh.forEach(x => { x.w = x.w / sum; });
  }
  return { list, brigade };
}

// Priority = the danger of the problem (its base tier). The crowd can lift it one tier, never into "critical",
// and never by one voice: it needs several distinct credible students.
function importance(issue) {
  const base = TYPES[issue.type].tier;
  if (issue.confidential) return { baseTier: base, tier: base, score: TIER_BASE[base], weighted: 0, distinct: 1, credible: 1, brigading: false };
  const { list, brigade } = supporterWeights(issue);
  const W = list.reduce((a, x) => a + x.w, 0);
  const distinct = list.length;
  const credible = list.filter(x => x.u.trust >= 40).length;
  let tier = base;
  if (base === 'low' && distinct >= 3 && credible >= 2 && W >= 3) tier = 'medium';
  else if (base === 'medium' && distinct >= 5 && credible >= 3 && W >= 6) tier = 'high';
  const crowd = base === 'critical' ? Math.min(10, 4 * Math.log2(1 + W)) : Math.min(18, 6 * Math.log2(1 + W));
  return { baseTier: base, tier, score: Math.round((TIER_BASE[tier] + crowd) * 10) / 10, weighted: Math.round(W * 100) / 100, distinct, credible, brigading: brigade };
}

// Flag an issue once, and penalise the brand-new accounts that piled on.
function checkBrigading(issue) {
  if (issue.confidential) return;
  const { list, brigade } = supporterWeights(issue);
  if (brigade && !issue.flags.brigading) {
    issue.flags.brigading = true;
    logEvent(issue, 'Flag: several brand-new accounts joined within two minutes; their combined weight is capped.');
    for (const x of list.filter(x => x.isNew)) addTrust(x.u.id, -2, `Suspected coordinated activity on issue #${issue.id} (brand-new accounts)`, issue.id);
  }
}

module.exports = { supporterWeights, importance, checkBrigading };
