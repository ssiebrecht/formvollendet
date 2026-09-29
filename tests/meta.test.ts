import { describe, expect, it } from 'vitest';
import { META_UPGRADES, PROOFS } from '../src/content/meta.ts';
import { COMPLEXITY, complexitySplitter, DRAFT } from '../src/content/tuning.ts';
import type { MetaUpgradeDef } from '../src/content/types.ts';
import {
  buy,
  canBuy,
  entryUnlocked,
  maxComplexity,
  maxRankOf,
  metaMods,
  metaTier,
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
import { openCube } from '../src/sim/build.ts';
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
    bossKills: 0,
    maxWeaponLevel: 1,
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
    s.proofs.push('quadratur', 'teileUndHerrsche');
    s.seen.enemies.push('punkt');
    s.stats.runs = 4;
    s.last = { character: 'nova', complexity: 2, endless: true };
    expect(writeSave(st, s)).toBe(true);

    const again = loadSave(st);
    expect(again.status).toBe('ok');
    expect(again.save).toEqual(s);
  });

  it('loads a save of the first release as it was: ranks, Splitter, stats, choices', () => {
    const st = new MapStorage();
    const old = {
      version: 1,
      splitter: 1234,
      ranks: { potenz: 5, dichte: 3, gier: 5, zweiterversuch: 1, viertekarte: 1 },
      proofs: ['ersterBeweis', 'teileUndHerrsche'],
      seen: { weapons: ['spitze'], axioms: [], enemies: ['punkt'] },
      stats: {
        runs: 12,
        wins: 1,
        kills: 9000,
        bestTime: 905,
        bestKills: 1400,
        bestLevel: 50,
        bestVertices: 6,
        bestTheorems: 1,
        theorems: 2,
        bossKills: 1,
        splitterEarned: 5000,
      },
      last: { character: 'delta', complexity: 2, endless: true },
    };
    st.setItem(SAVE_KEY, JSON.stringify(old));
    const { save, status } = loadSave(st);
    expect(status).toBe('ok');
    expect(save.ranks).toEqual(old.ranks);
    expect(save.splitter).toBe(old.splitter);
    expect(save.stats).toEqual({
      ...old.stats,
      bestBossKills: 0,
      bestWeaponLevel: 0,
      bestComplexity: -1,
    });
    expect(save.last).toEqual(old.last);
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
      ranks: { potenz: potenz.ranks[0] + 2, gibtsnicht: 3, volumen: 'x', dichte: 1.7 },
      proofs: ['quadratur', 'quadratur', 'erfunden', 7],
      seen: { weapons: ['spitze', 'laser'], axioms: 'potenz', enemies: ['punkt', 'sierpinski'] },
      stats: { runs: 3, wins: Number.NaN, kills: -5, bestTime: 'lang' },
      last: { character: 'kreis', complexity: 99, endless: 'ja' },
    });
    expect(s.ranks).toEqual({ potenz: potenz.ranks[0], dichte: 1 });
    // The two ranks no Erweiterung opened come back as Splitter.
    expect(s.splitter).toBe(
      spentOn(potenz, potenz.ranks[0] + 2) - spentOn(potenz, potenz.ranks[0]),
    );
    expect(s.proofs).toEqual(['quadratur']);
    expect(s.seen).toEqual({ weapons: ['spitze'], axioms: [], enemies: ['punkt', 'sierpinski'] });
    expect(s.stats.runs).toBe(3);
    expect(s.stats.wins).toBe(0);
    expect(s.stats.kills).toBe(0);
    expect(s.stats.bestTime).toBe(0);
    // Without "Teile und herrsche" no complexity level is open.
    expect(s.last).toEqual({ character: 'delta', complexity: 0, endless: false });
  });
});

describe('komplexität', () => {
  it('opens K 1–5 with the first boss kill, then one level above the best win', () => {
    const s = freshSave();
    expect(maxComplexity(s)).toBe(0);
    s.proofs = ['teileUndHerrsche'];
    expect(maxComplexity(s)).toBe(COMPLEXITY.open);
    s.stats.bestComplexity = COMPLEXITY.open;
    expect(maxComplexity(s)).toBe(COMPLEXITY.open + 1);
    s.stats.bestComplexity = COMPLEXITY.max;
    expect(maxComplexity(s)).toBe(COMPLEXITY.max);
    s.stats.bestComplexity = 7;
    const cfg = runConfig(s, { seed: 1, character: 'delta', complexity: 15, endless: false });
    expect(cfg.complexity).toBe(8);
  });

  it('books boss wins per level and reports a level the Beweise did not open', () => {
    const s = freshSave();
    const first = recordRun(s, summary({ won: true, bossKilled: true, bossKills: 1 }));
    expect(first.proofs.map((p) => p.id)).toContain('teileUndHerrsche');
    expect(first.complexityOpened).toBeNull();
    expect(s.stats.bestComplexity).toBe(0);
    const k3 = recordRun(s, summary({ won: true, bossKilled: true, bossKills: 1, complexity: 3 }));
    expect(k3.complexityOpened).toBeNull();
    const k5 = recordRun(s, summary({ won: true, bossKilled: true, bossKills: 1, complexity: 5 }));
    expect(k5.complexityOpened).toBe(COMPLEXITY.open + 1);
    expect(recordRun(s, summary({ complexity: 6, time: 900 })).complexityOpened).toBeNull();
    expect(s.stats.bestComplexity).toBe(5);
    expect(s.stats.bossKills).toBe(3);
    recordRun(s, summary({ bossKilled: true, bossKills: 2, maxWeaponLevel: 31, complexity: 1 }));
    expect(s.stats).toMatchObject({ bossKills: 5, bestBossKills: 2, bestWeaponLevel: 31 });
  });

  it('sanitizes the best level and clamps the last choice to the open levels', () => {
    const base = { version: SAVE_VERSION, proofs: ['teileUndHerrsche'] };
    expect(sanitize(base).stats.bestComplexity).toBe(-1);
    expect(sanitize({ ...base, stats: { bestComplexity: 'x' } }).stats.bestComplexity).toBe(-1);
    expect(sanitize({ ...base, stats: { bestComplexity: 99 } }).stats.bestComplexity).toBe(
      COMPLEXITY.max,
    );
    const s = sanitize({ ...base, stats: { bestComplexity: 8 }, last: { complexity: 15 } });
    expect(s.last.complexity).toBe(9);
    expect(sanitize({ ...base, last: { complexity: 15 } }).last.complexity).toBe(COMPLEXITY.open);
  });
});

describe('reißbrett', () => {
  it('prices the base ranks as baseCost × (rank + 1) and the Erweiterung ranks steeper', () => {
    for (const def of META_UPGRADES) {
      for (let t = 1; t < 4; t++) expect(def.ranks[t]).toBeGreaterThanOrEqual(def.ranks[t - 1]!);
      let sum = 0;
      for (let r = 0; r < def.ranks[3]; r++) {
        expect(spentOn(def, r)).toBe(sum);
        const flat = def.baseCost * (r + 1);
        if (r < def.ranks[0]) expect(upgradeCost(def, r)).toBe(flat);
        else expect(upgradeCost(def, r)).toBeGreaterThan(flat);
        sum += upgradeCost(def, r);
      }
      expect(spentOn(def, def.ranks[3])).toBe(sum);
    }
    // The entries of the first release still cost what they cost then.
    const first = META_UPGRADES.filter((d) => !d.locked);
    expect(first.reduce((n, d) => n + spentOn(d, d.ranks[0]), 0)).toBe(14_910);
    // About 150 good runs to finish the Reißbrett.
    const all = META_UPGRADES.reduce((n, d) => n + spentOn(d, d.ranks[3]), 0);
    expect(all).toBeGreaterThanOrEqual(250_000);
    expect(all).toBeLessThanOrEqual(300_000);
  });

  it('buys with enough Splitter up to the max rank, and refunds everything', () => {
    const s = freshSave();
    const potenz = upgrade('potenz');
    expect(buy(s, potenz)).toBe(false);
    const max = potenz.ranks[0];
    s.splitter = spentOn(potenz, max) + 10;
    for (let r = 0; r < max; r++) expect(buy(s, potenz)).toBe(true);
    expect(rankOf(s, potenz)).toBe(max);
    expect(canBuy(s, potenz)).toBe(false);
    expect(s.splitter).toBe(10);
    expect(totalSpent(s)).toBe(spentOn(potenz, max));
    expect(metaMods(s)).toEqual([{ stat: 'might', value: potenz.perRank * max }]);

    expect(refundAll(s)).toBe(spentOn(potenz, max));
    expect(s.splitter).toBe(spentOn(potenz, max) + 10);
    expect(metaMods(s)).toEqual([]);
  });

  it('opens more ranks with every Erweiterung, whichever Beweis comes first', () => {
    const s = freshSave();
    const potenz = upgrade('potenz');
    s.splitter = 1e9;
    for (let r = 0; r < potenz.ranks[0]; r++) buy(s, potenz);
    expect(canBuy(s, potenz)).toBe(false);
    expect(metaTier(s)).toBe(0);
    // Konvergenz carries the second Erweiterung, but alone it opens one.
    s.proofs.push('konvergenz');
    expect(metaTier(s)).toBe(1);
    expect(maxRankOf(s, potenz)).toBe(potenz.ranks[1]);
    expect(buy(s, potenz)).toBe(true);
    s.proofs.push('grenzwert', 'unendlichkeit');
    expect(metaTier(s)).toBe(3);
    expect(maxRankOf(s, potenz)).toBe(potenz.ranks[3]);
  });

  it('keeps the new entries locked until their Beweis', () => {
    const s = freshSave();
    s.splitter = 1e6;
    const tangente = upgrade('tangente');
    expect(entryUnlocked(s, tangente)).toBe(false);
    expect(maxRankOf(s, tangente)).toBe(0);
    expect(buy(s, tangente)).toBe(false);
    s.proofs.push('fuenftausend');
    expect(buy(s, tangente)).toBe(true);
    expect(metaMods(s)).toEqual([{ stat: 'crit', value: tangente.perRank }]);
  });

  it('refunds ranks a save holds beyond what its Beweise open', () => {
    const potenz = upgrade('potenz');
    const tangente = upgrade('tangente');
    const s = sanitize({
      version: SAVE_VERSION,
      ranks: { potenz: 12, tangente: 2 },
      proofs: ['grenzwert'],
    });
    expect(s.ranks).toEqual({ potenz: potenz.ranks[1] });
    expect(s.splitter).toBe(
      spentOn(potenz, 12) - spentOn(potenz, potenz.ranks[1]) + spentOn(tangente, 2),
    );
    // Absurd stored ranks stay cheap to sanitize.
    const big = sanitize({ version: SAVE_VERSION, ranks: { potenz: 1e12 } });
    expect(big.ranks).toEqual({ potenz: potenz.ranks[0] });
  });

  it('adds cube upgrades (Kombinatorik) and start weapon levels (Induktion)', () => {
    const s = freshSave();
    s.proofs.push('ueberstufe', 'hundert');
    s.ranks = { kombinatorik: 1, induktion: 1 };
    const choice = { seed: 1, character: 'delta' as const, complexity: 0, endless: false };
    const w = new RunSession(runConfig(s, choice)).world;
    const slot = w.player.weapons[0]!;
    expect(slot.level).toBe(2);
    expect(w.run.maxWeaponLevel).toBe(2);
    openCube(w, 'upgrade');
    // Only the start weapon to upgrade: every roll lands on it.
    expect(slot.level).toBe(2 + DRAFT.upgradeCubeRolls + 1);

    // Induktion stops at the core level.
    const cfg = runConfig(s, choice);
    const far = new RunSession({ ...cfg, metaMods: [{ stat: 'startLevel', value: 40 }] }).world;
    expect(far.player.weapons[0]!.level).toBe(8);
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
    expect(proofMet(byId('wiederkehr'), summary({ bossKilled: true, bossKills: 1 }))).toBe(false);
    expect(proofMet(byId('wiederkehr'), summary({ bossKilled: true, bossKills: 2 }))).toBe(true);
    const k = (complexity: number, bossKilled = true) => summary({ bossKilled, complexity });
    expect(proofMet(byId('kritischerPunkt'), k(4))).toBe(false);
    expect(proofMet(byId('kritischerPunkt'), k(6))).toBe(true);
    expect(proofMet(byId('kritischerPunkt'), k(6, false))).toBe(false);
    expect(proofMet(byId('formvollendet'), k(20))).toBe(true);
    expect(proofMet(byId('hundert'), summary({ level: 99 }))).toBe(false);
    expect(proofMet(byId('hundert'), summary({ level: 100 }))).toBe(true);
    expect(proofMet(byId('ueberstufe'), summary({ maxWeaponLevel: 25 }))).toBe(true);
    expect(proofMet(byId('grenzwert'), summary({ time: 1799 }))).toBe(false);

    const stats = freshSave().stats;
    stats.bestKills = 1500;
    expect(proofProgress(byId('tausendPunkte'), stats)).toEqual({ value: 1000, target: 1000 });
    expect(proofProgress(byId('teileUndHerrsche'), stats)).toEqual({ value: 0, target: 1 });
    expect(proofProgress(byId('kritischerPunkt'), stats)).toEqual({ value: 0, target: 5 });
    stats.bestComplexity = 7;
    stats.bestBossKills = 1;
    stats.bestWeaponLevel = 30;
    expect(proofProgress(byId('kritischerPunkt'), stats)).toEqual({ value: 5, target: 5 });
    expect(proofProgress(byId('konvergenz'), stats)).toEqual({ value: 7, target: 10 });
    expect(proofProgress(byId('wiederkehr'), stats)).toEqual({ value: 1, target: 2 });
    expect(proofProgress(byId('ueberstufe'), stats)).toEqual({ value: 25, target: 25 });
  });
});

describe('run end', () => {
  it('pays collected Splitter plus time and kill bonus, times Gier and complexity', () => {
    const r = runReward(
      summary({ splitter: 10, time: 330, kills: 250, greed: 1.2, complexity: 2 }),
    );
    expect(r.time).toBe(15);
    expect(r.kills).toBe(2);
    expect(r.multiplier).toBeCloseTo(1.2 * complexitySplitter(2));
    expect(r.total).toBe(Math.round(27 * 1.2 * complexitySplitter(2)));
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
