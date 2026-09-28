import { describe, expect, it } from 'vitest';
import { xpForLevel } from '../src/content/tuning.ts';
import { Rng } from '../src/sim/math/rng.ts';
import {
  pointSegmentDist2,
  polygonDist,
  regularPolygon,
  segmentHitsCircle,
  segmentHitsPolygon,
  vertexAngle,
} from '../src/sim/math/geometry.ts';
import { angleDiff, setNorm } from '../src/sim/math/vec.ts';
import { Pool } from '../src/sim/pool.ts';
import { SpatialHash } from '../src/sim/spatialHash.ts';

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs between seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 50 }, () => a.nextU32() === b.nextU32()).filter(Boolean);
    expect(same.length).toBeLessThan(3);
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]!++;
    }
    for (const b of buckets) expect(Math.abs(b - 2000)).toBeLessThan(250);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(6);
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
    }
  });

  it('pick throws on empty lists', () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });
});

describe('geometry', () => {
  it('vertex 0 points up', () => {
    const a = vertexAngle(0, 3, 0);
    expect(Math.cos(a)).toBeCloseTo(0);
    expect(Math.sin(a)).toBeCloseTo(-1);
  });

  it('segment distance and circle hits', () => {
    expect(pointSegmentDist2(5, 5, 0, 0, 10, 0)).toBeCloseTo(25);
    expect(pointSegmentDist2(-3, 4, 0, 0, 10, 0)).toBeCloseTo(25);
    expect(segmentHitsCircle(0, 0, 100, 0, 4, 50, 10, 6)).toBe(true);
    expect(segmentHitsCircle(0, 0, 100, 0, 4, 50, 11, 6)).toBe(false);
  });

  /** Reference: distance to the nearest edge, 0 when inside (all edge tests on the inner side). */
  function bruteDist(px: number, py: number, n: number, R: number, rot: number): number {
    const c = new Array<number>(n * 2);
    regularPolygon(n, R, rot, 0, 0, c);
    let inside = true;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [ax, ay, bx, by] = [c[i * 2]!, c[i * 2 + 1]!, c[j * 2]!, c[j * 2 + 1]!];
      if ((bx - ax) * (py - ay) - (by - ay) * (px - ax) < 0) inside = false;
      best = Math.min(best, Math.sqrt(pointSegmentDist2(px, py, ax, ay, bx, by)));
    }
    return inside ? 0 : best;
  }

  it('measures the distance to a regular polygon exactly', () => {
    // Triangle with circumradius 100, corner 0 up: inside, corner, edge midpoint, beyond a corner.
    expect(polygonDist(0, 0, 0, 0, 3, 100, 0)).toBe(0);
    expect(polygonDist(0, -99, 0, 0, 3, 100, 0)).toBe(0);
    expect(polygonDist(0, 80, 0, 0, 3, 100, 0)).toBeCloseTo(30);
    expect(polygonDist(0, -130, 0, 0, 3, 100, 0)).toBeCloseTo(30);
    // A point next to a corner is inside the old 60 % circle's miss zone but touches the shape.
    expect(polygonDist(0, -95, 0, 0, 3, 100, 0)).toBe(0);
    const r = new Rng(9);
    for (let i = 0; i < 2000; i++) {
      const n = 3 + r.int(4);
      const R = r.range(20, 150);
      const rot = r.range(-10, 10);
      const x = r.range(-2, 2) * R;
      const y = r.range(-2, 2) * R;
      expect(polygonDist(x + 7, y - 3, 7, -3, n, R, rot)).toBeCloseTo(
        bruteDist(x, y, n, R, rot),
        6,
      );
    }
  });

  it('hits a polygon with a thick segment like dense sampling does', () => {
    const r = new Rng(4);
    let hits = 0;
    for (let i = 0; i < 600; i++) {
      const rot = r.range(0, 7);
      const [x1, y1, x2, y2] = [
        r.range(-300, 300),
        r.range(-300, 300),
        r.range(-300, 300),
        r.range(-300, 300),
      ];
      const hw = r.range(0, 12);
      let d = Infinity;
      for (let k = 0; k <= 4000; k++) {
        const t = k / 4000;
        d = Math.min(d, bruteDist(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 3, 100, rot));
      }
      if (Math.abs(d - hw) < 0.5) continue;
      const hit = segmentHitsPolygon(x1, y1, x2, y2, hw, 0, 0, 3, 100, rot);
      expect(hit).toBe(d <= hw);
      if (hit) hits++;
    }
    expect(hits).toBeGreaterThan(100);
  });

  it('vector helpers', () => {
    const v = setNorm({ x: 0, y: 0 }, 3, 4, 10);
    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
    expect(setNorm({ x: 1, y: 1 }, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
});

describe('Pool', () => {
  interface Item {
    alive: boolean;
    id: number;
    v: number;
  }
  const make = (): Pool<Item> => new Pool<Item>(4, () => ({ alive: false, id: 0, v: 0 }));

  it('spawns until full and hands out unique ids', () => {
    const p = make();
    const ids = new Set<number>();
    for (let i = 0; i < 4; i++) ids.add(p.spawn()!.id);
    expect(ids.size).toBe(4);
    expect(p.spawn()).toBeNull();
  });

  it('compacts dead items out and recycles them', () => {
    const p = make();
    const items = [p.spawn()!, p.spawn()!, p.spawn()!];
    items.forEach((it, i) => (it.v = i));
    items[0]!.alive = false;
    items[2]!.alive = false;
    p.compact();
    expect(p.count).toBe(1);
    expect(p.items[0]!.v).toBe(1);
    const again = p.spawn()!;
    expect(again.alive).toBe(true);
    expect(p.aliveCount()).toBe(2);
    p.clear();
    expect(p.count).toBe(0);
  });
});

describe('SpatialHash', () => {
  it('finds exactly what brute force finds', () => {
    const rng = new Rng(3);
    const n = 800;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const rs = new Float64Array(n);
    const h = new SpatialHash(64, n);
    for (let i = 0; i < n; i++) {
      xs[i] = rng.range(-3000, 3000);
      ys[i] = rng.range(-3000, 3000);
      rs[i] = rng.range(4, 40);
      h.insert(i, xs[i]!, ys[i]!, rs[i]!);
    }
    const out = new Int32Array(n);
    for (let q = 0; q < 200; q++) {
      const x = rng.range(-3000, 3000);
      const y = rng.range(-3000, 3000);
      const r = rng.range(5, 300);
      const k = h.queryCircle(x, y, r, out);
      const found = new Set<number>();
      for (let i = 0; i < k; i++) {
        const j = out[i]!;
        expect(found.has(j)).toBe(false);
        const rr = r + rs[j]!;
        if ((xs[j]! - x) ** 2 + (ys[j]! - y) ** 2 <= rr * rr) found.add(j);
      }
      for (let j = 0; j < n; j++) {
        const rr = r + rs[j]!;
        const hit = (xs[j]! - x) ** 2 + (ys[j]! - y) ** 2 <= rr * rr;
        expect(found.has(j)).toBe(hit);
      }
    }
  });

  it('handles negative coordinates and clears', () => {
    const h = new SpatialHash(64, 4);
    h.insert(0, -65, -1, 5);
    const out = new Int32Array(4);
    expect(h.queryCircle(-64, 0, 4, out)).toBe(1);
    h.clear();
    expect(h.queryCircle(-64, 0, 4, out)).toBe(0);
  });
});

describe('xp curve', () => {
  it('grows monotonically with steeper segments later', () => {
    expect(xpForLevel(1)).toBe(5);
    expect(xpForLevel(2)).toBe(15);
    for (let l = 1; l < 80; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    expect(xpForLevel(41) - xpForLevel(40)).toBeGreaterThan(xpForLevel(21) - xpForLevel(20));
  });
});
