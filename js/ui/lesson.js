// Lesson note: a floating, draggable, resizable window that explains the game and every new unlock.

import { LESSONS, INTRO, UI_TEXT, LANGS } from './lessons.js';

const LANG_KEY = 'helloMiner.lang';
const MIN_W = 300;
const MIN_H = 200;

function readLang() {
  try { const v = localStorage.getItem(LANG_KEY); if (v === 'pl' || v === 'en') return v; } catch (e) { /* private mode */ }
  return (navigator.language || 'en').toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

function writeLang(v) {
  try { localStorage.setItem(LANG_KEY, v); } catch (e) { /* private mode */ }
}

export function createLesson() {
  let lang = readLang();
  const seen = new Set();
  const listeners = [];

  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';

  const el = document.createElement('div');
  el.className = 'note panel';
  el.hidden = true;
  el.innerHTML =
    '<div class="note-head">' +
      '<div class="note-title"></div>' +
      '<div class="note-langs"></div>' +
      '<button class="icon-btn note-min" title="Minimise">–</button>' +
      '<button class="icon-btn note-close" title="Close">×</button>' +
    '</div>' +
    '<div class="note-body"></div>' +
    '<div class="note-foot">' +
      '<div class="note-dots"></div>' +
      '<button class="btn note-prev"></button>' +
      '<button class="btn btn-primary note-next"></button>' +
    '</div>' +
    '<div class="note-grip"></div>';
  layer.appendChild(el);

  const titleEl = el.querySelector('.note-title');
  const bodyEl = el.querySelector('.note-body');
  const dotsEl = el.querySelector('.note-dots');
  const nextBtn = el.querySelector('.note-next');
  const prevBtn = el.querySelector('.note-prev');
  const langsEl = el.querySelector('.note-langs');

  const state = { x: 0, y: 0, moved: false, minimised: false, chip: null, item: null, page: 0, queue: [] };

  LANGS.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'note-lang';
    b.type = 'button';
    b.textContent = l.label;
    b.dataset.lang = l.id;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      lang = l.id;
      writeLang(lang);
      paintLangs();
      render();
      listeners.forEach((fn) => fn(lang));
    });
    langsEl.appendChild(b);
  });

  function paintLangs() {
    [...langsEl.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }

  function viewport() {
    return {
      w: layer.clientWidth || window.innerWidth || 1280,
      h: layer.clientHeight || window.innerHeight || 800,
    };
  }

  function clamp() {
    const v = viewport();
    const maxX = Math.max(0, v.w - el.offsetWidth);
    const maxY = Math.max(0, v.h - 40);
    state.x = Math.min(Math.max(0, state.x), maxX);
    state.y = Math.min(Math.max(0, state.y), maxY);
    el.style.left = state.x + 'px';
    el.style.top = state.y + 'px';
  }

  function place() {
    if (state.moved) return;
    const v = viewport();
    const vw = v.w;
    const vh = v.h;
    const width = Math.min(430, Math.max(MIN_W, vw - 48));
    const height = Math.min(390, Math.max(MIN_H, vh - 160));
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    state.x = Math.max(16, vw - width - 32);
    state.y = Math.max(16, Math.round((vh - height) / 2));
    clamp();
  }

  function drag(handle, mode) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.icon-btn') || e.target.closest('.note-lang')) return;
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      state.moved = true;
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = state.x;
      const oy = state.y;
      const ow = el.offsetWidth;
      const oh = el.offsetHeight;
      const move = (ev) => {
        if (mode === 'move') {
          state.x = ox + (ev.clientX - sx);
          state.y = oy + (ev.clientY - sy);
          clamp();
        } else {
          el.style.width = Math.max(MIN_W, ow + (ev.clientX - sx)) + 'px';
          el.style.height = Math.max(MIN_H, oh + (ev.clientY - sy)) + 'px';
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

  drag(el.querySelector('.note-head'), 'move');
  drag(el.querySelector('.note-grip'), 'resize');

  function codeBlock(code) {
    const wrap = document.createElement('div');
    wrap.className = 'note-code';
    code.split('\n').forEach((line) => {
      const row = document.createElement('div');
      row.textContent = line || ' ';
      wrap.appendChild(row);
    });
    return wrap;
  }

  function paragraphs(text, cls) {
    const frag = document.createDocumentFragment();
    String(text).split('\n\n').forEach((chunk) => {
      const p = document.createElement('p');
      if (cls) p.className = cls;
      p.textContent = chunk;
      frag.appendChild(p);
    });
    return frag;
  }

  function pagesOf(item) {
    if (!item) return null;
    if (item.kind === 'intro') return INTRO[lang].pages;
    const l = LESSONS[item.id] && LESSONS[item.id][lang];
    if (!l) return null;
    const p = { body: l.body, code: l.code, note: l.note };
    return l.deep ? [p, { body: l.deep, heading: true }] : [p];
  }

  function render() {
    const pages = pagesOf(state.item);
    if (!pages) { close(); return; }
    const t = UI_TEXT[lang];
    state.page = Math.min(state.page, pages.length - 1);
    const p = pages[state.page];

    titleEl.textContent = state.item.kind === 'intro' ? INTRO[lang].title : LESSONS[state.item.id][lang].title;

    bodyEl.textContent = '';
    if (p.heading) {
      const h = document.createElement('div');
      h.className = 'note-label';
      h.textContent = lang === 'pl' ? 'Co to robi naprawdę' : 'What it really does';
      bodyEl.appendChild(h);
    }
    bodyEl.appendChild(paragraphs(p.body));
    if (p.code) {
      const tryIt = document.createElement('div');
      tryIt.className = 'note-label';
      tryIt.textContent = t.tryIt;
      bodyEl.appendChild(tryIt);
      bodyEl.appendChild(codeBlock(p.code));
    }
    if (p.note) bodyEl.appendChild(paragraphs(p.note, 'note-aside'));
    bodyEl.scrollTop = 0;

    dotsEl.textContent = '';
    pages.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'note-dot' + (i === state.page ? ' is-on' : '');
      dotsEl.appendChild(d);
    });
    prevBtn.textContent = t.back;
    prevBtn.hidden = state.page === 0;
    nextBtn.textContent = state.page < pages.length - 1 ? t.next : t.gotIt;
  }

  function open(item) {
    state.item = item;
    state.page = 0;
    if (state.minimised) restore();
    el.hidden = false;
    paintLangs();
    place();
    render();
  }

  function close() {
    state.item = null;
    el.hidden = true;
    if (state.chip) { state.chip.remove(); state.chip = null; }
    state.minimised = false;
    if (state.queue.length) open(state.queue.shift());
  }

  function minimise() {
    if (state.minimised || !state.item) return;
    state.minimised = true;
    el.hidden = true;
    const chip = document.createElement('button');
    chip.className = 'win-chip note-chip';
    chip.textContent = titleEl.textContent;
    chip.addEventListener('click', restore);
    const dock = document.querySelector('.win-dock');
    (dock || layer).appendChild(chip);
    state.chip = chip;
  }

  function restore() {
    state.minimised = false;
    if (state.chip) { state.chip.remove(); state.chip = null; }
    if (state.item) el.hidden = false;
  }

  nextBtn.addEventListener('click', () => {
    const pages = pagesOf(state.item);
    if (pages && state.page < pages.length - 1) { state.page += 1; render(); return; }
    close();
  });
  prevBtn.addEventListener('click', () => {
    if (state.page > 0) { state.page -= 1; render(); }
  });
  el.querySelector('.note-close').addEventListener('click', close);
  el.querySelector('.note-min').addEventListener('click', minimise);

  window.addEventListener('resize', () => { place(); clamp(); });

  const api = {
    el: layer,
    isOpen: () => !el.hidden,
    lang: () => lang,
    onLang(fn) { listeners.push(fn); },
    show(id) {
      if (id !== 'intro' && !LESSONS[id]) return;
      const key = String(id);
      if (seen.has(key)) return;
      seen.add(key);
      const item = id === 'intro' ? { kind: 'intro' } : { kind: 'lesson', id };
      if (state.item) state.queue.push(item); else open(item);
    },
    reopen(id) {
      seen.delete(String(id));
      api.show(id);
    },
    close,
  };
  return api;
}
