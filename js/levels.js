// Tous les niveaux, rangés par difficulté.
import { TIER1 } from './levels/tier1.js';
import { TIER2 } from './levels/tier2.js';
import { TIER3 } from './levels/tier3.js';
import { TIER4 } from './levels/tier4.js';

export const TIERS = [
  { id: 't1', name: 'Balade', desc: 'Pour apprendre chaque talent en douceur.', color: '#5be36b', levels: TIER1 },
  { id: 't2', name: 'Astuce', desc: 'Il va falloir combiner les talents.', color: '#4fc3ff', levels: TIER2 },
  { id: 't3', name: 'Costaud', desc: 'Moins de talents, plus de pièges.', color: '#ffb02e', levels: TIER3 },
  { id: 't4', name: 'Chaos', desc: 'Pour les maîtres des Bestioles.', color: '#ff4f6d', levels: TIER4 },
];
TIERS.forEach((t) => t.levels.forEach((l, i) => { l.tier = t.id; l.num = i + 1; }));

export const LEVELS = TIERS.flatMap((t) => t.levels);
