import { Application, Container } from 'pixi.js';
import { COLORS } from '../content/palette.ts';
import type { SimEvent } from '../sim/events.ts';
import { playerRadius, type World } from '../sim/world.ts';
import { ShapeAtlas } from './atlas.ts';
import { Background } from './background.ts';
import { Camera } from './camera.ts';
import { DamageNumbers } from './damageNumbers.ts';
import { PlayerView } from './playerView.ts';
import { Vfx } from './vfx.ts';
import { WorldView } from './worldView.ts';

/** How fast the camera follows a new `shift` (1/s). */
const SHIFT_RATE = 3;

export interface RenderSettings {
  shake: boolean;
  flashReduction: boolean;
  /** 0 = no halos on vector strokes, 1 = full. */
  glow: number;
  damageNumbers: boolean;
}

/**
 * Owns the Pixi application and every view. Layers, back to front:
 * screen (graph paper) → world (camera transform: axes, sim entities, player, VFX, numbers) →
 * overlay (off-screen indicators, screen flashes).
 */
export class GameRenderer {
  readonly app: Application;
  readonly camera = new Camera();
  readonly vfx: Vfx;
  /**
   * Horizontal camera offset in half-screens: 0.45 puts the player right of the centre (the title
   * screen covers the left half). The camera glides to a new value.
   */
  shift = 0;
  private shiftNow = 0;
  private readonly screen = new Container();
  private readonly world = new Container();
  private readonly overlay = new Container();
  private readonly background = new Background();
  private readonly worldView: WorldView;
  private readonly playerView = new PlayerView();
  private readonly numbers = new DamageNumbers();

  /** Creates the renderer inside `host`; throws when neither WebGL nor WebGPU is available. */
  static async create(host: HTMLElement): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: COLORS.bg,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoStart: false,
      preference: ['webgl', 'webgpu'],
      powerPreference: 'high-performance',
    });
    host.append(app.canvas);
    return new GameRenderer(app);
  }

  private constructor(app: Application) {
    this.app = app;
    const atlas = new ShapeAtlas();
    this.worldView = new WorldView(atlas);
    this.vfx = new Vfx(atlas);

    app.stage.addChild(this.screen, this.world, this.overlay);
    this.background.attach(this.screen, this.world);
    const fx = new Container();
    fx.addChild(this.vfx.layer.container, this.vfx.rings, this.numbers.container);
    this.worldView.attach(this.world, this.playerView.gfx, fx);
    this.overlay.addChild(this.worldView.indicators, this.vfx.flash);
  }

  /** Feeds one sim event to the effects. */
  handleEvent(ev: SimEvent, w: World, s: RenderSettings): void {
    this.vfx.handle(ev, w, this.camera, s);
    if (ev.type === 'hit' && s.damageNumbers) this.numbers.spawn(ev.x, ev.y, ev.amount, ev.crit);
  }

  /** Seconds of hit-stop requested by effects since the last call. */
  takeHitstop(): number {
    const h = this.vfx.hitstop;
    this.vfx.hitstop = 0;
    return h;
  }

  /** The player polygon bursts into edges (death); the view stays hidden until `reset`. */
  shatterPlayer(w: World, s: RenderSettings): void {
    const p = w.player;
    const r = playerRadius(p.vertices);
    this.vfx.shatter(p.x, p.y, r, 'hexagon', p.char.color, p.rot, 260);
    this.vfx.sparks(p.x, p.y, 40, p.char.color, 420);
    this.vfx.ring(p.x, p.y, r, r * 8, 0.9, s.flashReduction ? p.char.color : 0xffffff, 4);
    this.camera.addTrauma(0.6);
    this.playerView.gfx.visible = false;
  }

  /** Clears effects for a new run. */
  reset(): void {
    this.vfx.reset();
    this.numbers.reset();
    this.playerView.gfx.visible = true;
  }

  /**
   * Draws one frame. `alpha` interpolates between the last two ticks, `dt` is real time (effects
   * keep moving while the sim is frozen), `morph` is the running morph progress or 1.
   */
  frame(w: World, alpha: number, dt: number, time: number, morph: number, s: RenderSettings): void {
    const cam = this.camera;
    const screen = this.app.screen;
    if (screen.width !== cam.screenW || screen.height !== cam.screenH)
      cam.resize(screen.width, screen.height);

    const p = w.player;
    this.shiftNow += (this.shift - this.shiftNow) * Math.min(1, dt * SHIFT_RATE);
    const offset = this.shiftNow * cam.halfW;
    cam.x = p.px + (p.x - p.px) * alpha - offset;
    cam.y = p.py + (p.y - p.py) * alpha;
    cam.update(dt, s.shake);
    // Spawns happen just outside what this window shows (measured from the player).
    w.view.halfW = cam.halfW + Math.abs(offset);
    w.view.halfH = cam.halfH;
    cam.apply(this.world);

    this.background.update(cam);
    this.worldView.draw(w, alpha, cam, time, s);
    this.playerView.draw(w, alpha, time, morph, dt, s);
    this.vfx.update(dt);
    this.vfx.draw(cam, s);
    this.numbers.update(dt);
    this.app.render();
  }

  get particleCount(): number {
    return this.vfx.particleCount;
  }
}
