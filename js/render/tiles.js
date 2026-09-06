// Floating island: tile field, ore crystals, boulders, lava and gas, all instanced.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_GRID, ORES, ORE_INFO, TILE } from '../shared/constants.js';

export const STEP = TILE.size + TILE.gap;
const CAP = MAX_GRID * MAX_GRID;

export function tileToWorld(x, y, size, out) {
  const o = out || { x: 0, y: 0, z: 0 };
  const c = (size - 1) / 2;
  o.x = (x - c) * STEP;
  o.y = 0;
  o.z = -(y - c) * STEP;
  return o;
}

export function gridRadius(size) {
  return (size * STEP) / 2;
}

function mergeFlat(parts) {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat, false);
  flat.forEach((f, i) => { if (f !== parts[i]) f.dispose(); });
  parts.forEach((p) => p.dispose());
  return merged;
}

function rnd(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeTileGeometry() {
  const g = new THREE.BoxGeometry(TILE.size, TILE.height, TILE.size);
  g.translate(0, -TILE.height / 2, 0);
  return g;
}

function makeOreGeometry(kind) {
  const spec = {
    stone:   { shards: 5, h: 0.26, r: 0.15, seg: 5, spread: 0.26 },
    coal:    { shards: 5, h: 0.30, r: 0.16, seg: 5, spread: 0.26 },
    iron:    { shards: 5, h: 0.40, r: 0.13, seg: 4, spread: 0.23 },
    gold:    { shards: 5, h: 0.44, r: 0.12, seg: 5, spread: 0.22 },
    crystal: { shards: 4, h: 0.60, r: 0.11, seg: 4, spread: 0.19 },
  }[kind];
  const rand = rnd(kind.length * 7717 + 13);
  const parts = [];
  for (let i = 0; i < spec.shards; i++) {
    const h = spec.h * (0.6 + rand() * 0.7);
    const r = spec.r * (0.7 + rand() * 0.6);
    const g = new THREE.ConeGeometry(r, h, spec.seg, 1);
    g.translate(0, h / 2, 0);
    g.rotateX((rand() - 0.5) * 0.5);
    g.rotateZ((rand() - 0.5) * 0.5);
    const a = (i / spec.shards) * Math.PI * 2 + rand() * 0.6;
    const d = i === 0 ? 0 : spec.spread * (0.4 + rand() * 0.6);
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(g);
  }
  return mergeFlat(parts);
}

function makeBoulderGeometry() {
  const rand = rnd(991);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(0.20 + rand() * 0.11, 0);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      p.setXYZ(v, p.getX(v) * (0.8 + rand() * 0.4), p.getY(v) * (0.62 + rand() * 0.3), p.getZ(v) * (0.8 + rand() * 0.4));
    }
    g.translate((rand() - 0.5) * 0.28, 0.13 + rand() * 0.06, (rand() - 0.5) * 0.28);
    parts.push(g);
  }
  return mergeFlat(parts);
}

function makeGasGeometry() {
  const rand = rnd(451);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(0.13 + rand() * 0.08, 0);
    g.scale(1.1, 0.62, 1.1);
    g.translate((rand() - 0.5) * 0.3, 0.1 + rand() * 0.1, (rand() - 0.5) * 0.3);
    parts.push(g);
  }
  return mergeFlat(parts);
}

function makeLavaGeometry() {
  const g = new THREE.BoxGeometry(0.88, 0.16, 0.88);
  g.translate(0, -0.07, 0);
  return g;
}

export const TILE_MODELS = {
  tile: makeTileGeometry,
  ore: makeOreGeometry,
  boulder: makeBoulderGeometry,
  gas: makeGasGeometry,
  lava: makeLavaGeometry,
};

export function createTileField(scene, models = TILE_MODELS) {
  const group = new THREE.Group();
  group.name = 'island';
  scene.add(group);

  const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.0 });
  const tileMesh = new THREE.InstancedMesh(models.tile(), tileMat, CAP);
  tileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tileMesh.count = 0;
  tileMesh.receiveShadow = true;
  tileMesh.castShadow = true;
  tileMesh.name = 'tiles';
  group.add(tileMesh);

  const lavaMat = new THREE.MeshStandardMaterial({
    color: 0x3a1508, emissive: 0xff6a1e, emissiveIntensity: 1.4, roughness: 0.7,
  });
  const lavaMesh = new THREE.InstancedMesh((models.lava || makeLavaGeometry)(), lavaMat, CAP);
  lavaMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lavaMesh.count = 0;
  lavaMesh.receiveShadow = false;
  lavaMesh.castShadow = false;
  lavaMesh.userData.noShadow = true;
  group.add(lavaMesh);

  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x8b8d8a, roughness: 1.0, flatShading: true });
  const boulderMesh = new THREE.InstancedMesh(models.boulder(), boulderMat, CAP);
  boulderMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  boulderMesh.count = 0;
  boulderMesh.castShadow = true;
  boulderMesh.receiveShadow = true;
  group.add(boulderMesh);

  const gasMat = new THREE.MeshStandardMaterial({
    color: 0x9fe6a0, emissive: 0x3f8a4a, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.42, roughness: 1.0, flatShading: true, depthWrite: false,
  });
  const gasMesh = new THREE.InstancedMesh(models.gas(), gasMat, CAP);
  gasMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gasMesh.count = 0;
  gasMesh.castShadow = false;
  gasMesh.receiveShadow = false;
  gasMesh.userData.noShadow = true;
  group.add(gasMesh);

  const oreMeshes = {};
  for (const ore of ORES) {
    const mat = new THREE.MeshStandardMaterial({
      color: ORE_INFO[ore].color,
      roughness: ore === 'crystal' ? 0.25 : 0.85,
      metalness: ore === 'gold' || ore === 'iron' ? 0.35 : 0.0,
      flatShading: true,
      emissive: ore === 'crystal' ? 0x1a6a68 : 0x000000,
      emissiveIntensity: ore === 'crystal' ? 0.6 : 0,
    });
    const m = new THREE.InstancedMesh(models.ore(ore), mat, CAP);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    oreMeshes[ore] = m;
  }

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1.0, flatShading: true });
  let rockMesh = null;
  let rockSize = -1;

  function buildRock(size) {
    if (rockMesh) { group.remove(rockMesh); rockMesh.geometry.dispose(); rockMesh = null; }
    const w = size * STEP;
    const rand = rnd(size * 3301 + 7);
    const parts = [];
    const slab = new THREE.BoxGeometry(w * 0.995, 0.34, w * 0.995);
    slab.translate(0, -TILE.height - 0.17, 0);
    parts.push(slab);
    const th = w * 0.34 + 0.5;
    const taper = new THREE.CylinderGeometry(w * 0.55, w * 0.12, th, 7, 1);
    taper.rotateY(0.42);
    taper.translate(0, -TILE.height - 0.34 - th / 2, 0);
    parts.push(taper);
    const sh = w * 0.2 + 0.32;
    const spike = new THREE.ConeGeometry(w * 0.115, sh, 6, 1);
    spike.rotateX(Math.PI);
    spike.translate(0, -TILE.height - 0.34 - th - sh / 2 + 0.12, 0);
    parts.push(spike);
    const pebbles = 7 + size * 2;
    for (let i = 0; i < pebbles; i++) {
      const r = 0.08 + rand() * 0.15;
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(1, 0.72, 1);
      const a = rand() * Math.PI * 2;
      const d = w * (0.22 + rand() * 0.24);
      g.translate(Math.cos(a) * d, -TILE.height - 0.26 - rand() * (th * 0.85), Math.sin(a) * d);
      parts.push(g);
    }
    const merged = mergeFlat(parts);
    rockMesh = new THREE.Mesh(merged, rockMat);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    rockMesh.name = 'islandRock';
    group.add(rockMesh);
    rockSize = size;
  }

  const UP = new THREE.Vector3(0, 1, 0);
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const vpos = new THREE.Vector3();
  const vscale = new THREE.Vector3();
  const colA = new THREE.Color(0xd9a75f);
  const colB = new THREE.Color(0xc98f4a);
  const colBoulderTile = new THREE.Color(0x9a8266);
  const colLavaTile = new THREE.Color(0x6b4430);
  const tmpCol = new THREE.Color();

  let sig = '';
  let size = 0;
  const oreState = new Map();
  let oreList = [];
  let gasList = [];

  function rebuild(snap) {
    size = snap.size;
    if (rockSize !== size) buildRock(size);
    const tiles = snap.tiles;
    let ti = 0;
    let bi = 0;
    let li = 0;
    gasList = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const x = t.x !== undefined ? t.x : i % size;
      const y = t.y !== undefined ? t.y : Math.floor(i / size);
      tileToWorld(x, y, size, vpos);
      const kind = t.kind || 'rock';
      if (kind === 'lava') {
        mat4.makeTranslation(vpos.x, 0, vpos.z);
        lavaMesh.setMatrixAt(li++, mat4);
      }
      mat4.makeTranslation(vpos.x, 0, vpos.z);
      tileMesh.setMatrixAt(ti, mat4);
      const base = ((x + y) & 1) ? colA : colB;
      tmpCol.copy(kind === 'boulder' ? colBoulderTile : (kind === 'lava' ? colLavaTile : base));
      tileMesh.setColorAt(ti, tmpCol);
      ti++;
      if (kind === 'boulder') {
        const s = 0.75 + 0.25 * Math.min(1, (t.hp || 3) / 3);
        vscale.set(s, s, s);
        quat.setFromAxisAngle(UP, x * 1.7 + y * 2.3);
        mat4.compose(vpos, quat, vscale);
        boulderMesh.setMatrixAt(bi++, mat4);
      }
      if (kind === 'gas') gasList.push({ x: vpos.x, z: vpos.z, phase: (x * 1.3 + y * 2.1) });
    }
    tileMesh.count = ti;
    lavaMesh.count = li;
    boulderMesh.count = bi;
    gasMesh.count = gasList.length;
    tileMesh.instanceMatrix.needsUpdate = true;
    if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
    lavaMesh.instanceMatrix.needsUpdate = true;
    boulderMesh.instanceMatrix.needsUpdate = true;
  }

  function signature(snap) {
    let s = snap.size + '|';
    for (let i = 0; i < snap.tiles.length; i++) {
      const t = snap.tiles[i];
      s += (t.kind || 'rock')[0] + (t.hp || 0) + ',';
    }
    return s;
  }

  function setSnapshot(snap) {
    const ns = signature(snap);
    if (ns !== sig) { sig = ns; rebuild(snap); }
    size = snap.size;
    const seen = new Set();
    oreList = [];
    for (let i = 0; i < snap.tiles.length; i++) {
      const t = snap.tiles[i];
      const ore = t.ore || 'none';
      if (ore === 'none' || (t.kind && t.kind !== 'rock')) continue;
      const x = t.x !== undefined ? t.x : i % snap.size;
      const y = t.y !== undefined ? t.y : Math.floor(i / snap.size);
      const key = x + ':' + y;
      seen.add(key);
      let st = oreState.get(key);
      if (!st || st.ore !== ore) {
        st = { ore, stage: 0, shown: 0, pop: 0, spin: (x * 2.1 + y * 1.3) };
        oreState.set(key, st);
      }
      const stage = t.stage === undefined ? 1 : t.stage;
      if (stage >= 1 && st.stage < 1) st.pop = 1;
      st.stage = stage;
      st.x = x; st.y = y;
      oreList.push(st);
    }
    for (const k of Array.from(oreState.keys())) if (!seen.has(k)) oreState.delete(k);
  }

  const counters = {};
  function update(tSec, dtSec) {
    for (const ore of ORES) counters[ore] = 0;
    for (const st of oreList) {
      st.shown += (st.stage - st.shown) * Math.min(1, dtSec * 9);
      if (st.pop > 0) st.pop = Math.max(0, st.pop - dtSec * 3.2);
      const pop = st.pop > 0 ? 1 + Math.sin(st.pop * Math.PI) * 0.26 : 1;
      const s = (0.2 + 0.8 * st.shown) * pop;
      tileToWorld(st.x, st.y, size, vpos);
      vscale.set(s, s, s);
      quat.setFromAxisAngle(UP, st.spin);
      mat4.compose(vpos, quat, vscale);
      const m = oreMeshes[st.ore];
      m.setMatrixAt(counters[st.ore]++, mat4);
    }
    for (const ore of ORES) {
      const m = oreMeshes[ore];
      m.count = counters[ore];
      m.instanceMatrix.needsUpdate = true;
    }
    lavaMat.emissiveIntensity = 1.25 + Math.sin(tSec * 2.1) * 0.35;
    for (let i = 0; i < gasList.length; i++) {
      const g = gasList[i];
      const bob = Math.sin(tSec * 1.4 + g.phase) * 0.05;
      const sp = 0.95 + Math.sin(tSec * 0.9 + g.phase) * 0.07;
      vpos.set(g.x, 0.06 + bob, g.z);
      vscale.set(sp, sp, sp);
      quat.setFromAxisAngle(UP, tSec * 0.25 + g.phase);
      mat4.compose(vpos, quat, vscale);
      gasMesh.setMatrixAt(i, mat4);
    }
    if (gasList.length) gasMesh.instanceMatrix.needsUpdate = true;
  }

  function pickables() {
    return [tileMesh, lavaMesh];
  }

  function tileAtPoint(point) {
    const c = (size - 1) / 2;
    const x = Math.round(point.x / STEP + c);
    const y = Math.round(-point.z / STEP + c);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  }

  function dispose() {
    scene.remove(group);
    tileMesh.geometry.dispose(); tileMat.dispose();
    lavaMesh.geometry.dispose(); lavaMat.dispose();
    boulderMesh.geometry.dispose(); boulderMat.dispose();
    gasMesh.geometry.dispose(); gasMat.dispose();
    for (const ore of ORES) { oreMeshes[ore].geometry.dispose(); oreMeshes[ore].material.dispose(); }
    if (rockMesh) rockMesh.geometry.dispose();
    rockMat.dispose();
  }

  return { group, setSnapshot, update, pickables, tileAtPoint, dispose, getSize: () => size };
}
