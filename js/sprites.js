// Dessin vectoriel des bestioles (aucune image : net à tous les zooms).
// Repère : pieds en (0, 0), y vers le bas, bestiole tournée vers la droite (on retourne pour la gauche).

const C = {
  body: '#7d86ff', bodyDark: '#5660e0', belly: '#d5d9ff', line: '#1c1e4a',
  hair: '#4fe06d', hairDark: '#23a046', feet: '#ffb347', feetDark: '#d9822b',
  umbrella: ['#ff5d8f', '#ffd23f', '#4fc3ff', '#7cf07c'],
};
export const LEM_COLORS = C;

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function limb(ctx, x, y, len, ang, w = 1.5, color = C.body) {
  ctx.strokeStyle = C.line;
  ctx.lineCap = 'round';
  ctx.lineWidth = w + 0.9;
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  return [ex, ey];
}

function hand(ctx, x, y) {
  ell(ctx, x, y, 1.1, 1.1);
  ctx.fillStyle = C.body; ctx.fill();
  ctx.lineWidth = 0.5; ctx.strokeStyle = C.line; ctx.stroke();
}

// pose : { bob, lean, legA, legB, armF, armB, eyes, hairUp, squash, tool, toolAng, worried }
export function drawBody(ctx, p) {
  const bob = p.bob || 0;
  const sq = p.squash || 1;
  ctx.save();
  if (p.lean) { ctx.translate(0, 0); ctx.rotate(p.lean); }

  // pieds
  const fy = -0.9;
  for (const [dx, lift] of [[-2.2, p.legB || 0], [2.2, p.legA || 0]]) {
    ell(ctx, dx + (lift > 0 ? 0.6 : 0), fy - Math.max(0, lift), 2.3, 1.3);
    ctx.fillStyle = C.feet; ctx.fill();
    ctx.lineWidth = 0.55; ctx.strokeStyle = C.line; ctx.stroke();
  }

  ctx.translate(0, bob);
  ctx.scale(1 / Math.sqrt(sq), sq);

  // bras arrière
  const armB = p.armB ?? 1.9;
  const hb = limb(ctx, -2.5, -8, 3.6, armB);
  hand(ctx, hb[0], hb[1]);

  // corps
  ell(ctx, 0, -7.2, 5.1, 6.3);
  const g = ctx.createLinearGradient(0, -13.5, 0, -1);
  g.addColorStop(0, C.body); g.addColorStop(1, C.bodyDark);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 0.75; ctx.strokeStyle = C.line; ctx.stroke();
  ell(ctx, 1.1, -5.4, 3.1, 3.5);
  ctx.fillStyle = C.belly; ctx.fill();

  // touffe
  const up = p.hairUp ? -2.2 : 0;
  ctx.beginPath();
  ctx.moveTo(-3.6, -11.8);
  ctx.quadraticCurveTo(-4.6, -15.5 + up, -2.2, -16.4 + up);
  ctx.quadraticCurveTo(-1.6, -14.4, -0.4, -14);
  ctx.quadraticCurveTo(0.1, -18.2 + up, 2.4, -17.6 + up);
  ctx.quadraticCurveTo(1.8, -15.4, 2.6, -14.2);
  ctx.quadraticCurveTo(4.6, -16 + up, 5.6, -14.6 + up);
  ctx.quadraticCurveTo(4.6, -13, 3.8, -11.6);
  ctx.closePath();
  ctx.fillStyle = C.hair; ctx.fill();
  ctx.lineWidth = 0.6; ctx.strokeStyle = C.hairDark; ctx.stroke();

  // yeux
  const eyes = p.eyes || 'open';
  for (const [ex, ey, r] of [[0.9, -9.4, 1.75], [3.7, -9.2, 1.55]]) {
    if (eyes === 'closed' || eyes === 'happy') {
      ctx.beginPath();
      ctx.lineWidth = 0.7; ctx.strokeStyle = C.line;
      if (eyes === 'happy') ctx.arc(ex, ey + 0.4, r * 0.8, Math.PI * 1.1, Math.PI * 1.9);
      else { ctx.moveTo(ex - r * 0.8, ey); ctx.lineTo(ex + r * 0.8, ey); }
      ctx.stroke();
      continue;
    }
    if (eyes === 'x') {
      ctx.lineWidth = 0.7; ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(ex - 1, ey - 1); ctx.lineTo(ex + 1, ey + 1);
      ctx.moveTo(ex + 1, ey - 1); ctx.lineTo(ex - 1, ey + 1);
      ctx.stroke();
      continue;
    }
    const big = eyes === 'scared' ? 1.25 : 1;
    ell(ctx, ex, ey, r * big, r * big * 1.12);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 0.45; ctx.strokeStyle = C.line; ctx.stroke();
    const px = p.look ?? 0.55, py = p.lookY ?? 0;
    ell(ctx, ex + px, ey + py, r * 0.52, r * 0.6);
    ctx.fillStyle = '#16163a'; ctx.fill();
    ell(ctx, ex + px + 0.35, ey + py - 0.4, r * 0.18, r * 0.18);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
  if (eyes === 'stern') { // sourcils froncés
    ctx.lineWidth = 0.8; ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(-0.6, -11.8); ctx.lineTo(2, -10.9); ctx.moveTo(5, -11.7); ctx.lineTo(2.9, -10.8); ctx.stroke();
  }
  if (p.mouth) {
    ctx.lineWidth = 0.6; ctx.strokeStyle = C.line;
    ctx.beginPath();
    if (p.mouth === 'o') { ell(ctx, 2.6, -6.6, 0.9, 1.1); ctx.fillStyle = '#5a1530'; ctx.fill(); }
    else if (p.mouth === 'smile') { ctx.arc(2.4, -7.2, 1.4, 0.2, Math.PI - 0.2); ctx.stroke(); }
    else if (p.mouth === 'flat') { ctx.moveTo(1.4, -6.5); ctx.lineTo(3.6, -6.5); ctx.stroke(); }
  }

  // outil et bras avant
  const armF = p.armF ?? 1.3;
  const hf = limb(ctx, 2.6, -7.8, 3.6, armF);
  if (p.tool) drawTool(ctx, p.tool, hf[0], hf[1], p.toolAng ?? armF);
  hand(ctx, hf[0], hf[1]);
  ctx.restore();
}

function drawTool(ctx, tool, x, y, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  if (tool === 'pick') {
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.strokeStyle = '#c9d3e0'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(5.6, -3.2); ctx.quadraticCurveTo(7.4, 0, 5.6, 3.2); ctx.stroke();
  } else if (tool === 'shovel') {
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(5, 0); ctx.stroke();
    ctx.fillStyle = '#c9d3e0';
    ctx.beginPath(); ctx.moveTo(5, -1.8); ctx.lineTo(8.5, -1.2); ctx.lineTo(8.5, 1.2); ctx.lineTo(5, 1.8); ctx.fill();
  } else if (tool === 'brick') {
    ctx.rotate(-ang);
    ctx.fillStyle = '#e8a15a'; ctx.fillRect(-1, -1.6, 4.5, 2.2);
    ctx.fillStyle = '#ffd19a'; ctx.fillRect(-1, -1.6, 4.5, 0.6);
  } else if (tool === 'glove') {
    ell(ctx, 0, 0, 1.6, 1.6); ctx.fillStyle = '#ff5d5d'; ctx.fill();
  }
  ctx.restore();
}

function umbrella(ctx, t, color) {
  ctx.save();
  ctx.translate(0, -17);
  ctx.rotate(Math.sin(t * 0.15) * 0.12);
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -10); ctx.stroke();
  const n = 4, R = 11;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI + (Math.PI * i) / n, a1 = Math.PI + (Math.PI * (i + 1)) / n;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.arc(0, -10, R, a0, a1);
    ctx.closePath();
    ctx.fillStyle = C.umbrella[(i + color) % C.umbrella.length];
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, -10, R, Math.PI, 0); ctx.lineWidth = 0.6; ctx.strokeStyle = C.line; ctx.stroke();
  ctx.restore();
}

// Pose selon l'état de la bestiole
export function poseFor(l) {
  const a = l.anim;
  const f = l.frame;
  switch (l.state) {
    case 'walking': {
      const s = Math.sin(a * 0.42);
      return { bob: -Math.abs(s) * 0.7, legA: Math.max(0, s) * 1.8, legB: Math.max(0, -s) * 1.8, armF: 1.5 + s * 0.6, armB: 1.6 - s * 0.6 };
    }
    case 'falling':
      return { hairUp: true, armF: -1.2 + Math.sin(a * 0.9) * 0.5, armB: -2 - Math.sin(a * 0.9) * 0.5, eyes: 'scared', mouth: 'o', legA: 1, legB: 0.5, lookY: -0.4 };
    case 'floating':
      return { armF: -1.5, armB: -1.8, eyes: 'happy', legA: 0.6 + Math.sin(a * 0.2) * 0.4, legB: 0.6 - Math.sin(a * 0.2) * 0.4 };
    case 'climbing': {
      const s = Math.sin(a * 0.5);
      return { lean: -0.12, armF: -1.2 + s * 0.5, armB: -1.4 - s * 0.5, legA: 1.5 + s, legB: 1.5 - s, look: 0.9, lookY: -0.6 };
    }
    case 'hoisting':
      return { lean: -0.3 + f * 0.04, armF: -0.9 + f * 0.1, armB: -1.2, legA: 2, legB: 1, mouth: 'flat', eyes: 'closed' };
    case 'building': {
      const c = f % 16;
      return { armF: c < 9 ? 0.3 + c * 0.08 : 1.2, armB: 1.9, tool: c < 10 ? 'brick' : null, bob: c >= 9 && c < 12 ? 0.6 : 0, look: 0.8, lookY: 0.5 };
    }
    case 'shrugging':
      return { armF: -0.6, armB: -2.5, eyes: 'open', mouth: 'flat', bob: f < 7 ? -0.4 : 0 };
    case 'bashing': {
      const c = a % 16;
      const punch = c < 8 ? c / 8 : (16 - c) / 8;
      return { armF: 0.9 - punch * 0.9, armB: 1.9 + punch * 0.6, lean: punch * 0.12, eyes: 'stern', tool: 'glove', toolAng: 0, legA: punch * 1, mouth: 'flat' };
    }
    case 'mining': {
      const c = f % 5, swing = Math.sin((a * Math.PI) / 5);
      return { armF: -1.7 + (swing + 1) * 1.3, tool: 'pick', toolAng: -1.2 + (swing + 1) * 1.1, lean: 0.12, eyes: 'stern', look: 0.6, lookY: 0.6, bob: c === 0 ? 0.4 : 0 };
    }
    case 'digging': {
      const s = Math.sin(a * 0.8);
      return { armF: 1.6 + s * 0.5, armB: 1.4 - s * 0.5, tool: 'shovel', toolAng: 1.75 + s * 0.4, look: 0.3, lookY: 0.8, bob: Math.abs(s) * 0.5, eyes: 'stern' };
    }
    case 'blocking':
      return { armF: -0.15, armB: Math.PI + 0.15, eyes: 'stern', mouth: 'flat', look: 0, legA: 0, legB: 0, lean: 0, bob: Math.sin(a * 0.1) * 0.2 };
    case 'ohno':
      return { armF: -2.2 + Math.sin(a) * 0.2, armB: -1 + Math.sin(a) * 0.2, eyes: 'scared', mouth: 'o', squash: 1 + Math.sin(a * 1.4) * 0.06, hairUp: true, look: 0, lookY: -0.5 };
    case 'exiting':
      return { armF: -2.4, armB: -0.8, eyes: 'happy', mouth: 'smile', bob: -Math.sin((f / 15) * Math.PI) * 6, legA: 1.5, legB: 1.5 };
    case 'drowning':
      return { armF: -2.3 + Math.sin(a * 0.8) * 0.4, armB: -0.9 - Math.sin(a * 0.8) * 0.4, eyes: 'scared', mouth: 'o', hairUp: true };
    default:
      return {};
  }
}

// Dessine une bestiole dans le monde (ctx déjà à l'échelle du monde)
export function drawLem(ctx, l, t, opts = {}) {
  const st = l.state;
  ctx.save();
  ctx.translate(l.x + 0.5, l.y + 1);

  if (st === 'splatting' || st === 'crushed') {
    const k = Math.min(1, l.frame / 6);
    ctx.globalAlpha = l.frame > 14 ? 1 - (l.frame - 14) / 6 : 1;
    ell(ctx, 0, -1, 4 + k * 4, 2.2 - k * 0.8);
    ctx.fillStyle = C.body; ctx.fill();
    ctx.lineWidth = 0.6; ctx.strokeStyle = C.line; ctx.stroke();
    ell(ctx, -1, -2.2, 2.5, 1.2); ctx.fillStyle = C.hair; ctx.fill();
    for (const ex of [-1.6, 1.6]) {
      ctx.lineWidth = 0.6; ctx.strokeStyle = C.line;
      ctx.beginPath(); ctx.moveTo(ex - 0.8, -2.6); ctx.lineTo(ex + 0.8, -1.2); ctx.moveTo(ex + 0.8, -2.6); ctx.lineTo(ex - 0.8, -1.2); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (st === 'burning') {
    ctx.globalAlpha = Math.max(0, 1 - l.frame / 20);
    ctx.scale(l.dir, 1 - l.frame / 30);
    ctx.filter = 'brightness(0.25)';
    drawBody(ctx, { eyes: 'scared', mouth: 'o', hairUp: true, armF: -2, armB: -1 });
    ctx.filter = 'none';
    ctx.restore();
    return;
  }
  if (st === 'drowning') {
    ctx.translate(0, Math.min(14, l.frame * 0.8));
  }
  if (st === 'exiting') ctx.globalAlpha = Math.max(0, 1 - Math.max(0, l.frame - 8) / 7);

  if (opts.highlight) {
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 6 * (opts.zoom || 2);
    ell(ctx, 0, -8, 7.5, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    ctx.restore();
  }

  if (st === 'floating') umbrella(ctx, l.anim, l.id % 4);

  ctx.scale(l.dir, 1);
  if (st === 'climbing' || st === 'hoisting') ctx.translate(1.2, 0);
  drawBody(ctx, poseFor(l));
  ctx.restore();

  // compte à rebours de la bombe
  if (l.bomb > 0 && st !== 'dead') {
    const n = Math.ceil(l.bomb / 30);
    ctx.save();
    ctx.translate(l.x + 0.5, l.y - 22 - (st === 'floating' ? 12 : 0));
    const pulse = 1 + ((l.bomb % 30) / 30) * 0.25;
    ctx.scale(pulse, pulse);
    ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = n <= 2 ? '#ff3b3b' : '#ff9f1c'; ctx.fill();
    ctx.lineWidth = 0.7; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 6px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0.4);
    ctx.restore();
  }
}

// Icône d'un talent : une petite bestiole en action (pour les boutons)
export function skillIcon(skill, size = 64) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = size * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const s = size / 26;
  ctx.translate(size / 2, size * 0.86);
  ctx.scale(s, s);
  const fake = { x: -0.5, y: -1, dir: 1, anim: 6, frame: 4, id: 1, bomb: -1, state: 'walking' };
  switch (skill) {
    case 'climber':
      ctx.fillStyle = '#9aa3b5'; ctx.fillRect(4.6, -22, 3, 24);
      fake.state = 'climbing'; fake.x = 1.5; fake.y = -3; break;
    case 'floater': fake.state = 'floating'; fake.y = 1; ctx.scale(0.72, 0.72); ctx.translate(0, -2); break;
    case 'bomber': fake.state = 'ohno'; fake.bomb = 75; fake.y = 1; ctx.scale(0.85, 0.85); break;
    case 'blocker': fake.state = 'blocking'; break;
    case 'builder':
      ctx.fillStyle = '#e8a15a';
      for (let i = 0; i < 3; i++) ctx.fillRect(-11 + i * 5, -1 - i * 2.4, 7, 2.2);
      fake.state = 'building'; fake.frame = 4; fake.x = 3; fake.y = -6; break;
    case 'basher':
      ctx.fillStyle = '#b0855a'; ctx.fillRect(6, -18, 6, 18);
      fake.state = 'bashing'; fake.anim = 6; fake.x = -2; break;
    case 'miner':
      ctx.fillStyle = '#b0855a';
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.lineTo(12, -6); ctx.lineTo(6, -6); ctx.closePath(); ctx.fill();
      fake.state = 'mining'; fake.anim = 1; fake.x = -3; break;
    case 'digger':
      ctx.fillStyle = '#b0855a'; ctx.fillRect(-12, 0, 24, 4);
      fake.state = 'digging'; fake.anim = 2; break;
  }
  drawLem(ctx, fake, 0);
  return cv;
}
