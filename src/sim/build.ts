import { DRAFT, PLAYER, ticks } from '../content/tuning.ts';
import type { AxiomDef, CubeKind, WeaponDef } from '../content/types.ts';
import { WEAPONS } from '../content/weapons.ts';
import { maxLevel } from './stats.ts';
import type { CubeReward } from './events.ts';
import { healPlayer } from './systems/combat.ts';
import type { Player, World } from './world.ts';
import { createWeaponSlot, recomputeStats } from './world.ts';

/**
 * Build mutations shared by drafts, cubes and debug tools. The polygon is the build: vertex i
 * carries weapon i, edge i (vertex i → i+1) carries axiom i.
 */

export function freeVertex(p: Player): number {
  for (let i = 0; i < p.vertices; i++) if (!p.weapons[i]) return i;
  return -1;
}

export function freeEdge(p: Player): number {
  for (let i = 0; i < p.vertices; i++) if (!p.axioms[i]) return i;
  return -1;
}

export function hasWeapon(p: Player, id: string): boolean {
  return p.weapons.some((s) => s?.def.id === id);
}

export function axiomLevel(p: Player, id: string): number {
  return p.axioms.find((a) => a?.def.id === id)?.level ?? 0;
}

export function addWeapon(w: World, def: WeaponDef): number {
  const i = freeVertex(w.player);
  if (i < 0) return -1;
  w.player.weapons[i] = createWeaponSlot(def, 1, w.stats);
  w.run.weaponsSeen.add(def.id);
  return i;
}

export function upgradeWeapon(w: World, slot: number): string {
  const s = w.player.weapons[slot];
  if (!s || s.level >= maxLevel(s.def)) return '';
  const text = s.def.levels[s.level - 1]?.text ?? '';
  s.level++;
  recomputeStats(w);
  return text;
}

export function addAxiom(w: World, def: AxiomDef): number {
  const i = freeEdge(w.player);
  if (i < 0) return -1;
  w.player.axioms[i] = { def, level: 1 };
  w.run.axiomsSeen.add(def.id);
  recomputeStats(w);
  return i;
}

export function upgradeAxiom(w: World, slot: number): void {
  const a = w.player.axioms[slot];
  if (!a || a.level >= a.def.maxLevel) return;
  a.level++;
  recomputeStats(w);
}

/** Slot indices whose weapon is maxed and whose proof axiom is owned (any level). */
export function theoremSlots(w: World): number[] {
  const p = w.player;
  const out: number[] = [];
  for (let i = 0; i < p.vertices; i++) {
    const s = p.weapons[i];
    if (!s?.def.evolvesInto || !s.def.evolvesWith) continue;
    if (s.level < maxLevel(s.def)) continue;
    if (axiomLevel(p, s.def.evolvesWith) <= 0) continue;
    if (w.banished.has(`weapon:${s.def.evolvesInto}`)) continue;
    out.push(i);
  }
  return out;
}

/** Q.E.D.: replaces the weapon in its vertex with its theorem. */
export function evolveWeapon(w: World, slot: number): void {
  const s = w.player.weapons[slot];
  if (!s?.def.evolvesInto) return;
  const def = WEAPONS[s.def.evolvesInto];
  s.def = def;
  s.level = 1;
  s.cd = 0;
  s.active = 0;
  s.beamCount = 0;
  w.run.theorems.push(def.id);
  w.run.weaponsSeen.add(def.id);
  recomputeStats(w);
  w.events.push({ type: 'theorem', weapon: def.id });
}

/** Grows the polygon by one vertex (and edge). The caller freezes the sim for the morph. */
export function addVertex(w: World): boolean {
  const p = w.player;
  if (p.vertices >= PLAYER.maxVertices) return false;
  p.vertices++;
  w.run.maxVertices = Math.max(w.run.maxVertices, p.vertices);
  w.morphTicks = ticks(PLAYER.morphTime);
  w.events.push({ type: 'morph', vertices: p.vertices });
  return true;
}

/**
 * Opens a cube. Vertex cubes grow the polygon (or act as upgrade cubes at the hexagon); upgrade
 * cubes evolve an eligible theorem first, then roll random upgrades on owned items.
 */
export function openCube(w: World, kind: CubeKind): 'morph' | 'upgrade' {
  if (kind === 'vertex' && addVertex(w)) return 'morph';
  const rewards: CubeReward[] = [];
  let rolls: number = DRAFT.upgradeCubeRolls;
  const theorem = theoremSlots(w)[0];
  if (theorem !== undefined) {
    evolveWeapon(w, theorem);
    rewards.push({ kind: 'theorem', weapon: w.player.weapons[theorem]!.def.id });
    rolls--;
  }
  for (let r = 0; r < rolls; r++) {
    const reward = randomUpgrade(w);
    if (!reward) break;
    rewards.push(reward);
  }
  if (rewards.length === 0) {
    healPlayer(w, DRAFT.fallbackHeal);
    rewards.push({ kind: 'heal', amount: DRAFT.fallbackHeal });
  }
  w.run.splitter += DRAFT.upgradeCubeSplitter;
  rewards.push({ kind: 'splitter', amount: DRAFT.upgradeCubeSplitter });
  w.events.push({ type: 'upgradeCube', rewards });
  return 'upgrade';
}

function randomUpgrade(w: World): CubeReward | null {
  const p = w.player;
  const options: { weapon: boolean; slot: number }[] = [];
  for (let i = 0; i < p.vertices; i++) {
    const s = p.weapons[i];
    if (s && s.level < maxLevel(s.def)) options.push({ weapon: true, slot: i });
    const a = p.axioms[i];
    if (a && a.level < a.def.maxLevel) options.push({ weapon: false, slot: i });
  }
  if (options.length === 0) return null;
  const o = w.rng.pick(options);
  if (o.weapon) {
    upgradeWeapon(w, o.slot);
    const s = p.weapons[o.slot]!;
    return { kind: 'weapon', weapon: s.def.id, level: s.level };
  }
  upgradeAxiom(w, o.slot);
  const a = p.axioms[o.slot]!;
  return { kind: 'axiom', axiom: a.def.id, level: a.level };
}
