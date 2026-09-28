import { DT, ticks } from '../../content/tuning.ts';
import { vertexAngle } from '../math/geometry.ts';
import { TAU } from '../math/vec.ts';
import { enemiesInCircle, enemiesNearSegment, nearestEnemies } from '../query.ts';
import type { Enemy, WeaponSlot, World } from '../world.ts';
import { MAX_BEAM_SEGMENTS, MAX_ORBIT_BODIES, vertexX, vertexY } from '../world.ts';
import { damageEnemy, healPlayer, type HitOptions } from './combat.ts';
import { spawnProjectile } from './spawn.ts';

/** Angular gap between extra bolts of one volley. */
const BOLT_SPREAD = 0.14;
/** Fourier fan: extra copies at ±30°. */
const WAVE_FAN = Math.PI / 6;
/** Strahl fan: ±12° per extra beam. */
const BEAM_FAN = (12 * Math.PI) / 180;
/** Prisma: the beam splits after this many pixels into spectral beams ±15° apart. */
const PRISM_SPLIT = 120;
const PRISM_ANGLE = (15 * Math.PI) / 180;
const ORB_RADIUS = 9;
const MOON_RADIUS = 5;
const MOON_ORBIT = 28;
const MOON_SPEED = -2.5;
const PULSE_REACH = 1.35;
const PULSE_KNOCK = 380;

const near: Enemy[] = [];
const targets: Enemy[] = [];
const hit: HitOptions = { dirX: 0, dirY: 0, knock: 0, canCrit: true };

export function updateWeapons(w: World): void {
  const p = w.player;
  for (let i = 0; i < p.vertices; i++) {
    const slot = p.weapons[i];
    if (!slot) continue;
    switch (slot.def.kind) {
      case 'bolt':
        updateBolt(w, slot, i);
        break;
      case 'orbit':
        updateOrbit(w, slot, i);
        break;
      case 'wave':
        updateWave(w, slot, i);
        break;
      case 'aura':
        updateAura(w, slot, i);
        break;
      case 'beam':
        updateBeam(w, slot, i);
        break;
      case 'fractal':
        updateFractal(w, slot, i);
        break;
    }
  }
}

function count(v: number): number {
  return Math.max(1, Math.round(v));
}

function setHit(dx: number, dy: number, knock: number): HitOptions {
  const l = Math.hypot(dx, dy) || 1;
  hit.dirX = dx / l;
  hit.dirY = dy / l;
  hit.knock = knock;
  return hit;
}

// ------------------------------------------------------------------------------------ Spitze

function updateBolt(w: World, slot: WeaponSlot, i: number): void {
  if (slot.cd > 0) {
    slot.cd--;
    return;
  }
  const p = w.player;
  const wp = slot.p;
  const amount = count(wp.amount);
  if (wp.allVertices > 0) {
    // Sternpolygon: a radial volley from every vertex; the spin sweeps it around.
    for (let v = 0; v < p.vertices; v++) {
      const a0 = vertexAngle(v, p.vertices, p.rot);
      const sx = vertexX(p, v);
      const sy = vertexY(p, v);
      for (let k = 0; k < amount; k++) {
        const a = a0 + (k - (amount - 1) / 2) * BOLT_SPREAD;
        spawnBolt(w, slot, i, sx, sy, a);
      }
    }
  } else {
    const n = nearestEnemies(w, p.x, p.y, wp.speed * wp.duration, amount, targets);
    // No target in range: hold fire and stay ready.
    if (n === 0) return;
    const sx = vertexX(p, i);
    const sy = vertexY(p, i);
    for (let k = 0; k < amount; k++) {
      const e = targets[k % n]!;
      let a = Math.atan2(e.y - sy, e.x - sx);
      if (k >= n) {
        // More bolts than targets: fan the surplus around the aimed ones.
        const extra = k - n;
        a += (extra % 2 === 0 ? 1 : -1) * BOLT_SPREAD * (1 + (extra >> 1));
      }
      spawnBolt(w, slot, i, sx, sy, a);
    }
  }
  slot.cd = ticks(wp.cooldown);
  w.events.push({ type: 'fire', weapon: slot.def.id });
}

function spawnBolt(w: World, slot: WeaponSlot, i: number, x: number, y: number, a: number): void {
  const wp = slot.p;
  const pr = spawnProjectile(
    w,
    'bolt',
    slot.def.id,
    i,
    'dart',
    slot.def.color,
    x,
    y,
    Math.cos(a) * wp.speed,
    Math.sin(a) * wp.speed,
  );
  if (!pr) return;
  pr.r = 5 * wp.area;
  pr.damage = wp.damage;
  pr.pierce = wp.pierce;
  pr.life = ticks(wp.duration);
  pr.knockback = wp.knockback;
}

// --------------------------------------------------------------------------------- Kreisbahn

function updateOrbit(w: World, slot: WeaponSlot, i: number): void {
  const p = w.player;
  const wp = slot.p;
  const amount = count(wp.amount);
  const moons = Math.round(wp.moons);
  slot.phase += wp.orbitSpeed * DT;
  const bodies = slot.bodies;
  const prev = slot.prevBodies;
  const before = slot.bodyCount;
  prev.set(bodies);
  const bodyR = ORB_RADIUS * wp.area;
  const moonR = MOON_RADIUS * wp.area;
  const moonOrbit = MOON_ORBIT * wp.area;
  let n = 0;
  for (let k = 0; k < amount && n < MAX_ORBIT_BODIES; k++) {
    const a = slot.phase + (k * TAU) / amount;
    const bx = p.x + Math.cos(a) * wp.radius;
    const by = p.y + Math.sin(a) * wp.radius;
    bodies[n * 2] = bx;
    bodies[n * 2 + 1] = by;
    slot.bodyRadius[n++] = bodyR;
    // Epizykel: moons circle each body in the opposite sense (spirograph traces).
    for (let m = 0; m < moons && n < MAX_ORBIT_BODIES; m++) {
      const b = slot.phase * MOON_SPEED + (m * TAU) / moons;
      bodies[n * 2] = bx + Math.cos(b) * moonOrbit;
      bodies[n * 2 + 1] = by + Math.sin(b) * moonOrbit;
      slot.bodyRadius[n++] = moonR;
    }
  }
  // New bodies (level-up) must not interpolate in from wherever the slot data pointed before.
  if (n !== before) prev.set(bodies);
  slot.bodyCount = n;

  const interval = ticks(wp.hitInterval);
  for (let b = 0; b < n; b++) {
    const bx = bodies[b * 2]!;
    const by = bodies[b * 2 + 1]!;
    const m = enemiesInCircle(w, bx, by, slot.bodyRadius[b]!, near);
    for (let j = 0; j < m; j++) {
      const e = near[j]!;
      if (w.tick - e.lastHit[i]! < interval) continue;
      e.lastHit[i] = w.tick;
      damageEnemy(w, e, wp.damage, slot.def.id, setHit(e.x - p.x, e.y - p.y, wp.knockback));
    }
  }
}

// ------------------------------------------------------------------------------------- Welle

function updateWave(w: World, slot: WeaponSlot, i: number): void {
  if (slot.cd > 0) {
    slot.cd--;
    return;
  }
  const p = w.player;
  const wp = slot.p;
  const amount = count(wp.amount);
  const fan = Math.round(wp.fan);
  const base = Math.atan2(p.fy, p.fx);
  // Wave 2 fires backwards; more waves split the circle evenly.
  for (let k = 0; k < amount; k++) {
    const a = base + (k * TAU) / amount;
    for (let f = -fan; f <= fan; f++) spawnWave(w, slot, i, a + f * WAVE_FAN);
  }
  slot.cd = ticks(wp.cooldown);
  w.events.push({ type: 'fire', weapon: slot.def.id });
}

function spawnWave(w: World, slot: WeaponSlot, i: number, a: number): void {
  const p = w.player;
  const wp = slot.p;
  const pr = spawnProjectile(w, 'wave', slot.def.id, i, 'wavedot', slot.def.color, p.x, p.y, 0, 0);
  if (!pr) return;
  pr.dx = Math.cos(a);
  pr.dy = Math.sin(a);
  pr.speed = wp.speed;
  pr.amp = wp.amplitude;
  pr.wavelength = wp.wavelength * wp.area;
  pr.harmonics = Math.round(wp.harmonics);
  pr.r = 10 * wp.area;
  pr.damage = wp.damage;
  pr.pierce = wp.pierce;
  pr.life = ticks(wp.duration);
  pr.knockback = wp.knockback;
  pr.rot = a;
}

// ------------------------------------------------------------------------------------ Zirkel

function updateAura(w: World, slot: WeaponSlot, i: number): void {
  const p = w.player;
  const wp = slot.p;
  const interval = ticks(wp.hitInterval);
  const m = enemiesInCircle(w, p.x, p.y, wp.radius, near);
  for (let j = 0; j < m; j++) {
    const e = near[j]!;
    if (w.tick - e.lastHit[i]! < interval) continue;
    e.lastHit[i] = w.tick;
    if (wp.slow > 0) {
      e.slowTicks = interval + 2;
      e.slowFactor = 1 - wp.slow;
    }
    const killed = damageEnemy(
      w,
      e,
      wp.damage,
      slot.def.id,
      setHit(e.x - p.x, e.y - p.y, wp.knockback),
    );
    if (killed && wp.heal > 0 && p.healBudget >= wp.heal) {
      p.healBudget -= wp.heal;
      healPlayer(w, wp.heal);
    }
  }
  if (wp.pulse <= 0) return;
  // Sphäre: periodic shock pulse with heavy knockback.
  if (slot.pulseCd > 0) {
    slot.pulseCd--;
    return;
  }
  slot.pulseCd = ticks(wp.pulse);
  const R = wp.radius * PULSE_REACH;
  const n = enemiesInCircle(w, p.x, p.y, R, near);
  for (let j = 0; j < n; j++) {
    const e = near[j]!;
    damageEnemy(w, e, wp.damage * 3, slot.def.id, setHit(e.x - p.x, e.y - p.y, PULSE_KNOCK));
  }
  w.events.push({ type: 'pulse', x: p.x, y: p.y, r: R, color: slot.def.color });
}

// ------------------------------------------------------------------------------------ Strahl

function updateBeam(w: World, slot: WeaponSlot, i: number): void {
  const p = w.player;
  const wp = slot.p;
  if (wp.alwaysOn > 0) slot.active = 1;
  else if (slot.active > 0) {
    slot.active--;
    // The cooldown only starts once the beam is off.
    if (slot.active === 0) slot.cd = ticks(wp.cooldown);
  } else if (slot.cd > 0) slot.cd--;
  else {
    slot.active = ticks(wp.duration);
    w.events.push({ type: 'fire', weapon: slot.def.id });
  }
  if (slot.active <= 0) {
    slot.beamCount = 0;
    return;
  }

  const amount = count(wp.amount);
  const prism = Math.round(wp.prism);
  const a0 = vertexAngle(i, p.vertices, p.rot);
  const sx = vertexX(p, i);
  const sy = vertexY(p, i);
  const beams = slot.beams;
  let n = 0;
  for (let k = 0; k < amount; k++) {
    const a = a0 + (k - (amount - 1) / 2) * BEAM_FAN;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (prism > 0 && wp.length > PRISM_SPLIT) {
      const mx = sx + c * PRISM_SPLIT;
      const my = sy + s * PRISM_SPLIT;
      n = putBeam(beams, n, sx, sy, mx, my);
      const rest = wp.length - PRISM_SPLIT;
      for (let q = 0; q < prism; q++) {
        const b = a + (q - (prism - 1) / 2) * PRISM_ANGLE;
        n = putBeam(beams, n, mx, my, mx + Math.cos(b) * rest, my + Math.sin(b) * rest);
      }
    } else n = putBeam(beams, n, sx, sy, sx + c * wp.length, sy + s * wp.length);
  }
  slot.beamCount = n;

  const interval = ticks(wp.hitInterval);
  const hw = wp.width / 2;
  for (let b = 0; b < n; b++) {
    const x1 = beams[b * 4]!;
    const y1 = beams[b * 4 + 1]!;
    const x2 = beams[b * 4 + 2]!;
    const y2 = beams[b * 4 + 3]!;
    const m = enemiesNearSegment(w, x1, y1, x2, y2, hw, near);
    for (let j = 0; j < m; j++) {
      const e = near[j]!;
      if (w.tick - e.lastHit[i]! < interval) continue;
      e.lastHit[i] = w.tick;
      damageEnemy(w, e, wp.damage, slot.def.id, setHit(x2 - x1, y2 - y1, wp.knockback));
    }
  }
}

function putBeam(
  beams: Float64Array,
  n: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (n >= MAX_BEAM_SEGMENTS) return n;
  beams[n * 4] = x1;
  beams[n * 4 + 1] = y1;
  beams[n * 4 + 2] = x2;
  beams[n * 4 + 3] = y2;
  return n + 1;
}

// ----------------------------------------------------------------------------------- Fraktal

function updateFractal(w: World, slot: WeaponSlot, i: number): void {
  if (slot.cd > 0) {
    slot.cd--;
    return;
  }
  const p = w.player;
  const wp = slot.p;
  const amount = count(wp.amount);
  const n = nearestEnemies(w, p.x, p.y, wp.speed * wp.duration, amount, targets);
  if (n === 0) return;
  const sx = vertexX(p, i);
  const sy = vertexY(p, i);
  for (let k = 0; k < amount; k++) {
    const e = targets[k % n]!;
    const a = Math.atan2(e.y - sy, e.x - sx) + (k >= n ? (k - n + 1) * BOLT_SPREAD * 2 : 0);
    const pr = spawnProjectile(
      w,
      'fractal',
      slot.def.id,
      i,
      'fractal',
      slot.def.color,
      sx,
      sy,
      Math.cos(a) * wp.speed,
      Math.sin(a) * wp.speed,
    );
    if (!pr) break;
    pr.r = 9 * wp.area;
    pr.damage = wp.damage;
    pr.pierce = 1;
    pr.life = ticks(wp.duration);
    pr.knockback = wp.knockback;
    pr.depth = Math.round(wp.depth);
    pr.childFactor = wp.childFactor;
    pr.homing = wp.homing > 0;
  }
  slot.cd = ticks(wp.cooldown);
  w.events.push({ type: 'fire', weapon: slot.def.id });
}
