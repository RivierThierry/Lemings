// Moteur des Bestioles : terrain au pixel près et comportement de chaque bestiole.
// Aucun accès au DOM : le même code tourne dans le navigateur et sous Node (vérification des niveaux).

export const TPS = 30; // ticks de simulation par seconde
export const SKILLS = ['climber', 'floater', 'bomber', 'blocker', 'builder', 'basher', 'miner', 'digger'];

export const EMPTY = 0, DIRT = 1, STEEL = 2, OW_LEFT = 3, OW_RIGHT = 4;
const MATS = { dirt: DIRT, steel: STEEL, left: OW_LEFT, right: OW_RIGHT };

export const LEM_H = 16;        // hauteur du corps
const STEP_UP = 6;              // marche franchissable en montée
const STEP_DOWN = 4;            // descente sans tomber
const FALL_SPEED = 4;
export const SPLAT_DIST = 100;  // chute mortelle au-delà
const FLOAT_OPEN = 20;          // le parapluie s'ouvre après cette chute
const BRICKS = 12;
const BRICK_W = 12;
const BOMB_TICKS = 5 * TPS;
const BLOCK_R = 6;              // demi-largeur du champ d'un bloqueur

// États où la bestiole est sur ses pattes et peut recevoir une compétence de travail
const WORKERS = new Set(['walking', 'shrugging', 'building', 'bashing', 'mining', 'digging']);
const DYING = new Set(['splatting', 'drowning', 'burning', 'ohno', 'exiting', 'dead', 'saved', 'crushed']);

// ---------- Formes : partagées par le terrain (masque) et le dessin ----------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Contour bosselé d'un rocher : rectangle arrondi dont le bord ondule (déterministe)
function rockPoints(p) {
  const { x, y, w, h } = p;
  const r = Math.min(p.r ?? Math.min(w, h) * 0.3, w / 2, h / 2);
  const j = p.j ?? Math.min(6, Math.min(w, h) * 0.12);
  const rand = rng(p.seed ?? (x * 7919 + y * 104729 + w * 31 + h));
  const pts = [];
  const step = 7;
  // chemin du rectangle arrondi
  const path = [];
  const seg = (x1, y1, x2, y2) => { path.push([x1, y1, x2, y2]); };
  seg(x + r, y, x + w - r, y);
  path.push({ arc: [x + w - r, y + r, -Math.PI / 2, 0] });
  seg(x + w, y + r, x + w, y + h - r);
  path.push({ arc: [x + w - r, y + h - r, 0, Math.PI / 2] });
  seg(x + w - r, y + h, x + r, y + h);
  path.push({ arc: [x + r, y + h - r, Math.PI / 2, Math.PI] });
  seg(x, y + h - r, x, y + r);
  path.push({ arc: [x + r, y + r, Math.PI, Math.PI * 1.5] });
  const cx = x + w / 2, cy = y + h / 2;
  // bruit lissé : valeurs aléatoires interpolées
  const raw = [];
  for (const s of path) {
    if (s.arc) {
      const [ax, ay, a0, a1] = s.arc;
      const n = Math.max(1, Math.ceil((r * (a1 - a0)) / step));
      for (let i = 0; i < n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        raw.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]);
      }
    } else {
      const [x1, y1, x2, y2] = s;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.ceil(len / step));
      for (let i = 0; i < n; i++) raw.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
    }
  }
  const noise = raw.map(() => rand() * 2 - 1);
  for (let i = 0; i < raw.length; i++) {
    const nz = (noise[i] * 2 + noise[(i + 1) % raw.length] + noise[(i + raw.length - 1) % raw.length]) / 4;
    const [px, py] = raw[i];
    const dx = px - cx, dy = py - cy;
    const d = Math.hypot(dx, dy) || 1;
    pts.push(px + (dx / d) * nz * j, py + (dy / d) * nz * j);
  }
  return pts;
}

export function shapeOf(p, levelH) {
  switch (p.t) {
    case 'rect': return { kind: 'rect', x: p.x, y: p.y, w: p.w, h: p.h };
    case 'circle': return { kind: 'ellipse', cx: p.x, cy: p.y, rx: p.r, ry: p.r };
    case 'ellipse': return { kind: 'ellipse', cx: p.x, cy: p.y, rx: p.rx, ry: p.ry };
    case 'poly': return { kind: 'poly', pts: p.pts.flat() };
    case 'land': {
      const bottom = p.to ?? levelH;
      const pts = p.pts.flat();
      const x0 = p.pts[0][0], x1 = p.pts[p.pts.length - 1][0];
      pts.push(x1, bottom, x0, bottom);
      return { kind: 'poly', pts };
    }
    case 'bar': { // segment épais (rampe, poutre)
      const { x1, y1, x2, y2 } = p;
      const w = (p.w ?? 8) / 2;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = (-(y2 - y1) / len) * w, ny = ((x2 - x1) / len) * w;
      return { kind: 'poly', pts: [x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny] };
    }
    case 'rock': return { kind: 'poly', pts: rockPoints(p) };
    default: throw new Error('Forme inconnue : ' + p.t);
  }
}

// Remplit les pixels couverts par la forme (centres de pixels), appelle fn(x, y)
function rasterize(s, W, H, fn) {
  if (s.kind === 'rect') {
    const x0 = Math.max(0, Math.round(s.x)), x1 = Math.min(W, Math.round(s.x + s.w));
    const y0 = Math.max(0, Math.round(s.y)), y1 = Math.min(H, Math.round(s.y + s.h));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fn(x, y);
  } else if (s.kind === 'ellipse') {
    const y0 = Math.max(0, Math.floor(s.cy - s.ry)), y1 = Math.min(H - 1, Math.ceil(s.cy + s.ry));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - s.cy) / s.ry;
      if (dy * dy > 1) continue;
      const half = s.rx * Math.sqrt(1 - dy * dy);
      const xa = Math.max(0, Math.ceil(s.cx - half - 0.5)), xb = Math.min(W - 1, Math.floor(s.cx + half - 0.5));
      for (let x = xa; x <= xb; x++) fn(x, y);
    }
  } else {
    const p = s.pts, n = p.length / 2;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < p.length; i += 2) { minY = Math.min(minY, p[i]); maxY = Math.max(maxY, p[i]); }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
        if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) fn(x, y);
      }
    }
  }
}

// ---------- Terrain ----------

export class Terrain {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.m = new Uint8Array(w * h);
    this.changes = []; // zones modifiées, que le dessin recopie
  }
  get(x, y) {
    if (x < 0 || x >= this.w) return STEEL; // bords du niveau : murs
    if (y < 0 || y >= this.h) return EMPTY;
    return this.m[y * this.w + x];
  }
  solid(x, y) { return this.get(x, y) !== EMPTY; }
  mark(x0, y0, x1, y1) { this.changes.push([x0, y0, x1, y1]); }

  apply(prim) {
    const s = shapeOf(prim, this.h);
    const v = prim.cut ? EMPTY : (MATS[prim.m || 'dirt'] ?? DIRT);
    const m = this.m, W = this.w;
    rasterize(s, this.w, this.h, (x, y) => { m[y * W + x] = v; });
  }

  // Pixels d'une forme d'excavation (ellipse limitée par un rectangle)
  _cells(cx, cy, rx, ry, clip, fn) {
    const y0 = Math.max(0, Math.floor(cy - ry), clip.y0), y1 = Math.min(this.h - 1, Math.ceil(cy + ry), clip.y1);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const xa = Math.max(0, Math.ceil(cx - half - 0.5), clip.x0), xb = Math.min(this.w - 1, Math.floor(cx + half - 0.5), clip.x1);
      for (let x = xa; x <= xb; x++) fn(x, y);
    }
  }

  // Une case qu'on ne peut pas creuser dans cette direction (dir = 0 : creuser vers le bas)
  static hard(v, dir) {
    return v === STEEL || (dir > 0 && v === OW_LEFT) || (dir < 0 && v === OW_RIGHT);
  }

  // Y a-t-il de l'acier (ou un sens interdit) dans la zone ?
  blockedIn(cx, cy, rx, ry, clip, dir) {
    let hit = false;
    this._cells(cx, cy, rx, ry, clip, (x, y) => { if (!hit && Terrain.hard(this.m[y * this.w + x], dir)) hit = true; });
    return hit;
  }

  // Creuse la zone (sauf acier) ; renvoie le nombre de pixels enlevés
  erase(cx, cy, rx, ry, clip = { x0: 0, y0: 0, x1: 1e9, y1: 1e9 }) {
    let n = 0;
    const m = this.m, W = this.w;
    this._cells(cx, cy, rx, ry, clip, (x, y) => {
      const i = y * W + x;
      if (m[i] !== EMPTY && m[i] !== STEEL) { m[i] = EMPTY; n++; }
    });
    if (n) this.mark(Math.floor(cx - rx) - 1, Math.floor(cy - ry) - 1, Math.ceil(cx + rx) + 1, Math.ceil(cy + ry) + 1);
    return n;
  }

  eraseRect(x0, y0, x1, y1) {
    let n = 0;
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const i = y * this.w + x;
        if (this.m[i] !== EMPTY && this.m[i] !== STEEL) { this.m[i] = EMPTY; n++; }
      }
    }
    if (n) this.mark(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    return n;
  }

  fillRect(x0, y0, x1, y1, v = DIRT) {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const i = y * this.w + x;
        if (this.m[i] === EMPTY) this.m[i] = v;
      }
    }
    this.mark(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  anyIn(x0, y0, x1, y1, test) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (test(this.get(x, y))) return true;
    return false;
  }
}

export function buildTerrain(def) {
  const t = new Terrain(def.w, def.h);
  for (const p of def.terrain) t.apply(p);
  t.changes.length = 0;
  return t;
}

// ---------- Bestiole ----------

let nextId = 1;
class Lem {
  constructor(x, y, dir) {
    this.id = nextId++;
    this.x = x; this.y = y; this.dir = dir;
    this.state = 'falling';
    this.frame = 0;
    this.anim = 0;          // compteur d'animation (dessin)
    this.climber = false;
    this.floater = false;
    this.bomb = -1;         // ticks avant explosion, -1 = pas de bombe
    this.fall = 0;
    this.bricks = 0;
  }
}

// ---------- Partie ----------

export function releaseInterval(rr) {
  return Math.max(4, Math.round(((53 - rr / 2) * TPS) / 17));
}

export class Game {
  constructor(def) {
    this.def = def;
    this.terrain = buildTerrain(def);
    this.lems = [];
    this.tickCount = 0;
    this.total = def.lemmings;
    this.need = def.save;
    this.out = 0;
    this.saved = 0;
    this.dead = 0;
    this.rrMin = def.release ?? 50;
    this.rr = this.rrMin;
    this.timeLeft = (def.time ?? 300) * TPS;
    this.skills = {};
    for (const s of SKILLS) this.skills[s] = def.skills?.[s] ?? 0;
    this.used = 0;
    this.entrances = def.entrances.map((e) => ({ ...e, dir: e.dir ?? 1 }));
    this.exits = def.exits.map((e) => ({ ...e }));
    this.hazards = (def.hazards || []).map((h) => ({ ...h }));
    this.traps = (def.traps || []).map((t) => ({ ...t, cool: 0, anim: 0 }));
    this.spawnTimer = 0;
    this.nextEntrance = 0;
    this.opening = 30;      // les trappes s'ouvrent pendant le début
    this.nuking = false;
    this.nukeIndex = 0;
    this.done = false;
    this.events = [];
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  get alive() { return this.lems.filter((l) => l.state !== 'dead' && l.state !== 'saved').length; }

  setRate(rr) { this.rr = Math.max(this.rrMin, Math.min(99, rr)); }

  nuke() {
    if (this.nuking || this.done) return;
    this.nuking = true;
    this.emit('sound', { name: 'nuke' });
  }

  // ----- compétences -----

  canAssign(l, skill) {
    if (!l || DYING.has(l.state) || l.state === 'dead') return false;
    if (this.skills[skill] <= 0) return false;
    switch (skill) {
      case 'climber': return !l.climber;
      case 'floater': return !l.floater;
      case 'bomber': return l.bomb < 0;
      case 'blocker': return WORKERS.has(l.state) && this.terrain.solid(l.x, l.y + 1);
      case 'builder': return (WORKERS.has(l.state) && l.state !== 'building') || (l.state === 'building' && l.bricks <= 3);
      case 'basher': return WORKERS.has(l.state) && l.state !== 'bashing';
      case 'miner': return WORKERS.has(l.state) && l.state !== 'mining';
      case 'digger': return WORKERS.has(l.state) && l.state !== 'digging';
    }
    return false;
  }

  assign(l, skill) {
    if (!this.canAssign(l, skill)) return false;
    this.skills[skill]--;
    this.used++;
    switch (skill) {
      case 'climber': l.climber = true; break;
      case 'floater': l.floater = true; break;
      case 'bomber': l.bomb = BOMB_TICKS; break;
      case 'blocker': this.setState(l, 'blocking'); break;
      case 'builder': this.setState(l, 'building'); l.bricks = BRICKS; break;
      case 'basher': this.setState(l, 'bashing'); break;
      case 'miner': this.setState(l, 'mining'); break;
      case 'digger': this.setState(l, 'digging'); break;
    }
    this.emit('assign', { skill, id: l.id });
    return true;
  }

  // Bestiole sous le point (x, y), en préférant celles qui peuvent recevoir la compétence
  lemAt(x, y, skill, slack = 3) {
    let best = null, bestScore = Infinity;
    for (const l of this.lems) {
      if (l.state === 'dead' || l.state === 'saved') continue;
      const dx = Math.abs(x - l.x), cy = l.y - LEM_H / 2;
      if (dx > 5 + slack || y < l.y - LEM_H - 2 - slack || y > l.y + 2 + slack) continue;
      const ok = skill ? this.canAssign(l, skill) : true;
      const score = Math.hypot(x - l.x, (y - cy) * 0.6) + (ok ? 0 : 1000);
      if (score < bestScore) { bestScore = score; best = l; }
    }
    return best;
  }

  setState(l, s) { l.state = s; l.frame = 0; }

  // ----- boucle -----

  tick() {
    if (this.done) return;
    this.tickCount++;
    if (this.opening > 0) {
      this.opening--;
      if (this.opening === 0) this.emit('sound', { name: 'open' });
      return;
    }
    this.timeLeft--;

    // apparition
    if (!this.nuking && this.out < this.total) {
      if (this.spawnTimer <= 0) {
        const e = this.entrances[this.nextEntrance % this.entrances.length];
        this.nextEntrance++;
        const l = new Lem(e.x, e.y, e.dir);
        this.lems.push(l);
        this.out++;
        this.spawnTimer = releaseInterval(this.rr);
        this.emit('spawn', { x: e.x, y: e.y });
      }
      this.spawnTimer--;
    }

    // armageddon : une bombe par tick
    if (this.nuking) {
      while (this.nukeIndex < this.lems.length) {
        const l = this.lems[this.nukeIndex++];
        if (!DYING.has(l.state) && l.bomb < 0) { l.bomb = BOMB_TICKS; break; }
      }
    }

    for (const t of this.traps) { if (t.cool > 0) t.cool--; t.anim++; }

    this.blockers = this.lems.filter((l) => l.state === 'blocking');
    for (const l of this.lems) {
      if (l.state === 'dead' || l.state === 'saved') continue;
      l.anim++;
      this.update(l);
    }

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finish('time');
    } else if ((this.out >= this.total || this.nuking) && this.opening === 0 && this.lems.every((l) => l.state === 'dead' || l.state === 'saved' || (l.state === 'blocking' && l.bomb < 0))) {
      this.finish('end');
    }
  }

  finish(reason) {
    if (this.done) return;
    this.done = true;
    this.reason = reason;
    this.emit('end', { reason });
  }

  // Le pas suivant entre-t-il dans le champ d'un bloqueur (en allant vers lui) ?
  blocked(l, nx) {
    for (const b of this.blockers) {
      if (b === l) continue;
      if (Math.abs(nx - b.x) <= BLOCK_R && Math.abs(l.x - b.x) > 0 && l.y >= b.y - 12 && l.y <= b.y + 8 && (b.x - l.x) * l.dir > 0) return true;
    }
    return false;
  }

  kill(l, state) {
    this.setState(l, state);
    const sounds = { splatting: 'splat', drowning: 'drown', burning: 'burn', crushed: 'crush' };
    if (sounds[state]) this.emit('sound', { name: sounds[state] });
    this.emit(state, { x: l.x, y: l.y });
  }

  checkSurroundings(l) {
    const T = this.terrain;
    if (l.y > T.h + 24) { this.setState(l, 'dead'); this.dead++; this.emit('sound', { name: 'fallout' }); return true; }
    for (const e of this.exits) {
      if (Math.abs(l.x - e.x) <= 3 && l.y >= e.y - 10 && l.y <= e.y + 1 && l.state !== 'blocking') {
        this.setState(l, 'exiting');
        l.x = e.x;
        this.emit('sound', { name: 'yippee' });
        return true;
      }
    }
    for (const h of this.hazards) {
      if (l.x >= h.x && l.x < h.x + h.w && l.y >= h.y + 3 && l.y < h.y + h.h + 6) {
        this.kill(l, h.t === 'lava' ? 'burning' : 'drowning');
        return true;
      }
    }
    for (const t of this.traps) {
      if (t.t === 'fire') {
        if (l.x >= t.x && l.x < t.x + t.w && l.y >= t.y && l.y < t.y + t.h + 2) { this.kill(l, 'burning'); return true; }
      } else if (t.cool === 0 && Math.abs(l.x - t.x) <= 5 && l.y >= t.y - 14 && l.y <= t.y + 1) {
        t.cool = 50; t.anim = 0;
        this.kill(l, 'crushed');
        l.x = t.x;
        return true;
      }
    }
    return false;
  }

  explode(l) {
    const T = this.terrain;
    T.erase(l.x, l.y - 5, 14, 16, { x0: 0, y0: 0, x1: T.w - 1, y1: T.h - 1 });
    this.setState(l, 'dead');
    this.dead++;
    this.emit('explode', { x: l.x, y: l.y - 6 });
    this.emit('sound', { name: 'boom' });
  }

  // Descend d'au plus STEP_DOWN si le sol est proche ; sinon commence à tomber. Renvoie false si chute.
  followGround(l) {
    const T = this.terrain;
    if (T.solid(l.x, l.y + 1)) return true;
    for (let k = 1; k <= STEP_DOWN; k++) {
      if (T.solid(l.x, l.y + 1 + k)) { l.y += k; return true; }
    }
    l.y += STEP_DOWN;
    this.setState(l, 'falling');
    l.fall = STEP_DOWN;
    return false;
  }

  update(l) {
    const T = this.terrain;

    // compte à rebours de la bombe
    if (l.bomb > 0 && !DYING.has(l.state)) {
      l.bomb--;
      if (l.bomb === 0) {
        if (l.state === 'falling' || l.state === 'floating' || l.state === 'climbing' || l.state === 'hoisting') { this.explode(l); return; }
        this.setState(l, 'ohno');
        this.emit('sound', { name: 'ohno' });
      }
    }

    if (!DYING.has(l.state) && this.checkSurroundings(l)) return;

    switch (l.state) {
      case 'falling': {
        for (let i = 0; i < FALL_SPEED; i++) {
          if (T.solid(l.x, l.y + 1)) {
            if (l.fall > SPLAT_DIST) this.kill(l, 'splatting');
            else this.setState(l, 'walking');
            return;
          }
          l.y++;
          l.fall++;
        }
        if (l.floater && l.fall > FLOAT_OPEN) { this.setState(l, 'floating'); this.emit('sound', { name: 'umbrella' }); }
        break;
      }
      case 'floating': {
        l.frame++;
        const n = l.frame % 2 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          if (T.solid(l.x, l.y + 1)) { this.setState(l, 'walking'); return; }
          l.y++;
        }
        break;
      }
      case 'walking': this.walk(l); break;
      case 'shrugging':
        l.frame++;
        if (!T.solid(l.x, l.y + 1)) { this.followGround(l); if (l.state === 'falling') return; }
        if (l.frame >= 14) this.setState(l, 'walking');
        break;
      case 'climbing': {
        l.frame++;
        if (l.frame % 3 === 0) break;
        if (l.y - LEM_H < 0 || T.solid(l.x, l.y - LEM_H)) { // tête cognée : il lâche prise
          l.dir = -l.dir;
          if (!T.solid(l.x + l.dir, l.y)) l.x += l.dir;
          this.setState(l, 'falling');
          l.fall = 0;
          break;
        }
        l.y--;
        if (!T.solid(l.x + l.dir, l.y)) this.setState(l, 'hoisting');
        break;
      }
      case 'hoisting':
        l.frame++;
        if (l.frame >= 8) {
          if (!T.solid(l.x + l.dir, l.y)) l.x += l.dir;
          this.setState(l, 'walking');
        }
        break;
      case 'building': this.build(l); break;
      case 'bashing': this.bash(l); break;
      case 'mining': this.mine(l); break;
      case 'digging': this.dig(l); break;
      case 'blocking':
        if (!T.solid(l.x, l.y + 1)) { this.setState(l, 'falling'); l.fall = 0; }
        break;
      case 'ohno':
        l.frame++;
        for (let i = 0; i < FALL_SPEED && !T.solid(l.x, l.y + 1); i++) l.y++;
        if (l.frame >= 18) this.explode(l);
        break;
      case 'splatting': case 'drowning': case 'burning': case 'crushed':
        l.frame++;
        if (l.frame >= 20) { this.setState(l, 'dead'); this.dead++; }
        break;
      case 'exiting':
        l.frame++;
        if (l.frame >= 15) { this.setState(l, 'saved'); this.saved++; this.emit('saved', { x: l.x, y: l.y }); }
        break;
    }
  }

  walk(l) {
    const T = this.terrain;
    if (!T.solid(l.x, l.y + 1)) { // le sol a disparu
      if (!this.followGround(l)) return;
    }
    const nx = l.x + l.dir;
    if (this.blocked(l, nx)) { l.dir = -l.dir; return; }
    if (T.solid(nx, l.y)) {
      let k = 1;
      while (k <= STEP_UP && T.solid(nx, l.y - k)) k++;
      if (k <= STEP_UP) { l.x = nx; l.y -= k; return; }
      if (l.climber && nx >= 0 && nx < T.w) { this.setState(l, 'climbing'); return; }
      l.dir = -l.dir;
      return;
    }
    l.x = nx;
    this.followGround(l);
  }

  // Le passage vers l'avant est-il libre pour un bâtisseur ?
  build(l) {
    const T = this.terrain;
    if (!T.solid(l.x, l.y + 1)) { this.setState(l, 'falling'); l.fall = 0; return; }
    l.frame++;
    const c = l.frame % 16;
    if (c === 9) {
      const xa = l.dir > 0 ? l.x - 1 : l.x - BRICK_W + 2;
      const xb = xa + BRICK_W - 1;
      T.fillRect(xa, l.y - 1, xb, l.y);
      this.emit('brick', { x0: xa, y0: l.y - 1, x1: xb, y1: l.y, dir: l.dir });
      this.emit('sound', { name: l.bricks <= 3 ? 'brickLow' : 'brick' });
    } else if (c === 15) {
      l.bricks--;
      // monter sur la brique puis avancer
      if (T.solid(l.x, l.y - LEM_H) || T.solid(l.x, l.y - 1 - LEM_H)) { l.dir = -l.dir; this.setState(l, 'walking'); return; }
      l.y -= 2;
      for (let s = 0; s < 4; s++) {
        const nx = l.x + l.dir;
        if (T.solid(nx, l.y) || T.solid(nx, l.y - LEM_H + 3) || this.blocked(l, nx)) {
          l.dir = -l.dir;
          this.setState(l, 'walking');
          return;
        }
        l.x = nx;
      }
      if (l.bricks <= 0) this.setState(l, 'shrugging');
    }
  }

  bash(l) {
    const T = this.terrain;
    if (!this.followGround(l)) return;
    l.frame++;
    if (l.frame % 2) return;
    const d = l.dir;
    const clipFwd = (from, to) => ({ x0: Math.min(l.x + d * from, l.x + d * to), x1: Math.max(l.x + d * from, l.x + d * to), y0: l.y - LEM_H - 1, y1: l.y });
    // acier ou sens interdit juste devant
    if (T.blockedIn(l.x + d * 6, l.y - 8, 7, 9.5, clipFwd(1, 7), d)) {
      this.setState(l, 'walking');
      this.emit('sound', { name: 'ting' });
      return;
    }
    // plus rien à creuser devant
    const ahead = clipFwd(1, 12);
    if (l.frame > 2 && !T.anyIn(ahead.x0, l.y - 13, ahead.x1, l.y - 1, (v) => v !== EMPTY && !Terrain.hard(v, d))) {
      this.setState(l, 'walking');
      return;
    }
    let n = T.erase(l.x + d * 6, l.y - 8, 7, 9.5, clipFwd(1, 13));
    const near = clipFwd(1, 4);
    n += T.eraseRect(near.x0, l.y - 12, near.x1, l.y);
    if (n) this.emit('dig', { x: l.x + d * 6, y: l.y - 6, dir: d });
    if (this.blocked(l, l.x + d)) { l.dir = -d; this.setState(l, 'walking'); return; }
    if (!T.solid(l.x + d, l.y)) l.x += d;
    else if (l.frame > 4) { this.setState(l, 'walking'); return; }
  }

  mine(l) {
    const T = this.terrain;
    if (!T.solid(l.x, l.y + 1)) { if (!this.followGround(l)) return; }
    l.frame++;
    if (l.frame % 5) return;
    const d = l.dir;
    const nx = l.x + d * 2, ny = l.y + 1;
    const clip = { x0: Math.min(nx - d * 2, nx + d * 10), x1: Math.max(nx - d * 2, nx + d * 10), y0: ny - LEM_H - 1, y1: ny };
    if (T.blockedIn(nx + d * 3, ny - 7, 7, 9.5, clip, d) || this.blocked(l, nx)) {
      if (this.blocked(l, nx)) l.dir = -d;
      this.setState(l, 'walking');
      this.emit('sound', { name: 'ting' });
      return;
    }
    const n = T.erase(nx + d * 3, ny - 7, 7, 9.5, clip);
    if (n) this.emit('dig', { x: nx + d * 4, y: ny - 3, dir: d });
    l.x = nx;
    l.y = ny;
    this.followGround(l);
  }

  dig(l) {
    const T = this.terrain;
    l.frame++;
    if (l.frame % 4) {
      if (!T.solid(l.x, l.y + 1) && !T.solid(l.x - 1, l.y + 1) && !T.solid(l.x + 1, l.y + 1)) { this.setState(l, 'falling'); l.fall = 0; }
      return;
    }
    const x0 = l.x - 4, x1 = l.x + 4;
    if (T.anyIn(x0, l.y + 1, x1, l.y + 2, (v) => v === STEEL)) {
      this.setState(l, 'walking');
      this.emit('sound', { name: 'ting' });
      return;
    }
    if (!T.anyIn(x0, l.y + 1, x1, l.y + 2, (v) => v !== EMPTY)) { this.setState(l, 'falling'); l.fall = 0; return; }
    T.eraseRect(x0, l.y - 1, x1, l.y + 2);
    this.emit('dig', { x: l.x, y: l.y + 2, dir: 0 });
    l.y += 2;
    if (!T.solid(l.x, l.y + 1) && !T.anyIn(x0, l.y + 1, x1, l.y + 3, (v) => v !== EMPTY)) { this.setState(l, 'falling'); l.fall = 0; }
  }
}
