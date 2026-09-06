// Deterministic mining world: tiles, drones, actions, growth, hazards, unlock purchases and snapshots. mine() rule: if the tile the drone faces holds a boulder it hits that boulder, otherwise it mines the ore under itself; in-flight moves retarget when the grid grows.

import {
  ORE_INFO, MAX_GRID, WAIT_TIMEOUT_MS, DEATH_MS, BOULDER_HP, DIRS,
} from '../shared/constants.js';
import { makeRng } from './rng.js';
import { TREE, TREE_BY_ID, MAX_DRONES_BY_LEVEL, initialLevels, remainingCost } from './tree.js';
import {
  MAX_STEPS_PER_TICK, durationFor, stepInDir, isDir, isOre, makeTile, emptyTile,
  rollTile, isAdjacentOrSame,
} from './actions.js';

const ORE_KEYS = ['stone', 'coal', 'iron', 'gold', 'crystal'];

export function createWorld(options = {}) {
  const seed = options.seed === undefined ? 1 : options.seed;
  const lang = options.lang || null;
  const rng = makeRng(seed);

  const listeners = new Map();
  const players = new Map();
  const internals = new Map();

  const state = {
    t: 0,
    size: 1,
    tiles: [makeTile('stone', 'rock')],
    drones: {},
    order: [],
    inv: { stone: 0, coal: 0, iron: 0, gold: 0, crystal: 0 },
    unlocked: new Set(['move', 'mine']),
    levels: initialLevels(),
    totalMined: 0,
    events: [],
  };

  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
    return () => off(name, fn);
  }

  function off(name, fn) {
    const arr = listeners.get(name);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  function emit(ev) {
    const e = Object.assign({ t: state.t }, ev);
    state.events.push(e);
    if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
    const generic = listeners.get('event');
    if (generic) for (const fn of generic.slice()) fn(e);
    const typed = listeners.get(e.type);
    if (typed) for (const fn of typed.slice()) fn(e);
    return e;
  }

  function idx(x, y) { return y * state.size + x; }
  function tileAt(x, y) { return state.tiles[idx(x, y)]; }
  function speedLevel() { return state.levels.speed || 0; }

  function droneList() {
    return state.order.map((id) => state.drones[id]).filter(Boolean);
  }

  function inv(d) { return internals.get(d.id); }

  function blocksTile(d, x, y, exceptId) {
    if (!d || d.id === exceptId) return false;
    if (d.state === 'dead') return false;
    if (d.x === x && d.y === y) return true;
    const a = d.action;
    if (a && a.op === 'move' && a.tx === x && a.ty === y) return true;
    return false;
  }

  function tileFree(x, y, exceptId) {
    for (const d of droneList()) if (blocksTile(d, x, y, exceptId)) return false;
    return true;
  }

  function walkable(x, y) {
    const tile = tileAt(x, y);
    return !!tile && tile.kind !== 'boulder';
  }

  function findFreeTile(preferX, preferY, exceptId) {
    const size = state.size;
    if (preferX !== undefined && preferY !== undefined) {
      if (walkable(preferX, preferY) && tileFree(preferX, preferY, exceptId)) {
        return { x: preferX, y: preferY };
      }
      for (const dir of Object.keys(DIRS)) {
        const p = stepInDir(preferX, preferY, dir, size);
        if (walkable(p.x, p.y) && tileFree(p.x, p.y, exceptId)) return p;
      }
    }
    let best = null;
    let bestD = Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!walkable(x, y) || !tileFree(x, y, exceptId)) continue;
        const dx = preferX === undefined ? 0 : Math.abs(x - preferX);
        const dy = preferY === undefined ? 0 : Math.abs(y - preferY);
        const dist = dx + dy;
        if (dist < bestD) { bestD = dist; best = { x, y }; }
      }
    }
    return best;
  }

  function makeApi(d) {
    return {
      droneId: d.id,
      playerId: d.owner,
      get_ore() {
        const tile = tileAt(d.x, d.y);
        if (!tile || tile.kind !== 'rock') return 'none';
        return tile.ore;
      },
      can_mine() {
        const p = stepInDir(d.x, d.y, d.dir, state.size);
        const front = p ? tileAt(p.x, p.y) : null;
        if (front && front.kind === 'boulder') return true;
        const tile = tileAt(d.x, d.y);
        if (!tile || tile.kind !== 'rock') return false;
        if (tile.ore === 'none' || tile.stage < 1) return false;
        if (tile.ore === 'gold' && !state.unlocked.has('drill')) return false;
        return true;
      },
      scan(dir) {
        if (!isDir(dir)) return 'none';
        const p = stepInDir(d.x, d.y, dir, state.size);
        const tile = tileAt(p.x, p.y);
        if (!tile) return 'none';
        if (tile.kind !== 'rock') return tile.kind;
        return tile.ore;
      },
      get_pos_x() { return d.x; },
      get_pos_y() { return d.y; },
      get_world_size() { return state.size; },
      count(ore) {
        if (!isOre(ore)) return 0;
        return state.inv[ore] || 0;
      },
      print(text) {
        const s = typeof text === 'string' ? text : String(text);
        emit({ type: 'print', droneId: d.id, owner: d.owner, text: s });
        return null;
      },
    };
  }

  function makeRunner(d) {
    if (!lang) return null;
    const inn = inv(d);
    const api = inn.api;
    try {
      if (inn.source && inn.source.kind === 'fn') {
        if (typeof lang.createRunFromFunction !== 'function') return null;
        return lang.createRunFromFunction(inn.source.fn, api);
      }
      const player = players.get(d.owner);
      if (!player || !player.program) return null;
      return lang.createRun(player.program, api);
    } catch (err) {
      emit({ type: 'error', droneId: d.id, owner: d.owner, line: d.line, message: shortError(err) });
      return null;
    }
  }

  function shortError(err) {
    if (!err) return 'Something went wrong.';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    return String(err);
  }

  function addDrone(owner, x, y, source) {
    const player = players.get(owner);
    const seq = player ? ++player.droneSeq : 1;
    const id = `${owner}:${seq}`;
    const d = {
      id, owner, x, y, dir: 'up',
      action: null, line: null, state: 'idle', carrying: 'none',
      startX: x, startY: y,
    };
    state.drones[id] = d;
    state.order.push(id);
    internals.set(id, { runner: null, resume: undefined, waiting: null, deathT: 0, source: source || null, api: null });
    inv(d).api = makeApi(d);
    return d;
  }

  function removeDrone(id) {
    delete state.drones[id];
    internals.delete(id);
    const i = state.order.indexOf(id);
    if (i >= 0) state.order.splice(i, 1);
  }

  function addPlayer(playerId, color) {
    if (players.has(playerId)) return state.order.map((id) => state.drones[id]).find((d) => d.owner === playerId) || null;
    players.set(playerId, { id: playerId, color: color || null, program: null, droneSeq: 0 });
    let spot = findFreeTile(0, 0, null);
    while (!spot && state.size < MAX_GRID) {
      growGrid();
      spot = findFreeTile(0, 0, null);
    }
    if (!spot) {
      emit({ type: 'error', owner: playerId, message: 'No free tile to spawn a drone.' });
      return null;
    }
    return addDrone(playerId, spot.x, spot.y, null);
  }

  function removePlayer(playerId) {
    for (const d of droneList()) if (d.owner === playerId) removeDrone(d.id);
    players.delete(playerId);
  }

  function dronesOf(playerId) {
    return droneList().filter((d) => d.owner === playerId);
  }

  function maxDrones(playerId) {
    const lvl = state.levels.drones || 0;
    return MAX_DRONES_BY_LEVEL[Math.min(lvl, MAX_DRONES_BY_LEVEL.length - 1)];
  }

  function runProgram(playerId, program) {
    const player = players.get(playerId);
    if (!player) return false;
    player.program = program;
    for (const d of dronesOf(playerId)) {
      const inn = inv(d);
      inn.source = null;
      inn.resume = undefined;
      inn.waiting = null;
      inn.deathT = 0;
      d.action = null;
      d.line = null;
      if (d.state === 'dead') continue;
      inn.runner = makeRunner(d);
      d.state = inn.runner ? 'running' : 'idle';
    }
    return true;
  }

  function stopProgram(playerId) {
    const player = players.get(playerId);
    if (!player) return false;
    for (const d of dronesOf(playerId)) {
      const inn = inv(d);
      inn.runner = null;
      inn.resume = undefined;
      inn.waiting = null;
      d.action = null;
      if (d.state !== 'dead') d.state = 'idle';
    }
    return true;
  }

  function kill(d, cause) {
    const inn = inv(d);
    inn.runner = null;
    inn.resume = undefined;
    inn.waiting = null;
    inn.deathT = 0;
    d.action = null;
    d.state = 'dead';
    emit({ type: 'died', droneId: d.id, owner: d.owner, x: d.x, y: d.y, cause: cause || 'hazard' });
  }

  function respawn(d) {
    const inn = inv(d);
    const spot = findFreeTile(
      Math.min(d.startX, state.size - 1),
      Math.min(d.startY, state.size - 1),
      d.id,
    );
    if (!spot) { inn.deathT = 0; return; }
    d.x = spot.x;
    d.y = spot.y;
    d.dir = 'up';
    d.line = null;
    d.action = null;
    inn.waiting = null;
    inn.resume = undefined;
    inn.deathT = 0;
    d.state = 'idle';
    inn.runner = makeRunner(d);
    if (inn.runner) d.state = 'running';
  }

  function checkHazard(d) {
    const tile = tileAt(d.x, d.y);
    if (tile && (tile.kind === 'lava' || tile.kind === 'gas')) {
      kill(d, tile.kind);
      return true;
    }
    return false;
  }

  function canPlace(d, ore) {
    if (!state.unlocked.has('place')) return false;
    if (!isOre(ore)) return false;
    if (ore !== 'stone' && !state.unlocked.has(ore)) return false;
    const tile = tileAt(d.x, d.y);
    if (!tile || tile.kind !== 'rock' || tile.ore !== 'none') return false;
    if ((state.inv[ore] || 0) < ORE_INFO[ore].placeCost) return false;
    return true;
  }

  function doPlace(d, ore) {
    if (!canPlace(d, ore)) return false;
    const tile = tileAt(d.x, d.y);
    state.inv[ore] -= ORE_INFO[ore].placeCost;
    tile.ore = ore;
    tile.stage = 0;
    tile.stock = 0;
    emit({ type: 'placed', droneId: d.id, owner: d.owner, ore, x: d.x, y: d.y });
    return true;
  }

  function facingTile(d) {
    const p = stepInDir(d.x, d.y, d.dir, state.size);
    if (!p) return null;
    const tile = tileAt(p.x, p.y);
    return tile ? { tile, x: p.x, y: p.y } : null;
  }

  function doMine(d) {
    const front = facingTile(d);
    if (front && front.tile.kind === 'boulder') {
      const nt = front.tile;
      nt.hp -= 1;
      if (nt.hp <= 0) {
        nt.kind = 'rock';
        nt.hp = 0;
        nt.ore = 'none';
        nt.stage = 0;
        nt.stock = 0;
        emit({ type: 'mined', droneId: d.id, owner: d.owner, ore: 'none', amount: 0, boulder: true, cleared: true, x: front.x, y: front.y });
      } else {
        emit({ type: 'mined', droneId: d.id, owner: d.owner, ore: 'none', amount: 0, boulder: true, cleared: false, x: front.x, y: front.y });
      }
      return true;
    }
    const tile = tileAt(d.x, d.y);
    if (tile && tile.kind === 'rock' && tile.ore !== 'none') {
      if (tile.stage < 1) {
        if (tile.ore === 'crystal') {
          tile.ore = 'none';
          tile.stage = 0;
          tile.stock = 0;
          emit({ type: 'mined', droneId: d.id, owner: d.owner, ore: 'crystal', amount: 0, shattered: true, x: d.x, y: d.y });
        }
        return false;
      }
      if (tile.ore === 'gold' && !state.unlocked.has('drill')) {
        emit({ type: 'error', droneId: d.id, owner: d.owner, line: d.line, message: 'Gold needs the drill. Buy it in the tree.' });
        return false;
      }
      const ore = tile.ore;
      const amount = ORE_INFO[ore].yield;
      state.inv[ore] = (state.inv[ore] || 0) + amount;
      state.totalMined += amount;
      if (ore !== 'stone') tile.ore = 'none';
      tile.stage = 0;
      tile.stock = 0;
      emit({ type: 'mined', droneId: d.id, owner: d.owner, ore, amount, x: d.x, y: d.y, regrows: ore === 'stone' });
      return true;
    }
    return false;
  }

  function doSpawn(d, fn) {
    if (!state.unlocked.has('spawn_drone')) return false;
    if (dronesOf(d.owner).length >= maxDrones(d.owner)) return false;
    const spot = findFreeTile(d.x, d.y, null);
    if (!spot) return false;
    const child = addDrone(d.owner, spot.x, spot.y, fn === undefined || fn === null ? null : { kind: 'fn', fn });
    const inn = inv(child);
    inn.runner = makeRunner(child);
    child.state = inn.runner ? 'running' : 'idle';
    emit({ type: 'spawned', droneId: child.id, parentId: d.id, owner: d.owner, x: child.x, y: child.y });
    return true;
  }

  function tryStartMove(d, dir) {
    const p = stepInDir(d.x, d.y, dir, state.size);
    if (!p) return 'fail';
    const tile = tileAt(p.x, p.y);
    if (tile && tile.kind === 'boulder') return 'fail';
    if (!tileFree(p.x, p.y, d.id)) return 'blocked';
    d.action = {
      op: 'move', progress: 0, fromX: d.x, fromY: d.y, tx: p.x, ty: p.y, dir,
      durMs: durationFor('move', speedLevel()), elapsed: 0,
    };
    return 'started';
  }

  function beginAction(d, a) {
    const inn = inv(d);
    if (a.op === 'move') {
      if (!isDir(a.dir)) { inn.resume = false; return 'immediate'; }
      d.dir = a.dir;
      const r = tryStartMove(d, a.dir);
      if (r === 'started') return 'pending';
      if (r === 'blocked') { inn.waiting = { dir: a.dir, elapsed: 0 }; return 'pending'; }
      inn.resume = false;
      return 'immediate';
    }
    if (a.op === 'mine') {
      d.action = { op: 'mine', progress: 0, fromX: d.x, fromY: d.y, durMs: durationFor('mine', speedLevel()), elapsed: 0 };
      return 'pending';
    }
    if (a.op === 'place') {
      if (!canPlace(d, a.ore)) { inn.resume = false; return 'immediate'; }
      d.action = { op: 'place', progress: 0, fromX: d.x, fromY: d.y, ore: a.ore, durMs: durationFor('place', speedLevel()), elapsed: 0 };
      return 'pending';
    }
    if (a.op === 'wait') {
      const ms = Number(a.ms);
      if (!Number.isFinite(ms) || ms <= 0) { inn.resume = undefined; return 'immediate'; }
      d.action = { op: 'wait', progress: 0, fromX: d.x, fromY: d.y, durMs: ms, elapsed: 0 };
      return 'pending';
    }
    if (a.op === 'spawn') {
      if (!state.unlocked.has('spawn_drone') || dronesOf(d.owner).length >= maxDrones(d.owner)) {
        inn.resume = false;
        return 'immediate';
      }
      d.action = { op: 'spawn', progress: 0, fromX: d.x, fromY: d.y, durMs: durationFor('spawn', speedLevel()), elapsed: 0 };
      d.action.fn = a.fn;
      return 'pending';
    }
    inn.resume = undefined;
    return 'immediate';
  }

  function finishAction(d) {
    const inn = inv(d);
    const a = d.action;
    d.action = null;
    if (a.op === 'move') {
      d.x = a.tx;
      d.y = a.ty;
      inn.resume = true;
      emit({ type: 'moved', droneId: d.id, owner: d.owner, x: d.x, y: d.y, dir: a.dir, fromX: a.fromX, fromY: a.fromY });
      checkHazard(d);
      return;
    }
    if (a.op === 'mine') { inn.resume = doMine(d); return; }
    if (a.op === 'place') { inn.resume = doPlace(d, a.ore); return; }
    if (a.op === 'wait') { inn.resume = undefined; return; }
    if (a.op === 'spawn') { inn.resume = doSpawn(d, a.fn); return; }
    inn.resume = undefined;
  }

  function stepRunner(d) {
    const inn = inv(d);
    let steps = 0;
    while (steps < MAX_STEPS_PER_TICK) {
      steps++;
      if (!inn.runner) { if (d.state !== 'dead') d.state = 'idle'; return; }
      const value = inn.resume;
      inn.resume = undefined;
      let r;
      try {
        r = inn.runner.step(value);
      } catch (err) {
        const runnerLine = inn.runner && typeof inn.runner.line === 'number' ? inn.runner.line : null;
        inn.runner = null;
        d.state = 'error';
        if (runnerLine !== null) d.line = runnerLine;
        emit({
          type: 'error', droneId: d.id, owner: d.owner,
          line: err && err.line !== undefined && err.line !== null ? err.line : d.line,
          message: shortError(err),
        });
        return;
      }
      if (r && typeof r.line === 'number') d.line = r.line;
      if (!r || r.done) {
        inn.runner = null;
        if (d.state !== 'dead') d.state = 'idle';
        return;
      }
      const a = r.value;
      if (!a || typeof a.op !== 'string') {
        inn.runner = null;
        d.state = 'idle';
        return;
      }
      if (a.line !== undefined && a.line !== null) d.line = a.line;
      if (a.op === 'tick') { d.state = 'running'; return; }
      const outcome = beginAction(d, a);
      if (outcome === 'pending') {
        d.state = inn.waiting ? 'waiting' : 'running';
        return;
      }
      if (d.state === 'dead') return;
    }
    d.state = 'running';
  }

  function tickDrone(d, dt) {
    const inn = inv(d);
    if (d.state === 'dead') {
      inn.deathT += dt;
      if (inn.deathT >= DEATH_MS) respawn(d);
      return;
    }
    if (d.action) {
      d.action.elapsed += dt;
      d.action.progress = d.action.durMs > 0 ? Math.min(1, d.action.elapsed / d.action.durMs) : 1;
      if (d.action.progress < 1) return;
      finishAction(d);
      if (d.state === 'dead') return;
    }
    if (inn.waiting) {
      const r = tryStartMove(d, inn.waiting.dir);
      if (r === 'started') { inn.waiting = null; d.state = 'running'; return; }
      if (r === 'fail') {
        inn.waiting = null;
        inn.resume = false;
        d.state = 'running';
      } else {
        inn.waiting.elapsed += dt;
        if (inn.waiting.elapsed < WAIT_TIMEOUT_MS) { d.state = 'waiting'; return; }
        inn.waiting = null;
        inn.resume = false;
        d.state = 'running';
      }
    }
    if (inn.runner && !d.action) stepRunner(d);
  }

  function ironNeighbourOk(x, y) {
    for (const dir of Object.keys(DIRS)) {
      const p = stepInDir(x, y, dir, state.size);
      if (p.x === x && p.y === y) continue;
      const tile = tileAt(p.x, p.y);
      if (tile && tile.kind === 'rock' && (tile.ore === 'stone' || tile.ore === 'coal')) return true;
    }
    return false;
  }

  function growOres(dt) {
    const size = state.size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tile = state.tiles[y * size + x];
        if (!tile || tile.kind !== 'rock') continue;
        if (tile.ore === 'none' || tile.stage >= 1) continue;
        if (tile.ore === 'iron' && !ironNeighbourOk(x, y)) continue;
        const info = ORE_INFO[tile.ore];
        if (!info) continue;
        tile.stage += dt / info.growMs;
        if (tile.stage >= 1) { tile.stage = 1; tile.stock = 1; }
      }
    }
  }

  function retargetMoves() {
    for (const d of droneList()) {
      const a = d.action;
      if (!a || a.op !== 'move' || !isDir(a.dir)) continue;
      const p = stepInDir(a.fromX, a.fromY, a.dir, state.size);
      if (!p) continue;
      const tile = tileAt(p.x, p.y);
      const blocked = !tile || tile.kind === 'boulder' || !tileFree(p.x, p.y, d.id);
      if (blocked) {
        const inn = inv(d);
        d.action = null;
        d.x = a.fromX;
        d.y = a.fromY;
        inn.resume = false;
        if (d.state !== 'dead') d.state = inn.runner ? 'running' : 'idle';
        continue;
      }
      a.tx = p.x;
      a.ty = p.y;
    }
  }

  function growGrid() {
    if (state.size >= MAX_GRID) return false;
    const oldSize = state.size;
    const newSize = oldSize + 1;
    const next = new Array(newSize * newSize);
    for (let y = 0; y < oldSize; y++) {
      for (let x = 0; x < oldSize; x++) next[y * newSize + x] = state.tiles[y * oldSize + x];
    }
    const starts = droneList().map((d) => ({ x: d.startX, y: d.startY }));
    const hazards = state.unlocked.has('scan');
    const fresh = [];
    for (let y = 0; y < newSize; y++) {
      for (let x = 0; x < newSize; x++) {
        const i = y * newSize + x;
        if (next[i]) continue;
        let safe = false;
        for (const s of starts) {
          if (isAdjacentOrSame(x, y, s.x, s.y, newSize)) { safe = true; break; }
        }
        next[i] = rollTile(rng, { safe, hazards });
        fresh.push(i);
      }
    }
    state.tiles = next;
    state.size = newSize;
    retargetMoves();
    emit({ type: 'grow', size: newSize, tiles: fresh });
    return true;
  }

  function buy(nodeId) {
    const node = TREE_BY_ID[nodeId];
    if (!node) {
      emit({ type: 'error', message: `Unknown unlock "${nodeId}".` });
      return false;
    }
    const level = state.levels[nodeId] || 0;
    if (level >= node.levels) {
      emit({ type: 'error', message: `${node.name} is already maxed out.` });
      return false;
    }
    for (const req of node.requires) {
      if ((state.levels[req] || 0) < 1) {
        emit({ type: 'error', message: `${node.name} needs ${TREE_BY_ID[req] ? TREE_BY_ID[req].name : req} first.` });
        return false;
      }
    }
    if (nodeId === 'grid' && state.size >= MAX_GRID) {
      emit({ type: 'error', message: 'The island is already as big as it gets.' });
      return false;
    }
    const cost = node.cost[level];
    for (const k of Object.keys(cost)) {
      if ((state.inv[k] || 0) < cost[k]) {
        emit({ type: 'error', message: `Not enough ${k} for ${node.name}.` });
        return false;
      }
    }
    for (const k of Object.keys(cost)) state.inv[k] -= cost[k];
    state.levels[nodeId] = level + 1;
    for (const u of node.unlocks) state.unlocked.add(u);
    emit({ type: 'bought', node: nodeId, name: node.name, level: level + 1, cost });
    if (nodeId === 'grid') growGrid();
    return true;
  }

  function tick(dtMs) {
    const dt = dtMs === undefined ? 50 : dtMs;
    state.t += dt;
    growOres(dt);
    for (const id of state.order.slice()) {
      const d = state.drones[id];
      if (d) tickDrone(d, dt);
    }
    return state.t;
  }

  function cloneTile(tile) {
    return { ore: tile.ore, stage: tile.stage, stock: tile.stock, kind: tile.kind, hp: tile.hp };
  }

  function cloneAction(a) {
    if (!a) return null;
    const out = { op: a.op, progress: a.progress, fromX: a.fromX, fromY: a.fromY, durMs: a.durMs, elapsed: a.elapsed };
    if (a.tx !== undefined) { out.tx = a.tx; out.ty = a.ty; }
    if (a.dir !== undefined) out.dir = a.dir;
    if (a.ore !== undefined) out.ore = a.ore;
    return out;
  }

  function snapshot() {
    const drones = {};
    for (const id of state.order) {
      const d = state.drones[id];
      if (!d) continue;
      drones[id] = {
        id: d.id, owner: d.owner, x: d.x, y: d.y, dir: d.dir,
        action: cloneAction(d.action), line: d.line, state: d.state,
        carrying: d.carrying, startX: d.startX, startY: d.startY,
      };
    }
    const snap = {
      t: state.t,
      size: state.size,
      tiles: state.tiles.map(cloneTile),
      drones,
      inv: Object.assign({}, state.inv),
      unlocked: Array.from(state.unlocked).sort(),
      levels: Object.assign({}, state.levels),
      totalMined: state.totalMined,
      rng: rng.getState(),
      events: state.events.slice(),
    };
    state.events = [];
    return snap;
  }

  function applySnapshot(snap) {
    if (!snap) return;
    state.t = snap.t;
    state.size = snap.size;
    state.tiles = (snap.tiles || []).map(cloneTile);
    state.inv = Object.assign({ stone: 0, coal: 0, iron: 0, gold: 0, crystal: 0 }, snap.inv);
    state.unlocked = new Set(snap.unlocked || []);
    state.levels = Object.assign(initialLevels(), snap.levels);
    state.totalMined = snap.totalMined || 0;
    if (snap.rng !== undefined && snap.rng !== null) rng.setState(snap.rng);
    state.events = (snap.events || []).slice();
    for (const id of state.order.slice()) removeDrone(id);
    const src = snap.drones || {};
    for (const id of Object.keys(src)) {
      const s = src[id];
      const d = {
        id: s.id, owner: s.owner, x: s.x, y: s.y, dir: s.dir,
        action: cloneAction(s.action), line: s.line === undefined ? null : s.line,
        state: s.state, carrying: s.carrying || 'none',
        startX: s.startX, startY: s.startY,
      };
      state.drones[id] = d;
      state.order.push(id);
      internals.set(id, { runner: null, resume: undefined, waiting: null, deathT: 0, source: null, api: null });
      inv(d).api = makeApi(d);
      if (!players.has(d.owner)) players.set(d.owner, { id: d.owner, color: null, program: null, droneSeq: 0 });
      const player = players.get(d.owner);
      const seq = Number(String(id).split(':').pop());
      if (Number.isFinite(seq) && seq > player.droneSeq) player.droneSeq = seq;
    }
  }

  const world = {
    TREE,
    rng,
    seed,
    get t() { return state.t; },
    get size() { return state.size; },
    get tiles() { return state.tiles; },
    get drones() { return state.drones; },
    get inv() { return state.inv; },
    get unlocked() { return state.unlocked; },
    get levels() { return state.levels; },
    get totalMined() { return state.totalMined; },
    get players() { return players; },
    tileAt,
    tileIndex: idx,
    dronesOf,
    maxDrones,
    addPlayer,
    removePlayer,
    runProgram,
    stopProgram,
    buy,
    tick,
    growGrid,
    snapshot,
    applySnapshot,
    on,
    off,
    emit,
    totalCostRemaining() { return remainingCost(state.levels); },
  };
  return world;
}

export { BOULDER_HP, ORE_KEYS };
