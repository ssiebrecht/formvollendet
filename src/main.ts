import './ui/styles.css';
import './ui/menus.css';
import { applyDebugSave, parseLaunch } from './app/debug.ts';
import { Game } from './app/game.ts';
import { MetaStore, browserStorage } from './app/meta.ts';
import { loadSettings } from './app/settings.ts';
import { GameAudio } from './audio/audio.ts';
import { S } from './content/strings.de.ts';
import { installNumberFont } from './render/damageNumbers.ts';
import { GameRenderer } from './render/renderer.ts';

let errorShown = false;

/** Full-screen error with a reload button; only the first error is shown. */
function showError(text: string): void {
  if (errorShown) return;
  errorShown = true;
  const box = document.createElement('div');
  box.className = 'error-box';
  const title = document.createElement('div');
  title.className = 'error-title';
  title.textContent = S.error.title;
  const body = document.createElement('div');
  body.className = 'error-text';
  body.textContent = text;
  const reload = document.createElement('button');
  reload.className = 'btn primary';
  reload.textContent = S.error.reload;
  reload.addEventListener('click', () => {
    location.reload();
  });
  box.append(title, body, reload);
  document.body.append(box);
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

window.addEventListener('error', (e) => {
  showError(describe(e.error ?? e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  showError(describe(e.reason));
});

async function boot(): Promise<void> {
  const gameHost = document.getElementById('game');
  const uiHost = document.getElementById('ui');
  if (!gameHost || !uiHost) throw new Error('#game or #ui is missing.');

  installNumberFont();
  let renderer: GameRenderer;
  try {
    renderer = await GameRenderer.create(gameHost);
  } catch (err) {
    console.error(err);
    showError(S.error.webgl);
    return;
  }
  const opts = parseLaunch(location.search);
  const meta = new MetaStore(browserStorage(), opts.persistent);
  applyDebugSave(meta.save, opts);
  const audio = new GameAudio();
  audio.attach();
  const game = new Game(renderer, uiHost, meta, loadSettings(), opts, audio);
  // Handle for the devtools console and scripts/smoke.ts.
  if (opts.debug) Object.assign(window, { game });
  game.start();
}

boot().catch((err: unknown) => {
  showError(describe(err));
});
