// Bot-KI: Wahrnehmung, Zielen, Bewegung entlang Pfaden, Spielmodus-Ziele
import { stepMove, raycastWorld, smokeBlocks, stanceHeight } from '../shared/physics.js';
import { PLAYER, MOVE } from '../shared/constants.js';
import { WEAPONS, CLASS_ATTACHMENTS, ATTACHMENTS, PERKS } from '../shared/weapons.js';

const DIFF = {
  easy:   { react: 0.75, turn: 3.0, err: 0.10, errDecay: 0.5, vision: 38, burst: [0.2, 0.45], pause: [0.4, 0.8], head: 0.05, fov: 0.45, nade: 0.05 },
  normal: { react: 0.42, turn: 5.5, err: 0.055, errDecay: 0.32, vision: 55, burst: [0.3, 0.75], pause: [0.2, 0.45], head: 0.15, fov: 0.25, nade: 0.12 },
  hard:   { react: 0.22, turn: 9.5, err: 0.032, errDecay: 0.18, vision: 75, burst: [0.5, 1.1], pause: [0.1, 0.25], head: 0.3, fov: 0.05, nade: 0.2 },
};

const NAMES = ['Kevin', 'Jürgen', 'Schnitzel', 'Brezel', 'Hansi', 'Gerda', 'Uwe', 'Bernd', 'Klaus', 'Detlef', 'Helga', 'Dieter',
  'Rüdiger', 'Waltraud', 'Horst', 'Sepp', 'Franzl', 'Mausi', 'Knödel', 'Strudel', 'Gustl', 'Ferdl', 'Resi', 'Hubert', 'Lurch',
  'Krapfen', 'Pommes', 'Kaiser', 'Bazi', 'Zwiebel', 'Gurkerl', 'Topfen'];
export function botName(used) {
  const free = NAMES.filter(n => !used.has('[BOT] ' + n));
  return '[BOT] ' + (free.length ? free[Math.floor(Math.random() * free.length)] : 'Bot' + Math.floor(Math.random() * 999));
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function botCamo(diff) {
  const r = Math.random();
  if (diff === 'hard' && r < 0.12) return pick(['gold', 'diamond', 'darkmatter']);
  if (r < 0.06) return 'gold';
  if (r < 0.5) return pick(['woodland', 'desert', 'digital', 'tiger', 'arctic', 'sakura', 'carbon', 'crimson']);
  return 'none';
}

export function makeBotClass(diff) {
  const pool = diff === 'easy' ? ['kr7', 'vipera', 'striker', 'hornet', 'kr7'] : ['kr7', 'vipera', 'striker', 'longbow', 'hornet', 'atlas', 'dmr14', 'tempest', 'hydra', 'kr7', 'vipera'];
  const pid = pick(pool);
  const allowed = (CLASS_ATTACHMENTS[WEAPONS[pid].cls] || []).slice().sort(() => Math.random() - 0.5);
  const used = new Set(), att = [];
  const n = diff === 'easy' ? 1 : diff === 'normal' ? 3 : 5;
  for (const a of allowed) {
    if (att.length >= n) break;
    if (used.has(ATTACHMENTS[a].slot) || a === 'acog') continue;
    used.add(ATTACHMENTS[a].slot); att.push(a);
  }
  const perks = [1, 2, 3].map(s => pick(Object.values(PERKS).filter(p => p.slot === s && p.id !== 'ghost')).id);
  return {
    name: 'Bot', primary: { id: pid, att, camo: botCamo(diff) }, secondary: { id: pick(['p9', 'p9', 'bulldog', 'mp5k']), att: [], camo: botCamo(diff) },
    lethal: Math.random() < 0.7 ? 'frag' : 'semtex', tactical: Math.random() < 0.6 ? 'flash' : 'smoke', perks,
  };
}

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class BotBrain {
  constructor(room, p, diff) {
    this.room = room;
    this.p = p;
    this.d = DIFF[diff] || DIFF.normal;
    this.onSpawn();
  }

  onSpawn() {
    this.path = null; this.goal = null; this.goalKind = null; this.target = null;
    this.nextSense = performance.now() + Math.random() * 300; this.nextGoal = performance.now() + Math.random() * 600; this.strafe = Math.random() < 0.5 ? -1 : 1; this.nextStrafe = 0;
    this.lastCheckPos = null; this.lastCheckT = 0; this.stuck = 0;
    this.burstUntil = 0; this.pauseUntil = 0; this.errMag = this.d.err; this.errVec = [0, 0];
    this.alert = null; this.crouch = false; this.holdUntil = 0; this.lookAround = 0; this.thrownAt = 0;
    this.yaw = this.p.yaw; this.pitch = 0; this.jump = false; this.wantSlide = 0;
  }
  onDamaged(attacker) { this.alert = { id: attacker.id, t: performance.now() }; }
  onKill() { this.holdUntil = performance.now() + rnd(200, 700); }
  onDeath() { this.target = null; }

  eye() {
    const p = this.p;
    return { x: p.pos.x, y: p.pos.y + stanceHeight(p.stance) - PLAYER.eyeFromTop, z: p.pos.z };
  }

  visible(e, from) {
    const h = stanceHeight(e.stance);
    const pts = [{ x: e.pos.x, y: e.pos.y + h - 0.15, z: e.pos.z }, { x: e.pos.x, y: e.pos.y + h * 0.6, z: e.pos.z }];
    for (const pt of pts) {
      const dx = pt.x - from.x, dy = pt.y - from.y, dz = pt.z - from.z;
      const len = Math.hypot(dx, dy, dz);
      const hit = raycastWorld(this.room.world, from, { x: dx / len, y: dy / len, z: dz / len }, len);
      if (!hit && !smokeBlocks(this.room.world.smokes, from, pt)) return pt;
    }
    return null;
  }

  sense(t) {
    const p = this.p, room = this.room;
    const eye = this.eye();
    const st = p.stats.primary;
    const range = this.d.vision + (st && st.cls === 'sniper' ? 35 : 0);
    const lx = -Math.sin(this.yaw), lz = -Math.cos(this.yaw);
    let best = null, bestScore = 1e9;
    if (t < p.blindUntil) { if (this.target) this.target.visible = false; return; }
    for (const e of room.players.values()) {
      if (!e.alive || e.team === p.team) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const alerted = this.alert && this.alert.id === e.id && t - this.alert.t < 2500;
      const dot = (dx * lx + dz * lz) / (dist || 1);
      // Gegner, die schießen und nicht schallgedämpft sind, werden eher bemerkt
      if (dot < this.d.fov && dist > 7 && !alerted && !(this.target && this.target.id === e.id)) continue;
      const pt = this.visible(e, eye);
      if (!pt) continue;
      let score = dist;
      if (this.target && this.target.id === e.id) score -= 8;
      if (alerted) score -= 10;
      if (score < bestScore) { bestScore = score; best = { e, pt, dist }; }
    }
    if (best) {
      if (!this.target || this.target.id !== best.e.id) {
        this.target = { id: best.e.id, firstSeen: t, head: Math.random() < this.d.head };
        this.errMag = this.d.err * (1 + best.dist / 25);
        const a = Math.random() * Math.PI * 2;
        this.errVec = [Math.cos(a), Math.sin(a)];
        this.burstUntil = 0; this.pauseUntil = t + rnd(0, 150);
        // gelegentlich Granate
        if (best.dist > 9 && best.dist < 26 && p.lethal > 0 && Math.random() < this.d.nade && t - this.thrownAt > 8000) this.throwAt(best.e.pos, t);
      }
      this.target.visible = true;
      this.target.lastSeen = t;
      this.target.pos = { x: best.e.pos.x, y: best.e.pos.y, z: best.e.pos.z };
      this.target.dist = best.dist;
    } else if (this.target) {
      this.target.visible = false;
      if (t - this.target.lastSeen > 3500) {
        // letzte bekannte Position untersuchen
        const lp = this.target.pos;
        this.target = null;
        if (lp) this.setGoal(lp.x, lp.z, 'hunt');
      }
    } else if (this.alert && t - this.alert.t < 1500) {
      const a = room.players.get(this.alert.id);
      if (a) this.desiredLook = Math.atan2(-(a.pos.x - p.pos.x), -(a.pos.z - p.pos.z));
    }
  }

  throwAt(pos, t) {
    const p = this.p;
    const eye = this.eye();
    const dx = pos.x - eye.x, dz = pos.z - eye.z, dy = pos.y - eye.y;
    const dist = Math.hypot(dx, dz);
    const th = 0.6;
    const denom = 2 * Math.cos(th) ** 2 * (dist * Math.tan(th) - dy);
    if (denom <= 0) return;
    let v = Math.sqrt(MOVE.gravity * dist * dist / denom);
    v = Math.max(6, Math.min(22, v)) * rnd(0.9, 1.08);
    const vx = dx / dist * Math.cos(th) * v, vz = dz / dist * Math.cos(th) * v, vy = Math.sin(th) * v;
    p.lethal--;
    this.thrownAt = t;
    this.room.throwGrenade(p, p.cls.lethal, eye, { x: vx, y: vy, z: vz });
  }

  setGoal(x, z, kind) {
    this.goal = { x, z };
    this.goalKind = kind;
    this.path = [];
    this.pendingPath = true;
    this.computePath();
  }

  // Wegberechnung mit Budget pro Tick, damit nicht alle Bots gleichzeitig rechnen
  computePath() {
    if (!this.pendingPath || !this.goal) return;
    if (this.room.pathBudget <= 0) return;
    this.room.pathBudget--;
    this.pendingPath = false;
    this.path = this.room.nav.findPath(this.p.pos.x, this.p.pos.z, this.goal.x, this.goal.z) || [];
  }

  chooseGoal(t) {
    const room = this.room, p = this.p, map = room.map;
    this.nextGoal = t + rnd(6000, 11000);
    if (room.mode === 'dom' && room.flags) {
      const notMine = room.flags.filter(f => f.owner !== p.team);
      let f;
      if (notMine.length && Math.random() < 0.8) {
        notMine.sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z));
        f = Math.random() < 0.7 ? notMine[0] : pick(notMine);
      } else f = pick(room.flags);
      return this.setGoal(f.x + rnd(-1.8, 1.8), f.z + rnd(-1.8, 1.8), 'flag');
    }
    if (room.mode === 'snd' && room.snd) {
      const s = room.snd, b = s.bomb;
      if (!s.targetSite || s.targetRound !== s.round) { s.targetSite = pick(map.snd).id; s.targetRound = s.round; }
      const site = map.snd.find(x => x.id === s.targetSite);
      if (p.team === s.attackTeam) {
        if (b.carrier === p.id) return this.setGoal(site.x, site.z, 'plant');
        if (b.dropped) return this.setGoal(b.dropped.x, b.dropped.z, 'bomb');
        if (b.planted && b.pos) return this.setGoal(b.pos.x + rnd(-5, 5), b.pos.z + rnd(-5, 5), 'guard');
        return this.setGoal(site.x + rnd(-6, 6), site.z + rnd(-6, 6), 'push');
      } else {
        if (b.planted && b.pos) return this.setGoal(b.pos.x, b.pos.z, 'defuse');
        const mySite = map.snd[p.id % map.snd.length];
        return this.setGoal(mySite.x + rnd(-5, 5), mySite.z + rnd(-5, 5), 'hold');
      }
    }
    // TDM: Gegner jagen oder interessante Punkte abklappern
    const enemies = [...room.players.values()].filter(e => e.alive && e.team !== p.team);
    if (enemies.length && Math.random() < 0.45) {
      const e = pick(enemies);
      return this.setGoal(e.pos.x + rnd(-8, 8), e.pos.z + rnd(-8, 8), 'hunt');
    }
    const pois = map.dom.concat(map.snd);
    const poi = pick(pois);
    return this.setGoal(poi.x + rnd(-6, 6), poi.z + rnd(-6, 6), 'roam');
  }

  update(dt, t) {
    const p = this.p, room = this.room;
    const inp = { f: 0, b: 0, l: 0, r: 0, jump: false, crouch: false, sprint: false, tac: false, ads: false, yaw: this.yaw,
      moveMult: p.stats.primary ? p.stats[p.slot].move : 1, adsMove: p.stats[p.slot] ? p.stats[p.slot].adsMove : 0.6,
      marathon: p.perks.includes('marathon') };
    p.interact = false;

    if (room.phase === 'pre' || room.phase === 'post' || room.phase === 'roundEnd') {
      this.applyMove(inp, dt);
      return;
    }
    if (t >= this.nextSense) { this.nextSense = t + rnd(160, 240); this.sense(t); }
    if (this.pendingPath) this.computePath();
    const st = p.stats[p.slot];
    const am = p.ammo[p.slot];

    // Waffe wechseln wenn leer
    if (am.mag === 0 && am.res === 0 && p.slot === 'primary' && p.ammo.secondary.mag + p.ammo.secondary.res > 0) {
      p.slot = 'secondary'; p.swapEnd = t + p.stats.secondary.equip * 1000; p.reloadEnd = 0;
    }
    // Nachladen
    if (!p.reloadEnd && am.res > 0 && (am.mag === 0 || (!this.target && am.mag < st.mag * 0.4))) {
      p.reloadEnd = t + st.reload * 1000; p.reloadSlot = p.slot;
    }

    const tgt = this.target && this.target.visible ? room.players.get(this.target.id) : null;
    let moveDir = null;
    let wantSprint = false;

    if (tgt && tgt.alive) {
      // ---------- Kampf ----------
      const eye = this.eye();
      const h = stanceHeight(tgt.stance);
      const aim = { x: tgt.pos.x, y: tgt.pos.y + (this.target.head ? h - 0.17 : h * 0.62), z: tgt.pos.z };
      const dist = Math.hypot(aim.x - eye.x, aim.z - eye.z);
      this.errMag = Math.max(this.d.err * 0.12, this.errMag * Math.pow(this.d.errDecay, dt));
      const off = this.errMag * dist;
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      aim.x += rx * this.errVec[0] * off; aim.z += rz * this.errVec[0] * off; aim.y += this.errVec[1] * off;
      const dyaw = Math.atan2(-(aim.x - eye.x), -(aim.z - eye.z));
      const dpitch = Math.atan2(aim.y - eye.y, Math.hypot(aim.x - eye.x, aim.z - eye.z));
      const turn = this.d.turn * dt;
      const ey = angDiff(this.yaw, dyaw);
      this.yaw += Math.max(-turn, Math.min(turn, ey));
      this.pitch += Math.max(-turn, Math.min(turn, dpitch - this.pitch));
      const err = Math.abs(angDiff(this.yaw, dyaw)) + Math.abs(dpitch - this.pitch);

      const cls = st.cls;
      const ideal = cls === 'sniper' ? 35 : cls === 'shotgun' ? 6 : cls === 'smg' ? 11 : cls === 'lmg' ? 22 : 18;
      inp.ads = dist > 8 && cls !== 'shotgun';
      // Bewegung: auf Idealdistanz gehen + seitlich ausweichen
      if (t >= this.nextStrafe) { this.nextStrafe = t + rnd(450, 1300); this.strafe = Math.random() < 0.5 ? -1 : 1; this.crouch = Math.random() < 0.25 && dist > 10; }
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      let mx = rx * this.strafe, mz = rz * this.strafe;
      if (dist > ideal * 1.3) { mx += fx * 1.2; mz += fz * 1.2; }
      else if (dist < ideal * 0.5 && cls !== 'shotgun') { mx -= fx * 0.6; mz -= fz * 0.6; }
      if (cls === 'sniper' && dist > 15) { mx = 0; mz = 0; this.crouch = true; }
      moveDir = [mx, mz];
      inp.crouch = this.crouch;

      // Nahkampf
      if (dist < 1.9) room.melee(p);

      // Schießen
      const ready = t - this.target.firstSeen > this.d.react * 1000 && !p.reloadEnd && t >= p.swapEnd && am.mag > 0;
      if (ready && err < Math.max(0.05, 0.9 / Math.max(1, dist))) {
        let shoot = false;
        if (st.auto) {
          if (t < this.burstUntil) shoot = true;
          else if (t >= this.pauseUntil) {
            this.burstUntil = t + rnd(...this.d.burst) * 1000 * (dist < 12 ? 1.6 : 1);
            this.pauseUntil = this.burstUntil + rnd(...this.d.pause) * 1000 * (dist > 25 ? 1.5 : 1);
            shoot = true;
          }
        } else shoot = t - p.lastShot > st.fireInterval * 1000 * rnd(1.05, 1.6);
        if (shoot && t - p.lastShot >= st.fireInterval * 1000) {
          const base = this.dir(this.yaw, this.pitch);
          let spread = inp.ads ? st.adsSpread : st.hipSpread;
          const hs = Math.hypot(p.vel.x, p.vel.z);
          if (hs > 1) spread += st.moveSpread * (inp.ads ? 0.3 : 1);
          const dirs = [];
          for (let i = 0; i < st.pellets; i++) dirs.push(this.spreadDir(base, spread + (st.pellets > 1 ? st.pelletSpread : 0)));
          room.fire(p, eye, dirs, 0);
        }
      }
    } else {
      // ---------- Navigation ----------
      if (this.target && !this.target.visible && this.target.pos) {
        // zur letzten Position schauen
        const lp = this.target.pos;
        this.desiredLook = Math.atan2(-(lp.x - p.pos.x), -(lp.z - p.pos.z));
      }
      const s = room.snd;
      if (s && s.bomb) {
        // Modus-Reaktionen
        const b = s.bomb;
        if (p.team === s.attackTeam && b.carrier === p.id && this.goalKind !== 'plant') this.nextGoal = 0;
        if (p.team !== s.attackTeam && b.planted && this.goalKind !== 'defuse') this.nextGoal = 0;
        if (p.team === s.attackTeam && b.dropped && this.goalKind !== 'bomb' && Math.random() < 0.02) this.nextGoal = 0;
      }
      if (t >= this.nextGoal || !this.path) this.chooseGoal(t);
      const path = this.path;
      while (path && path.length && Math.hypot(path[0].x - p.pos.x, path[0].z - p.pos.z) < 0.8) path.shift();
      if (this.pendingPath) {
        // wartet auf Wegberechnung (Budget)
      } else if (path && path.length) {
        const w = path[0];
        moveDir = [w.x - p.pos.x, w.z - p.pos.z];
        const remaining = path.length;
        wantSprint = remaining > 1 || Math.hypot(moveDir[0], moveDir[1]) > 6;
        const wantYaw = this.desiredLook !== undefined && this.target ? this.desiredLook : Math.atan2(-moveDir[0], -moveDir[1]);
        const turn = this.d.turn * 0.8 * dt;
        this.yaw += Math.max(-turn, Math.min(turn, angDiff(this.yaw, wantYaw)));
        this.pitch *= 0.9;
        if (wantSprint && Math.random() < 0.004) this.wantSlide = t + 120;
      } else {
        // Ziel erreicht
        const k = this.goalKind;
        if (k === 'plant' || k === 'defuse') {
          p.interact = true;
          inp.crouch = true;
          this.nextGoal = t + 1500;
        } else if (k === 'hold' || k === 'guard' || k === 'flag') {
          if (t >= this.lookAround) { this.lookAround = t + rnd(900, 2500); this.desiredLook = this.yaw + rnd(-2.2, 2.2); }
          const turn = this.d.turn * 0.4 * dt;
          if (this.desiredLook !== undefined) this.yaw += Math.max(-turn, Math.min(turn, angDiff(this.yaw, this.desiredLook)));
          if (k === 'flag' && Math.random() < 0.01) { const f = room.flags && room.flags.find(fl => Math.hypot(fl.x - p.pos.x, fl.z - p.pos.z) < 5); if (f) this.setGoal(f.x + rnd(-2, 2), f.z + rnd(-2, 2), 'flag'); }
          if (k !== 'flag' && t >= this.nextGoal) this.chooseGoal(t);
        } else if (t > this.holdUntil) this.chooseGoal(t);
      }
    }

    // Bewegung in Tasten übersetzen
    if (moveDir) {
      const l = Math.hypot(moveDir[0], moveDir[1]);
      if (l > 0.05) {
        const mx = moveDir[0] / l, mz = moveDir[1] / l;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        const df = mx * fx + mz * fz, dr = mx * rx + mz * rz;
        inp.f = df > 0.35 ? 1 : 0; inp.b = df < -0.35 ? 1 : 0;
        inp.r = dr > 0.35 ? 1 : 0; inp.l = dr < -0.35 ? 1 : 0;
        inp.sprint = wantSprint && inp.f && !inp.l && !inp.r;
        if (inp.sprint && Math.random() < 0.002) inp.tac = true;
      }
    }
    if (this.wantSlide && t < this.wantSlide) inp.crouch = true;

    // Festhängen erkennen
    if (t - this.lastCheckT > 900) {
      const moved = this.lastCheckPos ? Math.hypot(p.pos.x - this.lastCheckPos.x, p.pos.z - this.lastCheckPos.z) : 9;
      const wanted = inp.f || inp.b || inp.l || inp.r;
      if (wanted && moved < 0.35) {
        this.stuck++;
        this.jump = true;
        if (this.stuck >= 2) {
          const c = room.nav.randomWalkable(c2 => Math.hypot(c2.x - p.pos.x, c2.z - p.pos.z) < 8);
          this.setGoal(c.x, c.z, 'unstuck');
          this.nextGoal = t + 2500;
          this.stuck = 0;
        }
      } else this.stuck = 0;
      this.lastCheckPos = { x: p.pos.x, z: p.pos.z };
      this.lastCheckT = t;
    }
    if (this.jump) { inp.jump = true; this.jump = false; }
    else if (moveDir && Math.random() < 0.002) inp.jump = true;

    inp.yaw = this.yaw;
    this.applyMove(inp, dt);
  }

  applyMove(inp, dt) {
    const p = this.p;
    if (!p.ms) return;
    // Teilschritte, damit schnelle Bots nicht durch dünne Wände rutschen
    const n = Math.max(1, Math.ceil(dt / (1 / 45)));
    const tac = inp.tac;
    for (let i = 0; i < n; i++) { stepMove(this.room.world, p.ms, inp, dt / n); inp.tac = false; inp.jump = inp.jump && i === 0 ? inp.jump : false; }
    inp.tac = tac;
    p.pos.x = p.ms.pos.x; p.pos.y = p.ms.pos.y; p.pos.z = p.ms.pos.z;
    p.vel = { ...p.ms.vel };
    p.stance = p.ms.stance;
    p.yaw = this.yaw; p.pitch = this.pitch;
    p.ads = inp.ads; p.sprint = p.ms.sprinting; p.tac = p.ms.tac;
  }

  dir(yaw, pitch) {
    return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
  }

  spreadDir(d, deg) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * deg * Math.PI / 180;
    // orthonormale Basis
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(d.y) > 0.95) { ux = 1; uy = 0; }
    let rx = uy * d.z - uz * d.y, ry = uz * d.x - ux * d.z, rz = ux * d.y - uy * d.x;
    const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
    const vx = d.y * rz - d.z * ry, vy = d.z * rx - d.x * rz, vz = d.x * ry - d.y * rx;
    const c = Math.cos(a) * Math.tan(r), s = Math.sin(a) * Math.tan(r);
    const ox = d.x + rx * c + vx * s, oy = d.y + ry * c + vy * s, oz = d.z + rz * c + vz * s;
    const l = Math.hypot(ox, oy, oz);
    return { x: ox / l, y: oy / l, z: oz / l };
  }
}
