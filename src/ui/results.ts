import { ENEMIES } from '../content/enemies.ts';
import { PROOFS } from '../content/meta.ts';
import { COLORS, hex } from '../content/palette.ts';
import { S, clock, formName, num } from '../content/strings.de.ts';
import type { EnemyId, ProofDef, ShapeId, WeaponId } from '../content/types.ts';
import { WEAPONS } from '../content/weapons.ts';
import type { Action } from '../app/input.ts';
import type { RunOutcome } from '../meta/summary.ts';
import type { World } from '../sim/world.ts';
import { buildSvg } from './buildView.ts';
import { h, shapeIcon, show } from './dom.ts';
import { MenuNav } from './menu.ts';
import { SILENT, type UiSound } from './nav.ts';
import { qedStamp } from './screens/proofs.ts';
import { splitterAmount, unlockChip } from './screens/screen.ts';

interface SourceLook {
  name: string;
  icon: ShapeId;
  color: number;
}

const OTHER_SOURCES: Record<string, { icon: ShapeId; color: number }> = {
  vektor: { icon: 'dart', color: 0x3ff0ff },
  supernova: { icon: 'star5', color: 0xffd23f },
  nova: { icon: 'spark', color: 0xffd23f },
  stern: { icon: 'star5', color: 0xff9a3c },
  bomb: { icon: 'times', color: 0xffffff },
};

function isWeapon(key: string): key is WeaponId {
  return Object.hasOwn(WEAPONS, key);
}

function isEnemy(key: string): key is EnemyId {
  return Object.hasOwn(ENEMIES, key);
}

/** What dealt the killing blow: an enemy type, or else an enemy bullet. */
function killerLook(key: string): SourceLook {
  if (isEnemy(key)) {
    const d = ENEMIES[key];
    return { name: d.name, icon: d.shape, color: d.color };
  }
  return { name: S.results.bullet, icon: 'ring', color: COLORS.enemyBullet };
}

function sourceLook(key: string): SourceLook {
  if (isWeapon(key)) {
    const d = WEAPONS[key];
    return { name: d.name, icon: d.icon, color: d.color };
  }
  const o = OTHER_SOURCES[key];
  return { name: S.sources[key] ?? key, icon: o?.icon ?? 'circle', color: o?.color ?? 0xffffff };
}

function statRow(key: string, value: string | Node, cls = 'stat-row'): HTMLElement {
  return h('div', cls, h('span', 'stat-key', key), h('span', 'stat-value', value));
}

function factor(v: number): string {
  return `× ${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;
}

/** A Beweis this run proved: fresh stamp, number and name, what it opens. */
function provenRow(p: ProofDef): HTMLElement {
  return h(
    'div',
    'proven-row',
    qedStamp(true),
    h(
      'div',
      'proven-main',
      h('div', 'proven-name', `${S.proofs.number(PROOFS.indexOf(p) + 1)} · ${p.name}`),
      h('div', 'proven-unlocks', ...p.unlocks.map((u) => unlockChip(u))),
    ),
  );
}

/** How the run ended and what the save made of it. */
export interface ResultsInfo {
  won: boolean;
  /** Endless runs end only by death; they get their own verdict. */
  endless: boolean;
  /** Null for runs that were not booked. */
  outcome: RunOutcome | null;
  saved: boolean;
}

/**
 * End of a run: verdict, key numbers, damage per source, the Splitter settlement and the Beweise
 * this run proved.
 */
export class ResultsView {
  readonly root: HTMLElement;
  onAgain: () => void = () => undefined;
  onTitle: () => void = () => undefined;

  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly build: HTMLElement;
  private readonly numbers: HTMLElement;
  private readonly damage: HTMLElement;
  private readonly ledger: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly proofs: HTMLElement;
  private readonly proofList: HTMLElement;
  private readonly againBtn: HTMLButtonElement;
  private readonly titleBtn: HTMLButtonElement;
  private readonly nav = new MenuNav();

  constructor(parent: HTMLElement, sound: UiSound = SILENT) {
    this.nav.sound = sound;
    this.title = h('div', 'panel-title results-title');
    this.sub = h('div', 'results-sub');
    this.build = h('div', 'results-build');
    this.numbers = h('div', 'stat-list');
    this.damage = h('div', 'damage-list');
    this.ledger = h('div', 'stat-list ledger');
    this.notes = h('div', 'results-notes');
    this.proofList = h('div', 'results-proof-list');
    this.proofs = h(
      'div',
      'results-proofs',
      h('div', 'section-title', S.results.newProofs),
      this.proofList,
    );
    this.againBtn = h('button', 'btn primary', S.results.again);
    this.againBtn.addEventListener('click', () => {
      this.onAgain();
    });
    this.titleBtn = h('button', 'btn', S.results.toTitle);
    this.titleBtn.addEventListener('click', () => {
      this.onTitle();
    });
    this.root = h(
      'div',
      'modal results hidden',
      h(
        'div',
        'panel results-panel',
        this.title,
        this.sub,
        h(
          'div',
          'results-body',
          h('div', 'results-col', this.build, this.numbers),
          h('div', 'results-col wide', h('div', 'section-title', S.results.damage), this.damage),
          h(
            'div',
            'results-col',
            h('div', 'section-title', S.results.reward),
            this.ledger,
            this.notes,
            this.proofs,
          ),
        ),
        h('div', 'menu-row', this.againBtn, this.titleBtn),
      ),
    );
    parent.append(this.root);
  }

  open(w: World, info: ResultsInfo): void {
    const endless = info.endless && !info.won;
    this.root.classList.toggle('won', info.won);
    this.root.classList.toggle('endless', endless);
    if (info.won) {
      this.title.textContent = S.results.won;
      this.sub.textContent = S.results.wonSub;
    } else if (endless) {
      this.title.textContent = S.results.endless;
      this.sub.textContent = S.results.endlessSub;
    } else {
      this.title.textContent = S.results.lost;
      this.sub.textContent = S.results.lostSub;
    }
    const p = w.player;
    this.build.replaceChildren(buildSvg(p, 180));

    const theorems = w.run.theorems.map((id) => WEAPONS[id].name).join(', ');
    const rows: [string, string][] = [
      [S.results.time, clock(w.time)],
      [S.results.level, String(p.level)],
      [S.results.kills, num(w.run.kills)],
      [S.results.form, formName(w.run.maxVertices)],
      [S.results.theorems, theorems || S.results.none],
    ];
    this.numbers.replaceChildren(...rows.map(([k, v]) => statRow(k, v)));
    if (!info.won && w.run.killedBy) {
      const k = killerLook(w.run.killedBy);
      const killer = h('span', 'killer', shapeIcon(k.icon, k.color, 18), k.name);
      this.numbers.append(statRow(S.results.killedBy, killer));
    }
    this.fillDamage(w);
    this.fillReward(info);

    show(this.root, true);
    this.nav.set([this.againBtn, this.titleBtn], 0);
  }

  close(): void {
    show(this.root, false);
  }

  handle(action: Action): void {
    this.nav.handle(action);
  }

  private fillDamage(w: World): void {
    const entries = [...w.run.damageBySource.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    const top = entries[0]?.[1] ?? 1;
    this.damage.replaceChildren(
      ...(entries.length === 0
        ? [h('div', 'stat-row', h('span', 'stat-key', S.results.none))]
        : entries.map(([key, value]) => {
            const look = sourceLook(key);
            const fill = h('div', 'damage-fill');
            fill.style.transform = `scaleX(${(value / top).toFixed(4)})`;
            const row = h(
              'div',
              'damage-row',
              shapeIcon(look.icon, look.color, 20),
              h('span', 'damage-name', look.name),
              h('div', 'damage-track', fill),
              h('span', 'damage-value', num(value)),
              h('span', 'damage-share', `${Math.round((value / total) * 100)} %`),
            );
            row.style.setProperty('--slot-color', hex(look.color));
            return row;
          })),
    );
  }

  /** Splitter settlement, discoveries and freshly proven Beweise. */
  private fillReward(info: ResultsInfo): void {
    const o = info.outcome;
    const notes: HTMLElement[] = [];
    if (o) {
      const r = o.reward;
      this.ledger.replaceChildren(
        statRow(S.results.collected, num(r.collected)),
        statRow(S.results.timeBonus, `+${num(r.time)}`),
        statRow(S.results.killBonus, `+${num(r.kills)}`),
        statRow(S.results.multiplier, factor(r.multiplier)),
        statRow(S.results.total, splitterAmount(r.total), 'stat-row ledger-total'),
      );
      if (o.discovered > 0)
        notes.push(h('div', 'results-note', S.results.discovered(o.discovered)));
    } else {
      this.ledger.replaceChildren(statRow(S.results.collected, S.results.none));
    }
    if (!info.saved) notes.push(h('div', 'results-note warn', S.results.notSaved));
    this.notes.replaceChildren(...notes);

    const fresh = o?.proofs ?? [];
    this.proofList.replaceChildren(...fresh.map(provenRow));
    show(this.proofs, fresh.length > 0);
  }
}
