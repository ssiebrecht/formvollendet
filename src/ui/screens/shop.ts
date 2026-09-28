import { META_UPGRADES } from '../../content/meta.ts';
import { COLORS } from '../../content/palette.ts';
import { S, num } from '../../content/strings.de.ts';
import type { MetaUpgradeDef, StatKey } from '../../content/types.ts';
import { buy, canBuy, rankOf, refundAll, totalSpent, upgradeCost } from '../../meta/progression.ts';
import { h, replay, shapeIcon, show } from '../dom.ts';
import {
  Screen,
  type ScreenHost,
  backButton,
  pips,
  sheet,
  sheetFooter,
  sheetHead,
  splitterAmount,
  titleBlock,
} from './screen.ts';

/** Tile colour by what an upgrade does: attack, survival, economy, draft control. */
const TONES: Partial<Record<StatKey, string>> = {
  might: 'var(--cyan)',
  cooldown: 'var(--cyan)',
  area: 'var(--cyan)',
  projSpeed: 'var(--cyan)',
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
const ICON_COLORS: Partial<Record<StatKey, number>> = {
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
};

interface Tile {
  def: MetaUpgradeDef;
  el: HTMLButtonElement;
  rank: HTMLElement;
  pips: HTMLElement;
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
      const pipsEl = h('span', 'st-pips');
      const cost = h('span', 'st-cost');
      const el = h(
        'button',
        'shop-tile cad',
        h('div', 'st-head', shapeIcon(def.icon, ICON_COLORS[def.stat] ?? 0x3ff0ff, 26), rank),
        h('div', 'st-name', def.name),
        h('div', 'st-desc', def.desc),
        h('div', 'st-foot', pipsEl, cost),
      );
      el.style.setProperty('--tone', TONES[def.stat] ?? 'var(--violet)');
      const tile = { def, el, rank, pips: pipsEl, cost };
      el.addEventListener('click', () => {
        this.purchase(tile);
      });
      this.tiles.push(tile);
    }

    this.balance = h('div', 'sb-amount');
    this.spent = h('div', 'sb-spent');
    const aside = h(
      'div',
      'shop-balance',
      h('div', 'sb-label', S.shop.balance),
      this.balance,
      this.spent,
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
    for (const t of this.tiles) {
      const rank = rankOf(save, t.def);
      const maxed = rank >= t.def.maxRank;
      t.el.classList.toggle('maxed', maxed);
      t.el.classList.toggle('poor', !maxed && !canBuy(save, t.def));
      t.rank.textContent = S.shop.rank(rank, t.def.maxRank);
      t.pips.replaceChildren(pips(rank, t.def.maxRank));
      t.cost.replaceChildren(
        maxed ? S.shop.max : splitterAmount(upgradeCost(t.def, rank), 'splitter-amount'),
      );
    }
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
