// Mesure la marge d'erreur de chaque action des solutions : décale x (±d px) ou at (±d ticks)
// et regarde si le niveau est encore gagné. Une action sans marge est trop dure pour un humain.
import { simulate } from './sim.mjs';
import { LEVELS } from '../js/levels.js';

const only = process.argv[2];
for (const def of LEVELS) {
  if (only && !def.id.startsWith(only)) continue;
  const sol = def.solution || [];
  const tight = [];
  sol.forEach((a, i) => {
    const key = a.x !== undefined ? 'x' : a.at !== undefined && a.lem !== undefined ? 'at' : null;
    if (!key) return;
    let lo = 0, hi = 0;
    for (const s of [1, 2, 3, 4, 6, 8, 12]) {
      const d = key === 'at' ? s * 3 : s;
      const t = sol.map((b, j) => (j === i ? { ...b, [key]: b[key] - d } : b));
      if (simulate(def, t).ok) lo = d; else break;
    }
    for (const s of [1, 2, 3, 4, 6, 8, 12]) {
      const d = key === 'at' ? s * 3 : s;
      const t = sol.map((b, j) => (j === i ? { ...b, [key]: b[key] + d } : b));
      if (simulate(def, t).ok) hi = d; else break;
    }
    const w = lo + hi;
    if ((key === 'x' && w < 4) || (key === 'at' && w < 9)) tight.push(`#${i} ${a.skill} ${key}=${a[key]} [-${lo},+${hi}]`);
  });
  console.log(`${def.id} ${tight.length ? '⚠ ' + tight.join(' | ') : 'ok'}`);
}
