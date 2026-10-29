import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, MUTATIONS, createGame, plantSeed, waterPlant, advanceDay, getPlantValue, mutatePlant, sellPlant, restoreGame, serializeGame } from '../src/simulation.js';
import { UPGRADES, MILESTONES, ensureProgress, getEnvironment, getUpgradeCost, buyUpgrade, afterDay, getOrders, canFulfillOrder, fulfillOrder, propagatePlant, getMilestones, claimMilestone } from '../src/progression.js';

function game() {
  return { version: 1, day: 1, credits: 500, water: 10, essence: 10, sold: 0, discovered: ['lophophora:normal', 'pachanoi:normal', 'peruvianus:normal', 'bridgesii:normal'], journal: [], plots: [
    { id: 'plant-1', speciesId: 'lophophora', mutation: 'normal', growth: 100, health: 90, moisture: 50, age: 4 },
    { id: 'plant-2', speciesId: 'pachanoi', mutation: 'normal', growth: 75, health: 80, moisture: 50, age: 3 },
    null, null, null, null, null, null, null, null, null, null,
  ] };
}

test('upgrade costs rise, levels cap, and failed purchases do not charge', () => {
  const state = game(); const first = getUpgradeCost(state, 'shade');
  assert.equal(first, 45); assert.equal(buyUpgrade(state, 'shade').ok, true);
  assert.equal(state.credits, 455); assert.equal(getUpgradeCost(state, 'shade'), 108);
  state.credits = 0; const before = structuredClone(state);
  assert.equal(buyUpgrade(state, 'irrigation').ok, false); assert.deepEqual(state, before);
  for (let i = 1; i < UPGRADES[0].maxLevel; i++) { state.credits = 10000; assert.equal(buyUpgrade(state, 'shade').ok, true); }
  assert.equal(getUpgradeCost(state, 'shade'), null); assert.equal(buyUpgrade(state, 'bogus').ok, false);
  const uninitialized = game(); uninitialized.credits = 0; const untouched = structuredClone(uninitialized);
  assert.equal(buyUpgrade(uninitialized, 'shade').ok, false); assert.deepEqual(uninitialized, untouched);
});

test('environment forecast is deterministic and seasons advance every eight days', () => {
  const state = game(); const a = getEnvironment(state); const b = getEnvironment(state);
  assert.deepEqual(a, b); assert.equal(a.season, 'Bloomtide'); assert.equal(a.forecast.day, 2);
  state.day = 9; assert.equal(getEnvironment(state).season, 'Suncrest');
  assert.match(a.description, /per day/); assert.match(a.description, /shade cloth/i);
});

test('daily effects apply once with clamped values and journal stays bounded', () => {
  const state = game(); state.day = 4;
  for (let i = 0; i < 40; i++) { state.day++; afterDay(state); }
  assert.equal(state.journal.length, 30);
  for (const plant of state.plots.filter(Boolean)) for (const field of ['growth', 'health', 'moisture']) assert.ok(plant[field] >= 0 && plant[field] <= 100);
  const state2 = game(); const env = getEnvironment(state2); const before = state2.plots[0].moisture;
  afterDay(state2); const delta = state2.plots[0].moisture - before;
  assert.equal(delta, { Clear: -3, Cloudburst: 18, 'Heat shimmer': -8, 'Dry wind': -7, 'Soft overcast': -1 }[env.weather]);
});

test('orders require exact specimen criteria and successful delivery consumes and pays once', () => {
  const state = game(); const order = getOrders(state).find((o) => o.speciesId === 'lophophora' && o.mutation === null);
  assert.ok(order); assert.equal(canFulfillOrder(state, order.id, 0), true);
  const wrong = structuredClone(state); wrong.plots[0].speciesId = 'tbm'; const snapshot = structuredClone(wrong);
  assert.equal(fulfillOrder(wrong, order.id, 0).ok, false); assert.deepEqual(wrong, snapshot);
  const credits = state.credits; const result = fulfillOrder(state, order.id, 0);
  assert.equal(result.ok, true); assert.equal(state.plots[0], null); assert.equal(state.credits, credits + order.rewardCredits);
  assert.equal(state.sold, 1); assert.equal(state.progress.completedOrders, 1); assert.equal(getOrders(state).some((o) => o.id === order.id), false);
  const delivered = structuredClone(state); assert.equal(fulfillOrder(state, order.id, 0).ok, false); assert.equal(state.credits, delivered.credits);
});

test('expired requests fail without changing state', () => {
  const state = game(); const order = getOrders(state)[0]; state.day = order.expiresDay + 1;
  const before = structuredClone(state); assert.equal(fulfillOrder(state, order.id, 0).ok, false);
  assert.equal(state.credits, before.credits); assert.equal(state.plots[0].id, before.plots[0].id);
});

test('optional progression data validates, resets when corrupt, and round trips exactly', () => {
  const state = game(); const progress = ensureProgress(state); progress.upgrades.soil = 2; progress.reputation = 7;
  const restored = game(); assert.deepEqual(ensureProgress(restored, progress), progress);
  const corrupt = structuredClone(progress); corrupt.upgrades.shade = Infinity;
  const safe = game(); const clean = ensureProgress(safe, corrupt);
  assert.equal(clean.upgrades.shade, 0); assert.equal(clean.reputation, 0);
  const hostile = structuredClone(progress); hostile.orders[0].speciesId = 'unknown';
  assert.equal(ensureProgress(game(), hostile).orders.length, 3);
});

test('propagation requires nursery, parent health and funds; clone inherits form with unique ids', () => {
  const state = game(); ensureProgress(state); const before = structuredClone(state);
  assert.equal(propagatePlant(state, 0, 2).ok, false); assert.deepEqual(state, before);
  state.progress = ensureProgress(state); state.progress.upgrades.nursery = 1;
  state.plots[0].mutation = 'variegated'; state.discovered.push('lophophora:variegated');
  assert.equal(propagatePlant(state, 0, 2).ok, true);
  const clone = state.plots[2]; assert.equal(clone.mutation, 'variegated'); assert.equal(clone.speciesId, 'lophophora');
  assert.equal(clone.growth, 12); assert.equal(state.plots[0].growth, 85); assert.equal(state.credits, 480);
  const persisted = structuredClone(state); const restored = game(); Object.assign(restored, persisted);
  assert.equal(propagatePlant(restored, 0, 3).ok, true); assert.notEqual(restored.plots[2].id, restored.plots[3].id);
  const poor = game(); poor.progress = ensureProgress(poor); poor.progress.upgrades.nursery = 1; poor.credits = 0;
  const snapshot = structuredClone(poor); assert.equal(propagatePlant(poor, 0, 2).ok, false); assert.deepEqual(poor, snapshot);
});

test('milestones award only when ready and exactly once', () => {
  const state = game(); assert.equal(getMilestones(state).find((m) => m.id === 'first-sale').ready, false);
  const snapshot = structuredClone(state); assert.equal(claimMilestone(state, 'first-sale').ok, false); assert.equal(state.credits, snapshot.credits);
  state.sold = 1; const credits = state.credits; const reward = MILESTONES.find((m) => m.id === 'first-sale');
  assert.equal(claimMilestone(state, 'first-sale').ok, true); assert.equal(state.credits, credits + reward.rewardCredits);
  const paid = state.credits; assert.equal(claimMilestone(state, 'first-sale').ok, false); assert.equal(state.credits, paid);
});

test('soil conserves moisture and progression does not advance a plant age twice', () => {
  const plain = game(), improved = game();
  ensureProgress(improved).upgrades.soil = 1;
  const originalAge = plain.plots[0].age;
  afterDay(plain); afterDay(improved);
  assert.equal(improved.plots[0].moisture, plain.plots[0].moisture + 2);
  assert.equal(plain.plots[0].age, originalAge);
});

test('orders stay available until their stated deadline and completed slots refill next day', () => {
  const state = game(), orders = structuredClone(getOrders(state));
  state.day = 2; afterDay(state);
  assert.deepEqual(getOrders(state), orders);
  assert.equal(fulfillOrder(state, orders[0].id, 0).ok, true);
  assert.equal(getOrders(state).length, 2);
  state.day = 3; afterDay(state);
  const refreshed = getOrders(state);
  assert.equal(refreshed.length, 3);
  assert.ok(refreshed.some(order => order.id === orders[1].id));
  assert.ok(!refreshed.some(order => order.id === orders[0].id));
});

test('drip irrigation waters dry soil without soaking already wet plants', () => {
  const dry = game(), wet = game();
  ensureProgress(dry).upgrades.irrigation = 3;
  ensureProgress(wet).upgrades.irrigation = 3;
  dry.plots[0].moisture = 60; wet.plots[0].moisture = 90;
  const wetControl = structuredClone(wet); wetControl.progress.upgrades.irrigation = 0;
  afterDay(dry); afterDay(wet); afterDay(wetControl);
  assert.ok(dry.plots[0].moisture <= 65);
  assert.equal(wet.plots[0].moisture, wetControl.plots[0].moisture);
});

test('fresh orders pay specimen premiums and allow enough time to grow their requests', () => {
  let rareOrders = 0;
  for (let day = 1; day <= 30; day++) {
    const board = createGame();
    board.day = day;
    const orders = getOrders(board);
    assert.equal(orders.length, 3);
    for (const order of orders) {
      const state = createGame();
      state.day = day;
      state.credits = 100;
      state.essence = 20;
      const species = SPECIES.find((entry) => entry.id === order.speciesId);
      assert.equal(plantSeed(state, 4, species.id).ok, true);
      const requested = { ...state.plots[4], growth: order.minGrowth, mutation: order.mutation || 'normal' };
      assert.ok(order.rewardCredits > getPlantValue(requested), `${order.title} beats a sale at requested growth`);
      assert.ok(order.rewardCredits > species.price, 'every normal request returns more than its seed cost');
      while (state.plots[4].growth < order.minGrowth && state.day < order.expiresDay) {
        if (state.plots[4].moisture < 40) assert.equal(waterPlant(state, 4).ok, true);
        advanceDay(state);
        afterDay(state);
      }
      if (order.mutation) {
        rareOrders++;
        assert.equal(mutatePlant(state, 4, order.mutation).ok, true);
        assert.ok(order.rewardEssence >= MUTATIONS.find((form) => form.id === order.mutation).cost);
      }
      ensureProgress(state).orders = [structuredClone(order)];
      assert.equal(canFulfillOrder(state, order.id, 4), true, `${order.title} can be grown before its deadline`);
      assert.equal(fulfillOrder(state, order.id, 4).ok, true);
    }
  }
  assert.ok(rareOrders > 0, 'the test covers rare-form commissions too');
});

test('refilling a young-specimen slot preserves the other requests and order variety', () => {
  const state = game();
  const orders = structuredClone(getOrders(state));
  state.plots[1] = { ...state.plots[1], speciesId: orders[1].speciesId, growth: 70 };
  assert.equal(fulfillOrder(state, orders[1].id, 1).ok, true);
  state.day++;
  afterDay(state);
  const refreshed = getOrders(state);
  assert.equal(refreshed.length, 3);
  assert.ok(refreshed.some((order) => order.id === orders[0].id));
  assert.ok(refreshed.some((order) => order.id === orders[2].id));
  assert.equal(refreshed.find((order) => order.id.endsWith('-1')).minGrowth, 70);
});

test('old version 1 order rewards and deadlines survive the balance update', () => {
  const state = createGame();
  const progress = ensureProgress(state);
  progress.orders[0].rewardCredits = 36;
  progress.orders[0].rewardEssence = 2;
  progress.orders[0].expiresDay = 5;
  const restored = restoreGame(serializeGame(state));
  assert.deepEqual(ensureProgress(restored), progress);
  assert.equal(fulfillOrder(restored, progress.orders[0].id, 0).ok, true);
  assert.equal(restored.credits, state.credits + 36);
});

test('the full day and weather loop brings a new Velvet Button to sale within three clicks', () => {
  for (const waterOnce of [false, true]) {
    const state = createGame();
    assert.equal(plantSeed(state, 4, 'lophophora').ok, true);
    if (waterOnce) assert.equal(waterPlant(state, 4).ok, true);
    for (let click = 0; click < 3; click++) {
      assert.equal(advanceDay(state).ok, true);
      assert.equal(afterDay(state).ok, true);
    }
    assert.equal(sellPlant(state, 4).ok, true);
    assert.equal(state.credits, 105);
    assert.equal(state.sold, 1);
  }
});
