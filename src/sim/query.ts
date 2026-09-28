import { BOSS, CAPS } from '../content/tuning.ts';
import { polygonDist, segmentHitsCircle, segmentHitsPolygon } from './math/geometry.ts';
import type { Enemy, World } from './world.ts';

/**
 * Collision queries over the spatial hash plus the boss list. Results are written into
 * caller-owned arrays so nothing is allocated per query; callers must not nest two queries that
 * share an output array.
 */

const idx = new Int32Array(CAPS.enemies);
const scratch: Enemy[] = [];
const dists = new Float64Array(32);

/** Distance from a point to a boss piece's triangle, 0 inside: bosses are hit on their real shape. */
export function bossDist(e: Enemy, x: number, y: number): number {
  return polygonDist(x, y, e.x, e.y, 3, BOSS.radius[e.boss] ?? e.r, e.rot);
}

/** Alive enemies whose body overlaps the query circle (boss pieces by their triangle). */
export function enemiesInCircle(w: World, x: number, y: number, r: number, out: Enemy[]): number {
  const items = w.enemies.items;
  const n = w.hash.queryCircle(x, y, r, idx);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const e = items[idx[i]!]!;
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const rr = r + e.r;
    if (dx * dx + dy * dy <= rr * rr) out[k++] = e;
  }
  for (const e of w.bosses) {
    if (e.alive && bossDist(e, x, y) <= r) out[k++] = e;
  }
  return k;
}

/** Alive enemies touching a segment thickened by `halfWidth` (beams, dash lines). */
export function enemiesNearSegment(
  w: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  halfWidth: number,
  out: Enemy[],
): number {
  const items = w.enemies.items;
  const n = w.hash.queryRect(
    Math.min(x1, x2) - halfWidth,
    Math.min(y1, y2) - halfWidth,
    Math.max(x1, x2) + halfWidth,
    Math.max(y1, y2) + halfWidth,
    idx,
  );
  let k = 0;
  for (let i = 0; i < n; i++) {
    const e = items[idx[i]!]!;
    if (e.alive && segmentHitsCircle(x1, y1, x2, y2, halfWidth, e.x, e.y, e.r)) out[k++] = e;
  }
  for (const e of w.bosses) {
    if (!e.alive) continue;
    const R = BOSS.radius[e.boss] ?? e.r;
    if (segmentHitsPolygon(x1, y1, x2, y2, halfWidth, e.x, e.y, 3, R, e.rot)) out[k++] = e;
  }
  return k;
}

/** Up to `k` nearest enemies within `maxR`, nearest first. */
export function nearestEnemies(
  w: World,
  x: number,
  y: number,
  maxR: number,
  k: number,
  out: Enemy[],
): number {
  const want = Math.min(k, dists.length);
  if (want <= 0) return 0;
  const n = enemiesInCircle(w, x, y, maxR, scratch);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const e = scratch[i]!;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (m === want && d >= dists[m - 1]!) continue;
    // Insertion into the small sorted prefix.
    let j = m < want ? m++ : m - 1;
    while (j > 0 && dists[j - 1]! > d) {
      dists[j] = dists[j - 1]!;
      out[j] = out[j - 1]!;
      j--;
    }
    dists[j] = d;
    out[j] = e;
  }
  return m;
}
