import { AXIOM_LIST } from '../content/axioms.ts';
import { CHARACTERS } from '../content/characters.ts';
import { META_UPGRADES, PROOFS } from '../content/meta.ts';
import { COMPLEXITY } from '../content/tuning.ts';
import type { CharacterId, MetaUpgradeDef, StatMod, UnlockId } from '../content/types.ts';
import { BASE_WEAPONS } from '../content/weapons.ts';
import type { RunConfig } from '../sim/world.ts';
import type { SaveData } from './save.ts';

// ------------------------------------------------------------------------------ Reißbrett

/** Price of the next rank: baseCost × (rank + 1). */
export function upgradeCost(def: MetaUpgradeDef, rank: number): number {
  return def.baseCost * (rank + 1);
}

/** Splitter spent to reach `rank` (sum of all previous prices). */
export function spentOn(def: MetaUpgradeDef, rank: number): number {
  return (def.baseCost * rank * (rank + 1)) / 2;
}

export function rankOf(save: SaveData, def: MetaUpgradeDef): number {
  return save.ranks[def.id] ?? 0;
}

export function canBuy(save: SaveData, def: MetaUpgradeDef): boolean {
  const rank = rankOf(save, def);
  return rank < def.maxRank && save.splitter >= upgradeCost(def, rank);
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
    complexity: open ? Math.max(0, Math.min(COMPLEXITY.max, Math.floor(choice.complexity))) : 0,
    endless: open && choice.endless,
  };
}
