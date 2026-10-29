import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES,
  MUTATIONS,
  createGame,
  plantSeed,
  waterPlant,
  feedPlant,
  mutatePlant,
  sellPlant,
  expandFarm,
  advanceDay,
  getPlantValue,
  serializeGame,
  restoreGame,
} from '../src/simulation.js';

test('catalog defines all six cactus species, four mutations, and starter nursery state', () => {
  assert.deepEqual(
    SPECIES.map((s) => s.id),
    ['lophophora', 'pachanoi', 'peruvianus', 'bridgesii', 'tbm', 'tbmc']
  );
  assert.deepEqual(
    SPECIES.map((s) => s.name),
    [
      'Lophophora williamsii',
      'Trichocereus pachanoi',
      'T. peruvianus',
      'T. bridgesii',
      'T. bridgesii monstrose (TBM)',
      'T. bridgesii monstrose cristata (TBMC)',
    ]
  );
  for (const species of SPECIES) {
    assert.ok(['button', 'column', 'monstrose', 'crest'].includes(species.form));
    assert.ok(species.price > 0 && species.growthRate > 0 && species.matureValue > species.price);
    assert.equal(typeof species.common, 'string');
    assert.equal(typeof species.description, 'string');
    assert.match(species.color, /^#[0-9a-fA-F]{6}$/);
  }

  assert.deepEqual(
    MUTATIONS.map((m) => m.id),
    ['normal', 'variegated', 'crested', 'variegated-crested']
  );

  const state = createGame();
  assert.equal(state.version, 1);
  assert.equal(state.day, 1);
  assert.equal(state.plots.length, 12);
  assert.equal(state.sold, 0);
  assert.ok(state.credits >= 50);
  assert.ok(state.water >= 5 && state.water <= 30);
  assert.ok(state.essence >= 1);

  const planted = state.plots.filter(Boolean);
  assert.equal(planted.length, 4);
  assert.deepEqual(
    planted.map((p) => p.growth),
    [100, 68, 42, 22]
  );
  assert.equal(new Set(planted.map((p) => p.speciesId)).size, 4);
  for (const plant of planted) {
    assert.ok(state.discovered.includes(`${plant.speciesId}:${plant.mutation}`));
  }
});

test('plantSeed plants in empty plots, records discoveries, and leaves state untouched on failure', () => {
  const state = createGame();
  const creditsBefore = state.credits;
  const tbm = SPECIES.find((s) => s.id === 'tbm');

  const res = plantSeed(state, 4, 'tbm');
  assert.equal(res.ok, true);
  assert.equal(state.credits, creditsBefore - tbm.price);
  assert.equal(state.plots[4]?.speciesId, 'tbm');
  assert.equal(state.plots[4]?.mutation, 'normal');
  assert.ok(state.discovered.includes('tbm:normal'));

  const snapshot = structuredClone(state);
  assert.equal(plantSeed(state, 4, 'pachanoi').ok, false, 'occupied plot should fail');
  assert.equal(plantSeed(state, -1, 'pachanoi').ok, false, 'negative index should fail');
  assert.equal(plantSeed(state, 99, 'pachanoi').ok, false, 'out-of-range index should fail');
  assert.equal(plantSeed(state, 5, 'unknown-cactus').ok, false, 'unknown species should fail');
  assert.deepEqual(state, snapshot);

  state.credits = 2;
  const brokeSnapshot = structuredClone(state);
  assert.equal(plantSeed(state, 5, 'tbmc').ok, false, 'insufficient credits should fail');
  assert.deepEqual(state, brokeSnapshot);
});

test('watering, feeding, daily replenishment, drought recovery, and journal bounds work deterministically', () => {
  const state = createGame();
  const waterBefore = state.water;
  const moistureBefore = state.plots[3].moisture;

  assert.equal(waterPlant(state, 3).ok, true);
  assert.equal(state.water, waterBefore - 1);
  assert.equal(state.plots[3].moisture, moistureBefore + 28);

  const creditsBefore = state.credits;
  const growthBefore = state.plots[3].growth;
  assert.equal(feedPlant(state, 3).ok, true);
  assert.equal(state.credits, creditsBefore - 5);
  assert.equal(state.plots[3].growth, growthBefore + 14);

  // Empty plot or zero resources fail atomically
  state.water = 0;
  const noWaterSnapshot = structuredClone(state);
  assert.equal(waterPlant(state, 3).ok, false);
  assert.equal(waterPlant(state, 8).ok, false);
  assert.deepEqual(state, noWaterSnapshot);

  // Drought stress lowers health, and subsequent care recovers it and reaches maturity
  state.plots[2].moisture = 5;
  state.plots[2].health = 70;
  assert.equal(advanceDay(state).ok, true);
  assert.equal(state.day, 2);
  assert.equal(state.water, 4);
  assert.equal(state.plots[2].health, 60);
  assert.equal(state.plots[2].moisture, 0);

  // Water and tend across several days to recover health and reach 100% growth
  assert.equal(waterPlant(state, 2).ok, true);
  assert.equal(waterPlant(state, 2).ok, true);
  const stressedHealth = state.plots[2].health;
  for (let i = 0; i < 6; i += 1) {
    if (state.plots[2].moisture < 40 && state.water > 0) {
      waterPlant(state, 2);
    }
    advanceDay(state);
  }
  assert.ok(state.plots[2].health > stressedHealth);
  assert.equal(state.plots[2].growth, 100);

  // Water caps at 30 and journal caps at 30 messages
  for (let i = 0; i < 35; i += 1) {
    advanceDay(state);
  }
  assert.equal(state.water, 30);
  assert.equal(state.journal.length, 30);
  for (const plant of state.plots.filter(Boolean)) {
    assert.ok(plant.growth >= 0 && plant.growth <= 100);
    assert.ok(plant.health >= 0 && plant.health <= 100);
    assert.ok(plant.moisture >= 0 && plant.moisture <= 100);
  }
});

test('mutations unlock at growth >= 40, allow explicit form selection, and scale specimen value', () => {
  const state = createGame();
  state.essence = 20;

  // Plot 3 starts at growth 22 (< 40) -> cannot mutate
  const youngSnapshot = structuredClone(state);
  assert.equal(mutatePlant(state, 3, 'variegated').ok, false);
  assert.deepEqual(state, youngSnapshot);

  // Plot 1 starts at growth 68 (>= 40) -> can explicitly select each mutation
  const normalValue = getPlantValue(state.plots[1]);
  assert.equal(mutatePlant(state, 1, 'variegated').ok, true);
  assert.equal(state.plots[1].mutation, 'variegated');
  assert.equal(state.essence, 18);
  assert.ok(state.discovered.includes('pachanoi:variegated'));
  const variegatedValue = getPlantValue(state.plots[1]);
  assert.ok(variegatedValue > normalValue);

  // Duplicate mutation or invalid mutation IDs fail atomically
  const afterVariegated = structuredClone(state);
  assert.equal(mutatePlant(state, 1, 'variegated').ok, false);
  assert.equal(mutatePlant(state, 1, 'normal').ok, false);
  assert.equal(mutatePlant(state, 1, 'neon-glitch').ok, false);
  assert.deepEqual(state, afterVariegated);

  assert.equal(mutatePlant(state, 1, 'crested').ok, true);
  const crestedValue = getPlantValue(state.plots[1]);
  assert.ok(crestedValue > variegatedValue);
  assert.ok(state.discovered.includes('pachanoi:crested'));

  assert.equal(mutatePlant(state, 1, 'variegated-crested').ok, true);
  const dualValue = getPlantValue(state.plots[1]);
  assert.ok(dualValue > crestedValue);
  assert.ok(state.discovered.includes('pachanoi:variegated-crested'));
});

test('selling requires 100% growth, awards credits and >= 2 essence, and keeps discoveries', () => {
  const state = createGame();
  state.essence = 3;

  // Plot 1 is at 68% growth -> cannot sell
  const immatureSnapshot = structuredClone(state);
  assert.equal(sellPlant(state, 1).ok, false);
  assert.deepEqual(state, immatureSnapshot);

  // Mutate Plot 0 (100% growth lophophora) and sell it
  assert.equal(mutatePlant(state, 0, 'crested').ok, true);
  const expectedCredits = getPlantValue(state.plots[0]);
  const creditsBefore = state.credits;
  const essenceBefore = state.essence;

  const sale = sellPlant(state, 0);
  assert.equal(sale.ok, true);
  assert.equal(state.plots[0], null);
  assert.equal(state.credits, creditsBefore + expectedCredits);
  assert.ok(state.essence >= essenceBefore + 2);
  assert.equal(state.sold, 1);
  assert.ok(state.discovered.includes('lophophora:crested'));
});

test('expandFarm adds 4 plots at a time up to 24 and rejects over-expansion or insufficient funds', () => {
  const state = createGame();
  state.credits = 500;

  assert.equal(expandFarm(state).ok, true);
  assert.equal(state.plots.length, 16);
  assert.equal(expandFarm(state).ok, true);
  assert.equal(state.plots.length, 20);
  assert.equal(expandFarm(state).ok, true);
  assert.equal(state.plots.length, 24);

  const maxedSnapshot = structuredClone(state);
  assert.equal(expandFarm(state).ok, false);
  assert.deepEqual(state, maxedSnapshot);
});

test('serializeGame and restoreGame round-trip valid saves and reject corrupt or untrusted payloads', () => {
  const state = createGame();
  mutatePlant(state, 0, 'variegated');
  const raw = serializeGame(state);
  const restored = restoreGame(raw);
  assert.deepEqual(restored, state);

  const corruptPayloads = [
    null,
    undefined,
    42,
    '',
    '{not-valid-json',
    '[]',
    JSON.stringify({ ...state, version: 2 }),
    JSON.stringify({ ...state, credits: -10 }),
    JSON.stringify({ ...state, water: 99 }),
    JSON.stringify({ ...state, plots: Array(25).fill(null) }),
    JSON.stringify({ ...state, plots: [] }),
    JSON.stringify({
      ...state,
      plots: [{ ...state.plots[0], speciesId: 'hacked-cactus' }, ...state.plots.slice(1)],
    }),
    JSON.stringify({
      ...state,
      plots: [{ ...state.plots[0], mutation: 'rainbow' }, ...state.plots.slice(1)],
    }),
    JSON.stringify({
      ...state,
      plots: [{ ...state.plots[0], growth: 150 }, ...state.plots.slice(1)],
    }),
    JSON.stringify({
      ...state,
      plots: [state.plots[0], { ...state.plots[1], id: state.plots[0].id }, ...state.plots.slice(2)],
    }),
    JSON.stringify({ ...state, discovered: ['lophophora:normal', 'bogus:normal'] }),
  ];

  for (const payload of corruptPayloads) {
    assert.equal(restoreGame(payload), null);
  }
});

test('rarer mutation forms require distinct essence investments and reject unaffordable changes atomically', () => {
  const state = createGame(); state.essence = 11;
  assert.equal(mutatePlant(state, 0, 'variegated').ok, true);
  assert.equal(state.essence, 9);
  assert.equal(mutatePlant(state, 0, 'crested').ok, true);
  assert.equal(state.essence, 6);
  assert.equal(mutatePlant(state, 0, 'variegated-crested').ok, true);
  assert.equal(state.essence, 0);
  const before = structuredClone(state);
  assert.equal(mutatePlant(state, 0, 'variegated').ok, false);
  assert.deepEqual(state, before);
});

test('an empty broke nursery can restart after one day without farming recovery grants', () => {
  const state = createGame();
  state.plots.fill(null);
  state.credits = 0;
  const oldSave = serializeGame(state);
  assert.deepEqual(restoreGame(oldSave), state, 'legacy version 1 saves load without adding new fields');
  const result = advanceDay(state);
  assert.equal(result.ok, true);
  assert.equal(state.credits, 14, 'recovery covers exactly the cheapest seed');
  assert.match(result.message, /recovery grant.*San Pedro/);
  advanceDay(state);
  assert.equal(state.credits, 14, 'waiting with an empty garden does not accumulate grants');
  assert.equal(plantSeed(state, 0, 'pachanoi').ok, true);
  assert.equal(state.credits, 0);
  advanceDay(state);
  assert.equal(state.credits, 0, 'growing crops do not qualify for extra credits');
  for (let days = 0; state.plots[0].growth < 100 && days < 8; days++) {
    if (state.plots[0].moisture < 40) waterPlant(state, 0);
    advanceDay(state);
  }
  assert.equal(sellPlant(state, 0).ok, true, 'the recovery seed produces real income');
  assert.equal(state.credits, 38);
});

test('recovery tops up small balances and leaves funded or planted nurseries alone', () => {
  for (const credits of [0, 3, 13, 14, 75]) {
    const empty = createGame();
    empty.plots.fill(null);
    empty.credits = credits;
    advanceDay(empty);
    assert.equal(empty.credits, Math.max(14, credits));
    const growing = createGame();
    growing.credits = credits;
    advanceDay(growing);
    assert.equal(growing.credits, credits);
  }
});

test('each cared-for seed matures within six day clicks without paid feed or upgrades', () => {
  for (const species of SPECIES) {
    const state = createGame();
    assert.equal(plantSeed(state, 4, species.id).ok, true);
    let days = 0;
    while (state.plots[4].growth < 100 && days < 6) {
      if (state.plots[4].moisture < 40) assert.equal(waterPlant(state, 4).ok, true);
      assert.equal(advanceDay(state).ok, true);
      days++;
    }
    assert.equal(state.plots[4].growth, 100, `${species.common} matures within six days`);
    assert.ok(state.plots[4].health >= 90);
  }
});

test('a newly planted Velvet Button gives an early sale with simple or imperfect care', () => {
  for (const waterOnce of [false, true]) {
    const state = createGame();
    assert.equal(plantSeed(state, 4, 'lophophora').ok, true);
    if (waterOnce) assert.equal(waterPlant(state, 4).ok, true);
    for (let days = 0; state.plots[4].growth < 100 && days < 4; days++) advanceDay(state);
    assert.equal(sellPlant(state, 4).ok, true, 'one initial watering or no watering still gives a sale within four clicks');
    assert.equal(state.credits, 105, 'the seed and sale return a clear credit profit');
  }
});
