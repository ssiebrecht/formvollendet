import { describe, expect, it } from 'vitest';
import { AXIOM_LIST, AXIOMS } from '../src/content/axioms.ts';
import { CHARACTERS } from '../src/content/characters.ts';
import { ENEMIES } from '../src/content/enemies.ts';
import { CORE_LEVEL, DRAFT, OVER, PLAYER, STAT_CAPS } from '../src/content/tuning.ts';
import { BASE_WEAPONS, WEAPON_LIST, WEAPONS } from '../src/content/weapons.ts';
import {
  addAxiom,
  addVertex,
  addWeapon,
  evolveWeapon,
  openCube,
  theoremSlots,
  upgradeWeapon,
} from '../src/sim/build.ts';
import { applyCard, banishKey, draftCandidates, rollDraft } from '../src/sim/draft.ts';
import { RunSession } from '../src/sim/run.ts';
import {
  axiomDone,
  axiomMaxLevel,
  computeStats,
  coreLevel,
  effectiveParams,
  milestoneAt,
  weaponParamsAt,
} from '../src/sim/stats.ts';
import { damageEnemy } from '../src/sim/systems/combat.ts';
import { spawnEnemy } from '../src/sim/systems/director.ts';
import { createWorld, recomputeStats } from '../src/sim/world.ts';
import { config } from './helpers.ts';

describe('stats', () => {
  it('stacks axioms additively and clamps cooldown', () => {
    const s = computeStats(CHARACTERS.delta, [], [{ def: AXIOMS.potenz, level: 3 }]);
    expect(s.might).toBeCloseTo(1.3);
    expect(s.projSpeed).toBeCloseTo(1.1);
    const fast = computeStats(CHARACTERS.delta, [{ stat: 'cooldown', value: -5 }], []);
    expect(fast.cooldown).toBe(PLAYER.minCooldown);
  });

  it('weapon levels apply in order; theorems start from the parent at its core level', () => {
    const spitze = WEAPONS.spitze;
    expect(coreLevel(spitze)).toBe(CORE_LEVEL);
    expect(coreLevel(WEAPONS.sternpolygon)).toBe(CORE_LEVEL);
    expect(weaponParamsAt(spitze, 1).amount).toBe(1);
    expect(weaponParamsAt(spitze, 2).amount).toBe(2);
    const maxed = weaponParamsAt(spitze, CORE_LEVEL);
    const star = weaponParamsAt(WEAPONS.sternpolygon, CORE_LEVEL);
    expect(star.allVertices).toBe(1);
    expect(star.pierce).toBe(maxed.pierce + 2);
    expect(star.damage).toBe(maxed.damage);
  });

  it('base weapons have their core levels and a milestone cycle; axioms but Symmetrie grow on', () => {
    for (const d of BASE_WEAPONS) {
      expect(d.levels, d.id).toHaveLength(CORE_LEVEL - 1);
      expect(d.over?.length ?? 0, d.id).toBeGreaterThan(0);
    }
    for (const a of AXIOM_LIST) {
      expect(axiomMaxLevel(a), a.id).toBe(a.id === 'symmetrie' ? a.maxLevel : OVER.maxLevel);
    }
  });

  it('Überstufen add damage every level and a milestone every five levels', () => {
    const spitze = WEAPONS.spitze;
    const core = weaponParamsAt(spitze, CORE_LEVEL);
    const lv9 = weaponParamsAt(spitze, CORE_LEVEL + 1);
    expect(lv9.damage).toBeCloseTo(core.damage * (1 + OVER.damagePerLevel));
    expect(lv9.pierce).toBe(core.pierce);
    expect(milestoneAt(spitze, CORE_LEVEL)).toBeNull();
    expect(milestoneAt(spitze, 9)).toBeNull();
    expect(milestoneAt(spitze, 10)).toBe(spitze.over![0]);
    expect(milestoneAt(spitze, 15)).toBe(spitze.over![1]);
    expect(weaponParamsAt(spitze, 10).pierce).toBe(core.pierce + 1);
    const top = weaponParamsAt(spitze, OVER.maxLevel);
    expect(top.damage).toBeCloseTo(
      core.damage * (1 + OVER.damagePerLevel * (OVER.maxLevel - CORE_LEVEL)),
    );
  });

  it('Überstufen stay within their limits even at the last level', () => {
    for (const d of WEAPON_LIST) {
      const core = weaponParamsAt(d, CORE_LEVEL);
      const top = weaponParamsAt(d, OVER.maxLevel);
      expect(top.amount, d.id).toBeLessThanOrEqual(core.amount + OVER.maxExtraAmount);
      expect(top.cooldown, d.id).toBeGreaterThanOrEqual(core.cooldown * OVER.minCooldownFactor);
      expect(top.slow, d.id).toBeLessThanOrEqual(Math.max(core.slow, OVER.maxSlow));
      expect(top.damage, d.id).toBeGreaterThan(core.damage);
    }
  });

  it('axioms grow with smaller steps past their core; stats respect their caps', () => {
    const potenz = AXIOMS.potenz;
    const s = computeStats(CHARACTERS.delta, [], [{ def: potenz, level: potenz.maxLevel + 10 }]);
    expect(s.might).toBeCloseTo(1 + 0.1 * potenz.maxLevel + 0.02 * 10);
    const fast = computeStats(CHARACTERS.delta, [], [{ def: AXIOMS.beschleunigung, level: 99 }]);
    expect(fast.moveSpeed).toBe(STAT_CAPS.moveSpeed);
    const wide = computeStats(CHARACTERS.delta, [{ stat: 'area', value: 5 }], []);
    expect(wide.area).toBe(STAT_CAPS.area);
  });

  it('effective params fold in player stats', () => {
    const s = computeStats(CHARACTERS.delta, [], [{ def: AXIOMS.skalierung, level: 2 }]);
    const p = effectiveParams(WEAPONS.zirkel, 1, s);
    expect(p.radius).toBeCloseTo(70 * 1.2);
  });
});

describe('polygon slots', () => {
  it('starts as a triangle with the start weapon and grows to a hexagon', () => {
    const w = createWorld(config(1));
    expect(w.player.vertices).toBe(3);
    expect(w.player.weapons[0]?.def.id).toBe('spitze');
    expect(addWeapon(w, WEAPONS.kreisbahn)).toBe(1);
    expect(addWeapon(w, WEAPONS.welle)).toBe(2);
    expect(addWeapon(w, WEAPONS.zirkel)).toBe(-1);
    expect(addVertex(w)).toBe(true);
    expect(addWeapon(w, WEAPONS.zirkel)).toBe(3);
    addVertex(w);
    addVertex(w);
    expect(w.player.vertices).toBe(PLAYER.maxVertices);
    expect(addVertex(w)).toBe(false);
    expect(w.run.maxVertices).toBe(6);
  });

  it('a vertex cube at the hexagon acts as an upgrade cube', () => {
    const w = createWorld(config(1));
    for (let i = 0; i < 3; i++) expect(openCube(w, 'vertex')).toBe('morph');
    expect(openCube(w, 'vertex')).toBe('upgrade');
    expect(w.player.weapons[0]!.level).toBeGreaterThan(1);
  });
});

describe('draft', () => {
  it('offers no new weapons when every vertex is taken', () => {
    const w = createWorld(config(5));
    addWeapon(w, WEAPONS.kreisbahn);
    addWeapon(w, WEAPONS.welle);
    for (let i = 0; i < 30; i++) {
      for (const c of rollDraft(w)) expect(c.kind).not.toBe('newWeapon');
    }
  });

  it('offers no new axioms when every edge is taken', () => {
    const w = createWorld(config(5));
    addAxiom(w, AXIOMS.potenz);
    addAxiom(w, AXIOMS.frequenz);
    addAxiom(w, AXIOMS.volumen);
    for (let i = 0; i < 30; i++) {
      for (const c of rollDraft(w)) expect(c.kind).not.toBe('newAxiom');
    }
  });

  it('never offers locked content unless unlocked', () => {
    const w = createWorld(config(9));
    for (let i = 0; i < 50; i++) {
      for (const c of rollDraft(w)) {
        if (c.kind === 'newWeapon') expect(WEAPONS[c.weapon].locked).toBe(false);
        if (c.kind === 'newAxiom') expect(AXIOMS[c.axiom].locked).toBe(false);
      }
    }
    const u = createWorld(config(9, { unlockedWeapons: ['strahl'] }));
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++)
      for (const c of rollDraft(u)) if (c.kind === 'newWeapon') seen.add(c.weapon);
    expect(seen.has('strahl')).toBe(true);
  });

  it('banished items disappear from the pool', () => {
    const w = createWorld(config(11));
    w.banished.add('weapon:kreisbahn');
    for (let i = 0; i < 50; i++) {
      for (const c of rollDraft(w))
        if (c.kind === 'newWeapon') expect(c.weapon).not.toBe('kreisbahn');
    }
  });

  it('shows the golden Q.E.D. card once a weapon at its core level has its axiom', () => {
    const w = createWorld(config(2, { unlockedAxioms: ['symmetrie'] }));
    const slot = w.player.weapons[0]!;
    slot.level = CORE_LEVEL - 1;
    addAxiom(w, AXIOMS.symmetrie);
    expect(theoremSlots(w)).toEqual([]);
    w.player.axioms.fill(null);
    slot.level = CORE_LEVEL;
    expect(theoremSlots(w)).toEqual([]);
    addAxiom(w, AXIOMS.symmetrie);
    expect(theoremSlots(w)).toEqual([0]);
    const cards = rollDraft(w);
    expect(cards[0]).toEqual({ kind: 'theorem', slot: 0, from: 'spitze', weapon: 'sternpolygon' });
    applyCard(w, cards[0]!);
    expect(w.player.weapons[0]!.def.id).toBe('sternpolygon');
    expect(w.run.theorems).toEqual(['sternpolygon']);
    // The base weapon never comes back once its theorem is owned.
    for (let i = 0; i < 30; i++) {
      for (const c of rollDraft(w)) if (c.kind === 'newWeapon') expect(c.weapon).not.toBe('spitze');
    }
  });

  it('a theorem keeps the level and the Überstufen of its weapon', () => {
    const w = createWorld(config(2, { unlockedAxioms: ['symmetrie'] }));
    const slot = w.player.weapons[0]!;
    slot.level = 11;
    upgradeWeapon(w, 0);
    expect(w.run.maxWeaponLevel).toBe(12);
    addAxiom(w, AXIOMS.symmetrie);
    expect(theoremSlots(w)).toEqual([0]);
    evolveWeapon(w, 0);
    expect(slot.def.id).toBe('sternpolygon');
    expect(slot.level).toBe(12);
    const base = weaponParamsAt(WEAPONS.sternpolygon, CORE_LEVEL);
    expect(weaponParamsAt(WEAPONS.sternpolygon, 12).damage).toBeCloseTo(
      base.damage * (1 + OVER.damagePerLevel * 4),
    );
  });

  it('Überstufe cards weigh less than core levels', () => {
    const w = createWorld(config(5));
    const weight = (): number =>
      draftCandidates(w).find((c) => c.card.kind === 'upgradeWeapon')!.weight;
    expect(weight()).toBe(DRAFT.weightUpgradeWeapon);
    w.player.weapons[0]!.level = CORE_LEVEL;
    expect(weight()).toBeCloseTo(DRAFT.weightUpgradeWeapon * DRAFT.overWeight);
  });

  it('stops offering an axiom whose next level would only push capped stats', () => {
    const w = createWorld(config(6));
    const i = addAxiom(w, AXIOMS.beschleunigung);
    const a = w.player.axioms[i]!;
    a.level = 40;
    recomputeStats(w);
    expect(axiomDone(w.stats, a)).toBe(false);
    a.level = 60;
    recomputeStats(w);
    expect(w.stats.moveSpeed).toBe(STAT_CAPS.moveSpeed);
    expect(axiomDone(w.stats, a)).toBe(true);
    for (let k = 0; k < 30; k++) {
      for (const c of rollDraft(w)) expect(c.kind === 'upgradeAxiom' && c.slot === i).toBe(false);
    }
  });

  it('falls back to heal and splitter when everything is maxed', () => {
    const w = createWorld(config(4));
    w.player.weapons[0]!.level = OVER.maxLevel;
    for (const id of ['kreisbahn', 'welle'] as const) {
      const i = addWeapon(w, WEAPONS[id]);
      w.player.weapons[i]!.level = OVER.maxLevel;
    }
    // Axioms that complete none of the owned weapons' theorems.
    for (const id of ['potenz', 'volumen', 'beschleunigung'] as const) {
      const i = addAxiom(w, AXIOMS[id]);
      w.player.axioms[i]!.level = axiomMaxLevel(AXIOMS[id]);
    }
    const cards = rollDraft(w);
    expect(cards.map((c) => c.kind)).toEqual(['heal', 'splitter']);
    expect(banishKey(cards[0]!)).toBeNull();
  });

  it('session draft actions respect their charges', () => {
    const s = new RunSession(config(8, { metaMods: [{ stat: 'reroll', value: 1 }] }));
    s.debugLevelUp(2);
    expect(s.state).toBe('draft');
    expect(s.reroll()).toBe(true);
    expect(s.reroll()).toBe(false);
    expect(s.skip()).toBe(false);
    expect(s.choose(0)).toBe(true);
    expect(s.state).toBe('draft');
    expect(s.choose(0)).toBe(true);
    expect(s.state).toBe('playing');
  });
});

describe('enemy shells', () => {
  it('breaks one shell per lost share of HP', () => {
    const w = createWorld(config(3));
    const e = spawnEnemy(w, ENEMIES.wabe, 500, 0)!;
    expect(e.shells).toBe(3);
    const hit = { dirX: 0, dirY: 0, knock: 0, canCrit: false };
    damageEnemy(w, e, e.maxHp * 0.34, 'test', hit);
    expect(e.shells).toBe(2);
    expect(w.events.filter((ev) => ev.type === 'shell')).toHaveLength(1);
    damageEnemy(w, e, e.maxHp * 0.34, 'test', hit);
    expect(e.shells).toBe(1);
    expect(damageEnemy(w, e, e.maxHp, 'test', hit)).toBe(true);
    expect(e.alive).toBe(false);
    expect(w.run.kills).toBe(1);
  });

  it('elites are bigger, tougher and drop their cube', () => {
    const w = createWorld(config(3));
    const e = spawnEnemy(w, ENEMIES.block, 300, 0, true, 'vertex')!;
    expect(e.r).toBeCloseTo(ENEMIES.block.radius * 2.5);
    expect(e.shellsMax).toBe(3);
    damageEnemy(w, e, 1e9, 'test', { dirX: 0, dirY: 0, knock: 0, canCrit: false });
    let cubes = 0;
    for (let i = 0; i < w.pickups.count; i++)
      if (w.pickups.items[i]!.kind === 'vertexCube') cubes++;
    expect(cubes).toBe(1);
  });
});
