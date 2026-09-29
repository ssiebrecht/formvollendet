import { ABILITIES, CHARACTER_LIST } from '../../content/characters.ts';
import { MUTATORS, mutatorsAt } from '../../content/mutators.ts';
import { hex } from '../../content/palette.ts';
import { S, num } from '../../content/strings.de.ts';
import {
  COMPLEXITY,
  complexityDamage,
  complexityHp,
  complexityRate,
  complexitySplitter,
} from '../../content/tuning.ts';
import type { CharacterDef, CharacterId } from '../../content/types.ts';
import { WEAPONS } from '../../content/weapons.ts';
import type { Action } from '../../app/input.ts';
import { endlessUnlocked, isCharacterUnlocked, maxComplexity } from '../../meta/progression.ts';
import { baseStats } from '../../sim/stats.ts';
import { h, replay, shapeIcon } from '../dom.ts';
import {
  Screen,
  type ScreenHost,
  backButton,
  formPortrait,
  gauge,
  proofFor,
  sheet,
  sheetFooter,
  sheetHead,
  titleBlock,
} from './screen.ts';

/** Gauge ceilings for the character values. */
const GAUGE = { hp: 120, speed: 200, crit: 0.25 } as const;
const BASE_CRIT = baseStats().crit;

function critOf(c: CharacterDef): number {
  return c.mods.reduce((sum, m) => (m.stat === 'crit' ? sum + m.value : sum), BASE_CRIT);
}

function valueRow(label: string, value: string, fraction: number): HTMLElement {
  return h(
    'div',
    'fc-value',
    h('span', 'fc-key', label),
    gauge(fraction),
    h('span', 'fc-num', value),
  );
}

function infoRow(label: string, ...content: (Node | string)[]): HTMLElement {
  return h('div', 'fc-row', h('span', 'fc-key', label), h('div', 'fc-row-body', ...content));
}

/**
 * Sheet 2: pick the form, the mode and the complexity. Remembers the last choice in the save so
 * "Spielen → Beweis antreten" is two presses.
 */
export class SelectScreen extends Screen {
  private char: CharacterId = 'delta';
  private endless = false;
  private complexity = 0;
  private endlessOpen = false;
  /** Highest complexity level the save has opened. */
  private maxLevel = 0;
  /** Set after pushing past the last open level: explain how to open the next one. */
  private hint = false;

  private readonly cards = new Map<CharacterId, HTMLButtonElement>();
  private readonly normalBtn: HTMLButtonElement;
  private readonly endlessBtn: HTMLButtonElement;
  private readonly endlessDesc: HTMLElement;
  private readonly stepper: HTMLElement;
  private readonly ticks: HTMLElement[] = [];
  private readonly stepValue: HTMLElement;
  private readonly descValues: HTMLElement;
  private readonly descMutators: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, host: ScreenHost) {
    super(parent, host, 'select-screen');

    for (const c of CHARACTER_LIST) {
      const card = h('button', 'form-card cad');
      card.addEventListener('click', () => {
        this.pick(c.id, false);
      });
      this.cards.set(c.id, card);
    }

    this.normalBtn = h(
      'button',
      'mode-btn cad',
      h('span', 'mode-name', S.select.normal),
      h('span', 'mode-desc', S.select.normalDesc),
    );
    this.endlessDesc = h('span', 'mode-desc');
    this.endlessBtn = h(
      'button',
      'mode-btn cad',
      h('span', 'mode-name', S.select.endless),
      this.endlessDesc,
    );
    this.normalBtn.addEventListener('click', () => {
      this.setMode(false);
    });
    this.endlessBtn.addEventListener('click', () => {
      this.setMode(true);
    });

    const dec = h('button', 'step-btn', '‹');
    const inc = h('button', 'step-btn', '›');
    dec.addEventListener('click', (e) => {
      e.stopPropagation();
      this.adjust(-1);
    });
    inc.addEventListener('click', (e) => {
      e.stopPropagation();
      this.adjust(1);
    });
    const ruler = h('span', 'k-ruler');
    for (let k = 1; k <= COMPLEXITY.max; k++) {
      const tick = h('i', k % 5 === 0 ? 'major' : null);
      tick.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setLevel(k);
      });
      this.ticks.push(tick);
      ruler.append(tick);
    }
    for (let k = 5; k <= COMPLEXITY.max; k += 5) {
      const label = h('b', null, String(k));
      label.style.gridColumn = String(k);
      ruler.append(label);
    }
    this.stepValue = h('span', 'step-value');
    this.descValues = h('span', 'step-line');
    this.descMutators = h('span', 'step-line');
    this.stepper = h(
      'div',
      'stepper cad',
      h('span', 'param-label', S.select.complexity),
      h('div', 'step-ctrl', dec, ruler, inc, this.stepValue),
      h('span', 'step-desc', this.descValues, this.descMutators),
    );
    // Confirm (or a click on the row) cycles through the open levels.
    this.stepper.addEventListener('click', () => {
      this.adjust(this.complexity >= this.maxLevel ? -this.maxLevel : 1);
    });
    this.nav.onAdjust = (el, dir) => {
      if (el !== this.stepper) return false;
      this.adjust(dir);
      return true;
    };

    this.startBtn = h('button', 'btn primary start-btn cad', S.select.start);
    this.startBtn.addEventListener('click', () => {
      this.start();
    });
    this.backBtn = backButton();
    this.backBtn.addEventListener('click', () => {
      this.host.back();
    });

    this.root.append(
      sheet(
        'select-sheet',
        sheetHead('select', S.select.title, S.select.subtitle),
        h('div', 'select-cards sheet-scroll', ...this.cards.values()),
        h(
          'div',
          'select-params',
          h(
            'div',
            'param',
            h('span', 'param-label', S.select.mode),
            h('div', 'mode-row', this.normalBtn, this.endlessBtn),
          ),
          this.stepper,
          this.startBtn,
        ),
        sheetFooter(this.backBtn, titleBlock('select', S.select.title)),
      ),
    );
  }

  override handle(action: Action): void {
    const cur = this.nav.current;
    if (action === 'confirm' && cur) {
      for (const [id, card] of this.cards) {
        if (card === cur) {
          this.pick(id, true);
          return;
        }
      }
    }
    super.handle(action);
  }

  protected render(): void {
    const save = this.host.meta.save;
    this.endlessOpen = endlessUnlocked(save);
    this.char = isCharacterUnlocked(save, save.last.character) ? save.last.character : 'delta';
    this.endless = this.endlessOpen && save.last.endless;
    this.maxLevel = maxComplexity(save);
    this.complexity = Math.min(save.last.complexity, this.maxLevel);
    this.hint = false;
    for (const [i, c] of CHARACTER_LIST.entries()) {
      this.fillCard(this.cards.get(c.id)!, c, i, isCharacterUnlocked(save, c.id));
    }
    this.endlessBtn.classList.toggle('locked', !this.endlessOpen);
    this.endlessDesc.textContent = this.endlessOpen ? S.select.endlessDesc : S.select.modeLocked;
    this.stepper.classList.toggle('locked', !this.endlessOpen);
    for (const [i, tick] of this.ticks.entries())
      tick.classList.toggle('locked', i >= this.maxLevel);
    this.refresh();
    const items = [
      ...this.cards.values(),
      this.normalBtn,
      this.endlessBtn,
      this.stepper,
      this.startBtn,
      this.backBtn,
    ];
    this.nav.set(items, items.indexOf(this.startBtn));
  }

  private fillCard(card: HTMLButtonElement, c: CharacterDef, index: number, open: boolean): void {
    card.classList.toggle('locked', !open);
    card.style.setProperty('--tone', hex(c.color));
    const fig = h('div', 'fc-fig', S.menu.figure(index + 1, c.name));
    if (!open) {
      const proof = proofFor(`char:${c.id}`);
      card.replaceChildren(
        fig,
        h(
          'div',
          'fc-body',
          h('div', 'fc-portrait', formPortrait(c, 140, true)),
          h(
            'div',
            'fc-info',
            h('div', 'fc-name', c.name),
            h('div', 'fc-role', S.select.locked),
            proof ? h('p', 'fc-desc', S.select.lockedBy(proof.name)) : null,
          ),
        ),
      );
      return;
    }
    const ability = ABILITIES[c.ability];
    const weapon = WEAPONS[c.startWeapon];
    const crit = critOf(c);
    card.replaceChildren(
      fig,
      h(
        'div',
        'fc-body',
        h('div', 'fc-portrait', formPortrait(c, 140, false)),
        h(
          'div',
          'fc-info',
          h('div', 'fc-name', c.name),
          h('div', 'fc-role', c.role),
          h('p', 'fc-desc', c.desc),
          h(
            'div',
            'fc-values',
            valueRow(S.select.hp, num(c.maxHp), c.maxHp / GAUGE.hp),
            valueRow(S.select.speed, num(c.moveSpeed), c.moveSpeed / GAUGE.speed),
            valueRow(S.select.crit, `${Math.round(crit * 100)} %`, crit / GAUGE.crit),
          ),
        ),
      ),
      h(
        'div',
        'fc-rows',
        infoRow(
          S.select.startWeapon,
          h('span', 'fc-item', shapeIcon(weapon.icon, weapon.color, 18), weapon.name),
        ),
        infoRow(
          S.select.skill,
          h(
            'span',
            'fc-item',
            h('b', null, ability.name),
            h('span', 'fc-dim', S.select.cooldown(ability.cooldown)),
          ),
          h('p', 'fc-note', ability.desc),
        ),
        infoRow(S.select.trait, h('span', 'fc-item', c.traitText)),
      ),
      h('div', 'fc-mark', S.select.selected),
    );
  }

  /** Selection state → classes and texts. */
  private refresh(): void {
    for (const [id, card] of this.cards) card.classList.toggle('selected', id === this.char);
    this.normalBtn.classList.toggle('selected', !this.endless);
    this.endlessBtn.classList.toggle('selected', this.endless);
    for (const [i, tick] of this.ticks.entries()) tick.classList.toggle('on', i < this.complexity);
    this.stepValue.textContent = S.select.level(this.complexity);
    this.fillDesc();
  }

  /** Two fixed lines: what the level does to the numbers, then its mutators or the next unlock. */
  private fillDesc(): void {
    const k = this.complexity;
    const muts = mutatorsAt(k);
    this.descMutators.title = muts.map((m) => `K ${m.level} · ${m.name}: ${m.desc}`).join('\n');
    if (!this.endlessOpen) {
      this.descValues.textContent = S.select.modeLocked;
      this.descMutators.textContent = '';
      return;
    }
    this.descValues.textContent =
      k === 0
        ? S.select.complexityNone
        : S.select.complexityDesc(
            complexityHp(k),
            complexityDamage(k),
            complexityRate(k),
            complexitySplitter(k),
          );
    const newest = muts[muts.length - 1];
    const more = this.maxLevel < COMPLEXITY.max;
    if (more && (this.hint || (!newest && k === this.maxLevel))) {
      this.descMutators.textContent = S.select.complexityLocked(this.maxLevel + 1, this.maxLevel);
    } else if (newest) {
      this.descMutators.textContent = S.select.mutators(muts.length, newest.name, newest.desc);
    } else {
      this.descMutators.textContent = S.select.mutatorsFrom(MUTATORS[0]!.level);
    }
  }

  private deny(el: HTMLElement): void {
    this.host.sound.play('deny');
    replay(el, 'denied');
  }

  private pick(id: CharacterId, moveFocus: boolean): void {
    const card = this.cards.get(id)!;
    if (card.classList.contains('locked')) {
      this.deny(card);
      return;
    }
    this.char = id;
    this.host.sound.play('confirm');
    this.refresh();
    if (moveFocus) this.nav.focusElement(this.startBtn, false);
  }

  private setMode(endless: boolean): void {
    if (endless && !this.endlessOpen) {
      this.deny(this.endlessBtn);
      return;
    }
    this.endless = endless;
    this.host.sound.play('toggle');
    this.refresh();
  }

  private adjust(dir: number): void {
    this.setLevel(this.complexity + dir);
  }

  private setLevel(level: number): void {
    if (!this.endlessOpen) {
      this.deny(this.stepper);
      return;
    }
    if (level > this.maxLevel || level < 0 || level === this.complexity) {
      // Reaching for a locked level explains how to open it.
      this.hint = level > this.maxLevel;
      this.deny(this.stepper);
      this.fillDesc();
      return;
    }
    this.complexity = level;
    this.hint = false;
    this.host.sound.play('toggle');
    this.refresh();
  }

  private start(): void {
    const meta = this.host.meta;
    const choice = { character: this.char, complexity: this.complexity, endless: this.endless };
    meta.save.last = { ...choice };
    meta.commit();
    this.host.startRun(choice);
  }
}
