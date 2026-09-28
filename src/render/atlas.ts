import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { SHAPE_IDS, shapeGeometry, type ShapePath } from '../content/shapes.ts';
import type { ShapeId } from '../content/types.ts';

/**
 * Every shape baked once, in white, into one canvas texture; colour comes from the particle tint.
 * Canvas 2D gives antialiasing and a real blurred glow (shadowBlur) for free.
 *
 * Shapes are baked at several radii ("buckets", √2 apart) instead of one big texture that gets
 * scaled: that keeps the contour width and glow within ±20 % of nominal at every enemy size.
 * All cells share one TextureSource, which ParticleContainer requires.
 */

export type ShapeStyle = 0 | 1;
/** Contour + faint fill: enemies. */
export const OUTLINE: ShapeStyle = 0;
/** Filled (or stroked for line shapes): projectiles, crystals, pickups, VFX. */
export const SOLID: ShapeStyle = 1;

/** Texture pixels per world unit; covers camera zoom up to ~2 crisply. */
const RES = 2;
const ATLAS_WIDTH = 4096;
const BUCKET_BASE = 6;
/** Outline buckets 6 … 68, solid buckets 6 … 34 (bigger ones scale up the largest). */
const BUCKET_COUNT: Record<ShapeStyle, number> = { 0: 8, 1: 6 };
const STROKE = 2.2;
const LINE_STROKE = 2.6;
const OUTLINE_FILL = 0.16;

const OUTLINE_SHAPES: readonly ShapeId[] = [
  'circle',
  'triangle',
  'square',
  'diamond',
  'pentagon',
  'hexagon',
  'star5',
];

export interface AtlasCell {
  readonly texture: Texture;
  /** Shape radius baked into the cell, in world units. Particle scale = wanted radius / radius. */
  readonly radius: number;
}

const SHAPE_INDEX = Object.fromEntries(SHAPE_IDS.map((id, i) => [id, i])) as Record<
  ShapeId,
  number
>;

export function bucketRadius(k: number): number {
  return BUCKET_BASE * 2 ** (k / 2);
}

function glowFor(radius: number): number {
  return Math.min(7, Math.max(2.5, radius * 0.3));
}

/** Largest distance of the unit geometry from its centre. */
function extent(paths: readonly ShapePath[]): number {
  let m = 0;
  for (const p of paths) {
    if (p.kind === 'circle') m = Math.max(m, Math.hypot(p.x, p.y) + p.r);
    else {
      const pts = p.kind === 'poly' ? p.points : p.segments;
      for (let i = 0; i < pts.length; i += 2) m = Math.max(m, Math.hypot(pts[i]!, pts[i + 1]!));
    }
  }
  return m;
}

function toPath2D(p: ShapePath, r: number): Path2D {
  const path = new Path2D();
  if (p.kind === 'poly') {
    for (let i = 0; i < p.points.length; i += 2) {
      const x = p.points[i]! * r;
      const y = p.points[i + 1]! * r;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
  } else if (p.kind === 'circle') {
    path.arc(p.x * r, p.y * r, p.r * r, 0, Math.PI * 2);
  } else {
    for (let i = 0; i < p.segments.length; i += 4) {
      path.moveTo(p.segments[i]! * r, p.segments[i + 1]! * r);
      path.lineTo(p.segments[i + 2]! * r, p.segments[i + 3]! * r);
    }
  }
  return path;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  paths: readonly ShapePath[],
  r: number,
  style: ShapeStyle,
): void {
  // shadowBlur is in device pixels and ignores the transform.
  const glow = glowFor(r) * RES;
  for (const p of paths) {
    const path = toPath2D(p, r);
    const filled = p.kind !== 'lines' && p.fill;
    if (filled) {
      ctx.globalAlpha = style === OUTLINE ? OUTLINE_FILL : 1;
      ctx.shadowBlur = style === OUTLINE ? 0 : glow;
      ctx.fill(path);
    }
    if (style === OUTLINE || !filled) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = p.kind === 'lines' ? LINE_STROKE : STROKE;
      // Two blurred passes build up the neon halo, the last one keeps the edge crisp.
      ctx.shadowBlur = glow;
      ctx.stroke(path);
      ctx.stroke(path);
      ctx.shadowBlur = 0;
      ctx.stroke(path);
    }
  }
}

interface Job {
  style: ShapeStyle;
  shape: ShapeId;
  k: number;
  r: number;
  /** Square cell size in pixels, including a 1 px gutter on each side. */
  size: number;
  x: number;
  y: number;
}

export class ShapeAtlas {
  /** Whole-atlas texture; ParticleContainers take their source from it. */
  readonly base: Texture;
  /** [style][shape index][bucket] */
  private readonly cells: AtlasCell[][][];

  constructor() {
    const jobs: Job[] = [];
    for (const style of [OUTLINE, SOLID]) {
      const shapes = style === OUTLINE ? OUTLINE_SHAPES : SHAPE_IDS;
      for (const shape of shapes) {
        const ext = extent(shapeGeometry(shape));
        for (let k = 0; k < BUCKET_COUNT[style]; k++) {
          const r = bucketRadius(k);
          const half = r * ext + glowFor(r) * 1.8 + LINE_STROKE;
          jobs.push({ style, shape, k, r, size: Math.ceil(half * 2 * RES) + 2, x: 0, y: 0 });
        }
      }
    }

    // Shelf packing, tallest first.
    jobs.sort((a, b) => b.size - a.size);
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const job of jobs) {
      if (x + job.size > ATLAS_WIDTH) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      job.x = x;
      job.y = y;
      x += job.size;
      shelf = Math.max(shelf, job.size);
    }
    const height = Math.ceil((y + shelf) / 4) * 4;

    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available.');
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const job of jobs) {
      const c = job.size / 2;
      ctx.setTransform(RES, 0, 0, RES, job.x + c, job.y + c);
      drawCell(ctx, shapeGeometry(job.shape), job.r, job.style);
    }

    const source = new CanvasSource({ resource: canvas, resolution: RES });
    this.base = new Texture({ source });
    this.cells = [0, 1].map(() => SHAPE_IDS.map(() => []));
    // Buckets were pushed in order per style/shape, but sorting shuffled them: index explicitly.
    for (const job of jobs) {
      const frame = new Rectangle(
        (job.x + 1) / RES,
        (job.y + 1) / RES,
        (job.size - 2) / RES,
        (job.size - 2) / RES,
      );
      this.cells[job.style]![SHAPE_INDEX[job.shape]]![job.k] = {
        texture: new Texture({ source, frame }),
        radius: job.r,
      };
    }
  }

  /** Cell whose baked radius is closest to `r`; outline falls back to solid for line shapes. */
  cell(style: ShapeStyle, shape: ShapeId, r: number): AtlasCell {
    let list = this.cells[style]![SHAPE_INDEX[shape]]!;
    if (list.length === 0) list = this.cells[SOLID]![SHAPE_INDEX[shape]]!;
    let k = Math.round(2 * Math.log2(r / BUCKET_BASE));
    if (k < 0) k = 0;
    else if (k >= list.length) k = list.length - 1;
    return list[k]!;
  }
}
