// Dust bursts for mining and a CSS2D speech-bubble overlay above drones.

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const MAX_DUST = 180;
const STYLE_ID = 'hm-render-bubble-style';
const CSS = `
.hm-overlay{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.hm-bubble{position:absolute;transform:translate(-50%,-100%);background:#fff;color:#22303a;
font:600 13px/1.25 "Fredoka",system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 11px;
border-radius:13px;white-space:pre;max-width:220px;overflow:hidden;text-overflow:ellipsis;
box-shadow:0 4px 12px rgba(20,35,45,.28);opacity:0;transition:opacity .15s ease,transform .15s ease;
will-change:opacity,transform}
.hm-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;width:10px;height:10px;
background:#fff;transform:translateX(-50%) rotate(45deg);border-radius:2px}
.hm-bubble.hm-on{opacity:1}
`;

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.appendChild(s);
}

export function createDustField(scene) {
  const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const mat = new THREE.MeshStandardMaterial({ color: 0xcda06a, roughness: 1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_DUST);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const pool = [];
  for (let i = 0; i < MAX_DUST; i++) pool.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s: 1, rot: 0, spin: 0 });

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const UP = new THREE.Vector3(0.4, 1, 0.2).normalize();

  function burst(x, y, z) {
    const n = 6 + Math.floor(Math.random() * 5);
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < n; i++) {
      const p = pool[i];
      if (p.live) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.1;
      p.live = true;
      p.x = x + (Math.random() - 0.5) * 0.3;
      p.y = y + Math.random() * 0.1;
      p.z = z + (Math.random() - 0.5) * 0.3;
      p.vx = Math.cos(a) * sp * 0.5;
      p.vz = Math.sin(a) * sp * 0.5;
      p.vy = 1.5 + Math.random() * 1.3;
      p.t = 0;
      p.life = 0.7 + Math.random() * 0.4;
      p.s = 0.6 + Math.random() * 0.8;
      p.rot = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 8;
      spawned++;
    }
  }

  function update(dtSec) {
    let n = 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.live) continue;
      p.t += dtSec;
      if (p.t >= p.life) { p.live = false; continue; }
      p.vy -= 9.0 * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.z += p.vz * dtSec;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.32; p.vx *= 0.6; p.vz *= 0.6; }
      p.rot += p.spin * dtSec;
      const k = 1 - p.t / p.life;
      const s = p.s * k * k;
      v.set(p.x, p.y, p.z);
      q.setFromAxisAngle(UP, p.rot);
      sv.set(s, s, s);
      m4.compose(v, q, sv);
      mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n;
    if (n > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    scene.remove(mesh);
    geo.dispose();
    mat.dispose();
  }

  return { burst, update, dispose, mesh };
}

export function createBubbleLayer(scene, canvas) {
  const doc = canvas.ownerDocument;
  ensureStyle(doc);
  const overlay = doc.createElement('div');
  overlay.className = 'hm-overlay';
  const host = canvas.parentNode || doc.body;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(overlay);

  const css2d = new CSS2DRenderer({ element: overlay });
  css2d.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);

  const bubbles = new Map();

  function show(droneId, text, anchor, height) {
    let b = bubbles.get(droneId);
    if (!b) {
      const el = doc.createElement('div');
      el.className = 'hm-bubble';
      const obj = new CSS2DObject(el);
      obj.center.set(0.5, 1);
      b = { el, obj, timer: 0, parent: null };
      bubbles.set(droneId, b);
    }
    b.el.textContent = String(text);
    if (b.parent !== anchor) {
      if (b.parent) b.parent.remove(b.obj);
      anchor.add(b.obj);
      b.parent = anchor;
    }
    b.obj.position.set(0, height, 0);
    b.obj.visible = true;
    requestAnimationFrame(() => b.el.classList.add('hm-on'));
    b.timer = 2.0;
  }

  function update(dtSec) {
    for (const b of bubbles.values()) {
      if (b.timer <= 0) continue;
      b.timer -= dtSec;
      if (b.timer <= 0) {
        b.el.classList.remove('hm-on');
        setTimeout(() => { if (b.timer <= 0) b.obj.visible = false; }, 170);
      }
    }
  }

  function render(camera) {
    css2d.render(scene, camera);
  }

  function resize(w, h) {
    css2d.setSize(w, h);
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
    overlay.style.left = canvas.offsetLeft + 'px';
    overlay.style.top = canvas.offsetTop + 'px';
  }

  function dispose() {
    for (const b of bubbles.values()) { if (b.parent) b.parent.remove(b.obj); }
    bubbles.clear();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  return { show, update, render, resize, dispose, overlay };
}
