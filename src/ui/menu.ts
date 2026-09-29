import type { Action } from '../app/input.ts';
import { SILENT, type UiSound } from './nav.ts';

/**
 * Keyboard/gamepad focus over a row or column of buttons. The focused button carries the
 * `focused` class; the mouse moves the focus too, so all three devices share one highlight.
 */
export class MenuNav {
  sound: UiSound = SILENT;
  private buttons: HTMLButtonElement[] = [];
  private index = 0;

  set(buttons: HTMLButtonElement[], focus = 0): void {
    this.buttons = buttons;
    for (const [i, b] of buttons.entries()) {
      b.onmouseenter = () => {
        this.focus(i, true, false);
      };
    }
    // Opening a panel keeps it at the top, even when the focused button sits further down.
    this.focus(focus, false, false);
  }

  /** `scroll`: keep the button on screen (keyboard and gamepad); the mouse passes false. */
  focus(i: number, audible = true, scroll = true): void {
    if (this.buttons.length === 0) return;
    const next = Math.max(0, Math.min(this.buttons.length - 1, i));
    if (audible && next !== this.index) this.sound.play('move');
    this.index = next;
    for (const [k, b] of this.buttons.entries()) b.classList.toggle('focused', k === this.index);
    // Tall panels scroll: keep the focused button on screen.
    if (scroll) this.buttons[this.index]?.scrollIntoView({ block: 'nearest' });
  }

  /** Handles navigation and confirm; returns true when the action was consumed. */
  handle(action: Action): boolean {
    const n = this.buttons.length;
    if (n === 0) return false;
    switch (action) {
      case 'left':
      case 'up':
        this.focus(this.nextEnabled(-1));
        return true;
      case 'right':
      case 'down':
        this.focus(this.nextEnabled(1));
        return true;
      case 'confirm': {
        const b = this.buttons[this.index];
        if (b && !b.disabled) b.click();
        return true;
      }
      default:
        return false;
    }
  }

  private nextEnabled(dir: number): number {
    const n = this.buttons.length;
    for (let step = 1; step <= n; step++) {
      const i = (this.index + dir * step + n * step) % n;
      if (!this.buttons[i]?.disabled) return i;
    }
    return this.index;
  }
}
