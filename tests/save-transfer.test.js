import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, serializeGame } from '../src/simulation.js';
import { ensureProgress } from '../src/progression.js';
import { ensureCombat, startWave } from '../src/combat.js';
import { decodeGardenSave, encodeGardenSave, MAX_SAVE_BYTES } from '../src/save-transfer.js';

function initialized() {
  const state = createGame();
  ensureProgress(state);
  ensureCombat(state);
  return state;
}

function jsonState(state) { return JSON.parse(serializeGame(state)); }

test('transfer preserves the full garden and valid optional state, pausing active raids', () => {
  const state = initialized();
  state.credits = 321;
  state.essence = 17;
  state.discovered.push('tbmc:crested');
  state.progress.upgrades.soil = 2;
  state.combat.level = 2;
  state.combat.wave = 2;
  state.combat.status = 'cleared';
  assert.equal(startWave(state).ok, true);
  state.combat.enemies[0].hp -= 12;
  state.combat.queue = [{ type: 'earwig', boss: false }];
  const original = jsonState(state);
  const encoded = encodeGardenSave(state);
  const result = decodeGardenSave(encoded);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.state.version, 1);
  assert.equal(result.state.credits, 321);
  assert.equal(result.state.essence, 17);
  assert.deepEqual(result.state.discovered, original.discovered);
  assert.deepEqual(result.state.plots, original.plots);
  assert.equal(result.state.progress.upgrades.soil, 2);
  assert.equal(result.state.combat.level, 2);
  assert.equal(result.state.combat.status, 'paused');
  assert.equal(result.state.combat.enemies[0].hp, original.combat.enemies[0].hp);
  assert.deepEqual(result.state.combat.queue, original.combat.queue);
  assert.deepEqual(jsonState(state), original, 'export does not mutate its input');
});

test('legacy version 1 core saves without optional systems import with defaults', () => {
  const legacy = jsonState(createGame());
  const result = decodeGardenSave(JSON.stringify(legacy));
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.state.progress);
  assert.ok(result.state.combat);
});

test('invalid core, unsupported version, oversized text and invalid input reject safely', () => {
  const core = jsonState(createGame());
  assert.equal(decodeGardenSave('{').ok, false);
  assert.equal(decodeGardenSave(JSON.stringify({ ...core, plots: [] })).ok, false);
  assert.match(decodeGardenSave(JSON.stringify({ ...core, version: 2 })).error, /unsupported version/);
  assert.match(decodeGardenSave('x'.repeat(MAX_SAVE_BYTES + 1)).error, /512 KiB/);
  assert.equal(decodeGardenSave(null).ok, false);
  assert.equal(decodeGardenSave(`\uFEFF${JSON.stringify(core)}`).ok, true);
});

test('optional subsystem corruption repairs independently and reports clear warnings', () => {
  const payload = jsonState(initialized());
  payload.progress = { version: 1, upgrades: { shade: 99 } };
  const onlyProgressBad = decodeGardenSave(JSON.stringify(payload));
  assert.equal(onlyProgressBad.ok, true);
  assert.equal(onlyProgressBad.state.progress.upgrades.shade, 0);
  assert.equal(onlyProgressBad.state.combat.level, 1);
  assert.equal(onlyProgressBad.warnings.length, 1);
  assert.match(onlyProgressBad.warnings[0], /progression.*reset/i);

  payload.progress = { ...jsonState(initialized()).progress, upgrades: { shade: 99, irrigation: 0, soil: 0, nursery: 0 } };
  payload.combat = { ...jsonState(initialized()).combat, worms: [{ id: 'worm-1', x: 999, y: 50, phase: 0 }] };
  const bothBad = decodeGardenSave(JSON.stringify(payload));
  assert.equal(bothBad.ok, true);
  assert.equal(bothBad.state.progress.upgrades.shade, 0);
  assert.equal(bothBad.state.combat.worms.length, 1);
  assert.equal(bothBad.state.combat.worms[0].x, 46);
  assert.equal(bothBad.warnings.length, 2);
});

test('failed exports reject without changing the caller state', () => {
  const state = initialized();
  const before = jsonState(state);
  state.plots[0] = { ...state.plots[0], growth: 1000 };
  const invalid = jsonState(state);
  assert.throws(() => encodeGardenSave(state), /invalid garden/);
  assert.deepEqual(jsonState(state), invalid);
  assert.deepEqual(before.plots.slice(1), invalid.plots.slice(1));
});
