import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  plantSeed,
  waterPlant,
  advanceDay,
} from '../src/simulation.js';
import { afterDay } from '../src/progression.js';
import {
  ensureCombat,
  getWaveInfo,
  getDefenseStats,
  startWave,
  tickCombat,
  attackAt,
  reloadSpray,
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
} from '../src/combat.js';

const BOSS_CYCLE = ['snail', 'earwig', 'magpie'];

// A visible-target player: one decision per 250ms game step, using real
// cooldowns and ammo. Aim at the densest visible group so AoE is useful.
function playWave(state, { idleSeconds = 0 } = {}) {
  for (let n = 0; n < idleSeconds * 4; n += 1) tickCombat(state, 0.25);

  let elapsed = 0;
  let decisions = 0;
  const events = [];
  while (state.combat.status === 'active' && elapsed < 180) {
    const c = state.combat;
    const enemies = [...c.enemies];
    const stats = getDefenseStats(state);
    let acted = false;

    if (c.stompCooldown === 0) {
      let aim = null;
      for (const enemy of enemies) {
        const hits = enemies.filter(
          (other) =>
            (other.type !== 'magpie' || !other.airborne) &&
            Math.hypot(other.x - enemy.x, other.y - enemy.y) <= stats.stompRadius,
        ).length;
        if (hits && (!aim || hits > aim.hits)) aim = { enemy, hits };
      }
      if (aim) acted = attackAt(state, 'stomp', aim.enemy.x, aim.enemy.y).ok;
    }

    if (
      !acted &&
      c.sprayCooldown === 0 &&
      c.reloadRemaining === 0 &&
      c.ammo > 0
    ) {
      // Airborne birds are a spray-only threat. While stomp recovers, spend a
      // shot on the largest visible group rather than fire into empty space.
      let targets = enemies.filter((enemy) => enemy.type === 'magpie' && enemy.airborne);
      if (!targets.length && c.stompCooldown > 0) targets = enemies;
      let aim = null;
      for (const enemy of targets) {
        const hits = enemies.filter(
          (other) => Math.hypot(other.x - enemy.x, other.y - enemy.y) <= stats.sprayRadius,
        ).length;
        if (!aim || hits > aim.hits) aim = { enemy, hits };
      }
      if (aim) acted = attackAt(state, 'spray', aim.enemy.x, aim.enemy.y).ok;
    }

    if (!acted && c.ammo === 0 && c.reloadRemaining === 0) reloadSpray(state);
    const result = tickCombat(state, 0.25);
    events.push(...result.events);
    elapsed += 0.25;
    decisions += 1;
  }

  assert.ok(elapsed < 180, `wave ${state.combat.level}.${state.combat.wave} exceeded three minutes`);
  return { elapsed, decisions, events };
}

function tendGarden(state) {
  for (const worm of [...state.combat.worms]) {
    assert.equal(collectWorm(state, worm.id).ok, true);
  }
  const injured = state.plots
    .map((plant, index) => ({ plant, index }))
    .filter(({ plant }) => plant && plant.health < 96)
    .sort((a, b) => a.plant.health - b.plant.health)[0];
  if (injured && state.combat.wormInventory > 0) {
    assert.equal(feedWorm(state, injured.index).ok, true);
  }
  const thirstyCare = state.plots
    .map((plant, index) => ({ plant, index }))
    .filter(({ plant }) => plant && plant.health < 88 && plant.moisture < 75)
    .sort((a, b) => a.plant.health - b.plant.health)[0];
  if (thirstyCare && state.water > 0) waterPlant(state, thirstyCare.index);
  const fertilizerTarget = state.plots
    .map((plant, index) => ({ plant, index }))
    .filter(({ plant }) => plant && plant.health < 90)
    .sort((a, b) => a.plant.health - b.plant.health)[0];
  if (fertilizerTarget && state.combat.fertilizer > 0) {
    assert.equal(fertilizePlant(state, fertilizerTarget.index).ok, true);
  }
  const living = state.plots.filter(Boolean).length;
  const empty = state.plots.findIndex((plant) => plant === null);
  if (living < 4 && empty >= 0 && state.credits >= 14) {
    assert.equal(plantSeed(state, empty, 'pachanoi').ok, true);
  }
}

test('natural campaign reaches champion, sustains worm-farm progression, and replays level 12', () => {
  const state = createGame();
  ensureCombat(state);
  const initialCredits = state.credits;
  const levelTimes = Array.from({ length: 12 }, () => []);
  const bossTypes = [];
  let reachedFarmUnlock = false;
  let farmProductionObserved = false;
  let fertilizerUsed = false;
  let firstWaveDamage = null;
  let firstWaveRecovery = null;

  for (let level = 1; level <= 12; level += 1) {
    assert.equal(state.combat.level, level, `entered expected campaign level ${level}`);
    if (level < 5) assert.equal(getWormFarmInfo(state).unlocked, false);
    if (level === 5) {
      reachedFarmUnlock = getWormFarmInfo(state).unlocked;
      assert.equal(reachedFarmUnlock, true, 'clearing level 4 unlocks the farm at level 5');
      const farm = getWormFarmInfo(state);
      assert.equal(farm.nextCost, 90);
      assert.equal(farm.canBuy, true, 'earned campaign credits cover the level-5 farm');
      assert.equal(buyWormFarm(state).ok, true);
      assert.equal(state.combat.wormFarmLevel, 1);
    }
    if (level === 7 || level === 9) {
      const farm = getWormFarmInfo(state);
      assert.equal(farm.requiredLevel, level);
      assert.equal(farm.nextCost, level === 7 ? 140 : 220);
      assert.equal(farm.canBuy, true, `earned credits cover the level-${level} upgrade`);
      assert.equal(buyWormFarm(state).ok, true);
      assert.equal(state.combat.wormFarmLevel, level === 7 ? 2 : 3);
    }
    if (level === 2) {
      const stomp = getDefenseUpgradeCost(state, 'stomp');
      assert.equal(stomp.requiredLevel, 2);
      assert.equal(stomp.canBuy, true, 'level-1 rewards cover a single weapon upgrade');
      assert.equal(buyDefenseUpgrade(state, 'stomp').ok, true);
      assert.equal(state.combat.upgrades.stomp, 1);
    }
    if ([4, 6, 8, 10, 12].includes(level)) {
      const reserve = level < 7 ? 0 : level < 9 ? 140 : 0;
      const id = ({ 4: 'spray', 6: 'tank', 8: 'stomp', 10: 'spray', 12: 'tank' })[level];
      const quote = getDefenseUpgradeCost(state, id);
      assert.equal(quote.canBuy, true, `earned campaign rewards cover the level-${level} ${id} upgrade`);
      assert.ok(state.credits - quote.cost >= reserve);
      assert.equal(buyDefenseUpgrade(state, id).ok, true);
    }

    for (let wave = 1; wave <= 3; wave += 1) {
      if (state.combat.integrity < 70 && getNurseryRepairInfo(state).canBuy) {
        assert.equal(repairNursery(state).ok, true, 'campaign earnings fund repairs before the next raid');
      }
      const info = getWaveInfo(state);
      assert.equal(info.level, level);
      assert.equal(info.wave, wave);
      assert.equal(info.isBoss, wave === 3);
      if (wave === 3) {
        assert.equal(info.bossName.length > 0, true);
        bossTypes.push(BOSS_CYCLE[(level - 1) % BOSS_CYCLE.length]);
      }
      assert.equal(startWave(state).ok, true, `start ${level}.${wave}`);
      if (wave === 3) {
        const boss = state.combat.enemies.find((enemy) => enemy.boss);
        assert.ok(boss, `level ${level} boss spawns`);
        assert.equal(boss.type, BOSS_CYCLE[(level - 1) % BOSS_CYCLE.length]);
      }

      const result = playWave(state, {
        // Let the opening pests reach the nursery so its damage and recovery
        // loop is exercised before the player starts attacking.
        idleSeconds: level === 1 && wave === 1 ? 32 : 0,
      });
      levelTimes[level - 1].push(result.elapsed);
      if (level === 1 && wave === 1) {
        firstWaveDamage = {
          integrity: state.combat.integrity,
          injuredPlants: state.plots.filter((plant) => plant && plant.health < 100).length,
        };
        assert.ok(firstWaveDamage.integrity < 100, 'unattended pests damage nursery integrity');
        assert.ok(firstWaveDamage.injuredPlants > 0, 'unattended pests damage planted cacti');
        assert.equal(state.combat.worms.length, 3, 'idle raid time naturally fills visible worm capacity');
        for (const worm of [...state.combat.worms]) {
          assert.equal(collectWorm(state, worm.id).ok, true);
        }

        const target = state.plots
          .map((plant, index) => ({ plant, index }))
          .filter(({ plant }) => plant)
          .sort((a, b) => a.plant.health - b.plant.health)[0];
        const damagedHealth = target.plant.health;
        const waterBefore = state.water;
        assert.equal(waterPlant(state, target.index).ok, true);
        assert.equal(state.water, waterBefore - 1);
        assert.equal(feedWorm(state, target.index).ok, true);
        firstWaveRecovery = target.plant.health;
        assert.ok(firstWaveRecovery >= damagedHealth + 10, 'watering and a collected worm restore the damaged cactus');
        assert.ok(state.combat.wormInventory >= 3, 'the idle worms were collected into the basket');
      }

      assert.ok(
        ['cleared', 'champion'].includes(state.combat.status),
        `level ${level}.${wave} ended ${state.combat.status}; ${state.combat.message}; ` +
          `integrity ${state.combat.integrity}; plants ${state.plots.map((plant) => plant ? plant.health : 'empty').join(',')}; ` +
          `upgrades ${JSON.stringify(state.combat.upgrades)}`,
      );
      assert.equal(state.combat.enemies.length, 0);
      assert.equal(state.combat.queue.length, 0);
      assert.ok(result.decisions >= result.elapsed * 3.9, 'the player kept a 250ms action cadence');
      tendGarden(state);
    }

    if (level < 12) assert.equal(state.combat.level, level + 1);
    if (state.combat.wormFarmLevel > 0) {
      const oldFertilizer = state.combat.fertilizer;
      assert.equal(advanceDay(state).ok, true);
      assert.equal(afterDay(state).ok, true);
      assert.equal(afterDefenseDay(state).ok, true);
      const produced = Math.min(state.combat.wormFarmLevel, 30 - oldFertilizer);
      if (produced > 0) {
        assert.equal(state.combat.fertilizer, oldFertilizer + produced);
        farmProductionObserved = true;
        // Repeating the same day call must not mint a second day's stock.
        assert.equal(afterDefenseDay(state).ok, true);
        assert.equal(state.combat.fertilizer, oldFertilizer + produced);
      }
      const beforeCare = state.combat.fertilizer;
      tendGarden(state);
      if (state.combat.fertilizer < beforeCare) fertilizerUsed = true;
    }
  }

  assert.equal(state.combat.status, 'champion');
  assert.equal(state.combat.highestCleared, 12);
  assert.equal(state.combat.bossesDefeated, 12);
  assert.equal(state.combat.wormFarmLevel, 3);
  assert.equal(reachedFarmUnlock, true);
  assert.equal(farmProductionObserved, true);
  assert.equal(fertilizerUsed, true);
  assert.deepEqual(bossTypes, Array.from({ length: 12 }, (_, i) => BOSS_CYCLE[i % 3]));
  assert.equal(state.combat.waveRewarded.length, 36);
  assert.equal(new Set(state.combat.waveRewarded).size, 36);
  assert.ok(state.credits > 0, 'earned rewards leave the garden with a usable balance');
  assert.ok(state.credits < initialCredits + 10000, 'the campaign economy remains finite');

  const earnedBeforeReplay = state.credits;
  assert.equal(startWave(state).ok, true, 'champion can replay the final campaign level');
  assert.equal(state.combat.level, 12);
  assert.equal(state.combat.wave, 1);
  for (let replayWave = 1; replayWave <= 3; replayWave += 1) {
    if (replayWave > 1) assert.equal(startWave(state).ok, true);
    assert.equal(state.combat.wave, replayWave);
    const replay = playWave(state);
    assert.ok(replay.elapsed > 0);
    assert.ok(['cleared', 'champion'].includes(state.combat.status));
  }
  assert.equal(state.combat.status, 'champion', 'all three replay waves return to champion');
  assert.equal(state.combat.bossesDefeated, 13, 'replay defeats a fresh final boss');
  assert.equal(state.combat.waveRewarded.length, 36, 'replayed waves do not duplicate clear rewards');
  assert.equal(new Set(state.combat.waveRewarded).size, 36);
  assert.equal(state.combat.highestCleared, 12);
  assert.ok(state.credits >= earnedBeforeReplay, 'replay may earn fresh pest bounties without re-paying the wave clear');

  // Daily-farm and combat inputs were real public actions, never direct edits
  // to HP, cooldowns, ammo, campaign progress, credits, or plant condition.
  assert.ok(firstWaveDamage && firstWaveRecovery > 0);
  assert.ok(levelTimes.flat().every((seconds) => seconds > 0 && seconds < 180));
});
