import {
  type LoadStatus,
  type SaveData,
  type StorageLike,
  freshSave,
  loadSave,
  writeSave,
} from '../meta/save.ts';

/** In-memory storage: private mode without localStorage, and tests. */
export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** localStorage when the browser allows it, otherwise memory (progress lasts for the tab). */
export function browserStorage(): StorageLike {
  try {
    const probe = '__formvollendet_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return new MemoryStorage();
  }
}

/**
 * The meta save for this session. Debug sessions play on a copy that is never written back, so
 * cheated runs cannot leak into real progress.
 */
export class MetaStore {
  save: SaveData;
  readonly status: LoadStatus;
  readonly persistent: boolean;
  private readonly storage: StorageLike;

  constructor(storage: StorageLike, persistent: boolean) {
    this.storage = storage;
    this.persistent = persistent;
    const r = loadSave(storage);
    this.save = r.save;
    this.status = r.status;
  }

  commit(): void {
    if (this.persistent) writeSave(this.storage, this.save);
  }

  /** Settings → "Spielstand löschen". */
  reset(): void {
    this.save = freshSave();
    this.commit();
  }
}
