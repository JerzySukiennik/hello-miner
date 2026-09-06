// Shared constants for print("Hello, Miner"). Imported by every module; edited only via CONTRACT.md changes.

export const MAX_GRID = 8;
export const TICK_MS = 50;
export const SNAPSHOT_HZ = 10;

export const COLORS = [
  { id: 'amber',  hex: '#f2a541' },
  { id: 'sky',    hex: '#4fb3e8' },
  { id: 'mint',   hex: '#5ccc8a' },
  { id: 'coral',  hex: '#f26b5b' },
  { id: 'violet', hex: '#9b7bf2' },
  { id: 'rose',   hex: '#f27ab0' },
  { id: 'lime',   hex: '#b8d94a' },
  { id: 'ice',    hex: '#8fd9e6' },
];

export const DIRS = {
  up:    { dx: 0,  dy: 1 },
  down:  { dx: 0,  dy: -1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
};

export const ORES = ['stone', 'coal', 'iron', 'gold', 'crystal'];

export const ORE_INFO = {
  stone:   { growMs: 1500, yield: 1, placeCost: 0, color: '#9a9a96' },
  coal:    { growMs: 2500, yield: 2, placeCost: 1, color: '#2b2b2e' },
  iron:    { growMs: 4000, yield: 3, placeCost: 2, color: '#b5623a' },
  gold:    { growMs: 6000, yield: 5, placeCost: 3, color: '#f2c94c' },
  crystal: { growMs: 9000, yield: 8, placeCost: 5, color: '#5fe3e0' },
};

export const TILE_KINDS = ['rock', 'boulder', 'lava', 'gas'];
export const BOULDER_HP = 3;

export const ACTION_MS = { move: 300, mine: 500, place: 400, spawn: 800 };
export const SPEED_FACTOR = 0.85;
export const WAIT_TIMEOUT_MS = 2000;
export const DEATH_MS = 1500;

export const TILE = { size: 1, gap: 0, height: 0.5 };
