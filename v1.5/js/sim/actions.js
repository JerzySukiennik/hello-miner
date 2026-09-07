// Pure helpers for sim actions: durations, grid wrapping, tile factories and hazard rolls.

import { ACTION_MS, SPEED_FACTOR, DIRS, BOULDER_HP, ORE_INFO } from '../shared/constants.js';

export const MAX_STEPS_PER_TICK = 200;

export function speedMultiplier(level) {
  return Math.pow(SPEED_FACTOR, level || 0);
}

export function durationFor(op, speedLevel) {
  const base = ACTION_MS[op];
  if (base === undefined) return 0;
  return base * speedMultiplier(speedLevel);
}

export function wrap(v, size) {
  return ((v % size) + size) % size;
}

export function stepInDir(x, y, dir, size) {
  const d = DIRS[dir];
  if (!d) return null;
  return { x: wrap(x + d.dx, size), y: wrap(y + d.dy, size) };
}

export function isDir(dir) {
  return typeof dir === 'string' && Object.prototype.hasOwnProperty.call(DIRS, dir);
}

export function isOre(ore) {
  return typeof ore === 'string' && Object.prototype.hasOwnProperty.call(ORE_INFO, ore);
}

export function makeTile(ore, kind) {
  return {
    ore: ore || 'none',
    stage: ore && ore !== 'none' ? 1 : 0,
    stock: ore && ore !== 'none' ? 1 : 0,
    kind: kind || 'rock',
    hp: kind === 'boulder' ? BOULDER_HP : 0,
  };
}

export function emptyTile() {
  return makeTile('none', 'rock');
}

export function rollTile(rng, opts) {
  const safe = opts && opts.safe;
  const hazardsAllowed = !!(opts && opts.hazards);
  const r = rng();
  if (r < 0.70) return makeTile('stone', 'rock');
  if (r < 0.85) return emptyTile();
  if (r < 0.95) return safe ? makeTile('stone', 'rock') : makeTile('none', 'boulder');
  if (!hazardsAllowed || safe) return makeTile('stone', 'rock');
  return makeTile('none', rng() < 0.5 ? 'lava' : 'gas');
}

export function neighbourIndices(x, y, size) {
  const out = [];
  for (const dir of Object.keys(DIRS)) {
    const p = stepInDir(x, y, dir, size);
    out.push(p.y * size + p.x);
  }
  return out;
}

export function isAdjacentOrSame(ax, ay, bx, by, size) {
  if (ax === bx && ay === by) return true;
  for (const dir of Object.keys(DIRS)) {
    const p = stepInDir(ax, ay, dir, size);
    if (p.x === bx && p.y === by) return true;
  }
  return false;
}
