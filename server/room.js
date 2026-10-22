// Ein Match-Raum: Spieler, Bots, Modi (TDM / Herrschaft / S&D), Kampf, Granaten
import { MAPS, MAP_LIST } from '../shared/maps.js';
import {
  createWorld, newMoveState, stepMove, raycastWorld, rayPlayer, lineOfSight, smokeBlocks, stanceHeight, stepProjectile,
} from '../shared/physics.js';
import { MODES, TEAMS, TEAM_SIZE, PLAYER, STANCE, XP, INTERP_DELAY, MAX_REWIND, SNAPSHOT_RATE } from '../shared/constants.js';
import { WEAPONS, EQUIPMENT, computeStats, damageAt } from '../shared/weapons.js';
import { validateClass, levelInfo, weaponLevelInfo, unlocksAt, attachmentUnlocksAt } from '../shared/progression.js';
import { buildNav } from './nav.js';
import { BASE_CAMOS, CAMO_NAMES, CAMO_XP, LONGSHOT, emptyStats, mergeStats, unlockKeys, camoKind } from '../shared/camos.js';
import { BotBrain, makeBotClass, botName } from './bots.js';
import { saveUser } from './db.js';

const now = () => performance.now();
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const navCache = {};

let nextPlayerId = 1;
let nextRoomId = 1;

export class Room {
  constructor(lobby, opts) {
    this.lobby = lobby;
    this.id = 'r' + (nextRoomId++);
    this.code = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.name = opts.name || `${MODES[opts.mode].name} #${this.id.slice(1)}`;
    this.mode = MODES[opts.mode] ? opts.mode : 'tdm';
    this.M = MODES[this.mode];
    this.isPrivate = !!opts.private;
    this.botsEnabled = opts.bots !== false;
    this.difficulty = ['easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'normal';
    this.rotation = opts.map && MAPS[opts.map] ? [opts.map, ...MAP_LIST.filter(m => m !== opts.map)] : MAP_LIST.slice().sort(() => Math.random() - 0.5);
    this.mapIdx = 0;
    this.players = new Map();
    this.grenades = [];
    this.nextGid = 1;
    this.sideSwap = false;
    this.emptySince = now();
    this.lastSnap = 0;
    this.lastRoster = 0;
    this.destroyed = false;
    this.loadMap();
    this.startMatch();
  }

  // ------------------------------------------------------------------ Infrastruktur
  loadMap() {
    this.mapId = this.rotation[this.mapIdx % this.rotation.length];
    this.map = MAPS[this.mapId];
    this.world = createWorld(this.map);
    if (!navCache[this.mapId]) navCache[this.mapId] = buildNav(this.map, createWorld(this.map));
    this.nav = navCache[this.mapId];
  }

  info() {
    let humans = 0, bots = 0;
    for (const p of this.players.values()) p.bot ? bots++ : humans++;
    return { id: this.id, name: this.name, mode: this.mode, map: this.mapId, humans, bots, max: TEAM_SIZE * 2,
      phase: this.phase, private: this.isPrivate, code: this.code, difficulty: this.difficulty, botsEnabled: this.botsEnabled };
  }

  humans() { return [...this.players.values()].filter(p => !p.bot); }

  send(p, obj) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(obj));
  }
  broadcast(obj, exceptId) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.ws && p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
  }
  event(text, extra = {}) { this.broadcast({ t: 'ev', text, ...extra }); }

  sideOfTeam(team) {
    if (this.mode === 'snd') return team === this.snd.attackTeam ? 0 : 1;
    return this.sideSwap ? 1 - team : team;
  }

  // ------------------------------------------------------------------ Spieler
  createPlayer({ name, user, ws, bot }) {
    const p = {
      id: nextPlayerId++, name, user: user || null, ws: ws || null, bot: null,
      team: 0, alive: false, hp: 100, lastDmgT: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      yaw: 0, pitch: 0, stance: STANCE.stand, ads: false, sprint: false, tac: false,
      hist: [], classIndex: 0, cls: null, stats: {}, slot: 'primary', ammo: {},
      reloadEnd: 0, swapEnd: 0, lastShot: 0, lastMelee: 0, lethal: 0, tactical: 0,
      kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, caps: 0, plants: 0, defuses: 0, headshots: 0,
      xpMatch: 0, xpLog: {}, weaponXpMatch: {}, wsMatch: {}, lastKillT: 0, statsMatch: { kills: 0, deaths: 0, assists: 0, headshots: 0, bestStreak: 0 },
      respawnAt: 0, spawnProtUntil: 0, dmgFrom: new Map(), ping: 0, lastStateT: 0, moveBudget: 3, spawnSeq: 0,
      interact: false, joinedAt: now(), blindUntil: 0, perks: [], level: user ? levelInfo(user.data.xp).level : 1,
      ms: null,
    };
    if (bot) {
      p.bot = new BotBrain(this, p, this.difficulty);
      p.botClass = makeBotClass(this.difficulty);
      p.level = { easy: 5, normal: 18, hard: 35 }[this.difficulty] + Math.floor(Math.random() * 10);
    }
    return p;
  }

  teamCounts() {
    const c = [{ h: 0, b: 0 }, { h: 0, b: 0 }];
    for (const p of this.players.values()) p.bot ? c[p.team].b++ : c[p.team].h++;
    return c;
  }

  addHuman(user, ws) {
    const c = this.teamCounts();
    const team = c[0].h < c[1].h ? 0 : c[1].h < c[0].h ? 1 : (c[0].h + c[0].b <= c[1].h + c[1].b ? 0 : 1);
    const p = this.createPlayer({ name: user.username, user, ws });
    p.team = team;
    p.classIndex = 0;
    this.players.set(p.id, p);
    this.emptySince = 0;
    this.balanceBots();
    this.send(p, { t: 'joined', you: p.id, room: this.info(), match: this.matchInfo() });
    this.sendRoster();
    this.event(`${p.name} ist beigetreten`, { kind: 'info' });
    // Sofort spawnen falls möglich
    if (this.phase === 'pre' || this.phase === 'live') {
      if (this.mode === 'snd' && this.phase === 'live') { p.alive = false; this.send(p, { t: 'died', by: 0, w: '', respawn: -1, spectate: true }); }
      else this.spawn(p);
    }
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (!p.bot) this.commitProgress(p, 0, false);
    if (this.snd && this.snd.carrier === id) this.dropBomb(p);
    this.players.delete(id);
    this.broadcast({ t: 'left', id });
    if (!p.bot) this.event(`${p.name} hat das Spiel verlassen`, { kind: 'info' });
    this.balanceBots();
    this.sendRoster();
    if (this.humans().length === 0) this.emptySince = now();
  }

  balanceBots() {
    if (!this.botsEnabled) {
      for (const p of [...this.players.values()]) if (p.bot) this.players.delete(p.id);
      return;
    }
    for (let t = 0; t < 2; t++) {
      let list = [...this.players.values()].filter(p => p.team === t);
      while (list.length > TEAM_SIZE) {
        const b = list.filter(p => p.bot).sort((a, c) => (a.alive ? 1 : 0) - (c.alive ? 1 : 0))[0];
        if (!b) break;
        if (this.snd && this.snd.carrier === b.id) this.dropBomb(b);
        this.players.delete(b.id);
        this.broadcast({ t: 'left', id: b.id });
        list = list.filter(p => p !== b);
      }
      while (list.length < TEAM_SIZE) {
        const used = new Set([...this.players.values()].map(p => p.name));
        const b = this.createPlayer({ name: botName(used), bot: true });
        b.team = t;
        this.players.set(b.id, b);
        list.push(b);
        if (this.phase === 'pre' || (this.phase === 'live' && this.mode !== 'snd')) this.spawn(b);
      }
    }
  }

  // ------------------------------------------------------------------ Match-Ablauf
  matchInfo() {
    return {
      map: this.mapId, mode: this.mode, phase: this.phase, phaseEnd: this.phaseEnd ? (this.phaseEnd - now()) / 1000 : 0,
      sides: [this.sideOfTeam(0), this.sideOfTeam(1)], score: this.score,
    };
  }

  startMatch() {
    this.score = [0, 0];
    this.grenades = [];
    this.world.smokes = [];
    this.matchStart = now();
    this.uav = [0, 0];
    this.timeEnd = now() + (this.M.timeLimit || 0) * 1000 + 6000;
    this.firstBlood = false;
    for (const p of this.players.values()) {
      Object.assign(p, { kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, caps: 0, plants: 0, defuses: 0, headshots: 0, alive: false });
      p.xpMatch = 0; p.xpLog = {}; p.weaponXpMatch = {}; p.wsMatch = {};
      p.statsMatch = { kills: 0, deaths: 0, assists: 0, headshots: 0, bestStreak: 0 };
    }
    if (this.mode === 'dom') this.flags = this.map.dom.map(f => ({ ...f, owner: -1, capTeam: -1, prog: 0 }));
    else this.flags = null;
    if (this.mode === 'snd') {
      this.snd = { attackTeam: this.sideSwap ? 1 : 0, round: 0, roundsPlayed: 0, swapped: false };
      this.broadcast({ t: 'match', ...this.matchInfo() });
      this.sndStartRound();
      return;
    }
    this.snd = null;
    this.phase = 'pre';
    this.phaseEnd = now() + 6000;
    this.broadcast({ t: 'match', ...this.matchInfo() });
    for (const p of this.players.values()) this.spawn(p);
    this.sendRoster();
  }

  endMatch(winner) {
    this.phase = 'post';
    this.phaseEnd = now() + 15000;
    const players = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, bot: !!p.bot, k: p.kills, d: p.deaths, a: p.assists, sc: p.score,
    })).sort((a, b) => b.sc - a.sc);
    const mvp = players[0];
    for (const p of this.players.values()) {
      if (p.bot) continue;
      const won = winner === p.team;
      const played = (now() - p.joinedAt) > 45000 || p.kills + p.deaths > 3;
      const bonus = played ? (winner === -1 ? XP.loss + 100 : won ? XP.win : XP.loss) : 0;
      if (bonus) p.xpLog[won ? 'Sieg' : winner === -1 ? 'Unentschieden' : 'Teilnahme'] = bonus;
      const log = { ...p.xpLog };
      const matchXp = p.xpMatch + bonus;
      const summary = this.commitProgress(p, bonus, played ? (won ? 'win' : 'loss') : false);
      this.send(p, { t: 'end', winner, score: this.score, players, mvp: mvp && mvp.id, xpLog: log, xp: matchXp, summary });
    }
    this.event(winner === -1 ? 'Unentschieden!' : `${TEAMS[winner].name} gewinnt das Match!`, { kind: 'matchend' });
  }

  nextMatch() {
    this.mapIdx++;
    this.sideSwap = !this.sideSwap;
    this.loadMap();
    // Menschen gleichmäßig auf beide Teams verteilen
    const c = [0, 0];
    for (const p of this.humans()) c[p.team]++;
    for (const p of this.humans().sort(() => Math.random() - 0.5)) {
      if (Math.abs(c[0] - c[1]) <= 1) break;
      const big = c[0] > c[1] ? 0 : 1;
      if (p.team === big) { p.team = 1 - big; c[big]--; c[1 - big]++; }
    }
    this.balanceBots();
    this.startMatch();
  }

  // ------------------------------------------------------------------ S&D
  sndStartRound() {
    const s = this.snd;
    s.round++;
    s.bomb = { carrier: 0, dropped: null, planted: false, site: null, explodeAt: 0, plantProg: 0, defuseProg: 0, planter: 0, defuser: 0, pos: null };
    s.roundEnd = 0;
    this.grenades = [];
    this.world.smokes = [];
    this.phase = 'pre';
    this.phaseEnd = now() + 5000;
    for (const p of this.players.values()) this.spawn(p);
    const atk = [...this.players.values()].filter(p => p.team === s.attackTeam && p.alive);
    const humansAtk = atk.filter(p => !p.bot);
    const pool = humansAtk.length && Math.random() < 0.6 ? humansAtk : atk;
    const carrier = pool[Math.floor(Math.random() * pool.length)];
    if (carrier) s.bomb.carrier = carrier.id;
    this.broadcast({ t: 'match', ...this.matchInfo() });
    this.event(`Runde ${s.round} – ${TEAMS[s.attackTeam].name} greift an`, { kind: 'round' });
    this.sendRoster();
  }

  sndEndRound(winner, reason) {
    const s = this.snd;
    if (this.phase !== 'live') return;
    this.phase = 'roundEnd';
    this.phaseEnd = now() + 5500;
    this.score[winner]++;
    s.roundsPlayed++;
    for (const p of this.players.values()) if (p.team === winner) this.giveXp(p, XP.roundWin, 'Runde gewonnen');
    this.event(`${TEAMS[winner].name} gewinnt die Runde – ${reason}`, { kind: 'roundend', team: winner });
  }

  dropBomb(p) {
    const b = this.snd && this.snd.bomb;
    if (!b || b.carrier !== p.id) return;
    b.carrier = 0;
    b.dropped = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    this.event('Bombe fallen gelassen', { kind: 'bombdrop', team: this.snd.attackTeam });
  }

  sndTick(dt, t) {
    const s = this.snd, b = s.bomb;
    if (!b.planted && !b.carrier && !b.dropped && (this.phase === 'pre' || this.phase === 'live')) {
      const atk = [...this.players.values()].filter(p => p.team === s.attackTeam && p.alive);
      if (atk.length) b.carrier = atk[Math.floor(Math.random() * atk.length)].id;
    }
    if (this.phase !== 'live') return;
    const atk = s.attackTeam, def = 1 - atk;
    const alive = [0, 0], total = [0, 0];
    for (const p of this.players.values()) { total[p.team]++; if (p.alive) alive[p.team]++; }
    // Bombe aufheben
    if (!b.planted && !b.carrier && b.dropped) {
      for (const p of this.players.values()) {
        if (p.alive && p.team === atk && Math.hypot(p.pos.x - b.dropped.x, p.pos.z - b.dropped.z) < 1.4) {
          b.carrier = p.id; b.dropped = null;
          this.event(`${p.name} hat die Bombe`, { kind: 'bombpick', team: atk });
          break;
        }
      }
    }
    // Legen
    if (!b.planted) {
      const c = this.players.get(b.carrier);
      let site = null;
      if (c && c.alive && c.interact && c.stance !== STANCE.slide) site = this.map.snd.find(st => Math.hypot(c.pos.x - st.x, c.pos.z - st.z) < 2.6);
      if (site) {
        if (b.planter !== c.id) { b.planter = c.id; b.plantProg = 0; }
        b.plantProg += dt;
        if (b.plantProg >= this.M.plantTime) {
          b.planted = true; b.site = site.id; b.pos = { x: c.pos.x, y: c.pos.y, z: c.pos.z };
          b.explodeAt = t + this.M.bombTime * 1000; b.carrier = 0; b.plantProg = 0; b.planter = 0;
          c.plants++; c.score += 250; this.giveXp(c, XP.plant, 'Bombe gelegt');
          this.event(`Bombe an ${site.id} gelegt!`, { kind: 'planted', site: site.id });
        }
      } else { b.planter = 0; b.plantProg = 0; }
    } else {
      // Entschärfen
      let d = null;
      for (const p of this.players.values()) {
        if (p.alive && p.team === def && p.interact && Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < 2.3 && Math.abs(p.pos.y - b.pos.y) < 2) { d = p; break; }
      }
      if (d) {
        if (b.defuser !== d.id) { b.defuser = d.id; b.defuseProg = 0; }
        b.defuseProg += dt;
        if (b.defuseProg >= this.M.defuseTime) {
          d.defuses++; d.score += 250; this.giveXp(d, XP.defuse, 'Bombe entschärft');
          this.event('Bombe entschärft!', { kind: 'defused' });
          b.defused = true;
          return this.sndEndRound(def, 'Bombe entschärft');
        }
      } else { b.defuser = 0; b.defuseProg = 0; }
      if (t >= b.explodeAt) {
        this.broadcast({ t: 'boom', k: 'bomb', x: b.pos.x, y: b.pos.y + 0.3, z: b.pos.z });
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          const dd = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
          if (dd < 12) this.damage(p, 300 * (1 - dd / 14), null, { weapon: 'bomb', explosive: true });
        }
        return this.sndEndRound(atk, 'Ziel zerstört');
      }
    }
    // Eliminierung
    if (total[def] > 0 && alive[def] === 0) return this.sndEndRound(atk, 'Verteidiger eliminiert');
    if (total[atk] > 0 && alive[atk] === 0 && !b.planted) return this.sndEndRound(def, 'Angreifer eliminiert');
    if (!b.planted && t >= s.roundEnd) return this.sndEndRound(def, 'Zeit abgelaufen');
  }

  // ------------------------------------------------------------------ Herrschaft
  domTick(dt) {
    if (this.phase !== 'live') return;
    for (const f of this.flags) {
      const n = [0, 0];
      const inZone = [[], []];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < 3.6 && p.pos.y < 3) { n[p.team]++; inZone[p.team].push(p); }
      }
      if (n[0] && n[1]) { f.contested = true; continue; }
      f.contested = false;
      const T = n[0] ? 0 : n[1] ? 1 : -1;
      if (T === -1) { if (f.owner === -1 || f.capTeam !== -1) { f.prog = Math.max(0, f.prog - dt * 0.12); if (f.prog === 0) f.capTeam = -1; } continue; }
      if (f.owner === T) { f.prog = 0; f.capTeam = -1; continue; }
      const rate = (f.owner === -1 ? 1 / 5.5 : 1 / 8) * (1 + 0.35 * (n[T] - 1));
      if (f.capTeam !== T && f.capTeam !== -1) {
        f.prog -= rate * dt;
        if (f.prog <= 0) { f.prog = 0; f.capTeam = T; }
      } else {
        f.capTeam = T;
        f.prog += rate * dt;
        if (f.prog >= 1) {
          f.owner = T; f.prog = 0; f.capTeam = -1;
          for (const p of inZone[T]) { p.caps++; p.score += 150; this.giveXp(p, XP.capture, `Flagge ${f.id} erobert`); }
          this.event(`${TEAMS[T].name} hat Flagge ${f.id} erobert`, { kind: 'capture', team: T, flag: f.id });
        }
      }
    }
    // Punkte jede Sekunde
    this.domAcc = (this.domAcc || 0) + dt;
    while (this.domAcc >= 1) {
      this.domAcc -= 1;
      for (const f of this.flags) if (f.owner >= 0) this.score[f.owner]++;
    }
    if (this.score[0] >= this.M.scoreLimit || this.score[1] >= this.M.scoreLimit) {
      this.score[0] = Math.min(this.score[0], this.M.scoreLimit); this.score[1] = Math.min(this.score[1], this.M.scoreLimit);
      this.endMatch(this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1);
    }
  }

  // ------------------------------------------------------------------ Spawnen
  pickSpawn(p) {
    const side = this.sideOfTeam(p.team);
    const list = this.map.spawns[side];
    const enemies = [...this.players.values()].filter(e => e.alive && e.team !== p.team);
    const mates = [...this.players.values()].filter(e => e.alive && e.team === p.team && e !== p);
    let best = list[0], bestScore = -1e9;
    for (const sp of list) {
      let minD = 999;
      let seen = false;
      for (const e of enemies) {
        const d = Math.hypot(e.pos.x - sp.x, e.pos.z - sp.z);
        minD = Math.min(minD, d);
        if (d < 50 && !seen) seen = lineOfSight(this.world, { x: e.pos.x, y: e.pos.y + 1.6, z: e.pos.z }, { x: sp.x, y: 1.4, z: sp.z });
      }
      let blocked = mates.some(m => Math.hypot(m.pos.x - sp.x, m.pos.z - sp.z) < 1.2);
      const sc = Math.min(minD, 40) - (seen ? 30 : 0) - (blocked ? 50 : 0) + Math.random() * 6;
      if (sc > bestScore) { bestScore = sc; best = sp; }
    }
    return best;
  }

  getClass(p) {
    if (p.bot) return p.botClass;
    const src = p.user.data.classes[p.classIndex] || p.user.data.classes[0];
    return validateClass(src, p.user.data);
  }

  applyLoadout(p) {
    const cls = this.getClass(p);
    p.cls = cls;
    p.perks = cls.perks;
    p.stats = {
      primary: computeStats(cls.primary.id, cls.primary.att, cls.perks),
      secondary: computeStats(cls.secondary.id, cls.secondary.att, cls.perks),
    };
    p.ammo = {
      primary: { mag: p.stats.primary.mag, res: p.stats.primary.reserve },
      secondary: { mag: p.stats.secondary.mag, res: p.stats.secondary.reserve },
    };
    p.lethal = EQUIPMENT[cls.lethal].count;
    p.tactical = EQUIPMENT[cls.tactical].count;
    p.slot = 'primary';
    p.reloadEnd = 0;
  }

  spawn(p, sp) {
    sp = sp || this.pickSpawn(p);
    this.applyLoadout(p);
    p.alive = true;
    p.hp = PLAYER.maxHealth;
    p.pos = { x: sp.x, y: sp.y || 0, z: sp.z };
    p.vel = { x: 0, y: 0, z: 0 };
    p.yaw = sp.yaw; p.pitch = 0; p.stance = STANCE.stand;
    p.ads = false; p.sprint = false; p.interact = false;
    p.dmgFrom.clear();
    p.respawnAt = 0;
    p.spawnProtUntil = now() + 1500;
    p.spawnT = now();
    p.firedSinceSpawn = false;
    p.hist = [];
    p.spawnSeq++;
    p.lastStateT = now();
    p.moveBudget = 3;
    p.blindUntil = 0;
    if (p.bot) { p.ms = newMoveState(p.pos.x, p.pos.y, p.pos.z); p.bot.onSpawn(); }
    this.send(p, {
      t: 'spawn', x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, sq: p.spawnSeq, cls: p.cls,
      ammo: { primary: [p.ammo.primary.mag, p.ammo.primary.res], secondary: [p.ammo.secondary.mag, p.ammo.secondary.res] },
      lethal: p.lethal, tactical: p.tactical, classIndex: p.classIndex,
    });
  }

  // ------------------------------------------------------------------ Nachrichten
  handle(p, m) {
    const t = now();
    switch (m.t) {
      case 'st': {
        if (!p.alive || m.sq !== p.spawnSeq || !Array.isArray(m.p)) return;
        const [x, y, z] = m.p.map(Number);
        if (![x, y, z].every(Number.isFinite)) return;
        const dt = Math.min(0.5, Math.max(0.001, (t - p.lastStateT) / 1000));
        p.lastStateT = t;
        p.moveBudget = Math.min(3.2, p.moveBudget + 14 * dt);
        const d = Math.hypot(x - p.pos.x, z - p.pos.z);
        const frozen = this.phase === 'pre';
        if (d > p.moveBudget || (frozen && d > 0.5)) {
          this.send(p, { t: 'correct', x: p.pos.x, y: p.pos.y, z: p.pos.z, sq: p.spawnSeq });
          return;
        }
        p.moveBudget -= d;
        const B = this.map.bounds;
        p.pos.x = Math.max(B.minX - 1, Math.min(B.maxX + 1, x));
        p.pos.y = Math.max(-20, Math.min(40, y));
        p.pos.z = Math.max(B.minZ - 1, Math.min(B.maxZ + 1, z));
        if (Array.isArray(m.v)) p.vel = { x: +m.v[0] || 0, y: +m.v[1] || 0, z: +m.v[2] || 0 };
        p.yaw = +m.y || 0; p.pitch = Math.max(-1.6, Math.min(1.6, +m.pi || 0));
        p.stance = [0, 1, 2].includes(m.s) ? m.s : 0;
        p.ads = !!m.a; p.sprint = !!m.sp; p.tac = !!m.tac;
        const slot = m.w === 1 ? 'secondary' : 'primary';
        if (slot !== p.slot) { p.slot = slot; p.reloadEnd = 0; p.swapEnd = t + p.stats[slot].equip * 1000 * 0.6; }
        if (p.pos.y < -6) this.kill(p, null, { weapon: 'fall' });
        break;
      }
      case 'shoot': {
        if (!p.alive || this.phase === 'pre' || this.phase === 'post' || this.phase === 'roundEnd') return;
        if (!Array.isArray(m.o) || !Array.isArray(m.d)) return;
        const o = { x: +m.o[0], y: +m.o[1], z: +m.o[2] };
        if (![o.x, o.y, o.z].every(Number.isFinite)) return;
        const eye = this.eye(p);
        const oo = Math.hypot(o.x - eye.x, o.y - eye.y, o.z - eye.z) < 2.5 ? o : eye;
        const dirs = [];
        for (const d of m.d.slice(0, 12)) {
          if (!Array.isArray(d)) continue;
          const v = { x: +d[0], y: +d[1], z: +d[2] };
          const l = Math.hypot(v.x, v.y, v.z);
          if (!(l > 0.5 && l < 1.5)) continue;
          dirs.push({ x: v.x / l, y: v.y / l, z: v.z / l });
        }
        if (!dirs.length) return;
        this.fire(p, oo, dirs, Math.min(MAX_REWIND, p.ping / 2 + INTERP_DELAY));
        break;
      }
      case 'reload': {
        if (!p.alive) return;
        const st = p.stats[p.slot], am = p.ammo[p.slot];
        if (!st || am.mag >= st.mag || am.res <= 0 || p.reloadEnd) return;
        p.reloadEnd = t + st.reload * 1000 - 120;
        p.reloadSlot = p.slot;
        break;
      }
      case 'rcancel': p.reloadEnd = 0; break;
      case 'melee': this.melee(p); break;
      case 'throw': {
        if (!p.alive || this.phase === 'pre' || this.phase === 'post') return;
        const kind = m.k === 'tactical' ? 'tactical' : 'lethal';
        if (p[kind] <= 0) return;
        const eqId = p.cls[kind];
        const o = Array.isArray(m.o) ? { x: +m.o[0], y: +m.o[1], z: +m.o[2] } : this.eye(p);
        const eye = this.eye(p);
        const src = Math.hypot(o.x - eye.x, o.y - eye.y, o.z - eye.z) < 2 ? o : eye;
        let v = Array.isArray(m.v) ? { x: +m.v[0], y: +m.v[1], z: +m.v[2] } : { x: 0, y: 0, z: 0 };
        const sp = Math.hypot(v.x, v.y, v.z);
        if (!Number.isFinite(sp)) return;
        if (sp > 26) { v.x *= 26 / sp; v.y *= 26 / sp; v.z *= 26 / sp; }
        p[kind]--;
        this.throwGrenade(p, eqId, src, v);
        break;
      }
      case 'use': p.interact = !!m.on; break;
      case 'class': {
        const i = Math.max(0, Math.min(4, m.i | 0));
        p.classIndex = i;
        // Klassenwechsel kurz nach dem Spawn sofort anwenden
        if (p.alive && (this.phase === 'pre' || (t - p.spawnT < 6000 && !p.firedSinceSpawn))) {
          const sp = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw };
          this.spawn(p, sp);
        }
        break;
      }
      case 'chat': {
        const text = String(m.text || '').slice(0, 120).trim();
        if (text) this.broadcast({ t: 'chat', id: p.id, name: p.name, team: p.team, text });
        break;
      }
      case 'ping': this.send(p, { t: 'pong', c: m.c, s: t }); if (Number.isFinite(m.rtt)) p.ping = Math.min(999, Math.max(0, m.rtt)); break;
    }
  }

  eye(p) {
    const h = stanceHeight(p.stance);
    return { x: p.pos.x, y: p.pos.y + h - PLAYER.eyeFromTop, z: p.pos.z };
  }

  posAt(p, t) {
    const h = p.hist;
    if (!h.length) return { x: p.pos.x, y: p.pos.y, z: p.pos.z, s: p.stance };
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t && t <= b.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, s: k < 0.5 ? a.s : b.s };
      }
    }
    return h[0];
  }

  // ------------------------------------------------------------------ Kampf
  fire(p, o, dirs, rewindMs) {
    const t = now();
    if (p.reloadEnd && t < p.reloadEnd) return;
    this.finishReload(p, t);
    if (t < p.swapEnd) return;
    const st = p.stats[p.slot], am = p.ammo[p.slot];
    if (!st || am.mag <= 0) return;
    if (t - p.lastShot < st.fireInterval * 1000 * 0.72) return;
    p.lastShot = t;
    am.mag--;
    p.firedSinceSpawn = true;
    p.spawnProtUntil = 0;
    const rt = t - rewindMs;
    const hits = new Map();
    let firstEnd = null;
    const ndirs = dirs.slice(0, st.pellets);
    for (const d of ndirs) {
      const wall = raycastWorld(this.world, o, d, 260);
      let maxT = wall ? wall.t : 260;
      let best = null;
      for (const e of this.players.values()) {
        if (e === p || !e.alive || e.team === p.team) continue;
        const ep = this.posAt(e, rt);
        const r = rayPlayer(o, d, ep.x, ep.y, ep.z, stanceHeight(ep.s), maxT);
        if (r && (!best || r.t < best.t)) best = { t: r.t, part: r.part, e };
      }
      const endT = best ? best.t : maxT;
      if (!firstEnd) firstEnd = [r2(o.x + d.x * endT), r2(o.y + d.y * endT), r2(o.z + d.z * endT)];
      if (best) {
        let dmg = damageAt(st, best.t);
        if (best.part === 'head') dmg *= st.head; else if (best.part === 'legs') dmg *= st.legs;
        const cur = hits.get(best.e) || { dmg: 0, head: false };
        cur.dmg += dmg; cur.head = cur.head || best.part === 'head';
        hits.set(best.e, cur);
      }
    }
    this.broadcast({ t: 'f', id: p.id, w: st.id, o: [r2(o.x), r2(o.y), r2(o.z)], e: firstEnd, s: st.suppressed ? 1 : 0, g: p.perks.includes('ghost') ? 1 : 0 }, p.id);
    for (const [e, h] of hits) {
      const res = this.damage(e, h.dmg, p, { weapon: st.id, head: h.head, from: o });
      this.send(p, { t: 'hit', d: Math.round(h.dmg), h: h.head ? 1 : 0, k: res === 'kill' ? 1 : 0 });
    }
  }

  finishReload(p, t) {
    if (p.reloadEnd && t >= p.reloadEnd) {
      const slot = p.reloadSlot || p.slot;
      const st = p.stats[slot], am = p.ammo[slot];
      const need = st.mag - am.mag;
      const take = Math.min(need, am.res);
      am.mag += take; am.res -= take;
      p.reloadEnd = 0;
    }
  }

  melee(p) {
    const t = now();
    if (!p.alive || t - p.lastMelee < 850 || this.phase !== 'live') return;
    p.lastMelee = t;
    const eye = this.eye(p);
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    let best = null, bd = 2.6;
    for (const e of this.players.values()) {
      if (e === p || !e.alive || e.team === p.team) continue;
      const c = { x: e.pos.x, y: e.pos.y + stanceHeight(e.stance) * 0.6, z: e.pos.z };
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > bd) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / (d || 1);
      if (dot < 0.55) continue;
      if (!lineOfSight(this.world, eye, c)) continue;
      best = e; bd = d;
    }
    this.broadcast({ t: 'ml', id: p.id, hit: best ? 1 : 0 });
    if (best) {
      const res = this.damage(best, 150, p, { weapon: 'knife', melee: true, from: eye });
      this.send(p, { t: 'hit', d: 150, h: 0, k: res === 'kill' ? 1 : 0 });
    }
  }

  damage(e, amount, attacker, info) {
    const t = now();
    if (!e.alive) return null;
    if (t < e.spawnProtUntil && !info.explosive) return null;
    if (attacker && attacker !== e && attacker.team === e.team) return null;
    if (info.explosive) {
      if (e.perks.includes('flakjacket')) amount *= 0.4;
      else if (e.perks.includes('tacmask')) amount *= 0.7;
    }
    amount = Math.max(1, Math.round(amount));
    e.hp -= amount;
    e.lastDmgT = t;
    if (attacker && attacker !== e) {
      const rec = e.dmgFrom.get(attacker.id) || { dmg: 0, t: 0 };
      rec.dmg += amount; rec.t = t;
      e.dmgFrom.set(attacker.id, rec);
    }
    const from = info.from || (attacker ? attacker.pos : null);
    this.send(e, { t: 'dmg', hp: Math.max(0, Math.round(e.hp)), from: from ? [r2(from.x), r2(from.y), r2(from.z)] : null });
    if (e.bot && attacker) e.bot.onDamaged(attacker);
    if (e.hp <= 0) { this.kill(e, attacker, info); return 'kill'; }
    return 'hit';
  }

  kill(v, k, info) {
    if (!v.alive) return;
    const t = now();
    v.alive = false; v.hp = 0;
    v.deaths++; v.statsMatch.deaths++;
    v.streak = 0;
    v.interact = false;
    if (this.snd && this.snd.bomb && this.snd.bomb.carrier === v.id) this.dropBomb(v);
    const enemyKill = k && k !== v && k.team !== v.team;
    if (enemyKill) {
      k.kills++; k.statsMatch.kills++;
      k.streak++;
      k.statsMatch.bestStreak = Math.max(k.statsMatch.bestStreak, k.streak);
      k.score += 100;
      this.giveXp(k, XP.kill, info.melee ? 'Messer-Kill' : 'Kill');
      if (info.head) { k.headshots++; k.statsMatch.headshots++; this.giveXp(k, XP.headshot, 'Kopfschuss'); }
      if (info.melee) this.giveXp(k, XP.melee, 'Nahkampf');
      if (!this.firstBlood) { this.firstBlood = true; this.giveXp(k, XP.firstBlood, 'Erstes Blut'); }
      if (k.streak >= 3) this.giveXp(k, XP.streak, `${k.streak}er-Serie`);
      if (k.streak === 4 || k.streak === 9) {
        this.uav[k.team] = t + 18000;
        this.event(`${k.name} ruft eine Aufklärungsdrohne`, { kind: 'uav', team: k.team });
      }
      if (WEAPONS[info.weapon]) {
        k.weaponXpMatch[info.weapon] = (k.weaponXpMatch[info.weapon] || 0) + 100 + (info.head ? 25 : 0);
        if (!k.bot && k.user) this.trackCamo(k, v, info, t);
      }
      k.lastKillT = t;
      if (k.perks.includes('scavenger') && k.alive) {
        for (const slot of ['primary', 'secondary']) k.ammo[slot].res = Math.min(k.stats[slot].reserve * 1.5, k.ammo[slot].res + k.stats[slot].mag);
        k.lethal = Math.max(k.lethal, 1);
        this.send(k, { t: 'ammo', a: { primary: [k.ammo.primary.mag, k.ammo.primary.res], secondary: [k.ammo.secondary.mag, k.ammo.secondary.res] }, lethal: k.lethal });
      }
      if (this.mode === 'tdm' && this.phase === 'live') this.score[k.team]++;
      if (this.mode === 'dom' && this.flags) {
        for (const f of this.flags) {
          if (f.owner === k.team && (Math.hypot(v.pos.x - f.x, v.pos.z - f.z) < 7 || Math.hypot(k.pos.x - f.x, k.pos.z - f.z) < 7)) {
            this.giveXp(k, XP.defendFlag, 'Flagge verteidigt'); k.score += 50; break;
          }
        }
      }
      if (k.bot) k.bot.onKill(v);
    }
    // Assists
    for (const [id, rec] of v.dmgFrom) {
      if (k && id === k.id) continue;
      if (t - rec.t > 10000 || rec.dmg < 20) continue;
      const a = this.players.get(id);
      if (!a || a.team === v.team) continue;
      a.assists++; a.statsMatch.assists++; a.score += 40;
      this.giveXp(a, XP.assist, 'Assist');
    }
    v.dmgFrom.clear();
    this.broadcast({ t: 'kill', k: k ? k.id : 0, v: v.id, w: info.weapon || '', h: info.head ? 1 : 0 });
    const respawn = this.mode === 'snd' ? -1 : this.M.respawn;
    v.respawnAt = respawn > 0 ? t + respawn * 1000 : 0;
    this.send(v, { t: 'died', by: k ? k.id : 0, w: info.weapon || '', respawn, killcam: k && k !== v ? [r2(k.pos.x), r2(k.pos.y), r2(k.pos.z)] : null, khp: k ? Math.max(0, Math.round(k.hp)) : 0 });
    if (v.bot) v.bot.onDeath();
    if (this.mode === 'tdm' && this.phase === 'live' && (this.score[0] >= this.M.scoreLimit || this.score[1] >= this.M.scoreLimit)) {
      this.endMatch(this.score[0] >= this.M.scoreLimit ? 0 : 1);
    }
  }

  // Tarnungs-Herausforderungen zählen und Freischaltungen sofort melden
  trackCamo(k, v, info, t) {
    const wid = info.weapon;
    const stored = k.user.data.weaponStats || (k.user.data.weaponStats = {});
    const before = unlockKeys(mergeStats(stored, k.wsMatch));
    const st = k.wsMatch[wid] || (k.wsMatch[wid] = emptyStats());
    st.kills++;
    if (info.head) st.heads++;
    const dist = Math.hypot(k.pos.x - v.pos.x, k.pos.z - v.pos.z);
    if (dist >= (LONGSHOT[WEAPONS[wid].cls] || 30)) st.long++;
    if (!k.ads && !info.melee) st.hip++;
    if (t - k.lastKillT < 4000) st.doubles++;
    const after = unlockKeys(mergeStats(stored, k.wsMatch));
    const seen = new Set();
    for (const key of after) {
      if (before.has(key)) continue;
      const [w, c] = key.split(':');
      const kind = camoKind(c);
      const dedupe = kind === 'darkmatter' ? c : kind === 'diamond' ? c + WEAPONS[w].cls : key;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      this.send(k, { t: 'camo', w, c });
      this.giveXp(k, CAMO_XP[kind], `Tarnung ${CAMO_NAMES[c]}`);
      if (kind !== 'base') this.event(`${k.name} hat ${CAMO_NAMES[c]} freigeschaltet${kind === 'darkmatter' ? '!' : ` (${WEAPONS[w].name})`}`, { kind: 'mastery' });
    }
  }

  giveXp(p, amount, reason) {
    if (p.bot || !amount) return;
    p.xpMatch += amount;
    p.xpLog[reason.replace(/^\d+er-Serie$/, 'Serien')] = (p.xpLog[reason.replace(/^\d+er-Serie$/, 'Serien')] || 0) + amount;
    this.send(p, { t: 'xp', a: amount, r: reason });
  }

  // ------------------------------------------------------------------ Granaten
  throwGrenade(p, eqId, o, v) {
    const eq = EQUIPMENT[eqId];
    const g = { id: this.nextGid++, kind: eqId, owner: p.id, team: p.team, x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, fuseEnd: now() + eq.fuse * 1000, stuck: false };
    this.grenades.push(g);
    this.broadcast({ t: 'throw', id: p.id, k: eqId });
  }

  grenadeTick(dt, t) {
    for (const g of this.grenades) {
      const eq = EQUIPMENT[g.kind];
      const bounced = stepProjectile(this.world, g, dt, eq.sticky);
      if (bounced && !g.stuck) g.bounces = (g.bounces || 0) + 1;
      if (t >= g.fuseEnd) g.done = true;
    }
    const done = this.grenades.filter(g => g.done);
    this.grenades = this.grenades.filter(g => !g.done);
    for (const g of done) this.explode(g, t);
    this.world.smokes = this.world.smokes.filter(s => s.end > t);
  }

  explode(g, t) {
    const eq = EQUIPMENT[g.kind];
    const owner = this.players.get(g.owner) || null;
    const c = { x: g.x, y: g.y + 0.15, z: g.z };
    this.broadcast({ t: 'boom', k: g.kind, x: r2(c.x), y: r2(c.y), z: r2(c.z) });
    if (g.kind === 'frag' || g.kind === 'semtex') {
      for (const e of this.players.values()) {
        if (!e.alive) continue;
        if (e !== owner && e.team === g.team) continue;
        const chest = { x: e.pos.x, y: e.pos.y + stanceHeight(e.stance) * 0.6, z: e.pos.z };
        const d = Math.hypot(chest.x - c.x, chest.y - c.y, chest.z - c.z);
        if (d > eq.radius) continue;
        if (!lineOfSight(this.world, c, chest) && !lineOfSight(this.world, c, { x: e.pos.x, y: e.pos.y + stanceHeight(e.stance) - 0.1, z: e.pos.z })) continue;
        const dmg = eq.damage * Math.pow(1 - d / eq.radius, 0.85) * (e === owner ? 0.6 : 1);
        if (dmg >= 4) this.damage(e, dmg, e === owner ? null : owner, { weapon: g.kind, explosive: true, from: c });
      }
    } else if (g.kind === 'flash') {
      for (const e of this.players.values()) {
        if (!e.alive || (e.team === g.team && e !== owner)) continue;
        const eye = this.eye(e);
        const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > eq.radius || !lineOfSight(this.world, c, eye) || smokeBlocks(this.world.smokes, c, eye)) continue;
        const fx = -Math.sin(e.yaw) * Math.cos(e.pitch), fy = Math.sin(e.pitch), fz = -Math.cos(e.yaw) * Math.cos(e.pitch);
        const dot = (dx * fx + dy * fy + dz * fz) / (d || 1);
        let s = (dot > 0.3 ? 1 : dot > -0.2 ? 0.6 : 0.3) * Math.max(0.25, 1 - d / eq.radius) * 3.6;
        if (e.perks.includes('tacmask')) s *= 0.3;
        if (e === owner) s *= 0.5;
        e.blindUntil = t + s * 1000;
        this.send(e, { t: 'flashed', s: r2(s) });
        if (owner && e !== owner && s > 0.8) this.send(owner, { t: 'hit', d: 0, h: 0, k: 0, flash: 1 });
      }
    } else if (g.kind === 'smoke') {
      const sm = { x: c.x, y: c.y + 1.2, z: c.z, r: eq.radius, end: t + eq.duration * 1000 };
      this.world.smokes.push(sm);
      this.broadcast({ t: 'smoke', x: r2(c.x), y: r2(c.y), z: r2(c.z), r: eq.radius, d: eq.duration });
    }
  }

  // ------------------------------------------------------------------ Fortschritt
  commitProgress(p, bonus, result) {
    const u = p.user;
    if (!u) return null;
    const d = u.data;
    const before = levelInfo(d.xp).level;
    d.xp += p.xpMatch + (bonus || 0);
    const after = levelInfo(d.xp).level;
    const unlocks = [];
    for (let l = before + 1; l <= after; l++) unlocks.push(...unlocksAt(l));
    const weaponUps = [];
    for (const [wid, x] of Object.entries(p.weaponXpMatch)) {
      const b = weaponLevelInfo(d.weaponXp[wid] || 0).level;
      d.weaponXp[wid] = (d.weaponXp[wid] || 0) + x;
      const a = weaponLevelInfo(d.weaponXp[wid]).level;
      for (let l = b + 1; l <= a; l++) weaponUps.push({ weapon: wid, level: l, unlocks: attachmentUnlocksAt(wid, l) });
    }
    const beforeKeys = unlockKeys(d.weaponStats || {});
    d.weaponStats = mergeStats(d.weaponStats, p.wsMatch);
    const camoUnlocks = [];
    const seen = new Set();
    for (const key of unlockKeys(d.weaponStats)) {
      if (beforeKeys.has(key)) continue;
      const [w, c] = key.split(':');
      const kind = camoKind(c);
      const dedupe = kind === 'darkmatter' ? c : kind === 'diamond' ? c + WEAPONS[w].cls : key;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      camoUnlocks.push({ weapon: w, camo: c, kind });
    }
    p.wsMatch = {};
    const s = d.stats;
    s.kills += p.statsMatch.kills; s.deaths += p.statsMatch.deaths; s.assists += p.statsMatch.assists;
    s.headshots += p.statsMatch.headshots;
    s.bestStreak = Math.max(s.bestStreak || 0, p.statsMatch.bestStreak);
    if (result) { s.matches++; if (result === 'win') s.wins++; else s.losses++; }
    p.xpMatch = 0; p.weaponXpMatch = {};
    p.statsMatch = { kills: 0, deaths: 0, assists: 0, headshots: 0, bestStreak: 0 };
    p.level = after;
    if (!u.guest) saveUser(u).catch(e => console.error('save', e.message));
    return { before, after, unlocks, weaponUps, camoUnlocks, level: levelInfo(d.xp), weaponXp: d.weaponXp, weaponStats: d.weaponStats, xp: d.xp, stats: d.stats };
  }

  // ------------------------------------------------------------------ Roster & Snapshots
  sendRoster() {
    const list = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, bot: p.bot ? 1 : 0, k: p.kills, d: p.deaths, a: p.assists, sc: p.score,
      ping: p.bot ? 0 : Math.round(p.ping), lv: p.level, pw: p.cls ? p.cls.primary.id : 'kr7', sw: p.cls ? p.cls.secondary.id : 'p9',
      pa: p.cls ? p.cls.primary.att : [], pcm: p.cls ? p.cls.primary.camo || 'none' : 'none', scm: p.cls ? p.cls.secondary.camo || 'none' : 'none', alive: p.alive ? 1 : 0,
    }));
    this.broadcast({ t: 'roster', list });
  }

  snapshot(t) {
    const ps = [];
    for (const p of this.players.values()) {
      let fl = 0;
      if (p.alive) fl |= 1;
      if (p.ads) fl |= 2;
      if (p.sprint) fl |= 4;
      if (p.perks && p.perks.includes('deadsilence')) fl |= 8;
      if (p.reloadEnd) fl |= 16;
      if (this.snd && this.snd.bomb && this.snd.bomb.carrier === p.id) fl |= 32;
      if (t < p.spawnProtUntil) fl |= 64;
      if (p.interact) fl |= 128;
      if (p.tac) fl |= 256;
      if (p.perks && p.perks.includes('ghost')) fl |= 512;
      ps.push([p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r3(p.yaw), r3(p.pitch), p.stance, fl, p.slot === 'primary' ? 0 : 1]);
    }
    const gs = this.grenades.map(g => [g.id, g.kind, r2(g.x), r2(g.y), r2(g.z)]);
    const m = { ph: this.phase, sc: this.score, u: [this.uav[0] > t ? 1 : 0, this.uav[1] > t ? 1 : 0] };
    if (this.phase === 'pre' || this.phase === 'post' || this.phase === 'roundEnd') m.pe = Math.max(0, Math.round((this.phaseEnd - t) / 100) / 10);
    if (this.mode !== 'snd') m.tl = Math.max(0, Math.round((this.timeEnd - t) / 1000));
    if (this.flags) m.f = this.flags.map(f => [f.owner, f.capTeam, Math.round(f.prog * 100) / 100, f.contested ? 1 : 0]);
    if (this.snd) {
      const b = this.snd.bomb;
      m.at = this.snd.attackTeam; m.rd = this.snd.round;
      m.tl = this.phase === 'live' ? Math.max(0, Math.round(((b.planted ? b.explodeAt : this.snd.roundEnd) - t) / 1000)) : 0;
      m.b = {
        c: b.carrier, pl: b.planted ? 1 : 0, s: b.site, dr: b.dropped ? [r2(b.dropped.x), r2(b.dropped.y), r2(b.dropped.z)] : null,
        p: b.pos ? [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z)] : null,
        pp: Math.round(b.plantProg / this.M.plantTime * 100) / 100, dp: Math.round(b.defuseProg / this.M.defuseTime * 100) / 100,
        pl_by: b.planter, df_by: b.defuser, ex: b.planted ? Math.max(0, Math.round((b.explodeAt - t) / 100) / 10) : 0,
      };
    }
    return { t: 's', ts: Math.round(t), p: ps, g: gs, m };
  }

  // ------------------------------------------------------------------ Tick
  tick(dt) {
    const t = now();
    this.pathBudget = 2;
    // Phasen
    if (this.phase === 'pre' && t >= this.phaseEnd) {
      this.phase = 'live';
      if (this.snd) this.snd.roundEnd = t + this.M.roundTime * 1000;
      this.event(this.snd ? 'Los!' : 'Match gestartet!', { kind: 'go' });
    } else if (this.phase === 'roundEnd' && t >= this.phaseEnd) {
      const w = this.score[0] >= this.M.roundsToWin ? 0 : this.score[1] >= this.M.roundsToWin ? 1 : -1;
      if (w >= 0) this.endMatch(w);
      else {
        if (this.snd.roundsPlayed === 3 && !this.snd.swapped) {
          this.snd.swapped = true;
          this.snd.attackTeam = 1 - this.snd.attackTeam;
          this.event('Seitenwechsel!', { kind: 'info' });
        }
        this.sndStartRound();
      }
    } else if (this.phase === 'post' && t >= this.phaseEnd) {
      this.nextMatch();
      return;
    }
    if (this.phase === 'live' && this.mode !== 'snd' && t >= this.timeEnd) {
      this.endMatch(this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1);
    }

    // Spieler
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (p.respawnAt && t >= p.respawnAt && this.phase === 'live') this.spawn(p);
        continue;
      }
      this.finishReload(p, t);
      if (p.hp < PLAYER.maxHealth && t - p.lastDmgT > PLAYER.regenDelay * 1000) p.hp = Math.min(PLAYER.maxHealth, p.hp + PLAYER.regenRate * dt);
      if (p.bot) {
        p.bot.update(dt, t);
        if (p.pos.y < -6) this.kill(p, null, { weapon: 'fall' });
      }
      p.hist.push({ t, x: p.pos.x, y: p.pos.y, z: p.pos.z, s: p.stance });
      while (p.hist.length && t - p.hist[0].t > 1000) p.hist.shift();
    }

    if (this.grenades.length || this.world.smokes.length) this.grenadeTick(dt, t);
    if (this.mode === 'dom') this.domTick(dt);
    if (this.mode === 'snd') this.sndTick(dt, t);

    if (t - this.lastSnap >= 1000 / SNAPSHOT_RATE - 2) {
      this.lastSnap = t;
      this.broadcast(this.snapshot(t));
    }
    if (t - this.lastRoster > 1500) { this.lastRoster = t; this.sendRoster(); }
  }
}
