// Tarnungen: Herausforderungen pro Waffe + Meisterschafts-Tarnungen (wie in CoD)
import { WEAPONS } from './weapons.js';

// Basis-Tarnungen: jede hat eine Herausforderung auf genau dieser Waffe
export const BASE_CAMOS = [
  { id: 'woodland', name: 'Waldtarn', stat: 'kills', need: 10 },
  { id: 'desert', name: 'Wüste', stat: 'kills', need: 25 },
  { id: 'digital', name: 'Digital', stat: 'heads', need: 10 },
  { id: 'tiger', name: 'Tiger', stat: 'kills', need: 50 },
  { id: 'arctic', name: 'Polar', stat: 'long', need: 10 },
  { id: 'sakura', name: 'Kirschblüte', stat: 'hip', need: 15 },
  { id: 'carbon', name: 'Karbon', stat: 'doubles', need: 5 },
  { id: 'crimson', name: 'Blutrot', stat: 'kills', need: 100 },
];

export const MASTERY_CAMOS = [
  { id: 'gold', name: 'Gold', desc: 'Alle 8 Tarnungen dieser Waffe freischalten' },
  { id: 'diamond', name: 'Diamant', desc: 'Gold auf allen Waffen dieser Klasse' },
  { id: 'darkmatter', name: 'Dunkle Materie', desc: 'Diamant in allen Waffenklassen' },
];

export const CAMO_NAMES = Object.fromEntries([...BASE_CAMOS, ...MASTERY_CAMOS].map(c => [c.id, c.name]));

export const STAT_LABELS = {
  kills: 'Kills',
  heads: 'Kopfschüsse',
  long: 'Weitschuss-Kills',
  hip: 'Kills aus der Hüfte',
  doubles: 'Doppel-Kills',
};

export const CAMO_XP = { base: 250, gold: 1000, diamond: 2500, darkmatter: 5000 };

// Ab welcher Distanz ein Kill als Weitschuss zählt
export const LONGSHOT = { shotgun: 12, smg: 20, pistol: 18, ar: 30, lmg: 30, dmr: 38, sniper: 45 };

export function camoText(c) {
  return `${c.need} ${STAT_LABELS[c.stat]}`;
}

export function emptyStats() { return { kills: 0, heads: 0, long: 0, hip: 0, doubles: 0 }; }

function stat(all, wid, s) { return ((all || {})[wid] || {})[s] || 0; }

export function isGold(all, wid) {
  return BASE_CAMOS.every(c => stat(all, wid, c.stat) >= c.need);
}

export function classWeapons(cls) {
  return Object.values(WEAPONS).filter(w => w.cls === cls).map(w => w.id);
}

export function isDiamond(all, wid) {
  const w = WEAPONS[wid];
  if (!w) return false;
  return classWeapons(w.cls).every(id => isGold(all, id));
}

export function isDarkMatter(all) {
  return Object.keys(WEAPONS).every(id => isGold(all, id));
}

// Alle freigeschalteten Tarnungen einer Waffe
export function unlockedCamos(all, wid) {
  const out = new Set(['none']);
  for (const c of BASE_CAMOS) if (stat(all, wid, c.stat) >= c.need) out.add(c.id);
  if (isGold(all, wid)) out.add('gold');
  if (isDiamond(all, wid)) out.add('diamond');
  if (isDarkMatter(all)) out.add('darkmatter');
  return out;
}

// Menge "waffe:tarnung" über alle Waffen – zum Vergleichen vorher/nachher
export function unlockKeys(all) {
  const keys = new Set();
  for (const wid of Object.keys(WEAPONS)) for (const c of unlockedCamos(all, wid)) if (c !== 'none') keys.add(wid + ':' + c);
  return keys;
}

export function mergeStats(a, b) {
  const out = {};
  for (const src of [a || {}, b || {}]) for (const [wid, s] of Object.entries(src)) {
    const t = out[wid] || (out[wid] = emptyStats());
    for (const k of Object.keys(t)) t[k] += s[k] || 0;
  }
  return out;
}

export function camoKind(id) {
  return id === 'gold' || id === 'diamond' || id === 'darkmatter' ? id : 'base';
}
