import { ENEMIES } from '../../content/enemies.ts';
import { CAPS, COMPLEXITY, DT, ELITE, ENEMY, RUN, ticks } from '../../content/tuning.ts';
import type { CubeKind, EnemyDef, EnemyId, ScriptEvent, WaveSegment } from '../../content/types.ts';
import { SCRIPT, WAVES } from '../../content/waves.ts';
import { clamp, lerp, TAU, type Vec } from '../math/vec.ts';
import type { Enemy, World } from '../world.ts';
import { spawnBoss } from './boss.ts';
import { enemyScale, type EnemyScale } from './combat.ts';

const scale: EnemyScale = { hp: 1, damage: 1, speed: 1 };

export function spawnEnemy(
  w: World,
  def: EnemyDef,
  x: number,
  y: number,
  elite = false,
  drop: CubeKind | null = null,
  eliteHp: number = ELITE.hp,
): Enemy | null {
  const e = w.enemies.spawn();
  if (!e) return null;
  enemyScale(w, scale);
  e.def = def;
  e.x = e.px = x;
  e.y = e.py = y;
  e.vx = e.vy = e.kx = e.ky = 0;
  e.r = def.radius * (elite ? ELITE.size : 1);
  e.maxHp = e.hp = def.hp * scale.hp * (elite ? eliteHp : 1);
  e.shellsMax = e.shells = elite ? Math.max(ELITE.shells, def.shells) : def.shells;
  e.speed = def.speed * scale.speed * (elite ? ELITE.speed : 1);
  e.damage = def.damage * scale.damage;
  e.xp = def.xp * (elite ? ELITE.xp : 1);
  e.elite = elite;
  e.drop = drop;
  e.boss = -1;
  e.march = false;
  e.state = 0;
  // Stagger AI timers so a freshly spawned pack does not act in lockstep.
  e.timer = ticks(1) + w.rng.int(ticks(2));
  e.timer2 = w.rng.int(ticks(1));
  e.tx = 0;
  e.ty = 0;
  e.flash = 0;
  e.slowTicks = 0;
  e.slowFactor = 1;
  e.invuln = 0;
  e.rot = w.rng.angle();
  e.rotSpeed = w.rng.range(-1.2, 1.2);
  e.lastHit.fill(-100000);
  w.run.enemiesSeen.add(def.id);
  return e;
}

/**
 * Point just outside the visible rectangle in direction `angle` from the player. Spawning on the
 * rectangle (not a circle) keeps the walk-in time equal on every side of a wide screen.
 */
export function spawnPoint(w: World, angle: number, out: Vec): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hw = w.view.halfW + ENEMY.spawnMargin;
  const hh = w.view.halfH + ENEMY.spawnMargin;
  const t = Math.min(
    Math.abs(c) > 1e-6 ? hw / Math.abs(c) : Infinity,
    Math.abs(s) > 1e-6 ? hh / Math.abs(s) : Infinity,
  );
  out.x = w.player.x + c * t;
  out.y = w.player.y + s * t;
  return out;
}

const pt: Vec = { x: 0, y: 0 };

export function segmentAt(time: number): WaveSegment {
  for (const s of WAVES) if (time < s.to) return s;
  return WAVES[WAVES.length - 1]!;
}

function pickEnemy(w: World, seg: WaveSegment): EnemyId {
  let total = 0;
  for (const p of seg.pool) total += p.weight;
  let r = w.rng.next() * total;
  for (const p of seg.pool) {
    r -= p.weight;
    if (r <= 0) return p.enemy;
  }
  return seg.pool[seg.pool.length - 1]!.enemy;
}

export function updateDirector(w: World): void {
  const d = w.director;
  while (d.scriptIndex < SCRIPT.length && SCRIPT[d.scriptIndex]!.at <= w.time) {
    runScript(w, SCRIPT[d.scriptIndex]!);
    d.scriptIndex++;
  }

  const seg = segmentAt(w.time);
  const f = clamp((w.time - seg.from) / (seg.to - seg.from), 0, 1);
  let rate = lerp(seg.rate[0], seg.rate[1], f);
  let cap: number = seg.maxAlive;
  if (w.time >= RUN.length) {
    if (w.bosses.length > 0) rate *= RUN.bossSpawnFactor;
    else if (w.cfg.endless) {
      const growth = 1 + (RUN.endlessRatePerMinute * (w.time - RUN.length)) / 60;
      rate *= growth;
      cap *= Math.min(2, growth);
    }
  }
  rate *= 1 + w.cfg.complexity * COMPLEXITY.ratePerLevel;
  cap = Math.min(cap, CAPS.enemies - 60);
  d.cap = cap;

  d.acc += rate * DT;
  while (d.acc >= 1) {
    d.acc -= 1;
    if (w.enemies.count >= cap) {
      d.acc = 0;
      break;
    }
    spawnPoint(w, w.rng.angle(), pt);
    spawnEnemy(w, ENEMIES[pickEnemy(w, seg)], pt.x, pt.y);
  }
}

export function runScript(w: World, ev: ScriptEvent): void {
  const p = w.player;
  const def = ENEMIES[ev.enemy];
  switch (ev.kind) {
    case 'elite': {
      for (let i = 0; i < ev.count; i++) {
        spawnPoint(w, w.rng.angle(), pt);
        spawnEnemy(w, def, pt.x, pt.y, true, ev.drop, ev.hp);
      }
      w.events.push({ type: 'elite', enemy: ev.enemy });
      break;
    }
    case 'ring': {
      const offset = w.rng.angle();
      for (let i = 0; i < ev.count; i++) {
        const a = offset + (i * TAU) / ev.count;
        spawnEnemy(w, def, p.x + Math.cos(a) * ev.radius, p.y + Math.sin(a) * ev.radius);
      }
      w.events.push({ type: 'formation', kind: 'ring' });
      break;
    }
    case 'line': {
      // A wall enters from one side and marches straight across.
      const side = w.rng.int(4);
      const horizontal = side < 2;
      const dirX = horizontal ? (side === 0 ? 1 : -1) : 0;
      const dirY = horizontal ? 0 : side === 2 ? 1 : -1;
      const dist = (horizontal ? w.view.halfW : w.view.halfH) + 80;
      for (let i = 0; i < ev.count; i++) {
        const off = (i - (ev.count - 1) / 2) * ev.spacing;
        const x = p.x - dirX * dist + (horizontal ? 0 : off);
        const y = p.y - dirY * dist + (horizontal ? off : 0);
        const e = spawnEnemy(w, def, x, y);
        if (!e) break;
        e.march = true;
        e.tx = dirX;
        e.ty = dirY;
      }
      w.events.push({ type: 'formation', kind: 'line' });
      break;
    }
    case 'boss':
      spawnBoss(w, def);
      break;
  }
}
