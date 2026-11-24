// Campus gazetteer + routing tables. This is OUR assumed campus (the problem statement gives none).
const DEPTS = ['EE', 'CSE', 'IS', 'Library', 'Cafeteria', 'Labs'];

const PLACES = [
  ...[1, 2, 3, 4, 5, 6].map(n => ({ id: `lab${n}`, name: `Lab ${n}`, dept: 'Labs' })),
  { id: 'cse-lab', name: 'CSE Lab', dept: 'CSE' },
  { id: 'ee-lab', name: 'EE Lab', dept: 'EE' },
  { id: 'is-lab', name: 'IS Lab', dept: 'IS' },
  { id: 'cse-block', name: 'CSE Block', dept: 'CSE' },
  { id: 'ee-block', name: 'EE Block', dept: 'EE' },
  { id: 'is-block', name: 'IS Block', dept: 'IS' },
  { id: 'library', name: 'Library', dept: 'Library' },
  { id: 'cafeteria', name: 'Cafeteria', dept: 'Cafeteria' },
];

const TYPES = {
  // safety (always critical)
  fire:               { label: 'Fire / smoke',            tier: 'critical', safety: true },
  gas:                { label: 'Gas leak',                tier: 'critical', safety: true },
  electrical_hazard:  { label: 'Electrical hazard',       tier: 'critical', safety: true },
  medical:            { label: 'Medical emergency',       tier: 'critical', safety: true },
  structural:         { label: 'Structural danger',       tier: 'critical', safety: true },
  // ordinary
  power:      { label: 'Power / lighting outage', tier: 'high' },
  water:      { label: 'Water / plumbing',        tier: 'medium' },
  network:    { label: 'WiFi / network',          tier: 'medium' },
  ac:         { label: 'AC / cooling',            tier: 'medium' },
  projector:  { label: 'Projector / display',     tier: 'medium' },
  equipment:  { label: 'Equipment / computers',   tier: 'medium' },
  food:       { label: 'Food quality / hygiene',  tier: 'medium' },
  security:   { label: 'Security / theft',        tier: 'medium' },
  cleanliness:{ label: 'Cleanliness',             tier: 'low' },
  furniture:  { label: 'Furniture / fixtures',    tier: 'low' },
  books:      { label: 'Books / library service', tier: 'low' },
  noise:      { label: 'Noise',                   tier: 'low' },
  other:      { label: 'Other problem',           tier: 'low' },
  harassment: { label: 'Confidential case',       tier: 'critical', confidential: true },
};

// Problem types where different 'things' at the same place are different issues (chair vs window).
const SUBJECT_TYPES = new Set(['equipment', 'furniture', 'cleanliness', 'security', 'food', 'noise', 'books', 'water', 'other']);
const TIERS = ['low', 'medium', 'high', 'critical'];
const SAFETY_KINDS = ['fire', 'gas', 'electrical_hazard', 'medical', 'structural'];

// Code (not AI) decides the department from place + problem type.
function routeDept(place, type) {
  if (type === 'harassment') return 'ADMIN';
  if (type === 'network') return 'IS';
  if (type === 'power' || type === 'electrical_hazard') return 'EE';
  if (type === 'fire') return place.dept; // owner of the area handles it (admin is alerted separately)
  return place.dept;
}

module.exports = { SUBJECT_TYPES, DEPTS, PLACES, TYPES, TIERS, SAFETY_KINDS, routeDept };
