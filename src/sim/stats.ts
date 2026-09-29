import { OVER, PLAYER, STAT_CAPS } from '../content/tuning.ts';
import type {
  AxiomDef,
  CharacterDef,
  ParamOp,
  StatKey,
  StatMod,
  Stats,
  WeaponDef,
  WeaponLevel,
  WeaponParams,
} from '../content/types.ts';
import { WEAPONS } from '../content/weapons.ts';

export function baseStats(): Stats {
  return {
    might: 1,
    cooldown: 1,
    area: 1,
    amount: 0,
    projSpeed: 1,
    duration: 1,
    moveSpeed: 1,
    maxHp: 0,
    regen: 0,
    armor: 0,
    magnet: 1,
    crit: 0.05,
    critMult: 2,
    growth: 1,
    greed: 1,
    luck: 1,
    revival: 0,
    reroll: 0,
    banish: 0,
    skip: 0,
    draftSize: 3,
    cubeRolls: 0,
    startLevel: 0,
  };
}

export function applyMods(stats: Stats, mods: readonly StatMod[], times = 1): void {
  for (const m of mods) stats[m.stat] += m.value * times;
}

export interface AxiomLevel {
  def: AxiomDef;
  level: number;
}

const CAPPED = Object.keys(STAT_CAPS) as (keyof typeof STAT_CAPS)[];

function capOf(stat: StatKey): number | undefined {
  return (STAT_CAPS as Partial<Record<StatKey, number>>)[stat];
}

/**
 * Stats of the current build: character base + trait + meta ranks + axioms (core levels, then
 * Überstufen), clamped to `STAT_CAPS` and the cooldown floor.
 */
export function computeStats(
  char: CharacterDef,
  meta: readonly StatMod[],
  axioms: readonly (AxiomLevel | null)[],
): Stats {
  const s = baseStats();
  s.maxHp = char.maxHp;
  applyMods(s, char.mods);
  applyMods(s, meta);
  for (const a of axioms) {
    if (!a) continue;
    applyMods(s, a.def.perLevel, Math.min(a.level, a.def.maxLevel));
    if (a.def.over && a.level > a.def.maxLevel)
      applyMods(s, a.def.over.perLevel, a.level - a.def.maxLevel);
  }
  s.cooldown = Math.max(PLAYER.minCooldown, s.cooldown);
  for (const k of CAPPED) s[k] = Math.min(s[k], STAT_CAPS[k]);
  s.maxHp = Math.max(1, s.maxHp);
  return s;
}

/** True when `mod` would change nothing: its stat already sits at its cap (or cooldown floor). */
export function statCapped(s: Stats, mod: StatMod): boolean {
  if (mod.stat === 'cooldown') return mod.value < 0 && s.cooldown <= PLAYER.minCooldown;
  const cap = capOf(mod.stat);
  return cap !== undefined && mod.value > 0 && s[mod.stat] >= cap;
}

/** Last level of an axiom: `OVER.maxLevel` with Überstufen, else its core `maxLevel`. */
export function axiomMaxLevel(def: AxiomDef): number {
  return def.over ? OVER.maxLevel : def.maxLevel;
}

/**
 * An axiom is done when it sits at its last level or its next level would only push capped
 * stats; the draft and cubes stop offering it, the pause screen shows MAX.
 */
export function axiomDone(s: Stats, a: AxiomLevel): boolean {
  if (a.level >= axiomMaxLevel(a.def)) return true;
  const next = a.level < a.def.maxLevel ? a.def.perLevel : (a.def.over?.perLevel ?? []);
  return next.length > 0 && next.every((m) => statCapped(s, m));
}

export function applyOps(p: WeaponParams, ops: readonly ParamOp[]): void {
  for (const op of ops) {
    if (op.add !== undefined) p[op.key] += op.add;
    if (op.mul !== undefined) p[op.key] *= op.mul;
  }
}

/** A theorem's base weapon (whose levels and milestones it inherits), else the weapon itself. */
function rootOf(def: WeaponDef): WeaponDef {
  return def.theoremOf !== undefined ? WEAPONS[def.theoremOf] : def;
}

/** Last hand-written level (Lv 8); reaching it opens the Q.E.D. Theorems count their parent's. */
export function coreLevel(def: WeaponDef): number {
  return rootOf(def).levels.length + 1;
}

/** True when `level` lies past the core levels (an Überstufe). */
export function isOverLevel(def: WeaponDef, level: number): boolean {
  return level > coreLevel(def);
}

/** Milestones reached by `level`: one per multiple of `OVER.milestoneEvery` past the core. */
function milestones(def: WeaponDef, level: number): number {
  const every = OVER.milestoneEvery;
  return Math.max(0, Math.floor(level / every) - Math.floor(coreLevel(def) / every));
}

/** The milestone that reaching `level` adds (Lv 10, 15, …), or null. */
export function milestoneAt(def: WeaponDef, level: number): WeaponLevel | null {
  const cycle = rootOf(def).over ?? [];
  if (cycle.length === 0 || !isOverLevel(def, level) || level % OVER.milestoneEvery !== 0)
    return null;
  return cycle[(milestones(def, level) - 1) % cycle.length]!;
}

/** Params at the core levels; a theorem starts from its parent's core params plus its ops. */
function coreParams(def: WeaponDef, level: number): WeaponParams {
  if (def.theoremOf !== undefined) {
    const parent = WEAPONS[def.theoremOf];
    const p = coreParams(parent, coreLevel(parent));
    applyOps(p, def.theoremOps ?? []);
    return p;
  }
  const p = { ...def.base };
  const upTo = Math.min(level - 1, def.levels.length);
  for (let i = 0; i < upTo; i++) applyOps(p, def.levels[i]!.ops);
  return p;
}

/**
 * Raw params at a level, before player stats. Past the core every level adds
 * `OVER.damagePerLevel` of the core damage and every milestone its ops, within the `OVER` limits.
 * A theorem keeps the level of the weapon it was proven from.
 */
export function weaponParamsAt(def: WeaponDef, level: number): WeaponParams {
  const p = coreParams(def, level);
  const over = level - coreLevel(def);
  if (over <= 0) return p;
  const { amount, cooldown, slow } = p;
  p.damage *= 1 + OVER.damagePerLevel * over;
  const cycle = rootOf(def).over ?? [];
  const n = cycle.length > 0 ? milestones(def, level) : 0;
  for (let i = 0; i < n; i++) applyOps(p, cycle[i % cycle.length]!.ops);
  p.amount = Math.min(p.amount, amount + OVER.maxExtraAmount);
  p.cooldown = Math.max(p.cooldown, cooldown * OVER.minCooldownFactor);
  p.slow = Math.min(p.slow, Math.max(slow, OVER.maxSlow));
  return p;
}

/** Final params with the player's stats folded in. */
export function effectiveParams(def: WeaponDef, level: number, s: Stats): WeaponParams {
  const p = weaponParamsAt(def, level);
  p.damage *= s.might;
  p.cooldown *= s.cooldown;
  p.area *= s.area;
  p.speed *= s.projSpeed;
  p.duration *= s.duration;
  switch (def.kind) {
    case 'orbit':
      p.radius *= s.area;
      p.amount += s.amount;
      break;
    case 'aura':
      p.radius *= s.area;
      break;
    case 'beam':
      p.length *= s.area;
      p.width *= s.area;
      p.amount += s.amount;
      break;
    case 'wave':
      p.amplitude *= s.area;
      p.amount += s.amount;
      break;
    case 'bolt':
    case 'fractal':
      p.amount += s.amount;
      break;
  }
  return p;
}
