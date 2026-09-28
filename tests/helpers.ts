import { DT } from '../src/content/tuning.ts';
import type { CharacterId } from '../src/content/types.ts';
import type { InputState, RunSession } from '../src/sim/run.ts';
import type { RunConfig } from '../src/sim/world.ts';

export function config(seed: number, overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    seed,
    character: 'delta' satisfies CharacterId,
    metaMods: [],
    unlockedWeapons: [],
    unlockedAxioms: [],
    complexity: 0,
    endless: false,
    ...overrides,
  };
}

/** Deterministic test pilot: circles around the origin, flees the nearest enemy, dashes now and then. */
export function botInput(s: RunSession, out: InputState): InputState {
  const w = s.world;
  const p = w.player;
  const t = w.time;
  let mx = Math.cos(t * 0.35);
  let my = Math.sin(t * 0.35);
  let best = Infinity;
  let ex = 0;
  let ey = 0;
  for (let i = 0; i < w.enemies.count; i++) {
    const e = w.enemies.items[i]!;
    if (!e.alive) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < best) {
      best = d;
      ex = e.x;
      ey = e.y;
    }
  }
  if (best < 120 * 120) {
    const d = Math.sqrt(best) || 1;
    mx = mx * 0.3 + ((p.x - ex) / d) * 0.7;
    my = my * 0.3 + ((p.y - ey) / d) * 0.7;
  }
  out.moveX = mx;
  out.moveY = my;
  out.ability = w.tick % 300 === 0;
  return out;
}

/** Steps the session for `seconds` of game time, auto-picking the first card in drafts. */
export function play(s: RunSession, seconds: number, onStep?: (s: RunSession) => void): void {
  const input: InputState = { moveX: 0, moveY: 0, ability: false };
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    if (s.state === 'draft') s.choose(0);
    if (s.state === 'won' || s.state === 'lost') return;
    s.step(botInput(s, input));
    onStep?.(s);
  }
}
