// Pages: what each tab shows, the report form, actions and the Word export. (loaded as a plain script; files share globals, see index.html for the order)
/* ================= RENDER ================= */
const viewEl = $('#view'); let lastHtml = null;
function afterPaint() {
  [...viewEl.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 9)));
  $$('#view .stats>*,#view .snap>*,#view .dgrid>*,#view .ugrid>*,#view .steps>*,#view .facts>*').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 9)));
  if (reduced) return;
  $$('#view [data-n]').forEach(el => {
    const n = +el.dataset.n; if (!isFinite(n) || n === 0) return; const t0 = performance.now();
    const tick = t => { const p = Math.min(1, (t - t0) / 800); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
}
// Only touch the page when the content really changed, so live refresh never eats a click.
const viewProxy = { set innerHTML(h) { if (h === lastHtml) return; lastHtml = h; viewEl.innerHTML = h; afterPaint(); }, get innerHTML() { return viewEl.innerHTML; } };
async function render() {
  const v = viewProxy;
  try {
    if (tab === 'Report') {
      if (!places.length) places = (await api('/meta')).places;
      const snap = studentSnap(await api('/issues?scope=mine'));
      v.innerHTML = snap + `<div class="card spot hero"><h2 class="sec" style="margin-top:0">What's broken on campus?</h2>
        <p class="muted" style="margin:0 0 14px">Write it your way. Say what is wrong and where.</p>
        <textarea class="in" id="txt" placeholder="e.g. Lab 3 mein WiFi nahi chal raha" aria-label="Describe the problem"></textarea>
        <div class="chips"><span class="tiny" style="align-self:center">Try:</span>${EXAMPLES.map(x => `<button class="ex" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <div style="margin-top:12px"><button class="btn pri" id="sendBtn">Submit report →</button></div>
        <div id="out">${lastReport || ''}</div></div>
        ${section('How it works', 'From report to verified fix')}<div class="steps">${HOW.map((s, k) => `<div class="step"><div class="n">${k + 1}</div><b>${s[0]}</b><p>${s[1]}</p></div>`).join('')}</div>
        ${section('Campus', 'Places on this demo campus')}<div class="card spot"><div class="places">${places.map(p => `<span class="place">${esc(p.name)}</span>`).join('')}</div>
        <p class="tiny" style="margin:12px 0 0">If you name a place that is not here, ReportFix asks you instead of guessing.</p></div>`;
      $('#sendBtn').onclick = submit;
      $$('.ex').forEach(b => b.onclick = () => { $('#txt').value = b.dataset.ex; $('#txt').focus(); haptic('light', b); });
    } else if (tab === 'My issues') {
      const a = await api('/issues?scope=mine'); v.innerHTML = studentSnap(a) + (a.length ? a.map(i => issueCard(i)).join('') : emptyState('Nothing yet', 'Issues you report or join show up here with live status.'));
    } else if (tab === 'Public board') {
      const a = await api('/issues?scope=public'); v.innerHTML = a.length ? `<h2 class="sec">Public board</h2><p class="muted" style="margin-top:0">Most important first. Hit "Me too" if you are affected too.</p>` + a.map(i => issueCard(i)).join('') : emptyState('No issues on the board', 'Be the first to report a problem.');
    } else if (tab === 'My trust') { await showTrust(me.id, v); }
    else if (tab === 'Queue') {
      const a = await api('/issues?scope=dept'); v.innerHTML = `<h2 class="sec">${esc(me.dept)} queue</h2><p class="muted" style="margin-top:0">Most important first. You only see ${esc(me.dept)} issues.</p>` + statsBar(a) + (a.length ? a.map(i => issueCard(i)).join('') : emptyState('Queue is empty', 'New reports for your department appear here.'));
    } else if (tab === 'All issues') {
      const all = await api('/issues?scope=dept'); const a = deptFilter ? all.filter(i => i.dept === deptFilter) : all;
      v.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2 class="sec">All departments</h2><button class="btn pri" onclick="exportDoc()" title="One Word document with every active issue">Export all active issues (Word)</button></div><p class="muted" style="margin-top:0">Click a department card to filter${deptFilter ? ` (showing ${esc(deptFilter)}, click again to clear)` : ''}. Each issue card has its own Word export.</p>` + statsBar(all) + deptCards(all) + (a.length ? a.map(i => issueCard(i)).join('') : emptyState('No issues yet', 'Sign in as a student and file a report.'));
    } else if (tab === 'Confidential') {
      const a = await api('/issues?scope=confidential'); v.innerHTML = `<div class="card" style="background:#faf5ff;border-color:#ddd6fe"><b>Admin-only.</b> <span class="muted">Harassment and ragging cases never appear on a public board, never reach a department, and the reporter is never revealed.</span></div>` + (a.length ? a.map(i => issueCard(i, 'admin')).join('') : emptyState('No confidential cases', ''));
    } else if (tab === 'Users & trust') {
      const us = (await api('/users')).filter(u => u.role === 'student');
      v.innerHTML = `<h2 class="sec">Students & trust</h2><div class="ugrid">${us.map(u => `<div class="ucard spot"><div class="urow">${avatar(u.name, 'student')}<div><b>${esc(u.name)}</b><div class="tiny">trust ${u.trust} · weight ×${Math.max(0.1, Math.min(2, u.trust / 50)).toFixed(1)}</div></div></div>
        <div class="mini"><i style="width:${u.trust}%;background:${u.trust >= 60 ? '#10b981' : u.trust >= 35 ? '#f59e0b' : '#e11d48'}"></i></div>
        <button class="sbtn" onclick="trustFor('${u.id}')">Why this score?</button></div>`).join('')}</div><div id="trustBox"></div>`;
    } else if (tab === 'Trending') {
      const a = await api('/trending'); v.innerHTML = `<h2 class="sec">Trending</h2><p class="muted" style="margin-top:0">Issues with the most new "me too" joins in the last hour.</p>` + (a.length ? a.map(i => issueCard(i)).join('') : emptyState('Nothing trending', 'Trends appear as students join issues.'));
    } else if (tab === 'Summary') {
      v.innerHTML = `<div class="card spot"><h2 class="sec" style="margin-top:0">Admin summary</h2><p class="muted" style="margin-top:0">A short briefing of what needs attention. Written by AI when available, otherwise by plain rules.</p>
        <button class="btn pri" id="sumBtn">Generate summary</button><pre class="sum" id="sumOut" style="display:none"></pre></div>`;
      $('#sumBtn').onclick = async () => { const o = $('#sumOut'); o.style.display = 'block'; o.textContent = 'Working…'; const s = await api('/admin/summary', { method: 'POST' }); o.textContent = s.text + `\n\n(source: ${s.source === 'ai' ? 'AI' : 'plain rules'})`; haptic('success'); };
    }
  } catch (e) { v.innerHTML = `<div class="result err">${esc(e.message)}</div>`; }
}
async function showTrust(uid, box) {
  const t = await api(`/users/${uid}/trust`); const tr = t.user.trust;
  box.innerHTML = `<div class="card spot"><div class="gauge"><div><div class="big" data-n="${tr}" style="color:${tr >= 60 ? '#059669' : tr >= 35 ? '#d97706' : '#e11d48'}">${tr}</div><div class="tiny">trust score</div></div>
    <div style="flex:1;min-width:220px"><b>${esc(t.user.name)}</b> <span class="muted">· vote weight ×${t.user.weight}</span><div class="tbar" style="margin-top:14px"><i style="left:${tr}%"></i></div><div class="tiny" style="margin-top:8px">${esc(t.explanation)}</div></div></div>
    <table class="ledger"><tr><th>When</th><th>Change</th><th>Why</th></tr>${t.entries.length ? t.entries.map(e => `<tr><td class="tiny">${new Date(e.ts).toLocaleTimeString()}</td><td><span class="delta ${e.delta >= 0 ? 'up' : 'down'}">${e.delta > 0 ? '+' : ''}${e.delta}</span></td><td>${esc(e.reason)}</td></tr>`).join('') : '<tr><td colspan="3" class="tiny">No changes yet. Everyone starts at 50.</td></tr>'}</table></div>`;
}
window.trustFor = id => { showTrust(id, $('#trustBox')); $('#trustBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };

async function submit() {
  const text = $('#txt').value.trim(); if (!text) { haptic('error', $('#txt')); return toast('Please describe the problem first.'); }
  $('#sendBtn').disabled = true; $('#out').innerHTML = '<div class="result" style="background:#eef2ff;border-color:#c7d2fe"><span class="spin"></span>Understanding your report…</div>';
  try {
    const r = await api('/reports', { method: 'POST', body: { text } });
    let html = '';
    if (r.outcome === 'clarify') {
      html = `<div class="result warn"><h4>One more detail, please</h4>${esc(r.message)}<div class="places">${(r.places || []).map(p => `<button class="place" onclick="addPlace('${esc(p)}')">${esc(p)}</button>`).join('')}</div></div>`; haptic('medium');
    } else if (r.outcome === 'duplicate' || r.outcome === 'already_joined') {
      html = `<div class="result warn">${esc(r.message)}</div>`; haptic('medium');
    } else if (r.issue && r.issue.confidential) {
      html = `<div class="result conf"><h4>Received confidentially · Case #${r.issue.id}</h4>${esc(r.issue.reason)}</div>`; haptic('success');
    } else if (r.outcome === 'dispute_via_report') {
      html = `<div class="result good">${esc(r.message)}</div>`; haptic('success');
    } else {
      const t = r.triage;
      html = `<div class="result good"><h4>${r.outcome === 'joined' ? 'Matched an existing issue: you are counted as "me too"' : 'New issue created'} · #${r.issue.id}</h4>
        <div class="facts"><div class="fact"><span>Place</span><b>${esc(t.place)}</b></div><div class="fact"><span>Problem</span><b>${esc(t.type)}</b></div><div class="fact"><span>Routed to</span><b>${esc(t.dept)}</b></div><div class="fact"><span>Priority</span>${badge(r.issue.tier, TIER_LABEL[r.issue.tier])}</div></div>
        <div class="muted">${esc(t.reason)}</div>
        ${t.injectionIgnored ? '<div style="margin-top:8px"><b>Heads up:</b> your text contained instructions aimed at the system. They were ignored and your trust score went down.</div>' : ''}
        <div class="tiny" style="margin-top:8px">${r.issue.supporters} student(s) affected · understood by ${t.usedAI ? 'AI + rules' : 'rules only (AI unavailable)'}</div></div>`; haptic('success');
    }
    lastReport = html; $('#out').innerHTML = html;
    $$('#out .facts>*').forEach((c, i) => c.style.setProperty('--i', i));
    if (r.outcome !== 'clarify') { $('#txt').value = ''; }
    paintWho(await api('/me'));
  } catch (e) { $('#out').innerHTML = `<div class="result err">${esc(e.message)}</div>`; haptic('error'); }
  $('#sendBtn').disabled = false;
}
window.addPlace = p => { const t = $('#txt'); t.value = t.value.trim() + ' (' + p + ')'; t.focus(); };
window.join = async id => { try { await api(`/issues/${id}/join`, { method: 'POST' }); haptic('success'); await setUser(); toast('You are counted on this issue', 'ok'); } catch (e) { toast(e.message); } };
window.vote = async (id, v) => { try { await api(`/issues/${id}/vote`, { method: 'POST', body: { vote: v } }); haptic('success'); await setUser(); toast('Vote recorded', 'ok'); } catch (e) { toast(e.message); } };
window.act = async (id, status, note) => { try { await api(`/issues/${id}/status`, { method: 'POST', body: { status, note } }); haptic('success'); await render(); } catch (e) { toast(e.message); } };
// Admin: download an AI-written Word report for one issue (id) or all active issues (no id).
window.exportDoc = async id => {
  toast('Preparing the report: the AI is drafting it…', 'ok');
  try {
    const r = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': localStorage.uid || '' }, body: JSON.stringify(id ? { ids: [id] } : {}) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Export failed'); }
    const blob = await r.blob(); const m = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || ''); const name = m ? m[1] : 'ReportFix-report.docx';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    haptic('success'); toast('Downloaded ' + name + (r.headers.get('X-Report-AI') === 'yes' ? ' (AI-written)' : ' (template text, AI unavailable)'), 'ok');
  } catch (e) { toast(e.message); }
};
window.resolve = id => { const el = document.getElementById('note-' + id); act(id, 'resolved', el ? el.value : ''); };
window.reassign = async (id, dept) => { if (!dept) return; try { await api(`/issues/${id}/reassign`, { method: 'POST', body: { dept } }); haptic('success'); await render(); toast('Reassigned to ' + dept, 'ok'); } catch (e) { toast(e.message); } };
