// Lobby overlay: nick, colour pick, create or join a room by 4-letter code.

export function createLobby(opts) {
  const COLORS = opts.colors;
  const el = document.createElement('div');
  el.className = 'lobby';
  el.innerHTML =
    '<div class="lobby-card panel">' +
    '<h1>print<span class="paren">(</span>"Hello, Miner"<span class="paren">)</span></h1>' +
    '<p class="sub">Write code. Fly drones. Mine together.</p>' +
    '<label class="field"><span>Nick</span><input id="hm-nick" maxlength="12" placeholder="miner"></label>' +
    '<div class="field"><span>Colour</span><div class="swatches"></div></div>' +
    '<label class="field"><span>Room code</span><input id="hm-code" maxlength="4" placeholder="ABCD"></label>' +
    '<div class="lobby-actions">' +
    '<button class="btn l-join">Join</button>' +
    '<button class="btn btn-primary l-create">Create room</button>' +
    '</div><div class="lobby-err" role="alert"></div></div>';

  const nick = el.querySelector('#hm-nick');
  const code = el.querySelector('#hm-code');
  const sw = el.querySelector('.swatches');
  const err = el.querySelector('.lobby-err');
  let picked = COLORS[0].hex;
  let taken = new Set();

  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'sw';
    b.style.background = c.hex;
    b.title = c.id;
    b.dataset.hex = c.hex;
    b.setAttribute('aria-pressed', String(c.hex === picked));
    b.addEventListener('click', () => {
      picked = c.hex;
      [...sw.children].forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.hex === picked)));
    });
    sw.appendChild(b);
  });

  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z]/g, '');
  });

  function detail() {
    return { nick: (nick.value || 'miner').trim().slice(0, 12), color: picked, code: code.value };
  }

  function fail(msg) { err.textContent = msg; }

  el.querySelector('.l-create').addEventListener('click', () => {
    fail('');
    opts.onCreate(detail());
  });
  el.querySelector('.l-join').addEventListener('click', () => {
    const d = detail();
    if (d.code.length !== 4) return fail('A room code is 4 letters, like ABCD.');
    fail('');
    opts.onJoin(d);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const d = detail();
    if (d.code.length === 4) opts.onJoin(d); else opts.onCreate(d);
  });

  const deep = new URLSearchParams(location.search).get('room');
  if (deep) code.value = deep.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  return {
    el,
    show() { el.hidden = false; setTimeout(() => nick.focus(), 40); },
    hide() { el.hidden = true; },
    error: fail,
    setTaken(list) {
      taken = new Set(list || []);
      [...sw.children].forEach((n) => {
        const dis = taken.has(n.dataset.hex);
        n.disabled = dis;
        if (dis && n.dataset.hex === picked) {
          const free = COLORS.find((c) => !taken.has(c.hex));
          if (free) {
            picked = free.hex;
            [...sw.children].forEach((m) => m.setAttribute('aria-pressed', String(m.dataset.hex === picked)));
          }
        }
      });
    },
  };
}
