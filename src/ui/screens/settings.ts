import { S } from '../../content/strings.de.ts';
import { type Settings, saveSettings } from '../../app/settings.ts';
import { h, show } from '../dom.ts';
import {
  Screen,
  type ScreenHost,
  backButton,
  sheet,
  sheetFooter,
  sheetHead,
  titleBlock,
} from './screen.ts';

type VolumeKey = 'masterVolume' | 'sfxVolume' | 'musicVolume';
type FlagKey = 'screenShake' | 'damageNumbers' | 'flashReduction' | 'showFps';

/** One settings row: its element plus how it reacts to left/right and confirm. */
interface Control {
  el: HTMLElement;
  adjust(dir: -1 | 1): void;
  sync(): void;
}

const STEP = 0.1;

/**
 * Sheet 6: device settings. Every change is saved and applied at once. Opened from the pause
 * menu (`inRun`), the destructive "Daten" section is hidden.
 */
export class SettingsScreen extends Screen {
  /** Set by the menu controller before opening. */
  inRun = false;

  private readonly controls: Control[] = [];
  private readonly dataSection: HTMLElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly yesBtn: HTMLButtonElement;
  private readonly noBtn: HTMLButtonElement;
  private readonly resetRow: HTMLElement;
  private readonly confirmRow: HTMLElement;
  private readonly note: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private confirming = false;

  constructor(parent: HTMLElement, host: ScreenHost) {
    super(parent, host, 'settings-screen');
    const audio = [
      this.volume('masterVolume', S.settings.master),
      this.volume('sfxVolume', S.settings.sfx),
      this.volume('musicVolume', S.settings.music),
    ];
    const display = [
      this.flag(S.settings.shake, 'screenShake'),
      this.flag(S.settings.damageNumbers, 'damageNumbers'),
      this.flag(S.settings.flash, 'flashReduction'),
      this.toggle(
        S.settings.glow,
        () => this.host.settings.glow === 1,
        (v) => {
          this.host.settings.glow = v ? 1 : 0;
        },
      ),
      this.flag(S.settings.fps, 'showFps'),
    ];
    this.controls.push(...audio, ...display);
    this.nav.onAdjust = (el, dir) => {
      const c = this.controls.find((k) => k.el === el);
      if (!c) return false;
      c.adjust(dir);
      return true;
    };

    this.resetBtn = h('button', 'btn danger cad', S.settings.reset);
    this.resetBtn.addEventListener('click', () => {
      this.askReset();
    });
    this.yesBtn = h('button', 'btn danger cad', S.settings.resetYes);
    this.yesBtn.addEventListener('click', () => {
      this.reset();
    });
    this.noBtn = h('button', 'btn cad', S.settings.cancel);
    this.noBtn.addEventListener('click', () => {
      this.back();
    });
    this.note = h('span', 'set-note');
    this.resetRow = h('div', 'data-row', this.resetBtn, this.note);
    this.confirmRow = h(
      'div',
      'data-row hidden',
      h('span', 'foot-prompt', S.settings.resetConfirm),
      this.yesBtn,
      this.noBtn,
    );
    this.dataSection = h(
      'section',
      'set-section data',
      h('div', 'section-title', S.settings.data),
      this.resetRow,
      this.confirmRow,
    );

    this.backBtn = backButton();
    this.backBtn.addEventListener('click', () => {
      this.host.back();
    });

    this.root.append(
      sheet(
        'settings-sheet',
        sheetHead('settings', S.settings.title, S.settings.subtitle),
        h(
          'div',
          'settings-body sheet-scroll',
          h(
            'section',
            'set-section',
            h('div', 'section-title', S.settings.audio),
            ...audio.map((c) => c.el),
          ),
          h(
            'section',
            'set-section',
            h('div', 'section-title', S.settings.display),
            ...display.map((c) => c.el),
          ),
          this.dataSection,
        ),
        sheetFooter(this.backBtn, titleBlock('settings', S.settings.title)),
      ),
    );
  }

  protected render(): void {
    for (const c of this.controls) c.sync();
    show(this.dataSection, !this.inRun);
    this.note.textContent = '';
    this.showMain(this.controls[0]!.el);
  }

  protected override back(): void {
    if (!this.confirming) {
      this.host.back();
      return;
    }
    this.host.sound.play('back');
    this.showMain(this.resetBtn);
  }

  private changed(): void {
    saveSettings(this.host.settings);
    this.host.settingsChanged();
  }

  // ------------------------------------------------------------------------------ controls

  /** Volume as a ruler: ticks every 10 %, a cursor on top; click or drag sets it. */
  private volume(key: VolumeKey, label: string): Control {
    const fill = h('i', 'ruler-fill');
    const knob = h('i', 'ruler-knob');
    const ruler = h('div', 'ruler', fill, knob);
    const value = h('span', 'set-value');
    const el = h('div', 'set-row slider cad', h('span', 'set-label', label), ruler, value);
    const s: Settings = this.host.settings;
    const sync = (): void => {
      const v = s[key];
      fill.style.transform = `scaleX(${v.toFixed(3)})`;
      knob.style.left = `${(v * 100).toFixed(1)}%`;
      value.textContent = S.settings.percent(v);
    };
    const set = (raw: number): void => {
      const v = Math.round(Math.max(0, Math.min(1, raw)) * 20) / 20;
      if (v === s[key]) return;
      s[key] = v;
      sync();
      this.changed();
      this.host.sound.play('toggle');
    };
    const fromPointer = (e: PointerEvent): void => {
      const r = ruler.getBoundingClientRect();
      set((e.clientX - r.left) / r.width);
    };
    ruler.addEventListener('pointerdown', (e) => {
      ruler.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    ruler.addEventListener('pointermove', (e) => {
      if (ruler.hasPointerCapture(e.pointerId)) fromPointer(e);
    });
    return {
      el,
      sync,
      adjust: (dir) => {
        set(s[key] + dir * STEP);
      },
    };
  }

  private flag(label: string, key: FlagKey): Control {
    return this.toggle(
      label,
      () => this.host.settings[key],
      (v) => {
        this.host.settings[key] = v;
      },
    );
  }

  /** Two-way switch "Aus | An"; confirm flips it, left/right picks a side. */
  private toggle(label: string, get: () => boolean, put: (v: boolean) => void): Control {
    const off = h('span', 'sw-opt', S.settings.off);
    const on = h('span', 'sw-opt', S.settings.on);
    const el = h(
      'div',
      'set-row toggle cad',
      h('span', 'set-label', label),
      h('span', 'switch', off, on),
    );
    const sync = (): void => {
      const v = get();
      el.classList.toggle('on', v);
      off.classList.toggle('active', !v);
      on.classList.toggle('active', v);
    };
    const set = (v: boolean): void => {
      if (v === get()) return;
      put(v);
      sync();
      this.changed();
      this.host.sound.play('toggle');
    };
    el.addEventListener('click', () => {
      set(!get());
    });
    return {
      el,
      sync,
      adjust: (dir) => {
        set(dir > 0);
      },
    };
  }

  // ---------------------------------------------------------------------------------- data

  private askReset(): void {
    this.confirming = true;
    show(this.resetRow, false);
    show(this.confirmRow, true);
    // Starts on "Abbrechen" so a double press never deletes by accident.
    this.nav.set([this.yesBtn, this.noBtn], 1);
    this.host.sound.play('open');
  }

  private reset(): void {
    this.host.meta.reset();
    this.host.sound.play('confirm');
    this.showMain(this.resetBtn);
    this.note.textContent = S.settings.resetDone;
  }

  private showMain(focus: HTMLElement): void {
    this.confirming = false;
    show(this.resetRow, true);
    show(this.confirmRow, false);
    const items = this.controls.map((c) => c.el);
    if (!this.inRun) items.push(this.resetBtn);
    items.push(this.backBtn);
    this.nav.set(items, Math.max(0, items.indexOf(focus)));
  }
}
