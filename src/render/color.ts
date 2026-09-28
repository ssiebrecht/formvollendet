/** Colour helpers for the render layer. Pixi particles take a packed BGR tint with alpha in the top byte. */

export function bgr(rgb: number): number {
  return ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
}

/** Packed `Particle.color` value: BGR tint plus alpha in bits 24..31. */
export function particleColor(rgb: number, alpha: number): number {
  const a = alpha <= 0 ? 0 : alpha >= 1 ? 255 : (alpha * 255) | 0;
  return bgr(rgb) + (a << 24);
}

/** Linear blend between two RGB colours. */
export function mixColor(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t;
  const g = ((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t;
  const bl = (a & 0xff) + ((b & 0xff) - (a & 0xff)) * t;
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
}

export function css(rgb: number, alpha = 1): string {
  return `rgba(${(rgb >> 16) & 0xff},${(rgb >> 8) & 0xff},${rgb & 0xff},${alpha})`;
}
