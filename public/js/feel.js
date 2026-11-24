// Look and feel: cursor glow, card spotlight, click ripple. (loaded as a plain script; files share globals, see index.html for the order)
/* ================= FEEL: cursor glow, card spotlight, click ripple ================= */
(function feel() {
  // click ripple + pressed cursor
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('.btn,.sbtn,.mbtn,.item,.pbtn,.rbtn,.ex,.dcard,.seg button,button.place');
    if (t && !reduced) {
      const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
      s.className = 'rip'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
      t.appendChild(s); setTimeout(() => s.remove(), 650);
    }
    $('#cur').classList.add('down');
  });
  document.addEventListener('pointerup', () => $('#cur').classList.remove('down'));
  // card spotlight follows the pointer
  document.addEventListener('pointermove', e => {
    const c = e.target.closest('.spot'); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
  // custom cursor: gold ring that trails the pointer and grows over clickable things (native cursor stays visible)
  if (reduced || !matchMedia('(pointer:fine)').matches) return;
  const ring = $('#cur'), dot = $('#cdot'); let x = -100, y = -100, rx = -100, ry = -100;
  document.addEventListener('pointermove', e => {
    x = e.clientX; y = e.clientY; document.documentElement.classList.add('hascur');
    dot.style.transform = `translate(${x}px,${y}px)`;
    const el = e.target;
    const hov = el.closest && el.closest('a,button,.item,.mbtn,select,summary,[onclick]'); const txt = el.closest && el.closest('input,textarea');
    ring.classList.toggle('hov', !!hov && !txt); ring.classList.toggle('txt', !!txt);
  }, { passive: true });
  document.addEventListener('pointerleave', () => document.documentElement.classList.remove('hascur'));
  (function loop() { rx += (x - rx) * 0.2; ry += (y - ry) * 0.2; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(loop); })();
})();
