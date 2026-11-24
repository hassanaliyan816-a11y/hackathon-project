// Deterministic text rules (English + Roman Urdu). Used as a safety floor and as the fallback when AI is unavailable.
const { PLACES } = require('./campus');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/(.)\1{2,}/g, '$1$1') // soooo -> soo
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------- prompt-injection ---------------- */
const INJECTION = [
  /\b(ignore|disregard|forget|bypass|override|skip)\b[^.!?\n]{0,40}\b(instructions?|rules?|prompts?|guidelines?|polic(?:y|ies)|safeguards?|filters?)\b/gi,
  /\b(mark|set|make|label|classify|treat|flag|rate|escalate|route|put)\b[^.!?\n]{0,30}\b(as|to|into)?\s*(critical|urgent|top|highest|p1|priority|emergency|high)\b[^.!?\n]{0,20}/gi,
  /\bpriority\s*(?:is|=|:|to)\s*(critical|high|p1|urgent|top)\b/gi,
  /\b(system\s*prompt|developer\s*mode|jailbreak|you\s+are\s+now|new\s+instructions?|act\s+as|pretend\s+(?:to\s+be|you)|admin\s*mode|sudo|as\s+an?\s+ai)\b/gi,
  /\b(reset|delete|wipe)\s+(all\s+)?(data|database|users?)\b/gi,
  /\b(increase|raise|boost|set|give)\s+(my\s+)?trust(\s*score)?\b/gi,
  /\b(make|give)\s+me\s+(an?\s+)?admin\b/gi,
  /\b(forward|send|redirect|reroute|delete|remove|close|resolve|merge)\b[^.!?\n]{0,40}\b(this\s+report|this\s+issue|all\s+(?:the\s+)?(?:issues|reports)|(?:the\s+)?\w+\s+issues)\b[^.!?\n]{0,40}/gi,
  /<\/?\s*(system|assistant|report|instructions?)\s*>/gi,
  /\b(pichli|purani)\s+hidayat\w*\s+(ignore|bhool)\w*/gi,
  /\b(rules?|hidayat\w*)\s+(ignore|bhool|nazar\s*andaz)\w*/gi,
];

function detectInjection(text) {
  let stripped = String(text || '');
  let found = false;
  for (const re of INJECTION) {
    re.lastIndex = 0;
    if (re.test(stripped)) { found = true; re.lastIndex = 0; stripped = stripped.replace(re, ' '); }
  }
  return { found, stripped };
}

/* ---------------- safety / harassment ---------------- */
const SAFETY_RULES = [
  ['fire', /\b(fire|fires|aag|aaag|flames?|smoke|smoking|dhuan|dhuaan|dhua|burning smell|burnt smell|smell of burning|something (?:is )?burning|jal raha|jal rahi|jalne ki)\b/],
  ['gas', /\b(gas\s*(?:leak\w*|smell\w*|ki\s*bu|lik|lick|rissa?|baas|escape)|smell\w*\s*(?:of\s*)?gas|leak\w*\s*gas|lpg|cylinder|gas\s+(?:se|ki)\s+bu)\b/],
  ['electrical_hazard', /\b(sparks?|sparking|spark\s+ho|short\s*circuit|shock|shocked|jhatka|current\s+lag\w*|electric\s+shock|exposed\s+wires?|naked\s+wires?|wires?\s+nikl\w*|taar\s+nikl\w*|electrocut\w*)\b/],
  ['medical', /\b(faint(?:ed|ing)?|unconscious|behosh|collaps(?:ed|e)|medical|ambulance|injur(?:ed|y)|zakhmi|bleeding|khoon|seizure|heart\s*attack|chok(?:ed|ing)|cant\s*breathe|cannot\s*breathe|saans|allergic\s*reaction|food\s*poison\w*|vomit\w*|ulti|fracture|broken\s*(?:leg|arm|bone))\b/],
  ['structural', /\b(ceiling\s*(?:fell|fall\w*|collaps\w*|gir\w*)|chhat\s*gir\w*|wall\s*(?:cracks?|crack\w*|fell|collaps\w*)|building\s*(?:shak\w*|collaps\w*)|earthquake|zalzala|roof\s*(?:fell|collaps\w*|leak\w* danger))\b/],
];
function detectSafety(text) {
  const t = norm(text);
  for (const [kind, re] of SAFETY_RULES) if (re.test(t)) return kind;
  return null;
}

const HARASS = /\b(harass\w*|ragg(?:ing|ed)|rag\s+(?:me|us|karna|kar)\w*|bull(?:y|ies|ied|ying)|eve\s*teas\w*|stalk\w*|blackmail\w*|molest\w*|sexual\w*|inappropriate\w*\s*(?:touch\w*|messages?|comments?)|touch(?:ed|ing)\s+me|threat(?:en|ens|ened|ening)\w*|dhamki\w*|tang\s*kar\w*|pareshan\s*kar\w*|ghoor\w*|chheda\w*|chhed\s*chhad|abus(?:e|ed|ing)\s+(?:me|us)|forced\s+me)\b/;
function detectHarassment(text) { return HARASS.test(norm(text)); }

/* ---------------- problem type ---------------- */
const TYPE_RULES = [
  ['network', /\b(wi\s*fi|wifi|wi-fi|internet|network|lan|ethernet|router|net\s+(?:nahi|nai|slow|down|band|chal|issue)|connectivity|bandwidth|no\s+signal|hotspot)\b/],
  ['ac', /\b(a\s*c|ac|air\s*condition\w*|aircon|cooling|cooler|thanda|thandi|garmi|garam|tapish|sweating|suffocat\w*|humid)\b/],
  ['projector', /\b(proj\w*|beamer|multimedia|smart\s*board|display\s+(?:not|nahi|nai))\b/],
  ['power', /\b(power|bijli|electricity|load\s*shedding|outage|blackout|no\s+light\w*|lights?|bulbs?|tube\s*lights?|ups|fans?|switch\w*|sockets?|plugs?|current\s+(?:nahi|nai|gaya|chali))\b/],
  ['water', /\b(water|pani|paani|taps?|leak\w*|seepage|plumb\w*|flood\w*|drain\w*|pipe\w*|cooler\s+water)\b/],
  ['cleanliness', /\b(dirty|clean\w*|ganda|gandi|gandagi|safai|garbage|kachra|dustbins?|trash|washrooms?|toilets?|bathrooms?|stink\w*|bad\s+smell|smell\w*|insects?|cockroach\w*|rats?|flies|dust\w*|mosquito\w*)\b/],
  ['equipment', /\b(computers?|pcs?|keyboards?|mouse|monitors?|printers?|scanners?|lcd|machines?|equipment|oscilloscopes?|microscopes?|laptops?|systems?\s+(?:hang|slow|not)|software)\b/],
  ['food', /\b(food|khana|khaana|chai|tea|rice|chawal|burger|meal|stale|expired|rotten|juice|samosa|roti|menu|overpriced|mehnga|mehngi|canteen)\b/],
  ['books', /\b(books?|kitab\w*|librarian|journals?|catalog\w*|reading\s+room|borrow\w*|library\s+card)\b/],
  ['noise', /\b(noise|noisy|shor|loud|music|speaker\w*)\b/],
  ['security', /\b(theft|stolen|steal\w*|chori|lost|missing|security\s+guard|guard|cctv|suspicious)\b/],
  ['furniture', /\b(chairs?|tables?|desks?|bench\w*|kursi|mez|khirki|khidki|darwaza\w*|shisha|glass|broken\s+(?:door|window|lock)|doors?|windows?|locks?|whiteboard|board|ceiling\s+fan)\b/],
];

function detectTypeDetail(text) {
  const t = norm(text);
  let best = null;
  for (const [type, re] of TYPE_RULES) {
    const m = re.exec(t);
    if (m && (best === null || m.index < best.index)) best = { type, index: m.index, word: m[0] };
  }
  return best;
}
function detectType(text) { const b = detectTypeDetail(text); return b ? b.type : null; }

// Short normalised "thing that is broken" used to keep different problems apart (chair vs window vs printer).
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'in', 'at', 'on', 'of', 'ka', 'ki', 'ke', 'me', 'mein', 'hai', 'hain', 'nahi', 'not', 'and', 'to', 'for', 'lab', 'library', 'cafeteria', 'block', 'cse', 'ee', 'is', 'bohat', 'very', 'please', 'plz', 'this', 'that', 'there', 'it', 'has', 'have', 'been', 'was', 'with']);
const ALIAS = { khirki: 'window', khidki: 'window', shisha: 'window', glass: 'window', windows: 'window', darwaza: 'door', darwazah: 'door', kursi: 'chair', kursiyan: 'chair', mez: 'table', pankha: 'fan', kachra: 'garbage', trash: 'garbage', dustbin: 'garbage', gandagi: 'smell', stink: 'smell', bu: 'smell', computer: 'pc', computers: 'pc', laptop: 'pc', pcs: 'pc', nalka: 'tap', paani: 'water', pani: 'water', kitaab: 'book', kitab: 'book', books: 'book' };
function normSubject(s) {
  let w = norm(s).replace(/[^a-z\s]/g, ' ').split(' ').filter(x => x && !STOP.has(x));
  let x = (w[0] || '');
  if (x.length > 3 && x.endsWith('s') && !x.endsWith('ss')) x = x.slice(0, -1);
  x = ALIAS[x] || x;
  return x.slice(0, 20);
}
function fallbackSubject(text, detail) {
  if (detail && detail.word) return normSubject(detail.word);
  const words = norm(text).replace(/\d+/g, ' ').split(' ').filter(x => x.length > 3 && !STOP.has(x));
  return normSubject(words[0] || '');
}

/* ---------------- location ---------------- */
const NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ek: 1, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chay: 6 };
const placeByName = name => PLACES.find(p => p.name.toLowerCase() === String(name || '').toLowerCase().trim()) || null;
const placeById = id => PLACES.find(p => p.id === id) || null;

const UNKNOWN_WORDS = /\b(hostel|hostels|gym|gymnasium|swimming\s*pool|pool|parking|mosque|masjid|auditorium|main\s*gate|gate|ground|playground|rooftop|roof\s*top|helipad|basement|bank|cinema|hogwarts|mall|stadium|garden|park|bus\s*stop|clinic|dispensary|registrar|admin\s*block|admin\s*office|mechanical|civil|chemistry|physics|bio\w*)\b/;

function locate(text) {
  const t = norm(text);
  const hits = []; // {pos, place}
  let unknown = null;
  let sawBareLab = false;

  // numbered labs
  const reLab = /\b(?:cse\s*|ee\s*|is\s*)?lab(?:oratory|s)?\s*(?:no|number|num|nmbr|room)?\s*(\d{1,3}|one|two|three|four|five|six|ek|teen|char|chaar|panch|paanch|chay)\b/g;
  let m;
  while ((m = reLab.exec(t))) {
    const raw = m[1];
    const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : NUMWORD[raw];
    if (n >= 1 && n <= 6) hits.push({ pos: m.index, place: placeById('lab' + n) });
    else if (!unknown) unknown = `Lab ${raw}`;
  }
  const add = (re, id) => { const x = re.exec(t); if (x) hits.push({ pos: x.index, place: placeById(id) }); };
  const hasNumberedLab = hits.length > 0 || unknown;
  if (!hasNumberedLab) {
    add(/\bcse\s*(?:lab|laboratory)\b/, 'cse-lab');
    add(/\bee\s*(?:lab|laboratory)\b/, 'ee-lab');
    add(/\binformation\s*systems?\s*lab\w*\b/, 'is-lab');
    if (/\bIS[\s-]*lab\b/.test(String(text))) hits.push({ pos: 0, place: placeById('is-lab') });
  }
  add(/\bcse\s*(?:block|building|bldg|department|dept)\b/, 'cse-block');
  add(/\bee\s*(?:block|building|bldg|department|dept)\b/, 'ee-block');
  add(/\binformation\s*systems?\s*(?:block|building|department|dept)\b/, 'is-block');
  if (/\bIS[\s-]*(?:block|building|department|dept)\b/.test(String(text))) hits.push({ pos: 0, place: placeById('is-block') });
  add(/\b(?:library|lib|kutub\s*khana|kitab\s*khana)\b/, 'library');
  add(/\b(?:cafeteria|cafe|canteen|mess)\b/, 'cafeteria');

  if (!hasNumberedLab && !hits.length && /\blabs?\b/.test(t)) sawBareLab = true;

  // places that clearly are not on our campus
  if (!unknown) {
    const b1 = /\bblock\s+([a-z0-9]{1,2})\b/.exec(t);
    const b2 = /\b([b-z])\s+block\b/.exec(t);
    if (b1 && !['of', 'is', 'in', 'ka', 'ke', 'ki', 'se', 'me', 'my', 'no', 'to', 'mein'].includes(b1[1])) unknown = `Block ${b1[1].toUpperCase()}`;
    else if (b2) unknown = `${b2[1].toUpperCase()} Block`;
    else { const u = UNKNOWN_WORDS.exec(t); if (u) unknown = u[1]; }
  }

  if (hits.length) {
    hits.sort((a, b) => a.pos - b.pos);
    return { status: 'ok', place: hits[0].place, alsoMentioned: hits.slice(1).map(h => h.place.name) };
  }
  if (unknown) return { status: 'unknown', mention: unknown };
  if (sawBareLab) return { status: 'ambiguous', hint: 'You mentioned a lab but not which one.' };
  return { status: 'none' };
}

module.exports = { norm, normSubject, fallbackSubject, detectTypeDetail, detectInjection, detectSafety, detectHarassment, detectType, locate, placeByName, placeById };
