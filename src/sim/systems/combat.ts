import { COLORS } from '../../content/palette.ts';
import {
  complexityDamage,
  complexityHp,
  DROPS,
  ELITE,
  ENDLESS,
  ENEMY,
  GEMS,
  PICKUPS,
  PLAYER,
  RUN,
  SCALING,
  ticks,
  timeHp,
} from '../../content/tuning.ts';
import type { PickupKind } from '../../content/types.ts';
import type { Enemy, Gem, Pickup, World } from '../world.ts';
import { MISC_SLOT } from '../world.ts';
import { onBossPieceDestroyed } from './boss.ts';
import { spawnProjectile } from './spawn.ts';

const FLASH_TICKS = ticks(ENEMY.flashTime);

export interface HitOptions {
  /** Knockback direction (unit vector) and strength in px/s. */
  dirX: number;
  dirY: number;
  knock: number;
  canCrit: boolean;
}

const DEFAULT_HIT: HitOptions = { dirX: 0, dirY: 0, knock: 0, canCrit: true };

/**
 * Applies damage (with crit roll), knockback, shell breaks and death. Returns true when this hit
 * killed the enemy. `source` is used for the damage-per-weapon breakdown.
 */
export function damageEnemy(
  w: World,
  e: Enemy,
  amount: number,
  source: string,
  opts: HitOptions = DEFAULT_HIT,
): boolean {
  if (!e.alive || e.invuln > 0 || amount <= 0) return false;
  let dmg = amount;
  let crit = false;
  if (opts.canCrit && w.rng.chance(w.stats.crit)) {
    dmg *= w.stats.critMult;
    crit = true;
  }
  const dealt = Math.min(dmg, Math.max(0, e.hp));
  e.hp -= dmg;
  e.flash = FLASH_TICKS;
  w.run.damageBySource.set(source, (w.run.damageBySource.get(source) ?? 0) + dealt);
  w.events.push({ type: 'hit', x: e.x, y: e.y - e.r, amount: dmg, crit });

  if (opts.knock > 0) {
    const k = opts.knock * (1 - knockResist(e));
    e.kx += opts.dirX * k;
    e.ky += opts.dirY * k;
  }

  if (crit && w.player.char.critShards) sprayCritShards(w, e);

  if (e.hp <= 0) {
    killEnemy(w, e, true);
    return true;
  }
  const shells = Math.ceil((e.hp / e.maxHp) * e.shellsMax);
  if (shells < e.shells) {
    e.shells = shells;
    w.events.push({
      type: 'shell',
      x: e.x,
      y: e.y,
      r: e.r,
      shape: e.def.shape,
      color: e.def.color,
      rot: e.rot,
    });
  }
  return false;
}

/** Nova's trait: every crit sprays three small shards from the victim. Shards cannot crit. */
function sprayCritShards(w: World, e: Enemy): void {
  for (let i = 0; i < 3; i++) {
    const a = w.rng.angle();
    const pr = spawnProjectile(
      w,
      'shard',
      'nova',
      MISC_SLOT,
      'shard',
      COLORS.nova,
      e.x,
      e.y,
      Math.cos(a) * 380,
      Math.sin(a) * 380,
    );
    if (!pr) return;
    pr.r = 4;
    pr.damage = 4 * w.stats.might;
    pr.life = ticks(0.45);
    pr.knockback = 20;
    pr.noCritSpray = true;
    pr.hitCount = 1;
    pr.hits[0] = e.id;
  }
}

/** Removes an enemy. `rewarded` = killed by the player (drops, counts); false for self-destruct/despawn. */
/** Share of a push an enemy ignores: bosses stand firm, elites resist at least 60 %. */
export function knockResist(e: Enemy): number {
  if (e.boss >= 0) return 1;
  return e.elite ? Math.max(0.6, e.def.knockbackResist) : e.def.knockbackResist;
}

export function killEnemy(w: World, e: Enemy, rewarded: boolean): void {
  if (!e.alive) return;
  e.alive = false;
  if (e.boss >= 0) {
    onBossPieceDestroyed(w, e);
    return;
  }
  w.events.push({
    type: 'kill',
    x: e.x,
    y: e.y,
    r: e.r,
    shape: e.def.shape,
    color: e.def.color,
    rot: e.rot,
    elite: e.elite,
  });
  if (!rewarded) return;
  w.run.kills++;
  if (e.elite) w.run.elitesKilled++;
  spawnGem(w, e.x, e.y, e.xp);
  if (e.drop === 'vertex') spawnPickup(w, 'vertexCube', e.x, e.y, 0);
  else if (e.drop === 'upgrade') spawnPickup(w, 'upgradeCube', e.x, e.y, 0);
  if (e.elite) spawnPickup(w, 'splitter', e.x + 12, e.y, ELITE.splitter);
  rollDrops(w, e.x, e.y);
}

const DROP_TABLE: readonly (readonly [PickupKind, number])[] = [
  ['heal', DROPS.heal],
  ['sum', DROPS.sum],
  ['bomb', DROPS.bomb],
  ['slow', DROPS.slow],
];

function rollDrops(w: World, x: number, y: number): void {
  const luck = w.stats.luck;
  let r = w.rng.next();
  for (const [kind, chance] of DROP_TABLE) {
    r -= chance * luck * (kind === 'heal' ? w.mut.healDrops : 1);
    if (r < 0) {
      spawnPickup(w, kind, x, y, 0);
      break;
    }
  }
  if (w.rng.chance(DROPS.splitter * luck)) spawnPickup(w, 'splitter', x, y, PICKUPS.splitterValue);
}

export function spawnGem(w: World, x: number, y: number, value: number): void {
  if (value <= 0) return;
  // Too many gems on the map: fold the value into the nearest one instead of spawning.
  if (w.gems.count >= GEMS.mergeAt) {
    const g = nearestGem(w, x, y);
    if (g) {
      g.value += value;
      g.tier = gemTier(g.value);
      return;
    }
  }
  const g = w.gems.spawn();
  if (!g) return;
  const a = w.rng.angle();
  const d = w.rng.range(0, 6);
  g.x = g.px = x + Math.cos(a) * d;
  g.y = g.py = y + Math.sin(a) * d;
  g.vx = 0;
  g.vy = 0;
  g.value = value;
  g.tier = gemTier(value);
  g.attracted = false;
}

function gemTier(value: number): number {
  return value >= GEMS.tiers[2]! ? 2 : value >= GEMS.tiers[1]! ? 1 : 0;
}

function nearestGem(w: World, x: number, y: number): Gem | null {
  let best: Gem | null = null;
  let bestD = Infinity;
  for (let i = 0; i < w.gems.count; i++) {
    const g = w.gems.items[i]!;
    const d = (g.x - x) ** 2 + (g.y - y) ** 2;
    if (g.alive && d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

export function spawnPickup(
  w: World,
  kind: PickupKind,
  x: number,
  y: number,
  value: number,
): Pickup | null {
  let pk = w.pickups.spawn();
  // Cubes carry the run's progression and must never be dropped: evict the oldest trinket instead.
  if (!pk && (kind === 'vertexCube' || kind === 'upgradeCube')) pk = oldestTrinket(w);
  if (!pk) return null;
  pk.kind = kind;
  pk.x = pk.px = x;
  pk.y = pk.py = y;
  pk.vx = 0;
  pk.vy = 0;
  pk.value = value;
  pk.attracted = false;
  pk.age = 0;
  return pk;
}

function oldestTrinket(w: World): Pickup | null {
  let best: Pickup | null = null;
  for (let i = 0; i < w.pickups.count; i++) {
    const pk = w.pickups.items[i]!;
    if (!pk.alive || pk.kind === 'vertexCube' || pk.kind === 'upgradeCube') continue;
    if (!best || pk.age > best.age) best = pk;
  }
  return best;
}

/** Returns true when damage was applied (not blocked by i-frames or god mode). */
/** `source` names the attacker (an enemy id, or 'bullet') for the run statistics. */
export function damagePlayer(w: World, amount: number, source: string): boolean {
  const p = w.player;
  if (p.iframes > 0 || p.hp <= 0 || w.god) return false;
  const dmg = Math.max(1, amount - w.stats.armor);
  p.hp -= dmg;
  p.iframes = ticks(PLAYER.iframesOnHit);
  w.run.damageTaken += dmg;
  w.run.hurtBy.set(source, (w.run.hurtBy.get(source) ?? 0) + dmg);
  w.events.push({ type: 'playerHurt', amount: dmg });
  if (p.hp > 0) return true;
  if (p.revivals > 0) {
    p.revivals--;
    p.hp = w.stats.maxHp * 0.5;
    p.iframes = ticks(2);
    // Clear breathing room: blast everything close by.
    for (let i = 0; i < w.enemies.count; i++) {
      const e = w.enemies.items[i]!;
      if (!e.alive || e.boss >= 0) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy < 300 * 300) killEnemy(w, e, true);
    }
    w.events.push({ type: 'revive' });
    return true;
  }
  p.hp = 0;
  w.run.killedBy = source;
  w.events.push({ type: 'playerDied' });
  return true;
}

export function healPlayer(w: World, amount: number): void {
  const p = w.player;
  if (p.hp <= 0) return;
  const before = p.hp;
  p.hp = Math.min(w.stats.maxHp, p.hp + amount);
  if (p.hp > before + 0.5) w.events.push({ type: 'playerHeal', amount: p.hp - before });
}

/** Endless mode past the run length: enemy damage keeps growing until nobody survives. */
function endlessDamage(w: World): number {
  if (!w.cfg.endless || w.time <= RUN.length) return 1;
  return ENDLESS.damageGrowth ** ((w.time - RUN.length) / 60);
}

export interface EnemyScale {
  hp: number;
  damage: number;
  speed: number;
}

/** Scaling factors for enemies spawned at the current time (complexity level and mutators). */
export function enemyScale(w: World, out: EnemyScale): EnemyScale {
  const minutes = w.time / 60;
  out.hp = timeHp(minutes) * complexityHp(w.cfg.complexity) * w.mut.enemyHp;
  out.damage =
    (1 + minutes * SCALING.damagePerMinute) *
    endlessDamage(w) *
    complexityDamage(w.cfg.complexity) *
    w.mut.enemyDamage;
  out.speed = (1 + minutes * SCALING.speedPerMinute) * w.mut.enemySpeed;
  return out;
}
