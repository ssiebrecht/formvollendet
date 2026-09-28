import { PROOFS } from '../content/meta.ts';
import type { ProofCondition, ProofDef } from '../content/types.ts';
import type { LifetimeStats, SaveData } from './save.ts';
import type { RunSummary } from './summary.ts';

export function proofMet(c: ProofCondition, r: RunSummary): boolean {
  switch (c.kind) {
    case 'surviveSeconds':
      return r.time >= c.value;
    case 'reachVertices':
      return r.maxVertices >= c.value;
    case 'theorems':
      return r.theorems >= c.value;
    case 'killsInRun':
      return r.kills >= c.value;
    case 'bossKilled':
      return r.bossKilled;
  }
}

/** Marks every newly met proof as proven and returns those, in table order. */
export function evaluateProofs(save: SaveData, r: RunSummary): ProofDef[] {
  const fresh: ProofDef[] = [];
  for (const p of PROOFS) {
    if (save.proofs.includes(p.id) || !proofMet(p.condition, r)) continue;
    save.proofs.push(p.id);
    fresh.push(p);
  }
  return fresh;
}

/** Best single-run value so far against the target, for progress bars on the Beweise screen. */
export function proofProgress(
  c: ProofCondition,
  s: LifetimeStats,
): { value: number; target: number } {
  switch (c.kind) {
    case 'surviveSeconds':
      return { value: Math.min(s.bestTime, c.value), target: c.value };
    case 'reachVertices':
      return { value: Math.min(s.bestVertices, c.value), target: c.value };
    case 'theorems':
      return { value: Math.min(s.bestTheorems, c.value), target: c.value };
    case 'killsInRun':
      return { value: Math.min(s.bestKills, c.value), target: c.value };
    case 'bossKilled':
      return { value: Math.min(s.bossKills, 1), target: 1 };
  }
}
