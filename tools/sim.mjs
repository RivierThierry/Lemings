// Simule un niveau avec une solution scriptée, sans navigateur.
// Une solution est une liste d'actions :
//   { lem: 3, skill: 'builder', x: 420 }        la 4e bestiole sortie, quand elle atteint x=420 (dans son sens de marche)
//   { lem: 0, skill: 'digger', at: 200 }        au tick 200 (ou dès qu'elle existe après)
//   options : dir (1|-1), state ('walking'…), y (atteint au moins cette profondeur), after (index d'une action déjà faite)
//   { rr: 99, at: 0 }  changer le débit       { nuke: true, at: 900 }
import { Game, TPS } from '../js/engine.js';

export function simulate(def, actions = [], opts = {}) {
  const g = new Game(def);
  const pending = actions.map((a, i) => ({ ...a, i, done: false }));
  const log = [];
  const maxTicks = opts.maxTicks ?? (def.time ?? 300) * TPS + 200;
  while (!g.done && g.tickCount < maxTicks) {
    for (const a of pending) {
      if (a.done) continue;
      if (a.after !== undefined && !pending[a.after].done) continue;
      if (a.at !== undefined && g.tickCount < a.at) continue;
      if (a.rr !== undefined) { g.setRate(a.rr); a.done = true; continue; }
      if (a.nuke) { g.nuke(); a.done = true; continue; }
      const l = g.lems[a.lem];
      if (!l || l.state === 'dead' || l.state === 'saved') continue;
      if (a.dir !== undefined && l.dir !== a.dir) continue;
      if (a.x !== undefined && (l.dir > 0 ? l.x < a.x : l.x > a.x)) continue;
      if (a.y !== undefined && l.y < a.y) continue;
      if (a.state !== undefined && l.state !== a.state) continue;
      if (g.assign(l, a.skill)) {
        a.done = true;
        log.push(`t${g.tickCount} #${a.lem} ${a.skill} @(${l.x},${l.y})`);
      } else if (a.strict !== false && !g.canAssign(l, a.skill) && g.skills[a.skill] <= 0) {
        a.done = true;
        log.push(`t${g.tickCount} #${a.lem} ${a.skill} ÉCHEC (plus de compétence)`);
      }
    }
    g.tick();
    g.events.length = 0;
    g.terrain.changes.length = 0;
    if (opts.trace) opts.trace(g);
  }
  const missed = pending.filter((a) => !a.done).map((a) => a.i);
  return { saved: g.saved, need: g.need, total: g.total, ok: g.saved >= g.need, ticks: g.tickCount, timeLeft: Math.round(g.timeLeft / TPS), missed, log, game: g };
}
