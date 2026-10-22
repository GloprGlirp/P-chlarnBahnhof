// Kollision, Bewegung und Raycasts – identisch auf Client und Server
import { PLAYER, MOVE, STANCE } from './constants.js';

const EPS = 1e-4;

// ---------------------------------------------------------------
// Welt mit räumlichem Raster für schnelle Abfragen
// ---------------------------------------------------------------
export function createWorld(map) {
  const boxes = map.boxes.filter(b => b.mat !== 'decal');
  const cell = 4;
  const grid = new Map();
  boxes.forEach((b, i) => {
    b._i = i;
    const x0 = Math.floor(b.min[0] / cell), x1 = Math.floor(b.max[0] / cell);
    const z0 = Math.floor(b.min[2] / cell), z1 = Math.floor(b.max[2] / cell);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x * 10007 + z;
      let arr = grid.get(k);
      if (!arr) grid.set(k, arr = []);
      arr.push(b);
    }
  });
  let stamp = 1;
  const marks = new Uint32Array(boxes.length);
  const out = [];
  function query(minX, minZ, maxX, maxZ) {
    stamp++;
    out.length = 0;
    const x0 = Math.floor(minX / cell), x1 = Math.floor(maxX / cell);
    const z0 = Math.floor(minZ / cell), z1 = Math.floor(maxZ / cell);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const arr = grid.get(x * 10007 + z);
      if (!arr) continue;
      for (const b of arr) if (marks[b._i] !== stamp) { marks[b._i] = stamp; out.push(b); }
    }
    return out;
  }
  return { map, boxes, query, smokes: [] };
}

function overlapBox(b, x, y, z, r, h) {
  return b.min[0] < x + r - EPS && b.max[0] > x - r + EPS &&
         b.min[2] < z + r - EPS && b.max[2] > z - r + EPS &&
         b.min[1] < y + h - EPS && b.max[1] > y + EPS;
}

export function overlapsAny(world, x, y, z, r, h) {
  const list = world.query(x - r, z - r, x + r, z + r);
  for (const b of list) if (overlapBox(b, x, y, z, r, h)) return true;
  return false;
}

// Bewegt pos entlang einer Achse und schiebt aus Boxen heraus. Gibt true bei Kollision zurück.
function collideAxis(world, p, r, h, axis, delta) {
  if (delta === 0) return false;
  if (axis === 0) p.x += delta; else if (axis === 1) p.y += delta; else p.z += delta;
  const list = world.query(p.x - r, p.z - r, p.x + r, p.z + r);
  let hit = false;
  for (const b of list) {
    if (!overlapBox(b, p.x, p.y, p.z, r, h)) continue;
    hit = true;
    if (axis === 0) p.x = delta > 0 ? b.min[0] - r - EPS * 2 : b.max[0] + r + EPS * 2;
    else if (axis === 2) p.z = delta > 0 ? b.min[2] - r - EPS * 2 : b.max[2] + r + EPS * 2;
    else p.y = delta > 0 ? b.min[1] - h - EPS * 2 : b.max[1] + EPS;
  }
  return hit;
}

export function stanceHeight(stance) {
  return stance === STANCE.crouch ? PLAYER.crouchHeight : stance === STANCE.slide ? PLAYER.slideHeight : PLAYER.standHeight;
}

export function newMoveState(x = 0, y = 0, z = 0) {
  return {
    pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: true,
    stance: STANCE.stand, slideT: 0, slideCd: 0,
    tac: false, tacT: 0, tacCd: 0, sprinting: false,
    mantle: null, jumpHeld: false, crouchPrev: false, airT: 0,
  };
}

function findLedge(world, s, fx, fz) {
  const r = PLAYER.radius;
  const p = s.pos;
  const px = p.x + fx * (r + 0.35), pz = p.z + fz * (r + 0.35);
  const list = world.query(px - 0.05, pz - 0.05, px + 0.05, pz + 0.05);
  let best = null;
  for (const b of list) {
    if (px < b.min[0] || px > b.max[0] || pz < b.min[2] || pz > b.max[2]) continue;
    const top = b.max[1];
    const rel = top - p.y;
    if (rel < MOVE.mantleMin || rel > MOVE.mantleMax) continue;
    if (!best || top > best) best = top;
  }
  if (best === null) return null;
  const tx = p.x + fx * (r + 0.5), tz = p.z + fz * (r + 0.5);
  if (overlapsAny(world, tx, best + 0.02, tz, r, PLAYER.crouchHeight)) return null;
  if (overlapsAny(world, p.x, best + 0.02, p.z, r, PLAYER.crouchHeight)) return null;
  return { x: tx, y: best + 0.01, z: tz };
}

// inp: { f,b,l,r (0/1), jump, crouch, sprint, tac, ads, yaw, moveMult, adsMove, marathon }
// Gibt Events zurück: { jumped, landed, slid, mantled }
export function stepMove(world, s, inp, dt) {
  const ev = { jumped: false, landed: 0, slid: false, mantled: false };
  const p = s.pos, v = s.vel;
  const r = PLAYER.radius;

  s.slideCd = Math.max(0, s.slideCd - dt);
  s.tacCd = Math.max(0, s.tacCd - dt);

  // ---- Klettern (Mantle) ----
  if (s.mantle) {
    const m = s.mantle;
    m.t += dt;
    const k = Math.min(1, m.t / MOVE.mantleTime);
    const ky = Math.min(1, k / 0.65);
    p.y = m.from.y + (m.to.y - m.from.y) * (1 - (1 - ky) * (1 - ky));
    const kh = k < 0.55 ? 0 : (k - 0.55) / 0.45;
    p.x = m.from.x + (m.to.x - m.from.x) * kh;
    p.z = m.from.z + (m.to.z - m.from.z) * kh;
    if (k >= 1) {
      s.mantle = null; s.onGround = true;
      v.x = m.fx * 3; v.z = m.fz * 3; v.y = 0;
      s.stance = overlapsAny(world, p.x, p.y, p.z, r, PLAYER.standHeight) ? STANCE.crouch : STANCE.stand;
    }
    s.jumpHeld = !!inp.jump; s.crouchPrev = !!inp.crouch;
    return ev;
  }

  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  const fx = -sy, fz = -cy;          // vorwärts
  const rx = cy, rz = -sy;           // rechts
  const wf = (inp.f ? 1 : 0) - (inp.b ? 1 : 0);
  const wr = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  let wx = fx * wf + rx * wr, wz = fz * wf + rz * wr;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  const crouchPressed = inp.crouch && !s.crouchPrev;
  const hspeed = Math.hypot(v.x, v.z);

  // ---- Sprint / Taktischer Sprint ----
  const canSprint = inp.sprint && wf > 0 && !inp.ads && s.stance !== STANCE.slide;
  s.sprinting = canSprint && (s.stance === STANCE.stand || crouchPressed);
  if (s.sprinting && inp.tac && !s.tac && s.tacCd <= 0) {
    s.tac = true; s.tacT = MOVE.tacSprintDuration * (inp.marathon ? 2 : 1);
  }
  if (s.tac) {
    s.tacT -= dt;
    if (s.tacT <= 0 || !s.sprinting) { s.tac = false; s.tacCd = MOVE.tacSprintCooldown * (inp.marathon ? 0.5 : 1); }
  }

  // ---- Rutschen ----
  if (crouchPressed && s.sprinting && s.onGround && hspeed > 5.2 && s.slideCd <= 0) {
    s.stance = STANCE.slide;
    s.slideT = MOVE.slideDuration;
    const dx = hspeed > 0.5 ? v.x / hspeed : wx, dz = hspeed > 0.5 ? v.z / hspeed : wz;
    const sp = Math.max(hspeed + 1.5, MOVE.slideBoost * (s.tac ? 1.08 : 1));
    v.x = dx * sp; v.z = dz * sp;
    s.tac = false; s.sprinting = false;
    ev.slid = true;
  }

  if (s.stance === STANCE.slide) {
    s.slideT -= dt;
    const f = Math.max(0, 1 - MOVE.slideFriction * dt);
    v.x *= f; v.z *= f;
    // leichtes Lenken
    if (wl > 0) {
      const sp = Math.hypot(v.x, v.z);
      v.x += wx * 4 * dt; v.z += wz * 4 * dt;
      const ns = Math.hypot(v.x, v.z) || 1;
      v.x *= sp / ns; v.z *= sp / ns;
    }
    const jumpPressed = inp.jump && !s.jumpHeld;
    if (jumpPressed && s.onGround && !overlapsAny(world, p.x, p.y, p.z, r, PLAYER.standHeight)) {
      s.stance = STANCE.stand; v.y = MOVE.jumpVel * 0.95; s.onGround = false; ev.jumped = true;
      s.slideCd = MOVE.slideCooldown;
    } else if (s.slideT <= 0 || Math.hypot(v.x, v.z) < 2.6) {
      s.slideCd = MOVE.slideCooldown;
      s.stance = (inp.crouch || overlapsAny(world, p.x, p.y, p.z, r, PLAYER.standHeight)) ? STANCE.crouch : STANCE.stand;
    }
  } else {
    // ---- Ducken / Stehen ----
    if (inp.crouch && !s.sprinting) s.stance = STANCE.crouch;
    else if (s.stance === STANCE.crouch && !overlapsAny(world, p.x, p.y, p.z, r, PLAYER.standHeight)) s.stance = STANCE.stand;

    // ---- Zielgeschwindigkeit ----
    let speed = s.stance === STANCE.crouch ? MOVE.crouch : s.sprinting ? (s.tac ? MOVE.tacSprint : MOVE.sprint) : MOVE.walk;
    speed *= inp.moveMult || 1;
    if (inp.ads) speed *= inp.adsMove || MOVE.adsMult;
    if (wf < 0) speed *= 0.9;
    const tx = wx * speed, tz = wz * speed;
    if (s.onGround) {
      const k = Math.min(1, MOVE.groundAccel * dt);
      v.x += (tx - v.x) * k; v.z += (tz - v.z) * k;
    } else if (wl > 0) {
      const cur = Math.hypot(v.x, v.z);
      const k = Math.min(1, MOVE.airAccel * dt);
      v.x += (tx - v.x) * k; v.z += (tz - v.z) * k;
      // Schwung beim Springen nicht künstlich abbauen
      const ns = Math.hypot(v.x, v.z);
      if (cur > speed && ns < cur && ns > 0) { const keep = Math.max(ns, cur - 3 * dt); v.x *= keep / ns; v.z *= keep / ns; }
    }

    // ---- Springen ----
    const jumpPressed = inp.jump && !s.jumpHeld;
    if (jumpPressed && s.onGround) {
      if (s.stance === STANCE.crouch && !overlapsAny(world, p.x, p.y, p.z, r, PLAYER.standHeight)) s.stance = STANCE.stand;
      if (s.stance === STANCE.stand) { v.y = MOVE.jumpVel; s.onGround = false; ev.jumped = true; }
    }
  }

  const h = stanceHeight(s.stance);

  // ---- Schwerkraft ----
  v.y -= MOVE.gravity * dt;
  if (v.y < -40) v.y = -40;

  // ---- Horizontal bewegen (mit Stufen) ----
  const sx = p.x, sY = p.y, sz = p.z;
  const dx = v.x * dt, dz = v.z * dt;
  const hitX = collideAxis(world, p, r, h, 0, dx);
  const hitZ = collideAxis(world, p, r, h, 2, dz);
  let blocked = hitX || hitZ;
  if (blocked && (s.onGround || s.airT < 0.15)) {
    const q = { x: sx, y: sY + MOVE.stepHeight, z: sz };
    if (!overlapsAny(world, q.x, q.y, q.z, r, h)) {
      collideAxis(world, q, r, h, 0, dx);
      collideAxis(world, q, r, h, 2, dz);
      collideAxis(world, q, r, h, 1, -MOVE.stepHeight);
      const dStep = (q.x - sx) ** 2 + (q.z - sz) ** 2;
      const dFlat = (p.x - sx) ** 2 + (p.z - sz) ** 2;
      if (dStep > dFlat + 1e-5 && q.y > sY - 0.01) { p.x = q.x; p.y = q.y; p.z = q.z; blocked = false; if (v.y < 0) v.y = 0; }
    }
  }
  if (blocked) {
    if (hitX && Math.abs(p.x - (sx + dx)) > 1e-3) v.x = 0;
    if (hitZ && Math.abs(p.z - (sz + dz)) > 1e-3) v.z = 0;
    // Klettern prüfen
    if (wf > 0 && (inp.jump || !s.onGround) && s.stance !== STANCE.slide) {
      const t = findLedge(world, s, fx, fz);
      if (t) {
        s.mantle = { t: 0, from: { x: p.x, y: p.y, z: p.z }, to: t, fx, fz };
        v.x = v.y = v.z = 0; s.onGround = false; s.tac = false;
        ev.mantled = true;
        s.jumpHeld = !!inp.jump; s.crouchPrev = !!inp.crouch;
        return ev;
      }
    }
  }

  // ---- Vertikal ----
  const wasGround = s.onGround;
  const fallSpeed = v.y;
  const hitY = collideAxis(world, p, r, h, 1, v.y * dt);
  if (hitY) {
    if (v.y < 0) {
      if (!wasGround && fallSpeed < -4) ev.landed = -fallSpeed;
      s.onGround = true;
    }
    v.y = 0;
  } else {
    s.onGround = false;
    // Boden-Snap beim Treppe-Runtergehen
    if (wasGround && v.y <= 0 && !ev.jumped) {
      const q = { x: p.x, y: p.y, z: p.z };
      if (collideAxis(world, q, r, h, 1, -MOVE.stepHeight)) { p.y = q.y; s.onGround = true; v.y = 0; }
    }
  }
  s.airT = s.onGround ? 0 : s.airT + dt;
  s.jumpHeld = !!inp.jump;
  s.crouchPrev = !!inp.crouch;
  return ev;
}

// ---------------------------------------------------------------
// Raycasts
// ---------------------------------------------------------------
// Gibt Distanz t (oder Infinity) und Achse der Normalen zurück
export function rayAABB(ox, oy, oz, dx, dy, dz, min, max, maxT) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      const inv = 1 / d[i];
      let t1 = (min[i] - o[i]) * inv, t2 = (max[i] - o[i]) * inv;
      let sg = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sg = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = sg; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return { t: tmin, axis, sign };
}

// Strahl gegen Kartengeometrie. Gibt {t, normal, box} oder null.
export function raycastWorld(world, o, d, maxDist) {
  const ex = o.x + d.x * maxDist, ez = o.z + d.z * maxDist;
  const list = world.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez));
  let best = null;
  let bestT = maxDist;
  for (const b of list) {
    const h = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, b.min, b.max, bestT);
    if (h && h.t < bestT && h.t >= 0) {
      bestT = h.t;
      const n = [0, 0, 0];
      if (h.axis >= 0) n[h.axis] = h.sign;
      best = { t: h.t, normal: { x: n[0], y: n[1], z: n[2] }, box: b };
    }
  }
  return best;
}

export function lineOfSight(world, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return true;
  const hit = raycastWorld(world, a, { x: dx / len, y: dy / len, z: dz / len }, len);
  return !hit;
}

// Rauch blockiert Sicht (für Bots und Blendgranaten)
export function smokeBlocks(smokes, a, b) {
  for (const s of smokes) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    let t = ((s.x - a.x) * dx + (s.y - a.y) * dy + (s.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t - s.x, py = a.y + dy * t - s.y, pz = a.z + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r) return true;
  }
  return false;
}

// Trefferzonen eines Spielers
export function hitboxes(x, y, z, h) {
  return [
    { part: 'head', min: [x - 0.17, y + h - 0.33, z - 0.17], max: [x + 0.17, y + h + 0.02, z + 0.17] },
    { part: 'body', min: [x - 0.31, y + h * 0.47, z - 0.31], max: [x + 0.31, y + h - 0.33, z + 0.31] },
    { part: 'legs', min: [x - 0.27, y, z - 0.27], max: [x + 0.27, y + h * 0.47, z + 0.27] },
  ];
}

export function rayPlayer(o, d, x, y, z, h, maxT) {
  // Grobtest
  const bb = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, [x - 0.35, y, z - 0.35], [x + 0.35, y + h + 0.05, z + 0.35], maxT);
  if (!bb) return null;
  let best = null;
  for (const hb of hitboxes(x, y, z, h)) {
    const r = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, hb.min, hb.max, best ? best.t : maxT);
    if (r && (!best || r.t < best.t)) best = { t: r.t, part: hb.part };
  }
  return best;
}

// ---------------------------------------------------------------
// Granaten-Physik
// ---------------------------------------------------------------
export function stepProjectile(world, g, dt, sticky) {
  if (g.stuck) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(g.vx, g.vy, g.vz) * dt / 0.08));
  const sdt = dt / steps;
  const r = 0.07;
  let bounced = false;
  for (let i = 0; i < steps; i++) {
    g.vy -= MOVE.gravity * sdt;
    const p = { x: g.x, y: g.y - r, z: g.z };
    const h = r * 2;
    const hx = collideAxis(world, p, r, h, 0, g.vx * sdt);
    const hz = collideAxis(world, p, r, h, 2, g.vz * sdt);
    const hy = collideAxis(world, p, r, h, 1, g.vy * sdt);
    g.x = p.x; g.y = p.y + r; g.z = p.z;
    if (hx || hy || hz) {
      if (sticky) { g.vx = g.vy = g.vz = 0; g.stuck = true; return true; }
      if (hx) g.vx *= -0.38;
      if (hz) g.vz *= -0.38;
      if (hy) {
        g.vy *= g.vy < -2 ? -0.32 : 0;
        g.vx *= 0.72; g.vz *= 0.72;
        if (Math.abs(g.vy) < 0.5) g.vy = 0;
      }
      bounced = true;
    }
    if (g.y < -5) { g.y = 0.1; g.vy = 0; }
  }
  return bounced;
}
