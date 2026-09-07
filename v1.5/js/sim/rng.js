// Deterministic seeded RNG (mulberry32) for the sim; the same seed always yields the same stream.

export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return (seed >>> 0) || 0x9e3779b9;
  const s = String(seed === undefined || seed === null ? 'hello-miner' : seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0 || 0x9e3779b9;
}

export function makeRng(seed) {
  let a = hashSeed(seed);
  const rng = function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.getState = () => a >>> 0;
  rng.setState = (v) => { a = v >>> 0; };
  return rng;
}
