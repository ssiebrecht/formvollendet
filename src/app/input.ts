import type { InputState } from '../sim/run.ts';

/** Edge-triggered UI actions; one key may produce several (S = down in menus, skip in the draft). */
export type Action =
  | 'pause'
  | 'back'
  | 'confirm'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'card0'
  | 'card1'
  | 'card2'
  | 'card3'
  | 'reroll'
  | 'banish'
  | 'skip'
  | 'debug1'
  | 'debug2'
  | 'debug3'
  | 'debug4'
  | 'debug5'
  | 'debug6'
  | 'debug7';

export type Device = 'keyboard' | 'gamepad';

const KEY_ACTIONS: Readonly<Record<string, readonly Action[]>> = {
  Escape: ['back'],
  KeyP: ['pause'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  Space: ['confirm'],
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down', 'skip'],
  Digit1: ['card0'],
  Digit2: ['card1'],
  Digit3: ['card2'],
  Digit4: ['card3'],
  Numpad1: ['card0'],
  Numpad2: ['card1'],
  Numpad3: ['card2'],
  Numpad4: ['card3'],
  KeyR: ['reroll'],
  KeyB: ['banish'],
  F1: ['debug1'],
  F2: ['debug2'],
  F3: ['debug3'],
  F4: ['debug4'],
  F5: ['debug5'],
  F6: ['debug6'],
  F7: ['debug7'],
};

const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const ABILITY_KEYS = ['Space'];

// Standard gamepad mapping.
const PAD_A = 0;
const PAD_B = 1;
const PAD_X = 2;
const PAD_Y = 3;
const PAD_RB = 5;
const PAD_BACK = 8;
const PAD_START = 9;
const PAD_UP = 12;
const PAD_DOWN = 13;
const PAD_LEFT = 14;
const PAD_RIGHT = 15;
const PAD_ACTIONS: readonly [number, Action][] = [
  [PAD_A, 'confirm'],
  [PAD_B, 'back'],
  [PAD_X, 'reroll'],
  [PAD_Y, 'skip'],
  [PAD_RB, 'banish'],
  [PAD_BACK, 'pause'],
  [PAD_START, 'pause'],
  [PAD_UP, 'up'],
  [PAD_DOWN, 'down'],
  [PAD_LEFT, 'left'],
  [PAD_RIGHT, 'right'],
];
const DEADZONE = 0.2;
const NAV_ON = 0.6;
const NAV_OFF = 0.3;

/**
 * Keyboard + gamepad → movement vector, ability flag and a queue of UI actions. Movement is
 * polled once per frame; the ability is latched so a tap between two sim ticks is never lost.
 */
export class Input {
  readonly state: InputState = { moveX: 0, moveY: 0, ability: false };
  device: Device = 'keyboard';
  /** F-keys are only captured in debug mode; otherwise the browser keeps them. */
  debugKeys = false;
  /** Window blur, hidden tab or a disconnected gamepad: the run should pause. */
  onFocusLost: (() => void) | null = null;

  private readonly held = new Set<string>();
  /** Held keys that must be released before they count again (e.g. Space that closed a menu). */
  private readonly consumed = new Set<string>();
  private actions: Action[] = [];
  private abilityLatch = false;
  private padPrev: boolean[] = [];
  private padAbilityConsumed = false;
  private padAbilityHeld = false;
  private navX = 0;
  private navY = 0;

  attach(): void {
    window.addEventListener('keydown', (e) => {
      this.keyDown(e);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.consumed.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.focusLost();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.focusLost();
    });
    // A pad that was steering pauses the run when it drops out; stale button state goes with it.
    window.addEventListener('gamepaddisconnected', () => {
      this.padPrev = [];
      this.padAbilityHeld = false;
      if (this.device !== 'gamepad') return;
      this.device = 'keyboard';
      this.focusLost();
    });
  }

  private focusLost(): void {
    this.held.clear();
    this.consumed.clear();
    this.onFocusLost?.();
  }

  private keyDown(e: KeyboardEvent): void {
    if (/^F\d+$/.test(e.code)) {
      if (!this.debugKeys) return;
      e.preventDefault();
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Keep the page from scrolling on Space/arrows.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    this.device = 'keyboard';
    this.held.add(e.code);
    if (e.repeat) return;
    if (ABILITY_KEYS.includes(e.code)) this.abilityLatch = true;
    const acts = KEY_ACTIONS[e.code];
    if (acts) this.actions.push(...acts);
  }

  private isHeld(codes: readonly string[]): boolean {
    for (const c of codes) if (this.held.has(c) && !this.consumed.has(c)) return true;
    return false;
  }

  /** Once per frame: reads the gamepad and rebuilds the movement vector. */
  poll(): void {
    let mx = (this.isHeld(RIGHT) ? 1 : 0) - (this.isHeld(LEFT) ? 1 : 0);
    let my = (this.isHeld(DOWN) ? 1 : 0) - (this.isHeld(UP) ? 1 : 0);
    const kl = Math.hypot(mx, my);
    if (kl > 1) {
      mx /= kl;
      my /= kl;
    }
    this.padAbilityHeld = false;
    const pad = this.firstPad();
    if (pad) {
      const b = pad.buttons;
      const now: boolean[] = [];
      for (let i = 0; i < b.length; i++) now[i] = b[i]?.pressed ?? false;
      let used = false;
      for (const [i, act] of PAD_ACTIONS) {
        if (now[i] && !this.padPrev[i]) {
          this.actions.push(act);
          used = true;
        }
      }
      if (now[PAD_A] && !this.padPrev[PAD_A]) this.abilityLatch = true;
      if (!now[PAD_A]) this.padAbilityConsumed = false;
      this.padAbilityHeld = !!now[PAD_A] && !this.padAbilityConsumed;
      this.padPrev = now;

      let ax = pad.axes[0] ?? 0;
      let ay = pad.axes[1] ?? 0;
      const len = Math.hypot(ax, ay);
      if (len < DEADZONE) {
        ax = 0;
        ay = 0;
      } else {
        // Radial deadzone rescaled to 0..1 so small tilts still give fine control.
        const k = Math.min(1, (len - DEADZONE) / (1 - DEADZONE - 0.05)) / len;
        ax *= k;
        ay *= k;
        used = true;
      }
      if (now[PAD_LEFT]) ax = -1;
      if (now[PAD_RIGHT]) ax = 1;
      if (now[PAD_UP]) ay = -1;
      if (now[PAD_DOWN]) ay = 1;
      if (ax !== 0 || ay !== 0) {
        mx = ax;
        my = ay;
        const l = Math.hypot(mx, my);
        if (l > 1) {
          mx /= l;
          my /= l;
        }
      }
      this.stickNav(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      if (used) this.device = 'gamepad';
    }
    this.state.moveX = mx;
    this.state.moveY = my;
  }

  /** Stick flicks become menu navigation with hysteresis. */
  private stickNav(ax: number, ay: number): void {
    if (this.navX === 0 && Math.abs(ax) > NAV_ON) {
      this.navX = Math.sign(ax);
      this.actions.push(ax > 0 ? 'right' : 'left');
    } else if (Math.abs(ax) < NAV_OFF) this.navX = 0;
    if (this.navY === 0 && Math.abs(ay) > NAV_ON) {
      this.navY = Math.sign(ay);
      this.actions.push(ay > 0 ? 'down' : 'up');
    } else if (Math.abs(ay) < NAV_OFF) this.navY = 0;
  }

  private firstPad(): Gamepad | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const p of pads) if (p?.connected) return p;
    return null;
  }

  /** Input for the next sim step. Holding the skill key casts whenever it is ready. */
  sample(): InputState {
    this.state.ability = this.abilityLatch || this.isHeld(ABILITY_KEYS) || this.padAbilityHeld;
    this.abilityLatch = false;
    return this.state;
  }

  takeActions(): Action[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  /** After a menu closes: the key/button that closed it must not also fire the skill. */
  suppressAbility(): void {
    this.abilityLatch = false;
    for (const c of ABILITY_KEYS) if (this.held.has(c)) this.consumed.add(c);
    if (this.padPrev[PAD_A]) this.padAbilityConsumed = true;
    this.padAbilityHeld = false;
  }
}
