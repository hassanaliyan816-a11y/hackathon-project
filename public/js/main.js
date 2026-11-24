// Start-up and live refresh. (loaded as a plain script; files share globals, see index.html for the order)
// live status: refresh the visible list every 4s (never while someone is typing, never on the report form, never with a menu open)
setInterval(async () => {
  const a = document.activeElement;
  if (!me || openMenu() || ['Report', 'Users & trust', 'Summary'].includes(tab) || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return;
  try { await render(); paintWho(await api('/me')); await loadUsers(); } catch { }
}, 4000);
(async () => { await loadUsers(); await setUser(); })();
