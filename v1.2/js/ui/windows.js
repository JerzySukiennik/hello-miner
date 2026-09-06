// Floating, draggable code windows — one per player, each hosting a shared editor.

import { createEditor } from './editor.js';

const MIN_W = 280;
const MIN_H = 150;

function hexToRgba(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function icon(name) {
  if (name === 'run') return '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 1.2 10.4 6 2 10.8z" fill="currentColor"/></svg>';
  if (name === 'stop') return '<svg width="11" height="11" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/></svg>';
  return '<svg width="11" height="11" viewBox="0 0 12 12"><rect x="2" y="5.4" width="8" height="1.6" rx=".8" fill="currentColor"/></svg>';
}

export function createWindows(opts) {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  const dock = document.createElement('div');
  dock.className = 'win-dock';
  layer.appendChild(dock);

  const wins = new Map();
  let z = 100;
  let cascade = 0;

  function viewport() {
    return {
      w: layer.clientWidth || window.innerWidth || 1280,
      h: layer.clientHeight || window.innerHeight || 800,
    };
  }

  function place(w) {
    if (w.moved) return;
    const v = viewport();
    const vw = v.w;
    const vh = v.h;
    const width = Math.min(420, Math.max(MIN_W, vw - 48));
    const height = Math.min(320, Math.max(MIN_H, vh - 200));
    w.el.style.width = width + 'px';
    w.el.style.height = height + 'px';
    const cols = Math.max(1, Math.floor((vw - 24) / (width + 14)));
    const i = w.slot;
    w.x = 24 + (i % cols) * (width + 14) + Math.floor(i / cols) * 22;
    w.y = 104 + Math.floor(i / cols) * 34;
    clamp(w);
    w.editor.refresh();
  }

  function clamp(w) {
    const v = viewport();
    const maxX = Math.max(0, v.w - w.el.offsetWidth);
    const maxY = Math.max(0, v.h - 40);
    w.x = Math.min(Math.max(0, w.x), maxX);
    w.y = Math.min(Math.max(0, w.y), maxY);
    w.el.style.left = w.x + 'px';
    w.el.style.top = w.y + 'px';
  }

  function focus(w) {
    z += 1;
    if (z > 8000) {
      z = 100;
      for (const o of wins.values()) o.el.style.zIndex = (z += 1);
    }
    w.el.style.zIndex = z;
  }

  function drag(w, handle, mode) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.icon-btn')) return;
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      focus(w);
      w.moved = true;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = w.x;
      const oy = w.y;
      const ow = w.el.offsetWidth;
      const oh = w.el.offsetHeight;
      const move = (ev) => {
        if (mode === 'move') {
          w.x = ox + (ev.clientX - sx);
          w.y = oy + (ev.clientY - sy);
          clamp(w);
        } else {
          w.el.style.width = Math.max(MIN_W, ow + (ev.clientX - sx)) + 'px';
          w.el.style.height = Math.max(MIN_H, oh + (ev.clientY - sy)) + 'px';
          w.editor.refresh();
        }
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function create(id, player) {
    if (wins.has(id)) return wins.get(id);
    const el = document.createElement('div');
    el.className = 'win panel';
    el.dataset.player = id;
    el.innerHTML =
      '<div class="win-head">' +
      '<button class="icon-btn w-run" title="Run">' + icon('run') + '</button>' +
      '<button class="icon-btn w-stop" title="Stop">' + icon('stop') + '</button>' +
      '<div class="win-title"></div>' +
      '<button class="icon-btn w-min" title="Minimise">' + icon('min') + '</button>' +
      '</div><div class="win-body"></div><div class="win-foot"></div><div class="win-grip"></div>';

    const foot = el.querySelector('.win-foot');
    const editor = createEditor({
      lang: opts.lang,
      getAllowed: opts.getAllowed,
      onCursor: (c) => opts.onCursor(id, c),
      onErrors: (errs) => {
        foot.classList.toggle('bad', errs.length > 0);
        foot.textContent = errs.length ? 'Line ' + errs[0].line + ': ' + (errs[0].raw || errs[0].message) : 'ready';
      },
    });
    el.querySelector('.win-body').appendChild(editor.el);

    const w = {
      id, el, editor, x: 0, y: 0, slot: 0, moved: false, minimised: false, chip: null,
      player: player || { nick: id, color: '#f2a541' },
    };

    w.slot = cascade;
    cascade += 1;
    place(w);

    el.addEventListener('pointerdown', () => focus(w), true);
    drag(w, el.querySelector('.win-head'), 'move');
    drag(w, el.querySelector('.win-grip'), 'resize');
    el.querySelector('.w-run').addEventListener('click', () => opts.onRun(id));
    el.querySelector('.w-stop').addEventListener('click', () => opts.onStop(id));
    el.querySelector('.w-min').addEventListener('click', () => minimise(w));

    layer.appendChild(el);
    focus(w);
    clamp(w);
    editor.mounted();
    wins.set(id, w);
    setPlayer(id, w.player);
    return w;
  }

  function minimise(w) {
    w.minimised = true;
    w.el.hidden = true;
    const chip = document.createElement('button');
    chip.className = 'dock-chip';
    chip.style.setProperty('--pc', w.player.color);
    chip.innerHTML = '<span class="dock-bar"></span><span></span>';
    chip.lastChild.textContent = w.player.nick;
    chip.addEventListener('click', () => restore(w));
    dock.appendChild(chip);
    w.chip = chip;
  }

  function restore(w) {
    w.minimised = false;
    w.el.hidden = false;
    if (w.chip) { w.chip.remove(); w.chip = null; }
    focus(w);
    w.editor.refresh();
  }

  function setPlayer(id, player) {
    const w = wins.get(id);
    if (!w || !player) return;
    w.player = player;
    w.el.style.setProperty('--pc', player.color);
    w.el.style.setProperty('--pc-a', hexToRgba(player.color, 0.55));
    w.el.querySelector('.win-title').textContent = player.nick;
    w.editor.setColor(player.color);
    if (w.chip) {
      w.chip.style.setProperty('--pc', player.color);
      w.chip.lastChild.textContent = player.nick;
    }
    const own = id === opts.getLocalId();
    w.el.querySelector('.w-run').disabled = !own;
    w.el.querySelector('.w-stop').disabled = !own;
    w.editor.setReadOnly(false);
  }

  window.addEventListener('resize', () => { for (const w of wins.values()) { place(w); clamp(w); } });

  return {
    el: layer,
    has: (id) => wins.has(id),
    get: (id) => wins.get(id),
    ids: () => [...wins.keys()],
    create,
    setPlayer,
    open(id) {
      const w = wins.get(id);
      if (!w) return;
      if (w.minimised) restore(w);
      focus(w);
      w.editor.focus();
    },
    setRunning(id, on) {
      const w = wins.get(id);
      if (w) w.el.classList.toggle('running', !!on);
    },
    remove(id) {
      const w = wins.get(id);
      if (!w) return;
      if (w.chip) w.chip.remove();
      w.editor.destroy();
      w.el.remove();
      wins.delete(id);
    },
  };
}
