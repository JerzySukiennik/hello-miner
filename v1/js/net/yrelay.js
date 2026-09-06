// Yjs document relay over RTDB: base64 update fan-out, snapshot bootstrap, per-owner compaction every 200 updates.

import { TRANSPORT_PATHS as P } from './transport.js';

export const COMPACT_EVERY = 200;
const ORIGIN = 'net-remote';

export function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function fromB64(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function createYRelay(opts) {
  const { transport, code, id, Y, doc, onError = () => {} } = opts;

  const myKeys = new Set();
  const unsubs = [];
  let localCount = 0;
  let destroyed = false;
  let compacting = false;

  function applyRemote(b64) {
    try {
      Y.applyUpdate(doc, fromB64(b64), ORIGIN);
    } catch (err) {
      onError(err);
    }
  }

  async function compact() {
    if (compacting || destroyed) return;
    compacting = true;
    const keys = Array.from(myKeys);
    myKeys.clear();
    try {
      const state = Y.encodeStateAsUpdate(doc);
      await transport.set(P.ysnapshotOwner(code, id), { from: id, b64: toB64(state), at: transport.serverTime() });
      for (const key of keys) await transport.remove(P.yupdate(code, key));
    } catch (err) {
      onError(err);
    } finally {
      compacting = false;
    }
  }

  const onUpdate = (update, origin) => {
    if (destroyed || origin === ORIGIN) return;
    const b64 = toB64(update);
    transport.push(P.yupdates(code), { from: id, b64 })
      .then((key) => {
        if (key) myKeys.add(key);
        localCount += 1;
        if (localCount % COMPACT_EVERY === 0) compact();
      })
      .catch(onError);
  };

  const appliedSnapshots = new Map();

  function applySnapshotMap(snaps) {
    if (!snaps || typeof snaps !== 'object') return;
    for (const [owner, snap] of Object.entries(snaps)) {
      if (owner === id || !snap || !snap.b64) continue;
      const stamp = `${snap.at || 0}:${snap.b64.length}`;
      if (appliedSnapshots.get(owner) === stamp) continue;
      appliedSnapshots.set(owner, stamp);
      applyRemote(snap.b64);
    }
  }

  async function start() {
    applySnapshotMap(await transport.get(P.ysnapshot(code)));
    unsubs.push(transport.onValue(P.ysnapshot(code), (snaps) => {
      if (destroyed) return;
      applySnapshotMap(snaps);
    }));
    unsubs.push(transport.onChildAdded(P.yupdates(code), (key, item) => {
      if (destroyed || !item || !item.b64 || item.from === id) return;
      applyRemote(item.b64);
    }));
    doc.on('update', onUpdate);
  }

  return {
    start,
    compact,
    get localUpdateCount() { return localCount; },
    destroy() {
      destroyed = true;
      doc.off('update', onUpdate);
      for (const u of unsubs) u();
      unsubs.length = 0;
    },
  };
}
