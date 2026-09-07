# print("Hello, Miner")

A browser game about writing code to fly mining drones. You get a 1×1 island, two
commands (`move`, `mine`), and an upgrade tree. Everything else — loops, variables,
sensors, more drones, a bigger island — is bought with the ore your programs dig up.
Up to 8 players share one island, one upgrade tree, and can watch each other type.

Python-like language, custom interpreter. Three.js scene, Firebase Realtime Database
for rooms, Yjs for the shared editors. Static site, ES modules, zero build.

## Run locally

```
python3 -m http.server 8140
```

Then open <http://localhost:8140/>.

- **Create room** starts a new island and puts `?room=CODE` in the URL — share that
  link and the code is prefilled for whoever opens it.
- If the Firebase rules for the `helloMiner` path are not deployed, or the network is
  down, the game drops into **offline mode**: a single-player island backed by an
  in-memory transport. You are the host, everything works, nothing is shared.
- `?cheat=1` grants the host 9999 of every ore, for trying out the upgrade tree
  without grinding. Dev convenience for v1.

## Tests

```
npm test
```

Runs the Node suites for the language, the sim, the net layer and the integration
seam (`tests/lang.test.js`, `tests/sim.test.js`, `tests/net.test.js`,
`tests/integration.test.js`). No browser needed.

Browser harnesses for single modules live in `tests/`: `render-harness.html`,
`ui-harness.html`, `audio-harness.html`. Open them from the same dev server.

## Multiplayer rules

`rules/helloMiner.rules.json` holds the Realtime Database rules for the `helloMiner`
prefix. The database is shared with other Gzowo games, so this file is **not deployed
from here** — merge it into the live ruleset with `Projects/tools/rtdb-rules.sh`
(`pull` → `merge` → `deploy`), never by deploying this file alone.

## Credits and licence

Sound effects are CC0 from Kenney — see `assets/sounds/CREDITS.txt` for the exact
packs and per-pack licences. The 3D models in `assets/models/` are our own work,
built with the Blender scripts in `Niepotrzebne/blender/`. Three.js, Yjs and the
Firebase SDK are loaded from CDNs under their own licences.
