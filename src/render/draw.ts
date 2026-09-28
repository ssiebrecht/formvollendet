import type { Graphics } from 'pixi.js';
import { shapeGeometry } from '../content/shapes.ts';
import type { ShapeId } from '../content/types.ts';

/**
 * Immediate Graphics helpers. Paths are always traced with moveTo/lineTo: Pixi keeps a reference
 * to arrays passed to `poly()` and triangulates later, so reused scratch arrays would corrupt it.
 * Every stroke pass needs its own trace because fill/stroke consume the current path.
 */

const HALO_WIDE = 10;
const HALO_NEAR = 5;

function tracePoints(g: Graphics, pts: ArrayLike<number>, n: number, closed: boolean): void {
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 1; i < n; i++) g.lineTo(pts[i * 2]!, pts[i * 2 + 1]!);
  if (closed) g.closePath();
}

/** Polyline or polygon (`n` points as x,y pairs) with a two-pass halo. */
export function neonPath(
  g: Graphics,
  pts: ArrayLike<number>,
  n: number,
  closed: boolean,
  width: number,
  color: number,
  alpha: number,
  glow = 1,
): void {
  if (n < 2) return;
  if (glow > 0) {
    tracePoints(g, pts, n, closed);
    g.stroke({
      width: width + HALO_WIDE * glow,
      color,
      alpha: alpha * 0.07,
      join: 'round',
      cap: 'round',
    });
    tracePoints(g, pts, n, closed);
    g.stroke({
      width: width + HALO_NEAR * glow,
      color,
      alpha: alpha * 0.16,
      join: 'round',
      cap: 'round',
    });
  }
  tracePoints(g, pts, n, closed);
  g.stroke({ width, color, alpha, join: 'round', cap: 'round' });
}

export function neonCircle(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  width: number,
  color: number,
  alpha: number,
  glow = 1,
): void {
  if (r <= 0) return;
  if (glow > 0) {
    g.circle(x, y, r).stroke({ width: width + HALO_WIDE * glow, color, alpha: alpha * 0.07 });
    g.circle(x, y, r).stroke({ width: width + HALO_NEAR * glow, color, alpha: alpha * 0.16 });
  }
  g.circle(x, y, r).stroke({ width, color, alpha });
}

export function neonLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: number,
  alpha: number,
  glow = 1,
): void {
  if (glow > 0) {
    g.moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke({ width: width + HALO_WIDE * glow, color, alpha: alpha * 0.07, cap: 'round' });
    g.moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke({ width: width + HALO_NEAR * glow, color, alpha: alpha * 0.16, cap: 'round' });
  }
  g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width, color, alpha, cap: 'round' });
}

/** Draws a content shape (rotated, radius `r`) with fill where the geometry asks for it. */
export function drawShape(
  g: Graphics,
  id: ShapeId,
  x: number,
  y: number,
  r: number,
  rot: number,
  color: number,
  alpha: number,
  width = 1.5,
  fillAlpha = 0.9,
): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const p of shapeGeometry(id)) {
    if (p.kind === 'poly') {
      const pts = p.points;
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i]! * r;
        const py = pts[i + 1]! * r;
        const tx = x + px * c - py * s;
        const ty = y + px * s + py * c;
        if (i === 0) g.moveTo(tx, ty);
        else g.lineTo(tx, ty);
      }
      g.closePath();
      if (p.fill) g.fill({ color, alpha: alpha * fillAlpha });
      g.stroke({ width, color, alpha, join: 'round' });
    } else if (p.kind === 'circle') {
      g.circle(x + (p.x * c - p.y * s) * r, y + (p.x * s + p.y * c) * r, p.r * r);
      if (p.fill) g.fill({ color, alpha: alpha * fillAlpha });
      g.stroke({ width, color, alpha });
    } else {
      const seg = p.segments;
      for (let i = 0; i < seg.length; i += 4) {
        const ax = seg[i]! * r;
        const ay = seg[i + 1]! * r;
        const bx = seg[i + 2]! * r;
        const by = seg[i + 3]! * r;
        g.moveTo(x + ax * c - ay * s, y + ax * s + ay * c).lineTo(
          x + bx * c - by * s,
          y + bx * s + by * c,
        );
      }
      g.stroke({ width, color, alpha, cap: 'round' });
    }
  }
}
