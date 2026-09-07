// Lobby: a left column over the live mine — eyebrow, title, rule, subtitle, menu items, one hint line.

const ITEMS = [
  { id: 'solo', label: 'Mine alone' },
  { id: 'create', label: 'Open a mine' },
  { id: 'join', label: 'Join with a code' },
  { id: 'drone', label: 'Your drone' },
  { id: 'help', label: 'How to play' },
];

const HELP = [
  ['mine()', 'Break the ore under the drone.'],
  ['move(right)', 'Fly one tile. Also up, down, left.'],
  ['repeat(4):', 'Do the indented lines four times.'],
  ['while True:', 'Keep going until you press stop.'],
  ['if can_mine():', 'Only mine when the ore is ready.'],
  ['print("hi")', 'Say something above your drone.'],
];

export function createLobby(opts) {
  const COLORS = opts.colors;
  const el = document.createElement('div');
  el.className = 'lobby';
  el.innerHTML =
    '<div class="lobby-scrim"></div>' +
    '<div class="lobby-col">' +
      '<div class="lobby-eyebrow">A co-op quarry</div>' +
      '<h1 class="lobby-title">' +
        '<span class="t-fn">print</span><span class="t-p">(</span>' +
        '<span class="t-s">"Hello, Miner"</span><span class="t-p">)</span>' +
      '</h1>' +
      '<div class="lobby-rule"></div>' +
      '<p class="lobby-sub">Nobody swings a pick here. You write the program and the drones do the digging.</p>' +
      '<nav class="lobby-menu" role="menu"></nav>' +
      '<div class="lobby-panel" hidden></div>' +
      '<div class="lobby-err" role="alert"></div>' +
    '</div>' +
    '<div class="lobby-hint">Press play on your window to run your code · every drone obeys the window it belongs to · anyone may fix anyone’s program</div>';

  const menu = el.querySelector('.lobby-menu');
  const panel = el.querySelector('.lobby-panel');
  const err = el.querySelector('.lobby-err');

  let picked = COLORS[0].hex;
  let taken = new Set();
  let open = null;
  let nickValue = '';
  let codeValue = '';

  const deep = new URLSearchParams(location.search).get('room');
  if (deep) codeValue = deep.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  const buttons = ITEMS.map((item) => {
    const b = document.createElement('button');
    b.className = 'lobby-item';
    b.type = 'button';
    b.dataset.id = item.id;
    b.textContent = item.label;
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => toggle(item.id));
    menu.appendChild(b);
    return b;
  });

  menu.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = (i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[n].focus();
    }
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); toggle(open); }
  });

  function fail(msg) { err.textContent = msg || ''; }

  function detail() {
    return { nick: (nickValue || 'miner').trim().slice(0, 12), color: picked, code: codeValue };
  }

  function field(labelText, value, oninput, extra) {
    const wrap = document.createElement('label');
    wrap.className = 'lobby-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const input = document.createElement('input');
    input.value = value;
    if (extra) Object.assign(input, extra);
    input.addEventListener('input', () => oninput(input));
    wrap.append(span, input);
    return { wrap, input };
  }

  function swatches() {
    const wrap = document.createElement('div');
    wrap.className = 'lobby-field';
    const span = document.createElement('span');
    span.textContent = 'Colour';
    const row = document.createElement('div');
    row.className = 'swatches';
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'sw';
      b.type = 'button';
      b.style.background = c.hex;
      b.title = c.id;
      b.dataset.hex = c.hex;
      b.disabled = taken.has(c.hex);
      b.setAttribute('aria-pressed', String(c.hex === picked));
      b.addEventListener('click', () => {
        picked = c.hex;
        [...row.children].forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.hex === picked)));
      });
      row.appendChild(b);
    });
    wrap.append(span, row);
    return wrap;
  }

  function action(text, onclick) {
    const b = document.createElement('button');
    b.className = 'btn btn-primary lobby-go';
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', onclick);
    return b;
  }

  function build(id) {
    panel.textContent = '';
    const head = document.createElement('div');
    head.className = 'lobby-panel-title';
    head.textContent = (ITEMS.find((i) => i.id === id) || {}).label || '';
    panel.appendChild(head);
    if (id === 'solo') {
      const n = field('Your name', nickValue, (i) => { nickValue = i.value; }, { maxLength: 12, placeholder: 'miner' });
      panel.appendChild(n.wrap);
      const saved = opts.hasSave && opts.hasSave();
      if (saved && saved.nick && !nickValue) {
        nickValue = saved.nick;
        n.input.value = saved.nick;
      }
      if (saved && saved.color) picked = saved.color;
      if (saved) {
        const p = document.createElement('p');
        p.className = 'lobby-saved';
        p.textContent = 'Your mine is where you left it.';
        panel.appendChild(p);
        panel.appendChild(action('Continue', () => { fail(''); opts.onSolo(detail()); }));
        const fresh = action('Start over', () => {
          fail('');
          if (fresh.dataset.armed !== '1') {
            fresh.dataset.armed = '1';
            fresh.textContent = 'Erase and start over';
            return;
          }
          opts.onNewSolo(detail());
        });
        fresh.classList.remove('btn-primary');
        fresh.classList.add('lobby-secondary');
        panel.appendChild(fresh);
      } else {
        panel.appendChild(action('Start mining', () => { fail(''); opts.onSolo(detail()); }));
      }
      setTimeout(() => n.input.focus(), 30);
    } else if (id === 'create') {
      const n = field('Your name', nickValue, (i) => { nickValue = i.value; }, { maxLength: 12, placeholder: 'miner' });
      const go = action('Open the mine', () => { fail(''); opts.onCreate(detail()); });
      panel.append(n.wrap, go);
      setTimeout(() => n.input.focus(), 30);
    } else if (id === 'join') {
      const n = field('Your name', nickValue, (i) => { nickValue = i.value; }, { maxLength: 12, placeholder: 'miner' });
      const c = field('Room code', codeValue, (i) => {
        i.value = i.value.toUpperCase().replace(/[^A-Z]/g, '');
        codeValue = i.value;
      }, { maxLength: 4, placeholder: 'ABCD' });
      c.input.classList.add('code-input');
      const go = action('Join the mine', () => {
        const d = detail();
        if (d.code.length !== 4) return fail('A room code is four letters, like ABCD.');
        fail('');
        opts.onJoin(d);
      });
      panel.append(n.wrap, c.wrap, go);
      setTimeout(() => (codeValue ? n.input : c.input).focus(), 30);
    } else if (id === 'drone') {
      const n = field('Your name', nickValue, (i) => { nickValue = i.value; }, { maxLength: 12, placeholder: 'miner' });
      panel.append(n.wrap, swatches());
      setTimeout(() => n.input.focus(), 30);
    } else {
      const list = document.createElement('dl');
      list.className = 'lobby-help';
      HELP.forEach(([code, text]) => {
        const dt = document.createElement('dt');
        dt.textContent = code;
        const dd = document.createElement('dd');
        dd.textContent = text;
        list.append(dt, dd);
      });
      panel.append(list);
    }
  }

  function toggle(id) {
    fail('');
    open = open === id ? null : id;
    buttons.forEach((b) => b.classList.toggle('is-open', b.dataset.id === open));
    if (!open) { panel.hidden = true; panel.textContent = ''; return; }
    build(open);
    panel.hidden = false;
  }

  return {
    el,
    show() {
      el.hidden = false;
      if (codeValue) toggle('join');
      setTimeout(() => buttons[codeValue ? 1 : 0].focus(), 60);
    },
    hide() { el.hidden = true; },
    error: fail,
    setTaken(list) {
      taken = new Set(list || []);
      if (taken.has(picked)) {
        const free = COLORS.find((c) => !taken.has(c.hex));
        if (free) picked = free.hex;
      }
      if (open === 'drone') build('drone');
    },
  };
}
