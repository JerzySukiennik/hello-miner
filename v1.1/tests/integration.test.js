// Integration tests: the real js/lang running inside the real js/sim world, no fakes, no deps.

(async () => {
  const lang = await import('../js/lang/index.js');
  const sim = await import('../js/sim/index.js');
  const { createWorld } = sim;

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

  function unlock(w, names) {
    for (const n of names) w.unlocked.add(n);
  }

  function allowed(w) {
    return new Set(w.unlocked);
  }

  function build(source, w, extraAllowed) {
    const set = allowed(w);
    for (const n of extraAllowed || []) set.add(n);
    const out = lang.compile(source, { allowed: set });
    if (out.errors.length) {
      console.log('       compile errors: ' + out.errors.map((e) => e.message).join(' | '));
    }
    eq(out.errors.length, 0, 'program compiles: ' + JSON.stringify(source.split('\n')[0]));
    return out.program;
  }

  function newWorld(seed) {
    return createWorld({ seed, lang });
  }

  function ticks(w, n, each) {
    for (let i = 0; i < n; i++) {
      w.tick(50);
      if (each) each(i);
    }
  }

  function plantStone(w) {
    for (const tile of w.tiles) {
      tile.kind = 'rock';
      tile.hp = 0;
      tile.ore = 'stone';
      tile.stage = 1;
      tile.stock = 1;
    }
  }

  // --- a) mine() on the 1x1 start tile ---------------------------------------
  {
    const w = newWorld(1);
    const d = w.addPlayer('p1', 'amber');
    const errs = [];
    w.on('error', (e) => errs.push(e));
    w.runProgram('p1', build('mine()', w));
    eq(w.inv.stone, 0, 'a) nothing is mined before the first tick');
    ticks(w, 12);
    eq(w.inv.stone, 1, 'a) mine() on the start tile yields 1 stone after 600 ms');
    eq(w.totalMined, 1, 'a) totalMined counts the harvest');
    eq(d.state, 'idle', 'a) the runner finishes and the drone goes idle');
    eq(d.action, null, 'a) no action is left pending');
    eq(errs.length, 0, 'a) no error events');
    ticks(w, 40);
    eq(w.inv.stone, 1, 'a) a finished program does not mine again');
  }

  // --- b) mining loop on a 3x3 island ---------------------------------------
  {
    const w = newWorld(7);
    w.addPlayer('p1', 'amber');
    unlock(w, ['while', 'if', 'can_mine']);
    w.inv.stone = 50;
    ok(w.buy('grid'), 'b) first grid level bought with a test top-up');
    ok(w.buy('grid'), 'b) second grid level bought with a test top-up');
    eq(w.size, 3, 'b) the island is 3x3');
    plantStone(w);
    w.inv.stone = 0;
    const errs = [];
    w.on('error', (e) => errs.push(e));
    const src = 'while True:\n    if can_mine():\n        mine()\n    move(right)';
    w.runProgram('p1', build(src, w));
    const lines = new Set();
    const minedOnce = new Set();
    w.on('mined', (e) => minedOnce.add(e.x + ',' + e.y));
    let prev = 0;
    let monotonic = true;
    ticks(w, 1200, () => {
      for (const id of Object.keys(w.drones)) {
        const line = w.drones[id].line;
        if (line !== null && line !== undefined) lines.add(line);
      }
      if (w.inv.stone < prev) monotonic = false;
      prev = w.inv.stone;
    });
    eq(w.t, 60000, 'b) the run covered 60 simulated seconds');
    ok(monotonic, 'b) stone never goes down');
    ok(w.inv.stone >= 3, 'b) stone grew over the run (' + w.inv.stone + ')');
    eq(minedOnce.size, 3, 'b) the sweep harvested all three tiles of the row it wraps around');
    ok(w.inv.stone > minedOnce.size, 'b) tiles were harvested more than once because stone regrows (' + w.inv.stone + ' stone from ' + minedOnce.size + ' tiles)');
    ok(w.inv.stone >= 20, 'b) the sweep kept real throughput over 60 s (' + w.inv.stone + ' stone)');
    ok(lines.size >= 3, 'b) the executing line takes at least 3 distinct values (' + Array.from(lines).sort().join(',') + ')');
    eq(errs.length, 0, 'b) no error events during the loop');
    eq(w.drones['p1:1'].state === 'error', false, 'b) the drone is not in the error state');
  }

  // --- c) a runtime error -----------------------------------------------------
  {
    const w = newWorld(3);
    const d = w.addPlayer('p1', 'amber');
    const errs = [];
    w.on('error', (e) => errs.push(e));
    w.runProgram('p1', build('mine()\nx = 1 / 0\nmine()', w));
    ticks(w, 30);
    eq(d.state, 'error', 'c) a runtime error puts the drone in the error state');
    eq(errs.length, 1, 'c) exactly one error event');
    eq(errs[0].line, 2, 'c) the error event carries the failing line');
    eq(typeof errs[0].message, 'string', 'c) the error event carries a message');
    ok(errs[0].message.length > 0 && /zero/i.test(errs[0].message), 'c) the message explains the division by zero ("' + errs[0].message + '")');
    eq(errs[0].droneId, 'p1:1', 'c) the error event names the drone');
    const before = w.inv.stone;
    ticks(w, 40);
    eq(w.inv.stone, before, 'c) an errored drone stops working');
  }

  // --- d) spawn_drone with a function ----------------------------------------
  {
    const w = newWorld(5);
    w.addPlayer('p1', 'amber');
    unlock(w, ['while', 'def', 'spawn_drone']);
    w.levels.drones = 1;
    while (w.size < 3) w.growGrid();
    plantStone(w);
    const errs = [];
    w.on('error', (e) => errs.push(e));
    const minersSeen = new Map();
    w.on('mined', (e) => { if (e.amount > 0) minersSeen.set(e.droneId, (minersSeen.get(e.droneId) || 0) + 1); });
    const src = 'def f():\n    while True:\n        mine()\nspawn_drone(f)\nwhile True:\n    mine()';
    w.runProgram('p1', build(src, w));
    let overlaps = 0;
    let maxDrones = 0;
    ticks(w, 400, () => {
      const live = Object.keys(w.drones).map((id) => w.drones[id]).filter((d) => d.state !== 'dead');
      maxDrones = Math.max(maxDrones, live.length);
      const seen = new Set();
      for (const d of live) {
        const key = d.x + ',' + d.y;
        if (seen.has(key)) overlaps++;
        seen.add(key);
      }
    });
    eq(Object.keys(w.drones).length, 2, 'd) spawn_drone produced a second drone');
    eq(maxDrones, 2, 'd) both drones are alive');
    eq(overlaps, 0, 'd) the two drones never shared a tile across 20 simulated seconds');
    const states = Object.keys(w.drones).map((id) => w.drones[id].state);
    ok(states.every((s) => s !== 'error'), 'd) neither drone errored');
    eq(minersSeen.size, 2, 'd) both drones mined (' + Array.from(minersSeen.keys()).join(',') + ')');
    const harvests = Array.from(minersSeen.values());
    ok(harvests.every((n) => n >= 5), 'd) each drone mined its own tile repeatedly as stone regrew (' + harvests.join(',') + ')');
    ok(w.totalMined >= 10, 'd) the pair kept harvesting over 20 s (' + w.totalMined + ' mined)');
    eq(errs.length, 0, 'd) no error events while two drones mine');
  }

  // --- e) print ---------------------------------------------------------------
  {
    const w = newWorld(2);
    w.addPlayer('p1', 'amber');
    unlock(w, ['print']);
    const prints = [];
    w.on('print', (e) => prints.push(e));
    w.runProgram('p1', build('print("hi")', w));
    ticks(w, 5);
    eq(prints.length, 1, 'e) one print event');
    eq(prints[0].text, 'hi', 'e) the print event carries the text');
    eq(prints[0].droneId, 'p1:1', 'e) the print event names the drone');
    eq(prints[0].owner, 'p1', 'e) the print event names the owner');
  }

  // --- f) a blocked move returns False after the wait timeout -----------------
  {
    const w = newWorld(4);
    w.addPlayer('p1', 'amber');
    w.growGrid();
    plantStone(w);
    w.addPlayer('p2', 'sky');
    unlock(w, ['print']);
    const a = w.drones['p1:1'];
    const b = w.drones['p2:1'];
    eq(a.x + ',' + a.y, '0,0', 'f) the first drone sits on (0,0)');
    b.x = 0;
    b.y = 1;
    const prints = [];
    w.on('print', (e) => prints.push(e));
    w.runProgram('p1', build('print(move(up))', w));
    ticks(w, 20);
    eq(prints.length, 0, 'f) the blocked move has not returned after 1 s');
    eq(a.state, 'waiting', 'f) the blocked drone is waiting');
    ticks(w, 30);
    eq(prints.length, 1, 'f) the blocked move returns after the 2 s timeout');
    eq(prints[0].text, 'False', 'f) a move blocked for more than 2 s returns False');
    eq(a.x + ',' + a.y, '0,0', 'f) the blocked drone never moved');
  }

  // --- g) clearing a boulder while standing on ore ---------------------------
  {
    const w = newWorld(6);
    w.addPlayer('p1', 'amber');
    unlock(w, ['repeat']);
    w.growGrid();
    plantStone(w);
    const t = w.tiles[w.tileIndex(1, 0)];
    t.kind = 'boulder'; t.hp = 3; t.ore = 'none'; t.stage = 0; t.stock = 0;
    const d = w.drones['p1:1'];
    eq(d.x + ',' + d.y, '0,0', 'g) the drone starts on a ready stone tile');
    const errs = [];
    w.on('error', (e) => errs.push(e));
    w.runProgram('p1', build('for __i in range(3):\n    move(right)\n    mine()', w, ['for', 'range']));
    ticks(w, 40);
    eq(t.kind, 'rock', 'g) three mines clear the boulder even though the drone stands on ore');
    eq(t.hp, 0, 'g) the cleared boulder has no hp left');
    eq(w.inv.stone, 0, 'g) clearing a boulder yields no ore');
    eq(errs.length, 0, 'g) no error events while clearing the boulder');
    eq(d.state === 'error', false, 'g) the drone is not in the error state');
  }

  // --- h) the grid grows while a drone is mid-move ---------------------------
  {
    const w = newWorld(7);
    w.addPlayer('p1', 'amber');
    unlock(w, ['print', 'get_pos_x', 'get_pos_y']);
    w.growGrid();
    plantStone(w);
    const d = w.drones['p1:1'];
    d.x = 1; d.y = 1;
    const prints = [];
    w.on('print', (e) => prints.push(e.text));
    w.runProgram('p1', build('move(right)\nprint(get_pos_x())\nprint(get_pos_y())', w));
    ticks(w, 2);
    ok(d.action && d.action.op === 'move', 'h) the drone is mid-move on the 2x2 grid');
    w.growGrid();
    eq(w.size, 3, 'h) the island grew to 3x3 mid-move');
    ticks(w, 12);
    eq(prints[0], '2', 'h) a move that started before the growth lands on the new neighbour x 2');
    eq(prints[1], '1', 'h) and keeps its row');
    eq(d.x, 2, 'h) the drone position agrees with what the program read');
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
