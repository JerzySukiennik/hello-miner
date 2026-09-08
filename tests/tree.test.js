// The upgrade tree must be climbable from a stone-only start: no node may cost an ore you cannot yet obtain.

const { TREE } = await import('../js/sim/index.js');
const { createWorld } = await import('../js/sim/index.js');
const lang = await import('../js/lang/index.js');

let passed = 0;
let failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.log(`FAIL ${name}${extra ? ' -> ' + extra : ''}`);
}

const byId = new Map(TREE.map((n) => [n.id, n]));
const ORE_NODE = { coal: 'coal', iron: 'iron', gold: 'gold', crystal: 'crystal' };

function ancestors(id, seen = new Set()) {
  for (const r of (byId.get(id) || {}).requires || []) {
    if (!seen.has(r)) { seen.add(r); ancestors(r, seen); }
  }
  return seen;
}

// Static check: the ore-unlock nodes form a ladder. Everything needed to reach an ore
// (the node and all its ancestors) may only charge ores from lower rungs, else the ladder has a gap.
const TIER = { stone: 0, coal: 1, iron: 2, gold: 3, crystal: 4 };
for (const ore of ['coal', 'iron', 'gold', 'crystal']) {
  const node = ORE_NODE[ore];
  const needed = ancestors(node);
  needed.add(node);
  for (const id of needed) {
    const n = byId.get(id);
    const c = n.cost[0];
    for (const k of Object.keys(c)) {
      ok(`${id} (on the way to ${ore}) charges ${k} at level 1 — must be a lower rung than ${ore}`,
        TIER[k] < TIER[ore], `cost ${JSON.stringify(c)}`);
    }
  }
}

// The place node is the only way to renew coal, so it must be affordable with the coal starter alone.
{
  const place = byId.get('place');
  const coalNeeded = place.cost[0].coal || 0;
  ok('place does not demand more coal than the starter grant', coalNeeded === 0, `costs coal:${coalNeeded}`);
}

// Dynamic check: buy the coal node with nothing but stone and confirm the bank now holds coal and a seam exists.
{
  const w = createWorld({ seed: 'tree', lang });
  w.addPlayer('p', '#fff');
  w.inv.stone = 100000;
  for (const id of ['loops', 'vars', 'sensors', 'grid', 'grid']) ok(`can buy ${id} with stone`, w.buy(id));
  ok('coal node bought with stone only', w.buy('coal'));
  ok('buying coal hands over a starter stock', (w.inv.coal || 0) > 0, `coal=${w.inv.coal}`);
  ok('a coal seam was planted', w.tiles.some((t) => t && t.ore === 'coal'));
  ok('place is affordable right after coal', w.buy('place'));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
