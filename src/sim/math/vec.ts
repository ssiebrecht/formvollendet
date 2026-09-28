/** Allocation-free vector helpers. Hot loops pass plain numbers; `Vec` is only used as an out-param. */
export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Writes (x, y) normalised and scaled into `out`. A zero vector stays zero. */
export function setNorm(out: Vec, x: number, y: number, scale = 1): Vec {
  const l = Math.sqrt(x * x + y * y);
  if (l < 1e-9) {
    out.x = 0;
    out.y = 0;
  } else {
    out.x = (x / l) * scale;
    out.y = (y / l) * scale;
  }
  return out;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Shortest signed difference b - a between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}
