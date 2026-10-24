// Joue une solution scriptée pas à pas (démonstrations et écran titre).
// Mêmes règles que tools/sim.mjs.
export class ScriptRunner {
  constructor(game, actions) {
    this.g = game;
    this.pending = (actions || []).map((a, i) => ({ ...a, i, done: false }));
  }

  // À appeler avant chaque tick ; renvoie les bestioles qui viennent de recevoir un talent
  step() {
    const g = this.g, hits = [];
    for (const a of this.pending) {
      if (a.done) continue;
      if (a.after !== undefined && !this.pending[a.after].done) continue;
      if (a.at !== undefined && g.tickCount < a.at) continue;
      if (a.rr !== undefined) { g.setRate(a.rr); a.done = true; continue; }
      if (a.nuke) { g.nuke(); a.done = true; continue; }
      const l = g.lems[a.lem];
      if (!l || l.state === 'dead' || l.state === 'saved') continue;
      if (a.dir !== undefined && l.dir !== a.dir) continue;
      if (a.x !== undefined && (l.dir > 0 ? l.x < a.x : l.x > a.x)) continue;
      if (a.y !== undefined && l.y < a.y) continue;
      if (a.state !== undefined && l.state !== a.state) continue;
      if (g.assign(l, a.skill)) { a.done = true; hits.push({ lem: l, skill: a.skill }); }
      else if (a.strict !== false && !g.canAssign(l, a.skill) && g.skills[a.skill] <= 0) a.done = true;
    }
    return hits;
  }

  // La prochaine bestiole concernée (pour que la caméra la suive)
  focus() {
    for (const a of this.pending) {
      if (a.done || a.lem === undefined) continue;
      const l = this.g.lems[a.lem];
      if (l && l.state !== 'dead' && l.state !== 'saved') return l;
      return null;
    }
    return null;
  }
}
