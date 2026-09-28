import { ENEMY, ticks } from '../../content/tuning.ts';
import type { ShapeId } from '../../content/types.ts';
import type { Bullet, Projectile, ProjectileKind, World } from '../world.ts';

/**
 * Takes a projectile from the pool and resets every field to a neutral default. Callers then set
 * damage, pierce, life and kind-specific fields. Returns null when the pool is full.
 */
export function spawnProjectile(
  w: World,
  kind: ProjectileKind,
  source: Projectile['source'],
  slot: number,
  shape: ShapeId,
  color: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
): Projectile | null {
  const pr = w.projectiles.spawn();
  if (!pr) return null;
  pr.kind = kind;
  pr.source = source;
  pr.slot = slot;
  pr.shape = shape;
  pr.color = color;
  pr.x = pr.px = x;
  pr.y = pr.py = y;
  pr.vx = vx;
  pr.vy = vy;
  pr.r = 5;
  pr.damage = 0;
  pr.pierce = 1;
  pr.life = ticks(1);
  pr.knockback = 0;
  pr.rot = Math.atan2(vy, vx);
  pr.ox = x;
  pr.oy = y;
  pr.dx = 0;
  pr.dy = 0;
  pr.t = 0;
  pr.speed = 0;
  pr.amp = 0;
  pr.wavelength = 1;
  pr.harmonics = 0;
  pr.depth = 0;
  pr.childFactor = 0;
  pr.homing = false;
  pr.target = null;
  pr.targetId = 0;
  pr.noCritSpray = false;
  pr.hitCount = 0;
  return pr;
}

/** Enemy bullet (hollow magenta ring, always drawn on top). */
export function spawnBullet(
  w: World,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
): Bullet | null {
  const b = w.bullets.spawn();
  if (!b) return null;
  b.x = b.px = x;
  b.y = b.py = y;
  b.vx = vx;
  b.vy = vy;
  b.r = ENEMY.bulletRadius;
  b.damage = damage;
  b.life = ticks(ENEMY.bulletLife);
  return b;
}
