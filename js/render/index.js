// Public renderer for print("Hello, Miner"): createRenderer(canvas, opts).

import * as THREE from 'three';
import { createStage } from './scene.js';
import { createTileField, TILE_MODELS, tileToWorld, gridRadius, STEP } from './tiles.js';
import { createDroneLayer, DRONE_MODELS } from './drone.js';
import { createCameraRig } from './camera.js';
import { createDustField, createBubbleLayer } from './effects.js';
import { loadModels } from './models.js';
import { ACTION_MS, SPEED_FACTOR } from '../shared/constants.js';

export const MODELS = {
  tile: TILE_MODELS.tile,
  ore: TILE_MODELS.ore,
  boulder: TILE_MODELS.boulder,
  gas: TILE_MODELS.gas,
  lava: TILE_MODELS.lava,
  charge: TILE_MODELS.charge,
  droneBody: DRONE_MODELS.body,
  droneArms: DRONE_MODELS.arms,
  droneRotor: DRONE_MODELS.rotor,
  droneRing: DRONE_MODELS.ring,
  droneBlur: DRONE_MODELS.blur,
};

export { tileToWorld, STEP };

export function createRenderer(canvas, opts = {}) {
  const stage = createStage(canvas, opts);
  const { renderer, scene, camera } = stage;

  const tiles = createTileField(scene, {
    tile: MODELS.tile, ore: MODELS.ore, boulder: MODELS.boulder,
    gas: MODELS.gas, lava: MODELS.lava, charge: MODELS.charge,
  });
  const dust = createDustField(scene);
  const drones = createDroneLayer(scene, {
    body: MODELS.droneBody, arms: MODELS.droneArms, rotor: MODELS.droneRotor, ring: MODELS.droneRing, blur: MODELS.droneBlur,
  });
  const rig = createCameraRig(camera, canvas);
  const bubbles = createBubbleLayer(scene, canvas);

  let snap = null;
  let snapT = 0;
  let lastSize = 0;
  let lastDroneCount = -1;
  let lastFrame = 0;
  let t0 = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let assets = null;
  let disposed = false;

  const ready = (opts.models === false ? Promise.resolve(null) : loadModels()).then((a) => {
    if (disposed || !a) return null;
    assets = a;
    tiles.applyModels(a);
    drones.applyModels(a);
    stage.applyShadowFlags(scene);
    return a;
  });

  function fitToGrid(instant) {
    const size = snap ? snap.size : 1;
    const r = gridRadius(size);
    rig.fit(r, !!instant);
    stage.setShadowExtent(r + 2.2);
  }

  function setSnapshot(s, tNow) {
    if (!s) return;
    snap = s;
    snapT = tNow === undefined ? performance.now() : tNow;
    tiles.setSnapshot(s);
    drones.sync(s);
    const n = Array.isArray(s.drones) ? s.drones.length : Object.keys(s.drones || {}).length;
    if (n !== lastDroneCount) { lastDroneCount = n; stage.applyShadowFlags(scene); }
    if (s.size !== lastSize) {
      const first = lastSize === 0;
      lastSize = s.size;
      fitToGrid(first);
    }
  }

  function setPlayers(players) {
    drones.setPlayers(players);
  }

  function bubble(droneId, text) {
    const d = drones.getDrone(droneId);
    if (!d) return;
    bubbles.show(droneId, text, d.group, 0.42);
  }

  const chargeList = [];
  function collectCharges(s, ageMs) {
    chargeList.length = 0;
    const list = s.drones || {};
    const arr = Array.isArray(list) ? list : Object.values(list);
    const speed = Math.pow(SPEED_FACTOR, (s.levels && s.levels.speed) || 0);
    for (const d of arr) {
      const act = d && d.action;
      if (!act || act.op !== 'place') continue;
      const dur = (ACTION_MS.place || 400) * speed;
      const p = Math.min(1, Math.max(0, (act.progress || 0) + ageMs / dur));
      if (p >= 1) continue;
      chargeList.push({ x: d.x, y: d.y, p });
    }
    return chargeList;
  }

  function frame(tNow) {
    const now = tNow === undefined ? performance.now() : tNow;
    if (!t0) t0 = now;
    if (!lastFrame) lastFrame = now;
    const dtMs = Math.min(100, now - lastFrame);
    lastFrame = now;
    const dtSec = dtMs / 1000;
    const tSec = (now - t0) / 1000;

    rig.update();
    if (snap) {
      tiles.update(tSec, dtSec);
      tiles.updateCharges(collectCharges(snap, now - snapT), dtSec);
      drones.update(snap, now - snapT, tSec, dtSec, dust);
    }
    dust.update(dtSec);
    bubbles.update(dtSec);

    renderer.render(scene, camera);
    bubbles.render(camera);
    stage.tickPerf(dtMs, now);
  }

  function resize() {
    const { w, h } = stage.resize();
    bubbles.resize(w, h);
    rig.controls.update();
  }
  resize();

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const droneHits = raycaster.intersectObjects(drones.pickables(), false);
    if (droneHits.length) {
      const id = droneHits[0].object.userData.droneId;
      const tileHits = raycaster.intersectObjects(tiles.pickables(), false);
      if (!tileHits.length || droneHits[0].distance <= tileHits[0].distance) {
        return { type: 'drone', id, point: droneHits[0].point };
      }
    }
    const hits = raycaster.intersectObjects(tiles.pickables(), false);
    if (hits.length) {
      const t = tiles.tileAtPoint(hits[0].point);
      if (t) return { type: 'tile', x: t.x, y: t.y, point: hits[0].point };
    }
    return null;
  }

  function stats() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: stage.getPixelRatio(),
    };
  }

  function dispose() {
    disposed = true;
    rig.dispose();
    bubbles.dispose();
    dust.dispose();
    drones.dispose();
    tiles.dispose();
    stage.dispose();
  }

  return {
    setSnapshot, setPlayers, frame, bubble, pick, resize, dispose, fitToGrid, stats,
    ready, MODELS,
    get assets() { return assets; },
    three: { THREE, scene, camera, renderer, controls: rig.controls },
  };
}
