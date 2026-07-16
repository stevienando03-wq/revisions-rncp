'use strict';
/* ============================================================
   Révision RNCP Finance d'entreprise — app (100% front, hors-ligne)
   ============================================================ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

/* ---------- État persistant ---------- */
const SKEY = 'rncp_rev_v1';
let S = loadState();
function blank() {
  return {
    read: {}, pos: {}, q: {}, wrong: {}, flashKnown: {},
    starQ: {}, starSec: {},
    daily: { goal: 20, log: {}, streak: 0, best: 0, lastDay: '' },
    examHistory: [], examInProgress: null, lastAction: null,
    snap: null, theme: '', scale: 1, onboarded: false
  };
}
function loadState() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(SKEY) || '{}')); }
  catch (e) { return blank(); }
}
function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
function resetAll() {
  if (!confirm('Réinitialiser toute ta progression (cours lu, scores, série, favoris) ?')) return;
  const theme = S.theme, scale = S.scale;
  S = blank(); S.theme = theme; S.scale = scale; S.onboarded = true; save();
  applyTheme(); location.hash = '#/accueil'; render();
}

/* ---------- Thème & lecture ---------- */
function applyTheme() {
  const dark = S.theme === 'dark' || (S.theme === '' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
  document.documentElement.style.setProperty('--reading-scale', S.scale || 1);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', dark ? '#0e1626' : '#14213D');
}

/* ---------- Contenu ---------- */
let C = null, QBYID = {}, QBYMOD = {}, MOD = {}, FLASH = [], READTIME = {}, VIS_BY_SEC = {}, QCM_BY_SEC = {};
function boot() {
  applyTheme();
  fetch('content.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .then(data => { C = data; indexContent(); start(); })
    .catch(() => { $('#view').innerHTML = '<div class="card"><b>Impossible de charger le contenu.</b></div>'; });
}
function indexContent() {
  QBYID = {}; QBYMOD = {}; MOD = {}; FLASH = []; READTIME = {}; VIS_BY_SEC = {}; QCM_BY_SEC = {};
  C.modules.forEach(m => {
    MOD[m.id] = m; QBYMOD[m.id] = [];
    (m.qcm || []).forEach((q, i) => {
      q.id = q.id || (m.id + '-q' + i); q.module = m.id; q.modnum = m.num;
      q.options = shuffle(q.options || []); // mélange les positions à chaque session (anti-biais "toujours A")
      q.correct = q.options.findIndex(o => o.correcte);
      QBYID[q.id] = q; QBYMOD[m.id].push(q);
      if (q.ancre) (QCM_BY_SEC[q.ancre] = QCM_BY_SEC[q.ancre] || []).push(q);
    });
    (m.visuals || []).forEach(b => { if (b.ancre) (VIS_BY_SEC[b.ancre] = VIS_BY_SEC[b.ancre] || []).push(b); });
    (m.essentiel && m.essentiel.a_retenir || []).forEach((t, i) =>
      FLASH.push({ id: m.id + '-r' + i, mid: m.id, modnum: m.num, text: t }));
    let words = 0;
    m.sections.forEach(s => { words += (s.titre + ' ' + (s.points || []).join(' ') + ' ' + (s.chiffres || []).join(' ') + ' ' + (s.pieges || []).join(' ')).split(/\s+/).length; });
    READTIME[m.id] = Math.max(1, Math.round(words / 200));
  });
}

/* ---------- Utils ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function pct(n, d) { return d > 0 ? Math.round(100 * n / d) : 0; }
function letters(i) { return ['A', 'B', 'C', 'D'][i]; }
const $ = s => document.querySelector(s);
function haptic(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function dayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function animateCount(el, to, suffix) {
  let t0 = null; const dur = 700; suffix = suffix || '';
  function step(t) { if (!t0) t0 = t; const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}

/* ---------- Progression ---------- */
function pctRead(mid) { const m = MOD[mid]; if (!m || !m.sections.length) return 0; let n = 0; m.sections.forEach(s => { if (S.read[s.id]) n++; }); return pct(n, m.sections.length); }
function moduleScore(mid) { const qs = QBYMOD[mid] || []; let att = 0, good = 0; qs.forEach(q => { const st = S.q[q.id]; if (st) { att += st.ok + st.ko; good += st.ok; } }); return { taux: pct(good, att), att, vues: countSeen(mid), total: qs.length }; }
function countSeen(mid) { let n = 0; (QBYMOD[mid] || []).forEach(q => { const st = S.q[q.id]; if (st && (st.ok + st.ko) > 0) n++; }); return n; }
function globalEstimate() { let att = 0, ok = 0; Object.keys(S.q).forEach(qid => { if (!QBYID[qid]) return; const st = S.q[qid]; att += st.ok + st.ko; ok += st.ok; }); return { att, taux: pct(ok, att) }; }
function masteryClass(mid) { const sc = moduleScore(mid); if (sc.att < Math.max(4, (QBYMOD[mid] || []).length * .3)) return 'todo'; return sc.taux >= 80 ? 'ok' : 'wip'; }
function recordAnswer(qid, correct) {
  const st = S.q[qid] || { ok: 0, ko: 0, streak: 0 };
  if (correct) { st.ok++; st.streak = (st.streak || 0) + 1; } else { st.ko++; st.streak = 0; }
  S.q[qid] = st;
  if (!correct) S.wrong[qid] = 1; else if (st.streak >= 2 && S.wrong[qid]) delete S.wrong[qid];
  touchDaily();
  save();
}
function touchDaily() {
  const t = dayStr(); const d = S.daily;
  if (d.lastDay !== t) {
    const y = dayStr(new Date(Date.now() - 86400000));
    d.streak = (d.lastDay === y) ? (d.streak || 0) + 1 : 1;
    d.lastDay = t; d.best = Math.max(d.best || 0, d.streak);
  }
  d.log[t] = (d.log[t] || 0) + 1;
}
function dailyDone() { return S.daily.log[dayStr()] || 0; }
function toggleMark(qid) { if (S.starQ[qid]) delete S.starQ[qid]; else S.starQ[qid] = 1; save(); }

/* ============================================================ ROUTER */
let keyBound = false;
function start() {
  window.addEventListener('hashchange', render);
  $('#btn-reset').onclick = () => go('#/reglages');
  $('#btn-search').onclick = () => go('#/recherche');
  if (!keyBound) { document.addEventListener('keydown', onKey); keyBound = true; }
  if (!S.onboarded) { showOnboard(); }
  render();
}
function parseHash() { return (location.hash || '#/accueil').replace(/^#\//, '').split('/').filter(x => x !== ''); }
function setTab(n) { document.querySelectorAll('nav.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === n)); }
function go(h) { location.hash = h; }
window.go = go;
let sess = null, fsess = null;

function render() {
  if (!C) return;
  const p = parseHash(), v = $('#view'), s = p[0] || 'accueil';
  $('#readbar').style.display = 'none';
  if (s !== 'examen-run') window.scrollTo(0, 0);
  if (s === 'accueil') { setTab('accueil'); v.innerHTML = vAccueil(); afterAccueil(); }
  else if (s === 'cours' && !p[1]) { setTab('cours'); v.innerHTML = vCoursList(); }
  else if (s === 'module') { setTab('cours'); v.innerHTML = vModule(p[1], p[2] || 'essentiel'); bindModule(p[1], p[2] || 'essentiel'); }
  else if (s === 'lire') { setTab('cours'); v.innerHTML = vModule(p[1], 'complet'); bindModule(p[1], 'complet', p[2]); }
  else if (s === 'entrainement') { setTab('entrainement'); v.innerHTML = vEntrainement(); }
  else if (s === 'drill') { setTab('entrainement'); startSession('drill', p[1]); }
  else if (s === 'echauffement') { setTab('entrainement'); startSession('echauffement'); }
  else if (s === 'favoris') { setTab('entrainement'); startSession('favoris'); }
  else if (s === 'examen') { setTab('entrainement'); v.innerHTML = vExamenIntro(); }
  else if (s === 'examen-run') { setTab('entrainement'); renderSession(); }
  else if (s === 'erreurs') { setTab('entrainement'); startSession('erreurs'); }
  else if (s === 'flash') { setTab('entrainement'); startFlash(); }
  else if (s === 'resultat') { setTab('entrainement'); v.innerHTML = vResultat(); afterResultat(); }
  else if (s === 'stats') { setTab('entrainement'); v.innerHTML = vStats(); }
  else if (s === 'reglages') { v.innerHTML = vReglages(); bindReglages(); }
  else if (s === 'recherche') { v.innerHTML = vRecherche(); bindRecherche(); }
  else if (s === 'cas' && !p[1]) { setTab('entrainement'); v.innerHTML = vCasList(); }
  else if (s === 'cas') { setTab('entrainement'); v.innerHTML = vCasDetail(p[1]); }
  else if (s === 'bloc' && !p[1]) { setTab('cours'); v.innerHTML = vBlocList(); }
  else if (s === 'bloc') { setTab('cours'); v.innerHTML = vBlocDetail(p[1]); }
  else { v.innerHTML = vAccueil(); afterAccueil(); }
}

/* ============================================================ ACCUEIL */
function gauge(label, taux, att, delta) {
  const cls = att === 0 ? '' : (taux >= 80 ? 'ok' : (taux < 60 ? 'ko' : ''));
  let d = '';
  if (delta != null && att) d = `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲ +' : '▼ '}${Math.abs(delta)} pts</span>`;
  return `<div class="gauge"><div class="lab"><span>${esc(label)}</span><span>${att ? taux + '%' : '—'} ${d}</span></div>
    <div class="bar"><div class="fill ${cls}" style="width:${att ? taux : 0}%"></div><div class="seuil" style="left:80%"></div></div></div>`;
}
function coachMessage(G) {
  if (!G.att) return `Commence par <b>lire un module</b> puis enchaîne quelques questions. La régularité fait tout.`;
  if (G.taux < 50) return `Pose les bases : relis la couche <b>Essentiel</b> de chaque module, puis teste-toi section par section.`;
  if (G.taux < 70) return `Tu progresses. Cible les modules en rouge et révise tes <b>erreurs</b> en priorité.`;
  return `🎯 Bon niveau (${G.taux} %). Enchaîne des <b>examens blancs</b> et garde tes <b>fiches méthode</b> prêtes pour le jour J (open-book).`;
}
function recommendedModule() {
  let best = null, bestScore = -1;
  C.modules.forEach(m => {
    const sc = moduleScore(m.id), w = (m.q || 1);
    const lack = sc.att < 4 ? 1 : (1 - sc.taux / 100);
    const score = w * (0.4 + lack);
    if (score > bestScore) { bestScore = score; best = m; }
  });
  return best;
}
function vAccueil() {
  const G = globalEstimate();
  let dG = null;
  if (S.snap && G.att) dG = G.taux - (S.snap.g || 0);
  const seuil = (C.meta.exam.seuil_pct || 70);
  const admis = G.att && G.taux >= seuil;
  let html = `<div class="row-between"><h2 class="page" style="margin-bottom:2px">Bonjour 👋</h2></div>`;

  // Continuer
  if (S.lastAction && Date.now() - S.lastAction.ts < 5 * 86400000) {
    html += `<button class="btn or" style="margin-bottom:12px" onclick="go('${S.lastAction.href}')">↩︎ Continuer : ${esc(S.lastAction.label)}</button>`;
  }

  // streak + objectif
  const done = dailyDone(), goal = S.daily.goal || 20, p = Math.min(100, pct(done, goal));
  html += `<div class="statline">
    <div class="stat"><div class="big">${S.daily.streak || 0} 🔥</div><div class="lbl">jours d'affilée${S.daily.best ? ' · record ' + S.daily.best : ''}</div></div>
    <div class="stat"><div class="ring" style="--p:${p}"><i>${done}/${goal}</i></div><div class="lbl">objectif du jour</div></div>
  </div>`;

  // Réviser par bloc / par épreuve
  html += `<div class="card tap" onclick="go('#/bloc')" style="border-color:var(--or)"><div class="serif" style="font-size:1.05rem">🎯 Réviser par bloc / par épreuve</div><p class="small muted" style="margin:4px 0 0">Pour chaque bloc (BC01→BC04) : quoi réviser, formules, plan du livrable, cas et jour de l'épreuve.</p></div>`;

  // erreurs dues
  const nbWrong = Object.keys(S.wrong).length;
  if (nbWrong) html += `<button class="btn" style="margin-bottom:12px" onclick="go('#/erreurs')">🔁 Réviser mes erreurs (${nbWrong})</button>`;
  else html += `<button class="btn" style="margin-bottom:12px" onclick="go('#/echauffement')">⚡ Échauffement du jour (10 questions)</button>`;

  // coach
  html += `<div class="coach">${coachMessage(G)}</div>`;

  // jauges
  html += `<div class="card"><div class="serif" style="font-size:1.1rem;margin-bottom:6px">Où tu en es</div>
    ${gauge('Maîtrise globale', G.taux, G.att, dG)}
    <div class="verdict ${admis ? 'ok' : 'ko'}">${admis ? '✅ Bonne maîtrise (≥ ' + seuil + ' %)' : '⏳ Vise ' + seuil + ' % de réussite'}</div></div>`;

  // module recommandé
  const rec = recommendedModule();
  if (rec) html += `<div class="card tap" onclick="go('#/module/${rec.id}')"><div class="small muted">▸ À travailler en priorité</div>
    <div class="row-between"><div><b>Module ${rec.num} — ${esc(rec.nom)}</b></div><span>›</span></div></div>`;

  html += `<div class="btn-row"><button class="btn sec" onclick="go('#/examen')">🧪 Examen blanc</button><button class="btn sec" onclick="go('#/cours')">📖 Cours</button></div><div class="sp"></div>`;

  html += `<h3 class="sec">Progression par module</h3>`;
  C.modules.forEach(m => {
    const r = pctRead(m.id), sc = moduleScore(m.id), mc = masteryClass(m.id);
    html += `<a class="mod card tap" onclick="go('#/module/${m.id}')">
      <div class="top"><div class="num">${m.num}</div><div class="nom">${esc(m.nom)}</div>
      <span class="mastery ${mc}">${mc === 'ok' ? 'maîtrisé' : mc === 'wip' ? 'en cours' : 'à voir'}</span></div>
      <div class="mini">
        <div class="g"><div class="lab"><span>📖 Lu</span><span>${r}%</span></div><div class="bar"><i class="${r === 100 ? 'full' : ''}" style="width:${r}%"></i></div></div>
        <div class="g"><div class="lab"><span>🎯 Réussite</span><span>${sc.att ? sc.taux + '%' : '—'}</span></div><div class="bar"><i class="${sc.att && sc.taux >= 80 ? 'full' : ''}" style="width:${sc.att ? sc.taux : 0}%"></i></div></div>
      </div></a>`;
  });
  return html;
}
function afterAccueil() { document.querySelectorAll('.ring').forEach(r => { const p = +r.style.getPropertyValue('--p') || 0; r.style.setProperty('--p', 0); requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transition = 'none'; r.style.setProperty('--p', p); })); }); }

/* ============================================================ COURS */
function vCoursList() {
  let html = `<h2 class="page">Cours</h2><div class="note">Lis le cours par module (couche « Essentiel » pour réviser vite, « Cours complet » pour le détail), puis entraîne-toi.</div><div class="sp"></div>`;
  C.modules.forEach(m => {
    const r = pctRead(m.id);
    html += `<a class="mod card tap" onclick="go('#/module/${m.id}')">
      <div class="top"><div class="num">${m.num}</div><div class="nom">${esc(m.nom)}</div><div class="small muted">${READTIME[m.id]} min</div></div>
      <div class="mini"><div class="g"><div class="lab"><span>Cours lu</span><span>${r}%</span></div><div class="bar"><i class="${r === 100 ? 'full' : ''}" style="width:${r}%"></i></div></div></div></a>`;
  });
  return html;
}
function vModule(mid, tab) {
  const m = MOD[mid]; if (!m) return `<div class="card">Module introuvable.</div>`;
  let html = `<div class="qhead"><a onclick="go('#/cours')">‹ Cours</a><span class="mid">Module ${m.num}</span><span></span></div>`;
  html += `<h2 class="page">${esc(m.nom)}</h2>`;
  html += `<div class="subtabs"><button data-st="essentiel" class="${tab === 'essentiel' ? 'on' : ''}">📌 Essentiel</button><button data-st="complet" class="${tab === 'complet' ? 'on' : ''}">📚 Cours complet</button></div>`;
  html += tab === 'essentiel' ? vEssentiel(m) : vComplet(m);
  html += `<div class="qbar"><button class="btn" onclick="go('#/drill/${m.id}')">🎯 S'entraîner sur ce module (${(QBYMOD[m.id] || []).length} QCM)</button></div>`;
  return html;
}
function cue(t) { const s = String(t); return s.length > 70 ? s.slice(0, 68).replace(/\s+\S*$/, '') + ' …' : s; }
function vEssentiel(m) {
  const e = m.essentiel || {}; let html = '';
  if ((e.a_retenir || []).length) {
    html += `<h3 class="sec">À retenir absolument</h3>`;
    e.a_retenir.forEach(t => {
      html += `<div class="flash" data-cue="${esc(cue(t))}" data-full="${esc(t)}" onclick="this.classList.toggle('open');var c=this.querySelector('.ct');c.textContent=this.classList.contains('open')?this.dataset.full:this.dataset.cue;this.querySelector('.side').textContent=this.classList.contains('open')?'à retenir':'touche pour révéler'">
        <span class="side">touche pour révéler</span><div class="ct">${esc(cue(t))}</div></div>`;
    });
  }
  if ((e.chiffres || []).length) html += `<div class="bloc chiffres"><div class="h">🔢 Chiffres-clés</div><ul>${e.chiffres.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
  if ((e.pieges || []).length) html += `<div class="bloc pieges"><div class="h">⚠️ Pièges fréquents</div><ul>${e.pieges.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
  return html || `<div class="note">Voir le cours complet.</div>`;
}
function vComplet(m) {
  let html = `<div class="readtime">⏱️ ~${READTIME[m.id]} min de lecture · ${m.sections.length} sections</div>`;
  html += `<div class="lecture">`;
  const pos = S.pos[m.id];
  if (pos && m.sections.some(s => s.id === pos)) html += `<button class="btn ghost sm" style="margin-bottom:10px" onclick="document.getElementById('${pos}').scrollIntoView({behavior:'smooth'})">↩︎ Reprendre la lecture</button>`;
  html += `<div class="toc"><b>Sommaire</b>${m.sections.map(s => `<a onclick="document.getElementById('${s.id}').scrollIntoView({behavior:'smooth'})"><span>${esc(s.titre)}</span>${S.read[s.id] ? '<span class="ck">✓</span>' : ''}</a>`).join('')}</div>`;
  m.sections.forEach((s, i) => {
    html += `<section id="${s.id}" data-sid="${s.id}"><div class="row-between"><h3>${esc(s.titre)}</h3><button class="starsec" onclick="starSec('${s.id}',this)">${S.starSec[s.id] ? '★' : '☆'}</button></div>`;
    (s.points || []).forEach(p => html += `<p>${esc(p)}</p>`);
    if ((s.chiffres || []).length) html += `<div class="bloc chiffres"><div class="h">🔢 Chiffres-clés</div><ul>${s.chiffres.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
    if ((s.pieges || []).length) html += `<div class="bloc pieges"><div class="h">⚠️ Pièges</div><ul>${s.pieges.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
    (VIS_BY_SEC[s.id] || []).forEach(b => html += renderVisual(b));
    html += sectionQuiz(s.id);
    html += `</section>`;
  });
  html += `</div>`;
  return html;
}
window.starSec = function (sid, btn) { if (S.starSec[sid]) delete S.starSec[sid]; else S.starSec[sid] = 1; save(); btn.textContent = S.starSec[sid] ? '★' : '☆'; haptic(10); };
function bindModule(mid, tab, anchor) {
  document.querySelectorAll('.subtabs button').forEach(b => b.onclick = () => go('#/module/' + mid + '/' + b.dataset.st));
  if (tab === 'complet') {
    S.lastAction = { type: 'lire', href: '#/module/' + mid + '/complet', label: 'lecture ' + MOD[mid].nom, ts: Date.now() }; save();
    const rb = $('#readbar'); rb.style.display = 'block';
    const onScroll = () => { const h = document.documentElement; const m = h.scrollHeight - h.clientHeight; rb.style.width = (m > 0 ? Math.min(100, 100 * h.scrollTop / m) : 0) + '%'; };
    window.removeEventListener('scroll', window._rs || (() => {})); window._rs = onScroll; window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { const sid = en.target.dataset.sid; if (sid) { S.read[sid] = 1; S.pos[mid] = sid; save(); } } }), { threshold: .5 });
    document.querySelectorAll('section[data-sid]').forEach(s => io.observe(s));
    enhanceVisuals();
    if (anchor) { const el = document.getElementById(anchor); if (el) setTimeout(() => el.scrollIntoView(), 80); }
  }
}

/* ============================================================ VISUELS DE COURS */
function renderVisual(b) {
  let inner = '';
  if (b.type === 'compare') inner = visCompare(b);
  else if (b.type === 'flow' || b.type === 'timeline') inner = visFlow(b, b.type === 'timeline');
  else if (b.type === 'pyramid') inner = visPyramid(b);
  else if (b.type === 'cycle') inner = visCycle(b);
  else if (b.type === 'bignum') inner = visBig(b);
  else return '';
  if (!inner) return '';
  const icon = { compare: '⚖️', flow: '🔀', timeline: '🧭', pyramid: '🔺', cycle: '🔄', bignum: '🔢' }[b.type] || '▦';
  return `<div class="vis"><div class="vtitle"><span class="ic">${icon}</span>${esc(b.titre || '')}</div>${b.intro ? `<div class="vintro">${esc(b.intro)}</div>` : ''}${inner}</div>`;
}
function visCompare(b) {
  const heads = b.headers || [], rows = b.rows || [];
  if (heads.length < 2 || !rows.length) return '';
  let h = `<div class="ctable-wrap"><table class="ctable"><thead><tr>${heads.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>`;
  rows.forEach(r => { const c = r.cells || []; h += `<tr>${heads.map((_, i) => `<td>${esc(c[i] || '')}</td>`).join('')}</tr>`; });
  return h + `</tbody></table></div>`;
}
function visFlow(b, isTL) {
  const steps = b.steps || []; if (!steps.length) return '';
  return `<div class="vflow ${isTL ? 'tl' : ''}">${steps.map((s, i) => `<div class="vstep" onclick="this.classList.toggle('open')"><div class="n">${i + 1}</div><div class="st">${esc(s.t)}${s.d ? ' <span class="more">détail ›</span>' : ''}</div>${s.d ? `<div class="sd">${esc(s.d)}</div>` : ''}</div>`).join('')}</div>`;
}
function visPyramid(b) {
  const lv = b.levels || []; if (!lv.length) return '';
  return `<div class="vpyr">${lv.map(l => `<div class="vlevel" onclick="this.classList.toggle('open')"><div class="lt">${esc(l.t)}</div>${l.d ? `<div class="ld">${esc(l.d)}</div>` : ''}</div>`).join('')}</div>`;
}
function visBig(b) {
  if (!b.value) return '';
  return `<div class="vbig"><div class="num" data-to="${esc(b.value)}">${esc(b.value)}</div><div class="nl">${esc(b.note || '')}</div></div>`;
}
function visCycle(b) {
  const steps = b.steps || [], n = steps.length; if (!n) return '';
  if (n > 6) return visFlow(b, false);
  const cx = 70, cy = 70, r = 50, pts = [];
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  let path = '', nodes = '';
  pts.forEach((p, i) => { const q = pts[(i + 1) % n]; path += `<line x1="${p[0].toFixed(0)}" y1="${p[1].toFixed(0)}" x2="${q[0].toFixed(0)}" y2="${q[1].toFixed(0)}" stroke="var(--line)" stroke-width="2"/>`; });
  pts.forEach((p, i) => { nodes += `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="14" fill="var(--or)"/><text x="${p[0].toFixed(0)}" y="${(p[1] + 4).toFixed(0)}" text-anchor="middle" font-size="13" font-weight="700" fill="#1c1407">${i + 1}</text>`; });
  const legend = steps.map((s, i) => `<div style="display:flex;gap:7px;margin:3px 0"><b>${i + 1}.</b><span>${esc(s.t)}${s.d ? ' — ' + esc(s.d) : ''}</span></div>`).join('');
  return `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><svg class="vcycle" style="max-width:150px" viewBox="0 0 140 140">${path}${nodes}</svg><div style="flex:1;min-width:170px;font-size:.88rem">${legend}</div></div>`;
}
function enhanceVisuals() {
  // chiffres-clés animés (les blocs sont visibles par défaut via CSS)
  document.querySelectorAll('.vbig .num').forEach(num => {
    if (num._done) return; const m = String(num.dataset.to || '').match(/^(\d[\d  ]*)/);
    if (m) { num._done = 1; const n = parseInt(m[1].replace(/\s/g, ''), 10); if (!isNaN(n) && n > 0) animateCount(num, n, num.dataset.to.slice(m[1].length)); }
  });
}
/* mini-quiz "teste-toi" intégré au cours */
let stIdx = {};
function sectionQuiz(sid) {
  const pool = QCM_BY_SEC[sid] || []; if (!pool.length) return '';
  const q = pool[(stIdx[sid] || 0) % pool.length];
  let h = `<div class="selftest" id="st-${sid}"><div class="stq"><span class="ic">🧠</span><span>Teste-toi : ${esc(q.enonce)}</span></div>`;
  q.options.forEach((o, i) => h += `<button class="sopt" onclick="stAns('${sid}','${q.id}',${i},this)"><span class="let">${letters(i)}</span><span>${esc(o.texte)}</span></button>`);
  h += `<div class="sfoot"></div></div>`;
  return h;
}
window.stAns = function (sid, qid, idx, btn) {
  const q = QBYID[qid], card = document.getElementById('st-' + sid); if (!card) return;
  card.querySelectorAll('.sopt').forEach((b, i) => { b.setAttribute('disabled', ''); if (i === q.correct) b.classList.add('good'); else if (i === idx) b.classList.add('bad'); });
  const correct = idx === q.correct; recordAnswer(qid, correct); haptic(correct ? 16 : [10, 30, 10]);
  const pool = QCM_BY_SEC[sid] || [];
  card.querySelector('.sfoot').innerHTML =
    `<div class="sexpl"><span class="${correct ? 'ok' : 'ko'}">${correct ? 'Juste !' : 'Raté.'}</span> ${esc(q.options[q.correct].justif)}</div>` +
    (pool.length > 1 ? `<div style="margin-top:8px"><button class="btn ghost sm" style="width:auto" onclick="stNext('${sid}')">Autre question ›</button></div>` : '');
};
window.stNext = function (sid) { stIdx[sid] = (stIdx[sid] || 0) + 1; const c = document.getElementById('st-' + sid); if (c) c.outerHTML = sectionQuiz(sid); };

/* ============================================================ ENTRAÎNEMENT */
function shortNom(n) { return n.length > 24 ? n.slice(0, 23) + '…' : n; }
function vEntrainement() {
  const nbWrong = Object.keys(S.wrong).length, nbFav = Object.keys(S.starQ).length;
  const totalQ = Object.values(QBYMOD).reduce((s, a) => s + a.length, 0);
  let html = `<h2 class="page">Entraînement</h2>`;
  const exQ = (C.meta.exam.total_q || 60), exMin = (C.meta.exam.duree_min || 90);
  html += `<div class="card"><div class="serif" style="font-size:1.05rem">🧪 Examen blanc</div><p class="small muted">${exQ} questions tirées dans tous les modules, ${exMin} min, score + maîtrise par module à la fin.</p><button class="btn" onclick="go('#/examen')">Démarrer</button></div>`;
  html += `<div class="card tap" onclick="go('#/cas')"><div class="serif" style="font-size:1.05rem">📂 Cas d'entraînement (${(C.cas || []).length})</div><p class="small muted">7 cas type (EDC1-7) avec corrigé : entraîne-toi à PRODUIRE un livrable, comme le jour J.</p></div>`;
  html += `<div class="btn-row"><button class="btn sec" onclick="go('#/echauffement')">⚡ Échauffement (10 Q)</button><button class="btn sec" onclick="go('#/erreurs')">🔁 Erreurs${nbWrong ? ' (' + nbWrong + ')' : ''}</button></div><div class="sp"></div>`;
  html += `<div class="btn-row"><button class="btn sec" onclick="go('#/flash')">🃏 Flashcards</button><button class="btn sec" onclick="go('#/favoris')">⭐ Favoris${nbFav ? ' (' + nbFav + ')' : ''}</button></div><div class="sp"></div>`;
  html += `<div class="btn-row"><button class="btn ghost sm" onclick="go('#/stats')">📊 Mes stats</button></div>`;
  html += `<h3 class="sec">Drill par module</h3>`;
  C.modules.forEach(m => { const mc = masteryClass(m.id); html += `<a class="mod card tap" onclick="go('#/drill/${m.id}')"><div class="top"><div class="num">${m.num}</div><div class="nom">${esc(m.nom)}</div><span class="mastery ${mc}">${(QBYMOD[m.id] || []).length} Q</span></div></a>`; });
  html += `<div class="note" style="margin-top:6px">Banque : <b>${totalQ}</b> questions. À l'examen réel, elles changent : entraîne ta <b>compréhension</b>.</div>`;
  return html;
}

/* ============================================================ PAR BLOC / PAR ÉPREUVE */
function secList(titre, arr) {
  if (!arr || !arr.length) return '';
  return `<h3 class="sec">${esc(titre)}</h3><ul style="padding-left:1.1rem">${arr.map(x => '<li style="margin-bottom:5px;line-height:1.5">' + esc(x) + '</li>').join('')}</ul>`;
}
function vBlocList() {
  const blocs = C.blocs || [];
  let html = `<div class="qhead"><a onclick="go('#/accueil')">‹ Accueil</a><span class="mid">Par bloc</span><span></span></div><h2 class="page">🎯 Réviser par bloc</h2>`;
  html += `<div class="note">Les 4 blocs = tes 4 épreuves. Pour chacun : quoi réviser, les formules, le plan du livrable, les pièges, et l'accès direct aux modules et aux cas.</div><div class="sp"></div>`;
  blocs.forEach(b => {
    html += `<a class="mod card tap" onclick="go('#/bloc/${b.id}')"><div class="top"><div class="num" style="font-size:.85rem;min-width:52px">${esc(b.code)}</div><div class="nom">${esc(b.titre)}</div><span class="mastery todo">${esc(b.edc)}</span></div><div class="small muted" style="margin-top:5px">🗓️ ${esc(b.jour)}</div></a>`;
  });
  return html;
}
function vBlocDetail(id) {
  const b = (C.blocs || []).find(x => x.id === id);
  if (!b) return `<div class="card">Bloc introuvable. <button class="btn" onclick="go('#/bloc')">Retour</button></div>`;
  let html = `<div class="qhead"><a onclick="go('#/bloc')">‹ Blocs</a><span class="mid">${esc(b.code)}</span><span></span></div>`;
  html += `<h2 class="page">${esc(b.titre)}</h2>`;
  html += `<div class="bloc chiffres"><div class="h">🗓️ ÉPREUVE</div><div><b>${esc(b.edc)}</b> — ${esc(b.jour)}<br>${esc(b.type)}</div></div>`;
  if (b.echeance) html += `<div class="bloc pieges"><div class="h">⏰ ÉCHÉANCE</div><div>${esc(b.echeance)}</div></div>`;
  html += secList('Compétences évaluées', b.competences);
  html += secList('Comment attaquer', b.methode);
  if ((b.formules || []).length) html += `<h3 class="sec">Formules à connaître</h3><div class="bloc chiffres"><ul style="padding-left:1.1rem">${b.formules.map(f => '<li style="margin-bottom:5px">' + esc(f) + '</li>').join('')}</ul></div>`;
  html += secList('Plan du livrable', b.plan);
  if ((b.pieges || []).length) html += `<div class="bloc pieges"><div class="h">⚠️ PIÈGES</div><ul style="padding-left:1.1rem">${b.pieges.map(x => '<li style="margin-bottom:3px">' + esc(x) + '</li>').join('')}</ul></div>`;
  html += `<h3 class="sec">📖 Réviser ces modules</h3><div class="btn-row">`;
  (b.modules || []).forEach(mid => { if (typeof MOD !== 'undefined' && MOD[mid]) html += `<button class="btn sec sm" onclick="go('#/module/${mid}')">${esc(MOD[mid].nom)}</button>`; });
  html += `</div>`;
  if ((b.cas || []).length) {
    html += `<h3 class="sec">📂 S'entraîner sur les cas</h3><div class="btn-row">`;
    (b.cas || []).forEach(cid => { const c = (C.cas || []).find(x => x.id === cid); if (c) html += `<button class="btn sm" onclick="go('#/cas/${cid}')">${esc(c.edc)}</button>`; });
    html += `</div>`;
  }
  return html;
}

/* ============================================================ CAS D'ENTRAÎNEMENT */
function vCasList() {
  const cas = C.cas || [];
  let html = `<div class="qhead"><a onclick="go('#/entrainement')">‹ Entraînement</a><span class="mid">Cas d'entraînement</span><span></span></div><h2 class="page">📂 Cas d'entraînement</h2>`;
  html += `<div class="note">Un cas par épreuve (EDC1 à 7). Traite-le d'abord sur feuille ou Excel, PUIS révèle le corrigé. À l'examen, ce qui compte c'est la MÉTHODE et la structure du livrable.</div><div class="sp"></div>`;
  cas.forEach(c => {
    html += `<a class="mod card tap" onclick="go('#/cas/${c.id}')"><div class="top"><div class="num" style="font-size:.9rem;min-width:44px">${esc(c.edc)}</div><div class="nom">${esc(c.titre)}</div><span class="mastery todo">${esc(c.duree || '')}</span></div><div class="small muted" style="margin-top:5px">${esc(c.comp || '')}</div></a>`;
  });
  return html;
}
function vCasDetail(id) {
  const c = (C.cas || []).find(x => x.id === id);
  if (!c) return `<div class="card">Cas introuvable. <button class="btn" onclick="go('#/cas')">Retour</button></div>`;
  let html = `<div class="qhead"><a onclick="go('#/cas')">‹ Cas</a><span class="mid">${esc(c.edc)}</span><span></span></div>`;
  html += `<h2 class="page">${esc(c.titre)}</h2><div class="small muted" style="margin-bottom:10px">${esc(c.comp || '')}${c.duree ? ' · ⏱️ ' + esc(c.duree) : ''}</div>`;
  html += `<div class="bloc chiffres"><div class="h">📄 CONTEXTE</div><div>${esc(c.contexte || '')}</div></div>`;
  html += `<h3 class="sec">Travail à faire</h3>`;
  (c.enonce || []).forEach(e => html += `<p style="margin:8px 0;line-height:1.55">${esc(e)}</p>`);
  html += `<div class="qbar"><button class="btn or" onclick="var d=document.getElementById('corr');d.style.display='block';this.style.display='none';d.scrollIntoView({behavior:'smooth',block:'start'})">✅ Voir le corrigé</button></div>`;
  html += `<div id="corr" style="display:none"><h3 class="sec">Corrigé</h3>`;
  (c.corrige || []).forEach(e => html += `<div class="bloc" style="background:var(--vert-bg)"><div style="line-height:1.55">${esc(e)}</div></div>`);
  if (c.module && typeof MOD !== 'undefined' && MOD[c.module]) html += `<button class="btn sec" style="margin-top:10px" onclick="go('#/module/${c.module}/complet')">📖 Revoir le cours : ${esc(MOD[c.module].nom)}</button>`;
  html += `</div>`;
  return html;
}

/* ============================================================ SESSION QCM */
function buildQueue(mode, mid) {
  if (mode === 'drill') return shuffle((QBYMOD[mid] || []).map(q => q.id));
  if (mode === 'echauffement') return shuffle(Object.keys(QBYID)).slice(0, 10);
  if (mode === 'erreurs') return shuffle(Object.keys(S.wrong).filter(id => QBYID[id]));
  if (mode === 'favoris') return shuffle(Object.keys(S.starQ).filter(id => QBYID[id]));
  return [];
}
function startSession(mode, mid) {
  const queue = buildQueue(mode, mid);
  if (!queue.length) { $('#view').innerHTML = emptyState(mode); return; }
  sess = { mode, mid, queue, i: 0, answered: {}, results: [], streak: 0 };
  if (mode === 'drill') { S.lastAction = { type: 'drill', href: '#/drill/' + mid, label: 'drill ' + MOD[mid].nom, ts: Date.now() }; save(); }
  renderSession();
}
function emptyState(mode) {
  const map = {
    erreurs: ['✅', 'Rien à revoir, tout est maîtrisé !', 'Fais des QCM, les questions ratées arriveront ici.'],
    favoris: ['⭐', 'Aucun favori pour l’instant', 'Touche l’étoile sous une question pour la garder ici.'],
    esg: ['🌱', 'Module ESG indisponible', ''], echauffement: ['⚡', 'Pas de questions', '']
  };
  const m = map[mode] || ['🙂', 'Rien ici', ''];
  return `<div class="empty"><div class="em">${m[0]}</div><h2 class="page">${esc(m[1])}</h2><p class="muted">${esc(m[2])}</p>
    <div class="btn-row"><button class="btn" onclick="go('#/examen')">Examen blanc</button><button class="btn sec" onclick="go('#/entrainement')">Retour</button></div></div>`;
}
function sessTitle() { const s = sess.mode; return s === 'drill' ? 'Module ' + MOD[sess.mid].num : s === 'esg' ? 'Drill ESG' : s === 'echauffement' ? 'Échauffement' : s === 'erreurs' ? 'Révision erreurs' : s === 'favoris' ? 'Favoris' : 'Examen'; }
function renderSession() {
  if (!sess) { go('#/entrainement'); return; }
  if (sess.mode === 'exam') { renderExamQ(); return; }
  if (sess.i >= sess.queue.length) { $('#view').innerHTML = vSessionEnd(); afterSessionEnd(); return; }
  const q = QBYID[sess.queue[sess.i]], total = sess.queue.length;
  let html = `<div class="qhead"><a onclick="quitSession()">‹ Quitter</a><span class="mid">${esc(sessTitle())}</span><span>${sess.i + 1}/${total}</span></div>`;
  html += `<div class="qprog"><i style="width:${pct(sess.i, total)}%"></i></div>`;
  html += `<div class="sessbar"><span>Question ${sess.i + 1}</span><span class="streakmini">${sess.streak >= 2 ? '🔥 série ' + sess.streak : ''}</span></div>`;
  html += `<div id="qbody">${qBody(q)}</div><div id="qfoot"></div>`;
  $('#view').innerHTML = html;
  bindQuestion(q, true);
}
function qBody(q) {
  let h = `<div class="enonce">${esc(q.enonce)}</div>`;
  q.options.forEach((o, i) => h += `<button class="opt" data-idx="${i}"><span class="let">${letters(i)}</span><span>${esc(o.texte)}</span></button>`);
  return h;
}
function bindQuestion(q, immediate) {
  document.querySelectorAll('.opt').forEach(btn => btn.onclick = () => answer(q, +btn.dataset.idx, immediate));
  attachSwipe();
}
function answer(q, idx, immediate) {
  if (sess.answered[q.id] != null) return;
  sess.answered[q.id] = idx;
  const correct = idx === q.correct;
  sess.results.push({ id: q.id, correct });
  sess.streak = correct ? sess.streak + 1 : 0;
  recordAnswer(q.id, correct);
  haptic(correct ? 18 : [10, 40, 10]);
  if (sess.mode === 'erreurs' && !correct) sess.queue.splice(Math.min(sess.queue.length, sess.i + 3), 0, q.id);
  // révéler en place
  document.querySelectorAll('.opt').forEach((b, i) => {
    b.setAttribute('disabled', '');
    if (i === q.correct) { b.classList.add('good'); b.insertAdjacentHTML('beforeend', '<span class="mark">✓</span>'); }
    else if (i === idx) { b.classList.add('bad'); b.insertAdjacentHTML('beforeend', '<span class="mark">✗</span>'); }
  });
  let e = `<div class="expl"><div class="v ${correct ? 'ok' : 'ko'}">${correct ? '✅ Bonne réponse' : '✗ Mauvaise réponse'}</div><ul>`;
  q.options.forEach((o, i) => e += `<li class="${i === q.correct ? 'good' : 'bad'}"><span class="l">${letters(i)} ${i === q.correct ? '(juste)' : '(faux)'} :</span> ${esc(o.justif)}</li>`);
  e += `</ul>`;
  if (q.a_verifier) e += `<div class="averif">⚠︎ À revérifier dans ton cours officiel.</div>`;
  e += `<div class="btn-row" style="margin-top:8px"><button class="btn sec sm" onclick="go('#/lire/${q.ancre.split('-')[0]}/${q.ancre}')">📖 Revoir dans le cours</button>
    <button class="btn ghost sm" onclick="toggleMarkUI('${q.id}',this)">${S.starQ[q.id] ? '★ Favori' : '☆ Favori'}</button></div></div>`;
  const last = sess.i + 1 >= sess.queue.length;
  e += `<div class="qbar"><button class="btn" onclick="nextQ()">${last ? 'Voir le bilan' : 'Question suivante ›'}</button></div>`;
  $('#qfoot').innerHTML = e;
  setTimeout(() => { const b = $('#qfoot .expl'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
}
window.nextQ = function () { if (!sess) return; sess.i++; if (sess.mode === 'exam') { persistExam(); renderExamQ(); } else renderSession(); };
window.quitSession = function () { if (sess && sess.mode === 'exam' && sess.i < sess.queue.length && !confirm('Quitter l’examen en cours ?')) return; stopTimer(); if (sess && sess.mode === 'exam') { S.examInProgress = null; save(); } sess = null; go('#/entrainement'); };
window.toggleMarkUI = function (qid, btn) { toggleMark(qid); btn.textContent = S.starQ[qid] ? '★ Favori' : '☆ Favori'; haptic(10); };

function vSessionEnd() {
  const r = sess.results, ok = r.filter(x => x.correct).length, score = pct(ok, r.length);
  const done = dailyDone(), goal = S.daily.goal || 20;
  let html = `<h2 class="page">Terminé 🎉</h2><div class="card center"><div class="bigscore" id="endscore">0%</div><div class="muted">${ok} / ${r.length} bonnes réponses</div></div>`;
  if (done < goal) html += `<div class="coach">Plus que <b>${goal - done}</b> question(s) pour boucler ton objectif du jour.</div>`;
  else html += `<div class="coach">✅ Objectif du jour atteint — série de <b>${S.daily.streak} jour(s)</b> !</div>`;
  if (sess.mode === 'drill') html += `<div class="btn-row"><button class="btn" onclick="go('#/drill/${sess.mid}')">↻ Recommencer</button><button class="btn sec" onclick="go('#/module/${sess.mid}/complet')">📖 Revoir le cours</button></div>`;
  else html += `<button class="btn" onclick="go('#/entrainement')">Retour</button>`;
  snapshot();
  sess = null;
  window._endscore = score;
  return html;
}
function afterSessionEnd() { const el = $('#endscore'); if (el) animateCount(el, window._endscore || 0, '%'); }

/* ============================================================ EXAMEN */
function vExamenIntro() {
  const exQ = (C.meta.exam.total_q || 60), exMin = (C.meta.exam.duree_min || 90), seuil = (C.meta.exam.seuil_pct || 70);
  let html = `<div class="qhead"><a onclick="go('#/entrainement')">‹ Entraînement</a><span class="mid">Examen blanc</span><span></span></div><h2 class="page">🧪 Examen blanc</h2>`;
  if (S.examInProgress && (S.examInProgress.startTs + S.examInProgress.durationMs - Date.now()) > 0) {
    const left = Math.round((S.examInProgress.startTs + S.examInProgress.durationMs - Date.now()) / 60000);
    html += `<div class="card"><b>Examen en cours</b><div class="small muted">Question ${S.examInProgress.i + 1}/${exQ} · ~${left} min restantes</div><button class="btn" style="margin-top:8px" onclick="resumeExam()">↩︎ Reprendre</button></div>`;
  }
  html += `<div class="card"><ul class="small"><li><b>${exQ} questions</b> tirées dans tous les modules.</li><li><b>${exMin} min</b>, pas de points négatifs, correction à la fin.</li><li>Objectif : <b>≥ ${seuil} %</b> de réussite.</li></ul><button class="btn" onclick="startExam()">Démarrer (${exMin} min)</button></div>`;
  html += `<div class="note">L'examen RNCP réel est en <b>open-book</b> (cas à traiter, ressources + IA autorisées). Ici on entraîne la <b>compréhension</b> des concepts.</div>`;
  if (S.examHistory && S.examHistory.length) {
    html += `<h3 class="sec">Tes examens blancs</h3><div class="card">${sparkline(S.examHistory)}<div class="small muted center">score — ligne = seuil ${seuil} %</div></div>`;
  }
  return html;
}
function sparkline(hist) {
  const h = hist.slice(-12), W = 320, H = 40, n = h.length; if (!n) return '';
  const seuil = (C.meta.exam.seuil_pct || 70);
  const x = i => n === 1 ? W / 2 : (i / (n - 1)) * W;
  const yA = v => H - (v / 100) * H, line = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(0) + ' ' + yA(p).toFixed(0)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="0" y1="${yA(seuil)}" x2="${W}" y2="${yA(seuil)}" stroke="var(--ink-soft)" stroke-dasharray="3 3" stroke-width="1" opacity=".6"/>
    <path d="${line(h.map(e => e.pct))}" fill="none" stroke="var(--brand)" stroke-width="2"/>
    ${h.map((e, i) => `<circle cx="${x(i).toFixed(0)}" cy="${yA(e.pct).toFixed(0)}" r="2.2" fill="var(--brand)"/>`).join('')}
  </svg>`;
}
window.startExam = function () {
  sess = { mode: 'exam', queue: examDraw(), i: 0, answered: {}, results: [], startTs: Date.now(), durationMs: (C.meta.exam.duree_min || 90) * 60000 };
  persistExam(); startTimer(); go('#/examen-run'); renderExamQ();
};
window.resumeExam = function () {
  const e = S.examInProgress; if (!e) return;
  sess = { mode: 'exam', queue: e.queue, i: e.i, answered: e.answered, results: [], startTs: e.startTs, durationMs: e.durationMs };
  startTimer(); go('#/examen-run'); renderExamQ();
};
function persistExam() { if (sess && sess.mode === 'exam') { S.examInProgress = { queue: sess.queue, i: sess.i, answered: sess.answered, startTs: sess.startTs, durationMs: sess.durationMs }; save(); } }
function examDraw() { const picked = []; C.modules.forEach(m => { const bank = shuffle((QBYMOD[m.id] || []).slice()); const n = m.q || 0; for (let i = 0; i < n; i++) { if (bank.length) picked.push(bank.shift()); } }); return shuffle(picked).map(q => q.id); }
function take(arr, n, out, fb) { for (let i = 0; i < n; i++) { if (arr.length) out.push(arr.shift()); else { const f = (fb || []).filter(q => out.indexOf(q) < 0); if (f.length) out.push(shuffle(f)[0]); } } }
let timerId = null;
function startTimer() { stopTimer(); timerId = setInterval(tick, 1000); }
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function tick() { if (!sess || sess.mode !== 'exam') { stopTimer(); return; } const left = sess.durationMs - (Date.now() - sess.startTs); const el = $('#chrono'); if (left <= 0) { stopTimer(); finishExam(); return; } if (el) { const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000); el.textContent = mm + ':' + String(ss).padStart(2, '0'); el.classList.toggle('warn', left < 5 * 60000); } }
function renderExamQ() {
  if (!sess || sess.mode !== 'exam') return;
  if (sess.i >= sess.queue.length) { finishExam(); return; }
  const q = QBYID[sess.queue[sess.i]];
  let html = `<div class="qhead"><a onclick="quitSession()">‹ Quitter</a><span class="chrono mid" id="chrono">…</span><span>${sess.i + 1}/${sess.queue.length}</span></div>`;
  html += `<div class="qprog"><i style="width:${pct(sess.i, sess.queue.length)}%"></i></div><div id="qbody">${qBody(q)}</div><div id="qfoot"></div>`;
  $('#view').innerHTML = html;
  const chosen = sess.answered[q.id];
  document.querySelectorAll('.opt').forEach(btn => {
    if (chosen != null && +btn.dataset.idx === chosen) btn.style.borderColor = 'var(--brand)';
    btn.onclick = () => {
      sess.answered[q.id] = +btn.dataset.idx; persistExam(); haptic(10);
      document.querySelectorAll('.opt').forEach(b => b.style.borderColor = ''); btn.style.borderColor = 'var(--brand)';
      showExamFoot(q);
    };
  });
  if (chosen != null) showExamFoot(q);
  attachSwipe(); tick();
}
function showExamFoot(q) {
  const last = sess.i + 1 >= sess.queue.length;
  $('#qfoot').innerHTML = `<div class="qbar"><button class="btn" onclick="nextQ()">${last ? 'Terminer l’examen' : 'Suivant ›'}</button>
    <button class="btn ghost sm" style="width:100%;margin-top:6px" onclick="finishExam()">Terminer maintenant</button></div>`;
}
window.finishExam = function () {
  stopTimer(); if (!sess) return;
  let T = 0, OK = 0; const perMod = {};
  sess.queue.forEach(qid => { const q = QBYID[qid], ok = sess.answered[qid] === q.correct; T++; if (ok) OK++; const pm = perMod[q.module] || { t: 0, ok: 0, num: q.modnum, nom: MOD[q.module].nom }; pm.t++; if (ok) pm.ok++; perMod[q.module] = pm; recordAnswer(qid, ok); });
  const score = pct(OK, T), seuil = (C.meta.exam.seuil_pct || 70);
  lastExam = { score, OK, T, admis: score >= seuil, perMod, total: sess.queue.length, ok: OK };
  S.examHistory = (S.examHistory || []).concat([{ ts: Date.now(), pct: score, admis: lastExam.admis }]).slice(-20);
  S.examInProgress = null; snapshot(); save();
  sess = null; go('#/resultat');
};
let lastExam = null;
function snapshot() { const G = globalEstimate(); S.snap = { g: G.taux, ts: Date.now() }; save(); }
function vResultat() {
  if (!lastExam) return `<div class="card">Aucun résultat. <button class="btn" onclick="go('#/examen')">Faire un examen</button></div>`;
  const r = lastExam, seuil = (C.meta.exam.seuil_pct || 70);
  let html = `<h2 class="page">Résultat</h2><div class="card center"><div class="bigscore" id="rscore">0%</div><div class="muted">${r.ok}/${r.total}</div>${r.admis ? '<div class="record">🏆 Objectif atteint</div>' : ''}</div>`;
  html += `<div class="card">${gauge('Maîtrise globale', r.score, 1)}
    <div class="verdict ${r.admis ? 'ok' : 'ko'}">${r.admis ? '✅ Au-dessus du seuil (≥ ' + seuil + ' %)' : '⏳ Pas encore — vise ' + seuil + ' % de réussite'}</div></div>`;
  const arr = Object.keys(r.perMod).map(mid => ({ mid, ...r.perMod[mid], taux: pct(r.perMod[mid].ok, r.perMod[mid].t) })).sort((a, b) => a.taux - b.taux).slice(0, 3);
  html += `<h3 class="sec">À retravailler en priorité</h3>`;
  arr.forEach(m => html += `<div class="card"><div class="row-between"><div><b>M${m.num}. ${esc(shortNom(m.nom))}</b><div class="small muted">${m.ok}/${m.t} · ${m.taux}%</div></div></div><div class="btn-row" style="margin-top:8px"><button class="btn sec sm" onclick="go('#/module/${m.mid}/complet')">📖 Cours</button><button class="btn sm" onclick="go('#/drill/${m.mid}')">🎯 Drill</button></div></div>`);
  html += `<button class="btn" onclick="go('#/examen')">↻ Nouvel examen</button>`;
  window._rscore = pct(r.ok, r.total); window._radmis = r.admis;
  return html;
}
function afterResultat() { const el = $('#rscore'); if (el) animateCount(el, window._rscore || 0, '%'); if (window._radmis) { haptic([20, 60, 20, 60, 40]); confetti(); } }

/* ============================================================ FLASHCARDS */
function startFlash() { if (!FLASH.length) { $('#view').innerHTML = `<div class="card">Pas de flashcards.</div>`; return; } fsess = { queue: shuffle(FLASH.map((_, i) => i)), i: 0, known: 0 }; renderFlash(); }
function renderFlash() {
  const v = $('#view');
  if (fsess.i >= fsess.queue.length) { v.innerHTML = `<h2 class="page">Flashcards finies 🎉</h2><div class="card center"><div class="bigscore">${fsess.known}/${fsess.queue.length}</div><div class="muted">cartes sues</div></div><button class="btn" onclick="go('#/flash')">↻ Recommencer</button><div class="sp"></div><button class="btn sec" onclick="go('#/entrainement')">Retour</button>`; return; }
  const f = FLASH[fsess.queue[fsess.i]];
  v.innerHTML = `<div class="qhead"><a onclick="go('#/entrainement')">‹ Quitter</a><span class="mid">Flashcards</span><span>${fsess.i + 1}/${fsess.queue.length}</span></div>
    <div class="flash" id="fcard"><span class="side">Module ${f.modnum} · touche pour révéler</span><div class="ct">${esc(cue(f.text))}</div></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn sec" onclick="flashRate(false)">Je ne savais pas</button><button class="btn" onclick="flashRate(true)">Je savais ✓</button></div>`;
  $('#fcard').onclick = function () { this.querySelector('.ct').textContent = f.text; this.querySelector('.side').textContent = 'Module ' + f.modnum; };
}
window.flashRate = function (known) { const f = FLASH[fsess.queue[fsess.i]]; if (known) { fsess.known++; S.flashKnown[f.id] = 1; } else delete S.flashKnown[f.id]; touchDaily(); save(); haptic(12); fsess.i++; renderFlash(); };

/* ============================================================ STATS */
function vStats() {
  let html = `<div class="qhead"><a onclick="go('#/entrainement')">‹ Entraînement</a><span class="mid">Mes stats</span><span></span></div><h2 class="page">📊 Mes stats</h2>`;
  const G = globalEstimate();
  html += `<div class="card">${gauge('Maîtrise globale', G.taux, G.att)}</div>`;
  html += `<h3 class="sec">Par module</h3>`;
  C.modules.map(m => ({ m, sc: moduleScore(m.id) })).sort((a, b) => (a.sc.att ? a.sc.taux : 999) - (b.sc.att ? b.sc.taux : 999)).forEach(({ m, sc }) => {
    html += `<a class="mod card tap" onclick="go('#/drill/${m.id}')"><div class="top"><div class="num">${m.num}</div><div class="nom">${esc(shortNom(m.nom))}</div><span class="small muted">${sc.vues}/${sc.total} vues · ${sc.att ? sc.taux + '%' : '—'}</span></div>
      <div class="mini"><div class="g"><div class="bar"><i class="${sc.att && sc.taux >= 80 ? 'full' : ''}" style="width:${sc.att ? sc.taux : 0}%"></i></div></div></div></a>`;
  });
  return html;
}

/* ============================================================ RÉGLAGES */
function vReglages() {
  const dark = document.body.classList.contains('dark');
  let html = `<div class="qhead"><a onclick="history.back()">‹ Retour</a><span class="mid">Réglages</span><span></span></div><h2 class="page">Réglages</h2>`;
  html += `<div class="card">
    <div class="setrow"><div><div class="k">Mode sombre</div><div class="d">Confort de lecture le soir</div></div><div class="switch ${dark ? 'on' : ''}" id="sw-dark"><i></i></div></div>
    <div class="setrow"><div class="k">Taille du texte du cours</div></div>
    <div class="seg" id="seg-scale">
      <button data-s="0.9" class="${S.scale == 0.9 ? 'on' : ''}">A-</button>
      <button data-s="1" class="${(S.scale == 1 || !S.scale) ? 'on' : ''}">A</button>
      <button data-s="1.15" class="${S.scale == 1.15 ? 'on' : ''}">A+</button>
      <button data-s="1.3" class="${S.scale == 1.3 ? 'on' : ''}">A++</button>
    </div>
    <div class="setrow"><div><div class="k">Objectif quotidien</div><div class="d">Questions par jour</div></div>
      <div class="seg" style="max-width:170px" id="seg-goal">
        <button data-g="10" class="${S.daily.goal == 10 ? 'on' : ''}">10</button>
        <button data-g="20" class="${S.daily.goal == 20 ? 'on' : ''}">20</button>
        <button data-g="40" class="${S.daily.goal == 40 ? 'on' : ''}">40</button>
      </div></div>
  </div>`;
  html += `<div class="card"><div class="setrow"><div><div class="k">Exporter ma progression</div><div class="d">Sauvegarde (fichier JSON)</div></div><button class="iconbtn" onclick="exportProgress()">Exporter</button></div>
    <div class="setrow"><div><div class="k">Importer</div><div class="d">Restaurer une sauvegarde</div></div><label class="iconbtn">Importer<input type="file" id="imp" accept="application/json" style="display:none"></label></div></div>`;
  html += `<button class="btn ghost" onclick="resetAll()" style="color:var(--rouge);border-color:var(--rouge)">🗑️ Réinitialiser ma progression</button>`;
  html += `<div class="note" style="margin-top:12px">App de révision RNCP · 100 % hors-ligne · tes données restent sur cet appareil.</div>`;
  return html;
}
function bindReglages() {
  $('#sw-dark').onclick = function () { S.theme = document.body.classList.contains('dark') ? 'light' : 'dark'; save(); applyTheme(); this.classList.toggle('on'); haptic(10); };
  document.querySelectorAll('#seg-scale button').forEach(b => b.onclick = () => { S.scale = +b.dataset.s; save(); applyTheme(); document.querySelectorAll('#seg-scale button').forEach(x => x.classList.toggle('on', x === b)); });
  document.querySelectorAll('#seg-goal button').forEach(b => b.onclick = () => { S.daily.goal = +b.dataset.g; save(); document.querySelectorAll('#seg-goal button').forEach(x => x.classList.toggle('on', x === b)); });
  const imp = $('#imp'); if (imp) imp.onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); S = Object.assign(blank(), d); save(); applyTheme(); alert('Progression importée ✓'); go('#/accueil'); } catch (x) { alert('Fichier invalide'); } }; rd.readAsText(f); };
}
window.exportProgress = function () {
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'progression-rncp.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* ============================================================ RECHERCHE */
function vRecherche() { return `<div class="qhead"><a onclick="history.back()">‹ Retour</a><span class="mid">Recherche</span><span></span></div><div class="search card"><input id="q" placeholder="Chercher dans le cours et les questions…" enterkeyhint="search" autocapitalize="off" autocorrect="off" spellcheck="false"></div><div id="results"></div>`; }
function bindRecherche() { const i = $('#q'); i.focus(); i.oninput = () => doSearch(i.value.trim()); }
function doSearch(term) {
  const box = $('#results'); if (term.length < 2) { box.innerHTML = ''; return; }
  const t = term.toLowerCase(), hits = [], rx = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  C.modules.forEach(m => {
    m.sections.forEach(s => { const hay = [s.titre].concat(s.points || [], s.chiffres || [], s.pieges || []).join(' · '); if (hay.toLowerCase().includes(t)) { const i = hay.toLowerCase().indexOf(t); hits.push({ link: `#/lire/${m.id}/${s.id}`, ic: '📖', titre: `M${m.num} · ${s.titre}`, ctx: hay.slice(Math.max(0, i - 40), i + 80) }); } });
    (QBYMOD[m.id] || []).forEach(q => { if (q.enonce.toLowerCase().includes(t)) hits.push({ link: `#/drill/${m.id}`, ic: '🎯', titre: `M${m.num} · Question`, ctx: q.enonce }); });
  });
  box.innerHTML = hits.length ? hits.slice(0, 40).map(h => `<div class="hit"><a onclick="go('${h.link}')">${h.ic} ${esc(h.titre)}</a><div class="ctx">${esc(h.ctx).replace(rx, '<mark>$1</mark>')}</div></div>`).join('') : `<div class="note">Aucun résultat pour « ${esc(term)} ».</div>`;
}

/* ============================================================ ONBOARDING */
function showOnboard() {
  const slides = [
    ['📖', 'Lis le cours dans l’app', 'Chaque module a une couche « Essentiel » pour réviser vite et un « Cours complet » fidèle à tes fiches.'],
    ['🎯', 'Entraîne ta compréhension', 'L’examen blanc pioche dans la banque de questions : on s’entraîne à comprendre les concepts, pas à réciter.'],
    ['✅', 'Open-book : la méthode prime', 'L’examen RNCP autorise tes ressources et l’IA (avec déclaration). Tu révises pour COMPRENDRE et garder tes fiches/méthodes prêtes — pas pour réciter.']
  ];
  let i = 0;
  const ov = document.createElement('div'); ov.className = 'onboard'; document.body.appendChild(ov);
  function draw() {
    const s = slides[i];
    ov.innerHTML = `<div class="slide"><div class="em">${s[0]}</div><h2 class="serif">${s[1]}</h2><p>${s[2]}</p></div>
      <div class="dots">${slides.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      <button class="btn or" id="ob-next">${i < slides.length - 1 ? 'Suivant' : 'Commencer'}</button>
      ${i === 0 ? '<button class="btn ghost" id="ob-skip" style="margin-top:8px;color:#cdd6e6;border-color:rgba(245,241,232,.25)">Passer</button>' : ''}`;
    $('#ob-next').onclick = () => { if (i < slides.length - 1) { i++; draw(); } else done(); };
    const sk = $('#ob-skip'); if (sk) sk.onclick = done;
  }
  function done() { S.onboarded = true; save(); ov.remove(); go('#/cours'); }
  draw();
}

/* ============================================================ Confetti */
function confetti() {
  const cv = $('#confetti'); if (!cv) return; cv.style.display = 'block';
  const ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#B0862B', '#2F6B43', '#14213D', '#F5F1E8', '#d2a64a'];
  const P = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 9, vy: Math.random() * -9 - 3, g: .28, s: 5 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6.28, va: (Math.random() - .5) * .3 }));
  let t = 0;
  (function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height); t++;
    P.forEach(p => { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); });
    if (t < 110) requestAnimationFrame(loop); else { cv.style.display = 'none'; ctx.clearRect(0, 0, cv.width, cv.height); }
  })();
}

/* ============================================================ Clavier & swipe */
function onKey(e) {
  if (!sess) return;
  const SESSION_SCREENS = ['drill', 'erreurs', 'echauffement', 'esg', 'favoris', 'examen-run'];
  if (!SESSION_SCREENS.includes(parseHash()[0])) return;
  const q = QBYID[sess.queue[sess.i]]; if (!q) return;
  const answered = sess.answered[q.id] != null;
  if (!answered && ['1', '2', '3', 'a', 'b', 'c'].includes(e.key.toLowerCase())) {
    const idx = { '1': 0, '2': 1, '3': 2, 'a': 0, 'b': 1, 'c': 2 }[e.key.toLowerCase()];
    const btn = document.querySelector('.opt[data-idx="' + idx + '"]'); if (btn) btn.click();
  } else if (answered && (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ')) { e.preventDefault(); nextQ(); }
  else if (e.key === 'Escape') quitSession();
}
let _tx = 0, _ty = 0;
function attachSwipe() {
  const v = $('#view'); if (!v) return;
  v.ontouchstart = e => { _tx = e.changedTouches[0].clientX; _ty = e.changedTouches[0].clientY; };
  v.ontouchend = e => {
    const dx = e.changedTouches[0].clientX - _tx, dy = e.changedTouches[0].clientY - _ty;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && sess) {
      const q = QBYID[sess.queue[sess.i]];
      if (q && sess.answered[q.id] != null && dx < 0) nextQ();
    }
  };
}

boot();
