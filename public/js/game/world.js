// Baut die 3D-Szene einer Karte: Materialien, HDRI-Himmel & Umgebungslicht, Requisiten, Decals, Kulisse, Ziele
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MATS, materialMaps, letterTexture, decalTexture, waterNormal, paintedMaps } from './textures.js';
import { TEAMS } from '/shared/constants.js';

// ------------------------------------------------------------------ Materialien
const matCache = new Map();
export function worldMaterial(mat, aniso = 4) {
  if (matCache.has(mat)) return matCache.get(mat);
  const def = MATS[mat] || {};
  const maps = materialMaps(mat, aniso);
  const m = new THREE.MeshStandardMaterial({
    map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap || null,
    roughness: def.rough ?? 0.9, metalness: def.metal ?? 0, color: def.tint ?? 0xffffff,
  });
  const ns = def.normalScale ?? 1;
  m.normalScale.set(ns, ns);
  matCache.set(mat, m);
  return m;
}

function boxGeometry(boxes, mat) {
  const def = MATS[mat] || { tile: 3 };
  const pos = [], nor = [], uv = [], idx = [];
  let v = 0;
  const TV = def.tile || 1, TU = TV * (def.aspect || 1);
  for (const b of boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const faces = [
      [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 'zy'],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 'zy'],
      [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 'xz'],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 'xz'],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 'xy'],
      [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 'xy'],
    ];
    for (const [n, corners, axes] of faces) {
      if (n[1] === -1 && y0 <= 0.01) continue;
      if (b.min[1] < -0.5 && n[1] !== 1) continue;
      for (let i = 0; i < 4; i++) {
        const c = corners[i];
        pos.push(c[0], c[1], c[2]);
        nor.push(n[0], n[1], n[2]);
        if (def.fit) uv.push([0, 1, 1, 0][i], [0, 0, 1, 1][i]);
        else if (axes === 'zy') uv.push(c[2] / TU * (n[0] > 0 ? -1 : 1), c[1] / TV);
        else if (axes === 'xy') uv.push(c[0] / TU * (n[2] > 0 ? 1 : -1), c[1] / TV);
        else uv.push(c[0] / TU, c[2] / TV);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ Himmel (HDRI oben, Dunst am Horizont)
const hdrCache = {};
function loadHDR(name) {
  if (!hdrCache[name]) {
    hdrCache[name] = new Promise((res, rej) => {
      new HDRLoader().load(`/assets/hdri/${name}.hdr`, t => { t.mapping = THREE.EquirectangularReflectionMapping; res(t); }, undefined, rej);
    });
  }
  return hdrCache[name];
}

function skyDome(fog, intensity, haze) {
  const geo = new THREE.SphereGeometry(600, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      tex: { value: null }, hasTex: { value: 0 }, fogC: { value: fog.clone() }, inten: { value: intensity }, haze: { value: haze },
      topC: { value: new THREE.Color(0.18, 0.32, 0.6) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform sampler2D tex; uniform float hasTex; uniform vec3 fogC; uniform vec3 topC; uniform float inten; uniform float haze;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 sky;
        if (hasTex > 0.5) {
          vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(max(d.y, 0.003), -1.0, 1.0)) * 0.31830989 + 0.5);
          sky = min(texture2D(tex, uv).rgb, vec3(6.0)) * inten;
        } else sky = mix(fogC, topC, pow(clamp(d.y, 0.0, 1.0), 0.6));
        float h = smoothstep(-0.02, 0.22, d.y);
        vec3 col = mix(fogC, sky, mix(1.0, h, haze));
        col = mix(fogC, col, smoothstep(-0.05, 0.02, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ Requisiten
const propGeo = {};
function getPropGeo(k) {
  if (propGeo[k]) return propGeo[k];
  let g;
  if (k === 'barrel') { g = new THREE.CylinderGeometry(0.29, 0.29, 0.9, 20, 1); g.translate(0, 0.45, 0); }
  if (k === 'barrelLid') { g = new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20); }
  propGeo[k] = g;
  return g;
}

function buildProps(root, boxes, aniso) {
  const metalM = worldMaterial('metal', aniso);
  const woodM = worldMaterial('wood', aniso);
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd89a, emissiveIntensity: 2.4 });
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; root.add(o); return o; };
  for (const b of boxes) {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
    const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2], h = b.max[1] - b.min[1];
    if (b.shape === 'barrel') {
      add(getPropGeo('barrel'), worldMaterial(b.mat, aniso), cx, y0, cz, Math.random() * 6);
    } else if (b.shape === 'pallet') {
      const n = Math.round(h / 0.15);
      const along = w > d;
      for (let i = 0; i < n; i++) {
        const y = y0 + i * 0.15;
        const top = new THREE.BoxGeometry(along ? w : w, 0.03, along ? d : d);
        add(top, woodM, cx, y + 0.135, cz);
        for (const o of [-0.4, 0, 0.4]) {
          const blk = new THREE.BoxGeometry(along ? w : 0.12, 0.1, along ? 0.12 : d);
          add(blk, woodM, cx + (along ? 0 : o * w), y + 0.06, cz + (along ? o * d : 0));
        }
      }
    } else if (b.shape === 'lamp') {
      add(new THREE.CylinderGeometry(0.06, 0.09, h, 8).translate(0, h / 2, 0), metalM, cx, y0, cz);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.9).translate(0, 0, -0.4), metalM, cx, y0 + h - 0.05, cz);
      add(new THREE.BoxGeometry(0.34, 0.12, 0.26), metalM, cx, y0 + h - 0.12, cz - 0.85);
      const bulb = add(new THREE.BoxGeometry(0.26, 0.03, 0.18), lampGlow, cx, y0 + h - 0.19, cz - 0.85);
      bulb.castShadow = false;
    } else if (b.shape === 'bench') {
      const along = w > d;
      add(new THREE.BoxGeometry(along ? w : 0.45, 0.06, along ? 0.45 : d), woodM, cx, y0 + 0.45, cz);
      add(new THREE.BoxGeometry(along ? w : 0.06, 0.4, along ? 0.06 : d), woodM, cx + (along ? 0 : 0.22), y0 + 0.7, cz + (along ? 0.22 : 0));
      for (const o of [-0.42, 0.42]) add(new THREE.BoxGeometry(0.06, 0.45, 0.4), metalM, cx + (along ? o * w : 0), y0 + 0.22, cz + (along ? 0 : o * d));
    }
  }
}

function buildDecor(root, decor, aniso) {
  const cord = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd99a, emissiveIntensity: 3 });
  const shadeM = new THREE.MeshStandardMaterial({ color: 0x2f3a33, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
  const clothCols = [0xe8e0cc, 0x6b8fb8, 0xb8503a, 0xd8c36a, 0x7aa36b, 0xffffff];
  for (const d of decor || []) {
    if (d.type === 'hanglamp') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), cord); c.position.set(d.x, d.y + 0.3, d.z); root.add(c);
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 16, 1, true), shadeM); s.position.set(d.x, d.y - 0.05, d.z); root.add(s);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glow); b.position.set(d.x, d.y - 0.12, d.z); root.add(b);
    } else if (d.type === 'laundry') {
      const len = d.x1 - d.x0;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), cord);
      line.rotation.z = Math.PI / 2; line.position.set((d.x0 + d.x1) / 2, d.y, d.z); root.add(line);
      let x = d.x0 + 0.6, i = 0;
      while (x < d.x1 - 0.6) {
        const w = 0.5 + ((i * 37) % 7) / 10, h = 0.5 + ((i * 53) % 6) / 10;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: clothCols[i % clothCols.length], side: THREE.DoubleSide, roughness: 1 }));
        m.position.set(x + w / 2, d.y - h / 2, d.z); m.rotation.y = (i % 2 ? 0.08 : -0.06);
        m.castShadow = true;
        m.userData.sway = i;
        root.add(m);
        x += w + 0.35; i++;
      }
    }
  }
  void aniso;
}

function buildDecals(root, decals) {
  const mats = {
    stain: new THREE.MeshStandardMaterial({ map: decalTexture('stain'), transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 }),
    line: new THREE.MeshStandardMaterial({ map: decalTexture('line'), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 }),
    puddle: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, alphaMap: decalTexture('puddle'), transparent: true, opacity: 0.85, depthWrite: false, roughness: 0.03, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const geo = new THREE.PlaneGeometry(1, 1);
  for (const d of decals || []) {
    const m = new THREE.Mesh(geo, mats[d.kind]);
    m.rotation.set(-Math.PI / 2, 0, d.rot || 0);
    m.scale.set(d.w, d.d, 1);
    m.position.set(d.x, 0.012, d.z);
    m.receiveShadow = true;
    root.add(m);
  }
}

// ------------------------------------------------------------------ Statische Meshes pro Material zusammenfassen
// (Requisiten, Decals, Kulisse) -> aus hunderten Draw-Calls werden wenige
function mergeStaticMeshes(root, group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  group.traverse(o => {
    if (!o.isMesh || o.userData.dynamic || o.userData.sway !== undefined) return;
    const key = o.material.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!buckets.has(key)) buckets.set(key, { m: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [], order: o.renderOrder });
    buckets.get(key).geos.push(geo);
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  for (const b of buckets.values()) {
    const g = mergeGeometries(b.geos, false);
    for (const x of b.geos) x.dispose();
    if (!g) continue;
    const m = new THREE.Mesh(g, b.m);
    m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order;
    root.add(m);
  }
  root.remove(group);
}

// ------------------------------------------------------------------ Hauptfunktion
export function buildWorld(scene, map, opts = {}) {
  const root = new THREE.Group();
  scene.add(root);
  const th = map.theme;
  const aniso = opts.aniso || 4;
  const fogC = new THREE.Color().setRGB(th.fog[0], th.fog[1], th.fog[2], THREE.LinearSRGBColorSpace);
  scene.background = fogC.clone();
  scene.fog = new THREE.Fog(fogC.clone(), th.fogNear, th.fogFar);

  // ---- Geometrie nach Material ----
  const byMat = {};
  const props = [];
  for (const b of map.boxes) {
    if (b.mat === 'invisible') continue;
    if (b.shape) { props.push(b); continue; }
    (byMat[b.mat] = byMat[b.mat] || []).push(b);
  }
  const meshes = [];
  for (const [mat, list] of Object.entries(byMat)) {
    const mesh = new THREE.Mesh(boxGeometry(list, mat), worldMaterial(mat, aniso));
    mesh.castShadow = mat !== 'asphalt' && mat !== 'cobble' && mat !== 'concreteLight';
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
  }
  const statics = new THREE.Group();
  root.add(statics);
  buildProps(statics, props, aniso);
  buildDecals(statics, map.decals);
  buildDecor(statics, map.decor, aniso);

  // ---- Licht ----
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x5a5040, 0.35);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(th.sunColor, th.sunIntensity);
  const sd = new THREE.Vector3(...th.sun).normalize();
  sun.position.copy(sd).multiplyScalar(90);
  sun.target.position.set(0, 0, 0);
  root.add(sun, sun.target);
  if (opts.shadows) {
    sun.castShadow = true;
    const B = map.bounds;
    const ext = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) * 0.6;
    const cam = sun.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 10; cam.far = 220;
    sun.shadow.mapSize.set(opts.shadowSize || 2048, opts.shadowSize || 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
  }

  // ---- Himmel + Umgebungslicht aus HDRI ----
  const sky = skyDome(fogC, th.skyIntensity ?? 1, th.haze ?? 0.5);
  sky.userData.noAO = true;
  root.add(sky);
  let envRT = null;
  let disposed = false;
  scene.environmentIntensity = th.envIntensity ?? 1;
  if (th.hdri && opts.renderer) {
    loadHDR(th.hdri).then(tex => {
      if (disposed) return;
      sky.material.uniforms.tex.value = tex;
      sky.material.uniforms.hasTex.value = 1;
      const pm = new THREE.PMREMGenerator(opts.renderer);
      envRT = pm.fromEquirectangular(tex);
      pm.dispose();
      scene.environment = envRT.texture;
    }).catch(() => {});
  }

  // ---- Kulisse ----
  const add = (x, y, z, w, h, d, m) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mm.position.set(x, y + h / 2, z); statics.add(mm); return mm;
  };
  let water = null;
  if (th.water) {
    const wn = waterNormal();
    wn.repeat.set(40, 20);
    water = new THREE.Mesh(new THREE.PlaneGeometry(700, 350), new THREE.MeshStandardMaterial({
      color: 0x0f2a36, roughness: 0.07, metalness: 0.15, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35),
    }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -1.3, 31 + 175); root.add(water);
    const quay = new THREE.Mesh(new THREE.BoxGeometry(200, 1.4, 1), worldMaterial('concreteWall', aniso));
    quay.position.set(0, -0.7, 31.5); root.add(quay);
    // Containerschiff
    add(-20, -1.3, 95, 120, 9, 20, new THREE.MeshStandardMaterial({ color: 0x1f2a34, roughness: 0.6, metalness: 0.3 }));
    add(-20, 7.7, 95, 121, 0.3, 21, new THREE.MeshStandardMaterial({ color: 0x8a2a20, roughness: 0.7 }));
    const cm = ['containerRed', 'containerBlue', 'containerGreen', 'containerYellow'].map(m => worldMaterial(m, aniso));
    for (let i = 0; i < 16; i++) for (let k = 0; k < 3; k++) for (const zz of [-4.5, 0, 4.5]) {
      if ((i + k * 3 + zz) % 5 === 0 && k === 2) continue;
      add(-70 + i * 6.5, 8 + k * 2.6, 95 + zz, 6.1, 2.6, 2.45, cm[(i * 7 + k * 3 + Math.round(zz)) % 4]);
    }
    add(40, 7.7, 95, 10, 14, 17, new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.6 }));
    add(40, 21.7, 95, 3, 6, 3, new THREE.MeshStandardMaterial({ color: 0xb8352b, roughness: 0.6 }));
    // Kräne
    const yel = worldMaterial('metalYellow', aniso);
    for (const x of [-60, 55]) {
      add(x - 4, 0, -50, 1.2, 34, 1.2, yel); add(x + 4, 0, -50, 1.2, 34, 1.2, yel);
      add(x - 4, 0, -42, 1.2, 34, 1.2, yel); add(x + 4, 0, -42, 1.2, 34, 1.2, yel);
      add(x, 34, -40, 10, 2.2, 52, yel);
      add(x, 36.2, -48, 4, 3, 4, worldMaterial('metal', aniso));
    }
    // Lagerhäuser hinter der Mauer
    const hm = [worldMaterial('concreteWall', aniso), worldMaterial('brickDark', aniso), worldMaterial('roof', aniso)];
    for (let i = 0; i < 7; i++) add(-90 + i * 30, 0, -50 - (i % 2) * 8, 24, 12 + (i % 3) * 4, 14, hm[i % 3]);
  } else {
    const roof = worldMaterial('roofTile', aniso);
    const walls = [worldMaterial('plaster', aniso), worldMaterial('plasterWarm', aniso), worldMaterial('brickDark', aniso), worldMaterial('stoneWall', aniso)];
    let i = 0;
    for (let x = -60; x <= 60; x += 11) for (const z of [-37, 37]) {
      const h = 9 + ((i * 7) % 5) * 1.6;
      add(x, 0, z, 10.4, h, 10, walls[i % 4]);
      add(x, h, z, 10.8, 1.6, 10.4, roof);
      i++;
    }
    for (let z = -26; z <= 26; z += 11) for (const x of [-44, 44]) {
      const h = 9 + ((i * 5) % 4) * 1.8;
      add(x, 0, z, 10, h, 10.4, walls[i % 4]);
      add(x, h, z, 10.4, 1.6, 10.8, roof);
      i++;
    }
    add(0, 0, -50, 8, 34, 8, worldMaterial('stoneWall', aniso));
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5.6, 12, 4), new THREE.MeshStandardMaterial({ color: 0x3f5a4a, roughness: 0.4, metalness: 0.6 }));
    spire.position.set(0, 40, -50); spire.rotation.y = Math.PI / 4; root.add(spire);
  }

  // Wäsche bleibt beweglich, alles andere wird zusammengefasst
  const swaying = [];
  statics.traverse(o => { if (o.userData.sway !== undefined) swaying.push(o); });
  for (const o of swaying) { o.updateMatrixWorld(); root.attach(o); }
  mergeStaticMeshes(root, statics);

  // ---- Flaggen (Herrschaft) ----
  const flagObjs = [];
  const siteObjs = [];
  if (opts.mode === 'dom') {
    const poleM = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.25 });
    for (const f of map.dom) {
      const g = new THREE.Group();
      g.position.set(f.x, 0, f.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.025;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), poleM);
      pole.position.y = 1.6; pole.castShadow = true;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 8, 3), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }));
      cloth.position.set(0.58, 2.8, 0); cloth.castShadow = true;
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
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.16, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: letterTexture(s.id, '#ffffff'), transparent: true, depthWrite: false }));
      sign.rotation.x = -Math.PI / 2; sign.position.y = 0.04;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ ...paintedMaps('camo', '#4a5236'), roughness: 0.8 }));
      crate.position.set(1.6, 0.3, 1.6); crate.castShadow = true;
      g.add(pad, sign, crate);
      root.add(g);
      siteObjs.push({ id: s.id, g });
    }
  }

  const tmpCol = new THREE.Color();
  const laundry = [];
  root.traverse(o => { if (o.userData.sway !== undefined) laundry.push(o); });
  return {
    root, meshes, sun, flagObjs, siteObjs,
    update(t, modeState, camPos) {
      if (camPos) sky.position.copy(camPos);
      if (water) { water.material.normalMap.offset.set(t * 0.012, t * 0.02); }
      for (const o of laundry) o.rotation.x = Math.sin(t * 1.7 + o.userData.sway) * 0.12;
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
      disposed = true;
      scene.remove(root);
      if (envRT) { envRT.dispose(); if (scene.environment === envRT.texture) scene.environment = null; }
      root.traverse(o => { if (o.geometry && !Object.values(propGeo).includes(o.geometry)) o.geometry.dispose(); });
    },
  };
}
