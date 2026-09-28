import { COLORS } from '../../content/palette.ts';
import { DT, PLAYER, ticks } from '../../content/tuning.ts';
import type { SupernovaDef, VektorDef } from '../../content/types.ts';
import { enemiesInCircle } from '../query.ts';
import type { Enemy, World } from '../world.ts';
import { ABILITY_SLOT } from '../world.ts';
import { healPlayer, knockResist } from './combat.ts';
import { spawnProjectile } from './spawn.ts';

export interface InputState {
  /** Movement axis, -1..1 each; longer vectors are clamped to length 1. */
  moveX: number;
  moveY: number;
  /** Signature ability pressed since the last tick. */
  ability: boolean;
}

/** Seconds an early ability press is remembered, so a press just before the cooldown ends counts. */
const ABILITY_BUFFER = 0.15;
/** Sphäre lifesteal budget: HP per second and burst cap. */
const HEAL_BUDGET_RATE = 3;
const DASH_LINE_HALF_WIDTH = 10;

const near: Enemy[] = [];

export function updatePlayer(w: World, input: InputState): void {
  const p = w.player;
  p.px = p.x;
  p.py = p.y;
  p.prot = p.rot;
  p.rot += PLAYER.spin * DT;
  if (p.iframes > 0) p.iframes--;
  if (p.abilityCd > 0) p.abilityCd--;
  p.healBudget = Math.min(HEAL_BUDGET_RATE, p.healBudget + HEAL_BUDGET_RATE * DT);
  if (w.stats.regen > 0) healPlayer(w, w.stats.regen * DT);

  let mx = input.moveX;
  let my = input.moveY;
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  if (l > 0.2) {
    const ml = Math.min(l, 1);
    p.fx = mx / ml;
    p.fy = my / ml;
  }

  if (input.ability) p.abilityBuffer = ticks(ABILITY_BUFFER);
  else if (p.abilityBuffer > 0) p.abilityBuffer--;
  if (p.abilityBuffer > 0 && p.abilityCd <= 0 && p.dashTicks <= 0) {
    p.abilityBuffer = 0;
    useAbility(w);
  }

  if (p.dashTicks > 0) {
    p.x += p.dashVx * DT;
    p.y += p.dashVy * DT;
    p.dashTicks--;
  } else {
    const speed = p.char.moveSpeed * w.stats.moveSpeed;
    p.x += mx * speed * DT;
    p.y += my * speed * DT;
  }
}

function useAbility(w: World): void {
  const p = w.player;
  const def = p.ability;
  p.abilityCdMax = ticks(def.cooldown * w.stats.cooldown);
  p.abilityCd = p.abilityCdMax;
  switch (def.id) {
    case 'vektor':
      vektor(w, def);
      break;
    case 'supernova':
      supernova(w, def);
      break;
  }
  w.events.push({ type: 'ability', ability: def.id, x: p.x, y: p.y });
}

/** Delta: dash along the facing direction and leave a damaging line behind. */
function vektor(w: World, def: VektorDef): void {
  const p = w.player;
  const dist = def.distance;
  const dt = ticks(def.dashTime);
  p.dashTicks = dt;
  p.dashVx = (p.fx * dist) / (dt * DT);
  p.dashVy = (p.fy * dist) / (dt * DT);
  p.iframes = Math.max(p.iframes, ticks(def.iframes));
  const h = w.hazards.spawn();
  if (!h) return;
  h.x1 = p.x;
  h.y1 = p.y;
  h.x2 = p.x + p.fx * dist;
  h.y2 = p.y + p.fy * dist;
  h.life = h.maxLife = ticks(def.lineLife);
  h.damage = def.damage * w.stats.might;
  h.halfWidth = DASH_LINE_HALF_WIDTH;
  h.hitCount = 0;
}

/** Nova: radial burst of shards plus a shove that clears breathing room. */
function supernova(w: World, def: SupernovaDef): void {
  const p = w.player;
  const off = w.rng.angle();
  for (let i = 0; i < def.shards; i++) {
    const a = off + (i * Math.PI * 2) / def.shards;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pr = spawnProjectile(
      w,
      'shard',
      'supernova',
      ABILITY_SLOT,
      'shard',
      COLORS.nova,
      p.x + c * 12,
      p.y + s * 12,
      c * def.speed * w.stats.projSpeed,
      s * def.speed * w.stats.projSpeed,
    );
    if (!pr) break;
    pr.r = 7;
    pr.damage = def.damage * w.stats.might;
    pr.pierce = def.pierce;
    pr.life = ticks(0.8);
    pr.knockback = 120;
  }
  const n = enemiesInCircle(w, p.x, p.y, def.knockRadius, near);
  for (let i = 0; i < n; i++) {
    const e = near[i]!;
    if (e.boss >= 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const falloff = 1 - 0.5 * Math.min(1, d / def.knockRadius);
    const k = def.knockPower * falloff * (1 - knockResist(e));
    e.kx += (dx / d) * k;
    e.ky += (dy / d) * k;
  }
  p.iframes = Math.max(p.iframes, ticks(def.iframes));
}
