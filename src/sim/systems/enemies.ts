import { ENEMIES } from '../../content/enemies.ts';
import { BOSS, CAPS, DT, ENEMY, PICKUPS, PLAYER, ticks } from '../../content/tuning.ts';
import type { AiParams } from '../../content/types.ts';
import { TAU, type Vec } from '../math/vec.ts';
import type { Enemy, World } from '../world.ts';
import { updateBoss } from './boss.ts';
import { damageEnemy, damagePlayer, killEnemy, type HitOptions } from './combat.ts';
import { spawnEnemy, spawnPoint } from './director.ts';
import { bossDist } from '../query.ts';
import { spawnBullet } from './spawn.ts';

/**
 * Shared AI state numbering, so the renderer can draw telegraphs generically:
 * every attack goes MOVE → WINDUP (telegraph visible) → ATTACK → RECOVER → MOVE.
 */
export const AI_MOVE = 0;
export const AI_WINDUP = 1;
export const AI_ATTACK = 2;
export const AI_RECOVER = 3;

const idx = new Int32Array(CAPS.enemies);
const pt: Vec = { x: 0, y: 0 };
const blast: HitOptions = { dirX: 0, dirY: 0, knock: 0, canCrit: false };

type AiOf<K extends AiParams['kind']> = Extract<AiParams, { kind: K }>;

export function updateEnemies(w: World): void {
  const p = w.player;
  const globalSlow = w.enemySlowTicks > 0 ? PICKUPS.slowFactor : 1;
  const relocate = Math.hypot(w.view.halfW, w.view.halfH) + ENEMY.relocateMargin;
  const relocate2 = relocate * relocate;
  const bossRelocate2 = relocate2 * BOSS.relocateFactor * BOSS.relocateFactor;
  const decay = ENEMY.knockbackDecay;
  const items = w.enemies.items;
  // Enemies spawned during this loop (summons, boss splits) start moving next tick.
  const count = w.enemies.count;
  for (let i = 0; i < count; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    e.px = e.x;
    e.py = e.y;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const slow = globalSlow * (e.slowTicks > 0 ? e.slowFactor : 1);

    if (e.boss >= 0) updateBoss(w, e, ux, uy, slow);
    else if (e.march) {
      e.vx = e.tx * e.speed * slow;
      e.vy = e.ty * e.speed * slow;
    } else if (think(w, e, ux, uy, d, slow)) continue; // blew itself up

    e.x += (e.vx + e.kx) * DT;
    e.y += (e.vy + e.ky) * DT;
    e.kx *= decay;
    e.ky *= decay;
    if (e.boss < 0 && e.def.ai.kind !== 'dash' && e.def.ai.kind !== 'orbitDive')
      e.rot += e.rotSpeed * DT;
    if (e.flash > 0) e.flash--;
    if (e.invuln > 0) e.invuln--;
    if (e.slowTicks > 0) e.slowTicks--;

    if (d2 > (e.boss >= 0 ? bossRelocate2 : relocate2)) {
      // A marching wall that has crossed the field is done; everything else is brought back.
      if (e.march) e.alive = false;
      else relocateAhead(w, e);
    }
  }
  rebuildHash(w);
  separate(w);
  contactDamage(w);
}

/** Re-indexes alive regular enemies; boss pieces go to `w.bosses` instead (too big for the grid). */
export function rebuildHash(w: World): void {
  const h = w.hash;
  h.clear();
  w.bosses.length = 0;
  const items = w.enemies.items;
  for (let i = 0; i < w.enemies.count; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    if (e.boss >= 0) w.bosses.push(e);
    else h.insert(i, e.x, e.y, e.r);
  }
}

/** Sets the enemy's desired velocity. Returns true when the enemy removed itself. */
function think(w: World, e: Enemy, ux: number, uy: number, d: number, slow: number): boolean {
  const ai = e.def.ai;
  const sp = e.speed * slow;
  switch (ai.kind) {
    case 'chase':
    case 'march':
    case 'boss':
      e.vx = ux * sp;
      e.vy = uy * sp;
      break;
    case 'dash':
      dashAi(w, e, ai, ux, uy, d, sp);
      break;
    case 'orbitDive':
      orbitDiveAi(w, e, ai, ux, uy, d, sp);
      break;
    case 'kite':
      kiteAi(w, e, ai, ux, uy, d, sp);
      break;
    case 'spawner':
      spawnerAi(w, e, ai, ux, uy, d, sp);
      break;
    case 'kamikaze':
      return kamikazeAi(w, e, ai, ux, uy, d, sp);
  }
  return false;
}

/** Triangles point where they go (vertex 0 points up at rotation 0). */
function face(e: Enemy, x: number, y: number): void {
  e.rot = Math.atan2(y, x) + Math.PI / 2;
}

function dashAi(
  w: World,
  e: Enemy,
  ai: AiOf<'dash'>,
  ux: number,
  uy: number,
  d: number,
  sp: number,
): void {
  switch (e.state) {
    case AI_MOVE:
      e.vx = ux * sp;
      e.vy = uy * sp;
      face(e, ux, uy);
      if (e.timer > 0) e.timer--;
      else if (d < ai.range) {
        e.state = AI_WINDUP;
        e.timer = ticks(ai.windup);
        e.tx = ux;
        e.ty = uy;
      }
      break;
    case AI_WINDUP:
      e.vx = 0;
      e.vy = 0;
      face(e, e.tx, e.ty);
      if (--e.timer <= 0) {
        e.state = AI_ATTACK;
        e.timer = ticks(ai.dashTime);
      }
      break;
    case AI_ATTACK:
      e.vx = e.tx * sp * ai.dashMult;
      e.vy = e.ty * sp * ai.dashMult;
      if (--e.timer <= 0) {
        e.state = AI_RECOVER;
        e.timer = ticks(ai.recover);
      }
      break;
    default:
      e.vx = ux * sp * 0.3;
      e.vy = uy * sp * 0.3;
      if (--e.timer <= 0) {
        e.state = AI_MOVE;
        e.timer = ticks(1) + w.rng.int(ticks(1));
      }
  }
}

function orbitDiveAi(
  w: World,
  e: Enemy,
  ai: AiOf<'orbitDive'>,
  ux: number,
  uy: number,
  d: number,
  sp: number,
): void {
  switch (e.state) {
    case AI_WINDUP:
      e.vx = 0;
      e.vy = 0;
      face(e, e.tx, e.ty);
      if (--e.timer <= 0) {
        e.state = AI_ATTACK;
        e.timer = ticks(ai.diveTime);
      }
      return;
    case AI_ATTACK:
      e.vx = e.tx * sp * ai.diveMult;
      e.vy = e.ty * sp * ai.diveMult;
      if (--e.timer <= 0) {
        e.state = AI_MOVE;
        e.timer = ticks(ai.interval);
      }
      return;
    default: {
      // Circle the player: aim at a point on the orbit slightly ahead of the current angle.
      const p = w.player;
      const dir = e.rotSpeed >= 0 ? 1 : -1;
      const a = Math.atan2(-uy, -ux) + dir * 0.5;
      const tx = p.x + Math.cos(a) * ai.orbitRadius - e.x;
      const ty = p.y + Math.sin(a) * ai.orbitRadius - e.y;
      const tl = Math.hypot(tx, ty) || 1;
      e.vx = (tx / tl) * sp;
      e.vy = (ty / tl) * sp;
      face(e, e.vx, e.vy);
      if (e.timer > 0) e.timer--;
      else if (d < ai.orbitRadius * 1.5) {
        e.state = AI_WINDUP;
        e.timer = ticks(ai.windup);
        e.tx = ux;
        e.ty = uy;
      }
    }
  }
}

function kiteAi(
  w: World,
  e: Enemy,
  ai: AiOf<'kite'>,
  ux: number,
  uy: number,
  d: number,
  sp: number,
): void {
  if (e.state === AI_WINDUP) {
    e.vx = 0;
    e.vy = 0;
    if (--e.timer <= 0) {
      fireRing(w, e, ai, ux, uy);
      e.state = AI_MOVE;
      e.timer = ticks(ai.interval);
    }
    return;
  }
  if (d > ai.max) {
    e.vx = ux * sp;
    e.vy = uy * sp;
  } else if (d < ai.min) {
    e.vx = -ux * sp;
    e.vy = -uy * sp;
  } else {
    // Inside the comfort band: strafe sideways.
    const dir = e.rotSpeed >= 0 ? 0.45 : -0.45;
    e.vx = -uy * sp * dir;
    e.vy = ux * sp * dir;
  }
  if (e.timer > 0) e.timer--;
  else if (d < ai.max + 120) {
    e.state = AI_WINDUP;
    e.timer = ticks(ai.windup);
  }
}

/** Ring of bullets; one of them always flies straight at the player. */
function fireRing(w: World, e: Enemy, ai: AiOf<'kite'>, ux: number, uy: number): void {
  const base = Math.atan2(uy, ux);
  const dmg = ai.bulletDamage * (e.damage / e.def.damage);
  for (let k = 0; k < ai.bullets; k++) {
    const a = base + (k * TAU) / ai.bullets;
    const c = Math.cos(a);
    const s = Math.sin(a);
    spawnBullet(w, e.x + c * e.r, e.y + s * e.r, c * ai.bulletSpeed, s * ai.bulletSpeed, dmg);
  }
  w.events.push({ type: 'enemyShot', x: e.x, y: e.y });
}

function spawnerAi(
  w: World,
  e: Enemy,
  ai: AiOf<'spawner'>,
  ux: number,
  uy: number,
  d: number,
  sp: number,
): void {
  if (e.state === AI_WINDUP) {
    e.vx = 0;
    e.vy = 0;
    if (--e.timer <= 0) {
      const def = ENEMIES[ai.spawn];
      const off = w.rng.angle();
      for (let k = 0; k < ai.count && w.enemies.count < w.director.cap; k++) {
        const a = off + (k * TAU) / ai.count;
        spawnEnemy(w, def, e.x + Math.cos(a) * (e.r + 10), e.y + Math.sin(a) * (e.r + 10));
      }
      e.state = AI_MOVE;
      e.timer = ticks(ai.interval);
    }
    return;
  }
  e.vx = ux * sp;
  e.vy = uy * sp;
  if (e.timer > 0) e.timer--;
  else if (d < 700) {
    e.state = AI_WINDUP;
    e.timer = ticks(0.5);
  }
}

function kamikazeAi(
  w: World,
  e: Enemy,
  ai: AiOf<'kamikaze'>,
  ux: number,
  uy: number,
  d: number,
  sp: number,
): boolean {
  if (e.state === AI_WINDUP) {
    // Lit fuse: creep on and spin up.
    e.vx = ux * sp * 0.25;
    e.vy = uy * sp * 0.25;
    e.rot += 12 * DT;
    if (--e.timer > 0) return false;
    explode(w, e, ai);
    return true;
  }
  e.vx = ux * sp;
  e.vy = uy * sp;
  if (d < ai.trigger) {
    e.state = AI_WINDUP;
    e.timer = ticks(ai.fuse);
  }
  return false;
}

/** Blast that hurts the player and every other enemy in range. The star itself gives no reward. */
function explode(w: World, e: Enemy, ai: AiOf<'kamikaze'>): void {
  const p = w.player;
  const scale = e.damage / e.def.damage;
  const R = ai.radius * (e.elite ? 1.6 : 1);
  const rp = R + PLAYER.hurtRadius;
  const pdx = p.x - e.x;
  const pdy = p.y - e.y;
  if (pdx * pdx + pdy * pdy <= rp * rp) damagePlayer(w, ai.damage * scale, e.def.id);
  killEnemy(w, e, false);
  // Brute force: explosions are rare and the grid may still hold last tick's layout.
  const items = w.enemies.items;
  const n = w.enemies.count;
  for (let i = 0; i < n; i++) {
    const o = items[i]!;
    if (!o.alive) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const rr = R + o.r;
    const dd = dx * dx + dy * dy;
    if (o.boss >= 0 ? bossDist(o, e.x, e.y) > R : dd > rr * rr) continue;
    const l = Math.sqrt(dd) || 1;
    blast.dirX = dx / l;
    blast.dirY = dy / l;
    blast.knock = 260;
    damageEnemy(w, o, ai.damage * scale, 'stern', blast);
  }
  w.events.push({ type: 'explosion', x: e.x, y: e.y, r: R, color: e.def.color });
}

/** Moves a straggler to the spawn edge in front of the player (roughly where they are heading). */
function relocateAhead(w: World, e: Enemy): void {
  const p = w.player;
  spawnPoint(w, Math.atan2(p.fy, p.fx) + w.rng.range(-1, 1), pt);
  e.x = e.px = pt.x;
  e.y = e.py = pt.y;
  e.kx = 0;
  e.ky = 0;
}

/** Soft push-apart so hordes spread into readable crowds instead of one blob. */
function separate(w: World): void {
  const items = w.enemies.items;
  const k = ENEMY.separation;
  const maxN = ENEMY.maxNeighbours;
  for (let i = 0; i < w.enemies.count; i++) {
    const e = items[i]!;
    if (!e.alive || e.boss >= 0) continue;
    const n = w.hash.queryCircle(e.x, e.y, e.r, idx);
    let pushes = 0;
    for (let j = 0; j < n && pushes < maxN; j++) {
      const oi = idx[j]!;
      if (oi === i) continue;
      const o = items[oi]!;
      if (!o.alive) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const rr = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      pushes++;
      if (d2 < 1e-6) {
        // Perfectly stacked (e.g. summoned on the same spot): nudge deterministically.
        e.x += (i & 1) === 0 ? 0.5 : -0.5;
        continue;
      }
      const dist = Math.sqrt(d2);
      // Small shapes give way to big ones.
      const push = ((rr - dist) * k * o.r) / rr;
      e.x += (dx / dist) * push;
      e.y += (dy / dist) * push;
    }
  }
  // Boss pieces shove regular enemies out of their body.
  for (const b of w.bosses) {
    if (!b.alive) continue;
    const n = w.hash.queryCircle(b.x, b.y, b.r, idx);
    for (let j = 0; j < n; j++) {
      const o = items[idx[j]!]!;
      if (!o.alive) continue;
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const rr = b.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const dist = Math.sqrt(d2);
      const push = (rr - dist) * 0.5;
      o.x += (dx / dist) * push;
      o.y += (dy / dist) * push;
    }
  }
}

/** The strongest enemy touching the player's core deals its contact damage. */
function contactDamage(w: World): void {
  const p = w.player;
  if (p.iframes > 0 || p.hp <= 0) return;
  const items = w.enemies.items;
  const n = w.hash.queryCircle(p.x, p.y, PLAYER.hurtRadius, idx);
  let best: Enemy | null = null;
  for (let j = 0; j < n; j++) {
    const e = items[idx[j]!]!;
    if (!e.alive || e.damage <= (best?.damage ?? 0)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = e.r + PLAYER.hurtRadius;
    if (dx * dx + dy * dy < rr * rr) best = e;
  }
  for (const e of w.bosses) {
    if (!e.alive || e.damage <= (best?.damage ?? 0)) continue;
    if (bossDist(e, p.x, p.y) < PLAYER.hurtRadius) best = e;
  }
  if (best) damagePlayer(w, best.damage, best.def.id);
}
