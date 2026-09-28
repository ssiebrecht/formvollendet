/**
 * Browser smoke test without extra dependencies: starts a local headless Chrome, drives it over
 * the DevTools protocol, runs a list of steps and fails on console errors or warnings.
 *
 *   npm run dev   (in another terminal)
 *   node scripts/smoke.ts --url "http://localhost:5173/?seed=7&debug" \
 *     --step wait:3000 --step shot:run --step key:F2 --step wait:400 --step shot:draft \
 *     --step "eval:game.session.state"
 *
 * Steps:
 *   wait:<ms>            real-time pause
 *   shot:<name>          screenshot to .smoke/<name>.png
 *   key:<code>           tap a key (KeyboardEvent.code, e.g. KeyD, Digit1, F2, Space, Escape)
 *   hold:<code>:<ms>     hold a key
 *   eval:<js>            evaluate in the page and print the result
 *
 * Options: --width/--height (viewport, default 1280×720), --soft (software GL instead of the GPU).
 * The Chrome binary comes from $CHROME or the usual install paths.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173/?debug' },
    step: { type: 'string', multiple: true, default: [] },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '720' },
    soft: { type: 'boolean', default: false },
  },
});

const OUT = resolve('.smoke');
const PROFILE = join(OUT, 'profile');

function findChrome(): string {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  for (const c of candidates) if (c && existsSync(c)) return c;
  throw new Error('No Chrome found; set $CHROME.');
}

// ------------------------------------------------------------------------------ protocol

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
}

interface ConsoleArg {
  value?: unknown;
  description?: string;
}

/** The protocol events this script listens to, with the parameter fields it reads. */
interface CdpEvents {
  'Runtime.consoleAPICalled': { type: string; args: ConsoleArg[] };
  'Runtime.exceptionThrown': {
    exceptionDetails: { text: string; exception?: { description?: string } };
  };
  'Log.entryAdded': { entry: { level: string; text: string; url?: string } };
  'Page.loadEventFired': unknown;
}

type Handler = (params: unknown) => void;

/** Minimal DevTools-protocol client over the built-in WebSocket. */
class Cdp {
  private readonly ws: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, (m: CdpMessage) => void>();
  private readonly handlers = new Map<string, Handler[]>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (e: MessageEvent<string>) => {
      const m = JSON.parse(e.data) as CdpMessage;
      if (m.id !== undefined) {
        this.pending.get(m.id)?.(m);
        this.pending.delete(m.id);
      } else if (m.method) {
        for (const h of this.handlers.get(m.method) ?? []) h(m.params);
      }
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((ok, fail) => {
      ws.addEventListener('open', () => {
        ok();
      });
      ws.addEventListener('error', () => {
        fail(new Error(`WebSocket to ${url} failed.`));
      });
    });
    return new Cdp(ws);
  }

  send<T = unknown>(method: string, params: object = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((ok, fail) => {
      this.pending.set(id, (m) => {
        if (m.error) fail(new Error(`${method}: ${m.error.message}`));
        else ok(m.result as T);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on<K extends keyof CdpEvents>(method: K, handler: (params: CdpEvents[K]) => void): void {
    const list = this.handlers.get(method) ?? [];
    list.push(handler as Handler);
    this.handlers.set(method, list);
  }

  once(method: keyof CdpEvents): Promise<void> {
    return new Promise((ok) => {
      let done = false;
      this.on(method, () => {
        if (done) return;
        done = true;
        ok();
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

// ---------------------------------------------------------------------------------- keys

function keyInfo(code: string): { key: string; keyCode: number } {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return { key: m[1]!.toLowerCase(), keyCode: m[1]!.charCodeAt(0) };
  m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (m) return { key: m[1]!, keyCode: 48 + Number(m[1]) };
  m = /^F(\d+)$/.exec(code);
  if (m) return { key: code, keyCode: 111 + Number(m[1]) };
  const named: Record<string, [string, number]> = {
    Space: [' ', 32],
    Enter: ['Enter', 13],
    Escape: ['Escape', 27],
    ArrowLeft: ['ArrowLeft', 37],
    ArrowUp: ['ArrowUp', 38],
    ArrowRight: ['ArrowRight', 39],
    ArrowDown: ['ArrowDown', 40],
  };
  const n = named[code];
  if (!n) throw new Error(`Unknown key code ${code}`);
  return { key: n[0], keyCode: n[1] };
}

async function keyEvent(cdp: Cdp, type: 'keyDown' | 'keyUp', code: string): Promise<void> {
  const { key, keyCode } = keyInfo(code);
  await cdp.send('Input.dispatchKeyEvent', {
    type,
    code,
    key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    ...(type === 'keyDown' && key.length === 1 ? { text: key } : {}),
  });
}

// ---------------------------------------------------------------------------------- main

/** Strings print as they are; objects and errors by their protocol description. */
function argText(a: ConsoleArg): string {
  if (typeof a.value === 'string') return a.value;
  return a.description ?? JSON.stringify(a.value);
}

const problems: string[] = [];
const messages: string[] = [];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  rmSync(PROFILE, { recursive: true, force: true });
  const width = Number(values.width);
  const height = Number(values.height);
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--window-size=${width},${height}`,
    ...(values.soft ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : []),
    'about:blank',
  ];
  const chrome = spawn(findChrome(), args, { stdio: 'ignore' });
  try {
    const portFile = join(PROFILE, 'DevToolsActivePort');
    let port = 0;
    for (let i = 0; i < 150 && port === 0; i++) {
      if (existsSync(portFile)) port = Number(readFileSync(portFile, 'utf8').split('\n')[0]) || 0;
      if (port === 0) await sleep(100);
    }
    if (port === 0) throw new Error('Chrome did not open a DevTools port.');
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
    }[];
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('No page target.');
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);

    cdp.on('Runtime.consoleAPICalled', (p) => {
      const text = p.args.map(argText).join(' ');
      messages.push(`[console.${p.type}] ${text}`);
      if (p.type === 'error' || p.type === 'warning' || p.type === 'assert') problems.push(text);
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      problems.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
    });
    cdp.on('Log.entryAdded', (p) => {
      messages.push(`[log.${p.entry.level}] ${p.entry.text} ${p.entry.url ?? ''}`);
      if (p.entry.level === 'error' || p.entry.level === 'warning') problems.push(p.entry.text);
    });

    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: values.url });
    await loaded;
    console.log(`loaded ${values.url}`);

    for (const step of values.step) {
      const [kind, ...rest] = step.split(':');
      const arg = rest.join(':');
      switch (kind) {
        case 'wait':
          await sleep(Number(arg));
          break;
        case 'shot': {
          const r = await cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
          const file = join(OUT, `${arg}.png`);
          writeFileSync(file, Buffer.from(r.data, 'base64'));
          console.log(`shot ${file}`);
          break;
        }
        case 'key':
          await keyEvent(cdp, 'keyDown', arg);
          await keyEvent(cdp, 'keyUp', arg);
          break;
        case 'hold': {
          const [code = '', ms = '0'] = arg.split(':');
          await keyEvent(cdp, 'keyDown', code);
          await sleep(Number(ms));
          await keyEvent(cdp, 'keyUp', code);
          break;
        }
        case 'eval': {
          const r = await cdp.send<{
            result: { value?: unknown };
            exceptionDetails?: { text: string };
          }>('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
          if (r.exceptionDetails) problems.push(`eval failed: ${arg}: ${r.exceptionDetails.text}`);
          console.log(`eval ${arg} → ${JSON.stringify(r.result.value)}`);
          break;
        }
        default:
          throw new Error(`Unknown step ${step}`);
      }
    }
    cdp.close();
  } finally {
    chrome.kill();
  }
}

main()
  .then(() => {
    for (const m of messages) console.log(m);
    if (problems.length > 0) {
      console.error(`\n${problems.length} console problem(s):`);
      for (const p of problems) console.error(`  ${p}`);
      process.exitCode = 1;
    } else console.log('\nconsole clean');
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
