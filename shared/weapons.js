// Waffen, Aufsätze, Perks und Ausrüstung – geteilt zwischen Client und Server

// Schadensprofil: [ab Distanz (m), Schaden]
export const WEAPONS = {
  // ---------- PRIMÄR ----------
  kr7: {
    id: 'kr7', name: 'KR-7', cls: 'ar', slot: 'primary', unlock: 1,
    desc: 'Ausgewogenes Sturmgewehr. Kann alles ein bisschen.',
    damage: [[0, 28], [28, 23], [48, 19]], head: 1.4, legs: 0.9,
    rpm: 740, auto: true, mag: 30, reserve: 120, reload: 2.1,
    adsTime: 0.26, move: 0.96, adsMove: 0.58, sprintToFire: 0.22, equip: 0.5,
    spread: { hip: 3.4, ads: 0.12, moving: 1.6, air: 4 }, recoil: { v: 0.42, h: 0.22, recover: 9 },
    zoom: 1.3, model: { kind: 'rifle', len: 0.62, barrel: 0.2, color: 0x2b2f33, accent: 0x4a4f55, mag: 'curved' },
  },
  vipera: {
    id: 'vipera', name: 'Vipera', cls: 'smg', slot: 'primary', unlock: 1,
    desc: 'Flinke MP. Schnelles Zielen, kurze Reichweite.',
    damage: [[0, 25], [12, 20], [24, 15]], head: 1.3, legs: 0.9,
    rpm: 880, auto: true, mag: 32, reserve: 160, reload: 1.8,
    adsTime: 0.18, move: 1.03, adsMove: 0.72, sprintToFire: 0.14, equip: 0.4,
    spread: { hip: 2.6, ads: 0.25, moving: 0.9, air: 3 }, recoil: { v: 0.34, h: 0.28, recover: 11 },
    zoom: 1.25, model: { kind: 'smg', len: 0.42, barrel: 0.1, color: 0x22252a, accent: 0x5c6670, mag: 'straight' },
  },
  striker: {
    id: 'striker', name: 'Striker-12', cls: 'shotgun', slot: 'primary', unlock: 4,
    desc: 'Pump-Schrotflinte. Ein Schuss, ein Problem weniger.',
    damage: [[0, 17], [8, 11], [16, 6]], head: 1.15, legs: 1, pellets: 9, pelletSpread: 4.6,
    rpm: 72, auto: false, mag: 6, reserve: 30, reload: 3.0,
    adsTime: 0.24, move: 1.0, adsMove: 0.65, sprintToFire: 0.2, equip: 0.5,
    spread: { hip: 1.6, ads: 1.0, moving: 0.5, air: 1.5 }, recoil: { v: 3.2, h: 0.6, recover: 7 },
    zoom: 1.15, model: { kind: 'shotgun', len: 0.68, barrel: 0.18, color: 0x3a2a1e, accent: 0x222222, mag: 'tube' },
  },
  longbow: {
    id: 'longbow', name: 'Longbow L-50', cls: 'sniper', slot: 'primary', unlock: 6,
    desc: 'Repetier-Scharfschützengewehr. Oberkörper = One-Shot.',
    damage: [[0, 105]], head: 2.0, legs: 0.85,
    rpm: 48, auto: false, mag: 5, reserve: 25, reload: 3.1,
    adsTime: 0.42, move: 0.9, adsMove: 0.4, sprintToFire: 0.34, equip: 0.7,
    spread: { hip: 9, ads: 0.0, moving: 4, air: 8 }, recoil: { v: 4.5, h: 0.8, recover: 6 },
    zoom: 5.5, fixedOptic: 'scope', model: { kind: 'sniper', len: 0.85, barrel: 0.35, color: 0x3b4031, accent: 0x1d1f1a, mag: 'box' },
  },
  hornet: {
    id: 'hornet', name: 'HX-Hornet', cls: 'smg', slot: 'primary', unlock: 8,
    desc: 'Extrem hohe Feuerrate. Leert Magazine in Rekordzeit.',
    damage: [[0, 21], [10, 17], [20, 13]], head: 1.3, legs: 0.9,
    rpm: 1080, auto: true, mag: 40, reserve: 200, reload: 2.0,
    adsTime: 0.2, move: 1.02, adsMove: 0.7, sprintToFire: 0.15, equip: 0.4,
    spread: { hip: 3.0, ads: 0.35, moving: 1.0, air: 3 }, recoil: { v: 0.28, h: 0.36, recover: 12 },
    zoom: 1.25, model: { kind: 'smg', len: 0.38, barrel: 0.08, color: 0x6b6b5a, accent: 0x2b2b25, mag: 'long' },
  },
  atlas: {
    id: 'atlas', name: 'Atlas MG', cls: 'lmg', slot: 'primary', unlock: 12,
    desc: 'Leichtes MG mit 100er-Gurt. Langsam, aber gnadenlos.',
    damage: [[0, 31], [35, 26], [60, 22]], head: 1.35, legs: 0.9,
    rpm: 660, auto: true, mag: 100, reserve: 200, reload: 5.2,
    adsTime: 0.45, move: 0.86, adsMove: 0.45, sprintToFire: 0.36, equip: 0.8,
    spread: { hip: 5, ads: 0.15, moving: 2.2, air: 5 }, recoil: { v: 0.36, h: 0.3, recover: 8 },
    zoom: 1.35, model: { kind: 'lmg', len: 0.78, barrel: 0.25, color: 0x2e3326, accent: 0x14160f, mag: 'drum' },
  },
  dmr14: {
    id: 'dmr14', name: 'DMR-14', cls: 'dmr', slot: 'primary', unlock: 16,
    desc: 'Halbautomatisches Präzisionsgewehr. Zwei Treffer reichen oft.',
    damage: [[0, 52], [45, 44]], head: 1.7, legs: 0.9,
    rpm: 380, auto: false, mag: 15, reserve: 60, reload: 2.4,
    adsTime: 0.32, move: 0.94, adsMove: 0.5, sprintToFire: 0.26, equip: 0.55,
    spread: { hip: 4.2, ads: 0.0, moving: 2, air: 5 }, recoil: { v: 1.5, h: 0.4, recover: 8 },
    zoom: 1.5, model: { kind: 'rifle', len: 0.74, barrel: 0.3, color: 0x4a3a28, accent: 0x222222, mag: 'box' },
  },
  tempest: {
    id: 'tempest', name: 'Tempest', cls: 'ar', slot: 'primary', unlock: 20,
    desc: 'Schweres Sturmgewehr. Hoher Schaden, harter Rückstoß.',
    damage: [[0, 34], [30, 28], [52, 23]], head: 1.4, legs: 0.9,
    rpm: 590, auto: true, mag: 25, reserve: 100, reload: 2.3,
    adsTime: 0.3, move: 0.94, adsMove: 0.55, sprintToFire: 0.25, equip: 0.55,
    spread: { hip: 3.8, ads: 0.12, moving: 1.8, air: 4 }, recoil: { v: 0.62, h: 0.32, recover: 8 },
    zoom: 1.3, model: { kind: 'rifle', len: 0.66, barrel: 0.22, color: 0x7a6a4f, accent: 0x2a2620, mag: 'curved' },
  },
  hydra: {
    id: 'hydra', name: 'Hydra AS', cls: 'shotgun', slot: 'primary', unlock: 25,
    desc: 'Vollautomatische Schrotflinte. Chaos in Dosen.',
    damage: [[0, 13], [7, 9], [14, 5]], head: 1.1, legs: 1, pellets: 7, pelletSpread: 5.2,
    rpm: 260, auto: true, mag: 8, reserve: 40, reload: 2.8,
    adsTime: 0.26, move: 0.98, adsMove: 0.62, sprintToFire: 0.22, equip: 0.55,
    spread: { hip: 2, ads: 1.4, moving: 0.6, air: 1.6 }, recoil: { v: 1.6, h: 0.7, recover: 8 },
    zoom: 1.15, model: { kind: 'shotgun', len: 0.6, barrel: 0.14, color: 0x1f2428, accent: 0x8a2b2b, mag: 'drum' },
  },
  // ---------- SEKUNDÄR ----------
  p9: {
    id: 'p9', name: 'P-9', cls: 'pistol', slot: 'secondary', unlock: 1,
    desc: 'Zuverlässige Halbautomatik-Pistole.',
    damage: [[0, 26], [14, 20], [26, 15]], head: 1.4, legs: 0.9,
    rpm: 460, auto: false, mag: 15, reserve: 60, reload: 1.5,
    adsTime: 0.15, move: 1.05, adsMove: 0.8, sprintToFire: 0.1, equip: 0.3,
    spread: { hip: 2.0, ads: 0.2, moving: 0.6, air: 2 }, recoil: { v: 0.9, h: 0.3, recover: 12 },
    zoom: 1.15, model: { kind: 'pistol', len: 0.2, barrel: 0, color: 0x1e1e1e, accent: 0x555555, mag: 'grip' },
  },
  bulldog: {
    id: 'bulldog', name: 'Bulldog .44', cls: 'pistol', slot: 'secondary', unlock: 10,
    desc: 'Revolver mit ordentlich Wumms.',
    damage: [[0, 58], [18, 44], [32, 34]], head: 1.5, legs: 0.9,
    rpm: 150, auto: false, mag: 6, reserve: 36, reload: 2.6,
    adsTime: 0.2, move: 1.03, adsMove: 0.75, sprintToFire: 0.14, equip: 0.4,
    spread: { hip: 2.6, ads: 0.1, moving: 0.8, air: 2.5 }, recoil: { v: 2.6, h: 0.5, recover: 9 },
    zoom: 1.2, model: { kind: 'revolver', len: 0.26, barrel: 0.06, color: 0x8c8c8c, accent: 0x3a2618, mag: 'none' },
  },
  mp5k: {
    id: 'mp5k', name: 'Wespe MP', cls: 'pistol', slot: 'secondary', unlock: 18,
    desc: 'Vollautomatische Maschinenpistole für den Notfall.',
    damage: [[0, 19], [10, 14], [20, 11]], head: 1.3, legs: 0.9,
    rpm: 1000, auto: true, mag: 22, reserve: 110, reload: 1.7,
    adsTime: 0.16, move: 1.04, adsMove: 0.78, sprintToFire: 0.11, equip: 0.3,
    spread: { hip: 2.6, ads: 0.6, moving: 0.7, air: 2.2 }, recoil: { v: 0.32, h: 0.38, recover: 12 },
    zoom: 1.15, model: { kind: 'pistol', len: 0.24, barrel: 0.03, color: 0x2d3540, accent: 0x111111, mag: 'long' },
  },
};

export const CLASS_LABELS = {
  ar: 'Sturmgewehr', smg: 'Maschinenpistole', shotgun: 'Schrotflinte', sniper: 'Scharfschützengewehr',
  lmg: 'Leichtes MG', dmr: 'Präzisionsgewehr', pistol: 'Handfeuerwaffe',
};

export const ATTACHMENT_SLOTS = [
  { id: 'optic', name: 'Visier' },
  { id: 'muzzle', name: 'Mündung' },
  { id: 'barrel', name: 'Lauf' },
  { id: 'underbarrel', name: 'Unterlauf' },
  { id: 'magazine', name: 'Magazin' },
  { id: 'stock', name: 'Schaft' },
];

export const MAX_ATTACHMENTS = 5;
export const WEAPON_MAX_LEVEL = 15;

// lvl = benötigtes Waffenlevel
export const ATTACHMENTS = {
  reddot:     { id: 'reddot', slot: 'optic', name: 'Rotpunkt', lvl: 2, desc: 'Klarer Leuchtpunkt, leichte Vergrößerung.',
                fx: { sight: 'reddot', zoom: 1.45 } },
  compensator:{ id: 'compensator', slot: 'muzzle', name: 'Kompensator', lvl: 3, desc: 'Weniger vertikaler Rückstoß.',
                fx: { recoilV: 0.82, recoilH: 0.95 } },
  vgrip:      { id: 'vgrip', slot: 'underbarrel', name: 'Vertikalgriff', lvl: 4, desc: 'Ruhigerer Rückstoß, etwas langsameres Zielen.',
                fx: { recoilV: 0.85, recoilH: 0.85, adsTime: 1.04 } },
  fastmag:    { id: 'fastmag', slot: 'magazine', name: 'Schnellmagazin', lvl: 5, desc: 'Deutlich schnelleres Nachladen.',
                fx: { reload: 0.72 } },
  holo:       { id: 'holo', slot: 'optic', name: 'Holo-Visier', lvl: 6, desc: 'Großer Ring – perfekt für kurze Distanzen.',
                fx: { sight: 'holo', zoom: 1.4 } },
  laser:      { id: 'laser', slot: 'underbarrel', name: 'Taktischer Laser', lvl: 7, desc: 'Viel bessere Hüftfeuer-Genauigkeit.',
                fx: { hipSpread: 0.65, sprintToFire: 0.85 } },
  suppressor: { id: 'suppressor', slot: 'muzzle', name: 'Schalldämpfer', lvl: 8, desc: 'Nicht auf der Minimap beim Schießen. Etwas weniger Reichweite.',
                fx: { suppressed: true, range: 0.88, adsTime: 1.03 } },
  shortbarrel:{ id: 'shortbarrel', slot: 'barrel', name: 'Kurzer Lauf', lvl: 9, desc: 'Schneller zielen und laufen, weniger Reichweite.',
                fx: { adsTime: 0.86, range: 0.82, move: 0.02, hipSpread: 0.9 } },
  lightstock: { id: 'lightstock', slot: 'stock', name: 'Leichter Schaft', lvl: 10, desc: 'Schneller beim Zielen laufen, mehr Rückstoß.',
                fx: { adsMove: 0.12, adsTime: 0.93, recoilV: 1.08, recoilH: 1.08 } },
  extmag:     { id: 'extmag', slot: 'magazine', name: 'Erweitertes Magazin', lvl: 11, desc: '+50% Munition, langsameres Nachladen.',
                fx: { magMult: 1.5, reload: 1.15 } },
  flashhider: { id: 'flashhider', slot: 'muzzle', name: 'Mündungsfeuerdämpfer', lvl: 12, desc: 'Kein Mündungsfeuer, weniger seitlicher Rückstoß.',
                fx: { noFlash: true, recoilH: 0.8 } },
  agrip:      { id: 'agrip', slot: 'underbarrel', name: 'Winkelgriff', lvl: 13, desc: 'Schnelleres Zielen.',
                fx: { adsTime: 0.86, sprintToFire: 0.9 } },
  longbarrel: { id: 'longbarrel', slot: 'barrel', name: 'Langer Lauf', lvl: 14, desc: '+25% Reichweite, langsameres Zielen.',
                fx: { range: 1.25, adsTime: 1.08, move: -0.015 } },
  acog:       { id: 'acog', slot: 'optic', name: '3x-Zielfernrohr', lvl: 14, desc: 'Höhere Vergrößerung für mittlere Distanzen.',
                fx: { sight: 'acog', zoom: 2.4, adsTime: 1.1 } },
  heavystock: { id: 'heavystock', slot: 'stock', name: 'Schwerer Schaft', lvl: 15, desc: 'Viel weniger Rückstoß, langsamer.',
                fx: { recoilV: 0.82, recoilH: 0.82, adsTime: 1.07, move: -0.02 } },
};

// Welche Aufsätze pro Waffenklasse erlaubt sind
const ALL = Object.keys(ATTACHMENTS);
export const CLASS_ATTACHMENTS = {
  ar: ALL,
  smg: ALL,
  lmg: ALL,
  dmr: ALL,
  shotgun: ALL.filter(a => a !== 'acog'),
  sniper: ALL.filter(a => ATTACHMENTS[a].slot !== 'optic'),
  pistol: ['reddot', 'compensator', 'laser', 'suppressor', 'fastmag', 'extmag', 'flashhider', 'shortbarrel', 'longbarrel'],
};

export const PERKS = {
  // Slot 1
  lightweight: { id: 'lightweight', slot: 1, name: 'Leichtgewicht', unlock: 1, desc: '+8% Bewegungstempo.' },
  flakjacket:  { id: 'flakjacket', slot: 1, name: 'Splitterweste', unlock: 1, desc: '-60% Explosionsschaden.' },
  scavenger:   { id: 'scavenger', slot: 1, name: 'Plünderer', unlock: 7, desc: 'Kills füllen deine Reservemunition auf.' },
  // Slot 2
  fasthands:   { id: 'fasthands', slot: 2, name: 'Fingerfertig', unlock: 1, desc: '30% schneller nachladen und wechseln.' },
  ghost:       { id: 'ghost', slot: 2, name: 'Geist', unlock: 9, desc: 'Du erscheinst nie auf der feindlichen Minimap.' },
  stalker:     { id: 'stalker', slot: 2, name: 'Pirscher', unlock: 14, desc: '+30% Tempo beim Zielen.' },
  // Slot 3
  marathon:    { id: 'marathon', slot: 3, name: 'Marathon', unlock: 1, desc: 'Doppelt so langer taktischer Sprint, kürzere Abklingzeit.' },
  deadsilence: { id: 'deadsilence', slot: 3, name: 'Lautlos', unlock: 5, desc: 'Deine Schritte sind für Gegner unhörbar.' },
  tacmask:     { id: 'tacmask', slot: 3, name: 'Taktische Maske', unlock: 11, desc: 'Stark reduzierte Blendwirkung, -30% Explosionsschaden.' },
};

export const EQUIPMENT = {
  frag:  { id: 'frag', type: 'lethal', name: 'Splittergranate', unlock: 1, desc: 'Prallt ab, explodiert nach 2,5 s.', fuse: 2.5, sticky: false, radius: 7, damage: 150, count: 1 },
  semtex:{ id: 'semtex', type: 'lethal', name: 'Haftgranate', unlock: 13, desc: 'Bleibt kleben, explodiert nach 1,8 s.', fuse: 1.8, sticky: true, radius: 6, damage: 140, count: 1 },
  flash: { id: 'flash', type: 'tactical', name: 'Blendgranate', unlock: 1, desc: 'Blendet Gegner mit Sichtkontakt.', fuse: 1.6, sticky: false, radius: 18, count: 2 },
  smoke: { id: 'smoke', type: 'tactical', name: 'Rauchgranate', unlock: 3, desc: 'Erzeugt eine Rauchwand für 14 s.', fuse: 1.3, sticky: false, radius: 5.5, duration: 14, count: 1 },
};

// ------------------------------------------------------------
// Endgültige Werte einer Waffe mit Aufsätzen + Perks berechnen
// ------------------------------------------------------------
export function computeStats(weaponId, attachments = [], perks = []) {
  const w = WEAPONS[weaponId] || WEAPONS.kr7;
  const s = {
    id: w.id, name: w.name, cls: w.cls, slot: w.slot,
    damage: w.damage.map(d => [d[0], d[1]]), head: w.head, legs: w.legs,
    pellets: w.pellets || 1, pelletSpread: w.pelletSpread || 0,
    rpm: w.rpm, auto: w.auto, mag: w.mag, reserve: w.reserve, reload: w.reload,
    adsTime: w.adsTime, move: w.move, adsMove: w.adsMove, sprintToFire: w.sprintToFire, equip: w.equip,
    hipSpread: w.spread.hip, adsSpread: w.spread.ads, moveSpread: w.spread.moving, airSpread: w.spread.air,
    recoilV: w.recoil.v, recoilH: w.recoil.h, recover: w.recoil.recover,
    zoom: w.zoom, sight: w.fixedOptic || 'iron', suppressed: false, noFlash: false,
    rangeMult: 1, attachments: [],
  };
  const allowed = CLASS_ATTACHMENTS[w.cls] || [];
  const usedSlots = new Set();
  for (const aid of attachments) {
    const a = ATTACHMENTS[aid];
    if (!a || !allowed.includes(aid) || usedSlots.has(a.slot)) continue;
    if (s.attachments.length >= MAX_ATTACHMENTS) break;
    usedSlots.add(a.slot);
    s.attachments.push(aid);
    const fx = a.fx;
    if (fx.sight) { s.sight = fx.sight; s.zoom = fx.zoom; }
    if (fx.recoilV) s.recoilV *= fx.recoilV;
    if (fx.recoilH) s.recoilH *= fx.recoilH;
    if (fx.adsTime) s.adsTime *= fx.adsTime;
    if (fx.reload) s.reload *= fx.reload;
    if (fx.range) s.rangeMult *= fx.range;
    if (fx.hipSpread) s.hipSpread *= fx.hipSpread;
    if (fx.magMult) s.mag = Math.round(s.mag * fx.magMult);
    if (fx.move) s.move += fx.move;
    if (fx.adsMove) s.adsMove += fx.adsMove;
    if (fx.sprintToFire) s.sprintToFire *= fx.sprintToFire;
    if (fx.suppressed) s.suppressed = true;
    if (fx.noFlash) s.noFlash = true;
  }
  if (s.rangeMult !== 1) s.damage = s.damage.map(([r, d]) => [r * s.rangeMult, d]);
  if (perks.includes('fasthands')) { s.reload *= 0.7; s.equip *= 0.7; }
  if (perks.includes('stalker')) s.adsMove = Math.min(1, s.adsMove * 1.3);
  if (perks.includes('lightweight')) s.move *= 1.08;
  s.fireInterval = 60 / s.rpm;
  return s;
}

export function damageAt(stats, dist) {
  let dmg = stats.damage[0][1];
  for (const [r, d] of stats.damage) if (dist >= r) dmg = d;
  return dmg;
}

// Anzeige-Werte (0-100) für das Waffenschmied-Menü
export function displayStats(s) {
  const clamp = v => Math.max(4, Math.min(100, Math.round(v)));
  const dmg = s.damage[0][1] * s.pellets;
  const firstFall = s.damage.length > 1 ? s.damage[1][0] : 80;
  return {
    Schaden: clamp(dmg / 1.1),
    Feuerrate: clamp(s.rpm / 11),
    Reichweite: clamp(firstFall * 1.8),
    Genauigkeit: clamp(100 - (s.recoilV * 55 + s.recoilH * 40)),
    Mobilität: clamp((s.move - 0.8) * 380),
    Handling: clamp(100 - (s.adsTime - 0.12) * 200),
  };
}

export function weaponsForSlot(slot) {
  return Object.values(WEAPONS).filter(w => w.slot === slot).sort((a, b) => a.unlock - b.unlock);
}
