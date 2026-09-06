// Integration glue: lobby -> room (Firebase or offline), host sim loop, client render/UI/audio loop.

import * as Y from 'yjs';
import * as lang from './lang/index.js';
import { createWorld, TREE } from './sim/index.js';
import { createRenderer } from './render/index.js';
import { createUI, BASE_ALLOWED } from './ui/index.js';
import { createRoom, createMemoryHub, createMemoryTransport, createFirebaseTransport, TRANSPORT_PATHS } from './net/index.js';
import { createAudio } from './audio/index.js';
import { COLORS, ORE_INFO, TICK_MS } from './shared/constants.js';

const SNAPSHOT_MS = 100;
const CONNECT_TIMEOUT_MS = 6000;
const MAX_CATCHUP_TICKS = 20;

const params = new URLSearchParams(location.search);
const CHEAT = params.get('cheat') === '1';

const canvas = document.getElementById('scene');
const uiRoot = document.getElementById('ui');
const muteBtn = document.getElementById('mute');

const renderer = createRenderer(canvas);
const audio = createAudio();
const ui = createUI({ root: uiRoot, lang, TREE, COLORS, ORE_INFO });

let room = null;
let hub = null;
let offline = false;
let world = null;
let lastSnap = null;
let lastEventT = -1;
let joining = false;

const compileErrors = Object.create(null);
let acc = 0;
let lastTickAt = performance.now();
let lastPublishAt = 0;
let lastCompileToast = null;

/* ---------- helpers ---------- */

function hashOf(text) {
  let h = 2166136261;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function allowedSet() {
  const unlocked = world ? Array.from(world.unlocked) : (lastSnap ? lastSnap.unlocked || [] : []);
  return new Set([...BASE_ALLOWED, ...unlocked]);
}

function isPermissionDenied(err) {
  const msg = String((err && (err.message || err.code)) || err || '').toLowerCase();
  return msg.includes('permission_denied') || msg.includes('permission denied');
}

function setUrlRoom(code) {
  const next = new URL(location.href);
  next.searchParams.set('room', code);
  history.replaceState(null, '', next.toString());
}

/* ---------- host sim ---------- */

function ensurePlayers(w, players) {
  for (const [pid, p] of Object.entries(players || {})) {
    const own = Object.values(w.drones).filter((d) => d.owner === pid);
    if (!own.length) { w.addPlayer(pid, p && p.color); continue; }
    if (w.players.has(pid)) continue;
    let seq = 0;
    for (const d of own) {
      const n = Number(String(d.id).split(':')[1] || 0);
      if (n > seq) seq = n;
    }
    w.players.set(pid, { id: pid, color: (p && p.color) || null, program: null, droneSeq: seq });
  }
  for (const pid of Array.from(w.players.keys())) {
    if (!players || !players[pid]) w.removePlayer(pid);
  }
}

function grantCheat(w) {
  if (!CHEAT) return;
  for (const k of Object.keys(w.inv)) w.inv[k] = 9999;
}

function startHosting(fromSnapshot) {
  world = createWorld({ seed: hashOf(room.code), lang });
  if (fromSnapshot) world.applySnapshot(fromSnapshot);
  ensurePlayers(world, room.players);
  grantCheat(world);
  acc = 0;
  lastTickAt = performance.now();
  lastPublishAt = 0;
}

function stopHosting() {
  world = null;
}

function handleCommand(cmd) {
  if (!world || !cmd || !cmd.from) return;
  const from = cmd.from;
  if (cmd.type === 'run') {
    let text = '';
    try { text = room.doc.getText(from).toString(); } catch (e) { text = ''; }
    const out = lang.compile(text, { allowed: allowedSet() });
    if (out.errors && out.errors.length) {
      const e = out.errors[0];
      compileErrors[from] = { line: e.line || 1, col: e.col || 0, message: e.message || String(e) };
      return;
    }
    delete compileErrors[from];
    world.runProgram(from, out.program);
  } else if (cmd.type === 'stop') {
    delete compileErrors[from];
    world.stopProgram(from);
  } else if (cmd.type === 'buy') {
    const nodeId = cmd.payload && (cmd.payload.nodeId || cmd.payload.id);
    if (nodeId) world.buy(nodeId);
  }
}

function pumpSim(now) {
  if (!world || !room || !room.isHost) return;
  let dt = now - lastTickAt;
  lastTickAt = now;
  if (dt < 0) dt = 0;
  if (dt > 1000) dt = 1000;
  acc += dt;
  let n = 0;
  while (acc >= TICK_MS && n < MAX_CATCHUP_TICKS) {
    world.tick(TICK_MS);
    acc -= TICK_MS;
    n++;
  }
  if (n >= MAX_CATCHUP_TICKS) acc = 0;
  if (now - lastPublishAt >= SNAPSHOT_MS) {
    lastPublishAt = now;
    const snap = world.snapshot();
    snap.errors = { ...compileErrors };
    room.publishSnapshot(snap);
    onSnapshot(snap);
  }
}

/* ---------- client loop ---------- */

function runningPlayers(snap) {
  const set = new Set();
  for (const d of Object.values(snap.drones || {})) {
    if (!d || !d.owner) continue;
    if (d.state === 'running' || d.state === 'waiting') set.add(d.owner);
  }
  return set;
}

function onSnapshot(snap) {
  if (!snap) return;
  lastSnap = snap;
  const fresh = snap.t > lastEventT;
  renderer.setSnapshot(snap, performance.now());
  ui.setSnapshot(snap);

  const localId = ui.getLocalId();
  const active = runningPlayers(snap);
  const known = new Set(Object.keys(snap.drones || {}).map((id) => String(id).split(':')[0]));
  for (const pid of new Set([...known, ...Object.keys(room ? room.players : {})])) {
    ui.setRunning(pid, active.has(pid));
  }

  if (fresh) {
    lastEventT = snap.t;
    const events = snap.events || [];
    audio.handleEvents(events);
    for (const ev of events) {
      if (ev && ev.type === 'print') renderer.bubble(ev.droneId, String(ev.text));
    }
  }

  const mine = snap.errors && localId ? snap.errors[localId] : null;
  if (mine && mine.message !== lastCompileToast) {
    lastCompileToast = mine.message;
    ui.toast(mine.message, 'error');
  } else if (!mine) {
    lastCompileToast = null;
  }
}

let lastRafAt = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  lastRafAt = now;
  pumpSim(now);
  renderer.frame(now);
}
requestAnimationFrame(frame);

setInterval(() => {
  const now = performance.now();
  if (now - lastRafAt > 150) pumpSim(now);
}, TICK_MS);

window.addEventListener('resize', () => renderer.resize());

/* ---------- offline transport clock ---------- */

async function driveHub(myHub) {
  let last = performance.now();
  while (hub === myHub) {
    await new Promise((r) => setTimeout(r, 25));
    const now = performance.now();
    const dt = now - last;
    last = now;
    try { await myHub.advance(dt); } catch (e) { console.warn('[main] offline clock:', e); }
  }
}

/* ---------- room wiring ---------- */

function wireRoom(created) {
  room = created;
  ui.bindRoom(room);
  ui.hideLobby();
  renderer.setPlayers(room.players);
  ui.setHostInfo({ isHost: room.isHost, hostNick: hostNick() });
  muteBtn.hidden = false;

  room.on('players', (players) => {
    renderer.setPlayers(players);
    ui.setHostInfo({ isHost: room.isHost, hostNick: hostNick() });
    if (world && room.isHost) ensurePlayers(world, players);
  });

  room.on('snapshot', onSnapshot);
  room.on('command', handleCommand);

  room.on('host', ({ isHost }) => {
    ui.setHostInfo({ isHost, hostNick: hostNick() });
    if (isHost && !world) {
      startHosting(lastSnap);
      ui.toast('You are the host now');
      ui.toast('Click ▶ again to restart your program');
    } else if (!isHost && world) {
      stopHosting();
    }
  });

  room.on('error', (err) => {
    if (!offline && isPermissionDenied(err)) return;
    console.warn('[net]', err);
  });

  if (room.isHost) startHosting(null);
}

function hostNick() {
  if (!room) return '';
  const p = room.players[room.hostId];
  return p ? p.nick : '';
}

async function tryFirebase(code, nick, color) {
  const transport = createFirebaseTransport({ config: window.__FIREBASE_CONFIG__ });
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS);
  });
  try {
    if (code) {
      const existing = await Promise.race([transport.get(TRANSPORT_PATHS.players(code)), timeout]);
      if (!existing || !Object.keys(existing).length) {
        clearTimeout(timer);
        transport.close();
        const miss = new Error('room not found');
        miss.notFound = true;
        throw miss;
      }
    }
    const created = await Promise.race([createRoom({ transport, Y, code, nick, color }), timeout]);
    clearTimeout(timer);
    return created;
  } catch (err) {
    clearTimeout(timer);
    try { transport.close(); } catch (e) { /* already closed */ }
    throw err;
  }
}

async function goOffline(code, nick, color, reason) {
  offline = true;
  hub = createMemoryHub({ startTime: Date.now() });
  driveHub(hub);
  const transport = createMemoryTransport(hub);
  const created = await createRoom({ transport, Y, code: code || null, nick, color });
  wireRoom(created);
  setUrlRoom(created.code);
  ui.toast(reason === 'notfound'
    ? 'Playing offline — no room found'
    : 'Playing offline — no connection');
}

async function connect(detail, wantCode) {
  if (joining) return;
  joining = true;
  const nick = detail.nick || 'miner';
  const color = detail.color || COLORS[0].hex;
  const code = wantCode ? String(detail.code || '').toUpperCase() : null;
  try {
    const created = await tryFirebase(code, nick, color);
    wireRoom(created);
    setUrlRoom(created.code);
  } catch (err) {
    console.warn('[main] falling back to offline:', err && err.message ? err.message : err);
    try {
      await goOffline(code, nick, color, err && err.notFound ? 'notfound' : 'offline');
    } catch (fatal) {
      ui.lobbyError('Could not start a game: ' + (fatal && fatal.message ? fatal.message : fatal));
      joining = false;
      return;
    }
  }
  joining = false;
  audio.unlock();
}

ui.on('create', (d) => connect(d, false));
ui.on('join', (d) => connect(d, true));
ui.on('run', ({ playerId }) => { if (room) room.sendCommand('run', { playerId }); });
ui.on('stop', ({ playerId }) => { if (room) room.sendCommand('stop', { playerId }); });
ui.on('buy', ({ nodeId }) => { if (room) room.sendCommand('buy', { nodeId }); });

/* ---------- audio unlock + mute ---------- */

let unlocked = false;
function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

muteBtn.setAttribute('aria-pressed', String(audio.isMuted()));
muteBtn.addEventListener('click', () => {
  const next = audio.setMuted(!audio.isMuted());
  muteBtn.setAttribute('aria-pressed', String(next));
  muteBtn.title = next ? 'Unmute sound (M)' : 'Mute sound (M)';
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'm' && e.key !== 'M') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  muteBtn.click();
});

window.addEventListener('beforeunload', () => {
  if (room) { try { room.leave(); } catch (e) { /* closing anyway */ } }
});

window.__hm = { get room() { return room; }, get world() { return world; }, get snap() { return lastSnap; }, renderer, ui, audio, lang };
