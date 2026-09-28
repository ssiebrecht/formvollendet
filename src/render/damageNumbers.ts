import { BitmapFont, BitmapText, Container } from 'pixi.js';
import { COLORS } from '../content/palette.ts';

const FONT = 'FormZahlen';
const MAX = 80;
const LIFE = 0.65;
const SIZE = 14;
const CRIT_SCALE = 1.35;

/** Glyphs are white with a dark rim, so the tint colours the fill and leaves the rim dark. */
export function installNumberFont(): void {
  BitmapFont.install({
    name: FONT,
    chars: [['0', '9'], '!+-.,:'],
    resolution: 2,
    padding: 4,
    style: {
      fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
      fontSize: 28,
      fontWeight: 'bold',
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 5, join: 'round' },
    },
  });
}

interface DamageNumber {
  text: BitmapText;
  x: number;
  y: number;
  vy: number;
  life: number;
  crit: boolean;
}

/** Floating damage numbers; a ring buffer of 80, the oldest number is recycled first. */
export class DamageNumbers {
  readonly container = new Container();
  private readonly items: DamageNumber[] = [];
  private next = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      const text = new BitmapText({ text: '', style: { fontFamily: FONT, fontSize: SIZE } });
      text.anchor.set(0.5);
      text.visible = false;
      this.container.addChild(text);
      this.items.push({ text, x: 0, y: 0, vy: 0, life: 0, crit: false });
    }
  }

  spawn(x: number, y: number, amount: number, crit: boolean): void {
    const n = this.items[this.next]!;
    this.next = (this.next + 1) % MAX;
    const v = Math.max(1, Math.round(amount));
    n.text.text = crit ? `${v}!` : String(v);
    n.text.tint = crit ? COLORS.crit : COLORS.damage;
    n.x = x + (Math.random() - 0.5) * 12;
    n.y = y - 10;
    n.vy = crit ? -90 : -60;
    n.life = LIFE;
    n.crit = crit;
    n.text.visible = true;
  }

  update(dt: number): void {
    const drag = 0.9 ** (60 * dt);
    for (const n of this.items) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.text.visible = false;
        continue;
      }
      n.vy *= drag;
      n.y += n.vy * dt;
      const age = LIFE - n.life;
      // Crits pop in large and settle.
      const pop = n.crit ? CRIT_SCALE + Math.max(0, 0.5 - age * 4) : 1;
      n.text.position.set(n.x, n.y);
      n.text.scale.set(pop);
      n.text.alpha = Math.min(1, n.life / 0.25);
    }
  }

  reset(): void {
    for (const n of this.items) {
      n.life = 0;
      n.text.visible = false;
    }
  }
}
