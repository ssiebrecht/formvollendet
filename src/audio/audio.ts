import type { SimEvent } from '../sim/events.ts';
import type { World } from '../sim/world.ts';
import type { UiCue, UiSound } from '../ui/nav.ts';
import { Music, type MusicMood } from './music.ts';
import { Sfx } from './sfx.ts';
import { Synth } from './synth.ts';

/** What the app is showing, as far as the audio cares. */
export type AudioMood = 'menu' | 'run' | 'paused' | 'end';

/** Enemies on screen at which the music reaches full intensity. */
const FULL_DENSITY = 450;

/** The whole audio side behind one object: menu cues, sim events, music, volumes. */
export class GameAudio implements UiSound {
  private readonly synth = new Synth();
  private readonly sfx = new Sfx(this.synth);
  private readonly music = new Music(this.synth);

  /** Starts audio with the first click or key press. */
  attach(): void {
    this.synth.attach();
  }

  /** Gamepad input: starts audio if the page already saw a click or key press. */
  wake(): void {
    this.synth.unlock();
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.synth.setVolumes(master, sfx, music);
  }

  play(cue: UiCue): void {
    this.sfx.cue(cue);
  }

  event(ev: SimEvent, w: World): void {
    this.sfx.event(ev, w);
  }

  /** Every frame: music mood and intensity; pause and draft muffle the music. */
  update(dt: number, w: World, mood: AudioMood): void {
    this.synth.setMuffled(mood === 'paused');
    const d = w.director;
    const music: MusicMood =
      mood === 'menu'
        ? 'menu'
        : mood === 'end'
          ? 'end'
          : d.bossSpawned && !d.bossDefeated
            ? 'boss'
            : 'run';
    this.music.update(dt, music, Math.sqrt(Math.min(1, w.enemies.count / FULL_DENSITY)));
  }
}
