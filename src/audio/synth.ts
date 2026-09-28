/**
 * Tiny WebAudio synthesizer: every sound in the game is an oscillator or filtered noise with a
 * short envelope, so there are no asset files. Two buses (effects, music) feed a master gain and
 * a limiter. Effects share a voice budget; when it is full, a new sound may only replace one of
 * equal or lower priority.
 */

export type Bus = 'sfx' | 'music';

/** Voice priority: spam (hits, gems) < normal < important (pickups, UI) < big moments. */
export type Priority = 0 | 1 | 2 | 3;

/** One oscillator note. Times in seconds, frequencies in Hz. */
export interface Tone {
  wave: OscillatorType;
  freq: number;
  /** Exponential glide target. */
  to?: number;
  /** Glide duration; defaults to the whole note. */
  glide?: number;
  /** Attack + hold + decay. */
  dur: number;
  gain: number;
  attack?: number;
  /** Seconds at full level before the decay starts. */
  hold?: number;
  /** Start offset from now. */
  delay?: number;
  /** Absolute context time; wins over `delay` (the music scheduler plans ahead). */
  at?: number;
  pan?: number;
  detune?: number;
  /** Low-pass cutoff; tames square and saw waves. */
  cutoff?: number;
  /** Pitch wobble: rate in Hz, depth in Hz (sirens, beams). */
  wobble?: readonly [number, number];
}

/** Filtered white noise (explosions, whooshes, drums). */
export interface Noise {
  filter: BiquadFilterType;
  freq: number;
  /** Exponential filter sweep target. */
  to?: number;
  q?: number;
  dur: number;
  gain: number;
  attack?: number;
  hold?: number;
  delay?: number;
  at?: number;
  pan?: number;
}

interface Voice {
  end: number;
  prio: number;
  env: GainNode;
  src: AudioScheduledSourceNode;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  /** Pause/draft: the music drops and loses its highs. */
  duck: GainNode;
  muffle: BiquadFilterNode;
  noise: AudioBuffer;
}

const MAX_VOICES = 24;
/** The music plans its own density; this only guards against runaway pads. */
const MAX_MUSIC_VOICES = 32;
const SILENCE = 0.0001;
/**
 * Bus make-up gain. Single sounds are written quiet (0.01–0.3) so dozens can stack; the buses
 * lift them to a healthy level and the limiter catches the rest.
 */
const SFX_GAIN = 7;
const MUSIC_GAIN = 3;
/** Volume sliders feel linear when the gain follows the square of the value. */
const curve = (v: number): number => v * v;

export class Synth {
  private graph: Graph | null = null;
  private readonly sfxVoices: Voice[] = [];
  private readonly musicVoices: Voice[] = [];
  private volumes: readonly [number, number, number] = [0.8, 0.8, 0.5];
  private muffled = false;
  /** The page is hidden: the context sleeps and wakes up with the page. */
  private hidden = false;

  /** Starts audio on the first user gesture (browsers refuse it before). */
  attach(): void {
    const unlock = (): void => {
      this.unlock();
    };
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('pointerdown', unlock, true);
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      const ctx = this.graph?.ctx;
      if (!ctx) return;
      if (this.hidden) void ctx.suspend();
      else void ctx.resume();
    });
  }

  /**
   * Creates or resumes the context. Browsers need user activation for that: a click or a key
   * (not Esc) brings it, the gamepad does not, so gamepad input only counts once the page was
   * clicked or typed into. Without activation this does nothing (and logs no warning).
   */
  unlock(): void {
    if (this.hidden || !hasActivation()) return;
    if (!this.graph) {
      this.graph = this.build();
      this.applyVolumes(0);
      this.applyMuffle(0);
    }
    if (this.graph.ctx.state === 'suspended') void this.graph.ctx.resume();
  }

  get ready(): boolean {
    return this.graph?.ctx.state === 'running';
  }

  /** Context time in seconds (0 before the first gesture). */
  get now(): number {
    return this.graph?.ctx.currentTime ?? 0;
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.volumes = [master, sfx, music];
    this.applyVolumes(0.03);
  }

  /** Muffles the music (pause, draft); the effects stay clear. */
  setMuffled(on: boolean): void {
    if (on === this.muffled) return;
    this.muffled = on;
    this.applyMuffle(0.12);
  }

  tone(t: Tone, bus: Bus = 'sfx', prio: Priority = 1): void {
    const g = this.graph;
    if (g?.ctx.state !== 'running') return;
    const ctx = g.ctx;
    const now = ctx.currentTime;
    const start = t.at ?? now + (t.delay ?? 0);
    const end = start + t.dur;
    if (!this.admit(bus, prio, now)) return;

    const osc = ctx.createOscillator();
    osc.type = t.wave;
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to !== undefined && t.to !== t.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.to), start + (t.glide ?? t.dur));
    }
    if (t.detune) osc.detune.value = t.detune;
    let lfo: OscillatorNode | null = null;
    if (t.wobble) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = t.wobble[0];
      const depth = ctx.createGain();
      depth.gain.value = t.wobble[1];
      lfo.connect(depth).connect(osc.frequency);
    }
    let head: AudioNode = osc;
    if (t.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = t.cutoff;
      head = head.connect(f);
    }
    const env = this.envelope(ctx, start, t.attack ?? 0.004, t.hold ?? 0, t.dur, t.gain);
    head.connect(env);
    this.route(g, env, bus, t.pan);

    osc.start(start);
    osc.stop(end + 0.02);
    if (lfo) {
      lfo.start(start);
      lfo.stop(end + 0.02);
    }
    this.track(bus, { end: end + 0.02, prio, env, src: osc });
  }

  noise(n: Noise, bus: Bus = 'sfx', prio: Priority = 1): void {
    const g = this.graph;
    if (g?.ctx.state !== 'running') return;
    const ctx = g.ctx;
    const now = ctx.currentTime;
    const start = n.at ?? now + (n.delay ?? 0);
    const end = start + n.dur;
    if (!this.admit(bus, prio, now)) return;

    const src = ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = n.filter;
    f.frequency.setValueAtTime(n.freq, start);
    if (n.to !== undefined && n.to !== n.freq) {
      f.frequency.exponentialRampToValueAtTime(Math.max(1, n.to), end);
    }
    if (n.q !== undefined) f.Q.value = n.q;
    const env = this.envelope(ctx, start, n.attack ?? 0.003, n.hold ?? 0, n.dur, n.gain);
    src.connect(f).connect(env);
    this.route(g, env, bus, n.pan);

    // A random offset into the loop keeps repeated bursts from sounding identical.
    src.start(start, Math.random() * g.noise.duration);
    src.stop(end + 0.02);
    this.track(bus, { end: end + 0.02, prio, env, src });
  }

  // --------------------------------------------------------------------------------- graph

  private build(): Graph {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    // Limiter: only the loudest pile-ups reach it. The node adds its own make-up gain, which
    // `trim` takes back; the soft clipper after it keeps rare overshoots from hard clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    const trim = ctx.createGain();
    trim.gain.value = 0.8;
    const clip = ctx.createWaveShaper();
    clip.curve = softClip();
    clip.oversample = '2x';
    // The shaper clamps its input to ±1: halve it going in, the curve doubles it back.
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    limiter.connect(trim).connect(pre).connect(clip).connect(ctx.destination);

    const master = ctx.createGain();
    master.connect(limiter);
    const sfx = ctx.createGain();
    sfx.connect(master);
    const music = ctx.createGain();
    const duck = ctx.createGain();
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.Q.value = 0.5;
    music.connect(duck).connect(muffle).connect(master);

    const length = ctx.sampleRate * 2;
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return { ctx, master, sfx, music, duck, muffle, noise };
  }

  /** `tau` 0 sets the values at once (fresh graph); otherwise they glide there. */
  private applyVolumes(tau: number): void {
    const g = this.graph;
    if (!g) return;
    const [master, sfx, music] = this.volumes;
    glide(g.ctx, g.master.gain, curve(master), tau);
    glide(g.ctx, g.sfx.gain, curve(sfx) * SFX_GAIN, tau);
    glide(g.ctx, g.music.gain, curve(music) * MUSIC_GAIN, tau);
  }

  private applyMuffle(tau: number): void {
    const g = this.graph;
    if (!g) return;
    glide(g.ctx, g.duck.gain, this.muffled ? 0.55 : 1, tau);
    glide(g.ctx, g.muffle.frequency, this.muffled ? 700 : 18000, tau);
  }

  /** 0 → peak (linear attack) → hold → exponential decay to silence at `start + dur`. */
  private envelope(
    ctx: AudioContext,
    start: number,
    attack: number,
    hold: number,
    dur: number,
    peak: number,
  ): GainNode {
    const env = ctx.createGain();
    const a = Math.min(attack, dur * 0.5);
    const top = Math.max(SILENCE * 2, peak);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(top, start + a);
    if (hold > 0) env.gain.setValueAtTime(top, Math.min(start + a + hold, start + dur - 0.01));
    env.gain.exponentialRampToValueAtTime(SILENCE, start + dur);
    return env;
  }

  private route(g: Graph, env: GainNode, bus: Bus, pan: number | undefined): void {
    const dest = bus === 'sfx' ? g.sfx : g.music;
    if (!pan) {
      env.connect(dest);
      return;
    }
    const p = g.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    env.connect(p).connect(dest);
  }

  // -------------------------------------------------------------------------------- voices

  /** Frees finished voices; when the bus is full, steals the least important one or refuses. */
  private admit(bus: Bus, prio: Priority, now: number): boolean {
    const list = bus === 'sfx' ? this.sfxVoices : this.musicVoices;
    const cap = bus === 'sfx' ? MAX_VOICES : MAX_MUSIC_VOICES;
    for (let i = list.length - 1; i >= 0; i--) if (list[i]!.end <= now) list.splice(i, 1);
    if (list.length < cap) return true;
    let victim = -1;
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (v.prio > prio) continue;
      const best = list[victim];
      if (!best || v.prio < best.prio || (v.prio === best.prio && v.end < best.end)) victim = i;
    }
    const v = list[victim];
    if (!v) return false;
    list.splice(victim, 1);
    // A short fade instead of a hard stop avoids a click.
    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(v.env.gain.value, now);
    v.env.gain.setTargetAtTime(0, now, 0.006);
    v.src.stop(now + 0.04);
    return true;
  }

  private track(bus: Bus, v: Voice): void {
    (bus === 'sfx' ? this.sfxVoices : this.musicVoices).push(v);
    v.src.onended = () => {
      v.env.disconnect();
    };
  }
}

function glide(ctx: BaseAudioContext, p: AudioParam, value: number, tau: number): void {
  if (tau <= 0) p.value = value;
  else p.setTargetAtTime(value, ctx.currentTime, tau);
}

/**
 * Transfer curve for the output: linear up to 0.8, then a tanh shoulder that never passes 1.
 * The input is pre-scaled by 0.5, so the curve spans −2..2.
 */
function softClip(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    curve[i] = a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
  }
  return curve;
}

function hasActivation(): boolean {
  // Browsers without the User Activation API get audio from their gesture handlers only.
  const ua = (navigator as { userActivation?: UserActivation }).userActivation;
  return ua?.hasBeenActive ?? true;
}

/** MIDI note number → frequency (A4 = 69 = 440 Hz). */
export function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

const PENTATONIC = [0, 3, 5, 7, 10] as const;

/** Degree `i` of the A-minor pentatonic above `base` (the key the music plays in). */
export function pentatonic(i: number, base = 57): number {
  const octave = Math.floor(i / PENTATONIC.length);
  return base + octave * 12 + PENTATONIC[i % PENTATONIC.length]!;
}
