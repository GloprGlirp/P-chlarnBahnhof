// Waffentarnungen: prozedurale Texturen und Materialien (Basis, Gold, Diamant, Dunkle Materie)
import * as THREE from 'three';

let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function canvas(s = 256) { const c = document.createElement('canvas'); c.width = c.height = s; return [c, c.getContext('2d')]; }

// Tarnflecken, kachelbar (an den Rändern gespiegelt gezeichnet)
function blobs(g, s, base, cols, count, rMin, rMax) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    g.fillStyle = cols[i % cols.length];
    const x = rand() * s, y = rand() * s, r = rMin + rand() * (rMax - rMin);
    const pts = [];
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const rr = r * (0.55 + rand() * 0.7); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      g.beginPath();
      pts.forEach(([px, py], j) => (j ? g.lineTo : g.moveTo).call(g, x + ox + px, y + oy + py));
      g.closePath(); g.fill();
    }
  }
}

function speck(g, s, n, a) {
  for (let i = 0; i < n; i++) { const v = (rand() - 0.5) * a; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(rand() * s, rand() * s, 1.5, 1.5); }
}

const painters = {
  woodland(g, s) { blobs(g, s, '#3f4d2a', ['#232b18', '#5e5a34', '#141810', '#2f3f1f'], 60, 12, 30); speck(g, s, 1500, 0.08); },
  desert(g, s) { blobs(g, s, '#c8b07e', ['#a38655', '#7e6440', '#e0cc9c'], 55, 10, 28); speck(g, s, 1500, 0.08); },
  digital(g, s) {
    const pal = ['#5d6670', '#8c959e', '#3b4249', '#b9c0c6', '#4a5560'];
    const cell = 8;
    for (let y = 0; y < s; y += cell) for (let x = 0; x < s; x += cell) { g.fillStyle = pal[Math.floor(rand() * pal.length)]; g.fillRect(x, y, cell, cell); }
    for (let i = 0; i < 40; i++) { g.fillStyle = pal[i % pal.length]; const x = Math.floor(rand() * s / cell) * cell, y = Math.floor(rand() * s / cell) * cell; g.fillRect(x, y, cell * (2 + Math.floor(rand() * 4)), cell * (1 + Math.floor(rand() * 3))); }
  },
  tiger(g, s) {
    g.fillStyle = '#e07a1f'; g.fillRect(0, 0, s, s);
    const grd = g.createLinearGradient(0, 0, s, s); grd.addColorStop(0, 'rgba(255,200,80,.25)'); grd.addColorStop(1, 'rgba(120,40,0,.25)'); g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.fillStyle = '#141010';
    for (let i = 0; i < 7; i++) {
      const y = (i / 7) * s + rand() * 10;
      for (const oy of [-s, 0, s]) {
        g.beginPath();
        g.moveTo(0, y + oy);
        g.bezierCurveTo(s * 0.3, y + oy - 26 + rand() * 12, s * 0.6, y + oy + 20 + rand() * 12, s, y + oy);
        g.bezierCurveTo(s * 0.62, y + oy + 22 + rand() * 8, s * 0.3, y + oy - 4 + rand() * 8, 0, y + oy + 12);
        g.fill();
      }
    }
  },
  arctic(g, s) { blobs(g, s, '#e8ecef', ['#b9c3cc', '#8d99a5', '#ffffff', '#d2d9df'], 60, 10, 26); speck(g, s, 1200, 0.06); },
  sakura(g, s) {
    g.fillStyle = '#2a1d1a'; g.fillRect(0, 0, s, s);
    speck(g, s, 1500, 0.08);
    for (let i = 0; i < 26; i++) {
      const x = rand() * s, y = rand() * s, r = 6 + rand() * 9;
      g.fillStyle = ['#ffb7c8', '#ff8fb0', '#fff0f4'][i % 3];
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + rand(); g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, r * 0.35, a, 0, 7); g.fill(); }
      g.fillStyle = '#ffe28a'; g.beginPath(); g.arc(x, y, r * 0.18, 0, 7); g.fill();
    }
  },
  carbon(g, s) {
    const c = 16;
    for (let y = 0; y < s; y += c) for (let x = 0; x < s; x += c) {
      const flip = ((x + y) / c) % 2;
      const grd = flip ? g.createLinearGradient(x, y, x + c, y) : g.createLinearGradient(x, y, x, y + c);
      grd.addColorStop(0, '#15171a'); grd.addColorStop(0.5, '#3a3e44'); grd.addColorStop(1, '#15171a');
      g.fillStyle = grd; g.fillRect(x, y, c, c);
    }
  },
  crimson(g, s) { blobs(g, s, '#6e080d', ['#420407', '#9c131a', '#260203'], 55, 10, 26); speck(g, s, 1800, 0.1); },
  gold(g, s) {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, '#f7d77a'); grd.addColorStop(0.5, '#d4a53c'); grd.addColorStop(1, '#f2cf6a');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(120,80,10,.55)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const x = rand() * s, y = rand() * s, r = 10 + rand() * 22;
      g.beginPath(); g.arc(x, y, r, rand() * 6, rand() * 6 + 3); g.stroke();
      g.beginPath(); g.arc(x + r * 0.6, y, r * 0.45, 0, 4); g.stroke();
    }
  },
  diamond(g, s) {
    g.fillStyle = '#cfe6f5'; g.fillRect(0, 0, s, s);
    const n = 9, c = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const px = x * c, py = y * c;
      const tris = [[[px, py], [px + c, py], [px + c / 2, py + c / 2]], [[px + c, py], [px + c, py + c], [px + c / 2, py + c / 2]], [[px + c, py + c], [px, py + c], [px + c / 2, py + c / 2]], [[px, py + c], [px, py], [px + c / 2, py + c / 2]]];
      for (const t of tris) {
        const v = 170 + rand() * 85;
        const tint = rand();
        g.fillStyle = tint < 0.15 ? `rgb(${v},${v * 0.8},${v})` : tint < 0.3 ? `rgb(${v * 0.75},${v * 0.9},${v})` : `rgb(${v},${v},${v})`;
        g.beginPath(); g.moveTo(...t[0]); g.lineTo(...t[1]); g.lineTo(...t[2]); g.closePath(); g.fill();
      }
    }
  },
  darkmatter(g, s) {
    g.fillStyle = '#05020a'; g.fillRect(0, 0, s, s);
    const cols = ['rgba(120,40,200,', 'rgba(60,30,160,', 'rgba(200,60,180,', 'rgba(40,80,200,'];
    for (let i = 0; i < 90; i++) {
      const x = rand() * s, y = rand() * s, r = 10 + rand() * 40;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        const c = cols[i % cols.length];
        grd.addColorStop(0, c + '0.35)'); grd.addColorStop(1, c + '0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill();
      }
    }
    // Schlieren
    g.strokeStyle = 'rgba(190,120,255,.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) { g.beginPath(); let x = rand() * s, y = rand() * s; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 60; y += (rand() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`; g.fillRect(rand() * s, rand() * s, rand() < 0.1 ? 2 : 1, rand() < 0.1 ? 2 : 1); }
  },
};

function normalFrom(c, strength) {
  const s = c.width, src = c.getContext('2d').getImageData(0, 0, s, s).data;
  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) h[i] = (src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2]) / 765;
  const [o, g] = canvas(s);
  const img = g.createImageData(s, s), d = img.data;
  const H = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return o;
}

const texCache = {};
function camoCanvas(id) {
  if (texCache[id]) return texCache[id];
  seed = 11 + [...id].reduce((a, c) => a + c.charCodeAt(0) * 17, 0);
  const [c, g] = canvas(256);
  (painters[id] || painters.woodland)(g, 256);
  texCache[id] = c;
  return c;
}

function tex(c, srgb, rep) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(rep, rep);
  t.anisotropy = 4;
  return t;
}

const animated = [];
const matCache = {};
export function camoMaterial(id) {
  if (!id || id === 'none') return null;
  if (matCache[id]) return matCache[id];
  const c = camoCanvas(id);
  let m;
  if (id === 'gold') {
    m = new THREE.MeshStandardMaterial({ color: 0xffd770, map: tex(c, true, 5), metalness: 1, roughness: 0.2, normalMap: tex(normalFrom(c, 3), false, 5) });
    m.normalScale.set(0.35, 0.35);
  } else if (id === 'diamond') {
    const sp = sparkles();
    m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: tex(c, true, 4), metalness: 0.7, roughness: 0.05, normalMap: tex(normalFrom(c, 6), false, 4),
      iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 700], clearcoat: 1, clearcoatRoughness: 0.03,
      emissive: 0xffffff, emissiveMap: sp, emissiveIntensity: 1.6,
    });
    animated.push({ t: sp, sx: 0.013, sy: -0.021 });
  } else if (id === 'darkmatter') {
    const e = tex(c, true, 3);
    m = new THREE.MeshStandardMaterial({ color: 0x1a0f2a, map: tex(c, true, 3), metalness: 0.85, roughness: 0.28, emissive: 0xffffff, emissiveMap: e, emissiveIntensity: 1.5 });
    animated.push({ t: e, sx: 0.035, sy: 0.022 });
  } else {
    const rep = { tiger: 2.2, digital: 4, carbon: 9, sakura: 3 }[id] || 3;
    m = new THREE.MeshStandardMaterial({ map: tex(c, true, rep), metalness: id === 'carbon' ? 0.3 : 0.05, roughness: id === 'carbon' ? 0.4 : 0.72 });
  }
  m.userData.camo = id;
  matCache[id] = m;
  return m;
}

// Funkelpunkte für Diamant
function sparkles() {
  seed = 777;
  const [c, g] = canvas(256);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 55; i++) {
    const x = rand() * 256, y = rand() * 256, r = 1 + rand() * 2.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 3);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(160,200,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 3, 0, 7); g.fill();
  }
  return tex(c, true, 4);
}

export function updateCamos(dt) {
  for (const a of animated) { a.t.offset.x += a.sx * dt; a.t.offset.y += a.sy * dt; }
}

// Kleine Vorschau für die Auswahl im Menü
const swatchCache = {};
export function camoSwatch(id) {
  if (swatchCache[id]) return swatchCache[id];
  const [c, g] = canvas(64);
  if (id === 'none') {
    g.fillStyle = '#2a2d30'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#5a5f66'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 50); g.lineTo(50, 14); g.stroke();
  } else {
    g.drawImage(camoCanvas(id), 0, 0, 128, 128, 0, 0, 64, 64);
    if (id === 'gold' || id === 'diamond' || id === 'darkmatter') {
      const grd = g.createLinearGradient(0, 0, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,.45)'); grd.addColorStop(0.4, 'rgba(255,255,255,0)'); grd.addColorStop(0.6, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,.25)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    }
  }
  swatchCache[id] = c.toDataURL();
  return swatchCache[id];
}
