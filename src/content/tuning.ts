/** Every tuning number lives here or in the content tables — never inline in systems. */

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** Converts seconds to whole simulation ticks (at least 1 for positive durations). */
export function ticks(seconds: number): number {
  return seconds <= 0 ? 0 : Math.max(1, Math.round(seconds * TICK_RATE));
}

export const RUN = {
  /** Boss arrives at 15:00. */
  length: 900,
  /** Normal spawns while the boss lives, as a fraction of the last segment's rate. */
  bossSpawnFactor: 0.3,
  /** Endless mode: spawn-rate growth per minute past the run length. */
  endlessRatePerMinute: 0.08,
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

export const WEAPON_MAX_LEVEL = 8;

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
  hpGrowth: 1.12,
  damagePerMinute: 0.04,
  /** Enemies speed up by this share per minute: by 15:00 stars and rhombi outrun the player. */
  speedPerMinute: 0.05,
} as const;

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
  relocateFactor: 1.5,
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

export const DRAFT = {
  weightUpgradeWeapon: 1,
  weightNewWeapon: 0.9,
  weightUpgradeAxiom: 0.8,
  weightNewAxiom: 0.7,
  fallbackHeal: 30,
  fallbackSplitter: 15,
  upgradeCubeRolls: 3,
  upgradeCubeSplitter: 15,
} as const;

export const COMPLEXITY = {
  max: 5,
  hpPerLevel: 0.25,
  ratePerLevel: 0.1,
  splitterPerLevel: 0.2,
} as const;
