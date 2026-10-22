// Waffen- und Soldatenmodelle: geformte, abgerundete Teile statt Klötzchen
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS } from '/shared/weapons.js';
import { paintedMaps, materialMaps } from './textures.js';
import { camoMaterial } from './camos.js';

// ---------------------------------------------------------------- Materialien
const matCache = {};
function mat(color, rough = 0.6, metal = 0.3, emissive = 0) {
  const k = `${color}_${rough}_${metal}_${emissive}`;
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ? color : 0, emissiveIntensity: emissive });
  return matCache[k];
}
function gunMetal(color) {
  const k = 'gm' + color;
  if (!matCache[k]) {
    const maps = materialMaps('metal');
    matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.75, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) });
  }
  return matCache[k];
}
function polymer(color) {
  const k = 'pm' + color;
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.05 });
  return matCache[k];
}
function woodMat() {
  if (!matCache.wood) {
    const maps = materialMaps('wood');
    matCache.wood = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, color: 0xb07a4a, roughness: 0.55, metalness: 0 });
    matCache.wood.normalScale.set(0.4, 0.4);
  }
  return matCache.wood;
}

// ---------------------------------------------------------------- Hilfsfunktionen (x = vorwärts, y = oben, z = Breite)
function shape(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}
function ext(parent, pts, width, m, bevel = 0.004, holes = [], zOff = 0) {
  const g = new THREE.ExtrudeGeometry(shape(pts, holes), { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -width / 2 + zOff);
  const o = new THREE.Mesh(g, m);
  parent.add(o);
  return o;
}
const cylG = new THREE.CylinderGeometry(1, 1, 1, 16);
cylG.rotateZ(Math.PI / 2); // entlang x
function cyl(parent, m, r, len, x0, y, z = 0) {
  const o = new THREE.Mesh(cylG, m);
  o.scale.set(len, r, r); o.position.set(x0 + len / 2, y, z);
  parent.add(o);
  return o;
}
const tubeG = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
tubeG.rotateZ(Math.PI / 2);
function tube(parent, m, r, len, x0, y, z = 0) {
  const o = new THREE.Mesh(tubeG, m);
  o.scale.set(len, r, r); o.position.set(x0 + len / 2, y, z);
  parent.add(o);
  return o;
}
function rbox(parent, m, lx, h, w, x, y, z = 0, r = 0.004) {
  const o = new THREE.Mesh(new RoundedBoxGeometry(lx, h, w, 2, Math.min(r, lx / 2.2, h / 2.2, w / 2.2)), m);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function rail(parent, m, x0, x1, y) {
  rbox(parent, m, x1 - x0, 0.008, 0.022, (x0 + x1) / 2, y + 0.004, 0, 0.002);
  for (let x = x0 + 0.006; x < x1 - 0.004; x += 0.01) rbox(parent, m, 0.005, 0.005, 0.024, x, y + 0.0105, 0, 0.001);
}

// Fasst unbewegliche Teile pro Material zu einem Mesh zusammen (weniger Draw-Calls)
// flat: Material, das alle einfarbigen Teile ersetzt (Farbe wandert in Vertex-Farben) -> weniger Draw-Calls
function mergeStatic(group, keep = new Set(), flat = null) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const buckets = new Map();
  const victims = [];
  const visit = (o) => {
    for (const c of [...o.children]) {
      if (keep.has(c)) continue;
      if (c.isMesh && !c.material.transparent && !c.userData.pivot) {
        const m = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
        let geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        geo.applyMatrix4(m);
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        if (geo.morphAttributes) geo.morphAttributes = {};
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        let target = c.material;
        if (flat && !c.material.map) {
          const col = c.material.color.clone();
          if (c.material.emissive && c.material.emissiveIntensity) col.lerp(new THREE.Color(1, 1, 1), 0.15).multiplyScalar(1.25);
          const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
          geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
          target = flat;
        } else if (flat) {
          const n = geo.attributes.position.count;
          geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
        }
        if (!buckets.has(target)) buckets.set(target, []);
        buckets.get(target).push(geo);
        victims.push(c);
      }
      if (!c.userData.pivot && !c.isMesh) visit(c);
    }
  };
  visit(group);
  for (const v of victims) v.parent.remove(v);
  for (const [m, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, m);
    mm.castShadow = true;
    group.add(mm);
  }
}

// ---------------------------------------------------------------- Waffen
// Rückgabe: Gruppe mit Lauf entlang -Z, Ursprung am Griff. userData: muzzle, sightY, sightZ, optic, mag
// Fertige Waffen nach Konfiguration cachen und klonen (Geometrie wird geteilt)
const gunProto = new Map();
export function buildGun(weaponId, attachments = [], camo = 'none', lite = false) {
  const key = weaponId + '|' + [...attachments].sort().join(',') + '|' + (camo || 'none') + (lite ? '|lite' : '');
  if (!gunProto.has(key)) gunProto.set(key, buildGunProto(weaponId, attachments, camo, lite));
  const g = gunProto.get(key).clone(true);
  g.userData.muzzle = g.getObjectByName('muzzle');
  g.userData.mag = g.getObjectByName('mag') || null;
  return g;
}

function buildGunProto(weaponId, attachments = [], camo = 'none', lite = false) {
  const W = WEAPONS[weaponId] || WEAPONS.kr7;
  const md = W.model;
  const has = a => attachments.includes(a);
  const outer = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.y = Math.PI / 2;
  outer.add(g);
  const cm = camoMaterial(camo);
  const mastery = camo === 'gold' || camo === 'diamond' || camo === 'darkmatter';
  const body = cm || gunMetal(md.color);
  const acc = cm || polymer(md.accent);
  const wood = () => cm || woodMat();
  const dark = gunMetal(0x1a1b1c);
  const blk = mastery ? cm : polymer(0x161718);
  const L = md.len;
  const kind = md.kind;
  const pistol = kind === 'pistol' || kind === 'revolver';
  let barrelLen = md.barrel + (has('longbarrel') ? 0.1 : 0) - (has('shortbarrel') ? Math.min(0.07, md.barrel * 0.6) : 0);
  let railY = 0.084, barrelY = 0.045, frontX = 0, mag = null;
  let ironRearX = -0.02, ironFrontX = 0.4;

  if (kind === 'rifle' || kind === 'lmg') {
    const lmg = kind === 'lmg';
    const recEnd = lmg ? 0.3 : 0.26, hgEnd = recEnd + L * (lmg ? 0.38 : 0.42), top = lmg ? 0.085 : 0.072;
    railY = top + 0.012;
    // Gehäuse mit Magazinschacht
    ext(g, [[-0.07, 0.012], [-0.07, top], [recEnd, top], [recEnd, 0.014], [0.17, 0.014], [0.16, -0.035], [0.06, -0.035], [0.05, 0], [0.0, 0.0], [-0.03, 0.012]], 0.05, body, 0.004);
    rbox(g, dark, 0.07, 0.016, 0.054, 0.12, top - 0.025, 0, 0.003);          // Auswurfabdeckung
    rbox(g, dark, 0.03, 0.012, 0.012, -0.05, top - 0.006, -0.027, 0.003);     // Ladehebel
    // Handschutz mit Lüftungsschlitzen
    const vents = [];
    for (let x = recEnd + 0.03; x < hgEnd - 0.04; x += 0.045) vents.push([[x, 0.026], [x + 0.025, 0.026], [x + 0.025, 0.044], [x, 0.044]]);
    ext(g, [[recEnd, 0.006], [recEnd, top - 0.002], [hgEnd - 0.01, top - 0.002], [hgEnd, top - 0.012], [hgEnd, 0.016], [hgEnd - 0.012, 0.006]], 0.054, acc, 0.004, vents);
    rail(g, dark, -0.06, hgEnd - 0.02, top);
    frontX = hgEnd;
    ironFrontX = hgEnd - 0.03;
    // Schaft
    if (has('lightstock')) {
      ext(g, [[-0.06, 0.06], [-0.3, 0.064], [-0.31, 0.055], [-0.31, -0.045], [-0.3, -0.055], [-0.27, -0.055], [-0.27, 0.02], [-0.06, 0.02]], 0.03, blk, 0.003, [[[-0.25, 0.03], [-0.08, 0.03], [-0.08, 0.05], [-0.25, 0.052]]]);
    } else {
      const heavy = has('heavystock') || lmg;
      ext(g, [[-0.07, 0.066], [-0.31, 0.07], [-0.325, 0.06], [-0.325, heavy ? -0.07 : -0.055], [-0.3, heavy ? -0.075 : -0.06], [-0.2, -0.025], [-0.07, 0.014]], heavy ? 0.05 : 0.044, acc, 0.006);
      rbox(g, blk, 0.012, heavy ? 0.13 : 0.12, heavy ? 0.052 : 0.046, -0.325, heavy ? -0.003 : 0.003, 0, 0.004);
    }
    // Griff + Abzugsbügel
    ext(g, [[0.0, 0.002], [0.038, 0.002], [0.018, -0.105], [-0.02, -0.105], [-0.028, -0.092]], 0.032, acc, 0.005);
    ext(g, [[0.035, 0.0], [0.095, 0.0], [0.088, -0.032], [0.04, -0.032]], 0.012, blk, 0.002, [[[0.045, -0.006], [0.085, -0.006], [0.08, -0.026], [0.048, -0.026]]]);
    // Magazin
    const ml = has('extmag') ? 1.45 : 1;
    if (md.mag === 'curved') mag = ext(g, [[0.072, -0.03], [0.148, -0.03], [0.148 + 0.035 * ml, -0.03 - 0.13 * ml], [0.095 + 0.04 * ml, -0.035 - 0.14 * ml]], 0.03, blk, 0.003);
    else if (md.mag === 'drum') { mag = cyl(g, blk, 0.075, 0.06, 0.06, -0.075, 0); mag.rotation.y = Math.PI / 2; mag.position.set(0.11, -0.08, 0.0); }
    else mag = ext(g, [[0.075, -0.03], [0.148, -0.03], [0.14, -0.03 - 0.11 * ml], [0.08, -0.03 - 0.11 * ml]], 0.032, blk, 0.003);
    if (has('fastmag') && md.mag !== 'drum') ext(g, [[0.075, -0.03], [0.148, -0.03], [0.14, -0.13], [0.08, -0.13]], 0.03, blk, 0.003, [], 0.034);
    if (lmg) {
      // Tragegriff + Zweibein
      ext(g, [[0.12, top], [0.14, top + 0.05], [0.24, top + 0.05], [0.26, top]], 0.016, blk, 0.003, [[[0.15, top + 0.008], [0.23, top + 0.008], [0.225, top + 0.038], [0.155, top + 0.038]]]);
    }
  } else if (kind === 'smg') {
    const recEnd = 0.2, hgEnd = recEnd + L * 0.28, top = 0.07;
    railY = top + 0.012;
    ext(g, [[-0.06, 0.01], [-0.06, top], [hgEnd, top], [hgEnd, 0.02], [0.15, 0.012], [0.145, -0.03], [0.06, -0.03], [0.05, 0], [-0.02, 0.0]], 0.048, body, 0.005,
      [[[recEnd + 0.01, 0.03], [hgEnd - 0.02, 0.03], [hgEnd - 0.02, 0.045], [recEnd + 0.01, 0.045]]]);
    rail(g, dark, -0.05, hgEnd - 0.02, top);
    rbox(g, dark, 0.05, 0.015, 0.05, 0.1, top - 0.022, 0, 0.003);
    frontX = hgEnd; ironFrontX = hgEnd - 0.025;
    // Klappschaft (Rohr)
    if (has('heavystock')) ext(g, [[-0.06, 0.06], [-0.27, 0.064], [-0.28, -0.05], [-0.2, -0.02], [-0.06, 0.016]], 0.044, acc, 0.006);
    else {
      cyl(g, dark, 0.006, 0.2, -0.26, 0.056, 0.012); cyl(g, dark, 0.006, 0.2, -0.26, 0.056, -0.012);
      cyl(g, dark, 0.006, 0.16, -0.26, 0.0, 0);
      rbox(g, blk, 0.014, 0.1, 0.04, -0.265, 0.02, 0, 0.004);
    }
    ext(g, [[0.0, 0.002], [0.036, 0.002], [0.018, -0.1], [-0.018, -0.1], [-0.026, -0.088]], 0.03, acc, 0.005);
    ext(g, [[0.035, 0.0], [0.09, 0.0], [0.085, -0.03], [0.04, -0.03]], 0.011, blk, 0.002, [[[0.044, -0.006], [0.082, -0.006], [0.078, -0.024], [0.047, -0.024]]]);
    const ml = (has('extmag') ? 1.4 : 1) * (md.mag === 'long' ? 1.4 : 1);
    mag = ext(g, [[0.075, -0.026], [0.14, -0.026], [0.14, -0.026 - 0.12 * ml], [0.08, -0.026 - 0.12 * ml]], 0.026, blk, 0.003);
    if (has('fastmag')) ext(g, [[0.075, -0.026], [0.14, -0.026], [0.14, -0.146], [0.08, -0.146]], 0.024, blk, 0.003, [], 0.028);
  } else if (kind === 'shotgun') {
    const recEnd = 0.24, top = 0.075;
    railY = top + 0.01;
    ext(g, [[-0.04, 0.012], [-0.04, top], [recEnd, top], [recEnd, 0.008], [0.11, 0.0], [0.0, 0.0], [-0.03, 0.01]], 0.052, body, 0.005);
    rail(g, dark, -0.03, recEnd - 0.02, top);
    // Holzschaft
    ext(g, [[-0.04, 0.062], [-0.33, 0.055], [-0.34, 0.045], [-0.34, -0.07], [-0.32, -0.078], [-0.16, -0.035], [-0.03, -0.075], [0.01, -0.07], [0.0, 0.002], [-0.04, 0.012]], 0.046, wood(), 0.007);
    rbox(g, blk, 0.014, 0.13, 0.05, -0.34, -0.008, 0, 0.005);
    ext(g, [[0.03, 0.0], [0.09, 0.0], [0.085, -0.03], [0.035, -0.03]], 0.012, blk, 0.002, [[[0.04, -0.006], [0.08, -0.006], [0.076, -0.024], [0.042, -0.024]]]);
    const len = L * 0.62 + md.barrel;
    cyl(g, dark, 0.016, len, recEnd, 0.052);
    cyl(g, dark, 0.013, len * 0.78, recEnd, 0.02);                          // Röhrenmagazin
    const pump = new THREE.Group(); g.add(pump);
    for (let i = 0; i < 6; i++) cyl(pump, i % 2 ? wood() : (mastery ? cm : polymer(0x2a1d14)), 0.024, 0.022, recEnd + 0.06 + i * 0.022, 0.022);
    mag = pump;
    if (md.mag === 'drum') { const d = cyl(g, blk, 0.07, 0.07, 0.1, -0.06); d.rotation.y = Math.PI / 2; d.position.set(0.12, -0.07, 0); mag = d; }
    frontX = recEnd + len; barrelY = 0.052; barrelLen = 0;
    ironFrontX = frontX - 0.02;
    rbox(g, mat(0xd8c060, 0.4, 0.6), 0.006, 0.012, 0.006, frontX - 0.02, 0.074, 0, 0.002);
  } else if (kind === 'sniper') {
    // Lochschaft-Chassis
    ext(g, [[-0.4, 0.05], [-0.2, 0.06], [0.0, 0.03], [0.32, 0.03], [0.34, 0.0], [0.34, -0.02], [0.08, -0.02], [0.06, -0.035], [0.0, -0.035],
      [-0.02, -0.1], [-0.06, -0.1], [-0.08, -0.04], [-0.2, -0.05], [-0.38, -0.08], [-0.41, -0.07]], 0.05, acc, 0.008,
      [[[-0.12, 0.0], [-0.04, 0.0], [-0.06, -0.06], [-0.1, -0.05]]]);
    rbox(g, blk, 0.016, 0.15, 0.054, -0.41, -0.01, 0, 0.006);
    cyl(g, body, 0.022, 0.24, -0.02, 0.055);                               // Verschluss
    const bolt = cyl(g, dark, 0.006, 0.05, 0.02, 0.055, 0.03); bolt.rotation.y = 1.2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), dark); knob.position.set(0.0, 0.045, 0.06); g.add(knob);
    rail(g, dark, -0.03, 0.2, 0.077);
    railY = 0.087;
    ext(g, [[0.04, 0.03], [0.04, 0.0], [0.09, 0.0], [0.085, 0.03]], 0.012, blk, 0.002, [[[0.048, 0.006], [0.08, 0.006], [0.078, 0.024], [0.05, 0.024]]], 0);
    mag = ext(g, [[0.12, -0.02], [0.2, -0.02], [0.2, -0.07], [0.12, -0.07]], 0.04, blk, 0.003);
    frontX = 0.34; barrelY = 0.055;
    if (!has('suppressor') && !has('compensator') && !has('flashhider')) { rbox(g, dark, 0.07, 0.03, 0.04, 0.34 + barrelLen + 0.035, barrelY, 0, 0.004); barrelLen += 0.07; }
  } else {
    // Pistole / Revolver
    if (kind === 'revolver') {
      ext(g, [[-0.03, 0.03], [-0.02, 0.075], [0.07, 0.075], [0.07, 0.025], [0.02, 0.0], [-0.02, 0.0]], 0.03, body, 0.004);
      cyl(g, body, 0.026, 0.05, 0.015, 0.05).rotation.x = 0.3;
      cyl(g, body, 0.012, L - 0.05, 0.07, 0.06);
      rbox(g, body, L - 0.06, 0.012, 0.016, 0.07 + (L - 0.06) / 2, 0.072, 0, 0.003);
      ext(g, [[-0.025, 0.0], [0.012, 0.0], [0.0, -0.06], [-0.012, -0.095], [-0.05, -0.095], [-0.045, -0.05]], 0.034, wood(), 0.006);
      frontX = L + 0.02; barrelY = 0.06;
      railY = 0.078;
    } else {
      const sl = L;
      ext(g, [[-0.035, 0.035], [-0.035, 0.074], [sl, 0.074], [sl, 0.035]], 0.03, body, 0.004);                       // Schlitten
      for (let x = -0.03; x < 0.01; x += 0.008) rbox(g, dark, 0.003, 0.03, 0.032, x, 0.055, 0, 0.001);
      ext(g, [[-0.03, 0.035], [sl - 0.01, 0.035], [sl - 0.01, 0.018], [0.05, 0.012], [0.0, 0.0], [-0.03, 0.01]], 0.027, acc, 0.003);
      ext(g, [[-0.028, 0.012], [0.012, 0.012], [-0.006, -0.085], [-0.045, -0.085], [-0.05, -0.07]], 0.03, acc, 0.006);
      ext(g, [[0.008, 0.012], [0.06, 0.012], [0.055, -0.018], [0.012, -0.018]], 0.01, blk, 0.002, [[[0.016, 0.006], [0.052, 0.006], [0.048, -0.012], [0.02, -0.012]]]);
      if (md.mag === 'long') mag = ext(g, [[-0.01, -0.08], [-0.042, -0.08], [-0.05, -0.15], [-0.016, -0.15]], 0.024, blk, 0.003);
      frontX = sl; barrelY = 0.055;
      railY = 0.074;
      if (W.cls === 'pistol' && md.barrel) { cyl(g, dark, 0.008, md.barrel, sl, 0.055); frontX = sl + md.barrel; }
    }
    ironRearX = 0.0; ironFrontX = frontX - 0.015;
    barrelLen = 0;
  }

  // Lauf
  if (barrelLen > 0) {
    cyl(g, dark, kind === 'sniper' ? 0.012 : 0.011, barrelLen, frontX, barrelY);
    if (kind === 'rifle' && !has('shortbarrel')) rbox(g, dark, 0.012, 0.02, 0.026, frontX + 0.03, barrelY + 0.008, 0, 0.003);   // Gasblock
    frontX += barrelLen;
  }
  // Mündung
  let mx = frontX;
  if (has('suppressor')) { cyl(g, blk, pistol ? 0.016 : 0.021, 0.17, mx, barrelY); mx += 0.17; }
  else if (has('compensator')) {
    rbox(g, dark, 0.05, 0.03, 0.03, mx + 0.025, barrelY, 0, 0.005);
    for (let i = 0; i < 3; i++) rbox(g, blk, 0.006, 0.006, 0.032, mx + 0.012 + i * 0.012, barrelY + 0.012, 0, 0.001);
    mx += 0.05;
  } else if (has('flashhider')) {
    cyl(g, dark, 0.015, 0.06, mx, barrelY);
    for (let i = 0; i < 4; i++) { const sl = rbox(g, blk, 0.04, 0.003, 0.004, mx + 0.03, barrelY + Math.cos(i * 1.57) * 0.014, Math.sin(i * 1.57) * 0.014, 0.001); void sl; }
    mx += 0.06;
  } else if (kind === 'rifle' || kind === 'smg' || kind === 'lmg') { cyl(g, dark, 0.014, 0.035, mx, barrelY); mx += 0.035; }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(mx + 0.01, barrelY, 0);
  g.add(muzzle);

  // Unterlauf
  const ubX = kind === 'rifle' || kind === 'lmg' ? 0.26 + L * 0.2 : kind === 'smg' ? 0.25 : kind === 'shotgun' ? 0.2 : kind === 'sniper' ? 0.2 : 0.06;
  if (!pistol) {
    if (has('vgrip')) { cyl(g, blk, 0.014, 0.075, ubX, -0.03).rotation.z = Math.PI / 2; g.children[g.children.length - 1].position.set(ubX, -0.03, 0); }
    if (has('agrip')) ext(g, [[ubX - 0.04, 0.008], [ubX + 0.04, 0.008], [ubX + 0.03, -0.012], [ubX - 0.02, -0.04]], 0.026, blk, 0.003);
  }
  if (has('laser')) {
    const lx = pistol ? 0.06 : ubX + 0.06, ly = pistol ? 0.02 : 0.03, lz = pistol ? 0 : 0.032;
    rbox(g, blk, 0.06, 0.022, 0.02, lx, ly, lz, 0.004);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.004, 8), mat(0xff2020, 0.3, 0, 3));
    dot.position.set(lx + 0.031, ly, lz); dot.rotation.y = Math.PI / 2; g.add(dot);
  }
  if (kind === 'lmg' || (kind === 'sniper')) {
    // Zweibein (eingeklappt)
    cyl(g, dark, 0.005, 0.16, frontX - barrelLen - 0.05, barrelY - 0.03, 0.012);
    cyl(g, dark, 0.005, 0.16, frontX - barrelLen - 0.05, barrelY - 0.03, -0.012);
  }

  // Visier
  const optic = W.fixedOptic || attachments.find(a => ['reddot', 'holo', 'acog'].includes(a)) || 'iron';
  let sightY, sightX;
  const sx = pistol ? 0.03 : 0.04;
  if (optic === 'reddot') {
    rbox(g, dark, 0.06, 0.012, 0.034, sx, railY + 0.012, 0, 0.003);
    const f = new THREE.Group(); f.position.set(sx + 0.01, railY + 0.04, 0); g.add(f);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0045, 8, 20), dark); ring.rotation.y = Math.PI / 2; f.add(ring);
    rbox(f, dark, 0.02, 0.02, 0.012, 0, -0.02, 0, 0.003);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.14, depthWrite: false }));
    glass.rotation.y = -Math.PI / 2; f.add(glass);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    dot.rotation.y = -Math.PI / 2; dot.position.x = 0.001; f.add(dot);
    sightY = railY + 0.04; sightX = sx;
  } else if (optic === 'holo') {
    rbox(g, dark, 0.08, 0.016, 0.04, sx, railY + 0.012, 0, 0.004);
    const f = new THREE.Group(); f.position.set(sx + 0.02, railY + 0.042, 0); g.add(f);
    rbox(f, dark, 0.06, 0.006, 0.05, 0, 0.026, 0, 0.002);
    rbox(f, dark, 0.06, 0.05, 0.006, 0, 0, 0.025, 0.002);
    rbox(f, dark, 0.06, 0.05, 0.006, 0, 0, -0.025, 0.002);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.04), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.13, depthWrite: false }));
    glass.rotation.y = -Math.PI / 2; f.add(glass);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0062, 0.0072, 24), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    ring.rotation.y = -Math.PI / 2; ring.position.x = 0.001; f.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    dot.rotation.y = -Math.PI / 2; dot.position.x = 0.001; f.add(dot);
    sightY = railY + 0.042; sightX = sx;
  } else if (optic === 'acog' || optic === 'scope') {
    const len = optic === 'scope' ? 0.32 : 0.15, r = optic === 'scope' ? 0.022 : 0.02;
    const sy = railY + (optic === 'scope' ? 0.045 : 0.038);
    const scopeM = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide });
    tube(g, scopeM, r, len, sx - len / 2 + 0.02, sy);
    tube(g, scopeM, r * 1.45, optic === 'scope' ? 0.07 : 0.04, sx + 0.02 + len / 2 - (optic === 'scope' ? 0.07 : 0.04), sy);
    tube(g, scopeM, r * 1.25, 0.05, sx + 0.02 - len / 2, sy);
    const ringG = new THREE.RingGeometry(r, r * 1.45, 20);
    const fr = new THREE.Mesh(ringG, scopeM); fr.rotation.y = Math.PI / 2; fr.position.set(sx + 0.02 + len / 2 - (optic === 'scope' ? 0.07 : 0.04), sy, 0); g.add(fr);
    if (optic === 'scope') { const tur = cyl(g, dark, 0.012, 0.03, sx, sy + 0.022); tur.rotation.z = Math.PI / 2; tur.position.set(sx, sy + 0.025, 0); }
    const mh = sy - r - railY + 0.002;
    rbox(g, dark, 0.02, mh, 0.03, sx - len * 0.22, railY + mh / 2, 0, 0.003);
    rbox(g, dark, 0.02, mh, 0.03, sx + len * 0.22, railY + mh / 2, 0, 0.003);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 1.15, 20), optic === 'acog' ? new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.1, depthWrite: false }) : new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.9 }));
    lens.rotation.y = Math.PI / 2; lens.position.set(sx + 0.02 + len / 2 + 0.001, sy, 0); g.add(lens);
    const back = new THREE.Mesh(new THREE.CircleGeometry(r * 1.0, 20), optic === 'acog' ? new THREE.MeshBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.12, depthWrite: false }) : new THREE.MeshBasicMaterial({ color: 0x0b1015 }));
    back.rotation.y = -Math.PI / 2; back.position.set(sx + 0.02 - len / 2 - 0.026, sy, 0); g.add(back);
    if (optic === 'acog') {
      const chev = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 3), new THREE.MeshBasicMaterial({ color: 0xff4020 }));
      chev.rotation.set(0, -Math.PI / 2, Math.PI / 2); chev.position.set(sx + 0.02 - len / 2 - 0.027, sy, 0); g.add(chev);
    }
    sightY = sy; sightX = sx + 0.02 - len / 2 - 0.026;
  } else {
    // Kimme und Korn
    if (pistol) {
      rbox(g, dark, 0.008, 0.01, 0.024, ironRearX, railY + 0.005, 0, 0.002);
      rbox(g, dark, 0.006, 0.01, 0.006, ironFrontX, railY + 0.005, 0, 0.002);
      sightY = railY + 0.008; sightX = ironRearX;
    } else {
      // Diopter (Ring in Blickrichtung) + Korn mit Schutzohren
      const sy = railY + 0.03;
      ext(g, [[ironRearX - 0.012, railY + 0.008], [ironRearX + 0.01, railY + 0.008], [ironRearX + 0.006, railY + 0.022], [ironRearX - 0.008, railY + 0.022]], 0.022, dark, 0.002);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0065, 0.0028, 8, 18), dark);
      ring.rotation.y = Math.PI / 2; ring.position.set(ironRearX, sy, 0); g.add(ring);
      ext(g, [[ironFrontX - 0.012, railY - 0.004], [ironFrontX + 0.012, railY - 0.004], [ironFrontX + 0.004, railY + 0.012], [ironFrontX - 0.004, railY + 0.012]], 0.026, dark, 0.002);
      rbox(g, dark, 0.004, sy - railY - 0.008, 0.0028, ironFrontX, railY + 0.008 + (sy - railY - 0.008) / 2 - 0.0005, 0, 0.0008);
      rbox(g, dark, 0.006, 0.026, 0.003, ironFrontX, railY + 0.016, 0.011, 0.001);
      rbox(g, dark, 0.006, 0.026, 0.003, ironFrontX, railY + 0.016, -0.011, 0.001);
      sightY = sy; sightX = ironRearX;
    }
  }

  const keep = new Set([muzzle]);
  if (lite) {
    // Waffen anderer Spieler: Kleinteile weg, Rest in möglichst wenige Meshes
    const drop = [];
    g.traverse(o => { if (o.isMesh && (o.material.transparent || o.material.isMeshBasicMaterial)) drop.push(o); });
    for (const o of drop) o.parent.remove(o);
    mergeStatic(g, keep, soldierFlat());
  } else {
    if (mag) keep.add(mag);
    mergeStatic(g, keep);
  }
  muzzle.name = 'muzzle';
  if (mag) mag.name = 'mag';
  outer.userData.sightY = sightY;
  outer.userData.sightZ = -sightX;
  outer.userData.optic = optic;
  outer.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return outer;
}

// ---------------------------------------------------------------- Soldat
const capCache = {};
function capsule(r, len) {
  const k = r + '_' + len;
  if (!capCache[k]) capCache[k] = new THREE.CapsuleGeometry(r, len, 4, 10);
  return capCache[k];
}
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; }

let flatMat = null;
function soldierFlat() {
  if (!flatMat) flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  return flatMat;
}

// Atlas: links Tarnmuster, rechts weiß. Einfarbige Teile zeigen auf die weiße Hälfte und bekommen ihre Farbe per Vertex-Farbe.
const atlasCache = {};
function soldierAtlas(teamHex) {
  if (atlasCache[teamHex]) return atlasCache[teamHex];
  const camo = paintedMaps('camo', teamHex === 0x3b8cff ? '#4b5a4a' : '#6b5d45');
  const mk = (img, fill) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 256, 256);
    g.fillStyle = fill; g.fillRect(256, 0, 256, 256);
    return c;
  };
  const map = new THREE.CanvasTexture(mk(camo.map.image, '#ffffff'));
  map.colorSpace = THREE.SRGBColorSpace;
  const nrm = new THREE.CanvasTexture(mk(camo.normalMap.image, '#8080ff'));
  const m = new THREE.MeshStandardMaterial({ map, normalMap: nrm, vertexColors: true, roughness: 0.85, metalness: 0.05 });
  m.normalScale.set(0.6, 0.6);
  atlasCache[teamHex] = m;
  return m;
}

// Für Soldaten: alles einer Gelenkgruppe in EIN Mesh mit Atlas-Material zusammenfassen
function mergeAtlas(group, atlas, camoMat) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const geos = [];
  const victims = [];
  for (const c of [...group.children]) {
    if (!c.isMesh || c.userData.pivot) continue;
    const m = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
    const geo = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone());
    geo.applyMatrix4(m);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    const n = geo.attributes.position.count;
    const uv = geo.attributes.uv ? geo.attributes.uv.array : new Float32Array(n * 2);
    const col = new Float32Array(n * 3);
    const isCamo = c.material === camoMat;
    const color = isCamo ? new THREE.Color(0xdddddd) : c.material.color.clone();
    if (!isCamo && c.material.emissiveIntensity) color.multiplyScalar(1.35);
    for (let i = 0; i < n; i++) {
      if (isCamo) { uv[i * 2] = 0.004 + (((uv[i * 2] % 1) + 1) % 1) * 0.492; }
      else { uv[i * 2] = 0.75; uv[i * 2 + 1] = 0.5; }
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geos.push(geo);
    victims.push(c);
  }
  for (const v of victims) group.remove(v);
  if (!geos.length) return;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, atlas);
  mesh.castShadow = true;
  group.add(mesh);
}
const soldierMatCache = {};
function soldierMats(teamHex) {
  if (soldierMatCache[teamHex]) return soldierMatCache[teamHex];
  const teamC = new THREE.Color(teamHex);
  const camoBase = teamHex === 0x3b8cff ? '#4b5a4a' : '#6b5d45';
  const camo = paintedMaps('camo', camoBase);
  const uni = new THREE.MeshStandardMaterial({ map: camo.map, normalMap: camo.normalMap, roughness: 0.9, color: 0xdddddd });
  uni.normalScale.set(0.6, 0.6);
  const M = {
    uni,
    vest: new THREE.MeshStandardMaterial({ color: teamHex === 0x3b8cff ? 0x2f3b33 : 0x5a4a34, roughness: 0.85 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x1f2219, roughness: 0.9 }),
    team: new THREE.MeshStandardMaterial({ color: teamC, roughness: 0.5, emissive: teamC, emissiveIntensity: 0.35 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.75 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x222420, roughness: 0.85 }),
    helmM: new THREE.MeshStandardMaterial({ color: teamHex === 0x3b8cff ? 0x3c4a3c : 0x6b5a40, roughness: 0.7 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.75 }),
    gogg: new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.1, metalness: 0.8 }),
  };
  soldierMatCache[teamHex] = M;
  return M;
}

// Fertige Soldaten-Geometrie pro Team einmal bauen und danach nur noch klonen
const soldierProto = {};
export function buildSoldier(teamHex) {
  if (!soldierProto[teamHex]) soldierProto[teamHex] = buildSoldierProto(teamHex);
  const g = soldierProto[teamHex].clone(true);
  const find = (name) => g.getObjectByName(name);
  const legs = [0, 1].map(i => ({ leg: find('leg' + i), knee: find('knee' + i) }));
  g.userData = { hips: find('hips'), legs, torso: find('torso'), head: find('head'), arms: find('arms'), gunSlot: find('gunSlot') };
  return g;
}

function buildSoldierProto(teamHex) {
  const g = new THREE.Group();
  const { uni, vest, strap, team, boot, glove, helmM, skin, gogg } = soldierMats(teamHex);

  const hips = new THREE.Group(); hips.name = 'hips'; hips.position.y = 0.92; g.add(hips);
  hips.add(mesh(new RoundedBoxGeometry(0.34, 0.18, 0.22, 2, 0.05), uni, 0, -0.02, 0));
  hips.add(mesh(new RoundedBoxGeometry(0.36, 0.05, 0.24, 2, 0.02), strap, 0, 0.05, 0));
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = 'leg' + legs.length; leg.position.set(0.1 * s, -0.04, 0); hips.add(leg);
    leg.add(mesh(capsule(0.085, 0.26), uni, 0, -0.2, 0));
    leg.add(mesh(new RoundedBoxGeometry(0.1, 0.12, 0.06, 2, 0.02), vest, 0.07 * s, -0.22, 0));   // Beintasche
    const knee = new THREE.Group(); knee.name = 'knee' + legs.length; knee.position.set(0, -0.42, 0); leg.add(knee);
    knee.add(mesh(new THREE.SphereGeometry(0.075, 10, 8), vest, 0, 0, -0.03));
    knee.add(mesh(capsule(0.072, 0.26), uni, 0, -0.2, 0));
    knee.add(mesh(new RoundedBoxGeometry(0.15, 0.12, 0.27, 2, 0.04), boot, 0, -0.4, -0.04));
    legs.push({ leg, knee });
  }
  const torso = new THREE.Group(); torso.name = 'torso'; hips.add(torso);
  torso.add(mesh(new RoundedBoxGeometry(0.4, 0.5, 0.24, 3, 0.08), uni, 0, 0.3, 0));
  torso.add(mesh(new RoundedBoxGeometry(0.44, 0.38, 0.3, 3, 0.06), vest, 0, 0.32, 0));
  for (const x of [-0.12, 0, 0.12]) torso.add(mesh(new RoundedBoxGeometry(0.1, 0.12, 0.06, 2, 0.02), vest, x, 0.24, -0.17));
  torso.add(mesh(new RoundedBoxGeometry(0.34, 0.36, 0.14, 3, 0.05), strap, 0, 0.34, 0.2));                // Rucksack
  torso.add(mesh(new RoundedBoxGeometry(0.1, 0.06, 0.02, 1, 0.01), team, 0.13, 0.44, -0.156));            // Abzeichen
  const neck = mesh(capsule(0.06, 0.04), strap, 0, 0.6, 0); torso.add(neck);
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.64; torso.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.11, 16, 12), strap, 0, 0.1, 0));
  head.add(mesh(new RoundedBoxGeometry(0.15, 0.1, 0.06, 2, 0.025), skin, 0, 0.11, -0.075));
  const helmet = mesh(new THREE.SphereGeometry(0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmM, 0, 0.13, 0.005);
  head.add(helmet);
  head.add(mesh(new THREE.TorusGeometry(0.128, 0.012, 6, 24), team, 0, 0.13, 0.005)).children;
  head.children[head.children.length - 1].rotation.x = Math.PI / 2;
  head.add(mesh(new RoundedBoxGeometry(0.17, 0.05, 0.05, 2, 0.02), gogg, 0, 0.12, -0.095));
  head.add(mesh(new RoundedBoxGeometry(0.16, 0.08, 0.1, 2, 0.03), strap, 0, 0.04, -0.06));               // Gesichtsschutz
  // Arme halten die Waffe (drehen mit Blickneigung)
  const arms = new THREE.Group(); arms.name = 'arms'; arms.position.set(0, 0.5, 0); torso.add(arms);
  const upperR = new THREE.Group(); upperR.position.set(0.22, 0, 0); arms.add(upperR);
  upperR.add(mesh(capsule(0.06, 0.2), uni, 0, -0.1, 0));
  upperR.add(mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 12), team, 0, -0.04, 0));
  upperR.rotation.set(0.9, 0, 0.2);
  const foreR = mesh(capsule(0.052, 0.2), uni, 0.13, -0.15, -0.16); foreR.rotation.set(1.6, 0.4, 0); arms.add(foreR);
  arms.add(mesh(new RoundedBoxGeometry(0.08, 0.09, 0.1, 2, 0.03), glove, 0.1, -0.12, -0.27));
  const upperL = new THREE.Group(); upperL.position.set(-0.22, 0, 0); arms.add(upperL);
  upperL.add(mesh(capsule(0.06, 0.2), uni, 0, -0.1, 0));
  upperL.add(mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 12), team, 0, -0.04, 0));
  upperL.rotation.set(1.1, 0, -0.35);
  const foreL = mesh(capsule(0.052, 0.24), uni, -0.06, -0.12, -0.36); foreL.rotation.set(1.45, -0.6, 0); arms.add(foreL);
  arms.add(mesh(new RoundedBoxGeometry(0.08, 0.08, 0.1, 2, 0.03), glove, 0.06, -0.08, -0.5));
  const gunSlot = new THREE.Group(); gunSlot.name = 'gunSlot'; gunSlot.position.set(0.1, -0.08, -0.26); arms.add(gunSlot);
  for (const pv of [hips, torso, head, arms, gunSlot, ...legs.flatMap(l => [l.leg, l.knee])]) pv.userData.pivot = true;
  const atlas = soldierAtlas(teamHex);
  for (const pv of [hips, torso, head, arms, ...legs.flatMap(l => [l.leg, l.knee])]) mergeAtlas(pv, atlas, uni);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// Handschuh/Ärmel-Materialien für die Ego-Arme
export function armMaterials(teamHex) {
  const camo = paintedMaps('camo', teamHex === 0x3b8cff ? '#4b5a4a' : '#6b5d45');
  const sleeve = new THREE.MeshStandardMaterial({ map: camo.map, normalMap: camo.normalMap, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.8 });
  const team = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.5, emissive: teamHex, emissiveIntensity: 0.25 });
  return { sleeve, glove, team, capsule };
}
