import type { Action } from '../../app/input.ts';
import type { MetaStore } from '../../app/meta.ts';
import type { Settings } from '../../app/settings.ts';
import type { RunChoice } from '../../meta/progression.ts';
import { h, show } from '../dom.ts';
import type { UiSound } from '../nav.ts';
import { CodexScreen } from './codex.ts';
import { ProofsScreen } from './proofs.ts';
import type { Screen, ScreenHost, ScreenId } from './screen.ts';
import { SelectScreen } from './select.ts';
import { SettingsScreen } from './settings.ts';
import { ShopScreen } from './shop.ts';
import { TitleScreen } from './title.ts';

export interface MenuHooks {
  startRun(choice: Omit<RunChoice, 'seed'>): void;
  settingsChanged(): void;
  /** Back on the first screen of the stack (e.g. settings opened from the pause menu). */
  exit(): void;
}

/**
 * The menu sheets and the way between them: a stack of screens, so "Zurück" always returns to
 * where the player came from. Owns no game state; the app reacts through the hooks.
 */
export class Menus implements ScreenHost {
  readonly root: HTMLElement;
  readonly meta: MetaStore;
  readonly settings: Settings;
  readonly sound: UiSound;
  private readonly hooks: MenuHooks;
  private readonly screens: Record<ScreenId, Screen>;
  private readonly settingsScreen: SettingsScreen;
  private stack: ScreenId[] = [];

  constructor(
    parent: HTMLElement,
    meta: MetaStore,
    settings: Settings,
    sound: UiSound,
    hooks: MenuHooks,
  ) {
    this.meta = meta;
    this.settings = settings;
    this.sound = sound;
    this.hooks = hooks;
    this.root = h('div', 'menus hidden');
    parent.append(this.root);
    this.settingsScreen = new SettingsScreen(this.root, this);
    this.screens = {
      title: new TitleScreen(this.root, this),
      select: new SelectScreen(this.root, this),
      shop: new ShopScreen(this.root, this),
      proofs: new ProofsScreen(this.root, this),
      codex: new CodexScreen(this.root, this),
      settings: this.settingsScreen,
    };
  }

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  get current(): ScreenId | null {
    return this.stack.at(-1) ?? null;
  }

  /** Opens `id` as the only screen; `inRun` marks the settings sheet opened from the pause. */
  show(id: ScreenId, inRun = false): void {
    this.closeCurrent();
    this.stack = [id];
    this.settingsScreen.inRun = inRun;
    show(this.root, true);
    this.root.classList.toggle('in-run', inRun);
    this.openCurrent();
  }

  hide(): void {
    this.closeCurrent();
    this.stack = [];
    show(this.root, false);
  }

  go(id: ScreenId): void {
    this.sound.play('open');
    this.closeCurrent();
    this.stack.push(id);
    this.openCurrent();
  }

  back(): void {
    if (this.stack.length <= 1) {
      this.hooks.exit();
      return;
    }
    this.sound.play('back');
    this.closeCurrent();
    this.stack.pop();
    this.openCurrent();
  }

  handle(action: Action): void {
    const id = this.current;
    if (id) this.screens[id].handle(action);
  }

  startRun(choice: Omit<RunChoice, 'seed'>): void {
    this.sound.play('confirm');
    this.hooks.startRun(choice);
  }

  settingsChanged(): void {
    this.hooks.settingsChanged();
  }

  private openCurrent(): void {
    const id = this.current;
    if (!id) return;
    // The title leaves the right half open for the attract run; other sheets dim it.
    this.root.classList.toggle('dim', id !== 'title');
    this.screens[id].open();
  }

  private closeCurrent(): void {
    const id = this.current;
    if (id) this.screens[id].close();
  }
}
