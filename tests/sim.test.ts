import { describe, expect, it } from 'vitest';
import { CAPS, RUN } from '../src/content/tuning.ts';
import { SCRIPT, WAVES } from '../src/content/waves.ts';
import { RunSession } from '../src/sim/run.ts';
import { bossProgress } from '../src/sim/systems/boss.ts';
import { damageEnemy } from '../src/sim/systems/combat.ts';
import { segmentAt } from '../src/sim/systems/director.ts';
import type { World } from '../src/sim/world.ts';
import { config, play } from './helpers.ts';

function assertSane(w: World): void {
  const p = w.player;
  for (const v of [p.x, p.y, p.hp, p.xp, p.rot]) expect(Number.isFinite(v)).toBe(true);
  expect(w.enemies.count).toBeLessThanOrEqual(CAPS.enemies);
  expect(w.projectiles.count).toBeLessThanOrEqual(CAPS.projectiles);
  expect(w.bullets.count).toBeLessThanOrEqual(CAPS.bullets);
  for (let i = 0; i < w.enemies.count; i++) {
    const e = w.enemies.items[i]!;
    expect(e.alive).toBe(true);
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) {
      throw new Error(`enemy ${e.def.id} has non-finite state at tick ${w.tick}`);
    }
  }
  for (let i = 0; i < w.projectiles.count; i++) {
    const pr = w.projectiles.items[i]!;
    if (!Number.isFinite(pr.x) || !Number.isFinite(pr.y))
      throw new Error(`projectile ${pr.source} NaN`);
  }
}

describe('wave table', () => {
  it('covers the run without gaps and with sane rates', () => {
    expect(WAVES[0]!.from).toBe(0);
    for (let i = 1; i < WAVES.length; i++) expect(WAVES[i]!.from).toBe(WAVES[i - 1]!.to);
    expect(WAVES[WAVES.length - 1]!.to).toBe(RUN.length);
    for (const s of WAVES) {
      expect(s.rate[1]).toBeGreaterThanOrEqual(s.rate[0]);
      expect(s.maxAlive).toBeLessThan(CAPS.enemies);
      expect(s.pool.length).toBeGreaterThan(0);
    }
    expect(segmentAt(10).from).toBe(0);
    expect(segmentAt(5000)).toBe(WAVES[WAVES.length - 1]);
  });

  it('scripts elites for three vertex cubes and ends with the boss', () => {
    const cubes = SCRIPT.filter((e) => e.kind === 'elite' && e.drop === 'vertex').length;
    expect(cubes).toBe(3);
    expect(SCRIPT[SCRIPT.length - 1]!.kind).toBe('boss');
    for (let i = 1; i < SCRIPT.length; i++)
      expect(SCRIPT[i]!.at).toBeGreaterThanOrEqual(SCRIPT[i - 1]!.at);
  });
});

describe('simulation', () => {
  it('runs three minutes headless on several seeds without NaN or cap violations', () => {
    for (const seed of [1, 2, 3]) {
      const s = new RunSession(config(seed));
      let checks = 0;
      play(s, 180, (x) => {
        if (x.world.tick % 30 === 0) {
          assertSane(x.world);
          checks++;
        }
      });
      expect(checks).toBeGreaterThan(0);
      expect(s.world.run.kills).toBeGreaterThan(20);
      expect(s.world.player.level).toBeGreaterThan(3);
    }
  });

  it('is deterministic: same seed and inputs give the same state hash', () => {
    const a = new RunSession(config(77));
    const b = new RunSession(config(77));
    play(a, 60);
    play(b, 60);
    expect(a.stateHash()).toBe(b.stateHash());
    const c = new RunSession(config(78));
    play(c, 60);
    expect(c.stateHash()).not.toBe(a.stateHash());
  });

  it('elite cube morphs the polygon and freezes the world briefly', () => {
    const s = new RunSession(config(5));
    s.world.god = true;
    s.debugJump(179);
    play(s, 1.5);
    const w = s.world;
    const elite = w.enemies.items.slice(0, w.enemies.count).find((e) => e.elite);
    expect(elite).toBeDefined();
    // Pull the cube to the player the fast way: kill the elite at the player's feet.
    elite!.x = w.player.x + 40;
    elite!.y = w.player.y;
    elite!.hp = 1;
    elite!.invuln = 0;
    let morphed = false;
    play(s, 5, (x) => {
      if (x.state === 'morph') morphed = true;
      if (x.state === 'playing' && x.world.pickups.count > 0) {
        for (let i = 0; i < x.world.pickups.count; i++) {
          const pk = x.world.pickups.items[i]!;
          if (pk.kind === 'vertexCube') pk.attracted = true;
        }
      }
    });
    expect(morphed).toBe(true);
    expect(w.player.vertices).toBe(4);
  });

  it('the boss splits 1 → 3 → 9 and its defeat wins the run', () => {
    const s = new RunSession(config(12));
    const w = s.world;
    w.god = true;
    s.debugBoss();
    expect(bossProgress(w)).toBeCloseTo(1);
    const splits = [0, 0, 0];
    const count = (x: RunSession): void => {
      for (const ev of x.world.events) if (ev.type === 'bossSplit') splits[ev.depth]!++;
    };
    const hit = { dirX: 0, dirY: 0, knock: 0, canCrit: false };
    for (let round = 0; round < 10 && !w.run.bossKilled; round++) {
      const n = w.enemies.count;
      for (let j = 0; j < n; j++) {
        const e = w.enemies.items[j]!;
        if (!e.alive || e.boss < 0) continue;
        e.invuln = 0;
        damageEnemy(w, e, 1e9, 'test', hit);
      }
      count(s);
      play(s, 0.1, count);
    }
    expect(splits).toEqual([1, 3, 9]);
    expect(w.run.bossKilled).toBe(true);
    expect(bossProgress(w)).toBe(0);
    play(s, 4);
    expect(s.state).toBe('won');
  });
});
