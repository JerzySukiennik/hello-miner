// Public entry for the DOM UI layer: lobby, HUD, code windows, tree, docs and toasts.

import { createLobby } from './lobby.js';
import { createHud } from './hud.js';
import { createWindows } from './windows.js';
import { createTree } from './tree.js';
import { createDocs } from './docs.js';
import { createLesson } from './lesson.js';
import { createToasts } from './toast.js';
import { COLORS as DEFAULT_COLORS, ORE_INFO as DEFAULT_ORE_INFO } from '../shared/constants.js';

export const BASE_ALLOWED = [
  'True', 'False', 'None', 'and', 'or', 'not', 'in', 'pass', 'break', 'continue',
  'up', 'down', 'left', 'right', 'none', 'stone', 'len', 'str', 'int', 'abs', 'min', 'max',
];

export function createUI(opts) {
  const root = opts.root || document.body;
  const lang = opts.lang;
  const TREE = opts.TREE || [];
  const COLORS = opts.COLORS || DEFAULT_COLORS;
  const ORE_INFO = opts.ORE_INFO || DEFAULT_ORE_INFO;
  const ORES = Object.keys(ORE_INFO);

  const listeners = new Map();
  const emit = (name, arg) => { for (const fn of listeners.get(name) || []) fn(arg); };

  const el = document.createElement('div');
  el.className = 'hm-ui';
  root.appendChild(el);

  let room = null;
  let localId = null;
  let snap = null;
  let players = {};
  let allowed = new Set(BASE_ALLOWED);
  const bound = new Set();
  const running = new Set();

  const toasts = createToasts();
  const lobby = createLobby({
    colors: COLORS,
    onCreate: (d) => emit('create', d),
    onJoin: (d) => emit('join', d),
  });
  const hud = createHud({
    ores: ORES,
    oreInfo: ORE_INFO,
    onTree: () => { tree.toggle(); const on = tree.isOpen(); el.classList.toggle('tree-open', on); document.body.classList.toggle('tree-open', on); },
    onDocs: () => docs.toggle(),
    onCursorToggle: () => refreshCursors(),
  });
  const wins = createWindows({
    lang,
    getAllowed: () => allowed,
    getLocalId: () => localId,
    onRun: (id) => emit('run', { playerId: id }),
    onStop: (id) => emit('stop', { playerId: id }),
    onCursor: (win, c) => {
      if (!room || !room.awareness || win !== localId) return;
      try { room.awareness.set({ cursor: { win, index: c.index, anchor: c.anchor } }); } catch (e) { /* offline */ }
    },
  });
  const tree = createTree({ tree: TREE, oreInfo: ORE_INFO, onBuy: (id) => emit('buy', { nodeId: id }) });
  const docs = createDocs();
  const lesson = createLesson();

  el.appendChild(wins.el);
  el.appendChild(hud.el);
  el.appendChild(toasts.el);
  el.appendChild(tree.el);
  el.appendChild(docs.el);
  el.appendChild(lesson.el);
  el.appendChild(lobby.el);
  docs.setAllowed(allowed);

  function refreshCursors() {
    if (!room || !room.awareness) return;
    let states = {};
    try { states = room.awareness.get() || {}; } catch (e) { return; }
    const perWin = new Map();
    for (const [pid, st] of Object.entries(states)) {
      if (pid === localId || !st || !st.cursor) continue;
      if (hud.hiddenCursors.has(pid)) continue;
      const win = st.cursor.win;
      if (!perWin.has(win)) perWin.set(win, []);
      perWin.get(win).push({
        nick: st.nick || (players[pid] && players[pid].nick) || pid,
        color: st.color || (players[pid] && players[pid].color) || '#ffffff',
        index: st.cursor.index || 0,
        anchor: st.cursor.anchor,
      });
    }
    for (const id of wins.ids()) wins.get(id).editor.setRemote(perWin.get(id) || []);
  }

  function syncWindows() {
    const ids = Object.keys(players);
    for (const id of ids) {
      if (!wins.has(id)) {
        wins.create(id, players[id]);
        bindDoc(id);
      } else wins.setPlayer(id, players[id]);
    }
    for (const id of wins.ids()) if (!players[id]) { wins.remove(id); bound.delete(id); }
    hud.setPlayers(players, localId);
    lobby.setTaken(Object.values(players).map((p) => p.color));
    refreshCursors();
  }

  function bindDoc(id) {
    if (!room || !room.doc || bound.has(id)) return;
    const w = wins.get(id);
    if (!w) return;
    try {
      w.editor.bindText(room.doc.getText(id));
      bound.add(id);
    } catch (e) { /* doc not ready */ }
  }

  function toPlainPlayers(src) {
    if (!src) return {};
    if (src instanceof Map) return Object.fromEntries(src);
    return { ...src };
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lobby.el.hidden === false) return;
      if (docs.isOpen()) { docs.close(); return; }
      e.preventDefault();
      tree.toggle();
      const on = tree.isOpen();
      el.classList.toggle('tree-open', on);
      document.body.classList.toggle('tree-open', on);
      return;
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || lobby.el.hidden === false) return;
    if (e.key === 'd' || e.key === 'D') docs.toggle();
  });

  const ui = {
    el,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return ui;
    },
    showLobby() { el.classList.add('lobby-open'); lobby.show(); },
    hideLobby() { el.classList.remove('lobby-open'); lobby.hide(); },
    lobbyError(msg) { lobby.error(msg); },
    toast(text, kind) { toasts.push(text, kind); },
    openWindow(id) { wins.open(id); },
    setRunning(id, on) {
      if (on) running.add(id); else running.delete(id);
      wins.setRunning(id, on);
    },
    setHostInfo(info) { hud.setHost(info); },
    setPlayers(next) {
      players = toPlainPlayers(next);
      syncWindows();
    },
    setSnapshot(next) {
      if (!next) return;
      snap = next;
      const unlocked = new Set(snap.unlocked || []);
      const prevAllowed = allowed;
      allowed = new Set([...BASE_ALLOWED, ...unlocked]);
      hud.setInv(snap.inv, unlocked);
      tree.update(snap);
      docs.setAllowed(allowed);
      if (prevAllowed.size !== allowed.size) {
        for (const id of wins.ids()) wins.get(id).editor.revalidate();
      }
      const lines = {};
      for (const d of Object.values(snap.drones || {})) {
        if (!d || !d.owner) continue;
        if (d.state === 'running' || d.state === 'waiting') {
          if (lines[d.owner] == null && d.line != null) lines[d.owner] = d.line;
        }
      }
      for (const id of wins.ids()) wins.get(id).editor.setExecLine(lines[id] == null ? null : lines[id]);
      for (const ev of snap.events || []) {
        if (ev.type === 'bought') { ui.toast('Unlocked ' + (ev.name || ev.node)); lesson.show(ev.node); }
        else if (ev.type === 'grow') ui.toast('The island grew to ' + (ev.size || snap.size) + '×' + (ev.size || snap.size));
        else if (ev.type === 'error') ui.toast(ev.message || 'Program error', 'error');
        else if (ev.type === 'died') ui.toast('A drone was lost', 'error');
      }
    },
    bindRoom(nextRoom) {
      room = nextRoom;
      if (!room) return;
      localId = room.id;
      hud.setCode(room.code);
      ui.setPlayers(room.players);
      for (const id of wins.ids()) bindDoc(id);
      if (typeof room.on === 'function') {
        room.on('players', (p) => ui.setPlayers(p || room.players));
        room.on('awareness', refreshCursors);
      }
      if (localId && wins.has(localId)) wins.open(localId);
    },
    getLocalId() { return localId; },
    showLesson(id) { lesson.show(id); },
    lessonLang() { return lesson.lang(); },
    destroy() { el.remove(); },
  };

  el.classList.add('lobby-open');
  lobby.show();
  return ui;
}
