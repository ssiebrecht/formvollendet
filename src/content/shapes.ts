import type { ShapeId } from './types.ts';

/**
 * Unit-size geometry for every shape (radius ≈ 1, y points down, "up" is -y). The renderer bakes
 * these into its texture atlas and the DOM UI turns them into SVG, so both always match.
 */
export type ShapePath =
  /** Closed polygon, flat x,y list. */
  | { kind: 'poly'; points: readonly number[]; fill: boolean }
  | { kind: 'circle'; x: number; y: number; r: number; fill: boolean }
  /** Open strokes as x1,y1,x2,y2 quads. */
  | { kind: 'lines'; segments: readonly number[] };

export function ngon(n: number, r = 1, rotation = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rotation - Math.PI / 2 + (i * Math.PI * 2) / n;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

export function starPolygon(spikes: number, outer = 1, inner = 0.45, rotation = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / spikes;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

const poly = (points: readonly number[], fill = true): ShapePath => ({
  kind: 'poly',
  points,
  fill,
});
const circle = (r: number, fill = true, x = 0, y = 0): ShapePath => ({
  kind: 'circle',
  x,
  y,
  r,
  fill,
});
const lines = (segments: readonly number[]): ShapePath => ({ kind: 'lines', segments });

/** Isometric wire cube (the "chest"). */
function cube(): ShapePath[] {
  const t = ngon(6, 1);
  const segs: number[] = [];
  for (let i = 0; i < 6; i++)
    segs.push(t[i * 2]!, t[i * 2 + 1]!, t[((i + 1) % 6) * 2]!, t[((i + 1) % 6) * 2 + 1]!);
  // Three inner edges meet in the centre: top-front corner of the cube.
  for (const i of [1, 3, 5]) segs.push(0, 0, t[i * 2]!, t[i * 2 + 1]!);
  return [lines(segs)];
}

/** Consecutive points (x,y list) as line segments. */
function polyline(pts: readonly number[]): number[] {
  const segs: number[] = [];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    segs.push(pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!);
  }
  return segs;
}

/** `periods` of a sine across the unit width, flat x,y list. */
function sinePoints(periods: number, amplitude: number): number[] {
  const pts: number[] = [];
  const steps = Math.ceil(periods * 12);
  for (let i = 0; i <= steps; i++) {
    const x = -1 + (2 * i) / steps;
    pts.push(x, -amplitude * Math.sin(Math.PI * periods * x));
  }
  return pts;
}

function ellipse(rx: number, ry: number, n: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n;
    pts.push(Math.cos(a) * rx, Math.sin(a) * ry);
  }
  return pts;
}

/** Four chevrons pointing at the centre, around a dot: everything flows inward. */
function inward(): ShapePath[] {
  const segs: number[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Chevron in local coordinates (tip toward the centre), rotated into place.
    const local = [-0.32, 0.95, 0, 0.62, 0, 0.62, 0.32, 0.95];
    for (let i = 0; i < local.length; i += 2) {
      segs.push(local[i]! * c - local[i + 1]! * s, local[i]! * s + local[i + 1]! * c);
    }
  }
  return [circle(0.24), lines(segs)];
}

/** Parabola opening downwards, apex at (0, -0.5). */
function parabola(): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = -0.9 + (1.8 * i) / 12;
    pts.push(x, -0.5 + 1.1 * x * x);
  }
  return pts;
}

/** Lemniscate of Bernoulli (the infinity sign), stretched a little in y. */
function lemniscate(n: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i * Math.PI * 2) / n;
    const d = 1 + Math.sin(t) ** 2;
    pts.push(Math.cos(t) / d, (1.2 * Math.sin(t) * Math.cos(t)) / d);
  }
  return pts;
}

/** Sierpinski triangle of depth 1: outer triangle plus the inverted middle one. */
function sierpinski(): ShapePath[] {
  const o = ngon(3, 1);
  const mid = (a: number, b: number): [number, number] => [
    (o[a * 2]! + o[b * 2]!) / 2,
    (o[a * 2 + 1]! + o[b * 2 + 1]!) / 2,
  ];
  const [ax, ay] = mid(0, 1);
  const [bx, by] = mid(1, 2);
  const [cx, cy] = mid(2, 0);
  return [poly(o), lines([ax, ay, bx, by, bx, by, cx, cy, cx, cy, ax, ay])];
}

const GEOMETRY: Record<ShapeId, readonly ShapePath[]> = {
  circle: [circle(0.9)],
  triangle: [poly(ngon(3, 1.1))],
  square: [poly(ngon(4, 1.05, Math.PI / 4))],
  diamond: [poly([0, -1.1, 0.65, 0, 0, 1.1, -0.65, 0])],
  pentagon: [poly(ngon(5, 1.02))],
  hexagon: [poly(ngon(6, 1, Math.PI / 6))],
  star5: [poly(starPolygon(5, 1.15, 0.5))],
  dart: [poly([0, -1, 0.62, 0.85, 0, 0.42, -0.62, 0.85])],
  orb: [circle(0.8)],
  wavedot: [circle(0.7)],
  fractal: sierpinski(),
  shard: [poly([0, -1.1, 0.3, 0.7, -0.3, 0.7])],
  ring: [circle(0.85, false)],
  bullet: [circle(0.85, false), circle(0.35, true)],
  gem: [poly([0, -1, 0.58, -0.1, 0, 1, -0.58, -0.1])],
  splitter: [poly([0, -1, 0.45, -0.2, 0.25, 0.9, -0.3, 0.75, -0.5, -0.1])],
  cube: cube(),
  plus: [lines([0, -0.8, 0, 0.8, -0.8, 0, 0.8, 0])],
  sigma: [
    lines([0.7, -0.8, -0.7, -0.8, -0.7, -0.8, 0.1, 0, 0.1, 0, -0.7, 0.8, -0.7, 0.8, 0.7, 0.8]),
  ],
  times: [lines([-0.7, -0.7, 0.7, 0.7, 0.7, -0.7, -0.7, 0.7])],
  divide: [lines([-0.8, 0, 0.8, 0]), circle(0.16, true, 0, -0.55), circle(0.16, true, 0, 0.55)],
  edge: [lines([-1, 0, 1, 0])],
  spark: [circle(0.5)],
  // One and a half periods: a single one, turned at a vertex, would read as an integral sign.
  sine: [lines(polyline(sinePoints(1.5, 0.42)))],
  // The Fourier series of the theorem converges to a square wave.
  squarewave: [
    lines(
      polyline([
        -1, 0.45, -0.5, 0.45, -0.5, -0.45, 0, -0.45, 0, 0.45, 0.5, 0.45, 0.5, -0.45, 1, -0.45,
      ]),
    ),
  ],
  // x^n: the caret is the power operator.
  caret: [lines(polyline([-0.8, 0.5, 0, -0.5, 0.8, 0.5]))],
  clock: [circle(0.88, false), lines([0, 0, 0, -0.58, 0, 0, 0.42, 0.24])],
  nested: [
    poly(ngon(4, 1.05, Math.PI / 4), false),
    poly(ngon(4, 0.45, Math.PI / 4)),
    lines([0.34, -0.34, 0.72, -0.72]),
  ],
  mirror: [
    lines([0, -1, 0, 1]),
    poly([-0.24, -0.55, -0.24, 0.55, -0.95, 0]),
    poly([0.24, -0.55, 0.95, 0, 0.24, 0.55]),
  ],
  sphere: [circle(0.9, false), poly(ellipse(0.9, 0.32, 16), false)],
  integral: [
    lines(
      polyline([
        0.6, -0.75, 0.38, -0.95, 0.14, -0.86, 0.03, -0.5, -0.03, 0.5, -0.14, 0.86, -0.38, 0.95,
        -0.6, 0.75,
      ]),
    ),
  ],
  chevrons: [
    lines([
      ...polyline([-0.8, -0.65, -0.15, 0, -0.8, 0.65]),
      ...polyline([0.1, -0.65, 0.75, 0, 0.1, 0.65]),
    ]),
  ],
  inward: inward(),
  // A circle and its tangent, touching in one point.
  tangent: [circle(0.62, false, 0, 0.26), lines([-1, -0.36, 1, -0.36])],
  // A curve through its maximum.
  extremum: [lines(polyline(parabola())), circle(0.17, true, 0, -0.5)],
  infinity: [poly(lemniscate(32), false)],
  dice: [
    poly(ngon(4, 1.05, Math.PI / 4), false),
    circle(0.15, true, -0.36, -0.36),
    circle(0.15, true, 0, 0),
    circle(0.15, true, 0.36, 0.36),
  ],
  // From n to n + 1.
  stairs: [
    lines(
      polyline([
        -0.9, 0.75, -0.45, 0.75, -0.45, 0.25, 0, 0.25, 0, -0.25, 0.45, -0.25, 0.45, -0.75, 0.9,
        -0.75,
      ]),
    ),
  ],
};

export function shapeGeometry(id: ShapeId): readonly ShapePath[] {
  return GEOMETRY[id];
}

export const SHAPE_IDS = Object.keys(GEOMETRY) as ShapeId[];

/** SVG path data for a shape at radius `r` around (cx, cy); strokes only, fills are flagged. */
export function shapeToSvg(id: ShapeId, r: number, cx = 0, cy = 0): { d: string; fill: boolean }[] {
  const out: { d: string; fill: boolean }[] = [];
  const f = (v: number): string => v.toFixed(2);
  for (const p of GEOMETRY[id]) {
    if (p.kind === 'poly') {
      let d = '';
      for (let i = 0; i < p.points.length; i += 2) {
        d += `${i === 0 ? 'M' : 'L'}${f(cx + p.points[i]! * r)} ${f(cy + p.points[i + 1]! * r)}`;
      }
      out.push({ d: `${d}Z`, fill: p.fill });
    } else if (p.kind === 'circle') {
      const x = cx + p.x * r;
      const y = cy + p.y * r;
      const rr = p.r * r;
      out.push({
        d: `M${f(x - rr)} ${f(y)}a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0`,
        fill: p.fill,
      });
    } else {
      let d = '';
      for (let i = 0; i < p.segments.length; i += 4) {
        d += `M${f(cx + p.segments[i]! * r)} ${f(cy + p.segments[i + 1]! * r)}L${f(cx + p.segments[i + 2]! * r)} ${f(cy + p.segments[i + 3]! * r)}`;
      }
      out.push({ d, fill: false });
    }
  }
  return out;
}
