import { hex } from '../content/palette.ts';
import { S, clock, formName } from '../content/strings.de.ts';
import { OVER, PLAYER } from '../content/tuning.ts';
import type { Action } from '../app/input.ts';
import { axiomDone } from '../sim/stats.ts';
import type { World } from '../sim/world.ts';
import { buildSvg } from './buildView.ts';
import { h, shapeIcon, show } from './dom.ts';
import { MenuNav } from './menu.ts';
import { SILENT, type UiSound } from './nav.ts';

function pct(v: number): string {
  const r = Math.round(v * 100);
  if (r === 0) return '±0 %';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)} %`;
}

function decimal(v: number, digits: number): string {
  return v.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Pause overlay: the build in detail (vertices, edges, stats), resume, settings, give up. */
export class PauseView {
  readonly root: HTMLElement;
  onResume: () => void = () => undefined;
  onSettings: () => void = () => undefined;
  onGiveUp: () => void = () => undefined;

  private readonly meta: HTMLElement;
  private readonly build: HTMLElement;
  /** Two columns: vertex i (weapon) next to edge i (axiom). */
  private readonly slots: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly giveUpBtn: HTMLButtonElement;
  private readonly yesBtn: HTMLButtonElement;
  private readonly noBtn: HTMLButtonElement;
  private readonly mainRow: HTMLElement;
  private readonly confirmRow: HTMLElement;
  private readonly nav = new MenuNav();
  private readonly sound: UiSound;
  private confirming = false;

  constructor(parent: HTMLElement, sound: UiSound = SILENT) {
    this.sound = sound;
    this.nav.sound = sound;
    this.meta = h('div', 'pause-meta');
    this.build = h('div', 'pause-build');
    this.slots = h('div', 'pause-slots');
    this.stats = h('div', 'stat-list');
    this.resumeBtn = h('button', 'btn primary', S.pause.resume);
    this.settingsBtn = h('button', 'btn', S.pause.settings);
    this.giveUpBtn = h('button', 'btn', S.pause.giveUp);
    this.yesBtn = h('button', 'btn danger', S.pause.confirmYes);
    this.noBtn = h('button', 'btn', S.draft.cancel);
    this.resumeBtn.addEventListener('click', () => {
      this.onResume();
    });
    this.settingsBtn.addEventListener('click', () => {
      this.onSettings();
    });
    this.giveUpBtn.addEventListener('click', () => {
      this.sound.play('open');
      this.setConfirming(true);
    });
    this.yesBtn.addEventListener('click', () => {
      this.onGiveUp();
    });
    this.noBtn.addEventListener('click', () => {
      this.cancelGiveUp();
    });
    this.mainRow = h('div', 'menu-row', this.resumeBtn, this.settingsBtn, this.giveUpBtn);
    // The question sits in the button row: confirming swaps one row for another of equal height.
    this.confirmRow = h(
      'div',
      'menu-row hidden',
      h('span', 'foot-prompt', S.pause.confirmGiveUp),
      this.yesBtn,
      this.noBtn,
    );

    this.root = h(
      'div',
      'modal pause hidden',
      h(
        'div',
        'panel pause-panel',
        h('div', 'panel-title', S.pause.title),
        this.meta,
        h(
          'div',
          'pause-body',
          this.build,
          this.slots,
          h('div', 'pause-col', h('div', 'section-title', S.pause.stats), this.stats),
        ),
        this.mainRow,
        this.confirmRow,
      ),
    );
    parent.append(this.root);
  }

  /** `fromSettings`: back from the settings sheet, the focus returns to its button. */
  open(w: World, fromSettings = false): void {
    this.fill(w);
    this.setConfirming(false, fromSettings ? this.settingsBtn : this.resumeBtn);
    show(this.root, true);
  }

  close(): void {
    show(this.root, false);
  }

  handle(action: Action): void {
    if (action === 'back' || action === 'pause') {
      if (this.confirming) this.cancelGiveUp();
      else this.onResume();
      return;
    }
    this.nav.handle(action);
  }

  private cancelGiveUp(): void {
    this.sound.play('back');
    this.setConfirming(false, this.giveUpBtn);
  }

  private setConfirming(v: boolean, focus: HTMLButtonElement = this.resumeBtn): void {
    this.confirming = v;
    show(this.mainRow, !v);
    show(this.confirmRow, v);
    // Confirming starts on "Abbrechen" so a double press never gives up by accident.
    if (v) this.nav.set([this.yesBtn, this.noBtn], 1);
    else {
      const main = [this.resumeBtn, this.settingsBtn, this.giveUpBtn];
      this.nav.set(main, Math.max(0, main.indexOf(focus)));
    }
  }

  private fill(w: World): void {
    const p = w.player;
    this.meta.textContent = `${p.char.name} · ${formName(p.vertices)} · ${S.hud.level} ${p.level} · ${clock(w.time)}`;
    this.build.replaceChildren(buildSvg(p, 220));

    const cells: HTMLElement[] = [
      h('div', 'section-title', S.pause.weapons),
      h('div', 'section-title', S.pause.axioms),
    ];
    for (let i = 0; i < PLAYER.maxVertices; i++) {
      if (i >= p.vertices) {
        cells.push(h('div', 'slot locked', h('span', 'slot-name', S.pause.locked)));
        cells.push(h('div', 'slot locked'));
        continue;
      }
      const wpn = p.weapons[i];
      if (wpn) {
        // Theorems show their level too; `.slot.gold` colours it.
        const lv = wpn.level >= OVER.maxLevel ? S.draft.max : `${S.hud.level} ${wpn.level}`;
        const row = h(
          'div',
          `slot${wpn.def.theoremOf ? ' gold' : ''}`,
          shapeIcon(wpn.def.icon, wpn.def.color, 22),
          h('span', 'slot-name', wpn.def.name),
          h('span', 'slot-level', lv),
        );
        // Theorems keep the gold of `.slot.gold`.
        if (!wpn.def.theoremOf) row.style.setProperty('--slot-color', hex(wpn.def.color));
        cells.push(row);
      } else {
        cells.push(h('div', 'slot empty', h('span', 'slot-name', S.pause.empty)));
      }
      const ax = p.axioms[i];
      if (ax) {
        const lv = axiomDone(w.stats, ax) ? S.draft.max : `${S.hud.level} ${ax.level}`;
        const row = h(
          'div',
          'slot',
          shapeIcon(ax.def.icon, ax.def.color, 22),
          h('span', 'slot-name', ax.def.name),
          h('span', 'slot-level', lv),
        );
        row.style.setProperty('--slot-color', hex(ax.def.color));
        cells.push(row);
      } else {
        cells.push(h('div', 'slot empty', h('span', 'slot-name', S.pause.empty)));
      }
    }
    this.slots.replaceChildren(...cells);

    const s = w.stats;
    const rows: [string, string][] = [
      [S.stats.maxHp, `${Math.ceil(p.hp)} / ${Math.round(s.maxHp)}`],
      [S.stats.might, pct(s.might - 1)],
      [S.stats.cooldown, pct(s.cooldown - 1)],
      [S.stats.area, pct(s.area - 1)],
      [S.stats.amount, `+${s.amount}`],
      [S.stats.projSpeed, pct(s.projSpeed - 1)],
      [S.stats.moveSpeed, pct(s.moveSpeed - 1)],
      [S.stats.regen, `${decimal(s.regen, 2)} HP/s`],
      [S.stats.armor, String(s.armor)],
      [S.stats.magnet, pct(s.magnet - 1)],
      [S.stats.crit, `${Math.round(s.crit * 100)} %`],
    ];
    this.stats.replaceChildren(
      ...rows.map(([k, v]) =>
        h('div', 'stat-row', h('span', 'stat-key', k), h('span', 'stat-value', v)),
      ),
    );
  }
}
