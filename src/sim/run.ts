import { ENEMIES } from '../content/enemies.ts';
import { BOSS, DT, ELITE, ticks, xpForLevel } from '../content/tuning.ts';
import { SCRIPT } from '../content/waves.ts';
import { openCube } from './build.ts';
import { applyCard, banishKey, rollDraft, type Card } from './draft.ts';
import { killEnemy } from './systems/combat.ts';
import { runScript, segmentAt, updateDirector } from './systems/director.ts';
import { rebuildHash, updateEnemies } from './systems/enemies.ts';
import { updateGems, updatePickups } from './systems/pickups.ts';
import { type InputState, updatePlayer } from './systems/player.ts';
import { updateBullets, updateHazards, updateProjectiles } from './systems/projectiles.ts';
import { updateWeapons } from './systems/weapons.ts';
import { createWorld, type RunConfig, type World } from './world.ts';

export type { InputState } from './systems/player.ts';

/**
 * - playing: the world ticks
 * - draft:   level-up cards are open, the world is frozen
 * - morph:   a new vertex grows, the world is frozen for PLAYER.morphTime
 * - won/lost: final
 */
export type RunState = 'playing' | 'draft' | 'morph' | 'won' | 'lost';

export const NO_INPUT: InputState = { moveX: 0, moveY: 0, ability: false };

/**
 * One run of the game: owns the world and the state machine around it. Deterministic for a given
 * config and input sequence. Events are cleared at the start of every `step`; the caller drains
 * `world.events` after each step and after each draft action.
 */
export class RunSession {
  readonly world: World;
  state: RunState = 'playing';
  cards: Card[] = [];
  private winTicks = -1;

  constructor(cfg: RunConfig) {
    this.world = createWorld(cfg);
    rebuildHash(this.world);
  }

  step(input: InputState): void {
    const w = this.world;
    w.events.length = 0;
    if (this.state === 'playing') this.tick(input);
    else if (this.state === 'morph') {
      if (--w.morphTicks <= 0) {
        w.morphTicks = 0;
        this.state = 'playing';
        this.resolvePending();
      }
    }
  }

  private tick(input: InputState): void {
    const w = this.world;
    w.tick++;
    w.time = w.tick * DT;
    updatePlayer(w, input);
    updateDirector(w);
    updateEnemies(w);
    updateWeapons(w);
    updateProjectiles(w);
    updateBullets(w);
    updateHazards(w);
    updateGems(w);
    updatePickups(w);
    if (w.enemySlowTicks > 0) w.enemySlowTicks--;
    this.levelUps();

    w.enemies.compact();
    w.projectiles.compact();
    w.bullets.compact();
    w.gems.compact();
    w.pickups.compact();
    w.hazards.compact();
    // Compaction moved pool items, so grid indices from this tick are stale.
    rebuildHash(w);

    if (w.player.hp <= 0) {
      this.state = 'lost';
      return;
    }
    if (w.director.bossDefeated && !w.cfg.endless && this.winTicks < 0) {
      this.winTicks = ticks(BOSS.victoryDelay);
    }
    if (this.winTicks > 0 && --this.winTicks === 0) {
      this.state = 'won';
      w.events.push({ type: 'won' });
      return;
    }
    this.resolvePending();
  }

  private levelUps(): void {
    const p = this.world.player;
    let need = xpForLevel(p.level);
    while (p.xp >= need) {
      p.xp -= need;
      p.level++;
      p.pendingLevels++;
      this.world.events.push({ type: 'levelUp', level: p.level });
      need = xpForLevel(p.level);
    }
  }

  /** Cubes first (a morph freezes the world), then queued level-ups open the draft. */
  private resolvePending(): void {
    const w = this.world;
    while (w.pendingCubes.length > 0) {
      const kind = w.pendingCubes.shift()!;
      if (openCube(w, kind) === 'morph') {
        this.state = 'morph';
        return;
      }
    }
    if (w.player.pendingLevels > 0) {
      this.state = 'draft';
      this.cards = rollDraft(w);
    }
  }

  private nextDraft(): void {
    if (this.world.player.pendingLevels > 0) this.cards = rollDraft(this.world);
    else {
      this.cards = [];
      this.state = 'playing';
    }
  }

  // ------------------------------------------------------------------------- draft actions

  choose(index: number): boolean {
    const card = this.cards[index];
    if (this.state !== 'draft' || !card) return false;
    applyCard(this.world, card);
    this.world.player.pendingLevels--;
    this.nextDraft();
    return true;
  }

  canReroll(): boolean {
    return this.state === 'draft' && this.world.rerolls > 0;
  }

  reroll(): boolean {
    if (!this.canReroll()) return false;
    this.world.rerolls--;
    this.cards = rollDraft(this.world);
    return true;
  }

  canBanish(index: number): boolean {
    const card = this.cards[index];
    return this.state === 'draft' && this.world.banishes > 0 && !!card && banishKey(card) !== null;
  }

  /** Removes the card's item from the rest of the run and redraws the hand. */
  banish(index: number): boolean {
    const card = this.cards[index];
    if (!this.canBanish(index) || !card) return false;
    this.world.banished.add(banishKey(card)!);
    this.world.banishes--;
    this.cards = rollDraft(this.world);
    return true;
  }

  canSkip(): boolean {
    return this.state === 'draft' && this.world.skips > 0;
  }

  skip(): boolean {
    if (!this.canSkip()) return false;
    this.world.skips--;
    this.world.player.pendingLevels--;
    this.nextDraft();
    return true;
  }

  /** Ends the run as a loss (pause menu "Aufgeben"). */
  giveUp(): void {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = 'lost';
    this.cards = [];
  }

  // --------------------------------------------------------------------------------- debug

  debugLevelUp(levels = 1): void {
    const p = this.world.player;
    p.level += levels;
    p.pendingLevels += levels;
    if (this.state === 'playing') this.resolvePending();
  }

  /** Applies `levels` random draft picks without UI (used by ?t= and the balance bot). */
  debugAutoLevel(levels: number): void {
    const w = this.world;
    for (let i = 0; i < levels; i++) {
      const cards = rollDraft(w);
      applyCard(w, w.rng.pick(cards));
      w.player.level++;
    }
  }

  /**
   * Skips time forward. Elite cubes that would have dropped meanwhile are opened on the spot (no
   * morph freeze) so a jump to the boss arrives with a grown polygon; the boss itself still
   * spawns on schedule.
   */
  debugJump(seconds: number): void {
    const w = this.world;
    const target = w.time + seconds;
    const d = w.director;
    while (d.scriptIndex < SCRIPT.length) {
      const ev = SCRIPT[d.scriptIndex]!;
      if (ev.at >= target || ev.kind === 'boss') break;
      if (ev.kind === 'elite') for (let i = 0; i < ev.count; i++) openCube(w, ev.drop);
      d.scriptIndex++;
    }
    w.morphTicks = 0;
    w.tick += ticks(seconds);
    w.time = w.tick * DT;
    if (this.state === 'playing') this.resolvePending();
  }

  debugElite(): void {
    const w = this.world;
    const pool = segmentAt(w.time).pool;
    const enemy = w.rng.pick(pool).enemy;
    runScript(w, { at: w.time, kind: 'elite', enemy, drop: 'vertex', count: 1, hp: ELITE.hp });
  }

  debugBoss(): void {
    runScript(this.world, { at: this.world.time, kind: 'boss', enemy: ENEMIES.sierpinski.id });
  }

  debugToggleGod(): boolean {
    this.world.god = !this.world.god;
    return this.world.god;
  }

  /** Kills every regular enemy on the field (debug "clear"). */
  debugClear(): void {
    const w = this.world;
    for (let i = 0; i < w.enemies.count; i++) {
      const e = w.enemies.items[i]!;
      if (e.alive && e.boss < 0) killEnemy(w, e, false);
    }
  }

  /** Cheap fingerprint of the simulation state for determinism tests. */
  stateHash(): string {
    const w = this.world;
    const p = w.player;
    let h = 0x811c9dc5;
    const mix = (v: number): void => {
      f64[0] = v;
      for (let i = 0; i < 8; i++) {
        h ^= u8[i]!;
        h = Math.imul(h, 0x01000193);
      }
    };
    mix(w.tick);
    mix(p.x);
    mix(p.y);
    mix(p.hp);
    mix(p.xp);
    mix(p.level);
    mix(p.vertices);
    mix(w.enemies.count);
    mix(w.projectiles.count);
    mix(w.gems.count);
    mix(w.run.kills);
    for (let i = 0; i < w.enemies.count; i++) {
      const e = w.enemies.items[i]!;
      mix(e.x);
      mix(e.y);
      mix(e.hp);
    }
    for (const v of w.rng.state()) mix(v);
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

const f64 = new Float64Array(1);
const u8 = new Uint8Array(f64.buffer);
