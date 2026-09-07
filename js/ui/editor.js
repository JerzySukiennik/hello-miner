// Custom collaborative code editor: textarea over a highlighted mirror, bound to a Y.Text.

import * as Y from 'yjs';

const PAD_X = 10;
const PAD_Y = 8;
const LH = 20;
const INDENT = '    ';
const OPEN = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
const CLOSERS = new Set([')', ']', '}', '"', "'"]);
const TYPE_CLASS = { keyword: 't-kw', builtin: 't-bi', string: 't-str', number: 't-num', comment: 't-com', op: 't-op', ident: 't-id' };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function hexToRgba(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function diff(a, b) {
  let s = 0;
  const m = Math.min(a.length, b.length);
  while (s < m && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a.charCodeAt(ea - 1) === b.charCodeAt(eb - 1)) { ea--; eb--; }
  return { index: s, del: ea - s, ins: b.slice(s, eb) };
}

export function createEditor(opts) {
  let composing = false;
  let lastTypedAt = 0;
  const lang = opts.lang;
  const getAllowed = opts.getAllowed || (() => null);
  const onCursor = opts.onCursor || (() => {});
  const onErrors = opts.onErrors || (() => {});

  const el = document.createElement('div');
  el.className = 'ed';
  el.innerHTML =
    '<div class="ed-gut"><div class="ed-gut-in"></div></div>' +
    '<div class="ed-main">' +
    '<pre class="ed-hl"><code class="ed-hl-in"></code></pre>' +
    '<textarea class="ed-ta" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>' +
    '<div class="ed-cursors"></div>' +
    '</div>';

  const gut = el.querySelector('.ed-gut');
  const gutIn = el.querySelector('.ed-gut-in');
  const main = el.querySelector('.ed-main');
  const hlIn = el.querySelector('.ed-hl-in');
  const ta = el.querySelector('.ed-ta');
  const cur = el.querySelector('.ed-cursors');

  const meas = document.createElement('span');
  meas.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit;left:-9999px;top:0';
  el.appendChild(meas);

  let charW = 7.8;
  function measure() {
    meas.textContent = '0'.repeat(40);
    const w = meas.getBoundingClientRect().width / 40;
    if (w > 1) charW = w;
  }

  let ytext = null;
  let last = '';
  let readOnly = false;
  let relSel = null;
  let execLine = null;
  let color = '#f2a541';
  let errors = [];
  let remote = [];
  let popOpen = false;
  let popIdx = 0;
  let popItems = [];
  let popStart = 0;
  let errTimer = 0;
  let curTimer = 0;
  let destroyed = false;

  const pop = document.createElement('div');
  pop.className = 'ed-pop';
  pop.hidden = true;
  el.appendChild(pop);

  const tip = document.createElement('div');
  tip.className = 'ed-tip';
  tip.hidden = true;
  el.appendChild(tip);

  function lines() { return ta.value.split('\n'); }

  function indexToLC(index) {
    const s = ta.value.slice(0, Math.max(0, index));
    const nl = s.lastIndexOf('\n');
    const before = s.split('\n').length - 1;
    return { line: before, col: index - (nl + 1) };
  }

  function lcToXY(lc) {
    return { x: PAD_X + lc.col * charW, y: PAD_Y + lc.line * LH };
  }

  // --- highlighting -------------------------------------------------------

  function tokensByLine(src) {
    let toks;
    try { toks = lang.tokenize(src); } catch (e) { return null; }
    if (!Array.isArray(toks)) return null;
    const rows = new Map();
    let base = Infinity;
    for (const t of toks) if (typeof t.line === 'number') base = Math.min(base, t.line);
    if (!isFinite(base)) base = 0;
    for (const t of toks) {
      if (!t || t.type === 'newline' || t.type === 'indent' || t.type === 'dedent') continue;
      if (typeof t.value !== 'string' || t.value === '') continue;
      const ln = (t.line || 0) - base;
      if (!rows.has(ln)) rows.set(ln, []);
      rows.get(ln).push(t);
    }
    for (const arr of rows.values()) arr.sort((a, b) => a.col - b.col);
    return rows;
  }

  function lineHtml(raw, toks) {
    if (!toks || !toks.length) return esc(raw) || '';
    let out = '';
    let pos = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      let start = t.col;
      if (raw.substr(start, t.value.length) !== t.value) {
        if (raw.substr(start - 1, t.value.length) === t.value) start -= 1;
        else {
          const found = raw.indexOf(t.value, pos);
          if (found < 0) continue;
          start = found;
        }
      }
      if (start < pos) continue;
      let end = start + t.value.length;
      const next = toks[i + 1];
      if (next && typeof next.col === 'number' && end > raw.length) end = raw.length;
      if (start > pos) out += esc(raw.slice(pos, start));
      out += '<span class="' + (TYPE_CLASS[t.type] || 't-id') + '">' + esc(raw.slice(start, end)) + '</span>';
      pos = end;
    }
    if (pos < raw.length) out += esc(raw.slice(pos));
    return out;
  }

  function render() {
    const src = ta.value;
    const rows = tokensByLine(src);
    const ls = src.split('\n');
    const bad = new Set(errors.map((e) => e.line - 1));
    let html = '';
    let gutter = '';
    for (let i = 0; i < ls.length; i++) {
      const body = rows ? lineHtml(ls[i], rows.get(i)) : esc(ls[i]);
      html += bad.has(i) ? '<span class="bad-line">' + (body || ' ') + '</span>\n' : body + '\n';
      gutter += '<i' + (bad.has(i) ? ' class="bad"' : '') + '>' + (i + 1) + '</i>';
    }
    hlIn.innerHTML = html;
    gutIn.innerHTML = gutter;
    gut.style.width = Math.max(30, String(ls.length).length * charW + 16) + 'px';
    drawOverlay();
  }

  // --- overlay (exec line, remote cursors) --------------------------------

  function drawOverlay() {
    const sl = ta.scrollLeft;
    const st = ta.scrollTop;
    hlIn.style.transform = 'translate(' + -sl + 'px,' + -st + 'px)';
    gutIn.style.transform = 'translateY(' + -st + 'px)';
    let html = '';
    if (execLine != null && execLine >= 1) {
      const y = PAD_Y + (execLine - 1) * LH - st;
      html += '<div class="ed-exec" style="top:' + y + 'px;height:' + LH + 'px;background:' + hexToRgba(color, 0.18) + '"></div>';
    }
    for (const r of remote) {
      const a = Math.min(r.anchor == null ? r.index : r.anchor, r.index);
      const b = Math.max(r.anchor == null ? r.index : r.anchor, r.index);
      if (b > a) {
        const from = indexToLC(a);
        const to = indexToLC(b);
        for (let ln = from.line; ln <= to.line; ln++) {
          const c0 = ln === from.line ? from.col : 0;
          const rawLine = (ta.value.split('\n')[ln] || '');
          const c1 = ln === to.line ? to.col : rawLine.length + 1;
          const x = PAD_X + c0 * charW - sl;
          const w = Math.max(2, (c1 - c0) * charW);
          html += '<div class="ed-rs" style="left:' + x + 'px;top:' + (PAD_Y + ln * LH - st) + 'px;width:' + w + 'px;height:' + LH + 'px;background:' + hexToRgba(r.color, 0.2) + '"></div>';
        }
      }
      const lc = indexToLC(r.index);
      const p = lcToXY(lc);
      const below = p.y - st < LH;
      html += '<div class="ed-rc" style="left:' + (p.x - sl) + 'px;top:' + (p.y - st) + 'px;height:' + LH + 'px;background:' + r.color + '">' +
        '<span class="ed-rc-tag" style="background:' + r.color + (below ? ';top:' + LH + 'px;border-radius:0 4px 4px 4px' : '') + '">' +
        esc(r.nick || '?') + '</span></div>';
    }
    cur.innerHTML = html;
  }

  // --- Y.Text binding -----------------------------------------------------

  const origSetSelection = (a, b) => {
    try { ta.setSelectionRange(a, b); } catch (e) { /* detached */ }
  };

  function saveRel() {
    if (!ytext) return;
    try {
      relSel = {
        a: Y.createRelativePositionFromTypeIndex(ytext, Math.min(ta.selectionStart, ytext.length)),
        b: Y.createRelativePositionFromTypeIndex(ytext, Math.min(ta.selectionEnd, ytext.length)),
      };
    } catch (e) { relSel = null; }
  }

  function restoreRel() {
    if (!ytext || !relSel) return;
    const doc = ytext.doc;
    try {
      const a = Y.createAbsolutePositionFromRelativePosition(relSel.a, doc);
      const b = Y.createAbsolutePositionFromRelativePosition(relSel.b, doc);
      if (a && b) ta.setSelectionRange(a.index, b.index);
    } catch (e) { /* keep current selection */ }
  }

  function onYChange(ev, tr) {
    if (tr && tr.origin === 'local') return;
    const next = ytext.toString();
    const caretBefore = ta.selectionStart;
    if (next === ta.value) { last = next; return; }
    const active = document.activeElement === ta;
    ta.value = next;
    last = next;
    if (active && !composing && Date.now() - lastTypedAt > 400) restoreRel();
    else if (active) origSetSelection(caretBefore, caretBefore);
    scheduleCheck();
    render();
  }

  function bindText(t) {
    if (ytext) ytext.unobserve(onYChange);
    ytext = t;
    if (!ytext) return;
    ytext.observe(onYChange);
    ta.value = ytext.toString();
    last = ta.value;
    saveRel();
    scheduleCheck();
    render();
  }

  function pushLocal() {
    const val = ta.value;
    if (!ytext) { last = val; return; }
    const d = diff(last, val);
    if (!d.del && !d.ins) { last = val; return; }
    ytext.doc.transact(() => {
      if (d.del) ytext.delete(d.index, d.del);
      if (d.ins) ytext.insert(d.index, d.ins);
    }, 'local');
    last = val;
    saveRel();
  }

  // --- errors -------------------------------------------------------------

  function scheduleCheck() {
    clearTimeout(errTimer);
    errTimer = setTimeout(check, 250);
  }

  function check() {
    if (destroyed) return;
    let res = null;
    try {
      const allowed = getAllowed();
      res = lang.compile(ta.value, allowed ? { allowed } : {});
    } catch (e) { res = null; }
    errors = (res && Array.isArray(res.errors) ? res.errors : []).filter((e) => e && typeof e.line === 'number');
    onErrors(errors);
    render();
  }

  // --- autocomplete -------------------------------------------------------

  function declaredNames(src) {
    const out = new Set();
    const re = /(?:^|\n)\s*(?:def\s+([A-Za-z_]\w*)|([A-Za-z_]\w*)\s*(?:=[^=]|\+=|-=|\*=))/g;
    let m;
    while ((m = re.exec(src))) out.add(m[1] || m[2]);
    return out;
  }

  function candidates(prefix) {
    const allowed = getAllowed();
    const kw = Array.isArray(lang.KEYWORDS) ? lang.KEYWORDS : [];
    const bi = Array.isArray(lang.BUILTINS) ? lang.BUILTINS : [];
    const decl = declaredNames(ta.value);
    const list = [];
    const seen = new Set();
    const add = (name, kind) => {
      if (seen.has(name) || !name.toLowerCase().startsWith(prefix.toLowerCase()) || name === prefix) return;
      if (kind !== 'local' && allowed && allowed.size && !allowed.has(name)) return;
      seen.add(name);
      list.push({ name, kind });
    };
    for (const n of bi) add(n, 'fn');
    for (const n of kw) add(n, 'kw');
    for (const n of decl) add(n, 'local');
    return list.slice(0, 40);
  }

  function showPop() {
    const i = ta.selectionStart;
    if (ta.selectionStart !== ta.selectionEnd) return hidePop();
    const before = ta.value.slice(0, i);
    const m = /[A-Za-z_]\w*$/.exec(before);
    if (!m || m[0].length < 2) return hidePop();
    const items = candidates(m[0]);
    if (!items.length) return hidePop();
    popItems = items;
    popIdx = 0;
    popStart = i - m[0].length;
    popOpen = true;
    pop.hidden = false;
    paintPop();
    const p = lcToXY(indexToLC(popStart));
    const left = Math.min(gut.offsetWidth + p.x - ta.scrollLeft, el.clientWidth - 180);
    pop.style.left = Math.max(4, left) + 'px';
    pop.style.top = (p.y - ta.scrollTop + LH + 2) + 'px';
    if (pop.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom) {
      pop.style.top = Math.max(2, p.y - ta.scrollTop - pop.offsetHeight - 2) + 'px';
    }
  }

  function paintPop() {
    pop.innerHTML = popItems.map((it, k) =>
      '<div class="' + (k === popIdx ? 'sel' : '') + '" data-k="' + k + '">' + esc(it.name) +
      '<em>' + (it.kind === 'fn' ? 'fn' : it.kind === 'kw' ? 'key' : 'var') + '</em></div>').join('');
    const sel = pop.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function hidePop() { popOpen = false; pop.hidden = true; }

  function accept(k) {
    const it = popItems[k];
    if (!it) return;
    const parens = it.kind === 'fn';
    const text = it.name + (parens ? '()' : '');
    const caretNow = ta.selectionStart;
    const word = /[A-Za-z_]\w*$/.exec(ta.value.slice(0, caretNow));
    const start = word ? caretNow - word[0].length : caretNow;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(caretNow);
    ta.value = before + text + after;
    const caret = start + it.name.length + (parens ? 1 : 0);
    ta.setSelectionRange(caret, caret);
    hidePop();
    afterEdit();
  }

  pop.addEventListener('mousedown', (e) => {
    const d = e.target.closest('[data-k]');
    if (!d) return;
    e.preventDefault();
    accept(Number(d.dataset.k));
  });

  // --- editing ------------------------------------------------------------

  function afterEdit() {
    lastTypedAt = Date.now();
    pushLocal();
    scheduleCheck();
    render();
    reportCursor();
  }

  function replaceRange(start, end, text, caret) {
    ta.setRangeText(text, start, end, 'end');
    if (caret != null) ta.setSelectionRange(caret, caret);
    afterEdit();
  }

  function currentIndent(index) {
    const s = ta.value.slice(0, index);
    const nl = s.lastIndexOf('\n');
    const line = s.slice(nl + 1);
    const m = /^[ \t]*/.exec(line);
    return m ? m[0] : '';
  }

  ta.addEventListener('keydown', (e) => {
    if (readOnly && !e.metaKey && !e.ctrlKey && e.key.length <= 1) { e.preventDefault(); return; }
    if (popOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); popIdx = (popIdx + 1) % popItems.length; paintPop(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); popIdx = (popIdx - 1 + popItems.length) % popItems.length; paintPop(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(popIdx); return; }
      if (e.key === 'Escape') { e.preventDefault(); hidePop(); return; }
    }
    const s = ta.selectionStart;
    const t = ta.selectionEnd;
    if (e.key === 'Enter') {
      e.preventDefault();
      const src = ta.value;
      const lineStart = src.lastIndexOf('\n', s - 1) + 1;
      const head = src.slice(lineStart, s).replace(/\s+$/, '');
      let ind = currentIndent(s);
      if (head.endsWith(':')) ind += INDENT;
      replaceRange(s, t, '\n' + ind, s + 1 + ind.length);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      replaceRange(s, t, INDENT, s + INDENT.length);
      return;
    }
    if (e.key === 'Backspace' && s === t) {
      const src = ta.value;
      const lineStart = src.lastIndexOf('\n', s - 1) + 1;
      const head = src.slice(lineStart, s);
      if (head.length >= 4 && /^ +$/.test(head) && head.length % 4 === 0) {
        e.preventDefault();
        replaceRange(s - 4, s, '', s - 4);
        return;
      }
    }
    if (e.key.length === 1 && OPEN[e.key]) {
      e.preventDefault();
      const close = OPEN[e.key];
      if (s !== t) {
        const sel = ta.value.slice(s, t);
        replaceRange(s, t, e.key + sel + close, t + 2);
      } else {
        const nextCh = ta.value[s] || '';
        if ((e.key === '"' || e.key === "'") && nextCh === e.key) { ta.setSelectionRange(s + 1, s + 1); reportCursor(); return; }
        replaceRange(s, t, e.key + close, s + 1);
      }
      return;
    }
    if (e.key.length === 1 && CLOSERS.has(e.key) && s === t && ta.value[s] === e.key) {
      e.preventDefault();
      ta.setSelectionRange(s + 1, s + 1);
      reportCursor();
      return;
    }
  });

  ta.addEventListener('keydown', () => { lastTypedAt = Date.now(); }, true);
  ta.addEventListener('compositionstart', () => { composing = true; });
  ta.addEventListener('compositionend', () => {
    composing = false;
    pushLocal();
    scheduleCheck();
    render();
    reportCursor();
  });

  ta.addEventListener('input', (e) => {
    if (composing || (e && e.isComposing)) { render(); return; }
    pushLocal();
    scheduleCheck();
    render();
    showPop();
    reportCursor();
  });

  ta.addEventListener('scroll', drawOverlay);
  ta.addEventListener('blur', hidePop);

  function reportCursor() {
    saveRel();
    clearTimeout(curTimer);
    curTimer = setTimeout(() => {
      onCursor({ index: ta.selectionEnd, anchor: ta.selectionStart });
    }, 50);
  }

  const onSelectionChange = () => { if (document.activeElement === ta) saveRel(); };
  document.addEventListener('selectionchange', onSelectionChange);

  ta.addEventListener('keyup', reportCursor);
  ta.addEventListener('click', () => { hidePop(); reportCursor(); });
  ta.addEventListener('select', reportCursor);

  main.addEventListener('mousemove', (e) => {
    if (!errors.length) { tip.hidden = true; return; }
    const box = main.getBoundingClientRect();
    const ln = Math.floor((e.clientY - box.top - PAD_Y + ta.scrollTop) / LH) + 1;
    const hit = errors.find((x) => x.line === ln);
    if (!hit) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = 'Line ' + hit.line + ': ' + (hit.message || 'error');
    const y = PAD_Y + (ln - 1) * LH - ta.scrollTop + LH + 4;
    tip.style.left = Math.min(e.clientX - el.getBoundingClientRect().left + 8, Math.max(4, el.clientWidth - 310)) + 'px';
    tip.style.top = y + 'px';
  });
  main.addEventListener('mouseleave', () => { tip.hidden = true; });

  const ro = new ResizeObserver(() => { measure(); drawOverlay(); });
  ro.observe(el);

  return {
    el,
    focus() { ta.focus(); },
    mounted() { measure(); render(); },
    setColor(c) { color = c || color; drawOverlay(); },
    setReadOnly(v) { readOnly = !!v; ta.readOnly = !!v; },
    bindText,
    setExecLine(n) { if (execLine !== n) { execLine = n; drawOverlay(); } },
    revalidate() { check(); },
    setRemote(list) { remote = list || []; drawOverlay(); },
    getErrors() { return errors; },
    getValue() { return ta.value; },
    setValue(v) { ta.value = v; last = v; scheduleCheck(); render(); },
    refresh() { measure(); render(); },
    destroy() {
      destroyed = true;
      clearTimeout(errTimer);
      clearTimeout(curTimer);
      ro.disconnect();
      document.removeEventListener('selectionchange', onSelectionChange);
      if (ytext) ytext.unobserve(onYChange);
      el.remove();
    },
  };
}
