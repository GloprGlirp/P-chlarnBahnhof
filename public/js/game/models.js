// Waffen- und Soldatenmodelle aus einfachen Formen
import * as THREE from 'three';
import { WEAPONS } from '/shared/weapons.js';

const matCache = {};
function mat(color, rough = 0.6, metal = 0.3, emissive = 0) {
  const k = `${color}_${rough}_${metal}_${emissive}`;
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive ? color : 0, emissiveIntensity: emissive });
  return matCache[k];
}
const boxG = new THREE.BoxGeometry(1, 1, 1);
const cylG = new THREE.CylinderGeometry(1, 1, 1, 12);
cylG.rotateX(Math.PI / 2);

function B(parent, m, w, h, d, x, y, z) {
  const o = new THREE.Mesh(boxG, m);
  o.scale.set(w, h, d); o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function C(parent, m, r, len, x, y, z) {
  const o = new THREE.Mesh(cylG, m);
  o.scale.set(r, r, len); o.position.set(x, y, z);
  parent.add(o);
  return o;
}

// Waffe zeigt entlang -Z, Ursprung am Griff
export function buildGun(weaponId, attachments = []) {
  const W = WEAPONS[weaponId] || WEAPONS.kr7;
  const md = W.model;
  const g = new THREE.Group();
  const body = mat(md.color, 0.55, 0.35);
  const acc = mat(md.accent, 0.5, 0.45);
  const dark = mat(0x161616, 0.6, 0.4);
  const has = a => attachments.includes(a);
  const L = md.len;
  let barrelLen = md.barrel + (has('longbarrel') ? 0.1 : 0) - (has('shortbarrel') ? Math.min(0.07, md.barrel * 0.6) : 0);
  const kind = md.kind;
  const pistol = kind === 'pistol' || kind === 'revolver';
  let sightY = 0.075, frontZ;

  if (pistol) {
    B(g, body, 0.035, 0.05, L, 0, 0.055, -L / 2 + 0.04);
    B(g, acc, 0.03, 0.1, 0.045, 0, -0.01, 0.02).rotation.x = 0.2;
    if (kind === 'revolver') { C(g, body, 0.022, 0.05, 0, 0.045, -0.03); C(g, dark, 0.009, L, 0, 0.065, -L / 2); }
    if (md.mag === 'long') B(g, dark, 0.026, 0.09, 0.035, 0, -0.08, 0.02);
    frontZ = -L + 0.04;
    sightY = 0.088;
    B(g, dark, 0.006, 0.012, 0.006, 0, 0.086, frontZ + 0.01);
    B(g, dark, 0.02, 0.012, 0.006, 0, 0.086, 0.05);
  } else {
    // Gehäuse
    B(g, body, 0.05, 0.075, L * 0.5, 0, 0.04, -L * 0.18);
    B(g, acc, 0.046, 0.05, L * 0.32, 0, 0.035, -L * 0.55);       // Handschutz
    B(g, dark, 0.04, 0.012, L * 0.62, 0, 0.083, -L * 0.3);        // Schiene
    // Griff
    B(g, acc, 0.032, 0.09, 0.04, 0, -0.03, 0.02).rotation.x = 0.28;
    // Magazin
    const magLen = has('extmag') ? 1.5 : 1;
    let mag;
    if (md.mag === 'curved') { mag = B(g, dark, 0.03, 0.12 * magLen, 0.05, 0, -0.06 - 0.03 * magLen, -L * 0.2); mag.rotation.x = -0.25; }
    else if (md.mag === 'drum') { mag = C(g, dark, 0.06, 0.05, 0, -0.05, -L * 0.22); mag.rotation.y = Math.PI / 2; }
    else if (md.mag === 'tube') mag = C(g, dark, 0.016, L * 0.45, 0, 0.0, -L * 0.6);
    else mag = B(g, dark, 0.03, 0.09 * magLen, 0.045, 0, -0.04 - 0.02 * magLen, -L * 0.2);
    if (has('fastmag') && md.mag !== 'drum' && md.mag !== 'tube') B(g, dark, 0.03, 0.09, 0.045, 0.034, -0.06, -L * 0.2);
    g.userData.mag = mag;
    // Schaft
    if (kind !== 'smg' || has('heavystock') || has('lightstock')) {
      if (has('lightstock')) { B(g, dark, 0.012, 0.012, 0.2, 0, 0.05, 0.15); B(g, dark, 0.012, 0.012, 0.2, 0, -0.01, 0.15); B(g, dark, 0.03, 0.08, 0.02, 0, 0.02, 0.25); }
      else if (has('heavystock')) B(g, acc, 0.05, 0.1, 0.24, 0, 0.02, 0.15);
      else B(g, acc, 0.042, 0.075, 0.2, 0, 0.025, 0.14);
    } else B(g, dark, 0.02, 0.02, 0.1, 0, 0.04, 0.08);
    // Lauf
    frontZ = -L * 0.72;
    C(g, dark, kind === 'shotgun' ? 0.018 : 0.012, barrelLen, 0, 0.045, frontZ - barrelLen / 2);
    frontZ -= barrelLen;
    if (kind === 'sniper') { B(g, dark, 0.004, 0.06, 0.004, 0.035, 0.0, -L * 0.45); }
    if (kind === 'lmg') { B(g, dark, 0.006, 0.08, 0.006, 0.02, -0.02, frontZ + 0.08).rotation.z = 0.4; B(g, dark, 0.006, 0.08, 0.006, -0.02, -0.02, frontZ + 0.08).rotation.z = -0.4; }
  }

  // Mündung
  const muzzleZ = frontZ;
  let mz = muzzleZ;
  const by = pistol ? 0.06 : 0.045;
  if (has('suppressor')) { C(g, dark, pistol ? 0.016 : 0.02, 0.16, 0, by, mz - 0.08); mz -= 0.16; }
  else if (has('compensator')) { B(g, dark, 0.03, 0.03, 0.05, 0, by, mz - 0.025); mz -= 0.05; }
  else if (has('flashhider')) { C(g, mat(0x2a2a2a, 0.5, 0.5), 0.016, 0.06, 0, by, mz - 0.03); mz -= 0.06; }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, by, mz - 0.01);
  g.add(muzzle);

  // Unterlauf
  if (!pistol) {
    if (has('vgrip')) B(g, dark, 0.025, 0.08, 0.025, 0, -0.03, -L * 0.52);
    if (has('agrip')) { const a = B(g, dark, 0.026, 0.05, 0.07, 0, -0.012, -L * 0.52); a.rotation.x = -0.5; }
  }
  if (has('laser')) {
    B(g, dark, 0.02, 0.02, 0.06, pistol ? 0 : 0.03, pistol ? 0.02 : 0.03, pistol ? -0.08 : -L * 0.5);
    B(g, mat(0xff2020, 0.3, 0, 2), 0.008, 0.008, 0.004, pistol ? 0 : 0.03, pistol ? 0.02 : 0.03, pistol ? -0.112 : -L * 0.5 - 0.032);
  }

  // Visier
  const optic = W.fixedOptic || (attachments.find(a => ['reddot', 'holo', 'acog'].includes(a))) || 'iron';
  const railY = pistol ? 0.08 : 0.089;
  let sightZ = -0.05;
  if (optic === 'reddot') {
    B(g, dark, 0.035, 0.012, 0.06, 0, railY + 0.006, -0.05);
    const frame = new THREE.Group(); frame.position.set(0, railY + 0.034, -0.06); g.add(frame);
    B(frame, dark, 0.006, 0.04, 0.03, 0.019, 0, 0); B(frame, dark, 0.006, 0.04, 0.03, -0.019, 0, 0); B(frame, dark, 0.044, 0.006, 0.03, 0, 0.02, 0);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.032), new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.12, depthWrite: false }));
    frame.add(glass);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    dot.position.z = -0.001; frame.add(dot);
    sightY = railY + 0.034; sightZ = -0.06;
  } else if (optic === 'holo') {
    B(g, dark, 0.04, 0.014, 0.08, 0, railY + 0.007, -0.05);
    const frame = new THREE.Group(); frame.position.set(0, railY + 0.036, -0.07); g.add(frame);
    B(frame, dark, 0.006, 0.042, 0.06, 0.024, 0, 0); B(frame, dark, 0.006, 0.042, 0.06, -0.024, 0, 0); B(frame, dark, 0.054, 0.007, 0.06, 0, 0.022, 0);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.034), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.12, depthWrite: false }));
    frame.add(glass);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.0062, 0.0072, 24), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    ring.position.z = -0.001; frame.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0011, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    dot.position.z = -0.001; frame.add(dot);
    sightY = railY + 0.036; sightZ = -0.07;
  } else if (optic === 'acog' || optic === 'scope') {
    const len = optic === 'scope' ? 0.3 : 0.15, r = optic === 'scope' ? 0.024 : 0.021;
    const sy = railY + (optic === 'scope' ? 0.04 : 0.035);
    C(g, dark, r, len, 0, sy, -0.06);
    C(g, dark, r * 1.25, 0.04, 0, sy, -0.06 - len / 2);
    C(g, dark, r * 1.15, 0.035, 0, sy, -0.06 + len / 2);
    B(g, dark, 0.02, sy - railY, 0.02, 0, railY + (sy - railY) / 2, -0.06 + len * 0.25);
    B(g, dark, 0.02, sy - railY, 0.02, 0, railY + (sy - railY) / 2, -0.06 - len * 0.25);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 16), new THREE.MeshBasicMaterial({ color: 0x223344 }));
    lens.position.set(0, sy, -0.06 + len / 2 + 0.019); g.add(lens);
    if (optic === 'acog') {
      const chev = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 3), new THREE.MeshBasicMaterial({ color: 0xff4020 }));
      chev.position.set(0, sy, -0.06 - len / 2 - 0.021); chev.rotation.z = Math.PI / 2; g.add(chev);
    }
    sightY = sy; sightZ = -0.06 + len / 2;
  } else if (!pistol) {
    // Kimme und Korn
    B(g, dark, 0.03, 0.02, 0.012, 0, railY + 0.01, 0.02);
    B(g, dark, 0.004, 0.024, 0.006, 0, railY + 0.012, -L * 0.62);
    sightY = railY + 0.022; sightZ = 0.02;
  }

  g.userData.muzzle = muzzle;
  g.userData.sightY = sightY;
  g.userData.sightZ = sightZ;
  g.userData.optic = optic;
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// ---------------------------------------------------------------- Soldat
const skinM = mat(0xd6a982, 0.8, 0);
export function buildSoldier(teamHex) {
  const g = new THREE.Group();
  const uni = mat(new THREE.Color(teamHex).multiplyScalar(0.55).getHex(), 0.85, 0.05);
  const vest = mat(0x3a3f2e, 0.85, 0.05);
  const trim = mat(teamHex, 0.6, 0.1, 0.35);
  const boot = mat(0x1d1a16, 0.8, 0.1);
  const helm = mat(0x3d4532, 0.6, 0.15);

  const hips = new THREE.Group(); hips.position.y = 0.9; g.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.11 * s, 0, 0); hips.add(leg);
    B(leg, uni, 0.16, 0.46, 0.17, 0, -0.23, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.46, 0); leg.add(knee);
    B(knee, uni, 0.15, 0.4, 0.16, 0, -0.2, 0);
    B(knee, boot, 0.16, 0.1, 0.24, 0, -0.39, -0.03);
    legs.push({ leg, knee });
  }
  const torso = new THREE.Group(); torso.position.y = 0; hips.add(torso);
  B(torso, uni, 0.42, 0.56, 0.24, 0, 0.3, 0);
  B(torso, vest, 0.46, 0.4, 0.3, 0, 0.32, 0);
  B(torso, trim, 0.47, 0.06, 0.31, 0, 0.5, 0);
  const head = new THREE.Group(); head.position.y = 0.62; torso.add(head);
  B(head, skinM, 0.2, 0.22, 0.21, 0, 0.11, 0);
  B(head, helm, 0.25, 0.12, 0.26, 0, 0.24, 0.0);
  B(head, mat(0x111111, 0.3, 0.2), 0.18, 0.05, 0.02, 0, 0.13, -0.106);
  // Arme + Waffe (drehen mit Blickneigung)
  const arms = new THREE.Group(); arms.position.set(0, 0.5, 0); torso.add(arms);
  const armR = B(arms, uni, 0.12, 0.12, 0.42, 0.2, -0.05, -0.16); armR.rotation.y = 0.15;
  const armL = B(arms, uni, 0.12, 0.12, 0.46, -0.12, -0.07, -0.26); armL.rotation.y = -0.45;
  B(arms, mat(0x2a2a22, 0.8, 0), 0.1, 0.1, 0.1, 0.08, -0.08, -0.36);
  const gunSlot = new THREE.Group(); gunSlot.position.set(0.1, -0.06, -0.24); arms.add(gunSlot);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  g.userData = { hips, legs, torso, head, arms, gunSlot };
  return g;
}
