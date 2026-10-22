// Baut die 3D-Szene einer Karte: Geometrie, Licht, Himmel, Kulisse, Flaggen & Bombenplätze
import * as THREE from 'three';
import { MATS, texture, letterTexture } from './textures.js';
import { TEAMS } from '/shared/constants.js';

function boxGeometry(boxes, mat) {
  const def = MATS[mat] || { tile: 3 };
  const pos = [], nor = [], uv = [], idx = [];
  let v = 0;
  const T = def.tile || 1;
  for (const b of boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const faces = [
      // normal, 4 Ecken, uv-Achsen
      [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 'zy'],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 'zy'],
      [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 'xz'],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 'xz'],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 'xy'],
      [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 'xy'],
    ];
    for (const [n, corners, axes] of faces) {
      if (n[1] === -1 && y0 <= 0.01) continue; // Unterseiten am Boden weglassen
      if (b.min[1] < -0.5 && n[1] !== 1) continue; // Bodenplatte nur oben
      for (let i = 0; i < 4; i++) {
        const c = corners[i];
        pos.push(c[0], c[1], c[2]);
        nor.push(n[0], n[1], n[2]);
        if (def.fit) {
          const u = [0, 1, 1, 0][i], w = [0, 0, 1, 1][i];
          uv.push(u, w);
        } else {
          let u, w;
          if (axes === 'zy') { u = c[2] / T * (n[0] > 0 ? -1 : 1); w = c[1] / T; }
          else if (axes === 'xy') { u = c[0] / T * (n[2] > 0 ? 1 : -1); w = c[1] / T; }
          else { u = c[0] / T; w = c[2] / T; }
          uv.push(u, w);
        }
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
    void sx; void sy; void sz;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function skyDome(top, bottom) {
  const geo = new THREE.SphereGeometry(500, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vp; void main(){ float h = clamp(vp.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.8)),1.0); }',
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

export function buildWorld(scene, map, opts = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const th = map.theme;
  scene.background = new THREE.Color(th.fog);
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);

  // ---- Geometrie nach Material ----
  const byMat = {};
  for (const b of map.boxes) {
    if (b.mat === 'invisible') continue;
    (byMat[b.mat] = byMat[b.mat] || []).push(b);
  }
  const meshes = [];
  for (const [mat, list] of Object.entries(byMat)) {
    const def = MATS[mat] || {};
    const material = new THREE.MeshStandardMaterial({
      map: texture(mat, opts.aniso || 4), roughness: def.rough ?? 0.9, metalness: def.metal ?? 0,
    });
    const mesh = new THREE.Mesh(boxGeometry(list, mat), material);
    mesh.castShadow = !mat.startsWith('asphalt') && mat !== 'cobble';
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
  }

  // ---- Licht ----
  const hemi = new THREE.HemisphereLight(th.sky[0], 0x4a4436, 1.25);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(th.sunColor, 2.3);
  const sd = new THREE.Vector3(...th.sun).normalize();
  sun.position.copy(sd).multiplyScalar(80);
  sun.target.position.set(0, 0, 0);
  root.add(sun, sun.target);
  if (opts.shadows) {
    sun.castShadow = true;
    const B = map.bounds;
    const ext = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) * 0.62;
    const cam = sun.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 10; cam.far = 220;
    sun.shadow.mapSize.set(opts.shadowSize || 2048, opts.shadowSize || 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
  }
  root.add(skyDome(th.sky[0], th.sky[1]));

  // ---- Kulisse ----
  const deco = new THREE.MeshStandardMaterial({ color: 0x6b6f72, roughness: 0.9 });
  const add = (x, y, z, w, h, d, m = deco) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mm.position.set(x, y + h / 2, z); root.add(mm); return mm;
  };
  if (th.water) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshStandardMaterial({ color: 0x2d5a72, roughness: 0.18, metalness: 0.35 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -1.4, 31 + 150); root.add(water);
    const quay = new THREE.Mesh(new THREE.BoxGeometry(200, 1.4, 1), new THREE.MeshStandardMaterial({ color: 0x77736a }));
    quay.position.set(0, -0.7, 31.5); root.add(quay);
    // Containerschiff
    const hull = new THREE.MeshStandardMaterial({ color: 0x23303c, roughness: 0.7 });
    add(-20, -1.4, 95, 120, 9, 20, hull);
    const cols = [0x9c2f24, 0x28507e, 0x3f6a3a, 0xc08a1e, 0x8a8a8a];
    for (let i = 0; i < 16; i++) for (let k = 0; k < 2; k++) add(-70 + i * 6.5, 7.6 + k * 2.6, 95 + (k ? 3 : -3), 6.1, 2.6, 5, new THREE.MeshStandardMaterial({ color: cols[(i * 3 + k) % 5], roughness: 0.7 }));
    add(40, 7.6, 95, 10, 12, 16, new THREE.MeshStandardMaterial({ color: 0xe8e2d4 }));
    // Kräne
    const yel = new THREE.MeshStandardMaterial({ color: 0xd6a51f, roughness: 0.6 });
    for (const x of [-60, 55]) {
      add(x - 4, 0, -50, 1.2, 34, 1.2, yel); add(x + 4, 0, -50, 1.2, 34, 1.2, yel);
      add(x, 34, -45, 2, 2, 40, yel);
    }
    // Lagerhäuser hinter der Mauer
    for (let i = 0; i < 6; i++) add(-75 + i * 30, 0, -48 - (i % 2) * 8, 24, 12 + (i % 3) * 4, 14, new THREE.MeshStandardMaterial({ color: [0x7c7f80, 0x8a6e5a, 0x5f6d72][i % 3], roughness: 0.9 }));
  } else {
    // Altstadt: Häuser rundherum + Kirchturm
    const hcols = [0xc9b28f, 0xb98b6a, 0xd8c7a3, 0x9f7d64, 0xcfb6a0];
    const roof = new THREE.MeshStandardMaterial({ map: texture('roofTile'), roughness: 0.85 });
    let i = 0;
    for (let x = -60; x <= 60; x += 11) for (const z of [-37, 37]) {
      const h = 9 + ((i * 7) % 5) * 1.6;
      add(x, 0, z, 10.4, h, 10, new THREE.MeshStandardMaterial({ color: hcols[i % 5], roughness: 0.95 }));
      const r = add(x, h, z, 10.8, 1.6, 10.4, roof); r.scale.y = 1;
      i++;
    }
    for (let z = -26; z <= 26; z += 11) for (const x of [-44, 44]) {
      const h = 9 + ((i * 5) % 4) * 1.8;
      add(x, 0, z, 10, h, 10.4, new THREE.MeshStandardMaterial({ color: hcols[i % 5], roughness: 0.95 }));
      add(x, h, z, 10.4, 1.6, 10.8, roof);
      i++;
    }
    const tower = new THREE.MeshStandardMaterial({ color: 0xbdb3a0, roughness: 0.95 });
    add(0, 0, -50, 8, 34, 8, tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5.6, 12, 4), new THREE.MeshStandardMaterial({ color: 0x3f5a4a, roughness: 0.6, metalness: 0.3 }));
    spire.position.set(0, 40, -50); spire.rotation.y = Math.PI / 4; root.add(spire);
  }

  // ---- Flaggen (Herrschaft) ----
  const flagObjs = [];
  const siteObjs = [];
  if (opts.mode === 'dom') {
    for (const f of map.dom) {
      const g = new THREE.Group();
      g.position.set(f.x, 0, f.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.025;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 }));
      pole.position.y = 1.6;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 6, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }));
      cloth.position.set(0.58, 2.8, 0);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: letterTexture(f.id), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      sign.rotation.x = -Math.PI / 2; sign.position.y = 0.04;
      g.add(ring, disc, pole, cloth, sign);
      root.add(g);
      flagObjs.push({ id: f.id, g, ring, disc, cloth, base: cloth.geometry.attributes.position.array.slice() });
    }
  }
  if (opts.mode === 'snd') {
    for (const s of map.snd) {
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.18, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: letterTexture(s.id, '#ffffff'), transparent: true, depthWrite: false }));
      sign.rotation.x = -Math.PI / 2; sign.position.y = 0.04;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a6b3a, roughness: 0.8 }));
      crate.position.set(1.6, 0.3, 1.6);
      g.add(pad, sign, crate);
      root.add(g);
      siteObjs.push({ id: s.id, g });
    }
  }

  const tmpCol = new THREE.Color();
  return {
    root, meshes, sun, flagObjs, siteObjs,
    update(t, modeState) {
      // Flaggen einfärben + wehen lassen
      for (let i = 0; i < flagObjs.length; i++) {
        const fo = flagObjs[i];
        const st = modeState && modeState.f ? modeState.f[i] : null;
        const owner = st ? st[0] : -1;
        tmpCol.set(owner >= 0 ? TEAMS[owner].hex : 0xe6e6e6);
        fo.cloth.material.color.copy(tmpCol);
        fo.ring.material.color.copy(tmpCol);
        fo.disc.material.color.copy(tmpCol);
        fo.disc.material.opacity = st && st[3] ? 0.22 + 0.12 * Math.sin(t * 12) : 0.1;
        const pos = fo.cloth.geometry.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          const bx = fo.base[k * 3];
          pos.array[k * 3 + 2] = Math.sin(t * 5 + bx * 4 + i) * 0.08 * (bx + 0.55);
        }
        pos.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(root);
      root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.map) o.material.dispose(); });
    },
  };
}
