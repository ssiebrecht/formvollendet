import type { MutatorDef, MutatorEffects, MutatorKey } from './types.ts';

/** One mutator per complexity level from K 6 on; they stack, so K 20 carries all fifteen. */
export const MUTATORS: readonly MutatorDef[] = [
  {
    id: 'geschosse',
    level: 6,
    name: 'Beschleunigte Geschosse',
    desc: 'Gegnergeschosse +25 % Tempo',
    effect: { bulletSpeed: 1.25 },
  },
  {
    id: 'doppelteElite',
    level: 7,
    name: 'Doppelte Elite',
    desc: 'Doppelt so viele Elite-Gegner',
    effect: { eliteCount: 2 },
  },
  {
    id: 'formationen',
    level: 8,
    name: 'Dichte Formationen',
    desc: 'Ringe und Linien +50 % Gegner',
    effect: { formationSize: 1.5 },
  },
  { id: 'hast', level: 9, name: 'Hast', desc: 'Gegner +10 % Tempo', effect: { enemySpeed: 1.1 } },
  {
    id: 'schwereElite',
    level: 10,
    name: 'Schwere Elite',
    desc: 'Elite-Gegner +50 % HP',
    effect: { eliteHp: 1.5 },
  },
  {
    id: 'knappheit',
    level: 11,
    name: 'Knappheit',
    desc: 'Halb so viele Heil-Drops',
    effect: { healDrops: 0.5 },
  },
  {
    id: 'gedraenge',
    level: 12,
    name: 'Gedränge',
    desc: 'Gegnerlimit +25 %',
    effect: { enemyCap: 1.25 },
  },
  {
    id: 'wucht',
    level: 13,
    name: 'Wucht',
    desc: 'Gegnerschaden +25 %',
    effect: { enemyDamage: 1.25 },
  },
  {
    id: 'grossesDreieck',
    level: 14,
    name: 'Großes Dreieck',
    desc: 'Sierpinski +50 % HP',
    effect: { bossHp: 1.5 },
  },
  { id: 'entropie', level: 15, name: 'Entropie', desc: 'Kristalle −15 % XP', effect: { xp: 0.85 } },
  {
    id: 'geschosse2',
    level: 16,
    name: 'Beschleunigte Geschosse II',
    desc: 'Gegnergeschosse weitere +20 % Tempo',
    effect: { bulletSpeed: 1.2 },
  },
  {
    id: 'hast2',
    level: 17,
    name: 'Hast II',
    desc: 'Gegner weitere +10 % Tempo',
    effect: { enemySpeed: 1.1 },
  },
  {
    id: 'wucht2',
    level: 18,
    name: 'Wucht II',
    desc: 'Gegnerschaden weitere +25 %',
    effect: { enemyDamage: 1.25 },
  },
  {
    id: 'dreifacheElite',
    level: 19,
    name: 'Dreifache Elite',
    desc: 'Dreimal so viele Elite-Gegner',
    effect: { eliteCount: 1.5 },
  },
  {
    id: 'vollendung',
    level: 20,
    name: 'Vollendung',
    desc: 'Gegner +50 % HP',
    effect: { enemyHp: 1.5 },
  },
];

const KEYS: readonly MutatorKey[] = [
  'bulletSpeed',
  'eliteCount',
  'formationSize',
  'enemySpeed',
  'eliteHp',
  'healDrops',
  'enemyCap',
  'enemyDamage',
  'bossHp',
  'xp',
  'enemyHp',
];

/** Mutators active on a complexity level, oldest first. */
export function mutatorsAt(complexity: number): MutatorDef[] {
  return MUTATORS.filter((m) => m.level <= complexity);
}

/** Product of every active mutator's effects. */
export function mutatorEffects(complexity: number): MutatorEffects {
  const out = {} as MutatorEffects;
  for (const k of KEYS) out[k] = 1;
  for (const m of mutatorsAt(complexity)) {
    for (const k of KEYS) out[k] *= m.effect[k] ?? 1;
  }
  return out;
}
