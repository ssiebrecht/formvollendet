import type { Action } from '../app/input.ts';

/** Feedback cues the menus ask the audio layer for. */
export type UiCue = 'move' | 'confirm' | 'back' | 'buy' | 'deny' | 'toggle' | 'open';

export interface UiSound {
  play(cue: UiCue): void;
}

export const SILENT: UiSound = { play: () => undefined };

const DIRS = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
} as const;

type Dir = keyof typeof DIRS;

function isDir(a: Action): a is Dir {
  return a === 'left' || a === 'right' || a === 'up' || a === 'down';
}

/**
 * Focus for menus of any layout. Arrow keys, D-pad and stick move to the nearest item in that
 * direction on screen; the mouse moves the focus too, so every device shares one highlight (the
 * `focused` class). Sliders and steppers can claim left/right through `onAdjust`.
 */
export class SpatialNav {
  onFocus: ((el: HTMLElement, index: number) => void) | null = null;
  /** Returns true when the focused item consumed a left/right press. */
  onAdjust: ((el: HTMLElement, dir: -1 | 1) => boolean) | null = null;
  sound: UiSound = SILENT;

  private items: HTMLElement[] = [];
  private index = -1;

  set(items: HTMLElement[], focus = 0): void {
    for (const el of this.items) el.classList.remove('focused');
    this.items = items;
    this.index = -1;
    for (const [i, el] of items.entries()) {
      // The mouse only moves the highlight; scrolling under the pointer would feel like a jump.
      el.onmouseenter = () => {
        if (i !== this.index) this.focus(i, true, false);
      };
    }
    this.focus(focus, false);
  }

  get current(): HTMLElement | null {
    return this.items[this.index] ?? null;
  }

  get currentIndex(): number {
    return this.index;
  }

  /** `scroll`: keep the item on screen (keyboard and gamepad); the mouse passes false. */
  focus(i: number, audible = true, scroll = true): void {
    if (this.items.length === 0) return;
    const next = Math.max(0, Math.min(this.items.length - 1, i));
    if (next === this.index) return;
    this.current?.classList.remove('focused');
    this.index = next;
    const el = this.items[next]!;
    el.classList.add('focused');
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (audible) this.sound.play('move');
    this.onFocus?.(el, next);
  }

  focusElement(el: HTMLElement, audible = true): void {
    const i = this.items.indexOf(el);
    if (i >= 0) this.focus(i, audible);
  }

  /** Navigation and confirm; returns true when the action was used. */
  handle(action: Action): boolean {
    const cur = this.current;
    if (!cur) return false;
    if (action === 'confirm') {
      cur.click();
      return true;
    }
    if (!isDir(action)) return false;
    if (
      (action === 'left' || action === 'right') &&
      this.onAdjust?.(cur, action === 'left' ? -1 : 1)
    )
      return true;
    const target = this.nearest(cur, action);
    if (target >= 0) this.focus(target);
    return true;
  }

  /** Nearest item whose centre lies in direction `dir`; off-axis distance counts double. */
  private nearest(from: HTMLElement, dir: Dir): number {
    const [dx, dy] = DIRS[dir];
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = -1;
    let bestScore = Infinity;
    for (const [i, el] of this.items.entries()) {
      if (i === this.index || el.classList.contains('hidden')) continue;
      if (el instanceof HTMLButtonElement && el.disabled) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const vx = b.left + b.width / 2 - ax;
      const vy = b.top + b.height / 2 - ay;
      const along = vx * dx + vy * dy;
      if (along <= 2) continue;
      const across = Math.abs(vx * dy - vy * dx);
      // Items that overlap the current one on the cross axis (same row/column) win clearly.
      const overlap =
        dx !== 0 ? b.bottom > a.top && b.top < a.bottom : b.right > a.left && b.left < a.right;
      const score = along + across * (overlap ? 0.5 : 2.5);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }
}
