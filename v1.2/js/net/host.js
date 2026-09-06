// Host election over RTDB: meta/host {id, beat}, 1 s heartbeat, 4 s staleness, takeover by transaction at the exact node.

import { TRANSPORT_PATHS as P } from './transport.js';

export const HEARTBEAT_MS = 1000;
export const STALE_MS = 4000;

export function createHostController(opts) {
  const { transport, code, id, isRelayOnly = false, onHost = () => {}, onError = () => {} } = opts;
  const path = P.host(code);

  let hostId = null;
  let isHost = false;
  let timer = null;
  let stopped = false;
  let claiming = false;
  let unsub = null;

  function emit() {
    onHost({ hostId, isHost });
  }

  function apply(value) {
    const nextId = value && typeof value === 'object' ? value.id || null : null;
    if (nextId === hostId) return;
    hostId = nextId;
    isHost = !!hostId && hostId === id;
    emit();
  }

  async function claim() {
    if (stopped || claiming || isRelayOnly) return;
    claiming = true;
    try {
      const res = await transport.transaction(path, (current) => {
        const now = transport.serverTime();
        if (!current || typeof current !== 'object' || !current.id) return { id, beat: now };
        if (current.id === id) return { id, beat: now };
        const beat = Number(current.beat) || 0;
        if (now - beat > STALE_MS) return { id, beat: now };
        return undefined;
      });
      if (res.committed) apply(res.value);
    } catch (err) {
      onError(err);
    } finally {
      claiming = false;
    }
  }

  async function tick() {
    if (stopped) return;
    try {
      if (isHost && !isRelayOnly) {
        await transport.set(path, { id, beat: transport.serverTime() });
      } else if (!isRelayOnly) {
        const current = await transport.get(path);
        const beat = current && typeof current === 'object' ? Number(current.beat) || 0 : 0;
        if (!current || !current.id || transport.serverTime() - beat > STALE_MS) await claim();
      }
    } catch (err) {
      onError(err);
    }
    if (!stopped) timer = transport.setTimeout(tick, HEARTBEAT_MS);
  }

  async function start() {
    unsub = transport.onValue(path, apply);
    await claim();
    timer = transport.setTimeout(tick, HEARTBEAT_MS);
  }

  return {
    start,
    claim,
    get hostId() { return hostId; },
    get isHost() { return isHost; },
    stopHeartbeat() { stopped = true; if (timer !== null) { transport.clearTimeout(timer); timer = null; } },
    async stop({ release = false } = {}) {
      stopped = true;
      if (timer !== null) { transport.clearTimeout(timer); timer = null; }
      if (unsub) { unsub(); unsub = null; }
      if (release && isHost) {
        try {
          await transport.transaction(path, (current) => (current && current.id === id ? null : undefined));
        } catch (err) {
          onError(err);
        }
      }
    },
  };
}
