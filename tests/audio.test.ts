import { describe, expect, it } from 'vitest';
import { Music, type MusicMood } from '../src/audio/music.ts';
import { Sfx } from '../src/audio/sfx.ts';
import { type Noise, type Synth, type Tone, midi, pentatonic } from '../src/audio/synth.ts';
import type { SimEvent } from '../src/sim/events.ts';
import type { World } from '../src/sim/world.ts';

/** Records what would be played; the audio clock is driven by the test. */
class FakeSynth {
  ready = true;
  now = 0;
  tones: (Tone & { bus: string })[] = [];
  noises: (Noise & { bus: string })[] = [];

  tone(t: Tone, bus = 'sfx'): void {
    this.tones.push({ ...t, bus });
  }

  noise(n: Noise, bus = 'sfx'): void {
    this.noises.push({ ...n, bus });
  }

  clear(): void {
    this.tones.length = 0;
    this.noises.length = 0;
  }
}

function fake(): { synth: FakeSynth; as: Synth } {
  const synth = new FakeSynth();
  return { synth, as: synth as unknown as Synth };
}

const WORLD = { player: { x: 0, y: 0 }, view: { halfW: 640, halfH: 360 } } as unknown as World;

/** Runs the music for `seconds` of frames at 60 Hz. */
function play(music: Music, synth: FakeSynth, seconds: number, mood: MusicMood, density = 0) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    synth.now += dt;
    music.update(dt, mood, density);
  }
}

const isKick = (t: Tone): boolean => t.wave === 'sine' && t.freq === 150;

describe('synth helpers', () => {
  it('converts MIDI notes and walks the A-minor pentatonic', () => {
    expect(midi(69)).toBeCloseTo(440);
    expect(midi(81)).toBeCloseTo(880);
    expect([0, 1, 2, 3, 4, 5].map((i) => pentatonic(i))).toEqual([57, 60, 62, 64, 67, 69]);
  });
});

describe('music', () => {
  it('stays silent until audio is unlocked', () => {
    const { synth, as } = fake();
    synth.ready = false;
    play(new Music(as), synth, 2, 'menu');
    expect(synth.tones).toHaveLength(0);
  });

  it('plays pad and arpeggio in the menu, without drums', () => {
    const { synth, as } = fake();
    play(new Music(as), synth, 10, 'menu');
    expect(synth.tones.every((t) => t.bus === 'music')).toBe(true);
    // The pad starts at once: three triads plus the sub.
    expect(synth.tones.filter((t) => t.attack === 0.9).length).toBeGreaterThanOrEqual(4);
    expect(synth.tones.some(isKick)).toBe(false);
    expect(synth.noises).toHaveLength(0);
  });

  it('adds drums as the enemy density rises', () => {
    const { synth, as } = fake();
    const music = new Music(as);
    play(music, synth, 4, 'run', 0.1);
    expect(synth.tones.some(isKick)).toBe(false);
    synth.clear();
    play(music, synth, 8, 'run', 1);
    expect(synth.tones.some(isKick)).toBe(true);
    expect(synth.noises.some((n) => n.filter === 'highpass')).toBe(true);
    expect(synth.noises.some((n) => n.filter === 'bandpass')).toBe(true);
  });

  it('switches to the boss progression and schedules on the audio clock', () => {
    const { synth, as } = fake();
    play(new Music(as), synth, 25, 'boss');
    // B♭ (MIDI 58) only occurs in the boss progression.
    expect(synth.tones.some((t) => Math.abs(t.freq - midi(58)) < 0.01)).toBe(true);
    // Notes are planned ahead, never further than the lookahead.
    const last = Math.max(...synth.tones.map((t) => t.at ?? 0));
    expect(last).toBeLessThanOrEqual(synth.now + 0.21);
  });

  it('fades out to the pad at the end of a run', () => {
    const { synth, as } = fake();
    const music = new Music(as);
    play(music, synth, 6, 'run', 1);
    synth.clear();
    play(music, synth, 10, 'end', 1);
    expect(synth.noises).toHaveLength(0);
    expect(synth.tones.every((t) => t.attack === 0.9)).toBe(true);
  });
});

describe('sfx', () => {
  const hit: SimEvent = { type: 'hit', x: 10, y: 0, amount: 5, crit: false };

  it('rate-limits frequent events', () => {
    const { synth, as } = fake();
    const sfx = new Sfx(as);
    for (let i = 0; i < 10; i++) sfx.event(hit, WORLD);
    expect(synth.tones).toHaveLength(1);
    synth.now += 0.1;
    sfx.event(hit, WORLD);
    expect(synth.tones).toHaveLength(2);
  });

  it('climbs the scale during a gem streak and starts over after a pause', () => {
    const { synth, as } = fake();
    const sfx = new Sfx(as);
    const gem: SimEvent = { type: 'gem', value: 1 };
    for (let i = 0; i < 12; i++) {
      synth.now += 0.05;
      sfx.event(gem, WORLD);
    }
    const freqs = synth.tones.map((t) => t.freq);
    expect(freqs).toHaveLength(12);
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]).toBeGreaterThanOrEqual(freqs[i - 1]!);
    expect(freqs.at(-1)).toBeGreaterThan(freqs[0]!);
    synth.now += 2;
    sfx.event(gem, WORLD);
    expect(synth.tones.at(-1)?.freq).toBe(freqs[0]);
  });

  it('pans by position and fades with distance', () => {
    const { synth, as } = fake();
    const sfx = new Sfx(as);
    sfx.event({ ...hit, x: -400 }, WORLD);
    synth.now += 1;
    sfx.event({ ...hit, x: 2000 }, WORLD);
    const [left, far] = synth.tones;
    expect(left?.pan).toBeLessThan(0);
    expect(far?.pan).toBeGreaterThan(0);
    expect(far!.gain).toBeLessThan(left!.gain);
  });

  it('has a sound for every sim event and menu cue, and none before unlock', () => {
    const events: SimEvent[] = [
      hit,
      { type: 'kill', x: 0, y: 0, r: 7, shape: 'circle', color: 0, rot: 0, elite: false },
      { type: 'kill', x: 0, y: 0, r: 30, shape: 'square', color: 0, rot: 0, elite: true },
      { type: 'shell', x: 0, y: 0, r: 14, shape: 'square', color: 0, rot: 0 },
      { type: 'playerHurt', amount: 5 },
      { type: 'playerHeal', amount: 30 },
      { type: 'revive' },
      { type: 'levelUp', level: 2 },
      { type: 'gem', value: 5 },
      { type: 'pickup', kind: 'bomb', x: 0, y: 0 },
      { type: 'morph', vertices: 4 },
      { type: 'upgradeCube', rewards: [{ kind: 'heal', amount: 30 }] },
      { type: 'theorem', weapon: 'sternpolygon' },
      { type: 'fire', weapon: 'spitze' },
      { type: 'explosion', x: 0, y: 0, r: 80, color: 0 },
      { type: 'pulse', x: 0, y: 0, r: 80, color: 0 },
      { type: 'enemyShot', x: 0, y: 0 },
      { type: 'ability', ability: 'vektor', x: 0, y: 0 },
      { type: 'elite', enemy: 'block' },
      { type: 'formation', kind: 'ring' },
      { type: 'boss', enemy: 'sierpinski' },
      { type: 'bossSplit', x: 0, y: 0, r: 100, depth: 1 },
      { type: 'bossDefeated' },
      { type: 'playerDied' },
      { type: 'won' },
    ];
    const { synth, as } = fake();
    const sfx = new Sfx(as);
    for (const ev of events) {
      synth.now += 1;
      synth.clear();
      sfx.event(ev, WORLD);
      expect(synth.tones.length + synth.noises.length, ev.type).toBeGreaterThan(0);
      for (const t of synth.tones)
        expect(Number.isFinite(t.freq) && t.freq > 0, ev.type).toBe(true);
    }
    for (const cue of ['move', 'confirm', 'back', 'buy', 'deny', 'toggle', 'open'] as const) {
      synth.now += 1;
      synth.clear();
      sfx.cue(cue);
      expect(synth.tones.length, cue).toBeGreaterThan(0);
    }

    synth.ready = false;
    synth.clear();
    for (const ev of events) sfx.event(ev, WORLD);
    sfx.cue('confirm');
    expect(synth.tones.length + synth.noises.length).toBe(0);
  });
});
