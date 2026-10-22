// Partikel, Leuchtspuren, Einschläge, Explosionen, Rauch
import * as THREE from 'three';
import { softTexture } from './textures.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.tracers = [];
    this.decals = [];
    this.smokes = [];
    this.lights = [];
    const soft = softTexture();
    this.pool = [];
    for (let i = 0; i < 420; i++) {
      const m = new THREE.SpriteMaterial({ map: soft, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.pool.push(s);
    }
    this.poolIdx = 0;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    this.decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    const dc = document.createElement('canvas'); dc.width = dc.height = 32;
    const g = dc.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(10,10,10,1)'); grd.addColorStop(0.45, 'rgba(25,25,25,.9)'); grd.addColorStop(1, 'rgba(40,40,40,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    this.decalMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    // Lichtblitze
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 12, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ l, t: 0, max: 0 });
    }
    this.nadeMeshes = new Map();
    this.nadeGeo = new THREE.SphereGeometry(0.07, 10, 8);
    this.nadeMats = {
      frag: new THREE.MeshStandardMaterial({ color: 0x3d4a2f, roughness: 0.7 }),
      semtex: new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.6, emissive: 0xff2200, emissiveIntensity: 0.5 }),
      flash: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.5 }),
      smoke: new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.6 }),
    };
  }

  sprite() {
    const s = this.pool[this.poolIdx];
    this.poolIdx = (this.poolIdx + 1) % this.pool.length;
    const old = this.particles.indexOf(s.userData.p);
    if (old >= 0) this.particles.splice(old, 1);
    return s;
  }

  particle(pos, vel, { color = 0xffffff, size = 0.2, grow = 0, life = 0.5, gravity = 0, opacity = 1, additive = false, drag = 0 }) {
    const s = this.sprite();
    s.position.copy(pos);
    s.material.color.set(color);
    s.material.opacity = opacity;
    s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.rotation = Math.random() * 6.28;
    s.scale.set(size, size, size);
    s.visible = true;
    const p = { s, vel: vel.clone(), life, max: life, size, grow, gravity, opacity, drag };
    s.userData.p = p;
    this.particles.push(p);
    return p;
  }

  flashLight(pos, intensity = 30, dur = 0.06, color = 0xffb060, dist = 12) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.copy(pos); L.l.color.set(color); L.l.distance = dist;
    L.t = dur; L.max = dur; L.peak = intensity;
    L.l.visible = true;
    L.l.intensity = intensity;
  }

  tracer(from, to) {
    const d = new THREE.Vector3().subVectors(to, from);
    const len = d.length();
    if (len < 2) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    const segLen = Math.min(len * 0.6, 7);
    m.scale.set(0.018, 0.018, segLen);
    m.lookAt(d);
    m.position.copy(from).addScaledVector(d.normalize(), segLen / 2 + 1.0);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    this.scene.add(m);
    this.tracers.push({ m, life: 0.07, dir: d.clone(), speed: len / 0.07 * 0.8, travelled: 0, len, segLen });
  }

  impact(pos, normal, surface) {
    const n = new THREE.Vector3(normal.x, normal.y, normal.z);
    const sparks = surface === 'metal' ? 6 : 2;
    for (let i = 0; i < sparks; i++) {
      const v = n.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      this.particle(pos, v, { color: 0xffc860, size: 0.05, life: 0.18, gravity: 12, additive: true });
    }
    const dust = surface === 'metal' ? 0x888888 : surface === 'wood' ? 0x8a6a48 : 0xb0a898;
    for (let i = 0; i < 3; i++) {
      const v = n.clone().multiplyScalar(0.6 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6));
      this.particle(pos.clone().addScaledVector(n, 0.05), v, { color: dust, size: 0.12, grow: 0.9, life: 0.7, opacity: 0.55, drag: 2 });
    }
    // Einschussloch
    const d = new THREE.Mesh(this.decalGeo, this.decalMat);
    d.position.copy(pos).addScaledVector(n, 0.012);
    d.lookAt(d.position.clone().add(n));
    d.rotation.z = Math.random() * 6;
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > 120) { const o = this.decals.shift(); this.scene.remove(o); }
  }

  blood(pos) {
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
      this.particle(pos, v, { color: 0x8a0f0f, size: 0.1, grow: 0.4, life: 0.4, gravity: 8, opacity: 0.85 });
    }
  }

  explosion(pos, kind) {
    const p = new THREE.Vector3(pos.x, pos.y, pos.z);
    if (kind === 'flash') {
      this.flashLight(p, 160, 0.25, 0xffffff, 30);
      for (let i = 0; i < 12; i++) this.particle(p, new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), { color: 0xffffff, size: 0.1, life: 0.3, gravity: 8, additive: true });
      this.particle(p, new THREE.Vector3(), { color: 0xffffff, size: 1.5, grow: 8, life: 0.18, additive: true });
      return;
    }
    if (kind === 'smoke') return;
    const big = kind === 'bomb' ? 3 : 1;
    this.flashLight(p, 120 * big, 0.3, 0xff9a40, 22 * big);
    this.particle(p, new THREE.Vector3(), { color: 0xffd080, size: 1.2 * big, grow: 9 * big, life: 0.22, additive: true });
    for (let i = 0; i < 16 * big; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5)).normalize().multiplyScalar((3 + Math.random() * 7) * Math.sqrt(big));
      this.particle(p, v, { color: [0xff7a1a, 0xffb347, 0xff5020][i % 3], size: 0.6 * big, grow: 2, life: 0.35 + Math.random() * 0.2, additive: true, drag: 3 });
    }
    for (let i = 0; i < 14 * big; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5 + 0.5, (Math.random() - 0.5) * 3).multiplyScalar(Math.sqrt(big));
      this.particle(p.clone().add(new THREE.Vector3(0, 0.3, 0)), v, { color: [0x3a3632, 0x55504a, 0x2a2826][i % 3], size: 1.0 * big, grow: 2.2, life: 1.6 + Math.random(), opacity: 0.7, drag: 1.5 });
    }
    for (let i = 0; i < 18; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * 8, (Math.random() - 0.5) * 14);
      this.particle(p, v, { color: 0xffe0a0, size: 0.05, life: 0.5, gravity: 14, additive: true });
    }
  }

  smoke(pos, r, dur) {
    const parts = [];
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r * 0.8;
      const target = new THREE.Vector3(pos.x + Math.cos(a) * rr, pos.y + 0.6 + Math.random() * r * 0.75, pos.z + Math.sin(a) * rr);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: [0xc8c8c4, 0xb4b6b2, 0xd6d4ce][i % 3], transparent: true, opacity: 0, depthWrite: false }));
      s.position.set(pos.x, pos.y + 0.3, pos.z);
      s.scale.setScalar(0.5);
      this.scene.add(s);
      parts.push({ s, target, size: r * (0.8 + Math.random() * 0.7), rot: (Math.random() - 0.5) * 0.3 });
    }
    this.smokes.push({ parts, t: 0, dur, r });
  }

  grenades(list, dt) {
    const seen = new Set();
    for (const [id, kind, x, y, z] of list) {
      seen.add(id);
      let m = this.nadeMeshes.get(id);
      if (!m) {
        m = new THREE.Mesh(this.nadeGeo, this.nadeMats[kind] || this.nadeMats.frag);
        m.castShadow = true;
        m.position.set(x, y, z);
        this.scene.add(m);
        this.nadeMeshes.set(id, m);
      }
      m.userData.target = new THREE.Vector3(x, y, z);
    }
    for (const [id, m] of this.nadeMeshes) {
      if (!seen.has(id)) { this.scene.remove(m); this.nadeMeshes.delete(id); continue; }
      m.position.lerp(m.userData.target, Math.min(1, dt * 20));
      m.rotation.x += dt * 8;
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; this.particles.splice(i, 1); continue; }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      const sz = p.size * (1 + p.grow * (1 - k));
      p.s.scale.set(sz, sz, sz);
      p.s.material.opacity = p.opacity * Math.min(1, k * 2);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.m.position.addScaledVector(t.dir, t.speed * dt);
      t.m.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      if (t.life <= 0) { this.scene.remove(t.m); t.m.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (const L of this.lights) {
      if (L.t > 0) {
        L.t -= dt;
        L.l.intensity = Math.max(0, L.peak * (L.t / L.max));
        if (L.t <= 0) L.l.visible = false;
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.t += dt;
      const fadeIn = Math.min(1, sm.t / 1.5), fadeOut = Math.min(1, (sm.dur - sm.t) / 2.5);
      for (const p of sm.parts) {
        p.s.position.lerp(p.target, Math.min(1, dt * 1.6));
        const sz = p.size * (0.4 + 0.6 * fadeIn) * (1 + sm.t * 0.02);
        p.s.scale.set(sz, sz, sz);
        p.s.material.opacity = 0.92 * Math.max(0, Math.min(fadeIn, fadeOut));
        p.s.material.rotation += p.rot * dt;
      }
      if (sm.t >= sm.dur) { for (const p of sm.parts) { this.scene.remove(p.s); p.s.material.dispose(); } this.smokes.splice(i, 1); }
    }
  }

  clear() {
    for (const p of this.particles) p.s.visible = false;
    this.particles = [];
    for (const d of this.decals) this.scene.remove(d);
    this.decals = [];
    for (const sm of this.smokes) for (const p of sm.parts) this.scene.remove(p.s);
    this.smokes = [];
    for (const m of this.nadeMeshes.values()) this.scene.remove(m);
    this.nadeMeshes.clear();
  }
}
