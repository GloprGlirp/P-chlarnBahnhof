// KUGELHAGEL Server: HTTP (Accounts, statische Dateien) + WebSocket (Lobby & Matches)
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { initDB, topPlayers, flushSync } from './db.js';
import { register, login, logout, userFromToken, publicProfile, saveClasses, makeGuest } from './auth.js';
import { Room } from './room.js';
import { TICK_RATE, MODES } from '../shared/constants.js';
import { MAPS } from '../shared/maps.js';
import { levelInfo } from '../shared/progression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

await initDB();

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h' }));
app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: '1h' }));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three/build'), { maxAge: '7d' }));

const wrap = fn => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(400).json({ error: e.message }); }
};
app.post('/api/register', wrap(async req => {
  const { token, user } = await register(req.body.username, req.body.password);
  return { token, profile: publicProfile(user) };
}));
app.post('/api/login', wrap(async req => {
  const { token, user } = await login(req.body.username, req.body.password);
  return { token, profile: publicProfile(user) };
}));
app.post('/api/logout', wrap(async req => { await logout(req.body.token); return { ok: true }; }));
app.get('/api/leaderboard', wrap(async () => {
  const list = await topPlayers(25);
  return list.map(u => ({ name: u.username, level: levelInfo(u.data.xp).level, xp: u.data.xp, kills: u.data.stats.kills, wins: u.data.stats.wins }));
}));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

// ------------------------------------------------------------------ Lobby
const rooms = new Map();
const guests = new Map(); // token -> user

function roomList() {
  return [...rooms.values()].filter(r => !r.isPrivate).map(r => r.info());
}

function joinRoom(c, room) {
  if (c.room) leaveRoom(c);
  if (room.humans().length >= 10) throw new Error('Raum ist voll');
  c.room = room;
  c.player = room.addHuman(c.user, c.ws);
}

function leaveRoom(c) {
  if (!c.room) return;
  c.room.removePlayer(c.player.id);
  c.room = null; c.player = null;
  send(c.ws, { t: 'profile', profile: publicProfile(c.user) });
}

function createRoom(opts) {
  const room = new Room(null, opts);
  rooms.set(room.id, room);
  return room;
}

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

wss.on('connection', (ws) => {
  const c = { ws, user: null, room: null, player: null };
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    try {
      if (!c.user) {
        if (m.t !== 'hello') return;
        if (m.guest) {
          let u = m.token && guests.get(m.token);
          if (!u) { u = makeGuest(m.guest); u.guestToken = 'g.' + u.key; guests.set(u.guestToken, u); }
          c.user = u;
          return send(ws, { t: 'welcome', profile: publicProfile(u), token: u.guestToken, guest: true });
        }
        const u = await userFromToken(m.token);
        if (!u) return send(ws, { t: 'authError' });
        c.user = u;
        return send(ws, { t: 'welcome', profile: publicProfile(u) });
      }
      if (c.room) {
        if (m.t === 'leave') return leaveRoom(c);
        return c.room.handle(c.player, m);
      }
      switch (m.t) {
        case 'rooms': return send(ws, { t: 'rooms', list: roomList() });
        case 'profile': return send(ws, { t: 'profile', profile: publicProfile(c.user) });
        case 'saveClasses': {
          await saveClasses(c.user, m.classes);
          return send(ws, { t: 'profile', profile: publicProfile(c.user), saved: true });
        }
        case 'quick': {
          const mode = MODES[m.mode] ? m.mode : 'tdm';
          const cands = [...rooms.values()].filter(r => r.mode === mode && !r.isPrivate && r.humans().length < 10 && r.botsEnabled)
            .sort((a, b) => b.humans().length - a.humans().length);
          const room = cands[0] || createRoom({ mode, bots: true, difficulty: 'normal' });
          return joinRoom(c, room);
        }
        case 'create': {
          const room = createRoom({
            mode: m.mode, map: MAPS[m.map] ? m.map : null, bots: m.bots !== false, difficulty: m.difficulty,
            private: !!m.private, name: m.name ? String(m.name).slice(0, 32) : null,
          });
          return joinRoom(c, room);
        }
        case 'join': {
          let room = rooms.get(m.id);
          if (!room && m.code) room = [...rooms.values()].find(r => r.code === String(m.code).toUpperCase().trim());
          if (!room) throw new Error('Raum nicht gefunden');
          return joinRoom(c, room);
        }
      }
    } catch (e) {
      send(ws, { t: 'error', msg: e.message });
    }
  });
  ws.on('close', () => { if (c.room) { c.room.removePlayer(c.player.id); c.room = null; } });
  ws.on('error', () => {});
});

// ------------------------------------------------------------------ Spielschleife
let last = performance.now();
setInterval(() => {
  const t = performance.now();
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  for (const room of rooms.values()) {
    try { room.tick(dt); } catch (e) { console.error('[room]', room.id, e); }
    if (room.humans().length === 0 && room.emptySince && t - room.emptySince > 15000) {
      rooms.delete(room.id);
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => console.log(`KUGELHAGEL läuft auf http://localhost:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flushSync(); process.exit(0); });
