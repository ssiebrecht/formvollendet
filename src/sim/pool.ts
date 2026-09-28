export interface Poolable {
  alive: boolean;
  /** Unique per spawn, so stale references (homing targets, hit lists) can be detected. */
  id: number;
}

/**
 * Fixed-capacity object pool. Alive objects sit densely in `items[0..count)`. Systems mark objects
 * dead during a tick and `compact()` swaps them out at the end, so indices stay stable within a tick
 * (the spatial hash relies on that) and nothing is allocated after construction.
 */
export class Pool<T extends Poolable> {
  readonly items: T[];
  readonly capacity: number;
  count = 0;
  private nextId = 1;

  constructor(capacity: number, factory: () => T) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, factory);
  }

  /** Returns a recycled object marked alive with a fresh id, or null when full. Caller must reset every field it uses. */
  spawn(): T | null {
    if (this.count >= this.capacity) return null;
    const item = this.items[this.count++]!;
    item.alive = true;
    item.id = this.nextId++;
    return item;
  }

  compact(): void {
    let i = 0;
    while (i < this.count) {
      const item = this.items[i]!;
      if (item.alive) {
        i++;
        continue;
      }
      const last = --this.count;
      this.items[i] = this.items[last]!;
      this.items[last] = item;
    }
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) this.items[i]!.alive = false;
    this.count = 0;
  }

  /** Number of alive objects (dead-but-not-yet-compacted ones excluded). */
  aliveCount(): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.items[i]!.alive) n++;
    return n;
  }
}
