/** Every tuning number lives here or in the content tables — never inline in systems. */

import type { StatKey } from './types.ts';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** Converts seconds to whole simulation ticks (at least 1 for positive durations). */
export function ticks(seconds: number): number {
  return seconds <= 0 ? 0 : Math.max(1, Math.round(seconds * TICK_RATE));
}

export const RUN = {
  /** Boss arrives at 20:00. */
  length: 1200,
  /** Normal spawns while the boss lives, as a fraction of the last segment's rate. */
  bossSpawnFactor: 0.3,
  /** Endless mode: spawn-rate growth per minute past the run length. */
  endlessRatePerMinute: 0.08,
} as const;

/**
 * Endless mode past the run length: `ENDLESS_SCRIPT` (waves.ts) repeats every `cycle` seconds and
 * ends each lap with Sierpinski's return (30:00, 40:00, …). The boss's HP follows the enemy
 * scaling, so every return is as tough as the enemies around it.
 */
export const ENDLESS = {
  cycle: 600,
  /** Past the run length enemy damage grows by this factor per minute on top: the wall. */
  damageGrowth: 1.05,
} as const;

export const PLAYER = {
  startVertices: 3,
  maxVertices: 6,
  /** Hurtbox = the glowing core point; much smaller than the polygon. */
  hurtRadius: 8,
  baseRadius: 18,
  radiusPerVertex: 2,
  /** Constant polygon spin in rad/s ("Drehimpuls"). */
  spin: 0.8,
  iframesOnHit: 0.5,
  /** Sim freeze while a new vertex grows. */
  morphTime: 0.8,
  /** Cooldown multiplier floor so stacking never reaches zero. */
  minCooldown: 0.4,
} as const;

/** Last hand-written weapon level (`levels` in weapons.ts); reaching it opens the Q.E.D. */
export const CORE_LEVEL = 8;

/**
 * Überstufen: past their core levels weapons, theorems and most axioms keep levelling up to
 * `maxLevel` – far more level-ups than a run ever hands out. Every weapon level adds
 * `damagePerLevel` of its core damage; every `milestoneEvery` levels (Lv 10, 15, …) it also takes
 * the next step of its milestone cycle (`over` in weapons.ts).
 */
export const OVER = {
  maxLevel: 99,
  damagePerLevel: 0.1,
  milestoneEvery: 5,
  /** Milestones never add more than this many projectiles over the core level … */
  maxExtraAmount: 2,
  /** … nor cut the cooldown below this share of the core cooldown … */
  minCooldownFactor: 0.5,
  /** … nor slow enemies by more than this. */
  maxSlow: 0.6,
} as const;

/**
 * Hard caps on player stats (after axioms and meta ranks), so no build breaks the game. The
 * cooldown floor is `PLAYER.minCooldown`. An axiom whose next level only touches capped stats is
 * no longer offered.
 */
export const STAT_CAPS = {
  amount: 4,
  area: 2.5,
  duration: 2.5,
  projSpeed: 2.5,
  moveSpeed: 1.8,
  magnet: 4,
  crit: 0.75,
} as const satisfies Partial<Record<StatKey, number>>;

/** XP required to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  if (level < 20) return 5 + 10 * (level - 1);
  if (level < 40) return 195 + 13 * (level - 20);
  return 455 + 16 * (level - 40);
}

export const CAPS = {
  enemies: 1200,
  projectiles: 3000,
  bullets: 800,
  gems: 400,
  pickups: 64,
  hazards: 64,
} as const;

export const SCALING = {
  /** Enemy HP = (1 + hpPerMinute · min) · hpGrowth^min, so it keeps pace with growing builds. */
  hpPerMinute: 0.12,
  hpGrowth: 1.13,
  damagePerMinute: 0.04,
  /** Enemies speed up by this share per minute: by 15:00 stars and rhombi outrun the player. */
  speedPerMinute: 0.05,
} as const;

/** Enemy HP factor of the run time alone: after `minutes` minutes. */
export function timeHp(minutes: number): number {
  return (1 + minutes * SCALING.hpPerMinute) * SCALING.hpGrowth ** minutes;
}

export const ENEMY = {
  /** Soft push between overlapping enemies (0..1 of the overlap per tick). */
  separation: 0.35,
  maxNeighbours: 6,
  /** Knockback velocity decay per tick. */
  knockbackDecay: 0.86,
  /** Enemies farther than view diagonal + this are moved ahead of the player. */
  relocateMargin: 420,
  spawnMargin: 70,
  flashTime: 0.06,
  bulletRadius: 6,
  bulletLife: 6,
} as const;

export const ELITE = {
  size: 2.5,
  /** HP multiple for elites outside the wave script (debug key); scripted ones set their own. */
  hp: 6,
  speed: 1.15,
  shells: 3,
  xp: 20,
  splitter: 10,
} as const;

export const BOSS = {
  /** HP of the depth-0 piece; children get a fraction of the parent's max HP. */
  childHpFactor: [1, 0.4, 0.375] as readonly number[],
  /** Circumradius of the triangle per depth; hits use the real shape. */
  radius: [150, 76, 40] as readonly number[],
  speed: [38, 62, 92] as readonly number[],
  /** Seconds between edge volleys per depth. */
  volleyInterval: [2.6, 2.2, 1.9] as readonly number[],
  bulletsPerEdge: [5, 3, 2] as readonly number[],
  bulletSpeed: 135,
  bulletDamage: 10,
  contactDamage: 20,
  spin: 0.45,
  spawnInterval: 8,
  spawnCount: 3,
  splitInvuln: 0.5,
  splitter: 100,
  xp: 400,
  /** Pieces this far beyond the relocation distance are pulled back in front of the player. */
  relocateFactor: 1.0,
  /** Seconds between the last piece falling and the victory screen. */
  victoryDelay: 3,
} as const;

export const GEMS = {
  tiers: [1, 5, 25] as readonly number[],
  mergeAt: 300,
  attractAccel: 2400,
  attractMaxSpeed: 900,
  pickupRadius: 14,
} as const;

/** Per-kill drop chances (scaled by luck). */
export const DROPS = {
  heal: 0.004,
  sum: 0.0012,
  bomb: 0.0009,
  slow: 0.0009,
  splitter: 0.01,
} as const;

export const PICKUPS = {
  heal: 30,
  bombDamage: 250,
  slowTime: 6,
  slowFactor: 0.5,
  radius: 22,
  splitterValue: 1,
} as const;

export const SPLITTER = {
  perMinute: 3,
  perHundredKills: 1,
} as const;

/**
 * Reißbrett prices: rank r (from 0) costs baseCost × (r + 1). Ranks past an entry's first
 * `ranks` value (those the Erweiterungen open) cost `rankGrowth` more for every such rank.
 */
export const META = {
  rankGrowth: 1.08,
} as const;

export const DRAFT = {
  weightUpgradeWeapon: 1,
  weightNewWeapon: 0.9,
  weightUpgradeAxiom: 0.8,
  weightNewAxiom: 0.7,
  /** Weight factor for Überstufe cards: core levels and new items come first. */
  overWeight: 0.6,
  fallbackHeal: 30,
  fallbackSplitter: 15,
  upgradeCubeRolls: 3,
  upgradeCubeSplitter: 15,
} as const;

/**
 * Komplexität K 0–20. The first Sierpinski kill opens K 1–`open`; beating him on K n opens
 * K n + 1. From K 6 on every level also adds a mutator (mutators.ts).
 */
export const COMPLEXITY = {
  max: 20,
  open: 5,
  /** Enemy HP × hpGrowth^K: close to the old +25 % per level up to K 5, far steeper above. */
  hpGrowth: 1.16,
  /** Sierpinski grows linearly instead, so the fight stays a fight and not a sponge. */
  bossHpPerLevel: 0.1,
  damagePerLevel: 0.03,
  ratePerLevel: 0.1,
  /** The spawn-rate bonus stops here (enemy count); higher levels add HP and mutators. */
  rateMaxLevel: 10,
  splitterPerLevel: 0.1,
} as const;

/** Enemy HP factor of complexity level `k`, before mutators. */
export function complexityHp(k: number): number {
  return COMPLEXITY.hpGrowth ** k;
}

/** Sierpinski's HP factor of complexity level `k`, before mutators. */
export function complexityBossHp(k: number): number {
  return 1 + k * COMPLEXITY.bossHpPerLevel;
}

/** Enemy damage factor of complexity level `k`, before mutators. */
export function complexityDamage(k: number): number {
  return 1 + k * COMPLEXITY.damagePerLevel;
}

/** Spawn-rate factor of complexity level `k`. */
export function complexityRate(k: number): number {
  return 1 + Math.min(k, COMPLEXITY.rateMaxLevel) * COMPLEXITY.ratePerLevel;
}

/** Splitter factor of complexity level `k`. */
export function complexitySplitter(k: number): number {
  return 1 + k * COMPLEXITY.splitterPerLevel;
}
