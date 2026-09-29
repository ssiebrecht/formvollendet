import { hex } from '../content/palette.ts';
import { S } from '../content/strings.de.ts';
import type { Action } from '../app/input.ts';
import type { RunSession } from '../sim/run.ts';
import { buildSvg } from './buildView.ts';
import { cardLook } from './cardText.ts';
import { h, shapeIcon, show } from './dom.ts';
import { SILENT, type UiSound } from './nav.ts';

/** Ignore input briefly after the cards appear so a held key or a double press never picks blindly. */
const INPUT_LOCK_MS = 350;

/**
 * Level-up draft: 3–4 cards, plus "Neu zeichnen" (reroll), "Radieren" (banish) and
 * "Überspringen" (skip) with their remaining charges. Keyboard 1–4 / arrows + Enter, gamepad
 * D-pad + A, or the mouse.
 */
export class DraftView {
  readonly root: HTMLElement;
  /** Called after every action that changed the session. */
  onChanged: () => void = () => undefined;

  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly row: HTMLElement;
  private readonly build: HTMLElement;
  private readonly rerollBtn: HTMLButtonElement;
  private readonly banishBtn: HTMLButtonElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly sound: UiSound;
  private session: RunSession | null = null;
  private selected = 0;
  private banishMode = false;
  private lockUntil = 0;

  constructor(parent: HTMLElement, sound: UiSound = SILENT) {
    this.sound = sound;
    this.title = h('div', 'draft-title');
    this.subtitle = h('div', 'draft-subtitle');
    this.row = h('div', 'draft-cards');
    this.build = h('div', 'draft-build');
    this.rerollBtn = h('button', 'btn');
    this.banishBtn = h('button', 'btn');
    this.skipBtn = h('button', 'btn');
    // Always laid out; `.draft.banishing` makes it visible, so the panel never changes height.
    this.hint = h('div', 'draft-hint', S.draft.banishMode);
    this.rerollBtn.addEventListener('click', () => {
      this.act('reroll');
    });
    this.banishBtn.addEventListener('click', () => {
      this.act('banish');
    });
    this.skipBtn.addEventListener('click', () => {
      this.act('skip');
    });
    this.root = h(
      'div',
      'modal draft hidden',
      h(
        'div',
        'draft-panel',
        h('div', 'draft-head', this.build, h('div', 'draft-heading', this.title, this.subtitle)),
        this.row,
        this.hint,
        h('div', 'draft-actions', this.rerollBtn, this.banishBtn, this.skipBtn),
      ),
    );
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  /** "Radieren" is waiting for a card; Esc cancels it instead of pausing. */
  get banishing(): boolean {
    return this.banishMode;
  }

  /** `resume`: back from the pause, the same cards keep their selection. */
  open(session: RunSession, resume = false): void {
    this.session = session;
    if (!resume) this.selected = 0;
    this.banishMode = false;
    this.lockUntil = performance.now() + INPUT_LOCK_MS;
    show(this.root, true);
    this.render();
  }

  close(): void {
    this.session = null;
    show(this.root, false);
  }

  /** Redraws after the session changed (next pending draft, reroll). */
  refresh(): void {
    if (this.session) this.render();
  }

  private locked(): boolean {
    return performance.now() < this.lockUntil;
  }

  private render(): void {
    const s = this.session;
    if (!s) return;
    const w = s.world;
    const p = w.player;
    this.title.textContent = S.draft.title(p.level - p.pendingLevels + 1);
    this.subtitle.textContent =
      p.pendingLevels > 1 ? S.draft.pending(p.pendingLevels - 1) : S.draft.subtitle;
    this.build.replaceChildren(buildSvg(p, 96));
    if (this.selected >= s.cards.length) this.selected = 0;

    this.row.replaceChildren(
      ...s.cards.map((card, i) => {
        const look = cardLook(card);
        // The face lifts when selected; the card itself (the hit area) stays where it is.
        const el = h(
          'div',
          `card${look.gold ? ' gold' : ''}${i === this.selected ? ' selected' : ''}`,
          h(
            'div',
            'card-face',
            h('div', 'card-key', String(i + 1)),
            h('div', 'card-tag', look.tag),
            h('div', 'card-icon', shapeIcon(look.icon, look.color, 56)),
            h('div', 'card-name', look.name),
            // A blank badge keeps its line, so every description starts at the same height.
            h('div', look.badge ? 'card-badge' : 'card-badge blank', look.badge),
            h('div', 'card-desc', look.desc),
            look.note ? h('div', 'card-note', look.note) : null,
          ),
        );
        el.style.setProperty('--card-color', hex(look.color));
        el.addEventListener('mouseenter', () => {
          this.select(i);
        });
        el.addEventListener('click', () => {
          this.pick(i);
        });
        return el;
      }),
    );
    this.updateActions();
  }

  /** Action buttons and the banish state. Touches no card, so nothing on the table moves. */
  private updateActions(): void {
    const s = this.session;
    if (!s) return;
    const w = s.world;
    this.rerollBtn.textContent = `${S.draft.reroll} [R] ×${w.rerolls}`;
    this.rerollBtn.disabled = !s.canReroll();
    this.banishBtn.textContent = this.banishMode
      ? `${S.draft.cancel} [B]`
      : `${S.draft.banish} [B] ×${w.banishes}`;
    this.banishBtn.disabled = !this.banishMode && w.banishes <= 0;
    this.skipBtn.textContent = `${S.draft.skip} [S] ×${w.skips}`;
    this.skipBtn.disabled = !s.canSkip();
    // Actions appear once the Reißbrett granted them for the run, even when spent.
    show(this.rerollBtn, w.stats.reroll > 0);
    show(this.banishBtn, w.stats.banish > 0);
    show(this.skipBtn, w.stats.skip > 0);
    this.root.classList.toggle('banishing', this.banishMode);
  }

  private select(i: number, audible = true): void {
    if (!this.session || i === this.selected) return;
    if (audible) this.sound.play('move');
    this.selected = i;
    const cards = this.row.children;
    for (let k = 0; k < cards.length; k++) cards[k]!.classList.toggle('selected', k === i);
  }

  private pick(i: number): void {
    const s = this.session;
    if (!s || this.locked()) return;
    if (this.banishMode) {
      if (!s.canBanish(i)) {
        this.sound.play('deny');
        return;
      }
      s.banish(i);
      this.banishMode = false;
      this.sound.play('back');
    } else {
      if (!s.choose(i)) {
        this.sound.play('deny');
        return;
      }
      this.sound.play('confirm');
    }
    this.lockUntil = performance.now() + INPUT_LOCK_MS * 0.6;
    this.onChanged();
    this.refresh();
  }

  private act(kind: 'reroll' | 'banish' | 'skip'): void {
    const s = this.session;
    if (!s || this.locked()) return;
    if (kind === 'banish') {
      if (!this.banishMode && s.world.banishes <= 0) {
        this.sound.play('deny');
        return;
      }
      this.banishMode = !this.banishMode;
      this.sound.play('toggle');
      this.updateActions();
      return;
    }
    if (!(kind === 'reroll' ? s.reroll() : s.skip())) {
      this.sound.play('deny');
      return;
    }
    this.sound.play(kind === 'reroll' ? 'open' : 'back');
    this.lockUntil = performance.now() + INPUT_LOCK_MS * 0.6;
    this.onChanged();
    this.refresh();
  }

  handle(action: Action): void {
    const s = this.session;
    if (!s) return;
    const n = s.cards.length;
    switch (action) {
      case 'left':
      case 'up':
        this.select((this.selected + n - 1) % n);
        break;
      case 'right':
      case 'down':
        this.select((this.selected + 1) % n);
        break;
      case 'confirm':
        this.pick(this.selected);
        break;
      case 'card0':
      case 'card1':
      case 'card2':
      case 'card3': {
        const i = Number(action.slice(4));
        if (i < n) {
          this.select(i, false);
          this.pick(i);
        }
        break;
      }
      case 'reroll':
        this.act('reroll');
        break;
      case 'banish':
        this.act('banish');
        break;
      case 'skip':
        this.act('skip');
        break;
      case 'back':
        if (this.banishMode) {
          this.banishMode = false;
          this.sound.play('toggle');
          this.updateActions();
        }
        break;
      default:
        break;
    }
  }
}
