/* arcade.js — services d'encoreunepartie.fr pour les jeux : scores partagés et multijoueur.
 *
 * En ligne (https://<jeu>.encoreunepartie.fr/), scores et salons sont partagés entre tous les joueurs.
 * Ailleurs (aperçu claude.ai, fichier ouvert en local…) : scores gardés dans ce navigateur, et
 * multijoueur entre plusieurs onglets du même navigateur. Le jeu marche partout avec le même code.
 *
 * SCORES
 *   const r = await Arcade.envoyerScore(1250, { pseudo: 'Léa' });   // r.rang, r.record, r.scores (top 10)
 *   const top = await Arcade.meilleursScores({ nombre: 10 });       // [{ rang, pseudo, score, date }]
 *   Options : tableau ("principal" par défaut, ex. "facile"), ordre "desc" (le plus grand gagne) ou "asc".
 *
 * MULTIJOUEUR (l'hôte calcule la partie, les autres lui envoient leurs actions)
 *   const partie = await Arcade.salonAttente({ min: 2, max: 4 });  // écran tout prêt : pseudo, partie rapide, salons
 *   if (!partie) return;                                              // le joueur a annulé
 *   partie.joueurs        [{ id, pseudo, connecte }]   partie.moi (mon id)   partie.estHote   partie.salon
 *   partie.envoyer(donnees)              à tous les autres     partie.envoyer(donnees, idJoueur)  à un seul
 *   partie.on('message', (donnees, deId, deJoueur) => …)
 *   partie.on('depart' | 'arrivee' | 'deconnexion' | 'retour' | 'hote', (joueur) => …)
 *   partie.on('joueurs', (joueurs) => …)   partie.on('connexion', (etat) => …)  // 'perdue' | 'retrouvee'
 *   partie.on('erreur', (message) => …)    partie.on('ferme', (raison) => …)    partie.quitter()   partie.fermer()
 *   Bas niveau (pour un écran de salon fait maison) : const c = await Arcade.connecter();
 *     c.salons, c.on('salons'), c.rapide(pseudo, { min, max, infos }),
 *     c.creer(pseudo, { min, max, nom, infos, prive }), c.rejoindre(code, pseudo), c.lancer(), c.exclure(id)
 *
 * COMPTE ET SAUVEGARDES (le joueur se connecte une fois sur le site, et c'est valable pour tous les jeux)
 *   const s = await Arcade.charger();          // { donnees, date, source: 'compte' | 'appareil' } ou null
 *   await Arcade.sauvegarder(donnees);         // sur son compte s'il est connecté, sinon sur l'appareil
 *   const j = await Arcade.joueur();           // { pseudo } si connecté, sinon null
 *   Arcade.connexion();                        // page de connexion du site, puis retour au jeu
 *   Option { emplacement: 'partie2' } : 5 emplacements par jeu ('principal' par défaut).
 */
(function () {
  'use strict';
  const DOMAINE = 'encoreunepartie.fr';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // codes de salon : sans I, O, 0, 1
  const MAX_JOUEURS = 16;
  const TAILLE_MESSAGE = 16 * 1024;
  const hote = location.hostname;
  const enLigne = location.protocol === 'https:' && hote.endsWith('.' + DOMAINE);
  const memoire = {};

  // localStorage, ou la mémoire de la page s'il est indisponible ou plein (la mémoire passe alors devant).
  function lire(cle) {
    if (Object.prototype.hasOwnProperty.call(memoire, cle)) return memoire[cle];
    try { return localStorage.getItem(cle); } catch (e) { return null; }
  }
  function ecrire(cle, valeur) {
    try {
      localStorage.setItem(cle, valeur);
      delete memoire[cle];
    } catch (e) {
      memoire[cle] = valeur;
    }
  }
  function oublier(cle) {
    delete memoire[cle];
    try { localStorage.removeItem(cle); } catch (e) { /* indisponible */ }
  }

  async function appeler(methode, chemin, corps) {
    // Sans réponse au bout de 15 s (serveur occupé, réseau mort), on abandonne : le jeu ne reste pas bloqué.
    const arret = typeof AbortController === 'function' ? new AbortController() : null;
    const minuteur = arret ? setTimeout(() => arret.abort(), 15000) : null;
    try {
      const reponse = await fetch('/_arcade/' + chemin, {
        method: methode,
        headers: corps ? { 'Content-Type': 'application/json' } : {},
        body: corps ? JSON.stringify(corps) : undefined,
        signal: arret ? arret.signal : undefined,
      });
      const donnees = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw Object.assign(new Error(donnees.erreur || 'Erreur ' + reponse.status), { statut: reponse.status });
      return donnees;
    } finally {
      clearTimeout(minuteur);
    }
  }

  // ---------- Contrôles : les mêmes que sur le serveur, sauf le filtre des mots grossiers ----------

  function verifierPseudo(pseudo) {
    const p = String(pseudo === undefined || pseudo === null ? '' : pseudo).normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!p) throw new Error('Le pseudo est obligatoire.');
    if ([...p].length > 16) throw new Error('Pseudo trop long (16 caractères au plus).');
    if (!/^[\p{Script=Latin}0-9][\p{Script=Latin}0-9 ._'-]*$/u.test(p)) throw new Error("Pseudo : lettres, chiffres, espaces et . _ ' - seulement.");
    return p;
  }

  function verifierInfos(infos) {
    if (infos === undefined || infos === null) return {};
    if (typeof infos !== 'object' || Array.isArray(infos)) throw new Error('infos : un objet { clé: valeur } attendu.');
    const entrees = Object.entries(infos);
    if (entrees.length > 8) throw new Error('infos : 8 clés au plus.');
    for (const [cle, v] of entrees) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(cle)) throw new Error('infos : clés en lettres sans accent et chiffres (20 caractères au plus).');
      if (typeof v === 'string') {
        if ([...v].length > 40 || /\p{C}/u.test(v)) throw new Error('infos : textes de 40 caractères au plus.');
      } else if (typeof v !== 'boolean' && !(typeof v === 'number' && isFinite(v))) {
        throw new Error('infos : valeurs texte, nombre ou vrai/faux seulement.');
      }
    }
    return Object.fromEntries(entrees.sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  }
  // Deux infos égales donnent la même clé, quel que soit l'ordre de leurs clés.
  const cleInfos = (infos) => JSON.stringify(Object.keys(infos || {}).sort().map((k) => [k, infos[k]]));

  // Taille du salon (min, max), réglages de la partie (infos) et nom facultatif.
  function verifierReglages(o) {
    o = o || {};
    const entier = (v, defaut, min, max) => {
      const n = v === undefined || v === null ? defaut : Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new Error('Valeur attendue entre ' + min + ' et ' + max + '.');
      return n;
    };
    const min = entier(o.min, 2, 1, MAX_JOUEURS);
    const r = { min, max: entier(o.max, Math.max(min, 2), Math.max(min, 1), MAX_JOUEURS), infos: verifierInfos(o.infos) };
    const nom = String(o.nom === undefined || o.nom === null ? '' : o.nom).normalize('NFC').trim().replace(/\s+/g, ' ');
    if (nom) {
      if ([...nom].length > 30) throw new Error('Nom du salon : 30 caractères au plus.');
      if (!/^[\p{Script=Latin}0-9][\p{Script=Latin}0-9 ._'!?:,#+&()-]*$/u.test(nom)) throw new Error("Nom du salon : lettres, chiffres, espaces et . _ ' - ! ? : , # + & ( ) seulement.");
      r.nom = nom;
    }
    return r;
  }

  // ---------- Scores (mode local : mêmes règles, dans le navigateur) ----------

  function tableauLocal(tableau) {
    return JSON.parse(lire('arcade-scores-' + tableau) || 'null') || { ordre: 'desc', scores: [] };
  }
  function classement(t, nombre) {
    return t.scores.slice(0, nombre).map((s, i) => ({ rang: i + 1, pseudo: s.pseudo, score: s.score, date: s.date }));
  }

  // ---------- Compte du joueur et sauvegardes ----------
  //
  // Chaque sauvegarde a une copie sur l'appareil, par compte (« compte:<pseudo> ») ou sans compte
  // (« invite ») : { donnees, date, base, aEnvoyer }. base = date, sur le compte, de la sauvegarde dont la
  // copie découle. Une copie en attente remplace la sauvegarde du compte seulement si celle-ci n'a pas
  // bougé depuis (sinon la plus récente gagne), et jamais si elle n'a pas de base (partie repartie de zéro
  // faute d'avoir pu charger) : une panne ne fait jamais écraser la progression du joueur.

  const OCTETS_SAUVEGARDE = 256 * 1024;
  let pseudoCompte = null; // connu une fois que le site a répondu
  let compteSur = null; // { pseudo, sur: true } : réponse du site, gardée pour la page
  let demandeCompte = null;
  let echecCompte = 0;
  const pages = {}; // emplacement → { base, incertain } pour cette page
  const files = {}; // emplacement → dernière opération : une seule à la fois par emplacement

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const page = (emplacement) => (pages[emplacement] = pages[emplacement] || { base: undefined, incertain: false });
  function enFile(emplacement, fn) {
    const suite = (files[emplacement] || Promise.resolve()).then(fn, fn);
    files[emplacement] = suite.catch(() => {});
    return suite;
  }

  // Le compte du joueur : { pseudo, sur }. Si le site ne répond pas, on suppose le dernier compte vu sur cet
  // appareil (sur: false) : ses sauvegardes attendent sur l'appareil. On redemande au site 10 s plus tard.
  function compte() {
    if (!enLigne) return Promise.resolve({ pseudo: null, sur: true });
    if (compteSur) return Promise.resolve(compteSur);
    const suppose = () => ({ pseudo: lire('arcade-compte') || null, sur: false });
    if (Date.now() - echecCompte < 10000) return Promise.resolve(suppose());
    if (!demandeCompte) {
      demandeCompte = appeler('GET', 'joueur').then((r) => {
        compteSur = { pseudo: r.pseudo || null, sur: true };
        pseudoCompte = compteSur.pseudo;
        ecrire('arcade-compte', compteSur.pseudo || '');
        return compteSur;
      }, () => {
        echecCompte = Date.now();
        return suppose();
      });
      demandeCompte.then(() => { demandeCompte = null; });
    }
    return demandeCompte;
  }

  // Le joueur connecté sur le site ({ pseudo }), ou null (pas de compte, ou site injoignable).
  function joueur() {
    return compte().then((c) => (c.sur && c.pseudo ? { pseudo: c.pseudo } : null));
  }

  function connexion() {
    if (!enLigne) throw new Error('La connexion à un compte marche une fois le jeu publié sur ' + DOMAINE + '.');
    location.href = 'https://' + DOMAINE + '/compte/?retour=' + encodeURIComponent(location.href);
  }

  function verifierEmplacement(e) {
    const v = e === undefined || e === null || e === '' ? 'principal' : String(e);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(v)) throw new Error("Nom d'emplacement invalide : minuscules, chiffres et tirets (30 caractères au plus).");
    return v;
  }
  const cleInvite = (emplacement) => 'arcade-sauvegarde:invite:' + emplacement;
  const cleCompte = (pseudo, emplacement) => 'arcade-sauvegarde:compte:' + pseudo.toLowerCase() + ':' + emplacement;
  function lireCopie(cle) {
    try { return JSON.parse(lire(cle) || 'null'); } catch (e) { return null; }
  }
  const ecrireCopie = (cle, copie) => ecrire(cle, JSON.stringify(copie));
  const resultat = (s, source) => (s ? { donnees: s.donnees, date: s.date, source } : null);

  // La sauvegarde du compte, ou null s'il n'y en a pas. Erreur si le site ne répond pas, après quelques
  // essais en cas de panne passagère (réseau, redémarrage du serveur).
  async function lireCompte(emplacement, essais) {
    for (let essai = 1; ; essai += 1) {
      try {
        return await appeler('GET', 'sauvegarde?emplacement=' + encodeURIComponent(emplacement));
      } catch (e) {
        if (e.statut === 404) return null;
        const passagere = !e.statut || e.statut >= 500 || e.statut === 429;
        if (!passagere || essai >= essais) throw e;
        await pause(essai === 1 ? 500 : 1500);
      }
    }
  }

  // La copie en attente remplace-t-elle la sauvegarde du compte ?
  const gagne = (copie, serveur) => !serveur || serveur.date === copie.base || (Boolean(copie.base) && copie.date > serveur.date);

  async function sauvegarder(donnees, options) {
    const emplacement = verifierEmplacement((options || {}).emplacement);
    if (donnees === undefined) throw new Error('Rien à sauvegarder.');
    if (new TextEncoder().encode(JSON.stringify(donnees)).length > OCTETS_SAUVEGARDE) throw new Error('Sauvegarde trop grosse (256 Ko au plus).');
    return enFile(emplacement, async () => {
      const c = await compte();
      const date = new Date().toISOString();
      if (!c.pseudo) {
        ecrireCopie(cleInvite(emplacement), { donnees, date });
        return { enLigne: false, date };
      }
      const p = page(emplacement);
      const cle = cleCompte(c.pseudo, emplacement);
      // Le chargement avait raté et le site répond de nouveau : on n'écrit que si le compte n'a pas bougé.
      if (c.sur && p.incertain) {
        try {
          const serveur = await lireCompte(emplacement, 1);
          if (!serveur || serveur.date === p.base) p.incertain = false;
        } catch (e) { /* toujours injoignable */ }
      }
      if (c.sur && !p.incertain) {
        try {
          const r = await appeler('PUT', 'sauvegarde', { emplacement, donnees });
          ecrireCopie(cle, { donnees, date: r.date, base: r.date });
          p.base = r.date;
          return { enLigne: true, date: r.date };
        } catch (e) {
          // Sauvegarde refusée (invalide) : le jeu doit le savoir. Sinon (réseau, serveur, session
          // expirée), la copie attend sur l'appareil et part au prochain chargement.
          if (e.statut === 400 || e.statut === 413) throw e;
        }
      }
      ecrireCopie(cle, { donnees, date, base: p.base || null, aEnvoyer: true });
      return { enLigne: false, date };
    });
  }

  async function charger(options) {
    const emplacement = verifierEmplacement((options || {}).emplacement);
    return enFile(emplacement, async () => {
      const c = await compte();
      const p = page(emplacement);
      if (!c.pseudo) {
        p.base = undefined;
        return resultat(lireCopie(cleInvite(emplacement)), 'appareil');
      }
      const cle = cleCompte(c.pseudo, emplacement);
      let copie = lireCopie(cle);
      // Site injoignable : ce qu'il y a sur l'appareil pour ce compte, sans rien écraser ensuite.
      const surAppareil = () => {
        p.incertain = true;
        p.base = copie ? copie.base || null : null;
        return resultat(copie, 'appareil');
      };
      if (!c.sur) return surAppareil();
      let serveur;
      try {
        serveur = await lireCompte(emplacement, 3);
      } catch (e) {
        return surAppareil();
      }
      p.incertain = false;
      // Première connexion sur cet appareil : la partie faite sans compte passe à ce compte, d'abord sur
      // l'appareil, pour qu'aucun autre compte ne la reprenne si l'envoi échoue.
      const invite = lireCopie(cleInvite(emplacement));
      if (!serveur && !copie && invite) {
        copie = { donnees: invite.donnees, date: invite.date, base: null, aEnvoyer: true };
        ecrireCopie(cle, copie);
        oublier(cleInvite(emplacement));
      }
      if (copie && copie.aEnvoyer && gagne(copie, serveur)) {
        try {
          const r = await appeler('PUT', 'sauvegarde', { emplacement, donnees: copie.donnees });
          ecrireCopie(cle, { donnees: copie.donnees, date: r.date, base: r.date });
          p.base = r.date;
          return { donnees: copie.donnees, date: r.date, source: 'compte' };
        } catch (e) {
          p.base = copie.base || null;
          return resultat(copie, 'appareil');
        }
      }
      if (!serveur) { // rien sur le compte (effacée depuis la page « Mon compte »)
        oublier(cle);
        p.base = null;
        return null;
      }
      ecrireCopie(cle, { donnees: serveur.donnees, date: serveur.date, base: serveur.date });
      p.base = serveur.date;
      return resultat(serveur, 'compte');
    });
  }

  // ---------- Multijoueur : transports ----------

  function transportEnLigne() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://' + location.host + '/_arcade/salons');
      const t = { envoyer: (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, fermer: () => ws.close(), surMessage: null, surFermeture: null };
      let ouvert = false;
      ws.onopen = () => { ouvert = true; resolve(t); };
      ws.onerror = () => { if (!ouvert) reject(new Error('Connexion au serveur de jeu impossible.')); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (t.surMessage) t.surMessage(m); };
      ws.onclose = () => { if (ouvert && t.surFermeture) t.surFermeture(); };
    });
  }

  // Hors du site : les onglets du même navigateur jouent ensemble (BroadcastChannel), avec les mêmes
  // règles qu'en ligne. Chaque salon est tenu par l'onglet de son hôte ; quand l'hôte s'en va, le salon
  // passe à l'onglet du nouvel hôte. Pas de coupure réseau ici : fermer l'onglet, c'est quitter.
  function transportLocal() {
    if (typeof BroadcastChannel === 'undefined') return Promise.reject(new Error('Le multijoueur marche une fois le jeu publié sur ' + DOMAINE + '.'));
    const canal = new BroadcastChannel('arcade-salons:' + location.pathname);
    const id = Math.random().toString(36).slice(2, 10);
    const connus = new Map(); // onglet → salons publics qu'il propose
    const miens = new Map(); // code → salon tenu par cet onglet
    const relais = new Map(); // joueur → onglet qui tient désormais son salon (après un changement d'hôte)
    const DEMANDE = '…'; // proprio pendant une demande d'entrée dans un salon
    let proprio = null; // onglet qui tient mon salon
    let rapide = null; // partie rapide en cours : si le salon choisi refuse, on en crée un
    let delai = null;
    const t = { surMessage: null, surFermeture: null };

    const livrer = (m) => setTimeout(() => { if (t.surMessage) t.surMessage(typeof m === 'function' ? m() : m); }, 0);
    const hall = () => [].concat(...connus.values());
    const montrerHall = () => livrer(() => ({ t: 'salons', salons: hall() }));
    const etat = (s) => ({ code: s.code, nom: s.nom, prive: s.prive, infos: s.infos, etat: s.etat, min: s.min, max: s.max, hote: s.hote,
      joueurs: s.joueurs.map((j) => ({ id: j.id, pseudo: j.pseudo, connecte: true })) });

    // Message pour cet onglet, venu de l'onglet « de ».
    function recevoir(m, de) {
      if (proprio === DEMANDE && (m.t === 'entree' || m.t === 'erreur')) {
        clearTimeout(delai);
        proprio = null;
        const r = rapide;
        rapide = null;
        if (m.t === 'erreur' && r) return creer(r); // le salon choisi pour la partie rapide a refusé
      }
      if (m.t === 'entree') proprio = de;
      if (m.t === 'sorti' || m.t === 'exclu' || m.t === 'ferme') proprio = null;
      livrer(m);
      if (!proprio && (m.t === 'sorti' || m.t === 'exclu' || m.t === 'ferme')) montrerHall();
    }
    const vers = (onglet, m) => (onglet === id ? recevoir(m, id) : canal.postMessage({ a: onglet, de: id, m }));
    const diffuser = (s, evenement) => s.joueurs.forEach((j) => vers(j.id, { t: 'salon', salon: etat(s), evenement }));
    const erreur = (de, action, message) => vers(de, { t: 'erreur', action, message });
    const publier = () => {
      const liste = [...miens.values()].filter((s) => !s.prive && s.etat === 'attente' && s.joueurs.length < s.max)
        .map((s) => ({ code: s.code, nom: s.nom, joueurs: s.joueurs.map((j) => j.pseudo), min: s.min, max: s.max, infos: s.infos }));
      connus.set(id, liste);
      canal.postMessage({ hall: id, liste });
    };
    const annoncer = () => { publier(); if (!proprio) montrerHall(); };

    function creer(m) {
      const code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
      const s = { code, nom: m.nom || 'Salon de ' + m.pseudo, prive: Boolean(m.prive), infos: m.infos, etat: 'attente',
        min: m.min, max: m.max, hote: id, joueurs: [{ id, pseudo: m.pseudo }], exclus: [] };
      miens.set(code, s);
      vers(id, { t: 'entree', moi: { id, jeton: '' }, salon: etat(s) });
      annoncer();
    }

    // Demandes reçues par l'onglet qui tient le salon : il joue le rôle du serveur.
    function traiter(de, m) {
      const s = m.t === 'rejoindre' ? miens.get(m.code) : [...miens.values()].find((x) => x.joueurs.some((j) => j.id === de));
      if (!s && m.t !== 'rejoindre' && relais.has(de)) return canal.postMessage({ a: relais.get(de), de, req: m }); // salon passé au nouvel hôte
      if (!s) return erreur(de, m.t, m.t === 'rejoindre' ? 'Salon introuvable : vérifie le code, ou il vient de fermer.' : "Tu n'es dans aucun salon.");
      if (m.t === 'rejoindre') {
        if (s.exclus.includes(de)) return erreur(de, m.t, "L'hôte de ce salon ne t'a pas accepté.");
        if (s.etat !== 'attente') return erreur(de, m.t, 'La partie a déjà commencé dans ce salon.');
        if (s.joueurs.length >= s.max) return erreur(de, m.t, 'Ce salon est complet.');
        if (s.joueurs.some((j) => j.pseudo.toLowerCase() === m.pseudo.toLowerCase())) return erreur(de, m.t, 'Ce pseudo est déjà pris dans ce salon : choisis-en un autre.');
        s.joueurs.push({ id: de, pseudo: m.pseudo });
        vers(de, { t: 'entree', moi: { id: de, jeton: '' }, salon: etat(s) });
        diffuser(s, { type: 'arrivee', id: de });
        return annoncer();
      }
      if (m.t === 'lancer') {
        if (de !== s.hote) return erreur(de, m.t, "Seul l'hôte peut faire ça.");
        if (s.etat !== 'attente') return erreur(de, m.t, 'La partie est déjà lancée.');
        if (s.joueurs.length < s.min) return erreur(de, m.t, 'Il faut au moins ' + s.min + ' joueurs.');
        s.etat = 'en-cours';
        diffuser(s, { type: 'lancement' });
        return annoncer();
      }
      if (m.t === 'envoyer') {
        const message = { t: 'message', de, d: m.d };
        if (m.a === undefined || m.a === null) return s.joueurs.forEach((j) => { if (j.id !== de) vers(j.id, message); });
        if (!s.joueurs.some((j) => j.id === String(m.a))) return erreur(de, m.t, 'Joueur introuvable dans ce salon.');
        return vers(String(m.a), message);
      }
      if (m.t === 'exclure' || m.t === 'quitter') {
        const cible = m.t === 'exclure' ? String(m.id) : de;
        if (m.t === 'exclure') {
          if (de !== s.hote) return erreur(de, m.t, "Seul l'hôte peut faire ça.");
          if (cible === de || !s.joueurs.some((j) => j.id === cible)) return erreur(de, m.t, 'Joueur introuvable dans ce salon.');
          s.exclus.push(cible);
        }
        vers(cible, { t: m.t === 'exclure' ? 'exclu' : 'sorti' });
        s.joueurs = s.joueurs.filter((j) => j.id !== cible);
        if (!s.joueurs.length) { miens.delete(s.code); return annoncer(); }
        const ancien = s.hote;
        if (cible === ancien) {
          // L'hôte s'en va : le plus ancien des autres joueurs prend le relais, et son onglet tient le salon.
          s.hote = s.joueurs[0].id;
          miens.delete(s.code);
          s.joueurs.forEach((j) => relais.set(j.id, s.hote));
          canal.postMessage({ transfert: s });
        }
        diffuser(s, { type: m.t === 'exclure' ? 'exclu' : 'depart', id: cible });
        if (s.hote !== ancien) diffuser(s, { type: 'hote', id: s.hote });
        return annoncer();
      }
      return erreur(de, m.t, 'Action inconnue.');
    }

    canal.onmessage = ({ data: d }) => {
      if (d.qui) publier();
      else if (d.hall) { connus.set(d.hall, d.liste); if (!proprio) montrerHall(); }
      else if (d.cherche) { if (miens.has(d.cherche)) traiter(d.de, d.req); }
      else if (d.transfert) {
        const s = d.transfert;
        if (s.hote === id) { miens.set(s.code, s); publier(); }
        if (s.joueurs.some((j) => j.id === id)) proprio = s.hote;
      } else if (d.parti) {
        connus.delete(d.parti);
        for (const s of [...miens.values()]) if (s.joueurs.some((j) => j.id === d.parti)) traiter(d.parti, { t: 'quitter' });
        if (proprio === d.parti) recevoir({ t: 'ferme', raison: 'hote-parti' }, d.parti);
        else if (!proprio) montrerHall();
      } else if (d.a === id && d.m) recevoir(d.m, d.de);
      else if (d.a === id && d.req) traiter(d.de, d.req);
    };

    t.envoyer = (m) => {
      if (m.t === 'lister') { canal.postMessage({ qui: id }); publier(); return montrerHall(); }
      if (m.t === 'creer' || m.t === 'rejoindre' || m.t === 'rapide') {
        if (proprio) return livrer({ t: 'erreur', action: m.t, message: "Tu es déjà dans un salon : quitte-le d'abord." });
        if (m.t === 'creer') return creer(m);
        let demande = m;
        if (m.t === 'rapide') {
          const cle = cleInfos(m.infos);
          const pseudo = m.pseudo.toLowerCase();
          const libre = hall().filter((s) => s.min === m.min && s.max === m.max && cleInfos(s.infos) === cle
            && !s.joueurs.some((p) => p.toLowerCase() === pseudo)).sort((a, b) => b.joueurs.length - a.joueurs.length)[0];
          if (!libre) return creer(Object.assign({}, m, { prive: false }));
          rapide = m;
          demande = { t: 'rejoindre', code: libre.code, pseudo: m.pseudo };
        }
        // On ne sait pas quel onglet tient ce code : on demande à tous, seul celui qui le tient répond.
        proprio = DEMANDE;
        delai = setTimeout(() => {
          if (proprio === DEMANDE) recevoir({ t: 'erreur', action: demande.t, message: 'Salon introuvable : vérifie le code, ou il vient de fermer.' }, null);
        }, 500);
        return canal.postMessage({ cherche: demande.code, de: id, req: demande });
      }
      if (!proprio || proprio === DEMANDE) return livrer({ t: 'erreur', action: m.t, message: "Tu n'es dans aucun salon." });
      if (proprio === id) return traiter(id, m);
      canal.postMessage({ a: proprio, de: id, req: m });
    };
    t.fermer = () => {
      clearTimeout(delai);
      for (const s of [...miens.values()]) traiter(id, { t: 'quitter' });
      canal.postMessage({ parti: id });
      canal.close();
    };
    addEventListener('pagehide', () => { try { t.fermer(); } catch (e) { /* déjà fermé */ } });
    return Promise.resolve(t);
  }

  // ---------- Multijoueur : connexion ----------

  class Multijoueur {
    constructor() {
      this.salons = [];
      this.salon = null;
      this.moi = null;
      this._ecouteurs = {};
      this._jeton = null;
      this._attente = null;
      this._volontaire = false;
    }

    on(type, fn) { (this._ecouteurs[type] = this._ecouteurs[type] || []).push(fn); return this; }
    off(type, fn) { this._ecouteurs[type] = (this._ecouteurs[type] || []).filter((f) => f !== fn); return this; }
    emettre(type, ...args) {
      for (const fn of (this._ecouteurs[type] || []).slice()) { try { fn(...args); } catch (e) { console.error(e); } }
    }

    get estHote() { return Boolean(this.salon && this.salon.hote === this.moi); }
    get joueurs() { return this.salon ? this.salon.joueurs : []; }
    joueur(id) { return this.joueurs.find((j) => j.id === id) || null; }

    async _ouvrir() {
      this._t = await (enLigne ? transportEnLigne() : transportLocal());
      this._t.surMessage = (m) => this._recevoir(m);
      this._t.surFermeture = () => this._coupure();
    }

    _demander(m, fin) {
      if (this._attente) this._attente.reject(new Error('Demande remplacée.'));
      return new Promise((resolve, reject) => {
        this._attente = { action: m.t, fin, resolve, reject };
        this._t.envoyer(m);
      });
    }

    _recevoir(m) {
      const a = this._attente;
      if (m.t === 'erreur') {
        if (m.action === 'reprendre') { this.salon = null; this.emettre('ferme', 'connexion'); return; }
        if (a && m.action === a.action) { this._attente = null; a.reject(new Error(m.message)); } else this.emettre('erreur', m.message);
        return;
      }
      if (m.t === 'salons') { this.salons = m.salons; this.emettre('salons', m.salons); }
      else if (m.t === 'entree') {
        this.salon = m.salon; this.moi = m.moi.id; this._jeton = m.moi.jeton;
        this.emettre('joueurs', this.joueurs);
        if (m.reprise) this.emettre('connexion', 'retrouvee');
      } else if (m.t === 'salon') {
        const avant = this.salon;
        this.salon = m.salon;
        const e = m.evenement || {};
        const j = this.joueur(e.id) || (avant && avant.joueurs.find((x) => x.id === e.id)) || null;
        this.emettre('joueurs', this.joueurs);
        if (e.type === 'lancement') this.emettre('lancement');
        else if (e.type) this.emettre(e.type === 'exclu' ? 'depart' : e.type, j);
      } else if (m.t === 'message') this.emettre('message', m.d, m.de, this.joueur(m.de));
      else if (m.t === 'sorti' || m.t === 'exclu' || m.t === 'ferme') {
        this.salon = null; this.moi = null; this._jeton = null;
        this.emettre(m.t, m.raison);
      }
      if (a && a.fin(m)) { this._attente = null; a.resolve(m); }
    }

    // Coupure réseau : on se reconnecte et on reprend sa place (le serveur la garde une minute).
    async _coupure() {
      if (this._volontaire) return;
      this.emettre('connexion', 'perdue');
      const debut = Date.now();
      for (let pause = 1000; Date.now() - debut < 55000; pause = Math.min(pause * 2, 8000)) {
        await new Promise((r) => setTimeout(r, pause));
        try { await this._ouvrir(); } catch (e) { continue; }
        if (this.salon && this._jeton) this._t.envoyer({ t: 'reprendre', code: this.salon.code, jeton: this._jeton });
        else { this._t.envoyer({ t: 'lister' }); this.emettre('connexion', 'retrouvee'); }
        return;
      }
      this.salon = null;
      this.emettre('ferme', 'connexion');
    }

    _entrer(m) {
      if (this.salon) return Promise.reject(new Error("Tu es déjà dans un salon : quitte-le d'abord."));
      return this._demander(m, (r) => r.t === 'entree').then(() => { Arcade.memoriserPseudo(m.pseudo); return this; });
    }

    lister() { this._t.envoyer({ t: 'lister' }); }
    // Partie rapide : rejoint un salon public en attente aux mêmes réglages, sinon en crée un.
    async rapide(pseudo, options) {
      return this._entrer(Object.assign({ t: 'rapide', pseudo: verifierPseudo(pseudo) }, verifierReglages(options)));
    }
    async creer(pseudo, options) {
      const prive = Boolean(options && options.prive);
      return this._entrer(Object.assign({ t: 'creer', pseudo: verifierPseudo(pseudo) }, verifierReglages(options), { prive }));
    }
    async rejoindre(code, pseudo) {
      const c = String(code === undefined || code === null ? '' : code).toUpperCase().trim();
      return this._entrer({ t: 'rejoindre', code: c, pseudo: verifierPseudo(pseudo) });
    }
    lancer() { return this._demander({ t: 'lancer' }, (m) => m.t === 'salon' && m.evenement && m.evenement.type === 'lancement'); }
    envoyer(donnees, a) {
      const m = { t: 'envoyer', d: donnees, a };
      if (new TextEncoder().encode(JSON.stringify(m)).length > TAILLE_MESSAGE) throw new Error('Message trop gros (16 Ko au plus).');
      this._t.envoyer(m);
    }
    exclure(id) { this._t.envoyer({ t: 'exclure', id }); }
    async quitter() {
      if (this.salon) await this._demander({ t: 'quitter' }, (m) => m.t === 'sorti');
    }
    fermer() { this._volontaire = true; this._t.fermer(); }
  }

  // ---------- Multijoueur : écran de salon d'attente tout prêt ----------

  const STYLE = `
    :host { all: initial; }
    .fond { position: fixed; inset: 0; background: rgba(5, 5, 20, .88); display: flex; align-items: center; justify-content: center;
      font: 16px/1.4 system-ui, sans-serif; color: #fff; }
    .boite { width: min(440px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto; box-sizing: border-box;
      background: #14142b; border: 2px solid var(--c); border-radius: 14px; padding: 20px; box-shadow: 0 0 30px var(--c); }
    h1 { margin: 0 0 14px; font-size: 20px; text-align: center; color: var(--c); }
    h2 { font-size: 15px; margin: 16px 0 8px; color: #bbb; font-weight: 600; }
    input { font: inherit; padding: 9px 10px; border-radius: 8px; border: 1px solid #555; background: #0b0b1a; color: #fff; min-width: 0; flex: 1; }
    button { font: inherit; padding: 9px 14px; border-radius: 8px; border: 0; background: #33335a; color: #fff; cursor: pointer; }
    button.principal { background: var(--c); color: #000; font-weight: 700; }
    button.large { width: 100%; flex: 1; }
    button:disabled { opacity: .45; cursor: default; }
    .ligne { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .salon { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 9px 10px; border-radius: 8px; background: #1e1e3c; margin-bottom: 6px; }
    .salon small, .doux { color: #aaa; }
    .code { font: 700 34px monospace; letter-spacing: 6px; text-align: center; color: var(--c); margin: 4px 0; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #2a2a4a; }
    .erreur { color: #ff6b6b; min-height: 1.4em; margin: 12px 0 0; }
    .bas { display: flex; gap: 8px; justify-content: space-between; margin-top: 16px; flex-wrap: wrap; }
  `;

  function el(tag, props, ...enfants) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'disabled') e.disabled = Boolean(v);
      else e.setAttribute(k, v);
    }
    for (const c of enfants.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
    return e;
  }

  async function salonAttente(options) {
    options = options || {};
    const min = options.min || 2;
    const reglages = verifierReglages({ min, max: Math.max(options.max || 4, min), infos: options.infos });
    // Seuls les salons aux mêmes réglages que ce jeu-ci sont proposés.
    const compatible = (s) => s.min === reglages.min && s.max === reglages.max && cleInfos(s.infos) === cleInfos(reglages.infos);
    const c = await Arcade.connecter();
    const hoteDom = el('div', { style: 'position:fixed;inset:0;z-index:2147483647' });
    const racine = hoteDom.attachShadow({ mode: 'open' });
    const ecran = el('div');
    const erreur = el('p', { class: 'erreur' });
    racine.append(el('style', {}, STYLE),
      el('div', { class: 'fond', style: '--c:' + (options.couleur || '#ff2bd6') },
        el('div', { class: 'boite' }, el('h1', {}, options.titre || document.title || 'Multijoueur'), ecran, erreur)));
    document.body.append(hoteDom);

    let pseudo = Arcade.pseudo() || '';
    let vue = 'pseudo';
    let liste = null; // liste des salons de la vue « hall », seule mise à jour quand elle change
    const dire = (texte) => { erreur.textContent = texte || ''; };
    const essayer = async (fn) => { dire(''); try { await fn(); } catch (e) { dire(e.message); } };

    return new Promise((resolve) => {
      const finir = (resultat) => { hoteDom.remove(); resolve(resultat); };
      const annuler = el('button', { onclick: () => { c.fermer(); finir(null); } }, 'Annuler');
      const entrer = (fn) => essayer(async () => { await fn(); vue = 'salon'; afficher(); });

      function remplirListe() {
        const salons = c.salons.filter(compatible).map((s) => el('div', { class: 'salon' },
          el('div', {}, el('div', {}, s.nom), el('small', {}, s.joueurs.join(', ') + ' · ' + s.joueurs.length + '/' + s.max)),
          el('button', { class: 'principal', onclick: () => entrer(() => c.rejoindre(s.code, pseudo)) }, 'Rejoindre')));
        liste.replaceChildren(...(salons.length ? salons : [el('p', { class: 'doux' }, 'Aucun salon pour le moment : crée le tien !')]));
      }

      function afficher() {
        if (vue === 'pseudo') {
          const champ = el('input', { value: pseudo, maxlength: '16', placeholder: 'Ton pseudo', autocomplete: 'nickname' });
          const valider = () => { pseudo = champ.value.trim(); if (!pseudo) return dire('Choisis un pseudo.'); dire(''); vue = 'hall'; afficher(); };
          champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
          ecran.replaceChildren(el('h2', {}, 'Ton pseudo'), el('div', { class: 'ligne' }, champ, el('button', { class: 'principal', onclick: valider }, 'OK')),
            el('div', { class: 'bas' }, annuler));
          setTimeout(() => champ.focus(), 0);
        } else if (vue === 'hall') {
          const code = el('input', { maxlength: '4', placeholder: 'CODE', style: 'text-transform:uppercase' });
          liste = el('div');
          remplirListe();
          ecran.replaceChildren(
            el('div', { class: 'ligne doux' }, 'Pseudo : ', el('strong', {}, pseudo), el('button', { onclick: () => { vue = 'pseudo'; afficher(); } }, 'Changer')),
            el('div', { class: 'ligne' }, el('button', { class: 'principal large', onclick: () => entrer(() => c.rapide(pseudo, reglages)) }, '⚡ Partie rapide')),
            el('h2', {}, 'Salons ouverts'),
            liste,
            el('div', { class: 'ligne' },
              el('button', { class: 'large', onclick: () => entrer(() => c.creer(pseudo, reglages)) }, '+ Créer un salon'),
              el('button', { class: 'large', onclick: () => entrer(() => c.creer(pseudo, Object.assign({ prive: true }, reglages))) }, '🔒 Salon privé')),
            el('h2', {}, 'Un ami t\'a donné un code ?'),
            el('div', { class: 'ligne' }, code, el('button', { onclick: () => entrer(() => c.rejoindre(code.value, pseudo)) }, 'Rejoindre')),
            el('div', { class: 'bas' }, annuler));
        } else if (vue === 'salon' && c.salon) {
          const s = c.salon;
          const lancer = el('button', { class: 'principal', disabled: s.joueurs.length < s.min, onclick: () => essayer(() => c.lancer()) }, 'Lancer la partie');
          ecran.replaceChildren(
            el('div', { class: 'doux', style: 'text-align:center' }, s.prive ? '🔒 Salon privé : seuls ceux qui ont le code peuvent entrer.' : 'Code du salon, à donner à tes amis :'),
            el('div', { class: 'code' }, s.code),
            el('h2', {}, 'Joueurs (' + s.joueurs.length + '/' + s.max + ')'),
            el('ul', {}, s.joueurs.map((j) => el('li', {},
              el('span', {}, j.pseudo + (j.id === s.hote ? ' 👑' : '') + (j.id === c.moi ? ' (toi)' : '') + (j.connecte ? '' : ' …')),
              c.estHote && j.id !== c.moi ? el('button', { title: 'Retirer du salon', onclick: () => c.exclure(j.id) }, '✕') : null))),
            el('div', { class: 'bas' },
              el('button', { onclick: () => essayer(async () => { await c.quitter(); vue = 'hall'; afficher(); }) }, 'Quitter'),
              c.estHote ? lancer : el('span', { class: 'doux' }, s.joueurs.length < s.min ? 'En attente de joueurs…' : 'L\'hôte va lancer la partie…')));
        }
      }

      c.on('salons', () => { if (vue === 'hall') remplirListe(); });
      c.on('joueurs', () => { if (vue === 'salon') afficher(); });
      c.on('exclu', () => { if (vue === 'partie') return; vue = 'hall'; afficher(); dire('L\'hôte t\'a retiré du salon.'); });
      c.on('ferme', () => { if (vue === 'salon') { vue = 'hall'; afficher(); dire('Le salon a fermé.'); } });
      c.on('lancement', () => { if (vue === 'salon') { vue = 'partie'; finir(c); } });
      afficher();
    });
  }

  // ---------- API publique ----------

  const Arcade = {
    enLigne,
    jeu: enLigne ? hote.slice(0, -DOMAINE.length - 1) : null,

    // Connecté sur le site : le pseudo du compte ; sinon le dernier pseudo utilisé.
    pseudo: () => pseudoCompte || lire('arcade-pseudo'),
    memoriserPseudo: (pseudo) => ecrire('arcade-pseudo', String(pseudo).trim().slice(0, 16)),

    async envoyerScore(score, options) {
      options = options || {};
      const pseudo = verifierPseudo(options.pseudo || Arcade.pseudo());
      const tableau = options.tableau || 'principal';
      let resultat;
      if (enLigne) {
        resultat = await appeler('POST', 'scores', { score, pseudo, tableau, ordre: options.ordre });
      } else {
        const t = tableauLocal(tableau);
        if (!t.scores.length && options.ordre) t.ordre = options.ordre;
        const entree = { pseudo, score: Number(score), date: new Date().toISOString() };
        t.scores.push(entree);
        t.scores.sort((a, b) => (t.ordre === 'asc' ? a.score - b.score : b.score - a.score) || a.date.localeCompare(b.date));
        t.scores = t.scores.slice(0, 100);
        ecrire('arcade-scores-' + tableau, JSON.stringify(t));
        const index = t.scores.indexOf(entree);
        resultat = { tableau, ordre: t.ordre, rang: index >= 0 ? index + 1 : null, record: index === 0, scores: classement(t, 10) };
      }
      Arcade.memoriserPseudo(pseudo);
      resultat.enLigne = enLigne;
      return resultat;
    },

    async meilleursScores(options) {
      options = options || {};
      const tableau = options.tableau || 'principal';
      const nombre = options.nombre || 10;
      if (enLigne) {
        const r = await appeler('GET', 'scores?tableau=' + encodeURIComponent(tableau) + '&nombre=' + encodeURIComponent(nombre));
        return r.scores;
      }
      return classement(tableauLocal(tableau), nombre);
    },

    async connecter() {
      const c = new Multijoueur();
      await c._ouvrir();
      c.lister();
      return c;
    },

    salonAttente,

    joueur,
    connexion,
    charger,
    sauvegarder,
  };

  // Connecté sur le site : son pseudo est proposé d'office (scores, multijoueur).
  compte();

  window.Arcade = Arcade;
})();
