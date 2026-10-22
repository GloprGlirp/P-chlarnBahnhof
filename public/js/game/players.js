// Andere Spieler: Interpolation, Modelle, Animation, Schritte
import * as THREE from 'three';
import { buildSoldier, buildGun } from './models.js';
import { textSprite } from './textures.js';
import { TEAMS, PLAYER } from '/shared/constants.js';
import { audio } from './audio.js';

const H = [PLAYER.standHeight, PLAYER.crouchHeight, PLAYER.slideHeight];

export class RemotePlayer {
  constructor(scene, info, myTeam) {
    this.scene = scene;
    this.id = info.id;
    this.info = info;
    this.team = info.team;
    this.model = buildSoldier(TEAMS[info.team].hex);
    this.model.visible = false;
    scene.add(this.model);
    this.guns = {};
    this.gunKey = '';
    this.buf = [];
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.stance = 0; this.flags = 0; this.slot = 0;
    this.alive = false;
    this.deadT = 0;
    this.walk = 0;
    this.stepAcc = 0;
    this.speed = 0;
    this.vy = 0;
    this.crouchK = 0;
    this.slideK = 0;
    this.tag = null;
    this.setInfo(info, myTeam);
  }

  setInfo(info, myTeam) {
    this.info = info;
    if (info.team !== this.team) {
      this.team = info.team;
      this.scene.remove(this.model);
      this.model = buildSoldier(TEAMS[info.team].hex);
      this.scene.add(this.model);
      this.gunKey = '';
    }
    const key = `${info.pw}|${(info.pa || []).join(',')}|${info.sw}`;
    if (key !== this.gunKey) {
      this.gunKey = key;
      const slot = this.model.userData.gunSlot;
      slot.clear();
      this.guns = { 0: buildGun(info.pw, info.pa || []), 1: buildGun(info.sw, []) };
      for (const g of Object.values(this.guns)) { g.scale.setScalar(1.15); slot.add(g); }
    }
    const friendly = info.team === myTeam;
    if (this.tag) { this.model.remove(this.tag); this.tag = null; }
    if (friendly) {
      this.tag = textSprite(info.name.replace('[BOT] ', ''), '#9cc6ff');
      this.tag.position.y = 2.15;
      this.model.add(this.tag);
    }
    this.friendly = friendly;
  }

  push(ts, s) {
    this.buf.push({ ts, x: s[1], y: s[2], z: s[3], yaw: s[4], pitch: s[5], stance: s[6], flags: s[7], w: s[8] });
    if (this.buf.length > 40) this.buf.shift();
  }

  // Zustand zur Renderzeit interpolieren
  sample(rt) {
    const b = this.buf;
    if (!b.length) return null;
    if (rt <= b[0].ts) return b[0];
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].ts <= rt) {
        const a = b[i], c = b[i + 1];
        if (!c) return a;
        const k = (rt - a.ts) / Math.max(1, c.ts - a.ts);
        // Teleport (Respawn) nicht interpolieren
        if (Math.abs(c.x - a.x) + Math.abs(c.z - a.z) > 6) return k < 0.5 ? a : c;
        let dy = c.yaw - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        return {
          x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k,
          yaw: a.yaw + dy * k, pitch: a.pitch + (c.pitch - a.pitch) * k,
          stance: k < 0.5 ? a.stance : c.stance, flags: k < 0.5 ? a.flags : c.flags, w: c.w,
        };
      }
    }
    return b[b.length - 1];
  }

  update(dt, rt, t) {
    const s = this.sample(rt);
    if (!s) return;
    const alive = !!(s.flags & 1);
    this.prevPos.copy(this.pos);
    this.pos.set(s.x, s.y, s.z);
    const moved = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
    const sp = dt > 0 ? Math.min(14, moved / dt) : 0;
    if (moved < 4) this.speed += (sp - this.speed) * Math.min(1, dt * 10);
    this.vy = dt > 0 ? (this.pos.y - this.prevPos.y) / dt : 0;
    this.yaw = s.yaw; this.pitch = s.pitch; this.stance = s.stance; this.flags = s.flags; this.slot = s.w;

    if (alive && !this.alive) { this.deadT = 0; this.model.rotation.set(0, 0, 0); }
    if (!alive && this.alive) this.deadT = 0.0001;
    this.alive = alive;
    const m = this.model;
    const u = m.userData;
    m.position.copy(this.pos);
    if (!alive) {
      if (this.deadT <= 0) { m.visible = false; return; }
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.45);
      m.rotation.x = -k * k * Math.PI / 2;
      m.position.y = this.pos.y + Math.sin(k * Math.PI) * 0.15;
      m.visible = this.deadT < 4.5;
      if (this.tag) this.tag.visible = false;
      return;
    }
    m.visible = true;
    if (this.tag) this.tag.visible = true;
    m.rotation.set(0, this.yaw, 0);
    // Haltung
    this.crouchK += ((this.stance === 1 ? 1 : 0) - this.crouchK) * Math.min(1, dt * 12);
    this.slideK += ((this.stance === 2 ? 1 : 0) - this.slideK) * Math.min(1, dt * 14);
    const ck = this.crouchK, sk = this.slideK;
    u.hips.position.y = 0.9 - ck * 0.38 - sk * 0.48;
    u.torso.rotation.x = sk * -0.65 + ck * 0.15;
    // Laufen
    const moving = this.speed > 0.4;
    this.walk += dt * this.speed * (ck > 0.5 ? 2.4 : 1.9);
    const amp = moving ? Math.min(0.9, this.speed * 0.13) : 0;
    const sw = Math.sin(this.walk) * amp;
    u.legs[0].leg.rotation.x = sw - ck * 1.2 - sk * 1.3;
    u.legs[1].leg.rotation.x = -sw - ck * 0.9 - sk * 1.5;
    u.legs[0].knee.rotation.x = Math.max(0, -Math.sin(this.walk + 1) * amp * 1.2) + ck * 1.7 + sk * 0.3;
    u.legs[1].knee.rotation.x = Math.max(0, Math.sin(this.walk + 1) * amp * 1.2) + ck * 1.5 + sk * 0.3;
    const sprinting = !!(s.flags & 4);
    u.arms.rotation.x = sprinting ? -0.6 : this.pitch + (sk * 0.5);
    u.arms.rotation.y = sprinting ? 0.5 : 0;
    u.head.rotation.x = this.pitch * 0.6;
    for (const [k, g] of Object.entries(this.guns)) g.visible = +k === this.slot;

    // Schritte hörbar (wenn nicht "Lautlos" und am Boden)
    if (moving && Math.abs(this.vy) < 1.5 && !(s.flags & 8) && sk < 0.5) {
      this.stepAcc += moved;
      const stepLen = sprinting ? 2.3 : ck > 0.5 ? 1.6 : 1.9;
      if (this.stepAcc > stepLen) {
        this.stepAcc = 0;
        const loud = this.friendly ? 0.35 : (ck > 0.5 ? 0.45 : sprinting ? 1.25 : 0.9);
        audio.footstep({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, loud);
      }
    }
    void t;
  }

  muzzleWorld(out) {
    const g = this.guns[this.slot];
    if (!g || !this.model.visible) return out.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
    g.userData.muzzle.getWorldPosition(out);
    return out;
  }

  height() { return H[this.stance] || PLAYER.standHeight; }

  dispose() { this.scene.remove(this.model); }
}
