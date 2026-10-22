// Texturen: CC0-Fotomaterialien (ambientCG) + prozedurale Materialien mit erzeugten Normal-Maps
import * as THREE from 'three';

let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const SIZE = 512;

function canvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// ---- Wertrauschen (für natürliche Flecken) ----
function makeNoise(gridN) {
  const g = new Float32Array(gridN * gridN);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = g[((yi % gridN + gridN) % gridN) * gridN + ((xi % gridN + gridN) % gridN)];
    const b = g[((yi % gridN + gridN) % gridN) * gridN + (((xi + 1) % gridN + gridN) % gridN)];
    const c = g[(((yi + 1) % gridN + gridN) % gridN) * gridN + ((xi % gridN + gridN) % gridN)];
    const d = g[(((yi + 1) % gridN + gridN) % gridN) * gridN + (((xi + 1) % gridN + gridN) % gridN)];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
// Kachelbares fBm-Rauschen als Overlay (multipliziert Helligkeit)
function grime(g, s, amount = 0.25, scale = 4, octaves = 4) {
  // pro Oktave ein Gitter mit genau der Periode -> nahtlos kachelbar
  const lat = [];
  for (let o = 0; o < octaves; o++) lat.push(makeNoise(scale << o));
  const img = g.getImageData(0, 0, s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let v = 0, a = 0.5;
    for (let o = 0; o < octaves; o++) {
      const P = scale << o;
      v += a * lat[o](x * P / s, y * P / s);
      a *= 0.5;
    }
    const k = 1 - amount + amount * 2 * v;
    const i = (y * s + x) * 4;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  g.putImageData(img, 0, 0);
}
function speckle(g, s, count, alpha, size = 2) {
  for (let i = 0; i < count; i++) {
    const v = (rand() - 0.5) * alpha;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(rand() * s, rand() * s, size * (0.5 + rand()), size * (0.5 + rand()));
  }
}
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// ---- Maler (Farbe; Höhe wird aus Helligkeit abgeleitet) ----
const painters = {
  metal(g, s) {
    g.fillStyle = '#7a8086'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.05})`; g.fillRect(0, y, s, 1); }
    grime(g, s, 0.22, 3);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
    g.fillStyle = 'rgba(0,0,0,.4)';
    for (let i = 16; i < s; i += 64) { g.beginPath(); g.arc(12, i, 3, 0, 7); g.arc(s - 12, i, 3, 0, 7); g.fill(); }
  },
  metalYellow(g, s) {
    g.fillStyle = '#d9a521'; g.fillRect(0, 0, s, s);
    grime(g, s, 0.25, 3);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(${60 + rand() * 40},${40 + rand() * 20},20,${0.3 + rand() * 0.5})`;
      const x = rand() * s, y = rand() * s;
      g.beginPath(); g.ellipse(x, y, 2 + rand() * 9, 1 + rand() * 4, rand() * 3, 0, 7); g.fill();
    }
  },
  crate(g, s) {
    planks(g, s, '#a37b4c', 5, true);
    g.strokeStyle = '#6b4c2e'; g.lineWidth = 46; g.strokeRect(23, 23, s - 46, s - 46);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(46, 46, s - 92, s - 92); g.strokeRect(2, 2, s - 4, s - 4);
    g.save(); g.beginPath(); g.rect(46, 46, s - 92, s - 92); g.clip();
    g.strokeStyle = '#6b4c2e'; g.lineWidth = 42; g.beginPath(); g.moveTo(30, 30); g.lineTo(s - 30, s - 30); g.stroke();
    g.restore();
    g.fillStyle = 'rgba(25,18,10,.6)'; g.font = 'bold 48px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('KH-07', s * 0.66, s * 0.3);
    g.fillStyle = 'rgba(40,30,20,.8)';
    for (const [x, y] of [[23, 23], [s - 23, 23], [23, s - 23], [s - 23, s - 23]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    grime(g, s, 0.18, 2);
  },
  wood(g, s) { planks(g, s, '#7b5a39', 6, false); grime(g, s, 0.15, 2); },
  shelf(g, s) {
    g.fillStyle = '#20262c'; g.fillRect(0, 0, s, s);
    const box = ['#a07a4c', '#cbbf9f', '#7d5c3a', '#9a8a6a'];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
      g.fillStyle = box[(i + r) % 4];
      const w = 90 + rand() * 20, h = 90 + rand() * 40;
      g.fillRect(40 + i * 110, (r + 1) * s / 3 - 24 - h, w, h);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(40 + i * 110 + w / 2 - 4, (r + 1) * s / 3 - 24 - h, 8, h);
    }
    g.fillStyle = '#2f5d9b'; g.fillRect(0, 0, 30, s); g.fillRect(s - 30, 0, 30, s);
    g.fillStyle = '#d7782a'; for (let r = 1; r <= 3; r++) g.fillRect(0, r * s / 3 - 24, s, 20);
    grime(g, s, 0.15, 2);
  },
  roofTile(g, s) {
    g.fillStyle = '#5c2516'; g.fillRect(0, 0, s, s);
    const rows = 10, cols = 8, rh = s / rows, cw = s / cols;
    for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
      const x = c * cw + (r % 2) * cw / 2, y = r * rh;
      const base = new THREE.Color(0x9a4128).multiplyScalar(0.8 + rand() * 0.35);
      const grd = g.createLinearGradient(x, 0, x + cw, 0);
      grd.addColorStop(0, '#' + base.clone().multiplyScalar(0.55).getHexString());
      grd.addColorStop(0.5, '#' + base.getHexString());
      grd.addColorStop(1, '#' + base.clone().multiplyScalar(0.55).getHexString());
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + cw - 2, y); g.lineTo(x + cw - 2, y + rh * 0.85); g.quadraticCurveTo(x + cw / 2, y + rh * 1.15, x + 2, y + rh * 0.85); g.closePath(); g.fill();
    }
    grime(g, s, 0.25, 3);
  },
  stone(g, s) { blocks(g, s, '#9a9384', 6, 4); },
  stoneWall(g, s) { blocks(g, s, '#b2a890', 5, 3); },
  cobble(g, s) {
    g.fillStyle = '#3c3a36'; g.fillRect(0, 0, s, s);
    const n = 12, cell = s / n;
    for (let y = 0; y < n; y++) for (let x = -1; x <= n; x++) {
      const ox = (y % 2) * cell / 2;
      const cx = x * cell + ox + cell / 2 + (rand() - 0.5) * 4, cy = y * cell + cell / 2 + (rand() - 0.5) * 4;
      const k = 0.7 + rand() * 0.45;
      const rx = cell * 0.44, ry = cell * 0.4;
      const grd = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.35, 2, cx, cy, rx * 1.1);
      grd.addColorStop(0, `rgb(${Math.round(160 * k)},${Math.round(152 * k)},${Math.round(138 * k)})`);
      grd.addColorStop(1, `rgb(${Math.round(92 * k)},${Math.round(86 * k)},${Math.round(78 * k)})`);
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(cx, cy, rx, ry, (rand() - 0.5) * 0.4, 0, 7); g.fill();
    }
    grime(g, s, 0.2, 3);
  },
  cloth(g, s) {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8e0cc' : '#a8322a'; g.fillRect(i * s / 8, 0, s / 8, s); }
    for (let y = 0; y < s; y += 4) { g.fillStyle = `rgba(0,0,0,${0.04 + 0.04 * Math.sin(y * 0.08)})`; g.fillRect(0, y, s, 2); }
    grime(g, s, 0.15, 2);
  },
  barrelRed(g, s) { barrel(g, s, '#a8321f'); },
  barrelBlue(g, s) { barrel(g, s, '#2c5a92'); },
  barrelGreen(g, s) { barrel(g, s, '#4c6b34'); },
  barrelWood(g, s) {
    planks(g, s, '#8a6238', 10, false);
    for (const y of [0.12, 0.45, 0.55, 0.88]) { g.fillStyle = '#2b2a28'; g.fillRect(0, s * y - 10, s, 20); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, s * y - 10, s, 3); }
    grime(g, s, 0.2, 2);
  },
  camo(g, s, base = '#4a5236') {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const cols = ['#5f6a44', '#3a3f29', '#6b6347', '#2e3322'];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      const x = rand() * s, y = rand() * s, r = 14 + rand() * 30;
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; const rr = r * (0.6 + rand() * 0.6); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.fill();
    }
    speckle(g, s, 3000, 0.12, 2);
  },
};

function barrel(g, s, col) {
  g.fillStyle = col; g.fillRect(0, 0, s, s);
  for (const y of [0.04, 0.33, 0.66, 0.96]) {
    const grd = g.createLinearGradient(0, s * y - 14, 0, s * y + 14);
    grd.addColorStop(0, 'rgba(0,0,0,.35)'); grd.addColorStop(0.5, 'rgba(255,255,255,.25)'); grd.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = grd; g.fillRect(0, s * y - 14, s, 28);
  }
  grime(g, s, 0.3, 3);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,50,25,${0.2 + rand() * 0.4})`; g.beginPath(); g.ellipse(rand() * s, rand() * s, 2 + rand() * 10, 1 + rand() * 5, 0, 0, 7); g.fill(); }
}

function planks(g, s, col, n, horizontal) {
  const w = s / n;
  for (let i = 0; i < n; i++) {
    const c = new THREE.Color(col).multiplyScalar(0.8 + rand() * 0.35);
    g.fillStyle = '#' + c.getHexString();
    if (horizontal) g.fillRect(0, i * w, s, w); else g.fillRect(i * w, 0, w, s);
    for (let k = 0; k < 90; k++) {
      g.fillStyle = `rgba(50,30,12,${rand() * 0.2})`;
      if (horizontal) g.fillRect(rand() * s, i * w + rand() * w, 30 + rand() * 90, 1 + rand());
      else g.fillRect(i * w + rand() * w, rand() * s, 1 + rand(), 30 + rand() * 90);
    }
    g.fillStyle = 'rgba(20,12,5,.65)';
    if (horizontal) g.fillRect(0, i * w, s, 3); else g.fillRect(i * w, 0, 3, s);
  }
}

function blocks(g, s, col, rows, cols) {
  g.fillStyle = '#4a463e'; g.fillRect(0, 0, s, s);
  const bh = s / rows, bw = s / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = c * bw + (r % 2) * bw / 2;
    const base = new THREE.Color(col).multiplyScalar(0.78 + rand() * 0.3);
    const grd = g.createLinearGradient(0, r * bh, 0, (r + 1) * bh);
    grd.addColorStop(0, '#' + base.clone().multiplyScalar(1.12).getHexString());
    grd.addColorStop(1, '#' + base.clone().multiplyScalar(0.82).getHexString());
    g.fillStyle = grd;
    g.fillRect(x + 4, r * bh + 4, bw - 8, bh - 8);
  }
  grime(g, s, 0.22, 4);
  speckle(g, s, 4000, 0.12, 2);
}

// Normal-Map aus Helligkeit (Sobel)
function normalFromCanvas(src, strength = 2.5) {
  const s = src.width;
  const sg = src.getContext('2d').getImageData(0, 0, s, s).data;
  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) h[i] = (sg[i * 4] * 0.3 + sg[i * 4 + 1] * 0.59 + sg[i * 4 + 2] * 0.11) / 255;
  const [c, g] = canvas(s);
  const img = g.createImageData(s, s);
  const d = img.data;
  const H = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const i = (y * s + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Material-Definitionen. img = CC0-Fotomaterial, sonst prozedural.
// tile = Meter pro Wiederholung (vertikal), aspect = Breite/Höhe des Bildes, tint = Einfärbung
export const MATS = {
  asphalt: { img: 'asphalt031', tile: 4.5, rough: 1 },
  concrete: { img: 'concrete034', tile: 2.2, aspect: 2, tint: 0xc4c0b6, rough: 0.95 },
  concreteWall: { img: 'concrete034', tile: 3.5, aspect: 2, tint: 0xa3a098, rough: 0.95 },
  concreteLight: { img: 'concrete034', tile: 3, aspect: 2, tint: 0xd9d3c4, rough: 0.95 },
  brick: { img: 'bricks101', tile: 2.2 },
  brickDark: { img: 'bricks101', tile: 2.2, tint: 0x8c7b72 },
  plaster: { img: 'concrete034', tile: 3, aspect: 2, tint: 0xf0e2c2, rough: 0.97, normalScale: 0.6 },
  plasterWarm: { img: 'concrete034', tile: 3, aspect: 2, tint: 0xffcf98, rough: 0.97, normalScale: 0.6 },
  containerRed: { img: 'corrugatedsteel005', tile: 2.6, tint: 0xc0402c, rough: 0.6, metal: 0.35 },
  containerBlue: { img: 'corrugatedsteel005', tile: 2.6, tint: 0x3a6aa8, rough: 0.6, metal: 0.35 },
  containerGreen: { img: 'corrugatedsteel005', tile: 2.6, tint: 0x4f8a48, rough: 0.6, metal: 0.35 },
  containerYellow: { img: 'corrugatedsteel005', tile: 2.6, tint: 0xe0a428, rough: 0.6, metal: 0.35 },
  roof: { img: 'corrugatedsteel005', tile: 2.5, tint: 0x9aa0a4, rough: 0.55, metal: 0.45 },
  metal: { tile: 2, rough: 0.45, metal: 0.6, nStrength: 1.5 },
  metalYellow: { tile: 1.5, rough: 0.6, metal: 0.25, nStrength: 1.2 },
  crate: { fit: true, rough: 0.85, nStrength: 3 },
  wood: { tile: 1.6, rough: 0.85, nStrength: 3 },
  shelf: { fit: true, rough: 0.7, nStrength: 2 },
  roofTile: { tile: 2.2, rough: 0.8, nStrength: 4 },
  stone: { tile: 1.6, rough: 0.95, nStrength: 4 },
  stoneWall: { tile: 2.6, rough: 0.95, nStrength: 4 },
  cobble: { tile: 3, rough: 0.9, nStrength: 5 },
  cloth: { tile: 2.8, rough: 1, nStrength: 1 },
  barrelRed: { fit: true, rough: 0.55, metal: 0.4, nStrength: 2 },
  barrelBlue: { fit: true, rough: 0.55, metal: 0.4, nStrength: 2 },
  barrelGreen: { fit: true, rough: 0.55, metal: 0.4, nStrength: 2 },
  barrelWood: { fit: true, rough: 0.85, nStrength: 3 },
};

const loader = new THREE.TextureLoader();
const cache = {};

function wrap(t, srgb, aniso) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Liefert { map, normalMap, roughnessMap? } für ein Material
export function materialMaps(mat, aniso = 4) {
  const key = mat;
  if (cache[key]) return cache[key];
  const def = MATS[mat] || MATS.metal;
  let out;
  if (def.img) {
    const base = `/assets/textures/${def.img}/`;
    out = {
      map: wrap(loader.load(base + 'color.jpg'), true, aniso),
      normalMap: wrap(loader.load(base + 'normal.jpg'), false, aniso),
      roughnessMap: wrap(loader.load(base + 'roughness.jpg'), false, aniso),
    };
  } else {
    seed = 1 + [...mat].reduce((a, c) => a + c.charCodeAt(0) * 31, 0);
    const [c, g] = canvas(SIZE);
    (painters[mat] || painters.metal)(g, SIZE);
    out = {
      map: wrap(new THREE.CanvasTexture(c), true, aniso),
      normalMap: wrap(new THREE.CanvasTexture(normalFromCanvas(c, def.nStrength || 2.5)), false, aniso),
    };
  }
  cache[key] = out;
  return out;
}

// Für Modelle (Soldaten-Tarnmuster etc.)
const extraCache = {};
export function paintedMaps(name, base) {
  const key = name + (base || '');
  if (extraCache[key]) return extraCache[key];
  seed = 7 + [...key].reduce((a, c) => a + c.charCodeAt(0) * 13, 0);
  const [c, g] = canvas(256);
  painters[name](g, 256, base);
  const out = {
    map: wrap(new THREE.CanvasTexture(c), true, 4),
    normalMap: wrap(new THREE.CanvasTexture(normalFromCanvas(c, 1.5)), false, 4),
  };
  extraCache[key] = out;
  return out;
}

// Wasser-Normal-Map (kachelbares Rauschen)
let waterN = null;
export function waterNormal() {
  if (waterN) return waterN;
  seed = 4242;
  const [c, g] = canvas(256);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  grime(g, 256, 0.9, 6, 5);
  waterN = wrap(new THREE.CanvasTexture(normalFromCanvas(c, 6)), false, 4);
  return waterN;
}

// Weicher runder Partikel
let soft = null;
export function softTexture() {
  if (soft) return soft;
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  soft = new THREE.CanvasTexture(c);
  return soft;
}

// Bodenmarkierungen / Decals
export function decalTexture(kind) {
  const key = 'decal_' + kind;
  if (extraCache[key]) return extraCache[key];
  const [c, g] = canvas(256);
  g.clearRect(0, 0, 256, 256);
  if (kind === 'stain') {
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 125);
    grd.addColorStop(0, 'rgba(15,15,12,.55)'); grd.addColorStop(0.7, 'rgba(20,20,15,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.ellipse(128, 128, 125, 95, 0.3, 0, 7); g.fill();
  } else if (kind === 'line') {
    g.fillStyle = 'rgba(232,190,50,.85)'; g.fillRect(0, 96, 256, 64);
    seed = 99; for (let i = 0; i < 900; i++) { g.clearRect(rand() * 256, 96 + rand() * 64, 2 + rand() * 5, 2 + rand() * 4); }
  } else if (kind === 'puddle') {
    g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.ellipse(128, 128, 120, 80, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  extraCache[key] = t;
  return t;
}

export function letterTexture(letter, color = '#ffffff', bg = null, size = 128) {
  const [c, g] = canvas(size);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
  g.strokeStyle = color; g.lineWidth = size * 0.06;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color; g.font = `bold ${size * 0.55}px "Saira Stencil One", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, size / 2, size / 2 + size * 0.03);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function textSprite(text, color = '#ffffff') {
  const [c, g] = canvas(256);
  c.height = 64;
  g.font = 'bold 30px "Barlow Condensed", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
  const s = new THREE.Sprite(m);
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

export { shade };
