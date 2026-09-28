import type { AbilityId, PickupKind, ShapeId, WeaponKind } from '../content/types.ts';
import { WEAPONS } from '../content/weapons.ts';
import type { SimEvent } from '../sim/events.ts';
import type { World } from '../sim/world.ts';
import type { UiCue } from '../ui/nav.ts';
import { type Noise, type Priority, type Synth, type Tone, midi, pentatonic } from './synth.ts';

/**
 * The sound follows the form, like everything else: round shapes hum (sine), pointed ones cut
 * (triangle, saw), angular ones buzz (square).
 */
const SHAPE_WAVE: Partial<Record<ShapeId, OscillatorType>> = {
  circle: 'sine',
  orb: 'sine',
  wavedot: 'sine',
  ring: 'sine',
  triangle: 'triangle',
  fractal: 'triangle',
  shard: 'triangle',
  dart: 'sawtooth',
  star5: 'sawtooth',
  square: 'square',
  diamond: 'square',
  pentagon: 'square',
  hexagon: 'square',
};

/** Chord roots of the morph fanfare per vertex count: every new vertex sounds higher. */
const MORPH_ROOT: Readonly<Record<number, number>> = { 3: 57, 4: 60, 5: 62, 6: 64 };
const MORPH_WAVE: Readonly<Record<number, OscillatorType>> = {
  3: 'triangle',
  4: 'square',
  5: 'sawtooth',
  6: 'sawtooth',
};

/** Gems climb the scale while they keep coming; a pause this long starts over. */
const GEM_STREAK_RESET = 0.6;
const GEM_TOP = 10;

type Spec = Omit<Tone, 'freq'>;

/** Sim events and menu cues → sounds. Loud, frequent events are rate-limited per key. */
export class Sfx {
  private readonly synth: Synth;
  private readonly last = new Map<string, number>();
  private gemStreak = 0;
  private gemLast = -Infinity;
  /** Stereo position and distance falloff of the current event (see `place`). */
  private pan = 0;
  private vol = 1;

  constructor(synth: Synth) {
    this.synth = synth;
  }

  event(ev: SimEvent, w: World): void {
    if (!this.synth.ready) return;
    switch (ev.type) {
      case 'hit':
        this.hit(ev.crit, w, ev.x, ev.y);
        break;
      case 'kill':
        this.place(w, ev.x, ev.y);
        if (ev.elite) this.eliteKill();
        else this.kill(ev.shape, ev.r);
        break;
      case 'shell':
        if (!this.gate('shell', 0.05)) break;
        this.place(w, ev.x, ev.y);
        this.n({ filter: 'highpass', freq: 2600, dur: 0.07, gain: 0.16 * this.vol, pan: this.pan });
        this.t({
          wave: 'triangle',
          freq: 1500 + Math.random() * 700,
          dur: 0.06,
          gain: 0.07 * this.vol,
          pan: this.pan,
        });
        break;
      case 'playerHurt':
        if (!this.gate('hurt', 0.14)) break;
        this.t({ wave: 'square', freq: 170, to: 60, dur: 0.2, gain: 0.2, cutoff: 900 }, 2);
        this.n({ filter: 'lowpass', freq: 900, to: 200, dur: 0.14, gain: 0.14 }, 2);
        break;
      case 'playerHeal':
        if (!this.gate('heal', 0.4)) break;
        this.t({ wave: 'sine', freq: midi(76), dur: 0.14, gain: 0.06, attack: 0.01 }, 2);
        this.t({ wave: 'sine', freq: midi(83), dur: 0.22, gain: 0.06, delay: 0.07 }, 2);
        break;
      case 'revive':
        this.arp([57, 60, 64, 69, 72, 76], 0.06, { wave: 'triangle', dur: 0.5, gain: 0.1 }, 3);
        this.n({ filter: 'bandpass', freq: 300, to: 5000, q: 1.2, dur: 0.6, gain: 0.08 }, 3);
        break;
      case 'levelUp':
        this.arp([69, 73, 76, 81], 0.065, { wave: 'triangle', dur: 0.35, gain: 0.07 }, 2);
        this.t({ wave: 'sine', freq: midi(88), dur: 0.5, gain: 0.05, delay: 0.26 }, 2);
        break;
      case 'gem':
        this.gem(ev.value);
        break;
      case 'pickup':
        this.place(w, ev.x, ev.y);
        this.pickup(ev.kind);
        break;
      case 'morph':
        this.morph(ev.vertices);
        break;
      case 'upgradeCube': {
        const notes: number[] = [];
        for (let i = 0; i < ev.rewards.length + 3; i++) notes.push(pentatonic(i, 69));
        this.arp(notes, 0.08, { wave: 'triangle', dur: 0.3, gain: 0.07 }, 2);
        break;
      }
      case 'theorem':
        this.arp([69, 73, 76, 81, 85, 88], 0.07, { wave: 'triangle', dur: 0.9, gain: 0.055 }, 3);
        this.chord(
          [57, 64, 69],
          { wave: 'sawtooth', dur: 1.4, attack: 0.1, gain: 0.03, cutoff: 1800, delay: 0.35 },
          3,
        );
        break;
      case 'fire':
        this.fire(ev.weapon, WEAPONS[ev.weapon].kind);
        break;
      case 'explosion':
        if (!this.gate('explosion', 0.07)) break;
        this.place(w, ev.x, ev.y);
        this.n({
          filter: 'lowpass',
          freq: 2400,
          to: 120,
          dur: 0.45,
          gain: 0.1 * this.vol,
          pan: this.pan,
        });
        this.t({
          wave: 'sine',
          freq: 130,
          to: 40,
          dur: 0.35,
          gain: 0.12 * this.vol,
          pan: this.pan,
        });
        break;
      case 'pulse':
        if (!this.gate('pulse', 0.09)) break;
        this.place(w, ev.x, ev.y);
        this.t(
          { wave: 'sine', freq: 240, to: 90, dur: 0.14, gain: 0.1 * this.vol, pan: this.pan },
          0,
        );
        break;
      case 'enemyShot':
        if (!this.gate('shot', 0.08)) break;
        this.place(w, ev.x, ev.y);
        this.t({
          wave: 'triangle',
          freq: 820,
          to: 410,
          dur: 0.08,
          gain: 0.13 * this.vol,
          pan: this.pan,
        });
        break;
      case 'ability':
        this.ability(ev.ability);
        break;
      case 'elite':
        for (let i = 0; i < 4; i++) {
          const f = i % 2 === 0 ? 440 : 330;
          this.t(
            { wave: 'square', freq: f, dur: 0.13, gain: 0.06, cutoff: 1600, delay: i * 0.15 },
            2,
          );
        }
        break;
      case 'formation':
        if (ev.kind === 'ring') {
          this.t({ wave: 'sawtooth', freq: 55, dur: 1.4, attack: 0.3, gain: 0.06, cutoff: 400 }, 2);
          this.n({ filter: 'lowpass', freq: 200, to: 900, dur: 1.4, attack: 0.4, gain: 0.04 }, 2);
        } else {
          this.n(
            { filter: 'bandpass', freq: 200, to: 2500, q: 1, dur: 1.1, attack: 0.2, gain: 0.07 },
            2,
          );
          this.t({ wave: 'triangle', freq: 110, to: 220, dur: 1, gain: 0.06 }, 2);
        }
        break;
      case 'boss':
        // Siren: two detuned saws wobbling against a low drone.
        this.t(
          {
            wave: 'sawtooth',
            freq: 440,
            dur: 2.6,
            attack: 0.2,
            gain: 0.035,
            cutoff: 2000,
            wobble: [0.9, 160],
          },
          3,
        );
        this.t(
          {
            wave: 'sawtooth',
            freq: 220,
            dur: 2.6,
            attack: 0.2,
            gain: 0.025,
            cutoff: 1200,
            wobble: [0.9, 80],
          },
          3,
        );
        this.t({ wave: 'sine', freq: 55, dur: 3, attack: 0.5, gain: 0.07 }, 3);
        break;
      case 'bossSplit':
        this.place(w, ev.x, ev.y);
        this.n({ filter: 'highpass', freq: 1800, dur: 0.35, gain: 0.08, pan: this.pan }, 3);
        this.t({ wave: 'sine', freq: 320, to: 55, dur: 0.6, gain: 0.14 }, 3);
        this.t({ wave: 'square', freq: 160, to: 80, dur: 0.3, gain: 0.05, cutoff: 900 }, 3);
        break;
      case 'bossDefeated':
        this.chord([57, 61, 64, 69, 73], { wave: 'triangle', dur: 2.2, gain: 0.04 }, 3);
        this.t({ wave: 'sine', freq: midi(33), dur: 2, gain: 0.07 }, 3);
        this.n({ filter: 'bandpass', freq: 400, to: 6000, q: 1, dur: 1.2, gain: 0.04 }, 3);
        break;
      case 'playerDied':
        this.arp(
          [69, 65, 62, 57, 53],
          0.12,
          { wave: 'sawtooth', dur: 0.5, gain: 0.05, cutoff: 1500 },
          3,
        );
        this.n({ filter: 'lowpass', freq: 1500, to: 60, dur: 1.2, gain: 0.1 }, 3);
        this.t({ wave: 'sine', freq: 90, to: 30, dur: 1, gain: 0.15 }, 3);
        break;
      case 'won':
        this.arp([69, 73, 76, 81], 0.1, { wave: 'triangle', dur: 0.5, gain: 0.08 }, 3);
        this.chord(
          [57, 64, 69, 73, 76],
          { wave: 'sawtooth', dur: 2.4, attack: 0.05, gain: 0.045, cutoff: 2600, delay: 0.45 },
          3,
        );
        this.arp([93, 97, 100], 0.08, { wave: 'triangle', dur: 0.3, gain: 0.03, delay: 0.5 }, 3);
        break;
    }
  }

  /** Menu feedback; never rate-limited except the focus tick. */
  cue(c: UiCue): void {
    if (!this.synth.ready) return;
    switch (c) {
      case 'move':
        if (this.gate('move', 0.025))
          this.t({ wave: 'triangle', freq: 1320, dur: 0.025, gain: 0.15 }, 2);
        break;
      case 'confirm':
        this.t({ wave: 'triangle', freq: 880, dur: 0.07, gain: 0.09 }, 2);
        this.t({ wave: 'triangle', freq: 1320, dur: 0.1, gain: 0.09, delay: 0.05 }, 2);
        break;
      case 'back':
        this.t({ wave: 'triangle', freq: 740, dur: 0.07, gain: 0.08 }, 2);
        this.t({ wave: 'triangle', freq: 494, dur: 0.1, gain: 0.08, delay: 0.05 }, 2);
        break;
      case 'buy':
        this.t({ wave: 'square', freq: midi(84), dur: 0.06, gain: 0.05, cutoff: 3500 }, 2);
        this.t(
          { wave: 'square', freq: midi(91), dur: 0.12, gain: 0.05, cutoff: 3500, delay: 0.06 },
          2,
        );
        this.t({ wave: 'triangle', freq: midi(96), dur: 0.2, gain: 0.04, delay: 0.12 }, 2);
        break;
      case 'deny':
        this.t({ wave: 'square', freq: 110, dur: 0.08, gain: 0.07, cutoff: 700 }, 2);
        this.t({ wave: 'square', freq: 104, dur: 0.1, gain: 0.07, cutoff: 700, delay: 0.1 }, 2);
        break;
      case 'toggle':
        this.t({ wave: 'sine', freq: 1760, dur: 0.03, gain: 0.14 }, 2);
        break;
      case 'open':
        this.t({ wave: 'sine', freq: 440, to: 880, dur: 0.12, gain: 0.13 }, 2);
        this.n({ filter: 'highpass', freq: 4000, dur: 0.1, gain: 0.04 }, 2);
        break;
    }
  }

  // -------------------------------------------------------------------------------- events

  private hit(crit: boolean, w: World, x: number, y: number): void {
    if (crit) {
      if (!this.gate('crit', 0.07)) return;
      this.place(w, x, y);
      this.t(
        {
          wave: 'square',
          freq: 1900,
          to: 2600,
          dur: 0.05,
          gain: 0.12 * this.vol,
          cutoff: 5000,
          pan: this.pan,
        },
        0,
      );
      return;
    }
    if (!this.gate('hit', 0.055)) return;
    this.place(w, x, y);
    this.t(
      {
        wave: 'triangle',
        freq: 1100 + Math.random() * 400,
        to: 700,
        dur: 0.035,
        gain: 0.15 * this.vol,
        pan: this.pan,
      },
      0,
    );
  }

  /** Small shapes pop high, big ones low; the wave follows the shape. */
  private kill(shape: ShapeId, r: number): void {
    if (!this.gate('kill', 0.04)) return;
    const f = (5200 / (r + 6)) * (0.92 + Math.random() * 0.16);
    this.t({
      wave: SHAPE_WAVE[shape] ?? 'triangle',
      freq: f,
      to: f * 0.45,
      dur: 0.11,
      gain: 0.18 * this.vol,
      pan: this.pan,
      cutoff: 3000,
    });
  }

  private eliteKill(): void {
    this.n({ filter: 'lowpass', freq: 3000, to: 200, dur: 0.55, gain: 0.1, pan: this.pan }, 2);
    this.t({ wave: 'sine', freq: 170, to: 45, dur: 0.5, gain: 0.12 }, 2);
    this.chord([81, 88], { wave: 'triangle', dur: 0.4, gain: 0.03, delay: 0.05 }, 2);
  }

  /** A gem streak climbs the pentatonic scale, one step every second gem. */
  private gem(value: number): void {
    const now = this.synth.now;
    if (now - this.gemLast > GEM_STREAK_RESET) this.gemStreak = 0;
    if (!this.gate('gem', 0.04)) return;
    this.gemLast = now;
    const step = Math.min(Math.floor(this.gemStreak / 2), GEM_TOP);
    this.gemStreak++;
    const big = value >= 5;
    this.t(
      {
        wave: 'sine',
        freq: midi(pentatonic(step, 69)),
        dur: big ? 0.14 : 0.08,
        gain: big ? 0.15 : 0.12,
        attack: 0.002,
      },
      0,
    );
    if (value >= 25) {
      this.t(
        {
          wave: 'triangle',
          freq: midi(pentatonic(step, 81)),
          dur: 0.18,
          gain: 0.07,
          attack: 0.002,
        },
        0,
      );
    }
  }

  private pickup(kind: PickupKind): void {
    switch (kind) {
      case 'heal':
        this.chord([72, 76, 79], { wave: 'sine', dur: 0.45, attack: 0.02, gain: 0.04 }, 2);
        break;
      case 'sum':
        this.n({ filter: 'bandpass', freq: 300, to: 5000, q: 2, dur: 0.6, gain: 0.09 }, 2);
        this.t({ wave: 'sine', freq: 220, to: 1760, dur: 0.6, gain: 0.07 }, 2);
        break;
      case 'bomb':
        this.n({ filter: 'lowpass', freq: 3000, to: 80, dur: 0.9, gain: 0.12 }, 3);
        this.t({ wave: 'sine', freq: 110, to: 32, dur: 0.7, gain: 0.14 }, 3);
        this.t({ wave: 'square', freq: 55, dur: 0.4, gain: 0.05, cutoff: 300 }, 3);
        break;
      case 'slow':
        this.t({ wave: 'sine', freq: 1400, to: 220, dur: 0.7, gain: 0.08, wobble: [7, 30] }, 2);
        this.t({ wave: 'triangle', freq: 700, to: 110, dur: 0.7, gain: 0.05 }, 2);
        break;
      case 'splitter':
        if (!this.gate('splitter', 0.06)) break;
        this.t({ wave: 'triangle', freq: midi(93), dur: 0.12, gain: 0.08, pan: this.pan }, 1);
        this.t(
          { wave: 'triangle', freq: midi(100), dur: 0.18, gain: 0.065, delay: 0.05, pan: this.pan },
          1,
        );
        break;
      case 'vertexCube':
        this.t({ wave: 'sine', freq: 220, to: 880, dur: 0.35, gain: 0.08 }, 3);
        this.n({ filter: 'bandpass', freq: 500, to: 3000, q: 1.5, dur: 0.35, gain: 0.05 }, 3);
        break;
      case 'upgradeCube':
        this.t({ wave: 'square', freq: 330, dur: 0.08, gain: 0.06, cutoff: 1500 }, 2);
        this.t({ wave: 'triangle', freq: 660, dur: 0.12, gain: 0.06, delay: 0.06 }, 2);
        break;
    }
  }

  /** A chord that grows with the polygon: higher root and brighter wave per vertex. */
  private morph(vertices: number): void {
    const root = MORPH_ROOT[vertices] ?? 64;
    const wave = MORPH_WAVE[vertices] ?? 'sawtooth';
    const notes = [root, root + 7, root + 12, root + 16];
    if (vertices >= 6) notes.push(root + 19);
    this.chord(notes, { wave, dur: 1.6, attack: 0.05, gain: 0.03, cutoff: 2200 }, 3);
    this.t({ wave: 'sine', freq: midi(root - 24), dur: 1.2, gain: 0.07 }, 3);
    this.n({ filter: 'bandpass', freq: 200, to: 6000, q: 1, dur: 0.8, gain: 0.04 }, 3);
  }

  private fire(key: string, kind: WeaponKind): void {
    switch (kind) {
      case 'bolt':
        if (this.gate(key, 0.06)) {
          this.t(
            { wave: 'sawtooth', freq: 1500, to: 600, dur: 0.045, gain: 0.12, cutoff: 3500 },
            0,
          );
        }
        break;
      case 'wave':
        if (this.gate(key, 0.12))
          this.t({ wave: 'sine', freq: 260, to: 620, dur: 0.18, gain: 0.09 }, 0);
        break;
      case 'beam':
        if (this.gate(key, 0.3)) {
          this.t(
            { wave: 'sawtooth', freq: 110, dur: 0.45, gain: 0.065, cutoff: 700, wobble: [30, 8] },
            1,
          );
          this.t({ wave: 'square', freq: 220, dur: 0.3, gain: 0.026, cutoff: 1200 }, 1);
        }
        break;
      case 'fractal':
        if (this.gate(key, 0.08)) {
          this.t({ wave: 'triangle', freq: 1320, to: 1760, dur: 0.06, gain: 0.12 }, 0);
        }
        break;
      case 'orbit':
      case 'aura':
        if (this.gate(key, 0.12)) this.t({ wave: 'sine', freq: 300, dur: 0.08, gain: 0.06 }, 0);
        break;
    }
  }

  private ability(id: AbilityId): void {
    switch (id) {
      case 'vektor':
        this.n({ filter: 'bandpass', freq: 700, to: 6000, q: 1.5, dur: 0.2, gain: 0.5 }, 2);
        this.t({ wave: 'sawtooth', freq: 260, to: 1300, dur: 0.14, gain: 0.25, cutoff: 3000 }, 2);
        break;
      case 'supernova':
        this.n({ filter: 'lowpass', freq: 5000, to: 150, dur: 0.7, gain: 0.12 }, 3);
        this.chord([45, 52, 57, 64], { wave: 'sawtooth', dur: 0.6, gain: 0.035, cutoff: 2400 }, 3);
        this.t({ wave: 'sine', freq: 180, to: 40, dur: 0.5, gain: 0.15 }, 3);
        break;
    }
  }

  // ------------------------------------------------------------------------------- helpers

  /** False while `key` sounded less than `gap` seconds ago. */
  private gate(key: string, gap: number): boolean {
    const now = this.synth.now;
    if (now - (this.last.get(key) ?? -Infinity) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  /** Pans a world point by its offset from the player and fades it with distance. */
  private place(w: World, x: number, y: number): void {
    const p = w.player;
    const half = Math.max(1, w.view.halfW);
    const dx = x - p.x;
    this.pan = Math.max(-1, Math.min(1, dx / half)) * 0.75;
    const d = Math.hypot(dx, y - p.y);
    const near = half * 0.6;
    this.vol = d <= near ? 1 : Math.max(0.25, 1 - (d - near) / (half * 1.4));
  }

  private t(tone: Tone, prio: Priority = 1): void {
    this.synth.tone(tone, 'sfx', prio);
  }

  private n(noise: Noise, prio: Priority = 1): void {
    this.synth.noise(noise, 'sfx', prio);
  }

  private chord(notes: readonly number[], spec: Spec, prio: Priority): void {
    for (const m of notes) this.synth.tone({ ...spec, freq: midi(m) }, 'sfx', prio);
  }

  private arp(notes: readonly number[], step: number, spec: Spec, prio: Priority): void {
    const delay = spec.delay ?? 0;
    for (const [i, m] of notes.entries()) {
      this.synth.tone({ ...spec, freq: midi(m), delay: delay + i * step }, 'sfx', prio);
    }
  }
}
