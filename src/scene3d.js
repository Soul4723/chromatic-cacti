import * as THREE from 'three';
import { getPlotPosition } from './combat.js';
import { createPlantModel, createPestModel, createWormModel, createWormFarmModel, disposeModel } from './models3d.js';

// Logical garden coordinates are shared with combat; +z points towards the viewer.
const world = (x, y) => [(x - 50) * 0.1, (y - 65) * 0.1];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Deterministic scatter so the desert looks the same on every visit.
function seeded(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SKY = { zenith: 0x8c86cc, mid: 0xe6b2bb, horizon: 0xf4cdb0 };
const SAND = { base: '#e6ad86', light: '#f3c99f', dark: '#cf927a', bed: '#b8735f' };
// Garden bed oval in world units; every one of the 24 plot slots sits inside it.
const BED = { x: 0.1, z: 0, rx: 6, rz: 4.8 };
const DECOR_SIZE = 34;
const PLOT_SLOTS = Array.from({ length: 24 }, (_, i) => world(...getPlotPosition(i)));
const nearPlot = (x, z, gap) => PLOT_SLOTS.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap);

// Procedural sand: speckles, a tended bed and soft raking, fading out to the dunes.
function paintGround(size) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), px = size / DECOR_SIZE, mid = size / 2, rand = seeded(17);
  g.fillStyle = SAND.base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const r = (1.2 + rand() * 3.5) * px, x = rand() * size, y = rand() * size;
    const glow = g.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, rand() < .5 ? 'rgba(248,212,170,.35)' : 'rgba(196,128,110,.22)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rand() < .55 ? 'rgba(255,232,200,.5)' : 'rgba(150,92,82,.35)';
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 1.2, 1 + rand() * 1.2);
  }
  // Tended bed: darker rose earth with a soft rim, then raked rings.
  g.save(); g.translate(mid + BED.x * px, mid + BED.z * px); g.scale(1, BED.rz / BED.rx);
  const bed = g.createRadialGradient(0, 0, 0, 0, 0, (BED.rx + .7) * px);
  bed.addColorStop(0, 'rgba(178,108,92,.85)'); bed.addColorStop(.82, 'rgba(182,112,94,.8)'); bed.addColorStop(1, 'rgba(182,112,94,0)');
  g.fillStyle = bed; g.beginPath(); g.arc(0, 0, (BED.rx + .7) * px, 0, Math.PI * 2); g.fill();
  g.lineWidth = Math.max(1, px * .06); g.strokeStyle = 'rgba(232,170,140,.22)';
  for (let r = BED.rx + .35; r < BED.rx + 3.2; r += .32) { g.beginPath(); g.arc(0, 0, r * px, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  // Fade to transparent so the textured square melts into the vertex-coloured dunes.
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(mid, mid, size * .3, mid, mid, size * .5);
  fade.addColorStop(0, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, size, size);
  return canvas;
}

function instanced(geometry, material, entries, { shadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  entries.forEach(([x, y, z, sx, sy, sz, ry = 0, rz = 0, hex], i) => {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, rz); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (hex !== undefined) mesh.setColorAt(i, color.setHex(hex));
  });
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  return mesh;
}

function buildWorld(group, renderer) {
  const rand = seeded(42);
  // Sky dome: lavender zenith to peach haze, matching the fog colour at the horizon.
  const skyGeometry = new THREE.SphereGeometry(150, 24, 14), skyColors = [];
  const zenith = new THREE.Color(SKY.zenith), mid = new THREE.Color(SKY.mid), horizon = new THREE.Color(SKY.horizon), c = new THREE.Color();
  const sp = skyGeometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const h = sp.getY(i) / 150;
    if (h < .04) c.copy(horizon); else if (h < .3) c.copy(horizon).lerp(mid, smooth(.04, .3, h)); else c.copy(mid).lerp(zenith, smooth(.3, .85, h));
    skyColors.push(c.r, c.g, c.b);
  }
  skyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1; group.add(sky);

  // Outer ground: flat around the garden, rolling dunes further out.
  const groundGeometry = new THREE.PlaneGeometry(260, 260, 90, 90); groundGeometry.rotateX(-Math.PI / 2);
  const gp = groundGeometry.attributes.position, groundColors = [];
  const base = new THREE.Color(SAND.base), light = new THREE.Color(SAND.light), dark = new THREE.Color(SAND.dark);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), r = Math.hypot(x, z);
    const wave = Math.sin(x * .11 + Math.cos(z * .07) * 2.2) * .6 + Math.sin(z * .19 + x * .04) * .4;
    const h = smooth(18, 60, r) * (wave * 1.6 + 1.4);
    gp.setY(i, r < 15 ? -.02 : h - .02);
    c.copy(base).lerp(wave > 0 ? light : dark, Math.abs(wave) * smooth(10, 30, r) * .8);
    groundColors.push(c.r, c.g, c.b);
  }
  groundGeometry.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; group.add(ground);

  const texture = new THREE.CanvasTexture(paintGround(1024));
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(DECOR_SIZE, DECOR_SIZE), new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  decal.rotation.x = -Math.PI / 2; decal.receiveShadow = true; group.add(decal);

  // Distant mesas: two stacked tiers in pre-hazed colours (beyond the fog's far plane).
  const mesas = [], tiers = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + rand() * .3, r = 72 + rand() * 22, w = 5 + rand() * 8, h = 3 + rand() * 4.5;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r, hex = [0xdba79c, 0xcf9ca4, 0xe5b4a0][i % 3];
    mesas.push([x, h / 2 - 1, z, w, h, w * (.5 + rand() * .4), rand() * 3, 0, hex]);
    if (rand() < .6) tiers.push([x + (rand() - .5) * w * .4, h - 1 + h * .18, z, w * .45, h * .36, w * .3, rand() * 3, 0, hex]);
  }
  const mesaGeometry = new THREE.CylinderGeometry(.92, 1, 1, 7), mesaMaterial = new THREE.MeshLambertMaterial({ flatShading: true, fog: false });
  group.add(instanced(mesaGeometry, mesaMaterial, mesas), instanced(mesaGeometry, mesaMaterial, tiers));

  // Wild saguaros behind the nursery for scale and character.
  const limbs = [];
  for (const [x, z, h, lean] of [[-13, -21, 3.6, .04], [-6, -27, 3, -.03], [11, -19, 4.2, -.05], [19, -26, 3.2, .02], [-22, -12, 2.8, .05], [22, -9, 3.3, -.04], [3, -31, 3.8, .02], [-25, -30, 4, -.02]]) {
    limbs.push([x, h / 2, z, .34, h / 2, .34, 0, lean]);
    for (const side of [-1, 1]) {
      if (rand() < .25) continue;
      const ay = h * (.38 + rand() * .25), arm = .7 + rand() * .9;
      limbs.push([x + side * .38, ay, z, .2, .32, .2, 0, side * Math.PI / 2]);
      limbs.push([x + side * .62, ay + arm / 2, z, .22, arm / 2, .22, 0, 0]);
    }
  }
  group.add(instanced(new THREE.CapsuleGeometry(1, 1.2, 3, 8), new THREE.MeshLambertMaterial({ color: 0x6f9a74 }), limbs));

  // Rocks outside the bed, a pebble border around it and a stepping-stone path.
  const rocks = [], pebbles = [], stones = [];
  for (let i = 0; rocks.length < 34 && i < 400; i++) {
    const a = rand() * Math.PI * 2, r = 1.12 + rand() * 1.4, x = BED.x + Math.cos(a) * BED.rx * r, z = BED.z + Math.sin(a) * BED.rz * r;
    if (Math.abs(x) > 15 || z > 9 || nearPlot(x, z, 1.2)) continue;
    const s = .1 + rand() ** 2 * .34;
    rocks.push([x, s * .25, z, s * (1 + rand() * .6), s * (.5 + rand() * .4), s, rand() * 6, 0, [0xb59088, 0x9d7c7f, 0xc8a493][i % 3]]);
  }
  const perimeter = 2 * Math.PI * Math.sqrt((BED.rx ** 2 + BED.rz ** 2) / 2);
  for (let i = 0, n = Math.round(perimeter / .3); i < n; i++) {
    const a = i / n * Math.PI * 2, s = .07 + rand() * .06;
    pebbles.push([BED.x + Math.cos(a) * (BED.rx + .15), s * .3, BED.z + Math.sin(a) * (BED.rz + .15), s * 1.3, s * .6, s, rand() * 6, 0, [0xf1dcc6, 0xd8b8a8, 0xbfa0a6][i % 3]]);
  }
  for (let i = 0; i < 7; i++) {
    const z = BED.z + BED.rz + .7 + i * .95, x = .55 + Math.sin(i * .9) * .45;
    stones.push([x, .02, z, .36 + rand() * .08, .05, .3, rand() * 3, 0, 0xd6bcaf]);
  }
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0), rockMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  group.add(instanced(rockGeometry, rockMaterial, rocks, { shadow: true }), instanced(rockGeometry, rockMaterial, pebbles),
    instanced(new THREE.CylinderGeometry(1, 1, 1, 7), rockMaterial, stones));
  return [texture];
}

export function createGarden3D(canvas, { onViewChange } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setClearColor(SKY.horizon);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon, 24, 78);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 320);
  const hemi = new THREE.HemisphereLight(0xffe6dc, 0xa8685a, 1.55);
  scene.add(hemi);
  // Warm, fairly low sun from the front left so every cactus shows a lit and a shaded side.
  const sun = new THREE.DirectionalLight(0xffd6a6, 3.1);
  sun.position.set(-8, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 45 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun);

  const staticObjects = new THREE.Group();
  scene.add(staticObjects);
  const textures = buildWorld(staticObjects, renderer);

  const plotGroup = new THREE.Group(); scene.add(plotGroup);
  // Soil mound inside a terracotta rim; vertex colours keep it to one mesh per plot.
  const profile = [[0, .11], [.15, .108], [.26, .094], [.32, .074], [.34, .08], [.36, .112], [.4, .118], [.43, .09], [.44, 0]];
  const soilGeometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 22);
  const soilColors = [], earth = new THREE.Color(0x6e3f39), rim = new THREE.Color(0xc77a5d);
  for (let i = 0; i < soilGeometry.attributes.position.count; i++) { const c = i % profile.length < 4 ? earth : rim; soilColors.push(c.r, c.g, c.b); }
  soilGeometry.setAttribute('color', new THREE.Float32BufferAttribute(soilColors, 3));
  const soilMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const selectedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xfff0b8, emissive: 0x5a4a12 });
  const plots = [];
  const actors = new Map();
  const plantLife = new Map();
  let farm = null, farmLevel = 0, disposed = false, plotCount = 0, rendered = false;
  let width = 1, height = 1, aspect = 1;
  let azimuth = 0, tilt = 0, zoom = 1;
  let framingRaid = false, framingFarm = false;
  const target = new THREE.Vector3(0, 0.5, 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let drag = null;
  const framePoint = new THREE.Vector3();
  // A fairly low view spreads the garden sideways; a vertical lens shift then slides the
  // garden down so spare height becomes a band of horizon above it.
  const ELEVATION = 0.47;
  let lensShift = 0;
  const elevation = () => clamp(ELEVATION + tilt, .3, 1.35);
  // Frame the plots the player actually owns (mature height) rather than all 24 slots.
  // Raid framing adds the actual spawn corridor before enemies arrive.
  function framePoints() {
    const points = [];
    for (let i = 0; i < (plotCount || 24); i++) {
      const [x, z] = PLOT_SLOTS[i];
      // [x, y, z, highest screen y]: the ground stays below .6 so there is always sky; plant tops may reach .9.
      for (const dx of [-.5, .5]) for (const dz of [-.45, .45]) for (const y of [0, 1.75]) points.push([x+dx,y,z+dz,y ? .9 : .6]);
    }
    // The spawn corridor sits at the back, so it may rise into the horizon band.
    if (framingRaid) for (const x of [-5.2, 5.2]) for (const z of [-5.8, 1]) for (const y of [0, .6]) points.push([x,y,z,.86]);
    if (framingFarm) for (const x of [5.1, 6.8]) for (const z of [-4.6,-3.1]) for (const y of [0,1.2]) points.push([x,y,z,.86]);
    return points;
  }
  function placeCamera(distance) {
    const e = elevation();
    camera.position.set(target.x + distance * Math.sin(azimuth) * Math.cos(e), target.y + distance * Math.sin(e), target.z + distance * Math.cos(azimuth) * Math.cos(e));
    camera.lookAt(target); camera.updateMatrixWorld();
  }
  function updateCamera() {
    const points = framePoints();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, , z] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    target.set((minX + maxX) / 2, .5, (minZ + maxZ) / 2);
    camera.clearViewOffset();
    // A distance fits if some vertical shift puts every point between the bottom margin and its own top limit.
    const fits = () => {
      let up = -Infinity, down = Infinity;
      for (const [x, y, z, top] of points) {
        framePoint.set(x, y, z).project(camera);
        if (Math.abs(framePoint.x) >= .9 || framePoint.z >= 1) return false;
        up = Math.max(up, -.92 - framePoint.y); down = Math.min(down, top - framePoint.y);
      }
      lensShift = up;
      return up <= down;
    };
    let lo = 3, hi = 60;
    for (let i = 0; i < 14; i++) { const d = (lo+hi)/2; placeCamera(d); if (fits()) hi = d; else lo = d; }
    placeCamera(hi); fits();
    // Slide the garden down to the bottom margin; whatever height is left over shows sky.
    camera.setViewOffset(width, height, 0, lensShift / 2 * height, width, height);
    placeCamera(hi / zoom);
  }
  function notify() { if (onViewChange) onViewChange(); }
  function resize(w, h, dpr = 1) {
    width = Math.max(1, w); height = Math.max(1, h); aspect = width / height;
    renderer.setPixelRatio(Math.min(Math.max(dpr, 1), 2));
    renderer.setSize(width, height, false); camera.aspect = aspect; camera.updateProjectionMatrix(); updateCamera();
  }
  function project(xPercent, yPercent, elevationHeight = 0) {
    const [x, z] = world(xPercent, yPercent);
    const v = new THREE.Vector3(x, elevationHeight, z).project(camera);
    return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2, visible: v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  }
  function pickGround(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(pointer, camera);
    const p = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    return p ? { x: p.x / 0.1 + 50, y: p.z / 0.1 + 65 } : null;
  }
  function pickModel(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set((clientX-rect.left)/rect.width*2-1, 1-(clientY-rect.top)/rect.height*2);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...actors.values()].map(entry => entry.object).concat(plots.filter(plot => plot.visible)), true);
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData.interaction) object = object.parent;
      const key = object?.userData.interaction;
      if (!key) continue;
      if (key.startsWith('plant:')) return { kind: 'plant', index: Number(key.slice(6)) };
      if (key.startsWith('pest:')) return { kind: 'pest', id: key.slice(5) };
      if (key.startsWith('worm:')) return { kind: 'worm', id: key.slice(5) };
    }
    return null;
  }
  function resetView() { azimuth = 0; tilt = 0; zoom = 1; updateCamera(); notify(); }
  function orbit(deltaAzimuth, deltaElevation = 0) { azimuth += deltaAzimuth; tilt = clamp(tilt + deltaElevation, .3 - ELEVATION, 1.35 - ELEVATION); updateCamera(); notify(); }
  function zoomBy(factor) { zoom = clamp(zoom * factor, .65, 1.65); updateCamera(); notify(); }
  function down(e) { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, moved: false }; }
  function move(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true; drag.x = e.clientX; drag.y = e.clientY;
    orbit(-dx * .007, dy * .006);
  }
  function up() { drag = null; }
  function wheel(e) { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * .001)); }
  const gestureSurface = canvas.parentElement || canvas;
  gestureSurface.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  gestureSurface.addEventListener('wheel', wheel, { passive: false });

  function replaceActor(key, signature, create, x, y, extraHeight = 0) {
    let entry = actors.get(key);
    if (!entry || entry.signature !== signature) {
      if (entry) { scene.remove(entry.object); disposeModel(entry.object); }
      const object = create(); object.userData.interaction = key;
      const staticShadow = key.startsWith('plant:');
      object.traverse(part => { if (part.isMesh) { part.castShadow = staticShadow && !part.isInstancedMesh && !part.userData.blob; part.receiveShadow = false; } });
      if (staticShadow) renderer.shadowMap.needsUpdate = true;
      scene.add(object); entry = { object, signature, baseScale: object.scale.x, heading: object.rotation.y, lastX: NaN, lastZ: NaN }; actors.set(key, entry);
    }
    const [wx, wz] = world(x, y); entry.object.position.set(wx, extraHeight, wz);
    return entry;
  }
  // Pop easing: ease-out-back from `from` to 1 with a ~5% overshoot.
  const popScale = (t, from) => { const u = t - 1; return from + (1 - from) * (1 + 2.2 * u * u * u + 1.2 * u * u); };
  function render(state, { time = 0, selectedIndex = null, reducedMotion = false } = {}) {
    const raid = ['active','paused'].includes(state?.combat?.status), hasFarm = (state?.combat?.wormFarmLevel || 0) > 0;
    const plants = state?.plots || [];
    if (raid !== framingRaid || hasFarm !== framingFarm || plants.length !== plotCount) { framingRaid = raid; framingFarm = hasFarm; plotCount = plants.length; updateCamera(); }
    while (plots.length < plants.length) {
      const i = plots.length, [wx, wz] = PLOT_SLOTS[i] || world(...getPlotPosition(i));
      const soil = new THREE.Mesh(soilGeometry, soilMaterial); soil.position.set(wx, 0, wz); soil.rotation.y = i * 1.7; soil.receiveShadow = true;
      soil.userData.interaction = `plant:${i}`; plotGroup.add(soil); plots.push(soil);
    }
    plots.forEach((plot, i) => { plot.visible = i < plants.length; plot.material = i === selectedIndex ? selectedMaterial : soilMaterial; });
    const live = new Set();
    plants.forEach((plant, i) => {
      if (!plant) return;
      const key = `plant:${i}`; live.add(key); const [x, y] = getPlotPosition(i);
      // Plant appearance depends on growth, health, species and mutation; changes are infrequent.
      const { object, baseScale } = replaceActor(key, JSON.stringify(plant), () => createPlantModel(plant), x, y, 0.1);
      // New plants and growth stages pop in; loading a save does not.
      const stage = Math.min(3, Math.floor((Number(plant.growth) || 0) / 25));
      let life = plantLife.get(key);
      if (!life) { life = { stage, popAt: rendered && !reducedMotion ? time : -1, from: .25 }; plantLife.set(key, life); }
      else if (stage > life.stage && !reducedMotion) { life.popAt = time; life.from = .8; }
      life.stage = stage;
      let scale = 1;
      if (life.popAt >= 0) {
        const t = (time - life.popAt) / .55;
        if (t >= 1 || t < 0) { life.popAt = -1; renderer.shadowMap.needsUpdate = true; } else scale = popScale(t, life.from);
      }
      object.scale.setScalar(baseScale * scale);
      // Gentle idle sway, phase-shifted per plot.
      object.rotation.x = reducedMotion ? 0 : Math.sin(time * 1.1 + i * 1.9) * .025;
      object.rotation.z = reducedMotion ? 0 : Math.sin(time * .8 + i * 2.7) * .03;
    });
    for (const key of plantLife.keys()) if (!live.has(key)) plantLife.delete(key);
    for (const enemy of state?.combat?.enemies || []) {
      const key = `pest:${enemy.id}`; live.add(key);
      const entry = replaceActor(key, `${enemy.type}:${enemy.boss}`, () => createPestModel(enemy), enemy.x, enemy.y, enemy.airborne ? 0.8 : 0), object = entry.object;
      // Face the direction of travel so pests read as heading for a plant.
      const dx = object.position.x - entry.lastX, dz = object.position.z - entry.lastZ;
      if (dx * dx + dz * dz > 1e-5) {
        const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - entry.heading), Math.cos(want - entry.heading));
        entry.heading += reducedMotion ? turn : turn * .3;
      }
      entry.lastX = object.position.x; entry.lastZ = object.position.z;
      object.rotation.y = entry.heading;
      if (!reducedMotion && enemy.airborne) object.position.y += Math.sin(time * 3 + enemy.x) * 0.08;
      else if (!reducedMotion) object.rotation.z = Math.sin(time * 9 + enemy.x) * .05;
      // Keep the contact shadow on the ground under flying pests.
      for (const blob of object.userData.blobs || []) blob.position.y = .012 - object.position.y / object.scale.y;
    }
    for (const worm of state?.combat?.worms || []) {
      const key = `worm:${worm.id}`; live.add(key);
      const { object } = replaceActor(key, 'worm', () => createWormModel(worm), worm.x, worm.y, 0.04);
      object.rotation.y = reducedMotion ? 0 : Math.sin(time * 2 + (worm.phase || 0)) * 0.25;
      const marker = object.userData.marker;
      if (marker) marker.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(time * 4 + (worm.phase || 0)) * .12);
    }
    for (const [key, entry] of actors) if (!live.has(key)) { if (key.startsWith('plant:')) renderer.shadowMap.needsUpdate = true; scene.remove(entry.object); disposeModel(entry.object); actors.delete(key); }
    const level = state?.combat?.wormFarmLevel || 0;
    if (level !== farmLevel) {
      if (farm) { scene.remove(farm); disposeModel(farm); farm = null; }
      farmLevel = level; renderer.shadowMap.needsUpdate = true;
      if (level) { farm = createWormFarmModel(level); farm.traverse(part => { if (part.isMesh) part.castShadow = !part.isInstancedMesh; }); farm.position.set(5.9, 0, -3.9); scene.add(farm); }
    }
    rendered = true;
    renderer.render(scene, camera);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    gestureSurface.removeEventListener('pointerdown', down); gestureSurface.removeEventListener('wheel', wheel);
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    for (const { object } of actors.values()) disposeModel(object);
    actors.clear(); if (farm) disposeModel(farm);
    soilGeometry.dispose(); soilMaterial.dispose(); selectedMaterial.dispose(); textures.forEach(t => t.dispose());
    const geometries = new Set(), materials = new Set();
    staticObjects.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); sun.shadow.dispose(); renderer.dispose();
  }
  resize(canvas.clientWidth || 1, canvas.clientHeight || 1, window.devicePixelRatio || 1);
  return { resize, render, project, pickGround, pickModel, resetView, orbit, zoomBy, dispose, renderer, camera, scene };
}
