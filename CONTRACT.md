# print("Hello, Miner") — architecture contract (v1)

Read this whole file before touching any module. It is the only shared truth between modules.
Spec/decisions: `~/Downloads/Claude/ClaudeMemory/projects/hello-miner.md`. Visual refs: `~/Downloads/TFWR refs/`.

## Stack (fixed)
- Static site, ES modules, **zero build**. `index.html` + `js/**`. Served from any static server (dev: `python3 -m http.server`).
- Import map in `index.html` (only entry allowed to define it):
  - `three` → `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
  - `three/addons/` → `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/`
  - `firebase/app` → `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js`
  - `firebase/database` → `https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js`
  - `yjs` → `https://cdn.jsdelivr.net/npm/yjs@13.6.18/+esm`
- Code, comments, commits: English. No comments in code except a short file header. Whole files, never partial.
- Every module exports plain functions/classes; no globals except `window.__FIREBASE_CONFIG__` (defined in index.html, public client key, path prefix `helloMiner`).

## Module ownership (one Builder per folder, no cross-edits)
| Folder | Owner | Public surface |
|---|---|---|
| `js/lang/` | Builder LANG | `compile(source) → {program, errors}`; `createRun(program, api) → runner` |
| `js/sim/`  | Builder SIM  | `createWorld(seed)`, `world.tick(dtMs)`, commands, `world.snapshot()`, `world.applySnapshot()`, `TREE` |
| `js/render/` | Builder RENDER | `createRenderer(canvas)`, `renderer.setSnapshot(snap, tNow)`, `renderer.frame(tNow)`, camera controls, `renderer.bubble(droneId, text)`, `renderer.setPlayers(players)` |
| `js/ui/` | Builder UI | lobby, floating code windows (shared editor), HUD, tree panel, docs panel |
| `js/net/` | Builder NET | `createRoom(opts) → room` (Firebase RTDB + Yjs relay + host election) |
| `js/main.js`, `index.html`, `css/` | Integrator (round 2) | wires everything |

Shared constants live in `js/shared/constants.js` (owner: SIM Builder writes it first; others import, never edit):
`COLORS` (8 player colors), `ORES`, `DIRS`, `TILE`, `ACTION_MS`, `MAX_GRID`.

## Coordinate & grid conventions
- Grid is `size × size`, `size` from 1 to `MAX_GRID = 8`. Tile `(x, y)`, `x` right, `y` up (screen), origin bottom-left. `move(up)` = `y+1`, `right` = `x+1`. Edges **wrap** (mod size).
- Tile record: `{ore: 'none'|'stone'|'coal'|'iron'|'gold'|'crystal', stage: 0..1 (growth, 1 = ready), stock: int, kind: 'rock'|'boulder'|'lava'|'gas', hp: int}`.
- Drones: `{id, owner (playerId), x, y, dir, action: null|{op, progress 0..1, fromX, fromY}, line: int|null, state: 'idle'|'running'|'waiting'|'error'|'dead', carrying: none}`.
- Time: sim runs at a fixed **50 ms tick** (20 Hz) on the host. Snapshots are sent at 10 Hz; render interpolates using `action.progress` and `fromX/fromY`.

## Language (`js/lang/`)
Python-like, custom. Must run in a browser AND in Node (for tests) — no DOM access.

Syntax: statements separated by newlines; blocks by `:` + indentation. Indentation is **tolerant**: a block is any run of lines indented more than the block opener; mixed tabs/spaces allowed; unclosed blocks close at EOF.
Supported: integers, floats, strings ("..." or '...'), booleans `True/False`, `None`, lists `[...]`, dicts `{k: v}`, indexing `a[i]`, `len(x)`, arithmetic `+ - * / // %`, comparison `== != < <= > >=`, `and or not`, assignment `=` and `+= -= *=`, `if/elif/else`, `while`, `repeat(n):` (custom: runs body n times), `for x in list:`, `for i in range(n):`, `def f(a, b):`, `return`, `break`, `continue`, `pass`, comments `#`.
Builtins (drone API, all injected via `api` object, names fixed):
`move(dir)`, `mine()`, `can_mine()`, `place(ore)`, `get_ore()`, `scan(dir)`, `get_pos_x()`, `get_pos_y()`, `get_world_size()`, `count(ore)`, `wait(seconds)`, `print(x)`, `spawn_drone(fn)`, `len`, `range`, `str`, `int`, `abs`, `min`, `max`.
Direction constants are bare identifiers: `up down left right` (also accepted as strings). Ore constants: `stone coal iron gold crystal none` (bare identifiers resolving to strings).

Execution model: **generator-based**. `createRun(program, api)` returns `{step(): {done, yield}}` where each drone action yields `{op:'move', dir}`, `{op:'mine'}`, `{op:'place', ore}`, `{op:'wait', ms}`, `{op:'spawn', fn}`; sensors are synchronous calls into `api` (`api.get_ore()` etc. return immediately). Every loop iteration and every function call yields `{op:'tick'}` so infinite loops never freeze the tab. `print` calls `api.print(text)` synchronously. Runtime errors throw `LangError {line, col, message}`; compile errors returned in `errors[]` with the same shape. Messages are short English sentences a child can act on: `Line 4: missing ")"`, `Line 7: "mvoe" is not a command. Did you mean "move"?` (edit-distance suggestion over known names).
`compile(source, {allowed: Set<string>})` — names not in `allowed` produce error `"repeat" is locked. Unlock it in the tree.` (constructs: `if while repeat for def list dict`, and every builtin).
Also export `KEYWORDS`, `BUILTINS`, `tokenize(source)` (for syntax highlighting: `[{type, value, line, col}]`).

## Sim (`js/sim/`)
Pure logic, no DOM, runs in Node for tests. Owns `TREE` and `js/shared/constants.js`.
- `createWorld({seed}) → world`. Start: size 1, tile (0,0) = stone ready, inventory `{stone:0,...}`, unlocked = `Set(['move','mine'])`, no drones.
- `world.addPlayer(playerId, color)` spawns that player's first drone at a free tile; `world.removePlayer(id)`.
- `world.runProgram(playerId, program)` — program from `lang.compile`; host creates a runner per drone using `lang.createRun` with an `api` bound to that drone. `world.stopProgram(playerId)`.
- `world.tick(dtMs)`: advances actions, growth, resumes runners whose action finished. **Drones never overlap**: a `move` into an occupied target tile (or one reserved by a drone mid-move) makes the drone `waiting`; it retries each tick; after **2000 ms** of waiting it gives up and the `move` returns `False` (no deadlock forever). `boulder` tiles block movement until mined `hp` times. Entering `lava`/`gas` kills the drone: state `dead` 1500 ms, then respawn at its start tile, program restarts from line 1.
- Actions & durations (`ACTION_MS`, base): move 300, mine 500, place 400, spawn 800. Speed unlock levels multiply by 0.85^level.
- Ores: growth time base ms `{stone:1500, coal:2500, iron:4000, gold:6000, crystal:9000}`. `place(ore)` costs `PLACE_COST[ore]` of that same ore (stone 0, coal 1, iron 2, gold 3, crystal 5) and requires the ore unlocked; tile must be `none`. `mine()` on a ready tile adds `YIELD[ore]` (stone 1, coal 2, iron 3, gold 5, crystal 8) to shared inventory; **stone regrows by itself** (tile stays `stone`, stage resets to 0 — like grass in TFWR, so the 1×1 start never dead-ends), every other ore sets the tile to `none` and must be re-placed; on a not-ready tile does nothing and returns `False`. Rules (each a lesson): iron only grows if a 4-neighbour tile has stone/coal; gold needs a `drill` unlock; crystal shatters (tile → none, no yield) if mined before `stage == 1` — `can_mine()` protects.
- Hazards: when the grid grows, new tiles roll: 70% stone-ready, 15% none, 10% boulder (hp 3), 5% lava or gas (only if `scan` unlocked). Never spawn hazards adjacent to a drone start tile.
- `TREE`: array of nodes `{id, name, desc, cost: {ore: n} per level[], levels, requires: [ids], unlocks: ['repeat', ...]}`. Fixed list (ids): `grid` (7 levels, 1→8), `speed` (5), `loops` (repeat+while), `vars` (variables + if/elif/else), `sensors` (get_ore, can_mine, get_pos_*, get_world_size), `coal`, `iron`, `place` (place + count), `scan`, `wait`, `print`, `functions` (def/return), `for_loops` (for + range), `lists`, `dicts`, `drones` (spawn_drone, 3 levels: max drones 2/3/4), `gold` (+drill), `crystal`. Costs scale so a competent player finishes in 60–90 min: total cost curve documented in `tree.js` header. `world.buy(nodeId)` validates & deducts from shared inventory.
- `world.snapshot()` → JSON-able `{t, size, tiles: [...], drones: {...}, inv, unlocked: [...], levels: {...}, totalMined}`; `world.applySnapshot(snap)` for clients. Keep tiles compact (array of small objects is fine at 64 tiles).
- Deterministic given seed; `world.rng`.
- Events: `world.on('event', fn)` emits `{type:'mined'|'placed'|'spawned'|'died'|'bought'|'print'|'error'|'grow', ...}` for sound/UI; events are also included in snapshots as `events[]` since last snapshot.

## Render (`js/render/`)
three 0.160. Look = TFWR refs: flat grey-blue background (`#6f8aa0`-ish, no gradient), grid as a **floating island block** (dark rock underside with a few grey pebbles, warm sandstone top per tile `#d9a75f`/`#c98f4a` alternating subtly), ores as small low-poly crystal clusters coloured by type (stone grey, coal near-black, iron rust, gold yellow, crystal cyan), growth = scale 0.2→1 with a tiny pop at ready. Boulder = grey lump; lava = orange glowing tile with emissive; gas = pale green translucent cloud. Drone = low-poly body in the player's colour with 4 rotors (spinning), hovers 0.6 tile above ground with gentle bob; `mine` = tilts down + dust particles; `dead` = falls and fades. Player-colour ring under each drone. Lighting: warm directional (`#fff1d6`) with **PCFSoft shadows**, hemisphere fill, no fog. Camera: isometric-ish orbit (`OrbitControls` from addons, min/max polar angle, damping), auto-fit to grid size on grow with a smooth tween. `renderer.bubble(droneId, text)` shows a CSS2D or sprite text bubble above the drone for 2 s. Adaptive pixel ratio: drop DPR when frame time > 20 ms for 30 frames (pattern from Modular). Must hit 60 fps on an Intel MacBook with 8×8 and 8 drones. `renderer.pick(clientX, clientY)` → tile or drone (for future use). Interpolation: drone position = lerp(from, to, easeInOut(progress)); wrap-around move animates by exiting one edge and entering the other.

## UI (`js/ui/`)
Vanilla DOM + CSS, minimal, "raw shell, rich interior". Components:
- **Lobby**: nick, 8 colour swatches (taken ones greyed, from `room.players`), "Create room" / "Join" with 4-letter code, `?room=CODE` deep link. Font: display `Fredoka`, code `JetBrains Mono` (Google Fonts, fallback stacks).
- **HUD**: top-left ore counters with tiny SVG icon + count (animated pop on change); top-right: tree button, docs button, room code + player chips (colour dot + nick, cursor-visible toggle).
- **Code windows**: one per player, header in the player's colour (title = nick, ▶ Run / ■ Stop only enabled for owner, minimise). Draggable/resizable, stack z-order on focus. Body = shared editor.
- **Editor** (custom, no CodeMirror): `<textarea>` over a `<pre>` mirror for highlighting (tokens from `lang.tokenize`), auto-indent after `:`, bracket/quote auto-close, Tab = 4 spaces, autocomplete popup after 2 letters from `allowed` names (↑↓ Enter), live error underline with tooltip (from `lang.compile`), executing-line highlight in the owner's colour (from snapshot `drones[*].line`), **remote cursors + selections** in each collaborator's colour with nick tag. Binding: `Y.Text` — the editor edits the Y.Text and re-renders on Y events; remote cursors via `room.awareness` (see net).
- **Tree panel**: graph of nodes as cards (like refs, dark cards with gold border), levels `n/m`, cost chips, buy button (disabled if unaffordable/locked). Rendered as absolutely positioned cards + SVG connectors, layout computed from `TREE` `requires`.
- **Docs panel**: list of unlocked commands with a 1–3 line example each; locked ones shown dimmed with "unlock in tree".
- **Toasts** bottom-centre for `bought`, `grow`, `host changed`, errors.
- Motion: springs `cubic-bezier(.34,1.56,.64,1)` 200–300 ms for windows/toasts; `prefers-reduced-motion` respected. Keyboard focus visible.
- Exports `createUI({root, lang, TREE, COLORS}) → ui` with `ui.on('run'|'stop'|'buy'|'join'|'create', fn)`, `ui.setSnapshot(snap)`, `ui.setPlayers(players)`, `ui.bindRoom(room)` (to get Y.Text docs and awareness), `ui.toast(text)`.

## Net (`js/net/`)
Firebase RTDB modular SDK, path prefix `helloMiner/rooms/{CODE}/`. Reuse ideas from `../SatisFarm/src/net/` (read it; do not import it).
- `createRoom({config, code|null, nick, color}) → room` with `room.id` (playerId, random), `room.code`, `room.isHost`, `room.players` (live map), `room.on('players'|'host'|'snapshot'|'command'|'join'|'leave', fn)`.
- Host election: `meta/host = {id, beat}`; heartbeat every 1 s; anyone seeing `beat` older than 4 s runs a transaction to claim host; new host emits `host` event (integrator restarts programs and toasts). Also clears `onDisconnect`.
- Host publishes `state` (snapshot JSON) at 10 Hz, `events` embedded. Clients receive `snapshot` events.
- Commands: clients push `cmd/{pushId} = {from, type:'run'|'stop'|'buy', payload, t}`; host consumes (`command` event) and deletes.
- Shared code: one `Y.Doc` per room; `doc.getText(playerId)` is that player's window. Relay: local Yjs `update` events → `yupdates/{pushId} = {from, b64}`; on join load all existing updates then subscribe to child_added (skip own). Owner compacts its own text once at every 200 updates (writes a `ysnapshot/{playerId}` full state vector + deletes old) — keep simple, must be correct for 2–4 players in one session.
- Awareness: `presence/{playerId} = {nick, color, cursor: {win, index, anchor}, lastSeen}` throttled 50 ms; exposed as `room.awareness.get()/set()` with `awareness` event.
- `onDisconnect` removes `players/{id}` and `presence/{id}`.
- Rules block for the shared DB (write `rules/helloMiner.rules.json`, DO NOT deploy): `helloMiner/rooms/$code` read/write true for now, plus `.validate` on code format `[A-Z]{4}`.

## Acceptance (Gauntlet contract summary)
Objective: two browsers on the same machine can create/join room, each type in their own window, see the other's cursor and edits live, run a program that mines and moves, watch drones animate at 60 fps, buy an unlock, and see the grid grow — with no console errors.
Rubric (100): Language correctness 25 (critical), Sim rules 20 (critical), Multiplayer sync 20 (critical), Visual fidelity to refs 15, Editor/UX 15, Performance 5.
Gates: Node tests for lang+sim pass; two-tab live test passes; 0 console errors; no hard-coded secrets beyond the public Firebase web config; rules file present and not deployed.
