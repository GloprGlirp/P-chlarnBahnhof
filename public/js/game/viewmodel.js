// Erste-Person-Waffe mit Animationen (Zielen, Sprint, Rückstoß, Nachladen, Wechsel, Messer, Wurf)
import * as THREE from 'three';
import { buildGun } from './models.js';

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,200,90,.9)'); grd.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, r = i % 2 ? 26 : 64;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}

const lerp = (a, b, t) => a + (b - a) * t;

export class ViewModel {
  constructor(teamHex) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.01, 20);
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a3a30, 1.25));
    const d = new THREE.DirectionalLight(0xfff2dd, 1.25);
    d.position.set(-1, 2, 1);
    this.scene.add(d);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.teamHex = teamHex;
    this.guns = {};
    this.current = null;
    this.flashMat = new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(this.flashMat);
    this.flash.visible = false;
    this.flashT = 0;
    // Messer
    this.knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.2), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.25 }));
    blade.position.z = -0.12;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 0.1), new THREE.MeshStandardMaterial({ color: 0x1b1b1b }));
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.09), new THREE.MeshStandardMaterial({ color: 0x2a2a22, roughness: 0.9 }));
    glove.position.z = 0.02;
    this.knife.add(blade, handle, glove);
    this.knife.visible = false;
    this.scene.add(this.knife);
    // Granatenhand
    this.nadeHand = new THREE.Group();
    const nade = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3d4a2f, roughness: 0.7 }));
    const glove2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.09), new THREE.MeshStandardMaterial({ color: 0x2a2a22, roughness: 0.9 }));
    glove2.position.set(0, -0.03, 0.03);
    this.nadeHand.add(nade, glove2);
    this.nadeHand.visible = false;
    this.scene.add(this.nadeHand);

    this.st = { kickZ: 0, kickR: 0, kickY: 0, kickV: 0, swayX: 0, swayY: 0, bob: 0, sprint: 0, land: 0 };
  }

  setLoadout(cls) {
    for (const g of Object.values(this.guns)) this.root.remove(g);
    this.guns = {};
    for (const slot of ['primary', 'secondary']) {
      const w = cls[slot];
      const g = buildGun(w.id, w.att);
      this.addArms(g, slot === 'secondary');
      g.visible = false;
      this.root.add(g);
      this.guns[slot] = g;
    }
    this.current = null;
  }

  addArms(g, pistol) {
    const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.teamHex).multiplyScalar(0.35).lerp(new THREE.Color(0x3a3f2e), 0.7), roughness: 0.95 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x24241e, roughness: 0.9 });
    // rechte Hand am Griff, Unterarm nach hinten-unten
    const rh = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.085), glove);
    rh.position.set(0.005, -0.035, 0.03);
    const ra = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.32), sleeve);
    ra.position.set(0.05, -0.12, 0.19); ra.rotation.set(0.55, -0.25, 0);
    g.add(rh, ra);
    // linke Hand am Handschutz
    const lz = pistol ? 0.02 : -0.27;
    const lh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.1), glove);
    lh.position.set(pistol ? -0.025 : -0.006, pistol ? -0.05 : 0.0, lz);
    const la = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.36), sleeve);
    la.position.set(pistol ? -0.07 : -0.07, pistol ? -0.13 : -0.09, lz + 0.17); la.rotation.set(0.55, 0.42, 0);
    g.add(lh, la);
  }

  show(slot) {
    for (const [s, g] of Object.entries(this.guns)) g.visible = s === slot;
    this.current = this.guns[slot];
    if (this.flash.parent) this.flash.parent.remove(this.flash);
    if (this.current) this.current.userData.muzzle.add(this.flash);
  }

  muzzleFlash(stats) {
    if (stats.noFlash) return;
    this.flashT = 0.05;
    const s = stats.suppressed ? 0.06 : (stats.cls === 'shotgun' || stats.cls === 'sniper' ? 0.22 : 0.15);
    this.flash.scale.set(s, s, s);
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.visible = true;
  }

  kick(stats) {
    const k = stats.cls === 'sniper' || stats.cls === 'shotgun' ? 2.2 : stats.cls === 'pistol' ? 1.3 : 1;
    this.st.kickZ += 0.035 * k;
    this.st.kickR += 0.05 * k + stats.recoilV * 0.02;
    this.st.kickY += (Math.random() - 0.5) * 0.02 * k;
  }

  // a: Animationsparameter vom Spiel
  update(dt, a) {
    const st = this.st;
    const g = this.current;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    // Federn zurück
    const ret = Math.min(1, dt * 14);
    st.kickZ -= st.kickZ * ret; st.kickR -= st.kickR * Math.min(1, dt * 11); st.kickY -= st.kickY * ret;
    st.sprint = lerp(st.sprint, a.sprint ? (a.tac ? 1.4 : 1) : 0, Math.min(1, dt * 9));
    st.swayX = lerp(st.swayX, Math.max(-0.05, Math.min(0.05, -a.mouseDx * 0.0007)), Math.min(1, dt * 10));
    st.swayY = lerp(st.swayY, Math.max(-0.05, Math.min(0.05, a.mouseDy * 0.0007)), Math.min(1, dt * 10));
    st.bob += dt * a.speed * (a.sprint ? 1.25 : 1.6);
    st.land = lerp(st.land, 0, Math.min(1, dt * 7));
    if (a.landed) st.land = Math.min(0.08, a.landed * 0.006);

    this.knife.visible = a.melee > 0;
    this.nadeHand.visible = a.throwing > 0;
    if (!g) return;
    g.visible = !a.hidden && a.melee <= 0;

    const ads = a.ads;
    const sy = g.userData.sightY, sz = g.userData.sightZ;
    const pistol = a.pistol;
    const hip = new THREE.Vector3(pistol ? 0.12 : 0.13, pistol ? -0.14 : -0.15, pistol ? -0.36 : -0.37);
    const aim = new THREE.Vector3(0, -sy, -(g.userData.optic === 'iron' ? (pistol ? 0.36 : 0.34) : 0.33) - sz);
    const p = hip.clone().lerp(aim, ads);
    const amp = (1 - ads * 0.85) * Math.min(1, a.speed / 5);
    const bx = Math.sin(st.bob) * 0.012 * amp, by = -Math.abs(Math.cos(st.bob)) * 0.014 * amp;
    p.x += bx + st.swayX * (1 - ads * 0.7);
    p.y += by + st.swayY * (1 - ads * 0.7) - st.land;
    p.z += st.kickZ * (1 - ads * 0.4);
    // Sprint-Haltung
    const sp = st.sprint * (1 - ads);
    p.x += sp * (pistol ? 0.0 : -0.04); p.y += sp * -0.05; p.z += sp * 0.03;
    // Nachladen
    let rx = st.kickR * (1 - ads * 0.5), ry = st.kickY + sp * (pistol ? 0.2 : 0.75), rz = sp * (pistol ? 0.1 : 0.35) + st.swayX * 2;
    rx += sp * (pistol ? -0.5 : -0.25) + Math.sin(st.bob * 2) * 0.02 * st.sprint;
    if (a.reload > 0) {
      const r = a.reload;
      const dip = Math.sin(Math.min(1, r) * Math.PI);
      p.y -= dip * 0.07; p.z += dip * 0.03;
      rz += dip * 0.6; rx += dip * 0.25;
      const mag = g.userData.mag;
      if (mag) {
        if (!mag.userData.base) mag.userData.base = mag.position.clone();
        const out = r > 0.25 && r < 0.7 ? Math.min(1, (r - 0.25) / 0.12) * (r < 0.58 ? 1 : 1 - (r - 0.58) / 0.12) : 0;
        mag.position.copy(mag.userData.base); mag.position.y -= out * 0.2;
        mag.visible = !(r > 0.37 && r < 0.5);
      }
    } else if (g.userData.mag && g.userData.mag.userData.base) { g.userData.mag.position.copy(g.userData.mag.userData.base); g.userData.mag.visible = true; }
    // Waffenwechsel / Wurf / Messer
    const low = Math.max(a.swap, a.throwing > 0 ? Math.sin(Math.min(1, a.throwing) * Math.PI) * 0.8 : 0);
    p.y -= low * 0.3; rx -= low * 0.6;
    g.position.copy(p);
    g.rotation.set(rx, ry, rz);

    if (a.melee > 0) {
      const m = a.melee; // 1 -> 0
      const k = 1 - m;
      this.knife.position.set(0.25 - k * 0.4, -0.12 + Math.sin(k * Math.PI) * 0.06, -0.32);
      this.knife.rotation.set(0.1, 0.9 - k * 1.6, -0.6 + k * 0.3);
    }
    if (a.throwing > 0) {
      const k = 1 - a.throwing;
      this.nadeHand.position.set(-0.12 + k * 0.05, -0.1 + Math.sin(k * Math.PI) * 0.15, -0.3 - k * 0.15);
      this.nadeHand.visible = k < 0.7;
    }
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
}
