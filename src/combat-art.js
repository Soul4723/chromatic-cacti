/**
 * Chromatic Cacti — garden defense art. Original procedural Canvas 2D only:
 * no imports, DOM, browser globals or network. x/y is the base centre in
 * pixels; scale 1 is ~36px wide for a pest, ~64px for a boss, ~30px a worm.
 * Every entry point saves/restores the context in try/finally.
 */
const TAU = Math.PI * 2;
const C = {
  ink: '#2c2135', inkSoft: '#503b5c', cream: '#f8edd7',
  lavender: '#bfa5df', lavenderDeep: '#8162a8', lavenderLight: '#ecddff',
  lime: '#d5f168', limeDeep: '#87a63b', terra: '#e29c76', terraDeep: '#b5674c',
  mint: '#a9f5d0', mintDeep: '#57c99b', pink: '#ffa1bb', pinkDeep: '#d95b80', gold: '#ffd479'
};

function num(v, f) { return typeof v === 'number' && Number.isFinite(v) ? v : f; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
// Follow the main renderer's milliseconds, but tolerate seconds.
function secs(v) { const n = Math.max(0, num(v, 0)); return n > 1000 ? n * 0.001 : n; }
function ageSecs(v) { const n = Math.max(0, num(v, 0)); return n > 20 ? n * 0.001 : n; }
function seedOf(v) {
  const s = String(v == null ? '' : v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

function shadow(ctx, rx, ry, alpha) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba(C.ink, alpha)); g.addColorStop(0.6, rgba(C.ink, alpha * 0.4));
  g.addColorStop(1, rgba(C.ink, 0));
  ctx.save(); ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill(); ctx.restore();
}

function crown(ctx, x, y, w, h, tint, jewel, tilt) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt || 0);
  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2, -h * 0.5);
  ctx.lineTo(-w * 0.18, -h * 0.16); ctx.lineTo(0, -h); ctx.lineTo(w * 0.18, -h * 0.16);
  ctx.lineTo(w / 2, -h * 0.5); ctx.lineTo(w / 2, 0); ctx.closePath();
  ctx.fillStyle = tint; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = jewel;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath(); ctx.arc((i - 1) * w * 0.24, -h * 0.26, Math.max(0.7, w * 0.065), 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function eye(ctx, x, y, r, lx, ly) {
  ctx.fillStyle = C.cream; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 0.55; ctx.stroke();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x + lx, y + ly, r * 0.46, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.9);
  ctx.beginPath(); ctx.arc(x + lx - r * 0.15, y + ly - r * 0.2, Math.max(0.3, r * 0.16), 0, TAU); ctx.fill();
}

/* snail ------------------------------------------------------------------ */
function snail(ctx, boss, t) {
  const sway = t > 0 ? Math.sin(t * 2.1) : 0;
  const blink = t > 0 && Math.sin(t * 0.9 + 1.3) > 0.965;
  shadow(ctx, 16, 3, 0.3);
  if (boss) {
    const g = ctx.createRadialGradient(-2, -15, 2, -2, -15, 25);
    g.addColorStop(0, rgba(C.lime, 0.35)); g.addColorStop(0.6, rgba(C.lime, 0.12)); g.addColorStop(1, rgba(C.lime, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-2, -15, 25, 0, TAU); ctx.fill();
  }
  ctx.save(); ctx.translate(0, t > 0 ? -Math.abs(Math.sin(t * 2.1)) * 0.5 : 0);
  ctx.beginPath(); ctx.moveTo(-16, -2.5);
  ctx.bezierCurveTo(-17, -8, -8, -8.5, -2, -7);
  ctx.bezierCurveTo(4, -5.5, 8, -14, 13, -13);
  ctx.bezierCurveTo(17.5, -12, 18, -5, 13, -4);
  ctx.bezierCurveTo(7, -2.4, 0, -2, -16, -2.5); ctx.closePath();
  const body = ctx.createLinearGradient(0, -13, 0, 0);
  body.addColorStop(0, C.lime); body.addColorStop(0.5, '#b9d75f'); body.addColorStop(1, C.terraDeep);
  ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.25; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.strokeStyle = rgba(C.cream, 0.4); ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(-13, -3.3); ctx.quadraticCurveTo(1, -2.4, 13, -4.5); ctx.stroke();

  // Shell dome and terracotta spiral.
  const sx = -2.5, sy = -15;
  const shell = ctx.createRadialGradient(sx - 4, sy - 5, 1, sx, sy, 11.6);
  shell.addColorStop(0, C.lavenderLight); shell.addColorStop(0.52, C.lavender); shell.addColorStop(1, C.lavenderDeep);
  ctx.beginPath(); ctx.arc(sx, sy, 10.8, 0, TAU); ctx.fillStyle = shell; ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.45; ctx.stroke();
  ctx.save(); ctx.translate(sx, sy); ctx.beginPath();
  for (let i = 0; i <= 30; i += 1) {
    const f = i / 30, a = -0.7 + f * TAU * 2.15, r = 8.6 * (1 - f * 0.94);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = rgba(C.terraDeep, 0.95); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 1.7, 0, TAU); ctx.fillStyle = C.gold; ctx.fill();
  ctx.strokeStyle = rgba(C.ink, 0.5); ctx.lineWidth = 0.55; ctx.stroke(); ctx.restore();
  ctx.strokeStyle = rgba(C.cream, 0.55); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(sx, sy, 9.4, Math.PI * 1.03, Math.PI * 1.55); ctx.stroke();

  // Stalks and eyes.
  const stalks = [[9.2, -12, 9.8, -18.2, 11, -19.2], [13.2, -11.2, 14.8, -16.6, 15.8, -17.8]];
  for (let i = 0; i < 2; i += 1) {
    const s = stalks[i], tipX = s[4] + sway * 0.7;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.15; ctx.beginPath(); ctx.moveTo(s[0], s[1]);
    ctx.quadraticCurveTo(s[2], s[3], tipX, s[5]); ctx.stroke();
    if (blink) {
      ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(tipX - 1.5, s[5]); ctx.lineTo(tipX + 1.5, s[5]); ctx.stroke();
    } else eye(ctx, tipX, s[5], 2.15, 0.45, 0.25);
  }
  ctx.strokeStyle = rgba(C.ink, 0.8); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(13.6, -7.7); ctx.quadraticCurveTo(15, -6.4, 16.4, -7.1); ctx.stroke();

  if (boss) {
    for (let i = 0; i < 6; i += 1) {
      const a = 2.35 + (i / 5) * 2.45, bx = sx + Math.cos(a) * 9.6, by = sy + Math.sin(a) * 9.6;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(a + 1.57) * 1.8, by + Math.sin(a + 1.57) * 1.8);
      ctx.lineTo(sx + Math.cos(a) * 14.1, sy + Math.sin(a) * 14.1);
      ctx.lineTo(bx + Math.cos(a - 1.57) * 1.8, by + Math.sin(a - 1.57) * 1.8);
      ctx.closePath(); ctx.fillStyle = C.lime; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 0.8; ctx.stroke();
    }
    crown(ctx, -2, -25.5, 13, 8, C.gold, C.limeDeep, -0.08);
  }
  ctx.restore();
}

/* earwig ----------------------------------------------------------------- */
function pincer(ctx, x0, y0, cx, cy, x1, y1, boss) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.ink; ctx.lineWidth = 5.2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  ctx.strokeStyle = C.terra; ctx.lineWidth = 3.1; ctx.stroke();
  const a = Math.atan2(y1 - cy, x1 - cx);
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(a) * 2.6, y1 + Math.sin(a) * 2.6);
  ctx.lineTo(x1 + Math.cos(a + 1.85) * 2.9, y1 + Math.sin(a + 1.85) * 2.9);
  ctx.lineTo(x1 + Math.cos(a - 1.85) * 2.9, y1 + Math.sin(a - 1.85) * 2.9);
  ctx.closePath(); ctx.fillStyle = C.terra; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 0.6; ctx.stroke();
  if (boss) {
    ctx.strokeStyle = rgba(C.lime, 0.9); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  }
}

function earwig(ctx, boss, t) {
  const wiggle = t > 0 ? Math.sin(t * 3.3) : 0;
  shadow(ctx, 15, 2.8, 0.3);
  if (boss) {
    const g = ctx.createRadialGradient(-2, -10, 2, -2, -10, 23);
    g.addColorStop(0, rgba(C.terra, 0.34)); g.addColorStop(1, rgba(C.terra, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-2, -10, 23, 0, TAU); ctx.fill();
  }
  pincer(ctx, -12, -10.5, -20, -18.5, -21.5, -14.2, boss);
  pincer(ctx, -12, -6.8, -20, -0.2, -21.5, -4.2, boss);

  ctx.strokeStyle = '#74505c'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const x = -7 + i * 5 + wiggle * 0.4;
    ctx.beginPath(); ctx.moveTo(x, -4.5); ctx.lineTo(x - 2.5, -1); ctx.lineTo(x - 1, 0.2);
    ctx.moveTo(x, -4.5); ctx.lineTo(x + 2.2, -1.4); ctx.lineTo(x + 3.3, 0.2); ctx.stroke();
  }

  const plate = ctx.createLinearGradient(0, -16, 0, -2);
  plate.addColorStop(0, C.terra); plate.addColorStop(0.58, '#c97b58'); plate.addColorStop(1, C.terraDeep);
  const segs = [[-12, -7.5, 5.2, 5.8], [-7, -8.5, 5.5, 6.2], [-2, -9, 5.5, 6.2], [3, -9.5, 5, 5.8]];
  for (let i = 0; i < 4; i += 1) {
    const s = segs[i];
    ctx.beginPath(); ctx.ellipse(s[0], s[1] + wiggle * (i - 1.5) * 0.16, s[2], s[3], 0, 0, TAU);
    ctx.fillStyle = plate; ctx.fill(); ctx.strokeStyle = rgba(C.ink, 0.8); ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = rgba(C.cream, 0.24); ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.arc(s[0], s[1] - 0.8, s[2] * 0.62, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(8.5, -10.5, 5.3, 5.4, -0.12, 0, TAU);
  const head = ctx.createRadialGradient(6.8, -12.5, 1, 8.5, -10.5, 6);
  head.addColorStop(0, '#efb28b'); head.addColorStop(1, C.terraDeep);
  ctx.fillStyle = head; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.15; ctx.stroke();
  ctx.strokeStyle = C.inkSoft; ctx.lineWidth = 0.95; ctx.lineCap = 'round';
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath(); ctx.moveTo(9 + i * 1.6, -14.6);
    ctx.quadraticCurveTo(11 + i * 2.2, -19.5, 13.8 + i * 2.4, -20.4 - i); ctx.stroke();
    ctx.fillStyle = C.lime; ctx.beginPath(); ctx.arc(13.8 + i * 2.4, -20.4 - i, 0.8, 0, TAU); ctx.fill();
  }
  eye(ctx, 10.6, -11.6, 1.7, 0.4, 0.1);

  if (boss) {
    for (let i = 0; i < 3; i += 1) {
      const x = -8 + i * 5;
      ctx.beginPath(); ctx.moveTo(x - 1.7, -14.2); ctx.lineTo(x + 0.1, -19.2 - i * 0.5); ctx.lineTo(x + 1.8, -13.8);
      ctx.closePath(); ctx.fillStyle = C.lime; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 0.7; ctx.stroke();
    }
    crown(ctx, 8.5, -16.2, 11.5, 7.8, C.gold, C.terraDeep, 0.12);
  }
}

/* magpie ----------------------------------------------------------------- */
function magpie(ctx, boss, t, airborne) {
  const flap = airborne && t > 0 ? Math.sin(t * 6.4) : 0;
  const bob = airborne ? (t > 0 ? Math.sin(t * 5.1) * 0.7 : 0) : 0;
  shadow(ctx, airborne ? 7 : 12, airborne ? 1.5 : 2.6, airborne ? 0.13 : 0.28);
  ctx.save(); ctx.translate(0, airborne ? -4 - bob + flap * 0.4 : 0);
  const feather = ctx.createLinearGradient(-10, -22, 8, -8);
  feather.addColorStop(0, '#493d5b'); feather.addColorStop(0.42, '#272131'); feather.addColorStop(1, '#191521');

  ctx.beginPath(); ctx.moveTo(-3, -17.5); ctx.lineTo(-19, -11 + bob * 0.3);
  ctx.lineTo(-20.5, -4.5); ctx.lineTo(-4, -9); ctx.closePath();
  ctx.fillStyle = feather; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.strokeStyle = rgba(C.cream, 0.8); ctx.lineWidth = 1.15;
  ctx.beginPath(); ctx.moveTo(-6, -14.2); ctx.lineTo(-18.3, -8.4); ctx.stroke();
  if (boss) {
    ctx.strokeStyle = rgba(C.lime, 0.95); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-18.6, -5.8); ctx.lineTo(-20.2, -4.6); ctx.stroke();
  }

  if (!airborne) {
    ctx.strokeStyle = C.terraDeep; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i += 1) {
      const x = -1 + i * 5.5;
      ctx.beginPath(); ctx.moveTo(x, -7); ctx.lineTo(x - 0.5, -0.5);
      ctx.moveTo(x - 0.5, -0.5); ctx.lineTo(x - 2.4, 0.2);
      ctx.moveTo(x - 0.5, -0.5); ctx.lineTo(x + 1.4, 0.2); ctx.stroke();
    }
  }

  ctx.beginPath(); ctx.ellipse(-0.5, -14, 8.8, 7.1, -0.08, 0, TAU);
  ctx.fillStyle = feather; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.15; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.6, -11.6, 5.8, 4.7, -0.1, 0, TAU); ctx.fillStyle = C.cream; ctx.fill();

  // Folded wing when perched, raised fan when flying.
  if (airborne) {
    const wings = [
      [3, -18, -1, -24, -8, -28, -16.5, -27, -13.5, -23, -12.5, -20.5, -14, -17.8, -9, -18.5, -4, -16, 3, -14],
      [4, -16, 7, -22, 12, -26, 16.5, -24.5, 14, -21, 14, -19, 15, -17, 10, -18, 7, -15, 4, -13.5]
    ];
    for (let w = 0; w < 2; w += 1) {
      const p = wings[w];
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
      ctx.bezierCurveTo(p[8], p[9], p[10], p[11], p[12], p[13]);
      ctx.bezierCurveTo(p[14], p[15], p[16], p[17], p[18], p[19]);
      ctx.closePath(); ctx.fillStyle = feather; ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.1; ctx.stroke();
    }
    ctx.strokeStyle = rgba(C.cream, 0.82); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2.5, -21.5); ctx.lineTo(-10.8, -24);
    ctx.moveTo(7, -20.5); ctx.lineTo(12.5, -22); ctx.stroke();
    if (boss) {
      ctx.strokeStyle = C.lime; ctx.lineWidth = 1.35;
      ctx.beginPath(); ctx.moveTo(-13.5, -26.2); ctx.lineTo(-17, -28.6);
      ctx.moveTo(-15.4, -25.2); ctx.lineTo(-19.4, -26.4);
      ctx.moveTo(15.8, -24.8); ctx.lineTo(18.6, -26.4); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.moveTo(2, -18.5);
    ctx.bezierCurveTo(-3, -17, -8, -13, -9.5, -7.4);
    ctx.bezierCurveTo(-6, -9.5, -2.5, -10.5, 0.5, -11); ctx.closePath();
    ctx.fillStyle = feather; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.05; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3.5, -13); ctx.lineTo(-8, -10); ctx.lineTo(-5.5, -7.5); ctx.lineTo(-0.8, -10.4);
    ctx.closePath(); ctx.fillStyle = rgba(C.cream, 0.92); ctx.fill();
    ctx.strokeStyle = rgba(C.lavender, 0.75); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-2.5, -15.5); ctx.quadraticCurveTo(-6, -12, -7.2, -8.5); ctx.stroke();
    if (boss) {
      ctx.strokeStyle = rgba(C.lime, 0.9); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-7.2, -8.7); ctx.lineTo(-9.4, -6.3); ctx.stroke();
    }
  }

  ctx.beginPath(); ctx.arc(8, -21, 5.4, 0, TAU);
  ctx.fillStyle = feather; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(6.5, -19.2, 2.5, 1.9, -0.25, 0, TAU); ctx.fillStyle = rgba(C.cream, 0.92); ctx.fill();
  if (boss) {
    ctx.strokeStyle = C.lime; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(10.4, -22.7, 2.6, 0, TAU); ctx.stroke();
  }
  eye(ctx, 10.4, -22.7, 1.7, 0.5, 0.1);
  ctx.beginPath(); ctx.moveTo(12.6, -23.2); ctx.lineTo(18.6, -20.6); ctx.lineTo(12.8, -18.6); ctx.closePath();
  ctx.fillStyle = '#3a2b40'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 0.85; ctx.stroke();
  ctx.strokeStyle = rgba(C.terra, 0.9); ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(13.4, -20.6); ctx.lineTo(17.7, -20.6); ctx.stroke();
  if (boss) crown(ctx, 8, -26, 10.5, 7.5, C.gold, C.terraDeep, -0.14);
  ctx.restore();
}

/* public pests ----------------------------------------------------------- */
export function drawPest(ctx, enemy, x, y, scale = 1, time = 0) {
  if (!ctx || !enemy) return;
  const s = num(scale, 1);
  if (!(s > 0)) return;
  const t = secs(time), boss = !!enemy.boss;
  const dir = num(enemy.x, 50) < 50 ? 1 : -1;
  const size = s * (boss ? 1.8 : 1);
  ctx.save();
  try {
    ctx.translate(num(x, 0), num(y, 0));
    ctx.scale(size * dir, size);
    const phase = (seedOf(enemy.id) % 7) * 0.13;
    if (enemy.type === 'earwig') earwig(ctx, boss, t > 0 ? t + phase : 0);
    else if (enemy.type === 'magpie') magpie(ctx, boss, t > 0 ? t + phase : 0, !!enemy.airborne);
    else snail(ctx, boss, t > 0 ? t + phase : 0);
  } finally { ctx.restore(); }
}

/* friendly worm ---------------------------------------------------------- */
export function drawWorm(ctx, worm, x, y, scale = 1, time = 0) {
  if (!ctx || !worm) return;
  const s = num(scale, 1);
  if (!(s > 0)) return;
  const t = secs(time), phase = (seedOf(worm.id) % 6) * 0.7;
  const wig = t > 0 ? Math.sin(t * 2.5 + phase) * 1.2 : 0;
  ctx.save();
  try {
    ctx.translate(num(x, 0), num(y, 0)); ctx.scale(s, s);
    shadow(ctx, 12, 2.4, 0.2);
    const trail = () => {
      ctx.beginPath(); ctx.moveTo(-13, -1.5);
      ctx.bezierCurveTo(-10 + wig, -6.5, -6 - wig, -7.6, -1, -6.5);
      ctx.bezierCurveTo(3, -5.5, 6, -8, 9, -9);
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    trail(); ctx.strokeStyle = rgba(C.ink, 0.62); ctx.lineWidth = 9; ctx.stroke();
    const skin = ctx.createLinearGradient(-13, -8, 12, -4);
    skin.addColorStop(0, C.pinkDeep); skin.addColorStop(0.46, C.pink); skin.addColorStop(1, C.gold);
    trail(); ctx.strokeStyle = skin; ctx.lineWidth = 7.2; ctx.stroke();
    ctx.save(); ctx.translate(-0.4, -1.8); trail();
    ctx.strokeStyle = rgba(C.cream, 0.36); ctx.lineWidth = 2.1; ctx.stroke(); ctx.restore();

    ctx.strokeStyle = rgba(C.pinkDeep, 0.42); ctx.lineWidth = 0.9;
    const rings = [[-9, -6.6], [-4.5, -7], [0, -6.2], [4.5, -6.6]];
    for (let i = 0; i < 4; i += 1) {
      const r = rings[i];
      ctx.beginPath(); ctx.moveTo(r[0] - 1.1, r[1] - 3.3);
      ctx.quadraticCurveTo(r[0] + 1.8, r[1], r[0] - 0.8, r[1] + 3.1); ctx.stroke();
    }

    const face = ctx.createRadialGradient(8, -11.5, 1, 10, -9.5, 6);
    face.addColorStop(0, C.gold); face.addColorStop(0.55, C.pink); face.addColorStop(1, C.pinkDeep);
    ctx.beginPath(); ctx.arc(10, -9.5, 5.3, 0, TAU);
    ctx.fillStyle = face; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.15; ctx.stroke();
    ctx.fillStyle = C.ink; ctx.beginPath();
    ctx.arc(8.7, -11.2, 1.05, 0, TAU); ctx.arc(12.3, -10.6, 0.95, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.9); ctx.beginPath();
    ctx.arc(8.4, -11.5, 0.35, 0, TAU); ctx.arc(12, -10.9, 0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(8.6, -7.8); ctx.quadraticCurveTo(10.3, -6.2, 12.6, -7.4); ctx.stroke();
    ctx.fillStyle = rgba(C.terra, 0.4); ctx.beginPath();
    ctx.ellipse(7, -8, 1.5, 0.9, -0.2, 0, TAU); ctx.ellipse(13.5, -7.9, 1.3, 0.8, 0.2, 0, TAU); ctx.fill();

    ctx.strokeStyle = C.limeDeep; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(10.4, -14.6); ctx.quadraticCurveTo(10.8, -17, 10.2, -18.2); ctx.stroke();
    ctx.fillStyle = C.lime; ctx.beginPath();
    ctx.ellipse(9, -18.1, 2.1, 1.1, -0.7, 0, TAU); ctx.ellipse(11.6, -18.7, 1.9, 1, 0.55, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(C.ink, 0.55); ctx.lineWidth = 0.5; ctx.stroke();
  } finally { ctx.restore(); }
}

/* defense effects -------------------------------------------------------- */
function stomp(ctx, age) {
  const p = clamp(age / 0.55, 0, 1);
  if (p >= 1) return;
  const fade = 1 - p, radius = 5 + 40 * (1 - (1 - p) ** 3);
  ctx.save(); ctx.scale(1, 0.46);
  ctx.strokeStyle = rgba(C.cream, fade); ctx.lineWidth = 5 * (1 - p) + 0.7;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba(C.lime, 0.7 * fade); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.66, 0, TAU); ctx.stroke(); ctx.restore();
  const flash = Math.max(0, 1 - p * 2.3);
  if (flash > 0) {
    const g = ctx.createRadialGradient(0, -2, 0, 0, -2, 20);
    g.addColorStop(0, rgba(C.cream, 0.8 * flash)); g.addColorStop(0.45, rgba(C.lime, 0.36 * flash));
    g.addColorStop(1, rgba(C.lime, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -2, 20, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + 0.34, d = radius * 0.82;
    ctx.fillStyle = rgba(i % 2 ? C.terra : C.cream, 0.55 * fade);
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.44 - 1, (2.5 + (i % 3)) * (0.7 + fade * 0.5), 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = rgba(C.cream, 0.5 * fade); ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + 0.2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 0.48);
    ctx.lineTo(Math.cos(a) * radius * 1.24, Math.sin(a) * radius * 0.57); ctx.stroke();
  }
  // A quick, solid impact star reads before the wider dust ring.
  if (p < 0.4) burst(ctx, 0, -3, 9 + p * 28, C.cream, 1 - p / 0.4);
}

function spray(ctx, age) {
  const p = clamp(age / 0.7, 0, 1);
  if (p >= 1) return;
  const fade = 1 - p, spread = 1 - (1 - p) * (1 - p);
  const haze = ctx.createRadialGradient(0, -10, 1, 0, -10, 8 + 21 * spread);
  haze.addColorStop(0, rgba(C.cream, 0.65 * fade)); haze.addColorStop(0.5, rgba(C.mintDeep, 0.35 * fade));
  haze.addColorStop(1, rgba(C.mint, 0));
  ctx.fillStyle = haze; ctx.beginPath(); ctx.arc(0, -10, 8 + 21 * spread, 0, TAU); ctx.fill();
  for (let i = 0; i < 11; i += 1) {
    const a = -Math.PI * 0.93 + (i / 10) * Math.PI * 0.86;
    const d = (3 + 21 * spread) * (0.62 + 0.34 * Math.sin(i * 2.17));
    const px = Math.cos(a) * d * 1.08, py = Math.sin(a) * d * 0.8 - 7 - spread * 5;
    const r = 2.9 + (i % 3) * 1.3 + spread * 1.6;
    ctx.fillStyle = rgba(i % 3 === 0 ? '#d9ffe9' : C.mint, 0.62 * fade);
    ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.22 * fade); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(px - r * 0.2, py - r * 0.2, r * 0.66, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
  }
  for (let i = 0; i < 5; i += 1) {
    const a = -Math.PI * 0.82 + (i / 4) * Math.PI * 0.64, d = 5 + spread * (16 + i * 1.6);
    ctx.fillStyle = rgba(C.mintDeep, 0.5 * fade);
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.72 - 3 - spread * 2, 0.9 + (i % 2) * 0.5, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = rgba(C.mint, 0.8 * fade); ctx.lineWidth = 2.5 * fade + 0.5;
  ctx.beginPath(); ctx.ellipse(0, -10, 7 + spread * 27, 5 + spread * 18, 0, 0, TAU); ctx.stroke();
}

function burst(ctx, x, y, radius, color, alpha) {
  ctx.fillStyle = rgba(color, alpha); ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const a = i / 16 * TAU, r = radius * (i % 2 ? 0.4 : 1);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

function pestPop(ctx, age) {
  const p = clamp(age / 0.6, 0, 1), fade = 1 - p;
  if (p >= 1) return;
  const travel = 1 - (1 - p) ** 3;
  if (p < 0.35) burst(ctx, 0, -13, 12 + travel * 15, C.gold, 1 - p / 0.35);
  ctx.strokeStyle = rgba(C.gold, fade); ctx.lineWidth = 3 * fade + 0.5;
  ctx.beginPath(); ctx.arc(0, -13, 8 + travel * 27, 0, TAU); ctx.stroke();
  for (let i = 0; i < 9; i += 1) {
    const a = i / 9 * TAU - 0.4, r = 10 + travel * (25 + (i % 3) * 5);
    const x = Math.cos(a) * r, y = -13 + Math.sin(a) * r * 0.75 + p * p * 12;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + p * 2);
    ctx.fillStyle = rgba(i % 2 ? C.lime : C.gold, fade);
    ctx.fillRect(-2 * fade, -3.5 * fade, 4 * fade, 7 * fade); ctx.restore();
  }
}

function damageLabel(ctx, effect, age) {
  const p = clamp(age / 0.7, 0, 1);
  if (p >= 1) return;
  const kills = Math.max(0, num(effect.kills, 0)), hits = num(effect.hits, -1);
  const damage = Math.max(0, num(effect.damage, 0));
  const label = kills ? (kills > 1 ? `${kills} pests cleared!` : 'Pest cleared!')
    : hits === 0 ? 'Miss' : damage > 0 ? `−${Math.ceil(damage)}` : hits > 0 ? `${hits} hit` : '';
  if (!label) return;
  ctx.globalAlpha *= Math.min(1, (1 - p) * 3);
  ctx.font = `bold ${kills ? 13 : 16}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 4; ctx.strokeStyle = C.ink;
  ctx.fillStyle = kills ? C.gold : hits === 0 ? C.cream : C.mint;
  const y = -33 - 17 * (1 - (1 - p) ** 2);
  ctx.strokeText(label, 0, y); ctx.fillText(label, 0, y);
}

export function drawDefenseEffect(ctx, effect, scale = 1) {
  if (!ctx || !effect) return;
  const s = num(scale, 1);
  if (!(s > 0)) return;
  const age = ageSecs(effect.age);
  if (age >= 0.7) return;
  ctx.save();
  try {
    ctx.translate(num(effect.x, 0), num(effect.y, 0)); ctx.scale(s, s);
    if (effect.weapon === 'spray') spray(ctx, age);
    else stomp(ctx, age);
    if (num(effect.kills, 0) > 0 || effect.type === 'pest_pop') pestPop(ctx, age);
    damageLabel(ctx, effect, age);
  } finally { ctx.restore(); }
}
