// Node test for js/net over the in-memory transport: presence, host election and takeover, commands, snapshots, Yjs convergence, awareness.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createRoom, generateCode, isValidCode } from '../js/net/index.js';
import { createMemoryHub, createMemoryTransport } from '../js/net/transport-memory.js';
import { COMPACT_EVERY } from '../js/net/yrelay.js';

const require = createRequire(import.meta.url);
const Y = require('../Niepotrzebne/nettest/node_modules/yjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const hub = createMemoryHub();
const CODE = 'MINE';
const transports = [];

async function join(nick, color, extra = {}) {
  const transport = createMemoryTransport(hub);
  transports.push(transport);
  const room = await createRoom({ transport, Y, code: CODE, nick, color, ...extra });
  await hub.advance(10);
  return room;
}

console.log('net: room code');
check('generateCode matches [A-Z]{4}', () => {
  for (let i = 0; i < 200; i++) assert.ok(isValidCode(generateCode()));
});

console.log('net: three clients join');
const a = await join('ada', 'amber');
const b = await join('bo', 'sky');
const c = await join('cy', 'mint');
await hub.advance(50);

check('all three see three players', () => {
  for (const r of [a, b, c]) assert.equal(Object.keys(r.players).length, 3, `${r.id} sees ${Object.keys(r.players).length}`);
});
check('players map carries nick and color', () => {
  assert.equal(c.players[a.id].nick, 'ada');
  assert.equal(c.players[b.id].color, 'sky');
});
check('exactly one host, agreed by all', () => {
  const hosts = [a, b, c].filter((r) => r.isHost);
  assert.equal(hosts.length, 1);
  assert.equal(a.hostId, b.hostId);
  assert.equal(b.hostId, c.hostId);
  assert.equal(a.hostId, a.id, 'first joiner should have claimed the empty host node');
});

console.log('net: commands');
const hostRoom = [a, b, c].find((r) => r.isHost);
const clientRoom = [a, b, c].find((r) => !r.isHost);
const hostCmds = [];
const clientCmds = [];
hostRoom.on('command', (cmd) => hostCmds.push(cmd));
clientRoom.on('command', (cmd) => clientCmds.push(cmd));
await clientRoom.sendCommand('run', { source: 'move(up)' });
await hub.advance(20);

check('command reaches the host only', () => {
  assert.equal(hostCmds.length, 1);
  assert.equal(hostCmds[0].type, 'run');
  assert.equal(hostCmds[0].from, clientRoom.id);
  assert.deepEqual(hostCmds[0].payload, { source: 'move(up)' });
  assert.equal(clientCmds.length, 0);
});
check('host consumes the queue entry', () => {
  assert.equal(hub.read(`helloMiner/rooms/${CODE}/cmd`), null);
});

console.log('net: snapshots');
const seen = new Map([[a.id, []], [b.id, []], [c.id, []]]);
for (const r of [a, b, c]) r.on('snapshot', (s) => seen.get(r.id).push(s));
hostRoom.publishSnapshot({ t: 1, size: 1, tiles: [{ ore: 'stone' }] });
await hub.advance(10);

check('non-host clients receive the snapshot', () => {
  for (const r of [a, b, c]) {
    const got = seen.get(r.id);
    if (r === hostRoom) assert.equal(got.length, 0, 'host should not echo its own snapshot');
    else assert.equal(got.length, 1, `${r.id} got ${got.length} snapshots`);
  }
  assert.equal(seen.get(clientRoom.id)[0].tiles[0].ore, 'stone');
});
check('publish is throttled to 10 Hz', () => {
  assert.equal(hostRoom.publishSnapshot({ t: 2 }), false);
});
await hub.advance(120);
check('next publish accepted', () => {
  assert.equal(hostRoom.publishSnapshot({ t: 3 }), true);
});
check('non-host publish is refused', () => {
  assert.equal(clientRoom.publishSnapshot({ t: 4 }), false);
});
await hub.advance(20);

console.log('net: yjs convergence');
a.doc.getText(a.id).insert(0, 'move(up)\n');
b.doc.getText(b.id).insert(0, 'mine()\n');
await hub.advance(20);

check('edits from two owners converge on all three', () => {
  for (const r of [a, b, c]) {
    assert.equal(r.doc.getText(a.id).toString(), 'move(up)\n', `${r.id} text A`);
    assert.equal(r.doc.getText(b.id).toString(), 'mine()\n', `${r.id} text B`);
  }
});

a.doc.getText('shared').insert(0, 'AAA');
b.doc.getText('shared').insert(0, 'BBB');
c.doc.getText('shared').insert(0, 'CCC');
await hub.advance(20);

check('concurrent edits to one text converge identically', () => {
  const texts = [a, b, c].map((r) => r.doc.getText('shared').toString());
  assert.equal(texts[0].length, 9);
  assert.equal(texts[0], texts[1]);
  assert.equal(texts[1], texts[2]);
  for (const part of ['AAA', 'BBB', 'CCC']) assert.ok(texts[0].includes(part), `missing ${part}`);
});

console.log('net: compaction');
for (let i = 0; i < COMPACT_EVERY + 5; i++) {
  a.doc.getText(a.id).insert(0, 'x');
  if (i % 20 === 0) await hub.advance(1);
}
await hub.advance(50);

check('owner wrote a ysnapshot and pruned its updates', () => {
  const snaps = hub.read(`helloMiner/rooms/${CODE}/ysnapshot`);
  assert.ok(snaps && snaps[a.id] && typeof snaps[a.id].b64 === 'string');
  const updates = hub.read(`helloMiner/rooms/${CODE}/yupdates`) || {};
  const mine = Object.values(updates).filter((u) => u.from === a.id);
  assert.ok(mine.length < COMPACT_EVERY, `expected pruning, ${mine.length} of A's updates left`);
});
check('live clients stayed converged through compaction', () => {
  const want = a.doc.getText(a.id).toString();
  assert.equal(b.doc.getText(a.id).toString(), want);
  assert.equal(c.doc.getText(a.id).toString(), want);
});

const d = await join('dee', 'coral');
await hub.advance(50);
check('late fourth joiner converges from snapshot + remaining updates', () => {
  assert.equal(d.doc.getText(a.id).toString(), a.doc.getText(a.id).toString());
  assert.equal(d.doc.getText(b.id).toString(), b.doc.getText(b.id).toString());
  assert.equal(d.doc.getText('shared').toString(), a.doc.getText('shared').toString());
});
check('late joiner is seen by everyone and does not steal host', () => {
  assert.equal(Object.keys(a.players).length, 4);
  assert.equal(d.hostId, hostRoom.id);
  assert.equal(d.isHost, false);
});

console.log('net: awareness');
const awareness = [];
b.on('awareness', (m) => awareness.push(m));
a.awareness.set({ cursor: { win: a.id, index: 4, anchor: 4 } });
a.awareness.set({ cursor: { win: a.id, index: 7, anchor: 7 } });
await hub.advance(100);

check('cursor propagates to another client', () => {
  const state = b.awareness.get();
  assert.ok(state[a.id], 'no presence entry for A');
  assert.equal(state[a.id].cursor.index, 7);
  assert.equal(state[a.id].nick, 'ada');
  assert.ok(awareness.length > 0);
});
check('awareness writes are coalesced by the 50 ms throttle', () => {
  assert.ok(awareness.length <= 6, `too many awareness events: ${awareness.length}`);
});
check('own state is included in awareness.get()', () => {
  assert.equal(a.awareness.get()[a.id].cursor.index, 7);
});

console.log('net: host death and takeover');
const hostIndex = [a, b, c, d].indexOf(hostRoom);
const hostTransport = transports[hostIndex];
const hostChanges = [];
for (const r of [a, b, c, d]) if (r !== hostRoom) r.on('host', (h) => hostChanges.push({ who: r.id, ...h }));
hostTransport.simulateDisconnect();
await hub.advance(2000);
check('no takeover while the beat is still fresh', () => {
  const early = [a, b, c, d].filter((r) => r !== hostRoom && r.isHost);
  assert.equal(early.length, 0, 'someone claimed host before the 4 s staleness window');
});
await hub.advance(3500);

check('presence of the dead host was removed by onDisconnect', () => {
  const live = hub.read(`helloMiner/rooms/${CODE}/players`) || {};
  assert.ok(!live[hostRoom.id], 'dead host still listed as a player');
  const presence = hub.read(`helloMiner/rooms/${CODE}/presence`) || {};
  assert.ok(!presence[hostRoom.id], 'dead host still listed in presence');
});
check('survivors see three players', () => {
  for (const r of [a, b, c, d]) {
    if (r === hostRoom) continue;
    assert.equal(Object.keys(r.players).length, 3, `${r.id} sees ${Object.keys(r.players).length}`);
  }
});
const newHost = [a, b, c, d].find((r) => r !== hostRoom && r.isHost);
check('exactly one survivor took over within 5 s', () => {
  const hosts = [a, b, c, d].filter((r) => r !== hostRoom && r.isHost);
  assert.equal(hosts.length, 1, `hosts after takeover: ${hosts.length}`);
  assert.ok(newHost);
  assert.notEqual(newHost.id, hostRoom.id);
});
check('every survivor agrees on the new host', () => {
  for (const r of [a, b, c, d]) {
    if (r === hostRoom) continue;
    assert.equal(r.hostId, newHost.id, `${r.id} thinks host is ${r.hostId}`);
  }
  assert.ok(hostChanges.some((h) => h.hostId === newHost.id));
});

console.log('net: after takeover');
const afterCmds = [];
newHost.on('command', (cmd) => afterCmds.push(cmd));
const other = [a, b, c, d].find((r) => r !== hostRoom && r !== newHost);
await other.sendCommand('buy', { node: 'grid' });
await hub.advance(20);
const afterSnaps = [];
other.on('snapshot', (s) => afterSnaps.push(s));
newHost.publishSnapshot({ t: 99, size: 2 });
await hub.advance(20);

check('new host consumes commands', () => {
  assert.equal(afterCmds.length, 1);
  assert.equal(afterCmds[0].type, 'buy');
});
check('new host publishes snapshots', () => {
  assert.equal(afterSnaps.length, 1);
  assert.equal(afterSnaps[0].t, 99);
});

console.log('net: leave');
await other.leave();
await hub.advance(20);
check('leave removes presence and player entry', () => {
  const live = hub.read(`helloMiner/rooms/${CODE}/players`) || {};
  assert.ok(!live[other.id]);
  assert.equal(Object.keys(newHost.players).length, 2);
});

console.log('net: relay-only client');
const relayTransport = createMemoryTransport(hub);
transports.push(relayTransport);
const spectator = await createRoom({ transport: relayTransport, Y, code: CODE, nick: 'watch', color: null, isRelayOnly: true });
await hub.advance(50);
check('relay-only client is not a player and never hosts', () => {
  assert.equal(spectator.isHost, false);
  assert.equal(Object.keys(newHost.players).length, 2);
  assert.equal(spectator.doc.getText('shared').toString(), newHost.doc.getText('shared').toString());
});

for (const r of [a, b, c, d, spectator]) { try { await r.leave(); } catch { /* already gone */ } }
console.log(`\nnet: ${passed} checks passed`);
