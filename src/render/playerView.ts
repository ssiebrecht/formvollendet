import { Graphics } from 'pixi.js';
import { COLORS } from '../content/palette.ts';
import { PLAYER, ticks } from '../content/tuning.ts';
import { vertexAngle } from '../sim/math/geometry.ts';
import { playerRadius, type World } from '../sim/world.ts';
import { mixColor } from './color.ts';
import { drawShape, neonCircle, neonPath } from './draw.ts';
import type { ViewSettings } from './worldView.ts';

const GHOSTS = 7;
const GHOST_LIFE = 0.22;
const STAR_INNER = 0.5;
const EDGE_WIDTH = 3;
const GLYPH_RADIUS = 5.5;
const EDGE_GLYPH_RADIUS = 4;
const HP_W = 44;
const HP_H = 4;

interface Ghost {
  x: number;
  y: number;
  rot: number;
  life: number;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/**
 * The player polygon: weapon glyphs on the vertices, axiom colours and symbols on the edges, the
 * white core point (= hurtbox) in the middle, HP bar below. Grows a vertex out of an edge midpoint
 * during a morph and leaves afterimages while dashing.
 */
export class PlayerView {
  readonly gfx = new Graphics();
  /** Outer vertices as x,y pairs. */
  private readonly outer = new Float64Array(PLAYER.maxVertices * 2);
  /** Outline points (star style interleaves inner points). */
  private readonly path = new Float64Array(PLAYER.maxVertices * 4);
  private readonly seg = new Float64Array(6);
  private readonly ghosts: Ghost[] = Array.from({ length: GHOSTS }, () => ({
    x: 0,
    y: 0,
    rot: 0,
    life: 0,
  }));
  private ghostNext = 0;
  private ghostTimer = 0;

  /**
   * @param morph 0..1 progress of a running morph, or 1 when none.
   * @param dt real frame time, for afterimages.
   */
  draw(w: World, a: number, time: number, morph: number, dt: number, s: ViewSettings): void {
    const g = this.gfx;
    g.clear();
    const glow = s.glow;
    const p = w.player;
    const x = p.px + (p.x - p.px) * a;
    const y = p.py + (p.y - p.py) * a;
    const rot = p.prot + (p.rot - p.prot) * a;
    const color = p.char.color;
    const n = p.vertices;
    const star = p.char.style === 'star';

    // ------------------------------------------------------------------ outer vertices
    const outer = this.outer;
    const e = morph >= 1 ? 1 : easeOutBack(morph);
    const R = playerRadius(n);
    if (morph < 1 && n > PLAYER.startVertices) {
      const m = n - 1;
      const Ro = playerRadius(m);
      for (let i = 0; i < n; i++) {
        let fx: number;
        let fy: number;
        if (i < m) {
          const ao = vertexAngle(i, m, rot);
          fx = Math.cos(ao) * Ro;
          fy = Math.sin(ao) * Ro;
        } else {
          // The new vertex grows out of the midpoint of the old closing edge.
          const a0 = vertexAngle(m - 1, m, rot);
          const a1 = vertexAngle(0, m, rot);
          fx = ((Math.cos(a0) + Math.cos(a1)) / 2) * Ro;
          fy = ((Math.sin(a0) + Math.sin(a1)) / 2) * Ro;
        }
        const an = vertexAngle(i, n, rot);
        outer[i * 2] = x + fx + (Math.cos(an) * R - fx) * e;
        outer[i * 2 + 1] = y + fy + (Math.sin(an) * R - fy) * e;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const an = vertexAngle(i, n, rot);
        outer[i * 2] = x + Math.cos(an) * R;
        outer[i * 2 + 1] = y + Math.sin(an) * R;
      }
    }

    // --------------------------------------------------------------------- afterimages
    this.updateGhosts(p.dashTicks > 0, x, y, rot, dt);
    for (const gh of this.ghosts) {
      if (gh.life <= 0) continue;
      const f = gh.life / GHOST_LIFE;
      for (let i = 0; i < n; i++) {
        const an = vertexAngle(i, n, gh.rot);
        this.path[i * 2] = gh.x + Math.cos(an) * R;
        this.path[i * 2 + 1] = gh.y + Math.sin(an) * R;
      }
      neonPath(g, this.path, n, true, 2, color, 0.45 * f, 0);
    }

    // ------------------------------------------------------------------------- outline
    // I-frames: the outline blinks, or with flash reduction stays dimmed.
    let alpha = 1;
    if (p.iframes > 0) {
      if (s.flashReduction) alpha = 0.5;
      else if (((time * 18) | 0) % 2 === 0) alpha = 0.35;
    }
    const pts = this.path;
    let count = 0;
    for (let i = 0; i < n; i++) {
      pts[count * 2] = outer[i * 2]!;
      pts[count * 2 + 1] = outer[i * 2 + 1]!;
      count++;
      if (star) {
        const j = (i + 1) % n;
        const mx = (outer[i * 2]! + outer[j * 2]!) / 2;
        const my = (outer[i * 2 + 1]! + outer[j * 2 + 1]!) / 2;
        pts[count * 2] = x + (mx - x) * STAR_INNER;
        pts[count * 2 + 1] = y + (my - y) * STAR_INNER;
        count++;
      }
    }
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 1; i < count; i++) g.lineTo(pts[i * 2]!, pts[i * 2 + 1]!);
    g.closePath().fill({ color, alpha: 0.12 * alpha });

    // Edges carry the axioms: lit in the axiom's colour, dim when empty.
    const seg = this.seg;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p.axioms[i];
      const c = ax ? ax.def.color : color;
      const ea = (ax ? 1 : 0.35) * alpha;
      seg[0] = outer[i * 2]!;
      seg[1] = outer[i * 2 + 1]!;
      if (star) {
        seg[2] = pts[(i * 2 + 1) * 2]!;
        seg[3] = pts[(i * 2 + 1) * 2 + 1]!;
        seg[4] = outer[j * 2]!;
        seg[5] = outer[j * 2 + 1]!;
        neonPath(g, seg, 3, false, EDGE_WIDTH, c, ea, ax ? glow : glow * 0.4);
      } else {
        seg[2] = outer[j * 2]!;
        seg[3] = outer[j * 2 + 1]!;
        neonPath(g, seg, 2, false, EDGE_WIDTH, c, ea, ax ? glow : glow * 0.4);
      }
    }

    // Axiom symbols ride upright on their edges (the inner points of a star), so axioms read
    // without colour vision too.
    for (let i = 0; i < n; i++) {
      const ax = p.axioms[i];
      if (!ax) continue;
      const j = (i + 1) % n;
      const mx = star ? pts[(i * 2 + 1) * 2]! : (outer[i * 2]! + outer[j * 2]!) / 2;
      const my = star ? pts[(i * 2 + 1) * 2 + 1]! : (outer[i * 2 + 1]! + outer[j * 2 + 1]!) / 2;
      g.circle(mx, my, EDGE_GLYPH_RADIUS + 1.5).fill({ color: COLORS.bg, alpha: 0.85 * alpha });
      drawShape(g, ax.def.icon, mx, my, EDGE_GLYPH_RADIUS, 0, ax.def.color, alpha, 1.2);
    }

    // --------------------------------------------------------------------- vertex glyphs
    for (let i = 0; i < n; i++) {
      const vx = outer[i * 2]!;
      const vy = outer[i * 2 + 1]!;
      const slot = p.weapons[i];
      const out = Math.atan2(vy - y, vx - x) + Math.PI / 2;
      if (slot) {
        if (slot.def.theoremOf)
          neonCircle(g, vx, vy, GLYPH_RADIUS + 4, 1.5, COLORS.crit, 0.8 * alpha, glow);
        g.circle(vx, vy, GLYPH_RADIUS + 1.5).fill({ color: COLORS.bg, alpha: 0.85 * alpha });
        drawShape(g, slot.def.icon, vx, vy, GLYPH_RADIUS, out, slot.def.color, alpha, 1.5);
      } else {
        g.circle(vx, vy, 2.5).fill({ color: mixColor(color, COLORS.bg, 0.4), alpha });
      }
    }

    // ---------------------------------------------------------------- facing chevron
    const fd = R + 13;
    const fx = x + p.fx * fd;
    const fy = y + p.fy * fd;
    const px = -p.fy;
    const py = p.fx;
    g.moveTo(fx - p.fx * 5 + px * 5, fy - p.fy * 5 + py * 5)
      .lineTo(fx, fy)
      .lineTo(fx - p.fx * 5 - px * 5, fy - p.fy * 5 - py * 5)
      .stroke({ width: 2, color, alpha: 0.55 * alpha, cap: 'round', join: 'round' });

    // --------------------------------------------------------------------------- core
    g.circle(x, y, PLAYER.hurtRadius).stroke({ width: 1, color: COLORS.core, alpha: 0.28 });
    neonCircle(g, x, y, 1.8, 3.2, COLORS.core, 1, glow);

    // ------------------------------------------------------------------------- HP bar
    const frac = Math.max(0, Math.min(1, p.hp / w.stats.maxHp));
    const bx = x - HP_W / 2;
    const by = y + R + 12;
    g.rect(bx - 1, by - 1, HP_W + 2, HP_H + 2).fill({ color: 0x000000, alpha: 0.6 });
    g.rect(bx, by, HP_W * frac, HP_H).fill({
      color: mixColor(COLORS.contact, COLORS.heal, frac),
      alpha: 0.95,
    });

    // Morph: bright flash on the growing vertex (in the character colour with flash reduction).
    if (morph < 1 && n > PLAYER.startVertices) {
      const vx = outer[(n - 1) * 2]!;
      const vy = outer[(n - 1) * 2 + 1]!;
      const c = s.flashReduction ? color : 0xffffff;
      const fa = (1 - morph) * (s.flashReduction ? 0.6 : 1);
      neonCircle(g, vx, vy, 6 + 10 * (1 - morph), 2, c, fa, glow);
    }
  }

  private updateGhosts(dashing: boolean, x: number, y: number, rot: number, dt: number): void {
    for (const gh of this.ghosts) if (gh.life > 0) gh.life -= dt;
    if (!dashing) {
      this.ghostTimer = 0;
      return;
    }
    this.ghostTimer -= dt;
    if (this.ghostTimer > 0) return;
    this.ghostTimer = 1 / 90;
    const gh = this.ghosts[this.ghostNext]!;
    this.ghostNext = (this.ghostNext + 1) % GHOSTS;
    gh.x = x;
    gh.y = y;
    gh.rot = rot;
    gh.life = GHOST_LIFE;
  }
}

/** Morph progress 0..1 from the sim's remaining freeze ticks. */
export function morphProgress(morphTicks: number): number {
  const total = ticks(PLAYER.morphTime);
  return 1 - Math.max(0, Math.min(total, morphTicks)) / total;
}
