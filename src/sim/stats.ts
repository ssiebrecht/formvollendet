import { PLAYER } from '../content/tuning.ts';
import type {
  AxiomDef,
  CharacterDef,
  ParamOp,
  StatMod,
  Stats,
  WeaponDef,
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
  };
}

export function applyMods(stats: Stats, mods: readonly StatMod[], times = 1): void {
  for (const m of mods) stats[m.stat] += m.value * times;
}

export interface AxiomLevel {
  def: AxiomDef;
  level: number;
}

/** Stats of the current build: character base + trait + meta ranks + axioms. */
export function computeStats(
  char: CharacterDef,
  meta: readonly StatMod[],
  axioms: readonly (AxiomLevel | null)[],
): Stats {
  const s = baseStats();
  s.maxHp = char.maxHp;
  applyMods(s, char.mods);
  applyMods(s, meta);
  for (const a of axioms) if (a) applyMods(s, a.def.perLevel, a.level);
  s.cooldown = Math.max(PLAYER.minCooldown, s.cooldown);
  s.maxHp = Math.max(1, s.maxHp);
  return s;
}

export function applyOps(p: WeaponParams, ops: readonly ParamOp[]): void {
  for (const op of ops) {
    if (op.add !== undefined) p[op.key] += op.add;
    if (op.mul !== undefined) p[op.key] *= op.mul;
  }
}

export function maxLevel(def: WeaponDef): number {
  return def.levels.length + 1;
}

/** Raw params at a level, before player stats. Theorems start from the parent's maxed params. */
export function weaponParamsAt(def: WeaponDef, level: number): WeaponParams {
  if (def.theoremOf !== undefined) {
    const parent = WEAPONS[def.theoremOf];
    const p = weaponParamsAt(parent, maxLevel(parent));
    applyOps(p, def.theoremOps ?? []);
    return p;
  }
  const p = { ...def.base };
  const upTo = Math.min(level - 1, def.levels.length);
  for (let i = 0; i < upTo; i++) applyOps(p, def.levels[i]!.ops);
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
