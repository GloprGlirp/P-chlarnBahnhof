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

  // Zellen mit freien Nachbarn – für schnelle Sichtlinien-Prüfung beim Glätten
  const clear = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    clear[idx(ix, iz)] = ok(ix, iz) && ok(ix + 1, iz) && ok(ix - 1, iz) && ok(ix, iz + 1) && ok(ix, iz - 1) ? 1 : 0;
  }
  function lineWalkable(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 0.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor((a.x + dx * t - minX) / cell), cz = Math.floor((a.z + dz * t - minZ) / cell);
      if (cx < 0 || cz < 0 || cx >= nx || cz >= nz || !clear[cz * nx + cx]) return false;
    }
    return true;
  }

  const N = nx * nz;
  const g = new Float32Array(N);
  const came = new Int32Array(N);
  const closed = new Uint32Array(N);
  const opened = new Uint32Array(N);
  const heapF = new Float32Array(N * 4);
  const heapI = new Int32Array(N * 4);
  let gen = 0;

  function findPath(ax, az, bx, bz) {
    const s = nearestWalkable(ax, az), e = nearestWalkable(bx, bz);
    if (!s || !e) return null;
    gen++;
    const si = idx(s[0], s[1]), ei = idx(e[0], e[1]);
    const ex = e[0], ez = e[1];
    let hn = 0;
    const push = (f, i) => {
      if (hn >= heapF.length) return;
      let k = hn++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p] <= f) break;
        heapF[k] = heapF[p]; heapI[k] = heapI[p]; k = p;
      }
      heapF[k] = f; heapI[k] = i;
    };
    const pop = () => {
      const top = heapI[0];
      hn--;
      if (hn > 0) {
        const f = heapF[hn], it = heapI[hn];
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = -1, mf = f;
          if (l < hn && heapF[l] < mf) { m = l; mf = heapF[l]; }
          if (r < hn && heapF[r] < mf) { m = r; mf = heapF[r]; }
          if (m < 0) break;
          heapF[k] = heapF[m]; heapI[k] = heapI[m]; k = m;
        }
        heapF[k] = f; heapI[k] = it;
      }
      return top;
    };
    // leicht gewichtete Heuristik -> deutlich weniger untersuchte Zellen
    const h = (x, z) => { const dx = Math.abs(x - ex), dz = Math.abs(z - ez); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * 1.25; };
    g[si] = 0; opened[si] = gen; came[si] = -1;
    push(h(s[0], s[1]), si);
    let found = false, iter = 0;
    while (hn > 0 && iter++ < 6000) {
      const cur = pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === ei) { found = true; break; }
      const cx = cur % nx, cz = (cur / nx) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (!ok(x, z)) continue;
        if (dx && dz && (!ok(cx + dx, cz) || !ok(cx, cz + dz))) continue;
        const ni = z * nx + x;
        if (closed[ni] === gen) continue;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (opened[ni] !== gen || ng < g[ni]) {
          opened[ni] = gen; g[ni] = ng; came[ni] = cur;
          push(ng + h(x, z), ni);
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
    // Glätten: so weit wie möglich geradeaus
    const out = [];
    let anchor = { x: ax, z: az };
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = k + 1; j < pts.length && j <= k + 30; j++) {
        if (lineWalkable(anchor, pts[j])) far = j; else break;
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
