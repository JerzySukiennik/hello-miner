// Unlock tree for print("Hello, Miner") — node list fixed by CONTRACT.md, costs tuned for a 60-90 min run.
//
// TOTAL COST OF THE WHOLE TREE
//   node group        stone   coal   iron   gold  crystal
//   grid (7 lv)        2320    720    300     40        0
//   speed (5 lv)        350    190    130     75       20
//   drones (3 lv)       300    310    330     60        0
//   all single nodes   2375    900    430    120        0
//   TOTAL              5345   2120   1190    295       20
//
// HARVESTS REQUIRED (total / YIELD)
//   stone 5345/1 = 5345 | coal 2120/2 = 1060 | iron 1190/3 = 397 | gold 295/5 = 59 | crystal 20/8 = 3
//   grand total ~= 6864 harvest actions.
//
// ACHIEVABLE RATE PER STAGE (one harvest = move + mine + place, growth hidden by cycling tiles)
//   stage  grid  drones  speed lv  cycle/harvest  harvests/min  minutes  harvests done
//   A      1-2      1        0         2.4 s (growth-bound)  25      8          200
//   B      3-4      2        1-2       1.15 s              104      15         1560
//   C      5-6      3        3         0.90 s              200      18         3600
//   D      7-8      4        4-5       0.70 s              343      10         3430
//   cumulative: ~8800 harvests of machine time in ~51 min, against ~6864 required.
//   Measured in tests/sim.test.js: 2 naive drones, 4x4, speed 0, 10 simulated minutes
//   => 855 harvests, i.e. 42.8 per drone-minute (1.40 s cycle), which is what row B assumes.
//   The ~28% head-room is the slack a real player spends writing and debugging code and
//   waiting on the right unlock order, which puts a competent full clear at 60-90 minutes.

export const TREE = [
  {
    id: 'grid', name: 'Bigger Island', levels: 7, requires: [], unlocks: [],
    desc: 'Grow the island by one tile in each direction. 1x1 up to 8x8.',
    cost: [
      { stone: 10 },
      { stone: 40 },
      { stone: 120, coal: 20 },
      { stone: 250, coal: 60 },
      { stone: 400, coal: 120, iron: 30 },
      { stone: 600, coal: 200, iron: 90 },
      { stone: 900, coal: 320, iron: 180, gold: 40 },
    ],
  },
  {
    id: 'speed', name: 'Faster Rotors', levels: 5, requires: ['loops'], unlocks: [],
    desc: 'Every drone action takes 15% less time per level.',
    cost: [
      { stone: 100 },
      { stone: 250, coal: 40 },
      { coal: 150, iron: 30 },
      { iron: 100, gold: 15 },
      { gold: 60, crystal: 20 },
    ],
  },
  {
    id: 'loops', name: 'Loops', levels: 1, requires: [], unlocks: ['repeat', 'while'],
    desc: 'repeat(n): runs a block n times. while cond: runs it until the condition is False.',
    cost: [{ stone: 20 }],
  },
  {
    id: 'vars', name: 'Variables and If', levels: 1, requires: ['loops'], unlocks: ['vars', 'if'],
    desc: 'Store values in names and branch with if / elif / else.',
    cost: [{ stone: 60 }],
  },
  {
    id: 'sensors', name: 'Sensors', levels: 1, requires: ['vars'],
    unlocks: ['get_ore', 'can_mine', 'get_pos_x', 'get_pos_y', 'get_world_size'],
    desc: 'Ask the drone what it is standing on and where it is.',
    cost: [{ stone: 120 }],
  },
  {
    id: 'coal', name: 'Coal', levels: 1, requires: ['sensors'], unlocks: ['coal'],
    desc: 'Coal grows in 2.5 s and is worth 2. New tiles can hold it.',
    cost: [{ stone: 200 }],
  },
  {
    id: 'iron', name: 'Iron', levels: 1, requires: ['place'], unlocks: ['iron'],
    desc: 'Iron is worth 3 but only grows next to a tile holding stone or coal.',
    cost: [{ stone: 400, coal: 100 }],
  },
  {
    id: 'place', name: 'Planting', levels: 1, requires: ['coal'], unlocks: ['place', 'count'],
    desc: 'place(ore) plants an ore on an empty tile. count(ore) reads your stock.',
    cost: [{ stone: 150, coal: 30 }],
  },
  {
    id: 'scan', name: 'Scanner', levels: 1, requires: ['sensors'], unlocks: ['scan'],
    desc: 'scan(dir) looks at the neighbouring tile. Also makes lava and gas appear on new land.',
    cost: [{ stone: 180, coal: 20 }],
  },
  {
    id: 'wait', name: 'Patience', levels: 1, requires: ['loops'], unlocks: ['wait'],
    desc: 'wait(seconds) pauses the drone without burning through the loop.',
    cost: [{ stone: 80 }],
  },
  {
    id: 'print', name: 'Speech', levels: 1, requires: [], unlocks: ['print'],
    desc: 'print(x) makes the drone say something in a speech bubble.',
    cost: [{ stone: 15 }],
  },
  {
    id: 'functions', name: 'Functions', levels: 1, requires: ['vars'], unlocks: ['def'],
    desc: 'def name(a, b): makes your own command. return sends a value back.',
    cost: [{ stone: 250, coal: 50 }],
  },
  {
    id: 'for_loops', name: 'For Loops', levels: 1, requires: ['functions'], unlocks: ['for', 'range'],
    desc: 'for x in range(n): walks over numbers or over a list.',
    cost: [{ stone: 300, coal: 80 }],
  },
  {
    id: 'lists', name: 'Lists', levels: 1, requires: ['for_loops'], unlocks: ['list'],
    desc: 'Keep many values in one name: plan = [up, right, down].',
    cost: [{ coal: 120, iron: 20 }],
  },
  {
    id: 'dicts', name: 'Dicts', levels: 1, requires: ['lists'], unlocks: ['dict'],
    desc: 'Look values up by key: cost = {coal: 1, iron: 2}.',
    cost: [{ coal: 200, iron: 60 }],
  },
  {
    id: 'drones', name: 'More Drones', levels: 3, requires: ['functions'], unlocks: ['spawn_drone'],
    desc: 'spawn_drone(fn) builds a helper drone. Max 2, then 3, then 4 drones.',
    cost: [
      { stone: 300, coal: 60 },
      { coal: 250, iron: 80 },
      { iron: 250, gold: 60 },
    ],
  },
  {
    id: 'gold', name: 'Gold Drill', levels: 1, requires: ['iron', 'drones'], unlocks: ['gold', 'drill'],
    desc: 'Gold is worth 5, but only a drill can pull it out of the ground.',
    cost: [{ stone: 600, coal: 300, iron: 150 }],
  },
  {
    id: 'crystal', name: 'Crystal', levels: 1, requires: ['gold', 'dicts'], unlocks: ['crystal'],
    desc: 'Worth 8, grows in 9 s, and shatters if you mine it early. Check can_mine() first.',
    cost: [{ iron: 200, gold: 120 }],
  },
];

export const TREE_BY_ID = TREE.reduce((acc, n) => { acc[n.id] = n; return acc; }, {});

export const MAX_DRONES_BY_LEVEL = [1, 2, 3, 4];

export function initialLevels() {
  const levels = {};
  for (const node of TREE) levels[node.id] = 0;
  return levels;
}

export function costFor(nodeId, level) {
  const node = TREE_BY_ID[nodeId];
  if (!node || level < 0 || level >= node.levels) return null;
  return node.cost[level];
}

export function remainingCost(levels) {
  const total = { stone: 0, coal: 0, iron: 0, gold: 0, crystal: 0 };
  for (const node of TREE) {
    const have = levels && levels[node.id] ? levels[node.id] : 0;
    for (let i = have; i < node.levels; i++) {
      const c = node.cost[i];
      for (const k of Object.keys(c)) total[k] = (total[k] || 0) + c[k];
    }
  }
  return total;
}
