import { ENEMIES } from '../../content/enemies.ts';
import { BOSS, complexityBossHp, DT, ticks, timeHp } from '../../content/tuning.ts';
import type { EnemyDef } from '../../content/types.ts';
import { vertexAngle } from '../math/geometry.ts';
import type { Enemy, World } from '../world.ts';
import { killEnemy, spawnGem, spawnPickup } from './combat.ts';
import { spawnEnemy } from './director.ts';
import { spawnBullet } from './spawn.ts';

export const MAX_BOSS_DEPTH = 2;

/** HP still to come from a piece's future children, as a multiple of its own max HP. */
const FUTURE_FACTOR = [
  3 * BOSS.childHpFactor[1]! + 9 * BOSS.childHpFactor[1]! * BOSS.childHpFactor[2]!,
  3 * BOSS.childHpFactor[2]!,
  0,
];

/** Circumradius of a boss piece's triangle; `e.r` is its incircle, used for the crowd push. */
export function bossRadius(e: Enemy): number {
  return BOSS.radius[e.boss] ?? e.r;
}

/**
 * "Sierpinski": a large triangle that splits into three half-size copies instead of dying. Its HP
 * grows with time like every enemy's, so each endless return is tougher, but only linearly with
 * complexity.
 */
export function spawnBoss(w: World, def: EnemyDef): void {
  const p = w.player;
  const d = w.director;
  const hp = def.hp * timeHp(w.time / 60) * complexityBossHp(w.cfg.complexity) * w.mut.bossHp;
  const e = spawnPiece(w, def, 0, p.x, p.y - w.view.halfH - BOSS.radius[0]!, hp, 0);
  if (!e) return;
  d.bossSpawns++;
  d.bossSpawned = true;
  d.bossDefeated = false;
  d.bossMaxHp = hp * (1 + FUTURE_FACTOR[0]!);
  w.events.push({ type: 'boss', enemy: def.id });
}

function spawnPiece(
  w: World,
  def: EnemyDef,
  depth: number,
  x: number,
  y: number,
  hp: number,
  rot: number,
): Enemy | null {
  const e = spawnEnemy(w, def, x, y);
  if (!e) return null;
  e.boss = depth;
  // Hits test the real triangle (see `bossDist`).
  e.r = BOSS.radius[depth]! * 0.5;
  e.maxHp = e.hp = hp;
  e.shells = e.shellsMax = 1;
  e.speed = BOSS.speed[depth]!;
  e.damage = BOSS.contactDamage;
  e.xp = (BOSS.xp / Math.pow(3, depth)) * w.mut.xp;
  e.rot = rot;
  e.timer = ticks(BOSS.volleyInterval[depth]!);
  e.timer2 = ticks(BOSS.spawnInterval);
  return e;
}

export function updateBoss(w: World, e: Enemy, ux: number, uy: number, slow: number): void {
  const d = e.boss;
  const sp = e.speed * slow;
  e.vx = ux * sp;
  e.vy = uy * sp;
  // Alternate spin direction per generation so the split reads as a new pattern.
  e.rot += BOSS.spin * DT * (d % 2 === 0 ? 1 : -1.3);

  e.timer--;
  if (e.timer <= 0) {
    e.timer = ticks(BOSS.volleyInterval[d]!);
    edgeVolley(w, e);
  }
  if (d === 0) {
    e.timer2--;
    if (e.timer2 <= 0) {
      e.timer2 = ticks(BOSS.spawnInterval);
      // Wedges crawl out of the hole in the middle and may dash right away.
      for (let i = 0; i < BOSS.spawnCount; i++) {
        const k = spawnEnemy(
          w,
          ENEMIES.keil,
          e.x + w.rng.range(-20, 20),
          e.y + w.rng.range(-20, 20),
        );
        if (k) k.timer = 0;
      }
    }
  }
}

/** Bullet lines along each edge, flying outward along the edge normal. */
function edgeVolley(w: World, e: Enemy): void {
  const n = BOSS.bulletsPerEdge[e.boss]!;
  const R = bossRadius(e);
  for (let i = 0; i < 3; i++) {
    const a0 = vertexAngle(i, 3, e.rot);
    const a1 = vertexAngle((i + 1) % 3, 3, e.rot);
    const x0 = e.x + Math.cos(a0) * R;
    const y0 = e.y + Math.sin(a0) * R;
    const x1 = e.x + Math.cos(a1) * R;
    const y1 = e.y + Math.sin(a1) * R;
    const mx = (x0 + x1) / 2 - e.x;
    const my = (y0 + y1) / 2 - e.y;
    const ml = Math.hypot(mx, my) || 1;
    const nx = mx / ml;
    const ny = my / ml;
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / (n + 1);
      spawnBullet(
        w,
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t,
        nx * BOSS.bulletSpeed,
        ny * BOSS.bulletSpeed,
        BOSS.bulletDamage,
      );
    }
  }
  w.events.push({ type: 'enemyShot', x: e.x, y: e.y });
}

/** Called when a piece's HP runs out: split into three, or finish the fight. */
export function onBossPieceDestroyed(w: World, e: Enemy): void {
  const R = bossRadius(e);
  w.events.push({ type: 'bossSplit', x: e.x, y: e.y, r: R, depth: e.boss });
  spawnGem(w, e.x, e.y, e.xp);
  if (e.boss < MAX_BOSS_DEPTH) {
    const depth = e.boss + 1;
    for (let i = 0; i < 3; i++) {
      // Corner sub-triangles of a Sierpinski split sit halfway between centre and vertex.
      const a = vertexAngle(i, 3, e.rot);
      const child = spawnPiece(
        w,
        e.def,
        depth,
        e.x + Math.cos(a) * R * 0.5,
        e.y + Math.sin(a) * R * 0.5,
        e.maxHp * BOSS.childHpFactor[depth]!,
        e.rot,
      );
      if (!child) continue;
      child.invuln = ticks(BOSS.splitInvuln);
      child.kx = Math.cos(a) * 260;
      child.ky = Math.sin(a) * 260;
      child.timer = ticks(BOSS.volleyInterval[depth]!) + i * ticks(0.3);
    }
    return;
  }
  for (let i = 0; i < w.enemies.count; i++) {
    const o = w.enemies.items[i]!;
    if (o.alive && o.boss >= 0) return;
  }
  w.director.bossDefeated = true;
  w.run.bossKilled = true;
  w.run.bossKills++;
  victorySweep(w);
  const reward = spawnPickup(w, 'splitter', e.x, e.y, BOSS.splitter);
  if (reward) reward.attracted = true;
  w.events.push({ type: 'bossDefeated' });
}

/** Clears the field after the last piece falls and pulls every drop to the player. */
function victorySweep(w: World): void {
  for (let i = 0; i < w.enemies.count; i++) {
    const o = w.enemies.items[i]!;
    if (o.alive && o.boss < 0) killEnemy(w, o, false);
  }
  for (let i = 0; i < w.bullets.count; i++) w.bullets.items[i]!.alive = false;
  for (let i = 0; i < w.gems.count; i++) w.gems.items[i]!.attracted = true;
  for (let i = 0; i < w.pickups.count; i++) w.pickups.items[i]!.attracted = true;
}

/** Remaining boss HP (alive pieces plus their unborn children) as 0..1 of the whole fight. */
export function bossProgress(w: World): number {
  if (!w.director.bossSpawned || w.director.bossMaxHp <= 0) return 0;
  let left = 0;
  for (let i = 0; i < w.enemies.count; i++) {
    const e = w.enemies.items[i]!;
    if (!e.alive || e.boss < 0) continue;
    left += Math.max(0, e.hp) + FUTURE_FACTOR[e.boss]! * e.maxHp;
  }
  return Math.min(1, left / w.director.bossMaxHp);
}
