import { ABILITIES, CHARACTERS } from '../content/characters.ts';
import { mutatorEffects } from '../content/mutators.ts';
import { CAPS, PLAYER } from '../content/tuning.ts';
import type {
  AbilityDef,
  AxiomDef,
  AxiomId,
  CharacterDef,
  CharacterId,
  CubeKind,
  EnemyDef,
  MutatorEffects,
  PickupKind,
  ShapeId,
  StatMod,
  Stats,
  WeaponDef,
  WeaponId,
  WeaponParams,
} from '../content/types.ts';
import { WEAPONS } from '../content/weapons.ts';
import { ENEMIES } from '../content/enemies.ts';
import type { SimEvent } from './events.ts';
import { vertexAngle } from './math/geometry.ts';
import { Rng } from './math/rng.ts';
import { Pool, type Poolable } from './pool.ts';
import { SpatialHash } from './spatialHash.ts';
import { computeStats, coreLevel, effectiveParams } from './stats.ts';

/** lastHit slots: 0..5 weapon vertices, 6 = signature ability, 7 = misc (bomb, explosions). */
export const HIT_SLOTS = 8;
export const ABILITY_SLOT = 6;
export const MISC_SLOT = 7;
const MAX_BODIES = 64;
const MAX_BEAMS = 16;

export interface RunConfig {
  seed: number;
  character: CharacterId;
  /** Reißbrett ranks already converted to stat mods. */
  metaMods: readonly StatMod[];
  unlockedWeapons: readonly WeaponId[];
  unlockedAxioms: readonly AxiomId[];
  complexity: number;
  endless: boolean;
}

export interface WeaponSlot {
  def: WeaponDef;
  level: number;
  /** Effective params (player stats applied). */
  p: WeaponParams;
  /** Ticks until the next activation. */
  cd: number;
  /** Beam on-time ticks remaining. */
  active: number;
  /** Orbit angle. */
  phase: number;
  pulseCd: number;
  /** Orbit bodies as x,y pairs; `prevBodies` holds last tick for interpolation. */
  bodies: Float64Array;
  prevBodies: Float64Array;
  bodyCount: number;
  /** Radius of each body, parallel to `bodies`. */
  bodyRadius: Float64Array;
  /** Beam segments as x1,y1,x2,y2 quads. */
  beams: Float64Array;
  beamCount: number;
}

export interface AxiomSlot {
  def: AxiomDef;
  level: number;
}

export interface Player {
  char: CharacterDef;
  ability: AbilityDef;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Facing unit vector (last movement direction). */
  fx: number;
  fy: number;
  rot: number;
  prot: number;
  hp: number;
  vertices: number;
  /** Fixed length 6; only [0, vertices) are usable. */
  weapons: (WeaponSlot | null)[];
  axioms: (AxiomSlot | null)[];
  iframes: number;
  abilityCd: number;
  abilityCdMax: number;
  /** Ticks an early ability press stays queued. */
  abilityBuffer: number;
  dashTicks: number;
  dashVx: number;
  dashVy: number;
  level: number;
  xp: number;
  pendingLevels: number;
  revivals: number;
  /** Heal budget from aura kills this tick (caps lifesteal bursts). */
  healBudget: number;
}

export interface Enemy extends Poolable {
  def: EnemyDef;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Movement velocity of this tick (for facing and interpolation). */
  vx: number;
  vy: number;
  /** Knockback velocity, decays every tick. */
  kx: number;
  ky: number;
  r: number;
  hp: number;
  maxHp: number;
  shells: number;
  shellsMax: number;
  speed: number;
  damage: number;
  xp: number;
  elite: boolean;
  drop: CubeKind | null;
  /** -1 for regular enemies, otherwise the Sierpinski depth. */
  boss: number;
  march: boolean;
  state: number;
  timer: number;
  timer2: number;
  tx: number;
  ty: number;
  flash: number;
  slowTicks: number;
  slowFactor: number;
  invuln: number;
  rot: number;
  rotSpeed: number;
  lastHit: Int32Array;
}

export type ProjectileKind = 'bolt' | 'wave' | 'fractal' | 'shard';

export interface Projectile extends Poolable {
  kind: ProjectileKind;
  source: WeaponId | 'vektor' | 'supernova' | 'nova';
  slot: number;
  shape: ShapeId;
  color: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  pierce: number;
  life: number;
  knockback: number;
  rot: number;
  // wave path
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  t: number;
  speed: number;
  amp: number;
  wavelength: number;
  harmonics: number;
  // fractal
  depth: number;
  childFactor: number;
  homing: boolean;
  target: Enemy | null;
  targetId: number;
  /** Nova crit shards must not spray again. */
  noCritSpray: boolean;
  hits: Int32Array;
  hitCount: number;
}

export interface Bullet extends Poolable {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
}

export interface Gem extends Poolable {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  value: number;
  tier: number;
  attracted: boolean;
}

export interface Pickup extends Poolable {
  kind: PickupKind;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  value: number;
  attracted: boolean;
  age: number;
}

export interface Hazard extends Poolable {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  damage: number;
  halfWidth: number;
  hits: Int32Array;
  hitCount: number;
}

export interface RunStats {
  kills: number;
  damageBySource: Map<string, number>;
  maxVertices: number;
  theorems: WeaponId[];
  splitter: number;
  damageTaken: number;
  /** Damage taken per attacker (enemy id, or 'bullet'). */
  hurtBy: Map<string, number>;
  /** Attacker of the fatal hit; empty while alive. */
  killedBy: string;
  bossKilled: boolean;
  /** Boss fights won this run (endless mode brings it back). */
  bossKills: number;
  elitesKilled: number;
  /** Highest level any weapon or theorem reached. */
  maxWeaponLevel: number;
  weaponsSeen: Set<WeaponId>;
  axiomsSeen: Set<AxiomId>;
  enemiesSeen: Set<string>;
}

export interface Director {
  acc: number;
  scriptIndex: number;
  /** Endless mode: events of `ENDLESS_SCRIPT` run so far, over all laps. */
  endlessIndex: number;
  /** Bosses spawned (or skipped by a debug jump) this run; each return is tougher. */
  bossSpawns: number;
  /** A boss has appeared; stays set after the fight. */
  bossSpawned: boolean;
  /** The current boss fight is over; cleared again when the boss returns. */
  bossDefeated: boolean;
  bossMaxHp: number;
  /** This tick's population cap; spawners respect it too, so hives cannot flood the field. */
  cap: number;
}

export interface World {
  cfg: RunConfig;
  rng: Rng;
  tick: number;
  /** Elapsed run time in seconds. */
  time: number;
  stats: Stats;
  player: Player;
  enemies: Pool<Enemy>;
  projectiles: Pool<Projectile>;
  bullets: Pool<Bullet>;
  gems: Pool<Gem>;
  pickups: Pool<Pickup>;
  hazards: Pool<Hazard>;
  hash: SpatialHash;
  /** Alive boss pieces; kept out of the hash because of their size. */
  bosses: Enemy[];
  events: SimEvent[];
  /** Half extents of the visible area in world units (spawns happen just outside). */
  view: { halfW: number; halfH: number };
  director: Director;
  /** Product of the mutators that come with the run's complexity level. */
  mut: MutatorEffects;
  /** Ticks of the global "÷" slow. */
  enemySlowTicks: number;
  run: RunStats;
  banished: Set<string>;
  unlockedWeapons: Set<WeaponId>;
  unlockedAxioms: Set<AxiomId>;
  rerolls: number;
  banishes: number;
  skips: number;
  pendingCubes: CubeKind[];
  morphTicks: number;
  god: boolean;
}

function newEnemy(): Enemy {
  return {
    alive: false,
    id: 0,
    def: ENEMIES.punkt,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    r: 0,
    hp: 0,
    maxHp: 0,
    shells: 0,
    shellsMax: 0,
    speed: 0,
    damage: 0,
    xp: 0,
    elite: false,
    drop: null,
    boss: -1,
    march: false,
    state: 0,
    timer: 0,
    timer2: 0,
    tx: 0,
    ty: 0,
    flash: 0,
    slowTicks: 0,
    slowFactor: 1,
    invuln: 0,
    rot: 0,
    rotSpeed: 0,
    lastHit: new Int32Array(HIT_SLOTS),
  };
}

function newProjectile(): Projectile {
  return {
    alive: false,
    id: 0,
    kind: 'bolt',
    source: 'spitze',
    slot: 0,
    shape: 'dart',
    color: 0xffffff,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    r: 0,
    damage: 0,
    pierce: 0,
    life: 0,
    knockback: 0,
    rot: 0,
    ox: 0,
    oy: 0,
    dx: 0,
    dy: 0,
    t: 0,
    speed: 0,
    amp: 0,
    wavelength: 1,
    harmonics: 0,
    depth: 0,
    childFactor: 0,
    homing: false,
    target: null,
    targetId: 0,
    noCritSpray: false,
    hits: new Int32Array(16),
    hitCount: 0,
  };
}

function newBullet(): Bullet {
  return { alive: false, id: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 0, damage: 0, life: 0 };
}

function newGem(): Gem {
  return {
    alive: false,
    id: 0,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    value: 0,
    tier: 0,
    attracted: false,
  };
}

function newPickup(): Pickup {
  return {
    alive: false,
    id: 0,
    kind: 'heal',
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    value: 0,
    attracted: false,
    age: 0,
  };
}

function newHazard(): Hazard {
  return {
    alive: false,
    id: 0,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    life: 0,
    maxLife: 0,
    damage: 0,
    halfWidth: 0,
    hits: new Int32Array(96),
    hitCount: 0,
  };
}

export function createWeaponSlot(def: WeaponDef, level: number, stats: Stats): WeaponSlot {
  return {
    def,
    level,
    p: effectiveParams(def, level, stats),
    cd: 0,
    active: 0,
    phase: 0,
    pulseCd: 0,
    bodies: new Float64Array(MAX_BODIES * 2),
    prevBodies: new Float64Array(MAX_BODIES * 2),
    bodyCount: 0,
    bodyRadius: new Float64Array(MAX_BODIES),
    beams: new Float64Array(MAX_BEAMS * 4),
    beamCount: 0,
  };
}

export const MAX_ORBIT_BODIES = MAX_BODIES;
export const MAX_BEAM_SEGMENTS = MAX_BEAMS;

export function playerRadius(vertices: number): number {
  return PLAYER.baseRadius + PLAYER.radiusPerVertex * (vertices - PLAYER.startVertices);
}

/** World position of a player vertex (weapon mount). */
export function vertexX(p: Player, i: number): number {
  return p.x + Math.cos(vertexAngle(i, p.vertices, p.rot)) * playerRadius(p.vertices);
}

export function vertexY(p: Player, i: number): number {
  return p.y + Math.sin(vertexAngle(i, p.vertices, p.rot)) * playerRadius(p.vertices);
}

export function createWorld(cfg: RunConfig): World {
  const char = CHARACTERS[cfg.character];
  const stats = computeStats(char, cfg.metaMods, []);
  const player: Player = {
    char,
    ability: ABILITIES[char.ability],
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    fx: 1,
    fy: 0,
    rot: 0,
    prot: 0,
    hp: stats.maxHp,
    vertices: PLAYER.startVertices,
    weapons: [null, null, null, null, null, null],
    axioms: [null, null, null, null, null, null],
    iframes: 0,
    abilityCd: 0,
    abilityCdMax: 1,
    abilityBuffer: 0,
    dashTicks: 0,
    dashVx: 0,
    dashVy: 0,
    level: 1,
    xp: 0,
    pendingLevels: 0,
    revivals: stats.revival,
    healBudget: 0,
  };
  const w: World = {
    cfg,
    rng: new Rng(cfg.seed),
    tick: 0,
    time: 0,
    stats,
    player,
    enemies: new Pool(CAPS.enemies, newEnemy),
    projectiles: new Pool(CAPS.projectiles, newProjectile),
    bullets: new Pool(CAPS.bullets, newBullet),
    gems: new Pool(CAPS.gems, newGem),
    pickups: new Pool(CAPS.pickups, newPickup),
    hazards: new Pool(CAPS.hazards, newHazard),
    hash: new SpatialHash(64, CAPS.enemies),
    bosses: [],
    events: [],
    view: { halfW: 640, halfH: 360 },
    director: {
      acc: 0,
      scriptIndex: 0,
      endlessIndex: 0,
      bossSpawns: 0,
      bossSpawned: false,
      bossDefeated: false,
      bossMaxHp: 0,
      cap: 0,
    },
    mut: mutatorEffects(cfg.complexity),
    enemySlowTicks: 0,
    run: {
      kills: 0,
      damageBySource: new Map(),
      maxVertices: PLAYER.startVertices,
      theorems: [],
      splitter: 0,
      damageTaken: 0,
      hurtBy: new Map(),
      killedBy: '',
      bossKilled: false,
      bossKills: 0,
      elitesKilled: 0,
      maxWeaponLevel: 1,
      weaponsSeen: new Set(),
      axiomsSeen: new Set(),
      enemiesSeen: new Set(),
    },
    banished: new Set(),
    unlockedWeapons: new Set(cfg.unlockedWeapons),
    unlockedAxioms: new Set(cfg.unlockedAxioms),
    rerolls: stats.reroll,
    banishes: stats.banish,
    skips: stats.skip,
    pendingCubes: [],
    morphTicks: 0,
    god: false,
  };
  // Induktion (Reißbrett) starts the weapon a few levels up, never past its core.
  const start = WEAPONS[char.startWeapon];
  const level = Math.min(coreLevel(start), 1 + stats.startLevel);
  player.weapons[0] = createWeaponSlot(start, level, stats);
  w.run.maxWeaponLevel = level;
  w.run.weaponsSeen.add(start.id);
  return w;
}

/** Re-derives stats and every weapon's effective params after a build change. */
export function recomputeStats(w: World): void {
  const p = w.player;
  const before = w.stats.maxHp;
  w.stats = computeStats(p.char, w.cfg.metaMods, p.axioms);
  for (const slot of p.weapons) if (slot) slot.p = effectiveParams(slot.def, slot.level, w.stats);
  // Max-HP gains heal by the same amount, losses only clamp.
  const gained = w.stats.maxHp - before;
  if (gained > 0) p.hp += gained;
  p.hp = Math.min(p.hp, w.stats.maxHp);
}
