import { AXIOMS } from '../../content/axioms.ts';
import { CHARACTERS } from '../../content/characters.ts';
import { META_UPGRADES, PROOFS } from '../../content/meta.ts';
import { COLORS, hex } from '../../content/palette.ts';
import { ngon, starPolygon } from '../../content/shapes.ts';
import { S, num } from '../../content/strings.de.ts';
import type { CharacterDef, ProofDef, ShapeId, StatKey, UnlockId } from '../../content/types.ts';
import { WEAPONS } from '../../content/weapons.ts';
import type { Action } from '../../app/input.ts';
import type { MetaStore } from '../../app/meta.ts';
import type { Settings } from '../../app/settings.ts';
import type { RunChoice } from '../../meta/progression.ts';
import { h, replay, shapeIcon, show, svg } from '../dom.ts';
import { SpatialNav, type UiSound } from '../nav.ts';

export type ScreenId = 'title' | 'select' | 'shop' | 'proofs' | 'codex' | 'settings';

/** What the menu screens may do; implemented by the menu controller. */
export interface ScreenHost {
  readonly meta: MetaStore;
  readonly settings: Settings;
  readonly sound: UiSound;
  go(id: ScreenId): void;
  back(): void;
  startRun(choice: Omit<RunChoice, 'seed'>): void;
  settingsChanged(): void;
}

/** Every screen is one sheet of the same drawing set. */
const SHEETS: Record<ScreenId, number> = {
  title: 1,
  select: 2,
  shop: 3,
  proofs: 4,
  codex: 5,
  settings: 6,
};
const SHEET_COUNT = 6;

/**
 * A full-screen menu page drawn as a sheet of a construction drawing. Subclasses build their DOM
 * once and refresh it in `render`, which runs on every open so the page shows the current save.
 */
export abstract class Screen {
  readonly root: HTMLElement;
  protected readonly host: ScreenHost;
  protected readonly nav = new SpatialNav();

  constructor(parent: HTMLElement, host: ScreenHost, cls: string) {
    this.host = host;
    this.nav.sound = host.sound;
    this.root = h('div', `screen ${cls} hidden`);
    parent.append(this.root);
  }

  open(): void {
    this.render();
    show(this.root, true);
    replay(this.root, 'enter');
  }

  close(): void {
    show(this.root, false);
  }

  handle(action: Action): void {
    if (action === 'back') this.back();
    else this.nav.handle(action);
  }

  /** Esc / B. Screens with an inner state (confirm prompts) close that first. */
  protected back(): void {
    this.host.back();
  }

  protected abstract render(): void;
}

// ------------------------------------------------------------------------------ sheet parts

/** Sheet head: sheet number, title with a dimension line under it, subtitle, optional aside. */
export function sheetHead(
  id: ScreenId,
  title: string,
  subtitle: string,
  aside?: Node,
): HTMLElement {
  return h(
    'header',
    'sheet-head',
    h(
      'div',
      'sheet-heading',
      h('div', 'sheet-no', S.menu.sheet(SHEETS[id])),
      h('h1', 'sheet-title', title),
      h('div', 'sheet-sub', subtitle),
    ),
    aside,
  );
}

/** Title block ("Schriftfeld") of a technical drawing: name, sheet label, scale, sheet number. */
export function titleBlock(id: ScreenId, label: string): HTMLElement {
  return h(
    'div',
    'title-block',
    h('span', 'tb-cell tb-main', S.title),
    h('span', 'tb-cell', label),
    h('span', 'tb-cell', S.menu.scale),
    h('span', 'tb-cell', `${SHEETS[id]} / ${SHEET_COUNT}`),
  );
}

/** The framed sheet: double border, crop marks, faint grid. */
export function sheet(cls: string, ...children: (Node | null)[]): HTMLElement {
  return h('div', `sheet ${cls}`, h('i', 'crop'), ...children);
}

export function sheetFooter(...children: (Node | null)[]): HTMLElement {
  return h('footer', 'sheet-foot', ...children);
}

/** Splitter amount with its crystal. */
export function splitterAmount(n: number, cls = 'splitter-amount', size = 16): HTMLElement {
  return h('span', cls, shapeIcon('splitter', COLORS.splitter, size), num(n));
}

export function backButton(label: string = S.menu.back): HTMLButtonElement {
  return h('button', 'btn ghost cad', label);
}

/** Horizontal gauge (value / max) for character values and proof progress. */
export function gauge(fraction: number, cls = 'gauge'): HTMLElement {
  const fill = h('i', null);
  fill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction)).toFixed(4)})`;
  return h('span', cls, fill);
}

/** Bold "Satz."-style lead-in followed by italic text, like a theorem in a textbook. */
export function theoremLine(lead: string, text: string, qed = false): HTMLElement {
  return h(
    'p',
    'theorem',
    h('b', null, lead),
    ' ',
    h('i', null, text),
    qed ? h('span', 'tomb') : null,
  );
}

// ------------------------------------------------------------------------------ Reißbrett

/** Tile colour by what a Reißbrett entry does: attack, survival, economy, draft control. */
const META_TONES: Partial<Record<StatKey, string>> = {
  might: 'var(--cyan)',
  cooldown: 'var(--cyan)',
  area: 'var(--cyan)',
  projSpeed: 'var(--cyan)',
  crit: 'var(--cyan)',
  critMult: 'var(--cyan)',
  duration: 'var(--cyan)',
  amount: 'var(--cyan)',
  startLevel: 'var(--cyan)',
  armor: 'var(--mint)',
  maxHp: 'var(--mint)',
  regen: 'var(--mint)',
  revival: 'var(--mint)',
  moveSpeed: 'var(--gold)',
  magnet: 'var(--gold)',
  luck: 'var(--gold)',
  growth: 'var(--gold)',
  greed: 'var(--gold)',
};
const META_ICON_COLORS: Partial<Record<StatKey, number>> = {
  armor: 0x6dff8a,
  maxHp: 0x6dff8a,
  regen: 0x6dff8a,
  revival: 0x6dff8a,
  moveSpeed: 0xffd23f,
  magnet: 0xffd23f,
  luck: 0xffd23f,
  growth: 0xffd23f,
  greed: 0xffd23f,
  reroll: COLORS.splitter,
  banish: COLORS.splitter,
  skip: COLORS.splitter,
  draftSize: COLORS.splitter,
  cubeRolls: COLORS.splitter,
};

export function metaTone(stat: StatKey): string {
  return META_TONES[stat] ?? 'var(--violet)';
}

export function metaIconColor(stat: StatKey): number {
  return META_ICON_COLORS[stat] ?? 0x3ff0ff;
}

// ------------------------------------------------------------------------------- unlocks

export interface UnlockLook {
  text: string;
  icon: ShapeId;
  color: number;
}

export function unlockLook(id: UnlockId): UnlockLook {
  if (id === 'mode:endless') return { text: S.unlock.endless, icon: 'ring', color: 0xffffff };
  const [kind, key] = id.split(':') as [string, string];
  if (kind === 'tier') return { text: S.unlock.tier, icon: 'plus', color: 0xffd23f };
  if (kind === 'meta') {
    const d = META_UPGRADES.find((u) => u.id === key)!;
    return { text: S.unlock.meta(d.name), icon: d.icon, color: metaIconColor(d.stat) };
  }
  if (kind === 'weapon') {
    const d = WEAPONS[key as keyof typeof WEAPONS];
    return { text: S.unlock.weapon(d.name), icon: d.icon, color: d.color };
  }
  if (kind === 'axiom') {
    const d = AXIOMS[key as keyof typeof AXIOMS];
    return { text: S.unlock.axiom(d.name), icon: d.icon, color: d.color };
  }
  const c = CHARACTERS[key as keyof typeof CHARACTERS];
  return {
    text: S.unlock.char(c.name),
    icon: c.style === 'star' ? 'star5' : 'triangle',
    color: c.color,
  };
}

export function unlockChip(id: UnlockId): HTMLElement {
  const look = unlockLook(id);
  const chip = h('span', 'unlock-chip', shapeIcon(look.icon, look.color, 18), look.text);
  chip.style.setProperty('--tone', hex(look.color));
  return chip;
}

/** Chips for everything a Beweis opens; the last one opens nothing but itself. */
export function unlockChips(ids: readonly UnlockId[]): Node[] {
  if (ids.length === 0) return [h('span', 'unlock-final', S.proofs.final)];
  return ids.map((u) => unlockChip(u));
}

/** The Beweis that opens an unlock, for "locked" hints. */
export function proofFor(id: UnlockId): ProofDef | undefined {
  return PROOFS.find((p) => p.unlocks.includes(id));
}

// ------------------------------------------------------------------------------ portraits

/**
 * Character portrait as a construction: circumcircle, axes, the polygon (regular or star) in the
 * character colour, the white core point and a radius dimension. `locked` keeps only a dashed
 * outline of the form.
 */
export function formPortrait(c: CharacterDef, size: number, locked: boolean): SVGSVGElement {
  const r = size * 0.34;
  const root = svg('svg', {
    viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`,
    width: size,
    height: size,
    class: 'form-portrait',
  });
  const color = locked ? '#4a5372' : hex(c.color);
  root.append(
    svg('circle', { cx: 0, cy: 0, r: r * 1.12, class: 'construct dashed' }),
    svg('line', { x1: -r * 1.36, y1: 0, x2: r * 1.36, y2: 0, class: 'construct' }),
    svg('line', { x1: 0, y1: -r * 1.36, x2: 0, y2: r * 1.36, class: 'construct' }),
  );
  const pts = c.style === 'star' ? starPolygon(3, r * 1.05, r * 0.42) : ngon(3, r);
  const points: string[] = [];
  for (let i = 0; i < pts.length; i += 2)
    points.push(`${pts[i]!.toFixed(1)},${pts[i + 1]!.toFixed(1)}`);
  root.append(
    svg('polygon', {
      points: points.join(' '),
      fill: color,
      'fill-opacity': locked ? 0 : 0.12,
      stroke: color,
      'stroke-width': locked ? 1.5 : 3,
      'stroke-dasharray': locked ? '5 6' : 'none',
      'stroke-linejoin': 'round',
      class: locked ? 'portrait-shape' : 'portrait-shape lit',
    }),
  );
  if (locked) return root;
  // Radius dimension from the core to the top vertex.
  const x = r * 0.62;
  const label = svg('text', { x: x + 6, y: -r / 2 + 4, class: 'dim-label' });
  label.textContent = 'r';
  root.append(
    svg('line', { x1: x, y1: -2, x2: x, y2: -r + 2, class: 'dim-line' }),
    svg('line', { x1: x - 4, y1: 0, x2: x + 4, y2: 0, class: 'dim-line' }),
    svg('line', { x1: x - 4, y1: -r, x2: x + 4, y2: -r, class: 'dim-line' }),
    label,
    svg('circle', { cx: 0, cy: 0, r: 4, fill: '#fff', class: 'core' }),
  );
  return root;
}
