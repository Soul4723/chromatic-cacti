const MAX_VOICES = 12;
const MASTER_LEVEL = 0.48;

const TUNES = {
  // Tone: frequency, duration, waveform, optional end pitch, delay, level.
  water: { tones: [[520, 0.13, 'sine', 860], [780, 0.18, 'sine', 1040, 0.075, 0.7]], noise: [0.045, 0.13, 1400] },
  feed: { tones: [[196, 0.16, 'triangle', 261], [392, 0.22, 'sine', 392, 0.065]], noise: [0.045, 0.09, 380] },
  plant: { tones: [[392, 0.1, 'sine'], [523, 0.16, 'triangle'], [659, 0.23, 'sine']] },
  sell: { tones: [[1047, 0.12, 'sine'], [1319, 0.22, 'sine', 1319, 0.07, 0.75]], noise: [0.015, 0.06, 2300] },
  order: { tones: [[523, 0.16, 'sine'], [659, 0.18, 'sine', 659, 0.08], [784, 0.22, 'sine', 784, 0.16], [1047, 0.32, 'sine', 1047, 0.25, 0.8]] },
  upgrade: { tones: [[262, 0.15, 'triangle'], [392, 0.18, 'sine', 392, 0.07], [523, 0.3, 'sine', 523, 0.14], [659, 0.3, 'sine', 659, 0.14, 0.65]] },
  mutate: { tones: [[261, 0.12, 'sine'], [392, 0.14, 'triangle'], [587, 0.25, 'sine']] },
  worm: { tones: [[440, 0.12, 'sine', 660], [880, 0.19, 'sine', 1100, 0.075, 0.7]] },
  stomp: { tones: [[130, 0.2, 'sine', 48], [196, 0.1, 'triangle', 80, 0, 0.7]], noise: [0.15, 0.15, 300] },
  shell: { tones: [[245, 0.12, 'triangle'], [330, 0.18, 'sine']], noise: [0.045, 0.13, 700] },
  spray: { tones: [[740, 0.12, 'sine', 390, 0, 0.5]], noise: [0.11, 0.23, 1800] },
  pest: { tones: [[660, 0.11, 'sine', 180], [988, 0.2, 'sine', 1319, 0.045, 0.65]], noise: [0.065, 0.08, 700] },
  miss: { tones: [[240, 0.13, 'sine', 170, 0, 0.4]], noise: [0.035, 0.12, 700] },
  wave: { tones: [[262, 0.12, 'triangle'], [392, 0.22, 'sine', 392, 0.1]], noise: [0.035, 0.14, 240] },
  reload: { tones: [[330, 0.09, 'triangle'], [440, 0.16, 'sine']] },
  boss: { tones: [[147, 0.3, 'sine', 110], [220, 0.3, 'triangle', 165, 0.16, 0.6], [147, 0.4, 'sine', 147, 0.32]], noise: [0.07, 0.3, 300] },
  clear: { tones: [[523, 0.12, 'sine'], [659, 0.12, 'sine'], [784, 0.28, 'triangle']] },
  level: { tones: [[392, 0.13, 'sine'], [523, 0.13, 'sine'], [659, 0.13, 'triangle'], [784, 0.32, 'sine']] },
  defeat: { tones: [[392, 0.14, 'sine'], [330, 0.18, 'triangle'], [262, 0.3, 'sine']] },
};

const EVENT_TUNE = {
  water: 'water', water_plop: 'water', feed: 'feed', feed_soil: 'feed',
  plant: 'plant', seed_plant: 'plant', sell: 'sell', mutate: 'mutate',
  coins: 'sell', order: 'order', order_complete: 'order', upgrade: 'upgrade',
  worm: 'worm', worm_pickup: 'worm', stomp: 'stomp', shell: 'shell', shell_tap: 'shell',
  spray: 'spray', pest: 'pest', pest_pop: 'pest', reload: 'reload',
  boss: 'boss', boss_warning: 'boss', waveclear: 'clear', wave_clear: 'clear',
  levelup: 'level', level_up: 'level', defeat: 'defeat',
  miss: 'miss', wave: 'wave', wave_start: 'wave', stomp_hit: 'stomp',
  spray_hit: 'spray', pest_defeated: 'pest', worm_collect: 'worm',
  wave_cleared: 'clear', boss_arrives: 'boss',
};

export function createGardenAudio() {
  let context = null;
  let master = null;
  let limiter = null;
  let ambient = null;
  let ambientNodes = [];
  let ambientGains = [];
  let ambientMotion = [];
  let noiseBuffer = null;
  let enabled = false;
  let disposed = false;
  let enableRevision = 0;
  let mood = { combat: false, boss: false, weather: 'Clear' };
  const voices = [];

  function createContext() {
    if (context || disposed) return context;
    try {
      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextCtor) return null;
      context = new AudioContextCtor();
      master = context.createGain();
      master.gain.value = 0;
      limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.18;
      master.connect(limiter);
      limiter.connect(context.destination);
      return context;
    } catch {
      context = null;
      master = null;
      return null;
    }
  }

  function ramp(param, value, seconds = 0.12) {
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function clearVoice(voice) {
    for (const source of voice.sources) {
      try { source.onended = null; source.stop(); } catch { /* already ended */ }
    }
    for (const node of voice.nodes) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    const index = voices.indexOf(voice);
    if (index >= 0) voices.splice(index, 1);
  }

  function beginVoice() {
    if (voices.length >= MAX_VOICES) clearVoice(voices[0]);
    const voice = { nodes: [], sources: [], remaining: 0 };
    voices.push(voice);
    return voice;
  }

  function addSource(voice, source, nodes = []) {
    voice.sources.push(source);
    voice.nodes.push(source, ...nodes);
    voice.remaining += 1;
    source.onended = () => {
      voice.remaining -= 1;
      if (voice.remaining === 0) {
        for (const node of voice.nodes) { try { node.disconnect(); } catch { /* already disconnected */ } }
        const index = voices.indexOf(voice);
        if (index >= 0) voices.splice(index, 1);
      }
    };
  }

  function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.35), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = (Math.random() * 2 - 1) * 0.65;
    return noiseBuffer;
  }

  function addTone(voice, frequency, duration, type, at, scale, end = frequency) {
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (end !== frequency) osc.frequency.exponentialRampToValueAtTime(end, at + duration * 0.8);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(0.065 * scale, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp);
    amp.connect(master);
    addSource(voice, osc, [amp]);
    osc.start(at);
    osc.stop(at + duration + 0.015);
  }

  function addNoise(voice, definition, at, scale) {
    const [level, duration, cutoff] = definition;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const amp = context.createGain();
    source.buffer = getNoiseBuffer();
    filter.type = cutoff < 500 ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(cutoff, at);
    filter.Q.value = 0.7;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(level * scale, at + Math.min(0.025, duration / 4));
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    addSource(voice, source, [filter, amp]);
    source.start(at);
    source.stop(at + duration + 0.015);
  }

  function play(event, detail = {}) {
    if (!enabled || disposed || !context || context.state === 'closed') return;
    const tune = TUNES[EVENT_TUNE[event]];
    if (!tune) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    try {
      const voice = beginVoice();
      const at = context.currentTime + 0.006;
      const scale = EVENT_TUNE[event] === 'boss' ? 0.8 : 1;
      const pitch = 2 ** ((Math.random() * 24 - 12) / 1200);
      tune.tones.forEach(([frequency, duration, type, end = frequency, delay, level = 1], index) => addTone(voice, frequency * pitch, duration, type, at + (delay ?? index * 0.045), scale * level, end * pitch));
      if (tune.noise) addNoise(voice, tune.noise, at, scale);
      if (detail.kills > 0 && EVENT_TUNE[event] !== 'pest') {
        addTone(voice, 988 * pitch, 0.18, 'sine', at + 0.035, 0.6, 1319 * pitch);
      }
    } catch {
      // WebAudio can become unavailable when a tab or device is shutting down.
    }
  }

  function updateAmbient() {
    if (!ambient || !context || !enabled) return;
    const presence = mood.boss ? 0.025 : mood.combat ? 0.028 : 0.045;
    ramp(ambient.gain, presence, 0.8);
    const base = mood.boss ? 110 : mood.combat ? 130.81 : mood.weather !== 'Clear' ? 146.83 : 130.81;
    ambientNodes.forEach((osc, index) => {
      const ratios = [1, 2, mood.boss ? 2.4 : 2.5, 3];
      const now = context.currentTime;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setTargetAtTime(base * ratios[index], now, 1.4);
    });
  }

  function startAmbient() {
    if (ambient || !context || !master) return;
    ambient = context.createGain();
    ambient.gain.value = 0;
    ambient.connect(master);
    ambientGains = [];
    ambientNodes = [1, 2, 2.5, 3].map((ratio, index) => {
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = 130.81 * ratio;
      amp.gain.value = [0.35, 0.14, 0.09, 0.07][index];
      // Slow, overlapping breaths keep the chord gently moving without timers.
      const breath = context.createOscillator();
      const depth = context.createGain();
      breath.frequency.value = 0.055 + index * 0.013;
      depth.gain.value = amp.gain.value * 0.24;
      breath.connect(depth); depth.connect(amp.gain); breath.start();
      ambientMotion.push(breath, depth);
      ambientGains.push(amp);
      osc.connect(amp);
      amp.connect(ambient);
      osc.start();
      return osc;
    });
    updateAmbient();
  }

  async function setEnabled(value) {
    if (disposed) return false;
    const revision = ++enableRevision;
    enabled = Boolean(value);
    if (!enabled) {
      if (master && context && context.state !== 'closed') {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(0, context.currentTime);
      }
      for (const voice of [...voices]) clearVoice(voice);
      return true;
    }
    if (!createContext()) { enabled = false; return false; }
    try {
      await context.resume();
      if (disposed || !enabled || revision !== enableRevision || !master) return false;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0, context.currentTime);
      master.gain.linearRampToValueAtTime(MASTER_LEVEL, context.currentTime + 0.16);
      startAmbient();
      updateAmbient();
      return true;
    } catch {
      enabled = false;
      return false;
    }
  }

  function setMood(next = {}) {
    if (disposed) return;
    mood = {
      combat: Boolean(next.combat ?? mood.combat),
      boss: Boolean(next.boss ?? mood.boss),
      weather: String(next.weather ?? mood.weather),
    };
    updateAmbient();
  }

  function suspend() {
    if (!context || context.state === 'closed') return Promise.resolve();
    for (const voice of [...voices]) clearVoice(voice);
    return context.suspend().catch(() => {});
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    enabled = false;
    for (const voice of [...voices]) clearVoice(voice);
    for (const osc of ambientNodes) { try { osc.stop(); osc.disconnect(); } catch { /* already stopped */ } }
    for (const gain of ambientGains) { try { gain.disconnect(); } catch { /* already disconnected */ } }
    for (const node of ambientMotion) { try { node.stop?.(); node.disconnect(); } catch { /* already stopped */ } }
    ambientNodes = [];
    ambientGains = [];
    ambientMotion = [];
    try { ambient?.disconnect(); master?.disconnect(); limiter?.disconnect(); } catch { /* already disconnected */ }
    if (context && context.state !== 'closed') context.close().catch(() => {});
    ambient = null;
    master = null;
    limiter = null;
    context = null;
  }

  return { setEnabled, play, setMood, suspend, dispose };
}
