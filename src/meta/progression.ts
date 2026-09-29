import { AXIOM_LIST } from '../content/axioms.ts';
import { CHARACTERS } from '../content/characters.ts';
import { META_UPGRADES, PROOFS } from '../content/meta.ts';
import { COMPLEXITY, META } from '../content/tuning.ts';
import type { CharacterId, MetaTier, MetaUpgradeDef, StatMod, UnlockId } from '../content/types.ts';
import { BASE_WEAPONS } from '../content/weapons.ts';
import type { RunConfig } from '../sim/world.ts';
import type { SaveData } from './save.ts';

// ------------------------------------------------------------------------------ Reißbrett

/**
 * Price of the next rank: baseCost × (rank + 1), and `META.rankGrowth` more for every rank past
 * the entry's first `ranks` value (the ones the Erweiterungen open).
 */
export function upgradeCost(def: MetaUpgradeDef, rank: number): number {
  const price = def.baseCost * (rank + 1);
  const beyond = rank + 1 - def.ranks[0];
  return beyond > 0 ? Math.round(price * Math.pow(META.rankGrowth, beyond)) : price;
}

/** Splitter spent to reach `rank` (sum of all previous prices). */
export function spentOn(def: MetaUpgradeDef, rank: number): number {
  let sum = 0;
  for (let r = 0; r < rank; r++) sum += upgradeCost(def, r);
  return sum;
}

export function rankOf(save: SaveData, def: MetaUpgradeDef): number {
  return save.ranks[def.id] ?? 0;
}

const TIERS = [1, 2, 3] as const;

/**
 * Reißbrett-Erweiterungen proven (0–3). Each one counts, in whatever order the Beweise fall,
 * and lifts every entry to its next `ranks` value.
 */
export function metaTier(save: SaveData): MetaTier {
  const u = unlocks(save);
  return TIERS.filter((t) => u.has(`tier:${t}`)).length as MetaTier;
}

/** Entries marked `locked` wait for their Beweis. */
export function entryUnlocked(save: SaveData, def: MetaUpgradeDef): boolean {
  return !def.locked || unlocks(save).has(`meta:${def.id}`);
}

/** Highest rank the save may own: 0 while the entry is locked, else its rank for the tier. */
export function maxRankOf(save: SaveData, def: MetaUpgradeDef): number {
  return entryUnlocked(save, def) ? def.ranks[metaTier(save)] : 0;
}

export function canBuy(save: SaveData, def: MetaUpgradeDef): boolean {
  const rank = rankOf(save, def);
  return rank < maxRankOf(save, def) && save.splitter >= upgradeCost(def, rank);
}

export function buy(save: SaveData, def: MetaUpgradeDef): boolean {
  if (!canBuy(save, def)) return false;
  const rank = rankOf(save, def);
  save.splitter -= upgradeCost(def, rank);
  save.ranks[def.id] = rank + 1;
  return true;
}

export function totalSpent(save: SaveData): number {
  let total = 0;
  for (const def of META_UPGRADES) total += spentOn(def, rankOf(save, def));
  return total;
}

/** Sells every rank at full price ("jederzeit rückerstattbar"); returns the amount. */
export function refundAll(save: SaveData): number {
  const total = totalSpent(save);
  save.ranks = {};
  save.splitter += total;
  return total;
}

/** Reißbrett ranks as stat mods for the run. */
export function metaMods(save: SaveData): StatMod[] {
  const mods: StatMod[] = [];
  for (const def of META_UPGRADES) {
    const rank = rankOf(save, def);
    if (rank > 0) mods.push({ stat: def.stat, value: def.perRank * rank });
  }
  return mods;
}

// -------------------------------------------------------------------------------- unlocks

/** Everything the proven Beweise unlock. */
export function unlocks(save: SaveData): Set<UnlockId> {
  const out = new Set<UnlockId>();
  for (const p of PROOFS) {
    if (!save.proofs.includes(p.id)) continue;
    for (const u of p.unlocks) out.add(u);
  }
  return out;
}

export function isCharacterUnlocked(save: SaveData, id: CharacterId): boolean {
  return !CHARACTERS[id].locked || unlocks(save).has(`char:${id}`);
}

/** Endless mode and the complexity levels both come with defeating Sierpinski. */
export function endlessUnlocked(save: SaveData): boolean {
  return unlocks(save).has('mode:endless');
}

/**
 * Highest complexity level the save may pick: none before Sierpinski's first defeat, then
 * K 1–`COMPLEXITY.open`, and one level above the highest level he fell on.
 */
export function maxComplexity(save: SaveData): number {
  if (!endlessUnlocked(save)) return 0;
  return Math.min(COMPLEXITY.max, Math.max(COMPLEXITY.open, save.stats.bestComplexity + 1));
}

export interface RunChoice {
  seed: number;
  character: CharacterId;
  complexity: number;
  endless: boolean;
}

/** The run a save allows for a choice: locked picks fall back to what is available. */
export function runConfig(save: SaveData, choice: RunChoice): RunConfig {
  const u = unlocks(save);
  const open = endlessUnlocked(save);
  return {
    seed: choice.seed,
    character: isCharacterUnlocked(save, choice.character) ? choice.character : 'delta',
    metaMods: metaMods(save),
    unlockedWeapons: BASE_WEAPONS.filter((d) => d.locked && u.has(`weapon:${d.id}`)).map(
      (d) => d.id,
    ),
    unlockedAxioms: AXIOM_LIST.filter((d) => d.locked && u.has(`axiom:${d.id}`)).map((d) => d.id),
    complexity: Math.max(0, Math.min(maxComplexity(save), Math.floor(choice.complexity))),
    endless: open && choice.endless,
  };
}
