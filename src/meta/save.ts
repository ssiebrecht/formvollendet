import { AXIOMS } from '../content/axioms.ts';
import { CHARACTERS } from '../content/characters.ts';
import { ENEMIES } from '../content/enemies.ts';
import { META_UPGRADES, PROOFS } from '../content/meta.ts';
import { COMPLEXITY } from '../content/tuning.ts';
import type { CharacterId } from '../content/types.ts';
import { WEAPONS } from '../content/weapons.ts';
import { maxComplexity, maxRankOf, spentOn } from './progression.ts';

/** Minimal key-value store: localStorage in the browser, a Map in tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'formvollendet.save';
/** A save that could not be read is parked here before a fresh one replaces it. */
export const BACKUP_KEY = 'formvollendet.save.unreadable';
export const SAVE_VERSION = 1;

export interface LifetimeStats {
  runs: number;
  wins: number;
  kills: number;
  /** Longest run in seconds. */
  bestTime: number;
  bestKills: number;
  bestLevel: number;
  bestVertices: number;
  /** Most theorems in a single run. */
  bestTheorems: number;
  theorems: number;
  bossKills: number;
  /** Most Sierpinski wins in a single (endless) run. */
  bestBossKills: number;
  /** Highest weapon or theorem level in a run. */
  bestWeaponLevel: number;
  /** Highest complexity level Sierpinski fell on; −1 before his first defeat. */
  bestComplexity: number;
  splitterEarned: number;
}

export interface SaveData {
  version: number;
  splitter: number;
  /** Reißbrett rank per upgrade id. */
  ranks: Record<string, number>;
  /** Proven Beweise (proof ids, in the order they were proven). */
  proofs: string[];
  /** Kompendium: every weapon (theorems included), axiom and enemy ever met. */
  seen: { weapons: string[]; axioms: string[]; enemies: string[] };
  stats: LifetimeStats;
  /** Last choices on the Formwahl screen. */
  last: { character: CharacterId; complexity: number; endless: boolean };
}

/** new: nothing stored · ok · migrated from an older version · recovered: unreadable, backed up. */
export type LoadStatus = 'new' | 'ok' | 'migrated' | 'recovered';

export interface LoadResult {
  save: SaveData;
  status: LoadStatus;
}

type Raw = Record<string, unknown>;
/** Upgrades raw save data from version n to n + 1. */
export type Migration = (data: Raw) => Raw;

/** Keyed by the version they upgrade from. Version 1 is the first released format. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

const STAT_KEYS = [
  'runs',
  'wins',
  'kills',
  'bestTime',
  'bestKills',
  'bestLevel',
  'bestVertices',
  'bestTheorems',
  'theorems',
  'bossKills',
  'bestBossKills',
  'bestWeaponLevel',
  'splitterEarned',
] as const satisfies readonly (keyof LifetimeStats)[];

export function freshSave(): SaveData {
  const stats = {} as LifetimeStats;
  for (const k of STAT_KEYS) stats[k] = 0;
  stats.bestComplexity = -1;
  return {
    version: SAVE_VERSION,
    splitter: 0,
    ranks: {},
    proofs: [],
    seen: { weapons: [], axioms: [], enemies: [] },
    stats,
    last: { character: 'delta', complexity: 0, endless: false },
  };
}

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Stored ranks above this are treated as this (keeps the refund loop short on broken data). */
const RANK_LIMIT = 100;

/** A complexity level, or −1 for none. */
function levelOrNone(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return -1;
  return Math.max(-1, Math.min(COMPLEXITY.max, Math.floor(v)));
}

/** Known ids only, each once, in stored order. */
function idList(v: unknown, known: (id: string) => boolean): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const id of v) if (typeof id === 'string' && known(id) && !out.includes(id)) out.push(id);
  return out;
}

/**
 * Runs the migration chain up to `target`. Returns null when there is no path: an unknown
 * version, or a save written by a newer build.
 */
export function migrate(data: Raw, migrations = MIGRATIONS, target = SAVE_VERSION): Raw | null {
  let version = typeof data.version === 'number' ? data.version : 0;
  let d = data;
  while (version < target) {
    const step = migrations[version];
    if (!step) return null;
    d = step(d);
    version++;
    d.version = version;
  }
  return version === target ? d : null;
}

/**
 * Turns migrated data into a valid save: wrong types fall back to defaults, unknown ids are
 * dropped, ranks the proven Beweise do not open (or above a lowered max rank) are refunded.
 */
export function sanitize(d: Raw): SaveData {
  const s = freshSave();
  s.splitter = Math.floor(count(d.splitter));
  // Beweise first: they decide which entries and Erweiterungen are open.
  s.proofs = idList(d.proofs, (id) => PROOFS.some((p) => p.id === id));

  const ranks = isRecord(d.ranks) ? d.ranks : {};
  for (const def of META_UPGRADES) {
    const stored = Math.min(RANK_LIMIT, Math.floor(count(ranks[def.id])));
    const rank = Math.min(stored, maxRankOf(s, def));
    if (rank > 0) s.ranks[def.id] = rank;
    if (stored > rank) s.splitter += spentOn(def, stored) - spentOn(def, rank);
  }

  const seen = isRecord(d.seen) ? d.seen : {};
  s.seen.weapons = idList(seen.weapons, (id) => Object.hasOwn(WEAPONS, id));
  s.seen.axioms = idList(seen.axioms, (id) => Object.hasOwn(AXIOMS, id));
  s.seen.enemies = idList(seen.enemies, (id) => Object.hasOwn(ENEMIES, id));

  const stats = isRecord(d.stats) ? d.stats : {};
  for (const k of STAT_KEYS) s.stats[k] = count(stats[k]);
  s.stats.bestComplexity = levelOrNone(stats.bestComplexity);

  const last = isRecord(d.last) ? d.last : {};
  const ch = last.character;
  if (typeof ch === 'string' && Object.hasOwn(CHARACTERS, ch)) {
    s.last.character = ch as CharacterId;
  }
  s.last.complexity = Math.min(maxComplexity(s), Math.floor(count(last.complexity)));
  s.last.endless = last.endless === true;
  return s;
}

function backup(storage: StorageLike, raw: string): void {
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // Nothing more to do: the fresh save still works.
  }
}

/** Reads the save. Never throws; an unreadable save is backed up and replaced by a fresh one. */
export function loadSave(storage: StorageLike): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { save: freshSave(), status: 'new' };
  }
  if (raw === null) return { save: freshSave(), status: 'new' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const migrated = isRecord(parsed) ? migrate(parsed) : null;
  if (!isRecord(parsed) || !migrated) {
    backup(storage, raw);
    return { save: freshSave(), status: 'recovered' };
  }
  const status = parsed.version === SAVE_VERSION ? 'ok' : 'migrated';
  return { save: sanitize(migrated), status };
}

/** Writes the save; false when the storage refused (quota, private mode). */
export function writeSave(storage: StorageLike, save: SaveData): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
