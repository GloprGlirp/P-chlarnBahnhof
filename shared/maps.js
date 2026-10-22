// Kartendefinitionen aus Boxen (AABB). Werden für Rendering, Kollision, Raycasts und Bot-Navigation genutzt.

function makeBuilder() {
  const boxes = [];
  const B = (x0, y0, z0, x1, y1, z1, mat, extra) => {
    const b = {
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      mat,
    };
    if (extra) Object.assign(b, extra);
    boxes.push(b);
    return b;
  };
  // Box zentriert auf (cx, cz) mit Breite w (x), Tiefe d (z), Höhe h ab y0
  const box = (cx, cz, w, d, h, mat, y0 = 0, extra) => B(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, mat, extra);

  // Wand entlang X (z konstant) mit Öffnungen [{a, b, y0, y1}]
  const wallX = (x0, x1, z, t, h, mat, openings = [], y = 0) => {
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    let cur = x0;
    for (const o of ops) {
      if (o.a > cur) B(cur, y, z - t / 2, o.a, y + h, z + t / 2, mat);
      if (o.y0 > 0) B(o.a, y, z - t / 2, o.b, y + o.y0, z + t / 2, mat);
      if (o.y1 < h) B(o.a, y + o.y1, z - t / 2, o.b, y + h, z + t / 2, mat);
      cur = o.b;
    }
    if (cur < x1) B(cur, y, z - t / 2, x1, y + h, z + t / 2, mat);
  };
  // Wand entlang Z (x konstant)
  const wallZ = (z0, z1, x, t, h, mat, openings = [], y = 0) => {
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    let cur = z0;
    for (const o of ops) {
      if (o.a > cur) B(x - t / 2, y, cur, x + t / 2, y + h, o.a, mat);
      if (o.y0 > 0) B(x - t / 2, y, o.a, x + t / 2, y + o.y0, o.b, mat);
      if (o.y1 < h) B(x - t / 2, y + o.y1, o.a, x + t / 2, y + h, o.b, mat);
      cur = o.b;
    }
    if (cur < z1) B(x - t / 2, y, cur, x + t / 2, y + h, z1, mat);
  };
  // Treppe: startet bei (x,z), läuft in Richtung dir ('+x','-x','+z','-z')
  const stairs = (x, z, dir, width, height, steps, run, mat) => {
    const sh = height / steps, sr = run / steps;
    for (let i = 0; i < steps; i++) {
      const top = sh * (i + 1);
      const s0 = sr * i, s1 = sr * (i + 1);
      if (dir === '+x') B(x + s0, 0, z - width / 2, x + run, top, z + width / 2, mat);
      if (dir === '-x') B(x - run, 0, z - width / 2, x - s0, top, z + width / 2, mat);
      if (dir === '+z') B(x - width / 2, 0, z + s0, x + width / 2, top, z + run, mat);
      if (dir === '-z') B(x - width / 2, 0, z - run, x + width / 2, top, z - s0, mat);
      void s1;
    }
  };
  // Schiffscontainer 6.1 x 2.45 x 2.6
  const container = (cx, cz, alongX, mat, y0 = 0) =>
    alongX ? box(cx, cz, 6.1, 2.45, 2.6, mat, y0) : box(cx, cz, 2.45, 6.1, 2.6, mat, y0);
  const crate = (cx, cz, s = 1.2, y0 = 0, mat = 'crate') => box(cx, cz, s, s, s, mat, y0);
  // Requisiten mit eigener Form (Kollision bleibt eine Box)
  const barrel = (cx, cz, mat = 'barrelRed', y0 = 0) => box(cx, cz, 0.6, 0.6, 0.9, mat, y0, { shape: 'barrel' });
  const pallets = (cx, cz, n = 3, rot = false) => box(cx, cz, rot ? 1.0 : 1.2, rot ? 1.2 : 1.0, 0.15 * n, 'wood', 0, { shape: 'pallet' });
  const lamp = (cx, cz, h = 4.2) => box(cx, cz, 0.18, 0.18, h, 'metal', 0, { shape: 'lamp' });
  const bench = (cx, cz, alongX = true) => box(cx, cz, alongX ? 1.7 : 0.5, alongX ? 0.5 : 1.7, 0.48, 'wood', 0, { shape: 'bench' });
  return { boxes, B, box, wallX, wallZ, stairs, container, crate, barrel, pallets, lamp, bench };
}

// Blickrichtung grob Richtung Kartenmitte
function faceCenter(x, z) { return Math.atan2(x, 0.6 * z); }

// Spiegelt alle Boxen an x = 0 (nur für Boxen mit x < 0 aufgerufen)
function mirrorX(boxes) {
  const out = [];
  for (const b of boxes) {
    out.push({ ...b, min: [-b.max[0], b.min[1], b.min[2]], max: [-b.min[0], b.max[1], b.max[2]] });
  }
  return out;
}

function werftDecals() {
  const d = [];
  // gelbe Fahrspurmarkierungen außerhalb der Halle
  for (let x = -44; x <= 44; x += 4) if (Math.abs(x) > 13) d.push({ kind: 'line', x, z: 0.0, w: 2.2, d: 0.18, rot: 0 });
  for (let x = -44; x <= 44; x += 4) d.push({ kind: 'line', x, z: -11.3, w: 2.2, d: 0.18, rot: 0 }, { kind: 'line', x, z: 11.3, w: 2.2, d: 0.18, rot: 0 });
  // Ölflecken
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) d.push({ kind: 'stain', x: -44 + r() * 88, z: -31 + r() * 54, w: 1 + r() * 2.5, d: 0.8 + r() * 2, rot: r() * 3 });
  // Pfützen
  for (let i = 0; i < 8; i++) d.push({ kind: 'puddle', x: -40 + r() * 80, z: -28 + r() * 50, w: 1.5 + r() * 3, d: 1 + r() * 2, rot: r() * 3 });
  return d;
}

// =====================================================================
//  KARTE 1: WERFT (Hafen mit Containern, Lagerhalle in der Mitte, Kai)
// =====================================================================
function buildWerft() {
  const L = makeBuilder();
  const { B, box, wallX, wallZ, stairs, container, crate } = L;

  // ---- Westhälfte (wird gespiegelt) ----
  // Spawn West
  crate(-39, -9, 1.3); crate(-39, -7.7, 1.3); crate(-39, -8.4, 1.1, 1.3);
  crate(-39, 9, 1.3); crate(-37.7, 9, 1.3);
  box(-36, 17, 0.5, 4, 1.1, 'concrete');
  box(-36, -17, 0.5, 4, 1.1, 'concrete');

  // Mittelfeld West (Flagge A Bereich)
  container(-31, 0, false, 'containerBlue');
  box(-22, -5, 3.2, 0.5, 1.1, 'concrete');
  box(-22, 5, 3.2, 0.5, 1.1, 'concrete');
  crate(-17, -1.5, 1.2); crate(-17, 1.5, 1.2);
  box(-26, -9.5, 0.6, 0.6, 3, 'metal'); box(-26, 9.5, 0.6, 0.6, 3, 'metal');

  // Containerhof Nord-West
  container(-35, -25, true, 'containerRed');
  container(-26, -27.5, false, 'containerGreen');
  container(-26, -17, true, 'containerYellow');
  stairs(-34.2, -17, '+x', 2, 2.6, 10, 5.1, 'metal');           // Treppe auf Container
  container(-18, -22, false, 'containerBlue');
  container(-18, -22, false, 'containerRed', 2.6);              // gestapelt
  container(-11, -28, true, 'containerGreen');
  container(-8, -17.5, true, 'containerRed');
  container(-3.2, -25, false, 'containerYellow');
  crate(-13, -14, 1.2); crate(-21.5, -13, 1.2); crate(-30, -21, 1.2);

  // Kai Süd-West
  box(-30, 18, 3.2, 0.5, 1.1, 'concrete');
  box(-21, 24.5, 0.5, 3.2, 1.1, 'concrete');
  box(-13, 14, 3.2, 0.5, 1.1, 'concrete');
  box(-6, 21, 0.5, 3.2, 1.1, 'concrete');
  crate(-24, 14, 1.4); crate(-24, 15.4, 1.4); crate(-24, 14.7, 1.2, 1.4);
  crate(-10, 27.5, 1.3); crate(-8.7, 27.5, 1.3);
  // Kranfuß
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) box(-16 + dx, 20.5 + dz, 0.7, 0.7, 7.5, 'metalYellow');
  box(-16, 20.5, 5.4, 5.4, 0.6, 'metalYellow', 7.5);
  // Hafenbüro
  wallX(-36, -30, 23, 0.3, 3, 'plaster', [{ a: -34.5, b: -32.5, y0: 1.1, y1: 2.2 }]);
  wallX(-36, -30, 29, 0.3, 3, 'plaster', [{ a: -34, b: -32, y0: 1.1, y1: 2.2 }]);
  wallZ(23, 29, -36, 0.3, 3, 'plaster');
  wallZ(23, 29, -30, 0.3, 3, 'plaster', [{ a: 24.5, b: 26.5, y0: 0, y1: 2.4 }]);
  B(-36.2, 3, 22.8, -29.8, 3.25, 29.2, 'roof');
  crate(-35, 28, 0.9, 0, 'wood');

  // Requisiten
  L.barrel(-29.6, -14.5, 'barrelRed'); L.barrel(-28.9, -14.3, 'barrelBlue');
  L.barrel(-15.85, -20.6, 'barrelBlue'); L.barrel(-15.85, -21.3, 'barrelRed');
  L.barrel(-27.2, 27.6, 'barrelGreen'); L.barrel(-26.5, 27.9, 'barrelRed');
  L.barrel(-40.2, 15.2, 'barrelRed');
  L.pallets(-19.5, 7.9, 4); L.pallets(-35.2, 4.6, 3, true);
  L.pallets(-6.5, 14.5, 5);
  L.lamp(-33, 20.6); L.lamp(-12.3, 25.6); L.lamp(-22, -11.4);

  // ---- Lagerhalle Westhälfte ----
  const H = 6;
  wallX(-11, 0, -9, 0.4, H, 'brick', [{ a: -8, b: -5, y0: 1.2, y1: 2.5 }, { a: -2, b: 0, y0: 0, y1: 3.2 }]);
  wallX(-11, 0, 9, 0.4, H, 'brick', [{ a: -8, b: -5, y0: 1.2, y1: 2.5 }, { a: -2, b: 0, y0: 0, y1: 3.2 }]);
  wallZ(-9, 9, -11, 0.4, H, 'brick', [{ a: -6.5, b: -3.5, y0: 0, y1: 3 }, { a: -1.5, b: 1.5, y0: 1.2, y1: 2.5 }, { a: 3.5, b: 6.5, y0: 0, y1: 3 }]);
  B(-11.2, H, -9.2, 0, H + 0.3, -2, 'roof');
  B(-11.2, H, 2, 0, H + 0.3, 9.2, 'roof');
  // Innen
  box(-9.5, -7.5, 1.2, 2.6, 2.4, 'shelf');
  box(-9.5, 7.5, 1.2, 2.6, 2.4, 'shelf');
  crate(-6, -4.5, 1.2); crate(-6, 4.5, 1.2); crate(-4.8, 4.5, 1.2);
  crate(-3.5, 0, 1.0);
  box(-7.5, 0, 0.6, 3, 1.0, 'wood');

  const west = L.boxes.slice();
  const all = west.concat(mirrorX(west));

  // ---- Mittig / asymmetrisch ----
  const M = makeBuilder();
  // Boden
  M.B(-47, -1, -34, 47, 0, 24.5, 'asphalt');
  M.B(-47, -1, 24.5, 47, 0, 34, 'concreteLight');         // Kai-Kante
  // Außenwände
  M.B(-47, 0, -34, 47, 7, -33, 'concreteWall');
  M.B(-47, 0, -34, -46, 7, 34, 'concreteWall');
  M.B(46, 0, -34, 47, 7, 34, 'concreteWall');
  M.B(-47, 0, 31, 47, 12, 32, 'invisible');                 // Wasserkante
  for (let x = -44; x <= 44; x += 4) M.box(x, 30.6, 0.3, 0.3, 0.7, 'metalYellow'); // Poller
  // Mittelachse
  M.box(0, -14, 2.4, 1.2, 1.1, 'concrete');
  M.box(0, 14.5, 1.2, 1.2, 1.2, 'crate');
  M.box(0, 21, 3.4, 0.5, 1.1, 'concrete');
  M.box(0, 5.5, 1.6, 1.6, 0.9, 'crate');

  const boxes = all.concat(M.boxes);

  const spawns0 = [
    [-42, -24], [-42, -14], [-42.5, -4], [-42.5, 4], [-42, 13], [-42, 22], [-38.5, -29], [-39, 27.5],
    [-43.5, 0], [-40, -18], [-40, 18],
  ].map(([x, z]) => ({ x, y: 0, z, yaw: faceCenter(x, z) }));
  const spawns1 = spawns0.map(s => ({ x: -s.x, y: 0, z: s.z, yaw: faceCenter(-s.x, s.z) }));

  return {
    id: 'werft', name: 'Werft', desc: 'Containerhafen mit Lagerhalle und offenem Kai.',
    bounds: { minX: -46, maxX: 46, minZ: -33, maxZ: 31 },
    boxes,
    spawns: [spawns0, spawns1],
    dom: [{ id: 'A', x: -24, z: 0 }, { id: 'B', x: 0, z: 0 }, { id: 'C', x: 24, z: 0 }],
    snd: [{ id: 'A', x: 24, z: -21 }, { id: 'B', x: 26, z: 19 }],
    bombSpawn: { x: -42, z: 0 },
    theme: {
      hdri: 'quarry_01_1k', skyIntensity: 0.85, envIntensity: 0.55, exposure: 0.9,
      fog: [0.5, 0.52, 0.5], fogNear: 70, fogFar: 260, haze: 0.35,
      sun: [0.796, 0.62, 0.579], sunColor: 0xffe6c4, sunIntensity: 2.7, water: true,
    },
    decals: werftDecals(),
    decor: [
      ...[-8, -3, 3, 8].flatMap(x => [{ type: 'hanglamp', x, y: 5.4, z: -5 }, { type: 'hanglamp', x, y: 5.4, z: 5 }]),
    ],
  };
}

// =====================================================================
//  KARTE 2: ALTSTADT (Marktplatz, Gassen, Häuser mit Innenräumen)
// =====================================================================
function buildAltstadt() {
  const L = makeBuilder();
  const { B, box, wallX, wallZ, crate } = L;

  // Haus-Helfer: Wände mit Türen/Fenstern + Dach
  const house = (x0, z0, x1, z1, h, mat, doors) => {
    const t = 0.35;
    const win = (a, b) => ({ a, b, y0: 1.1, y1: 2.2 });
    wallX(x0, x1, z0, t, h, mat, doors.n || []);
    wallX(x0, x1, z1, t, h, mat, doors.s || []);
    wallZ(z0, z1, x0, t, h, mat, doors.w || []);
    wallZ(z0, z1, x1, t, h, mat, doors.e || []);
    B(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.4, z1 + 0.3, 'roofTile');
    void win;
  };
  const door = (a, b) => ({ a, b, y0: 0, y1: 2.5 });
  const win = (a, b) => ({ a, b, y0: 1.1, y1: 2.2 });

  // ---- Westhälfte ----
  // Spawn-Bereich West: Hof mit Mauer
  box(-31, -6, 0.5, 4, 1.2, 'stone'); box(-31, 6, 0.5, 4, 1.2, 'stone');
  crate(-33, 0, 1.2, 0, 'wood'); crate(-33, 1.2, 1.2, 0, 'wood');

  // Haus NW (Bäckerei)
  house(-26, -24, -16, -15, 4.2, 'plaster', {
    s: [door(-23.5, -21.5), win(-19, -17)], e: [door(-21, -19)], w: [win(-21, -18)], n: [win(-23, -20)],
  });
  crate(-24.5, -22.5, 1.0, 0, 'wood'); box(-18, -22.8, 2.5, 1, 1.0, 'wood');

  // Haus SW (Gasthaus) – zwei Räume
  house(-26, 13, -14, 24, 4.2, 'plasterWarm', {
    n: [door(-24, -22), win(-18.5, -16)], e: [door(17.5, 19.5)], w: [win(16, 19)], s: [win(-23, -20)],
  });
  wallZ(13, 24, -20, 0.3, 4.2, 'plasterWarm', [door(17, 19.2)]);
  box(-23, 19, 2, 1, 0.9, 'wood'); box(-16, 21.5, 1, 2.5, 0.9, 'wood');

  // Marktgasse Nord: Stände
  for (const x of [-11, -5]) {
    box(x, -21, 2.2, 1, 1.0, 'wood');
    B(x - 1.4, 2.4, -22, x + 1.4, 2.5, -19.8, 'cloth');
    box(x - 1.2, -20, 0.12, 0.12, 2.4, 'wood'); box(x + 1.2, -20, 0.12, 0.12, 2.4, 'wood');
  }
  crate(-8, -27, 1.1, 0, 'wood');

  // Westliche Straße: Barrikaden
  box(-12, -7.5, 0.5, 3, 1.1, 'stone');
  box(-12, 7.5, 0.5, 3, 1.1, 'stone');
  box(-20, 0, 3.4, 0.5, 1.1, 'stone');
  crate(-22.5, 4, 1.2, 0, 'wood'); crate(-22.5, -4, 1.2, 0, 'wood');
  // Brunnen-Plaza Westseite
  box(-6, -6, 0.6, 0.6, 3.5, 'stone'); box(-6, 6, 0.6, 0.6, 3.5, 'stone');  // Laternen-Säulen

  // Südgasse: Karren
  box(-8, 18, 2.6, 1.4, 1.1, 'wood');
  box(-3, 26, 1.2, 1.2, 1.2, 'crate');

  // Requisiten
  L.barrel(-27.0, -13.2, 'barrelWood'); L.barrel(-27.0, -12.5, 'barrelWood');
  L.barrel(-13.4, 12.3, 'barrelWood');
  L.lamp(-9, -10.8, 3.8); L.lamp(-9, 10.8, 3.8); L.lamp(-30, -9.5, 3.8);
  L.bench(-3.8, -9.2); L.bench(-3.8, 9.2);
  L.pallets(-23, 26.5, 2);

  const west = L.boxes.slice();
  const all = west.concat(mirrorX(west));

  const M = makeBuilder();
  M.B(-38, -1, -31, 38, 0, 31, 'cobble');
  M.B(-38, 0, -31, 38, 9, -30, 'brickDark');
  M.B(-38, 0, 30, 38, 9, 31, 'brickDark');
  M.B(-38, 0, -31, -37, 9, 31, 'brickDark');
  M.B(37, 0, -31, 38, 9, 31, 'brickDark');
  // Brunnen (Mitte)
  M.box(0, 0, 4.2, 4.2, 0.7, 'stone');
  M.box(0, 0, 1.0, 1.0, 2.0, 'stone', 0.7);
  M.box(0, 0, 0.5, 0.5, 0.5, 'stone', 2.7);
  // Mittlere Häuserblöcke Nord & Süd (Rathaus / Kirche) – durchquerbar
  M.wallX(-7, 7, -14, 0.4, 5, 'stoneWall', [door(-1.5, 1.5), win(-5.5, -3.5), win(3.5, 5.5)]);
  M.wallX(-7, 7, -26, 0.4, 5, 'stoneWall', [door(-1.5, 1.5)]);
  M.wallZ(-26, -14, -7, 0.4, 5, 'stoneWall', [door(-21.5, -18.5)]);
  M.wallZ(-26, -14, 7, 0.4, 5, 'stoneWall', [door(-21.5, -18.5)]);
  M.B(-7.3, 5, -26.3, 7.3, 5.4, -13.7, 'roofTile');
  M.box(0, -20, 4, 1.2, 1.0, 'wood');
  M.box(-4, -16, 1, 1, 1, 'crate'); M.box(4, -24, 1, 1, 1, 'crate');

  M.wallX(-6, 6, 13, 0.4, 5, 'stoneWall', [door(-1.5, 1.5), win(-4.5, -3), win(3, 4.5)]);
  M.wallX(-6, 6, 24, 0.4, 5, 'stoneWall', [win(-1.5, 1.5)]);
  M.wallZ(13, 24, -6, 0.4, 5, 'stoneWall', [door(16.5, 19.5)]);
  M.wallZ(13, 24, 6, 0.4, 5, 'stoneWall', [door(16.5, 19.5)]);
  M.B(-6.3, 5, 12.7, 6.3, 5.4, 24.3, 'roofTile');
  M.box(-2.5, 20, 1, 3, 1.0, 'wood'); M.box(2.5, 20, 1, 3, 1.0, 'wood');

  const boxes = all.concat(M.boxes);

  const spawns0 = [
    [-35, -24], [-35, -14], [-35.5, -4], [-35.5, 4], [-35, 14], [-35, 24], [-30.5, -27], [-30.5, 27], [-35.5, 0],
  ].map(([x, z]) => ({ x, y: 0, z, yaw: faceCenter(x, z) }));
  const spawns1 = spawns0.map(s => ({ x: -s.x, y: 0, z: s.z, yaw: faceCenter(-s.x, s.z) }));

  return {
    id: 'altstadt', name: 'Altstadt', desc: 'Enge Gassen, Marktplatz mit Brunnen und begehbare Häuser.',
    bounds: { minX: -37, maxX: 37, minZ: -30, maxZ: 30 },
    boxes,
    spawns: [spawns0, spawns1],
    dom: [{ id: 'A', x: -21, z: -19.5 }, { id: 'B', x: 0, z: 4.5 }, { id: 'C', x: 21, z: 18.5 }],
    snd: [{ id: 'A', x: 21, z: -19.5 }, { id: 'B', x: 17, z: 16 }],
    bombSpawn: { x: -35, z: 0 },
    theme: {
      hdri: 'venice_sunset_1k', skyIntensity: 0.6, envIntensity: 0.5, exposure: 0.9,
      fog: [0.62, 0.42, 0.3], fogNear: 55, fogFar: 200, haze: 0.3,
      sun: [0.807, 0.42, 0.587], sunColor: 0xffb47a, sunIntensity: 2.8, water: false,
    },
    decals: [
      { kind: 'stain', x: -15, z: -2, w: 3, d: 2.4, rot: 0.4 }, { kind: 'stain', x: 14, z: 5, w: 2.5, d: 2, rot: 1.2 },
      { kind: 'stain', x: -25, z: 6, w: 2, d: 1.6, rot: 2 }, { kind: 'stain', x: 6, z: -24, w: 2.6, d: 2, rot: 0.2 },
    ],
    decor: [
      { type: 'laundry', x0: -16, x1: -7, z: -13, y: 4.4 },
      { type: 'laundry', x0: 7, x1: 16, z: 12.4, y: 4.4 },
      { type: 'laundry', x0: -16, x1: -8, z: 11.8, y: 4.0 },
    ],
  };
}

export const MAPS = {
  werft: buildWerft(),
  altstadt: buildAltstadt(),
};
export const MAP_LIST = Object.keys(MAPS);
