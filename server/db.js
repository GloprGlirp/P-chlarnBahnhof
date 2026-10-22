// Account-Speicher: Postgres (wenn DATABASE_URL gesetzt) oder JSON-Datei
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'users.json');

let backend = 'file';
let pool = null;
const cache = new Map(); // key -> user
let saveTimer = null;

export async function initDB() {
  if (process.env.DATABASE_URL) {
    const pg = await import('pg');
    pool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
    });
    await pool.query('CREATE TABLE IF NOT EXISTS kh_users (key TEXT PRIMARY KEY, doc JSONB NOT NULL)');
    backend = 'postgres';
    console.log('[db] Postgres verbunden');
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) {
      try {
        const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        for (const u of all) cache.set(u.key, u);
      } catch (e) { console.error('[db] users.json kaputt:', e.message); }
    }
    console.log(`[db] Datei-Speicher (${cache.size} Accounts) in ${FILE}`);
  }
}

export async function getUser(key) {
  if (cache.has(key)) return cache.get(key);
  if (backend === 'postgres') {
    const r = await pool.query('SELECT doc FROM kh_users WHERE key = $1', [key]);
    if (r.rows[0]) { cache.set(key, r.rows[0].doc); return r.rows[0].doc; }
  }
  return null;
}

export async function saveUser(user) {
  cache.set(user.key, user);
  if (backend === 'postgres') {
    await pool.query('INSERT INTO kh_users (key, doc) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET doc = EXCLUDED.doc', [user.key, user]);
  } else {
    scheduleFileSave();
  }
}

function scheduleFileSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...cache.values()]));
    fs.renameSync(tmp, FILE);
  }, 500);
}

export async function topPlayers(limit = 20) {
  let list;
  if (backend === 'postgres') {
    const r = await pool.query("SELECT doc FROM kh_users ORDER BY (doc->'data'->>'xp')::int DESC LIMIT $1", [limit]);
    list = r.rows.map(x => x.doc);
  } else {
    list = [...cache.values()].sort((a, b) => (b.data.xp || 0) - (a.data.xp || 0)).slice(0, limit);
  }
  return list;
}

export function flushSync() {
  if (backend === 'file' && saveTimer) {
    clearTimeout(saveTimer); saveTimer = null;
    fs.writeFileSync(FILE, JSON.stringify([...cache.values()]));
  }
}
