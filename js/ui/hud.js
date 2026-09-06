// HUD: ore counters top-left, room code / tree / docs buttons and player chips top-right.

const TREE_ICON = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 2v3M8 5 4 8v5M8 5l4 3v5"/><circle cx="8" cy="2" r="1.3"/><circle cx="4" cy="13.5" r="1.3"/><circle cx="12" cy="13.5" r="1.3"/></svg>';
const DOCS_ICON = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.5 2.5h9v11h-9zM5.8 5.5h4.4M5.8 8h4.4M5.8 10.5h2.6"/></svg>';

function gem(color) {
  return '<svg class="ore-gem" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M8 1.4 14 6l-2.3 8.2H4.3L2 6z" fill="' + color + '"/>' +
    '<path d="M8 1.4 14 6l-6 8.2z" fill="#000" fill-opacity=".22"/>' +
    '<path d="M2 6h12l-.6 2H2.6z" fill="#fff" fill-opacity=".14"/></svg>';
}

export function createHud(opts) {
  const ORES = opts.ores;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none';

  const ores = document.createElement('div');
  ores.className = 'hud-ores panel';
  ores.innerHTML = ORES.map((o) =>
    '<div class="ore dim" data-ore="' + o + '" title="' + o + '">' + gem(opts.oreInfo[o].color) +
    '<span class="ore-n">0</span></div>').join('');
  el.appendChild(ores);

  const right = document.createElement('div');
  right.className = 'hud-right';
  right.innerHTML =
    '<div class="hud-bar panel">' +
    '<span class="host-tag"></span>' +
    '<span class="room-code">----</span>' +
    '<button class="icon-btn h-tree" title="Upgrade tree (T)">' + TREE_ICON + '</button>' +
    '<button class="icon-btn h-docs" title="Command reference (D)">' + DOCS_ICON + '</button>' +
    '</div><div class="chips panel"></div>';
  el.appendChild(right);

  const chips = right.querySelector('.chips');
  const codeEl = right.querySelector('.room-code');
  const hostEl = right.querySelector('.host-tag');
  right.querySelector('.h-tree').addEventListener('click', () => opts.onTree());
  right.querySelector('.h-docs').addEventListener('click', () => opts.onDocs());

  const prev = {};
  const hidden = new Set();

  return {
    el,
    setInv(inv, unlocked) {
      for (const o of ORES) {
        const row = ores.querySelector('[data-ore="' + o + '"]');
        const n = (inv && inv[o]) || 0;
        row.querySelector('.ore-n').textContent = n;
        row.classList.toggle('dim', !(unlocked && unlocked.has(o)) && n === 0);
        if (prev[o] != null && n !== prev[o]) {
          row.classList.remove('pop');
          void row.offsetWidth;
          row.classList.add('pop');
        }
        prev[o] = n;
      }
    },
    setCode(code) { codeEl.textContent = code || '----'; },
    setHost(info) {
      hostEl.textContent = !info ? '' : info.isHost ? 'you host' : (info.hostNick ? info.hostNick + ' hosts' : '');
    },
    setPlayers(players, localId) {
      chips.innerHTML = '';
      for (const [id, p] of Object.entries(players || {})) {
        const b = document.createElement('button');
        b.className = 'chip' + (hidden.has(id) ? ' off' : '');
        b.title = 'Show/hide cursor';
        b.innerHTML = '<span class="chip-dot" style="background:' + p.color + '"></span><span></span>';
        b.lastChild.textContent = p.nick + (id === localId ? ' (you)' : '');
        b.addEventListener('click', () => {
          if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
          b.classList.toggle('off', hidden.has(id));
          opts.onCursorToggle();
        });
        chips.appendChild(b);
      }
    },
    hiddenCursors: hidden,
  };
}
