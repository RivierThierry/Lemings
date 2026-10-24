# Concevoir un niveau des Bestioles

Jeu inspiré de Lemmings (DMA Design, 1991) : des bestioles sortent d'une trappe et marchent tout droit ;
le joueur leur donne des talents pour qu'assez d'entre elles atteignent la sortie.
Les niveaux doivent être ORIGINAUX (noms en français, pas de copie exacte des niveaux d'origine),
mais l'esprit et la progression doivent être fidèles.

## Outils (depuis la racine du dépôt)
- `node tools/check.mjs` : vérifie tous les niveaux. `node tools/check.mjs t2` : seulement ceux qui commencent par t2.
  `node tools/check.mjs t2-04` : un niveau, avec le journal de sa solution.
  Chaque niveau doit être ✓ : réussi avec sa `solution`, raté sans rien faire, entrées/sorties bien placées.
- `node tools/view.mjs t2-04 [--sx 6 --sy 10] [--x0 400 --x1 900] [--solution] [--tick 600]` : carte ASCII,
  éventuellement après N ticks de la solution (les bestioles vivantes sont des `o`).
- On peut aussi écrire un petit script Node qui importe `tools/sim.mjs` (`simulate(def, actions, { trace })`)
  pour suivre une bestiole précise (`r.game.lems[i]` : x, y, state, dir).
- NE PAS modifier `js/engine.js`, `tools/*.mjs` ni les fichiers des autres paliers. Si tu trouves un vrai bug du moteur,
  décris-le dans ton compte rendu final au lieu de le corriger.

## Repère et unités
- Pixels du monde ; x vers la droite, y VERS LE BAS. Hauteur habituelle h = 320 (jusqu'à 400 possible),
  largeur 640 à 2400. Les bords gauche et droit sont des murs infranchissables.
- 30 ticks par seconde. Une bestiole fait 16 px de haut, ~8 px de large ; (x, y) = ses pieds :
  elle se tient en (x, y) quand le pixel (x, y) est vide et (x, y+1) plein.

## Physique (déjà codée dans js/engine.js)
- Marche : 1 px/tick. Monte une marche de ≤ 6 px ; au-delà c'est un mur → demi-tour (ou escalade si grimpeuse).
  Descend ≤ 4 px sans tomber ; sinon elle tombe à 4 px/tick.
- Chute de plus de 100 px = morte (sauf parachutiste). L'entrée doit être à moins de 100 px au-dessus du sol.
- Talents (`skills`), dans l'ordre du panneau :
  - `climber` grimpeuse (permanent) : escalade les murs verticaux ; si un plafond/surplomb lui cogne la tête, elle lâche et tombe.
  - `floater` parachutiste (permanent) : survit à toutes les chutes.
  - `bomber` bombe : explose 5 s plus tard (18 ticks d'« oh non » sur place avant), creuse une ellipse
    ~28 px de large et ~32 px de haut centrée 5 px au-dessus de ses pieds (jusqu'à ~11 px sous ses pieds). Elle meurt.
    Ne creuse pas l'acier. Libère un bloqueur si on la lui donne.
  - `blocker` bloqueuse : reste plantée ; les autres font demi-tour à ±6 px d'elle. Seule une bombe (ou la disparition du sol) l'en libère.
  - `builder` bâtisseuse : 12 briques ; chaque brique fait 12 px de long et 2 px de haut, et elle monte de 2 px et avance de 4 px
    par brique → l'escalier complet monte de 24 px sur ~48 px (+ la longueur d'une brique). Elle s'arrête et fait demi-tour
    si elle cogne un mur ou un plafond. On peut redonner `builder` pendant les 3 dernières briques ou le haussement d'épaules
    (état `shrugging`) pour prolonger le pont.
  - `basher` cogneuse : creuse un tunnel horizontal (~17 px de haut), s'arrête s'il n'y a plus rien à creuser dans les 12 px devant,
    ou devant l'acier / un sens unique contraire.
  - `miner` mineuse : creuse en diagonale vers le bas (2 px en avant, 1 px vers le bas), s'arrête sur l'acier.
  - `digger` creuseuse : trou vertical de 9 px de large, 2 px tous les 4 ticks ; s'arrête sur l'acier ; tombe en traversant.
- Les talents de travail (blocker, builder, basher, miner, digger) se donnent à une bestiole qui marche ou travaille déjà (pas en chute).
  climber/floater/bomber se donnent à tout moment.
- Débit de sortie `release` (1-99) = minimum ; intervalle entre deux sorties = round((53 - rr/2) * 30 / 17) ticks
  (rr 50 → 49 ticks, rr 99 → 6 ticks). Le joueur peut l'augmenter (action `{ rr: 99, at: 0 }` dans une solution).
- Entrées : les bestioles sortent tour à tour de chaque entrée, en tombant depuis (x, y), vers la droite (ou `dir: -1`).

## Format d'un niveau (objet JS dans js/levels/tierN.js)
```js
{
  id: 't2-04', name: 'Le pont des soupirs', theme: 'desert',
  w: 1400, h: 320, lemmings: 40, save: 30, release: 50, time: 240,   // time en secondes ; save = nombre à sauver
  skills: { builder: 6, basher: 2 },                                  // talents absents = 0
  hint: 'Phrase courte, ton malicieux, sans donner la solution.',
  entrances: [{ x: 120, y: 90 }, { x: 300, y: 60, dir: -1 }],
  exits: [{ x: 1250, y: 239 }],      // y = ligne vide juste au-dessus du sol (sol plein en y+1)
  terrain: [ /* formes dessinées dans l'ordre ; m: 'dirt' (défaut) | 'steel' | 'left' | 'right' ; cut: true = creuse */
    { t: 'land', pts: [[0, 240], [400, 230], [700, 245]], to: 320 }, // profil de sol, rempli jusqu'à y = to (défaut h)
    { t: 'rock', x: 500, y: 120, w: 160, h: 60, seed: 7 },            // rocher aux bords bosselés (r: arrondi, j: bosses)
    { t: 'rect', x: 800, y: 200, w: 30, h: 120, m: 'steel' },
    { t: 'poly', pts: [[900, 300], [1000, 200], [1100, 300]] },
    { t: 'circle', x: 300, y: 200, r: 40 }, { t: 'ellipse', x: 300, y: 200, rx: 60, ry: 30 },
    { t: 'bar', x1: 100, y1: 200, x2: 300, y2: 150, w: 10 },          // poutre épaisse (rampe)
    { t: 'circle', x: 300, y: 200, r: 20, cut: true },                // trou
    { t: 'rect', x: 600, y: 150, w: 40, h: 90, m: 'left' },           // sens unique : ne se creuse horizontalement que vers la gauche
  ],
  hazards: [{ t: 'water', x: 600, y: 290, w: 200, h: 30 }],          // 'water' | 'lava' ; y = surface ; mortel
  traps: [{ t: 'crusher', x: 950, y: 239 }, { t: 'fire', x: 1000, y: 220, w: 30, h: 20 }],
       // crusher : tue une bestiole qui passe à ±5 px de x (pieds entre y-14 et y+1), puis se recharge 50 ticks
       // fire : flammes permanentes, mortelles dans le rectangle
  deco: [{ t: 'tree', x: 200, y: 239 }],  // décor non solide posé sur le sol (y = haut du sol). Types :
       // tree pine palm bush flower mushroom cactus crystal torch candy lollipop snowman sign lamp stone
  solution: [ ... ],   // voir ci-dessous
}
```
Thèmes (`theme`) : `prairie` (herbe, ciel bleu), `desert` (sable, soleil), `glace` (neige, aurores), `volcan` (roche sombre, lave),
`cristal` (grotte violette, cristaux), `bonbon` (sucreries roses), `nuit` (forêt de nuit, lucioles).
Le décor des bords (herbe, neige…) est ajouté automatiquement sur le dessus du terrain.

## Solution
Liste d'actions exécutées par `tools/sim.mjs`. `lem` = numéro de sortie de la bestiole (0 = la première).
```js
solution: [
  { rr: 80, at: 0 },                                   // débit
  { lem: 0, skill: 'blocker', x: 900 },                // quand la bestiole 0 a atteint x ≥ 900 (x ≤ 900 si elle va à gauche)
  { lem: 1, skill: 'builder', x: 640, dir: 1 },        // dir : seulement dans ce sens
  { lem: 1, skill: 'builder', state: 'shrugging' },    // prolonger le pont
  { lem: 2, skill: 'digger', at: 400 },                // au tick 400 (ou dès que possible après)
  { lem: 3, skill: 'basher', x: 1000, after: 2 },      // seulement après l'action d'index 2
  { lem: 4, skill: 'miner', x: 700, y: 200 },          // y : quand ses pieds sont au moins à cette profondeur
  { nuke: true, at: 3000 },                            // armageddon (rarement utile)
]
```
La solution doit être jouable par un humain (on peut mettre en pause pour donner un talent, donc la précision au pixel
est acceptable, mais pas une cadence surhumaine).

## Exigences de conception
- Chaque niveau a UNE idée claire (un « puzzle »), un nom drôle ou évocateur en français, et un `hint` court.
- `check.mjs` doit afficher ✓ : solution réussie, ÉCHEC sans aucune action (le niveau ne se gagne pas tout seul),
  entrées pas dans le terrain et à moins de 100 px du sol, sorties posées sur le sol.
- Vérifie aussi qu'il n'y a pas de raccourci évident beaucoup plus facile que l'idée prévue (essaie 2-3 tentatives
  « paresseuses » avec sim.mjs : par ex. un seul creuseur tout de suite, une seule bloqueuse…). Les talents en trop
  rendent un niveau facile : donne juste ce qu'il faut (+ un peu de marge dans les premiers paliers).
- Soigne l'aspect : formes organiques (`rock`, `land`, `ellipse`) plutôt que des rectangles partout ; l'acier en
  rectangles ; des plateformes, grottes, piliers, arches ; quelques `deco`. Varie les thèmes et les tailles.
- Le niveau doit tenir dans le temps donné avec de la marge (≥ 30 % du temps restant à la fin de la solution).
- Attention aux chutes : une bestiole qui tombe dans un trou de creuseuse profond de plus de 100 px meurt.
