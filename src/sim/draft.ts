import { AXIOM_LIST, AXIOMS } from '../content/axioms.ts';
import { DRAFT, OVER } from '../content/tuning.ts';
import type { AxiomId, WeaponId } from '../content/types.ts';
import { BASE_WEAPONS, WEAPONS } from '../content/weapons.ts';
import {
  addAxiom,
  addWeapon,
  evolveWeapon,
  freeEdge,
  freeVertex,
  hasWeapon,
  theoremSlots,
  upgradeAxiom,
  upgradeWeapon,
} from './build.ts';
import { axiomDone, coreLevel } from './stats.ts';
import { healPlayer } from './systems/combat.ts';
import type { World } from './world.ts';

/** A level-up choice. `level` is the level the item will have after picking the card. */
export type Card =
  | { kind: 'newWeapon'; weapon: WeaponId }
  | { kind: 'upgradeWeapon'; slot: number; weapon: WeaponId; level: number }
  | { kind: 'newAxiom'; axiom: AxiomId }
  | { kind: 'upgradeAxiom'; slot: number; axiom: AxiomId; level: number }
  | { kind: 'theorem'; slot: number; from: WeaponId; weapon: WeaponId }
  | { kind: 'heal'; amount: number }
  | { kind: 'splitter'; amount: number };

interface Weighted {
  card: Card;
  weight: number;
}

export function weaponAvailable(w: World, id: WeaponId): boolean {
  return !WEAPONS[id].locked || w.unlockedWeapons.has(id);
}

export function axiomAvailable(w: World, id: AxiomId): boolean {
  return !AXIOMS[id].locked || w.unlockedAxioms.has(id);
}

/** Everything that could be offered right now, with draw weights (theorems excluded). */
export function draftCandidates(w: World): Weighted[] {
  const p = w.player;
  const out: Weighted[] = [];
  const vertexFree = freeVertex(p) >= 0;
  const edgeFree = freeEdge(p) >= 0;

  // Überstufen (past the core levels) weigh less: filling the polygon comes first.
  for (let i = 0; i < p.vertices; i++) {
    const s = p.weapons[i];
    if (!s || s.level >= OVER.maxLevel || w.banished.has(`weapon:${s.def.id}`)) continue;
    const over = s.level >= coreLevel(s.def) ? DRAFT.overWeight : 1;
    out.push({
      card: { kind: 'upgradeWeapon', slot: i, weapon: s.def.id, level: s.level + 1 },
      weight: DRAFT.weightUpgradeWeapon * over,
    });
  }
  if (vertexFree) {
    for (const def of BASE_WEAPONS) {
      if (!weaponAvailable(w, def.id) || w.banished.has(`weapon:${def.id}`)) continue;
      if (hasWeapon(p, def.id)) continue;
      // Once proven, the theorem replaces its base weapon for good.
      if (def.evolvesInto && hasWeapon(p, def.evolvesInto)) continue;
      out.push({ card: { kind: 'newWeapon', weapon: def.id }, weight: DRAFT.weightNewWeapon });
    }
  }
  for (let i = 0; i < p.vertices; i++) {
    const a = p.axioms[i];
    if (!a || axiomDone(w.stats, a) || w.banished.has(`axiom:${a.def.id}`)) continue;
    const over = a.level >= a.def.maxLevel ? DRAFT.overWeight : 1;
    out.push({
      card: { kind: 'upgradeAxiom', slot: i, axiom: a.def.id, level: a.level + 1 },
      weight: DRAFT.weightUpgradeAxiom * over,
    });
  }
  if (edgeFree) {
    for (const def of AXIOM_LIST) {
      if (!axiomAvailable(w, def.id) || w.banished.has(`axiom:${def.id}`)) continue;
      if (p.axioms.some((a) => a?.def.id === def.id)) continue;
      out.push({ card: { kind: 'newAxiom', axiom: def.id }, weight: DRAFT.weightNewAxiom });
    }
  }
  return out;
}

/**
 * Rolls a draft: at most one golden Q.E.D. card (always shown when eligible), then weighted picks
 * without replacement, then fallback cards when the pool runs dry.
 */
export function rollDraft(w: World): Card[] {
  const size = Math.max(1, Math.round(w.stats.draftSize));
  const cards: Card[] = [];
  const slots = theoremSlots(w);
  if (slots.length > 0) {
    const slot = slots[w.rng.int(slots.length)]!;
    const from = w.player.weapons[slot]!.def;
    cards.push({ kind: 'theorem', slot, from: from.id, weapon: from.evolvesInto! });
  }
  const pool = draftCandidates(w);
  while (cards.length < size && pool.length > 0) {
    let total = 0;
    for (const c of pool) total += c.weight;
    let r = w.rng.next() * total;
    let pick = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i]!.weight;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    cards.push(pool[pick]!.card);
    pool.splice(pick, 1);
  }
  if (cards.length < size) cards.push({ kind: 'heal', amount: DRAFT.fallbackHeal });
  if (cards.length < size) cards.push({ kind: 'splitter', amount: DRAFT.fallbackSplitter });
  return cards;
}

export function applyCard(w: World, card: Card): void {
  switch (card.kind) {
    case 'newWeapon':
      addWeapon(w, WEAPONS[card.weapon]);
      break;
    case 'upgradeWeapon':
      upgradeWeapon(w, card.slot);
      break;
    case 'newAxiom':
      addAxiom(w, AXIOMS[card.axiom]);
      break;
    case 'upgradeAxiom':
      upgradeAxiom(w, card.slot);
      break;
    case 'theorem':
      evolveWeapon(w, card.slot);
      break;
    case 'heal':
      healPlayer(w, card.amount);
      break;
    case 'splitter':
      w.run.splitter += card.amount;
      break;
  }
}

/** Key used by "Radieren" (banish) to remove an item from the rest of the run; null = not banishable. */
export function banishKey(card: Card): string | null {
  switch (card.kind) {
    case 'newWeapon':
    case 'upgradeWeapon':
    case 'theorem':
      return `weapon:${card.weapon}`;
    case 'newAxiom':
    case 'upgradeAxiom':
      return `axiom:${card.axiom}`;
    case 'heal':
    case 'splitter':
      return null;
  }
}
