import { CHARACTERS } from '../../content/characters.ts';
import { PROOFS } from '../../content/meta.ts';
import { ngon } from '../../content/shapes.ts';
import { S, clock, formName } from '../../content/strings.de.ts';
import { codexProgress } from '../../meta/codex.ts';
import { endlessUnlocked, isCharacterUnlocked } from '../../meta/progression.ts';
import { h, svg } from '../dom.ts';
import {
  Screen,
  type ScreenHost,
  type ScreenId,
  splitterAmount,
  theoremLine,
  titleBlock,
} from './screen.ts';

// ------------------------------------------------------------------------------- emblem

const EMBLEM_R = 64;
/** One loop: triangle → square → pentagon → hexagon → back to the triangle. */
const EMBLEM_DUR = '8s';
const KEY_TIMES = '0;0.175;0.25;0.425;0.5;0.675;0.75;0.925;1';
/** Form index per key time: hold, morph, hold, morph … */
const KEY_FORMS = [0, 0, 1, 1, 2, 2, 3, 3, 0] as const;
const SPLINES = Array.from({ length: KEY_FORMS.length - 1 }, () => '0.5 0 0.2 1').join(';');

/** A vertex index, or the midpoint of the edge between two vertices. */
type Slot = number | readonly [number, number];

/**
 * Every form is drawn with the same six points; the spare ones sit on edge midpoints. Between
 * two forms exactly one midpoint moves out and becomes the new vertex – the in-game morph.
 */
const FORMS: readonly { n: number; slots: readonly Slot[] }[] = [
  { n: 3, slots: [0, [0, 1], 1, [1, 2], 2, [2, 0]] },
  { n: 4, slots: [0, [0, 1], 1, 2, 3, [3, 0]] },
  { n: 5, slots: [0, 1, 2, 3, 4, [4, 0]] },
  { n: 6, slots: [0, 1, 2, 3, 4, 5] },
];

interface SlotPoint {
  x: number;
  y: number;
  vertex: boolean;
}

function formPoints(form: number): SlotPoint[] {
  const { n, slots } = FORMS[form]!;
  const v = ngon(n, EMBLEM_R);
  const at = (i: number): [number, number] => [v[i * 2]!, v[i * 2 + 1]!];
  return slots.map((s) => {
    if (typeof s === 'number') {
      const [x, y] = at(s);
      return { x, y, vertex: true };
    }
    const [ax, ay] = at(s[0]);
    const [bx, by] = at(s[1]);
    return { x: (ax + bx) / 2, y: (ay + by) / 2, vertex: false };
  });
}

const f1 = (v: number): string => v.toFixed(1);

function animate(attr: string, values: string[], discrete = false): SVGAnimateElement {
  const a = svg('animate', {
    attributeName: attr,
    dur: EMBLEM_DUR,
    repeatCount: 'indefinite',
    values: values.join(';'),
    keyTimes: KEY_TIMES,
  });
  if (discrete) a.setAttribute('calcMode', 'discrete');
  else {
    a.setAttribute('calcMode', 'spline');
    a.setAttribute('keySplines', SPLINES);
  }
  return a;
}

/** The emblem: a polygon inside its circumcircle that keeps completing itself (SMIL). */
function emblem(still: boolean): SVGSVGElement {
  const size = 2 * (EMBLEM_R + 26);
  const root = svg('svg', {
    viewBox: `${-size / 2} ${-size / 2} ${size} ${size + 22}`,
    class: 'emblem',
    'aria-hidden': 'true',
  });
  root.append(
    svg('circle', { cx: 0, cy: 0, r: EMBLEM_R, class: 'construct dashed' }),
    svg('line', { x1: -size / 2, y1: 0, x2: size / 2, y2: 0, class: 'construct' }),
    svg('line', { x1: 0, y1: -size / 2, x2: 0, y2: size / 2, class: 'construct' }),
  );
  const forms = FORMS.map((_, i) => formPoints(i));
  const poly = (pts: SlotPoint[]): string => pts.map((p) => `${f1(p.x)},${f1(p.y)}`).join(' ');

  // Reduced motion: the finished form, no animation.
  const shown = still ? forms[3]! : forms[0]!;
  const shape = svg('polygon', { points: poly(shown), class: 'emblem-shape' });
  if (!still)
    shape.append(
      animate(
        'points',
        KEY_FORMS.map((k) => poly(forms[k]!)),
      ),
    );
  root.append(shape);

  for (let i = 0; i < 6; i++) {
    const p = shown[i]!;
    const dot = svg('circle', {
      cx: f1(p.x),
      cy: f1(p.y),
      r: p.vertex ? 3.4 : 0,
      class: 'emblem-vertex',
    });
    if (!still) {
      const at = KEY_FORMS.map((k) => forms[k]![i]!);
      dot.append(
        animate(
          'cx',
          at.map((q) => f1(q.x)),
        ),
        animate(
          'cy',
          at.map((q) => f1(q.y)),
        ),
        animate(
          'r',
          at.map((q) => (q.vertex ? '3.4' : '0')),
        ),
      );
    }
    root.append(dot);
  }
  root.append(svg('circle', { cx: 0, cy: 0, r: 3, class: 'emblem-core' }));

  // "n = 3 · Dreieck" – one label per form, switched halfway through each morph.
  const switchAt = [0, 0.2125, 0.4625, 0.7125, 0.9625];
  for (const [i, form] of FORMS.entries()) {
    const label = svg('text', { x: 0, y: size / 2 + 12, class: 'emblem-label' });
    const n = svg('tspan', { class: 'var' });
    n.textContent = 'n';
    label.append(n, document.createTextNode(` = ${form.n} · ${formName(form.n)}`));
    if (still) {
      if (i !== 3) continue;
    } else {
      const first = i === 0;
      const times = first ? [0, switchAt[1]!, switchAt[4]!] : [0, switchAt[i]!, switchAt[i + 1]!];
      label.setAttribute('opacity', first ? '1' : '0');
      const a = svg('animate', {
        attributeName: 'opacity',
        dur: EMBLEM_DUR,
        repeatCount: 'indefinite',
        calcMode: 'discrete',
        values: first ? '1;0;1' : '0;1;0',
        keyTimes: times.join(';'),
      });
      label.append(a);
    }
    root.append(label);
  }
  return root;
}

// ------------------------------------------------------------------------------- wordmark

/** Outline letters that fill from left to right, as if the pen was still drawing them. */
function wordmark(): HTMLElement {
  const el = h(
    'h1',
    'wordmark',
    h('span', 'wm-outline', S.title),
    h('span', 'wm-fill', S.title),
    h('span', 'wm-pen'),
  );
  el.setAttribute('aria-label', S.title);
  return el;
}

/** Dimension line with the tagline as its measurement. */
function dimension(text: string): HTMLElement {
  return h('div', 'dimension', h('span', 'dim-text', text));
}

function prefersStill(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ----------------------------------------------------------------------------------- screen

/**
 * Sheet 1: the title page. The left half is the drawing's table of contents; the right half
 * stays open for the attract-mode run behind it ("Abb. 1").
 */
export class TitleScreen extends Screen {
  private focus = 0;

  constructor(parent: HTMLElement, host: ScreenHost) {
    super(parent, host, 'title-screen');
    this.nav.onFocus = (_el, i) => {
      this.focus = i;
    };
  }

  /** The title is the root of the menu; Esc does nothing here. */
  protected override back(): void {
    // Intentionally empty.
  }

  protected render(): void {
    const meta = this.host.meta;
    const save = meta.save;
    const charId = isCharacterUnlocked(save, save.last.character) ? save.last.character : 'delta';
    const open = endlessUnlocked(save);
    let mode = open && save.last.endless ? S.select.endless : S.select.normal;
    if (open && save.last.complexity > 0) mode += ` · ${S.select.level(save.last.complexity)}`;
    const codex = codexProgress(save);

    const items = [
      this.entry(1, S.menu.play, S.menu.playNote(CHARACTERS[charId].name, mode), 'select'),
      this.entry(2, S.menu.shop, splitterAmount(save.splitter), 'shop'),
      this.entry(3, S.menu.proofs, S.proofs.count(save.proofs.length, PROOFS.length), 'proofs'),
      this.entry(4, S.menu.codex, S.codex.found(codex.found, codex.total), 'codex'),
      this.entry(5, S.menu.settings, null, 'settings'),
    ];

    const foot = h('div', 'title-foot', h('div', 'title-controls', S.menu.controls));
    if (save.stats.runs > 0)
      foot.append(
        h('div', 'title-record', S.menu.record(clock(save.stats.bestTime), save.stats.bestLevel)),
      );
    if (meta.status === 'recovered') foot.append(h('div', 'notice warn', S.menu.recovered));
    if (!meta.persistent) foot.append(h('div', 'notice', S.menu.debugSave));

    this.root.replaceChildren(
      h('div', 'title-margin'),
      h(
        'div',
        'title-main',
        h('div', 'title-annot', `${S.menu.drawing} · ${S.menu.sheet(1)} · ${S.menu.scale}`),
        h(
          'div',
          'title-hero',
          emblem(prefersStill()),
          h('div', 'title-words', wordmark(), dimension(S.tagline)),
        ),
        h(
          'div',
          'title-theorem',
          theoremLine(S.menu.theorem, S.menu.theoremText),
          theoremLine(S.menu.proof, S.menu.proofText, true),
        ),
        h('nav', 'toc', ...items),
        foot,
      ),
      h('div', 'title-figure', h('span', 'fig-caption', S.menu.figure(1, S.menu.demo))),
      titleBlock('title', S.menu.drawing),
    );
    this.nav.set(items, this.focus);
  }

  private entry(
    n: number,
    label: string,
    note: string | Node | null,
    target: ScreenId,
  ): HTMLButtonElement {
    const b = h(
      'button',
      'toc-item cad',
      h('span', 'toc-no', S.menu.section(n)),
      h('span', 'toc-label', label),
      h('span', 'toc-leader'),
      h('span', 'toc-note', note),
    );
    b.addEventListener('click', () => {
      this.host.go(target);
    });
    return b;
  }
}
