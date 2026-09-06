// Node test suite for js/sim: rules, tree, snapshots and determinism, driven by a fake lang runner.

(async () => {
  const sim = await import('../js/sim/index.js');
  const actions = await import('../js/sim/actions.js');
  const constants = await import('../js/shared/constants.js');
  const { createWorld, TREE, remainingCost, durationFor } = sim;
  const { rollTile } = actions;
  const { ACTION_MS } = constants;

  let passed = 0;
  const failures = [];

  function ok(cond, name) {
    if (cond) { passed++; return; }
    failures.push(name);
    console.log('FAIL  ' + name);
  }

  function eq(a, b, name) {
    const good = a === b;
    if (!good) console.log('       got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
    ok(good, name);
  }

  function near(a, b, tol, name) {
    ok(Math.abs(a - b) <= tol, name + ' (' + a + ' vs ' + b + ')');
  }

  function makeScriptRunner(program, api) {
    const list = program.actions || [];
    let i = 0;
    return {
      step(value) {
        if (i >= list.length) {
          if (!program.loop) return { done: true, value: undefined };
          i = 0;
          return { done: false, value: { op: 'tick' } };
        }
        const entry = list[i++];
        const a = typeof entry === 'function' ? entry(api, value) : entry;
        if (a === null || a === undefined) return { done: true, value: undefined };
        return { done: false, value: a };
      },
    };
  }

  const fakeLang = {
    createRun(program, api) { return makeScriptRunner(program, api); },
    createRunFromFunction(fn, api) { return makeScriptRunner(fn, api); },
  };

  function prog(list, loop) { return { actions: list, loop: !!loop }; }
  function capture(sink, next) {
    return (api, value) => { sink.push(value); return next === undefined ? null : next; };
  }
  function sense(sink, fn) {
    return (api) => { sink.push(fn(api)); return null; };
  }
  function ticks(w, n, each) {
    for (let i = 0; i < n; i++) { w.tick(50); if (each) each(i); }
  }
  function newWorld(seed) { return createWorld({ seed: seed === undefined ? 7 : seed, lang: fakeLang }); }

  // --- world creation -------------------------------------------------------
  {
    const w = newWorld();
    eq(w.size, 1, 'starts at size 1');
    eq(w.tiles.length, 1, 'one tile at start');
    eq(w.tiles[0].ore, 'stone', 'start tile holds stone');
    eq(w.tiles[0].stage, 1, 'start tile is ready');
    eq(w.tiles[0].kind, 'rock', 'start tile is rock');
    eq(w.inv.stone + w.inv.coal + w.inv.iron + w.inv.gold + w.inv.crystal, 0, 'inventory starts empty');
    ok(w.unlocked.has('move') && w.unlocked.has('mine'), 'move and mine unlocked at start');
    eq(w.unlocked.size, 2, 'nothing else unlocked at start');
    eq(Object.keys(w.drones).length, 0, 'no drones before addPlayer');
    eq(w.totalMined, 0, 'totalMined starts at 0');
  }

  // --- players and drones ---------------------------------------------------
  {
    const w = newWorld();
    const d = w.addPlayer('p1', 'amber');
    ok(!!d, 'addPlayer returns a drone');
    eq(d.x, 0, 'first drone spawns at x 0');
    eq(d.y, 0, 'first drone spawns at y 0');
    eq(d.state, 'idle', 'fresh drone is idle');
    eq(w.dronesOf('p1').length, 1, 'player owns one drone');
    w.removePlayer('p1');
    eq(Object.keys(w.drones).length, 0, 'removePlayer removes its drones');
  }

  // --- mining ---------------------------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    const got = [];
    w.runProgram('p1', prog([{ op: 'mine', line: 1 }, capture(got)]));
    ticks(w, 3);
    const d = w.drones['p1:1'];
    ok(d.action && d.action.op === 'mine', 'mine action is pending');
    eq(d.line, 1, 'drone line tracks the action line');
    ticks(w, 12);
    eq(w.inv.stone, 1, 'mining ready stone yields 1');
    eq(w.totalMined, 1, 'totalMined counts the yield');
    eq(w.tiles[0].ore, 'stone', 'a mined stone tile stays stone');
    ok(w.tiles[0].stage < 1, 'a mined stone tile restarts its growth from scratch');
    eq(got[0], true, 'mine resumes the runner with True');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.tiles[0].stage = 0.4;
    const got = [];
    w.runProgram('p1', prog([{ op: 'mine' }, capture(got)]));
    ticks(w, 20);
    eq(got[0], false, 'mining an unready tile returns False');
    eq(w.inv.stone, 0, 'unready tile yields nothing');
    eq(w.tiles[0].ore, 'stone', 'unready non-crystal ore survives mining');
  }

  // --- durations and speed --------------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    w.runProgram('p1', prog([{ op: 'move', dir: 'right' }]));
    ticks(w, 1);
    eq(w.drones['p1:1'].action.durMs, ACTION_MS.move, 'move takes the base duration at speed 0');
    const w2 = newWorld();
    w2.addPlayer('p1', 'amber');
    w2.growGrid();
    w2.levels.speed = 3;
    w2.runProgram('p1', prog([{ op: 'move', dir: 'right' }]));
    ticks(w2, 1);
    near(w2.drones['p1:1'].action.durMs, ACTION_MS.move * Math.pow(0.85, 3), 1e-6, 'speed level scales by 0.85^level');
    near(durationFor('mine', 5), 500 * Math.pow(0.85, 5), 1e-6, 'durationFor honours the speed factor');
  }

  // --- movement, wrap, boulders --------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    const d = w.drones['p1:1'];
    d.x = 1; d.y = 0;
    w.runProgram('p1', prog([{ op: 'move', dir: 'right' }]));
    ticks(w, 10);
    eq(d.x, 0, 'moving right off the edge wraps to x 0');
    eq(d.y, 0, 'wrapping keeps y');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    const t = w.tiles[w.tileIndex(1, 0)];
    t.kind = 'boulder';
    t.hp = 3;
    const got = [];
    w.runProgram('p1', prog([{ op: 'move', dir: 'right' }, capture(got)]));
    ticks(w, 4);
    eq(got[0], false, 'a boulder blocks the move and returns False');
    eq(w.drones['p1:1'].x, 0, 'blocked drone stays put');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    const t = w.tiles[w.tileIndex(1, 0)];
    t.kind = 'boulder';
    t.hp = 3;
    t.ore = 'none';
    w.tiles[0].ore = 'none';
    const d = w.drones['p1:1'];
    d.dir = 'right';
    w.runProgram('p1', prog([{ op: 'mine' }, { op: 'mine' }, { op: 'mine' }]));
    ticks(w, 15);
    eq(t.hp, 2, 'first hit takes one boulder hp');
    ticks(w, 30);
    eq(t.kind, 'rock', 'a boulder clears after 3 hits');
    eq(t.hp, 0, 'cleared boulder has no hp left');
  }

  // --- non-overlap and the 2000 ms give-up ---------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.addPlayer('p2', 'sky');
    w.growGrid();
    const a = w.drones['p1:1'];
    const b = w.drones['p2:1'];
    a.x = 0; a.y = 0;
    b.x = 1; b.y = 0;
    const got = [];
    w.runProgram('p1', prog([{ op: 'move', dir: 'right' }, capture(got)]));
    ticks(w, 10);
    eq(a.state, 'waiting', 'a drone blocked by another waits');
    eq(a.x, 0, 'a waiting drone does not move');
    eq(got.length, 0, 'a waiting move has not resumed yet');
    ticks(w, 35);
    eq(got[0], false, 'the move gives up with False after 2000 ms');
    ok(w.t >= 2000, 'give-up happens no earlier than 2000 ms');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.addPlayer('p2', 'sky');
    w.growGrid();
    const a = w.drones['p1:1'];
    const b = w.drones['p2:1'];
    a.x = 0; a.y = 0;
    b.x = 1; b.y = 1;
    w.runProgram('p1', prog([{ op: 'move', dir: 'right' }]));
    ticks(w, 2);
    w.runProgram('p2', prog([{ op: 'move', dir: 'down' }]));
    let overlapped = false;
    ticks(w, 20, () => {
      if (a.x === b.x && a.y === b.y) overlapped = true;
    });
    ok(!overlapped, 'a tile reserved mid-move cannot be entered by a second drone');
    ok(!(a.x === b.x && a.y === b.y), 'the two drones ended on different tiles');
  }

  // --- hazards, death, respawn ---------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    const seen = [];
    let diedAt = -1;
    w.on('event', (e) => seen.push(e.type));
    w.on('died', () => { diedAt = w.t; });
    w.tiles[w.tileIndex(1, 0)].kind = 'lava';
    const d = w.drones['p1:1'];
    w.runProgram('p1', prog([{ op: 'move', dir: 'right', line: 1 }, { op: 'mine', line: 2 }], true));
    ticks(w, 10);
    eq(d.state, 'dead', 'entering lava kills the drone');
    ok(seen.indexOf('died') >= 0, 'death emits a died event');
    eq(d.line, 1, 'the drone remembers the line it died on');
    w.tiles[w.tileIndex(1, 0)].kind = 'rock';
    let guard = 0;
    while (d.state === 'dead' && guard++ < 200) w.tick(50);
    ok(guard < 200, 'the drone respawns instead of staying dead');
    ok(w.t - diedAt >= 1500, 'the respawn waits at least 1500 ms');
    eq(d.x, 0, 'respawn lands on the start tile x');
    eq(d.y, 0, 'respawn lands on the start tile y');
    ticks(w, 2);
    eq(d.line, 1, 'the program restarts from line 1');
    ticks(w, 10);
    eq(d.x, 1, 'the restarted program moves the drone again');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    w.tiles[w.tileIndex(0, 1)].kind = 'gas';
    const d = w.drones['p1:1'];
    w.runProgram('p1', prog([{ op: 'move', dir: 'up' }]));
    ticks(w, 10);
    eq(d.state, 'dead', 'gas kills the drone too');
  }

  // --- growth ---------------------------------------------------------------
  {
    const w = newWorld();
    const t = w.tiles[0];
    t.ore = 'coal'; t.stage = 0; t.stock = 0;
    ticks(w, 20);
    ok(t.stage < 1, 'coal is not ready after 1000 ms');
    ticks(w, 31);
    eq(t.stage, 1, 'coal is ready after 2500 ms');
    eq(t.stock, 1, 'a ready tile carries stock 1');
  }

  {
    const w = newWorld();
    w.growGrid();
    const iron = w.tiles[w.tileIndex(0, 0)];
    iron.ore = 'iron'; iron.stage = 0; iron.stock = 0;
    for (let i = 1; i < w.tiles.length; i++) { w.tiles[i].ore = 'none'; w.tiles[i].stage = 0; w.tiles[i].kind = 'rock'; }
    ticks(w, 200);
    eq(iron.stage, 0, 'iron does not grow without stone or coal next to it');
    w.tiles[w.tileIndex(1, 0)].ore = 'stone';
    w.tiles[w.tileIndex(1, 0)].stage = 1;
    ticks(w, 81);
    eq(iron.stage, 1, 'iron grows once a neighbour holds stone or coal');
  }

  // --- place ----------------------------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.tiles[0].ore = 'none';
    const got = [];
    w.runProgram('p1', prog([{ op: 'place', ore: 'stone' }, capture(got)]));
    ticks(w, 12);
    eq(got[0], false, 'place is refused while the unlock is missing');
    eq(w.tiles[0].ore, 'none', 'refused place leaves the tile empty');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.unlocked.add('place');
    w.tiles[0].ore = 'none';
    const got = [];
    w.runProgram('p1', prog([{ op: 'place', ore: 'stone' }, capture(got)]));
    ticks(w, 12);
    eq(got[0], true, 'placing stone works once place is unlocked');
    eq(w.tiles[0].ore, 'stone', 'the tile now holds stone');
    ok(w.tiles[0].stage < 1, 'a freshly placed ore starts growing from stage 0');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.unlocked.add('place');
    w.tiles[0].ore = 'none';
    const got = [];
    w.runProgram('p1', prog([{ op: 'place', ore: 'coal' }, capture(got)]));
    ticks(w, 12);
    eq(got[0], false, 'placing a locked ore is refused');
    w.unlocked.add('coal');
    const got2 = [];
    w.runProgram('p1', prog([{ op: 'place', ore: 'coal' }, capture(got2)]));
    ticks(w, 12);
    eq(got2[0], false, 'placing coal without stock is refused');
    w.inv.coal = 4;
    const got3 = [];
    w.runProgram('p1', prog([{ op: 'place', ore: 'coal' }, capture(got3)]));
    ticks(w, 12);
    eq(got3[0], true, 'placing coal works with stock');
    eq(w.inv.coal, 3, 'placing coal costs 1 coal');
    eq(w.tiles[0].ore, 'coal', 'the tile now holds coal');
  }

  // --- gold and crystal -----------------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.tiles[0].ore = 'gold'; w.tiles[0].stage = 1;
    const got = [];
    w.runProgram('p1', prog([{ op: 'mine' }, capture(got)]));
    ticks(w, 14);
    eq(got[0], false, 'gold cannot be mined without the drill');
    eq(w.inv.gold, 0, 'no gold is gained without the drill');
    w.unlocked.add('drill');
    const got2 = [];
    w.runProgram('p1', prog([{ op: 'mine' }, capture(got2)]));
    ticks(w, 14);
    eq(got2[0], true, 'gold can be mined with the drill');
    eq(w.inv.gold, 5, 'gold yields 5');
    eq(w.tiles[0].ore, 'none', 'a mined gold tile empties out and must be re-placed');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.tiles[0].ore = 'coal'; w.tiles[0].stage = 1; w.tiles[0].stock = 1;
    w.runProgram('p1', prog([{ op: 'mine' }]));
    ticks(w, 14);
    eq(w.inv.coal, 2, 'coal yields 2');
    eq(w.tiles[0].ore, 'none', 'a mined coal tile empties out and must be re-placed');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.runProgram('p1', prog([{ op: 'mine' }, { op: 'mine' }], true));
    ticks(w, 200);
    ok(w.inv.stone >= 3, 'stone regrows by itself so one tile can be mined again (' + w.inv.stone + ')');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.tiles[0].ore = 'crystal'; w.tiles[0].stage = 0.5; w.tiles[0].stock = 0;
    const sensed = [];
    w.runProgram('p1', prog([sense(sensed, (api) => api.can_mine())]));
    ticks(w, 2);
    eq(sensed[0], false, 'can_mine protects an unready crystal');
    const got = [];
    w.runProgram('p1', prog([{ op: 'mine' }, capture(got)]));
    ticks(w, 14);
    eq(got[0], false, 'mining an unready crystal returns False');
    eq(w.tiles[0].ore, 'none', 'an unready crystal shatters');
    eq(w.inv.crystal, 0, 'a shattered crystal yields nothing');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.tiles[0].ore = 'crystal'; w.tiles[0].stage = 1; w.tiles[0].stock = 1;
    const sensed = [];
    w.runProgram('p1', prog([sense(sensed, (api) => api.can_mine())]));
    ticks(w, 2);
    eq(sensed[0], true, 'can_mine is True on a ready crystal');
    w.runProgram('p1', prog([{ op: 'mine' }]));
    ticks(w, 14);
    eq(w.inv.crystal, 8, 'a ready crystal yields 8');
  }

  // --- sensors --------------------------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    w.tiles[w.tileIndex(0, 1)].kind = 'lava';
    w.inv.iron = 12;
    const s = [];
    w.runProgram('p1', prog([
      (api) => { s.push(api.get_ore()); return { op: 'tick' }; },
      (api) => { s.push(api.scan('up')); return { op: 'tick' }; },
      (api) => { s.push(api.get_pos_x()); return { op: 'tick' }; },
      (api) => { s.push(api.get_pos_y()); return { op: 'tick' }; },
      (api) => { s.push(api.get_world_size()); return { op: 'tick' }; },
      (api) => { s.push(api.count('iron')); return null; },
    ]));
    ticks(w, 8);
    eq(s[0], 'stone', 'get_ore reads the tile under the drone');
    eq(s[1], 'lava', 'scan reports a hazard kind');
    eq(s[2], 0, 'get_pos_x reads the drone x');
    eq(s[3], 0, 'get_pos_y reads the drone y');
    eq(s[4], 2, 'get_world_size reads the grid size');
    eq(s[5], 12, 'count reads the shared inventory');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    const printed = [];
    w.on('print', (e) => printed.push(e.text));
    w.runProgram('p1', prog([(api) => { api.print('hi'); return null; }]));
    ticks(w, 2);
    eq(printed[0], 'hi', 'print emits a print event');
  }

  // --- spawn ----------------------------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    eq(w.maxDrones('p1'), 1, 'one drone allowed before the drones unlock');
    const got = [];
    w.runProgram('p1', prog([{ op: 'spawn', fn: prog([{ op: 'mine' }]) }, capture(got)]));
    ticks(w, 25);
    eq(got[0], false, 'spawn_drone is refused while locked');
    eq(w.dronesOf('p1').length, 1, 'no clone appears while locked');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.growGrid();
    w.unlocked.add('spawn_drone');
    w.levels.drones = 1;
    eq(w.maxDrones('p1'), 2, 'drones level 1 allows 2 drones');
    const child = prog([{ op: 'mine' }]);
    const got = [];
    w.runProgram('p1', prog([{ op: 'spawn', fn: child }, capture(got)]));
    ticks(w, 25);
    eq(got[0], true, 'spawn succeeds once unlocked');
    eq(w.dronesOf('p1').length, 2, 'a clone joined the player');
    const clone = w.dronesOf('p1')[1];
    ok(Math.abs(clone.x - 0) + Math.abs(clone.y - 0) === 1, 'the clone lands on an adjacent tile');
    ticks(w, 15);
    ok(w.inv.stone >= 0, 'the clone runs its own function without crashing');
    w.levels.drones = 3;
    eq(w.maxDrones('p1'), 4, 'drones level 3 allows 4 drones');
  }

  // --- shared inventory -----------------------------------------------------
  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.addPlayer('p2', 'sky');
    w.growGrid();
    const a = w.drones['p1:1'];
    const b = w.drones['p2:1'];
    a.x = 0; a.y = 0;
    b.x = 1; b.y = 1;
    w.tiles[w.tileIndex(0, 0)].ore = 'stone';
    w.tiles[w.tileIndex(0, 0)].stage = 1;
    w.tiles[w.tileIndex(1, 1)].ore = 'stone';
    w.tiles[w.tileIndex(1, 1)].stage = 1;
    w.runProgram('p1', prog([{ op: 'mine' }]));
    w.runProgram('p2', prog([{ op: 'mine' }]));
    ticks(w, 14);
    eq(w.inv.stone, 2, 'both players fill the same inventory');
    eq(w.totalMined, 2, 'totalMined counts every player');
  }

  // --- tree -----------------------------------------------------------------
  {
    const ids = TREE.map((n) => n.id).join(',');
    eq(ids, 'grid,speed,loops,vars,sensors,coal,iron,place,scan,wait,print,functions,for_loops,lists,dicts,drones,gold,crystal', 'the tree holds the contract node list');
    eq(TREE.find((n) => n.id === 'grid').levels, 7, 'grid has 7 levels');
    eq(TREE.find((n) => n.id === 'speed').levels, 5, 'speed has 5 levels');
    eq(TREE.find((n) => n.id === 'drones').levels, 3, 'drones has 3 levels');
    let costOk = true;
    for (const n of TREE) if (n.cost.length !== n.levels) costOk = false;
    ok(costOk, 'every node lists one cost per level');
    let reqOk = true;
    const known = new Set(TREE.map((n) => n.id));
    for (const n of TREE) for (const r of n.requires) if (!known.has(r)) reqOk = false;
    ok(reqOk, 'every requirement points at a real node');
  }

  {
    const w = newWorld();
    ok(!w.buy('loops'), 'buying without ore fails');
    w.inv.stone = 100;
    ok(!w.buy('nonsense'), 'buying an unknown node fails');
    ok(!w.buy('sensors'), 'buying a node with unmet requirements fails');
    const bought = [];
    w.on('bought', (e) => bought.push(e.node));
    ok(w.buy('loops'), 'buying loops works with enough stone');
    eq(w.inv.stone, 80, 'buying deducts the cost');
    ok(w.unlocked.has('repeat') && w.unlocked.has('while'), 'loops unlocks repeat and while');
    eq(bought[0], 'loops', 'buying emits a bought event');
    ok(!w.buy('loops'), 'a maxed node cannot be bought twice');
    ok(w.buy('grid'), 'grid level 1 is affordable');
    eq(w.size, 2, 'buying grid grows the island');
    eq(w.tiles.length, 4, 'the tile array grows with the island');
  }

  {
    const w = newWorld();
    const total = w.totalCostRemaining();
    eq(total.stone, 5345, 'the whole tree costs 5345 stone');
    eq(total.coal, 2120, 'the whole tree costs 2120 coal');
    eq(total.iron, 1190, 'the whole tree costs 1190 iron');
    eq(total.gold, 295, 'the whole tree costs 295 gold');
    eq(total.crystal, 20, 'the whole tree costs 20 crystal');
    w.inv.stone = 20;
    w.buy('loops');
    eq(w.totalCostRemaining().stone, 5325, 'remaining cost drops after a purchase');
    eq(remainingCost({}).stone, 5345, 'remainingCost works on a bare levels map');
  }

  // --- hazard rolls ---------------------------------------------------------
  {
    function stub(values) {
      let i = 0;
      return () => values[Math.min(i++, values.length - 1)];
    }
    eq(rollTile(stub([0.5]), { hazards: true }).ore, 'stone', 'a roll under 0.70 gives ready stone');
    eq(rollTile(stub([0.5]), { hazards: true }).stage, 1, 'rolled stone is ready');
    eq(rollTile(stub([0.80]), { hazards: true }).ore, 'none', 'a roll in 0.70-0.85 gives an empty tile');
    eq(rollTile(stub([0.90]), { hazards: true }).kind, 'boulder', 'a roll in 0.85-0.95 gives a boulder');
    eq(rollTile(stub([0.90]), { hazards: true }).hp, 3, 'a fresh boulder has hp 3');
    eq(rollTile(stub([0.97, 0.2]), { hazards: true }).kind, 'lava', 'a roll over 0.95 can give lava');
    eq(rollTile(stub([0.97, 0.9]), { hazards: true }).kind, 'gas', 'a roll over 0.95 can give gas');
    eq(rollTile(stub([0.97, 0.2]), { hazards: false }).kind, 'rock', 'hazards need the scan unlock');
    eq(rollTile(stub([0.90]), { hazards: true, safe: true }).kind, 'rock', 'safe tiles never roll a boulder');
    eq(rollTile(stub([0.97, 0.2]), { hazards: true, safe: true }).kind, 'rock', 'safe tiles never roll lava or gas');
  }

  {
    const w = newWorld(42);
    w.addPlayer('p1', 'amber');
    w.unlocked.add('scan');
    while (w.size < 8) w.growGrid();
    eq(w.size, 8, 'the island grows to 8');
    const d = w.drones['p1:1'];
    let safe = true;
    const around = [[0, 0], [1, 0], [7, 0], [0, 1], [0, 7]];
    for (const [x, y] of around) {
      const tile = w.tiles[w.tileIndex(x, y)];
      if (tile.kind !== 'rock') safe = false;
    }
    ok(safe, 'no hazard sits on or next to a drone start tile');
    eq(d.startX, 0, 'the start tile is remembered');
    let hazardCount = 0;
    for (const tile of w.tiles) if (tile.kind !== 'rock') hazardCount++;
    ok(hazardCount > 0, 'hazards do appear elsewhere once scan is unlocked');
  }

  // --- snapshots ------------------------------------------------------------
  {
    const w = newWorld(11);
    w.addPlayer('p1', 'amber');
    w.growGrid();
    w.inv.stone = 40;
    w.buy('loops');
    w.runProgram('p1', prog([{ op: 'move', dir: 'right' }, { op: 'mine' }], true));
    ticks(w, 40);
    const s1 = w.snapshot();
    const w2 = createWorld({ seed: 11, lang: fakeLang });
    w2.applySnapshot(s1);
    const s2 = w2.snapshot();
    eq(JSON.stringify(s2), JSON.stringify(s1), 'snapshot survives an applySnapshot round trip');
    eq(w2.size, w.size, 'applySnapshot restores the size');
    eq(w2.totalMined, w.totalMined, 'applySnapshot restores totalMined');
    ok(w2.unlocked.has('repeat'), 'applySnapshot restores unlocks');
    eq(w.snapshot().events.length, 0, 'snapshot drains the event buffer');
    eq(typeof s1.rng, 'number', 'the snapshot carries the rng state');
    eq(w2.rng.getState(), w.rng.getState(), 'applySnapshot restores the rng state');
    const nextHost = [];
    const oldHost = [];
    for (let i = 0; i < 8; i++) { nextHost.push(w2.rng()); oldHost.push(w.rng()); }
    eq(JSON.stringify(nextHost), JSON.stringify(oldHost), 'a promoted host continues the same random sequence');
  }

  {
    const w = newWorld(3);
    w.addPlayer('p1', 'amber');
    w.growGrid();
    const moved = [];
    w.on('moved', (e) => moved.push(e));
    w.runProgram('p1', prog([{ op: 'move', dir: 'right' }]));
    ticks(w, 12);
    eq(moved.length, 1, 'a finished move emits one moved event');
    eq(moved[0].droneId, 'p1:1', 'the moved event names the drone');
    eq(moved[0].x, w.drones['p1:1'].x, 'the moved event carries the new x');
    eq(moved[0].y, w.drones['p1:1'].y, 'the moved event carries the new y');
  }

  // --- determinism ----------------------------------------------------------
  {
    function build(seed) {
      const w = createWorld({ seed, lang: fakeLang });
      w.addPlayer('p1', 'amber');
      w.addPlayer('p2', 'sky');
      w.unlocked.add('place');
      w.inv.stone = 2000;
      w.buy('grid'); w.buy('grid'); w.buy('grid');
      w.runProgram('p1', prog([{ op: 'move', dir: 'right' }, { op: 'mine' }, { op: 'place', ore: 'stone' }], true));
      w.runProgram('p2', prog([{ op: 'move', dir: 'up' }, { op: 'mine' }, { op: 'place', ore: 'stone' }], true));
      ticks(w, 1200);
      return w;
    }
    const a = build(99);
    const b = build(99);
    const c = build(100);
    eq(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()), 'same seed and script give identical snapshots');
    ok(JSON.stringify(a.snapshot()) !== JSON.stringify(c.snapshot()), 'a different seed gives a different world');
  }

  // --- events ---------------------------------------------------------------
  {
    const w = newWorld(5);
    w.addPlayer('p1', 'amber');
    const seen = new Set();
    w.on('event', (e) => seen.add(e.type));
    w.unlocked.add('place');
    w.unlocked.add('spawn_drone');
    w.levels.drones = 1;
    w.inv.stone = 40;
    w.buy('grid');
    const spare = w.tiles[w.tileIndex(1, 0)];
    spare.kind = 'rock'; spare.hp = 0; spare.ore = 'none'; spare.stage = 0; spare.stock = 0;
    w.runProgram('p1', prog([
      { op: 'mine' },
      { op: 'move', dir: 'right' },
      { op: 'place', ore: 'stone' },
      (api) => { api.print('yo'); return { op: 'tick' }; },
      { op: 'spawn', fn: prog([{ op: 'mine' }]) },
      { op: 'place', ore: 'gold' },
    ]));
    ticks(w, 60);
    ok(seen.has('mined'), 'mined events are emitted');
    ok(seen.has('placed'), 'placed events are emitted');
    ok(seen.has('print'), 'print events are emitted');
    ok(seen.has('spawned'), 'spawned events are emitted');
    ok(seen.has('bought'), 'bought events are emitted');
    ok(seen.has('grow'), 'grow events are emitted');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    const errs = [];
    w.on('error', (e) => errs.push(e.message));
    w.runProgram('p1', prog([() => { const e = new Error('Line 3: boom'); e.line = 3; throw e; }]));
    ticks(w, 3);
    eq(w.drones['p1:1'].state, 'error', 'a runtime error puts the drone in the error state');
    eq(errs[0], 'Line 3: boom', 'a runtime error is emitted as an error event');
  }

  {
    const w = newWorld();
    w.addPlayer('p1', 'amber');
    w.runProgram('p1', prog([{ op: 'mine' }, { op: 'mine' }], true));
    ticks(w, 5);
    ok(w.drones['p1:1'].action !== null, 'a running drone has a pending action');
    w.stopProgram('p1');
    eq(w.drones['p1:1'].state, 'idle', 'stopProgram parks the drone');
    eq(w.drones['p1:1'].action, null, 'stopProgram clears the pending action');
    const before = w.inv.stone;
    ticks(w, 40);
    eq(w.inv.stone, before, 'a stopped program does nothing');
  }

  // --- long run: 12000 ticks, two drones, 4x4, never overlapping ------------
  {
    const w = newWorld(2024);
    w.addPlayer('p1', 'amber');
    w.addPlayer('p2', 'sky');
    w.unlocked.add('place');
    while (w.size < 4) w.growGrid();
    eq(w.size, 4, 'the long run uses a 4x4 island');
    const a = w.drones['p1:1'];
    const b = w.drones['p2:1'];
    w.runProgram('p1', prog([
      { op: 'move', dir: 'right', line: 1 },
      { op: 'mine', line: 2 },
      { op: 'place', ore: 'stone', line: 3 },
    ], true));
    w.runProgram('p2', prog([
      { op: 'move', dir: 'up', line: 1 },
      { op: 'mine', line: 2 },
      { op: 'place', ore: 'stone', line: 3 },
      { op: 'move', dir: 'right', line: 4 },
      { op: 'mine', line: 5 },
      { op: 'place', ore: 'stone', line: 6 },
    ], true));
    let overlaps = 0;
    let deaths = 0;
    w.on('died', () => { deaths++; });
    ticks(w, 12000, () => {
      const live = Object.keys(w.drones).map((id) => w.drones[id]).filter((d) => d.state !== 'dead');
      const seen = new Set();
      for (const d of live) {
        const key = d.x + ',' + d.y;
        if (seen.has(key)) overlaps++;
        seen.add(key);
      }
    });
    eq(overlaps, 0, 'no two live drones ever shared a tile across 12000 ticks');
    eq(deaths, 0, 'no hazards spawned without the scan unlock, so nobody died');
    eq(w.t, 600000, 'the run covered 10 simulated minutes');
    ok(w.inv.stone > 100, 'inventory grew over the long run (' + w.inv.stone + ' stone)');
    ok(w.totalMined > 100, 'totalMined grew over the long run (' + w.totalMined + ')');
    ok(a.state !== 'error' && b.state !== 'error', 'neither drone ended in the error state');
  }

  console.log('');
  console.log(passed + ' assertions passed, ' + failures.length + ' failed');
  if (failures.length) {
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
