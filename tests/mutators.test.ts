import { describe, expect, it } from 'vitest';
import { MUTATORS, mutatorEffects, mutatorsAt } from '../src/content/mutators.ts';
import { CAPS, COMPLEXITY, complexityDamage, complexityHp } from '../src/content/tuning.ts';
import { WAVES } from '../src/content/waves.ts';
import { RunSession } from '../src/sim/run.ts';
import { enemyScale } from '../src/sim/systems/combat.ts';
import { runScript, updateDirector } from '../src/sim/systems/director.ts';
import { spawnBullet } from '../src/sim/systems/spawn.ts';
import type { World } from '../src/sim/world.ts';
import { config } from './helpers.ts';

function world(complexity: number): World {
  return new RunSession(config(3, { complexity })).world;
}

describe('mutators', () => {
  it('come one per level from K 6 to K 20 and stack', () => {
    const first = COMPLEXITY.open + 1;
    expect(MUTATORS.map((m) => m.level)).toEqual(
      Array.from({ length: COMPLEXITY.max - COMPLEXITY.open }, (_, i) => first + i),
    );
    expect(new Set(MUTATORS.map((m) => m.id)).size).toBe(MUTATORS.length);
    for (const v of Object.values(mutatorEffects(COMPLEXITY.open))) expect(v).toBe(1);
    expect(mutatorsAt(first + 1).map((m) => m.id)).toEqual(['geschosse', 'doppelteElite']);
    const all = mutatorEffects(COMPLEXITY.max);
    expect(all.eliteCount).toBe(3);
    expect(all.bulletSpeed).toBeCloseTo(1.5);
    expect(all.enemySpeed).toBeCloseTo(1.21);
    expect(all.enemyDamage).toBeCloseTo(1.5625);
    expect(all.xp).toBeCloseTo(0.85);
  });

  it('doubles elites on K 7, but only the scripted one carries the cube', () => {
    const w = world(7);
    runScript(w, { at: 0, kind: 'elite', enemy: 'block', drop: 'vertex', count: 1, hp: 2 });
    const elites = w.enemies.items.slice(0, w.enemies.count).filter((e) => e.alive && e.elite);
    expect(elites).toHaveLength(2);
    expect(elites.filter((e) => e.drop === 'vertex')).toHaveLength(1);
  });

  it('scale formations, enemies, bullets, the cap and XP', () => {
    const plain = world(0);
    const hard = world(COMPLEXITY.max);
    const ring = { at: 0, kind: 'ring', enemy: 'punkt', count: 20, radius: 400 } as const;
    runScript(plain, ring);
    runScript(hard, ring);
    expect(plain.enemies.count).toBe(20);
    expect(hard.enemies.count).toBe(30);
    expect(hard.enemies.items[0]!.xp).toBeCloseTo(plain.enemies.items[0]!.xp * 0.85);

    const a = enemyScale(plain, { hp: 1, damage: 1, speed: 1 });
    const b = enemyScale(hard, { hp: 1, damage: 1, speed: 1 });
    expect(b.hp / a.hp).toBeCloseTo(complexityHp(COMPLEXITY.max) * 1.5);
    expect(b.speed / a.speed).toBeCloseTo(1.21);
    expect(b.damage / a.damage).toBeCloseTo(complexityDamage(COMPLEXITY.max) * 1.5625);

    const bullet = spawnBullet(hard, 0, 0, 100, 0, 5)!;
    expect(bullet.vx).toBeCloseTo(150);

    updateDirector(hard);
    expect(hard.director.cap).toBe(Math.min(WAVES[0]!.maxAlive * 1.25, CAPS.enemies - 60));
  });
});
