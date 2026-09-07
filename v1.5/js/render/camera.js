// Orbit camera with clamped polar angle and a 600 ms fit-to-grid tween.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FIT_MS = 600;

export function createCameraRig(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.screenSpacePanning = false;
  controls.panSpeed = 0.6;
  controls.minPolarAngle = THREE.MathUtils.degToRad(25);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(70);
  controls.minAzimuthAngle = THREE.MathUtils.degToRad(-38);
  controls.maxAzimuthAngle = THREE.MathUtils.degToRad(38);
  controls.minDistance = 3.5;
  controls.maxDistance = 42;
  controls.target.set(0, 0, 0);

  let tween = null;
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function distanceFor(radius) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(0.5, camera.aspect);
    const need = radius * 1.45;
    const vertical = need / Math.tan(fov / 2);
    const horizontal = need / (Math.tan(fov / 2) * aspect);
    return Math.max(vertical, horizontal) + 1.2;
  }

  function fit(radius, instant) {
    const dist = THREE.MathUtils.clamp(distanceFor(radius), controls.minDistance, controls.maxDistance);
    if (instant) {
      dir.subVectors(camera.position, controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0.66, 0.75);
      dir.normalize().multiplyScalar(dist);
      controls.target.set(0, 0, 0);
      camera.position.copy(controls.target).add(dir);
      controls.update();
      tween = null;
      return;
    }
    tween = {
      t0: performance.now(),
      fromTarget: controls.target.clone(),
      fromDist: camera.position.distanceTo(controls.target),
      toDist: dist,
    };
  }

  function update() {
    if (tween) {
      const p = Math.min(1, (performance.now() - tween.t0) / FIT_MS);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      dir.subVectors(camera.position, controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.72, 0.9);
      dir.normalize();
      tmp.copy(tween.fromTarget).multiplyScalar(1 - e);
      controls.target.copy(tmp);
      const dist = tween.fromDist + (tween.toDist - tween.fromDist) * e;
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      if (p >= 1) tween = null;
    }
    controls.update();
  }

  function dispose() {
    controls.dispose();
  }

  return { controls, fit, update, dispose, isTweening: () => !!tween };
}
