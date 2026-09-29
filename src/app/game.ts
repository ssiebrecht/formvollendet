import type { AudioMood, GameAudio } from '../audio/audio.ts';
import { AXIOM_LIST } from '../content/axioms.ts';
import { CHARACTER_LIST } from '../content/characters.ts';
import { DT } from '../content/tuning.ts';
import type { StatMod } from '../content/types.ts';
import { BASE_WEAPONS } from '../content/weapons.ts';
import { type RunChoice, isCharacterUnlocked, runConfig } from '../meta/progression.ts';
import { type RunOutcome, recordRun, summarizeRun } from '../meta/summary.ts';
import { morphProgress } from '../render/playerView.ts';
import type { GameRenderer, RenderSettings } from '../render/renderer.ts';
import { botChoose, botInput } from '../sim/bot.ts';
import { type InputState, NO_INPUT, RunSession, type RunState } from '../sim/run.ts';
import type { RunConfig } from '../sim/world.ts';
import { DraftView } from '../ui/draft.ts';
import { Hud } from '../ui/hud.ts';
import { PauseView } from '../ui/pause.ts';
import { ResultsView } from '../ui/results.ts';
import { Menus } from '../ui/screens/menus.ts';
import type { ScreenId } from '../ui/screens/screen.ts';
import { DebugOverlay, type LaunchOptions, applyLaunch, levelAt, stressTick } from './debug.ts';
import { type Action, Input } from './input.ts';
import { Loop } from './loop.ts';
import type { MetaStore } from './meta.ts';
import type { Settings } from './settings.ts';

/** Catch-up limit per frame; the loop already clamps frame time to 0.1 s. */
const MAX_STEPS = 8;
/** The player's shatter plays out before the results appear. */
const DEATH_DELAY = 1.2;
const WIN_DELAY = 0.6;
/** Debug runs get the draft actions so they can be tested without Reißbrett ranks. */
const DEBUG_META: readonly StatMod[] = [
  { stat: 'reroll', value: 3 },
  { stat: 'banish', value: 3 },
  { stat: 'skip', value: 3 },
];
/**
 * Attract mode behind the menus: the bot plays an endless god-mode run from a random minute
 * (so the polygon already has a few vertices) and a new one starts every `length` seconds.
 */
const DEMO = { minStart: 120, maxStart: 600, length: 75 } as const;
/** Camera offset on the title sheet: the player sits in the open right half. */
const TITLE_SHIFT = 0.45;

type Scene = 'menu' | 'run' | 'pause' | 'settings' | 'results';
type Choice = Omit<RunChoice, 'seed'>;

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

/**
 * Glue between the deterministic run and the browser: fixed-step accumulator with render
 * interpolation, hit-stop, input routing per scene (menus / run / draft / pause / results), the
 * event drain that feeds renderer and HUD, and booking finished runs into the meta save.
 */
export class Game {
  private readonly renderer: GameRenderer;
  private readonly audio: GameAudio;
  private readonly meta: MetaStore;
  private readonly settings: Settings;
  private readonly opts: LaunchOptions;
  private readonly input = new Input();
  private readonly hud: Hud;
  private readonly draft: DraftView;
  private readonly pause: PauseView;
  private readonly results: ResultsView;
  private readonly menus: Menus;
  private readonly debug: DebugOverlay;
  private readonly loop: Loop;
  private readonly view: RenderSettings;
  /** Quieter look for the attract run: no numbers, no shake, soft flashes. */
  private readonly demoView: RenderSettings;
  private readonly botState: InputState = { moveX: 0, moveY: 0, ability: false };

  private session: RunSession;
  private scene: Scene = 'menu';
  /** The session is the attract run, not the player's. */
  private demo = true;
  private demoTime = 0;
  private lastChoice: Choice;
  /** Set once the finished run is booked into the save. */
  private outcome: RunOutcome | null = null;
  /** Last run state the shell reacted to. */
  private shownState: RunState = 'playing';
  private acc = 0;
  private hitstop = 0;
  private endTimer = -1;
  private time = 0;

  constructor(
    renderer: GameRenderer,
    ui: HTMLElement,
    meta: MetaStore,
    settings: Settings,
    opts: LaunchOptions,
    audio: GameAudio,
  ) {
    this.renderer = renderer;
    this.audio = audio;
    this.meta = meta;
    this.settings = settings;
    this.opts = opts;
    this.view = {
      shake: settings.screenShake,
      flashReduction: settings.flashReduction,
      glow: settings.glow,
      damageNumbers: settings.damageNumbers,
    };
    this.demoView = {
      shake: false,
      flashReduction: true,
      glow: settings.glow,
      damageNumbers: false,
    };
    this.lastChoice = { character: opts.character, complexity: 0, endless: false };

    this.hud = new Hud(ui);
    this.draft = new DraftView(ui, audio);
    this.pause = new PauseView(ui, audio);
    this.results = new ResultsView(ui, audio);
    this.menus = new Menus(ui, meta, settings, audio, {
      startRun: (choice) => {
        this.startRun(choice);
      },
      settingsChanged: () => {
        this.applySettings();
      },
      exit: () => {
        this.exitMenus();
      },
    });
    this.debug = new DebugOverlay(ui, opts.debug || settings.showFps);
    this.applySettings();

    this.draft.onChanged = () => {
      this.drain();
      this.syncState();
    };
    this.pause.onResume = () => {
      this.audio.play('back');
      this.closePause();
    };
    this.pause.onSettings = () => {
      this.openSettings();
    };
    this.pause.onGiveUp = () => {
      this.audio.play('confirm');
      this.closePause();
      this.session.giveUp();
      this.syncState();
    };
    this.results.onAgain = () => {
      this.audio.play('confirm');
      this.startRun(this.lastChoice);
    };
    this.results.onTitle = () => {
      this.audio.play('back');
      this.showMenu('title');
    };

    this.input.debugKeys = opts.debug;
    this.input.onFocusLost = () => {
      if (this.scene === 'run' && this.running()) this.openPause();
    };
    this.input.attach();

    // The attract run exists from the start; a direct launch replaces it right away.
    this.session = this.createDemo();
    if (opts.direct) this.startRun(this.lastChoice);
    else this.showMenu(opts.scene ?? 'title');
    this.loop = new Loop((dt) => {
      this.frame(dt);
    });
  }

  start(): void {
    this.loop.start();
  }

  // ------------------------------------------------------------------------ scenes & runs

  /** Opens a menu sheet with the attract run behind it. */
  private showMenu(id: ScreenId): void {
    this.results.close();
    this.draft.close();
    this.pause.close();
    this.hud.setVisible(false);
    this.scene = 'menu';
    if (!this.demo) this.startDemo();
    this.menus.show(id);
  }

  private startRun(choice: Choice): void {
    this.lastChoice = choice;
    const seed = this.opts.seed ?? randomSeed();
    const base = runConfig(this.meta.save, { ...choice, seed });
    const cfg: RunConfig = this.opts.debug
      ? { ...base, metaMods: [...base.metaMods, ...DEBUG_META] }
      : base;

    this.menus.hide();
    this.results.close();
    this.draft.close();
    this.pause.close();
    this.renderer.reset();
    this.hud.reset();
    this.hud.setVisible(true);
    this.scene = 'run';
    this.demo = false;
    this.outcome = null;
    this.acc = 0;
    this.hitstop = 0;
    this.endTimer = -1;

    const s = new RunSession(cfg);
    this.session = s;
    applyLaunch(s, this.opts);
    // Debug setup (?t=, ?stress=) is not news: no banners or rings for it.
    s.world.events.length = 0;
    this.shownState = 'playing';
    this.syncState();
    this.input.suppressAbility();
  }

  private startDemo(): void {
    this.renderer.reset();
    this.demo = true;
    this.demoTime = 0;
    this.acc = 0;
    this.hitstop = 0;
    this.endTimer = -1;
    this.session = this.createDemo();
    this.shownState = this.session.state;
  }

  /** A form the player owns, every item, a random point in the first ten minutes. */
  private createDemo(): RunSession {
    const save = this.meta.save;
    const forms = CHARACTER_LIST.filter((c) => isCharacterUnlocked(save, c.id));
    const form = forms[Math.floor(Math.random() * forms.length)] ?? CHARACTER_LIST[0]!;
    const s = new RunSession({
      seed: randomSeed(),
      character: form.id,
      metaMods: [],
      unlockedWeapons: BASE_WEAPONS.map((d) => d.id),
      unlockedAxioms: AXIOM_LIST.map((d) => d.id),
      complexity: 0,
      endless: true,
    });
    s.world.god = true;
    const t = DEMO.minStart + Math.random() * (DEMO.maxStart - DEMO.minStart);
    s.debugJump(t);
    s.debugAutoLevel(levelAt(t) - 1);
    s.world.events.length = 0;
    return s;
  }

  /** "Zurück" on the first sheet of the menu stack. */
  private exitMenus(): void {
    if (this.scene === 'settings') {
      this.audio.play('back');
      this.menus.hide();
      this.scene = 'pause';
      this.pause.open(this.session.world, true);
      return;
    }
    // A sheet opened directly (?scene=) returns to the title.
    this.menus.show('title');
  }

  private openSettings(): void {
    this.audio.play('open');
    this.pause.close();
    this.scene = 'settings';
    this.menus.show('settings', true);
  }

  /** Settings changed on sheet 6: apply them at once. */
  private applySettings(): void {
    const st = this.settings;
    this.view.shake = st.screenShake;
    this.view.flashReduction = st.flashReduction;
    this.view.glow = st.glow;
    this.view.damageNumbers = st.damageNumbers;
    this.demoView.glow = st.glow;
    this.debug.setVisible(this.opts.debug || st.showFps);
    this.audio.setVolumes(st.masterVolume, st.sfxVolume, st.musicVolume);
  }

  // ------------------------------------------------------------------------------- frame

  private frame(dt: number): void {
    this.time += dt;
    this.input.poll();
    const actions = this.input.takeActions();
    // Gamepad presses cannot unlock audio on their own; after any click or key they can.
    if (actions.length > 0) this.audio.wake();
    for (const a of actions) this.onAction(a);

    const t0 = performance.now();
    if (this.scene === 'menu') this.simulateDemo(dt);
    else if (this.scene === 'run') this.simulate(dt);
    const t1 = performance.now();

    const s = this.session;
    const w = s.world;
    const alpha = s.state === 'playing' ? Math.min(1, this.acc / DT) : 1;
    const morph = s.state === 'morph' ? morphProgress(w.morphTicks) : 1;
    this.renderer.shift = this.scene === 'menu' && this.menus.current === 'title' ? TITLE_SHIFT : 0;
    this.renderer.frame(w, alpha, dt, this.time, morph, this.demo ? this.demoView : this.view);
    if (!this.demo) this.hud.update(w, dt);
    this.audio.update(dt, w, this.mood());
    const t2 = performance.now();
    this.debug.update(
      t2,
      t1 - t0,
      t2 - t1,
      w,
      this.renderer.particleCount,
      s.state,
      this.opts.debug,
    );
  }

  /** Music follows the scene: calm menus, the run, muffled while paused, fading at the end. */
  private mood(): AudioMood {
    switch (this.scene) {
      case 'menu':
        return 'menu';
      case 'pause':
      case 'settings':
        return 'paused';
      case 'results':
        return 'end';
      case 'run': {
        const st = this.session.state;
        if (st === 'won' || st === 'lost') return 'end';
        return st === 'draft' ? 'paused' : 'run';
      }
    }
  }

  /** The world advances in these states; the draft and the end states freeze it. */
  private running(): boolean {
    const st = this.session.state;
    return st === 'playing' || st === 'morph';
  }

  private simulate(dt: number): void {
    const s = this.session;
    if (s.state === 'won' || s.state === 'lost') {
      if (this.endTimer > 0) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.showResults();
      }
      return;
    }
    if (!this.running()) return;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS) {
      const before = s.state;
      if (before === 'playing' && this.opts.stress > 0) stressTick(s.world, this.opts.stress);
      s.step(before === 'playing' ? this.input.sample() : NO_INPUT);
      this.acc -= DT;
      steps++;
      // The stress test must keep the horde moving: drafts pick themselves.
      if (this.opts.stress > 0) while (s.state === 'draft') s.choose(0);
      this.drain();
      this.syncState();
      if (!this.running() || this.hitstop > 0) break;
    }
    // A long stall must not snowball into ever more catch-up steps.
    if (steps >= MAX_STEPS) this.acc = Math.min(this.acc, DT);
  }

  /** The attract run: bot input, instant drafts, no hit-stop, restarts after a while. */
  private simulateDemo(dt: number): void {
    this.demoTime += dt;
    if (this.demoTime >= DEMO.length) this.startDemo();
    const s = this.session;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS) {
      while (s.state === 'draft') s.choose(botChoose(s.cards));
      s.step(s.state === 'playing' ? botInput(s.world, this.botState) : NO_INPUT);
      this.acc -= DT;
      steps++;
      this.drain();
    }
    if (steps >= MAX_STEPS) this.acc = Math.min(this.acc, DT);
    this.hitstop = 0;
  }

  /** Sends this step's events to renderer and HUD, then clears them (draft actions add more). */
  private drain(): void {
    const w = this.session.world;
    const view = this.demo ? this.demoView : this.view;
    for (const ev of w.events) {
      this.renderer.handleEvent(ev, w, view);
      // The attract run stays silent; only the music plays behind the menus.
      if (this.demo) continue;
      this.hud.handleEvent(ev, w);
      this.audio.event(ev, w);
    }
    w.events.length = 0;
    this.hitstop = Math.max(this.hitstop, this.renderer.takeHitstop());
  }

  /** Reacts to run-state transitions: draft open/close, death, victory. */
  private syncState(): void {
    const s = this.session;
    const st = s.state;
    if (st === this.shownState) return;
    const prev = this.shownState;
    this.shownState = st;

    if (st === 'draft' && this.scene === 'run') this.draft.open(s);
    if (prev === 'draft') {
      this.draft.close();
      this.input.suppressAbility();
    }
    // The frozen frame was drawn at alpha 1; step at once so interpolation continues from there.
    if (st === 'playing') this.acc = Math.max(this.acc, DT);
    if (st === 'lost') {
      this.renderer.shatterPlayer(s.world, this.demo ? this.demoView : this.view);
      this.endTimer = DEATH_DELAY;
    }
    if (st === 'won') this.endTimer = WIN_DELAY;
    if (st === 'won' || st === 'lost') this.book(st === 'won');
  }

  /** Books the finished run into the save, once: Splitter, statistics, Kompendium, Beweise. */
  private book(won: boolean): void {
    if (this.demo || this.outcome) return;
    this.outcome = recordRun(this.meta.save, summarizeRun(this.session.world, won));
    this.meta.commit();
  }

  private showResults(): void {
    this.endTimer = -1;
    this.scene = 'results';
    const s = this.session;
    this.results.open(s.world, {
      won: s.state === 'won',
      endless: s.world.cfg.endless,
      outcome: this.outcome,
      saved: this.meta.persistent,
    });
  }

  // ------------------------------------------------------------------------------- input

  private onAction(a: Action): void {
    if (a.startsWith('debug')) {
      this.debugAction(a);
      return;
    }
    switch (this.scene) {
      case 'menu':
        if (a !== 'pause') this.menus.handle(a);
        return;
      case 'settings':
        // Opened from the pause: the pause key leads back there.
        this.menus.handle(a === 'pause' ? 'back' : a);
        return;
      case 'pause':
        this.pause.handle(a);
        return;
      case 'results':
        this.results.handle(a);
        return;
      case 'run':
        break;
    }
    const st = this.session.state;
    if (st === 'draft') {
      if (a === 'pause' || (a === 'back' && !this.draft.banishing)) this.openPause();
      else this.draft.handle(a);
      return;
    }
    if (this.running() && (a === 'pause' || a === 'back')) this.openPause();
  }

  private openPause(): void {
    this.audio.play('open');
    this.scene = 'pause';
    this.draft.close();
    this.pause.open(this.session.world);
  }

  private closePause(): void {
    this.pause.close();
    this.scene = 'run';
    if (this.session.state === 'draft') this.draft.open(this.session, true);
    this.input.suppressAbility();
  }

  private debugAction(a: Action): void {
    if (a === 'debug1') {
      this.debug.toggle();
      return;
    }
    const s = this.session;
    if (this.scene !== 'run' || s.state !== 'playing') return;
    switch (a) {
      case 'debug2':
        s.debugLevelUp(1);
        break;
      case 'debug3':
        s.debugElite();
        break;
      case 'debug4':
        s.debugJump(60);
        break;
      case 'debug5':
        s.debugBoss();
        break;
      case 'debug6':
        s.debugToggleGod();
        break;
      case 'debug7':
        s.debugClear();
        break;
      default:
        break;
    }
    this.drain();
    this.syncState();
  }
}
