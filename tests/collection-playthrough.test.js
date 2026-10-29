import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  advanceDay,
  createGame,
  mutatePlant,
  plantSeed,
  restoreGame,
  sellPlant,
  serializeGame,
  waterPlant,
} from '../src/simulation.js';
import {
  afterDay,
  buyUpgrade,
  claimMilestone,
  fulfillOrder,
  getMilestones,
  getOrders,
  propagatePlant,
} from '../src/progression.js';

// These names are the six requested collection species; each has four requested
// forms: standard, variegated, crested, and variegated-crested.
const REQUESTED_SPECIES = [
  'lophophora', 'pachanoi', 'peruvianus', 'bridgesii', 'tbm', 'tbmc',
];
const REQUESTED_MUTATIONS = [
  'normal', 'variegated', 'crested', 'variegated-crested',
];
const EXPECTED_DISCOVERIES = REQUESTED_SPECIES.flatMap((speciesId) =>
  REQUESTED_MUTATIONS.map((mutationId) => `${speciesId}:${mutationId}`),
);
const MAX_DAYS = 220;

function claimReadyMilestones(state) {
  for (const milestone of getMilestones(state)) {
    if (milestone.ready && !milestone.claimed) {
      const result = claimMilestone(state, milestone.id);
      assert.equal(result.ok, true, `claim earned milestone ${milestone.id}`);
    }
  }
}

function tendDryPlants(state, counters) {
  for (let index = 0; index < state.plots.length && state.water > 0; index += 1) {
    const plant = state.plots[index];
    if (plant && plant.moisture < 40) {
      const result = waterPlant(state, index);
      assert.equal(result.ok, true, `water thirsty plant at plot ${index}`);
      counters.wateringActions += 1;
    }
  }
}

function advanceNurseryDay(state, counters) {
  assert.ok(counters.days < MAX_DAYS, `collection took at most ${MAX_DAYS} farm days`);
  const advanced = advanceDay(state);
  assert.equal(advanced.ok, true, 'the public farm action advances the day');
  afterDay(state);
  counters.days += 1;
  tendDryPlants(state, counters);
  claimReadyMilestones(state);
}

function growToMature(state, index, counters) {
  for (let guard = 0; state.plots[index]?.growth < 100 && guard < 24; guard += 1) {
    advanceNurseryDay(state, counters);
  }
  assert.ok(state.plots[index], `plant remains in plot ${index} while growing`);
  assert.equal(state.plots[index].growth, 100, `plant in plot ${index} reaches sale maturity`);
}

function plantAndGrow(state, speciesId, counters) {
  const index = state.plots.findIndex((plant) => plant === null);
  assert.notEqual(index, -1, 'the small nursery has an open plot');
  const planted = plantSeed(state, index, speciesId);
  assert.equal(planted.ok, true, `buy and plant the ${speciesId} seed with earned credits`);
  growToMature(state, index, counters);
  return index;
}

function sellMature(state, index, description) {
  const creditsBefore = state.credits;
  const result = sellPlant(state, index);
  assert.equal(result.ok, true, `sell mature ${description}`);
  assert.ok(state.credits > creditsBefore, `${description} sale pays credits into the nursery`);
}

test('earned nursery playthrough discovers all 24 requested forms and round-trips the collection save', async () => {
  const state = createGame();
  const counters = { days: 0, wateringActions: 0 };
  const initialCredits = state.credits;
  const initialEssence = state.essence;

  // Deliver the opening board's genuine lophophora request, then tend and sell
  // the other established specimens to fund the seed and mutation loop.
  const openingOrder = getOrders(state).find((order) => order.speciesId === 'lophophora' && order.mutation === null);
  assert.ok(openingOrder, 'the fresh board offers an accessible standard specimen order');
  assert.equal(fulfillOrder(state, openingOrder.id, 0).ok, true, 'deliver the mature starter through the collector board');
  claimReadyMilestones(state);
  for (const index of [1, 2, 3]) {
    if (!state.plots[index]) continue;
    const speciesId = state.plots[index].speciesId;
    growToMature(state, index, counters);
    sellMature(state, index, `${speciesId} starter`);
    claimReadyMilestones(state);
  }

  // TBM and TBMC are not starter specimens. Earn both standard discoveries by
  // purchasing their seeds, growing them, and making ordinary mature sales.
  for (const speciesId of ['tbm', 'tbmc']) {
    if (state.discovered.includes(`${speciesId}:normal`)) continue;
    const index = plantAndGrow(state, speciesId, counters);
    assert.ok(state.discovered.includes(`${speciesId}:normal`), `${speciesId} standard form is discovered by planting its seed`);
    sellMature(state, index, `${speciesId} standard form`);
    claimReadyMilestones(state);
  }

  let propagatedSale = false;
  for (const speciesId of REQUESTED_SPECIES) {
    for (const mutationId of REQUESTED_MUTATIONS.slice(1)) {
      const index = plantAndGrow(state, speciesId, counters);
      const mutated = mutatePlant(state, index, mutationId);
      assert.equal(mutated.ok, true, `mature ${speciesId} seed accepts ${mutationId} using earned essence`);
      assert.ok(state.discovered.includes(`${speciesId}:${mutationId}`), `public mutation action records ${speciesId}:${mutationId}`);
      assert.equal(state.essence >= 0, true, 'mutation spending never borrows or injects essence');
      claimReadyMilestones(state);

      if (!propagatedSale && speciesId === 'lophophora' && mutationId === 'variegated-crested') {
        assert.ok(state.credits > 80, 'prior legal sales and milestone rewards fund the propagation bench');
        const creditsBeforeUpgrade = state.credits;
        assert.equal(buyUpgrade(state, 'nursery').ok, true, 'purchase the propagation bench using earned credits');
        assert.equal(state.credits, creditsBeforeUpgrade - 80);
        assert.ok(state.plots[index].health >= 50, 'the rare-form mother meets the health threshold after care');
        const empty = state.plots.findIndex((plant) => plant === null);
        assert.notEqual(empty, -1);
        const beforeClone = { ...state.plots[index] };
        const propagated = propagatePlant(state, index, empty);
        assert.equal(propagated.ok, true, 'legally propagate the mature rare-form mother');
        assert.equal(state.plots[empty].speciesId, beforeClone.speciesId, 'offspring inherits the species');
        assert.equal(state.plots[empty].mutation, beforeClone.mutation, 'offspring inherits the combined mutation');
        assert.equal(state.plots[empty].growth, 12, 'offspring begins at the public seedling growth value');
        assert.equal(state.credits, creditsBeforeUpgrade - 100, 'propagation spends its additional 20 credits');
        growToMature(state, empty, counters);
        sellMature(state, empty, 'propagated combined rare form');
        propagatedSale = true;
        // The mother lost 15 growth during propagation but grows back while her
        // offspring matures; selling it is a normal mature sale as well.
        if (state.plots[index]?.growth < 100) growToMature(state, index, counters);
        sellMature(state, index, 'rare-form mother');
      } else {
        sellMature(state, index, `${speciesId} ${mutationId} form`);
      }
      claimReadyMilestones(state);
      assert.ok(state.discovered.includes(`${speciesId}:${mutationId}`), `sale preserves discovery ${speciesId}:${mutationId}`);
    }
  }

  assert.equal(propagatedSale, true, 'one legally purchased propagation produces an inherited mature sale');
  assert.ok(counters.wateringActions > 0, 'the playthrough uses earned water for real plant care');
  assert.ok(counters.days > 0 && counters.days <= MAX_DAYS, 'manual farm-day progression stays within its explicit bound');
  assert.ok(state.credits > initialCredits, 'the nursery finishes with credits earned through orders and sales');
  assert.ok(state.essence >= initialEssence, 'the complete mutation set is funded by legitimate sales and milestone rewards');
  assert.deepEqual(
    EXPECTED_DISCOVERIES.filter((key) => !state.discovered.includes(key)),
    [],
    'all six named species and all four named forms are retained in discoveries',
  );
  assert.equal(new Set(state.discovered).size, 24, 'the game collection contains exactly 24 distinct discovery keys');
  assert.ok(state.plots.filter(Boolean).length <= 5, 'the run keeps a small active nursery, including the one propagation');

  const json = serializeGame(state);
  const restored = restoreGame(json);
  assert.deepEqual(restored, state, 'the complete earned state survives the public JSON save boundary');
  const fixturePath = process.env.CHROMATIC_COLLECTION_FIXTURE;
  if (fixturePath) {
    await mkdir(dirname(fixturePath), { recursive: true });
    const temporaryPath = `${fixturePath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, json, 'utf8');
    await rename(temporaryPath, fixturePath);
  }
});
