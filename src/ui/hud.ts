import { hex } from '../content/palette.ts';
import { S, clock, num } from '../content/strings.de.ts';
import { xpForLevel } from '../content/tuning.ts';
import type { CubeReward, SimEvent } from '../sim/events.ts';
import { bossProgress } from '../sim/systems/boss.ts';
import type { World } from '../sim/world.ts';
import { buildSignature, buildSvg } from './buildView.ts';
import { rewardText } from './cardText.ts';
import { h, replay, setText, shapeIcon, shapePaths, show, svg } from './dom.ts';

const BANNER_TIME = 2.4;
const TOAST_TIME = 4.5;
const SKILL_R = 22;
const SKILL_C = 2 * Math.PI * SKILL_R;

interface Banner {
  title: string;
  sub: string;
  color: number;
}

/**
 * In-run overlay: XP bar, timer, level/kills, splitter, boss bar, build polygon, skill ring,
 * position, banners and cube toasts. Values are written only when they change.
 */
export class Hud {
  readonly root: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly level: HTMLElement;
  private readonly kills: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly splitter: HTMLElement;
  private readonly bossWrap: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly buildHost: HTMLElement;
  private readonly skillArc: SVGCircleElement;
  private readonly skillHost: HTMLElement;
  private readonly skillIconHost: SVGGElement;
  private readonly position: HTMLElement;
  private readonly god: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly toasts: HTMLElement;

  private buildSig = '';
  private xpShown = -1;
  private bossShown = -1;
  private skillShown = -1;
  private skillAbility = '';
  private readonly bannerQueue: Banner[] = [];
  private bannerTime = 0;

  constructor(parent: HTMLElement) {
    this.xpFill = h('div', 'xp-fill');
    this.level = h('span', 'hud-level');
    this.kills = h('span', 'hud-kills');
    this.timer = h('div', 'hud-timer');
    this.splitter = h('span', 'hud-splitter-value');
    this.bossFill = h('div', 'boss-fill');
    this.bossWrap = h(
      'div',
      'boss-bar hidden',
      h('div', 'boss-name', S.hud.boss),
      h('div', 'boss-track', this.bossFill),
    );
    this.buildHost = h('div', 'hud-build');
    this.skillArc = svg('circle', {
      cx: 30,
      cy: 30,
      r: SKILL_R,
      fill: 'none',
      stroke: '#3ff0ff',
      'stroke-width': 4,
      'stroke-dasharray': SKILL_C.toFixed(2),
      'stroke-dashoffset': 0,
      transform: 'rotate(-90 30 30)',
      'stroke-linecap': 'round',
    });
    this.skillIconHost = svg('g', {});
    const skillSvg = svg(
      'svg',
      { viewBox: '0 0 60 60', width: 60, height: 60 },
      svg('circle', {
        cx: 30,
        cy: 30,
        r: SKILL_R,
        fill: 'rgba(7,8,13,0.7)',
        stroke: 'rgba(255,255,255,0.12)',
        'stroke-width': 4,
      }),
      this.skillArc,
      this.skillIconHost,
    );
    this.skillHost = h('div', 'hud-skill', skillSvg, h('span', 'hud-skill-key', S.keys.skill));
    this.position = h('div', 'hud-position');
    this.god = h('div', 'hud-god hidden', S.hud.god);
    this.bannerTitle = h('div', 'banner-title');
    this.bannerSub = h('div', 'banner-sub');
    this.banner = h('div', 'banner', this.bannerTitle, this.bannerSub);
    this.toasts = h('div', 'toasts');

    this.root = h(
      'div',
      'hud',
      h('div', 'xp-bar', this.xpFill),
      h('div', 'hud-top-left', this.level, this.kills),
      h('div', 'hud-top-center', this.timer, this.bossWrap),
      h('div', 'hud-top-right', shapeIcon('splitter', 0xb77bff, 18), this.splitter),
      this.buildHost,
      this.skillHost,
      this.position,
      this.god,
      this.banner,
      this.toasts,
    );
    parent.append(this.root);
  }

  setVisible(v: boolean): void {
    show(this.root, v);
  }

  reset(): void {
    this.buildSig = '';
    this.xpShown = -1;
    this.bossShown = -1;
    this.skillShown = -1;
    this.skillAbility = '';
    this.bannerQueue.length = 0;
    this.bannerTime = 0;
    this.banner.classList.remove('show');
    this.toasts.replaceChildren();
  }

  update(w: World, dt: number): void {
    const p = w.player;
    const xp = Math.min(1, p.xp / xpForLevel(p.level));
    const xpq = Math.round(xp * 400);
    if (xpq !== this.xpShown) {
      this.xpShown = xpq;
      this.xpFill.style.transform = `scaleX(${xp.toFixed(4)})`;
    }
    setText(this.level, `${S.hud.level} ${p.level}`);
    setText(this.kills, `${S.hud.kills} ${num(w.run.kills)}`);
    setText(this.timer, clock(w.time));
    setText(this.splitter, num(w.run.splitter));
    setText(this.position, S.hud.position(p.x, p.y));
    show(this.god, w.god);

    const bossOn = w.director.bossSpawned && !w.director.bossDefeated;
    show(this.bossWrap, bossOn);
    if (bossOn) {
      const bp = Math.round(bossProgress(w) * 500);
      if (bp !== this.bossShown) {
        this.bossShown = bp;
        this.bossFill.style.transform = `scaleX(${(bp / 500).toFixed(3)})`;
      }
    }

    const sig = buildSignature(p);
    if (sig !== this.buildSig) {
      this.buildSig = sig;
      this.buildHost.replaceChildren(buildSvg(p, 132));
    }

    if (this.skillAbility !== p.ability.id) {
      this.skillAbility = p.ability.id;
      this.skillIconHost.replaceChildren();
      shapePaths(
        this.skillIconHost,
        p.ability.id === 'vektor' ? 'dart' : 'star5',
        30,
        30,
        10,
        p.char.color,
        2,
      );
      this.skillArc.setAttribute('stroke', hex(p.char.color));
    }
    const cd = p.abilityCdMax > 0 ? Math.max(0, p.abilityCd) / p.abilityCdMax : 0;
    const cdq = Math.round(cd * 200);
    if (cdq !== this.skillShown) {
      this.skillShown = cdq;
      this.skillArc.setAttribute('stroke-dashoffset', (SKILL_C * cd).toFixed(2));
      this.skillHost.classList.toggle('ready', cd <= 0);
    }

    this.updateBanner(dt);
  }

  handleEvent(ev: SimEvent, w: World): void {
    switch (ev.type) {
      case 'morph':
        this.pushBanner(S.banner.morph(ev.vertices), S.banner.morphSub, w.player.char.color);
        break;
      case 'elite':
        this.pushBanner(S.banner.elite, S.banner.eliteSub, 0xffffff);
        break;
      case 'formation':
        this.pushBanner(ev.kind === 'ring' ? S.banner.ring : S.banner.line, '', 0xff3b5c);
        break;
      case 'boss':
        this.pushBanner(S.banner.boss, S.banner.bossSub, 0xff2e63);
        break;
      case 'bossDefeated':
        this.pushBanner(S.banner.bossDefeated, '', 0xffd23f);
        break;
      case 'theorem':
        this.pushBanner(S.banner.theorem, '', 0xffd23f);
        break;
      case 'revive':
        this.pushBanner(S.banner.revive, '', 0xffffff);
        break;
      case 'pickup':
        if (ev.kind === 'slow') this.pushBanner(S.banner.slow, '', 0x7ad7ff);
        else if (ev.kind === 'sum') this.pushBanner(S.banner.sum, '', 0xffffff);
        else if (ev.kind === 'bomb') this.pushBanner(S.banner.bomb, '', 0xff9a3c);
        break;
      case 'upgradeCube':
        this.showCube(ev.rewards);
        break;
      default:
        break;
    }
  }

  private pushBanner(title: string, sub: string, color: number): void {
    // Same banner twice in a row (double elite) collapses into one.
    const last = this.bannerQueue[this.bannerQueue.length - 1];
    if (last?.title === title) return;
    this.bannerQueue.push({ title, sub, color });
  }

  private updateBanner(dt: number): void {
    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) this.banner.classList.remove('show');
      return;
    }
    const next = this.bannerQueue.shift();
    if (!next) return;
    setText(this.bannerTitle, next.title);
    setText(this.bannerSub, next.sub);
    this.banner.style.setProperty('--banner-color', hex(next.color));
    replay(this.banner, 'show');
    this.bannerTime = BANNER_TIME;
  }

  private showCube(rewards: readonly CubeReward[]): void {
    const box = h(
      'div',
      'toast',
      h('div', 'toast-title', shapeIcon('cube', 0xffd23f, 18), S.cube.title),
    );
    for (const r of rewards) {
      const t = rewardText(r);
      box.append(h('div', 'toast-line', shapeIcon(t.icon, t.color, 16), t.text));
    }
    this.toasts.append(box);
    window.setTimeout(() => {
      box.classList.add('leaving');
      window.setTimeout(() => {
        box.remove();
      }, 400);
    }, TOAST_TIME * 1000);
  }
}
