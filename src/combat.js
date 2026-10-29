/** Deterministic, browser-independent garden defense and worm ecology. */
export const PESTS = [
  {
    id: "snail",
    name: "Dune Snail",
    description: "Armored and slow; its shell softens stomp damage.",
    bossName: "The Glassback",
    color: "#c58d63",
  },
  {
    id: "earwig",
    name: "Cinder Earwig",
    description: "Quick little raiders; their queen calls a swarm.",
    bossName: "The Brood Matriarch",
    color: "#805c9b",
  },
  {
    id: "magpie",
    name: "Desert Magpie",
    description:
      "Flies above stomps until it swoops low; spray reaches it in flight.",
    bossName: "The Crowned Thief",
    color: "#425264",
  },
];
export const DEFENSE_UPGRADES = [
  {
    id: "stomp",
    name: "Stomp training",
    description: "Increase stomp damage and reach.",
    maxLevel: 8,
  },
  {
    id: "spray",
    name: "Spray mix",
    description: "Increase spray damage and reach.",
    maxLevel: 8,
  },
  {
    id: "tank",
    name: "Pressure tank",
    description: "More spray ammo and faster reloads.",
    maxLevel: 8,
  },
];
const IDS = new Set(PESTS.map((p) => p.id));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const PLOT_POSITIONS = [
  [12, 56],
  [27, 66],
  [44, 57],
  [61, 66],
  [78, 56],
  [91, 66],
  [19, 81],
  [35, 88],
  [52, 80],
  [69, 89],
  [84, 80],
  [47, 40],
  [7, 77],
  [29, 46],
  [74, 44],
  [95, 84],
  [56, 96],
  [12, 37],
  [39, 33],
  [63, 34],
  [87, 39],
  [23, 96],
  [78, 96],
  [95, 51],
];
export function getPlotPosition(index) {
  return PLOT_POSITIONS[index]
    ? [...PLOT_POSITIONS[index]]
    : [8 + ((index * 37) % 84), 35 + ((index * 19) % 60)];
}
const fresh = () => ({
  version: 1,
  level: 1,
  wave: 0,
  status: "ready",
  integrity: 100,
  enemies: [],
  queue: [],
  elapsed: 0,
  kills: 0,
  bossesDefeated: 0,
  highestCleared: 0,
  upgrades: { stomp: 0, spray: 0, tank: 0 },
  ammo: 3,
  stompCooldown: 0,
  sprayCooldown: 0,
  reloadRemaining: 0,
  message: "The garden is quiet.",
  nextId: 2,
  worms: [{ id: "worm-1", x: 46, y: 75, phase: 0 }],
  wormInventory: 1,
  fertilizer: 0,
  wormFarmLevel: 0,
  wormSpawnIn: 15,
  rewards: [],
  waveRewarded: [],
  lastBoss: "",
  lastFertilizerDay: 0,
});
function isEnemy(e, ids) {
  return (
    e &&
    typeof e === "object" &&
    typeof e.id === "string" &&
    e.id.length <= 40 &&
    !ids.has(e.id) &&
    IDS.has(e.type) &&
    typeof e.boss === "boolean" &&
    finite(e.x) &&
    e.x >= 0 &&
    e.x <= 100 &&
    finite(e.y) &&
    e.y >= 0 &&
    e.y <= 100 &&
    finite(e.hp) &&
    e.hp > 0 &&
    e.hp <= 10000 &&
    finite(e.maxHp) &&
    e.maxHp >= e.hp &&
    e.maxHp <= 10000 &&
    Number.isInteger(e.targetIndex) &&
    e.targetIndex >= -1 &&
    e.targetIndex <= 23 &&
    typeof e.airborne === "boolean" &&
    finite(e.attackIn) &&
    e.attackIn >= 0 &&
    e.attackIn <= 100 &&
    finite(e.speed) &&
    e.speed >= 0 &&
    e.speed <= 100 &&
    Number.isInteger(e.summons) &&
    e.summons >= 0 &&
    e.summons <= 3 &&
    (e._summonIn === undefined ||
      (finite(e._summonIn) && e._summonIn >= 0 && e._summonIn <= 30)) &&
    finite(e.bitePower) &&
    e.bitePower > 0 &&
    e.bitePower <= 100
  );
}
function validCombat(c) {
  if (
    !c ||
    typeof c !== "object" ||
    c.version !== 1 ||
    !Number.isInteger(c.level) ||
    c.level < 1 ||
    c.level > 12 ||
    !Number.isInteger(c.wave) ||
    c.wave < 0 ||
    c.wave > 3 ||
    !["ready", "active", "paused", "cleared", "defeat", "champion"].includes(
      c.status,
    ) ||
    !finite(c.integrity) ||
    c.integrity < 0 ||
    c.integrity > 100 ||
    !Array.isArray(c.enemies) ||
    c.enemies.length > 20 ||
    !Array.isArray(c.queue) ||
    c.queue.length > 40 ||
    !finite(c.elapsed) ||
    c.elapsed < 0 ||
    c.elapsed > 1e7 ||
    !Number.isInteger(c.kills) ||
    c.kills < 0 ||
    c.kills > 1e7 ||
    !Number.isInteger(c.bossesDefeated) ||
    c.bossesDefeated < 0 ||
    c.bossesDefeated > 1e7 ||
    !Number.isInteger(c.highestCleared) ||
    c.highestCleared < 0 ||
    c.highestCleared > 12 ||
    !c.upgrades ||
    !["stomp", "spray", "tank"].every(
      (k) =>
        Number.isInteger(c.upgrades[k]) &&
        c.upgrades[k] >= 0 &&
        c.upgrades[k] <= 8,
    ) ||
    !Number.isInteger(c.ammo) ||
    c.ammo < 0 ||
    c.ammo > 11 ||
    !["stompCooldown", "sprayCooldown", "reloadRemaining", "wormSpawnIn"].every(
      (k) => finite(c[k]) && c[k] >= 0 && c[k] <= 100,
    ) ||
    !Number.isInteger(c.nextId) ||
    c.nextId < 1 ||
    c.nextId > 1e7 ||
    !Array.isArray(c.worms) ||
    c.worms.length > 3 ||
    !Number.isInteger(c.wormInventory) ||
    c.wormInventory < 0 ||
    c.wormInventory > 999 ||
    !Number.isInteger(c.fertilizer) ||
    c.fertilizer < 0 ||
    c.fertilizer > 30 ||
    !Number.isInteger(c.wormFarmLevel) ||
    c.wormFarmLevel < 0 ||
    c.wormFarmLevel > 3 ||
    !Array.isArray(c.rewards) ||
    c.rewards.length > 500 ||
    !Array.isArray(c.waveRewarded) ||
    c.waveRewarded.length > 36 ||
    !Number.isInteger(c.lastFertilizerDay) ||
    c.lastFertilizerDay < 0 ||
    c.lastFertilizerDay > 1e7
  )
    return false;
  if (
    typeof c.message !== "string" ||
    c.message.length > 500 ||
    typeof c.lastBoss !== "string" ||
    c.lastBoss.length > 100 ||
    (c._spawnIn !== undefined &&
      (!finite(c._spawnIn) || c._spawnIn < 0 || c._spawnIn > 10)) ||
    (c._reloading !== undefined && typeof c._reloading !== "boolean")
  )
    return false;
  if (
    !c.rewards.every(
      (id) => typeof id === "string" && /^kill-pest-\d+$/.test(id),
    ) ||
    !c.waveRewarded.every(
      (id) => typeof id === "string" && /^(?:[1-9]|1[0-2])-[1-3]$/.test(id),
    )
  )
    return false;
  const ids = new Set();
  if (
    !c.enemies.every((e) => {
      if (!isEnemy(e, ids)) return false;
      ids.add(e.id);
      return true;
    })
  )
    return false;
  if (
    !c.queue.every((q) => q && IDS.has(q.type) && typeof q.boss === "boolean")
  )
    return false;
  if (
    !c.worms.every(
      (w) =>
        w &&
        typeof w.id === "string" &&
        w.id.startsWith("worm-") &&
        w.id.length < 32 &&
        !ids.has(w.id) &&
        finite(w.x) &&
        w.x >= 0 &&
        w.x <= 100 &&
        finite(w.y) &&
        w.y >= 0 &&
        w.y <= 100 &&
        finite(w.phase) &&
        w.phase >= 0 &&
        w.phase <= 1e6,
    )
  )
    return false;
  return (
    new Set(c.worms.map((w) => w.id)).size === c.worms.length &&
    new Set(c.rewards).size === c.rewards.length &&
    new Set(c.waveRewarded).size === c.waveRewarded.length
  );
}
export function ensureCombat(state, raw = null) {
  if (!state || typeof state !== "object")
    throw new TypeError("A game state is required");
  if (raw === null && validCombat(state.combat)) return state.combat;
  let c = raw !== null ? raw : state.combat;
  if (!validCombat(c)) c = fresh();
  else c = structuredClone(c);
  if (c.status === "active") c.status = "paused";
  c.ammo = Math.min(c.ammo, getDefenseStats({ combat: c }).ammoMax);
  state.combat = c;
  return c;
}
function view(state) {
  return validCombat(state?.combat) ? state.combat : fresh();
}
function infoFor(c) {
  const anticipated =
    c.status === "ready" || c.status === "cleared"
      ? c.wave >= 3
        ? 1
        : c.wave + 1
      : c.wave || 1;
  const bossType = PESTS[(c.level - 1) % 3];
  const isBoss = anticipated === 3;
  // Level one teaches the tools; later bosses bring escorts to split attention
  // and make crowd control useful alongside focused boss damage.
  const count = isBoss
    ? c.level === 1 ? 3 : 4 + c.level + Math.floor((c.level - 1) / 3)
    : 2 + c.level + anticipated - (c.level === 1 ? 1 : 0) + (c.level >= 3 ? anticipated + 1 : 0);
  return {
    level: c.level,
    wave: anticipated,
    nextWave: anticipated,
    title: isBoss
      ? `${bossType.bossName} approaches`
      : `Raid ${c.level}.${anticipated}`,
    bossName: isBoss ? bossType.bossName : "",
    isBoss,
    enemyCount: count,
    description: c.level <= 5
      ? "Early raids: cacti are protected from being eaten through level 5; nursery integrity can still reach zero."
      : isBoss
        ? bossType.description
        : "Protect the nursery from hungry desert pests.",
    rewardCredits: 10 + c.level * (isBoss ? 14 : 5),
    rewardEssence: isBoss ? 2 + Math.floor(c.level / 4) : 0,
  };
}
export function getWaveInfo(state) {
  return infoFor(view(state));
}
export function getDefenseStats(state) {
  const u = view(state).upgrades || { stomp: 0, spray: 0, tank: 0 };
  return {
    stompDamage: 32 + u.stomp * 12,
    stompRadius: 10 + u.stomp * 1.25,
    stompCooldown: Math.max(0.28, Math.round((0.65 - u.stomp * 0.04) * 100) / 100),
    sprayDamage: 24 + u.spray * 10,
    sprayRadius: 14 + u.spray * 1.5,
    sprayCooldown: Math.max(0.3, Math.round((0.7 - u.spray * 0.035) * 1000) / 1000),
    ammoMax: 3 + u.tank,
    reloadSeconds: Math.max(1.2, 3.2 - u.tank * 0.25),
  };
}
function ok(message) {
  return { ok: true, message };
}
function fail(message) {
  return { ok: false, message };
}
function between(c) {
  return ["ready", "cleared", "defeat", "champion"].includes(c.status);
}
export function getNurseryRepairInfo(state) {
  const c = view(state);
  const restored = 100 - c.integrity;
  const cost = c.status === "cleared" || c.status === "champion" ? 0 : Math.ceil(restored / 2);
  const reason = c.status === "defeat"
    ? "Retry this wave to restore nursery integrity for free."
    : !between(c)
      ? "Repair is available between waves; retreat first."
      : restored <= 0
        ? "Nursery integrity is already full."
        : !finite(state.credits) || state.credits < cost
          ? `Repair needs ${cost} credits.`
          : "Ready to repair.";
  return {
    cost,
    restored,
    canBuy: c.status !== "defeat" && between(c) && restored > 0 && finite(state.credits) && state.credits >= cost,
    reason,
  };
}
export function repairNursery(state) {
  const info = getNurseryRepairInfo(state);
  if (!info.canBuy) return fail(info.reason);
  state.credits -= info.cost;
  state.combat.integrity = 100;
  state.combat.message = `Nursery repaired to 100% for ${info.cost} credits. Cactus health is unchanged.`;
  return ok(state.combat.message);
}
function rewardOnce(state, key, credits, essence = 0) {
  const c = view(state);
  if (c.rewards.includes(key)) return;
  c.rewards.push(key);
  if (c.rewards.length > 500) c.rewards.splice(0, c.rewards.length - 500);
  state.credits = (finite(state.credits) ? state.credits : 0) + credits;
  state.essence = (finite(state.essence) ? state.essence : 0) + essence;
}
function spawn(c, q) {
  const type = q.type;
  const boss = q.boss;
  const id = `pest-${c.nextId++}`;
  const level = c.level;
  const hp = boss
    ? level === 1 ? 114 : 100 + level * 65
    : level === 1 ? 16 : level === 2 ? 40 : 40 + level * 6;
  const x = c.nextId % 2 ? 3 : 97;
  c.enemies.push({
    id,
    type,
    boss,
    x,
    y: boss ? 10 : 14 + (c.nextId % 4) * 12,
    hp,
    maxHp: hp,
    targetIndex: -1,
    airborne: type === "magpie",
    attackIn: 2.4,
    ...(boss && type === "earwig" ? { _summonIn: 2.25 } : {}),
    speed: (type === "snail" ? 3.2 : type === "earwig" ? 6.4 : 5.6) + level * 0.15 + (level >= 3 ? 1.3 : 0),
    summons: boss && type === "earwig" ? 2 : 0,
    bitePower: boss ? (level === 1 ? 6 : level === 2 ? 8 : 9) : (level === 1 ? 2 : level === 2 ? 3 : 4),
  });
}
export function startWave(state) {
  const c = view(state);
  if (!state?.combat || !validCombat(state.combat)) ensureCombat(state);
  if (!["ready", "cleared", "defeat", "champion"].includes(c.status))
    return fail("Finish or pause the current wave first.");
  const retry = c.status === "defeat";
  if (retry) c.integrity = 100;
  if (c.status === "champion") {
    c.level = 12;
    c.wave = 0;
    c.status = "ready";
  }
  if (!retry) {
    if (c.wave >= 3) {
      c.wave = 0;
      c.level = Math.min(12, c.level + 1);
    }
    c.wave += 1;
  }
  c.status = "active";
  c.elapsed = 0;
  c.enemies = [];
  c.queue = [];
  c._spawnIn = c.level === 1 ? 1.3 : 0.8;
  const wi = infoFor(c);
  const bossType = PESTS[(c.level - 1) % 3].id;
  for (let i = 0; i < wi.enemyCount; i++)
    c.queue.push({
      type: wi.isBoss
        ? i === 0
          ? bossType
          : c.level === 1
            ? "snail"
            : c.level === 2
              ? i % 2 ? "earwig" : "snail"
              : ["snail", "earwig", "magpie"][(c.level + i) % 3]
        : c.level === 1
          ? "snail"
          : c.level === 2
            ? i % 2
              ? "earwig"
              : "snail"
            : i % 3 === 0
              ? "magpie"
              : i % 2
                ? "earwig"
                : "snail",
      boss: wi.isBoss && i === 0,
    });
  spawn(c, c.queue.shift());
  c.message = wi.title;
  return ok(`${wi.title}.`);
}
export function toggleCombatPause(state) {
  const c = view(state);
  if (c.status === "active") {
    c.status = "paused";
    return ok("Raid paused.");
  }
  if (c.status === "paused") {
    c.status = "active";
    return ok("Raid resumed.");
  }
  return fail("There is no active raid to pause or resume.");
}
export function retreatWave(state) {
  const c = view(state);
  if (c.status !== "active" && c.status !== "paused")
    return fail("There is no raid to retreat from.");
  c.status = "defeat";
  c.enemies = [];
  c.queue = [];
  c.integrity = Math.max(1, c.integrity);
  c.message = "Raid retreated. The same wave can be retried.";
  return ok(
    "Retreated from the raid. Your garden is safe to tend; the same wave remains available.",
  );
}
export function tickCombat(state, dt) {
  const c = view(state);
  const events = [];
  if (!finite(dt) || dt <= 0) return { changed: false, events };
  const step = Math.min(0.25, dt);
  let changed = false;
  if (c.status !== "paused") {
    for (const k of ["stompCooldown", "sprayCooldown", "reloadRemaining"])
      c[k] = Math.max(0, c[k] - step);
    if (c.reloadRemaining === 0 && c._reloading) {
      c.ammo = getDefenseStats(state).ammoMax;
      delete c._reloading;
      events.push("Sprayer reloaded.");
      changed = true;
    }
  }
  if (c.status === "active") {
    c.elapsed += step;
    changed = true;
    if (c.queue.length && c.enemies.length < 20) {
      c._spawnIn = Math.max(0, (c._spawnIn || 0) - step);
      if (c._spawnIn <= 0) {
        spawn(c, c.queue.shift());
        c._spawnIn = c.level === 1 ? 1.3 : 0.8;
        events.push("A pest entered the garden.");
      }
    }
    for (const e of [...c.enemies]) {
      if (e.boss && e.type === "earwig" && e.summons > 0) {
        e._summonIn = Math.max(0, (e._summonIn ?? 2.25) - step);
        if (e._summonIn <= 0 && c.enemies.length < 20) {
          spawn(c, { type: "earwig", boss: false });
          e.summons -= 1;
          e._summonIn = e.summons > 0 ? 4.25 : 0;
          events.push("The Brood Matriarch summoned an earwig.");
        }
      }
      const targets = Array.isArray(state.plots)
        ? state.plots.map((p, i) => (p ? i : -1)).filter((i) => i >= 0)
        : [];
      if (e.targetIndex < 0 || !state.plots?.[e.targetIndex])
        e.targetIndex = targets.length
          ? targets[(Number(e.id.match(/\d+/)?.[0]) || 1) % targets.length]
          : -1;
      const [tx, ty] =
        e.targetIndex >= 0 ? getPlotPosition(e.targetIndex) : [50, 77];
      const dx = tx - e.x,
        dy = ty - e.y,
        d = Math.hypot(dx, dy);
      if (e.type === "magpie") e.airborne = d > 8 || c.elapsed % 6 < 3;
      if (d > 2) {
        e.x = clamp(e.x + (dx / d) * e.speed * step, 0, 100);
        e.y = clamp(e.y + (dy / d) * e.speed * step, 0, 100);
      } else {
        e.attackIn -= step;
        if (e.attackIn <= 0) {
          e.attackIn = e.boss ? 1.8 : 2.5;
          if (e.targetIndex >= 0 && state.plots?.[e.targetIndex]) {
            const plant = state.plots[e.targetIndex];
            const health = finite(plant.health) ? plant.health : 0;
            const healthFloor = c.level <= 5 ? Math.min(20, Math.max(1, health)) : 0;
            plant.health = clamp(
              health - e.bitePower,
              healthFloor,
              100,
            );
            c.integrity = clamp(c.integrity - (e.boss ? 2 : 1), 0, 100);
            if (plant.health <= 0) {
              state.plots[e.targetIndex] = null;
              c.integrity = clamp(c.integrity - 10, 0, 100);
              events.push("A cactus was eaten.");
            }
          } else c.integrity = clamp(c.integrity - e.bitePower, 0, 100);
          events.push("A pest nibbled at the garden.");
          if (
            e.boss &&
            e.type === "earwig" &&
            e.summons > 0 &&
            c.enemies.length < 20
          ) {
            spawn(c, { type: "earwig", boss: false });
            e.summons -= 1;
            e._summonIn = e.summons > 0 ? 4.25 : 0;
            events.push("The Brood Matriarch summoned an earwig.");
          }
        }
      }
    }
    if (c.integrity <= 0) {
      c.integrity = 0;
      c.status = "defeat";
      c.message = "The nursery needs tending before another raid.";
      c.enemies = [];
      c.queue = [];
      events.push("The nursery was overrun.");
    }
    if (c.status === "active" && c.enemies.length === 0 && c.queue.length === 0)
      clearWave(state, events);
  }
  if (c.status !== "paused") {
    c.wormSpawnIn = Math.max(0, c.wormSpawnIn - step);
    if (c.wormSpawnIn <= 0 && c.worms.length < 3) {
      const n = c.nextId++;
      c.worms.push({
        id: `worm-${n}`,
        x: 8 + ((n * 23) % 84),
        y: 70 + ((n * 7) % 18),
        phase: n,
      });
      c.wormSpawnIn = 15;
      changed = true;
    }
    for (const w of c.worms) {
      w.phase = (w.phase + step) % 1e6;
      w.x = clamp(w.x + Math.cos(w.phase * 0.25) * step * 0.9, 5, 95);
      w.y = clamp(w.y + Math.sin(w.phase * 0.2) * step * 0.35, 45, 93);
      changed = true;
    }
  }
  return { changed, events: events.slice(0, 20) };
}
function clearWave(state, events = []) {
  const c = view(state);
  const wi = infoFor(c);
  const key = `${c.level}-${c.wave}`;
  if (!c.waveRewarded.includes(key)) {
    c.waveRewarded.push(key);
    state.credits =
      (finite(state.credits) ? state.credits : 0) + wi.rewardCredits;
    state.essence =
      (finite(state.essence) ? state.essence : 0) + wi.rewardEssence;
  }
  c.status = "cleared";
  c.message = `Wave ${c.level}.${c.wave} cleared.`;
  if (c.wave === 3) {
    c.highestCleared = Math.max(c.highestCleared, c.level);
    if (c.level === 12) c.status = "champion";
    else {
      c.level += 1;
      c.wave = 0;
    }
  }
  events.push(c.status === "champion" ? "Garden champion!" : "Wave cleared.");
}
export function attackAt(state, weapon, x, y) {
  const c = view(state);
  if (c.status !== "active")
    return {
      ...fail("Attacks are available during an active wave."),
      hits: 0,
      kills: 0,
    };
  if (
    !["stomp", "spray"].includes(weapon) ||
    !finite(x) ||
    !finite(y) ||
    x < 0 ||
    x > 100 ||
    y < 0 ||
    y > 100
  )
    return {
      ...fail("Choose a valid attack and farm location."),
      hits: 0,
      kills: 0,
    };
  const s = getDefenseStats(state);
  if (weapon === "stomp" && c.stompCooldown > 0)
    return { ...fail("Stomp is recovering."), hits: 0, kills: 0 };
  if (weapon === "spray" && (c.sprayCooldown > 0 || c.reloadRemaining > 0))
    return { ...fail("Spray is recovering."), hits: 0, kills: 0 };
  if (weapon === "spray" && c.ammo <= 0)
    return { ...fail("Spray is empty; reload it."), hits: 0, kills: 0 };
  const victims = c.enemies.filter(
    (e) =>
      Math.hypot(e.x - x, e.y - y) <=
        (weapon === "stomp" ? s.stompRadius : s.sprayRadius) &&
      !(weapon === "stomp" && e.type === "magpie" && e.airborne),
  );
  if (
    weapon === "stomp" &&
    !victims.length &&
    c.enemies.some(
      (e) =>
        e.type === "magpie" &&
        e.airborne &&
        Math.hypot(e.x - x, e.y - y) <= s.stompRadius,
    )
  )
    return {
      ...fail("That magpie is airborne; spray it or wait for its swoop."),
      hits: 0,
      kills: 0,
    };
  if (weapon === "stomp") c.stompCooldown = s.stompCooldown;
  else {
    c.sprayCooldown = s.sprayCooldown;
    c.ammo--;
  }
  let kills = 0;
  for (const e of victims) {
    const damage =
      weapon === "stomp"
        ? s.stompDamage * (e.type === "snail" ? 0.55 : 1)
        : s.sprayDamage;
    e.hp -= damage;
    if (e.hp <= 0) {
      c.enemies = c.enemies.filter((a) => a !== e);
      c.kills++;
      kills++;
      if (e.boss) c.bossesDefeated++;
      rewardOnce(state, `kill-${e.id}`, e.boss ? 12 : 3, e.boss ? 1 : 0);
    }
  }
  if (c.enemies.length === 0 && c.queue.length === 0) clearWave(state, []);
  return {
    ...ok(
      victims.length
        ? `${weapon === "stomp" ? "Stomp" : "Spray"} hit ${victims.length} pest${victims.length === 1 ? "" : "s"}.`
        : "Attack missed.",
    ),
    hits: victims.length,
    kills,
  };
}
export function reloadSpray(state) {
  const c = view(state);
  if (
    !["active", "paused", "ready", "cleared", "defeat", "champion"].includes(
      c.status,
    )
  )
    return fail("Spray cannot be reloaded now.");
  if (c.reloadRemaining > 0) return fail("Spray is already reloading.");
  if (c.ammo >= getDefenseStats(state).ammoMax)
    return fail("Spray is already full.");
  c.reloadRemaining = getDefenseStats(state).reloadSeconds;
  c._reloading = true;
  return ok(`Spray reloads in ${c.reloadRemaining.toFixed(1)} seconds.`);
}
export function getDefenseUpgradeCost(state, id) {
  const u = DEFENSE_UPGRADES.find((x) => x.id === id);
  if (!u)
    return {
      cost: null,
      requiredLevel: 1,
      canBuy: false,
      reason: "Unknown upgrade.",
    };
  const c = view(state),
    rank = c.upgrades[id],
    requiredLevel = rank + 2,
    cost = 30 + rank * 35 + (id === "tank" ? 15 : 0);
  const canBuy =
    rank < u.maxLevel &&
    c.level >= requiredLevel &&
    between(c) &&
    finite(state.credits) &&
    state.credits >= cost;
  return {
    cost: rank < u.maxLevel ? cost : null,
    requiredLevel,
    canBuy,
    reason:
      rank >= u.maxLevel
        ? "Maximum level reached."
        : c.level < requiredLevel
          ? `Unlocks at campaign level ${requiredLevel}.`
          : !between(c)
            ? "Available between waves."
            : state.credits < cost
              ? `Costs ${cost} credits.`
              : "Ready to buy.",
  };
}
export function buyDefenseUpgrade(state, id) {
  const q = getDefenseUpgradeCost(state, id);
  if (!q.canBuy) return fail(q.reason);
  const c = view(state);
  state.credits -= q.cost;
  c.upgrades[id]++;
  if (id === "tank")
    c.ammo = Math.min(getDefenseStats(state).ammoMax, c.ammo + 1);
  return ok(
    `${DEFENSE_UPGRADES.find((u) => u.id === id).name} is now level ${c.upgrades[id]}.`,
  );
}
export function collectWorm(state, id) {
  const c = view(state),
    i = c.worms.findIndex((w) => w.id === id);
  if (i < 0) return fail("That friendly worm is not in the garden.");
  if (c.wormInventory >= 999) return fail("Worm basket is full.");
  c.worms.splice(i, 1);
  c.wormInventory++;
  return ok("Friendly worm collected for plant care.");
}
function care(state, index, resource, growth, health, label) {
  const c = view(state);
  if (
    !Number.isInteger(index) ||
    !Array.isArray(state.plots) ||
    index < 0 ||
    index >= state.plots.length ||
    !state.plots[index]
  )
    return fail("Select a planted cactus first.");
  if (c[resource] <= 0)
    return fail(
      resource === "wormInventory"
        ? "Collect a worm before feeding a cactus."
        : "The fertilizer bin is empty.",
    );
  const p = state.plots[index];
  c[resource]--;
  p.growth = clamp((finite(p.growth) ? p.growth : 0) + growth, 0, 100);
  p.health = clamp((finite(p.health) ? p.health : 0) + health, 0, 100);
  return ok(`${label} improved the cactus.`);
}
export function feedWorm(state, index) {
  return care(state, index, "wormInventory", 8, 6, "The worm");
}
export function fertilizePlant(state, index) {
  return care(state, index, "fertilizer", 18, 12, "Fertilizer");
}
export function getWormFarmInfo(state) {
  const c = view(state),
    rank = c.wormFarmLevel,
    unlocked = c.level >= 5 || c.highestCleared >= 4,
    requiredLevel = rank === 0 ? 5 : rank === 1 ? 7 : 9,
    cost = rank === 0 ? 90 : rank === 1 ? 140 : 220,
    canBuy =
      rank < 3 &&
      unlocked &&
      c.level >= requiredLevel &&
      between(c) &&
      finite(state.credits) &&
      state.credits >= cost;
  return {
    level: rank,
    unlocked,
    nextCost: rank < 3 ? cost : null,
    requiredLevel,
    production: rank,
    canBuy,
    reason:
      rank >= 3
        ? "Worm farm is fully upgraded."
        : !unlocked
          ? "Unlocks at campaign level 5."
          : c.level < requiredLevel
            ? `Available at campaign level ${requiredLevel}.`
            : !between(c)
              ? "Available between waves."
              : state.credits < cost
                ? `Costs ${cost} credits.`
                : "Ready to build or upgrade.",
  };
}
export function buyWormFarm(state) {
  const q = getWormFarmInfo(state);
  if (!q.canBuy) return fail(q.reason);
  const c = view(state);
  state.credits -= q.nextCost;
  c.wormFarmLevel++;
  return ok(
    c.wormFarmLevel === 1
      ? "Worm farm built."
      : `Worm farm upgraded to level ${c.wormFarmLevel}.`,
  );
}
export function afterDefenseDay(state) {
  const c = view(state);
  if (c.status === "active" || c.status === "paused")
    return fail("Finish the active raid before advancing the day.");
  const day = Number.isInteger(state.day) && state.day > 0 ? state.day : 1;
  if (c.lastFertilizerDay === day)
    return ok("Worm farm already produced fertilizer for this day.");
  const made = Math.min(c.wormFarmLevel, 30 - c.fertilizer);
  c.fertilizer += made;
  c.lastFertilizerDay = day;
  return ok(
    made
      ? `Worm farm produced ${made} fertilizer.`
      : "Worm farm produced no fertilizer; storage is full or the farm is locked.",
  );
}
