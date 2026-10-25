// Sons et musique synthétisés (WebAudio) : aucun fichier à charger.
// Les musiques sont des airs du domaine public arrangés en chiptune.

let ac = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null;
let dest = null; // sortie du bruitage en cours (volume et stéréo selon la position)
const prefs = { sfx: true, music: true };

export function setPrefs(p) {
  Object.assign(prefs, p);
  if (sfxGain) sfxGain.gain.value = prefs.sfx ? 0.55 : 0;
  if (musicGain) musicGain.gain.value = prefs.music ? 0.24 : 0;
}

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ac.destination);
    sfxGain = ac.createGain();
    musicGain = ac.createGain();
    sfxGain.connect(master);
    musicGain.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setPrefs({});
  }
  if (ac.state === 'suspended') ac.resume();
}

function env(g, t, a, peak, dec, sus = 0, rel = 0.05) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec);
  if (sus) g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec + rel);
}

function tone(type, f0, f1, dur, vol = 0.3, when = 0, out = dest || sfxGain) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol, freq = 2000, q = 1, when = 0, type = 'lowpass', f1 = null, out = dest || sfxGain) {
  if (!ac) return;
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain();
  env(g, t, 0.003, vol, dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const last = {};
// intervalle minimal entre deux mêmes sons (sinon cacophonie avec beaucoup de bestioles ou en accéléré)
// renfort des petits bruitages des bestioles (sinon couverts par la musique, surtout sur téléphone)
const BOOST = { yippee: 2.2, ohno: 1.6, umbrella: 1.8, bombtick: 2.6, hup: 2.6, climb: 3, land: 2.4, whee: 2.6, shovel: 2.3, punch: 1.9, pick: 2.5, shrug: 2.4, pop: 2.2, halt: 2.2, brick: 2.2, brickLow: 2, ting: 1.6 };
let tic = false;
const GAP = { shovel: 110, punch: 120, pick: 140, land: 70, whee: 90, tick: 60, brick: 60, brickLow: 60, pop: 70, climb: 120, hup: 100 };
// opt : { pan: -1…1, vol: 0…1 } pour placer le son dans l'espace
export function sfx(name, opt) {
  if (!ac || !prefs.sfx) return;
  const now = performance.now();
  if (last[name] && now - last[name] < (GAP[name] || 40)) return;
  last[name] = now;
  const boost = BOOST[name] || 1;
  if (boost !== 1 || (opt && (opt.pan || (opt.vol !== undefined && opt.vol !== 1)))) {
    opt = opt || {};
    const g = ac.createGain();
    g.gain.value = (opt.vol ?? 1) * boost;
    let node = g;
    if (ac.createStereoPanner && opt.pan) {
      const pn = ac.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, opt.pan));
      g.connect(pn); pn.connect(sfxGain);
    } else g.connect(sfxGain);
    dest = node;
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* déjà fait */ } }, 3000);
  }
  try { play(name); } finally { dest = null; }
}

function play(name) {
  switch (name) {
    case 'open': [0, 4, 7, 12].forEach((s, i) => tone('square', 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), 0.12, 0.12, i * 0.08)); noise(0.3, 0.1, 800, 1, 0, 'bandpass'); break;
    case 'assign': tone('triangle', 660, 990, 0.08, 0.25); tone('square', 1320, 1320, 0.04, 0.05, 0.03); break;
    case 'select': tone('triangle', 520, 700, 0.05, 0.15); break;
    case 'click': tone('square', 900, 900, 0.03, 0.06); break;
    case 'yippee': tone('square', 880, 1760, 0.08, 0.1); tone('square', 1175, 2350, 0.1, 0.1, 0.07); tone('triangle', 1760, 2637, 0.12, 0.12, 0.14); break;
    case 'splat': tone('sine', 240, 45, 0.3, 0.5); noise(0.22, 0.35, 1100, 0.8, 0, 'lowpass', 200); tone('sine', 600, 200, 0.12, 0.12, 0.04); break;
    case 'drown': for (let i = 0; i < 4; i++) tone('sine', 300 + Math.random() * 300, 700 + Math.random() * 400, 0.06, 0.15, i * 0.07); break;
    case 'burn': noise(0.5, 0.25, 3000, 0.7, 0, 'highpass'); tone('sawtooth', 300, 80, 0.4, 0.08); break;
    case 'crush': tone('square', 160, 60, 0.12, 0.3); noise(0.1, 0.3, 1500); tone('square', 200, 90, 0.08, 0.2, 0.12); break;
    case 'boom': noise(0.7, 0.7, 1200, 0.8, 0, 'lowpass', 60); tone('sine', 120, 30, 0.5, 0.6); break;
    case 'ohno': tone('triangle', 900, 500, 0.18, 0.2); tone('triangle', 700, 300, 0.25, 0.2, 0.18); break;
    case 'ting': tone('triangle', 2400, 2300, 0.25, 0.15); tone('sine', 3600, 3500, 0.2, 0.06); break;
    case 'brick': tone('square', 1100, 1100, 0.025, 0.05); break;
    case 'brickLow': tone('square', 1600, 1600, 0.04, 0.09); break;
    case 'umbrella': noise(0.18, 0.15, 2500, 2, 0, 'bandpass', 600); tone('triangle', 500, 900, 0.1, 0.1, 0.1); break;
    case 'nuke': for (let i = 0; i < 3; i++) tone('sawtooth', 300, 900, 0.3, 0.12, i * 0.32); break;
    case 'fallout': tone('sine', 1200, 200, 0.5, 0.1); break;
    case 'win': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone('square', 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), i === 6 ? 0.5 : 0.14, 0.13, i * 0.12)); break;
    case 'lose': [0, -1, -2, -4].forEach((s, i) => tone('sawtooth', 330 * 2 ** (s / 12), 330 * 2 ** ((s - (i === 3 ? 2 : 0)) / 12), i === 3 ? 0.7 : 0.28, 0.1, i * 0.3)); break;
    case 'dig': noise(0.06, 0.08, 700, 1); break;
    // creuseuse : coup de pelle qui racle la terre
    case 'shovel': noise(0.09, 0.22, 500, 0.9, 0, 'bandpass', 220); noise(0.05, 0.1, 2400, 1.5, 0.05, 'bandpass', 1200); tone('sine', 140, 90, 0.07, 0.15); break;
    // cogneuse : coup de poing sourd et terre qui s'effrite
    case 'punch': tone('sine', 190, 60, 0.1, 0.32); noise(0.12, 0.2, 900, 0.8, 0.02, 'lowpass', 300); break;
    // mineuse : tintement de pioche puis éboulis
    case 'pick': tone('triangle', 1900, 1700, 0.06, 0.13); tone('square', 3200, 3000, 0.03, 0.04); noise(0.14, 0.16, 1300, 0.7, 0.03, 'bandpass', 400); break;
    // chute : « youhouuu » qui descend
    case 'whee': { const f = 950 + Math.random() * 250; tone('triangle', f, f * 0.42, 0.75, 0.13); tone('sine', f * 2, f * 0.84, 0.75, 0.04); break; }
    // atterrissage en douceur
    case 'land': tone('sine', 260, 110, 0.07, 0.18); noise(0.05, 0.09, 600, 1); break;
    // apparition à la trappe
    case 'pop': tone('sine', 420, 820, 0.07, 0.14); break;
    // la grimpeuse s'accroche, puis se hisse
    case 'climb': tone('triangle', 520, 780, 0.06, 0.1); noise(0.05, 0.06, 3000, 2, 0.02, 'bandpass'); break;
    case 'hup': tone('triangle', 600, 1000, 0.09, 0.14); tone('triangle', 900, 1300, 0.07, 0.1, 0.08); break;
    // plus de briques : « hein ? »
    case 'shrug': tone('triangle', 520, 680, 0.1, 0.13); tone('triangle', 680, 460, 0.14, 0.13, 0.11); break;
    // bloqueuse : coup de sifflet
    case 'halt': tone('square', 1500, 1500, 0.09, 0.08); tone('square', 1500, 1500, 0.16, 0.08, 0.12); break;
    case 'tick': tone('square', 1400, 1400, 0.02, 0.05); break;
    case 'bombtick': // « tic… tac… »
      tic = !tic;
      tone('triangle', tic ? 1600 : 1050, tic ? 1500 : 980, 0.05, 0.16);
      tone('square', tic ? 3200 : 2100, tic ? 3200 : 2100, 0.015, 0.05);
      noise(0.02, 0.08, 5000, 1, 0, 'highpass');
      break;
  }
}

// ---------- Musique ----------

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(n);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const freq = (m) => 440 * 2 ** ((m - 69) / 12);

// mélodie : "note:durée" en temps ; « - » = silence ; accords : une fondamentale par mesure de 4 temps
const TUNES = [
  { name: 'Ode à la joie', bpm: 138, chords: 'C G C G C G C GC G C G G C G C GC',
    mel: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2 ' +
      'D4 D4 E4 C4 D4 E4:0.5 F4:0.5 E4 C4 D4 E4:0.5 F4:0.5 E4 D4 C4 D4 G3:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2' },
  { name: 'Le roi de la montagne', bpm: 150, chords: 'A E A E A E A E',
    mel: 'A3:0.5 B3:0.5 C4:0.5 D4:0.5 E4:0.5 C4:0.5 E4 D#4:0.5 B3:0.5 D#4 D4:0.5 Bb3:0.5 D4 A3:0.5 B3:0.5 C4:0.5 D4:0.5 E4:0.5 C4:0.5 E4:0.5 A4:0.5 G4:0.5 E4:0.5 C4:0.5 E4:0.5 G4:2 ' +
      'A4:0.5 B4:0.5 C5:0.5 D5:0.5 E5:0.5 C5:0.5 E5 D#5:0.5 B4:0.5 D#5 D5:0.5 Bb4:0.5 D5 A4:0.5 B4:0.5 C5:0.5 D5:0.5 E5:0.5 C5:0.5 E5:0.5 A5:0.5 G5:0.5 E5:0.5 C5:0.5 E5:0.5 G5:2' },
  { name: 'Frère Jacques', bpm: 132, chords: 'C C C C C C C C',
    mel: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2' },
  { name: 'Le pont de Londres', bpm: 140, chords: 'C C G C C C G C',
    mel: 'G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3' },
  { name: 'Au clair de la lune', bpm: 128, chords: 'C G C C C G C C G D G G C G C C',
    mel: 'C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 ' +
      'D4 D4 D4 D4 A3:2 A3:2 D4 C4 B3 A3 G3:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4' },
  { name: 'Dans la ferme', bpm: 144, chords: 'C FC G C C FC G C C C C FC G C',
    mel: 'C4 C4 C4 G3 A3 A3 G3:2 E4 E4 D4 D4 C4:3 G3 C4 C4 C4 G3 A3 A3 G3:2 E4 E4 D4 D4 C4:4 ' +
      'C4:0.5 C4:0.5 C4 C4:0.5 C4:0.5 C4 C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4 C4 C4 C4 C4 G3 A3 A3 G3:2 E4 E4 D4 D4 C4:4' },
];
export const TUNE_COUNT = TUNES.length;

function parseTune(tu) {
  const notes = [];
  let beat = 0;
  for (const tok of tu.mel.trim().split(/\s+/)) {
    const [n, d] = tok.split(':');
    const dur = d ? Number(d) : 1;
    if (n !== '-') notes.push({ m: midi(n), t: beat, d: dur });
    beat += dur;
  }
  const bars = Math.ceil(beat / 4);
  const roots = tu.chords.split(/\s+/);
  return { notes, len: bars * 4, roots, bpm: tu.bpm };
}

let current = null, timer = null, currentIndex = -1;
export const playingTune = () => (current ? currentIndex : -1);

export function playMusic(index) {
  if (!ac) return;
  stopMusic();
  currentIndex = index;
  const tune = parseTune(TUNES[((index % TUNES.length) + TUNES.length) % TUNES.length]);
  const spb = 60 / tune.bpm;
  const start = ac.currentTime + 0.1;
  current = { tune, spb, start, next: 0, loop: 0 };
  timer = setInterval(schedule, 50);
  schedule();
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
  current = null;
}

function schedule() {
  if (!current || !ac) return;
  const { tune, spb } = current;
  const horizon = ac.currentTime + 0.25;
  // on programme beat par beat (croches) jusqu'à l'horizon
  while (true) {
    const step = current.next; // en demi-temps
    const beat = step / 2;
    const loopBeat = beat % tune.len;
    const loopStart = current.start + Math.floor(beat / tune.len) * tune.len * spb;
    const t = loopStart + loopBeat * spb;
    if (t > horizon) break;
    current.next++;
    if (!prefs.music) continue;
    const bar = Math.floor(loopBeat / 4);
    const rootName = tune.roots[bar % tune.roots.length] || 'C';
    const half = loopBeat % 4 >= 2 && rootName.length > 1 ? rootName[1] : rootName[0];
    const root = 36 + NOTE[half];
    // basse sautillante
    const bm = root + (step % 2 ? 12 : 0);
    voice('triangle', freq(bm), t, spb * 0.45, 0.32);
    // batterie
    if (step % 4 === 0) kick(t);
    if (step % 4 === 2) snare(t);
    hat(t, step % 2 ? 0.03 : 0.05);
    // mélodie (+ écho doux)
    for (const n of tune.notes) {
      if (Math.abs(n.t - loopBeat) < 1e-6 || (n.t > loopBeat && n.t < loopBeat + 0.5 - 1e-6)) {
        const nt = loopStart + n.t * spb;
        voice('square', freq(n.m), nt, n.d * spb * 0.9, 0.13, true);
        voice('triangle', freq(n.m + 12), nt + spb * 0.25, n.d * spb * 0.6, 0.05);
      }
    }
  }
}

function voice(type, f, t, dur, vol, vib) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (vib && dur > 0.25) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 6; lg.gain.value = f * 0.008;
    l.connect(lg); lg.connect(o.frequency);
    l.start(t + 0.12); l.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function kick(t) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g); g.connect(musicGain);
  o.start(t); o.stop(t + 0.16);
}

function snare(t) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  s.connect(f); f.connect(g); g.connect(musicGain);
  s.start(t, Math.random() * 0.5); s.stop(t + 0.13);
}

function hat(t, vol) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  s.connect(f); f.connect(g); g.connect(musicGain);
  s.start(t, Math.random() * 0.5); s.stop(t + 0.05);
}
