// Lesson card: shown at the start of a game and whenever an upgrade unlocks something new.

import { LESSONS, INTRO, UI_TEXT, LANGS } from './lessons.js';

const LANG_KEY = 'helloMiner.lang';
const SEEN_KEY = 'helloMiner.seenLessons';

function readLang() {
  try { const v = localStorage.getItem(LANG_KEY); if (v === 'pl' || v === 'en') return v; } catch (e) { /* private mode */ }
  return (navigator.language || 'en').toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

function writeLang(v) {
  try { localStorage.setItem(LANG_KEY, v); } catch (e) { /* private mode */ }
}

export function createLesson() {
  let lang = readLang();
  let queue = [];
  let current = null;
  let page = 0;
  const seen = new Set();
  const listeners = [];

  const el = document.createElement('div');
  el.className = 'lesson';
  el.hidden = true;
  el.innerHTML =
    '<div class="lesson-card" role="dialog" aria-modal="true">' +
      '<div class="lesson-head">' +
        '<span class="lesson-kicker"></span>' +
        '<div class="lesson-langs"></div>' +
      '</div>' +
      '<h2 class="lesson-title"></h2>' +
      '<div class="lesson-body"></div>' +
      '<div class="lesson-foot">' +
        '<div class="lesson-dots"></div>' +
        '<button class="btn btn-primary lesson-next"></button>' +
      '</div>' +
    '</div>';

  const kicker = el.querySelector('.lesson-kicker');
  const titleEl = el.querySelector('.lesson-title');
  const bodyEl = el.querySelector('.lesson-body');
  const dotsEl = el.querySelector('.lesson-dots');
  const nextBtn = el.querySelector('.lesson-next');
  const langsEl = el.querySelector('.lesson-langs');

  LANGS.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'lesson-lang';
    b.type = 'button';
    b.textContent = l.label;
    b.dataset.lang = l.id;
    b.addEventListener('click', () => {
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

  function codeBlock(code) {
    const wrap = document.createElement('div');
    wrap.className = 'lesson-code';
    code.split('\n').forEach((line) => {
      const row = document.createElement('div');
      row.className = 'lesson-code-line';
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
    if (item.kind === 'intro') return INTRO[lang].pages;
    const l = LESSONS[item.id] && LESSONS[item.id][lang];
    if (!l) return null;
    const p = { body: l.body, code: l.code, note: l.note };
    return l.deep ? [p, { body: l.deep, heading: true }] : [p];
  }

  function render() {
    if (!current) return;
    const t = UI_TEXT[lang];
    const pages = pagesOf(current);
    if (!pages) { close(); return; }
    page = Math.min(page, pages.length - 1);
    const p = pages[page];

    kicker.textContent = current.kind === 'intro' ? t.welcome : t.unlocked;
    titleEl.textContent = current.kind === 'intro' ? INTRO[lang].title : LESSONS[current.id][lang].title;

    bodyEl.textContent = '';
    if (p.heading) {
      const h = document.createElement('div');
      h.className = 'lesson-deep-label';
      h.textContent = lang === 'pl' ? 'Co to robi naprawdę' : 'What it really does';
      bodyEl.appendChild(h);
    }
    bodyEl.appendChild(paragraphs(p.body));
    if (p.code) {
      bodyEl.appendChild(codeBlock(p.code));
      const tryIt = document.createElement('div');
      tryIt.className = 'lesson-tryit';
      tryIt.textContent = t.tryIt;
      bodyEl.insertBefore(tryIt, bodyEl.lastChild);
    }
    if (p.note) bodyEl.appendChild(paragraphs(p.note, 'lesson-note'));

    dotsEl.textContent = '';
    if (pages.length > 1) {
      pages.forEach((_, i) => {
        const d = document.createElement('span');
        d.className = 'lesson-dot' + (i === page ? ' is-on' : '');
        dotsEl.appendChild(d);
      });
    }
    nextBtn.textContent = page < pages.length - 1 ? t.next : t.gotIt;
  }

  function open(item) {
    current = item;
    page = 0;
    el.hidden = false;
    document.body.classList.add('lesson-open');
    paintLangs();
    render();
    setTimeout(() => nextBtn.focus(), 40);
  }

  function close() {
    current = null;
    el.hidden = true;
    document.body.classList.remove('lesson-open');
    if (queue.length) open(queue.shift());
  }

  nextBtn.addEventListener('click', () => {
    const pages = pagesOf(current);
    if (pages && page < pages.length - 1) { page += 1; render(); return; }
    close();
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });

  const api = {
    el,
    isOpen: () => !el.hidden,
    lang: () => lang,
    onLang(fn) { listeners.push(fn); },
    show(id) {
      if (id !== 'intro' && !LESSONS[id]) return;
      const key = String(id);
      if (seen.has(key)) return;
      seen.add(key);
      const item = id === 'intro' ? { kind: 'intro' } : { kind: 'lesson', id };
      if (api.isOpen()) queue.push(item); else open(item);
    },
    markSeen(id) { seen.add(String(id)); },
    close,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    if (Array.isArray(raw)) raw.forEach((k) => seen.add(String(k)));
  } catch (e) { /* private mode */ }
  return api;
}
