/** Every visual in the game is one of these shapes; render bakes them, UI draws them as SVG. */
export type ShapeId =
  | 'circle'
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star5'
  | 'dart'
  | 'orb'
  | 'wavedot'
  | 'fractal'
  | 'shard'
  | 'ring'
  | 'bullet'
  | 'gem'
  | 'splitter'
  | 'cube'
  | 'plus'
  | 'sigma'
  | 'times'
  | 'divide'
  | 'edge'
  | 'spark'
  // Weapon and axiom symbols (UI, player glyphs).
  | 'sine'
  | 'squarewave'
  | 'caret'
  | 'clock'
  | 'nested'
  | 'mirror'
  | 'sphere'
  | 'integral'
  | 'chevrons'
  | 'inward'
  // Reißbrett symbols (menus only).
  | 'tangent'
  | 'extremum'
  | 'infinity'
  | 'dice'
  | 'stairs';

export type WeaponId =
  | 'spitze'
  | 'kreisbahn'
  | 'welle'
  | 'zirkel'
  | 'strahl'
  | 'fraktal'
  | 'sternpolygon'
  | 'epizykel'
  | 'fourier'
  | 'sphaere'
  | 'prisma'
  | 'mandelbrot';

export type AxiomId =
  | 'potenz'
  | 'frequenz'
  | 'skalierung'
  | 'symmetrie'
  | 'volumen'
  | 'integral'
  | 'beschleunigung'
  | 'gravitation';

export type EnemyId =
  'punkt' | 'keil' | 'block' | 'rhombus' | 'werfer' | 'wabe' | 'stern' | 'sierpinski';
export type CharacterId = 'delta' | 'nova';
export type AbilityId = 'vektor' | 'supernova';

// ---------------------------------------------------------------------------------------------
// Stats

/** All player stats are additive: multipliers start at 1 (+0.1 = +10 %), counts start at 0. */
export type StatKey =
  | 'might'
  | 'cooldown'
  | 'area'
  | 'amount'
  | 'projSpeed'
  | 'duration'
  | 'moveSpeed'
  | 'maxHp'
  | 'regen'
  | 'armor'
  | 'magnet'
  | 'crit'
  | 'critMult'
  | 'growth'
  | 'greed'
  | 'luck'
  | 'revival'
  | 'reroll'
  | 'banish'
  | 'skip'
  | 'draftSize'
  /** Extra upgrades per upgrade cube. */
  | 'cubeRolls'
  /** Extra levels of the start weapon (up to its core level). */
  | 'startLevel';

export type Stats = Record<StatKey, number>;

export interface StatMod {
  stat: StatKey;
  value: number;
}

// ---------------------------------------------------------------------------------------------
// Weapons

export type WeaponKind = 'bolt' | 'orbit' | 'wave' | 'aura' | 'beam' | 'fractal';

/**
 * Flat numeric parameter record shared by every weapon kind, so level-ups and theorems are
 * generic add/mul operations. Unused fields stay 0. Times are seconds, distances pixels.
 */
export interface WeaponParams {
  damage: number;
  /** Seconds between activations. */
  cooldown: number;
  /** Projectiles per volley, orbs, beams or waves. */
  amount: number;
  /** Projectile speed in px/s. */
  speed: number;
  /** Enemies a projectile may hit before it is spent. */
  pierce: number;
  /** Size multiplier for projectiles, orbs and auras. */
  area: number;
  /** Projectile lifetime or beam on-time in seconds. */
  duration: number;
  /** Minimum seconds between two hits of this weapon on the same enemy (persistent damage). */
  hitInterval: number;
  knockback: number;
  /** Orbit radius or aura radius. */
  radius: number;
  /** Orbit angular speed in rad/s. */
  orbitSpeed: number;
  amplitude: number;
  wavelength: number;
  length: number;
  width: number;
  /** Fractal recursion depth. */
  depth: number;
  /** Damage and size factor passed to fractal children. */
  childFactor: number;
  /** 0..1 movement slow applied on hit. */
  slow: number;
  // Theorem switches (0 = off).
  allVertices: number;
  moons: number;
  harmonics: number;
  /** Seconds between aura shock pulses. */
  pulse: number;
  /** Spectral split beams. */
  prism: number;
  homing: number;
  alwaysOn: number;
  /** Extra ±30° copies per wave. */
  fan: number;
  /** HP healed per kill inside the aura. */
  heal: number;
}

export type ParamKey = keyof WeaponParams;

export interface ParamOp {
  key: ParamKey;
  add?: number;
  mul?: number;
}

export interface WeaponLevel {
  ops: readonly ParamOp[];
  text: string;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  kind: WeaponKind;
  color: number;
  icon: ShapeId;
  base: WeaponParams;
  /** levels[0] upgrades to level 2. Theorems have none. */
  levels: readonly WeaponLevel[];
  /**
   * Überstufe milestones past the core levels, taken in turn every `OVER.milestoneEvery` levels.
   * Theorems have none; they use their parent's.
   */
  over?: readonly WeaponLevel[];
  evolvesWith?: AxiomId;
  evolvesInto?: WeaponId;
  /** Set on theorem weapons: they start from the parent's max-level params plus `theoremOps`. */
  theoremOf?: WeaponId;
  theoremOps?: readonly ParamOp[];
  locked: boolean;
}

// ---------------------------------------------------------------------------------------------
// Axioms, characters, abilities

export interface AxiomDef {
  id: AxiomId;
  name: string;
  desc: string;
  color: number;
  /** Symbol on its edge, so axioms read without colour vision too. */
  icon: ShapeId;
  /** Last core level: `perLevel` applies up to here. */
  maxLevel: number;
  perLevel: readonly StatMod[];
  /** Überstufen past `maxLevel` with smaller steps, up to `OVER.maxLevel`; null ends at `maxLevel`. */
  over: { perLevel: readonly StatMod[]; text: string } | null;
  locked: boolean;
}

export type PolygonStyle = 'regular' | 'star';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  desc: string;
  traitText: string;
  color: number;
  style: PolygonStyle;
  maxHp: number;
  /** Base movement speed in px/s. */
  moveSpeed: number;
  /** Base pickup radius in px. */
  magnet: number;
  mods: readonly StatMod[];
  /** Nova: critical hits spray small shards. */
  critShards: boolean;
  startWeapon: WeaponId;
  ability: AbilityId;
  locked: boolean;
}

export interface VektorDef {
  id: 'vektor';
  name: string;
  desc: string;
  cooldown: number;
  distance: number;
  dashTime: number;
  iframes: number;
  damage: number;
  lineLife: number;
}

export interface SupernovaDef {
  id: 'supernova';
  name: string;
  desc: string;
  cooldown: number;
  shards: number;
  damage: number;
  speed: number;
  pierce: number;
  knockRadius: number;
  knockPower: number;
  iframes: number;
}

export type AbilityDef = VektorDef | SupernovaDef;

// ---------------------------------------------------------------------------------------------
// Enemies & waves

export type AiParams =
  | { kind: 'chase' }
  | {
      kind: 'dash';
      range: number;
      windup: number;
      dashTime: number;
      dashMult: number;
      recover: number;
    }
  | {
      kind: 'orbitDive';
      orbitRadius: number;
      interval: number;
      windup: number;
      diveTime: number;
      diveMult: number;
    }
  | {
      kind: 'kite';
      min: number;
      max: number;
      interval: number;
      windup: number;
      bullets: number;
      bulletSpeed: number;
      bulletDamage: number;
    }
  | { kind: 'spawner'; interval: number; count: number; spawn: EnemyId }
  | { kind: 'kamikaze'; trigger: number; fuse: number; radius: number; damage: number }
  | { kind: 'march' }
  | { kind: 'boss' };

export type AiKind = AiParams['kind'];

export interface EnemyDef {
  id: EnemyId;
  name: string;
  desc: string;
  shape: ShapeId;
  color: number;
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  /** Nested contours; each one shatters when its share of HP is gone. */
  shells: number;
  /** 0..1 fraction of knockback ignored. */
  knockbackResist: number;
  ai: AiParams;
}

export interface WaveSegment {
  from: number;
  to: number;
  /** Spawns per second, linearly interpolated from start to end of the segment. */
  rate: readonly [number, number];
  maxAlive: number;
  pool: readonly { enemy: EnemyId; weight: number }[];
}

export type CubeKind = 'vertex' | 'upgrade';

export type ScriptEvent =
  /** `hp`: multiple of a regular enemy's HP of the same kind at that time. */
  | { at: number; kind: 'elite'; enemy: EnemyId; drop: CubeKind; count: number; hp: number }
  | { at: number; kind: 'ring'; enemy: EnemyId; count: number; radius: number }
  | { at: number; kind: 'line'; enemy: EnemyId; count: number; spacing: number }
  | { at: number; kind: 'boss'; enemy: EnemyId };

export type PickupKind =
  'heal' | 'sum' | 'bomb' | 'slow' | 'splitter' | 'vertexCube' | 'upgradeCube';

/** Run-wide multipliers a mutator can change; all start at 1 and multiply up. */
export type MutatorKey =
  | 'bulletSpeed'
  | 'eliteCount'
  | 'formationSize'
  | 'enemySpeed'
  | 'eliteHp'
  | 'healDrops'
  | 'enemyCap'
  | 'enemyDamage'
  | 'bossHp'
  | 'xp'
  | 'enemyHp';

export type MutatorEffects = Record<MutatorKey, number>;

/** A handicap that comes with a complexity level and stays for every level above. */
export interface MutatorDef {
  id: string;
  /** Complexity level that introduces it. */
  level: number;
  name: string;
  desc: string;
  effect: Partial<MutatorEffects>;
}

// ---------------------------------------------------------------------------------------------
// Meta

export type MetaId =
  | 'potenz'
  | 'dichte'
  | 'volumen'
  | 'integral'
  | 'frequenz'
  | 'skalierung'
  | 'impuls'
  | 'beschleunigung'
  | 'gravitation'
  | 'wahrscheinlichkeit'
  | 'exponent'
  | 'gier'
  | 'neuzeichnen'
  | 'radieren'
  | 'ueberspringen'
  | 'zweiterversuch'
  | 'viertekarte'
  | 'tangente'
  | 'extremum'
  | 'kontinuitaet'
  | 'kombinatorik'
  | 'induktion'
  | 'vielfaches';

/** Reißbrett-Erweiterungen proven so far; each one opens the next `ranks` value of every entry. */
export type MetaTier = 0 | 1 | 2 | 3;

export interface MetaUpgradeDef {
  id: MetaId;
  name: string;
  desc: string;
  stat: StatKey;
  perRank: number;
  /** Max rank per tier: without Erweiterung, then with Erweiterung I, II and III. */
  ranks: readonly [number, number, number, number];
  baseCost: number;
  icon: ShapeId;
  /** Opened by a Beweis (`meta:<id>`); unlocked entries are there from the start. */
  locked: boolean;
}

export type UnlockId =
  | `weapon:${WeaponId}`
  | `axiom:${AxiomId}`
  | `char:${CharacterId}`
  | `meta:${MetaId}`
  | `tier:${Exclude<MetaTier, 0>}`
  | 'mode:endless';

export type ProofCondition =
  | { kind: 'surviveSeconds'; value: number }
  | { kind: 'reachVertices'; value: number }
  | { kind: 'theorems'; value: number }
  | { kind: 'killsInRun'; value: number }
  | { kind: 'bossKilled' }
  /** Sierpinski defeated this often in one (endless) run. */
  | { kind: 'bossKillsInRun'; value: number }
  /** Sierpinski defeated on this complexity level or a higher one. */
  | { kind: 'complexityCleared'; value: number }
  | { kind: 'reachLevel'; value: number }
  /** A weapon or theorem at this level. */
  | { kind: 'weaponLevel'; value: number };

export interface ProofDef {
  id: string;
  name: string;
  desc: string;
  condition: ProofCondition;
  unlocks: readonly UnlockId[];
}
