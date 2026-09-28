import { AXIOM_LIST } from '../content/axioms.ts';
import { CHARACTERS } from '../content/characters.ts';
import { ENEMIES, ENEMY_LIST } from '../content/enemies.ts';
import { PROOFS } from '../content/meta.ts';
import { S } from '../content/strings.de.ts';
import { CAPS } from '../content/tuning.ts';
import type { CharacterId } from '../content/types.ts';
import { BASE_WEAPONS, THEOREMS } from '../content/weapons.ts';
import type { SaveData } from '../meta/save.ts';
import type { Vec } from '../sim/math/vec.ts';
import type { RunSession } from '../sim/run.ts';
import { spawnEnemy, spawnPoint } from '../sim/systems/director.ts';
import type { World } from '../sim/world.ts';
import type { ScreenId } from '../ui/screens/screen.ts';

/**
 * URL parameters:
 *   ?seed=123       fixed run seed (also for "Nochmal")
 *   ?t=880          start at this run second, with a build of the matching level
 *   ?char=nova      character
 *   ?stress=1500    keep that many chasers alive (capped), god mode, levelled build
 *   ?debug          debug keys F1–F7 and the overlay
 *   ?scene=shop     open this menu sheet instead of the title
 *   ?splitter=3000  Splitter balance for this session
 *   ?unlock         every Beweis proven, the whole Kompendium discovered
 *
 * seed, t, stress and char start a run right away. Sessions with debug, t, stress, splitter or
 * unlock play on a copy of the save that is never written back.
 */
export interface LaunchOptions {
  seed: number | null;
  character: CharacterId;
  startTime: number;
  stress: number;
  debug: boolean;
  /** Menu sheet to open at boot; null = the title. */
  scene: ScreenId | null;
  splitter: number | null;
  unlock: boolean;
  /** A run parameter was given: skip the menus. */
  direct: boolean;
  /** False when the session must not write the save (debug and cheat parameters). */
  persistent: boolean;
}

const SCREENS: readonly ScreenId[] = ['title', 'select', 'shop', 'proofs', 'codex', 'settings'];

function isCharacter(v: string): v is CharacterId {
  return Object.hasOwn(CHARACTERS, v);
}

function isScreen(v: string): v is ScreenId {
  return (SCREENS as readonly string[]).includes(v);
}

export function parseLaunch(search: string): LaunchOptions {
  const q = new URLSearchParams(search);
  const seed = Number(q.get('seed'));
  const char = q.get('char') ?? '';
  const t = Number(q.get('t'));
  const stress = Number(q.get('stress'));
  const splitter = Number(q.get('splitter'));
  const scene = q.get('scene') ?? '';

  const startTime = Number.isFinite(t) && t > 0 ? t : 0;
  const stressCount =
    Number.isFinite(stress) && stress > 0 ? Math.min(Math.floor(stress), CAPS.enemies) : 0;
  const debug = q.has('debug') || q.has('stress');
  const direct = q.has('seed') || q.has('t') || q.has('stress') || q.has('char');
  // Direct debug runs get every weapon and axiom, as before the save existed.
  const unlock = q.has('unlock') || (debug && direct);
  const cheat = startTime > 0 || stressCount > 0 || q.has('splitter') || unlock;
  return {
    seed: q.has('seed') && Number.isFinite(seed) ? seed >>> 0 : null,
    character: isCharacter(char) ? char : 'delta',
    startTime,
    stress: stressCount,
    debug,
    scene: isScreen(scene) ? scene : null,
    splitter:
      q.has('splitter') && Number.isFinite(splitter) && splitter >= 0 ? Math.floor(splitter) : null,
    unlock,
    direct,
    persistent: !debug && !cheat,
  };
}

/** ?splitter= and ?unlock, applied to the session's save (never persistent, see above). */
export function applyDebugSave(save: SaveData, o: LaunchOptions): void {
  if (o.splitter !== null) save.splitter = o.splitter;
  if (!o.unlock) return;
  save.proofs = PROOFS.map((p) => p.id);
  save.seen.weapons = [...BASE_WEAPONS, ...THEOREMS].map((d) => d.id);
  save.seen.axioms = AXIOM_LIST.map((d) => d.id);
  save.seen.enemies = ENEMY_LIST.map((d) => d.id);
}

/** Typical level of an unassisted run at a given second (drives the ?t= build). */
const LEVEL_AT: readonly (readonly [number, number])[] = [
  [0, 1],
  [60, 4],
  [180, 8],
  [300, 14],
  [480, 24],
  [600, 32],
  [780, 44],
  [900, 53],
];

export function levelAt(t: number): number {
  let prev = LEVEL_AT[0]!;
  for (const cur of LEVEL_AT) {
    if (t <= cur[0]) {
      const span = cur[0] - prev[0];
      const k = span > 0 ? (t - prev[0]) / span : 0;
      return Math.round(prev[1] + (cur[1] - prev[1]) * k);
    }
    prev = cur;
  }
  return prev[1];
}

/** Applies ?t= and ?stress= to a fresh session. */
export function applyLaunch(s: RunSession, o: LaunchOptions): void {
  if (o.startTime > 0) {
    // Vertices first, so the level-ups can fill every slot.
    s.debugJump(o.startTime);
    s.debugAutoLevel(levelAt(o.startTime) - 1);
  }
  if (o.stress > 0) {
    s.world.god = true;
    if (o.startTime <= 0) s.debugAutoLevel(30);
  }
}

const pt: Vec = { x: 0, y: 0 };

/** Tops the field up to `n` chasers, a few per tick so they arrive as a stream. */
export function stressTick(w: World, n: number): void {
  for (let k = 0; k < 12 && w.enemies.count < n; k++) {
    spawnPoint(w, w.rng.angle(), pt);
    spawnEnemy(w, ENEMIES.punkt, pt.x, pt.y);
  }
}

/** F1 overlay: frame rate, sim/render time, entity counts. */
export class DebugOverlay {
  readonly root: HTMLElement;
  visible: boolean;
  private frames = 0;
  private windowStart = -1;
  private lastFrame = -1;
  private worstFrame = 0;
  private simMs = 0;
  private renderMs = 0;
  private fps = 0;
  private worst = 0;
  private sim = 0;
  private render = 0;

  constructor(parent: HTMLElement, visible: boolean) {
    this.root = document.createElement('pre');
    this.root.className = 'debug-overlay';
    this.visible = visible;
    this.root.classList.toggle('hidden', !visible);
    parent.append(this.root);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
  }

  /** `now` is real time in ms (the loop's dt is clamped and would flatter the frame rate). */
  update(
    now: number,
    simMs: number,
    renderMs: number,
    w: World,
    particles: number,
    state: string,
    hint: boolean,
  ): void {
    if (this.windowStart < 0) this.windowStart = now;
    if (this.lastFrame >= 0) this.worstFrame = Math.max(this.worstFrame, now - this.lastFrame);
    this.lastFrame = now;
    this.frames++;
    this.simMs += simMs;
    this.renderMs += renderMs;
    const elapsed = (now - this.windowStart) / 1000;
    if (elapsed < 0.5) return;
    this.fps = this.frames / elapsed;
    this.worst = this.worstFrame;
    this.sim = this.simMs / this.frames;
    this.render = this.renderMs / this.frames;
    this.windowStart = now;
    this.frames = 0;
    this.worstFrame = 0;
    this.simMs = 0;
    this.renderMs = 0;
    if (!this.visible) return;
    const lines = [
      `FPS ${this.fps.toFixed(0).padStart(3)} (max ${this.worst.toFixed(0)} ms)   sim ${this.sim.toFixed(2)} ms   render ${this.render.toFixed(2)} ms`,
      `Gegner ${w.enemies.count}  Proj ${w.projectiles.count}  Kugeln ${w.bullets.count}  Kristalle ${w.gems.count}  VFX ${particles}`,
      `Zustand ${state}  Tick ${w.tick}${w.god ? '  GOTT' : ''}`,
    ];
    if (hint) lines.push(S.debug.on);
    this.root.textContent = lines.join('\n');
  }
}
