import { DT, PLAYER, ticks } from '../../content/tuning.ts';
import { TAU } from '../math/vec.ts';
import { enemiesInCircle, enemiesNearSegment } from '../query.ts';
import type { Enemy, Projectile, World } from '../world.ts';
import { damageEnemy, damagePlayer, type HitOptions } from './combat.ts';
import { spawnProjectile } from './spawn.ts';

const HIT_MEMORY = 16;
const HOMING_RANGE = 320;
const HOMING_TURN = 7;
const FRACTAL_CHILD_SIZE = 0.65;
const FRACTAL_CHILD_LIFE = 0.7;
const FRACTAL_SPIN = 5;
const BULLET_DESPAWN = 1600;

const near: Enemy[] = [];
const hit: HitOptions = { dirX: 0, dirY: 0, knock: 0, canCrit: true };

export function updateProjectiles(w: World): void {
  const items = w.projectiles.items;
  // Children spawned by fractal splits this tick start moving next tick.
  const count = w.projectiles.count;
  for (let i = 0; i < count; i++) {
    const pr = items[i]!;
    if (!pr.alive) continue;
    pr.px = pr.x;
    pr.py = pr.y;
    if (pr.kind === 'wave') moveWave(pr);
    else {
      if (pr.homing) steer(w, pr);
      pr.x += pr.vx * DT;
      pr.y += pr.vy * DT;
      if (pr.kind === 'fractal') pr.rot += FRACTAL_SPIN * DT;
      else pr.rot = Math.atan2(pr.vy, pr.vx);
    }
    if (--pr.life <= 0) {
      pr.alive = false;
      continue;
    }
    collide(w, pr);
  }
}

/** Sine path (or a Fourier square-wave approximation) around a straight carrier line. */
export function wavePosition(pr: Projectile, t: number, out: { x: number; y: number }): void {
  const s = pr.speed * t;
  const f = waveShape((s / pr.wavelength) * TAU, pr.harmonics);
  out.x = pr.ox + pr.dx * s - pr.dy * pr.amp * f;
  out.y = pr.oy + pr.dy * s + pr.dx * pr.amp * f;
}

export function waveShape(phase: number, harmonics: number): number {
  if (harmonics <= 0) return Math.sin(phase);
  let f = 0;
  for (let k = 0; k < harmonics; k++) {
    const n = 2 * k + 1;
    f += Math.sin(n * phase) / n;
  }
  return (4 / Math.PI) * f;
}

const wp = { x: 0, y: 0 };

function moveWave(pr: Projectile): void {
  pr.t += DT;
  wavePosition(pr, pr.t, wp);
  pr.x = wp.x;
  pr.y = wp.y;
}

function steer(w: World, pr: Projectile): void {
  let t = pr.target;
  if (t && (!t.alive || t.id !== pr.targetId)) t = pr.target = null;
  // Re-targeting is staggered: at most every 6th tick per projectile.
  if (!t && (w.tick + pr.id) % 6 === 0) {
    const n = enemiesInCircle(w, pr.x, pr.y, HOMING_RANGE, near);
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      const e = near[j]!;
      if (hasHit(pr, e.id)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        t = e;
      }
    }
    pr.target = t;
    pr.targetId = t ? t.id : 0;
  }
  if (!t) return;
  const cur = Math.atan2(pr.vy, pr.vx);
  let diff = Math.atan2(t.y - pr.y, t.x - pr.x) - cur;
  if (diff > Math.PI) diff -= TAU;
  else if (diff < -Math.PI) diff += TAU;
  const maxTurn = HOMING_TURN * DT;
  const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
  const sp = Math.hypot(pr.vx, pr.vy);
  pr.vx = Math.cos(a) * sp;
  pr.vy = Math.sin(a) * sp;
}

function hasHit(pr: Projectile, id: number): boolean {
  const n = Math.min(pr.hitCount, HIT_MEMORY);
  for (let i = 0; i < n; i++) if (pr.hits[i] === id) return true;
  return false;
}

/** Ring buffer: infinite-pierce waves only need to remember their most recent victims. */
function rememberHit(pr: Projectile, id: number): void {
  pr.hits[pr.hitCount % HIT_MEMORY] = id;
  pr.hitCount++;
}

function collide(w: World, pr: Projectile): void {
  // Grow the probe by half a step so fast bolts cannot tunnel through small shapes.
  const step = pr.kind === 'wave' ? 0 : Math.hypot(pr.vx, pr.vy) * DT * 0.5;
  const n = enemiesInCircle(w, pr.x, pr.y, pr.r + step, near);
  for (let j = 0; j < n; j++) {
    const e = near[j]!;
    if (!e.alive || e.invuln > 0 || hasHit(pr, e.id)) continue;
    rememberHit(pr, e.id);
    const dx = pr.kind === 'wave' ? pr.dx : pr.vx;
    const dy = pr.kind === 'wave' ? pr.dy : pr.vy;
    const l = Math.hypot(dx, dy) || 1;
    hit.dirX = dx / l;
    hit.dirY = dy / l;
    hit.knock = pr.knockback;
    hit.canCrit = !pr.noCritSpray;
    damageEnemy(w, e, pr.damage, pr.source, hit);
    if (pr.kind === 'fractal') splitFractal(w, pr, e.id);
    if (--pr.pierce <= 0) {
      pr.alive = false;
      return;
    }
  }
}

/** Sierpinski step: three smaller copies fly off at +60°, +180° and +300° of the travel angle. */
function splitFractal(w: World, pr: Projectile, victim: number): void {
  if (pr.depth <= 0) return;
  const base = Math.atan2(pr.vy, pr.vx);
  const sp = Math.hypot(pr.vx, pr.vy);
  for (let c = 0; c < 3; c++) {
    const a = base + Math.PI / 3 + (c * TAU) / 3;
    const ch = spawnProjectile(
      w,
      'fractal',
      pr.source,
      pr.slot,
      'fractal',
      pr.color,
      pr.x,
      pr.y,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
    );
    if (!ch) return;
    ch.r = pr.r * FRACTAL_CHILD_SIZE;
    ch.damage = pr.damage * pr.childFactor;
    ch.pierce = 1;
    ch.life = ticks(FRACTAL_CHILD_LIFE);
    ch.knockback = pr.knockback * 0.5;
    ch.depth = pr.depth - 1;
    ch.childFactor = pr.childFactor;
    ch.homing = pr.homing;
    ch.rot = pr.rot;
    ch.hits[0] = victim;
    ch.hitCount = 1;
  }
  // Mandelbrot marks every split with a ring.
  if (pr.homing) w.events.push({ type: 'pulse', x: pr.x, y: pr.y, r: pr.r * 3, color: pr.color });
}

// ------------------------------------------------------------------------------ Enemy bullets

export function updateBullets(w: World): void {
  const p = w.player;
  const items = w.bullets.items;
  const far2 = BULLET_DESPAWN * BULLET_DESPAWN;
  for (let i = 0; i < w.bullets.count; i++) {
    const b = items[i]!;
    if (!b.alive) continue;
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (--b.life <= 0 || d2 > far2) {
      b.alive = false;
      continue;
    }
    const rr = b.r + PLAYER.hurtRadius;
    // During i-frames bullets pass through (dashing through a ring is the point of Vektor).
    if (d2 < rr * rr && damagePlayer(w, b.damage, 'bullet')) b.alive = false;
  }
}

// --------------------------------------------------------------------- Hazards (Vektor line)

export function updateHazards(w: World): void {
  const items = w.hazards.items;
  for (let i = 0; i < w.hazards.count; i++) {
    const h = items[i]!;
    if (!h.alive) continue;
    if (--h.life <= 0) {
      h.alive = false;
      continue;
    }
    const n = enemiesNearSegment(w, h.x1, h.y1, h.x2, h.y2, h.halfWidth, near);
    for (let j = 0; j < n; j++) {
      const e = near[j]!;
      if (h.hitCount >= h.hits.length) break;
      let seen = false;
      for (let k = 0; k < h.hitCount; k++) {
        if (h.hits[k] === e.id) {
          seen = true;
          break;
        }
      }
      if (seen) continue;
      h.hits[h.hitCount++] = e.id;
      const dx = h.x2 - h.x1;
      const dy = h.y2 - h.y1;
      // Push sideways away from the line.
      const side = (e.x - h.x1) * dy - (e.y - h.y1) * dx >= 0 ? 1 : -1;
      const l = Math.hypot(dx, dy) || 1;
      hit.dirX = (dy / l) * side;
      hit.dirY = (-dx / l) * side;
      hit.knock = 160;
      hit.canCrit = true;
      damageEnemy(w, e, h.damage, 'vektor', hit);
    }
  }
}
