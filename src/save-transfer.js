import { restoreGame, serializeGame } from './simulation.js';
import { ensureProgress } from './progression.js';
import { ensureCombat } from './combat.js';

export const MAX_SAVE_BYTES = 512 * 1024;

const utf8Size = (text) => new TextEncoder().encode(text).byteLength;
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function decodeGardenSave(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Save data must be text.' };
  const content = text.replace(/^\uFEFF/, '');
  if (utf8Size(content) > MAX_SAVE_BYTES) return { ok: false, error: 'Save file is larger than the 512 KiB limit.' };

  let raw;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, error: 'Save file is not valid JSON.' };
  }
  const state = restoreGame(JSON.stringify(raw));
  if (!state) return { ok: false, error: 'Save file has an invalid garden or unsupported version.' };

  const warnings = [];
  if (Object.hasOwn(raw, 'progress')) {
    ensureProgress(state, raw.progress);
    if (!sameJson(state.progress, raw.progress)) warnings.push('Garden progression was invalid and has been reset to its defaults.');
  } else {
    ensureProgress(state);
  }
  if (Object.hasOwn(raw, 'combat')) {
    ensureCombat(state, raw.combat);
    const comparable = raw.combat && typeof raw.combat === 'object' ? { ...raw.combat } : raw.combat;
    if (comparable && typeof comparable === 'object' && comparable.status === 'active') comparable.status = 'paused';
    if (!sameJson(state.combat, comparable)) warnings.push('Defense and worm data was invalid and has been reset to its defaults.');
  } else {
    ensureCombat(state);
  }
  return { ok: true, state, warnings };
}

export function encodeGardenSave(state) {
  let text;
  try {
    text = serializeGame(state);
  } catch {
    throw new TypeError('Garden state could not be serialized.');
  }
  const decoded = decodeGardenSave(text);
  if (!decoded.ok) throw new TypeError(`Garden state cannot be exported: ${decoded.error}`);
  if (decoded.warnings.length) throw new TypeError(`Garden state cannot be exported: ${decoded.warnings.join(' ')}`);
  return serializeGame(decoded.state);
}
