// Loads the Blender GLB assets once and hands back plain geometries for the instanced/cloned meshes.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ORES } from '../shared/constants.js';

const BASE = new URL('../../assets/models/', import.meta.url).href;

const FILES = {
  drone: 'drone.glb',
  boulder: 'boulder.glb',
  charge: 'charge.glb',
  ore_stone: 'ore_stone.glb',
  ore_coal: 'ore_coal.glb',
  ore_iron: 'ore_iron.glb',
  ore_gold: 'ore_gold.glb',
  ore_crystal: 'ore_crystal.glb',
};

let warned = false;
function warnOnce(err) {
  if (warned) return;
  warned = true;
  console.warn('[render] GLB models unavailable, keeping procedural fallback:', err && err.message ? err.message : err);
}

function cleanGeometry(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}

function bake(root, test) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (test && !test(o)) return;
    const g = cleanGeometry(o.geometry);
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
  });
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function findByName(root, name) {
  let hit = null;
  root.traverse((o) => { if (!hit && o.name === name) hit = o; });
  return hit;
}

function materialColor(obj, fallback) {
  const m = obj && obj.material;
  const mat = Array.isArray(m) ? m[0] : m;
  if (mat && mat.color) return mat.color.clone();
  return new THREE.Color(fallback);
}

function loadOne(loader, file) {
  return new Promise((resolve, reject) => {
    loader.load(BASE + file, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

const PLAYER_COLOR = 'PlayerColor';

function matName(o) {
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return (m && m.name) || '';
}

function buildDrone(scene) {
  const isRotor = (o) => /^rotor_/.test(o.name);
  const isPlayerColor = (o) => matName(o) === PLAYER_COLOR || o.name === 'body';
  const body = bake(scene, (o) => !isRotor(o) && isPlayerColor(o));
  const frame = bake(scene, (o) => !isRotor(o) && !isPlayerColor(o));
  const rotorNode = findByName(scene, 'rotor_0');
  if (!body || !frame || !rotorNode) throw new Error('drone.glb is missing body/frame/rotor_0');

  const rotor = cleanGeometry(rotorNode.geometry);
  const hubs = [];
  for (let i = 0; i < 4; i++) {
    const n = findByName(scene, 'rotor_' + i);
    if (!n) break;
    n.updateMatrixWorld(true);
    hubs.push(new THREE.Vector3().setFromMatrixPosition(n.matrixWorld));
  }
  const frameMesh = findByName(scene, 'frame') || rotorNode;

  const box = new THREE.Box3().setFromBufferAttribute(rotor.attributes.position);
  const bladeRadius = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));

  return {
    body,
    frame,
    rotor,
    hubs,
    bladeRadius,
    frameColor: materialColor(frameMesh, 0x2b2b2e),
    frameRoughness: frameMesh && frameMesh.material ? frameMesh.material.roughness : 0.55,
  };
}

export function loadModels() {
  const loader = new GLTFLoader();
  const names = Object.keys(FILES);
  return Promise.all(names.map((k) => loadOne(loader, FILES[k])))
    .then((scenes) => {
      const by = {};
      names.forEach((k, i) => { by[k] = scenes[i]; });

      const ores = {};
      for (const ore of ORES) {
        const g = bake(by['ore_' + ore]);
        if (!g) throw new Error('ore_' + ore + '.glb has no mesh');
        ores[ore] = g;
      }
      const boulder = bake(by.boulder);
      const charge = bake(by.charge);
      if (!boulder || !charge) throw new Error('boulder.glb / charge.glb has no mesh');

      const chargeNode = findByName(by.charge, 'charge');
      return {
        ores,
        boulder,
        boulderColor: materialColor(findByName(by.boulder, 'boulder'), 0x8b8d8a),
        charge,
        chargeColor: materialColor(chargeNode, 0xb03a1e),
        drone: buildDrone(by.drone),
      };
    })
    .catch((err) => { warnOnce(err); return null; });
}
