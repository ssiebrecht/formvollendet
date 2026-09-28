import { type Synth, midi } from './synth.ts';

/** What the music plays: calm menu, the run (driven by enemy density), the boss, the aftermath. */
export type MusicMood = 'menu' | 'run' | 'boss' | 'end';

const BPM = 104;
/** One sixteenth note. */
const STEP = 60 / BPM / 4;
/** Two bars per chord. */
const CHORD_STEPS = 32;
/** How far ahead notes are scheduled; frames may come late, the audio clock never does. */
const LOOKAHEAD = 0.2;

interface Chord {
  bass: number;
  /** Close triad around middle C; the arpeggio plays it an octave higher. */
  tones: readonly [number, number, number];
}

/** A minor: Am – F – C – G. */
const CALM: readonly Chord[] = [
  { bass: 45, tones: [57, 60, 64] },
  { bass: 41, tones: [57, 60, 65] },
  { bass: 48, tones: [55, 60, 64] },
  { bass: 43, tones: [55, 59, 62] },
];

/** Sierpinski: Am – B♭ – Am – E, the half step and the major dominant make it menacing. */
const BOSS: readonly Chord[] = [
  { bass: 45, tones: [57, 60, 64] },
  { bass: 46, tones: [58, 62, 65] },
  { bass: 45, tones: [57, 60, 64] },
  { bass: 40, tones: [56, 59, 64] },
];

/**
 * Arpeggio shape for one bar: indices into the chord's two-octave ladder, -1 = rest. The same
 * contour runs over all four chords of a cycle, so the ear hears a motif; each cycle draws a
 * new one.
 */
function makeContour(): number[] {
  const out: number[] = [];
  let idx = Math.floor(Math.random() * 3);
  for (let i = 0; i < 16; i++) {
    if (i % 4 !== 0 && Math.random() < 0.3) {
      out.push(-1);
      continue;
    }
    const move = [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]!;
    idx = Math.max(0, Math.min(5, idx + move));
    out.push(idx);
  }
  return out;
}

/**
 * Generative loop on the audio clock. Layers join as the intensity rises: pad (always), bass,
 * arpeggio, kick, hi-hats, snare. The intensity follows the enemy density with a quick rise and
 * a slow fall, so a big wave swells the track and a cleared screen lets it breathe.
 */
export class Music {
  private readonly synth: Synth;
  private step = 0;
  /** Context time of `step`. */
  private next = -1;
  private level = 0;
  private mood: MusicMood = 'menu';
  private chord: Chord = CALM[0]!;
  private contour = makeContour();

  constructor(synth: Synth) {
    this.synth = synth;
  }

  /** Every frame: `density` 0..1 drives the run's intensity. */
  update(dt: number, mood: MusicMood, density: number): void {
    this.mood = mood;
    const target =
      mood === 'boss' ? 1 : mood === 'menu' ? 0.3 : mood === 'end' ? 0 : Math.max(0.15, density);
    const fall = mood === 'end' ? 0.6 : 0.12;
    this.level += Math.max(-dt * fall, Math.min(dt * 0.5, target - this.level));

    if (!this.synth.ready) return;
    const now = this.synth.now;
    if (this.next < now - 0.1) {
      // First start or a stall (hidden tab): resume on the next chord so the pad comes in at once.
      this.step = Math.ceil(this.step / CHORD_STEPS) * CHORD_STEPS;
      this.next = now + 0.05;
    }
    while (this.next < now + LOOKAHEAD) {
      this.play(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  private play(step: number, t: number): void {
    const s = step % 16;
    const inChord = step % CHORD_STEPS;
    const boss = this.mood === 'boss';
    const menu = this.mood === 'menu';
    const I = this.level;

    if (inChord === 0) {
      const index = Math.floor(step / CHORD_STEPS) % 4;
      if (index === 0) this.contour = makeContour();
      this.chord = (boss ? BOSS : CALM)[index]!;
      this.pad(t, I);
    }
    const c = this.chord;
    if (this.mood === 'end') return;

    // Bass: syncopated at first, straight eighths once it gets busy, octave jumps on top.
    const busy = boss || I >= 0.5;
    if (I >= 0.15 && (busy ? s % 2 === 0 : s === 0 || s === 6 || s === 8 || s === 14)) {
      const up = busy && (s === 6 || s === 14);
      this.synth.tone(
        {
          wave: 'sawtooth',
          freq: midi(c.bass + (up ? 12 : 0)),
          at: t,
          dur: STEP * 1.8,
          gain: menu ? 0.05 : 0.08,
          cutoff: 280 + 900 * I,
        },
        'music',
        1,
      );
    }

    // Arpeggio: eighths when calm, sixteenths when busy.
    const idx = this.contour[s] ?? -1;
    if (idx >= 0 && (menu || I >= 0.25) && (s % 2 === 0 || (!menu && I >= 0.55))) {
      const ladder = [...c.tones, ...c.tones.map((n) => n + 12)];
      this.synth.tone(
        {
          wave: boss ? 'square' : 'triangle',
          freq: midi(ladder[idx]! + 12),
          at: t,
          dur: STEP * 1.6,
          gain: menu ? 0.025 : 0.03,
          cutoff: boss ? 1600 : 2600,
        },
        'music',
        0,
      );
    }

    if (menu) return;
    // Drums.
    const kick = boss || I >= 0.55 ? s % 4 === 0 || (boss && s === 14) : s === 0 || s === 8;
    if (I >= 0.35 && kick) {
      this.synth.tone(
        { wave: 'sine', freq: 150, to: 42, glide: 0.1, at: t, dur: 0.28, gain: 0.3 },
        'music',
        2,
      );
    }
    if ((boss || I >= 0.65) && (s === 4 || s === 12)) {
      this.synth.noise(
        { filter: 'bandpass', freq: 1800, q: 0.8, at: t, dur: 0.16, gain: 0.1 },
        'music',
        2,
      );
      this.synth.tone(
        { wave: 'triangle', freq: 190, to: 140, at: t, dur: 0.08, gain: 0.08 },
        'music',
        2,
      );
    }
    const allHats = boss || I >= 0.8;
    if (I >= 0.45 && (allHats || s % 4 === 2)) {
      this.synth.noise(
        {
          filter: 'highpass',
          freq: 7000,
          at: t,
          dur: 0.035,
          gain: s % 4 === 2 ? 0.035 : 0.018,
        },
        'music',
        1,
      );
    }
  }

  /** Sustained chord for the next two bars, with a soft sub under it. */
  private pad(t: number, I: number): void {
    const len = CHORD_STEPS * STEP;
    const quiet = this.mood === 'end' ? 0.6 : 1;
    for (const [i, n] of this.chord.tones.entries()) {
      this.synth.tone(
        {
          wave: 'triangle',
          freq: midi(n),
          at: t,
          dur: len + 0.8,
          attack: 0.9,
          hold: len - 1,
          gain: 0.04 * quiet,
          cutoff: 900 + 1500 * I,
          // A little spread keeps three triangles from sounding like one organ stop.
          detune: (i - 1) * 6,
        },
        'music',
        1,
      );
    }
    this.synth.tone(
      {
        wave: 'sine',
        freq: midi(this.chord.bass + 12),
        at: t,
        dur: len + 0.8,
        attack: 0.9,
        hold: len - 1,
        gain: 0.05 * quiet,
      },
      'music',
      1,
    );
  }
}
