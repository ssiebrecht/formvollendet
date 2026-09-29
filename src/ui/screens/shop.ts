import { META_UPGRADES, PROOFS } from '../../content/meta.ts';
import { S, num } from '../../content/strings.de.ts';
import type { MetaUpgradeDef } from '../../content/types.ts';
import {
  buy,
  canBuy,
  entryUnlocked,
  maxRankOf,
  metaTier,
  rankOf,
  refundAll,
  totalSpent,
  upgradeCost,
} from '../../meta/progression.ts';
import { h, replay, shapeIcon, show } from '../dom.ts';
import {
  Screen,
  type ScreenHost,
  backButton,
  metaIconColor,
  metaTone,
  proofFor,
  sheet,
  sheetFooter,
  sheetHead,
  splitterAmount,
  titleBlock,
} from './screen.ts';

/** Cells of every rank bar: the longest entry's last rank, so all bars share one scale. */
const BAR_CELLS = Math.max(...META_UPGRADES.map((d) => d.ranks[3]));
const ROMAN = ['I', 'II', 'III'] as const;

interface Tile {
  def: MetaUpgradeDef;
  el: HTMLButtonElement;
  rank: HTMLElement;
  /** One cell per rank up to the last Erweiterung. */
  cells: HTMLElement[];
  cost: HTMLElement;
}

/**
 * Sheet 3: the Reißbrett. Permanent upgrades for Splitter; every purchase can be refunded in
 * full, so experimenting costs nothing.
 */
export class ShopScreen extends Screen {
  private readonly tiles: Tile[] = [];
  private readonly balance: HTMLElement;
  private readonly spent: HTMLElement;
  private readonly tierBadges: HTMLElement[];
  private readonly refundBtn: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly yesBtn: HTMLButtonElement;
  private readonly noBtn: HTMLButtonElement;
  private readonly prompt: HTMLElement;
  private readonly mainRow: HTMLElement;
  private readonly confirmRow: HTMLElement;
  private confirming = false;
  private lastTile = 0;

  constructor(parent: HTMLElement, host: ScreenHost) {
    super(parent, host, 'shop-screen');

    for (const def of META_UPGRADES) {
      const rank = h('span', 'st-rank');
      const cells: HTMLElement[] = [];
      // A wider gap marks where the next Erweiterung's ranks begin.
      const cuts = new Set(def.ranks.slice(0, 3).filter((r) => r > 0 && r < def.ranks[3]));
      for (let i = 0; i < def.ranks[3]; i++) cells.push(h('i', cuts.has(i) ? 'cut' : null));
      const bar = h('span', 'st-bar', ...cells);
      bar.style.setProperty('--cells', String(BAR_CELLS));
      const cost = h('span', 'st-cost');
      const el = h(
        'button',
        'shop-tile cad',
        h('div', 'st-head', shapeIcon(def.icon, metaIconColor(def.stat), 26), rank),
        h('div', 'st-name', def.name),
        h('div', 'st-desc', def.desc),
        bar,
        h('div', 'st-foot', cost),
      );
      el.style.setProperty('--tone', metaTone(def.stat));
      const tile = { def, el, rank, cells, cost };
      el.addEventListener('click', () => {
        this.purchase(tile);
      });
      this.tiles.push(tile);
    }

    this.balance = h('div', 'sb-amount');
    this.spent = h('div', 'sb-spent');
    this.tierBadges = ROMAN.map((r) => h('b', null, r));
    const tiers = h(
      'div',
      'sb-tiers',
      h('span', 'sb-tiers-label', S.shop.tiers),
      ...this.tierBadges,
    );
    const tierProofs = PROOFS.filter((p) => p.unlocks.some((u) => u.startsWith('tier:')));
    tiers.title = S.shop.tierHint(tierProofs.map((p) => `„${p.name}“`).join(', '));
    const aside = h(
      'div',
      'shop-balance',
      h('div', 'sb-label', S.shop.balance),
      this.balance,
      this.spent,
      tiers,
    );

    this.backBtn = backButton();
    this.backBtn.addEventListener('click', () => {
      this.host.back();
    });
    this.refundBtn = h('button', 'btn danger cad', S.shop.refund);
    this.refundBtn.addEventListener('click', () => {
      this.askRefund();
    });
    this.yesBtn = h('button', 'btn danger cad', S.shop.refundYes);
    this.yesBtn.addEventListener('click', () => {
      this.refund();
    });
    this.noBtn = h('button', 'btn cad', S.shop.cancel);
    this.noBtn.addEventListener('click', () => {
      this.back();
    });
    this.prompt = h('span', 'foot-prompt');
    this.mainRow = h('div', 'foot-actions', this.backBtn, this.refundBtn);
    this.confirmRow = h('div', 'foot-actions hidden', this.prompt, this.yesBtn, this.noBtn);

    this.nav.onFocus = (el) => {
      const i = this.tiles.findIndex((t) => t.el === el);
      if (i >= 0) this.lastTile = i;
    };

    this.root.append(
      sheet(
        'shop-sheet',
        sheetHead('shop', S.shop.title, S.shop.subtitle, aside),
        h('div', 'shop-grid sheet-scroll', ...this.tiles.map((t) => t.el)),
        sheetFooter(
          h('div', 'foot-left', this.mainRow, this.confirmRow),
          titleBlock('shop', S.shop.title),
        ),
      ),
    );
  }

  protected render(): void {
    this.update();
    this.showMain(this.tiles[this.lastTile]!.el);
  }

  protected override back(): void {
    if (!this.confirming) {
      this.host.back();
      return;
    }
    this.host.sound.play('back');
    this.showMain(this.refundBtn);
  }

  private update(): void {
    const save = this.host.meta.save;
    this.balance.replaceChildren(splitterAmount(save.splitter, 'splitter-amount big', 24));
    const spent = totalSpent(save);
    this.spent.textContent = S.shop.spent(num(spent));
    this.refundBtn.disabled = spent === 0;
    const tier = metaTier(save);
    this.tierBadges.forEach((b, i) => b.classList.toggle('on', i < tier));
    for (const t of this.tiles) this.fillTile(t);
  }

  /** Rank, rank bar and price; locked entries name their Beweis instead. */
  private fillTile(t: Tile): void {
    const save = this.host.meta.save;
    const rank = rankOf(save, t.def);
    const open = entryUnlocked(save, t.def);
    const max = maxRankOf(save, t.def);
    const maxed = rank >= t.def.ranks[3];
    const capped = open && !maxed && rank >= max;
    t.el.classList.toggle('locked', !open);
    t.el.classList.toggle('maxed', maxed);
    t.el.classList.toggle('capped', capped);
    t.el.classList.toggle('poor', open && rank < max && !canBuy(save, t.def));
    t.rank.textContent = open ? S.shop.rank(rank, max) : S.select.locked;
    t.cells.forEach((c, i) => {
      c.classList.toggle('own', i < rank);
      c.classList.toggle('open', i >= rank && i < max);
      c.classList.toggle('shut', i >= max && i >= rank);
    });
    if (!open) {
      const proof = proofFor(`meta:${t.def.id}`);
      t.cost.replaceChildren(proof ? S.select.lockedBy(proof.name) : S.select.locked);
    } else if (maxed) t.cost.replaceChildren(S.shop.max);
    else if (capped) t.cost.replaceChildren(S.shop.needTier);
    else t.cost.replaceChildren(splitterAmount(upgradeCost(t.def, rank), 'splitter-amount'));
  }

  private purchase(t: Tile): void {
    const save = this.host.meta.save;
    if (!buy(save, t.def)) {
      this.host.sound.play('deny');
      replay(t.el, 'denied');
      return;
    }
    this.host.meta.commit();
    this.host.sound.play('buy');
    this.update();
    replay(t.el, 'bought');
  }

  private askRefund(): void {
    if (this.refundBtn.disabled) return;
    this.confirming = true;
    this.prompt.textContent = S.shop.refundConfirm(num(totalSpent(this.host.meta.save)));
    show(this.mainRow, false);
    show(this.confirmRow, true);
    // Starts on "Abbrechen" so a double press never refunds by accident.
    this.nav.set([this.yesBtn, this.noBtn], 1);
    this.host.sound.play('open');
  }

  private refund(): void {
    refundAll(this.host.meta.save);
    this.host.meta.commit();
    this.host.sound.play('buy');
    this.update();
    this.showMain(this.tiles[0]!.el);
  }

  /** Main footer (back, refund) with the tiles; `focus` must be one of those items. */
  private showMain(focus: HTMLElement): void {
    this.confirming = false;
    show(this.mainRow, true);
    show(this.confirmRow, false);
    const items: HTMLElement[] = [...this.tiles.map((t) => t.el), this.backBtn, this.refundBtn];
    const target = focus === this.refundBtn && this.refundBtn.disabled ? this.backBtn : focus;
    this.nav.set(items, Math.max(0, items.indexOf(target)));
  }
}
