// Prozedurale Texturen für Kartenmaterialien
import * as THREE from 'three';

let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(g, size, base, amount, count = 3000, sz = 2) {
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = (rand() - 0.5) * amount;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(rand() * size, rand() * size, sz * (0.5 + rand()), sz * (0.5 + rand()));
  }
}

const painters = {
  asphalt(g, s) {
    noise(g, s, '#45474a', 0.18, 9000, 2);
    g.strokeStyle = 'rgba(20,20,20,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { g.beginPath(); let x = rand() * s, y = rand() * s; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(230,200,60,.0)';
  },
  concrete(g, s) { noise(g, s, '#9a9a94', 0.12, 7000, 2); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2); },
  concreteWall(g, s) { noise(g, s, '#7d7f7a', 0.12, 7000, 3); g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke(); },
  concreteLight(g, s) { noise(g, s, '#b4b1a6', 0.1, 5000, 2); },
  brick(g, s) { bricks(g, s, '#8a4632', '#b8b0a0'); },
  brickDark(g, s) { bricks(g, s, '#5d3a2c', '#6e6458'); },
  plaster(g, s) { noise(g, s, '#cfc6b2', 0.08, 6000, 3); },
  plasterWarm(g, s) { noise(g, s, '#d9b48a', 0.08, 6000, 3); },
  metal(g, s) {
    g.fillStyle = '#6c7378'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.06})`; g.fillRect(0, y, s, 1); }
  },
  metalYellow(g, s) {
    g.fillStyle = '#d6a51f'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`; g.fillRect(rand() * s, rand() * s, 3, 3); }
  },
  containerRed(g, s) { corrugated(g, s, '#9c2f24'); },
  containerBlue(g, s) { corrugated(g, s, '#28507e'); },
  containerGreen(g, s) { corrugated(g, s, '#3f6a3a'); },
  containerYellow(g, s) { corrugated(g, s, '#c08a1e'); },
  crate(g, s) {
    planks(g, s, '#9a7448', 4, true);
    g.strokeStyle = '#5e4429'; g.lineWidth = 22; g.strokeRect(11, 11, s - 22, s - 22);
    g.beginPath(); g.moveTo(16, 16); g.lineTo(s - 16, s - 16); g.stroke();
    g.fillStyle = 'rgba(30,20,10,.55)'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('KH', s * 0.68, s * 0.35);
  },
  wood(g, s) { planks(g, s, '#7b5a39', 5, false); },
  shelf(g, s) {
    g.fillStyle = '#26303a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#2f5d9b'; g.fillRect(0, 0, 18, s); g.fillRect(s - 18, 0, 18, s);
    g.fillStyle = '#d7782a'; for (const y of [0.32, 0.66, 0.98]) g.fillRect(0, s * y - 12, s, 12);
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#9a7448', '#c8bfa6', '#7b5a39'][i % 3]; g.fillRect(24 + (i % 3) * 72, i < 3 ? s * 0.08 : s * 0.42, 62, s * 0.22); }
  },
  roof(g, s) { corrugated(g, s, '#55585a'); },
  roofTile(g, s) {
    g.fillStyle = '#8c3b26'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) {
      g.fillStyle = `rgba(${120 + rand() * 40},${45 + rand() * 20},${30},1)`;
      g.beginPath(); g.arc(x + 16 + ((y / 32) % 2) * 16, y + 4, 17, 0, Math.PI); g.fill();
    }
  },
  stone(g, s) { blocks(g, s, '#8b8678', 4, 3); },
  stoneWall(g, s) { blocks(g, s, '#a59d8a', 3, 5); },
  cobble(g, s) {
    g.fillStyle = '#4e4b45'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 26) for (let x = -13; x < s; x += 26) {
      const ox = ((y / 26) % 2) * 13;
      { const k = 0.75 + rand() * 0.4; g.fillStyle = `rgb(${Math.round(128 * k)},${Math.round(120 * k)},${Math.round(108 * k)})`; }
      g.beginPath(); g.ellipse(x + ox + 13, y + 13, 11, 10, rand(), 0, Math.PI * 2); g.fill();
    }
  },
  cloth(g, s) { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8e0cc' : '#b3352a'; g.fillRect(i * s / 8, 0, s / 8, s); } },
};

function bricks(g, s, col, mortar) {
  g.fillStyle = mortar; g.fillRect(0, 0, s, s);
  const bh = s / 8, bw = s / 4;
  for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
    const x = c * bw + (r % 2) * bw / 2;
    const k = 0.8 + rand() * 0.35;
    const base = new THREE.Color(col).multiplyScalar(k);
    g.fillStyle = '#' + base.getHexString();
    g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
  }
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.15})`; g.fillRect(rand() * s, rand() * s, 2, 2); }
}

function corrugated(g, s, col) {
  g.fillStyle = col; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 16) {
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, 'rgba(255,255,255,.14)'); grd.addColorStop(0.5, 'rgba(0,0,0,.18)'); grd.addColorStop(1, 'rgba(255,255,255,.14)');
    g.fillStyle = grd; g.fillRect(x, 0, 16, s);
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(70,40,20,${rand() * 0.25})`; g.fillRect(rand() * s, rand() * s, 2 + rand() * 4, 1 + rand() * 3); }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, s, 6); g.fillRect(0, s - 6, s, 6);
}

function planks(g, s, col, n, vertical) {
  const w = s / n;
  for (let i = 0; i < n; i++) {
    const c = new THREE.Color(col).multiplyScalar(0.85 + rand() * 0.3);
    g.fillStyle = '#' + c.getHexString();
    if (vertical) g.fillRect(0, i * w, s, w); else g.fillRect(i * w, 0, w, s);
    g.fillStyle = 'rgba(0,0,0,.35)';
    if (vertical) g.fillRect(0, i * w, s, 2); else g.fillRect(i * w, 0, 2, s);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(40,25,10,${rand() * 0.18})`;
      if (vertical) g.fillRect(rand() * s, i * w + rand() * w, 20 + rand() * 40, 1);
      else g.fillRect(i * w + rand() * w, rand() * s, 1, 20 + rand() * 40);
    }
  }
}

function blocks(g, s, col, rows, cols) {
  g.fillStyle = '#5a554b'; g.fillRect(0, 0, s, s);
  const bh = s / rows, bw = s / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = c * bw + (r % 2) * bw / 2;
    const k = 0.82 + rand() * 0.3;
    g.fillStyle = '#' + new THREE.Color(col).multiplyScalar(k).getHexString();
    g.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`; g.fillRect(rand() * s, rand() * s, 2, 2); }
}

// Material-Definitionen: tile = Meter pro Texturwiederholung, fit = Textur pro Fläche einpassen
export const MATS = {
  asphalt: { tile: 6, rough: 0.95 },
  concrete: { tile: 2.4, rough: 0.9 },
  concreteWall: { tile: 4, rough: 0.92 },
  concreteLight: { tile: 3, rough: 0.9 },
  brick: { tile: 2.2, rough: 0.9 },
  brickDark: { tile: 2.2, rough: 0.9 },
  plaster: { tile: 3, rough: 0.95 },
  plasterWarm: { tile: 3, rough: 0.95 },
  metal: { tile: 2, rough: 0.5, metal: 0.5 },
  metalYellow: { tile: 2, rough: 0.6, metal: 0.3 },
  containerRed: { tile: 2.6, rough: 0.7, metal: 0.25 },
  containerBlue: { tile: 2.6, rough: 0.7, metal: 0.25 },
  containerGreen: { tile: 2.6, rough: 0.7, metal: 0.25 },
  containerYellow: { tile: 2.6, rough: 0.7, metal: 0.25 },
  crate: { fit: true, rough: 0.9 },
  wood: { tile: 1.6, rough: 0.9 },
  shelf: { fit: true, rough: 0.7 },
  roof: { tile: 2.5, rough: 0.7, metal: 0.3 },
  roofTile: { tile: 2.5, rough: 0.85 },
  stone: { tile: 1.6, rough: 0.95 },
  stoneWall: { tile: 2.4, rough: 0.95 },
  cobble: { tile: 3, rough: 0.95 },
  cloth: { tile: 2.8, rough: 1 },
};

const cache = {};
export function texture(mat, maxAniso = 4) {
  if (cache[mat]) return cache[mat];
  seed = 1 + [...mat].reduce((a, c) => a + c.charCodeAt(0) * 31, 0);
  const [c, g] = canvas(256);
  (painters[mat] || painters.concrete)(g, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  cache[mat] = t;
  return t;
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
