// Spiel-Client: lokale Bewegung (Vorhersage), Waffen, Netzwerk, Rendering
import * as THREE from 'three';
import { MAPS } from '/shared/maps.js';
import { createWorld, newMoveState, stepMove, raycastWorld, rayPlayer, stanceHeight } from '/shared/physics.js';
import { PLAYER, STANCE, TEAMS, MODES, INTERP_DELAY, CLIENT_SEND_RATE } from '/shared/constants.js';
import { computeStats, EQUIPMENT } from '/shared/weapons.js';
import { buildWorld } from './world.js';
import { ViewModel } from './viewmodel.js';
import { Effects } from './effects.js';
import { RemotePlayer } from './players.js';
import { Hud, weaponLabel, esc } from './hud.js';
import { Input } from './input.js';
import { audio } from './audio.js';

const DEG = Math.PI / 180;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

function hfovToV(h, aspect) {
  // FOV-Einstellung wie bei CoD (horizontal, 4:3-Basis)
  void aspect;
  return 2 * Math.atan(Math.tan(h * DEG / 2) * 0.75) / DEG;
}

function spreadDir(d, deg) {
  if (deg <= 0) return d.clone();
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * deg * DEG;
  const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, d).normalize();
  const up2 = new THREE.Vector3().crossVectors(d, right);
  return d.clone().addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(up2, Math.sin(a) * Math.tan(r)).normalize();
}

function surfaceOf(mat) {
  if (!mat) return 'stone';
  if (mat.startsWith('container') || mat.startsWith('metal') || mat === 'roof' || mat === 'shelf') return 'metal';
  if (mat === 'crate' || mat === 'wood') return 'wood';
  return 'stone';
}

export class Game {
  constructor(app, joined) {
    this.app = app;
    this.net = app.net;
    this.settings = app.settings;
    this.myId = joined.you;
    this.roomInfo = joined.room;
    this.mode = joined.room.mode;
    this.renderer = app.renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.input = new Input(this.renderer.domElement);
    this.hudEl = document.getElementById('hud');
    this.hudEl.classList.remove('hidden');
    this.hud = new Hud(this.hudEl, this);
    this.effects = new Effects(this.scene);
    this.roster = new Map();
    this.players = new Map();
    this.modeState = null;
    this.svOff = null;
    this.rtt = 0;
    this.lastPing = 0;
    this.lastSend = 0;
    this.paused = false;
    this.running = true;
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    this.shake = 0;
    this.team = 0;

    this.me = { alive: false, hp: 100, ms: newMoveState(), yaw: 0, pitch: 0, cls: null, stats: {}, ammo: {}, slot: 'primary', lethal: 0, tactical: 0, sq: 0 };
    this.w = this.freshWeaponState();
    this.eyeH = PLAYER.standHeight - PLAYER.eyeFromTop;
    this.death = null;
    this.spectate = null;
    this.bobT = 0;
    this.breath = 0; this.breathHold = 0;
    this.crouchToggle = false;
    this.adsToggle = false;
    this.useHeld = false;
    this.landed = 0;
    this.slideRoll = 0;

    this.vm = new ViewModel(TEAMS[0].hex);
    this.loadMatch(joined.match);

    this.offNet = this.net.on(m => this.onMessage(m));
    this.input.onLockChange = (locked) => {
      if (!locked && this.running && !this.input.chatOpen && !this.ended) this.app.showPause(this);
      if (locked) this.app.hidePause();
    };
    this._esc = (e) => { if (e.code === 'Escape' && !this.input.locked && !this.paused && !this.ended && !this.input.chatOpen) this.app.showPause(this); };
    window.addEventListener('keydown', this._esc);
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
    this.applySettings();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.renderer.domElement.addEventListener('click', this._click = () => { if (!this.input.locked && !this.paused && !this.ended) this.input.lock(); });
    this.input.lock();
  }

  freshWeaponState() {
    return { adsT: 0, lastShot: 0, reloadEnd: 0, reloadDur: 0, swapEnd: 0, swapDur: 0, sprintBlock: 0, bloom: 0, recoilAcc: 0,
      semiReady: true, meleeEnd: 0, throwEnd: 0, throwKind: null, throwSent: true, reloadStage: -1, wasSprinting: false };
  }

  applySettings() {
    const s = this.settings;
    audio.setVolume(s.volume);
    this.renderer.shadowMap.enabled = !!s.shadows;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio) * s.scale);
    this.resize();
    if (this.world && this.worldShadows !== !!s.shadows) this.rebuildWorld();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.vm.resize(innerWidth / innerHeight);
  }

  // ------------------------------------------------------------------ Karte / Match
  loadMatch(match) {
    const mapChanged = match.map !== this.mapId;
    this.match = match;
    this.mode = match.mode;
    if (mapChanged) {
      this.mapId = match.map;
      this.map = MAPS[match.map];
      this.phys = createWorld(this.map);
      this.rebuildWorld();
      this.hud.buildMinimap(this.map);
    }
    this.effects.clear();
    this.phys.smokes = [];
    if (match.score) this.modeState = { ...(this.modeState || {}), sc: match.score, ph: match.phase };
  }

  rebuildWorld() {
    if (this.world) this.world.dispose();
    this.worldShadows = !!this.settings.shadows;
    this.world = buildWorld(this.scene, this.map, {
      shadows: this.worldShadows, mode: this.mode, aniso: this.renderer.capabilities.getMaxAnisotropy(),
      shadowSize: this.settings.scale < 0.8 ? 1024 : 2048,
    });
    if (!this.bombMesh) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0x3b4031, roughness: 0.7 }));
      body.position.y = 0.11;
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      led.position.set(0.1, 0.235, 0);
      g.add(body, led);
      g.userData.led = led;
      this.bombMesh = g;
    }
    this.scene.add(this.bombMesh);
    this.bombMesh.visible = false;
  }

  // ------------------------------------------------------------------ Netzwerk
  onMessage(m) {
    switch (m.t) {
      case 's': return this.onSnapshot(m);
      case 'roster': {
        this.roster = new Map(m.list.map(r => [r.id, r]));
        const mine = this.roster.get(this.myId);
        if (mine && mine.team !== this.team) { this.team = mine.team; this.vm.teamHex = TEAMS[this.team].hex; if (this.me.cls) this.vm.setLoadout(this.me.cls), this.vm.show(this.me.slot); }
        for (const [id, p] of this.players) { const r = this.roster.get(id); if (r) p.setInfo(r, this.team); }
        if (this.boardOpen) this.hud.board(true, this.roster, this.myId, this.modeState && this.modeState.sc, this.mode);
        return;
      }
      case 'spawn': return this.onSpawn(m);
      case 'correct':
        if (m.sq === this.me.sq) { this.me.ms.pos.x = m.x; this.me.ms.pos.y = m.y; this.me.ms.pos.z = m.z; this.me.ms.vel.x = this.me.ms.vel.z = 0; }
        return;
      case 'f': return this.onRemoteFire(m);
      case 'hit':
        if (m.flash) { this.hud.hitmarker('hit'); return; }
        this.hud.hitmarker(m.k ? 'kill' : m.h ? 'head' : 'hit');
        audio.hit(m.k ? 'kill' : m.h ? 'head' : 'hit');
        return;
      case 'dmg': {
        this.me.hp = m.hp;
        if (m.from) {
          const dx = m.from[0] - this.me.ms.pos.x, dz = m.from[2] - this.me.ms.pos.z;
          const fx = -Math.sin(this.me.yaw), fz = -Math.cos(this.me.yaw), rx = Math.cos(this.me.yaw), rz = -Math.sin(this.me.yaw);
          this.hud.damageDir(Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz));
        }
        audio.hurt();
        this.me.pitch += 0.012; this.shake = Math.max(this.shake, 0.25);
        return;
      }
      case 'kill': {
        this.hud.killfeed(m.k, m.v, m.w, m.h, this.roster, this.myId);
        const p = this.players.get(m.v);
        if (p && p.alive) { p.alive = false; p.deadT = 0.0001; this.effects.blood(tmpV.set(p.pos.x, p.pos.y + 1.2, p.pos.z)); }
        return;
      }
      case 'died': return this.onDied(m);
      case 'xp': this.hud.xp(m.a, m.r); return;
      case 'ev': return this.onEvent(m);
      case 'boom': {
        const pos = { x: m.x, y: m.y, z: m.z };
        this.effects.explosion(pos, m.k);
        if (m.k === 'flash') audio.pop(pos); else if (m.k !== 'smoke') audio.explosion(pos);
        else audio.pop(pos);
        const d = Math.hypot(pos.x - this.camera.position.x, pos.z - this.camera.position.z);
        if (m.k !== 'smoke' && m.k !== 'flash') this.shake = Math.max(this.shake, Math.max(0, 1.2 - d / 18) * (m.k === 'bomb' ? 2 : 1));
        return;
      }
      case 'smoke': this.effects.smoke({ x: m.x, y: m.y, z: m.z }, m.r, m.d); this.phys.smokes.push({ x: m.x, y: m.y + 1.2, z: m.z, r: m.r, end: performance.now() + m.d * 1000 }); return;
      case 'flashed': this.hud.flash(m.s); audio.ring(m.s); return;
      case 'throw': { const p = this.players.get(m.id); if (p) audio.whoosh({ x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z }); return; }
      case 'ml': { const p = this.players.get(m.id); if (p) audio.whoosh({ x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z }); return; }
      case 'ammo':
        if (this.me.ammo.primary) {
          this.me.ammo.primary.mag = m.a.primary[0]; this.me.ammo.primary.res = m.a.primary[1];
          this.me.ammo.secondary.mag = m.a.secondary[0]; this.me.ammo.secondary.res = m.a.secondary[1];
          if (m.lethal !== undefined) this.me.lethal = m.lethal;
        }
        return;
      case 'match': {
        this.loadMatch(m);
        this.app.hideEnd();
        this.ended = false;
        this.hudEl.classList.remove('hidden');
        if (this.settings && !this.input.locked && !this.paused) { /* Klick zum Weiterspielen */ }
        const M = MODES[m.mode];
        if (m.mode !== 'snd' || !this.sndBannerShown) this.hud.banner(M.name, `${this.map.name} · ${M.desc}`, 4);
        this.sndBannerShown = m.mode === 'snd';
        return;
      }
      case 'end': return this.onEnd(m);
      case 'chat': this.hud.chat(m.name, m.team, m.text); return;
      case 'left': { const p = this.players.get(m.id); if (p) { p.dispose(); this.players.delete(m.id); } return; }
      case 'pong': {
        const now = performance.now();
        this.rtt = now - m.c;
        return;
      }
      case 'error': this.app.toast(m.msg); return;
    }
  }

  onSnapshot(m) {
    const now = performance.now();
    const off = m.ts - now;
    if (this.svOff === null || Math.abs(off - this.svOff) > 400) this.svOff = off;
    else this.svOff += (off - this.svOff) * 0.04;
    this.modeState = m.m;
    const seen = new Set();
    for (const s of m.p) {
      const id = s[0];
      seen.add(id);
      if (id === this.myId) { this.myFlags = s[7]; continue; }
      let p = this.players.get(id);
      if (!p) {
        const info = this.roster.get(id) || { id, name: '?', team: 0, pw: 'kr7', sw: 'p9', pa: [] };
        p = new RemotePlayer(this.scene, info, this.team);
        this.players.set(id, p);
      }
      p.push(m.ts, s);
    }
    for (const [id, p] of this.players) if (!seen.has(id)) { p.dispose(); this.players.delete(id); }
    this.effects.lastNades = m.g;
  }

  onSpawn(m) {
    const me = this.me;
    me.alive = true; me.hp = 100;
    me.ms = newMoveState(m.x, m.y, m.z);
    me.yaw = m.yaw; me.pitch = 0;
    me.sq = m.sq;
    me.cls = m.cls;
    me.stats = {
      primary: computeStats(m.cls.primary.id, m.cls.primary.att, m.cls.perks),
      secondary: computeStats(m.cls.secondary.id, m.cls.secondary.att, m.cls.perks),
    };
    me.ammo = { primary: { mag: m.ammo.primary[0], res: m.ammo.primary[1] }, secondary: { mag: m.ammo.secondary[0], res: m.ammo.secondary[1] } };
    me.lethal = m.lethal; me.tactical = m.tactical;
    me.slot = 'primary';
    me.classIndex = m.classIndex;
    this.w = this.freshWeaponState();
    this.w.swapEnd = performance.now() + 350; this.w.swapDur = 350;
    this.vm.teamHex = TEAMS[this.team].hex;
    this.vm.setLoadout(m.cls);
    this.vm.show('primary');
    this.death = null; this.spectate = null;
    this.crouchToggle = false;
    this.eyeH = PLAYER.standHeight - PLAYER.eyeFromTop;
  }

  onDied(m) {
    const me = this.me;
    me.alive = false; me.hp = 0;
    const killer = this.roster.get(m.by);
    this.death = {
      t: performance.now(), by: m.by, name: killer ? killer.name : '', w: m.w, respawn: m.respawn,
      pos: this.camera.position.clone(), killPos: m.killcam ? new THREE.Vector3(m.killcam[0], m.killcam[1] + 1.4, m.killcam[2]) : null,
      khp: m.khp, spectate: m.spectate,
    };
    this.w.reloadEnd = 0;
    if (this.useHeld) { this.useHeld = false; this.net.send({ t: 'use', on: false }); }
  }

  onRemoteFire(m) {
    const p = this.players.get(m.id);
    const o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
    const e = m.e ? new THREE.Vector3(m.e[0], m.e[1], m.e[2]) : null;
    const from = p ? p.muzzleWorld(tmpV2.clone()) : o;
    const st = computeStats(m.w);
    audio.shot(st.cls, { x: o.x, y: o.y, z: o.z }, m.s);
    if (!m.s) this.effects.flashLight(from, 18, 0.05);
    if (p && !p.friendly && !m.s && !m.g) this.hud.enemyFired(m.id);
    if (e) {
      if (Math.random() < 0.6) this.effects.tracer(from, e);
      const d = tmpV.subVectors(e, o);
      const len = d.length();
      d.normalize();
      const hit = raycastWorld(this.phys, o, d, len + 0.05);
      if (hit && Math.abs(hit.t - len) < 0.1) this.effects.impact(e, hit.normal, surfaceOf(hit.box.mat));
      // Kugel fliegt an mir vorbei?
      if (this.me.alive) {
        const cp = this.camera.position;
        const t = Math.max(0, Math.min(len, tmpV2.subVectors(cp, o).dot(d)));
        const close = tmpV2.copy(o).addScaledVector(d, t).distanceTo(cp);
        if (close < 1.2 && t > 3) audio.whoosh({ x: cp.x + d.x, y: cp.y, z: cp.z + d.z });
      }
    }
  }

  onEvent(m) {
    const k = m.kind;
    const myTeam = this.team;
    if (k === 'info') { this.hud.info(m.text); return; }
    if (k === 'go') { this.hud.banner(m.text, '', 1.6); audio.announce('neutral'); return; }
    if (k === 'capture') { this.hud.banner(m.text, '', 2.2, m.team === myTeam ? '#7fb3ff' : '#ff8a5c'); audio.announce(m.team === myTeam ? 'good' : 'bad'); return; }
    if (k === 'planted') { this.hud.banner(m.text, '', 2.5, '#ff5a4a'); audio.announce(this.modeState && this.modeState.at === myTeam ? 'good' : 'bad'); return; }
    if (k === 'defused') { this.hud.banner(m.text, '', 2.5); audio.announce(this.modeState && this.modeState.at === myTeam ? 'bad' : 'good'); return; }
    if (k === 'roundend') { this.hud.banner(m.team === myTeam ? 'Runde gewonnen' : 'Runde verloren', m.text, 4, m.team === myTeam ? '#e8c56c' : '#ff5a4a'); audio.announce(m.team === myTeam ? 'good' : 'bad'); return; }
    if (k === 'round') { this.hud.banner(m.text, '', 3); return; }
    if (k === 'uav') { this.hud.banner(m.team === myTeam ? 'Drohne aktiv' : 'Feindliche Drohne', m.text, 2.5, m.team === myTeam ? '#7fb3ff' : '#ff8a5c'); audio.announce(m.team === myTeam ? 'good' : 'bad'); return; }
    if (k === 'bombpick' || k === 'bombdrop') { if (m.team === myTeam) this.hud.info(m.text); return; }
    if (k === 'matchend') return;
    this.hud.info(m.text);
  }

  onEnd(m) {
    this.ended = true;
    this.hudEl.classList.add('hidden');
    this.input.unlock();
    this.app.showEnd(m, this);
  }

  // ------------------------------------------------------------------ Lokale Logik
  stats() { return this.me.stats[this.me.slot]; }

  frozen() {
    const ph = this.modeState ? this.modeState.ph : 'live';
    if (ph === 'pre' || ph === 'post') return true;
    if (this.planting) return true;
    return false;
  }

  canAct() {
    const ph = this.modeState ? this.modeState.ph : 'live';
    return this.me.alive && ph !== 'pre' && ph !== 'post' && !this.paused;
  }

  currentSpread() {
    const st = this.stats(), w = this.w, ms = this.me.ms;
    const a = w.adsT * w.adsT;
    let s = st.hipSpread + (st.adsSpread - st.hipSpread) * a;
    const sp = Math.hypot(ms.vel.x, ms.vel.z);
    if (sp > 1) s += st.moveSpread * Math.min(1, sp / 5) * (1 - w.adsT * 0.75);
    if (!ms.onGround) s += st.airSpread * (1 - w.adsT * 0.5);
    if (ms.stance === STANCE.crouch) s *= 0.85;
    if (ms.stance === STANCE.slide) s += st.hipSpread * 0.4;
    s += w.bloom * (1 - w.adsT * 0.85);
    return Math.max(0, s);
  }

  eyePos(out) {
    const p = this.me.ms.pos;
    return out.set(p.x, p.y + this.eyeH, p.z);
  }

  fire(now) {
    const me = this.me, st = this.stats(), w = this.w;
    const am = me.ammo[me.slot];
    w.lastShot = now;
    am.mag--;
    const eye = this.camera.position.clone();
    const base = new THREE.Vector3(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch));
    const spread = this.currentSpread();
    const dirs = [];
    for (let i = 0; i < st.pellets; i++) dirs.push(spreadDir(base, spread + (st.pellets > 1 ? st.pelletSpread : 0)));
    this.net.send({ t: 'shoot', o: [+eye.x.toFixed(3), +eye.y.toFixed(3), +eye.z.toFixed(3)], d: dirs.map(d => [+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4)]) });
    // Effekte (lokal vorhergesagt)
    const muzzle = tmpV2.copy(eye).addScaledVector(base, 0.7);
    const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    muzzle.addScaledVector(right, 0.12 * (1 - w.adsT)).y -= 0.08 * (1 - w.adsT);
    dirs.forEach((d, i) => {
      const wall = raycastWorld(this.phys, eye, d, 250);
      let maxT = wall ? wall.t : 250;
      let hitP = null;
      for (const p of this.players.values()) {
        if (!p.alive || p.friendly) continue;
        const r = rayPlayer(eye, d, p.pos.x, p.pos.y, p.pos.z, p.height(), maxT);
        if (r) { maxT = r.t; hitP = p; }
      }
      const end = eye.clone().addScaledVector(d, maxT);
      if (hitP) this.effects.blood(end);
      else if (wall) this.effects.impact(end, wall.normal, surfaceOf(wall.box.mat));
      if (i === 0 && (st.pellets > 1 || Math.random() < 0.5)) this.effects.tracer(muzzle, end);
    });
    this.vm.muzzleFlash(st);
    this.vm.kick(st);
    if (!st.suppressed && !st.noFlash) this.effects.flashLight(muzzle, 16, 0.05);
    audio.shot(st.cls, null, st.suppressed);
    // Rückstoß
    const adsK = 0.75 + 0.25 * (1 - w.adsT);
    const kv = st.recoilV * adsK * (0.85 + Math.random() * 0.3) * DEG * (me.ms.stance === STANCE.crouch ? 0.85 : 1);
    const kh = st.recoilH * adsK * (Math.random() * 2 - 0.85) * DEG;
    me.pitch = Math.min(1.55, me.pitch + kv);
    me.yaw -= kh;
    w.recoilAcc += kv * 0.7;
    w.bloom = Math.min(st.hipSpread * 1.2, w.bloom + st.hipSpread * 0.22);
    this.shake = Math.max(this.shake, st.cls === 'sniper' || st.cls === 'shotgun' ? 0.25 : 0.06);
    if (!st.auto) w.semiReady = false;
    if (am.mag === 0 && am.res > 0) setTimeout(() => { if (this.me.alive && this.me.ammo[this.me.slot] === am && !this.w.reloadEnd) this.startReload(); }, 280);
  }

  startReload() {
    const me = this.me, st = this.stats(), am = me.ammo[me.slot], w = this.w;
    if (!me.alive || w.reloadEnd || am.mag >= st.mag || am.res <= 0) return;
    const now = performance.now();
    w.reloadEnd = now + st.reload * 1000;
    w.reloadDur = st.reload * 1000;
    w.reloadStage = -1;
    this.net.send({ t: 'reload' });
  }

  swapTo(slot) {
    const me = this.me, w = this.w;
    if (slot === me.slot || !me.cls) return;
    const now = performance.now();
    if (w.reloadEnd) { w.reloadEnd = 0; this.net.send({ t: 'rcancel' }); }
    me.slot = slot;
    const dur = me.stats[slot].equip * 1000;
    w.swapEnd = now + dur; w.swapDur = dur;
    w.adsT = 0;
    this.vm.show(slot);
    audio.reload(0);
  }

  throwNade(kind) {
    const me = this.me, w = this.w;
    if (me[kind] <= 0 || w.throwEnd || !this.canAct()) return;
    const now = performance.now();
    if (w.reloadEnd) { w.reloadEnd = 0; this.net.send({ t: 'rcancel' }); }
    w.throwEnd = now + 650; w.throwKind = kind; w.throwSent = false; w.throwAt = now + 230;
  }

  releaseNade() {
    const me = this.me, w = this.w;
    w.throwSent = true;
    if (me[w.throwKind] <= 0) return;
    me[w.throwKind]--;
    const dir = new THREE.Vector3(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch));
    const o = this.camera.position.clone().addScaledVector(dir, 0.45);
    const v = dir.multiplyScalar(17.5);
    v.y += 3;
    v.x += me.ms.vel.x * 0.5; v.z += me.ms.vel.z * 0.5;
    this.net.send({ t: 'throw', k: w.throwKind, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    audio.whoosh(null);
  }

  melee() {
    const w = this.w;
    const now = performance.now();
    if (w.meleeEnd || !this.canAct()) return;
    if (w.reloadEnd) { w.reloadEnd = 0; this.net.send({ t: 'rcancel' }); }
    w.meleeEnd = now + 480;
    this.net.send({ t: 'melee' });
    audio.whoosh(null);
  }

  // ------------------------------------------------------------------ Frame
  loop(t) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    try { this.update(dt, performance.now()); } catch (e) { console.error(e); }
    this.render();
    this.input.endFrame();
  }

  update(dt, now) {
    const me = this.me, w = this.w, inp = this.input, S = this.settings;
    const active = inp.locked && !this.paused && !inp.chatOpen;

    // Chat
    if (inp.locked && !inp.chatOpen && (inp.hit('KeyT') || inp.hit('Enter'))) this.openChat();
    this.boardOpen = active && inp.down('Tab') || (this.modeState && this.modeState.ph === 'post' && !this.ended);
    this.hud.board(this.boardOpen, this.roster, this.myId, this.modeState && this.modeState.sc, this.mode);

    // Umsehen
    const st = me.cls ? this.stats() : null;
    if (active) {
      const zoom = st ? 1 + (st.zoom - 1) * w.adsT : 1;
      const sens = 0.0022 * S.sens * (w.adsT > 0.3 ? S.adsSens / Math.pow(zoom, 0.6) : 1);
      me.yaw -= inp.mouse.dx * sens;
      const dy = inp.mouse.dy * sens * (S.invertY ? -1 : 1);
      me.pitch -= dy;
      if (dy > 0 && w.recoilAcc > 0) w.recoilAcc = Math.max(0, w.recoilAcc - dy);
      me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch));
    }

    this.updateObjectives(now);

    if (me.alive && me.cls) {
      this.updateMovement(dt, now, active);
      this.updateWeapon(dt, now, active);
    } else {
      this.updateDeathCam(dt, now, active);
    }

    // Netzwerk senden
    if (me.alive && now - this.lastSend > 1000 / CLIENT_SEND_RATE) {
      this.lastSend = now;
      const ms = me.ms;
      this.net.send({
        t: 'st', sq: me.sq, p: [+ms.pos.x.toFixed(3), +ms.pos.y.toFixed(3), +ms.pos.z.toFixed(3)],
        v: [+ms.vel.x.toFixed(2), +ms.vel.y.toFixed(2), +ms.vel.z.toFixed(2)],
        y: +me.yaw.toFixed(4), pi: +me.pitch.toFixed(4), s: ms.stance, w: me.slot === 'primary' ? 0 : 1,
        a: w.adsT > 0.5 ? 1 : 0, sp: ms.sprinting ? 1 : 0, tac: ms.tac ? 1 : 0,
      });
    }
    if (now - this.lastPing > 2000) { this.lastPing = now; this.net.send({ t: 'ping', c: now, rtt: Math.round(this.rtt) }); }

    // Andere Spieler
    const rt = now + (this.svOff || 0) - INTERP_DELAY;
    for (const p of this.players.values()) p.update(dt, rt, now);
    this.effects.grenades(this.effects.lastNades || [], dt);
    this.effects.update(dt);
    this.world.update(now / 1000, this.modeState);
    this.updateBomb(now);
    this.phys.smokes = this.phys.smokes.filter(s => s.end > now);

    this.updateCamera(dt, now);
    this.updateHud(dt, now);
  }

  updateObjectives(now) {
    // S&D: Legen / Entschärfen
    const me = this.me, m = this.modeState;
    this.planting = false;
    this.objMsg = '';
    if (!me.alive || !m) return;
    const pos = me.ms.pos;
    const useDown = this.input.locked && !this.input.chatOpen && (this.input.down('KeyE') || this.input.down('KeyF'));
    let want = false;
    if (this.mode === 'snd' && m.b) {
      const b = m.b;
      const atk = m.at === this.team;
      if (atk && b.c === this.myId && !b.pl) {
        const site = this.map.snd.find(s => Math.hypot(s.x - pos.x, s.z - pos.z) < 2.6);
        if (site) {
          want = useDown;
          this.objMsg = b.pl_by === this.myId && b.pp > 0 ? `Bombe wird gelegt…<div class="prog"><i style="width:${b.pp * 100}%"></i></div>` : `Halte <kbd>E</kbd> zum Platzieren an ${site.id}`;
          this.planting = want && me.ms.onGround;
        }
      } else if (!atk && b.pl && b.p && Math.hypot(b.p[0] - pos.x, b.p[2] - pos.z) < 2.3) {
        want = useDown;
        this.objMsg = b.df_by === this.myId && b.dp > 0 ? `Entschärfe…<div class="prog"><i style="width:${b.dp * 100}%"></i></div>` : 'Halte <kbd>E</kbd> zum Entschärfen';
        this.planting = want;
      }
    }
    if (this.mode === 'dom' && m.f) {
      this.map.dom.forEach((f, i) => {
        if (Math.hypot(f.x - pos.x, f.z - pos.z) < 3.6) {
          const [owner, cap, prog, cont] = m.f[i];
          if (cont) this.objMsg = `Flagge ${f.id} umkämpft`;
          else if (owner !== this.team) this.objMsg = `Erobere ${f.id}<div class="prog"><i style="width:${(cap === this.team ? prog : 0) * 100}%"></i></div>`;
        }
      });
    }
    if (want !== this.useHeld) { this.useHeld = want; this.net.send({ t: 'use', on: want }); }
  }

  updateBomb(now) {
    const m = this.modeState;
    const bm = this.bombMesh;
    if (!bm) return;
    if (this.mode !== 'snd' || !m || !m.b) { bm.visible = false; return; }
    const b = m.b;
    const p = b.p || b.dr;
    bm.visible = !!p;
    if (p) bm.position.set(p[0], p[1], p[2]);
    if (b.pl) {
      const left = b.ex;
      const interval = left > 20 ? 1000 : left > 10 ? 600 : left > 5 ? 320 : 160;
      const on = (now % interval) < interval * 0.35;
      bm.userData.led.visible = on;
      if (on && !this.lastBeepOn) audio.beep(left < 10);
      this.lastBeepOn = on;
    } else bm.userData.led.visible = false;
  }

  updateMovement(dt, now, active) {
    const me = this.me, inp = this.input, w = this.w;
    const st = this.stats();
    const frozen = this.frozen();
    const key = c => active && inp.down(c);
    if (active && inp.hit('KeyC')) this.crouchToggle = !this.crouchToggle;
    if (active && (inp.hit('ShiftLeft') || inp.hit('ShiftRight'))) this.crouchToggle = false;
    if (active && inp.hit('Space')) this.crouchToggle = false;
    const sprintKey = key('ShiftLeft') || key('ShiftRight');
    const adsWanted = this.wantsAds(active);
    const input = {
      f: !frozen && key('KeyW'), b: !frozen && key('KeyS'), l: !frozen && key('KeyA'), r: !frozen && key('KeyD'),
      jump: !frozen && key('Space'), crouch: this.crouchToggle || key('ControlRight'),
      sprint: !frozen && sprintKey && !w.reloadBlocksSprint, tac: active && (inp.tacRequest || (me.ms.tac && sprintKey)),
      ads: adsWanted && w.adsT > 0.1, yaw: me.yaw, moveMult: st.move, adsMove: st.adsMove,
      marathon: me.cls.perks.includes('marathon'),
    };
    if (this.planting) { input.f = input.b = input.l = input.r = false; input.crouch = true; }
    // Feste Teilschritte für stabile Physik
    this.moveAcc = (this.moveAcc || 0) + dt;
    const step = 1 / 120;
    let n = 0;
    while (this.moveAcc >= step && n < 12) {
      const ev = stepMove(this.phys, me.ms, input, step);
      input.tac = false;
      if (ev.jumped) audio.footstep(null, 0.6);
      if (ev.landed) { this.landed = ev.landed; audio.land(ev.landed); }
      if (ev.slid) audio.slide();
      if (ev.mantled) audio.footstep(null, 0.8);
      this.moveAcc -= step; n++;
    }
    // Schritte
    const ms = me.ms;
    const sp = Math.hypot(ms.vel.x, ms.vel.z);
    if (ms.onGround && sp > 1 && ms.stance !== STANCE.slide) {
      this.stepAcc = (this.stepAcc || 0) + sp * dt;
      const len = ms.sprinting ? 2.4 : ms.stance === STANCE.crouch ? 1.6 : 2.0;
      if (this.stepAcc > len) { this.stepAcc = 0; audio.footstep(null, ms.stance === STANCE.crouch ? 0.25 : ms.sprinting ? 0.55 : 0.4); }
    }
    // Augenhöhe weich
    const target = stanceHeight(ms.stance) - PLAYER.eyeFromTop;
    this.eyeH += (target - this.eyeH) * Math.min(1, dt * 14);
  }

  wantsAds(active) {
    const inp = this.input;
    if (!active) return false;
    if (this.settings.toggleAds) {
      if (inp.mouse.rightPressed) this.adsToggle = !this.adsToggle;
      return this.adsToggle;
    }
    return inp.mouse.right;
  }

  updateWeapon(dt, now, active) {
    const me = this.me, w = this.w, inp = this.input;
    let st = this.stats();
    const am = me.ammo[me.slot];
    const ms = me.ms;
    const can = this.canAct();

    // Wechseln
    if (active && can && !w.throwEnd && !w.meleeEnd) {
      if (inp.hit('Digit1')) this.swapTo('primary');
      if (inp.hit('Digit2')) this.swapTo('secondary');
      if (inp.mouse.wheel) this.swapTo(me.slot === 'primary' ? 'secondary' : 'primary');
      if (inp.hit('KeyG')) this.throwNade('lethal');
      if (inp.hit('KeyQ')) this.throwNade('tactical');
      if (inp.hit('KeyV') || inp.mouse.thumb) this.melee();
      if (inp.hit('KeyR')) this.startReload();
    }
    st = this.stats();
    const swapping = now < w.swapEnd;
    const reloading = !!w.reloadEnd;
    if (w.throwEnd) {
      if (!w.throwSent && now >= w.throwAt) this.releaseNade();
      if (now >= w.throwEnd) w.throwEnd = 0;
    }
    if (w.meleeEnd && now >= w.meleeEnd) w.meleeEnd = 0;

    // Nachladen abschließen + Sounds
    if (reloading) {
      const k = 1 - (w.reloadEnd - now) / w.reloadDur;
      const stage = k > 0.85 ? 2 : k > 0.55 ? 1 : k > 0.2 ? 0 : -1;
      if (stage > w.reloadStage) { w.reloadStage = stage; if (stage >= 0) audio.reload(stage); }
      if (now >= w.reloadEnd) {
        const need = st.mag - am.mag, take = Math.min(need, am.res);
        am.mag += take; am.res -= take;
        w.reloadEnd = 0;
      }
    }

    // Zielen
    const adsWanted = this.wantsAds(active) && can && !swapping && !w.throwEnd && !w.meleeEnd && !ms.mantle && !reloading && ms.stance !== STANCE.slide;
    const rate = dt / Math.max(0.05, st.adsTime);
    w.adsT = adsWanted ? Math.min(1, w.adsT + rate) : Math.max(0, w.adsT - rate * 1.3);
    if (ms.sprinting) w.adsT = Math.max(0, w.adsT - rate * 2);

    // Sprint blockiert Schießen kurz
    if (ms.sprinting || ms.mantle) w.wasSprinting = true;
    else if (w.wasSprinting) { w.wasSprinting = false; w.sprintBlock = now + st.sprintToFire * 1000 * (ms.tac ? 1.4 : 1); }

    // Feuern
    const trigger = active && inp.mouse.left;
    if (!trigger) w.semiReady = true;
    const ready = can && !swapping && !reloading && !w.throwEnd && !w.meleeEnd && !ms.mantle && !ms.sprinting && now >= w.sprintBlock && !this.planting;
    if (trigger && ready) {
      if (am.mag <= 0) {
        if (inp.mouse.leftPressed) { audio.click('empty'); if (am.res > 0) this.startReload(); }
      } else if ((st.auto || w.semiReady) && now - w.lastShot >= st.fireInterval * 1000) {
        this.fire(now);
      }
    } else if (trigger && inp.mouse.leftPressed && ms.sprinting) {
      // Schießen beendet Sprint nicht automatisch – Sprinttaste loslassen
    }
    // Rückstoß-Erholung & Streuung
    if (now - w.lastShot > st.fireInterval * 1000 * 1.6 && w.recoilAcc > 0) {
      const r = Math.min(w.recoilAcc, st.recover * DEG * dt * 1.4);
      me.pitch -= r; w.recoilAcc -= r;
    }
    w.bloom = Math.max(0, w.bloom - dt * st.hipSpread * 2.2);

    // Atem beim Zielfernrohr
    this.breath += dt;
    const scoped = st.sight === 'scope' && w.adsT > 0.92;
    if (scoped && active && (inp.down('ShiftLeft')) && this.breathHold < 4) this.breathHold += dt;
    else this.breathHold = Math.max(0, this.breathHold - dt * 0.5);
    if (scoped) {
      const amp = (inp.down('ShiftLeft') && this.breathHold < 4 ? 0.12 : 1) * 0.0045;
      me.yaw += Math.cos(this.breath * 1.1) * amp * dt * 2;
      me.pitch += Math.sin(this.breath * 2.2) * amp * dt * 2;
    }
  }

  updateDeathCam(dt, now, active) {
    const d = this.death;
    if (!d) { this.vm.update(dt, { hidden: true, ads: 0, speed: 0, mouseDx: 0, mouseDy: 0, reload: 0, swap: 0, melee: 0, throwing: 0 }); return; }
    const t = (now - d.t) / 1000;
    // S&D: Teamkameraden zuschauen
    if (d.respawn < 0 && t > 3) {
      const mates = [...this.players.values()].filter(p => p.friendly && p.alive);
      if (mates.length) {
        if (!this.spectate || !mates.includes(this.spectate) || (active && this.input.mouse.leftPressed)) {
          const i = this.spectate ? (mates.indexOf(this.spectate) + 1) % mates.length : 0;
          this.spectate = mates[i] || mates[0];
        }
        return;
      }
    }
    this.spectate = null;
  }

  updateCamera(dt, now) {
    const me = this.me, w = this.w, cam = this.camera, S = this.settings;
    const st = me.cls ? this.stats() : null;
    let vfov = hfovToV(S.fov, cam.aspect);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake;
    if (me.alive && st) {
      const ms = me.ms;
      this.eyePos(cam.position);
      this.landed = Math.max(0, this.landed - dt * 30);
      const sp = Math.hypot(ms.vel.x, ms.vel.z);
      this.bobT += dt * sp * 1.6;
      const bobAmp = ms.onGround && ms.stance !== STANCE.slide ? Math.min(1, sp / 6) * 0.025 * (1 - w.adsT * 0.9) : 0;
      cam.position.y += Math.abs(Math.sin(this.bobT)) * bobAmp - Math.min(0.12, this.landed * 0.008);
      this.slideRoll += ((ms.stance === STANCE.slide ? 0.06 : ms.tac ? 0.015 : 0) - this.slideRoll) * Math.min(1, dt * 8);
      cam.rotation.set(me.pitch + (Math.random() - 0.5) * sh * 0.03, me.yaw + (Math.random() - 0.5) * sh * 0.03, this.slideRoll + Math.sin(this.bobT) * bobAmp * 0.3);
      const zoom = 1 + (st.zoom - 1) * w.adsT;
      vfov = vfov / zoom;
      if (ms.sprinting) vfov += ms.tac ? 7 : 4;
      if (ms.stance === STANCE.slide) vfov += 5;
      const now2 = performance.now();
      const scoped = st.sight === 'scope' && w.adsT > 0.92;
      this.vm.update(dt, {
        ads: w.adsT, sprint: ms.sprinting, tac: ms.tac, speed: ms.onGround ? sp : 0, mouseDx: this.input.mouse.dx, mouseDy: this.input.mouse.dy,
        reload: w.reloadEnd ? 1 - (w.reloadEnd - now2) / w.reloadDur : 0,
        swap: now2 < w.swapEnd ? (w.swapEnd - now2) / w.swapDur : 0,
        melee: w.meleeEnd ? (w.meleeEnd - now2) / 480 : 0,
        throwing: w.throwEnd ? (w.throwEnd - now2) / 650 : 0,
        landed: this.landed > 5 ? this.landed : 0, hidden: scoped, pistol: st.cls === 'pistol',
      });
      this.scoped = scoped;
    } else if (this.spectate) {
      const p = this.spectate;
      cam.position.set(p.pos.x, p.pos.y + p.height() - PLAYER.eyeFromTop, p.pos.z);
      // leicht hinter dem Spieler
      cam.position.x += Math.sin(p.yaw) * 2.2; cam.position.z += Math.cos(p.yaw) * 2.2; cam.position.y += 0.6;
      cam.rotation.set(p.pitch * 0.5 - 0.15, p.yaw, 0);
      this.vm.update(dt, { hidden: true, ads: 0, speed: 0, mouseDx: 0, mouseDy: 0, reload: 0, swap: 0, melee: 0, throwing: 0 });
      this.scoped = false;
    } else if (this.death) {
      const d = this.death;
      const t = (now - d.t) / 1000;
      cam.position.copy(d.pos);
      cam.position.y = Math.max(d.pos.y - 1.2, d.pos.y - t * 2.5);
      if (d.killPos) {
        const look = tmpV.copy(d.killPos).sub(cam.position);
        const yaw = Math.atan2(-look.x, -look.z), pitch = Math.atan2(look.y, Math.hypot(look.x, look.z));
        const k = Math.min(1, t * 2.5);
        let dy = yaw - me.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        cam.rotation.set(me.pitch + (pitch - me.pitch) * k, me.yaw + dy * k, 0.25 * Math.min(1, t * 3));
      } else cam.rotation.set(-0.6 * Math.min(1, t * 2), me.yaw, 0.3 * Math.min(1, t * 3));
      this.vm.update(dt, { hidden: true, ads: 0, speed: 0, mouseDx: 0, mouseDy: 0, reload: 0, swap: 0, melee: 0, throwing: 0 });
      this.scoped = false;
    } else {
      // Vor dem ersten Spawn: Übersicht
      const B = this.map.bounds;
      cam.position.set(0, 30, B.maxZ + 6);
      cam.rotation.set(-0.7, 0, 0);
    }
    if (Math.abs(cam.fov - vfov) > 0.01) { cam.fov = vfov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    audio.setListener(cam.position, fwd, { x: 0, y: 1, z: 0 });
  }

  updateHud(dt, now) {
    const me = this.me, w = this.w;
    const st = me.cls ? this.stats() : null;
    const am = st ? me.ammo[me.slot] : null;
    const m = this.modeState;
    let center = '';
    if (!me.alive && this.death) {
      const d = this.death;
      const t = (now - d.t) / 1000;
      const left = d.respawn > 0 ? Math.max(0, d.respawn - t) : -1;
      const by = d.by && d.by !== this.myId ? `Getötet von <b class="c-t${(this.roster.get(d.by) || {}).team}">${esc(d.name)}</b>` : d.spectate ? 'Warte auf die nächste Runde' : '<b>Du bist gestorben</b>';
      const wl = d.w && !d.spectate ? `<div class="sub">${esc(weaponLabel(d.w))}${d.by && d.by !== this.myId ? ` · Gegner hat noch ${d.khp} HP` : ''}</div>` : '';
      const sp = this.spectate ? `<div class="sub">Du schaust ${esc(this.spectate.info.name)} zu · Klick für nächsten</div>` : '';
      const rs = left >= 0 ? `<div class="sub">Wiedereinstieg in ${left.toFixed(1)} s · <kbd>Esc</kbd> Klasse wechseln</div>` : '';
      center = `<div class="death">${by}${wl}${rs}${sp}</div>`;
    } else if (!me.alive && !this.death) {
      center = m && m.ph === 'live' && this.mode === 'snd' ? '<div class="death">Warte auf die nächste Runde</div>' : '';
    }
    if (m && m.ph === 'pre' && me.alive) center = `<div class="death" style="border-color:var(--brass)"><b>${this.mode === 'snd' ? 'Runde' : 'Match'} beginnt in ${Math.ceil(m.pe || 0)}</b><div class="sub"><kbd>Esc</kbd> Klasse wechseln</div></div>`;
    if (!this.input.locked && !this.paused && !this.ended && this.running) center += '<div class="clicktoplay">Klicken zum Spielen</div>';

    // Wen schaue ich an?
    let lookName = '';
    if (me.alive) {
      const o = this.camera.position;
      const d = tmpV.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const wall = raycastWorld(this.phys, o, d, 120);
      let maxT = wall ? wall.t : 120, best = null;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const r = rayPlayer(o, d, p.pos.x, p.pos.y, p.pos.z, p.height(), maxT);
        if (r) { maxT = r.t; best = p; }
      }
      if (best && !best.friendly && !this.phys.smokes.some(s => Math.hypot(s.x - best.pos.x, s.z - best.pos.z) < s.r)) lookName = best.info.name;
    }

    // Lebende pro Team (S&D)
    let aliveCounts = [0, 0], totalCounts = [0, 0];
    if (this.mode === 'snd') {
      for (const r of this.roster.values()) {
        totalCounts[r.team]++;
        const alive = r.id === this.myId ? me.alive : (this.players.get(r.id) || {}).alive;
        if (alive) aliveCounts[r.team]++;
      }
    }

    const vfov = this.camera.fov * DEG;
    const gap = st ? Math.tan(this.currentSpread() * DEG) * (innerHeight / 2) / Math.tan(vfov / 2) : 10;
    const showCross = me.alive && st && w.adsT < 0.5 && !me.ms.sprinting && !w.reloadEnd || (me.alive && st && w.reloadEnd && w.adsT < 0.5);
    this.hud.crosshair(gap + 4, showCross && !me.ms.sprinting, st && st.pellets === 1);
    this.hud.update(dt, {
      alive: me.alive, hp: me.hp, weapon: st, mag: am ? am.mag : 0, res: am ? am.res : 0, reloading: !!w.reloadEnd,
      lethal: me.lethal, tactical: me.tactical, lethalId: me.cls && me.cls.lethal, tacticalId: me.cls && me.cls.tactical,
      scope: this.scoped, lookName, msg: this.objMsg, center, modeState: m, team: this.team,
      showFps: this.settings.showFps, fps: this.fps, ping: Math.round(this.rtt), aliveCounts, totalCounts,
    });
    if (me.alive && me.hp < 100 && me.hp > 0) {
      // Regeneration lokal anzeigen (Server ist maßgeblich)
      this.regenT = (this.regenT || 0) + dt;
    }
    const myPos = me.alive ? { x: me.ms.pos.x, z: me.ms.pos.z, yaw: me.yaw, team: this.team } : this.spectate ? { x: this.spectate.pos.x, z: this.spectate.pos.z, yaw: this.spectate.yaw, team: this.team } : null;
    // Granatenwarnung
    let nadeAng = null;
    if (me.alive) {
      for (const [, kind, x, y, z] of (this.effects.lastNades || [])) {
        if (kind !== 'frag' && kind !== 'semtex') continue;
        const dx = x - me.ms.pos.x, dz = z - me.ms.pos.z;
        if (Math.hypot(dx, dz) < 7 && Math.abs(y - me.ms.pos.y) < 4) {
          const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
          nadeAng = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
          break;
        }
      }
    }
    this.hud.nadeWarning(nadeAng);
    this.mmT = (this.mmT || 0) + dt;
    if (this.mmT > 1 / 30) { this.mmT = 0; this.hud.drawMinimap(myPos, this.players.values(), m, this.map, this.mode); }
  }

  render() {
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    if (this.me.alive) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vm.scene, this.vm.camera);
    }
  }

  openChat() {
    const inp = this.input;
    inp.chatOpen = true;
    const wrap = document.createElement('div');
    wrap.className = 'chatin';
    wrap.innerHTML = '<input maxlength="120" placeholder="Nachricht an alle …">';
    this.hudEl.appendChild(wrap);
    const el = wrap.querySelector('input');
    el.focus();
    const close = (send) => {
      if (send && el.value.trim()) this.net.send({ t: 'chat', text: el.value.trim() });
      wrap.remove();
      inp.chatOpen = false;
    };
    el.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') close(true);
      if (e.key === 'Escape') close(false);
    });
    el.addEventListener('blur', () => { if (inp.chatOpen) close(false); });
  }

  chooseClass(i) {
    this.net.send({ t: 'class', i });
    this.app.toast(`Klasse ${i + 1} ausgewählt – gilt beim nächsten Spawn`);
  }

  destroy() {
    this.running = false;
    this.offNet();
    this.input.dispose();
    window.removeEventListener('resize', this._resize);
    window.removeEventListener('keydown', this._esc);
    this.renderer.domElement.removeEventListener('click', this._click);
    for (const p of this.players.values()) p.dispose();
    this.effects.clear();
    if (this.world) this.world.dispose();
    this.hudEl.innerHTML = '';
    this.hudEl.classList.add('hidden');
    this.renderer.clear();
  }
}
