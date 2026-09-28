import { Graphics } from 'pixi.js';
import { COLORS } from '../content/palette.ts';
import type { PickupKind, ShapeId } from '../content/types.ts';
import { vertexAngle } from '../sim/math/geometry.ts';
import type { SimEvent } from '../sim/events.ts';
import { playerRadius, type World } from '../sim/world.ts';
import { SOLID, type AtlasCell, type ShapeAtlas } from './atlas.ts';
import type { Camera } from './camera.ts';
import { mixColor, particleColor } from './color.ts';
import { neonCircle } from './draw.ts';
import { ParticleLayer } from './particleLayer.ts';

const MAX_PARTS = 1500;
const MAX_RINGS = 48;
const MAX_HIT_SPARKS_PER_FRAME = 40;
const EDGE_BUCKET = 16;
/** Ring opacity with flash reduction. */
const SOFT_RING = 0.5;
/** Hit sparks with flash reduction: grey instead of white. */
const SOFT_SPARK = 0x8a90a0;

/** Edges per shape when it shatters (stars break along their ten edges). */
const SIDES: Partial<Record<ShapeId, number>> = {
  circle: 7,
  triangle: 3,
  square: 4,
  diamond: 4,
  pentagon: 5,
  hexagon: 6,
  star5: 10,
  dart: 3,
  fractal: 3,
  shard: 3,
};

const PICKUP_COLOR: Record<PickupKind, number> = {
  heal: COLORS.heal,
  sum: 0xffffff,
  bomb: COLORS.explosive,
  slow: 0x7ad7ff,
  splitter: COLORS.splitter,
  vertexCube: 0xffffff,
  upgradeCube: COLORS.crit,
};

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  life: number;
  max: number;
  /** Radius, or half length for edges. */
  size: number;
  edge: boolean;
  color: number;
  drag: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: number;
  width: number;
}

export interface VfxSettings {
  shake: boolean;
  flashReduction: boolean;
  glow: number;
}

/**
 * Render-only effects fed by sim events: shapes shattering into flying edges, sparks, expanding
 * rings, screen shake, full-screen flashes (hurt, × bomb, revive) and short hit-stops. With flash
 * reduction there are no full-screen flashes, white bursts take the colour of their source and
 * rings are dimmed. Randomness here is cosmetic, so plain Math.random is fine.
 */
export class Vfx {
  readonly layer: ParticleLayer;
  readonly rings = new Graphics();
  /** Full-screen flash (screen space). */
  readonly flash = new Graphics();
  /** Seconds of requested sim freeze (hit-stop); the loop consumes it. */
  hitstop = 0;

  private readonly edgeCell: AtlasCell;
  private readonly sparkCell: AtlasCell;
  private readonly parts: Part[] = [];
  private partCount = 0;
  private readonly ringList: Ring[] = [];
  private ringCount = 0;
  private flashAlpha = 0;
  private flashColor: number = COLORS.contact;
  private hitSparks = 0;

  constructor(atlas: ShapeAtlas) {
    this.layer = new ParticleLayer(atlas, 'add');
    this.rings.blendMode = 'add';
    this.edgeCell = atlas.cell(SOLID, 'edge', EDGE_BUCKET);
    this.sparkCell = atlas.cell(SOLID, 'spark', 3);
  }

  /** Reacts to one sim event. `cam` decides whether an effect is on screen (shake only then). */
  handle(ev: SimEvent, w: World, cam: Camera, s: VfxSettings): void {
    const p = w.player;
    const soft = s.flashReduction;
    const white = soft ? p.char.color : 0xffffff;
    switch (ev.type) {
      case 'hit':
        if (this.hitSparks++ < MAX_HIT_SPARKS_PER_FRAME) {
          this.sparks(
            ev.x,
            ev.y,
            ev.crit ? 4 : 2,
            ev.crit ? COLORS.crit : soft ? SOFT_SPARK : 0xffffff,
            ev.crit ? 220 : 150,
          );
        }
        break;
      case 'kill':
        this.shatter(ev.x, ev.y, ev.r, ev.shape, ev.color, ev.rot, ev.elite ? 260 : 150);
        if (ev.elite) {
          this.ring(ev.x, ev.y, ev.r, ev.r * 4, 0.5, soft ? ev.color : COLORS.elite, 3);
          this.sparks(ev.x, ev.y, 24, ev.color, 320);
          this.shake(cam, ev.x, ev.y, 0.45);
        }
        break;
      case 'shell':
        this.shatter(
          ev.x,
          ev.y,
          ev.r * 0.8,
          ev.shape,
          mixColor(ev.color, 0xffffff, 0.5),
          ev.rot,
          110,
        );
        break;
      case 'explosion':
        this.ring(ev.x, ev.y, 4, ev.r, 0.3, ev.color, 4);
        this.ring(ev.x, ev.y, ev.r * 0.5, ev.r * 1.15, 0.45, ev.color, 2);
        this.sparks(ev.x, ev.y, 16, ev.color, 300);
        this.shake(cam, ev.x, ev.y, 0.28);
        break;
      case 'pulse':
        this.ring(ev.x, ev.y, ev.r * 0.3, ev.r, 0.4, ev.color, 3);
        break;
      case 'enemyShot':
        this.ring(ev.x, ev.y, 6, 26, 0.22, COLORS.ranged, 2);
        break;
      case 'ability':
        if (ev.ability === 'supernova') {
          this.ring(ev.x, ev.y, 10, 220, 0.45, COLORS.nova, 4);
          this.sparks(ev.x, ev.y, 20, COLORS.nova, 380);
          cam.addTrauma(s.shake ? 0.3 : 0);
        } else {
          this.ring(ev.x, ev.y, 6, 40, 0.25, p.char.color, 2);
          this.sparks(ev.x, ev.y, 8, p.char.color, 200);
        }
        break;
      case 'playerHurt':
        if (s.shake) cam.addTrauma(Math.min(0.5, 0.2 + ev.amount / 60));
        // Reduced: a red contour pulse around the player instead of a red screen.
        if (soft) {
          const r = playerRadius(p.vertices);
          this.ring(p.x, p.y, r, r + 30, 0.35, COLORS.contact, 3);
        } else this.screenFlash(0.22, COLORS.contact);
        break;
      case 'playerHeal':
        this.ring(p.x, p.y, 12, 40, 0.35, COLORS.heal, 2);
        break;
      case 'revive':
        this.ring(p.x, p.y, 10, 320, 0.8, white, 5);
        if (!soft) this.screenFlash(0.35, 0xffffff);
        break;
      case 'levelUp':
        this.ring(p.x, p.y, 20, 110, 0.45, p.char.color, 3);
        break;
      case 'morph':
        this.ring(p.x, p.y, 20, 300, 0.7, white, 4);
        this.ring(p.x, p.y, 10, 160, 0.5, p.char.color, 3);
        this.sparks(p.x, p.y, 30, p.char.color, 360);
        if (s.shake) cam.addTrauma(0.4);
        break;
      case 'theorem':
        this.ring(p.x, p.y, 20, 240, 0.7, COLORS.crit, 4);
        this.sparks(p.x, p.y, 24, COLORS.crit, 300);
        break;
      case 'pickup': {
        const c = PICKUP_COLOR[ev.kind];
        const cube = ev.kind === 'vertexCube' || ev.kind === 'upgradeCube';
        this.ring(ev.x, ev.y, 8, cube ? 90 : 34, cube ? 0.5 : 0.3, c, cube ? 3 : 2);
        if (ev.kind === 'bomb') {
          // Reduced: a wave across the screen instead of a white one.
          if (soft) this.ring(p.x, p.y, 20, Math.hypot(cam.halfW, cam.halfH), 0.5, c, 4);
          else this.screenFlash(0.25, 0xffffff);
          if (s.shake) cam.addTrauma(0.35);
        }
        break;
      }
      case 'bossSplit':
        this.shatter(ev.x, ev.y, ev.r, 'triangle', COLORS.boss, Math.random() * 6.28, 240);
        this.ring(ev.x, ev.y, ev.r * 0.5, ev.r * 2.2, 0.6, COLORS.boss, 5);
        this.sparks(ev.x, ev.y, 30, COLORS.boss, 380);
        this.shake(cam, ev.x, ev.y, 0.55);
        this.hitstop = Math.max(this.hitstop, 0.09);
        break;
      case 'bossDefeated':
        this.ring(p.x, p.y, 20, 900, 1.2, white, 6);
        if (s.shake) cam.addTrauma(0.8);
        this.hitstop = Math.max(this.hitstop, 0.2);
        break;
      case 'boss':
        if (s.shake) cam.addTrauma(0.3);
        break;
      default:
        break;
    }
  }

  private shake(cam: Camera, x: number, y: number, amount: number): void {
    if (Math.abs(x - cam.x) < cam.halfW + 40 && Math.abs(y - cam.y) < cam.halfH + 40)
      cam.addTrauma(amount);
  }

  private screenFlash(alpha: number, color: number): void {
    this.flashAlpha = alpha;
    this.flashColor = color;
  }

  private spawn(): Part {
    let p: Part;
    if (this.partCount < this.parts.length) p = this.parts[this.partCount]!;
    else if (this.parts.length < MAX_PARTS) {
      p = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rot: 0,
        vrot: 0,
        life: 0,
        max: 1,
        size: 1,
        edge: false,
        color: 0,
        drag: 1,
      };
      this.parts.push(p);
    } else {
      // Full: recycle a random live particle rather than dropping the new, more relevant one.
      return this.parts[(Math.random() * MAX_PARTS) | 0]!;
    }
    this.partCount++;
    return p;
  }

  /** The shape breaks into its edges, which fly outward and spin. */
  shatter(
    x: number,
    y: number,
    r: number,
    shape: ShapeId,
    color: number,
    rot: number,
    speed: number,
  ): void {
    const n = SIDES[shape] ?? 4;
    const star = shape === 'star5';
    for (let i = 0; i < n; i++) {
      // Star edges alternate between outer and inner radius.
      const ra = star ? (i % 2 === 0 ? r * 1.15 : r * 0.5) : r;
      const rb = star ? (i % 2 === 0 ? r * 0.5 : r * 1.15) : r;
      const a0 = vertexAngle(i, n, rot);
      const a1 = vertexAngle(i + 1, n, rot);
      const x0 = Math.cos(a0) * ra;
      const y0 = Math.sin(a0) * ra;
      const x1 = Math.cos(a1) * rb;
      const y1 = Math.sin(a1) * rb;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const ml = Math.hypot(mx, my) || 1;
      const v = speed * (0.6 + Math.random() * 0.7);
      const p = this.spawn();
      p.x = x + mx;
      p.y = y + my;
      p.vx = (mx / ml) * v + (Math.random() - 0.5) * 40;
      p.vy = (my / ml) * v + (Math.random() - 0.5) * 40;
      p.rot = Math.atan2(y1 - y0, x1 - x0);
      p.vrot = (Math.random() - 0.5) * 16;
      p.max = p.life = 0.35 + Math.random() * 0.25;
      p.size = Math.max(2, Math.hypot(x1 - x0, y1 - y0) / 2);
      p.edge = true;
      p.color = color;
      p.drag = 0.9;
    }
  }

  sparks(x: number, y: number, count: number, color: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const p = this.spawn();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.rot = 0;
      p.vrot = 0;
      p.max = p.life = 0.15 + Math.random() * 0.25;
      p.size = 3 + Math.random() * 3;
      p.edge = false;
      p.color = color;
      p.drag = 0.86;
    }
  }

  ring(
    x: number,
    y: number,
    r0: number,
    r1: number,
    life: number,
    color: number,
    width: number,
  ): void {
    let ring: Ring;
    if (this.ringCount < this.ringList.length) ring = this.ringList[this.ringCount]!;
    else if (this.ringList.length < MAX_RINGS) {
      ring = { x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 1, color: 0, width: 1 };
      this.ringList.push(ring);
    } else return;
    this.ringCount++;
    ring.x = x;
    ring.y = y;
    ring.r0 = r0;
    ring.r1 = r1;
    ring.max = ring.life = life;
    ring.color = color;
    ring.width = width;
  }

  /** Advances all effects by real time `dt` (they keep moving while the sim is frozen). */
  update(dt: number): void {
    this.hitSparks = 0;
    const damp = 60 * dt;
    for (let i = 0; i < this.partCount;) {
      const p = this.parts[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-remove keeps the live prefix dense.
        const last = this.parts[--this.partCount]!;
        this.parts[i] = last;
        this.parts[this.partCount] = p;
        continue;
      }
      const k = p.drag ** damp;
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      i++;
    }
    for (let i = 0; i < this.ringCount;) {
      const r = this.ringList[i]!;
      r.life -= dt;
      if (r.life <= 0) {
        const last = this.ringList[--this.ringCount]!;
        this.ringList[i] = last;
        this.ringList[this.ringCount] = r;
        continue;
      }
      i++;
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.2);
  }

  draw(cam: Camera, s: VfxSettings): void {
    const L = this.layer;
    L.begin();
    for (let i = 0; i < this.partCount; i++) {
      const p = this.parts[i]!;
      const f = p.life / p.max;
      if (p.edge) {
        L.pushScaled(
          this.edgeCell,
          p.x,
          p.y,
          p.size / this.edgeCell.radius,
          1,
          p.rot,
          particleColor(p.color, f),
        );
      } else {
        L.push(this.sparkCell, p.x, p.y, p.size * (0.5 + f * 0.5), 0, particleColor(p.color, f));
      }
    }
    L.end();

    const g = this.rings;
    g.clear();
    const fade = s.flashReduction ? SOFT_RING : 1;
    for (let i = 0; i < this.ringCount; i++) {
      const r = this.ringList[i]!;
      const t = 1 - r.life / r.max;
      const e = 1 - (1 - t) ** 3;
      neonCircle(
        g,
        r.x,
        r.y,
        r.r0 + (r.r1 - r.r0) * e,
        r.width * (1 - t * 0.6),
        r.color,
        (1 - t) * fade,
        s.glow,
      );
    }

    const fl = this.flash;
    fl.clear();
    if (this.flashAlpha > 0) {
      fl.rect(0, 0, cam.screenW, cam.screenH).fill({
        color: this.flashColor,
        alpha: this.flashAlpha,
      });
    }
  }

  /** Clears everything (new run). */
  reset(): void {
    this.partCount = 0;
    this.ringCount = 0;
    this.flashAlpha = 0;
    this.hitstop = 0;
  }

  get particleCount(): number {
    return this.partCount;
  }
}
