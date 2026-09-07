/* Transport interface for js/net plus the Firebase RTDB implementation.
 *
 * A transport is a tiny key/value tree with change subscriptions. Every path is
 * a slash-joined string relative to the database prefix ("helloMiner"), e.g.
 * "rooms/ABCD/meta/host". The transport prepends the prefix; nothing else in
 * js/net concatenates a database path by hand.
 *
 *   get(path)                  -> Promise<value|null>            read once
 *   set(path, value)           -> Promise<void>                  replace node
 *   update(path, obj)          -> Promise<void>                  merge children
 *   push(path, value)          -> Promise<key>                   append child
 *   remove(path)               -> Promise<void>                  delete node
 *   onValue(path, cb)          -> unsubscribe                    cb(value|null)
 *   onChildAdded(path, cb)     -> unsubscribe                    cb(key, value)
 *   onDisconnect(path)         -> {remove(), cancel()}           server-side cleanup
 *   transaction(path, fn)      -> Promise<{committed, value}>    fn(current) -> next|undefined
 *   serverTime()               -> number                         ms, clock-skew corrected
 *   now()                      -> number                         ms, transport clock
 *   setTimeout(fn, ms)         -> handle                         transport clock timer
 *   clearTimeout(handle)       -> void
 *   close()                    -> void                           drop all subscriptions
 *
 * Rules of the interface: transaction() reads at the exact node it writes,
 * onChildAdded() also fires for children that already exist at subscribe time,
 * and timers go through the transport so a test clock can drive the room.
 */

const DEFAULT_PREFIX = 'helloMiner';

export function createFirebaseTransport(opts = {}) {
  const config = opts.config || (typeof window !== 'undefined' ? window.__FIREBASE_CONFIG__ : null);
  const prefix = String(opts.prefix || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, '');
  if (!config || !config.databaseURL) throw new Error('firebase transport needs a config with databaseURL');

  let fb = null;
  let db = null;
  let offsetMs = 0;
  const subs = new Set();
  const disconnects = new Set();

  const full = (path) => [prefix, String(path || '').replace(/^\/+|\/+$/g, '')].filter(Boolean).join('/');

  async function boot() {
    if (fb) return;
    const [appMod, dbMod] = await Promise.all([import('firebase/app'), import('firebase/database')]);
    const app = appMod.getApps && appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(config);
    fb = dbMod;
    db = dbMod.getDatabase(app);
    dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), (snap) => {
      const v = Number(snap.val());
      if (Number.isFinite(v)) offsetMs = v;
    });
  }

  const ready = boot();

  return {
    kind: 'firebase',
    prefix,
    async get(path) {
      await ready;
      const snap = await fb.get(fb.ref(db, full(path)));
      return snap.exists() ? snap.val() : null;
    },
    async set(path, value) {
      await ready;
      await fb.set(fb.ref(db, full(path)), value);
    },
    async update(path, obj) {
      await ready;
      await fb.update(fb.ref(db, full(path)), obj);
    },
    async push(path, value) {
      await ready;
      const r = fb.push(fb.ref(db, full(path)));
      await fb.set(r, value);
      return r.key;
    },
    async remove(path) {
      await ready;
      await fb.remove(fb.ref(db, full(path)));
    },
    onValue(path, cb) {
      let off = null;
      let live = true;
      ready.then(() => {
        if (!live) return;
        off = fb.onValue(fb.ref(db, full(path)), (snap) => cb(snap.exists() ? snap.val() : null), () => cb(null));
      });
      const unsub = () => { live = false; if (off) { off(); off = null; } subs.delete(unsub); };
      subs.add(unsub);
      return unsub;
    },
    onChildAdded(path, cb) {
      let off = null;
      let live = true;
      ready.then(() => {
        if (!live) return;
        off = fb.onChildAdded(fb.ref(db, full(path)), (snap) => cb(snap.key, snap.val()), () => {});
      });
      const unsub = () => { live = false; if (off) { off(); off = null; } subs.delete(unsub); };
      subs.add(unsub);
      return unsub;
    },
    onDisconnect(path) {
      const handle = {
        remove: async () => {
          await ready;
          const od = fb.onDisconnect(fb.ref(db, full(path)));
          disconnects.add(od);
          await od.remove();
        },
        cancel: async () => {
          await ready;
          const od = fb.onDisconnect(fb.ref(db, full(path)));
          await od.cancel();
        },
      };
      return handle;
    },
    async transaction(path, fn) {
      await ready;
      const res = await fb.runTransaction(fb.ref(db, full(path)), (current) => fn(current));
      return { committed: !!res.committed, value: res.snapshot ? res.snapshot.val() : null };
    },
    serverTime() { return Date.now() + offsetMs; },
    now() { return Date.now(); },
    setTimeout(fn, ms) { return setTimeout(fn, ms); },
    clearTimeout(h) { clearTimeout(h); },
    close() { for (const u of Array.from(subs)) u(); subs.clear(); disconnects.clear(); },
  };
}

export const TRANSPORT_PATHS = {
  room: (code) => `rooms/${code}`,
  players: (code) => `rooms/${code}/players`,
  player: (code, id) => `rooms/${code}/players/${id}`,
  host: (code) => `rooms/${code}/meta/host`,
  state: (code) => `rooms/${code}/state`,
  cmd: (code) => `rooms/${code}/cmd`,
  cmdItem: (code, key) => `rooms/${code}/cmd/${key}`,
  yupdates: (code) => `rooms/${code}/yupdates`,
  yupdate: (code, key) => `rooms/${code}/yupdates/${key}`,
  ysnapshot: (code) => `rooms/${code}/ysnapshot`,
  ysnapshotOwner: (code, id) => `rooms/${code}/ysnapshot/${id}`,
  presence: (code) => `rooms/${code}/presence`,
  presenceItem: (code, id) => `rooms/${code}/presence/${id}`,
};
