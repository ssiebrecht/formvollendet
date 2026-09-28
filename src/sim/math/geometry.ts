import { TAU } from './vec.ts';

/**
 * Corner angle of vertex `i` of a regular n-gon. Vertex 0 points "up" (screen space, -y) before
 * rotation, so a triangle stands on its base like the logo.
 */
export function vertexAngle(i: number, n: number, rotation: number): number {
  return rotation - Math.PI / 2 + (i * TAU) / n;
}

/** Writes the corner points of a regular n-gon as x,y pairs into `out` (length >= 2n). */
export function regularPolygon(
  n: number,
  radius: number,
  rotation: number,
  cx: number,
  cy: number,
  out: Float64Array | number[],
): void {
  for (let i = 0; i < n; i++) {
    const a = vertexAngle(i, n, rotation);
    out[i * 2] = cx + Math.cos(a) * radius;
    out[i * 2 + 1] = cy + Math.sin(a) * radius;
  }
}

/** Squared distance from point (px, py) to segment (x1, y1)-(x2, y2). */
export function pointSegmentDist2(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = x1 + dx * t - px;
  const qy = y1 + dy * t - py;
  return qx * qx + qy * qy;
}

/** True when a circle touches a segment thickened by `halfWidth`. */
export function segmentHitsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  halfWidth: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const reach = r + halfWidth;
  return pointSegmentDist2(cx, cy, x1, y1, x2, y2) <= reach * reach;
}

/**
 * Distance from point (px, py) to a regular n-gon centred on (cx, cy), 0 inside. `radius` is the
 * circumradius, corners sit where `vertexAngle` puts them. The point is folded into the angular
 * sector of one edge, which is then the nearest part of the outline (exact for regular polygons).
 */
export function polygonDist(
  px: number,
  py: number,
  cx: number,
  cy: number,
  n: number,
  radius: number,
  rotation: number,
): number {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  const half = Math.PI / n;
  const apothem = radius * Math.cos(half);
  if (d <= apothem) return 0;
  const sector = 2 * half;
  // Angle relative to the normal of edge 0 (halfway between corners 0 and 1), folded to ±half.
  let a = Math.atan2(dy, dx) - (rotation - Math.PI / 2 + half);
  a -= Math.floor(a / sector + 0.5) * sector;
  const lx = d * Math.cos(a) - apothem;
  if (lx <= 0) return 0;
  const ly = Math.abs(d * Math.sin(a)) - radius * Math.sin(half);
  return ly <= 0 ? lx : Math.hypot(lx, ly);
}

/** True when segments a-b and c-d cross (touching counts). */
function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 <= 0 && d3 * d4 <= 0;
}

/** True when a segment thickened by `halfWidth` touches a regular n-gon (see `polygonDist`). */
export function segmentHitsPolygon(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  halfWidth: number,
  cx: number,
  cy: number,
  n: number,
  radius: number,
  rotation: number,
): boolean {
  // Cheap rejects and accepts with the circumcircle and the incircle first.
  if (!segmentHitsCircle(x1, y1, x2, y2, halfWidth, cx, cy, radius)) return false;
  if (segmentHitsCircle(x1, y1, x2, y2, halfWidth, cx, cy, radius * Math.cos(Math.PI / n))) {
    return true;
  }
  if (polygonDist(x1, y1, cx, cy, n, radius, rotation) <= halfWidth) return true;
  if (polygonDist(x2, y2, cx, cy, n, radius, rotation) <= halfWidth) return true;
  // Otherwise the closest approach is a corner near the segment, or the segment cuts a corner off.
  const hw2 = halfWidth * halfWidth;
  let a = vertexAngle(n - 1, n, rotation);
  let ax = cx + Math.cos(a) * radius;
  let ay = cy + Math.sin(a) * radius;
  for (let i = 0; i < n; i++) {
    a = vertexAngle(i, n, rotation);
    const bx = cx + Math.cos(a) * radius;
    const by = cy + Math.sin(a) * radius;
    if (pointSegmentDist2(bx, by, x1, y1, x2, y2) <= hw2) return true;
    if (segmentsCross(x1, y1, x2, y2, ax, ay, bx, by)) return true;
    ax = bx;
    ay = by;
  }
  return false;
}
