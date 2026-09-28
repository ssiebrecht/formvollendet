import type { Card } from './draft.ts';
import { bossDist, enemiesInCircle } from './query.ts';
import { AI_ATTACK, AI_WINDUP } from './systems/enemies.ts';
import type { InputState } from './systems/player.ts';
import type { Enemy, World } from './world.ts';

/**
 * Autopilot for the balance sim and the title screen's attract mode. Each tick it scores a ring
 * of candidate directions: danger from enemies and bullets along a short lookahead, pull toward
 * a goal, a little momentum. Goals, strongest first: a cube (with the signature skill once it is
 * in reach), a heal when hurt, the nearest elite carrying a cube or a boss piece, else crystals.
 * On the way to a cube or an elite it only minds what is close or telegraphing. Deterministic and
 * allocation-free; the only state it keeps is last tick's direction, read back from `out`, so
 * each run should own its InputState.
 */

const DIRECTIONS = 16;
const LOOKAHEAD = [28, 64, 110] as const;
const THREAT_RADIUS = 280;
const GEM_RADIUS = 520;
/** Goal weights against the danger map: cubes are worth a hit, crystals are not. */
const CUBE_PULL = 2;
const HUNT_PULL = 0.9;
const GEM_PULL = 0.5;
/** Hunting an elite stops this close, where orbits and auras reach it. */
const HUNT_RANGE = 40;
/** Gap below which the hunted elite counts as danger again. */
const PREY_CONTACT = 16;
/** Gap beyond which enemies are ignored while going for a cube or an elite. */
const FOCUS_GAP = 60;
/** A cube this close gets the signature skill: Vektor's dash reaches it, Supernova clears the way. */
const RUSH_RANGE = 160;
const DIR_X = Float64Array.from({ length: DIRECTIONS }, (_, i) =>
  Math.cos((i * Math.PI * 2) / DIRECTIONS),
);
const DIR_Y = Float64Array.from({ length: DIRECTIONS }, (_, i) =>
  Math.sin((i * Math.PI * 2) / DIRECTIONS),
);
const scores = new Float64Array(DIRECTIONS);
const near: Enemy[] = [];

export function botInput(w: World, out: InputState): InputState {
  const p = w.player;
  const lastX = out.moveX;
  const lastY = out.moveY;

  // Goals, strongest first: a cube, a heal when hurt, the nearest elite with a cube or boss
  // piece, else crystals.
  let gx = 0;
  let gy = 0;
  let pull = GEM_PULL;
  let best = GEM_RADIUS * GEM_RADIUS;
  for (let i = 0; i < w.gems.count; i++) {
    const g = w.gems.items[i]!;
    if (g.attracted) continue;
    const d2 = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
    const value = d2 / (1 + g.value * 0.2);
    if (value < best) {
      best = value;
      const d = Math.sqrt(d2) || 1;
      gx = (g.x - p.x) / d;
      gy = (g.y - p.y) / d;
    }
  }
  let goal = false;
  let cubeDist = Infinity;
  for (let i = 0; i < w.pickups.count && !goal; i++) {
    const pk = w.pickups.items[i]!;
    if (pk.kind !== 'vertexCube' && pk.kind !== 'upgradeCube') continue;
    goal = aim(pk.x - p.x, pk.y - p.y, 0);
    pull = CUBE_PULL;
    cubeDist = Math.hypot(pk.x - p.x, pk.y - p.y);
  }
  // A cube within reach of the signature skill: go straight for it, the way a player would.
  if (cubeDist < RUSH_RANGE && p.abilityCd <= 0) {
    out.moveX = aimX;
    out.moveY = aimY;
    out.ability = true;
    return out;
  }
  const hurt = p.hp < w.stats.maxHp * 0.7;
  for (let i = 0; i < w.pickups.count && !goal && hurt; i++) {
    const pk = w.pickups.items[i]!;
    if (pk.kind === 'heal' && Math.hypot(pk.x - p.x, pk.y - p.y) < 600) {
      goal = aim(pk.x - p.x, pk.y - p.y, 0);
      pull = GEM_PULL;
    }
  }
  let prey: Enemy | null = null;
  if (!goal && p.hp > w.stats.maxHp * 0.5) {
    let nearest = Infinity;
    for (let i = 0; i < w.enemies.count; i++) {
      const e = w.enemies.items[i]!;
      if (!e.alive || (e.drop === null && e.boss < 0)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nearest) {
        nearest = d;
        prey = e;
      }
    }
    if (prey) {
      goal = aim(prey.x - p.x, prey.y - p.y, HUNT_RANGE + prey.r);
      pull = HUNT_PULL;
    }
  }
  if (goal) {
    gx = aimX;
    gy = aimY;
  }

  const focus = pull > GEM_PULL;
  scores.fill(0);
  const n = enemiesInCircle(w, p.x, p.y, THREAT_RADIUS, near);
  let close = 0;

  for (let k = 0; k < DIRECTIONS; k++) {
    const dx = DIR_X[k]!;
    const dy = DIR_Y[k]!;
    let danger = 0;
    for (const look of LOOKAHEAD) {
      const qx = p.x + dx * look;
      const qy = p.y + dy * look;
      for (let i = 0; i < n; i++) {
        const e = near[i]!;
        const gap = e.boss >= 0 ? bossDist(e, qx, qy) : Math.hypot(qx - e.x, qy - e.y) - e.r;
        // A lit star threatens its whole blast circle, which its telegraph shows.
        const ai = e.def.ai;
        if (ai.kind === 'kamikaze' && e.state === AI_WINDUP) {
          const blast = ai.radius * (e.elite ? 1.6 : 1) + 12;
          if (Math.hypot(qx - e.x, qy - e.y) < blast) danger += (ai.damage + 4) / 64;
        }
        // The hunted elite only counts on contact, or the bot would never close in; while going
        // for a cube or an elite it only minds what is close or telegraphing an attack.
        const calm = e.state !== AI_WINDUP && e.state !== AI_ATTACK;
        if (calm && (e === prey ? gap > PREY_CONTACT : focus && gap > FOCUS_GAP)) continue;
        const d = Math.max(gap, 4);
        danger += (e.damage + 4) / (d * d);
      }
      for (let i = 0; i < w.bullets.count; i++) {
        const b = w.bullets.items[i]!;
        // Where the bullet will be when we get there (player ~160 px/s).
        const t = look / 160;
        const bx = b.x + b.vx * t;
        const by = b.y + b.vy * t;
        const d = Math.max(Math.hypot(qx - bx, qy - by), 4);
        if (d < 90) danger += (b.damage + 4) / (d * d);
      }
    }
    scores[k] = -danger * 60 + (dx * lastX + dy * lastY) * 0.08;
  }
  for (let i = 0; i < n; i++) {
    const e = near[i]!;
    if (Math.hypot(e.x - p.x, e.y - p.y) - e.r < 50) close++;
  }

  // Drift back toward the origin when far away so runs stay comparable.
  const home = Math.hypot(p.x, p.y);
  const hx = home > 1500 ? -p.x / home : 0;
  const hy = home > 1500 ? -p.y / home : 0;

  let pick = 0;
  let top = -Infinity;
  for (let k = 0; k < DIRECTIONS; k++) {
    const s =
      scores[k]! +
      (DIR_X[k]! * gx + DIR_Y[k]! * gy) * pull +
      (DIR_X[k]! * hx + DIR_Y[k]! * hy) * 0.3;
    if (s > top) {
      top = s;
      pick = k;
    }
  }
  out.moveX = DIR_X[pick]!;
  out.moveY = DIR_Y[pick]!;
  out.ability = close >= 3 || (close > 0 && p.hp < w.stats.maxHp * 0.35);
  return out;
}

let aimX = 0;
let aimY = 0;

/** Unit direction toward (dx, dy) into aimX/aimY, zero once within `stop`; always claims the goal. */
function aim(dx: number, dy: number, stop: number): boolean {
  const d = Math.hypot(dx, dy);
  aimX = d > stop && d > 0 ? dx / d : 0;
  aimY = d > stop && d > 0 ? dy / d : 0;
  return true;
}

const PRIORITY: Record<Card['kind'], number> = {
  theorem: 0,
  upgradeWeapon: 1,
  newWeapon: 2,
  upgradeAxiom: 3,
  newAxiom: 4,
  heal: 5,
  splitter: 6,
};

/** Card choice: theorems first, then weapon levels, new weapons, axioms. */
export function botChoose(cards: readonly Card[]): number {
  let best = 0;
  for (let i = 1; i < cards.length; i++) {
    if (PRIORITY[cards[i]!.kind] < PRIORITY[cards[best]!.kind]) best = i;
  }
  return best;
}
