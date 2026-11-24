// Triage = AI extracts facts + rules enforce safety/location/injection; code computes priority and department.
const R = require('./rules');
const LLM = require('./llm');
const { PLACES, TYPES, routeDept } = require('./campus');

const clean = s => String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, 1000);

async function triage(rawText) {
  const text = clean(rawText);
  if (text.length < 3) return { status: 'clarify', code: 'empty', message: 'Please describe the problem and where it is.' };

  const inj = R.detectInjection(text);
  const body = inj.stripped.trim();

  // 1) confidential cases never go to the AI provider and never get routed
  if (R.detectHarassment(body)) return confidential(inj.found, 'rules');

  const loc = R.locate(body);
  const ruleSafety = R.detectSafety(body);
  const ruleType = R.detectType(body);

  // 2) AI extraction (best effort)
  const ai = LLM.enabled() ? await LLM.extract(text) : null;
  if (ai && ai.harassment) return confidential(inj.found, 'ai');

  // 3) location: rules are strict, AI fills gaps, code validates against the gazetteer
  let place = null, locProblem = null;
  if (loc.status === 'ok') place = loc.place;
  else if (loc.status === 'unknown') locProblem = { code: 'unknown_place', mention: loc.mention };
  else {
    if (ai && ai.location) place = ai.location;
    else if (loc.status === 'ambiguous') locProblem = { code: 'ambiguous_place', mention: null };
    else if (ai && ai.named_place_not_on_campus) locProblem = { code: 'unknown_place', mention: ai.named_place_not_on_campus };
    else locProblem = { code: 'no_place', mention: null };
  }

  // 4) safety: rules always count; AI safety only trusted when the text had no injection attempt
  let safety = ruleSafety || (!inj.found && ai ? ai.safety_kind : null);
  // AI understands meaning (typos, Roman Urdu); keyword rules are the fallback and the safety floor above
  const aiType = ai && ai.problem_type && ai.problem_type !== 'other' ? ai.problem_type : null;
  let type = safety || aiType || ruleType || 'other';
  if (TYPES[type] && TYPES[type].confidential) type = 'other';

  if (!place) {
    const places = PLACES.map(p => p.name);
    let message;
    if (locProblem.code === 'unknown_place') message = `I could not find "${locProblem.mention}" on campus, so I have not routed this report. Please tell me where exactly it is.`;
    else if (locProblem.code === 'ambiguous_place') message = 'Which lab is it? Please name the exact place (for example Lab 3 or CSE Lab).';
    else message = 'Where exactly is this problem? Please name the place so it goes to the right department.';
    return { status: 'clarify', code: locProblem.code, mention: locProblem.mention, message, places, injection: inj.found, safety: !!safety };
  }

  const tier = TYPES[type].tier;
  const dept = routeDept(place, type);
  const label = TYPES[type].label;
  const reason = (ai && ai.reason) ||
    (safety ? `${label} at ${place.name}: a danger to people, so it is top priority.`
            : `${label} at ${place.name}; routed to ${dept}.`);

  return {
    status: 'ok', confidential: false, place, type, label, tier, dept, safety: !!safety,
    reason, language: ai ? ai.language : 'unknown', injection: inj.found, usedAI: !!ai,
    summary: body.slice(0, 160),
  };
}

function confidential(injection, by) {
  return { status: 'ok', confidential: true, type: 'harassment', label: 'Confidential case', tier: 'critical', dept: 'ADMIN', place: null, safety: false,
    reason: 'Harassment / ragging report: handled confidentially by the admin only.', language: 'unknown', injection, usedAI: by === 'ai', summary: '' };
}

module.exports = { triage };
