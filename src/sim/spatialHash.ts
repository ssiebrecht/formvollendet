/**
 * Uniform-grid spatial hash for an unbounded plane. Cells are hashed into a fixed bucket table and
 * chained through typed arrays, so rebuilding every tick allocates nothing. Entries are pool indices.
 * Each entry remembers its cell, which filters out foreign cells that share a bucket and guarantees
 * every entry is reported at most once per query.
 */
export class SpatialHash {
  private readonly inv: number;
  private readonly mask: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private readonly cellX: Int32Array;
  private readonly cellY: Int32Array;
  /** Largest radius inserted since the last clear; queries grow by it so big entities are not missed. */
  maxRadius = 0;
  readonly cellSize: number;

  constructor(cellSize: number, capacity: number, bucketBits = 12) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
    this.mask = (1 << bucketBits) - 1;
    this.head = new Int32Array(1 << bucketBits).fill(-1);
    this.next = new Int32Array(capacity);
    this.cellX = new Int32Array(capacity);
    this.cellY = new Int32Array(capacity);
  }

  clear(): void {
    this.head.fill(-1);
    this.maxRadius = 0;
  }

  insert(index: number, x: number, y: number, radius: number): void {
    const cx = Math.floor(x * this.inv);
    const cy = Math.floor(y * this.inv);
    const b = this.bucket(cx, cy);
    this.cellX[index] = cx;
    this.cellY[index] = cy;
    this.next[index] = this.head[b]!;
    this.head[b] = index;
    if (radius > this.maxRadius) this.maxRadius = radius;
  }

  /** Candidates whose cell overlaps the circle grown by `maxRadius`. Exact tests are the caller's job. */
  queryCircle(x: number, y: number, r: number, out: Int32Array): number {
    const rr = r + this.maxRadius;
    return this.queryRect(x - rr, y - rr, x + rr, y + rr, out, false);
  }

  /** Candidates in an axis-aligned box. `grow` adds `maxRadius` on every side. */
  queryRect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: Int32Array,
    grow = true,
  ): number {
    const g = grow ? this.maxRadius : 0;
    const x0 = Math.floor((minX - g) * this.inv);
    const y0 = Math.floor((minY - g) * this.inv);
    const x1 = Math.floor((maxX + g) * this.inv);
    const y1 = Math.floor((maxY + g) * this.inv);
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.head[this.bucket(cx, cy)]!; i !== -1; i = this.next[i]!) {
          if (this.cellX[i] === cx && this.cellY[i] === cy && n < out.length) out[n++] = i;
        }
      }
    }
    return n;
  }

  private bucket(cx: number, cy: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.mask;
  }
}
