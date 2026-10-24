// Niveaux « Balade » : on découvre les talents un par un.
export const TIER1 = [
  {
    id: 't1-01', name: 'Il suffit de creuser', theme: 'prairie',
    w: 960, h: 320, lemmings: 10, save: 5, release: 50, time: 300,
    skills: { digger: 10 },
    hint: 'Choisis la Creuseuse, puis touche une bestiole sur la plaine.',
    entrances: [{ x: 160, y: 110 }], exits: [{ x: 640, y: 259 }],
    terrain: [
      { t: 'land', pts: [[0, 180], [120, 172], [260, 176], [420, 168], [560, 178], [960, 174]], to: 222 },
      { t: 'rock', x: 0, y: 210, w: 960, h: 18, seed: 3 },
      { t: 'land', pts: [[0, 262], [300, 258], [640, 260], [960, 262]] },
      { t: 'rect', x: 0, y: 100, w: 20, h: 220, m: 'steel' },
      { t: 'rect', x: 940, y: 100, w: 20, h: 220, m: 'steel' },
      { t: 'rect', x: 780, y: 140, w: 20, h: 140, m: 'steel' },
    ],
    deco: [{ t: 'tree', x: 300, y: 176 }, { t: 'flower', x: 480, y: 172 }],
    solution: [{ lem: 0, skill: 'digger', x: 400 }],
  },
];
