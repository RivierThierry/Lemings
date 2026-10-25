// Les Bestioles : écrans, commandes, caméra, boucle de jeu, sauvegardes et classement.
import { Game, TPS, SKILLS, LEM_H } from './engine.js';
import { LEVELS, TIERS } from './levels.js';
import { TerrainView, Backdrop, Particles, drawWorld, THEMES } from './render.js';
import { skillIcon, LEM_COLORS } from './sprites.js';
import * as audio from './audio.js';
import { ScriptRunner } from './script.js';

const SKILL_INFO = {
  climber: { name: 'Grimpeuse', desc: 'Escalade les murs. Elle le reste pour toujours.' },
  floater: { name: 'Parachute', desc: 'Ouvre un parapluie et survit à toutes les chutes. Pour toujours.' },
  bomber: { name: 'Bombe', desc: 'Explose au bout de 5 secondes et creuse un trou. Adieu…' },
  blocker: { name: 'Bloqueuse', desc: 'Reste plantée et fait faire demi-tour aux autres.' },
  builder: { name: 'Bâtisseuse', desc: 'Pose un escalier de 12 briques vers l\'avant.' },
  basher: { name: 'Cogneuse', desc: 'Creuse un tunnel droit devant elle.' },
  miner: { name: 'Mineuse', desc: 'Creuse en diagonale vers le bas.' },
  digger: { name: 'Creuseuse', desc: 'Creuse tout droit vers le bas.' },
};
const STATE_NAMES = {
  walking: 'Marcheuse', falling: 'En chute', floating: 'Parachute', climbing: 'Grimpeuse', hoisting: 'Grimpeuse',
  building: 'Bâtisseuse', shrugging: 'Bâtisseuse', bashing: 'Cogneuse', mining: 'Mineuse', digging: 'Creuseuse',
  blocking: 'Bloqueuse', ohno: 'Oh non !', exiting: 'Youpi !', splatting: 'Splatch', drowning: 'Glouglou', burning: 'Aïe', crushed: 'Croc',
};

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
const mini = $('minimap');
const mctx = mini.getContext('2d');
const screens = $('screens');

const S = {
  mode: 'boot',          // title | select | brief | play | result
  save: { v: 1, best: {}, fails: {}, opts: { music: true, sfx: true, full: true }, sent: 0 },
  game: null, view: null, back: null, parts: new Particles(), level: null,
  cam: { x: 0, y: 0, zoom: 2, w: 100, h: 100 },
  skill: null, paused: false, fast: false, demo: null, demoKind: null,
  hover: null, pointer: null, acc: 0, endTimer: 0, tier: 0, account: null,
  W: 0, H: 0, dpr: 1, keys: new Set(), lastUi: '',
};

// ---------- utilitaires DOM ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
function show(node, dim = true, id) {
  $('toast').classList.add('hidden');
  const wrap = h('div', { class: 'screen' + (dim ? ' dim' : ''), id }, node);
  screens.replaceChildren(wrap);
  return wrap;
}
function closeScreens() { screens.replaceChildren(); }
let toastTimer = 0;
function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
const fmtTime = (ticks) => {
  const s = Math.max(0, Math.ceil(ticks / TPS));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
const tierOf = (def) => TIERS.find((t) => t.id === def.tier);

// ---------- sauvegarde ----------
async function loadSave() {
  try {
    const s = await window.Arcade.charger();
    if (s && s.donnees && typeof s.donnees === 'object') {
      const d = s.donnees;
      S.save = { ...S.save, ...d, opts: { ...S.save.opts, ...(d.opts || {}) }, best: d.best || {}, fails: d.fails || {} };
    }
  } catch (e) { /* hors ligne : on part de zéro */ }
  audio.setPrefs(S.save.opts);
}
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { window.Arcade.sauvegarder(S.save).catch(() => {}); }, 300);
}
const totalScore = () => Object.values(S.save.best).reduce((a, b) => a + (b.score || 0), 0);
const starsTotal = () => Object.values(S.save.best).reduce((a, b) => a + (b.stars || 0), 0);
const doneCount = (tier) => tier.levels.filter((l) => S.save.best[l.id]).length;
function tierUnlocked(ti) {
  if (ti === 0) return true;
  const prev = TIERS[ti - 1];
  return doneCount(prev) >= Math.ceil(prev.levels.length * 2 / 3);
}
function levelUnlocked(def) {
  const ti = TIERS.findIndex((t) => t.id === def.tier);
  if (!tierUnlocked(ti)) return false;
  const i = TIERS[ti].levels.indexOf(def);
  return i === 0 || !!S.save.best[TIERS[ti].levels[i - 1].id] || !!S.save.best[def.id];
}

// ---------- taille et caméra ----------
function resize() {
  const r = canvas.getBoundingClientRect();
  S.dpr = Math.min(2, window.devicePixelRatio || 1);
  S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
  canvas.width = Math.round(S.W * S.dpr);
  canvas.height = Math.round(S.H * S.dpr);
  const mr = mini.getBoundingClientRect();
  mini.width = Math.round(mr.width * S.dpr);
  mini.height = Math.round(mr.height * S.dpr);
  if (S.back) S.back.resize(S.W, S.H);
  if (S.game) { const z = S.cam.zoom; S.cam.zoom = clampZoom(z); updateCamSize(); clampCam(); }
}
function fitZoom() { return S.H / S.level.h; }
function clampZoom(z) {
  const def = S.level;
  const min = Math.min(S.W / def.w, S.H / def.h, 1);
  return Math.max(min, Math.min(5, z));
}
function updateCamSize() { S.cam.w = S.W / S.cam.zoom; S.cam.h = S.H / S.cam.zoom; }
function clampCam() {
  const def = S.level, c = S.cam;
  if (c.w >= def.w) c.x = (def.w - c.w) / 2; else c.x = Math.max(0, Math.min(def.w - c.w, c.x));
  if (c.h >= def.h) c.y = (def.h - c.h) / 2; else c.y = Math.max(0, Math.min(def.h - c.h, c.y));
}
function zoomAt(sx, sy, z) {
  const c = S.cam;
  const wx = c.x + sx / c.zoom, wy = c.y + sy / c.zoom;
  c.zoom = clampZoom(z);
  updateCamSize();
  c.x = wx - sx / c.zoom; c.y = wy - sy / c.zoom;
  clampCam();
}
function centerOn(x, y) { S.cam.x = x - S.cam.w / 2; S.cam.y = y - S.cam.h / 2; clampCam(); }
const toWorld = (sx, sy) => ({ x: S.cam.x + sx / S.cam.zoom, y: S.cam.y + sy / S.cam.zoom });

// ---------- démarrer un niveau ----------
function startLevel(def, demo) {
  S.level = def;
  S.game = new Game(def);
  S.view = new TerrainView(def, S.game.terrain);
  S.back = new Backdrop(def.theme);
  S.parts = new Particles();
  S.paused = false; S.fast = false; S.acc = 0; S.endTimer = 0; S.hover = null;
  S.demoKind = demo || null;
  S.demo = demo ? new ScriptRunner(S.game, def.solution) : null;
  const playing = !demo;
  $('hud').classList.toggle('hidden', demo === 'attract');
  $('panel').classList.toggle('hidden', demo === 'attract');
  $('demo-tag').classList.toggle('hidden', demo !== 'watch');
  resize();
  S.cam.zoom = clampZoom(Math.min(fitZoom(), demo === 'attract' ? 3.2 : 4));
  if (S.W / S.H < 1 && playing) S.cam.zoom = clampZoom(Math.min(fitZoom(), S.W / 300));
  updateCamSize();
  const e = def.entrances[0];
  centerOn(e.x, e.y + 40);
  S.skill = null;
  buildPanel();
  const first = SKILLS.find((s) => S.game.skills[s] > 0);
  if (first) selectSkill(first, true);
  updateHud(true);
  const idx = LEVELS.indexOf(def);
  if (demo !== 'attract') audio.playMusic(idx);
}

// ---------- panneau ----------
const skillButtons = {};
function buildPanel() {
  const box = $('skills');
  if (!box.childElementCount) {
    SKILLS.forEach((s, i) => {
      const b = h('button', { class: 'skill', title: `${SKILL_INFO[s].name} (${i + 1}) — ${SKILL_INFO[s].desc}`, onpointerdown: (e) => { e.preventDefault(); audio.unlock(); selectSkill(s); } },
        h('span', { class: 'k', text: String(i + 1) }), skillIcon(s, 44), h('span', { class: 'lbl', text: SKILL_INFO[s].name }), h('span', { class: 'n' }));
      skillButtons[s] = b;
      box.append(b);
    });
  }
  updatePanel();
}
function updatePanel() {
  if (!S.game) return;
  for (const s of SKILLS) {
    const b = skillButtons[s], n = S.game.skills[s];
    b.querySelector('.n').textContent = n;
    b.classList.toggle('empty', n <= 0);
    b.classList.toggle('sel', S.skill === s);
  }
  $('rr-val').textContent = S.game.rr;
  $('btn-pause').classList.toggle('on', S.paused);
  $('btn-fast').classList.toggle('on', S.fast);
  $('paused-tag').classList.toggle('hidden', !S.paused || S.mode !== 'play');
}
function selectSkill(s, quiet) {
  if (!S.game) return;
  if (S.game.skills[s] <= 0 && !quiet) { flashSkill(s); toast(`Plus de ${SKILL_INFO[s].name.toLowerCase()} !`); return; }
  S.skill = s;
  if (!quiet) audio.sfx('select');
  updatePanel();
}
function flashSkill(s) {
  const b = skillButtons[s];
  if (!b) return;
  b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
}

function setPaused(p) {
  S.paused = p;
  updatePanel();
}

let nukeArmed = 0;
function pressNuke() {
  if (!S.game || S.game.done || S.demo) return;
  const b = $('btn-nuke');
  if (performance.now() - nukeArmed < 1600) {
    S.game.nuke();
    b.classList.remove('armed');
    nukeArmed = 0;
  } else {
    nukeArmed = performance.now();
    b.classList.add('armed');
    toast('Encore une fois pour tout faire exploser !', 1500);
    setTimeout(() => b.classList.remove('armed'), 1600);
  }
}

function changeRate(d) {
  if (!S.game || S.demo) return;
  S.game.setRate(S.game.rr + d);
  $('rr-val').textContent = S.game.rr;
  audio.sfx('tick');
}
function holdRepeat(btn, fn) {
  let t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); audio.unlock();
    fn();
    t1 = setTimeout(() => { t2 = setInterval(fn, 60); }, 320);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
}
holdRepeat($('rr-down'), () => changeRate(-1));
holdRepeat($('rr-up'), () => changeRate(1));
$('btn-pause').addEventListener('click', () => { if (S.mode === 'play') setPaused(!S.paused); });
$('btn-fast').addEventListener('click', () => { S.fast = !S.fast; updatePanel(); });
$('btn-nuke').addEventListener('click', pressNuke);
$('btn-menu').addEventListener('click', () => openPauseMenu());
$('btn-full').addEventListener('click', () => { audio.sfx('click'); toggleFullscreen(); });
if (!canFullscreen()) $('btn-full').classList.add('hidden');
const ICON_FULL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_EXIT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
const syncFullBtn = () => { $('btn-full').innerHTML = fsElement() ? ICON_EXIT : ICON_FULL; resize(); };
syncFullBtn();
document.addEventListener('fullscreenchange', syncFullBtn);
document.addEventListener('webkitfullscreenchange', syncFullBtn);

// ---------- HUD ----------
function updateHud(force) {
  const g = S.game;
  if (!g) return;
  const key = [g.out, g.saved, Math.ceil(g.timeLeft / TPS), g.total, g.need].join();
  if (!force && key === S.lastUi) return;
  S.lastUi = key;
  $('s-out').textContent = g.out;
  $('s-total').textContent = g.total;
  $('s-saved').textContent = g.saved;
  $('s-need').textContent = g.need;
  $('s-saved').classList.toggle('ok', g.saved >= g.need);
  $('s-time').textContent = fmtTime(g.timeLeft);
  $('s-time-wrap').classList.toggle('low', g.timeLeft < 30 * TPS);
}
function updateHoverInfo() {
  const el = $('hover-info');
  if (!S.game || !S.pointer || S.pointer.type !== 'mouse') { el.textContent = ''; return; }
  const w = toWorld(S.pointer.x, S.pointer.y);
  const under = S.game.lems.filter((l) => l.state !== 'dead' && l.state !== 'saved' && Math.abs(l.x - w.x) <= 8 && w.y >= l.y - LEM_H - 4 && w.y <= l.y + 4);
  if (!S.hover) { el.textContent = ''; return; }
  const l = S.hover;
  let txt = STATE_NAMES[l.state] || '';
  const extra = [l.climber && 'grimpeuse', l.floater && 'parachute'].filter(Boolean);
  if (extra.length && l.state !== 'climbing') txt += ' · ' + extra.join(' · ');
  if (under.length > 1) txt += `  ×${under.length}`;
  el.textContent = txt;
}

// ---------- événements du moteur ----------
// Volume et stéréo d'un bruitage selon la position de la bestiole par rapport à l'écran
function spot(x) {
  if (x === undefined || !S.game) return undefined;
  const c = S.cam, half = c.w / 2;
  const d = (x - (c.x + half)) / half; // -1 bord gauche, 1 bord droit
  const off = Math.max(0, Math.abs(d) - 1); // hors de l'écran
  return { pan: Math.max(-1, Math.min(1, d)) * 0.6, vol: Math.max(0.18, 1 - off * 0.8) };
}
function handleEvents() {
  const g = S.game, P = S.parts, th = THEMES[S.level.theme] || THEMES.prairie;
  const quiet = S.demoKind === 'attract';
  for (const e of g.events) {
    switch (e.type) {
      case 'sound': if (!quiet) audio.sfx(e.name, spot(e.x)); break;
      case 'assign': if (!quiet && e.skill === 'blocker') audio.sfx('halt'); break;
      case 'brick': S.view.drawBrick(e); break;
      case 'dig':
        P.burst(e.x, e.y, 3, { color: th.dirt, speed: 50, g: 260, life: 0.5, size: 1.6, angle: e.dir ? (e.dir > 0 ? -2.4 : -0.7) : -Math.PI / 2, spread: 1.6 });
        if (!quiet) audio.sfx({ digger: 'shovel', basher: 'punch', miner: 'pick' }[e.kind] || 'dig', spot(e.x));
        break;
      case 'explode':
        P.burst(e.x, e.y, 26, { color: [LEM_COLORS.body, LEM_COLORS.hair, '#ffd23f', '#ff5d8f', '#fff'], type: 'confetti', speed: 120, g: 180, life: 1.3, size: 2.2 });
        P.burst(e.x, e.y, 18, { color: th.dirt, speed: 110, g: 300, life: 0.9, size: 2.4 });
        P.burst(e.x, e.y, 8, { color: 'rgba(200,200,210,0.8)', type: 'smoke', speed: 25, g: -20, life: 1.2, size: 5 });
        P.add({ x: e.x, y: e.y, vx: 0, vy: 0, g: 0, life: 0, max: 0.45, size: 26, color: '#fff3a0', type: 'ring', rot: 0, vr: 0 });
        P.burst(e.x, e.y, 10, { color: ['#fff3a0', '#ffb12e'], type: 'spark', speed: 90, g: 60, life: 0.5, size: 1.6 });
        shake = 0.25;
        break;
      case 'splatting': case 'crushed':
        P.burst(e.x, e.y - 2, 10, { color: [LEM_COLORS.body, LEM_COLORS.belly], speed: 60, g: 280, life: 0.6, size: 1.6, angle: -Math.PI / 2, spread: 2.6 });
        break;
      case 'drowning':
        P.burst(e.x, e.y - 4, 10, { color: 'rgba(255,255,255,0.9)', type: 'spark', speed: 25, g: -60, life: 1, size: 1.2 });
        break;
      case 'burning':
        P.burst(e.x, e.y - 6, 12, { color: ['#ffb12e', '#ff6a00', '#fff3a0'], type: 'spark', speed: 40, g: -80, life: 0.8, size: 1.5 });
        P.burst(e.x, e.y - 8, 5, { color: 'rgba(60,60,70,0.7)', type: 'smoke', speed: 15, g: -30, life: 1.2, size: 3 });
        break;
      case 'saved':
        P.burst(e.x, e.y - 14, 10, { color: ['#fff3a0', '#ffffff', LEM_COLORS.hair], type: 'spark', speed: 50, g: 40, life: 0.7, size: 1.3 });
        P.add({ x: e.x, y: e.y - 30, vx: 0, vy: -18, g: 0, life: 0, max: 1, size: 10, color: '#7dff8a', type: 'text', text: '+1', rot: 0, vr: 0 });
        break;
      case 'spawn':
        if (!quiet) audio.sfx('pop', spot(e.x));
        P.burst(e.x, e.y - 2, 5, { color: 'rgba(255,255,255,0.7)', type: 'smoke', speed: 18, g: 0, life: 0.5, size: 2 });
        break;
      case 'end': S.endTimer = 1.6; break;
    }
  }
  g.events.length = 0;
}

// ---------- entrées ----------
const pointers = new Map();
let drag = null, pinch = null, shake = 0;

function slackFor(type) { return Math.max(2, (type === 'touch' ? 20 : 7) / S.cam.zoom); }

function tryAssign(sx, sy, type) {
  if (!S.game || S.mode !== 'play' || S.demo || !S.skill || S.game.done) return false;
  const w = toWorld(sx, sy);
  const l = S.game.lemAt(w.x, w.y, S.skill, slackFor(type));
  if (!l) return false;
  if (S.game.assign(l, S.skill)) {
    audio.sfx('assign');
    handleEvents();
    updatePanel();
    if (S.game.skills[S.skill] <= 0) {
      const next = SKILLS.find((s) => S.game.skills[s] > 0 && s === S.skill);
      if (!next) updatePanel();
    }
  } else {
    if (S.game.skills[S.skill] <= 0) toast(`Plus de ${SKILL_INFO[S.skill].name.toLowerCase()} !`);
    flashSkill(S.skill);
    audio.sfx('click');
  }
  return true;
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  pointers.set(e.pointerId, { x: sx, y: sy });
  S.pointer = { x: sx, y: sy, type: e.pointerType };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
  if (pointers.size === 2 && S.game) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.cam.zoom };
    drag = null;
    return;
  }
  if (S.mode !== 'play' || !S.game) return;
  if (e.button === 0 && tryAssign(sx, sy, e.pointerType)) { drag = null; return; }
  drag = { x: sx, y: sy, cx: S.cam.x, cy: S.cam.y, moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  S.pointer = { x: sx, y: sy, type: e.pointerType };
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: sx, y: sy });
  if (!S.game || (S.mode !== 'play' && S.mode !== 'result')) return;
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * (d / pinch.d));
    return;
  }
  if (drag) {
    const dx = sx - drag.x, dy = sy - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; canvas.classList.add('panning'); }
    if (drag.moved) {
      S.cam.x = drag.cx - dx / S.cam.zoom;
      S.cam.y = drag.cy - dy / S.cam.zoom;
      clampCam();
    }
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) { drag = null; canvas.classList.remove('panning'); }
  if (e.pointerType !== 'mouse') S.pointer = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') S.pointer = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!S.game || S.mode !== 'play') return;
  const r = canvas.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, S.cam.zoom * Math.exp(-e.deltaY * 0.01));
  else {
    S.cam.x += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / S.cam.zoom;
    clampCam();
  }
}, { passive: false });

// mini-carte
let miniDrag = false;
function miniMove(e) {
  if (!S.game) return;
  const r = mini.getBoundingClientRect();
  const m = miniLayout(r.width, r.height);
  const wx = (e.clientX - r.left - m.ox) / m.s, wy = (e.clientY - r.top - m.oy) / m.s;
  centerOn(wx, wy);
}
mini.addEventListener('pointerdown', (e) => { miniDrag = true; mini.setPointerCapture(e.pointerId); miniMove(e); });
mini.addEventListener('pointermove', (e) => { if (miniDrag) miniMove(e); });
mini.addEventListener('pointerup', () => { miniDrag = false; });
function miniLayout(w, hh) {
  const def = S.level;
  const s = Math.min(w / def.w, hh / def.h);
  return { s, ox: (w - def.w * s) / 2, oy: (hh - def.h * s) / 2 };
}

const KEYMAP = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad7: 6, Numpad8: 7 };
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.target instanceof HTMLInputElement) return;
  if (S.mode === 'play') {
    if (e.code in KEYMAP) { selectSkill(SKILLS[KEYMAP[e.code]]); return; }
    switch (e.code) {
      case 'KeyP': case 'Space': e.preventDefault(); setPaused(!S.paused); return;
      case 'KeyF': S.fast = !S.fast; updatePanel(); return;
      case 'KeyN': pressNuke(); return;
      case 'Equal': case 'NumpadAdd': changeRate(e.shiftKey ? 10 : 1); return;
      case 'Minus': case 'NumpadSubtract': changeRate(e.shiftKey ? -10 : -1); return;
      case 'Escape': openPauseMenu(); return;
    }
    S.keys.add(e.code);
  } else if (e.code === 'Escape') {
    if (S.mode === 'pause') resumeFromMenu();
    else if (S.mode === 'select' || S.mode === 'help' || S.mode === 'board' || S.mode === 'options') titleScreen();
  }
});
window.addEventListener('keyup', (e) => S.keys.delete(e.code));
window.addEventListener('resize', () => resize());
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas);
window.addEventListener('blur', () => { S.keys.clear(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.mode === 'play' && !S.demo) setPaused(true);
});
const MENU_MODES = new Set(['title', 'select', 'help', 'board', 'options']);
function menuMusic() {
  if (MENU_MODES.has(S.mode) && audio.playingTune() !== 2) audio.playMusic(2);
}
document.addEventListener('pointerdown', () => { audio.unlock(); menuMusic(); }, { passive: true });
document.addEventListener('keydown', () => menuMusic());

// ---------- boucle ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const g = S.game;
  if (g) {
    const running = !S.paused && S.mode !== 'pause' && S.mode !== 'brief';
    if (running && !g.done) {
      S.acc += dt * TPS * (S.fast ? 3 : 1);
      let n = 0;
      while (S.acc >= 1 && n < 12 && !g.done) {
        if (S.demo) {
          const hits = S.demo.step();
          if (hits.length && S.demoKind === 'watch') for (const hh of hits) S.parts.add({ x: hh.lem.x, y: hh.lem.y - 26, vx: 0, vy: -10, g: 0, life: 0, max: 1.4, size: 8, color: '#ffd23f', type: 'text', text: SKILL_INFO[hh.skill].name, rot: 0, vr: 0 });
          if (hits.length && S.demoKind === 'watch') audio.sfx('assign');
        }
        g.tick();
        handleEvents();
        S.acc -= 1; n++;
      }
      if (n >= 12) S.acc = 0;
    }
    S.view.sync(g.terrain.changes);
    S.parts.update(dt * (S.paused ? 0 : S.fast ? 2 : 1));
    // caméra
    const pan = 520 * dt / S.cam.zoom;
    if (S.keys.has('ArrowLeft') || S.keys.has('KeyA') || S.keys.has('KeyQ')) S.cam.x -= pan;
    if (S.keys.has('ArrowRight') || S.keys.has('KeyD')) S.cam.x += pan;
    if (S.keys.has('ArrowUp') || S.keys.has('KeyW') || S.keys.has('KeyZ')) S.cam.y -= pan;
    if (S.keys.has('ArrowDown') || S.keys.has('KeyS')) S.cam.y += pan;
    if (S.demo && !drag) followDemo(dt);
    clampCam();
    // survol
    S.hover = null;
    if (S.pointer && S.pointer.type === 'mouse' && S.mode === 'play' && !S.demo) {
      const w = toWorld(S.pointer.x, S.pointer.y);
      S.hover = g.lemAt(w.x, w.y, S.skill, slackFor('mouse'));
    }
    draw(now);
    if (S.mode === 'play' || S.mode === 'result') {
      updateHud();
      updateHoverInfo();
      drawMinimap();
    }
    if (g.done && S.endTimer > 0) {
      S.endTimer -= dt;
      if (S.endTimer <= 0) levelOver();
    }
  }
  requestAnimationFrame(frame);
}

function followDemo(dt) {
  const g = S.game;
  let target = S.demo.focus();
  if (!target) {
    const alive = g.lems.filter((l) => l.state !== 'dead' && l.state !== 'saved');
    if (alive.length) target = alive.reduce((a, b) => (b.x > a.x ? b : a));
  }
  if (!target) return;
  const k = 1 - Math.exp(-dt * 1.6);
  S.cam.x += (target.x - S.cam.w / 2 - S.cam.x) * k;
  S.cam.y += (target.y - 30 - S.cam.h / 2 - S.cam.y) * k;
}

function draw(now) {
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  S.back.resize(S.W, S.H);
  if (shake > 0) {
    shake -= 1 / 60;
    ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);
  }
  S.back.draw(ctx, S.cam.x, S.cam.zoom, now);
  let cursor = null;
  if (S.pointer && S.pointer.type === 'mouse' && S.mode === 'play' && !S.demo) {
    const w = toWorld(S.pointer.x, S.pointer.y);
    cursor = { x: w.x, y: w.y, ok: S.hover && S.skill ? S.game.canAssign(S.hover, S.skill) : false };
  }
  drawWorld(ctx, S.game, S.view, S.cam, now, { hover: S.hover, cursor, particles: S.parts });
}

let miniFrame = 0;
function drawMinimap() {
  if (++miniFrame % 3) return;
  const w = mini.width, hh = mini.height;
  if (!w || !hh) return;
  const g = S.game, def = S.level;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, w, hh);
  const m = miniLayout(w, hh);
  const th = THEMES[def.theme] || THEMES.prairie;
  const grd = mctx.createLinearGradient(0, m.oy, 0, m.oy + def.h * m.s);
  grd.addColorStop(0, th.sky[0]); grd.addColorStop(1, th.sky[2]);
  mctx.globalAlpha = 0.35;
  mctx.fillStyle = grd;
  mctx.fillRect(m.ox, m.oy, def.w * m.s, def.h * m.s);
  mctx.globalAlpha = 1;
  mctx.drawImage(S.view.canvas, m.ox, m.oy, def.w * m.s, def.h * m.s);
  for (const hz of g.hazards) { mctx.fillStyle = hz.t === 'lava' ? '#ff6a00' : '#4ec3ff'; mctx.fillRect(m.ox + hz.x * m.s, m.oy + hz.y * m.s, hz.w * m.s, Math.max(2, hz.h * m.s)); }
  for (const e of g.exits) { mctx.fillStyle = '#ffd23f'; mctx.fillRect(m.ox + e.x * m.s - 3, m.oy + e.y * m.s - 6, 6, 6); }
  for (const e of g.entrances) { mctx.fillStyle = '#c08a52'; mctx.fillRect(m.ox + e.x * m.s - 3, m.oy + e.y * m.s - 6, 6, 4); }
  mctx.fillStyle = '#7dff8a';
  for (const l of g.lems) if (l.state !== 'dead' && l.state !== 'saved') mctx.fillRect(m.ox + l.x * m.s - 1, m.oy + l.y * m.s - 3, 2, 3);
  mctx.strokeStyle = '#fff';
  mctx.lineWidth = 1.5;
  mctx.strokeRect(m.ox + S.cam.x * m.s, m.oy + S.cam.y * m.s, S.cam.w * m.s, S.cam.h * m.s);
}

// ---------- fin de niveau ----------
function computeResult() {
  const g = S.game;
  const win = g.saved >= g.need;
  const timeBonus = win ? Math.floor(g.timeLeft / TPS) * 2 : 0;
  const score = win ? g.saved * 100 + Math.max(0, g.saved - g.need) * 50 + timeBonus : 0;
  const stars = !win ? 0 : (g.saved >= g.total ? 3 : g.saved >= g.need + (g.total - g.need) / 2 ? 2 : 1);
  return { win, score, stars, saved: g.saved, need: g.need, total: g.total, timeBonus };
}

function levelOver() {
  if (S.demoKind === 'attract') { if (S.mode === 'title') startAttract(); return; }
  if (S.demoKind === 'watch') { briefScreen(S.level); return; }
  const def = S.level;
  const r = computeResult();
  const prev = S.save.best[def.id];
  const totalBefore = totalScore();
  if (r.win) {
    S.save.best[def.id] = {
      saved: Math.max(prev?.saved || 0, r.saved),
      score: Math.max(prev?.score || 0, r.score),
      stars: Math.max(prev?.stars || 0, r.stars),
    };
    delete S.save.fails[def.id];
  } else {
    S.save.fails[def.id] = (S.save.fails[def.id] || 0) + 1;
  }
  r.record = r.win && (!prev || r.score > prev.score);
  r.grand = totalScore();
  r.gain = r.grand - totalBefore;
  persist();
  audio.stopMusic();
  audio.sfx(r.win ? 'win' : 'lose');
  resultScreen(def, r);
}

// ---------- écrans ----------
function startAttract() {
  const pool = LEVELS.filter((l) => l.solution && l.solution.length && (l.tier === 't1' || l.tier === 't2'));
  if (!pool.length) return;
  const def = pool[Math.floor(Math.random() * pool.length)];
  startLevel(def, 'attract');
  S.fast = false;
}

function titleScreen() {
  S.mode = 'title';
  $('hud').classList.add('hidden');
  $('panel').classList.add('hidden');
  $('demo-tag').classList.add('hidden');
  $('paused-tag').classList.add('hidden');
  if (!S.game || S.demoKind !== 'attract') startAttract();
  S.paused = false;
  menuMusic();
  const acc = h('div', { class: 'account' });
  const logo = h('h1', { class: 'logo' }, ...'Les'.split('').map((c, i) => h('span', { style: `animation-delay:${i * 0.12}s` }, c)), ' ',
    ...'Bestioles'.split('').map((c, i) => h('span', { class: i % 2 ? '' : 'accent', style: `animation-delay:${0.4 + i * 0.12}s` }, c)));
  const total = totalScore();
  show(h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:6px' },
    logo,
    h('p', { class: 'tagline' }, 'Guide-les jusqu\'à la maison… sans trop de casse !'),
    h('div', { class: 'menu' },
      h('button', { class: 'btn go', onclick: () => { audio.unlock(); audio.sfx('click'); selectScreen(); } }, '▶  Jouer'),
      h('button', { class: 'btn', onclick: () => { audio.sfx('click'); boardScreen(); } }, '🏆  Classement'),
      h('button', { class: 'btn', onclick: () => { audio.sfx('click'); helpScreen(); } }, '❓  Comment jouer'),
      h('button', { class: 'btn ghost', onclick: () => { audio.sfx('click'); optionsScreen(); } }, '⚙️  Options')),
    total ? h('div', { class: 'account' }, `Ton score : ${total.toLocaleString('fr-FR')} points · ${starsTotal()} ★`) : null,
    acc), false, 'title-screen');
  fillAccount(acc);
}

async function fillAccount(el) {
  if (!window.Arcade.enLigne) return;
  try {
    const j = await window.Arcade.joueur();
    S.account = j;
    if (j) el.textContent = `Connecté : ${j.pseudo} — ta progression est sauvegardée en ligne`;
    else el.replaceChildren('Ta progression reste sur cet appareil. ', h('button', { onclick: () => window.Arcade.connexion() }, 'Se connecter pour la sauvegarder en ligne'));
  } catch (e) { /* site injoignable */ }
}

function selectScreen(ti) {
  S.mode = 'select';
  guardHistory();
  $('hud').classList.add('hidden');
  $('panel').classList.add('hidden');
  $('demo-tag').classList.add('hidden');
  $('paused-tag').classList.add('hidden');
  menuMusic();
  if (ti === undefined) {
    // dernier palier débloqué avec des niveaux à faire
    ti = 0;
    TIERS.forEach((t, i) => { if (tierUnlocked(i) && t.levels.length && (i === 0 || doneCount(TIERS[i - 1]) < TIERS[i - 1].levels.length || doneCount(t) > 0)) ti = i; });
  }
  S.tier = ti;
  const tier = TIERS[ti];
  const tabs = h('div', { class: 'tabs' }, TIERS.map((t, i) => {
    const un = tierUnlocked(i);
    return h('button', { class: 'tab' + (i === ti ? ' sel' : '') + (un ? '' : ' locked'), style: `--c:${t.color}`,
      onclick: () => { audio.sfx('click'); if (un) selectScreen(i); else toast(`Termine ${Math.ceil(TIERS[i - 1].levels.length * 2 / 3)} niveaux « ${TIERS[i - 1].name} » pour débloquer !`); } },
      h('b', {}, (un ? '' : '🔒 ') + t.name), h('small', {}, `${doneCount(t)}/${t.levels.length} réussis`));
  }));
  const grid = h('div', { class: 'grid' }, tier.levels.map((def, i) => {
    const un = levelUnlocked(def), best = S.save.best[def.id];
    const stars = best?.stars || 0;
    return h('button', { class: 'lvl' + (un ? '' : ' locked') + (best ? ' done' : ''), style: `--c:${tier.color}`,
      onclick: () => { if (!un) { audio.sfx('click'); toast('Réussis le niveau précédent pour débloquer celui-ci.'); return; } audio.sfx('select'); briefScreen(def); } },
      h('span', { class: 'num' }, `Niveau ${i + 1}`), h('span', { class: 'name' }, def.name),
      h('span', { class: 'stars' }, [0, 1, 2].map((k) => h('span', { class: k < stars ? 'on' : '' }, '★'))));
  }));
  show(h('div', { class: 'card select' },
    h('div', { class: 'total' },
      h('h2', {}, 'Choisis un niveau'),
      h('div', { class: 'score' }, 'Score : ', h('b', {}, totalScore().toLocaleString('fr-FR')), ` · ${starsTotal()} ★`)),
    tabs,
    h('p', { class: 'sub' }, tier.desc),
    grid,
    h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => { audio.sfx('click'); titleScreen(); } }, '← Retour'))));
}

function briefScreen(def) {
  S.mode = 'brief';
  audio.stopMusic();
  if (!S.game || S.level !== def || S.demoKind) { startLevel(def, 'attract'); S.paused = true; }
  S.paused = true;
  $('hud').classList.add('hidden');
  $('panel').classList.add('hidden');
  $('demo-tag').classList.add('hidden');
  const tier = tierOf(def);
  const skills = SKILLS.filter((s) => def.skills?.[s]);
  const fails = S.save.fails[def.id] || 0;
  const best = S.save.best[def.id];
  const pct = Math.round((def.save / def.lemmings) * 100);
  const portrait = window.innerWidth < window.innerHeight && window.innerWidth < 700;
  show(h('div', { class: 'card brief' },
    h('span', { class: 'badge', style: `--c:${tier.color}` }, `${tier.name} · niveau ${def.num}`),
    h('h2', {}, def.name),
    h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('small', {}, 'Bestioles'), h('b', {}, def.lemmings)),
      h('div', { class: 'fact' }, h('small', {}, 'À sauver'), h('b', {}, `${def.save} (${pct} %)`)),
      h('div', { class: 'fact' }, h('small', {}, 'Temps'), h('b', {}, fmtTime(def.time * TPS))),
      h('div', { class: 'fact' }, h('small', {}, 'Débit'), h('b', {}, def.release ?? 50))),
    h('div', { class: 'skills-list' }, skills.length ? skills.map((s) => h('span', { class: 'chip' }, skillIcon(s, 30), SKILL_INFO[s].name, ' ', h('b', {}, '×' + def.skills[s]))) : h('span', { class: 'sub' }, 'Aucun talent !')),
    def.hint ? h('p', { class: 'hint' }, '💡 ' + def.hint) : null,
    best ? h('p', { class: 'sub', style: 'margin-top:10px' }, `Ton record : ${best.saved} sauvées · ${best.score} points`) : null,
    portrait ? h('p', { id: 'rotate-hint' }, '📱 Astuce : tourne ton téléphone pour voir plus large.') : null,
    h('div', { class: 'btns' },
      h('button', { class: 'btn ghost', onclick: () => { audio.sfx('click'); selectScreen(TIERS.indexOf(tier)); } }, '← Niveaux'),
      fails >= 3 && def.solution ? h('button', { class: 'btn', onclick: () => { audio.sfx('click'); watchDemo(def); } }, '👀 Voir une solution') : null,
      h('button', { class: 'btn go', onclick: () => { audio.unlock(); audio.sfx('open'); play(def); } }, 'C\'est parti !'))));
}

// ---------- plein écran et geste « retour » ----------
function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
let autoFullDone = false;
function enterFullscreen(manual) {
  if (fsElement() || (!manual && (!S.save.opts.full || autoFullDone))) return;
  autoFullDone = true;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* refusé par le navigateur */ }
}
function exitFullscreen() {
  if (!fsElement()) return;
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  try { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* rien */ }
}
function toggleFullscreen() {
  if (fsElement()) { S.save.opts.full = false; exitFullscreen(); }
  else { S.save.opts.full = true; enterFullscreen(true); }
  persist();
}
function canFullscreen() { return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen); }

// Un glissé depuis le bord de l'écran fait « retour » dans le navigateur : pendant une partie,
// on garde une étape d'historique en réserve et on ouvre le menu pause au lieu de quitter le jeu.
function guardHistory() {
  if (!history.state || !history.state.bestioles) history.pushState({ bestioles: 1 }, '');
}
window.addEventListener('popstate', () => {
  if (S.mode === 'play' || S.mode === 'pause') {
    history.pushState({ bestioles: 1 }, '');
    if (S.mode === 'play') openPauseMenu();
  } else if (S.mode === 'brief' || S.mode === 'result') {
    history.pushState({ bestioles: 1 }, '');
    selectScreen(TIERS.indexOf(tierOf(S.level)));
  } else if (S.mode === 'select' || S.mode === 'help' || S.mode === 'board' || S.mode === 'options') {
    history.pushState({ bestioles: 1 }, '');
    titleScreen();
  }
});

function play(def) {
  enterFullscreen();
  guardHistory();
  closeScreens();
  startLevel(def);
  S.mode = 'play';
  $('hud').classList.remove('hidden');
  $('panel').classList.remove('hidden');
  resize();
  S.cam.zoom = clampZoom(Math.min(fitZoom(), 4));
  if (S.W / S.H < 1) S.cam.zoom = clampZoom(Math.min(fitZoom(), S.W / 300));
  updateCamSize();
  centerOn(def.entrances[0].x, def.entrances[0].y + 40);
  if (def.num === 1 && def.tier === 't1' && !S.save.best[def.id]) toast('Choisis un talent en bas, puis touche une bestiole !', 4000);
}

function watchDemo(def) {
  enterFullscreen();
  guardHistory();
  closeScreens();
  startLevel(def, 'watch');
  S.mode = 'play';
  $('hud').classList.remove('hidden');
  $('panel').classList.remove('hidden');
  resize();
  S.cam.zoom = clampZoom(Math.min(fitZoom(), 4));
  updateCamSize();
  centerOn(def.entrances[0].x, def.entrances[0].y + 40);
}

function openPauseMenu() {
  if (S.mode !== 'play') return;
  const wasPaused = S.paused;
  setPaused(true);
  S.mode = 'pause';
  S.resumePaused = wasPaused;
  const def = S.level;
  show(h('div', { class: 'card', style: 'width:min(420px,100%);text-align:center' },
    h('h2', {}, S.demoKind === 'watch' ? 'Démonstration' : 'Pause'),
    h('p', { class: 'sub' }, def.name),
    h('div', { class: 'menu', style: 'margin:0 auto' },
      h('button', { class: 'btn go', onclick: resumeFromMenu }, '▶  Reprendre'),
      h('button', { class: 'btn', onclick: () => { audio.sfx('click'); play(def); } }, '↻  Recommencer'),
      h('button', { class: 'btn', onclick: () => { audio.sfx('click'); briefScreen(def); } }, '📋  Objectifs du niveau'),
      h('button', { class: 'btn ghost', onclick: () => { audio.stopMusic(); audio.sfx('click'); selectScreen(TIERS.indexOf(tierOf(def))); } }, '🗺️  Quitter vers les niveaux')),
    optionToggles()));
}
function resumeFromMenu() {
  closeScreens();
  S.mode = 'play';
  setPaused(!!S.resumePaused && S.demoKind !== 'watch' ? true : false);
}

function resultScreen(def, r) {
  S.mode = 'result';
  const tier = tierOf(def);
  const idx = tier.levels.indexOf(def);
  const next = tier.levels[idx + 1] || (TIERS[TIERS.indexOf(tier) + 1] || {}).levels?.[0];
  const msgs = r.win
    ? (r.saved === r.total ? ['Parfait ! Toutes les bestioles sont à la maison !', 'Pas une seule de perdue. Bravo !']
      : r.stars >= 2 ? ['Superbe sauvetage !', 'Les bestioles t\'adorent !'] : ['Ouf, c\'est gagné !', 'Mission accomplie !'])
    : (r.saved === 0 ? ['Aïe… aucune bestiole n\'est rentrée.', 'Elles comptaient sur toi !'] : r.need - r.saved <= 2 ? ['Si près du but !', 'Il en manquait presque rien !'] : ['Pas assez de bestioles sauvées.', 'On réessaie ?']);
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  const scoreBox = h('div');
  const card = h('div', { class: 'card result' },
    h('h2', {}, r.win ? '🎉 Niveau réussi !' : '😿 Raté…'),
    h('p', { class: 'sub' }, def.name),
    h('div', { class: 'stars-big' }, [0, 1, 2].map((k) => h('span', { class: k < r.stars ? 'on' : '', style: `animation-delay:${0.2 + k * 0.25}s` }, '★'))),
    h('div', { class: 'big' }, String(r.saved), h('small', {}, ` / ${r.need} à sauver`)),
    h('p', { class: 'msg' }, msg),
    r.win ? h('p', { class: 'pts' }, `${r.score} points` + (r.record ? ' — nouveau record !' : '') + (r.timeBonus ? ` (dont ${r.timeBonus} de bonus temps)` : '')) : null,
    scoreBox,
    h('div', { class: 'btns' },
      h('button', { class: 'btn ghost', onclick: () => { audio.sfx('click'); selectScreen(TIERS.indexOf(tier)); } }, '🗺️ Niveaux'),
      h('button', { class: 'btn' + (r.win ? '' : ' go'), onclick: () => { audio.sfx('click'); briefScreen(def); } }, '↻ Rejouer'),
      r.win && next && levelUnlocked(next) ? h('button', { class: 'btn go', onclick: () => { audio.sfx('click'); briefScreen(next); } }, 'Suivant ▶') : null));
  show(card);
  if (r.win && r.gain > 0) scoreFlow(scoreBox, r.grand);
}

// Envoie le score total au classement (avec un pseudo)
function scoreFlow(box, total) {
  const pseudo = window.Arcade.pseudo();
  const send = async (p) => {
    box.replaceChildren(h('p', { class: 'sub' }, 'Envoi au classement…'));
    try {
      const res = await window.Arcade.envoyerScore(total, { pseudo: p });
      S.save.sent = total;
      persist();
      box.replaceChildren(h('p', { class: 'ok-msg' }, `🏆 Score total ${total.toLocaleString('fr-FR')} : tu es ${res.rang ? res.rang + (res.rang === 1 ? 'er' : 'e') : 'hors du top 100'} au classement !`));
    } catch (e) {
      ask(e.message);
    }
  };
  const ask = (err) => {
    const input = h('input', { type: 'text', maxlength: '16', placeholder: 'Ton pseudo', value: window.Arcade.pseudo() || '' });
    const go = () => { const v = input.value.trim(); if (v) send(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    box.replaceChildren(
      h('p', { class: 'sub', style: 'margin:10px 0 0' }, `Ton score total : ${total.toLocaleString('fr-FR')} points. Entre ton pseudo pour le classement :`),
      h('div', { class: 'pseudo-row' }, input, h('button', { class: 'btn gold small', onclick: go }, 'Envoyer')),
      h('div', { class: 'err' }, err || ''));
  };
  if (pseudo) send(pseudo); else ask();
}

async function boardScreen() {
  S.mode = 'board';
  const list = h('ol', {}, h('li', {}, h('span', { class: 'p' }, 'Chargement…')));
  show(h('div', { class: 'card board' },
    h('h2', {}, '🏆 Classement'),
    h('p', { class: 'sub' }, 'Le total des meilleurs scores de chaque niveau.'),
    list,
    h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => { audio.sfx('click'); titleScreen(); } }, '← Retour'))));
  try {
    const all = await window.Arcade.meilleursScores({ nombre: 100 });
    // un seul score (le meilleur) par pseudo
    const seen = new Set();
    const top = all.filter((x) => { const k = x.pseudo.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20).map((x, i) => ({ ...x, rang: i + 1 }));
    const me = (window.Arcade.pseudo() || '').toLowerCase();
    list.replaceChildren(...(top.length ? top.map((s) => h('li', { class: s.pseudo.toLowerCase() === me ? 'me' : '' },
      h('span', { class: 'r', text: '#' + s.rang }), h('span', { class: 'p', text: s.pseudo }), h('span', { class: 's', text: Number(s.score).toLocaleString('fr-FR') })))
      : [h('li', {}, h('span', { class: 'p' }, 'Personne encore… sois le premier !'))]));
  } catch (e) {
    list.replaceChildren(h('li', {}, h('span', { class: 'p' }, 'Classement indisponible pour le moment.')));
  }
}

function helpScreen() {
  S.mode = 'help';
  show(h('div', { class: 'card' },
    h('h2', {}, 'Comment jouer'),
    h('p', { class: 'sub' }, 'Les bestioles sortent de la trappe et marchent droit devant, sans réfléchir. Donne-leur des talents pour qu\'assez d\'entre elles rejoignent la maisonnette !'),
    h('div', { class: 'help-list' }, SKILLS.map((s, i) => h('div', { class: 'help-item' }, skillIcon(s, 46), h('div', {}, h('b', {}, `${i + 1}. ${SKILL_INFO[s].name}`), h('span', {}, SKILL_INFO[s].desc))))),
    h('p', { class: 'keys' },
      '🖱️ Choisis un talent puis clique sur une bestiole. Fais glisser pour te déplacer, molette pour défiler, Ctrl+molette pour zoomer.', h('br'),
      '📱 Touche une bestiole pour lui donner le talent, glisse pour te déplacer, pince pour zoomer.', h('br'),
      h('kbd', {}, '1'), '…', h('kbd', {}, '8'), ' talents · ', h('kbd', {}, 'P'), ' pause · ', h('kbd', {}, 'F'), ' accélérer · ', h('kbd', {}, '+'), h('kbd', {}, '−'), ' débit · ', h('kbd', {}, 'N'), h('kbd', {}, 'N'), ' tout exploser · flèches pour défiler'),
    h('p', { class: 'keys' }, 'Une chute trop haute est fatale, l\'eau et la lave aussi. L\'acier ne se creuse pas, et les murs fléchés ne se creusent que dans le sens des flèches. En pause, tu peux quand même donner des talents !'),
    h('div', { class: 'btns' }, h('button', { class: 'btn go', onclick: () => { audio.sfx('click'); titleScreen(); } }, 'Compris !'))));
}

function optionToggles() {
  const row = (label, key) => {
    const sw = h('button', { class: 'switch' + (S.save.opts[key] ? ' on' : ''), 'aria-label': label });
    sw.addEventListener('click', () => {
      S.save.opts[key] = !S.save.opts[key];
      sw.classList.toggle('on', S.save.opts[key]);
      audio.setPrefs(S.save.opts);
      audio.sfx('click');
      persist();
    });
    return h('div', { class: 'toggle' }, h('span', {}, label), sw);
  };
  const rows = [row('🎵 Musique', 'music'), row('🔊 Bruitages', 'sfx')];
  if (canFullscreen()) {
    const fs = row('⛶ Plein écran en jeu', 'full');
    fs.querySelector('button').addEventListener('click', () => { if (S.save.opts.full) { if (S.mode === 'pause') enterFullscreen(true); } else exitFullscreen(); });
    rows.push(fs);
  }
  return h('div', { style: 'margin-top:14px;text-align:left' }, ...rows);
}

function optionsScreen() {
  S.mode = 'options';
  const acc = h('div', { class: 'account', style: 'margin-top:14px' });
  show(h('div', { class: 'card', style: 'width:min(440px,100%)' },
    h('h2', {}, 'Options'),
    optionToggles(),
    acc,
    h('div', { class: 'btns' }, h('button', { class: 'btn go', onclick: () => { audio.sfx('click'); titleScreen(); } }, 'OK'))));
  fillAccount(acc);
}

// ---------- démarrage ----------
async function boot() {
  resize();
  await Promise.race([loadSave(), new Promise((r) => setTimeout(r, 4000))]);
  try { await document.fonts.load('600 16px Fredoka'); } catch (e) { /* rien */ }
  titleScreen();
  requestAnimationFrame(frame);
}
boot();

// accès pour les tests automatiques
window.__B = { S, LEVELS, watchDemo, play, zoomAt, centerOn };
