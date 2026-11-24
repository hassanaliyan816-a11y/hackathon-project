// Card builders: issue cards, stat cards, department cards. (loaded as a plain script; files share globals, see index.html for the order)
/* ================= CARDS ================= */
const badge = (cls, t) => `<span class="b ${cls}">${esc(t)}</span>`;
const emptyState = (title, sub) => `<div class="card empty"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg><b>${esc(title)}</b>${esc(sub || '')}</div>`;
const section = (eyebrow, title) => `<div class="sechead"><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3></div>`;

function issueCard(i, mode) {
  if (i.confidential) {
    return `<div class="card spot issue confc"><div class="ihead"><span class="id">#${i.id}</span><span class="ttl">${esc(i.title)}</span> ${badge('conf', 'Confidential')} ${badge('st-' + i.status, STATUS_LABEL[i.status] || i.status)}</div>
      <div class="reason">${esc(i.reason || '')}</div>
      ${(i.texts || []).map(t => `<div class="quote"><small>${esc(t.reporter)}</small>${esc(t.text)}</div>`).join('')}
      ${mode === 'admin' ? `<div class="acts">${i.status !== 'closed' ? `<button class="sbtn ok" onclick="act(${i.id},'resolved')">Close case</button>` : ''}<button class="sbtn" onclick="exportDoc(${i.id})">Export Word (.docx)</button></div>` : ''}
      ${i.history ? `<details><summary>Activity</summary><ul class="tl">${i.history.map(h => `<li>${esc(h.text)}</li>`).join('')}</ul></details>` : ''}</div>`;
  }
  const staffLike = me.role === 'staff' || me.role === 'admin';
  let acts = '';
  if (me.role === 'student') {
    if (i.canJoin) acts += `<button class="sbtn solid" onclick="join(${i.id})">Me too · I'm affected (${i.supporters})</button>`;
    if (i.canVote) acts += `<button class="sbtn ok" onclick="vote(${i.id},'confirm')">Confirm it's fixed</button><button class="sbtn bad" onclick="vote(${i.id},'dispute')">Still broken</button>`;
    if (i.myVote) acts += badge('neutral', 'You voted: ' + (i.myVote === 'confirm' ? 'fixed' : 'still broken'));
  } else {
    if (['new', 'reopened'].includes(i.status)) acts += `<button class="sbtn solid" onclick="act(${i.id},'in_progress')">Start work</button>`;
    if (['new', 'in_progress', 'reopened'].includes(i.status)) acts += `<input class="in" id="note-${i.id}" placeholder="What was done? (shown to students)" aria-label="Resolution note"> <button class="sbtn ok" onclick="resolve(${i.id})">Mark resolved</button>`;
    if (!['closed', 'invalid'].includes(i.status)) acts += `<button class="sbtn bad" onclick="act(${i.id},'invalid')">Mark fake / spam</button>`;
    if (me.role === 'admin') acts += `<button class="sbtn" onclick="exportDoc(${i.id})" title="AI-written report as a Word document">Export Word (.docx)</button>`;
    if (me.role === 'admin') acts += `<select class="in" aria-label="Reassign department" onchange="reassign(${i.id},this.value)"><option value="">Reassign…</option>${['EE', 'CSE', 'IS', 'Library', 'Cafeteria', 'Labs'].map(d => `<option>${d}</option>`).join('')}</select>`;
  }
  const vp = i.voteProgress;
  const vote = vp ? `<div class="vote"><b>Did the fix work?</b> <span class="tiny">${vp.affected} affected student(s) decide</span>
      <div class="vbar"><div class="c" style="width:${vp.affected ? vp.confirms / vp.affected * 100 : 0}%"></div><div class="d" style="width:${vp.affected ? vp.disputes / vp.affected * 100 : 0}%"></div></div>
      <span class="tiny">${vp.confirms} confirm · ${vp.disputes} dispute · ${Math.max(0, vp.affected - vp.confirms - vp.disputes)} waiting${vp.autoCloseMin != null ? ` · closes automatically in ~${vp.autoCloseMin} min if nobody credibly disputes` : ''}</span>${i.resolvedNote ? `<div class="tiny" style="margin-top:4px">Staff note: ${esc(i.resolvedNote)}</div>` : ''}</div>` : '';
  const raised = i.tier !== i.baseTier;
  return `<div class="card spot issue t-${i.tier}">
    <div class="ihead"><span class="id">#${i.id}</span><span class="ttl">${esc(i.title)}</span></div>
    <div>${badge(i.tier, TIER_LABEL[i.tier] + (raised ? ' ↑ crowd' : ''))}${badge('st-' + i.status, STATUS_LABEL[i.status] || i.status)}${badge('dept', i.dept)}
      ${i.safety ? badge('flag', 'Safety hazard') : ''}${i.brigading ? badge('flag', 'Brigading suspected') : ''}${i.reopenCount ? badge('st-reopened', 'Reopened ×' + i.reopenCount) : ''}${i.mine ? badge('you', 'You reported / joined') : ''}</div>
    <div class="reason">${esc(i.reason || '')}</div>
    <div class="metrics"><span class="metric"><b>${i.supporters}</b> affected</span><span class="metric"><b>${i.credibleSupporters}</b> credible</span><span class="metric">support weight <b>${i.weightedSupport}</b></span>
      <span class="meter" title="Importance score ${i.score}"><i style="width:${Math.min(100, i.score / 1.2)}%"></i></span></div>
    ${vote}
    ${staffLike && i.texts ? i.texts.slice(0, 3).map(t => `<div class="quote"><small>${t.reporter ? esc(t.reporter) + ' · ' : ''}${t.injection ? 'contained instructions - ignored' : 'report'}</small>${esc(t.text)}</div>`).join('') : ''}
    ${me.role === 'admin' && i.supporterList ? `<div class="tiny">Supporters: ${i.supporterList.map(s => esc(s.name) + ' (trust ' + s.trust + ')').join(', ')}</div>` : ''}
    ${acts ? `<div class="acts">${acts}</div>` : ''}
    ${i.history && i.history.length ? `<details><summary>Activity (${i.history.length})</summary><ul class="tl">${i.history.slice(-6).map(h => `<li>${esc(h.text)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}
const statCard = (cls, label, n, sub) => `<div class="stat ${cls}"><span>${label}</span><b data-n="${n}">${n}</b>${sub ? `<div class="tiny">${sub}</div>` : ''}</div>`;
function statsBar(a) {
  const open = a.filter(i => ['new', 'in_progress', 'reopened'].includes(i.status));
  return `<div class="stats">${statCard('c2', 'Open issues', open.length)}${statCard('c1', 'Critical', open.filter(i => i.tier === 'critical').length)}${statCard('c4', 'Awaiting student check', a.filter(i => i.status === 'resolved').length)}${statCard('c3', 'Closed (verified)', a.filter(i => i.status === 'closed').length)}</div>`;
}
function studentSnap(a) {
  const open = a.filter(i => ['new', 'in_progress', 'reopened'].includes(i.status)).length;
  const vote = a.filter(i => i.canVote).length;
  const fixed = a.filter(i => i.status === 'closed').length;
  const w = Math.max(0.1, Math.min(2, me.trust / 50)).toFixed(1);
  return `<div class="snap">${statCard('c2', 'My trust score', me.trust, 'vote weight ×' + w)}${statCard('c4', 'My open issues', open, 'being worked on')}${statCard('c1', 'Needs my vote', vote, 'did the fix work?')}${statCard('c3', 'Fixed & verified', fixed, 'confirmed by students')}</div>`;
}
const DEPT_LIST = ['EE', 'CSE', 'IS', 'Library', 'Cafeteria', 'Labs'];
function deptCards(a) {
  return `<div class="dgrid">${DEPT_LIST.map(d => {
    const mine = a.filter(i => i.dept === d), open = mine.filter(i => ['new', 'in_progress', 'reopened'].includes(i.status));
    const crit = open.filter(i => i.tier === 'critical').length, wait = mine.filter(i => i.status === 'resolved').length;
    return `<button class="dcard spot ${deptFilter === d ? 'on' : ''}" onclick="setDept('${d}')" aria-pressed="${deptFilter === d}">${crit ? `<span class="b critical crit">${crit} critical</span>` : ''}<div class="dn">${d}</div>
      <div class="dm"><span><b>${open.length}</b>open</span><span><b>${wait}</b>to verify</span><span><b>${mine.length}</b>total</span></div></button>`;
  }).join('')}</div>`;
}
window.setDept = d => { deptFilter = deptFilter === d ? null : d; haptic('light'); render(); };
const HOW = [['Report', 'Say it your way: English, Roman Urdu or a mix, typos and all.'], ['AI reads it', 'Finds the place, the problem and any danger. Ignores tone and tricks.'], ['Code decides', 'Plain rules pick the department and priority, and group duplicates.'], ['Students verify', 'Only affected students confirm or dispute the fix.']];
