// Hat-shaped quadcopter drones: procedural meshes, instanced rotors and ground rings, smooth interpolation.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ACTION_MS, SPEED_FACTOR, COLORS } from '../shared/constants.js';
import { tileToWorld } from './tiles.js';

const HOVER = 0.6;
const MAX_DRONES = 32;
const ARM_COLOR = 0x4a3a24;

// Fallbacks when drone.glb does not carry one of the expected materials.
const GROUP_FALLBACK = {
  DroneDark: 0x3a3f46,
  HatBand: 0x6b4a2f,
  Eye: 0x17191c,
};
const PLAYER_GROUP = 'PlayerColor';

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Same as paint(), but takes an already-resolved THREE.Color (GLB colours are linear).
function paintLinear(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function makeBodyGeometry() {
  const parts = [];
  const brim = new THREE.CylinderGeometry(0.34, 0.30, 0.05, 10, 1);
  brim.translate(0, 0.02, 0);
  parts.push(paint(brim, 0xffffff));
  const band = new THREE.CylinderGeometry(0.195, 0.20, 0.045, 10, 1);
  band.translate(0, 0.062, 0);
  parts.push(paint(band, 0xa8703a));
  const crown = new THREE.CylinderGeometry(0.155, 0.185, 0.13, 10, 1);
  crown.translate(0, 0.145, 0);
  parts.push(paint(crown, 0xffffff));
  const cap = new THREE.CylinderGeometry(0.135, 0.16, 0.035, 10, 1);
  cap.translate(0, 0.222, 0);
  parts.push(paint(cap, 0xf2f2f2));
  const dent = new THREE.BoxGeometry(0.10, 0.05, 0.20);
  dent.translate(0, 0.225, 0);
  parts.push(paint(dent, 0xd8d8d8));
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function makeArmsGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const arm = new THREE.BoxGeometry(0.46, 0.045, 0.07);
    arm.translate(0.23, 0, 0);
    arm.rotateY(-a);
    arm.translate(0, -0.005, 0);
    parts.push(arm);
    const hub = new THREE.CylinderGeometry(0.05, 0.055, 0.085, 6, 1);
    hub.translate(Math.cos(a) * 0.44, 0.02, -Math.sin(a) * 0.44);
    parts.push(hub);
    const leg = new THREE.BoxGeometry(0.05, 0.16, 0.05);
    leg.translate(Math.cos(a) * 0.22, -0.10, -Math.sin(a) * 0.22);
    parts.push(leg);
    const foot = new THREE.BoxGeometry(0.16, 0.045, 0.06);
    foot.rotateY(-a);
    foot.translate(Math.cos(a) * 0.24, -0.18, -Math.sin(a) * 0.24);
    parts.push(foot);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function makeRotorGeometry() {
  const parts = [];
  for (let i = 0; i < 2; i++) {
    const b = new THREE.BoxGeometry(0.30, 0.016, 0.055);
    b.translate(0.15, 0, 0);
    b.rotateX(i === 0 ? 0.16 : -0.16);
    b.rotateY(i * Math.PI);
    parts.push(b);
  }
  const hub = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 6, 1);
  parts.push(hub);
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function makeBlurGeometry(radius) {
  const g = new THREE.CircleGeometry(radius || 0.31, 20);
  g.rotateX(-Math.PI / 2);
  return g;
}

function makeRingGeometry() {
  const g = new THREE.RingGeometry(0.30, 0.42, 28, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

export const DRONE_MODELS = {
  body: makeBodyGeometry,
  arms: makeArmsGeometry,
  rotor: makeRotorGeometry,
  ring: makeRingGeometry,
  blur: makeBlurGeometry,
};

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function yawFor(dir) {
  if (dir === 'right') return -Math.PI / 2;
  if (dir === 'left') return Math.PI / 2;
  if (dir === 'down') return Math.PI;
  return 0;
}

function shortAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createDroneLayer(scene, models = DRONE_MODELS) {
  const group = new THREE.Group();
  group.name = 'drones';
  scene.add(group);

  let bodyGeo = models.body();
  let armsGeo = models.arms();
  let ownBodyGeo = true;
  let ownArmsGeo = true;
  let usingGLB = false;
  const hubs = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    hubs.push(new THREE.Vector3(Math.cos(a) * 0.44, 0.09, -Math.sin(a) * 0.44));
  }

  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.7, flatShading: true });
  const rotorMesh = new THREE.InstancedMesh(models.rotor(), rotorMat, MAX_DRONES * 4);
  rotorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rotorMesh.count = 0;
  rotorMesh.castShadow = true;
  rotorMesh.receiveShadow = false;
  rotorMesh.frustumCulled = false;
  group.add(rotorMesh);

  const blurMat = new THREE.MeshBasicMaterial({
    color: 0x2e2517, transparent: true, opacity: 0.16, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const blurMesh = new THREE.InstancedMesh((models.blur || makeBlurGeometry)(), blurMat, MAX_DRONES * 4);
  blurMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blurMesh.count = 0;
  blurMesh.castShadow = false;
  blurMesh.receiveShadow = false;
  blurMesh.userData.noShadow = true;
  blurMesh.frustumCulled = false;
  blurMesh.renderOrder = 1;
  group.add(blurMesh);

  const ringMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const ringMesh = new THREE.InstancedMesh(models.ring(), ringMat, MAX_DRONES);
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.count = 0;
  ringMesh.userData.noShadow = true;
  ringMesh.castShadow = false;
  ringMesh.receiveShadow = false;
  ringMesh.frustumCulled = false;
  ringMesh.renderOrder = 2;
  group.add(ringMesh);

  const drones = new Map();
  let players = {};
  let size = 1;
  let speedLevel = 0;

  function colorFor(owner, index) {
    const p = players[owner];
    let hex = p && (p.color || p.hex);
    if (hex && typeof hex === 'object') hex = hex.hex;
    if (typeof hex === 'string' && hex[0] !== '#') {
      const found = COLORS.find((c) => c.id === hex);
      hex = found ? found.hex : null;
    }
    if (!hex) hex = COLORS[index % COLORS.length].hex;
    return new THREE.Color(hex);
  }

  const bodyMats = new Map();
  let armMat = new THREE.MeshStandardMaterial({
    color: ARM_COLOR, roughness: 0.85, flatShading: true,
  });

  function bodyMatFor(color) {
    const key = color.getHexString();
    let m = bodyMats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: color.clone(),
        vertexColors: !usingGLB,
        roughness: usingGLB ? 0.8 : 0.62,
        metalness: 0.0,
        flatShading: true,
      });
      bodyMats.set(key, m);
    }
    return m;
  }

  function clearFade(d) {
    if (!d.fading) return;
    d.fading = false;
    d.body.material.dispose();
    d.arms.material.dispose();
    d.body.material = d.bodyMat;
    d.arms.material = armMat;
  }

  function applyFade(d, fade) {
    if (!d.fading) {
      d.fading = true;
      const b = d.bodyMat.clone();
      const a = armMat.clone();
      b.transparent = true; a.transparent = true;
      d.body.material = b;
      d.arms.material = a;
    }
    d.body.material.opacity = fade;
    d.arms.material.opacity = fade;
  }

  function makeDrone(id, owner, index) {
    const color = colorFor(owner, index);
    const bodyMat = bodyMatFor(color);
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = false;
    body.userData.droneId = id;
    const arms = new THREE.Mesh(armsGeo, armMat);
    arms.castShadow = true;
    arms.receiveShadow = false;
    arms.userData.droneId = id;
    g.add(arms, body);
    group.add(g);
    return {
      id, owner, group: g, body, arms, frame: arms, bodyMat, color, fading: false,
      px: 0, pz: 0, ready: false, yaw: 0, phase: Math.random() * Math.PI * 2,
      deadT: 0, popT: 0, wrapHalf: -1, tilt: 0, mineFired: false,
      prevOp: null, prevProgress: 0, alive: true,
    };
  }

  function refreshMaterials() {
    let i = 0;
    for (const d of drones.values()) {
      d.color = colorFor(d.owner, i++);
      d.bodyMat = bodyMatFor(d.color);
      if (d.fading) {
        d.body.material.color.copy(d.color);
      } else {
        d.body.material = d.bodyMat;
        d.arms.material = armMat;
      }
    }
  }

  function setPlayers(p) {
    players = {};
    if (!p) return;
    if (Array.isArray(p)) { for (const q of p) players[q.id] = q; }
    else Object.assign(players, p);
    refreshMaterials();
  }

  function applyModels(assets) {
    const dm = assets && assets.drone;
    if (!dm || !dm.body || !dm.frame || !dm.rotor) return;
    const groups = dm.groups || {};
    const gmats = dm.materials || {};

    // One mesh per material would cost 2 extra draw calls per drone; instead the dark frame,
    // the hat band and the eye are merged into a single vertex-coloured geometry.
    const restNames = Object.keys(groups).filter((k) => k !== PLAYER_GROUP);
    let restGeo = null;
    if (restNames.length) {
      const painted = restNames.map((k) => {
        const info = gmats[k];
        const col = info && info.color ? info.color : new THREE.Color(GROUP_FALLBACK[k] === undefined ? GROUP_FALLBACK.DroneDark : GROUP_FALLBACK[k]);
        return paintLinear(groups[k].clone(), col);
      });
      restGeo = painted.length === 1 ? painted[0] : mergeGeometries(painted, false);
      if (painted.length > 1) painted.forEach((g) => g.dispose());
    }

    if (ownBodyGeo) bodyGeo.dispose();
    if (ownArmsGeo) armsGeo.dispose();
    bodyGeo = groups[PLAYER_GROUP] || dm.body;
    ownBodyGeo = false;
    if (restGeo) { armsGeo = restGeo; ownArmsGeo = true; }
    else { armsGeo = dm.frame; ownArmsGeo = false; }
    usingGLB = true;

    const darkInfo = gmats.DroneDark;

    rotorMesh.geometry.dispose();
    rotorMesh.geometry = dm.rotor;
    if (dm.frameColor) rotorMat.color.copy(dm.frameColor);
    rotorMat.roughness = dm.frameRoughness === undefined ? 0.55 : dm.frameRoughness;
    rotorMat.metalness = 0.2;
    rotorMat.flatShading = false;
    rotorMat.needsUpdate = true;

    armMat.color.set(0xffffff);
    armMat.vertexColors = !!restGeo;
    if (!restGeo && dm.frameColor) armMat.color.copy(dm.frameColor);
    armMat.roughness = darkInfo && darkInfo.roughness !== undefined
      ? darkInfo.roughness
      : (dm.frameRoughness === undefined ? 0.55 : dm.frameRoughness);
    armMat.metalness = darkInfo && darkInfo.metalness !== undefined ? darkInfo.metalness : 0.2;
    armMat.flatShading = false;
    armMat.needsUpdate = true;

    if (dm.hubs && dm.hubs.length === 4) {
      for (let i = 0; i < 4; i++) hubs[i].copy(dm.hubs[i]);
    }
    const br = dm.bladeRadius || 0.2;
    blurMesh.geometry.dispose();
    blurMesh.geometry = makeBlurGeometry(br * 1.04);
    blurMat.opacity = 0.06;

    for (const m of bodyMats.values()) {
      m.vertexColors = false;
      m.roughness = 0.8;
      m.needsUpdate = true;
    }
    for (const d of drones.values()) {
      d.body.geometry = bodyGeo;
      d.arms.geometry = armsGeo;
    }
  }

  function sync(snap) {
    size = snap.size;
    speedLevel = (snap.levels && snap.levels.speed) || 0;
    const list = snap.drones || {};
    const ids = Array.isArray(list) ? list.map((d) => d.id) : Object.keys(list);
    let i = 0;
    for (const id of ids) {
      const d = Array.isArray(list) ? list.find((q) => q.id === id) : list[id];
      if (!drones.has(id)) drones.set(id, makeDrone(id, d.owner, i));
      i++;
    }
    for (const id of Array.from(drones.keys())) {
      const present = Array.isArray(list) ? list.some((q) => q.id === id) : Object.prototype.hasOwnProperty.call(list, id);
      if (!present) {
        const d = drones.get(id);
        clearFade(d);
        group.remove(d.group);
        drones.delete(id);
      }
    }
  }

  function actionDuration(op) {
    return (ACTION_MS[op] || 300) * Math.pow(SPEED_FACTOR, speedLevel);
  }

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3(1, 1, 1);
  const world = { x: 0, y: 0, z: 0 };
  const UP = new THREE.Vector3(0, 1, 0);

  function update(snap, ageMs, tSec, dtSec, fx) {
    if (!snap) return;
    const list = snap.drones || {};
    const ids = Array.isArray(list) ? list.map((d) => d.id) : Object.keys(list);
    let rotorI = 0;
    let ringI = 0;
    for (let n = 0; n < ids.length; n++) {
      const id = ids[n];
      const s = Array.isArray(list) ? list.find((q) => q.id === id) : list[id];
      const d = drones.get(id);
      if (!d || !s) continue;

      let gx = s.x;
      let gy = s.y;
      let half = -1;
      const act = s.action;
      let progress = 0;
      if (act) {
        const dur = actionDuration(act.op);
        progress = Math.min(1, Math.max(0, (act.progress || 0) + ageMs / dur));
      }
      if (act && act.op === 'move') {
        const fxx = act.fromX, fyy = act.fromY;
        let dx = s.x - fxx;
        let dy = s.y - fyy;
        const wrapped = Math.abs(dx) > 1 || Math.abs(dy) > 1;
        if (dx > 1) dx -= size; else if (dx < -1) dx += size;
        if (dy > 1) dy -= size; else if (dy < -1) dy += size;
        const e = easeInOut(progress);
        if (!wrapped) {
          gx = fxx + dx * e;
          gy = fyy + dy * e;
        } else if (e < 0.5) {
          gx = fxx + dx * e; gy = fyy + dy * e; half = 0;
        } else {
          gx = s.x - dx * (1 - e); gy = s.y - dy * (1 - e); half = 1;
        }
      }
      tileToWorld(gx, gy, size, world);

      const teleport = !d.ready || (half !== d.wrapHalf && d.wrapHalf !== -1 && half !== -1);
      d.wrapHalf = half;
      const k = teleport ? 1 : 1 - Math.exp(-26 * dtSec);
      d.px += (world.x - d.px) * k;
      d.pz += (world.z - d.pz) * k;
      d.ready = true;

      const dead = s.state === 'dead';
      if (dead) {
        d.deadT += dtSec;
        d.alive = false;
      } else {
        if (!d.alive) { d.popT = 0.36; d.alive = true; }
        d.deadT = 0;
      }
      if (d.popT > 0) d.popT = Math.max(0, d.popT - dtSec);

      let tiltTarget = 0;
      if (act && act.op === 'mine') tiltTarget = Math.sin(progress * Math.PI) * 0.42;
      else if (act && act.op === 'place') tiltTarget = Math.sin(progress * Math.PI) * 0.18;
      else if (act && act.op === 'move') tiltTarget = -Math.sin(progress * Math.PI) * 0.16;
      d.tilt += (tiltTarget - d.tilt) * Math.min(1, dtSec * 12);

      const op = act ? act.op : null;
      if (op !== d.prevOp || (act && progress + 0.002 < d.prevProgress)) d.mineFired = false;
      d.prevOp = op;
      d.prevProgress = progress;
      if (op === 'mine' && fx && progress > 0.32 && !d.mineFired) {
        d.mineFired = true;
        fx.burst(d.px, 0.06, d.pz);
      }

      const bob = Math.sin(tSec * 2.1 + d.phase) * 0.035;
      let y = HOVER + bob;
      let fade = 1;
      let scale = 1;
      let tilt = d.tilt;
      if (dead) {
        const t = Math.min(1, d.deadT / 0.9);
        y = HOVER + bob - 2.6 * t * t;
        fade = Math.max(0, 1 - t * 1.15);
        tilt = d.tilt + 0.9 * t;
      }
      if (d.popT > 0) {
        const p = 1 - d.popT / 0.36;
        scale = 1 + Math.sin(p * Math.PI) * 0.35 - (1 - p) * 0.9;
        scale = Math.max(0.05, scale);
      }

      d.group.position.set(d.px, y, d.pz);
      const targetYaw = yawFor(s.dir || 'up');
      d.yaw += shortAngle(d.yaw, targetYaw) * Math.min(1, dtSec * 10);
      d.group.rotation.set(tilt, d.yaw, Math.sin(tSec * 1.5 + d.phase) * 0.03);
      d.group.scale.setScalar(scale);
      d.group.visible = fade > 0.02;
      if (fade > 0.999) clearFade(d); else applyFade(d, fade);

      if (!dead && fade > 0.02) {
        d.group.updateMatrixWorld();
        const spin = tSec * 26 + d.phase;
        for (let r = 0; r < 4; r++) {
          tmpV.copy(hubs[r]);
          tmpQ.setFromAxisAngle(UP, spin * (r % 2 === 0 ? 1 : -1));
          tmpS.setScalar(1);
          tmpM.compose(tmpV, tmpQ, tmpS);
          tmpM.premultiply(d.group.matrixWorld);
          rotorMesh.setMatrixAt(rotorI, tmpM);
          blurMesh.setMatrixAt(rotorI, tmpM);
          rotorI++;
        }
        const rs = 0.9 + Math.sin(tSec * 2.1 + d.phase) * 0.06;
        tmpV.set(d.px, 0.012, d.pz);
        tmpQ.setFromAxisAngle(UP, tSec * 0.4 + d.phase);
        tmpS.set(rs, 1, rs);
        tmpM.compose(tmpV, tmpQ, tmpS);
        ringMesh.setMatrixAt(ringI, tmpM);
        ringMesh.setColorAt(ringI, d.color);
        ringI++;
      }
    }
    rotorMesh.count = rotorI;
    blurMesh.count = rotorI;
    ringMesh.count = ringI;
    rotorMesh.instanceMatrix.needsUpdate = true;
    blurMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  }

  function pickables() {
    const out = [];
    for (const d of drones.values()) { out.push(d.body, d.arms); }
    return out;
  }

  function getDrone(id) {
    return drones.get(id);
  }

  function dispose() {
    for (const d of drones.values()) clearFade(d);
    for (const m of bodyMats.values()) m.dispose();
    bodyMats.clear();
    armMat.dispose();
    drones.clear();
    if (ownBodyGeo) bodyGeo.dispose();
    if (ownArmsGeo) armsGeo.dispose();
    rotorMesh.geometry.dispose();
    rotorMat.dispose();
    blurMesh.geometry.dispose();
    blurMat.dispose();
    ringMesh.geometry.dispose();
    ringMat.dispose();
    scene.remove(group);
  }

  return { group, sync, setPlayers, update, pickables, getDrone, applyModels, dispose };
}
