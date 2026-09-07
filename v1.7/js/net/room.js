// Room: presence, host election, 10 Hz snapshots, command queue, Yjs relay and 50 ms awareness over one transport.

import { createFirebaseTransport, TRANSPORT_PATHS as P } from './transport.js';
import { createMemoryTransport, createMemoryHub } from './transport-memory.js';
import { createHostController } from './host.js';
import { createYRelay } from './yrelay.js';

export const SNAPSHOT_MS = 100;
export const AWARENESS_MS = 50;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const EVENTS = ['players', 'host', 'snapshot', 'command', 'awareness', 'join', 'leave', 'error'];

export const TRANSPORTS = {
  firebase: createFirebaseTransport,
  memory: createMemoryTransport,
  createMemoryHub,
};

export function generateCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function isValidCode(code) {
  return /^[A-Z]{4}$/.test(String(code || ''));
}

function makeId() {
  return `p${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}`;
}

async function resolveY(injected) {
  if (injected) return injected;
  return import('./yjs-shim.js');
}

export async function createRoom(opts = {}) {
  const {
    config = null,
    transport: givenTransport = null,
    code: givenCode = null,
    nick = 'miner',
    color = null,
    isRelayOnly = false,
  } = opts;

  const code = givenCode ? String(givenCode).toUpperCase() : generateCode();
  if (!isValidCode(code)) throw new Error(`room code must match [A-Z]{4}, got "${code}"`);

  const transport = givenTransport || createFirebaseTransport({ config });
  const Y = await resolveY(opts.Y);
  const id = opts.id || makeId();

  const listeners = new Map(EVENTS.map((e) => [e, new Set()]));
  const emit = (event, payload) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (err) { console.warn(`[net] ${event} handler threw:`, err); }
    }
  };
  const onError = (err) => emit('error', err);

  const doc = new Y.Doc();
  const players = {};
  const awarenessState = {};
  const unsubs = [];

  let left = false;
  let cmdUnsub = null;
  let snapshotWritePending = false;
  let lastSnapshotAt = 0;
  let lastPublished = null;
  let awarenessTimer = null;
  let awarenessLastAt = 0;
  let awarenessDirty = false;
  const localAwareness = { nick, color, cursor: null };

  const room = {
    id,
    code,
    isHost: false,
    hostId: null,
    players,
    doc,
    transport,
    on(event, fn) {
      const set = listeners.get(event);
      if (set && typeof fn === 'function') set.add(fn);
      return room;
    },
    off(event, fn) {
      const set = listeners.get(event);
      if (set) set.delete(fn);
      return room;
    },
    awareness: {
      set(partial) {
        Object.assign(localAwareness, partial || {});
        scheduleAwareness();
      },
      get() {
        return { ...awarenessState, [id]: { ...localAwareness, lastSeen: transport.serverTime() } };
      },
    },
    publishSnapshot(snap) {
      if (left || !room.isHost || isRelayOnly || !snap) return false;
      if (snapshotWritePending) return false;
      const now = transport.now();
      if (now - lastSnapshotAt < SNAPSHOT_MS) return false;
      lastSnapshotAt = now;
      snapshotWritePending = true;
      const json = JSON.stringify(snap);
      lastPublished = json;
      transport.set(P.state(code), json)
        .catch(onError)
        .finally(() => { snapshotWritePending = false; });
      return true;
    },
    async sendCommand(type, payload = null) {
      if (left) return null;
      try {
        return await transport.push(P.cmd(code), { from: id, type, payload, t: transport.serverTime() });
      } catch (err) {
        onError(err);
        return null;
      }
    },
    async leave() {
      if (left) return;
      left = true;
      if (awarenessTimer !== null) transport.clearTimeout(awarenessTimer);
      relay.destroy();
      if (cmdUnsub) { cmdUnsub(); cmdUnsub = null; }
      for (const u of unsubs) u();
      unsubs.length = 0;
      await hostCtl.stop({ release: true });
      if (!isRelayOnly) {
        try {
          await transport.remove(P.player(code, id));
          await transport.remove(P.presenceItem(code, id));
        } catch (err) { onError(err); }
      }
    },
  };

  function scheduleAwareness() {
    if (left) return;
    awarenessDirty = true;
    if (awarenessTimer !== null) return;
    const now = transport.now();
    const wait = Math.max(0, AWARENESS_MS - (now - awarenessLastAt));
    awarenessTimer = transport.setTimeout(() => {
      awarenessTimer = null;
      if (left || !awarenessDirty) return;
      awarenessDirty = false;
      awarenessLastAt = transport.now();
      transport.set(P.presenceItem(code, id), {
        nick: localAwareness.nick ?? nick,
        color: localAwareness.color ?? color,
        cursor: localAwareness.cursor ?? null,
        lastSeen: transport.serverTime(),
      }).catch(onError);
    }, wait);
  }

  function subscribeCommands() {
    if (cmdUnsub || left) return;
    cmdUnsub = transport.onChildAdded(P.cmd(code), (key, value) => {
      if (left || !room.isHost || !value) return;
      emit('command', { from: value.from, type: value.type, payload: value.payload ?? null });
      transport.remove(P.cmdItem(code, key)).catch(onError);
    });
  }

  function unsubscribeCommands() {
    if (cmdUnsub) { cmdUnsub(); cmdUnsub = null; }
  }

  const hostCtl = createHostController({
    transport,
    code,
    id,
    isRelayOnly,
    onError,
    onHost({ hostId, isHost }) {
      room.hostId = hostId;
      room.isHost = isHost;
      if (isHost) subscribeCommands();
      else unsubscribeCommands();
      emit('host', { hostId, isHost });
    },
  });

  const relay = createYRelay({ transport, code, id, Y, doc, onError });

  unsubs.push(transport.onValue(P.players(code), (value) => {
    const next = value && typeof value === 'object' ? value : {};
    const before = new Set(Object.keys(players));
    for (const key of before) if (!(key in next)) delete players[key];
    for (const [pid, entry] of Object.entries(next)) {
      players[pid] = { nick: entry?.nick ?? '', color: entry?.color ?? null, joinedAt: entry?.joinedAt ?? 0 };
      if (!before.has(pid)) emit('join', { id: pid, ...players[pid] });
    }
    for (const key of before) if (!(key in next)) emit('leave', { id: key });
    emit('players', { ...players });
  }));

  unsubs.push(transport.onValue(P.state(code), (value) => {
    if (left || typeof value !== 'string' || value === lastPublished) return;
    try {
      emit('snapshot', JSON.parse(value));
    } catch (err) {
      onError(err);
    }
  }));

  unsubs.push(transport.onValue(P.presence(code), (value) => {
    const next = value && typeof value === 'object' ? value : {};
    for (const key of Object.keys(awarenessState)) delete awarenessState[key];
    for (const [pid, entry] of Object.entries(next)) awarenessState[pid] = entry;
    emit('awareness', room.awareness.get());
  }));

  if (!isRelayOnly) {
    await transport.onDisconnect(P.player(code, id)).remove();
    await transport.onDisconnect(P.presenceItem(code, id)).remove();
    await transport.set(P.player(code, id), { nick, color, joinedAt: transport.serverTime() });
    scheduleAwareness();
  }

  await relay.start();
  await hostCtl.start();

  return room;
}
