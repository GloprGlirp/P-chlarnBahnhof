// Level, XP-Kurven, Freischaltungen und Klassen-Validierung
import { WEAPONS, ATTACHMENTS, PERKS, EQUIPMENT, CLASS_ATTACHMENTS, MAX_ATTACHMENTS, WEAPON_MAX_LEVEL } from './weapons.js';
import { unlockedCamos } from './camos.js';

export const MAX_LEVEL = 55;
export const CLASS_COUNT = 5;

export function xpToNext(level) { return 600 + (level - 1) * 200; }
export function weaponXpToNext(level) { return 200 + (level - 1) * 50; }

export function levelInfo(xp) {
  let level = 1, rest = xp || 0;
  while (level < MAX_LEVEL && rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  const need = level >= MAX_LEVEL ? 0 : xpToNext(level);
  return { level, into: rest, need, pct: need ? rest / need : 1 };
}

export function weaponLevelInfo(xp) {
  let level = 1, rest = xp || 0;
  while (level < WEAPON_MAX_LEVEL && rest >= weaponXpToNext(level)) { rest -= weaponXpToNext(level); level++; }
  const need = level >= WEAPON_MAX_LEVEL ? 0 : weaponXpToNext(level);
  return { level, into: rest, need, pct: need ? rest / need : 1 };
}

// Alles was auf einem Spielerlevel freigeschaltet wird
export function unlocksAt(level) {
  const out = [];
  for (const w of Object.values(WEAPONS)) if (w.unlock === level) out.push({ type: 'weapon', id: w.id, name: w.name });
  for (const p of Object.values(PERKS)) if (p.unlock === level) out.push({ type: 'perk', id: p.id, name: p.name });
  for (const e of Object.values(EQUIPMENT)) if (e.unlock === level) out.push({ type: 'equipment', id: e.id, name: e.name });
  return out;
}

export function attachmentUnlocksAt(weaponId, wlevel) {
  const w = WEAPONS[weaponId];
  if (!w) return [];
  return (CLASS_ATTACHMENTS[w.cls] || []).filter(a => ATTACHMENTS[a].lvl === wlevel)
    .map(a => ({ type: 'attachment', id: a, name: ATTACHMENTS[a].name, weapon: weaponId }));
}

export function defaultClass(i) {
  const presets = [
    { name: 'Sturmangriff', primary: { id: 'kr7', att: [] }, secondary: { id: 'p9', att: [] },
      lethal: 'frag', tactical: 'flash', perks: ['lightweight', 'fasthands', 'marathon'] },
    { name: 'Nahkämpfer', primary: { id: 'vipera', att: [] }, secondary: { id: 'p9', att: [] },
      lethal: 'frag', tactical: 'flash', perks: ['lightweight', 'fasthands', 'marathon'] },
    { name: 'Klasse 3', primary: { id: 'kr7', att: [] }, secondary: { id: 'p9', att: [] },
      lethal: 'frag', tactical: 'flash', perks: ['flakjacket', 'fasthands', 'marathon'] },
    { name: 'Klasse 4', primary: { id: 'vipera', att: [] }, secondary: { id: 'p9', att: [] },
      lethal: 'frag', tactical: 'flash', perks: ['lightweight', 'fasthands', 'marathon'] },
    { name: 'Klasse 5', primary: { id: 'kr7', att: [] }, secondary: { id: 'p9', att: [] },
      lethal: 'frag', tactical: 'flash', perks: ['lightweight', 'fasthands', 'marathon'] },
  ];
  return JSON.parse(JSON.stringify(presets[i] || presets[0]));
}

export function newProfileData() {
  return {
    xp: 0,
    weaponXp: {},
    weaponStats: {},
    classes: Array.from({ length: CLASS_COUNT }, (_, i) => defaultClass(i)),
    stats: { kills: 0, deaths: 0, assists: 0, headshots: 0, wins: 0, losses: 0, matches: 0, bestStreak: 0 },
  };
}

function validWeapon(entry, slot, level, weaponXp, weaponStats) {
  const fallback = slot === 'primary' ? 'kr7' : 'p9';
  let id = entry && WEAPONS[entry.id] && WEAPONS[entry.id].slot === slot && WEAPONS[entry.id].unlock <= level ? entry.id : fallback;
  const wl = weaponLevelInfo((weaponXp || {})[id] || 0).level;
  const allowed = CLASS_ATTACHMENTS[WEAPONS[id].cls] || [];
  const used = new Set();
  const att = [];
  for (const a of (entry && Array.isArray(entry.att) ? entry.att : [])) {
    const A = ATTACHMENTS[a];
    if (!A || !allowed.includes(a) || A.lvl > wl || used.has(A.slot)) continue;
    if (att.length >= MAX_ATTACHMENTS) break;
    used.add(A.slot); att.push(a);
  }
  const camo = entry && typeof entry.camo === 'string' && unlockedCamos(weaponStats, id).has(entry.camo) ? entry.camo : 'none';
  return { id, att, camo };
}

// Bereinigt eine vom Client geschickte Klasse gegen den Fortschritt des Spielers
export function validateClass(cls, profile) {
  const level = levelInfo(profile.xp).level;
  const wx = profile.weaponXp || {};
  const c = cls || {};
  const out = {
    name: String(c.name || 'Klasse').slice(0, 20),
    primary: validWeapon(c.primary, 'primary', level, wx, profile.weaponStats),
    secondary: validWeapon(c.secondary, 'secondary', level, wx, profile.weaponStats),
    lethal: EQUIPMENT[c.lethal] && EQUIPMENT[c.lethal].type === 'lethal' && EQUIPMENT[c.lethal].unlock <= level ? c.lethal : 'frag',
    tactical: EQUIPMENT[c.tactical] && EQUIPMENT[c.tactical].type === 'tactical' && EQUIPMENT[c.tactical].unlock <= level ? c.tactical : 'flash',
    perks: [],
  };
  const defaults = ['lightweight', 'fasthands', 'marathon'];
  for (let slot = 1; slot <= 3; slot++) {
    const want = Array.isArray(c.perks) ? c.perks[slot - 1] : null;
    const p = PERKS[want];
    out.perks.push(p && p.slot === slot && p.unlock <= level ? want : defaults[slot - 1]);
  }
  return out;
}
