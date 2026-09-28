import { CanvasSource, type Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { COLORS } from '../content/palette.ts';
import type { Camera } from './camera.ts';
import { css } from './color.ts';

const MINOR = 32;
const MAJOR = 160;
const RES = 2;
const TICK = 5;

/**
 * Graph paper: a tiling grid texture in screen space plus the x/y axes with tick marks in world
 * space. The axes are redrawn for the visible range only.
 */
export class Background {
  readonly grid: TilingSprite;
  readonly axes = new Graphics();
  private lastKey = '';

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = MAJOR * RES;
    canvas.height = MAJOR * RES;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available.');
    ctx.fillStyle = css(COLORS.bg);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = css(COLORS.gridMinor);
    for (let v = MINOR; v < MAJOR; v += MINOR) {
      ctx.fillRect(v * RES, 0, RES, canvas.height);
      ctx.fillRect(0, v * RES, canvas.width, RES);
    }
    ctx.fillStyle = css(COLORS.gridMajor);
    ctx.fillRect(0, 0, RES, canvas.height);
    ctx.fillRect(0, 0, canvas.width, RES);
    const texture = new Texture({
      source: new CanvasSource({ resource: canvas, resolution: RES }),
    });
    this.grid = new TilingSprite({ texture, width: 1, height: 1 });
  }

  /** `screen` holds the grid, `world` the axes. */
  attach(screen: Container, world: Container): void {
    screen.addChild(this.grid);
    world.addChild(this.axes);
  }

  update(cam: Camera): void {
    this.grid.width = cam.screenW;
    this.grid.height = cam.screenH;
    this.grid.tileScale.set(cam.scale);
    this.grid.tilePosition.set(cam.originX, cam.originY);

    // Axes only need a redraw when the visible range changes by a grid cell.
    const hw = cam.halfW + MAJOR;
    const hh = cam.halfH + MAJOR;
    const x0 = Math.floor((cam.x - hw) / MINOR) * MINOR;
    const x1 = Math.ceil((cam.x + hw) / MINOR) * MINOR;
    const y0 = Math.floor((cam.y - hh) / MINOR) * MINOR;
    const y1 = Math.ceil((cam.y + hh) / MINOR) * MINOR;
    const key = `${x0}|${x1}|${y0}|${y1}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const g = this.axes;
    g.clear();
    if (y0 <= 0 && y1 >= 0) {
      g.moveTo(x0, 0).lineTo(x1, 0);
      for (let x = x0; x <= x1; x += MINOR) {
        const t = x % MAJOR === 0 ? TICK * 2 : TICK;
        g.moveTo(x, -t).lineTo(x, t);
      }
    }
    if (x0 <= 0 && x1 >= 0) {
      g.moveTo(0, y0).lineTo(0, y1);
      for (let y = y0; y <= y1; y += MINOR) {
        const t = y % MAJOR === 0 ? TICK * 2 : TICK;
        g.moveTo(-t, y).lineTo(t, y);
      }
    }
    g.stroke({ width: 2, color: COLORS.axis, alpha: 1 });
  }
}
