import { type Container, Graphics } from 'pixi.js';
import { COLORS } from '../content/palette.ts';
import { ENEMY, ticks } from '../content/tuning.ts';
import type { AiParams, PickupKind, ShapeId } from '../content/types.ts';
import { vertexAngle } from '../sim/math/geometry.ts';
import { TAU } from '../sim/math/vec.ts';
import { bossRadius } from '../sim/systems/boss.ts';
import { AI_WINDUP } from '../sim/systems/enemies.ts';
import { wavePosition } from '../sim/systems/projectiles.ts';
import type { Enemy, Projectile, World } from '../sim/world.ts';
import { OUTLINE, SOLID, type AtlasCell, type ShapeAtlas } from './atlas.ts';
import type { Camera } from './camera.ts';
import { mixColor, particleColor } from './color.ts';
import { neonCircle, neonLine, neonPath } from './draw.ts';
import { ParticleLayer } from './particleLayer.ts';

export interface ViewSettings {
  /** 0 = no halos on vector strokes, 1 = full. */
  glow: number;
  flashReduction: boolean;
}

const CULL_MARGIN = 60;
const SLOW_TINT = 0x7ad7ff;
const SHELL_STEP = 0.3;
const FLASH_TICKS = ticks(ENEMY.flashTime);
/** With flash reduction a hit swells the contour by this share instead of flashing it white. */
const HIT_SWELL = 0.18;
const WAVE_TRAIL = 14;
const WAVE_TRAIL_DT = 0.018;
/** Spectral beams in pastel, like the warm axiom colours, so none reads as an enemy's red. */
const PRISM_COLORS = [0xff8a8a, 0x7aff9a, 0x7ab8ff, 0xffe07a, 0xe07aff] as const;
const GEM_COLORS = [COLORS.gemSmall, COLORS.gemMedium, COLORS.gemLarge] as const;
const GEM_RADIUS = [5, 7, 10] as const;
/** Suction trail of an attracted crystal: seconds of flight it covers, and the speed it needs. */
const GEM_TRAIL_TIME = 0.05;
const GEM_TRAIL_MIN_SPEED = 160;

const PICKUP_LOOK: Record<PickupKind, { shape: ShapeId; color: number; r: number }> = {
  heal: { shape: 'plus', color: COLORS.heal, r: 11 },
  sum: { shape: 'sigma', color: 0xffffff, r: 11 },
  bomb: { shape: 'times', color: COLORS.explosive, r: 11 },
  slow: { shape: 'divide', color: SLOW_TINT, r: 11 },
  splitter: { shape: 'splitter', color: COLORS.splitter, r: 8 },
  vertexCube: { shape: 'cube', color: COLORS.cube, r: 17 },
  upgradeCube: { shape: 'cube', color: COLORS.crit, r: 17 },
};

/** Windup length in ticks for telegraph progress, per AI. */
function windupTicks(ai: AiParams): number {
  switch (ai.kind) {
    case 'dash':
    case 'orbitDive':
    case 'kite':
      return ticks(ai.windup);
    case 'kamikaze':
      return ticks(ai.fuse);
    case 'spawner':
      return ticks(0.5);
    default:
      return 1;
  }
}

/**
 * Draws the pooled sim entities: crystals, pickups, enemies (+ telegraphs, boss), own
 * projectiles and weapon effects, enemy bullets. Positions are interpolated between the last two
 * ticks with `alpha`.
 */
export class WorldView {
  /** Aura, orbit paths, telegraphs, dash lines: below everything else. */
  readonly ground = new Graphics();
  readonly gems: ParticleLayer;
  readonly pickups: ParticleLayer;
  readonly enemies: ParticleLayer;
  readonly boss = new Graphics();
  readonly projectiles: ParticleLayer;
  /** Beams and wave trails, additive. */
  readonly beams = new Graphics();
  readonly bullets: ParticleLayer;
  /** Screen-space arrows toward off-screen cubes. */
  readonly indicators = new Graphics();

  private readonly bossList: Enemy[] = [];
  private readonly trail = new Float64Array(WAVE_TRAIL * 2);
  private readonly tmp = { x: 0, y: 0 };
  private left = 0;
  private right = 0;
  private top = 0;
  private bottom = 0;

  private readonly atlas: ShapeAtlas;
  private readonly trailCell: AtlasCell;

  constructor(atlas: ShapeAtlas) {
    this.atlas = atlas;
    this.trailCell = atlas.cell(SOLID, 'edge', 16);
    this.gems = new ParticleLayer(atlas);
    this.pickups = new ParticleLayer(atlas);
    this.enemies = new ParticleLayer(atlas);
    this.projectiles = new ParticleLayer(atlas, 'add');
    this.bullets = new ParticleLayer(atlas);
    this.beams.blendMode = 'add';
  }

  /**
   * Adds the layers in draw order. The player view and the effects go in between via the slots;
   * enemy bullets come last, so no spark, ring or number ever hides one.
   */
  attach(world: Container, playerSlot: Container, fxSlot: Container): void {
    world.addChild(
      this.ground,
      this.gems.container,
      this.pickups.container,
      this.enemies.container,
      this.boss,
      this.projectiles.container,
      this.beams,
      playerSlot,
      fxSlot,
      this.bullets.container,
    );
  }

  draw(w: World, a: number, cam: Camera, time: number, s: ViewSettings): void {
    this.left = cam.x - cam.halfW - CULL_MARGIN;
    this.right = cam.x + cam.halfW + CULL_MARGIN;
    this.top = cam.y - cam.halfH - CULL_MARGIN;
    this.bottom = cam.y + cam.halfH + CULL_MARGIN;
    this.ground.clear();
    this.beams.clear();
    this.boss.clear();
    this.indicators.clear();

    this.drawGems(w, a, time);
    this.drawPickups(w, a, time, cam);
    this.drawEnemies(w, a, time, s);
    this.drawBosses(a, time, s, cam);
    this.drawWeapons(w, a, time, s);
    this.drawProjectiles(w, a, s);
    this.drawBullets(w, a);
    this.drawHazards(w, s);
  }

  private visible(x: number, y: number, r: number): boolean {
    return x + r > this.left && x - r < this.right && y + r > this.top && y - r < this.bottom;
  }

  // ------------------------------------------------------------------------------ drops

  private drawGems(w: World, a: number, time: number): void {
    const L = this.gems;
    L.begin();
    const items = w.gems.items;
    for (let i = 0; i < w.gems.count; i++) {
      const g = items[i]!;
      if (!g.alive) continue;
      const x = g.px + (g.x - g.px) * a;
      const y = g.py + (g.y - g.py) * a;
      const r = GEM_RADIUS[g.tier as 0 | 1 | 2];
      if (!this.visible(x, y, r)) continue;
      const color = GEM_COLORS[g.tier as 0 | 1 | 2];
      // Suction trail: a pulled crystal streaks toward the player.
      const v = g.attracted ? Math.hypot(g.vx, g.vy) : 0;
      if (v > GEM_TRAIL_MIN_SPEED) {
        const k = GEM_TRAIL_TIME / 2;
        L.pushScaled(
          this.trailCell,
          x - g.vx * k,
          y - g.vy * k,
          (v * k) / this.trailCell.radius,
          r / 7,
          Math.atan2(g.vy, g.vx),
          particleColor(color, Math.min(0.55, v / 1600)),
        );
      }
      const wobble = Math.sin(time * 2.2 + g.id * 1.7) * 0.35;
      L.push(this.atlas.cell(SOLID, 'gem', r), x, y, r, wobble, particleColor(color, 1));
    }
    L.end();
  }

  private drawPickups(w: World, a: number, time: number, cam: Camera): void {
    const L = this.pickups;
    L.begin();
    const items = w.pickups.items;
    for (let i = 0; i < w.pickups.count; i++) {
      const pk = items[i]!;
      if (!pk.alive) continue;
      const look = PICKUP_LOOK[pk.kind];
      const x = pk.px + (pk.x - pk.px) * a;
      const y = pk.py + (pk.y - pk.py) * a;
      const cube = pk.kind === 'vertexCube' || pk.kind === 'upgradeCube';
      let r = look.r;
      if (pk.kind === 'splitter') r += Math.min(10, Math.sqrt(pk.value) * 0.9);
      if (!this.visible(x, y, r * 2)) {
        if (cube) this.drawIndicator(cam, x, y, look.color, time);
        continue;
      }
      const pulse = 1 + Math.sin(time * 4 + pk.id) * 0.08;
      if (cube) {
        // Halo ring that breathes so the run's key item is never missed.
        const hr = r * (1.5 + 0.25 * Math.sin(time * 3));
        L.push(this.atlas.cell(SOLID, 'ring', hr), x, y, hr, 0, particleColor(look.color, 0.35));
      }
      const rot = pk.kind === 'splitter' ? time * 1.5 + pk.id : 0;
      L.push(
        this.atlas.cell(SOLID, look.shape, r),
        x,
        y,
        r * pulse,
        rot,
        particleColor(look.color, 1),
      );
    }
    L.end();
  }

  /** Arrow at the screen edge pointing at an off-screen cube or boss piece. */
  private drawIndicator(cam: Camera, wx: number, wy: number, color: number, time: number): void {
    const cx = cam.screenW / 2;
    const cy = cam.screenH / 2;
    const dx = cam.toScreenX(wx) - cx;
    const dy = cam.toScreenY(wy) - cy;
    const margin = 34;
    const k = Math.min(
      (cx - margin) / Math.max(Math.abs(dx), 1e-6),
      (cy - margin) / Math.max(Math.abs(dy), 1e-6),
    );
    const x = cx + dx * k;
    const y = cy + dy * k;
    const ang = Math.atan2(dy, dx);
    const s = 13 + Math.sin(time * 5) * 2;
    const g = this.indicators;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    g.moveTo(x + c * s, y + sn * s)
      .lineTo(x - c * s * 0.6 - sn * s * 0.7, y - sn * s * 0.6 + c * s * 0.7)
      .lineTo(x - c * s * 0.25, y - sn * s * 0.25)
      .lineTo(x - c * s * 0.6 + sn * s * 0.7, y - sn * s * 0.6 - c * s * 0.7)
      .closePath()
      .fill({ color, alpha: 0.9 })
      .stroke({ width: 2, color: 0x000000, alpha: 0.6 });
  }

  // ---------------------------------------------------------------------------- enemies

  private drawEnemies(w: World, a: number, time: number, s: ViewSettings): void {
    const L = this.enemies;
    const g = this.ground;
    L.begin();
    this.bossList.length = 0;
    const globalSlow = w.enemySlowTicks > 0;
    const soft = s.flashReduction;
    const blink = ((time * 14) | 0) % 2 === 0;
    const items = w.enemies.items;
    for (let i = 0; i < w.enemies.count; i++) {
      const e = items[i]!;
      if (!e.alive) continue;
      if (e.boss >= 0) {
        this.bossList.push(e);
        continue;
      }
      const x = e.px + (e.x - e.px) * a;
      const y = e.py + (e.y - e.py) * a;
      const r = e.r;
      const windup = e.state === AI_WINDUP;
      if (!this.visible(x, y, windup ? r + 260 : r * 1.3)) continue;

      // A hit flashes white and a telegraph blinks; with flash reduction the contour swells on a
      // hit and a telegraphing enemy glows steadily instead.
      let color = e.def.color;
      let size = r;
      if (globalSlow || e.slowTicks > 0) color = mixColor(color, SLOW_TINT, 0.4);
      if (e.flash > 0) {
        if (soft) size = r * (1 + (HIT_SWELL * e.flash) / FLASH_TICKS);
        else color = 0xffffff;
      } else if (windup && (soft || blink)) color = mixColor(color, 0xffffff, soft ? 0.35 : 0.65);

      if (windup) this.drawTelegraph(g, e, x, y, s);
      const shape = e.def.shape;
      if (e.elite) {
        const er = size * 1.14;
        L.push(
          this.atlas.cell(OUTLINE, shape, er),
          x,
          y,
          er,
          e.rot,
          particleColor(COLORS.elite, 0.85),
        );
      }
      const packed = particleColor(color, 1);
      L.push(this.atlas.cell(OUTLINE, shape, r), x, y, size, e.rot, packed);
      // Nested contours = remaining HP shells.
      for (let k = 1; k < e.shells; k++) {
        const sr = size * (1 - SHELL_STEP * k);
        L.push(this.atlas.cell(OUTLINE, shape, sr), x, y, sr, e.rot, packed);
      }
    }
    L.end();
  }

  private drawTelegraph(g: Graphics, e: Enemy, x: number, y: number, s: ViewSettings): void {
    const ai = e.def.ai;
    const t = 1 - Math.max(0, e.timer) / windupTicks(ai);
    const alpha = 0.25 + 0.6 * t;
    switch (ai.kind) {
      case 'dash':
      case 'orbitDive': {
        const mult = ai.kind === 'dash' ? ai.dashMult * ai.dashTime : ai.diveMult * ai.diveTime;
        const len = e.speed * mult;
        neonLine(g, x, y, x + e.tx * len, y + e.ty * len, 2, COLORS.telegraph, alpha, s.glow);
        g.circle(x + e.tx * len, y + e.ty * len, 4).fill({ color: COLORS.telegraph, alpha });
        break;
      }
      case 'kite': {
        neonCircle(g, x, y, e.r + 6 + 10 * (1 - t), 1.5, COLORS.ranged, alpha, s.glow);
        break;
      }
      case 'spawner':
        neonCircle(g, x, y, e.r * (1.2 + 0.4 * t), 2, COLORS.summoner, alpha, s.glow);
        break;
      case 'kamikaze': {
        const R = ai.radius * (e.elite ? 1.6 : 1);
        g.circle(x, y, R).fill({ color: COLORS.explosive, alpha: 0.06 + 0.16 * t });
        neonCircle(g, x, y, R, 2, COLORS.explosive, alpha, s.glow);
        // Inner disc grows to the rim: the fuse.
        g.circle(x, y, R * t).fill({ color: COLORS.explosive, alpha: 0.12 });
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------------------------- boss

  private drawBosses(a: number, time: number, s: ViewSettings, cam: Camera): void {
    const g = this.boss;
    for (const e of this.bossList) {
      const x = e.px + (e.x - e.px) * a;
      const y = e.py + (e.y - e.py) * a;
      const R = bossRadius(e);
      if (!this.visible(x, y, R * 1.3)) {
        this.drawIndicator(cam, x, y, COLORS.boss, time);
        continue;
      }
      // Fresh pieces blink while invulnerable and hits flash white; with flash reduction the
      // pieces are dimmed instead and a hit thickens the edges.
      const soft = s.flashReduction;
      let fade = 1;
      if (e.invuln > 0) {
        if (soft) fade = 0.4;
        else if (((time * 20) | 0) % 2 === 0) continue;
      }
      const hit = e.flash > 0;
      const color = hit && !soft ? 0xffffff : COLORS.boss;
      const pts = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const ang = vertexAngle(i, 3, e.rot);
        pts[i * 2] = x + Math.cos(ang) * R;
        pts[i * 2 + 1] = y + Math.sin(ang) * R;
      }
      g.moveTo(pts[0]!, pts[1]!).lineTo(pts[2]!, pts[3]!).lineTo(pts[4]!, pts[5]!).closePath();
      g.fill({ color, alpha: 0.1 * fade });
      // Volley telegraph: the edges heat up shortly before they fire.
      const heat = Math.max(0, 1 - e.timer / ticks(0.45));
      neonPath(
        g,
        pts,
        3,
        true,
        3 + heat * 2 + (hit && soft ? 2 : 0),
        heat > 0 ? mixColor(color, 0xffffff, heat * (soft ? 0.35 : 0.7)) : color,
        fade,
        s.glow * 1.5,
      );
      this.sierpinski(g, pts, 2 - e.boss, color, 0.75 * fade, s.glow);
      if (heat > 0) {
        for (let i = 0; i < 3; i++) {
          const j = (i + 1) % 3;
          const mx = (pts[i * 2]! + pts[j * 2]!) / 2;
          const my = (pts[i * 2 + 1]! + pts[j * 2 + 1]!) / 2;
          const nx = mx - x;
          const ny = my - y;
          const l = Math.hypot(nx, ny) || 1;
          neonLine(
            g,
            mx,
            my,
            mx + (nx / l) * 30 * heat,
            my + (ny / l) * 30 * heat,
            2,
            COLORS.enemyBullet,
            heat,
            s.glow,
          );
        }
      }
    }
  }

  /** Inverted middle triangles, recursively: the boss wears its own split pattern. */
  private sierpinski(
    g: Graphics,
    pts: readonly number[],
    depth: number,
    color: number,
    alpha: number,
    glow: number,
  ): void {
    if (depth <= 0) return;
    const m = [
      (pts[0]! + pts[2]!) / 2,
      (pts[1]! + pts[3]!) / 2,
      (pts[2]! + pts[4]!) / 2,
      (pts[3]! + pts[5]!) / 2,
      (pts[4]! + pts[0]!) / 2,
      (pts[5]! + pts[1]!) / 2,
    ];
    neonPath(g, m, 3, true, 1.5 + depth * 0.5, color, alpha, glow);
    const d = depth - 1;
    this.sierpinski(g, [pts[0]!, pts[1]!, m[0]!, m[1]!, m[4]!, m[5]!], d, color, alpha, glow);
    this.sierpinski(g, [m[0]!, m[1]!, pts[2]!, pts[3]!, m[2]!, m[3]!], d, color, alpha, glow);
    this.sierpinski(g, [m[4]!, m[5]!, m[2]!, m[3]!, pts[4]!, pts[5]!], d, color, alpha, glow);
  }

  // ---------------------------------------------------------------------------- weapons

  private drawWeapons(w: World, a: number, time: number, s: ViewSettings): void {
    const p = w.player;
    const px = p.px + (p.x - p.px) * a;
    const py = p.py + (p.y - p.py) * a;
    // Beams were computed at the tick's player position: shift them with the interpolation.
    const ox = px - p.x;
    const oy = py - p.y;
    const L = this.projectiles;
    L.begin();
    for (let i = 0; i < p.vertices; i++) {
      const slot = p.weapons[i];
      if (!slot) continue;
      const wp = slot.p;
      const color = slot.def.color;
      switch (slot.def.kind) {
        case 'orbit': {
          this.ground.circle(px, py, wp.radius).stroke({ width: 1, color, alpha: 0.09 });
          const b = slot.bodies;
          const pb = slot.prevBodies;
          for (let k = 0; k < slot.bodyCount; k++) {
            const bx = pb[k * 2]! + (b[k * 2]! - pb[k * 2]!) * a;
            const by = pb[k * 2 + 1]! + (b[k * 2 + 1]! - pb[k * 2 + 1]!) * a;
            const r = slot.bodyRadius[k]!;
            L.push(this.atlas.cell(SOLID, 'orb', r), bx, by, r, 0, particleColor(color, 1));
          }
          break;
        }
        case 'aura': {
          const R = wp.radius;
          const g = this.ground;
          g.circle(px, py, R).fill({ color, alpha: 0.045 });
          neonCircle(g, px, py, R, 1.5, color, 0.4, s.glow);
          // Compass ticks turning slowly: the "Zirkel".
          const spin = time * 0.6;
          for (let k = 0; k < 12; k++) {
            const ang = spin + (k * TAU) / 12;
            const c = Math.cos(ang);
            const sn = Math.sin(ang);
            g.moveTo(px + c * (R - 6), py + sn * (R - 6)).lineTo(px + c * R, py + sn * R);
          }
          g.stroke({ width: 1.5, color, alpha: 0.35 });
          break;
        }
        case 'beam': {
          const n = slot.beamCount;
          const prism = Math.round(wp.prism);
          // The beam hums; with flash reduction it burns steadily.
          const flicker = s.flashReduction ? 1 : 0.85 + 0.15 * Math.sin(time * 45 + i);
          for (let k = 0; k < n; k++) {
            const q = prism > 0 ? k % (prism + 1) : 0;
            const c = q === 0 ? color : PRISM_COLORS[(q - 1) % PRISM_COLORS.length]!;
            const bs = slot.beams;
            neonLine(
              this.beams,
              bs[k * 4]! + ox,
              bs[k * 4 + 1]! + oy,
              bs[k * 4 + 2]! + ox,
              bs[k * 4 + 3]! + oy,
              wp.width * 0.6,
              c,
              flicker,
              s.glow * 1.4,
            );
          }
          break;
        }
        default:
          break;
      }
    }
    // Projectiles continue in the same layer (begin() above, end() in drawProjectiles).
  }

  private drawProjectiles(w: World, a: number, s: ViewSettings): void {
    const L = this.projectiles;
    const items = w.projectiles.items;
    for (let i = 0; i < w.projectiles.count; i++) {
      const pr = items[i]!;
      if (!pr.alive) continue;
      const x = pr.px + (pr.x - pr.px) * a;
      const y = pr.py + (pr.y - pr.py) * a;
      if (pr.kind === 'wave') {
        if (!this.visible(x, y, pr.amp + pr.r)) continue;
        this.drawWaveTrail(pr, a, s);
        L.push(this.atlas.cell(SOLID, 'wavedot', pr.r), x, y, pr.r, 0, particleColor(pr.color, 1));
        continue;
      }
      if (!this.visible(x, y, pr.r * 2)) continue;
      const shape = pr.shape;
      const r = shape === 'dart' ? pr.r * 1.7 : shape === 'shard' ? pr.r * 1.4 : pr.r;
      const rot = pr.kind === 'fractal' ? pr.rot : pr.rot + Math.PI / 2;
      L.push(this.atlas.cell(SOLID, shape, r), x, y, r, rot, particleColor(pr.color, 1));
    }
    L.end();
  }

  private drawWaveTrail(pr: Projectile, a: number, s: ViewSettings): void {
    const head = pr.t - (1 - a) * (1 / 60);
    let n = 0;
    for (let k = 0; k < WAVE_TRAIL; k++) {
      const t = head - k * WAVE_TRAIL_DT;
      if (t < 0) break;
      wavePosition(pr, t, this.tmp);
      this.trail[n * 2] = this.tmp.x;
      this.trail[n * 2 + 1] = this.tmp.y;
      n++;
    }
    neonPath(this.beams, this.trail, n, false, 2.5, pr.color, 0.5, s.glow);
  }

  private drawBullets(w: World, a: number): void {
    const L = this.bullets;
    L.begin();
    const items = w.bullets.items;
    const ring = particleColor(COLORS.enemyBullet, 1);
    const core = particleColor(0xffffff, 1);
    for (let i = 0; i < w.bullets.count; i++) {
      const b = items[i]!;
      if (!b.alive) continue;
      const x = b.px + (b.x - b.px) * a;
      const y = b.py + (b.y - b.py) * a;
      const r = b.r * 1.3;
      if (!this.visible(x, y, r)) continue;
      L.push(this.atlas.cell(SOLID, 'ring', r), x, y, r, 0, ring);
      L.push(this.atlas.cell(SOLID, 'spark', r * 0.5), x, y, r * 0.5, 0, core);
    }
    L.end();
  }

  private drawHazards(w: World, s: ViewSettings): void {
    const color = w.player.char.color;
    for (let i = 0; i < w.hazards.count; i++) {
      const h = w.hazards.items[i]!;
      if (!h.alive) continue;
      const f = h.life / Math.max(1, h.maxLife);
      neonLine(this.beams, h.x1, h.y1, h.x2, h.y2, h.halfWidth * 2 * f, color, 0.8 * f, s.glow);
    }
  }
}
