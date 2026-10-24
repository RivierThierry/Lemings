// Vérifie chaque niveau : réussi avec sa solution, raté sans rien faire, données cohérentes.
//   node tools/check.mjs            tous les niveaux
//   node tools/check.mjs t2-04      un seul (avec le journal de la solution)
import { simulate } from './sim.mjs';
import { buildTerrain, SKILLS } from '../js/engine.js';
import { LEVELS } from '../js/levels.js';

const only = process.argv[2];
let bad = 0;
const ids = new Set();
for (const def of LEVELS) {
  if (only && def.id !== only && !def.id.startsWith(only)) continue;
  const errors = [];
  if (ids.has(def.id)) errors.push('id en double');
  ids.add(def.id);
  for (const k of ['id', 'name', 'theme', 'w', 'h', 'lemmings', 'save', 'time', 'entrances', 'exits', 'terrain']) if (def[k] === undefined) errors.push('champ manquant : ' + k);
  for (const s of Object.keys(def.skills || {})) if (!SKILLS.includes(s)) errors.push('compétence inconnue : ' + s);
  if (def.save > def.lemmings) errors.push('save > lemmings');
  const T = buildTerrain(def);
  for (const e of def.entrances) {
    if (T.solid(e.x, e.y)) errors.push(`entrée (${e.x},${e.y}) dans le terrain`);
    let d = 0;
    while (d < def.h && !T.solid(e.x, e.y + 1 + d)) d++;
    if (d > 100) errors.push(`entrée (${e.x},${e.y}) : chute de ${d} px (mortelle au-delà de 100)`);
  }
  for (const e of def.exits) if (!T.solid(e.x, e.y + 1) || T.solid(e.x, e.y)) errors.push(`sortie (${e.x},${e.y}) : il faut du vide en y et du sol en y+1`);

  const sol = def.solution ? simulate(def, def.solution) : null;
  const none = simulate(def, []);
  if (!def.solution) errors.push('pas de solution');
  else if (!sol.ok) errors.push(`solution ratée : ${sol.saved}/${sol.need}`);
  if (sol && sol.missed.length) errors.push('actions jamais exécutées : ' + sol.missed.join(','));
  if (none.ok && !def.free) errors.push(`gagné sans rien faire (${none.saved}/${none.need})`);
  const status = errors.length ? '✗' : '✓';
  if (errors.length) bad++;
  const skills = Object.entries(def.skills || {}).filter(([, n]) => n).map(([k, n]) => k + ':' + n).join(' ');
  console.log(`${status} ${def.id.padEnd(6)} ${def.name.padEnd(32)} ${sol ? sol.saved : '-'}/${def.save}/${def.lemmings} sans:${none.saved}  ${skills}  ${errors.join(' | ')}`);
  if (only && sol) console.log(sol.log.join('\n'));
}
console.log(bad ? `\n${bad} niveau(x) à corriger` : '\nTous les niveaux sont bons.');
process.exitCode = bad ? 1 : 0;
