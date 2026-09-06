// Docs drawer: every drone command with a tiny example; locked ones dimmed.

const DOCS = [
  { sig: 'move(dir)', node: 'move', d: 'Fly one tile. Directions: up, down, left, right. Fly off one edge and the drone comes back on the opposite one. Returns False if something blocked the way.', ex: 'move(up)\nmove(right)' },
  { sig: 'mine()', node: 'mine', d: 'Break what the drone is facing, or the ore under it. Stone grows back on its own, every other ore leaves an empty tile. Returns False when there was nothing to break.', ex: 'mine()' },
  { sig: 'while cond:', node: 'while', d: 'Run the indented lines over and over while the condition stays true. while True: never ends by itself, so it is the normal way to keep a drone working.', ex: 'while True:\n    mine()' },
  { sig: 'for x in ...:', node: 'for', d: 'Walk through numbers or a list, one at a time. range(4) gives 0, 1, 2, 3 and stops just before the number you wrote.', ex: 'for i in range(4):\n    mine()\n    move(right)' },
  { sig: 'if / elif / else', node: 'if', d: 'Pick what to do. The if lines run only when the condition is true, elif tries the next question, else covers everything left.', ex: 'if get_ore() == coal:\n    mine()\nelif can_mine():\n    mine()\nelse:\n    move(up)' },
  { sig: 'get_ore()', node: 'get_ore', d: 'The ore on the tile under the drone: stone, coal, iron, gold, crystal or none. Compare it with == to decide what to do.', ex: 'if get_ore() == gold:\n    mine()' },
  { sig: 'can_mine()', node: 'can_mine', d: 'True when the tile is ready. Ore ripens over time, and crystal shatters into nothing if you mine it early, so ask this first.', ex: 'if can_mine():\n    mine()' },
  { sig: 'get_pos_x()', node: 'get_pos_x', d: 'Which column the drone is in, counting from 0 on the left edge.', ex: 'if get_pos_x() == 0:\n    move(right)' },
  { sig: 'get_pos_y()', node: 'get_pos_y', d: 'Which row the drone is in, counting from 0 on the bottom edge.', ex: 'print(get_pos_y())' },
  { sig: 'get_world_size()', node: 'get_world_size', d: 'How wide the island is right now. It grows when someone buys a Bigger Island level, so use it instead of typing the number.', ex: 'for i in range(get_world_size()):\n    move(right)' },
  { sig: 'place(ore)', node: 'place', d: 'Plant a new seam on an empty tile. It costs a little of that same ore and takes time to ripen. Iron only ripens next to stone or coal.', ex: 'if get_ore() == none:\n    place(coal)' },
  { sig: 'count(ore)', node: 'count', d: 'How much of an ore the whole room has banked. Everyone shares one bank.', ex: 'if count(stone) > 10:\n    place(coal)' },
  { sig: 'scan(dir)', node: 'scan', d: 'Look at the neighbouring tile without flying there. Answers with an ore name, or "boulder", "lava" or "gas". Lava and gas destroy a drone on contact.', ex: 'if scan(right) != "lava":\n    move(right)' },
  { sig: 'wait(seconds)', node: 'wait', d: 'Hold the drone still for a while without spending an action. Useful when ore needs a moment to finish growing.', ex: 'wait(0.5)' },
  { sig: 'print(x)', node: 'print', d: 'Put a speech bubble over the drone so you can see what your program is thinking. Everyone in the room sees it. Text needs quotes, numbers do not.', ex: 'print("digging")\nprint(get_pos_x())' },
  { sig: 'f"text {x}"', node: 'print', d: 'An f-text drops a value straight into a sentence. Whatever sits inside the braces is worked out first.', ex: 'x = get_pos_x()\nprint(f"I am in column {x}")' },
  { sig: 'name = value', node: 'vars', d: 'Store a value under a name so you can use it later. One = stores, two == compares.', ex: 'trips = 0\ntrips = trips + 1' },
  { sig: 'def f(a):', node: 'def', d: 'Give a name to a group of lines, then call that name whenever you need them. return sends a value back to whoever called it.', ex: 'def sweep():\n    for i in range(get_world_size()):\n        mine()\n        move(right)\n\nsweep()' },
  { sig: '[1, 2, 3]', node: 'list', d: 'A list keeps values in order. Count positions from 0, read one with a[0], and add to the end with a.append(x).', ex: 'plan = [up, right, down]\nfor d in plan:\n    move(d)' },
  { sig: '{k: v}', node: 'dict', d: 'A dict finds a value by a key instead of a position. Ask for it with the key in square brackets.', ex: 'worth = {stone: 1, coal: 2}\nprint(worth[get_ore()])' },
  { sig: 'spawn_drone(f)', node: 'spawn_drone', d: 'Start another drone of your own running the function f, side by side with the first. Drones cannot share a tile, so one waits when the other is in the way.', ex: 'def dig():\n    while True:\n        mine()\n\nspawn_drone(dig)' },
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
