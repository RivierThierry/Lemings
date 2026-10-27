# Les Bestioles

Un jeu de réflexion inspiré de *Lemmings* (DMA Design, 1991), avec des graphismes modernes dessinés en
vectoriel et des sons synthétisés. Les bestioles sortent de leur trappe et marchent tout droit : à toi de leur
donner les bons talents pour qu'assez d'entre elles rentrent à la maison.

Jouable sur https://les-bestioles.encoreunepartie.fr/ (PC, tablette et téléphone).

## Contenu
- 8 talents fidèles à l'original : grimpeuse, parachute, bombe, bloqueuse, bâtisseuse, cogneuse, mineuse, creuseuse.
- 60 niveaux en 4 paliers de difficulté (Balade, Astuce, Costaud, Chaos), tous vérifiés automatiquement.
- Terrain destructible au pixel près, acier, murs à sens unique, eau, lave, plantes croqueuses, flammes.
- Débit réglable, pause (on peut donner des talents en pause), accéléré, armageddon, mini-carte, zoom.
- 7 thèmes visuels animés, musiques chiptune d'airs du domaine public.
- Progression sauvegardée (en ligne avec un compte encoreunepartie.fr) et classement général.
- Démonstration de la solution après trois échecs sur un niveau.

## Structure
- `index.html`, `style.css` : page et interface.
- `js/engine.js` : simulation (sans DOM, tourne aussi sous Node).
- `js/render.js`, `js/sprites.js` : rendu du terrain, des décors et des bestioles.
- `js/audio.js` : bruitages et musiques (WebAudio).
- `js/main.js` : écrans, commandes, caméra, sauvegardes.
- `js/levels/tier*.js` : les niveaux, chacun avec sa solution.
- `arcade.js` : services d'encoreunepartie.fr (scores, sauvegardes).
- `tools/` : outils de conception (voir `tools/LEVEL_GUIDE.md`).

## Développer
```sh
python3 -m http.server 8000      # puis http://localhost:8000
node tools/check.mjs             # vérifie que chaque niveau est faisable (et pas gagné d'avance)
node tools/view.mjs t2-04        # carte ASCII d'un niveau
```

Police Fredoka (SIL Open Font License). Voix des bestioles : synthèse Piper (rhasspy) avec la voix française « siwis »,
issue de la SIWIS French Speech Synthesis Database (CC BY 4.0, https://datashare.is.ed.ac.uk/handle/10283/2353),
rendue très aiguë, avec une mélodie par réplique (tools/voix.py). *Lemmings* est une marque de ses ayants droit ; ce jeu est une création
originale qui s'en inspire.
