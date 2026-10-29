/**
 * Chromatic Cacti — original procedural Canvas 2D art.
 * Canvas only. No imports, no dependencies, no DOM access at import time.
 *
 * Public API:
 *   drawCactus(ctx, plant, x, y, scale, time)
 *   drawLandscape(ctx, width, height, { time, day, psychedelic })
 *   drawPlantIcon(ctx, speciesId, mutation, width, height)
 *
 * Plants are drawn in local units where a mature specimen is ~110 px tall,
 * then multiplied by scale and a growth-based size. Every painter saves and
 * restores context state and every loop has a fixed, small bound.
 */

const TAU = Math.PI * 2;
const MUTATION_IDS = new Set(['normal', 'variegated', 'crested', 'variegated-crested']);

const STYLES = {
  lophophora: {
    body: '#7fae81', bodyMid: '#6b9e78', bodyDark: '#345b49', bodyLight: '#d6edb5',
    rim: '#f8d6e4', line: '#29473b', areole: '#fbf1d4', spine: '#f3e8c6',
    petal: '#ff9cc8', petalDeep: '#f2609f', petalTip: '#ffd9ea', core: '#ffd375',
    ribCount: 8, spineLen: 2.6
  },
  pachanoi: {
    body: '#4d8a55', bodyMid: '#3f7a4b', bodyDark: '#1e4430', bodyLight: '#a2d181',
    rim: '#eaf8cb', line: '#163629', areole: '#f2e4ae', spine: '#f7edc7',
    petal: '#fff5e4', petalDeep: '#f3d9c0', petalTip: '#ffffff', core: '#ffe08a',
    ribCount: 5, spineLen: 2.3
  },
  peruvianus: {
    body: '#5d8fae', bodyMid: '#487a9b', bodyDark: '#254963', bodyLight: '#c5e6f3',
    rim: '#e4f9ff', line: '#1c3a52', areole: '#f6e3b2', spine: '#e4ae6c',
    petal: '#ff9fbe', petalDeep: '#e8659a', petalTip: '#ffe0ee', core: '#ffd27a',
    ribCount: 6, spineLen: 8.4, frost: true
  },
  bridgesii: {
    body: '#739d59', bodyMid: '#628c4e', bodyDark: '#2e4d2d', bodyLight: '#c8e195',
    rim: '#f1f8d1', line: '#263f28', areole: '#f0e1a9', spine: '#ecd9a0',
    petal: '#ff8f7e', petalDeep: '#e35f61', petalTip: '#ffd1bd', core: '#ffd97d',
    ribCount: 4, spineLen: 8
  },
  tbm: {
    body: '#87a566', bodyMid: '#75955b', bodyDark: '#3c5632', bodyLight: '#d0e3a2',
    rim: '#f4f9da', line: '#31452a', areole: '#f1e5b5', spine: '#eadba4',
    petal: '#ffeccd', petalDeep: '#f4cfa0', petalTip: '#fffaf0', core: '#ffd77e',
    ribCount: 5, spineLen: 4.8
  },
  tbmc: {
    body: '#5f9d86', bodyMid: '#4f8d77', bodyDark: '#2a5747', bodyLight: '#b9e9cc',
    rim: '#dcfaee', line: '#21483b', areole: '#eaf5c9', spine: '#f0e6bd',
    petal: '#f1b6ff', petalDeep: '#d77cf0', petalTip: '#ffe6ff', core: '#ffdb8a',
    ribCount: 9, spineLen: 2.8
  }
};

const FALLBACK_STYLE = STYLES.pachanoi;

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function withAlpha(hex, alpha) {
  if (typeof hex !== 'string' || hex.charAt(0) !== '#' || (hex.length !== 7 && hex.length !== 4)) {
    return 'rgba(255,255,255,' + alpha + ')';
  }
  let raw = hex.slice(1);
  if (raw.length === 3) raw = raw.charAt(0) + raw.charAt(0) + raw.charAt(1) + raw.charAt(1) + raw.charAt(2) + raw.charAt(2);
  const n = parseInt(raw, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

function hashString(input) {
  let h = 2166136261 >>> 0;
  const text = String(input == null ? '' : input);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRandom(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function styleFor(speciesId) {
  return Object.prototype.hasOwnProperty.call(STYLES, speciesId) ? STYLES[speciesId] : FALLBACK_STYLE;
}

/* ------------------------------------------------------------------ */
/* shared geometry                                                     */
/* ------------------------------------------------------------------ */

function smoothClosed(ctx, pts) {
  const n = pts.length;
  if (n < 3) return;
  const mx = (pts[n - 1][0] + pts[0][0]) / 2;
  const my = (pts[n - 1][1] + pts[0][1]) / 2;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  for (let i = 0; i < n; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

function blobPath(ctx, cx, cy, rx, ry, lobes, amp, phase) {
  const n = 20;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    const wobble = 1 + amp * Math.sin(a * lobes + phase) + amp * 0.45 * Math.sin(a * lobes * 2.3 + phase * 1.7);
    pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble]);
  }
  smoothClosed(ctx, pts);
}

function stemPath(ctx, cx, baseY, w, h, lean) {
  const half = w / 2;
  const top = baseY - h;
  ctx.beginPath();
  ctx.moveTo(cx - half, baseY);
  ctx.bezierCurveTo(
    cx - half * 1.08, baseY - h * 0.32,
    cx - half * 0.86 + lean * 0.42, baseY - h * 0.72,
    cx - half * 0.58 + lean, top + half * 0.9
  );
  ctx.bezierCurveTo(
    cx - half * 0.46 + lean, top - half * 0.18,
    cx + half * 0.46 + lean, top - half * 0.18,
    cx + half * 0.58 + lean, top + half * 0.9
  );
  ctx.bezierCurveTo(
    cx + half * 0.86 + lean * 0.42, baseY - h * 0.72,
    cx + half * 1.08, baseY - h * 0.32,
    cx + half, baseY
  );
  ctx.closePath();
}

function drawShadow(ctx, width) {
  const rx = Math.max(15, width * 0.55);
  const ry = Math.max(2.8, rx * 0.16);
  ctx.save();
  ctx.translate(0, 2.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, 'rgba(40,17,38,0.44)');
  g.addColorStop(0.55, 'rgba(54,25,48,0.20)');
  g.addColorStop(1, 'rgba(54,25,48,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* texture helpers                                                     */
/* ------------------------------------------------------------------ */

// Assumes the caller already clipped to a plant body.
function drawVariegationBands(ctx, x0, x1, y0, y1, seed) {
  const rnd = makeRandom(seed ^ 0x5bd1e995);
  const count = 4;
  const spanX = Math.max(6, x1 - x0);
  const spanY = y1 - y0;
  for (let i = 0; i < count; i += 1) {
    const u = clamp((i + 0.5) / count + (rnd() - 0.5) * 0.12, 0.08, 0.92);
    const baseX = x0 + spanX * u;
    const bw = Math.max(2.6, spanX * (0.055 + rnd() * 0.035));
    const bendA = (rnd() - 0.5) * spanX * 0.18;
    const bendB = (rnd() - 0.5) * spanX * 0.22;
    const gold = i % 2 === 0;
    ctx.beginPath();
    ctx.moveTo(baseX - bw / 2, y0);
    ctx.bezierCurveTo(baseX - bw / 2 + bendA, y0 + spanY * 0.36, baseX - bw / 2 + bendB, y0 + spanY * 0.70, baseX - bw / 2 + bendA * 0.4, y1);
    ctx.lineTo(baseX + bw / 2 + bendA * 0.4, y1);
    ctx.bezierCurveTo(baseX + bw / 2 + bendB, y0 + spanY * 0.70, baseX + bw / 2 + bendA, y0 + spanY * 0.36, baseX + bw / 2, y0);
    ctx.closePath();
    ctx.fillStyle = withAlpha(gold ? '#ffdf8f' : '#cdf6d4', gold ? 0.86 : 0.50);
    ctx.fill();
    ctx.strokeStyle = withAlpha(gold ? '#8a6438' : '#4c7a54', 0.28);
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

// Radial sectors used by round buttons and fans. Assumes clipping.
function drawWedgeVariegation(ctx, cx, cy, radius, from, to, seed, count) {
  const rnd = makeRandom(seed ^ 0x27d4eb2d);
  for (let i = 0; i < count; i += 1) {
    const a = from + ((i + 0.5) / count) * (to - from) + (rnd() - 0.5) * 0.14;
    const half = 0.045 + rnd() * 0.04;
    const gold = i % 2 === 0;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a - half, a + half);
    ctx.closePath();
    ctx.fillStyle = withAlpha(gold ? '#ffdd86' : '#d4f8d9', gold ? 0.84 : 0.46);
    ctx.fill();
    ctx.strokeStyle = withAlpha(gold ? '#7d5a33' : '#4b7854', 0.24);
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* flowers                                                             */
/* ------------------------------------------------------------------ */

function drawFlower(ctx, x, y, r, st, seed, time, amount) {
  const rnd = makeRandom(seed ^ 0x85ebca6b);
  const count = amount == null ? 7 : clamp(Math.round(amount), 3, 9);
  const breathe = time > 0 ? 1 + 0.04 * Math.sin(time * 1.7 + (seed % 13)) : 1;
  const rad = Math.max(2.2, r * breathe);
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, rad * 0.15, 0, 0, rad * 2.6);
  glow.addColorStop(0, withAlpha(st.petal, 0.30));
  glow.addColorStop(0.55, withAlpha(st.petal, 0.10));
  glow.addColorStop(1, withAlpha(st.petal, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, rad * 2.6, 0, TAU);
  ctx.fill();

  for (let ring = 0; ring < 2; ring += 1) {
    const petals = ring === 0 ? count : Math.max(4, count - 2);
    const outer = ring === 0;
    const offset = outer ? rad * 0.60 : rad * 0.36;
    const rx = rad * (outer ? 0.31 : 0.22);
    const ry = rad * (outer ? 0.65 : 0.46);
    for (let i = 0; i < petals; i += 1) {
      const a = (i / petals) * TAU + (ring === 0 ? 0.22 : 0.55) + (rnd() - 0.5) * 0.10;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -offset, rx, ry, 0, 0, TAU);
      ctx.fillStyle = outer ? (i % 2 === 0 ? st.petal : st.petalDeep) : withAlpha(st.petalTip, 0.92);
      ctx.fill();
      ctx.strokeStyle = withAlpha(st.line, outer ? 0.30 : 0.20);
      ctx.lineWidth = 0.65;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.beginPath();
  ctx.arc(0, 0, rad * 0.27, 0, TAU);
  ctx.fillStyle = st.core;
  ctx.fill();
  ctx.strokeStyle = withAlpha(st.line, 0.45);
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = withAlpha('#fff6d6', 0.9);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * TAU + 0.4;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rad * 0.18, Math.sin(a) * rad * 0.18, Math.max(0.4, rad * 0.055), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawTuft(ctx, x, y, size, angle, alpha) {
  ctx.save();
  ctx.strokeStyle = withAlpha('#fff7e2', alpha);
  ctx.lineWidth = 0.75;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const a = angle + (i - 1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * size * 0.6, y + Math.sin(a) * size * 0.6,
      x + Math.cos(a + 0.18) * size, y + Math.sin(a + 0.18) * size
    );
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* columnar species                                                    */
/* ------------------------------------------------------------------ */

function drawStem(ctx, cx, baseY, w, h, lean, st, options) {
  const opts = options || {};
  const rnd = makeRandom(opts.seed || 7);
  const half = w / 2;
  const variegated = !!opts.variegated;
  const mature = opts.mature !== false;
  const ribs = Math.max(3, Math.min(9, st.ribCount || 5));

  stemPath(ctx, cx, baseY, w, h, lean);
  ctx.save();
  ctx.clip();

  const bodyGrad = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  bodyGrad.addColorStop(0, st.bodyDark);
  bodyGrad.addColorStop(0.16, st.bodyMid);
  bodyGrad.addColorStop(0.36, st.bodyLight);
  bodyGrad.addColorStop(0.62, st.body);
  bodyGrad.addColorStop(0.86, st.bodyMid);
  bodyGrad.addColorStop(1, st.bodyDark);
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(cx - half - 2, baseY - h - half, w + 4, h + half + 4);

  const shade = ctx.createLinearGradient(0, baseY - h, 0, baseY);
  shade.addColorStop(0, withAlpha(st.bodyLight, 0.20));
  shade.addColorStop(0.5, withAlpha(st.body, 0));
  shade.addColorStop(1, withAlpha(st.bodyDark, 0.26));
  ctx.fillStyle = shade;
  ctx.fillRect(cx - half - 2, baseY - h - half, w + 4, h + half + 4);

  if (variegated) {
    drawVariegationBands(ctx, cx - half, cx + half, baseY, baseY - h + half * 0.4, opts.seed || 3);
  }

  if (st.frost) {
    const frost = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    frost.addColorStop(0, 'rgba(226,247,255,0.20)');
    frost.addColorStop(0.32, 'rgba(226,247,255,0.06)');
    frost.addColorStop(0.7, 'rgba(226,247,255,0)');
    frost.addColorStop(1, 'rgba(226,247,255,0.14)');
    ctx.fillStyle = frost;
    ctx.fillRect(cx - half - 2, baseY - h - half, w + 4, h + half + 4);
  }

  for (let i = 0; i < ribs; i += 1) {
    const u = (i + 0.5) / ribs;
    const steps = 10;
    ctx.beginPath();
    for (let s = 0; s <= steps; s += 1) {
      const f = s / steps;
      const y = baseY - h * 0.02 - h * 0.945 * f;
      const x = cx + (u - 0.5) * w * 0.80 + lean * f * 0.92 + Math.sin(f * 3.4 + i * 1.3) * (0.7 + w * 0.008);
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(st.line, 0.34);
    ctx.lineWidth = Math.max(0.7, w * 0.032);
    ctx.stroke();
    ctx.save();
    ctx.translate(1.15, 0);
    ctx.strokeStyle = withAlpha(st.bodyLight, 0.24);
    ctx.lineWidth = Math.max(0.5, w * 0.02);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  stemPath(ctx, cx, baseY, w, h, lean);
  ctx.strokeStyle = withAlpha(st.line, 0.92);
  ctx.lineWidth = 1.45;
  ctx.lineJoin = 'round';
  ctx.stroke();

  stemPath(ctx, cx, baseY, w, h, lean);
  ctx.save();
  ctx.translate(-1.5, -1.1);
  ctx.strokeStyle = withAlpha(st.rim, 0.30);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();

  stemPath(ctx, cx, baseY, w, h, lean);
  ctx.save();
  ctx.translate(1.6, 0);
  ctx.strokeStyle = withAlpha('#ffc9a8', 0.22);
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();

  const rows = Math.max(3, Math.min(6, Math.round(h / 17)));
  const spines = st.spineLen;
  for (let r = 0; r < rows; r += 1) {
    const f = 0.18 + (r / Math.max(1, rows - 1)) * 0.70;
    const y = baseY - h * f;
    const leanOff = lean * f;
    for (let j = 0; j < ribs; j += 1) {
      const u = (j + 0.5) / ribs;
      const side = (u - 0.5) * 2;
      const x = cx + (u - 0.5) * w * 0.80 + leanOff;
      if (opts.spines === false) continue;
      const len = spines * (0.35 + Math.abs(side) * 0.95) * (0.7 + rnd() * 0.55);
      const baseAngle = side < 0 ? Math.PI + 0.34 : -0.34;
      const angle = baseAngle + (rnd() - 0.5) * 0.55;
      const angle2 = baseAngle + (rnd() - 0.5) * 0.5;
      ctx.save();
      ctx.strokeStyle = st.spine;
      ctx.globalAlpha = 0.86;
      ctx.lineWidth = Math.max(0.65, w * 0.022);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
      if (len > 3.4) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle2) * len * 0.66, y + Math.sin(angle2) * len * 0.66);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, 1.05, 0, TAU);
      ctx.fillStyle = st.areole;
      ctx.fill();
      ctx.strokeStyle = withAlpha(st.line, 0.4);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }

  if (mature) {
    stemPath(ctx, cx, baseY, w, h, lean);
    ctx.save();
    ctx.clip();
    const cap = ctx.createLinearGradient(0, baseY - h - half, 0, baseY - h * 0.75);
    cap.addColorStop(0, withAlpha(st.rim, 0.30));
    cap.addColorStop(1, withAlpha(st.rim, 0));
    ctx.fillStyle = cap;
    ctx.fillRect(cx - half, baseY - h - half, w, h * 0.3 + half);
    ctx.restore();
  }

  return { x: cx + lean, y: baseY - h - half * 0.25 };
}

function drawLophophora(ctx, st, opts) {
  const rnd = makeRandom(opts.seed ^ 0x1b873593);
  drawShadow(ctx, 94);
  const pods = [
    { cx: -16, cy: -20, rx: 23, ry: 18, back: true },
    { cx: 17, cy: -23, rx: 24, ry: 19, back: true },
    { cx: 0, cy: -34, rx: 39, ry: 31, back: false }
  ];
  const flowers = [];

  for (let p = 0; p < pods.length; p += 1) {
    const pod = pods[p];
    blobPath(ctx, pod.cx, pod.cy, pod.rx, pod.ry, 7, 0.055, (opts.seed % 31) * 0.2 + p * 1.1);
    ctx.save();
    ctx.clip();
    const g = ctx.createRadialGradient(
      pod.cx - pod.rx * 0.38, pod.cy - pod.ry * 0.55, pod.rx * 0.08,
      pod.cx, pod.cy, pod.rx * 1.12
    );
    g.addColorStop(0, st.bodyLight);
    g.addColorStop(0.45, st.body);
    g.addColorStop(0.82, st.bodyMid);
    g.addColorStop(1, st.bodyDark);
    ctx.fillStyle = g;
    ctx.fillRect(pod.cx - pod.rx * 1.3, pod.cy - pod.ry * 1.3, pod.rx * 2.6, pod.ry * 2.6);
    if (opts.variegated) {
      drawWedgeVariegation(
        ctx, pod.cx, pod.cy - pod.ry * 0.25, pod.rx * 1.6,
        -Math.PI * 0.08, Math.PI * 0.92, opts.seed + p * 17, 5
      );
    }
    const apexX = pod.cx - 1;
    const apexY = pod.cy - pod.ry * 0.52;
    const ribCount = 8;
    for (let i = 0; i < ribCount; i += 1) {
      const a = Math.PI * (0.16 + (i / (ribCount - 1)) * 0.68);
      const ex = pod.cx + Math.cos(a) * pod.rx * 0.94;
      const ey = pod.cy + Math.sin(a) * pod.ry * 0.92;
      const mx = pod.cx + Math.cos(a) * pod.rx * 0.50;
      const my = pod.cy - pod.ry * 0.10 + Math.sin(a) * pod.ry * 0.22;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.strokeStyle = withAlpha(st.line, 0.30);
      ctx.lineWidth = 1.05;
      ctx.stroke();
      ctx.save();
      ctx.translate(1.2, 0.2);
      ctx.strokeStyle = withAlpha(st.bodyLight, 0.26);
      ctx.lineWidth = 0.65;
      ctx.stroke();
      ctx.restore();
      if (!pod.back) {
        drawTuft(ctx, ex, ey, 2.6 + rnd() * 1.2, Math.PI * 0.5 + (rnd() - 0.5) * 1.4, 0.72);
      }
    }
    ctx.restore();

    blobPath(ctx, pod.cx, pod.cy, pod.rx, pod.ry, 7, 0.055, (opts.seed % 31) * 0.2 + p * 1.1);
    ctx.strokeStyle = withAlpha(st.line, 0.82);
    ctx.lineWidth = 1.35;
    ctx.stroke();
    blobPath(ctx, pod.cx, pod.cy, pod.rx, pod.ry, 7, 0.055, (opts.seed % 31) * 0.2 + p * 1.1);
    ctx.save();
    ctx.translate(-1.4, -1.2);
    ctx.strokeStyle = withAlpha(st.rim, 0.34);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    if (!pod.back) {
      flowers.push([pod.cx - 8, pod.cy - pod.ry * 0.66, 8.6]);
      flowers.push([pod.cx + 8, pod.cy - pod.ry * 0.54, 6.6]);
      flowers.push([pod.cx + 1, pod.cy - pod.ry * 0.92, 5.4]);
      drawTuft(ctx, pod.cx - pod.rx * 0.55, pod.cy - pod.ry * 0.55, 3.2, -2.3, 0.8);
      drawTuft(ctx, pod.cx + pod.rx * 0.55, pod.cy - pod.ry * 0.52, 3.2, -0.8, 0.8);
    }
  }

  if (opts.mature) {
    for (let i = 0; i < flowers.length; i += 1) {
      const f = flowers[i];
      drawFlower(ctx, f[0], f[1], f[2], st, (opts.seed || 1) + i * 31, opts.time, 8);
    }
  }
}

/* ------------------------------------------------------------------ */
/* crested / brain-coral forms                                         */
/* ------------------------------------------------------------------ */

function fanGeometry(w, h, brain, seed) {
  const lobes = brain ? 12 : 8;
  const amp = brain ? 5.4 : 4.9;
  const phase = ((seed % 100) / 100) * TAU;
  const count = brain ? 24 : 16;
  const top = [];
  for (let i = 0; i <= count; i += 1) {
    const u = i / count;
    const arc = Math.sin(Math.PI * u);
    const x = -w * 0.5 + u * w;
    const lobe = Math.sin(u * Math.PI * lobes + phase) * amp * (0.35 + 0.65 * arc);
    const second = brain ? Math.sin(u * Math.PI * lobes * 2.4 + phase * 1.4) * amp * 0.45 : 0;
    const third = brain ? Math.sin(u * Math.PI * lobes * 3.9 + phase * 2.1) * amp * 0.22 : 0;
    const y = -h * (0.60 + 0.32 * arc) + lobe + second + third;
    top.push([x, y]);
  }
  const pts = [
    [-w * 0.15, 0], [-w * 0.28, -h * 0.10], [-w * 0.43, -h * 0.30]
  ];
  for (let i = 0; i < top.length; i += 1) pts.push(top[i]);
  pts.push([w * 0.43, -h * 0.30], [w * 0.28, -h * 0.10], [w * 0.15, 0]);
  return { pts: pts, top: top };
}

function drawCrest(ctx, st, opts) {
  const brain = !!opts.brain;
  const w = brain ? 94 : 92;
  const h = brain ? 78 : 80;
  const seed = opts.seed || 5;
  const geo = fanGeometry(w, h, brain, seed);
  const rnd = makeRandom(seed ^ 0x66d5f4a7);
  drawShadow(ctx, w * 0.98);

  smoothClosed(ctx, geo.pts);
  ctx.save();
  ctx.clip();

  const g = ctx.createLinearGradient(-w * 0.5, -h, w * 0.5, 0);
  g.addColorStop(0, st.bodyDark);
  g.addColorStop(0.18, st.bodyMid);
  g.addColorStop(0.42, st.bodyLight);
  g.addColorStop(0.68, st.body);
  g.addColorStop(0.88, st.bodyMid);
  g.addColorStop(1, st.bodyDark);
  ctx.fillStyle = g;
  ctx.fillRect(-w * 0.55, -h * 1.05, w * 1.1, h * 1.12);

  const vertical = ctx.createLinearGradient(0, -h, 0, 0);
  vertical.addColorStop(0, withAlpha(st.bodyLight, 0.24));
  vertical.addColorStop(0.55, withAlpha(st.body, 0));
  vertical.addColorStop(1, withAlpha(st.bodyDark, 0.30));
  ctx.fillStyle = vertical;
  ctx.fillRect(-w * 0.55, -h * 1.05, w * 1.1, h * 1.12);

  if (opts.variegated) {
    drawWedgeVariegation(ctx, 0, -3, Math.hypot(w, h), -Math.PI * 0.92, -Math.PI * 0.08, seed + 9, 6);
  }

  if (brain) {
    ctx.fillStyle = withAlpha(st.bodyDark, 0.10);
    for (let i = 0; i < 11; i += 1) {
      const mx = (rnd() - 0.5) * w * 0.7;
      const my = -h * (0.2 + rnd() * 0.62);
      ctx.beginPath();
      ctx.ellipse(mx, my, 4 + rnd() * 6, 2 + rnd() * 4, rnd() * 3, 0, TAU);
      ctx.fill();
    }
    const foot = ctx.createLinearGradient(0, -h * 0.30, 0, 0);
    foot.addColorStop(0, withAlpha(st.bodyDark, 0));
    foot.addColorStop(1, withAlpha(st.bodyDark, 0.28));
    ctx.fillStyle = foot;
    ctx.fillRect(-w * 0.55, -h * 0.30, w * 1.1, h * 0.32);
  }

  const ridgeCount = brain ? 9 : 8;
  for (let i = 0; i < ridgeCount; i += 1) {
    const u = (i + 0.5) / ridgeCount;
    const baseX = (u - 0.5) * w * 0.12;
    const topX = -w * 0.46 + u * w * 0.92;
    const topIndex = Math.round(u * (geo.top.length - 1));
    const endY = geo.top[topIndex][1] - 2.5;
    const steps = 8;
    ctx.beginPath();
    for (let s = 0; s <= steps; s += 1) {
      const f = s / steps;
      const x = baseX + (topX - baseX) * f + Math.sin(f * (brain ? 6.6 : 4.4) + i * 1.9) * (brain ? 3.9 : 1.7) * Math.sin(Math.PI * f);
      const y = -h * 0.04 + (endY + h * 0.04) * f;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(st.line, brain ? 0.30 : 0.32);
    ctx.lineWidth = 1.05;
    ctx.stroke();
    ctx.save();
    ctx.translate(1.2, 0.2);
    ctx.strokeStyle = withAlpha(st.bodyLight, 0.24);
    ctx.lineWidth = 0.65;
    ctx.stroke();
    ctx.restore();
  }

  if (brain) {
    for (let i = 0; i < 7; i += 1) {
      const yBase = -h * (0.12 + i * 0.125);
      const amp = 2.4 + (i % 3) * 0.8;
      const phase = seed * 0.013 + i * 1.31;
      ctx.beginPath();
      for (let s = 0; s <= 18; s += 1) {
        const u = s / 18;
        const x = -w * 0.47 + u * w * 0.94;
        const y = yBase
          + Math.sin(u * Math.PI * 6.2 + phase) * amp
          + Math.sin(u * Math.PI * 13.7 + phase * 1.9) * amp * 0.40;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = withAlpha(st.line, 0.26);
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.save();
      ctx.translate(0.9, 1.5);
      ctx.strokeStyle = withAlpha(st.bodyLight, 0.22);
      ctx.lineWidth = 0.65;
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 6; i += 1) {
      const x = -w * 0.36 + (i / 5) * w * 0.72;
      const y0 = -h * (0.18 + (i % 3) * 0.20);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.bezierCurveTo(x + 4, y0 - h * 0.08, x - 5, y0 - h * 0.16, x + 2, y0 - h * 0.24);
      ctx.strokeStyle = withAlpha(st.line, 0.16);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
  ctx.restore();

  smoothClosed(ctx, geo.pts);
  ctx.strokeStyle = withAlpha(st.line, 0.90);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  smoothClosed(ctx, geo.pts);
  ctx.save();
  ctx.translate(-1.5, -1.2);
  ctx.strokeStyle = withAlpha(st.rim, 0.34);
  ctx.lineWidth = 0.85;
  ctx.stroke();
  ctx.restore();

  smoothClosed(ctx, geo.pts);
  ctx.save();
  ctx.translate(1.7, 0);
  ctx.strokeStyle = withAlpha('#ffc9a8', 0.24);
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();

  // TBMC is naturally crested; the paid crested mutation adds a raised
  // secondary crown so it remains visibly distinct at collection-icon size.
  if (brain && opts.extraCrest) {
    const crown = fanGeometry(40, 31, true, seed + 0x31);
    ctx.save();
    ctx.translate(0, -35);
    smoothClosed(ctx, crown.pts);
    const crownFill = ctx.createLinearGradient(-20, -31, 20, 0);
    crownFill.addColorStop(0, st.bodyLight);
    crownFill.addColorStop(0.58, st.body);
    crownFill.addColorStop(1, st.bodyDark);
    ctx.fillStyle = crownFill;
    ctx.fill();
    ctx.strokeStyle = withAlpha(st.line, 0.82);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    for (let i = 0; i < 5; i += 1) {
      const x = -16 + i * 8;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(x * 0.55, -12, x, -26 - (i % 2) * 2);
      ctx.strokeStyle = withAlpha(st.line, 0.36);
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }
    ctx.restore();
  }

  const top = geo.top;
  const marginCount = 12;
  for (let i = 0; i < marginCount; i += 1) {
    const idx = Math.round((i / (marginCount - 1)) * (top.length - 1));
    const p = top[clamp(idx, 0, top.length - 1)];
    const ax = p[0];
    const ay = p[1] + 1.6;
    const side = ax / (w * 0.5);
    if (st.spineLen <= 3.2) {
      drawTuft(ctx, ax, ay, 2.8 + rnd() * 1.2, -Math.PI * 0.5 + side * 0.9, 0.78);
    } else {
      const angle = -Math.PI * 0.5 + side * 0.9 + (rnd() - 0.5) * 0.5;
      const len = st.spineLen * 0.55 * (0.6 + rnd() * 0.6);
      ctx.save();
      ctx.strokeStyle = st.spine;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 0.85;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(angle) * len, ay + Math.sin(angle) * len);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(ax, ay, 1.05, 0, TAU);
    ctx.fillStyle = st.areole;
    ctx.fill();
    ctx.strokeStyle = withAlpha(st.line, 0.35);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  if (opts.mature) {
    const picks = opts.speciesId === 'lophophora' ? [0.26, 0.42, 0.58, 0.74] : [0.34, 0.5, 0.66];
    for (let i = 0; i < picks.length; i += 1) {
      const idx = Math.round(picks[i] * (top.length - 1));
      const p = top[clamp(idx, 0, top.length - 1)];
      drawFlower(ctx, p[0], p[1] - 2, i === 1 ? 7.4 : 5.8, st, seed + i * 19, opts.time, 7);
    }
  }
}

/* ------------------------------------------------------------------ */
/* monstrose and individual species                                    */
/* ------------------------------------------------------------------ */

function drawLump(ctx, cx, cy, rx, ry, angle, st, opts, seed) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  blobPath(ctx, 0, 0, rx, ry, 6, 0.14, seed * 0.7);
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.45, rx * 0.08, 0, 0, rx * 1.2);
  g.addColorStop(0, st.bodyLight);
  g.addColorStop(0.5, st.body);
  g.addColorStop(0.85, st.bodyMid);
  g.addColorStop(1, st.bodyDark);
  ctx.fillStyle = g;
  ctx.fillRect(-rx * 1.5, -ry * 1.5, rx * 3, ry * 3);
  if (opts.variegated) {
    drawVariegationBands(ctx, -rx, rx, ry, -ry, opts.seed + seed);
  }
  ctx.fillStyle = withAlpha(st.bodyLight, 0.16);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * TAU + seed;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * rx * 0.55, Math.sin(a) * ry * 0.55, rx * 0.24, ry * 0.18, a, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  blobPath(ctx, 0, 0, rx, ry, 6, 0.14, seed * 0.7);
  ctx.strokeStyle = withAlpha(st.line, 0.82);
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.save();
  ctx.translate(-1.1, -1.0);
  ctx.strokeStyle = withAlpha(st.rim, 0.30);
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + seed * 0.9;
    const ax = Math.cos(a) * rx * 0.82;
    const ay = Math.sin(a) * ry * 0.82;
    ctx.beginPath();
    ctx.arc(ax, ay, 1.0, 0, TAU);
    ctx.fillStyle = st.areole;
    ctx.fill();
    ctx.strokeStyle = withAlpha(st.line, 0.4);
    ctx.lineWidth = 0.4;
    ctx.stroke();
    if (st.spineLen > 3) {
      ctx.save();
      ctx.strokeStyle = st.spine;
      ctx.globalAlpha = 0.82;
      ctx.lineWidth = 0.8;
      ctx.lineCap = 'round';
      const len = st.spineLen * 0.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(a) * len, ay + Math.sin(a) * len);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawTbm(ctx, st, opts) {
  drawShadow(ctx, 72);
  const rnd = makeRandom(opts.seed ^ 0x3c6ef372);
  const left = [
    { x: -13, y: -45, rx: 12, ry: 11, a: -0.50, s: 1 },
    { x: -24, y: -57, rx: 10.5, ry: 10, a: -0.90, s: 2 },
    { x: -31, y: -70, rx: 8.5, ry: 8, a: -1.15, s: 3 }
  ];
  const right = [
    { x: 17, y: -46, rx: 9, ry: 10, a: 0.55, s: 4 },
    { x: 25, y: -57, rx: 7.5, ry: 8, a: 1.00, s: 5 }
  ];
  for (let i = 0; i < left.length; i += 1) {
    const s = left[i];
    drawLump(ctx, s.x, s.y, s.rx, s.ry, s.a, st, opts, opts.seed + s.s * 13);
  }
  for (let i = 0; i < right.length; i += 1) {
    const s = right[i];
    drawLump(ctx, s.x, s.y, s.rx, s.ry, s.a, st, opts, opts.seed + s.s * 13);
  }
  const chain = [
    { x: 0, y: -15, rx: 21, ry: 17, a: 0.04, s: 4 },
    { x: 4, y: -37, rx: 18, ry: 16, a: -0.12, s: 5 },
    { x: -2, y: -58, rx: 16, ry: 15, a: 0.16, s: 6 },
    { x: 2, y: -76, rx: 13, ry: 13, a: -0.10, s: 7 },
    { x: -2, y: -91, rx: 10, ry: 11, a: 0.20, s: 8 }
  ];
  for (let i = 0; i < chain.length; i += 1) {
    const s = chain[i];
    drawLump(ctx, s.x, s.y, s.rx, s.ry, s.a, st, opts, opts.seed + s.s * 17);
  }
  const creases = [
    [2, -27, 16], [1, -48, 13], [-0.5, -67, 11], [0, -83, 8]
  ];
  ctx.save();
  ctx.strokeStyle = withAlpha(st.line, 0.18);
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  for (let i = 0; i < creases.length; i += 1) {
    const c = creases[i];
    ctx.beginPath();
    ctx.moveTo(c[0] - c[2], c[1]);
    ctx.quadraticCurveTo(c[0], c[1] + 3.2, c[0] + c[2], c[1] - 0.6);
    ctx.stroke();
  }
  ctx.restore();
  if (opts.mature) {
    drawFlower(ctx, -4 + (rnd() - 0.5) * 3, -104, 5.6, st, opts.seed + 77, opts.time, 6);
  }
}

function drawPachanoi(ctx, st, opts) {
  drawShadow(ctx, 86);
  drawStem(ctx, -22, -1, 19, 57, -6, st, { variegated: opts.variegated, seed: opts.seed + 11, mature: false });
  drawStem(ctx, 23, -2, 16, 41, 5, st, { variegated: opts.variegated, seed: opts.seed + 23, mature: false });
  const top = drawStem(ctx, 1, 0, 34, 104, 2, st, { variegated: opts.variegated, seed: opts.seed + 31, mature: opts.mature });
  if (opts.mature) drawFlower(ctx, top.x - 2, top.y - 1, 7.2, st, opts.seed + 3, opts.time, 7);
}

function drawPeruvianus(ctx, st, opts) {
  drawShadow(ctx, 82);
  drawStem(ctx, -23, -1, 16, 48, -7, st, { variegated: opts.variegated, seed: opts.seed + 13, mature: false });
  const top = drawStem(ctx, 2, 0, 30, 107, -1, st, { variegated: opts.variegated, seed: opts.seed + 29, mature: opts.mature });
  if (opts.mature) drawFlower(ctx, top.x + 1, top.y - 1, 6.2, st, opts.seed + 7, opts.time, 6);
}

function drawBridgesii(ctx, st, opts) {
  drawShadow(ctx, 74);
  drawStem(ctx, -16, -1, 14, 66, 6, st, { variegated: opts.variegated, seed: opts.seed + 5, mature: false });
  drawStem(ctx, 16, -2, 13, 51, -7, st, { variegated: opts.variegated, seed: opts.seed + 19, mature: false });
  const top = drawStem(ctx, 0, 0, 20, 103, -3, st, { variegated: opts.variegated, seed: opts.seed + 37, mature: opts.mature });
  if (opts.mature) drawFlower(ctx, top.x, top.y - 1, 6.6, st, opts.seed + 2, opts.time, 6);
}

function drawPlantCondition(ctx, speciesId, health, seed) {
  if (health >= 72) return;
  const marks = {
    lophophora: [25, -29], pachanoi: [13, -35], peruvianus: [12, -37],
    bridgesii: [9, -34], tbm: [14, -31], tbmc: [31, -30]
  };
  const [x, y] = marks[speciesId] || marks.pachanoi;
  const stress = clamp((72 - health) / 48, 0.22, 1);
  ctx.save();
  ctx.fillStyle = withAlpha('#b88b63', 0.22 + stress * 0.34);
  ctx.beginPath();
  ctx.ellipse(x, y + 3, 5.6, 3.3, -0.25, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = withAlpha('#795d48', 0.40 + stress * 0.34);
  ctx.lineWidth = 1.45;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const yy = y + i * 4;
    ctx.beginPath();
    ctx.moveTo(x + side * (3 + (seed % 3)), yy);
    ctx.quadraticCurveTo(x + side * 0.5, yy + 1.7, x - side * 4, yy + 0.3);
    ctx.stroke();
  }
  if (health <= 48) {
    // A compact scalloped scar reads as a bite while leaving the silhouette clear.
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 3);
    ctx.quadraticCurveTo(x + 7, y - 7, x + 12, y - 2);
    ctx.quadraticCurveTo(x + 9, y + 1, x + 13, y + 4);
    ctx.quadraticCurveTo(x + 6, y + 8, x + 1, y + 4);
    ctx.closePath();
    ctx.fillStyle = withAlpha('#bd765d', 0.92);
    ctx.fill();
    ctx.strokeStyle = withAlpha('#553c35', 0.78);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + 7, y + 1, 2.3, 1.5, -0.25, 0, TAU);
    ctx.fillStyle = withAlpha('#563c36', 0.72);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* public plant entry points                                           */
/* ------------------------------------------------------------------ */

/**
 * Draw one specimen. x,y is the base centre; scale 1 is ~110 px tall at
 * growth 100. Animation is subtle and freezes at time 0 (reduced motion).
 */
export function drawCactus(ctx, plant, x, y, scale, time) {
  if (!ctx || !plant) return;
  const baseScale = num(scale, 1);
  if (!(baseScale > 0)) return;

  const speciesId = Object.prototype.hasOwnProperty.call(STYLES, plant.speciesId) ? plant.speciesId : 'pachanoi';
  const st = styleFor(speciesId);
  const mutation = MUTATION_IDS.has(plant.mutation) ? plant.mutation : 'normal';
  const growth = clamp(num(plant.growth, 100), 0, 100);
  const growthScale = 0.22 + 0.78 * Math.pow(growth / 100, 0.85);
  const variegated = mutation === 'variegated' || mutation === 'variegated-crested';
  const crested = mutation === 'crested' || mutation === 'variegated-crested';
  const seed = hashString((plant.id == null ? 'specimen' : plant.id) + '|' + speciesId + '|' + mutation);
  const t = Math.max(0, num(time, 0)) * 0.001;
  const sway = t > 0 ? Math.sin(t * 1.05 + (seed % 628) / 100) * 0.0075 : 0;
  const opts = {
    variegated: variegated,
    seed: seed,
    time: t,
    mature: growth >= 55,
    speciesId: speciesId,
    health: clamp(num(plant.health, 100), 0, 100)
  };
  const px = num(x, 0);
  const py = num(y, 0);
  const s = baseScale * growthScale;

  ctx.save();
  try {
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.rotate(sway);
    if (crested || speciesId === 'tbmc') {
      opts.brain = speciesId === 'tbmc';
      opts.extraCrest = speciesId === 'tbmc' && crested;
      drawCrest(ctx, st, opts);
    } else if (speciesId === 'lophophora') {
      drawLophophora(ctx, st, opts);
    } else if (speciesId === 'tbm') {
      drawTbm(ctx, st, opts);
    } else if (speciesId === 'peruvianus') {
      drawPeruvianus(ctx, st, opts);
    } else if (speciesId === 'bridgesii') {
      drawBridgesii(ctx, st, opts);
    } else {
      drawPachanoi(ctx, st, opts);
    }
    drawPlantCondition(ctx, speciesId, opts.health, seed);
  } finally {
    ctx.restore();
  }
}

/**
 * Draw a specimen centred in an icon box. Never clears the canvas; the
 * caller owns the background. Delegates to drawCactus internally.
 */
export function drawPlantIcon(ctx, speciesId, mutation, width, height) {
  if (!ctx) return;
  const w = Math.max(1, num(width, 100));
  const h = Math.max(1, num(height, 100));
  const safeSpecies = Object.prototype.hasOwnProperty.call(STYLES, speciesId) ? speciesId : 'pachanoi';
  const safeMutation = MUTATION_IDS.has(mutation) ? mutation : 'normal';
  const fit = Math.min((w * 0.86) / 100, (h * 0.84) / 110);
  const plant = {
    id: 'icon:' + safeSpecies + ':' + safeMutation,
    speciesId: safeSpecies,
    mutation: safeMutation,
    growth: 100,
    health: 100,
    moisture: 60,
    age: 20
  };
  ctx.save();
  try {
    drawCactus(ctx, plant, w / 2, h * 0.91, fit, 0);
  } finally {
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* desert backdrop                                                     */
/* ------------------------------------------------------------------ */

function ridgeY(u, baseY, amp, freq, phase, jagged) {
  if (jagged) {
    const s = Math.abs(Math.sin(u * Math.PI * freq + phase));
    const s2 = Math.abs(Math.sin(u * Math.PI * freq * 2.7 + phase * 1.9));
    return baseY - amp * (0.28 + 0.72 * s) - amp * 0.16 * s2;
  }
  const s = Math.sin(u * Math.PI * freq + phase);
  const s2 = Math.sin(u * Math.PI * freq * 2.3 + phase * 1.4);
  return baseY - amp * (0.42 + 0.45 * s + 0.18 * s2);
}

function traceRidge(ctx, w, baseY, amp, freq, phase, jagged, yOffset) {
  const steps = 56;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const x = u * w;
    const y = ridgeY(u, baseY, amp, freq, phase, jagged) + yOffset;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function fillRidge(ctx, w, baseY, amp, freq, phase, jagged, bottomY, fillStyle) {
  traceRidge(ctx, w, baseY, amp, freq, phase, jagged, 0);
  ctx.lineTo(w, bottomY);
  ctx.lineTo(0, bottomY);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRidge(ctx, w, baseY, amp, freq, phase, jagged, yOffset, color, width) {
  traceRidge(ctx, w, baseY, amp, freq, phase, jagged, yOffset);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawFullMoon(ctx, cx, cy, r, detail, t) {
  const pulse = t > 0 ? 0.92 + 0.08 * Math.sin(t * 0.9) : 1;
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 3.6);
  glow.addColorStop(0, withAlpha('#ffd9ea', 0.34 * pulse));
  glow.addColorStop(0.45, withAlpha('#ffb8d8', 0.13 * pulse));
  glow.addColorStop(1, withAlpha('#ffb8d8', 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 3.6, 0, TAU);
  ctx.fill();

  const disc = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.38, r * 0.12, cx, cy, r);
  disc.addColorStop(0, '#fff5f3');
  disc.addColorStop(0.5, '#ffdbe6');
  disc.addColorStop(0.86, '#efb6d0');
  disc.addColorStop(1, '#d998ba');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(196,126,166,0.20)';
  const craters = [
    [-0.34, -0.10, 0.18], [0.24, 0.30, 0.12], [0.06, -0.38, 0.09], [0.36, -0.18, 0.07]
  ];
  for (let i = 0; i < craters.length; i += 1) {
    const c = craters[i];
    ctx.beginPath();
    ctx.ellipse(cx + c[0] * r, cy + c[1] * r, c[2] * r, c[2] * r * 0.85, i * 0.7, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = withAlpha('#ffe4f3', 0.30);
  ctx.lineWidth = 0.85 * detail;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.16, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawCrescent(ctx, cx, cy, r, detail, t) {
  const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 4.2);
  glow.addColorStop(0, withAlpha('#e8d6ff', 0.24));
  glow.addColorStop(1, withAlpha('#e8d6ff', 0));
  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 4.2, 0, TAU);
  ctx.fill();

  const d = r * 0.48;
  const r2 = r * 0.94;
  const x0 = clamp((r * r - r2 * r2 + d * d) / (2 * d), -r * 0.95, r * 0.95);
  const y0 = Math.sqrt(Math.max(0, r * r - x0 * x0));
  const aB = Math.atan2(y0, x0);
  const aT = Math.atan2(-y0, x0);
  const iT = Math.atan2(-y0, x0 - d);
  const iB = Math.atan2(y0, x0 - d);
  ctx.beginPath();
  ctx.arc(cx, cy, r, aB, TAU + aT, false);
  ctx.arc(cx + d, cy, r2, iT + TAU, iB, true);
  ctx.closePath();
  const fill = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  fill.addColorStop(0, '#fff1f7');
  fill.addColorStop(0.7, '#f0cfe4');
  fill.addColorStop(1, '#cf9fc4');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = withAlpha('#ffe6f4', 0.40);
  ctx.lineWidth = 0.8 * detail;
  ctx.stroke();
  if (t > 0) {
    ctx.strokeStyle = withAlpha('#ffe6f4', 0.16 + 0.06 * Math.sin(t * 1.2));
    ctx.lineWidth = 1.2 * detail;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.5, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Paint the desert backdrop only: sky, stars, moons, ridges and calm dunes.
 * No plots, labels or interface. time=0 gives a still image.
 */
export function drawLandscape(ctx, width, height, options) {
  if (!ctx) return;
  const opts = options && typeof options === 'object' ? options : {};
  const w = Math.max(1, num(width, 1));
  const h = Math.max(1, num(height, 1));
  const t = Math.max(0, num(opts.time, 0)) * 0.001;
  const day = Math.max(1, num(opts.day, 1));
  const psychedelic = opts.psychedelic !== false;
  const detail = clamp(Math.min(w, h) / 720, 0.55, 1.8);
  const horizon = h * 0.565;
  const rnd = makeRandom(0x0cac7175);

  ctx.save();
  try {
    const skyStops = psychedelic
      ? [[0, '#120b20'], [0.28, '#2b1942'], [0.50, '#55306a'], [0.68, '#8d4478'], [0.82, '#d27694'], [0.93, '#f7adab'], [1, '#ffd0b4']]
      : [[0, '#1d1626'], [0.32, '#3f2c42'], [0.58, '#744a5c'], [0.76, '#ad6f72'], [0.90, '#dfa189'], [1, '#ffd3b2']];
    const sky = ctx.createLinearGradient(0, 0, w * 0.10, horizon);
    for (let i = 0; i < skyStops.length; i += 1) sky.addColorStop(skyStops[i][0], skyStops[i][1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.lineCap = 'round';
    const bands = psychedelic
      ? [['#f4baff', 0.07, 0.16, 0.30], ['#ffb2cf', 0.06, 0.30, 0.42], ['#c9b6ff', 0.05, 0.08, 0.20]]
      : [['#e8c2d8', 0.05, 0.18, 0.34]];
    for (let i = 0; i < bands.length; i += 1) {
      const b = bands[i];
      ctx.strokeStyle = withAlpha(b[0], b[1]);
      ctx.lineWidth = h * (0.055 + i * 0.012);
      ctx.beginPath();
      ctx.moveTo(-w * 0.15, horizon * b[2]);
      ctx.bezierCurveTo(w * 0.25, horizon * (b[3] - 0.08), w * 0.58, horizon * (b[2] + 0.10), w * 1.12, horizon * b[3]);
      ctx.stroke();
    }
    ctx.restore();

    const glowX = w * 0.40;
    const glowR = Math.max(w, h) * 0.62;
    const horizonGlow = ctx.createRadialGradient(glowX, horizon * 0.98, 0, glowX, horizon * 0.98, glowR);
    horizonGlow.addColorStop(0, withAlpha(psychedelic ? '#ffd1b2' : '#ffd8b4', 0.34));
    horizonGlow.addColorStop(0.42, withAlpha(psychedelic ? '#ffa9bd' : '#f0b39e', 0.16));
    horizonGlow.addColorStop(1, withAlpha('#ffa9bd', 0));
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, w, horizon + h * 0.06);

    const starCount = psychedelic ? 94 : 46;
    for (let i = 0; i < starCount; i += 1) {
      const sx = rnd() * w;
      const sy = rnd() * horizon * 0.90;
      const moonX = w * (0.73 + 0.012 * Math.sin(day * 0.7));
      const moonY = h * (0.17 + 0.008 * Math.cos(day * 0.5));
      const moonDist = Math.hypot(sx - moonX, sy - moonY);
      if (moonDist < Math.min(w, h) * 0.16) continue;
      const sr = (0.35 + rnd() * 1.15) * detail;
      let alpha = 0.18 + rnd() * 0.55;
      if (t > 0) alpha *= 0.70 + 0.30 * Math.sin(t * (0.6 + rnd() * 0.8) + i * 1.7 + day * 0.6);
      ctx.fillStyle = withAlpha(i % 7 === 0 ? '#ffe6f4' : '#fff4e4', alpha);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fill();
      if (sr > 1.15) {
        ctx.strokeStyle = withAlpha('#ffe8f5', alpha * 0.55);
        ctx.lineWidth = 0.55 * detail;
        ctx.beginPath();
        ctx.moveTo(sx - sr * 2.4, sy);
        ctx.lineTo(sx + sr * 2.4, sy);
        ctx.moveTo(sx, sy - sr * 2.4);
        ctx.lineTo(sx, sy + sr * 2.4);
        ctx.stroke();
      }
    }

    const moonX = w * (0.73 + 0.012 * Math.sin(day * 0.7));
    const moonY = h * (0.17 + 0.008 * Math.cos(day * 0.5));
    drawFullMoon(ctx, moonX, moonY, Math.max(8, Math.min(w, h) * 0.068), detail, t);
    drawCrescent(ctx, w * 0.19, h * 0.30, Math.max(5, Math.min(w, h) * 0.030), detail, t);

    const farFill = ctx.createLinearGradient(0, horizon - h * 0.16, 0, horizon + h * 0.02);
    farFill.addColorStop(0, psychedelic ? 'rgba(122,71,122,0.92)' : 'rgba(108,79,88,0.92)');
    farFill.addColorStop(1, psychedelic ? 'rgba(66,38,74,0.96)' : 'rgba(78,56,66,0.96)');
    fillRidge(ctx, w, horizon, h * 0.145, 1.7, 0.6, true, horizon + h * 0.055, farFill);
    strokeRidge(ctx, w, horizon, h * 0.145, 1.7, 0.6, true, 0, withAlpha('#f0b6e0', 0.28), 0.9 * detail);
    strokeRidge(ctx, w, horizon, h * 0.145, 1.7, 0.6, true, h * 0.018, withAlpha('#d79ac8', 0.22), 0.75 * detail);
    strokeRidge(ctx, w, horizon, h * 0.145, 1.7, 0.6, true, h * 0.036, withAlpha('#c98bbb', 0.16), 0.7 * detail);

    const midFill = ctx.createLinearGradient(0, horizon - h * 0.08, 0, horizon + h * 0.09);
    midFill.addColorStop(0, psychedelic ? '#7f4a72' : '#75565e');
    midFill.addColorStop(1, psychedelic ? '#9c5d7f' : '#8f6864');
    fillRidge(ctx, w, horizon + h * 0.018, h * 0.082, 2.5, 2.3, true, horizon + h * 0.13, midFill);
    strokeRidge(ctx, w, horizon + h * 0.018, h * 0.082, 2.5, 2.3, true, h * 0.015, withAlpha('#e9a9c9', 0.20), 0.75 * detail);

    const groundTop = horizon + h * 0.015;
    const ground = ctx.createLinearGradient(0, groundTop, 0, h);
    ground.addColorStop(0, psychedelic ? '#c3868c' : '#b9887e');
    ground.addColorStop(0.45, psychedelic ? '#dda597' : '#caa08e');
    ground.addColorStop(1, psychedelic ? '#f4cfb2' : '#e6c4a6');
    ctx.fillStyle = ground;
    ctx.fillRect(0, groundTop, w, h - groundTop);

    const duneFar = ctx.createLinearGradient(0, horizon + h * 0.05, 0, h);
    duneFar.addColorStop(0, psychedelic ? 'rgba(185,119,137,0.95)' : 'rgba(170,125,118,0.95)');
    duneFar.addColorStop(1, psychedelic ? 'rgba(152,96,124,0.95)' : 'rgba(145,108,112,0.95)');
    fillRidge(ctx, w, horizon + h * 0.105, h * 0.050, 1.3, 1.2, false, h, duneFar);
    strokeRidge(ctx, w, horizon + h * 0.105, h * 0.050, 1.3, 1.2, false, 0, withAlpha('#f3bcc8', 0.22), 0.85 * detail);
    strokeRidge(ctx, w, horizon + h * 0.105, h * 0.050, 1.3, 1.2, false, h * 0.022, withAlpha('#8c5872', 0.16), 0.7 * detail);

    const duneMid = ctx.createLinearGradient(0, horizon + h * 0.16, 0, h);
    duneMid.addColorStop(0, psychedelic ? '#d99a92' : '#c99b88');
    duneMid.addColorStop(1, psychedelic ? '#bd7f80' : '#b3827c');
    fillRidge(ctx, w, horizon + h * 0.225, h * 0.062, 1.8, 3.5, false, h, duneMid);
    strokeRidge(ctx, w, horizon + h * 0.225, h * 0.062, 1.8, 3.5, false, 0, withAlpha('#ffd1c9', 0.24), 0.9 * detail);
    strokeRidge(ctx, w, horizon + h * 0.225, h * 0.062, 1.8, 3.5, false, h * 0.020, withAlpha('#95606f', 0.15), 0.7 * detail);
    strokeRidge(ctx, w, horizon + h * 0.225, h * 0.062, 1.8, 3.5, false, h * 0.040, withAlpha('#95606f', 0.11), 0.65 * detail);

    const duneNear = ctx.createLinearGradient(0, h * 0.70, 0, h);
    duneNear.addColorStop(0, psychedelic ? '#eab99d' : '#dcb397');
    duneNear.addColorStop(0.62, psychedelic ? '#f2c9ab' : '#e3c3a2');
    duneNear.addColorStop(1, psychedelic ? '#f9dcc0' : '#eed3b4');
    fillRidge(ctx, w, h * 0.845, h * 0.045, 1.2, 0.7, false, h, duneNear);
    strokeRidge(ctx, w, h * 0.845, h * 0.045, 1.2, 0.7, false, 0, withAlpha('#ffe1c8', 0.34), 1.0 * detail);
    strokeRidge(ctx, w, h * 0.845, h * 0.045, 1.2, 0.7, false, h * 0.022, withAlpha('#a46b63', 0.12), 0.7 * detail);
    strokeRidge(ctx, w, h * 0.845, h * 0.045, 1.2, 0.7, false, h * 0.044, withAlpha('#a46b63', 0.09), 0.65 * detail);

    ctx.save();
    ctx.strokeStyle = withAlpha('#a46b63', 0.09);
    ctx.lineWidth = 0.8 * detail;
    for (let i = 0; i < 3; i += 1) {
      const inset = i * 0.018;
      ctx.beginPath();
      ctx.moveTo(w * (0.015 + inset), h * (0.985 - i * 0.035));
      ctx.bezierCurveTo(w * 0.06, h * (0.96 - i * 0.03), w * 0.12, h * (0.975 - i * 0.03), w * 0.19, h * (0.95 - i * 0.025));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * (0.985 - inset), h * (0.99 - i * 0.035));
      ctx.bezierCurveTo(w * 0.94, h * (0.965 - i * 0.03), w * 0.87, h * (0.98 - i * 0.03), w * 0.80, h * (0.955 - i * 0.025));
      ctx.stroke();
    }
    ctx.restore();

    const haze = ctx.createLinearGradient(0, horizon - h * 0.04, 0, horizon + h * 0.06);
    haze.addColorStop(0, withAlpha('#ffc9bd', 0));
    haze.addColorStop(0.55, withAlpha('#ffc9bd', 0.16));
    haze.addColorStop(1, withAlpha('#ffc9bd', 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - h * 0.04, w, h * 0.10);

    const vignette = ctx.createRadialGradient(w * 0.50, h * 0.44, Math.min(w, h) * 0.22, w * 0.50, h * 0.44, Math.max(w, h) * 0.78);
    vignette.addColorStop(0, 'rgba(26,10,32,0)');
    vignette.addColorStop(0.72, 'rgba(26,10,32,0.10)');
    vignette.addColorStop(1, 'rgba(26,10,32,0.40)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  } finally {
    ctx.restore();
  }
}
