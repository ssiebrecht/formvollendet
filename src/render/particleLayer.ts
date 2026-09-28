import { type BLEND_MODES, Particle, ParticleContainer } from 'pixi.js';
import type { AtlasCell, ShapeAtlas } from './atlas.ts';

/**
 * Immediate-mode wrapper around a ParticleContainer: every frame the views call `begin`, push one
 * quad per visible entity and `end`. Particle objects are pooled, so steady state allocates nothing.
 */
export class ParticleLayer {
  readonly container: ParticleContainer;
  private readonly pool: Particle[] = [];
  private n = 0;

  constructor(atlas: ShapeAtlas, blendMode: BLEND_MODES = 'normal') {
    this.container = new ParticleContainer({
      texture: atlas.base,
      dynamicProperties: { vertex: true, position: true, rotation: true, uvs: true, color: true },
    });
    this.container.blendMode = blendMode;
  }

  get count(): number {
    return this.n;
  }

  begin(): void {
    this.n = 0;
  }

  /** Quad with uniform scale so the shape's radius is `r` world units. */
  push(
    cell: AtlasCell,
    x: number,
    y: number,
    r: number,
    rotation: number,
    color: number,
  ): Particle {
    const s = r / cell.radius;
    return this.pushScaled(cell, x, y, s, s, rotation, color);
  }

  pushScaled(
    cell: AtlasCell,
    x: number,
    y: number,
    scaleX: number,
    scaleY: number,
    rotation: number,
    color: number,
  ): Particle {
    let p = this.pool[this.n];
    if (!p) {
      p = new Particle({ texture: cell.texture, anchorX: 0.5, anchorY: 0.5 });
      this.pool.push(p);
    }
    p.texture = cell.texture;
    p.x = x;
    p.y = y;
    p.scaleX = scaleX;
    p.scaleY = scaleY;
    p.rotation = rotation;
    p.color = color;
    const children = this.container.particleChildren;
    if (children[this.n] !== p) children[this.n] = p;
    this.n++;
    return p;
  }

  end(): void {
    const children = this.container.particleChildren;
    if (children.length !== this.n) children.length = this.n;
    this.container.visible = this.n > 0;
    this.container.update();
  }
}
