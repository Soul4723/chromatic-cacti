import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, serializeGame, restoreGame, advanceDay } from '../src/simulation.js';
import { ensureCombat, startWave, reloadSpray, tickCombat, getDefenseStats, afterDefenseDay } from '../src/combat.js';
import { ensureProgress, afterDay } from '../src/progression.js';

function initialized() {
  const state = createGame();
  ensureProgress(state);
  ensureCombat(state);
  return state;
}

// Match the optional-system envelope used by app.js around the core save API.
function loadPayload(payload) {
  const loaded = restoreGame(JSON.stringify(payload));
  assert.ok(loaded);
  ensureProgress(loaded, payload.progress);
  ensureCombat(loaded, payload.combat);
  return loaded;
}
function reload(state) {
  const payload = JSON.parse(serializeGame(state));
  payload.progress = state.progress;
  payload.combat = state.combat;
  return loadPayload(payload);
}

test('JSON save resumes a boss raid paused with its combat state and garden progression intact', () => {
  const state = initialized();
  state.combat.level = 2;
  state.combat.wave = 2;
  state.combat.status = 'cleared';
  assert.equal(startWave(state).ok, true);
  const boss = state.combat.enemies[0];
  assert.equal(boss.boss, true);
  boss.hp = 73;
  boss._summonIn = 1.375;
  state.combat.queue = [{ type: 'earwig', boss: false }];
  state.combat.stompCooldown = 0.4;
  state.combat.sprayCooldown = 0.2;
  state.combat.ammo = 1;
  state.combat.wormInventory = 7;
  state.combat.fertilizer = 4;
  state.progress.upgrades.soil = 2;
  state.plots[0].health = 61;
  const before = JSON.parse(JSON.stringify(state));

  const loaded = reload(state);
  assert.equal(loaded.combat.status, 'paused');
  assert.equal(loaded.progress.upgrades.soil, 2);
  assert.equal(loaded.combat.enemies[0].hp, 73);
  assert.equal(loaded.combat.enemies[0]._summonIn, 1.375);
  assert.deepEqual(loaded.combat.queue, before.combat.queue);
  for (const key of ['stompCooldown', 'sprayCooldown', 'ammo', 'wormInventory', 'fertilizer']) {
    assert.equal(loaded.combat[key], before.combat[key], `${key} survives reload`);
  }
  assert.equal(loaded.plots[0].health, 61);
  const resources = [loaded.credits, loaded.essence];
  assert.equal(startWave(loaded).ok, false, 'a saved boss wave cannot start twice');
  assert.deepEqual([loaded.credits, loaded.essence], resources, 'loading and rejecting a duplicate start pays no reward');
});

test('a partial sprayer reload resumes from its saved timer and refills once', () => {
  const state = initialized();
  state.combat.ammo = 0;
  assert.equal(reloadSpray(state).ok, true);
  tickCombat(state, 1.1);
  const remaining = state.combat.reloadRemaining;
  assert.ok(remaining > 0 && remaining < getDefenseStats(state).reloadSeconds);

  const loaded = reload(state);
  assert.equal(loaded.combat.reloadRemaining, remaining);
  for (let i = 0; i < 50; i++) tickCombat(loaded, 0.1);
  assert.equal(loaded.combat.ammo, getDefenseStats(loaded).ammoMax);
  assert.equal(loaded.combat.reloadRemaining, 0);
  assert.equal(loaded.combat._reloading, undefined);
});

test('bad optional saves reset only their subsystem while preserving the JSON-valid farm', () => {
  const source = initialized();
  source.credits = 314;
  source.essence = 19;
  source.discovered.push('tbmc:crested');
  source.combat.level = 6;
  source.combat.fertilizer = 8;
  source.progress.upgrades.irrigation = 2;
  const payload = JSON.parse(serializeGame(source));
  payload.combat = { ...payload.combat, enemies: Array(21).fill(payload.combat.enemies[0]) };
  payload.progress = { ...payload.progress, upgrades: { ...payload.progress.upgrades, shade: 99 } };
  const loaded = loadPayload(payload);
  const combat = loaded.combat;
  const progress = loaded.progress;
  assert.equal(combat.level, 1);
  assert.equal(combat.fertilizer, 0);
  assert.equal(progress.upgrades.irrigation, 0, 'corrupt progression resets as a unit');
  assert.equal(loaded.credits, 314);
  assert.equal(loaded.essence, 19);
  assert.ok(loaded.discovered.includes('tbmc:crested'));
});

test('worm capacity, fertilizer daily guard, and timers survive JSON reloads; invalid earwig timer resets combat only', () => {
  const state = initialized();
  state.combat.wormInventory = 999;
  state.combat.fertilizer = 30;
  state.combat.wormFarmLevel = 3;
  state.combat.lastFertilizerDay = 4;
  state.combat.wormSpawnIn = 7.25;
  state.combat.nextId = 81;
  state.combat.level = 2;
  state.combat.wave = 2;
  state.combat.status = 'cleared';
  startWave(state);
  state.combat.enemies[0]._summonIn = 3.5;
  const loaded = reload(state);
  assert.equal(loaded.combat.wormInventory, 999);
  assert.equal(loaded.combat.fertilizer, 30);
  assert.equal(loaded.combat.lastFertilizerDay, 4);
  assert.equal(loaded.combat.wormSpawnIn, 7.25);
  assert.equal(loaded.combat.enemies[0]._summonIn, 3.5);
  loaded.combat.status = 'cleared';
  assert.equal(afterDefenseDay(loaded).ok, true);
  assert.equal(loaded.combat.fertilizer, 30, 'full bin remains capped');
  assert.equal(afterDefenseDay(loaded).ok, true);
  assert.equal(loaded.combat.fertilizer, 30, 'the same day cannot produce a second batch');

  const bad = JSON.parse(serializeGame(loaded));
  bad.combat.enemies[0]._summonIn = 1e9;
  const recovered = loadPayload(bad);
  assert.equal(recovered.combat.level, 1);
  assert.equal(recovered.credits, loaded.credits);
  assert.deepEqual(recovered.discovered, loaded.discovered);
});

test('multiple JSON-resumed combat and farm days keep IDs, timers, and resources bounded', () => {
  let state = initialized();
  state.combat.wormFarmLevel = 3;
  state.combat.wormInventory = 999;
  state.combat.fertilizer = 29;
  state.combat.lastFertilizerDay = 1;
  for (let day = 0; day < 4; day++) {
    assert.equal(advanceDay(state).ok, true);
    afterDay(state);
    afterDefenseDay(state);
    for (let step = 0; step < 30; step++) tickCombat(state, 0.25);
    state = reload(state);
    const ids = [...state.combat.worms.map((w) => w.id), ...state.combat.enemies.map((e) => e.id)];
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(state.combat.wormSpawnIn >= 0 && Number.isFinite(state.combat.wormSpawnIn));
    assert.ok(state.combat.fertilizer >= 0 && state.combat.fertilizer <= 30);
    assert.ok(state.combat.enemies.every((e) => Number.isFinite(e.hp) && e.hp > 0 && e.x >= 0 && e.x <= 100 && e.y >= 0 && e.y <= 100));
  }
  assert.equal(state.day, 5);
});
