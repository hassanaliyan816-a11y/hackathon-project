// Shared basics: state, helpers, constants, the API call, toast messages. (loaded as a plain script; files share globals, see index.html for the order)
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let me = null, users = [], tab = null, places = [], lastReport = null, deptFilter = null;

/* ---------- haptics: real vibration on phones, visual bump everywhere (kept short and only for confirmations) ---------- */
function haptic(kind, el) {
  if (!reduced && navigator.vibrate) navigator.vibrate({ light: 8, medium: 16, success: [12, 40, 20], error: [30, 40, 30] }[kind] || 8);
  if (el && !reduced) { const c = kind === 'error' ? 'shake' : 'bump'; el.classList.remove('bump', 'shake'); void el.offsetWidth; el.classList.add(c); }
}

const EXAMPLES = [
  'Lab 3 mein WiFi nahi chal raha',
  'There is a small fire near the printer in Lab 2, no rush',
  'LAB 4 PROJECTOR NOT WORKING!!! URGENT!!!',
  'Library ka AC kharab hai, bohat garmi hai',
  'Wifi is not working in Lab 9',
];
const ROLE_COLOR = { student: 'linear-gradient(135deg,#3b82f6,#1e4fa8)', staff: 'linear-gradient(135deg,#d4af37,#b8860b)', admin: 'linear-gradient(135deg,#334155,#0f172a)' };
const initials = n => String(n || '?').split(/\s+/).filter(w => /^\p{L}/u.test(w.replace(/^\(/, ''))).map(w => w.replace(/^\(/, '')[0]).slice(0, 2).join('').toUpperCase() || '?';
const avatar = (name, role, cls) => `<span class="avatar ${cls || ''}" style="background:${ROLE_COLOR[role] || '#64748b'}">${esc(initials(name))}</span>`;
const TIER_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_LABEL = { new: 'New', in_progress: 'In progress', resolved: 'Resolved - awaiting students', closed: 'Closed (verified)', reopened: 'Reopened', invalid: 'Marked fake' };
const IC = {
  student: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>',
  staff: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/></svg>',
  admin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  chev: '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  tick: '<svg class="tick" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
};
const MENU_DEF = [
  { role: 'student', label: 'Student', head: 'Sign in as a student' },
  { role: 'staff', label: 'Department', head: 'Sign in as department staff' },
  { role: 'admin', label: 'Admin', head: 'Sign in as admin' },
];
// Generic "MCS" monogram, shown only until the official logo file is placed at public/mcs-logo.png
const MONO = '<svg width="42" height="42" viewBox="0 0 52 52" aria-label="MCS"><defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12315c"/><stop offset="1" stop-color="#050f1f"/></linearGradient></defs><path d="M26 3l20 6v15c0 12-8.5 20-20 25C14.5 44 6 36 6 24V9z" fill="url(#mg)" stroke="#d4af37" stroke-width="2"/><g fill="none" stroke="#d4af37" stroke-width="1.8" stroke-linecap="round"><path d="M17 17a13 13 0 0 1 18 0"/><path d="M20.5 20.5a8 8 0 0 1 11 0"/></g><circle cx="26" cy="24" r="1.8" fill="#d4af37"/><text x="26" y="41" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="13" fill="#fff" letter-spacing="1">MCS</text></svg>';

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', 'x-user-id': localStorage.uid || '' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { data: j, status: r.status });
  return j;
}

let toastT;
function toast(m, kind = 'err') { const t = $('#toast'); t.textContent = m; t.className = 'show ' + kind; clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 3200); if (kind === 'err') haptic('error'); }
