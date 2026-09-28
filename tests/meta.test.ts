import { describe, expect, it } from 'vitest';
import { META_UPGRADES, PROOFS } from '../src/content/meta.ts';
import { COMPLEXITY } from '../src/content/tuning.ts';
import type { MetaUpgradeDef } from '../src/content/types.ts';
import {
  buy,
  canBuy,
  metaMods,
  rankOf,
  refundAll,
  runConfig,
  spentOn,
  totalSpent,
  unlocks,
  upgradeCost,
} from '../src/meta/progression.ts';
import { proofMet, proofProgress } from '../src/meta/proofs.ts';
import {
  BACKUP_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  type StorageLike,
  freshSave,
  loadSave,
  migrate,
  sanitize,
  writeSave,
} from '../src/meta/save.ts';
import { type RunSummary, recordRun, runReward, summarizeRun } from '../src/meta/summary.ts';
import { RunSession } from '../src/sim/run.ts';
import { config, play } from './helpers.ts';

class MapStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

function upgrade(id: string): MetaUpgradeDef {
  const def = META_UPGRADES.find((u) => u.id === id);
  if (!def) throw new Error(`no upgrade ${id}`);
  return def;
}

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    won: false,
    time: 0,
    level: 1,
    kills: 0,
    maxVertices: 3,
    theorems: 0,
    bossKilled: false,
    splitter: 0,
    greed: 1,
    complexity: 0,
    weapons: [],
    axioms: [],
    enemies: [],
    ...over,
  };
}

describe('save', () => {
  it('starts fresh without data and round-trips through storage', () => {
    const st = new MapStorage();
    const first = loadSave(st);
    expect(first.status).toBe('new');
    expect(first.save).toEqual(freshSave());

    const s = first.save;
    s.splitter = 321;
    s.ranks.potenz = 2;
    s.proofs.push('quadratur');
    s.seen.enemies.push('punkt');
    s.stats.runs = 4;
    s.last = { character: 'nova', complexity: 2, endless: true };
    expect(writeSave(st, s)).toBe(true);

    const again = loadSave(st);
    expect(again.status).toBe('ok');
    expect(again.save).toEqual(s);
  });

  it('backs up an unreadable save and continues with a fresh one', () => {
    for (const raw of ['{broken', '[1,2,3]', '42', 'null', JSON.stringify({ version: 999 })]) {
      const st = new MapStorage();
      st.setItem(SAVE_KEY, raw);
      const r = loadSave(st);
      expect(r.status).toBe('recovered');
      expect(r.save).toEqual(freshSave());
      expect(st.getItem(BACKUP_KEY)).toBe(raw);
    }
  });

  it('survives storage that throws', () => {
    expect(loadSave(throwing).status).toBe('new');
    expect(writeSave(throwing, freshSave())).toBe(false);
  });

  it('runs migrations in order and refuses versions without a path', () => {
    const steps = {
      0: (d: Record<string, unknown>) => ({ ...d, shards: 5 }),
      1: (d: Record<string, unknown>) => {
        const { shards, ...rest } = d;
        return { ...rest, splitter: shards };
      },
    };
    expect(migrate({}, steps, 2)).toEqual({ version: 2, splitter: 5 });
    expect(migrate({ version: 1, shards: 7 }, steps, 2)).toEqual({ version: 2, splitter: 7 });
    expect(migrate({ version: 3 }, steps, 2)).toBeNull();
    expect(migrate({}, {}, 1)).toBeNull();
    expect(migrate({ version: SAVE_VERSION })).toEqual({ version: SAVE_VERSION });
  });

  it('sanitizes wrong types, unknown ids and ranks above the max', () => {
    const potenz = upgrade('potenz');
    const s = sanitize({
      version: SAVE_VERSION,
      splitter: -40,
      ranks: { potenz: potenz.maxRank + 2, gibtsnicht: 3, volumen: 'x', dichte: 1.7 },
      proofs: ['quadratur', 'quadratur', 'erfunden', 7],
      seen: { weapons: ['spitze', 'laser'], axioms: 'potenz', enemies: ['punkt', 'sierpinski'] },
      stats: { runs: 3, wins: Number.NaN, kills: -5, bestTime: 'lang' },
      last: { character: 'kreis', complexity: 99, endless: 'ja' },
    });
    expect(s.ranks).toEqual({ potenz: potenz.maxRank, dichte: 1 });
    // The two ranks above the max come back as Splitter.
    expect(s.splitter).toBe(spentOn(potenz, potenz.maxRank + 2) - spentOn(potenz, potenz.maxRank));
    expect(s.proofs).toEqual(['quadratur']);
    expect(s.seen).toEqual({ weapons: ['spitze'], axioms: [], enemies: ['punkt', 'sierpinski'] });
    expect(s.stats.runs).toBe(3);
    expect(s.stats.wins).toBe(0);
    expect(s.stats.kills).toBe(0);
    expect(s.stats.bestTime).toBe(0);
    expect(s.last).toEqual({ character: 'delta', complexity: COMPLEXITY.max, endless: false });
  });
});

describe('reißbrett', () => {
  it('prices ranks as baseCost × (rank + 1) and refunds exactly what was spent', () => {
    for (const def of META_UPGRADES) {
      let sum = 0;
      for (let r = 0; r < def.maxRank; r++) {
        expect(spentOn(def, r)).toBe(sum);
        expect(upgradeCost(def, r)).toBe(def.baseCost * (r + 1));
        sum += upgradeCost(def, r);
      }
      expect(spentOn(def, def.maxRank)).toBe(sum);
    }
  });

  it('buys with enough Splitter up to the max rank, and refunds everything', () => {
    const s = freshSave();
    const potenz = upgrade('potenz');
    expect(buy(s, potenz)).toBe(false);
    s.splitter = spentOn(potenz, potenz.maxRank) + 10;
    for (let r = 0; r < potenz.maxRank; r++) expect(buy(s, potenz)).toBe(true);
    expect(rankOf(s, potenz)).toBe(potenz.maxRank);
    expect(canBuy(s, potenz)).toBe(false);
    expect(s.splitter).toBe(10);
    expect(totalSpent(s)).toBe(spentOn(potenz, potenz.maxRank));
    expect(metaMods(s)).toEqual([{ stat: 'might', value: potenz.perRank * potenz.maxRank }]);

    expect(refundAll(s)).toBe(spentOn(potenz, potenz.maxRank));
    expect(s.splitter).toBe(spentOn(potenz, potenz.maxRank) + 10);
    expect(metaMods(s)).toEqual([]);
  });

  it('turns ranks into run stats', () => {
    const s = freshSave();
    s.ranks = { volumen: 2, viertekarte: 1, zweiterversuch: 1 };
    const w = new RunSession(
      runConfig(s, { seed: 1, character: 'delta', complexity: 0, endless: false }),
    ).world;
    expect(w.stats.maxHp).toBe(100 + 2 * upgrade('volumen').perRank);
    expect(w.stats.draftSize).toBe(4);
    expect(w.player.revivals).toBe(1);
  });
});

describe('beweise & unlocks', () => {
  it('locks Nova, Strahl, endless and complexity until proven', () => {
    const s = freshSave();
    const choice = { seed: 1, character: 'nova' as const, complexity: 3, endless: true };
    let cfg = runConfig(s, choice);
    expect(cfg.character).toBe('delta');
    expect(cfg.unlockedWeapons).toEqual([]);
    expect(cfg.unlockedAxioms).toEqual([]);
    expect(cfg.complexity).toBe(0);
    expect(cfg.endless).toBe(false);

    s.proofs = PROOFS.map((p) => p.id);
    cfg = runConfig(s, choice);
    expect(cfg.character).toBe('nova');
    expect([...cfg.unlockedWeapons].sort()).toEqual(['fraktal', 'strahl']);
    expect([...cfg.unlockedAxioms].sort()).toEqual(['integral', 'symmetrie']);
    expect(cfg.complexity).toBe(3);
    expect(cfg.endless).toBe(true);
    expect(unlocks(s).size).toBe(PROOFS.reduce((n, p) => n + p.unlocks.length, 0));
  });

  it('checks every condition kind', () => {
    const byId = (id: string) => PROOFS.find((p) => p.id === id)!.condition;
    expect(proofMet(byId('ersterBeweis'), summary({ time: 299 }))).toBe(false);
    expect(proofMet(byId('ersterBeweis'), summary({ time: 300 }))).toBe(true);
    expect(proofMet(byId('quadratur'), summary({ maxVertices: 4 }))).toBe(true);
    expect(proofMet(byId('vollendeteForm'), summary({ maxVertices: 5 }))).toBe(false);
    expect(proofMet(byId('qed'), summary({ theorems: 1 }))).toBe(true);
    expect(proofMet(byId('tausendPunkte'), summary({ kills: 999 }))).toBe(false);
    expect(proofMet(byId('teileUndHerrsche'), summary({ bossKilled: true }))).toBe(true);

    const stats = freshSave().stats;
    stats.bestKills = 1500;
    expect(proofProgress(byId('tausendPunkte'), stats)).toEqual({ value: 1000, target: 1000 });
    expect(proofProgress(byId('teileUndHerrsche'), stats)).toEqual({ value: 0, target: 1 });
  });
});

describe('run end', () => {
  it('pays collected Splitter plus time and kill bonus, times Gier and complexity', () => {
    const r = runReward(
      summary({ splitter: 10, time: 330, kills: 250, greed: 1.2, complexity: 2 }),
    );
    expect(r.time).toBe(15);
    expect(r.kills).toBe(2);
    expect(r.multiplier).toBeCloseTo(1.2 * 1.4);
    expect(r.total).toBe(Math.round(27 * 1.2 * 1.4));
  });

  it('books stats, Kompendium and new Beweise once', () => {
    const s = freshSave();
    const run = summary({
      time: 301,
      kills: 420,
      maxVertices: 4,
      level: 15,
      splitter: 7,
      weapons: ['spitze', 'welle'],
      axioms: ['potenz'],
      enemies: ['punkt'],
    });
    const first = recordRun(s, run);
    expect(first.proofs.map((p) => p.id)).toEqual(['ersterBeweis', 'quadratur']);
    expect(first.discovered).toBe(4);
    expect(s.splitter).toBe(first.reward.total);
    expect(s.stats).toMatchObject({ runs: 1, kills: 420, bestLevel: 15, bestVertices: 4 });

    const second = recordRun(s, run);
    expect(second.proofs).toEqual([]);
    expect(second.discovered).toBe(0);
    expect(s.stats.runs).toBe(2);
    expect(s.stats.kills).toBe(840);
  });

  it('summarizes a real run', () => {
    const session = new RunSession(config(4));
    play(session, 40);
    const r = summarizeRun(session.world, false);
    expect(r.kills).toBeGreaterThan(0);
    expect(r.weapons).toContain('spitze');
    expect(r.enemies).toContain('punkt');
    expect(r.time).toBeCloseTo(session.world.time);
  });
});
