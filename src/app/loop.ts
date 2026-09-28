/** Longest frame the game will simulate; after a stall the world slows down instead of jumping. */
const MAX_FRAME = 0.1;

/**
 * requestAnimationFrame driver. `frame` receives real seconds since the last frame (clamped) and
 * decides itself how many fixed sim steps to run.
 */
export class Loop {
  private last = 0;
  private handle = 0;
  private running = false;
  private readonly frame: (dt: number, now: number) => void;

  constructor(frame: (dt: number, now: number) => void) {
    this.frame = frame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(MAX_FRAME, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frame(dt, now);
    this.handle = requestAnimationFrame(this.tick);
  };
}
