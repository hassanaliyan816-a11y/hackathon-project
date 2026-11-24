// Navigation bar (Student / Department / Admin menus), signing in as a user, reset. (loaded as a plain script; files share globals, see index.html for the order)
/* ================= NAVIGATION: Student / Department / Admin menus ================= */
function menuItems(def) {
  const list = users.filter(u => u.role === def.role);
  const items = list.map(u => {
    const meta = u.role === 'student' ? 'Student · trust ' + u.trust : u.role === 'staff' ? u.dept + ' department staff' : 'Registrar, full access';
    const name = u.role === 'staff' ? u.dept + ' Staff' : u.name;
    return `<button class="item ${u.id === localStorage.uid ? 'active' : ''}" role="menuitem" data-u="${u.id}">${avatar(u.name, u.role)}<span><span class="nm">${esc(name)}</span><br><span class="mt">${esc(meta)}</span></span>${u.role === 'student' ? `<span class="tchip">${u.trust}</span>` : ''}${IC.tick}</button>`;
  }).join('');
  const foot = def.role === 'student' ? `<div class="pfoot"><div class="phead" style="padding:0 0 6px">New student account</div><div class="row"><input id="newName" placeholder="Student name" aria-label="New student name" maxlength="40"><button class="pbtn" data-act="create" type="button">Create</button></div></div>` : '';
  return `<div class="phead">${def.head}</div>${items}${foot}`;
}
function renderMenus() {
  const cur = users.find(u => u.id === localStorage.uid);
  $('#menus').innerHTML = MENU_DEF.map(def => {
    const on = cur && cur.role === def.role;
    const who = on ? (cur.role === 'staff' ? cur.dept : cur.role === 'admin' ? '' : cur.name.split(' ')[0]) : '';
    return `<div class="menu" data-role="${def.role}"><button class="mbtn ${on ? 'on' : ''}" type="button" aria-haspopup="menu" aria-expanded="false">${IC[def.role]}<span>${def.label}</span>${who ? `<span class="cur">· ${esc(who)}</span>` : ''}${IC.chev}</button>
      <div class="panel" role="menu" aria-label="${def.head}">${menuItems(def)}</div></div>`;
  }).join('');
}
const openMenu = () => $('.menu.open');
function closeMenus(focusBtn) {
  $$('.menu.open').forEach(m => { m.classList.remove('open'); const b = m.querySelector('.mbtn'); b.setAttribute('aria-expanded', 'false'); if (focusBtn) b.focus(); });
}
function toggleMenu(m) {
  const wasOpen = m.classList.contains('open');
  closeMenus();
  if (wasOpen) return;
  m.classList.add('open'); const b = m.querySelector('.mbtn'); b.setAttribute('aria-expanded', 'true');
  haptic('light');
  const p = m.querySelector('.panel');
  if (matchMedia('(max-width:860px)').matches) p.style.top = (b.getBoundingClientRect().bottom + 8) + 'px'; else p.style.top = '';
  (p.querySelector('.item.active') || p.querySelector('.item'))?.focus({ preventScroll: true });
}
async function switchTo(id, btn) {
  localStorage.uid = id; lastReport = null; deptFilter = null;
  haptic('success', btn);
  closeMenus(); await loadUsers(); await setUser(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  const u = users.find(x => x.id === id); if (u) toast('Signed in as ' + (u.role === 'staff' ? u.dept + ' Staff' : u.name), 'ok');
}
async function createStudent() {
  const inp = $('#newName'); const name = (inp.value || '').trim() || 'New Student';
  try { const u = await api('/users', { method: 'POST', body: { name } }); localStorage.uid = u.id; haptic('success'); closeMenus(); await loadUsers(); await setUser(); toast(`Created ${u.name} (trust 50) and signed in`, 'ok'); }
  catch (e) { toast(e.message); }
}
$('#menus').addEventListener('click', e => {
  const mb = e.target.closest('.mbtn'); if (mb) return toggleMenu(mb.closest('.menu'));
  const it = e.target.closest('.item'); if (it) return switchTo(it.dataset.u, it);
  if (e.target.closest('[data-act=create]')) return createStudent();
});
$('#menus').addEventListener('keydown', e => {
  const m = e.target.closest('.menu'); if (!m) return;
  if (e.key === 'Enter' && e.target.id === 'newName') { e.preventDefault(); return createStudent(); }
  if (m.classList.contains('open') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const items = [...m.querySelectorAll('.item')]; const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); e.preventDefault();
  }
  if (e.key === 'ArrowDown' && e.target.classList.contains('mbtn') && !m.classList.contains('open')) { toggleMenu(m); e.preventDefault(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openMenu()) closeMenus(true); });
document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); });

async function loadUsers() { users = await api('/users'); if (!users.find(u => u.id === localStorage.uid)) localStorage.uid = users.find(u => u.role === 'student').id; if (!openMenu()) renderMenus(); }

const ROLE_HINT = { student: 'Report problems, back an existing issue with "Me too", and confirm whether a fix really worked.', staff: 'Work your department\'s queue, most important first, and mark issues resolved with a note.', admin: 'Oversee every department, confidential cases, trust scores and the AI summary.' };
function paintWho(u) {
  const roleTxt = u.role === 'staff' ? `${u.dept} staff` : u.role === 'admin' ? 'Admin' : 'Student';
  const w = u.trust != null ? Math.max(0.1, Math.min(2, u.trust / 50)).toFixed(1) : null;
  $('#who').innerHTML = `${avatar(u.name, u.role, 'lg')}<div><div class="eyebrow">Signed in as</div><h2>${esc(u.name)}</h2>
    <div class="wpills"><span class="pill">${esc(roleTxt)}</span>${w ? `<span class="pill">Trust ${u.trust}</span><span class="pill">Vote weight ×${w}</span>` : ''}</div></div>
    <div class="hint">${esc(ROLE_HINT[u.role])}</div>`;
}
async function setUser() {
  me = await api('/me'); paintWho(me);
  const tabs = me.role === 'student' ? ['Report', 'My issues', 'Public board', 'My trust'] : me.role === 'staff' ? ['Queue'] : ['All issues', 'Confidential', 'Users & trust', 'Trending', 'Summary'];
  if (!tabs.includes(tab)) tab = tabs[0];
  $('#tabs').innerHTML = tabs.map(t => `<button role="tab" aria-selected="${t === tab}" class="${t === tab ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  render();
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.t) { tab = b.dataset.t; lastReport = null; haptic('light', b); setUser(); } };
let resetArmed = false;
$('#resetBtn').onclick = async e => {
  const b = e.currentTarget;
  if (!resetArmed) { resetArmed = true; b.classList.add('armed'); b.textContent = 'Click again to confirm'; haptic('medium'); setTimeout(() => { resetArmed = false; b.classList.remove('armed'); b.textContent = 'Reset all data'; }, 4000); return; }
  resetArmed = false; b.classList.remove('armed'); b.textContent = 'Reset all data';
  await api('/reset', { method: 'POST' }); localStorage.uid = ''; lastReport = null; deptFilter = null; await loadUsers(); await setUser(); haptic('success'); toast('All data reset', 'ok');
};
