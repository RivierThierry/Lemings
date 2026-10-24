// Rendu : ciel et décors en parallaxe, terrain texturé, objets, particules.
import { shapeOf, EMPTY, DIRT, STEEL, OW_LEFT, OW_RIGHT } from './engine.js';
import { drawLem } from './sprites.js';

export const RS = 2; // résolution du dessin du terrain (pixels par pixel du monde)

export const THEMES = {
  prairie: {
    sky: ['#5bb8ff', '#a8dcff', '#fff1cf'], sun: '#fff6c2', far: ['mountains', '#a9c8e6'], mid: ['hills', '#7fbf6e'], near: ['hills', '#5a9e52'],
    dirt: ['#a06c3c', '#7e5029', '#c08a52'], top: ['#7be35f', '#3fae3f'], topDepth: 10, pebble: '#c9a274', steel: '#8f9bb3',
    brick: '#f0a85e', tuft: 'grass', ambient: 'clouds', water: ['#4ec3ff', '#1b6fd1'], accent: '#3fd6c0',
  },
  desert: {
    sky: ['#ff9f5a', '#ffd08a', '#fff2cc'], sun: '#fff0a8', far: ['mesas', '#e7a46b'], mid: ['dunes', '#e9b977'], near: ['dunes', '#d99f5c'],
    dirt: ['#e3b46c', '#c8954f', '#f2cf8d'], top: ['#fbe0a1', '#efc77c'], topDepth: 7, pebble: '#b8834a', steel: '#9c9aa8',
    brick: '#d9734a', tuft: 'pebbles', ambient: 'dust', water: ['#3fd0e6', '#1586b0'], accent: '#e05a9a', strata: 0.12,
  },
  glace: {
    sky: ['#06142e', '#17375f', '#4f86b8'], stars: true, aurora: true, moon: '#e6f3ff', far: ['peaks', '#2b4f7a'], mid: ['peaks', '#3f6c99'], near: ['hills', '#7fa9cf'],
    dirt: ['#a6cbea', '#7ea7cf', '#cfe6f8'], top: ['#ffffff', '#dceeff'], topDepth: 9, pebble: '#e8f6ff', steel: '#8d9bb8',
    brick: '#8fd0ff', tuft: 'snow', ambient: 'snow', speckle: 0.18, water: ['#7fd6ff', '#2a7fc0'], accent: '#ff7ad1', cracks: '#eaf7ff',
  },
  volcan: {
    sky: ['#12070a', '#3a1015', '#8a2a14'], far: ['volcano', '#2a1418'], mid: ['peaks', '#341a1d'], near: ['hills', '#40211f'],
    dirt: ['#4d3c40', '#382b2f', '#62504f'], top: ['#7e5f55', '#5d4542'], topDepth: 5, pebble: '#2a1f22', steel: '#7f8494',
    brick: '#b8573a', tuft: 'embers', ambient: 'embers', water: ['#ffb12e', '#e0361a'], accent: '#ffcc33', cracks: '#ff7a2a', glow: true,
  },
  cristal: {
    sky: ['#0d0620', '#221047', '#3f1f73'], stars: true, far: ['spires', '#2a1656'], mid: ['spires', '#3a2170'], near: ['hills', '#4a2c86'], ceiling: '#1a0d36',
    dirt: ['#5c3f92', '#45307a', '#7656ad'], top: ['#c69cff', '#915ef2'], topDepth: 6, pebble: '#9de8ff', steel: '#8b8fb0',
    brick: '#e6b5ff', tuft: 'crystals', ambient: 'sparkles', water: ['#5ff0ff', '#1b8fd1'], accent: '#5ff0d0', gems: true,
  },
  bonbon: {
    sky: ['#ff9fd6', '#ffd0ec', '#fff3fa'], sun: '#ffffff', far: ['cupcakes', '#f7b6dc'], mid: ['lollipops', '#ff9fcf'], near: ['hills', '#ff86c0'],
    dirt: ['#a8613f', '#8a4b2e', '#c27a52'], top: ['#fff7fb', '#ffd6ea'], topDepth: 11, pebble: '#ff5c9d', steel: '#b4b8d6',
    brick: '#ffe08a', tuft: 'sprinkles', ambient: 'sprinkles', water: ['#ff9de0', '#d14fa8'], accent: '#7fe0ff', cake: true,
  },
  nuit: {
    sky: ['#030816', '#0b1a38', '#1f3864'], stars: true, moon: '#fff8d8', far: ['mountains', '#14284a'], mid: ['pines', '#0f2a2a'], near: ['pines', '#0c2222'],
    dirt: ['#4c4a3f', '#38362d', '#5d5a4c'], top: ['#3f9a55', '#2b733e'], topDepth: 8, pebble: '#77735f', steel: '#6f7a90',
    brick: '#c9915a', tuft: 'grass', ambient: 'fireflies', water: ['#4aa8ff', '#173f91'], accent: '#9fff6a',
  },
};

// ---------- Couleurs ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Bruit de valeur pavable 256x256
const NOISE = (() => {
  const N = 256, base = new Float32Array(N * N), out = new Float32Array(N * N);
  let s = 12345;
  const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const g = 16, grid = new Float32Array(g * g);
  for (let i = 0; i < g * g; i++) grid[i] = r();
  for (let i = 0; i < N * N; i++) base[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = (x / N) * g, gy = (y / N) * g;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = sm(gx - x0), fy = sm(gy - y0);
    const a = grid[(y0 % g) * g + (x0 % g)], b = grid[(y0 % g) * g + ((x0 + 1) % g)];
    const c = grid[((y0 + 1) % g) * g + (x0 % g)], d = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
    out[y * N + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  return { smooth: out, white: base };
})();
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- Terrain ----------

function shapePath(s) {
  const p = new Path2D();
  if (s.kind === 'rect') p.rect(s.x, s.y, s.w, s.h);
  else if (s.kind === 'ellipse') p.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
  else {
    p.moveTo(s.pts[0], s.pts[1]);
    for (let i = 2; i < s.pts.length; i += 2) p.lineTo(s.pts[i], s.pts[i + 1]);
    p.closePath();
  }
  return p;
}

export class TerrainView {
  constructor(def, terrain) {
    this.def = def;
    this.T = terrain;
    this.th = THEMES[def.theme] || THEMES.prairie;
    this.canvas = document.createElement('canvas');
    this.canvas.width = def.w * RS;
    this.canvas.height = def.h * RS;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.rim = new Uint8Array(def.w * def.h);
    this.version = 0;
    this.build();
  }

  build() {
    const { def, T, th, ctx } = this;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.scale(RS, RS);
    ctx.fillStyle = '#fff';
    for (const p of def.terrain) {
      const path = shapePath(shapeOf(p, def.h));
      ctx.globalCompositeOperation = p.cut ? 'destination-out' : 'source-over';
      ctx.fill(path);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) solid[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    // distances aux bords (en pixels de dessin)
    const dTop = new Uint8Array(W * H), dBot = new Uint8Array(W * H), dSide = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) {
      let run = 0;
      for (let y = 0; y < H; y++) { const i = y * W + x; run = solid[i] ? Math.min(255, run + 1) : 0; dTop[i] = run; }
      run = 0;
      for (let y = H - 1; y >= 0; y--) { const i = y * W + x; run = solid[i] ? Math.min(255, run + 1) : 0; dBot[i] = run; }
    }
    for (let y = 0; y < H; y++) {
      let run = 0;
      const row = y * W;
      for (let x = 0; x < W; x++) { run = solid[row + x] ? Math.min(255, run + 1) : 0; dSide[row + x] = run; }
      run = 0;
      for (let x = W - 1; x >= 0; x--) { run = solid[row + x] ? Math.min(255, run + 1) : 0; dSide[row + x] = Math.min(dSide[row + x], run); }
    }
    // bas du niveau : pas d'ombre sur le bord inférieur de la carte
    const dirt = th.dirt.map(hex), top = th.top.map(hex), peb = hex(th.pebble), steel = hex(th.steel);
    const acc = hex(th.accent), crack = th.cracks ? hex(th.cracks) : null;
    const tw = T.w, sm = NOISE.smooth, wn = NOISE.white;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        if (!d[o + 3]) continue;
        let m = T.m[(y >> 1) * tw + (x >> 1)];
        if (m === EMPTY) m = DIRT;
        const n1 = sm[(x & 255) + ((y & 255) << 8)];
        const n2 = sm[((x >> 2) & 255) + (((y >> 2) & 255) << 8)];
        const nw = wn[(x & 255) + ((y & 255) << 8)];
        let c;
        const dt = dTop[i], db = y + (dBot[i]) >= H ? 255 : dBot[i], ds = dSide[i];
        if (m === STEEL) {
          const px = x & 31, py = y & 31;
          const k = 0.85 + (py / 32) * -0.18 + nw * 0.05;
          c = [steel[0] * k, steel[1] * k, steel[2] * k];
          if (px < 2 || py < 2) c = mix(c, [255, 255, 255], 0.35);
          else if (px > 29 || py > 29) c = mix(c, [20, 20, 40], 0.35);
          for (const [rx, ry] of [[6, 6], [25, 6], [6, 25], [25, 25]]) {
            const dd = (px - rx) ** 2 + (py - ry) ** 2;
            if (dd < 5) c = mix(c, dd < 2 ? [255, 255, 255] : [60, 64, 80], 0.6);
          }
        } else {
          c = mix(dirt[1], dirt[0], n2);
          const sp = th.speckle ?? 0.5;
          if (nw > 0.82) c = mix(c, dirt[2], sp);
          else if (nw < 0.1) c = mix(c, dirt[1], sp * 1.2);
          const band = Math.sin((y + n2 * 40) * 0.07) * (th.strata ?? 0.05);
          c = [c[0] * (1 + band), c[1] * (1 + band), c[2] * (1 + band)];
          if (th.cake) { // couches de gâteau avec crème
            const yy = (y + Math.floor(n2 * 6)) % 46;
            if (yy < 7) c = mix(c, [255, 236, 214], 0.85);
          }
          // cailloux
          const cs = 22, cx = Math.floor(x / cs), cy = Math.floor(y / cs), h = hash(cx, cy);
          if (h < 0.32) {
            const px = cx * cs + 4 + hash(cx + 7, cy) * (cs - 8), py = cy * cs + 4 + hash(cx, cy + 9) * (cs - 8);
            const r = 2 + hash(cx + 3, cy + 5) * 3.5;
            const dd = ((x - px) ** 2) / (r * r * 1.4) + ((y - py) ** 2) / (r * r);
            if (dd < 1) c = mix(peb, [255, 255, 255], dd < 0.3 && x < px && y < py ? 0.35 : 0) , c = dd > 0.7 ? mix(c, [0, 0, 0], 0.25) : c;
          }
          if (crack && Math.abs(n2 - 0.5) < 0.012 + n1 * 0.006) c = th.glow ? mix(c, crack, 0.85) : mix(c, crack, 0.5);
          if (th.gems) {
            const gs = 40, gx = Math.floor(x / gs), gy = Math.floor(y / gs), gh = hash(gx + 11, gy + 3);
            if (gh < 0.22) {
              const px = gx * gs + 20, py = gy * gs + 20, u = x - px, v = y - py;
              if (Math.abs(u) * 1.8 + Math.abs(v) < 9) c = mix([150, 240, 255], [255, 255, 255], Math.max(0, -u - v) / 12);
            }
          }
          if (m === OW_LEFT || m === OW_RIGHT) {
            c = mix(c, acc, 0.35);
            const cs2 = 26, u = ((x % cs2) / cs2), v = ((y % cs2) / cs2);
            const uu = m === OW_RIGHT ? u : 1 - u;
            const ch = uu - (0.62 - Math.abs(v - 0.5) * 1.1);
            if (ch > 0 && ch < 0.2) c = mix(c, [255, 255, 255], 0.55);
          }
          // croûte du dessus (herbe, neige, glaçage…)
          const depth = th.topDepth + Math.floor(sm[((x >> 1) & 255) + 77 * 256] * 6) - 2;
          if (dt <= depth && (m === DIRT)) {
            c = mix(top[0], top[1], Math.min(1, dt / depth) * 0.9 + nw * 0.1);
            if (th.tuft === 'sprinkles' && nw > 0.94) c = hex(['#ff4d6d', '#4dd2ff', '#ffe14d', '#7cff6b'][(x * 7 + y * 3) & 3]);
            if (dt <= 2) c = mix(c, [255, 255, 255], 0.25);
          } else if (dt <= depth + 5 && m === DIRT) {
            c = mix(c, [0, 0, 0], 0.18);
          }
        }
        if (db <= 8) c = mix(c, [0, 0, 0], 0.45 * (1 - db / 9));
        if (ds <= 3) c = mix(c, [0, 0, 0], 0.15 * (1 - ds / 4));
        if (m !== STEEL && dt <= 1 && th.tuft !== 'snow') c = mix(c, [255, 255, 255], 0.2);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
        if (d[o + 3] > 110) d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // bords déjà exposés : jamais assombris par les creusements
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
      const i = y * T.w + x;
      if (T.m[i] && (!T.m[i - 1] || !T.m[i + 1] || !T.m[i - T.w] || !T.m[i + T.w])) this.rim[i] = 1;
    }
    this.tufts(solid, W, H);
  }

  // petites touffes sur le dessus du terrain
  tufts(solid, W, H) {
    const { ctx, th } = this;
    const type = th.tuft;
    for (let x = 2; x < W - 2; x += 3) {
      for (let y = 1; y < H; y++) {
        const i = y * W + x;
        if (!solid[i] || solid[i - W]) continue;
        const m = this.T.m[(y >> 1) * this.T.w + (x >> 1)];
        if (m !== DIRT) continue;
        const h = hash(x, y);
        if (type === 'grass' && h < 0.75) {
          ctx.strokeStyle = h < 0.3 ? th.top[0] : th.top[1];
          ctx.lineWidth = 1.4;
          const len = 3 + h * 7;
          ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x + (h - 0.4) * 4, y - len * 0.6, x + (h - 0.5) * 6, y - len); ctx.stroke();
          if (h < 0.025) { // fleurette
            ctx.fillStyle = ['#ff6b9d', '#fff35c', '#ffffff', '#b28dff'][Math.floor(h * 160) % 4];
            ctx.beginPath(); ctx.arc(x + (h - 0.5) * 6, y - len, 2.2, 0, Math.PI * 2); ctx.fill();
          }
        } else if (type === 'snow' && h < 0.5) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(x, y + 1, 3 + h * 4, 1.5 + h * 2, 0, Math.PI, 0); ctx.fill();
        } else if (type === 'crystals' && h < 0.06) {
          ctx.fillStyle = h < 0.03 ? '#9de8ff' : '#e0a8ff';
          const hh = 6 + h * 120;
          ctx.beginPath(); ctx.moveTo(x - 2.5, y + 1); ctx.lineTo(x, y - hh); ctx.lineTo(x + 2.5, y + 1); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x, y - hh); ctx.lineTo(x, y); ctx.fill();
        } else if (type === 'pebbles' && h < 0.05) {
          ctx.fillStyle = th.pebble;
          ctx.beginPath(); ctx.ellipse(x, y, 2 + h * 30, 1.5 + h * 15, 0, Math.PI, 0); ctx.fill();
        } else if (type === 'sprinkles' && h < 0.04) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(x, y + 1, 4, 3 + h * 40, 0, 0, Math.PI); ctx.fill();
        }
        break;
      }
    }
  }

  // briques posées par une bâtisseuse
  drawBrick(b) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    const x = b.x0 * RS, y = b.y0 * RS, w = (b.x1 - b.x0 + 1) * RS, h = (b.y1 - b.y0 + 1) * RS;
    ctx.fillStyle = this.th.brick;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x, y, w, 1);
    ctx.restore();
    this.version++;
  }

  // recopie les changements du masque (creusements) dans le dessin
  sync(changes) {
    if (!changes.length) return;
    const T = this.T, ctx = this.ctx;
    for (const [ax, ay, bx, by] of changes) {
      const x0 = Math.max(0, ax), y0 = Math.max(0, ay), x1 = Math.min(T.w - 1, bx), y1 = Math.min(T.h - 1, by);
      if (x1 < x0 || y1 < y0) continue;
      const w = (x1 - x0 + 1) * RS, h = (y1 - y0 + 1) * RS;
      const img = ctx.getImageData(x0 * RS, y0 * RS, w, h);
      const d = img.data;
      for (let wy = y0; wy <= y1; wy++) {
        for (let wx = x0; wx <= x1; wx++) {
          const i = wy * T.w + wx, m = T.m[i];
          let mode = 0; // 0 rien, 1 effacer, 2 assombrir (nouveau bord)
          if (m === EMPTY) mode = 1;
          else if (!this.rim[i] && (T.get(wx - 1, wy) === EMPTY || T.get(wx + 1, wy) === EMPTY || T.get(wx, wy - 1) === EMPTY || T.get(wx, wy + 1) === EMPTY)) {
            mode = 2;
            this.rim[i] = 1;
          }
          if (!mode) continue;
          for (let sy = 0; sy < RS; sy++) for (let sx = 0; sx < RS; sx++) {
            const o = (((wy - y0) * RS + sy) * w + (wx - x0) * RS + sx) * 4;
            if (mode === 1) d[o + 3] = 0;
            else { d[o] *= 0.62; d[o + 1] *= 0.62; d[o + 2] *= 0.62; }
          }
        }
      }
      ctx.putImageData(img, x0 * RS, y0 * RS);
    }
    changes.length = 0;
    this.version++;
  }
}

// ---------- Ciel et décor de fond ----------

function periodic(x, W, terms) {
  let v = 0;
  for (const [k, a, ph] of terms) v += a * Math.sin((2 * Math.PI * k * x) / W + ph);
  return v;
}

function makeLayer(type, color, h, seed) {
  const W = 1600;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Math.max(4, Math.ceil(h));
  const ctx = cv.getContext('2d');
  const r = (i) => hash(seed * 31 + i, seed);
  const terms = [1, 2, 3, 5, 8, 13].map((k, i) => [k, (0.5 / (i + 1)) * (0.6 + r(i)), r(i + 10) * 6.28]);
  ctx.fillStyle = color;
  const top = (x) => {
    const v = periodic(x, W, terms);
    switch (type) {
      case 'mountains': case 'peaks': {
        const ridge = 1 - Math.abs(Math.sin((2 * Math.PI * 7 * x) / W + r(1) * 6)) ** 0.7;
        return h * (0.55 - v * 0.35 - ridge * (type === 'peaks' ? 0.45 : 0.25));
      }
      case 'mesas': { const q = Math.round(v * 3) / 3; return h * (0.5 - q * 0.3); }
      case 'dunes': return h * (0.55 - v * 0.25 - Math.sin((2 * Math.PI * 9 * x) / W) * 0.05);
      case 'volcano': {
        const cx = W * 0.35, dx = Math.abs(x - cx) / W;
        const cone = Math.max(0, 1 - dx * 4.5);
        return h * (0.85 - cone * 0.75 - v * 0.1) + (dx < 0.025 ? h * 0.1 : 0);
      }
      default: return h * (0.6 - v * 0.25);
    }
  };
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, top(x));
  ctx.lineTo(W, h);
  ctx.closePath();
  ctx.fill();
  // éléments posés sur la ligne
  const n = { pines: 70, spires: 26, cupcakes: 14, lollipops: 16 }[type] || 0;
  for (let i = 0; i < n; i++) {
    const x = (i + r(i + 40) * 0.8) * (W / n), y = top(x) + 4;
    const s = 0.5 + r(i + 80);
    ctx.fillStyle = color;
    if (type === 'pines') {
      const hh = h * 0.35 * s;
      ctx.beginPath(); ctx.moveTo(x - hh * 0.28, y); ctx.lineTo(x, y - hh); ctx.lineTo(x + hh * 0.28, y); ctx.fill();
    } else if (type === 'spires') {
      const hh = h * 0.6 * s;
      ctx.beginPath(); ctx.moveTo(x - hh * 0.12, y); ctx.lineTo(x - hh * 0.02, y - hh); ctx.lineTo(x + hh * 0.12, y); ctx.fill();
      ctx.fillStyle = 'rgba(200,160,255,0.18)';
      ctx.beginPath(); ctx.moveTo(x - hh * 0.02, y - hh); ctx.lineTo(x + hh * 0.12, y); ctx.lineTo(x + hh * 0.02, y); ctx.fill();
    } else if (type === 'cupcakes') {
      const rr = h * 0.12 * s;
      ctx.beginPath(); ctx.arc(x, y - rr, rr * 1.3, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - rr * 2.1, rr * 0.35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,80,120,0.5)'; ctx.fill();
    } else if (type === 'lollipops') {
      const hh = h * 0.45 * s;
      ctx.fillRect(x - 1.5, y - hh, 3, hh);
      ctx.beginPath(); ctx.arc(x, y - hh, hh * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - hh, hh * 0.12, 0, Math.PI * 1.5); ctx.stroke();
    }
  }
  // liseré de lumière en haut
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, h);
  return cv;
}

export class Backdrop {
  constructor(themeName) {
    this.th = THEMES[themeName] || THEMES.prairie;
    this.name = themeName;
    this.w = 0; this.h = 0;
    this.amb = [];
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const th = this.th;
    this.sky = document.createElement('canvas');
    this.sky.width = 4; this.sky.height = Math.max(4, h);
    const c = this.sky.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.55, th.sky[1]); g.addColorStop(1, th.sky[2]);
    c.fillStyle = g; c.fillRect(0, 0, 4, h);
    this.layers = [
      { cv: makeLayer(th.far[0], th.far[1], h * 0.5, 3), f: 0.12, a: 0.85 },
      { cv: makeLayer(th.mid[0], th.mid[1], h * 0.36, 7), f: 0.25, a: 0.75 },
      { cv: makeLayer(th.near[0], th.near[1], h * 0.22, 11), f: 0.42, a: 0.55 },
    ];
    this.stars = [];
    if (th.stars) for (let i = 0; i < 140; i++) this.stars.push([hash(i, 1) * w, hash(i, 2) * h * 0.7, 0.4 + hash(i, 3) * 1.4, hash(i, 4) * 6]);
    const n = { clouds: 7, snow: 90, embers: 60, sparkles: 50, sprinkles: 45, fireflies: 35, dust: 40 }[th.ambient] || 0;
    this.amb = Array.from({ length: n }, (_, i) => ({ x: hash(i, 7) * w, y: hash(i, 8) * h, s: hash(i, 9), p: hash(i, 10) * 6.28 }));
  }

  draw(ctx, camX, zoom, t) {
    const { w, h, th } = this;
    ctx.drawImage(this.sky, 0, 0, w, h);
    for (const [x, y, r, p] of this.stars) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.0015 + p));
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
    if (th.aurora) {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 20) {
          const y = h * (0.18 + k * 0.07) + Math.sin(x * 0.004 + t * 0.0004 * (k + 1) + k) * h * 0.05;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = ['rgba(90,255,180,0.18)', 'rgba(120,200,255,0.14)', 'rgba(255,120,220,0.1)'][k];
        ctx.lineWidth = h * 0.06;
        ctx.stroke();
      }
    }
    if (th.sun || th.moon) {
      const x = w * 0.78, y = h * 0.2, r = Math.min(w, h) * 0.07;
      const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3);
      g.addColorStop(0, th.sun ? 'rgba(255,250,210,0.55)' : 'rgba(255,255,230,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = th.sun || th.moon; ctx.fill();
      if (th.moon) { ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.15, r * 0.85, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,20,50,0.25)'; ctx.fill(); }
    }
    for (const L of this.layers) {
      const cw = L.cv.width;
      let ox = -((camX * zoom * L.f) % cw);
      if (ox > 0) ox -= cw;
      ctx.globalAlpha = L.a;
      for (let x = ox; x < w; x += cw) ctx.drawImage(L.cv, x, h - L.cv.height);
    }
    ctx.globalAlpha = 1;
    this.drawAmbient(ctx, camX * zoom, t);
  }

  drawAmbient(ctx, cx, t) {
    const { w, h, th } = this;
    const T = t / 1000;
    for (const a of this.amb) {
      switch (th.ambient) {
        case 'clouds': {
          const x = ((a.x - cx * 0.08 + T * (6 + a.s * 10)) % (w + 300) + w + 300) % (w + 300) - 150;
          const y = a.y * 0.45, s = 30 + a.s * 50;
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.ellipse(x, y, s, s * 0.35, 0, 0, Math.PI * 2);
          ctx.ellipse(x - s * 0.45, y + s * 0.08, s * 0.5, s * 0.3, 0, 0, Math.PI * 2);
          ctx.ellipse(x + s * 0.3, y - s * 0.15, s * 0.45, s * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'snow': {
          const y = (a.y + T * (20 + a.s * 30)) % h;
          const x = ((a.x + Math.sin(T + a.p) * 20 - cx * 0.3) % w + w) % w;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.arc(x, y, 1 + a.s * 2, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'embers': {
          const y = h - ((a.y + T * (25 + a.s * 40)) % h);
          const x = ((a.x + Math.sin(T * 2 + a.p) * 12 - cx * 0.3) % w + w) % w;
          ctx.fillStyle = `rgba(255,${120 + a.s * 100},40,${0.5 + 0.5 * Math.sin(T * 5 + a.p)})`;
          ctx.fillRect(x, y, 2 + a.s * 2, 2 + a.s * 2);
          break;
        }
        case 'sparkles': case 'fireflies': {
          const x = ((a.x + Math.sin(T * 0.5 + a.p) * 30 - cx * 0.2) % w + w) % w;
          const y = a.y + Math.cos(T * 0.4 + a.p) * 20;
          const al = Math.max(0, Math.sin(T * 1.5 + a.p * 3));
          const col = th.ambient === 'fireflies' ? '200,255,120' : (a.s > 0.5 ? '160,240,255' : '230,180,255');
          const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
          g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.fillRect(x - 6, y - 6, 12, 12);
          break;
        }
        case 'sprinkles': {
          const y = (a.y + T * (12 + a.s * 15)) % h;
          const x = ((a.x - cx * 0.25) % w + w) % w;
          ctx.save(); ctx.translate(x, y); ctx.rotate(T + a.p);
          ctx.fillStyle = ['#ff4d6d', '#4dd2ff', '#ffe14d', '#7cff6b', '#b28dff'][Math.floor(a.s * 5)];
          ctx.fillRect(-4, -1.2, 8, 2.4);
          ctx.restore();
          break;
        }
        case 'dust': {
          const x = ((a.x + T * (30 + a.s * 40) - cx * 0.3) % w + w) % w;
          const y = a.y + Math.sin(T + a.p) * 8;
          ctx.fillStyle = 'rgba(255,240,200,0.35)';
          ctx.fillRect(x, y, 2, 2);
          break;
        }
      }
    }
  }
}

// ---------- Objets du niveau ----------

export function drawEntrance(ctx, e, open, t, th) {
  const x = e.x, y = e.y - 4;
  ctx.save();
  ctx.translate(x, y);
  // caisson
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 2, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(0, -20, 0, -4);
  g.addColorStop(0, '#9b6a3f'); g.addColorStop(1, '#5e3a1e');
  ctx.fillStyle = g;
  roundRect(ctx, -20, -22, 40, 18, 5); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = '#2b1a0c'; ctx.stroke();
  ctx.fillStyle = '#c9cfd8';
  ctx.fillRect(-20, -17, 40, 2); ctx.fillRect(-20, -10, 40, 2);
  ctx.fillStyle = th.accent;
  ctx.beginPath(); ctx.arc(0, -13, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 0.8; ctx.strokeStyle = '#2b1a0c'; ctx.stroke();
  // trappes
  const k = open; // 0 fermé → 1 ouvert
  ctx.fillStyle = '#1a0f07';
  ctx.fillRect(-15, -4, 30, 2);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 15, -4);
    ctx.rotate(s * -k * 1.45);
    ctx.fillStyle = '#7a4b25';
    ctx.fillRect(s > 0 ? -15 : 0, 0, 15, 3);
    ctx.fillStyle = '#c9cfd8';
    ctx.fillRect(s > 0 ? -3 : 1, 0.5, 2, 2);
    ctx.restore();
  }
  ctx.restore();
}

export function drawExit(ctx, e, t, th) {
  const x = e.x, y = e.y + 1;
  ctx.save();
  ctx.translate(x, y);
  const T = t / 1000;
  // halo
  const g = ctx.createRadialGradient(0, -12, 2, 0, -12, 34);
  g.addColorStop(0, 'rgba(255,240,150,0.55)'); g.addColorStop(1, 'rgba(255,240,150,0)');
  ctx.fillStyle = g; ctx.fillRect(-36, -48, 72, 52);
  // maisonnette
  ctx.fillStyle = '#e9e1d2';
  ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-15, -20); ctx.lineTo(0, -33); ctx.lineTo(15, -20); ctx.lineTo(15, 0); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#3a2a20'; ctx.stroke();
  // toit
  ctx.fillStyle = '#ff5d73';
  ctx.beginPath(); ctx.moveTo(-19, -18); ctx.lineTo(0, -36); ctx.lineTo(19, -18); ctx.lineTo(15, -16); ctx.lineTo(0, -31); ctx.lineTo(-15, -16); ctx.closePath(); ctx.fill();
  ctx.stroke();
  // porte lumineuse
  const dg = ctx.createLinearGradient(0, -22, 0, 0);
  dg.addColorStop(0, '#fff7b0'); dg.addColorStop(1, '#ffb347');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-7, -14); ctx.arc(0, -14, 7, Math.PI, 0); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill();
  ctx.stroke();
  // drapeau
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, -48); ctx.stroke();
  ctx.fillStyle = th.accent;
  ctx.beginPath(); ctx.moveTo(0, -48);
  ctx.quadraticCurveTo(5, -48 + Math.sin(T * 6) * 1.5, 10, -46 + Math.sin(T * 6 + 1) * 1.5);
  ctx.lineTo(0, -42); ctx.closePath(); ctx.fill();
  // étincelles
  for (let i = 0; i < 4; i++) {
    const a = T * 1.6 + i * 1.57, r = 20 + Math.sin(T * 2 + i) * 3;
    ctx.fillStyle = `rgba(255,255,200,${0.5 + 0.5 * Math.sin(T * 4 + i)})`;
    ctx.fillRect(Math.cos(a) * r - 1, -14 + Math.sin(a) * r * 0.6 - 1, 2, 2);
  }
  ctx.restore();
}

export function drawHazard(ctx, hz, t, th) {
  const T = t / 1000;
  const lava = hz.t === 'lava';
  const cols = lava ? ['#ffcf3a', '#e0361a'] : th.water;
  ctx.save();
  const g = ctx.createLinearGradient(0, hz.y, 0, hz.y + hz.h);
  g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  ctx.globalAlpha = lava ? 0.95 : 0.78;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(hz.x, hz.y + hz.h + 40);
  for (let x = hz.x; x <= hz.x + hz.w; x += 3) ctx.lineTo(x, hz.y + Math.sin(x * 0.08 + T * 3) * 1.4 + Math.sin(x * 0.03 - T * 2) * 1.2);
  ctx.lineTo(hz.x + hz.w, hz.y + hz.h + 40);
  ctx.closePath();
  if (lava) { ctx.shadowColor = '#ff6a00'; ctx.shadowBlur = 18; }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = lava ? 'rgba(255,255,180,0.9)' : 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = hz.x; x <= hz.x + hz.w; x += 3) {
    const y = hz.y + Math.sin(x * 0.08 + T * 3) * 1.4 + Math.sin(x * 0.03 - T * 2) * 1.2;
    x === hz.x ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  // bulles
  for (let i = 0; i < Math.ceil(hz.w / 40); i++) {
    const ph = (T * (lava ? 0.6 : 0.9) + hash(i, hz.x) * 5) % 1;
    const bx = hz.x + hash(i, 3) * hz.w;
    const by = hz.y + hz.h * 0.8 - ph * hz.h * 0.75;
    ctx.globalAlpha = 1 - ph;
    ctx.beginPath(); ctx.arc(bx, by, lava ? 2.5 : 1.5, 0, Math.PI * 2);
    ctx.fillStyle = lava ? '#fff3a0' : 'rgba(255,255,255,0.8)'; ctx.fill();
  }
  ctx.restore();
}

export function drawTrap(ctx, tr, t) {
  const T = t / 1000;
  ctx.save();
  if (tr.t === 'fire') {
    for (let i = 0; i < Math.max(2, tr.w / 6); i++) {
      const x = tr.x + 3 + (i * (tr.w - 6)) / Math.max(1, tr.w / 6 - 1);
      const fl = 0.75 + 0.25 * Math.sin(T * 14 + i * 2.1) + 0.1 * Math.sin(T * 23 + i);
      const hh = tr.h * fl + 4;
      const base = tr.y + tr.h;
      ctx.beginPath();
      ctx.moveTo(x - 4, base);
      ctx.quadraticCurveTo(x - 5, base - hh * 0.5, x + Math.sin(T * 9 + i) * 2, base - hh);
      ctx.quadraticCurveTo(x + 5, base - hh * 0.5, x + 4, base);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, base - hh, 0, base);
      g.addColorStop(0, 'rgba(255,240,120,0.9)'); g.addColorStop(0.5, 'rgba(255,140,30,0.95)'); g.addColorStop(1, 'rgba(220,40,20,0.9)');
      ctx.fillStyle = g;
      ctx.shadowColor = '#ff7a00'; ctx.shadowBlur = 10;
      ctx.fill();
    }
  } else { // plante croqueuse
    ctx.translate(tr.x, tr.y + 1);
    const snap = tr.cool > 0 ? Math.max(0, 1 - tr.anim / 10) : 0;
    const open = tr.cool > 0 ? (tr.anim < 10 ? 0 : Math.min(1, (tr.anim - 10) / 40)) : 1;
    const bob = Math.sin(T * 3) * 1;
    ctx.strokeStyle = '#2f8a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-4, -6, 0, -10 + bob); ctx.stroke();
    ctx.fillStyle = '#3fae4b';
    ctx.beginPath(); ctx.ellipse(-5, -3, 5, 2, -0.5, 0, Math.PI * 2); ctx.ellipse(5, -3, 5, 2, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -13 + bob - snap * 3);
    const a = 0.15 + open * 0.55;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * a);
      ctx.beginPath(); ctx.ellipse(0, s * -3, 9, 5, 0, s > 0 ? Math.PI : 0, s > 0 ? Math.PI * 2 : Math.PI);
      ctx.fillStyle = '#d6304f'; ctx.fill();
      ctx.lineWidth = 0.8; ctx.strokeStyle = '#5a0f1e'; ctx.stroke();
      ctx.fillStyle = '#fff';
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 3 - 1.2, s * -3); ctx.lineTo(k * 3, s * -1); ctx.lineTo(k * 3 + 1.2, s * -3); ctx.fill(); }
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-4 + k * 4, s * -5.5, 0.9, 0, Math.PI * 2); ctx.fillStyle = '#ffd3dc'; ctx.fill(); }
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawDeco(ctx, d, t) {
  const s = d.s || 1;
  ctx.save();
  ctx.translate(d.x, d.y + 1);
  ctx.scale(s, s);
  const T = t / 1000;
  switch (d.t) {
    case 'tree': {
      ctx.fillStyle = '#7a4a24'; ctx.fillRect(-2.5, -22, 5, 22);
      const sway = Math.sin(T + d.x) * 0.8;
      for (const [x, y, r, c] of [[-8, -26, 11, '#3f9e3f'], [8, -27, 10, '#3f9e3f'], [0, -36, 13, '#4cb84a'], [-3, -40, 7, '#62cf5c']]) {
        ctx.beginPath(); ctx.arc(x + sway, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
      }
      break;
    }
    case 'pine': {
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-2, -8, 4, 8);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ['#1f6b45', '#27805a', '#33996b'][i];
        ctx.beginPath(); ctx.moveTo(-13 + i * 3, -6 - i * 10); ctx.lineTo(0, -26 - i * 10); ctx.lineTo(13 - i * 3, -6 - i * 10); ctx.fill();
      }
      break;
    }
    case 'palm': {
      ctx.strokeStyle = '#9b6a3f'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, -18, 2, -34); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.7 + Math.sin(T + i) * 0.05;
        ctx.strokeStyle = '#3caa4a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(2, -34); ctx.quadraticCurveTo(2 + Math.cos(a) * 10, -34 + Math.sin(a) * 10 - 4, 2 + Math.cos(a) * 18, -34 + Math.sin(a) * 18 + 6); ctx.stroke();
      }
      break;
    }
    case 'bush':
      for (const [x, y, r] of [[-6, -5, 6], [5, -5, 6], [0, -9, 7]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#3f9e3f'; ctx.fill(); }
      ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.arc(-3, -9, 1.5, 0, 7); ctx.arc(4, -6, 1.5, 0, 7); ctx.fill();
      break;
    case 'flower': {
      ctx.strokeStyle = '#3f9e3f'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -10); ctx.stroke();
      const c = ['#ff5d8f', '#ffd23f', '#b28dff', '#ff7a3d'][Math.floor(Math.abs(d.x)) % 4];
      for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28 + T * 0.5; ctx.beginPath(); ctx.arc(Math.cos(a) * 2.8, -10 + Math.sin(a) * 2.8, 2.2, 0, 7); ctx.fillStyle = c; ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, -10, 1.8, 0, 7); ctx.fillStyle = '#fff3a0'; ctx.fill();
      break;
    }
    case 'mushroom':
      ctx.fillStyle = '#f5ead6'; ctx.fillRect(-2.5, -8, 5, 8);
      ctx.beginPath(); ctx.ellipse(0, -8, 9, 7, 0, Math.PI, 0); ctx.fillStyle = '#e8384f'; ctx.fill();
      ctx.fillStyle = '#fff'; for (const [x, y] of [[-4, -11], [3, -12], [0, -9.5]]) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); }
      break;
    case 'cactus':
      ctx.fillStyle = '#3caa5a';
      roundRect(ctx, -3.5, -26, 7, 26, 3.5); ctx.fill();
      roundRect(ctx, -11, -18, 5, 10, 2.5); ctx.fill(); ctx.fillRect(-8, -10, 6, 3);
      roundRect(ctx, 6, -22, 5, 12, 2.5); ctx.fill(); ctx.fillRect(2, -12, 6, 3);
      break;
    case 'crystal':
      for (const [x, h, c, w] of [[-5, 16, '#9de8ff', 3.5], [3, 24, '#e0a8ff', 4.5], [9, 12, '#9dffd9', 3]]) {
        ctx.fillStyle = c;
        ctx.shadowColor = c; ctx.shadowBlur = 8 + Math.sin(T * 2 + x) * 4;
        ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.lineTo(x - w * 0.6, -h * 0.75); ctx.lineTo(x, -h); ctx.lineTo(x + w * 0.6, -h * 0.75); ctx.lineTo(x + w, 0); ctx.fill();
      }
      ctx.shadowBlur = 0;
      break;
    case 'torch': {
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-1.5, -16, 3, 16);
      const f = 1 + Math.sin(T * 13 + d.x) * 0.15;
      ctx.shadowColor = '#ffae00'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.ellipse(0, -19, 3 * f, 5 * f, 0, 0, 7); ctx.fillStyle = '#ffb12e'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -18, 1.5, 2.5, 0, 0, 7); ctx.fillStyle = '#fff3a0'; ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
    case 'candy':
      ctx.save(); ctx.rotate(-0.2);
      ctx.fillStyle = '#ff5d8f'; ctx.beginPath(); ctx.ellipse(0, -6, 7, 5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-12, -10); ctx.lineTo(-12, -2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(12, -10); ctx.lineTo(12, -2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, -10); ctx.lineTo(1, -2); ctx.moveTo(1, -11); ctx.lineTo(5, -3); ctx.stroke();
      ctx.restore();
      break;
    case 'lollipop':
      ctx.fillStyle = '#fff'; ctx.fillRect(-1, -22, 2, 22);
      ctx.beginPath(); ctx.arc(0, -26, 8, 0, 7); ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let a = 0; a < 12; a += 0.3) { const r = a * 0.6; ctx.lineTo(Math.cos(a) * r, -26 + Math.sin(a) * r); } ctx.stroke();
      break;
    case 'snowman':
      for (const [y, r] of [[-7, 7], [-18, 5], [-26, 3.6]]) { ctx.beginPath(); ctx.arc(0, y, r, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#b8d4ee'; ctx.lineWidth = 0.6; ctx.stroke(); }
      ctx.fillStyle = '#16163a'; ctx.fillRect(-1.6, -27.5, 1, 1); ctx.fillRect(0.8, -27.5, 1, 1);
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(4, -25.3); ctx.lineTo(0, -24.8); ctx.fill();
      ctx.fillStyle = '#e8384f'; ctx.fillRect(-4, -22.5, 8, 2);
      break;
    case 'sign':
      ctx.fillStyle = '#7a4a24'; ctx.fillRect(-1.5, -16, 3, 16);
      ctx.fillStyle = '#c08a52'; roundRect(ctx, -10, -22, 20, 9, 2); ctx.fill();
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.moveTo(-4, -17.5); ctx.lineTo(4, -17.5); ctx.lineTo(1.5, -20); ctx.moveTo(4, -17.5); ctx.lineTo(1.5, -15); ctx.stroke();
      break;
    case 'lamp': {
      ctx.fillStyle = '#3a3f55'; ctx.fillRect(-1, -24, 2, 24);
      const g = ctx.createRadialGradient(0, -26, 1, 0, -26, 16);
      g.addColorStop(0, 'rgba(255,240,170,0.8)'); g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g; ctx.fillRect(-16, -42, 32, 32);
      ctx.beginPath(); ctx.arc(0, -26, 3, 0, 7); ctx.fillStyle = '#fff6c2'; ctx.fill();
      break;
    }
    case 'stone':
      ctx.fillStyle = '#9aa0ad'; ctx.beginPath(); ctx.ellipse(0, -3, 8, 5, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-2, -5, 3, 1.5, 0, 0, 7); ctx.fill();
      break;
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Particules (coordonnées du monde) ----------

export class Particles {
  constructor() { this.list = []; }
  add(p) { if (this.list.length < 1500) this.list.push(p); }

  burst(x, y, n, opt) {
    for (let i = 0; i < n; i++) {
      const a = (opt.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (opt.spread ?? Math.PI * 2);
      const sp = (opt.speed ?? 60) * (0.4 + Math.random() * 0.8);
      this.add({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: opt.g ?? 160, life: 0, max: (opt.life ?? 0.8) * (0.6 + Math.random() * 0.6),
        size: (opt.size ?? 1.5) * (0.6 + Math.random() * 0.8), color: Array.isArray(opt.color) ? opt.color[Math.floor(Math.random() * opt.color.length)] : opt.color,
        type: opt.type || 'dot', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.max) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === 'smoke') { p.vx *= 0.96; p.vy *= 0.96; }
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      const k = p.life / p.max;
      ctx.globalAlpha = p.type === 'text' ? Math.min(1, (1 - k) * 2) : 1 - k * k;
      switch (p.type) {
        case 'spark': {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, 7); ctx.fill();
          break;
        }
        case 'smoke':
          ctx.fillStyle = p.color;
          ctx.globalAlpha *= 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + k * 2.5), 0, 7); ctx.fill();
          break;
        case 'ring':
          ctx.strokeStyle = p.color; ctx.lineWidth = 2 * (1 - k);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.3 + k * 1.2), 0, 7); ctx.stroke();
          break;
        case 'confetti':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
          ctx.restore();
          break;
        case 'text':
          ctx.fillStyle = p.color;
          ctx.font = `700 ${p.size}px Fredoka, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = Math.max(0.6, p.size * 0.12); ctx.strokeStyle = 'rgba(20,20,50,0.7)';
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillText(p.text, p.x, p.y);
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- Scène complète ----------

export function drawWorld(ctx, game, view, cam, t, opts) {
  const { def } = game;
  const th = view.th;
  const z = cam.zoom;
  ctx.save();
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  // décor non solide
  for (const d of def.deco || []) if (d.x > cam.x - 60 && d.x < cam.x + cam.w + 60) drawDeco(ctx, d, t);
  for (const e of game.entrances) drawEntrance(ctx, e, game.opening > 0 ? 1 - game.opening / 30 : 1, t, th);
  for (const e of game.exits) drawExit(ctx, e, t, th);
  ctx.restore();

  // terrain
  const sx = Math.max(0, Math.floor(cam.x)), sy = Math.max(0, Math.floor(cam.y));
  const sw = Math.min(def.w - sx, Math.ceil(cam.w) + 2), sh = Math.min(def.h - sy, Math.ceil(cam.h) + 2);
  if (sw > 0 && sh > 0) {
    ctx.imageSmoothingEnabled = z < RS * 1.25;
    ctx.drawImage(view.canvas, sx * RS, sy * RS, sw * RS, sh * RS, (sx - cam.x) * z, (sy - cam.y) * z, sw * z, sh * z);
    ctx.imageSmoothingEnabled = true;
  }

  ctx.save();
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  for (const tr of game.traps) drawTrap(ctx, tr, t);
  for (const l of game.lems) {
    if (l.state === 'dead' || l.state === 'saved') continue;
    if (l.x < cam.x - 30 || l.x > cam.x + cam.w + 30) continue;
    drawLem(ctx, l, t, { highlight: l === opts.hover, zoom: z });
  }
  for (const hz of game.hazards) drawHazard(ctx, hz, t, th);
  opts.particles.draw(ctx);
  // curseur
  if (opts.cursor) {
    const { x, y, ok } = opts.cursor;
    const r = opts.hover ? 11 : 8;
    const cx = opts.hover ? opts.hover.x + 0.5 : x, cy = opts.hover ? opts.hover.y - 8 : y;
    ctx.strokeStyle = opts.hover ? (ok ? '#7dff8a' : '#ff6b6b') : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.6 / z * 1.4;
    const k = r * 0.45;
    for (const [sx2, sy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx2 * r, cy + sy2 * (r - k));
      ctx.lineTo(cx + sx2 * r, cy + sy2 * r);
      ctx.lineTo(cx + sx2 * (r - k), cy + sy2 * r);
      ctx.stroke();
    }
  }
  ctx.restore();
}
