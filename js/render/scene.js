// WebGL stage for print("Hello, Miner"): renderer, scene, lights, adaptive pixel ratio.

import * as THREE from 'three';

export const BG_COLOR = 0x7d97a8;

export function createStage(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: opts.antialias !== false,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const maxDpr = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 1.75);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.background !== undefined ? opts.background : BG_COLOR);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
  camera.position.set(6.5, 7.5, 9.5);

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.5);
  sun.position.set(6, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xa8c4d8, 0.55);
  fill.position.set(-7, 5, -6);
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(0xbcd6e8, 0x6a563e, 1.15);
  scene.add(hemi);

  function setShadowExtent(radius) {
    const r = Math.max(3, radius);
    const c = sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.near = 0.5; c.far = r * 6;
    c.updateProjectionMatrix();
    sun.position.set(r * 0.85, r * 1.65, r * 1.0);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
  }
  setShadowExtent(4);

  function resize() {
    const w = Math.max(1, canvas.clientWidth || canvas.width);
    const h = Math.max(1, canvas.clientHeight || canvas.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return { w, h };
  }
  resize();

  const perf = { frames: 0, slow: 0, acc: 0, last: 0, cooldown: 0 };

  function tickPerf(dtMs, now) {
    perf.frames++;
    perf.acc += dtMs;
    if (dtMs > 20) perf.slow++; else perf.slow = 0;
    if (perf.cooldown > now) return;
    if (perf.slow >= 30 && dpr > 1.0) {
      dpr = Math.max(1.0, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      resize();
      perf.slow = 0; perf.frames = 0; perf.acc = 0;
      perf.cooldown = now + 4000;
      return;
    }
    if (perf.frames >= 120) {
      const avg = perf.acc / perf.frames;
      if (avg <= 15 && dpr < maxDpr) {
        dpr = Math.min(maxDpr, dpr + 0.25);
        renderer.setPixelRatio(dpr);
        resize();
        perf.cooldown = now + 5000;
      }
      perf.frames = 0; perf.acc = 0;
    }
  }

  function applyShadowFlags(root) {
    root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (o.userData.noShadow) { o.castShadow = false; o.receiveShadow = false; return; }
      o.castShadow = o.userData.castShadow !== false;
      o.receiveShadow = o.userData.receiveShadow !== false;
    });
  }

  function dispose() {
    renderer.dispose();
  }

  return {
    renderer, scene, camera, sun, fill, hemi,
    resize, setShadowExtent, tickPerf, applyShadowFlags, dispose,
    getPixelRatio: () => dpr,
  };
}
