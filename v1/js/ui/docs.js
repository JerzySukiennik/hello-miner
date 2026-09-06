// Docs drawer: every drone command with a tiny example; locked ones dimmed.

const DOCS = [
  { sig: 'move(dir)', node: 'move', d: 'Fly one tile. Directions: up, down, left, right. Edges wrap around.', ex: 'move(up)\nmove(right)' },
  { sig: 'mine()', node: 'mine', d: 'Mine the tile under the drone. Returns False if it is not ready yet.', ex: 'mine()' },
  { sig: 'repeat(n):', node: 'repeat', d: 'Run the indented block n times.', ex: 'repeat(4):\n    mine()\n    move(right)' },
  { sig: 'while cond:', node: 'while', d: 'Run the block while the condition is true.', ex: 'while True:\n    mine()' },
  { sig: 'if / elif / else', node: 'if', d: 'Choose what to do based on a condition.', ex: 'if get_ore() == coal:\n    mine()\nelse:\n    move(up)' },
  { sig: 'get_ore()', node: 'get_ore', d: 'The ore on the current tile: stone, coal, iron, gold, crystal or none.', ex: 'if get_ore() == gold:\n    mine()' },
  { sig: 'can_mine()', node: 'can_mine', d: 'True when the tile is fully grown. Crystal shatters if you mine too early.', ex: 'if can_mine():\n    mine()' },
  { sig: 'get_pos_x()', node: 'get_pos_x', d: 'Column of the drone, 0 on the left edge.', ex: 'if get_pos_x() == 0:\n    move(right)' },
  { sig: 'get_pos_y()', node: 'get_pos_y', d: 'Row of the drone, 0 on the bottom edge.', ex: 'print(get_pos_y())' },
  { sig: 'get_world_size()', node: 'get_world_size', d: 'Width of the grid. Grows when you buy grid levels.', ex: 'repeat(get_world_size()):\n    move(right)' },
  { sig: 'place(ore)', node: 'place', d: 'Plant an ore seed on an empty tile. Costs some of that ore.', ex: 'place(coal)' },
  { sig: 'count(ore)', node: 'count', d: 'How much of an ore sits in the shared inventory.', ex: 'if count(stone) > 10:\n    place(coal)' },
  { sig: 'scan(dir)', node: 'scan', d: 'Look at the neighbouring tile without moving. Spots lava and gas.', ex: 'if scan(up) != lava:\n    move(up)' },
  { sig: 'wait(seconds)', node: 'wait', d: 'Pause the drone. Handy while ore grows.', ex: 'wait(1)' },
  { sig: 'print(x)', node: 'print', d: 'Show a speech bubble above the drone.', ex: 'print("mining")' },
  { sig: 'def f(a):', node: 'def', d: 'Name a piece of code and reuse it. Use return to send a value back.', ex: 'def row():\n    repeat(4):\n        mine()\n        move(right)' },
  { sig: 'for x in list:', node: 'for', d: 'Walk through a list, or through range(n).', ex: 'for i in range(4):\n    move(up)' },
  { sig: '[1, 2, 3]', node: 'list', d: 'A list holds many values. Read one with a[0], count with len(a).', ex: 'plan = [up, right, down]\nfor d in plan:\n    move(d)' },
  { sig: '{k: v}', node: 'dict', d: 'A dict maps keys to values.', ex: 'cost = {coal: 1, iron: 2}\nprint(cost[coal])' },
  { sig: 'spawn_drone(f)', node: 'spawn_drone', d: 'Start a second drone running the function f.', ex: 'def worker():\n    while True:\n        mine()\nspawn_drone(worker)' },
];

export function createDocs() {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.hidden = true;
  scrim.innerHTML =
    '<div class="docs panel"><div class="pane-head"><h2>Commands</h2>' +
    '<button class="btn d-close">Close</button></div><div class="docs-list"></div></div>';
  const list = scrim.querySelector('.docs-list');
  scrim.querySelector('.d-close').addEventListener('click', () => api.close());
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) api.close(); });

  for (const d of DOCS) {
    const row = document.createElement('div');
    row.className = 'doc';
    row.dataset.node = d.node;
    row.innerHTML = '<div class="doc-h"><span class="doc-sig"></span><span class="doc-lock">unlock in tree</span></div>' +
      '<div class="doc-d"></div><pre></pre>';
    row.querySelector('.doc-sig').textContent = d.sig;
    row.querySelector('.doc-d').textContent = d.d;
    row.querySelector('pre').textContent = d.ex;
    list.appendChild(row);
  }

  const api = {
    el: scrim,
    isOpen: () => !scrim.hidden,
    open() { scrim.hidden = false; },
    close() { scrim.hidden = true; },
    toggle() { if (scrim.hidden) api.open(); else api.close(); },
    setAllowed(allowed) {
      for (const row of list.children) {
        const locked = !!(allowed && allowed.size) && !allowed.has(row.dataset.node);
        row.classList.toggle('locked', locked);
        row.querySelector('.doc-lock').style.visibility = locked ? 'visible' : 'hidden';
      }
    },
  };
  return api;
}
