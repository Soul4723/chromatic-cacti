/**
 * Chromatic Cacti — core nursery simulation, catalog, economy, and save validation.
 * Pure ES module with zero runtime dependencies and no browser globals.
 */

export const SPECIES = [
  {
    id: 'lophophora',
    name: 'Lophophora williamsii',
    common: 'Velvet Button',
    description: 'A spineless blue-green button cactus crowned with soft wool tufts and pastel blooms.',
    price: 18,
    growthRate: 28,
    matureValue: 48,
    form: 'button',
    color: '#7fae81',
  },
  {
    id: 'pachanoi',
    name: 'Trichocereus pachanoi',
    common: 'San Pedro Column',
    description: 'A stately upright desert column with smooth ribs and luminous night-blooming flowers.',
    price: 14,
    growthRate: 24,
    matureValue: 38,
    form: 'column',
    color: '#4d8a55',
  },
  {
    id: 'peruvianus',
    name: 'T. peruvianus',
    common: 'Peruvian Torch',
    description: 'A frosted powder-blue column with long amber spines that glow at dusk.',
    price: 22,
    growthRate: 21,
    matureValue: 56,
    form: 'column',
    color: '#5d8fae',
  },
  {
    id: 'bridgesii',
    name: 'T. bridgesii',
    common: 'Bolivian Spire',
    description: 'A slender, deeply ribbed spire prized for its resilient high-desert vigor.',
    price: 26,
    growthRate: 19,
    matureValue: 64,
    form: 'column',
    color: '#739d59',
  },
  {
    id: 'tbm',
    name: 'T. bridgesii monstrose (TBM)',
    common: 'Monstrose Totem',
    description: 'An irregular branching sculpture that stacks smooth geometric segments.',
    price: 34,
    growthRate: 16,
    matureValue: 86,
    form: 'monstrose',
    color: '#87a566',
  },
  {
    id: 'tbmc',
    name: 'T. bridgesii monstrose cristata (TBMC)',
    common: 'Cristata Coral',
    description: 'A rare fan-crested specimen of rippling emerald folds and coral-like ridges.',
    price: 45,
    growthRate: 14,
    matureValue: 115,
    form: 'crest',
    color: '#5f9d86',
  },
];

export const MUTATIONS = [
  {
    id: 'normal',
    name: 'Normal',
    cost: 0,
    multiplier: 1,
    description: 'Classic nursery expression with true-to-species ribs and desert tones.',
  },
  {
    id: 'variegated',
    name: 'Variegated',
    cost: 2,
    multiplier: 1.75,
    description: 'Sunlit ribbons of gold and mint marbling across the cactus ribs.',
  },
  {
    id: 'crested',
    name: 'Crested',
    cost: 3,
    multiplier: 2.25,
    description: 'Fasciated meristem growth that unfurls into an undulating desert fan.',
  },
  {
    id: 'variegated-crested',
    name: 'Variegated Crested',
    cost: 6,
    multiplier: 3.2,
    description: 'A prized dual expression uniting fan-crested sculpture with golden variegation.',
  },
];

export const MAX_PLOTS = 24;
export const MAX_WATER = 30;
export const DAILY_WATER_REPLENISH = 4;
export const FEED_COST = 5;
export const MUTATION_COST = 2;
export const EXPAND_COST = 60;
export const EXPAND_STEP = 4;
export const MAX_JOURNAL = 30;

const SPECIES_BY_ID = new Map(SPECIES.map((entry) => [entry.id, entry]));
const MUTATION_BY_ID = new Map(MUTATIONS.map((entry) => [entry.id, entry]));
const VALID_DISCOVERY_KEYS = new Set(
  SPECIES.flatMap((species) => MUTATIONS.map((mutation) => `${species.id}:${mutation.id}`))
);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addJournal(state, message) {
  if (!Array.isArray(state.journal)) state.journal = [];
  state.journal.push(message);
  if (state.journal.length > MAX_JOURNAL) {
    state.journal.splice(0, state.journal.length - MAX_JOURNAL);
  }
}

function recordDiscovery(state, speciesId, mutationId) {
  const key = `${speciesId}:${mutationId}`;
  if (!VALID_DISCOVERY_KEYS.has(key)) return;
  if (!Array.isArray(state.discovered)) state.discovered = [];
  if (!state.discovered.includes(key)) {
    state.discovered.push(key);
  }
}

function nextPlantId(state) {
  const existingIds = new Set();
  let maxNumber = 0;
  if (Array.isArray(state.plots)) {
    for (const plant of state.plots) {
      if (plant && typeof plant.id === 'string') {
        existingIds.add(plant.id);
        const match = plant.id.match(/^plant-(\d+)$/);
        if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
      }
    }
  }
  let candidate = maxNumber + 1;
  while (existingIds.has(`plant-${candidate}`)) {
    candidate += 1;
  }
  return `plant-${candidate}`;
}

function isValidStateContainer(state) {
  return Boolean(
    state &&
      typeof state === 'object' &&
      Array.isArray(state.plots) &&
      isFiniteNumber(state.credits) &&
      isFiniteNumber(state.water) &&
      isFiniteNumber(state.essence) &&
      Number.isInteger(state.day)
  );
}

function isValidPlotIndex(state, index) {
  return Number.isInteger(index) && index >= 0 && index < state.plots.length;
}

export function createGame() {
  const starterPlants = [
    {
      id: 'plant-1',
      speciesId: 'lophophora',
      mutation: 'normal',
      growth: 100,
      health: 92,
      moisture: 58,
      age: 8,
    },
    {
      id: 'plant-2',
      speciesId: 'pachanoi',
      mutation: 'normal',
      growth: 68,
      health: 88,
      moisture: 52,
      age: 5,
    },
    {
      id: 'plant-3',
      speciesId: 'peruvianus',
      mutation: 'normal',
      growth: 42,
      health: 86,
      moisture: 48,
      age: 3,
    },
    {
      id: 'plant-4',
      speciesId: 'bridgesii',
      mutation: 'normal',
      growth: 22,
      health: 84,
      moisture: 44,
      age: 1,
    },
  ];

  const plots = Array.from({ length: 12 }, (_, index) => starterPlants[index] || null);
  const discovered = starterPlants.map((plant) => `${plant.speciesId}:${plant.mutation}`);

  return {
    version: 1,
    day: 1,
    credits: 75,
    water: 12,
    essence: 2,
    plots,
    discovered,
    journal: [
      'Day 1: Welcome to Chromatic Cacti. Four desert specimens are established in your nursery.',
    ],
    sold: 0,
  };
}

export function getPlantValue(plant) {
  if (!plant || typeof plant !== 'object') return 0;
  const species = SPECIES_BY_ID.get(plant.speciesId);
  if (!species) return 0;
  const mutation = MUTATION_BY_ID.get(plant.mutation) || MUTATION_BY_ID.get('normal');
  const growth = isFiniteNumber(plant.growth) ? clamp(plant.growth, 0, 100) : 100;
  const growthScale = 0.3 + 0.7 * (growth / 100);
  return Math.max(1, Math.round(species.matureValue * mutation.multiplier * growthScale));
}

export function plantSeed(state, index, speciesId) {
  if (!isValidStateContainer(state)) {
    return { ok: false, message: 'Invalid garden state.' };
  }
  if (!isValidPlotIndex(state, index)) {
    return { ok: false, message: 'Choose a valid garden plot.' };
  }
  if (state.plots[index] !== null) {
    return { ok: false, message: 'That plot already holds a growing cactus.' };
  }
  const species = typeof speciesId === 'string' ? SPECIES_BY_ID.get(speciesId) : undefined;
  if (!species) {
    return { ok: false, message: 'Select a valid cactus seed from the nursery.' };
  }
  if (state.credits < species.price) {
    return {
      ok: false,
      message: `Not enough credits. ${species.common} seeds cost ${species.price} credits.`,
    };
  }

  state.credits -= species.price;
  const plant = {
    id: nextPlantId(state),
    speciesId: species.id,
    mutation: 'normal',
    growth: 15,
    health: 90,
    moisture: 55,
    age: 0,
  };
  state.plots[index] = plant;
  recordDiscovery(state, species.id, 'normal');
  const message = `Planted ${species.common} in plot ${index + 1} for ${species.price} credits.`;
  addJournal(state, `Day ${state.day}: ${message}`);
  return { ok: true, message };
}

export function waterPlant(state, index) {
  if (!isValidStateContainer(state)) {
    return { ok: false, message: 'Invalid garden state.' };
  }
  if (!isValidPlotIndex(state, index)) {
    return { ok: false, message: 'Choose a valid garden plot.' };
  }
  const plant = state.plots[index];
  if (!plant || typeof plant !== 'object') {
    return { ok: false, message: 'Select a planted plot to water.' };
  }
  if (state.water < 1) {
    return { ok: false, message: 'Your water reservoir is empty. Advance the day to collect more.' };
  }

  state.water -= 1;
  const previousMoisture = isFiniteNumber(plant.moisture) ? clamp(plant.moisture, 0, 100) : 50;
  plant.moisture = clamp(previousMoisture + 28, 0, 100);
  const currentHealth = isFiniteNumber(plant.health) ? clamp(plant.health, 0, 100) : 80;
  if (previousMoisture > 88) {
    plant.health = clamp(currentHealth - 4, 0, 100);
  } else {
    plant.health = clamp(currentHealth + 4, 0, 100);
  }

  const species = SPECIES_BY_ID.get(plant.speciesId);
  const label = species ? species.common : 'cactus';
  const message =
    previousMoisture > 88
      ? `Watered ${label}, though the soil is now very saturated (${plant.moisture}% moisture).`
      : `Watered ${label} (${plant.moisture}% moisture).`;
  addJournal(state, `Day ${state.day}: ${message}`);
  return { ok: true, message };
}

export function feedPlant(state, index) {
  if (!isValidStateContainer(state)) {
    return { ok: false, message: 'Invalid garden state.' };
  }
  if (!isValidPlotIndex(state, index)) {
    return { ok: false, message: 'Choose a valid garden plot.' };
  }
  const plant = state.plots[index];
  if (!plant || typeof plant !== 'object') {
    return { ok: false, message: 'Select a planted plot to feed.' };
  }
  if (state.credits < FEED_COST) {
    return { ok: false, message: `Mineral feed costs ${FEED_COST} credits.` };
  }

  state.credits -= FEED_COST;
  const currentGrowth = isFiniteNumber(plant.growth) ? clamp(plant.growth, 0, 100) : 0;
  const currentHealth = isFiniteNumber(plant.health) ? clamp(plant.health, 0, 100) : 80;
  plant.growth = clamp(currentGrowth + 14, 0, 100);
  plant.health = clamp(currentHealth + 6, 0, 100);

  const species = SPECIES_BY_ID.get(plant.speciesId);
  const label = species ? species.common : 'cactus';
  const message = `Fed ${label} mineral nutrients (${plant.growth}% growth, ${plant.health}% health).`;
  addJournal(state, `Day ${state.day}: ${message}`);
  return { ok: true, message };
}

export function mutatePlant(state, index, mutationId) {
  if (!isValidStateContainer(state)) {
    return { ok: false, message: 'Invalid garden state.' };
  }
  if (!isValidPlotIndex(state, index)) {
    return { ok: false, message: 'Choose a valid garden plot.' };
  }
  const plant = state.plots[index];
  if (!plant || typeof plant !== 'object') {
    return { ok: false, message: 'Select a planted specimen to mutate.' };
  }
  if (typeof mutationId !== 'string' || mutationId === 'normal' || !MUTATION_BY_ID.has(mutationId)) {
    return { ok: false, message: 'Choose a valid chromatic mutation form.' };
  }
  const mutation = MUTATION_BY_ID.get(mutationId);
  if (plant.mutation === mutationId) {
    return { ok: false, message: `This specimen already expresses the ${mutation.name} form.` };
  }
  if (!isFiniteNumber(plant.growth) || plant.growth < 40) {
    return { ok: false, message: 'Specimens must reach at least 40% growth before mutating.' };
  }
  if (state.essence < mutation.cost) {
    return { ok: false, message: `${mutation.name} requires ${mutation.cost} essence.` };
  }

  state.essence -= mutation.cost;
  plant.mutation = mutation.id;
  recordDiscovery(state, plant.speciesId, mutation.id);

  const species = SPECIES_BY_ID.get(plant.speciesId);
  const label = species ? species.common : 'specimen';
  const message = `${label} shifted into the ${mutation.name} form (${mutation.multiplier}× value).`;
  addJournal(state, `Day ${state.day}: ${message}`);
  return { ok: true, message };
}

export function sellPlant(state, index) {
  if (!isValidStateContainer(state)) {
    return { ok: false, message: 'Invalid garden state.' };
  }
  if (!isValidPlotIndex(state, index)) {
    return { ok: false, message: 'Choose a valid garden plot.' };
  }
  const plant = state.plots[index];
  if (!plant || typeof plant !== 'object') {
    return { ok: false, message: 'Select a mature cactus to sell.' };
  }
  if (!isFiniteNumber(plant.growth) || plant.growth < 100) {
    return { ok: false, message: 'Only mature specimens at 100% growth are ready for sale.' };
  }

  const value = getPlantValue(plant);
  const essenceGain =
    plant.mutation === 'variegated-crested'
      ? 4
      : plant.mutation === 'variegated' || plant.mutation === 'crested'
        ? 3
        : 2;

  recordDiscovery(state, plant.speciesId, plant.mutation);
  const species = SPECIES_BY_ID.get(plant.speciesId);
  const label = species ? species.common : 'specimen';

  state.plots[index] = null;
  state.credits += value;
  state.essence += essenceGain;
  state.sold = (Number.isInteger(state.sold) && state.sold >= 0 ? state.sold : 0) + 1;

  const message = `Sold mature ${label} for ${value} credits and ${essenceGain} essence.`;
  addJournal(state, `Day ${state.day}: ${message}`);
  return { ok: true, message };
}

export function expandFarm(state) {
  if (!isValidStateContainer(state)) {
    return { ok: false, message: 'Invalid garden state.' };
  }
  if (state.plots.length >= MAX_PLOTS) {
    return { ok: false, message: `Your garden is already at the maximum of ${MAX_PLOTS} plots.` };
  }
  if (state.credits < EXPAND_COST) {
    return { ok: false, message: `Expanding the garden costs ${EXPAND_COST} credits.` };
  }

  const added = Math.min(EXPAND_STEP, MAX_PLOTS - state.plots.length);
  state.credits -= EXPAND_COST;
  for (let i = 0; i < added; i += 1) {
    state.plots.push(null);
  }

  const message = `Expanded the nursery by ${added} plots (${state.plots.length} total).`;
  addJournal(state, `Day ${state.day}: ${message}`);
  return { ok: true, message };
}

export function advanceDay(state) {
  if (!isValidStateContainer(state)) {
    return { ok: false, message: 'Invalid garden state.' };
  }

  state.day += 1;
  state.water = clamp(state.water + DAILY_WATER_REPLENISH, 0, MAX_WATER);

  // A failed raid or an overenthusiastic spending spree must not end a save.
  // Only an entirely empty nursery qualifies, so growing crops remain the income source.
  const seedPrice = Math.min(...SPECIES.map((species) => species.price));
  const recoveryCredits = state.plots.every((plant) => plant === null)
    ? Math.max(0, seedPrice - state.credits)
    : 0;
  state.credits += recoveryCredits;

  let maturedCount = 0;
  let stressedCount = 0;

  for (const plant of state.plots) {
    if (!plant || typeof plant !== 'object') continue;
    const species = SPECIES_BY_ID.get(plant.speciesId) || SPECIES[0];
    const beforeGrowth = isFiniteNumber(plant.growth) ? clamp(plant.growth, 0, 100) : 0;
    const beforeHealth = isFiniteNumber(plant.health) ? clamp(plant.health, 0, 100) : 80;
    const beforeMoisture = isFiniteNumber(plant.moisture) ? clamp(plant.moisture, 0, 100) : 50;

    let healthDelta = 0;
    let growthDelta = 0;

    if (beforeMoisture < 15) {
      // Drought stress: growth slows sharply and health drops until watered.
      healthDelta = -10;
      growthDelta = Math.max(2, Math.round(species.growthRate * 0.25));
      stressedCount += 1;
    } else if (beforeMoisture > 85) {
      // Overwatering stress: saturated roots lose health and grow sluggishly.
      healthDelta = -8;
      growthDelta = Math.max(3, Math.round(species.growthRate * 0.45));
      stressedCount += 1;
    } else if (beforeMoisture >= 25 && beforeMoisture <= 75) {
      // Sweet spot: plants recover health and grow briskly.
      healthDelta = 6;
      const healthBonus = beforeHealth >= 75 ? 3 : beforeHealth >= 40 ? 1 : -2;
      growthDelta = Math.max(4, species.growthRate + healthBonus);
    } else {
      // Mildly dry or damp margins: gentle recovery and steady growth.
      healthDelta = 2;
      growthDelta = Math.max(4, Math.round(species.growthRate * 0.8));
    }

    plant.health = clamp(beforeHealth + healthDelta, 0, 100);
    plant.growth = clamp(beforeGrowth + growthDelta, 0, 100);
    plant.moisture = clamp(beforeMoisture - 12, 0, 100);
    plant.age = (Number.isInteger(plant.age) && plant.age >= 0 ? plant.age : 0) + 1;

    if (beforeGrowth < 100 && plant.growth >= 100) {
      maturedCount += 1;
    }
    recordDiscovery(state, plant.speciesId, plant.mutation);
  }

  let message = `Day ${state.day} dawns. Reservoir replenished (+${DAILY_WATER_REPLENISH} water, ${state.water}/${MAX_WATER}).`;
  if (recoveryCredits > 0) {
    message += ` Nursery recovery grant: +${recoveryCredits} credits. Plant a San Pedro seed in an empty plot to start growing again.`;
  }
  if (maturedCount > 0) {
    message += ` ${maturedCount} specimen${maturedCount === 1 ? ' is' : 's are'} now fully mature!`;
  }
  if (stressedCount > 0) {
    message += ` ${stressedCount} cactus plot${stressedCount === 1 ? ' needs' : 's need'} moisture attention.`;
  }

  addJournal(state, message);
  return { ok: true, message };
}

function isValidPlant(raw, seenIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0 || raw.id.length > 80) return false;
  if (seenIds.has(raw.id)) return false;
  if (typeof raw.speciesId !== 'string' || !SPECIES_BY_ID.has(raw.speciesId)) return false;
  if (typeof raw.mutation !== 'string' || !MUTATION_BY_ID.has(raw.mutation)) return false;
  if (!isFiniteNumber(raw.growth) || raw.growth < 0 || raw.growth > 100) return false;
  if (!isFiniteNumber(raw.health) || raw.health < 0 || raw.health > 100) return false;
  if (!isFiniteNumber(raw.moisture) || raw.moisture < 0 || raw.moisture > 100) return false;
  if (!Number.isInteger(raw.age) || raw.age < 0 || raw.age > 1_000_000) return false;
  seenIds.add(raw.id);
  return true;
}

export function serializeGame(state) {
  return JSON.stringify(state);
}

export function restoreGame(json) {
  if (typeof json !== 'string' || json.trim().length === 0) return null;

  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.version !== 1) return null;
  if (!Number.isInteger(raw.day) || raw.day < 1 || raw.day > 1_000_000) return null;
  if (!isFiniteNumber(raw.credits) || raw.credits < 0 || raw.credits > 1e9) return null;
  if (!isFiniteNumber(raw.water) || raw.water < 0 || raw.water > MAX_WATER) return null;
  if (!isFiniteNumber(raw.essence) || raw.essence < 0 || raw.essence > 1e9) return null;
  if (!Number.isInteger(raw.sold) || raw.sold < 0 || raw.sold > 1e9) return null;

  if (!Array.isArray(raw.plots) || raw.plots.length < 1 || raw.plots.length > MAX_PLOTS) {
    return null;
  }

  const seenIds = new Set();
  const plots = [];
  for (const item of raw.plots) {
    if (item === null) {
      plots.push(null);
      continue;
    }
    if (!isValidPlant(item, seenIds)) {
      return null;
    }
    plots.push({
      id: item.id,
      speciesId: item.speciesId,
      mutation: item.mutation,
      growth: item.growth,
      health: item.health,
      moisture: item.moisture,
      age: item.age,
    });
  }

  if (!Array.isArray(raw.discovered) || raw.discovered.length > VALID_DISCOVERY_KEYS.size) {
    return null;
  }
  const discovered = [];
  const seenDiscoveries = new Set();
  for (const key of raw.discovered) {
    if (typeof key !== 'string' || !VALID_DISCOVERY_KEYS.has(key)) return null;
    if (!seenDiscoveries.has(key)) {
      seenDiscoveries.add(key);
      discovered.push(key);
    }
  }

  if (!Array.isArray(raw.journal) || raw.journal.length > MAX_JOURNAL) {
    return null;
  }
  const journal = [];
  for (const entry of raw.journal) {
    if (typeof entry !== 'string' || entry.length > 500) return null;
    journal.push(entry);
  }

  const restored = {
    version: 1,
    day: raw.day,
    credits: raw.credits,
    water: raw.water,
    essence: raw.essence,
    plots,
    discovered,
    journal,
    sold: raw.sold,
  };

  if (raw.progress && typeof raw.progress === 'object' && !Array.isArray(raw.progress)) {
    restored.progress = structuredClone(raw.progress);
  }

  return restored;
}
