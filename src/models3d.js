import * as THREE from 'three';

// Original, texture-free nursery miniatures. Resources are shared within a model,
// never across model roots, so removing one resident cannot break its neighbours.
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const PALETTE = {
  lophophora: [0x78ad95, 0xbad7ae], pachanoi: [0x40875b, 0x90c77b],
  peruvianus: [0x5295af, 0xa8d1dc], bridgesii: [0x78964d, 0xb6cd78],
  tbm: [0x85a85b, 0xc8da90], tbmc: [0x459b83, 0x9dd7ae],
};
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function workshop(name) {
  const root = new THREE.Group();
  root.name = name;
  const geometries = new Map();
  const materials = new Map();
  const mat = (color, roughness = 0.72) => {
    const key = `${color}:${roughness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    return materials.get(key);
  };
  const geometry = (key, make) => {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  };
  // Tiny instanced areoles/petals need far fewer faces than visible animal bodies.
  const sphere = () => geometry('sphere', () => new THREE.SphereGeometry(1, 6, 4));
  const add = (shape, material, position = [0, 0, 0], scale = [1, 1, 1], parent = root) => {
    const mesh = new THREE.Mesh(shape, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const ball = (color, position, scale, parent) => add(
    geometry('body-sphere', () => new THREE.SphereGeometry(1, 8, 6)), mat(color), position, scale, parent,
  );
  const box = (color, position, scale, parent) => add(
    geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), mat(color), position, scale, parent,
  );
  const rod = (a, b, radius, color, parent = root) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const delta = to.clone().sub(from);
    const mesh = add(geometry('rod', () => new THREE.CylinderGeometry(1, 1, 1, 5)),
      mat(color), from.clone().add(to).multiplyScalar(0.5).toArray(), [radius, delta.length(), radius], parent);
    mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
    return mesh;
  };
  const curve = (points, radius, color, parent = root) => add(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))),
      Math.max(6, Math.min(64, (points.length - 1) * 3)), radius, 4, false), mat(color), [0, 0, 0], [1, 1, 1], parent,
  );
  return { root, mat, geometry, sphere, add, ball, box, rod, curve };
}

function instances(w, shape, material, entries, parent = w.root) {
  if (!entries.length) return;
  const mesh = new THREE.InstancedMesh(shape, material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, i) => {
    dummy.position.set(...entry.p);
    dummy.scale.set(...entry.s);
    dummy.quaternion.identity();
    if (entry.direction) dummy.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...entry.direction).normalize());
    if (entry.rotation) dummy.rotation.set(...entry.rotation);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function surface(w, point, colorAt, rows = 12, columns = 32, parent = w.root) {
  const positions = [], colors = [], indices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const u = i / columns, v = j / rows;
    positions.push(...point(u, v));
    const color = colorAt(u, v);
    colors.push(color.r, color.g, color.b);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.79, side: THREE.DoubleSide });
  return w.add(geometry, material, [0, 0, 0], [1, 1, 1], parent);
}

function plantColors(plant, palette) {
  const stress = clamp((45 - finite(plant.moisture, 50)) / 70, 0, 0.45);
  const injury = clamp((65 - finite(plant.health, 100)) / 110, 0, 0.5);
  const green = new THREE.Color(palette[0]).lerp(new THREE.Color(0x9c8453), stress + injury * 0.4);
  const light = new THREE.Color(palette[1]).lerp(new THREE.Color(0xcba571), stress);
  const gold = new THREE.Color(0xf6cf62);
  const variegated = String(plant.mutation).includes('variegated');
  return (u, v) => {
    const stripe = Math.sin(u * TAU * 3 + Math.sin(v * 5) * 0.65);
    const color = variegated && stripe > 0.37 ? gold.clone() : green.clone();
    return color.lerp(light, 0.12 + 0.19 * Math.sin(u * TAU * 8) ** 2);
  };
}

function flower(w, position, size = 0.1, color = 0xffa6ce) {
  const petals = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU;
    petals.push({ p: [position[0] + Math.cos(a) * size * 0.55, position[1], position[2] + Math.sin(a) * size * 0.55],
      s: [size * 0.38, size * 0.2, size * 0.76], rotation: [0, -a + Math.PI / 2, 0] });
  }
  instances(w, w.sphere(), w.mat(color), petals);
  w.ball(0xffd76c, [position[0], position[1] + size * 0.13, position[2]], [size * 0.32, size * 0.2, size * 0.32]);
}

function column(w, colorAt, height, radius, ribs, spineLength, offset = [0, 0, 0], tilt = 0, knobbly = false) {
  const stem = new THREE.Group();
  stem.position.set(...offset);
  stem.rotation.z = tilt;
  w.root.add(stem);
  surface(w, (u, v) => {
    const a = u * TAU;
    const cap = v > 0.83 ? Math.sqrt(Math.max(0.001, 1 - ((v - 0.83) / 0.17) ** 2)) : 1;
    const rib = knobbly ? 0.97 + 0.03 * Math.cos(a * ribs) : 0.86 + 0.14 * Math.cos(a * ribs);
    const swelling = knobbly ? 1 + 0.1 * Math.sin(v * 11) + 0.065 * Math.sin(v * 19) : 1;
    const r = radius * rib * cap * swelling;
    return [Math.cos(a) * r, v * height, Math.sin(a) * r];
  }, colorAt, 12, ribs * 4, stem);
  const areoles = [], spines = [];
  for (let row = 0; row < (knobbly ? 3 : 7); row++) for (let rib = 0; rib < ribs; rib++) {
    const a = rib / ribs * TAU, y = height * (0.12 + row * (knobbly ? 0.26 : 0.115));
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    areoles.push({ p: [x, y, z], s: [0.022, 0.026, 0.022] });
    for (let k = 0; k < (spineLength > 0.06 ? 3 : 1); k++) {
      const dir = [Math.cos(a + (k - 1) * 0.28), 0.24 + k * 0.17, Math.sin(a + (k - 1) * 0.28)];
      spines.push({ p: [x + dir[0] * spineLength * 0.45, y + dir[1] * spineLength * 0.45,
        z + dir[2] * spineLength * 0.45], s: [0.007, spineLength, 0.007], direction: dir });
    }
  }
  instances(w, w.sphere(), w.mat(0xf2dfb2), areoles, stem);
  instances(w, w.geometry('spine', () => new THREE.ConeGeometry(1, 1, 4)), w.mat(0xe8c48b), spines, stem);
  return stem;
}

function fan(w, colorAt, position, width, height, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = rotation;
  w.root.add(group);
  // A closed corrugated volume: both faces, lobed top and curled end lobes.
  surface(w, (u, v) => {
    const x = u * 2 - 1, a = v * TAU;
    const round = Math.sqrt(Math.max(0, 1 - x * x));
    const top = (Math.sin(a) + 1) / 2;
    const scallop = 1 + 0.055 * Math.cos(u * TAU * 11);
    return [x * width * (0.27 + top * 0.73),
      height * (0.12 + top * (0.68 + 0.22 * round) * scallop),
      Math.cos(a) * 0.16 * round * (1 + 0.24 * Math.cos(u * TAU * 11)) + 0.06 * Math.sin(x * 4)];
  }, (u, v) => colorAt(u, v).multiplyScalar(0.82 + 0.18 * Math.cos(u * TAU * 11) ** 2), 12, 44, group);
  const tufts = [];
  for (let i = 0; i < 23; i++) {
    const u = i / 22, x = u * 2 - 1;
    tufts.push({ p: [x * width, height * (0.8 + 0.22 * Math.sqrt(Math.max(0, 1 - x * x))) *
      (1 + 0.035 * Math.cos(u * TAU * 11)), 0.06 * Math.sin(x * 4)], s: [0.017, 0.021, 0.022] });
  }
  instances(w, w.sphere(), w.mat(0xf2e7bb), tufts, group);
  return group;
}

export function createPlantModel(plant = {}) {
  const species = PALETTE[plant.speciesId] ? plant.speciesId : 'pachanoi';
  const w = workshop(`cactus:${species}:${plant.mutation || 'normal'}`);
  const colorAt = plantColors(plant, PALETTE[species]);
  const crest = String(plant.mutation).includes('crested');
  if (species === 'lophophora') {
    surface(w, (u, v) => {
      const a = u * TAU, b = v * Math.PI;
      const r = Math.sin(b) * (0.33 + 0.035 * Math.cos(a * 8));
      return [Math.cos(a) * r, 0.24 - Math.cos(b) * 0.24, Math.sin(a) * r];
    }, colorAt);
    const wool = [];
    for (let ring = 1; ring < 4; ring++) for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, b = ring / 4 * Math.PI * 0.6;
      wool.push({ p: [Math.cos(a) * Math.sin(b) * 0.365, 0.24 + Math.cos(b) * 0.24,
        Math.sin(a) * Math.sin(b) * 0.365], s: [0.026, 0.018, 0.026] });
    }
    instances(w, w.sphere(), w.mat(0xf9e5d7), wool);
    if (crest) fan(w, colorAt, [0, 0.25, 0], 0.49, 0.4, 0.15);
    flower(w, [0.015, crest ? 0.66 : 0.49, 0], 0.105);
  } else if (species === 'tbmc') {
    column(w, colorAt, 0.42, 0.14, 5, 0.025);
    fan(w, colorAt, [0, 0.22, 0], crest ? 0.57 : 0.49, crest ? 0.78 : 0.68, 0.12);
    fan(w, colorAt, [0.08, 0.2, 0.08], 0.34, 0.57, 1.7);
    if (crest) {
      fan(w, colorAt, [-0.08, 0.74, 0], 0.42, 0.57, -0.55);
      flower(w, [0.04, 1.3, 0], 0.075, 0xe5a8ef);
    }
  } else if (species === 'tbm') {
    column(w, colorAt, 0.65, 0.18, 5, 0.035, [0, 0, 0], 0, true);
    column(w, colorAt, 0.58, 0.155, 4, 0.035, [-0.12, 0.3, 0.01], 0.5, true);
    column(w, colorAt, 0.61, 0.145, 5, 0.035, [0.12, 0.5, 0.02], -0.48, true);
    column(w, colorAt, 0.4, 0.13, 4, 0.035, [0, 0.76, -0.01], 0.12, true);
    if (crest) fan(w, colorAt, [0, 0.65, 0], 0.52, 0.68, 0.2);
  } else {
    const specs = { pachanoi: [1.4, 0.22, 7, 0.035], peruvianus: [1.47, 0.23, 8, 0.13], bridgesii: [1.68, 0.135, 5, 0.14] };
    const [height, radius, ribs, spineLength] = specs[species];
    column(w, colorAt, crest ? height * 0.57 : height, radius, ribs, spineLength);
    if (crest) fan(w, colorAt, [0, height * 0.48, 0], species === 'bridgesii' ? 0.49 : 0.57, 0.66, 0.12);
    else if (species === 'pachanoi' && finite(plant.growth, 100) >= 80) flower(w, [0.05, height + 0.02, 0], 0.11, 0xfff2d8);
  }
  if (finite(plant.health, 100) < 65) {
    const scars = [];
    const front = { lophophora: 0.31, pachanoi: 0.205, peruvianus: 0.21, bridgesii: 0.12, tbm: 0.18, tbmc: 0.13 }[species];
    for (let i = 0; i < (plant.health < 30 ? 3 : 2); i++) scars.push({ p: [0.06 - i * 0.055, 0.19 + i * 0.1, front],
      s: [0.055, 0.018, 0.022], rotation: [0, 0, -0.3] });
    instances(w, w.sphere(), w.mat(0x95614d), scars);
  }
  const scale = 0.38 + 0.62 * clamp(finite(plant.growth, 100), 0, 100) / 100;
  w.root.scale.setScalar(scale);
  w.root.userData = { kind: 'plant', speciesId: species, mutation: plant.mutation || 'normal' };
  return w.root;
}

function crown(w, position) {
  w.add(w.geometry('crown-ring', () => new THREE.TorusGeometry(0.095, 0.018, 4, 12)), w.mat(0xf9cd59), position).rotation.x = Math.PI / 2;
  const points = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    points.push({ p: [position[0] + Math.cos(a) * 0.084, position[1] + 0.052, position[2] + Math.sin(a) * 0.084],
      s: [0.027, 0.105, 0.027] });
  }
  instances(w, w.geometry('crown-point', () => new THREE.ConeGeometry(1, 1, 5)), w.mat(0xf9cd59), points);
}

// Soft contact shadow (stacked translucent discs) keeps actors readable against the sand.
// The scene drops these to the ground when an actor is airborne.
function groundMarks(w, discs, color) {
  return discs.map(([radius, opacity]) => {
    const blob = w.add(w.geometry(`blob:${radius}`, () => new THREE.CircleGeometry(radius, 18)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), [0, 0.012, 0]);
    blob.rotation.x = -Math.PI / 2;
    blob.castShadow = blob.receiveShadow = false;
    blob.userData.blob = true;
    return blob;
  });
}

export function createPestModel(enemy = {}) {
  const w = workshop(`pest:${enemy.type || 'snail'}${enemy.boss ? ':boss' : ''}`);
  const dark = 0x202635, cream = 0xf1e8d6;
  if (enemy.type === 'earwig') {
    const segments = [];
    for (let i = 0; i < 6; i++) segments.push({ p: [0, 0.073, 0.14 - i * 0.055],
      s: [0.075 - i * 0.004, 0.052, 0.048] });
    instances(w, w.sphere(), w.mat(enemy.boss ? 0x714352 : 0x704b39), segments);
    w.ball(0x382b31, [0, 0.085, 0.19], [0.07, 0.06, 0.065]);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = 0.09 - i * 0.075;
        w.curve([[side * 0.04, 0.065, z], [side * 0.13, 0.06, z - 0.035], [side * 0.18, 0.012, z + 0.005]], 0.009, 0xa8754c);
      }
      w.curve([[side * 0.035, 0.09, 0.22], [side * 0.09, 0.13, 0.27], [side * 0.12, 0.16, 0.32]], 0.006, dark);
      w.curve([[side * 0.035, 0.075, -0.17], [side * 0.11, 0.09, -0.24], [side * 0.08, 0.1, -0.3], [side * 0.018, 0.1, -0.29]], 0.016, 0xd2aa6d);
      w.ball(cream, [side * 0.041, 0.11, 0.225], [0.019, 0.021, 0.012]);
      w.ball(dark, [side * 0.042, 0.113, 0.235], [0.01, 0.012, 0.006]);
    }
    if (enemy.boss) crown(w, [0, 0.17, 0.16]);
  } else if (enemy.type === 'magpie') {
    w.ball(dark, [0, 0.18, 0], [0.09, 0.115, 0.13]);
    w.ball(cream, [0, 0.2, 0.07], [0.067, 0.085, 0.085]);
    w.ball(dark, [0, 0.29, 0.1], [0.082, 0.075, 0.078]);
    for (const side of [-1, 1]) {
      const wing = w.ball(dark, [side * 0.105, 0.21, -0.02], [0.058, 0.04, 0.16]);
      wing.rotation.z = side * (enemy.airborne ? 0.8 : 0.25);
      w.ball(cream, [side * 0.113, 0.238, 0.01], [0.045, 0.018, 0.075]);
      w.ball(0xf2ba66, [side * 0.058, 0.31, 0.151], [0.014, 0.014, 0.009]);
      w.ball(dark, [side * 0.058, 0.31, 0.157], [0.007, 0.008, 0.005]);
      w.rod([side * 0.04, 0.13, 0], [side * 0.045, 0.025, 0.02], 0.009, dark);
      w.rod([side * 0.045, 0.025, 0.02], [side * 0.045, 0.014, 0.08], 0.008, dark);
    }
    w.rod([0, 0.285, 0.15], [0, 0.265, 0.26], 0.024, 0xaeb6b3);
    const tail = w.ball(dark, [0, 0.13, -0.2], [0.05, 0.026, 0.18]);
    tail.rotation.x = -0.22;
    if (enemy.boss) crown(w, [0, 0.365, 0.1]);
  } else {
    w.ball(0x9bbd77, [0, 0.055, 0.025], [0.115, 0.052, 0.22]);
    w.ball(enemy.boss ? 0x9667b8 : 0xc88d5c, [0, 0.185, -0.025], [0.15, 0.16, 0.12]);
    const spiral = [];
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * TAU * 2.3, r = 0.008 + i / 48 * 0.12;
      spiral.push([Math.cos(a) * r, 0.185 + Math.sin(a) * r, 0.099]);
    }
    w.curve(spiral, 0.012, enemy.boss ? 0xf5d184 : 0x704a48);
    for (const side of [-1, 1]) {
      w.rod([side * 0.055, 0.075, 0.16], [side * 0.075, 0.18, 0.205], 0.011, 0x9bbd77);
      w.ball(cream, [side * 0.075, 0.18, 0.205], [0.025, 0.026, 0.024]);
      w.ball(dark, [side * 0.075, 0.18, 0.224], [0.011, 0.014, 0.009]);
    }
    if (enemy.boss) crown(w, [0, 0.35, -0.025]);
  }
  const blobs = groundMarks(w, [[0.27, 0.22], [0.18, 0.3]], 0x2a1622);
  w.root.rotation.y = -0.4;
  w.root.scale.setScalar(enemy.boss ? 2.5 : 1.6);
  w.root.userData = { kind: 'pest', type: enemy.type || 'snail', boss: Boolean(enemy.boss), blobs };
  return w.root;
}

export function createWormModel(worm = {}) {
  const w = workshop('friendly-worm');
  const segments = [[], []];
  for (let i = 0; i < 10; i++) segments[i % 2].push({ p: [(i - 4.5) * 0.034, 0.042, Math.sin(i * 0.66) * 0.034],
    s: [0.03, 0.035 + 0.004 * Math.sin(i), 0.032] });
  instances(w, w.sphere(), w.mat(0xf0709c), segments[0]);
  instances(w, w.sphere(), w.mat(0xc94f82), segments[1]);
  w.ball(0xe9c36e, [0.058, 0.044, -0.024], [0.039, 0.039, 0.036]);
  for (const z of [-0.018, 0.015]) {
    w.ball(0xfff1d7, [0.158, 0.064, z - 0.014], [0.012, 0.014, 0.012]);
    w.ball(0x463641, [0.166, 0.067, z - 0.014], [0.006, 0.008, 0.007]);
  }
  w.curve([[0.17, 0.039, -0.026], [0.178, 0.032, -0.013], [0.17, 0.039, 0]], 0.004, 0xa76175);
  // Garden worms are collectibles: a lime ring (the game's "you can use this" colour) and a
  // dark shadow make them read at a glance. The worm-farm resident has no id and skips it.
  let marker = null;
  if (worm.id) {
    groundMarks(w, [[0.2, 0.3]], 0x2a1622);
    marker = w.add(w.geometry('marker', () => new THREE.RingGeometry(0.21, 0.255, 24)),
      new THREE.MeshBasicMaterial({ color: 0xd5f168, transparent: true, opacity: 0.85, depthWrite: false }), [0, 0.016, 0]);
    marker.rotation.x = -Math.PI / 2;
    marker.castShadow = marker.receiveShadow = false;
    marker.userData.blob = true;
    w.root.scale.setScalar(1.7);
  }
  w.root.userData = { kind: 'worm', id: worm.id, marker };
  return w.root;
}

export function createWormFarmModel(level = 1) {
  const rank = clamp(Math.floor(finite(level, 1)), 1, 3);
  const w = workshop(`worm-farm:${rank}`);
  w.box(0x5e3c42, [0, 0.09, 0], [0.94, 0.18, 0.62]);
  w.box(0x42343a, [0, 0.19, 0], [0.8, 0.045, 0.49]);
  for (const z of [-0.31, 0.31]) w.box(0xb87958, [0, 0.2, z], [1.02, 0.12, 0.065]);
  for (const x of [-0.49, 0.49]) w.box(0xcb9270, [x, 0.2, 0], [0.065, 0.12, 0.62]);
  const chips = [];
  for (let i = 0; i < 14; i++) chips.push({ p: [Math.sin(i * 7.13) * 0.34, 0.221, Math.cos(i * 3.8) * 0.2],
    s: [0.035, 0.012, 0.022], rotation: [0, i * 0.7, 0] });
  instances(w, w.sphere(), w.mat(0xa68a64), chips);
  const resident = createWormModel();
  resident.position.set(-0.09, 0.22, 0.03);
  w.root.add(resident);
  if (rank >= 2) {
    w.box(0x759279, [0.27, 0.28, -0.14], [0.23, 0.14, 0.22]);
    w.ball(0xced293, [0.27, 0.37, -0.14], [0.12, 0.025, 0.11]);
    w.rod([-0.36, 0.25, -0.2], [-0.29, 0.49, -0.2], 0.015, 0xe9c37e);
    w.box(0x759279, [-0.28, 0.5, -0.2], [0.13, 0.08, 0.025]);
  }
  if (rank >= 3) {
    for (const x of [-0.44, 0.44]) for (const z of [-0.25, 0.25]) w.rod([x, 0.23, z], [x, 0.72, z], 0.025, 0xa18db5);
    const roof = w.box(0x8b73a5, [0, 0.76, -0.04], [1.1, 0.065, 0.72]);
    roof.rotation.x = -0.11;
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) w.box(0xc3a2bf, [x, 0.8, -0.04], [0.055, 0.018, 0.7]);
    w.ball(0xe6c776, [0, 0.44, 0.327], [0.08, 0.08, 0.017]);
  }
  w.root.userData = { kind: 'wormFarm', level: rank };
  return w.root;
}

export function disposeModel(object) {
  if (!object || object.userData?.modelDisposed) return;
  const geometries = new Set(), materials = new Set();
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material) materials.add(material);
    }
    if (child.isInstancedMesh) child.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  object.userData.modelDisposed = true;
  object.removeFromParent();
}
