import { DT, GEMS, PICKUPS, ticks } from '../../content/tuning.ts';
import type { Gem, Pickup, World } from '../world.ts';
import { MISC_SLOT } from '../world.ts';
import { damageEnemy, healPlayer, type HitOptions } from './combat.ts';

/** Steering gain: how fast an attracted drop turns its velocity toward the player. */
const STEER = 10;
/** Trinkets left this far behind disappear (cubes never do). */
const PICKUP_DESPAWN = 2600;

const blast: HitOptions = { dirX: 0, dirY: 0, knock: 220, canCrit: false };

type Drop = Gem | Pickup;

/** Moves an attracted drop toward the player; returns the remaining distance. */
function pull(w: World, g: Drop): number {
  const p = w.player;
  const dx = p.x - g.x;
  const dy = p.y - g.y;
  const d = Math.hypot(dx, dy) || 1;
  const max = GEMS.attractMaxSpeed;
  const k = Math.min(1, STEER * DT);
  g.vx += ((dx / d) * max - g.vx) * k;
  g.vy += ((dy / d) * max - g.vy) * k;
  g.x += g.vx * DT;
  g.y += g.vy * DT;
  return Math.hypot(p.x - g.x, p.y - g.y);
}

export function updateGems(w: World): void {
  const p = w.player;
  const magnet = p.char.magnet * w.stats.magnet;
  const m2 = magnet * magnet;
  const items = w.gems.items;
  for (let i = 0; i < w.gems.count; i++) {
    const g = items[i]!;
    if (!g.alive) continue;
    g.px = g.x;
    g.py = g.y;
    if (!g.attracted) {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      if (dx * dx + dy * dy > m2) continue;
      g.attracted = true;
    }
    if (pull(w, g) > GEMS.pickupRadius) continue;
    g.alive = false;
    p.xp += g.value * w.stats.growth;
    w.events.push({ type: 'gem', value: g.value });
  }
}

export function updatePickups(w: World): void {
  const p = w.player;
  const magnet = p.char.magnet * w.stats.magnet;
  const m2 = magnet * magnet;
  const far2 = PICKUP_DESPAWN * PICKUP_DESPAWN;
  const items = w.pickups.items;
  for (let i = 0; i < w.pickups.count; i++) {
    const pk = items[i]!;
    if (!pk.alive) continue;
    pk.px = pk.x;
    pk.py = pk.y;
    pk.age++;
    const dx = p.x - pk.x;
    const dy = p.y - pk.y;
    const d2 = dx * dx + dy * dy;
    // Splitter behave like gems; everything else must be touched (or is pulled after a boss).
    if (!pk.attracted && pk.kind === 'splitter' && d2 < m2) pk.attracted = true;
    const d = pk.attracted ? pull(w, pk) : Math.sqrt(d2);
    if (d <= PICKUPS.radius) {
      pk.alive = false;
      collect(w, pk);
    } else if (d2 > far2 && pk.kind !== 'vertexCube' && pk.kind !== 'upgradeCube') pk.alive = false;
  }
}

function collect(w: World, pk: Pickup): void {
  switch (pk.kind) {
    case 'heal':
      healPlayer(w, PICKUPS.heal);
      break;
    case 'sum':
      // ∑: every crystal on the map flies in.
      for (let i = 0; i < w.gems.count; i++) w.gems.items[i]!.attracted = true;
      break;
    case 'bomb':
      bomb(w);
      break;
    case 'slow':
      w.enemySlowTicks = ticks(PICKUPS.slowTime);
      break;
    case 'splitter':
      w.run.splitter += pk.value;
      break;
    case 'vertexCube':
      w.pendingCubes.push('vertex');
      break;
    case 'upgradeCube':
      w.pendingCubes.push('upgrade');
      break;
  }
  w.events.push({ type: 'pickup', kind: pk.kind, x: pk.x, y: pk.y });
}

/** ×: heavy damage to everything on screen. */
function bomb(w: World): void {
  const p = w.player;
  const items = w.enemies.items;
  const n = w.enemies.count;
  for (let i = 0; i < n; i++) {
    const e = items[i]!;
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (Math.abs(dx) > w.view.halfW + e.r || Math.abs(dy) > w.view.halfH + e.r) continue;
    const l = Math.hypot(dx, dy) || 1;
    blast.dirX = dx / l;
    blast.dirY = dy / l;
    e.lastHit[MISC_SLOT] = w.tick;
    damageEnemy(w, e, PICKUPS.bombDamage, 'bomb', blast);
  }
  w.events.push({
    type: 'explosion',
    x: p.x,
    y: p.y,
    r: Math.max(w.view.halfW, w.view.halfH),
    color: 0xffffff,
  });
}
