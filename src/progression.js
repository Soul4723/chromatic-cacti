import { SPECIES as CATALOG, MUTATIONS as FORMS } from './simulation.js';

const SPECIES = CATALOG.map((species) => species.id);
const MUTATIONS = ['normal', 'variegated', 'crested', 'variegated-crested'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const dayOf = (state) => finite(state?.day) ? Math.max(1, Math.floor(state.day)) : 1;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export const UPGRADES = [
  { id: 'shade', name: 'Shade cloth', description: 'Each level preserves 3 moisture per day. During heat shimmer, it also cools the garden by 2°C and prevents 1 health loss.', maxLevel: 3, baseCost: 45 },
  { id: 'irrigation', name: 'Drip irrigation', description: 'Each level adds up to 5 moisture to dry plots at day end, stopping at 65 moisture. Wet plots are left alone.', maxLevel: 3, baseCost: 55 },
  { id: 'soil', name: 'Mineral soil', description: 'Each level adds 1 growth per day and reduces moisture loss by 2 per day.', maxLevel: 3, baseCost: 65 },
  { id: 'nursery', name: 'Propagation bench', description: 'Level 1 unlocks cloning at 80 health; each further level adds 2 seedling health.', maxLevel: 3, baseCost: 80 },
];

export const MILESTONES = [
  { id: 'first-sale', title: 'First sale', description: 'Sell or fulfill your first order.', rewardCredits: 35, rewardEssence: 2 },
  { id: 'six-species', title: 'Full house', description: 'Discover all six species.', rewardCredits: 70, rewardEssence: 4 },
  { id: 'four-mutations', title: 'Mutation study', description: 'Discover all four mutation forms.', rewardCredits: 60, rewardEssence: 5 },
  { id: 'expanded-farm', title: 'Room to grow', description: 'Expand the farm to at least 16 plots.', rewardCredits: 50, rewardEssence: 3 },
  { id: 'three-orders', title: 'Trusted supplier', description: 'Deliver three collector orders.', rewardCredits: 80, rewardEssence: 6 },
];

const emptyProgress = (day) => ({ version: 1, upgrades: { shade: 0, irrigation: 0, soil: 0, nursery: 0 }, reputation: 0, orders: makeOrders(day, 0), orderDay: day, completedOrders: 0, claimed: [] });

function hashDay(day, salt = 0) {
  let x = (Math.imul(day | 0, 1103515245) + Math.imul(salt + 1, 12345)) >>> 0;
  x ^= x >>> 11; x = Math.imul(x, 2654435761) >>> 0;
  return x;
}

function makeOrders(day, completed) {
  // Lophophora is a mature starter specimen, so the opening board always has
  // one immediately deliverable normal order. Later boards rotate the request.
  const speciesIndex = day <= 2 && completed === 0 ? 0 : (hashDay(day) + completed) % SPECIES.length;
  const later = day >= 5 || completed > 0;
  const rare = later && hashDay(day, 4) % 3 === 0;
  // Orders pay a premium on the requested specimen's sale value. Deadlines leave
  // time to buy and grow the requested seed, including the slower rare species.
  const first = { id: `order-${day}-0`, title: `Collector wants a ${CATALOG[speciesIndex].common}`, speciesId: SPECIES[speciesIndex], mutation: null, minGrowth: 100, rewardCredits: Math.round(CATALOG[speciesIndex].matureValue * 1.25), rewardEssence: 3, rewardReputation: 3, expiresDay: day + 7 };
  const secondIdx = (speciesIndex + 2) % SPECIES.length;
  const second = { id: `order-${day}-1`, title: `Young ${CATALOG[secondIdx].common} wanted`, speciesId: SPECIES[secondIdx], mutation: null, minGrowth: 70, rewardCredits: Math.round(CATALOG[secondIdx].matureValue * 0.95), rewardEssence: 2, rewardReputation: 2, expiresDay: day + 6 };
  const thirdSpecies = SPECIES[(speciesIndex + 4) % SPECIES.length];
  const thirdValue = CATALOG[(speciesIndex + 4) % SPECIES.length].matureValue;
  const rareForm = hashDay(day, 8) % 2 ? 'variegated' : 'crested';
  const third = rare
    ? { id: `order-${day}-2`, title: 'Rare-form commission', speciesId: thirdSpecies, mutation: rareForm, minGrowth: 80, rewardCredits: Math.round(thirdValue * FORMS.find((form) => form.id === rareForm).multiplier * 1.15), rewardEssence: 5, rewardReputation: 6, expiresDay: day + 8 }
    : { id: `order-${day}-2`, title: `Nursery needs a ${CATALOG[(speciesIndex + 4) % SPECIES.length].common}`, speciesId: thirdSpecies, mutation: null, minGrowth: 55, rewardCredits: Math.round(thirdValue * 0.8), rewardEssence: 2, rewardReputation: 1, expiresDay: day + 5 };
  return [first, second, third];
}

function validOrder(o, day) {
  return o && typeof o === 'object' && typeof o.id === 'string' && o.id.length <= 80 && typeof o.title === 'string' && o.title.length <= 100 && SPECIES.includes(o.speciesId) && (o.mutation === null || MUTATIONS.includes(o.mutation)) && finite(o.minGrowth) && o.minGrowth >= 0 && o.minGrowth <= 100 && finite(o.rewardCredits) && o.rewardCredits >= 0 && o.rewardCredits <= 10000 && finite(o.rewardEssence) && o.rewardEssence >= 0 && o.rewardEssence <= 1000 && finite(o.rewardReputation) && o.rewardReputation >= 0 && o.rewardReputation <= 1000 && Number.isInteger(o.expiresDay) && o.expiresDay >= day - 1000 && o.expiresDay <= day + 1000;
}

function validProgress(raw, day) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !raw.upgrades || typeof raw.upgrades !== 'object' || !Array.isArray(raw.orders) || raw.orders.length > 3 || !Array.isArray(raw.claimed) || raw.claimed.length > MILESTONES.length || !finite(raw.reputation) || raw.reputation < 0 || raw.reputation > 1e7 || !Number.isInteger(raw.orderDay) || raw.orderDay < 1 || raw.orderDay > day || !Number.isInteger(raw.completedOrders) || raw.completedOrders < 0 || raw.completedOrders > 1e7) return false;
  if (UPGRADES.some((u) => !Number.isInteger(raw.upgrades[u.id]) || raw.upgrades[u.id] < 0 || raw.upgrades[u.id] > u.maxLevel)) return false;
  if (!raw.orders.every((o) => validOrder(o, day)) || new Set(raw.orders.map((o) => o.id)).size !== raw.orders.length) return false;
  return raw.claimed.every((id) => MILESTONES.some((m) => m.id === id)) && new Set(raw.claimed).size === raw.claimed.length;
}

export function ensureProgress(state, rawProgress = null) {
  if (!state || typeof state !== 'object') throw new TypeError('A game state is required');
  const day = dayOf(state);
  if (rawProgress !== null && validProgress(rawProgress, day)) {
    state.progress = structuredClone(rawProgress);
    return state.progress;
  }
  if (validProgress(state.progress, day)) return state.progress;
  state.progress = emptyProgress(day);
  return state.progress;
}
function progressView(state) {
  const day = dayOf(state);
  return validProgress(state.progress, day) ? state.progress : emptyProgress(day);
}

const seasonAt = (day) => ['Bloomtide', 'Suncrest', 'Dustfall', 'Longnight'][Math.floor((day - 1) / 8) % 4];
const weatherAt = (day) => ['Clear', 'Cloudburst', 'Heat shimmer', 'Dry wind', 'Soft overcast'][hashDay(day, 2) % 5];
const forecastAt = (day) => ['Clear', 'Cloudburst', 'Heat shimmer', 'Dry wind', 'Soft overcast'][hashDay(day + 1, 2) % 5];
const tempFor = (season, weather) => ({ Bloomtide: 22, Suncrest: 30, Dustfall: 19, Longnight: 12 }[season] + ({ Clear: 2, Cloudburst: -3, 'Heat shimmer': 7, 'Dry wind': 3, 'Soft overcast': -1 }[weather] ?? 0));

function weatherText(weather) {
  return ({ Clear: 'Clear skies add 2 growth and remove 3 moisture per day.', Cloudburst: 'Cloudburst adds 18 moisture and lowers temperature by 3°C per day.', 'Heat shimmer': 'Heat shimmer removes 8 moisture and 2 health per day; shade cloth reduces the temperature by 2°C per level.', 'Dry wind': 'Dry wind removes 7 moisture per day; shade cloth preserves 3 moisture per level.', 'Soft overcast': 'Soft overcast adds 1 growth and removes 1 moisture per day.' })[weather];
}
export function getEnvironment(state) {
  const day = dayOf(state); const season = seasonAt(day); const weather = weatherAt(day);
  const shade = progressView(state).upgrades.shade;
  return { season, weather, temperature: tempFor(season, weather) - (weather === 'Heat shimmer' ? shade * 2 : 0), forecast: { day: day + 1, weather: forecastAt(day), temperature: tempFor(seasonAt(day + 1), forecastAt(day)) - (forecastAt(day) === 'Heat shimmer' ? shade * 2 : 0) }, description: `${weatherText(weather)} Balanced moisture (20–75) adds 2 growth and restores 1 health; below 10 moisture costs 1 growth. Upgrades add their listed benefits. Effects apply once after each day advances.` };
}

export function getUpgradeCost(state, upgradeId) {
  const upgrade = UPGRADES.find((u) => u.id === upgradeId); if (!upgrade) return null;
  const p = ensureProgress(state); const level = p.upgrades[upgradeId];
  return level >= upgrade.maxLevel ? null : Math.round(upgrade.baseCost * (1 + level * 1.4));
}
export function buyUpgrade(state, upgradeId) {
  const upgrade = UPGRADES.find((u) => u.id === upgradeId); if (!upgrade) return { ok: false, message: 'That upgrade is invalid or already at its maximum level.' };
  const current = progressView(state); const level = current.upgrades[upgradeId];
  const cost = level >= upgrade.maxLevel ? null : Math.round(upgrade.baseCost * (1 + level * 1.4));
  if (cost === null) return { ok: false, message: 'That upgrade is invalid or already at its maximum level.' };
  if (!finite(state.credits) || state.credits < cost) return { ok: false, message: `You need ${cost} credits for this upgrade.` };
  const p = ensureProgress(state); state.credits -= cost; p.upgrades[upgradeId] += 1;
  return { ok: true, message: `${upgrade.name} upgraded to level ${p.upgrades[upgradeId]}.` };
}

function journal(state, message) { if (!Array.isArray(state.journal)) state.journal = []; state.journal.push(message); if (state.journal.length > 30) state.journal.splice(0, state.journal.length - 30); }
export function afterDay(state) {
  const p = ensureProgress(state); const day = dayOf(state); const env = getEnvironment(state); const levels = p.upgrades;
  if (Array.isArray(state.plots)) for (const plant of state.plots) {
    if (!plant || typeof plant !== 'object') continue;
    const heatLoss = env.weather === 'Heat shimmer' ? Math.max(0, 2 - levels.shade) : 0;
    const moistureDelta = ({ Clear: -3, Cloudburst: 18, 'Heat shimmer': -8, 'Dry wind': -7, 'Soft overcast': -1 }[env.weather]) + levels.shade * 3 + levels.soil * 2;
    plant.moisture = clamp((finite(plant.moisture) ? plant.moisture : 0) + moistureDelta, 0, 100);
    if (plant.moisture < 65) plant.moisture = Math.min(65, plant.moisture + levels.irrigation * 5);
    const growthDelta = (env.weather === 'Clear' ? 2 : env.weather === 'Soft overcast' ? 1 : 0) + levels.soil + (plant.moisture >= 20 && plant.moisture <= 75 ? 2 : plant.moisture < 10 ? -1 : 0);
    plant.growth = clamp((finite(plant.growth) ? plant.growth : 0) + growthDelta, 0, 100);
    const healthDelta = (plant.health < 100 && plant.moisture >= 20 && plant.moisture <= 75 ? 1 : 0) - heatLoss;
    plant.health = clamp((finite(plant.health) ? plant.health : 0) + healthDelta, 0, 100);
  }
  journal(state, `Day ${day}: ${env.weather} in ${env.season}. ${env.description}`);
  if (p.orderDay !== day || p.orders.some((o) => o.expiresDay < day)) {
    p.orders = p.orders.filter((order) => order.expiresDay >= day);
    const replacements = makeOrders(day, p.completedOrders);
    const occupiedSlots = new Set(p.orders.map((order) => order.id.match(/^order-\d+-([012])$/)?.[1]));
    for (const order of replacements) {
      if (p.orders.length >= 3) break;
      const slot = order.id.slice(-1);
      if (!occupiedSlots.has(slot) && !p.orders.some((existing) => existing.id === order.id)) {
        p.orders.push(order);
        occupiedSlots.add(slot);
      }
    }
    p.orderDay = day;
  }
  return { ok: true, message: `The day settles under ${env.weather}. ${env.description}` };
}

export function getOrders(state) { return ensureProgress(state).orders.filter((o) => o.expiresDay >= dayOf(state)); }
export function canFulfillOrder(state, orderId, plotIndex) {
  const order = getOrders(state).find((o) => o.id === orderId); const plant = state.plots?.[plotIndex];
  return !!order && !!plant && plant.speciesId === order.speciesId && (order.mutation === null || plant.mutation === order.mutation) && finite(plant.growth) && plant.growth >= order.minGrowth;
}
export function fulfillOrder(state, orderId, plotIndex) {
  const view = progressView(state); const order = view.orders.find((o) => o.id === orderId && o.expiresDay >= dayOf(state));
  if (!order) return { ok: false, message: 'That collector order is unavailable or expired.' };
  if (!Number.isInteger(plotIndex) || plotIndex < 0 || !state.plots?.[plotIndex]) return { ok: false, message: 'Select a planted plot to fulfill this order.' };
  const plant = state.plots[plotIndex];
  if (plant.speciesId !== order.speciesId || (order.mutation !== null && plant.mutation !== order.mutation) || !finite(plant.growth) || plant.growth < order.minGrowth) return { ok: false, message: 'This specimen does not meet the order requirements.' };
  const p = ensureProgress(state);
  state.plots[plotIndex] = null; state.credits = (finite(state.credits) ? state.credits : 0) + order.rewardCredits;
  state.essence = (finite(state.essence) ? state.essence : 0) + order.rewardEssence; state.sold = (Number.isInteger(state.sold) && state.sold >= 0 ? state.sold : 0) + 1;
  p.reputation += order.rewardReputation; p.completedOrders += 1; p.orders = p.orders.filter((o) => o.id !== order.id);
  journal(state, `Delivered ${order.title}: +${order.rewardCredits} credits, +${order.rewardEssence} essence, +${order.rewardReputation} reputation.`);
  return { ok: true, message: `Order delivered. Earned ${order.rewardCredits} credits, ${order.rewardEssence} essence and ${order.rewardReputation} reputation.` };
}

function nextPlantId(state) {
  const ids = new Set((state.plots || []).filter(Boolean).map((plant) => plant.id));
  let max = 0; for (const id of ids) { const m = typeof id === 'string' && id.match(/^clone-(\d+)$/); if (m) max = Math.max(max, Number(m[1])); }
  const sold = Number.isInteger(state.sold) && state.sold > 0 ? state.sold : 0;
  let n = max + 1; let id;
  do { id = `clone-${dayOf(state)}-${sold}-${n++}`; } while (ids.has(id));
  return id;
}
export function propagatePlant(state, parentIndex, targetIndex) {
  const p = progressView(state);
  if (p.upgrades.nursery < 1) return { ok: false, message: 'Upgrade the propagation bench to level 1 first.' };
  if (!Number.isInteger(parentIndex) || !Number.isInteger(targetIndex) || parentIndex < 0 || targetIndex < 0 || parentIndex === targetIndex || !Array.isArray(state.plots) || parentIndex >= state.plots.length || targetIndex >= state.plots.length) return { ok: false, message: 'Choose a parent and a different empty plot.' };
  const parent = state.plots[parentIndex];
  if (!parent || parent.growth < 80 || parent.health < 50) return { ok: false, message: 'The parent needs at least 80 growth and 50 health.' };
  if (state.plots[targetIndex] !== null) return { ok: false, message: 'The target plot must be empty.' };
  if (!finite(state.credits) || state.credits < 20) return { ok: false, message: 'Cloning costs 20 credits.' };
  ensureProgress(state); state.credits -= 20; parent.growth = clamp(parent.growth - 15, 0, 100);
  state.plots[targetIndex] = { id: nextPlantId(state), speciesId: parent.speciesId, mutation: parent.mutation, growth: 12, health: clamp(80 + (p.upgrades.nursery - 1) * 2, 0, 100), moisture: 45, age: 0 };
  return { ok: true, message: `Cloned a ${parent.mutation === 'normal' ? 'normal' : parent.mutation} ${parent.speciesId}; the parent used 15 growth and 20 credits.` };
}

function milestoneMet(state, id) {
  const discovered = new Set(Array.isArray(state.discovered) ? state.discovered : []);
  switch (id) {
    case 'first-sale': return (Number.isInteger(state.sold) && state.sold >= 1) || progressView(state).completedOrders >= 1;
    case 'six-species': return SPECIES.every((s) => [...discovered].some((d) => d.startsWith(`${s}:`)));
    case 'four-mutations': return MUTATIONS.every((m) => [...discovered].some((d) => d.endsWith(`:${m}`)));
    case 'expanded-farm': return Array.isArray(state.plots) && state.plots.length >= 16;
    case 'three-orders': return progressView(state).completedOrders >= 3;
    default: return false;
  }
}
export function getMilestones(state) {
  const p = ensureProgress(state); return MILESTONES.map((m) => ({ ...m, ready: milestoneMet(state, m.id), claimed: p.claimed.includes(m.id) }));
}
export function claimMilestone(state, id) {
  const p = progressView(state); const m = MILESTONES.find((item) => item.id === id);
  if (!m) return { ok: false, message: 'Unknown milestone.' };
  if (p.claimed.includes(id)) return { ok: false, message: 'This milestone reward was already claimed.' };
  if (!milestoneMet(state, id)) return { ok: false, message: 'This milestone is not complete yet.' };
  const committed = ensureProgress(state); committed.claimed.push(id); state.credits = (finite(state.credits) ? state.credits : 0) + m.rewardCredits; state.essence = (finite(state.essence) ? state.essence : 0) + m.rewardEssence;
  return { ok: true, message: `Milestone claimed: +${m.rewardCredits} credits and +${m.rewardEssence} essence.` };
}
