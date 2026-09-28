import { PROOFS } from '../../content/meta.ts';
import { S, clock, num } from '../../content/strings.de.ts';
import type { ProofCondition, ProofDef } from '../../content/types.ts';
import { proofProgress } from '../../meta/proofs.ts';
import type { LifetimeStats } from '../../meta/save.ts';
import { h } from '../dom.ts';
import {
  Screen,
  type ScreenHost,
  backButton,
  gauge,
  sheet,
  sheetFooter,
  sheetHead,
  titleBlock,
  unlockChip,
} from './screen.ts';

function progressText(c: ProofCondition, value: number, target: number): string {
  switch (c.kind) {
    case 'surviveSeconds':
      return `${clock(value)} / ${clock(target)}`;
    case 'reachVertices':
      return `${value} / ${S.proofs.vertices(target)}`;
    case 'killsInRun':
      return `${num(value)} / ${num(target)}`;
    case 'theorems':
    case 'bossKilled':
      return `${value} / ${target}`;
  }
}

/** Q.E.D. stamp; `fresh` plays the stamping animation (new on the results screen). */
export function qedStamp(fresh = false): HTMLElement {
  return h('span', fresh ? 'stamp fresh' : 'stamp', S.proofs.proven);
}

/** One Satz: number, name, statement, what it opens, and progress or the Q.E.D. stamp. */
function proofItem(p: ProofDef, index: number, proven: boolean, stats: LifetimeStats): HTMLElement {
  const state = h('div', 'pf-state');
  if (proven) state.append(qedStamp());
  else {
    const { value, target } = proofProgress(p.condition, stats);
    state.append(
      gauge(value / target, 'gauge pf-gauge'),
      h('span', 'pf-count', progressText(p.condition, value, target)),
    );
  }
  return h(
    'div',
    proven ? 'proof proven cad' : 'proof cad',
    h('div', 'pf-no', S.proofs.number(index + 1)),
    h(
      'div',
      'pf-main',
      h('div', 'pf-name', p.name),
      h('div', 'pf-desc', p.desc),
      h(
        'div',
        'pf-unlocks',
        h('span', 'pf-key', S.proofs.unlocks),
        ...p.unlocks.map((u) => unlockChip(u)),
      ),
    ),
    state,
  );
}

/** Sheet 4: the Beweise (achievements) with progress, and lifetime statistics. */
export class ProofsScreen extends Screen {
  private readonly list: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly backBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, host: ScreenHost) {
    super(parent, host, 'proofs-screen');
    this.list = h('div', 'proof-list sheet-scroll');
    this.stats = h('div', 'stat-list');
    this.backBtn = backButton();
    this.backBtn.addEventListener('click', () => {
      this.host.back();
    });
    this.root.append(
      sheet(
        'proofs-sheet',
        sheetHead('proofs', S.proofs.title, S.proofs.subtitle),
        h(
          'div',
          'proofs-body',
          this.list,
          h('aside', 'proofs-stats', h('div', 'section-title', S.proofs.stats), this.stats),
        ),
        sheetFooter(this.backBtn, titleBlock('proofs', S.proofs.title)),
      ),
    );
  }

  protected render(): void {
    const save = this.host.meta.save;
    const items = PROOFS.map((p, i) => proofItem(p, i, save.proofs.includes(p.id), save.stats));
    this.list.replaceChildren(...items);

    const st = save.stats;
    const rows: [string, string][] = [
      [S.proofs.runs, num(st.runs)],
      [S.proofs.wins, num(st.wins)],
      [S.proofs.kills, num(st.kills)],
      [S.proofs.bestTime, clock(st.bestTime)],
      [S.proofs.bestLevel, num(st.bestLevel)],
      [S.proofs.bestKills, num(st.bestKills)],
      [S.proofs.theorems, num(st.theorems)],
      [S.proofs.bossKills, num(st.bossKills)],
      [S.proofs.splitterEarned, num(st.splitterEarned)],
    ];
    this.stats.replaceChildren(
      ...rows.map(([k, v]) =>
        h('div', 'stat-row', h('span', 'stat-key', k), h('span', 'stat-value', v)),
      ),
    );
    this.nav.set([...items, this.backBtn], items.length);
  }
}
