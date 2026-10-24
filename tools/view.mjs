// Affiche un niveau en ASCII (pour concevoir et déboguer sans navigateur).
//   node tools/view.mjs <id> [--sx 6] [--sy 10] [--x0 0] [--x1 9999] [--tick N] [--solution]
//   Légende : # terre  S acier  < > sens unique  ~ eau  ^ lave/feu  T piège  E entrée  X sortie  o bestiole
import { buildTerrain, EMPTY, STEEL, OW_LEFT, OW_RIGHT } from '../js/engine.js';
import { simulate } from './sim.mjs';
import { LEVELS } from '../js/levels.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const id = args[0];
const def = LEVELS.find((l) => l.id === id);
if (!def) { console.log('Niveaux :', LEVELS.map((l) => l.id).join(' ')); process.exit(1); }
const sx = opt('sx', 6), sy = opt('sy', 10);
const x0 = opt('x0', 0), x1 = Math.min(def.w, opt('x1', def.w));

let T = buildTerrain(def), lems = [];
if (args.includes('--tick') || args.includes('--solution')) {
  const stop = opt('tick', Infinity);
  const r = simulate(def, args.includes('--solution') ? def.solution || [] : [], {
    maxTicks: stop,
  });
  T = r.game.terrain;
  lems = r.game.lems.filter((l) => l.state !== 'dead' && l.state !== 'saved');
  console.log(`tick ${r.ticks} sauvées ${r.saved}/${r.total} (il en faut ${r.need})`);
  console.log(r.log.join('\n'));
}

const rows = [];
for (let cy = 0; cy < Math.ceil(def.h / sy); cy++) {
  let line = '';
  for (let cx = Math.floor(x0 / sx); cx < Math.ceil(x1 / sx); cx++) {
    const c = { [EMPTY]: 0, 1: 0, [STEEL]: 0, [OW_LEFT]: 0, [OW_RIGHT]: 0 };
    for (let y = cy * sy; y < (cy + 1) * sy; y++) for (let x = cx * sx; x < (cx + 1) * sx; x++) c[T.get(x, y)]++;
    const n = sx * sy;
    let ch = ' ';
    if (c[STEEL] > n * 0.3) ch = 'S';
    else if (c[OW_LEFT] > n * 0.3) ch = '<';
    else if (c[OW_RIGHT] > n * 0.3) ch = '>';
    else if (c[1] + c[STEEL] + c[OW_LEFT] + c[OW_RIGHT] > n * 0.5) ch = '#';
    else if (c[1] + c[STEEL] + c[OW_LEFT] + c[OW_RIGHT] > 0) ch = '.';
    line += ch;
  }
  rows.push(line.split(''));
}
const put = (x, y, ch) => {
  const cx = Math.floor(x / sx) - Math.floor(x0 / sx), cy = Math.floor(y / sy);
  if (rows[cy] && cx >= 0 && cx < rows[cy].length) rows[cy][cx] = ch;
};
for (const h of def.hazards || []) for (let x = h.x; x < h.x + h.w; x += sx) for (let y = h.y; y < h.y + h.h; y += sy) put(x, y, h.t === 'lava' ? '^' : '~');
for (const t of def.traps || []) {
  if (t.t === 'fire') { for (let x = t.x; x < t.x + t.w; x += sx) put(x, t.y, '^'); } else put(t.x, t.y, 'T');
}
for (const e of def.entrances) put(e.x, e.y, 'E');
for (const e of def.exits) put(e.x, e.y, 'X');
for (const l of lems) put(l.x, l.y - 4, 'o');
const ruler = Array.from({ length: rows[0].length }, (_, i) => ((Math.floor(x0 / sx) + i) * sx) % 100 < sx ? '|' : ' ').join('');
console.log(`${def.id} « ${def.name} » ${def.w}x${def.h}  (1 car = ${sx}x${sy} px, | = tous les 100 px depuis x=${Math.floor(x0 / sx) * sx})`);
console.log(ruler);
rows.forEach((r, i) => console.log(r.join('') + ' ' + i * sy));
