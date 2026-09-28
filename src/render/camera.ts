import type { Container } from 'pixi.js';

/** Reference resolution: the playfield always shows at least 1280×720 world units. */
export const VIEW_W = 1280;
export const VIEW_H = 720;
const MAX_SHAKE = 14;
const TRAUMA_DECAY = 1.8;

/**
 * Follows the player 1:1 (bullet heaven needs exact positional feedback) and adds trauma-based
 * screen shake: offset grows with trauma², trauma decays linearly.
 */
export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  screenW = VIEW_W;
  screenH = VIEW_H;
  private trauma = 0;
  private shakeX = 0;
  private shakeY = 0;
  private time = 0;

  resize(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
    this.scale = Math.min(width / VIEW_W, height / VIEW_H);
  }

  /** Half extents of the visible world area. */
  get halfW(): number {
    return this.screenW / 2 / this.scale;
  }

  get halfH(): number {
    return this.screenH / 2 / this.scale;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, shakeEnabled: boolean): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    if (!shakeEnabled || this.trauma <= 0) {
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    // Sum of incommensurate sines: smooth, never repeats visibly, no RNG needed.
    const t = this.time * 38;
    const amp = MAX_SHAKE * this.trauma * this.trauma;
    this.shakeX = amp * (Math.sin(t) * 0.6 + Math.sin(t * 2.31 + 1.7) * 0.4);
    this.shakeY = amp * (Math.sin(t * 1.13 + 4.1) * 0.6 + Math.sin(t * 2.87 + 0.3) * 0.4);
  }

  /** Positions a world-space container so (x, y) sits at the screen centre. */
  apply(world: Container): void {
    const s = this.scale;
    world.scale.set(s);
    world.position.set(
      this.screenW / 2 - (this.x + this.shakeX) * s,
      this.screenH / 2 - (this.y + this.shakeY) * s,
    );
  }

  /** Screen-space x of the world origin, used by the tiling background. */
  get originX(): number {
    return this.screenW / 2 - (this.x + this.shakeX) * this.scale;
  }

  get originY(): number {
    return this.screenH / 2 - (this.y + this.shakeY) * this.scale;
  }

  toScreenX(wx: number): number {
    return this.originX + wx * this.scale;
  }

  toScreenY(wy: number): number {
    return this.originY + wy * this.scale;
  }
}
