// Web Audio layer: CC0 sample playback on a shared compressor bus, driven by sim events.

const SOUNDS = {
  mine: { gain: 0.75, throttle: 70 },
  collect: { gain: 0.55, throttle: 60 },
  move: { gain: 0.16, throttle: 90 },
  place: { gain: 0.6, throttle: 70 },
  spawn: { gain: 0.6, throttle: 120 },
  death: { gain: 0.7, throttle: 120 },
  unlock: { gain: 0.8, throttle: 400 },
  grow: { gain: 0.65, throttle: 400 },
  error: { gain: 0.45, throttle: 250 },
  click: { gain: 0.4, throttle: 40 },
  ambient: { gain: 0.14, throttle: 0 }
};

const EVENT_MAP = {
  mined: ['mine'],
  mine: ['mine'],
  collected: ['collect'],
  moved: ['move'],
  move: ['move'],
  placed: ['place'],
  place: ['place'],
  spawned: ['spawn'],
  spawn: ['spawn'],
  died: ['death'],
  death: ['death'],
  dead: ['death'],
  bought: ['unlock'],
  unlocked: ['unlock'],
  grow: ['grow'],
  grew: ['grow'],
  error: ['error'],
  click: ['click']
};

const COLLECT_DELAY_MS = 110;
const MUTE_KEY = 'helloMiner.muted';
const RATE_SPREAD = 0.08;

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function writeMuted(value) {
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch (e) {
    /* storage unavailable */
  }
}

export function createAudio(opts = {}) {
  const base = opts.base || 'assets/sounds/';
  const names = Object.keys(SOUNDS);

  let ctx = null;
  let master = null;
  let compressor = null;
  let sfxBus = null;
  let ambientBus = null;
  let ambientSource = null;
  let unlocked = false;
  let muted = readMuted();

  const buffers = new Map();
  const pending = new Map();
  const failed = new Map();
  const lastPlayed = new Map();

  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.22;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    ambientBus = ctx.createGain();
    ambientBus.gain.value = 0;
    sfxBus.connect(compressor);
    ambientBus.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);
    return ctx;
  }

  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (pending.has(name)) return pending.get(name);
    if (!ensureContext()) return Promise.resolve(null);
    const url = base + name + '.mp3';
    const p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.status + ' ' + url);
        return res.arrayBuffer();
      })
      .then((data) => new Promise((resolve, reject) => {
        const done = ctx.decodeAudioData(data, resolve, reject);
        if (done && typeof done.then === 'function') done.then(resolve, reject);
      }))
      .then((buf) => {
        buffers.set(name, buf);
        pending.delete(name);
        return buf;
      })
      .catch((err) => {
        pending.delete(name);
        failed.set(name, String(err && err.message ? err.message : err));
        return null;
      });
    pending.set(name, p);
    return p;
  }

  function preload() {
    return Promise.all(names.map(load));
  }

  function start(buffer, settings, options, bus, when) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const spread = 1 + (Math.random() * 2 - 1) * RATE_SPREAD;
    src.playbackRate.value = (options.rate || 1) * spread;
    const g = ctx.createGain();
    g.gain.value = settings.gain * (options.gain === undefined ? 1 : options.gain);
    let tail = g;
    if (typeof options.pan === 'number' && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      g.connect(panner);
      tail = panner;
    }
    src.connect(g);
    tail.connect(bus);
    src.start(when === undefined ? ctx.currentTime : when);
    return src;
  }

  function play(name, options = {}) {
    const settings = SOUNDS[name];
    if (!settings || muted || !ensureContext()) return Promise.resolve(false);
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (settings.throttle && now - (lastPlayed.get(name) || -1e9) < settings.throttle) {
      return Promise.resolve(false);
    }
    lastPlayed.set(name, now);
    const buf = buffers.get(name);
    if (buf) {
      const delay = options.delay ? ctx.currentTime + options.delay / 1000 : undefined;
      start(buf, settings, options, sfxBus, delay);
      return Promise.resolve(true);
    }
    return load(name).then((late) => {
      if (!late || muted) return false;
      start(late, settings, options, sfxBus);
      return true;
    });
  }

  function startAmbient() {
    if (ambientSource || !ctx) return;
    const buf = buffers.get('ambient');
    if (!buf) {
      load('ambient').then(() => {
        if (unlocked) startAmbient();
      });
      return;
    }
    ambientSource = ctx.createBufferSource();
    ambientSource.buffer = buf;
    ambientSource.loop = true;
    ambientSource.connect(ambientBus);
    ambientSource.start();
    ambientBus.gain.cancelScheduledValues(ctx.currentTime);
    ambientBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    ambientBus.gain.linearRampToValueAtTime(SOUNDS.ambient.gain, ctx.currentTime + 2.5);
  }

  function unlock() {
    if (!ensureContext()) return Promise.resolve(false);
    unlocked = true;
    const resumed = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    return resumed
      .then(() => preload())
      .then(() => {
        startAmbient();
        return true;
      })
      .catch(() => false);
  }

  function handleEvents(events) {
    if (!events || !events.length) return;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev) continue;
      const targets = EVENT_MAP[ev.type];
      if (!targets) continue;
      for (let j = 0; j < targets.length; j++) {
        const name = targets[j];
        if (name === 'collect' && ev.amount !== undefined && !(ev.amount > 0)) continue;
        const options = {};
        if (name === 'collect' && (ev.type === 'mined' || ev.type === 'mine')) options.delay = COLLECT_DELAY_MS;
        if (typeof ev.pan === 'number') options.pan = ev.pan;
        play(name, options);
      }
    }
  }

  function setMuted(value) {
    muted = !!value;
    writeMuted(muted);
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.9, ctx.currentTime + 0.15);
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function stats() {
    return {
      contextState: ctx ? ctx.state : 'none',
      unlocked,
      muted,
      loaded: Array.from(buffers.keys()).sort(),
      pending: Array.from(pending.keys()).sort(),
      failed: Object.fromEntries(failed),
      ambientPlaying: !!ambientSource,
      names: names.slice()
    };
  }

  return { unlock, play, handleEvents, setMuted, isMuted, preload, stats, names };
}

export { SOUNDS, EVENT_MAP };
