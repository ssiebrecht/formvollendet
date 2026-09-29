import { AXIOMS } from '../../content/axioms.ts';
import { ABILITIES, CHARACTERS } from '../../content/characters.ts';
import { ENEMIES } from '../../content/enemies.ts';
import { hex } from '../../content/palette.ts';
import { S, num } from '../../content/strings.de.ts';
import { OVER } from '../../content/tuning.ts';
import type {
  AxiomId,
  CharacterId,
  EnemyId,
  ShapeId,
  WeaponDef,
  WeaponId,
} from '../../content/types.ts';
import { WEAPONS } from '../../content/weapons.ts';
import {
  CODEX_TABS,
  type CodexEntry,
  type CodexTab,
  codexEntries,
  codexProgress,
} from '../../meta/codex.ts';
import type { SaveData } from '../../meta/save.ts';
import { axiomMaxLevel, coreLevel } from '../../sim/stats.ts';
import { h, shapeIcon } from '../dom.ts';
import {
  Screen,
  type ScreenHost,
  backButton,
  formPortrait,
  sheet,
  sheetFooter,
  sheetHead,
  titleBlock,
} from './screen.ts';

const TAB_LABELS: Record<CodexTab, string> = {
  weapons: S.codex.weapons,
  theorems: S.codex.theorems,
  axioms: S.codex.axioms,
  enemies: S.codex.enemies,
  forms: S.codex.forms,
};

const TAGS: Record<CodexTab, string> = {
  weapons: S.draft.tagWeapon,
  theorems: S.draft.tagTheorem,
  axioms: S.draft.tagAxiom,
  enemies: S.codex.enemies,
  forms: S.codex.forms,
};

const UNKNOWN_COLOR = 0x4a5372;

interface Look {
  name: string;
  icon: ShapeId;
  color: number;
}

function look(e: CodexEntry): Look {
  switch (e.tab) {
    case 'weapons':
    case 'theorems': {
      const d = WEAPONS[e.id as WeaponId];
      return { name: d.name, icon: d.icon, color: d.color };
    }
    case 'axioms': {
      const d = AXIOMS[e.id as AxiomId];
      return { name: d.name, icon: d.icon, color: d.color };
    }
    case 'enemies': {
      const d = ENEMIES[e.id as EnemyId];
      return { name: d.name, icon: d.shape, color: d.color };
    }
    case 'forms': {
      const c = CHARACTERS[e.id as CharacterId];
      return { name: c.name, icon: c.style === 'star' ? 'star5' : 'triangle', color: c.color };
    }
  }
}

function row(key: string, value: string | Node): HTMLElement {
  return h('div', 'stat-row', h('span', 'stat-key', key), h('span', 'stat-value', value));
}

function seconds(v: number): string {
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })} s`;
}

/** Recipe line of a base weapon; the theorem stays hidden until it was proven once. */
function recipe(d: WeaponDef, save: SaveData): string | null {
  if (!d.evolvesInto || !d.evolvesWith) return null;
  const theorem = save.seen.weapons.includes(d.evolvesInto)
    ? WEAPONS[d.evolvesInto].name
    : S.codex.unknown;
  return S.codex.evolves(theorem, AXIOMS[d.evolvesWith].name);
}

/**
 * Sheet 5: the Kompendium. Everything met in a run gets an entry; unknown entries show only
 * their silhouette.
 */
export class CodexScreen extends Screen {
  private tab: CodexTab = 'weapons';
  private entries: CodexEntry[] = [];
  private tileEls: HTMLElement[] = [];
  private readonly tabs = new Map<CodexTab, HTMLButtonElement>();
  private readonly counts = new Map<CodexTab, HTMLElement>();
  private readonly total: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly backBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, host: ScreenHost) {
    super(parent, host, 'codex-screen');
    for (const t of CODEX_TABS) {
      const count = h('span', 'ct-count');
      const b = h('button', 'codex-tab cad', h('span', 'ct-label', TAB_LABELS[t]), count);
      b.addEventListener('click', () => {
        this.setTab(t);
      });
      this.tabs.set(t, b);
      this.counts.set(t, count);
    }
    this.total = h('div', 'codex-total');
    this.grid = h('div', 'codex-grid sheet-scroll');
    this.detail = h('div', 'codex-detail');
    this.backBtn = backButton();
    this.backBtn.addEventListener('click', () => {
      this.host.back();
    });
    this.nav.onFocus = (el) => {
      const i = this.tileEls.indexOf(el);
      if (i >= 0) this.showDetail(i);
    };
    this.root.append(
      sheet(
        'codex-sheet',
        sheetHead('codex', S.codex.title, S.codex.subtitle, this.total),
        h('div', 'codex-tabs', ...this.tabs.values()),
        h('div', 'codex-body', this.grid, this.detail),
        sheetFooter(this.backBtn, titleBlock('codex', S.codex.title)),
      ),
    );
  }

  protected render(): void {
    const save = this.host.meta.save;
    const all = codexProgress(save);
    this.total.textContent = S.codex.found(all.found, all.total);
    for (const t of CODEX_TABS) {
      const p = codexProgress(save, t);
      this.counts.get(t)!.textContent = `${p.found} / ${p.total}`;
    }
    this.fill(this.tabs.get(this.tab)!);
  }

  private setTab(t: CodexTab): void {
    if (t === this.tab) return;
    this.tab = t;
    this.host.sound.play('toggle');
    this.fill(this.tabs.get(t)!);
  }

  /** Rebuilds the grid for the current tab and puts the focus on `focus`. */
  private fill(focus: HTMLElement): void {
    const save = this.host.meta.save;
    for (const [t, b] of this.tabs) b.classList.toggle('active', t === this.tab);
    this.entries = codexEntries(save, this.tab);
    this.tileEls = this.entries.map((e) => {
      const l = look(e);
      const known = e.discovered;
      const tile = h(
        'button',
        known ? 'codex-tile cad' : 'codex-tile cad unknown',
        shapeIcon(l.icon, known ? l.color : UNKNOWN_COLOR, 34),
        h('span', 'ct-name', known ? l.name : S.codex.unknown),
      );
      tile.style.setProperty('--tone', hex(known ? l.color : UNKNOWN_COLOR));
      return tile;
    });
    this.grid.replaceChildren(...this.tileEls);
    const items = [...this.tabs.values(), ...this.tileEls, this.backBtn];
    this.showDetail(0);
    this.nav.set(items, Math.max(0, items.indexOf(focus)));
  }

  private showDetail(i: number): void {
    const e = this.entries[i];
    if (!e) {
      this.detail.replaceChildren();
      return;
    }
    const l = look(e);
    const tag = h('div', 'cd-tag', TAGS[e.tab]);
    if (!e.discovered) {
      this.detail.replaceChildren(
        h('div', 'cd-fig unknown', shapeIcon(l.icon, UNKNOWN_COLOR, 96)),
        tag,
        h('div', 'cd-name', S.codex.unknown),
        h('p', 'cd-desc', S.codex.unknownDesc),
      );
      return;
    }
    this.detail.style.setProperty('--tone', hex(l.color));
    const fig =
      e.tab === 'forms'
        ? formPortrait(CHARACTERS[e.id as CharacterId], 150, false)
        : shapeIcon(l.icon, l.color, 96);
    this.detail.replaceChildren(
      h('div', 'cd-fig', fig),
      tag,
      h('div', 'cd-name', l.name),
      ...this.body(e),
    );
  }

  private body(e: CodexEntry): Node[] {
    const save = this.host.meta.save;
    switch (e.tab) {
      case 'weapons': {
        const d = WEAPONS[e.id as WeaponId];
        const rows = [row(S.codex.damage, num(d.base.damage))];
        if (d.base.cooldown > 0) rows.push(row(S.codex.cooldown, seconds(d.base.cooldown)));
        rows.push(row(S.codex.levels, S.codex.maxLevel(OVER.maxLevel)));
        const core = coreLevel(d);
        const every = OVER.milestoneEvery;
        const first = (Math.floor(core / every) + 1) * every;
        const nodes: Node[] = [
          h('p', 'cd-desc', d.desc),
          h('div', 'stat-list', ...rows),
          h(
            'ol',
            'cd-levels',
            ...d.levels.map((lv, k) =>
              h('li', null, h('span', 'cd-lv', S.codex.levelLine(k + 2)), lv.text),
            ),
            // Überstufen: the damage step, then the milestone cycle.
            h(
              'li',
              'over',
              h('span', 'cd-lv', S.codex.overFrom(core + 1)),
              S.codex.overDamage(Math.round(OVER.damagePerLevel * 100)),
            ),
            d.over
              ? h(
                  'li',
                  'over',
                  h('span', 'cd-lv', S.codex.milestoneLevels(first, first + every)),
                  d.over.map((m) => m.text).join(' → '),
                )
              : null,
          ),
        ];
        const r = recipe(d, save);
        if (r) nodes.push(h('div', 'cd-recipe', r));
        return nodes;
      }
      case 'theorems': {
        const d = WEAPONS[e.id as WeaponId];
        const parent = d.theoremOf ? WEAPONS[d.theoremOf] : null;
        const axiom = parent?.evolvesWith ? AXIOMS[parent.evolvesWith] : null;
        const nodes: Node[] = [h('p', 'cd-desc', d.desc)];
        if (parent && axiom)
          nodes.push(
            h(
              'div',
              'stat-list',
              row(S.codex.proof, S.codex.recipe(parent.name, axiom.name, coreLevel(parent))),
            ),
          );
        return nodes;
      }
      case 'axioms': {
        const d = AXIOMS[e.id as AxiomId];
        return [
          h(
            'div',
            'stat-list',
            row(S.codex.perLevel, d.desc),
            row(S.codex.levels, S.codex.maxLevel(axiomMaxLevel(d))),
            d.over ? row(S.codex.over, d.over.text) : null,
          ),
        ];
      }
      case 'enemies': {
        const d = ENEMIES[e.id as EnemyId];
        return [
          h('p', 'cd-desc', d.desc),
          h(
            'div',
            'stat-list',
            row(S.codex.role, S.codex.roles[d.ai.kind]),
            row(S.codex.hp, num(d.hp)),
            row(S.codex.speed, num(d.speed)),
            row(S.codex.contact, num(d.damage)),
            row(S.codex.shells, num(d.shells)),
          ),
        ];
      }
      case 'forms': {
        const c = CHARACTERS[e.id as CharacterId];
        const ability = ABILITIES[c.ability];
        const weapon = WEAPONS[c.startWeapon];
        return [
          h('p', 'cd-desc', c.desc),
          h(
            'div',
            'stat-list',
            row(S.codex.role, c.role),
            row(S.codex.trait, c.traitText),
            row(S.codex.startWeapon, weapon.name),
            row(S.codex.skill, ability.name),
          ),
          h('p', 'cd-note', ability.desc),
        ];
      }
    }
  }
}
