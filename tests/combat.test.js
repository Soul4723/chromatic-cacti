import test from "node:test";
import assert from "node:assert/strict";
import { createGame, advanceDay, waterPlant } from "../src/simulation.js";
import { afterDay } from "../src/progression.js";
import {
  ensureCombat,
  PESTS,
  DEFENSE_UPGRADES,
  getWaveInfo,
  getDefenseStats,
  startWave,
  tickCombat,
  attackAt,
  reloadSpray,
  toggleCombatPause,
  retreatWave,
  getDefenseUpgradeCost,
  buyDefenseUpgrade,
  collectWorm,
  feedWorm,
  fertilizePlant,
  getWormFarmInfo,
  buyWormFarm,
  afterDefenseDay,
  getNurseryRepairInfo,
  repairNursery,
} from "../src/combat.js";

function game() {
  const s = createGame();
  ensureCombat(s);
  return s;
}
test("nursery repair spends a fair bounded credit cost and preserves individual cactus health", () => {
  const s = game();
  s.credits = 50;
  s.combat.integrity = 49;
  const plants = structuredClone(s.plots);
  assert.equal(getNurseryRepairInfo(s).cost, 26, "51 missing integrity costs 26 credits");
  assert.equal(repairNursery(s).ok, true);
  assert.equal(s.credits, 24);
  assert.equal(s.combat.integrity, 100);
  assert.deepEqual(s.plots, plants);
  const before = structuredClone(s);
  assert.equal(repairNursery(s).ok, false, "full nursery cannot be charged twice");
  assert.deepEqual(s, before);
  s.combat.integrity = 99;
  assert.equal(getNurseryRepairInfo(s).cost, 1);
  assert.equal(repairNursery(s).ok, true);
  assert.equal(s.credits, 23);
  s.combat.integrity = 0;
  assert.equal(getNurseryRepairInfo(s).cost, 50, "even a complete repair is capped at 50 credits");
});

test("nursery repair fails atomically without funds, during raids, and after defeat", () => {
  for (const [status, credits, integrity] of [
    ["ready", 4, 90], ["active", 100, 50], ["paused", 100, 50], ["defeat", 100, 0],
  ]) {
    const s = game();
    Object.assign(s.combat, { status, integrity });
    s.credits = credits;
    const before = structuredClone(s);
    assert.equal(getNurseryRepairInfo(s).canBuy, false, status);
    assert.equal(repairNursery(s).ok, false, status);
    assert.deepEqual(s, before, `${status} failure changes no resources or timers`);
  }
  for (const status of ["cleared", "champion"]) {
    const s = game();
    Object.assign(s.combat, { status, integrity: 90 });
    s.credits = 0;
    assert.equal(getNurseryRepairInfo(s).cost, 0, 'a won raid earns free repairs');
    assert.equal(repairNursery(s).ok, true, status);
    assert.equal(s.credits, 0, "a narrow win can recover even with no credits");
    assert.equal(s.combat.integrity, 100);
  }
});

test("repair persists through JSON reload and defeat still offers free retry", () => {
  const s = game();
  s.combat.integrity = 60;
  assert.equal(repairNursery(s).ok, true);
  const restored = JSON.parse(JSON.stringify(s));
  ensureCombat(restored, restored.combat);
  assert.equal(restored.combat.integrity, 100);
  assert.equal(restored.credits, s.credits);
  Object.assign(restored.combat, { status: "defeat", wave: 1, integrity: 0 });
  restored.credits = 0;
  assert.match(getNurseryRepairInfo(restored).reason, /free/);
  assert.equal(startWave(restored).ok, true);
  assert.equal(restored.combat.integrity, 100);
  assert.equal(restored.credits, 0);
});
function clearWaveFast(s) {
  if (s.combat.status !== "active") assert.equal(startWave(s).ok, true);
  s.combat.queue = [];
  let guard = 0;
  while (s.combat.enemies.length && guard++ < 30) {
    for (const e of s.combat.enemies) e.hp = 1;
    const e = s.combat.enemies[0];
    if (e.type === "magpie") e.airborne = false;
    s.combat.sprayCooldown = 0;
    s.combat.ammo = 11;
    attackAt(s, "spray", e.x, e.y);
    s.combat.stompCooldown = 0;
  }
  tickCombat(s, 0.25);
  assert.ok(
    ["cleared", "champion"].includes(s.combat.status),
    `wave ${s.combat.level}.${s.combat.wave} ended ${s.combat.status}`,
  );
}

test("a first-wave win earns free repairs after ordinary bite damage", () => {
  const s = game();
  s.credits = 0;
  assert.equal(startWave(s).ok, true);
  for (let i = 0; i < 128; i++) tickCombat(s, 0.25);
  assert.ok(s.combat.integrity < 100 && s.combat.integrity > 0);
  for (let i = 0; i < 720 && s.combat.status === "active"; i++) {
    const enemy = s.combat.enemies[0];
    if (enemy && s.combat.stompCooldown === 0) attackAt(s, "stomp", enemy.x, enemy.y);
    else if (enemy && s.combat.sprayCooldown === 0 && s.combat.ammo > 0) attackAt(s, "spray", enemy.x, enemy.y);
    if (s.combat.ammo === 0 && s.combat.reloadRemaining === 0) reloadSpray(s);
    tickCombat(s, 0.25);
  }
  assert.equal(s.combat.status, "cleared");
  assert.ok(s.credits > 0, "real pest bounties and the wave reward are still paid");
  const price = getNurseryRepairInfo(s);
  assert.equal(price.cost, 0);
  assert.equal(price.canBuy, true);
  const earned = s.credits;
  assert.equal(repairNursery(s).ok, true);
  assert.equal(s.credits, earned - price.cost);
  assert.equal(s.combat.integrity, 100);
});

test("campaign presents distinct bosses with working earwig summons and once-only rewards", () => {
  const s = game();
  const bosses = [];
  for (let i = 1; i <= 3; i++) {
    s.combat.level = i;
    s.combat.wave = 2;
    s.combat.status = "cleared";
    assert.equal(getWaveInfo(s).isBoss, true);
    assert.equal(startWave(s).ok, true);
    const e = s.combat.enemies[0];
    assert.equal(e.boss, true);
    assert.equal(e.type, PESTS[i - 1].id);
    bosses.push(PESTS[i - 1].bossName);
    if (e.type === "earwig") {
      assert.equal(e.summons, 2);
      e.x = 12;
      e.y = 56;
      e.targetIndex = 0;
      e.attackIn = 0.01;
      tickCombat(s, 0.25);
      assert.ok(s.combat.enemies.some((x) => !x.boss && x.type === "earwig"));
    }
    if (e.type === "magpie") e.airborne = false;
    e.hp = 1;
    s.combat.queue = [];
    s.combat.sprayCooldown = 0;
    s.combat.ammo = 11;
    const earned = s.credits;
    attackAt(s, "spray", e.x, e.y);
    assert.ok(s.combat.bossesDefeated >= i);
    assert.ok(s.credits > earned);
    const credits = s.credits;
    attackAt(s, "spray", e.x, e.y);
    assert.equal(s.credits, credits);
  }
  assert.deepEqual(
    bosses,
    PESTS.map((p) => p.bossName),
  );
});

test("Brood Matriarch calls a visible swarm before reaching its first plant", () => {
  const s = game();
  s.combat.level = 2;
  s.combat.wave = 2;
  s.combat.status = "cleared";
  assert.equal(startWave(s).ok, true);
  const boss = s.combat.enemies[0];
  assert.equal(boss.type, "earwig");
  const plantHealthBefore = s.plots.map((plant) => plant?.health ?? null);

  let events = [];
  for (let i = 0; i < 16 && !events.some((event) => /summoned an earwig/.test(event)); i++) {
    events = tickCombat(s, 0.25).events;
  }

  assert.ok(events.some((event) => event === "The Brood Matriarch summoned an earwig."));
  assert.ok(s.combat.enemies.some((enemy) => !enemy.boss && enemy.type === "earwig"));
  assert.deepEqual(s.plots.map((plant) => plant?.health ?? null), plantHealthBefore, "the summon was seen before any cactus bite");
});
test("wave sequencing covers every round in campaign levels one through three", () => {
  const s = game();
  for (let level = 1; level <= 3; level++) {
    assert.equal(s.combat.level, level);
    for (let wave = 1; wave <= 3; wave++) {
      assert.equal(startWave(s).ok, true);
      assert.equal(s.combat.wave, wave);
      let steps = 0;
      while (s.combat.status === "active" && steps++ < 400) {
        for (const enemy of [...s.combat.enemies]) {
          enemy.airborne = false;
          s.combat.stompCooldown = 0;
          s.combat.sprayCooldown = 0;
          s.combat.ammo = 11;
          attackAt(s, "spray", enemy.x, enemy.y);
        }
        tickCombat(s, 0.25);
      }
      assert.ok(
        ["cleared", "champion"].includes(s.combat.status),
        `level ${level}, wave ${wave} did not clear`,
      );
    }
    if (level < 3) assert.equal(s.combat.level, level + 1);
  }
  assert.equal(s.combat.level, 4);
  assert.equal(s.combat.highestCleared, 3);
  assert.equal(s.combat.bossesDefeated, 3);
});
test("enemy attacks damage and consume cacti, integrity defeat retries safely", () => {
  const s = game();
  startWave(s);
  const p = s.plots[0];
  const pest = s.combat.enemies[0];
  pest.x = 12;
  pest.y = 56;
  pest.targetIndex = 0;
  pest.attackIn = 0.01;
  const hp = p.health;
  tickCombat(s, 0.25);
  assert.ok(p.health < hp);
  s.plots.fill(null);
  s.combat.enemies[0].x = 50;
  s.combat.enemies[0].y = 77;
  s.combat.enemies[0].attackIn = 0.01;
  s.combat.enemies[0].bitePower = 100;
  for (let n = 0; n < 100 && s.combat.status === "active"; n++) {
    s.combat.enemies[0].attackIn = 0;
    tickCombat(s, 0.25);
  }
  assert.equal(s.combat.status, "defeat");
  assert.equal(s.combat.integrity, 0);
  const wave = s.combat.wave;
  assert.equal(startWave(s).ok, true);
  assert.equal(s.combat.integrity, 100);
  assert.equal(s.combat.wave, wave);
});
test("stomp armor, airborne magpie rule, cooldown, ammo, reload and upgrades use real attack values", () => {
  const s = game();
  s.combat.level = 3;
  startWave(s);
  const e = s.combat.enemies.find((x) => x.type === "magpie");
  assert.ok(e);
  e.x = 50;
  e.y = 50;
  e.hp = 100;
  e.maxHp = 100;
  e.airborne = true;
  let r = attackAt(s, "stomp", 50, 50);
  assert.equal(r.ok, false);
  assert.equal(s.combat.stompCooldown, 0);
  r = attackAt(s, "spray", 50, 50);
  assert.equal(r.ok, true);
  assert.equal(s.combat.ammo, 2);
  assert.equal(attackAt(s, "spray", 50, 50).ok, false);
  tickCombat(s, 0.25);
  s.combat.sprayCooldown = 0;
  s.combat.ammo = 0;
  assert.equal(attackAt(s, "spray", 50, 50).ok, false);
  assert.equal(reloadSpray(s).ok, true);
  for (let i = 0; i < 20; i++) tickCombat(s, 0.25);
  assert.equal(s.combat.ammo, getDefenseStats(s).ammoMax);
  s.combat.status = "cleared";
  s.combat.level = 2;
  s.credits = 1000;
  const locked = getDefenseUpgradeCost(s, "stomp");
  assert.equal(locked.requiredLevel, 2);
  assert.equal(locked.canBuy, true);
  const before = getDefenseStats(s).stompDamage;
  assert.equal(buyDefenseUpgrade(s, "stomp").ok, true);
  assert.ok(getDefenseStats(s).stompDamage > before);
  s.combat.status = "active";
  assert.equal(buyDefenseUpgrade(s, "spray").ok, false);
});
test("friendly worms are attack immune, collectible and feed plants atomically", () => {
  const s = game();
  const original = s.combat.worms[0];
  const snap = structuredClone(original);
  startWave(s);
  assert.equal(attackAt(s, "stomp", original.x, original.y).hits, 0);
  assert.deepEqual(s.combat.worms[0], snap);
  assert.equal(collectWorm(s, original.id).ok, true);
  const growth = s.plots[0].growth,
    health = s.plots[0].health;
  assert.equal(feedWorm(s, 0).ok, true);
  assert.equal(s.plots[0].growth, Math.min(100, growth + 8));
  assert.equal(s.plots[0].health, Math.min(100, health + 6));
  assert.equal(feedWorm(s, 999).ok, false);
  assert.equal(s.combat.wormInventory, 1);
});
test("worm farm unlocks exactly at level five, produces once per day, and saves safely", () => {
  const s = game();
  assert.equal(getWormFarmInfo(s).unlocked, false);
  assert.equal(buyWormFarm(s).ok, false);
  s.combat.level = 4;
  s.combat.status = "ready";
  assert.equal(getWormFarmInfo(s).unlocked, false);
  s.combat.level = 5;
  s.credits = 500;
  assert.equal(getWormFarmInfo(s).unlocked, true);
  assert.equal(buyWormFarm(s).ok, true);
  assert.equal(afterDefenseDay(s).ok, true);
  assert.equal(afterDefenseDay(s).ok, true);
  assert.equal(s.combat.fertilizer, 1);
  const growth = s.plots[0].growth;
  assert.equal(fertilizePlant(s, 0).ok, true);
  assert.equal(s.plots[0].growth, Math.min(100, growth + 18));
  const saved = structuredClone(s.combat);
  const restored = { ...createGame(), combat: saved };
  assert.deepEqual(ensureCombat(restored), saved);
});
test("optional combat saves validate defensively, pause active saves, and failed actions are atomic", () => {
  const s = game();
  s.combat.status = "active";
  const loaded = { ...createGame(), combat: structuredClone(s.combat) };
  assert.equal(ensureCombat(loaded, loaded.combat).status, "paused");
  const corrupt = {
    ...createGame(),
    combat: { ...s.combat, enemies: Array(500).fill(s.combat.enemies[0]) },
  };
  assert.equal(ensureCombat(corrupt).level, 1);
  const a = game();
  a.combat.level = 1;
  a.credits = 0;
  const before = structuredClone(a);
  assert.equal(buyDefenseUpgrade(a, "stomp").ok, false);
  assert.deepEqual(a, before);
  assert.equal(DEFENSE_UPGRADES.length, 3);
});
test("retreat returns to safe farm state without awarding or advancing the wave", () => {
  const s = game();
  startWave(s);
  const level = s.combat.level,
    wave = s.combat.wave,
    credits = s.credits;
  assert.equal(retreatWave(s).ok, true);
  assert.equal(s.combat.status, "defeat");
  assert.equal(s.combat.enemies.length, 0);
  assert.equal(s.combat.queue.length, 0);
  assert.equal(s.combat.level, level);
  assert.equal(s.combat.wave, wave);
  assert.equal(s.credits, credits);
  const saved = structuredClone(s);
  assert.equal(retreatWave(s).ok, false);
  assert.deepEqual(s, saved);
  assert.equal(afterDefenseDay(s).ok, true);
});

test("friendly worm ecology remains valid and moves after a minute at capacity", () => {
  const s = game();
  const original = { ...s.combat.worms[0] };
  for (let i = 0; i < 650; i++) tickCombat(s, 0.1);
  assert.equal(s.combat.worms.length, 3);
  assert.equal(new Set(s.combat.worms.map((w) => w.id)).size, 3);
  assert.ok(s.combat.wormSpawnIn >= 0);
  assert.ok(
    s.combat.worms[0].x !== original.x || s.combat.worms[0].y !== original.y,
  );
  const saved = structuredClone(s.combat),
    restored = createGame();
  ensureCombat(restored, saved);
  assert.deepEqual(restored.combat, saved);
});
test("reload finishes in safe periods and progression purchases work after retreat", () => {
  const s = game();
  s.combat.ammo = 0;
  assert.equal(reloadSpray(s).ok, true);
  for (let i = 0; i < 50; i++) tickCombat(s, 0.1);
  assert.equal(s.combat.ammo, getDefenseStats(s).ammoMax);
  s.combat.level = 5;
  s.credits = 500;
  startWave(s);
  retreatWave(s);
  assert.equal(buyDefenseUpgrade(s, "stomp").ok, true);
  assert.equal(buyWormFarm(s).ok, true);
});
test("save validation rejects missing damage, nonfinite private timers and invalid reward entries", () => {
  const s = game();
  startWave(s);
  for (const corrupt of [
    {
      ...structuredClone(s.combat),
      enemies: s.combat.enemies.map((e) => ({ ...e, bitePower: undefined })),
    },
    { ...structuredClone(s.combat), _spawnIn: Infinity },
    { ...structuredClone(s.combat), rewards: [{}] },
  ]) {
    const restored = createGame();
    ensureCombat(restored, corrupt);
    assert.equal(restored.combat.status, "ready");
  }
});
test("magpies periodically land even after reaching their cactus target", () => {
  const s = game();
  s.combat.level = 3;
  startWave(s);
  const bird = s.combat.enemies[0];
  bird.x = 12;
  bird.y = 56;
  bird.targetIndex = 0;
  s.combat.elapsed = 3.2;
  bird.airborne = true;
  tickCombat(s, 0.1);
  assert.equal(bird.airborne, false);
});

test("ordinary play clears the first three levels using real cooldowns and ammo", () => {
  const s = game();
  for (let level = 1; level <= 3; level++) {
    for (let wave = 1; wave <= 3; wave++) {
      assert.equal(startWave(s).ok, true);
      let steps = 0;
      while (s.combat.status === "active" && steps++ < 3000) {
        const c = s.combat;
        if (c.ammo === 0 && c.reloadRemaining === 0) reloadSpray(s);
        if (
          c.sprayCooldown === 0 &&
          c.ammo > 0 &&
          c.reloadRemaining === 0 &&
          c.enemies.length
        ) {
          const e = c.enemies.find((e) => e.airborne) || c.enemies[0];
          attackAt(s, "spray", e.x, e.y);
        }
        if (c.stompCooldown === 0) {
          const e = c.enemies.find((e) => !e.airborne);
          if (e) attackAt(s, "stomp", e.x, e.y);
        }
        tickCombat(s, 0.1);
      }
      assert.equal(
        s.combat.status,
        "cleared",
        `level ${level}.${wave}: ${s.combat.status}`,
      );
      assert.ok(steps < 3000);
      for (const id of ["stomp", "spray", "tank"])
        if (getDefenseUpgradeCost(s, id).canBuy) buyDefenseUpgrade(s, id);
    }
  }
  assert.equal(s.combat.highestCleared, 3);
  assert.equal(s.combat.bossesDefeated, 3);
  assert.equal(s.combat.level, 4);
});
test("ensuring an initialized live system preserves the active raid", () => {
  const s = game();
  startWave(s);
  const c = s.combat;
  assert.equal(ensureCombat(s), c);
  assert.equal(s.combat.status, "active");
});

test("raid previews match actual opening waves, with escorts joining later bosses", () => {
  for (const [level, counts] of [[1, [3, 4, 3]], [2, [5, 6, 6]], [3, [8, 10, 7]]]) {
    for (let wave = 1; wave <= 3; wave++) {
      const s = game();
      Object.assign(s.combat, { level, wave: wave - 1 });
      assert.equal(getWaveInfo(s).enemyCount, counts[wave - 1]);
      assert.equal(startWave(s).ok, true);
      assert.equal(s.combat.enemies.length + s.combat.queue.length, counts[wave - 1]);
      assert.equal(s.combat.enemies.filter((enemy) => enemy.boss).length, wave === 3 ? 1 : 0);
      assert.equal(s.combat.enemies[0].bitePower, wave === 3 ? [6, 8, 9][level - 1] : [2, 3, 4][level - 1]);
    }
  }
});

test("a slower new player wins levels one through three, with recoverable pressure at level three", () => {
  const s = game();
  const damage = [];
  const durations = [];
  for (let n = 0; n < 9; n++) {
    const c = s.combat;
    if (c.integrity < 80 && getNurseryRepairInfo(s).canBuy) assert.equal(repairNursery(s).ok, true);
    const before = s.plots.reduce((sum, plant) => sum + (plant?.health || 0), 0);
    assert.equal(startWave(s).ok, true);
    let elapsed = 0;
    let nextAction = 4;
    while (c.status === "active" && elapsed < 90) {
      if (elapsed + 1e-6 >= nextAction) {
        nextAction += 1.2;
        const targets = [...c.enemies].sort((a, b) => b.y - a.y);
        const bird = targets.find((enemy) => enemy.airborne);
        const ground = targets.find((enemy) => !enemy.airborne);
        let acted = false;
        if (c.ammo === 0 && c.reloadRemaining === 0) acted = reloadSpray(s).ok;
        if (!acted && c.ammo > 0 && c.reloadRemaining === 0 && c.sprayCooldown === 0 && (bird || !ground || c.stompCooldown > 0)) {
          const target = bird || targets[0];
          if (target) acted = attackAt(s, "spray", target.x, target.y).ok;
        }
        if (!acted && c.stompCooldown === 0 && ground) attackAt(s, "stomp", ground.x, ground.y);
      }
      tickCombat(s, 0.1);
      elapsed += 0.1;
    }
    assert.equal(c.status, "cleared", `slower player clears wave ${n + 1}`);
    assert.equal(s.plots.filter(Boolean).length, 4, 'none of the starter plants is lost');
    damage.push(before - s.plots.reduce((sum, plant) => sum + (plant?.health || 0), 0));
    durations.push(elapsed);
    if (c.wave === 0 && n < 8) {
      for (const id of ["stomp", "spray", "tank"]) {
        const quote = getDefenseUpgradeCost(s, id);
        if (id !== "tank") assert.equal(quote.canBuy, true, 'campaign rewards fund both damage upgrades');
        if (quote.canBuy) assert.equal(buyDefenseUpgrade(s, id).ok, true);
      }
    }
    advanceDay(s);
    afterDay(s);
    afterDefenseDay(s);
    for (let i = 0; i < s.plots.length; i++) {
      if (s.plots[i]?.moisture < 40 && s.water > 0) waterPlant(s, i);
    }
    reloadSpray(s);
    for (let step = 0; step < 50; step++) tickCombat(s, 0.1);
  }
  assert.deepEqual(damage.slice(0, 5), [0, 0, 0, 0, 0], 'the opening raids allow learning time');
  assert.ok(damage[5] > 0 && damage[5] <= 20, 'the level-two boss introduces gentle pressure');
  assert.ok(damage.slice(6).reduce((sum, amount) => sum + amount, 0) > 0, 'level three introduces real pressure');
  assert.ok(damage[8] > Math.max(damage[6], damage[7]), 'the level-three boss is the damage peak');
  assert.ok(s.combat.integrity >= 75, 'successful play leaves a useful integrity reserve');
  assert.ok(durations[7] > durations[1], 'the second raid at level three takes longer than its level-one counterpart');
  assert.equal(s.combat.highestCleared, 3);
  assert.deepEqual(s.combat.upgrades, { stomp: 2, spray: 2, tank: 1 });
});

test("unattended level-one raids can lose integrity without eating any cactus, including on retry", () => {
  for (let wave = 1; wave <= 3; wave++) {
    const s = game();
    s.combat.wave = wave - 1;
    assert.match(getWaveInfo(s).description, /protected from being eaten/);
    const originalIds = s.plots.filter(Boolean).map((plant) => plant.id);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal(startWave(s).ok, true);
      for (let ticks = 0; s.combat.status === "active" && ticks < 2000; ticks++) tickCombat(s, 0.25);
      assert.equal(s.combat.status, "defeat", `unattended wave ${wave} remains losable`);
      assert.equal(s.combat.integrity, 0);
      assert.deepEqual(s.plots.filter(Boolean).map((plant) => plant.id), originalIds);
      assert.ok(s.plots.filter(Boolean).every((plant) => plant.health >= 20));
      assert.equal(s.combat.level, 1);
      assert.equal(s.combat.wave, wave);
    }
  }
});

test("early raids preserve already fragile plants without healing them, level six can eat cacti", () => {
  for (const level of [1, 3, 5, 6]) {
    const s = game();
    s.combat.level = level;
    startWave(s);
    const enemy = s.combat.enemies[0];
    const plant = s.plots[0];
    plant.health = 1;
    const growth = plant.growth;
    Object.assign(enemy, { x: 12, y: 56, targetIndex: 0, attackIn: 0 });
    tickCombat(s, 0.25);
    assert.equal(plant.growth, growth, 'pest bites never undo earned growth');
    if (level <= 5) {
      assert.equal(s.plots[0], plant);
      assert.equal(plant.health, 1);
    } else {
      assert.equal(s.plots[0], null);
      assert.ok(s.combat.integrity < 90);
    }
  }
});
