import type { ProofDef } from '../content/types.ts';
import { COMPLEXITY, SPLITTER } from '../content/tuning.ts';
import type { World } from '../sim/world.ts';
import { evaluateProofs } from './proofs.ts';
import type { SaveData } from './save.ts';

/** What the meta layer keeps of a finished run: plain data, detached from the world. */
export interface RunSummary {
  won: boolean;
  time: number;
  level: number;
  kills: number;
  maxVertices: number;
  theorems: number;
  bossKilled: boolean;
  /** Splitter picked up during the run (drops, elites, boss, cubes). */
  splitter: number;
  /** The run's Gier multiplier. */
  greed: number;
  complexity: number;
  weapons: string[];
  axioms: string[];
  enemies: string[];
}

export function summarizeRun(w: World, won: boolean): RunSummary {
  return {
    won,
    time: w.time,
    level: w.player.level,
    kills: w.run.kills,
    maxVertices: w.run.maxVertices,
    theorems: w.run.theorems.length,
    bossKilled: w.run.bossKilled,
    splitter: w.run.splitter,
    greed: w.stats.greed,
    complexity: w.cfg.complexity,
    weapons: [...w.run.weaponsSeen],
    axioms: [...w.run.axiomsSeen],
    enemies: [...w.run.enemiesSeen],
  };
}

export interface Reward {
  collected: number;
  /** Bonus for every full minute survived. */
  time: number;
  /** Bonus for every hundred kills. */
  kills: number;
  /** Gier × complexity bonus. */
  multiplier: number;
  total: number;
}

export function runReward(r: RunSummary): Reward {
  const collected = r.splitter;
  const time = Math.floor(r.time / 60) * SPLITTER.perMinute;
  const kills = Math.floor(r.kills / 100) * SPLITTER.perHundredKills;
  const multiplier = r.greed * (1 + r.complexity * COMPLEXITY.splitterPerLevel);
  return {
    collected,
    time,
    kills,
    multiplier,
    total: Math.round((collected + time + kills) * multiplier),
  };
}

export interface RunOutcome {
  reward: Reward;
  /** Beweise proven by this run. */
  proofs: ProofDef[];
  /** New Kompendium entries. */
  discovered: number;
}

function merge(into: string[], ids: readonly string[]): number {
  let added = 0;
  for (const id of ids) {
    if (into.includes(id)) continue;
    into.push(id);
    added++;
  }
  return added;
}

/** Books a finished run into the save: Splitter, lifetime stats, Kompendium, Beweise. */
export function recordRun(save: SaveData, r: RunSummary): RunOutcome {
  const reward = runReward(r);
  save.splitter += reward.total;
  const s = save.stats;
  s.runs++;
  if (r.won) s.wins++;
  s.kills += r.kills;
  s.bestTime = Math.max(s.bestTime, r.time);
  s.bestKills = Math.max(s.bestKills, r.kills);
  s.bestLevel = Math.max(s.bestLevel, r.level);
  s.bestVertices = Math.max(s.bestVertices, r.maxVertices);
  s.bestTheorems = Math.max(s.bestTheorems, r.theorems);
  s.theorems += r.theorems;
  if (r.bossKilled) s.bossKills++;
  s.splitterEarned += reward.total;
  const discovered =
    merge(save.seen.weapons, r.weapons) +
    merge(save.seen.axioms, r.axioms) +
    merge(save.seen.enemies, r.enemies);
  return { reward, proofs: evaluateProofs(save, r), discovered };
}
