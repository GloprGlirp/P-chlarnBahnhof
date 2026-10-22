// Navigationsraster + A* für Bots (nur Bodenebene)
import { overlapsAny } from '../shared/physics.js';

export function buildNav(map, world) {
  const cell = 1;
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell);
  const walk = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = minX + (ix + 0.5) * cell, z = minZ + (iz + 0.5) * cell;
    walk[iz * nx + ix] = overlapsAny(world, x, 0.06, z, 0.42, 1.75) ? 0 : 1;
  }
  const idx = (ix, iz) => iz * nx + ix;
  const toCell = (x, z) => [Math.floor((x - minX) / cell), Math.floor((z - minZ) / cell)];
  const center = (ix, iz) => ({ x: minX + (ix + 0.5) * cell, z: minZ + (iz + 0.5) * cell });
  const ok = (ix, iz) => ix >= 0 && iz >= 0 && ix < nx && iz < nz && walk[idx(ix, iz)] === 1;

  function nearestWalkable(x, z) {
    const [cx, cz] = toCell(x, z);
    if (ok(cx, cz)) return [cx, cz];
    for (let r = 1; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if (ok(cx + dx, cz + dz)) return [cx + dx, cz + dz];
      }
    }
    return null;
  }

  function lineWalkable(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 0.35);
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const x = a.x + dx * t, z = a.z + dz * t;
      // etwas Breite prüfen
      for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
        const [cx, cz] = toCell(x + ox, z + oz);
        if (!ok(cx, cz)) return false;
      }
    }
    return true;
  }

  const g = new Float32Array(nx * nz);
  const came = new Int32Array(nx * nz);
  const closed = new Uint32Array(nx * nz);
  const opened = new Uint32Array(nx * nz);
  let gen = 0;

  function findPath(ax, az, bx, bz) {
    const s = nearestWalkable(ax, az), e = nearestWalkable(bx, bz);
    if (!s || !e) return null;
    gen++;
    const si = idx(s[0], s[1]), ei = idx(e[0], e[1]);
    const heap = []; // [f, i]
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    const h = (i) => { const x = i % nx, z = (i / nx) | 0; const dx = Math.abs(x - e[0]), dz = Math.abs(z - e[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    g[si] = 0; opened[si] = gen; came[si] = -1;
    push(h(si), si);
    let found = false, iter = 0;
    while (heap.length && iter++ < 20000) {
      const [, cur] = pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === ei) { found = true; break; }
      const cx = cur % nx, cz = (cur / nx) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (!ok(x, z)) continue;
        if (dx && dz && (!ok(cx + dx, cz) || !ok(cx, cz + dz))) continue;
        const ni = idx(x, z);
        if (closed[ni] === gen) continue;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (opened[ni] !== gen || ng < g[ni]) {
          opened[ni] = gen; g[ni] = ng; came[ni] = cur;
          push(ng + h(ni), ni);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = ei; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map(i => center(i % nx, (i / nx) | 0));
    const [tbx, tbz] = toCell(bx, bz);
    if (ok(tbx, tbz)) pts[pts.length - 1] = { x: bx, z: bz };
    // Glätten
    const out = [];
    let anchor = { x: ax, z: az };
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = Math.min(pts.length - 1, k + 25); j > k; j--) {
        if (lineWalkable(anchor, pts[j])) { far = j; break; }
      }
      out.push(pts[far]);
      anchor = pts[far];
      k = far + 1;
    }
    return out;
  }

  function randomWalkable(filter) {
    for (let i = 0; i < 200; i++) {
      const ix = Math.floor(Math.random() * nx), iz = Math.floor(Math.random() * nz);
      if (!ok(ix, iz)) continue;
      const c = center(ix, iz);
      if (!filter || filter(c)) return c;
    }
    return center(Math.floor(nx / 2), Math.floor(nz / 2));
  }

  return { findPath, randomWalkable, nearestWalkable, lineWalkable, walk, nx, nz, cell, minX, minZ };
}
