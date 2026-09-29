/**
 * Headless balance sim: plays full runs with the autopilot and prints how they went.
 *
 *   node scripts/sim.ts [--seeds 10] [--first 1] [--minutes 23] [--char delta] [--complexity 0]
 *                       [--meta [0-3]] [--endless] [--jobs 4] [--react 12]
 *
 * Per-minute table (averaged over seeds that were still alive), one line per run and a summary
 * with the Splitter reward the meta layer would book. `--endless` plays the endless mode.
 * `--meta n` gives every Reißbrett entry its max rank with n Erweiterungen (`--meta` alone: 0).
 * `--jobs` splits the seeds across child processes; the results are identical to a serial run.
 * `--react` is the bot's reaction time in ticks: it only re-plans every n ticks, like a human
 * who needs ~0.2 s to respond (1 = superhuman, re-plans every tick).
 */
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { META_UPGRADES } from '../src/content/meta.ts';
import { DT, RUN } from '../src/content/tuning.ts';
import type { CharacterId, MetaTier, StatMod } from '../src/content/types.ts';
import { runReward, summarizeRun } from '../src/meta/summary.ts';
import { botChoose, botInput } from '../src/sim/bot.ts';
import { type InputState, RunSession } from '../src/sim/run.ts';
import { bossProgress } from '../src/sim/systems/boss.ts';

// `--meta` alone means tier 0; parseArgs wants the value spelled out.
const argv = process.argv.slice(2);
const metaAt = argv.indexOf('--meta');
if (metaAt >= 0 && !/^[0-3]$/.test(argv[metaAt + 1] ?? '')) argv.splice(metaAt + 1, 0, '0');

const { values } = parseArgs({
  args: argv,
  options: {
    seeds: { type: 'string', default: '10' },
    first: { type: 'string', default: '1' },
    minutes: { type: 'string', default: String(RUN.length / 60 + 3) },
    char: { type: 'string', default: 'delta' },
    complexity: { type: 'string', default: '0' },
    meta: { type: 'string' },
    endless: { type: 'boolean', default: false },
    jobs: { type: 'string', default: '1' },
    react: { type: 'string', default: '12' },
    // Internal: a child process prints its results as JSON instead of the report.
    json: { type: 'boolean', default: false },
  },
});

const seeds = Number(values.seeds);
const first = Number(values.first);
const minutes = Number(values.minutes);
const character = values.char as CharacterId;
const complexity = Number(values.complexity);
const endless = values.endless;
const jobs = Math.max(1, Math.min(Number(values.jobs), seeds));
const react = Math.max(1, Number(values.react));
// --meta n: every Reißbrett entry at its max rank for tier n (upper bound of meta power).
const tier = values.meta === undefined ? null : (Number(values.meta) as MetaTier);
const metaMods: StatMod[] =
  tier === null
    ? []
    : META_UPGRADES.map((u) => ({ stat: u.stat, value: u.perRank * u.ranks[tier] }));

interface Sample {
  level: number;
  hp: number;
  enemies: number;
  kills: number;
  vertices: number;
  dps: number;
  msPerTick: number;
}

interface Peak {
  enemies: number;
  projectiles: number;
  bullets: number;
  gems: number;
}

interface RunResult {
  seed: number;
  state: string;
  time: number;
  bossKilled: boolean;
  bossKills: number;
  maxWeaponLevel: number;
  /** Splitter the meta layer books for this run. */
  reward: number;
  /** Largest pool sizes seen during the run. */
  peak: Peak;
  /** Seconds from each boss spawn to its defeat. */
  fights: number[];
  /** Damage taken per attacker. */
  hurtBy: Record<string, number>;
  killedBy: string;
  /** Index = minute; null once the run is over. */
  samples: (Sample | null)[];
  line: string;
}

function runSeed(seed: number): RunResult {
  const s = new RunSession({
    seed,
    character,
    metaMods,
    unlockedWeapons: ['strahl', 'fraktal'],
    unlockedAxioms: ['symmetrie', 'integral'],
    complexity,
    endless,
  });
  const w = s.world;
  const input: InputState = { moveX: 0, moveY: 0, ability: false };
  const samples: (Sample | null)[] = Array.from({ length: minutes + 1 }, () => null);
  const total = Math.round((minutes * 60) / DT);
  const peak: Peak = { enemies: 0, projectiles: 0, bullets: 0, gems: 0 };
  const fights: number[] = [];
  let fightStart = -1;
  let lastDamage = 0;
  let simMs = 0;
  let simTicks = 0;
  for (let i = 0; i < total; i++) {
    while (s.state === 'draft') s.choose(botChoose(s.cards));
    if (s.state === 'won' || s.state === 'lost') break;
    const t0 = performance.now();
    if (w.tick % react === 0) botInput(w, input);
    else input.ability = false;
    s.step(input);
    simMs += performance.now() - t0;
    simTicks++;
    peak.enemies = Math.max(peak.enemies, w.enemies.count);
    peak.projectiles = Math.max(peak.projectiles, w.projectiles.count);
    peak.bullets = Math.max(peak.bullets, w.bullets.count);
    peak.gems = Math.max(peak.gems, w.gems.count);
    const fighting = bossAlive(w);
    if (fighting && fightStart < 0) fightStart = w.time;
    if (!fighting && fightStart >= 0) {
      if (w.director.bossDefeated) fights.push(w.time - fightStart);
      fightStart = -1;
    }
    if (w.tick > 0 && w.tick % 3600 === 0) {
      const minute = w.tick / 3600;
      let dealt = 0;
      for (const v of w.run.damageBySource.values()) dealt += v;
      if (minute <= minutes) {
        samples[minute] = {
          level: w.player.level,
          hp: w.player.hp,
          enemies: w.enemies.count,
          kills: w.run.kills,
          vertices: w.player.vertices,
          dps: (dealt - lastDamage) / 60,
          msPerTick: simMs / Math.max(1, simTicks),
        };
      }
      lastDamage = dealt;
      simMs = 0;
      simTicks = 0;
    }
  }
  const weapons = w.player.weapons
    .filter((x) => x !== null)
    .map((x) => `${x.def.id}${x.level}`)
    .join(' ');
  const reward = runReward(summarizeRun(w, s.state === 'won')).total;
  const line =
    `seed ${String(seed).padStart(3)}  ${s.state.padEnd(7)} ${fmtTime(w.time)}  lv ${String(w.player.level).padStart(3)}  ` +
    `kills ${String(w.run.kills).padStart(5)}  form ${w.player.vertices}  theorems ${w.run.theorems.length}  ` +
    `boss ${w.run.bossKills}${fights.length > 0 ? ` (${fights.map((f) => Math.round(f)).join('/')} s)` : ''}${bossAlive(w) ? ` (${Math.round(bossProgress(w) * 100)} % left)` : ''}  reward ${String(reward).padStart(5)}  [${weapons}]` +
    (w.run.killedBy ? `  † ${w.run.killedBy}` : '');
  return {
    seed,
    state: s.state,
    time: w.time,
    bossKilled: w.run.bossKilled,
    bossKills: w.run.bossKills,
    maxWeaponLevel: w.run.maxWeaponLevel,
    reward,
    peak,
    fights,
    hurtBy: Object.fromEntries(w.run.hurtBy),
    killedBy: w.run.killedBy,
    samples,
    line,
  };
}

/** A boss is on the field and not yet beaten. */
function bossAlive(w: RunSession['world']): boolean {
  return w.director.bossSpawned && !w.director.bossDefeated;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2)}:${String(s).padStart(2, '0')}`;
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Runs the seeds in `jobs` child processes, each taking a slice of consecutive seeds. */
async function runParallel(): Promise<RunResult[]> {
  const base = argv.filter((a, i, all) => {
    const flag = a.startsWith('--') ? a : all[i - 1];
    return flag !== '--jobs' && flag !== '--first' && flag !== '--seeds';
  });
  const slices: { first: number; count: number }[] = [];
  const size = Math.ceil(seeds / jobs);
  for (let a = 0; a < seeds; a += size) {
    slices.push({ first: first + a, count: Math.min(size, seeds - a) });
  }
  const run = promisify(execFile);
  const outs = await Promise.all(
    slices.map((sl) =>
      run(
        process.execPath,
        [
          import.meta.filename,
          ...base,
          '--json',
          '--first',
          String(sl.first),
          '--seeds',
          String(sl.count),
        ],
        { encoding: 'utf8', maxBuffer: 64 << 20 },
      ),
    ),
  );
  return outs.flatMap((o) => JSON.parse(o.stdout) as RunResult[]);
}

function report(results: RunResult[]): void {
  const mode = `${tier === null ? '' : `, meta T${tier}`}${endless ? ', endless' : ''}`;
  console.log(
    `\nFORMVOLLENDET balance sim — ${results.length} seeds, ${minutes} min, ${character}, complexity ${complexity}${mode}\n`,
  );
  console.log('min  alive  level     hp  enemies  kills  form     dps  ms/tick');
  for (let m = 1; m <= minutes; m++) {
    const xs = results.map((r) => r.samples[m]).filter((x) => x != null);
    if (xs.length === 0) continue;
    console.log(
      `${String(m).padStart(3)}  ${String(xs.length).padStart(5)}  ${avg(xs.map((x) => x.level))
        .toFixed(1)
        .padStart(5)}  ` +
        `${avg(xs.map((x) => x.hp))
          .toFixed(0)
          .padStart(5)}  ${avg(xs.map((x) => x.enemies))
          .toFixed(0)
          .padStart(7)}  ` +
        `${avg(xs.map((x) => x.kills))
          .toFixed(0)
          .padStart(5)}  ${avg(xs.map((x) => x.vertices))
          .toFixed(1)
          .padStart(4)}  ` +
        `${avg(xs.map((x) => x.dps))
          .toFixed(0)
          .padStart(6)}  ${avg(xs.map((x) => x.msPerTick))
          .toFixed(3)
          .padStart(7)}`,
    );
  }
  console.log('');
  for (const r of results) console.log(r.line);

  const deaths = results.filter((r) => r.state === 'lost').map((r) => r.time);
  const window = deaths.filter((t) => t >= 600 && t < 840).length;
  const boss = results.filter((r) => r.time >= RUN.length || r.bossKilled).length;
  const won = results.filter((r) => r.bossKilled).length;
  console.log(
    `\nlost ${deaths.length}/${results.length}` +
      (deaths.length > 0 ? ` (median ${fmtTime(median(deaths)).trim()})` : '') +
      ` · died 10–14 min ${window} · before 10 min ${deaths.filter((t) => t < 600).length}` +
      ` · reached the boss ${boss} · beat it ${won}`,
  );
  const top = (f: (r: RunResult) => number): number => Math.max(...results.map(f));
  const rewards = results.map((r) => r.reward);
  console.log(
    `reward        avg ${Math.round(avg(rewards))} · median ${Math.round(median(rewards))}` +
      ` · run time median ${fmtTime(median(results.map((r) => r.time))).trim()}` +
      ` · boss kills ${results.reduce((a, r) => a + r.bossKills, 0)}` +
      ` · top weapon lv ${top((r) => r.maxWeaponLevel)}`,
  );
  const fights = results.flatMap((r) => r.fights);
  if (fights.length > 0) {
    const first = results.filter((r) => r.fights.length > 0).map((r) => r.fights[0]!);
    console.log(
      `boss fights   ${fights.length} · first median ${Math.round(median(first))} s` +
        ` (${Math.round(Math.min(...first))}–${Math.round(Math.max(...first))} s)` +
        (fights.length > first.length
          ? ` · returns median ${Math.round(median(results.flatMap((r) => r.fights.slice(1))))} s`
          : ''),
    );
  }
  console.log(
    `peak pools    enemies ${top((r) => r.peak.enemies)} · projectiles ${top((r) => r.peak.projectiles)}` +
      ` · bullets ${top((r) => r.peak.bullets)} · gems ${top((r) => r.peak.gems)}`,
  );

  const hurt = new Map<string, number>();
  for (const r of results) {
    for (const [k, v] of Object.entries(r.hurtBy)) hurt.set(k, (hurt.get(k) ?? 0) + v);
  }
  const all = [...hurt.values()].reduce((a, b) => a + b, 0) || 1;
  const killers = new Map<string, number>();
  for (const r of results)
    if (r.killedBy) killers.set(r.killedBy, (killers.get(r.killedBy) ?? 0) + 1);
  console.log(
    'damage taken  ' +
      [...hurt]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${Math.round((v / all) * 100)} %`)
        .join(' · '),
  );
  if (killers.size > 0) {
    console.log(
      'fatal hits    ' +
        [...killers]
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${v}`)
          .join(' · '),
    );
  }
}

if (values.json) {
  const results: RunResult[] = [];
  for (let seed = first; seed < first + seeds; seed++) results.push(runSeed(seed));
  process.stdout.write(JSON.stringify(results));
} else if (jobs > 1) {
  report(await runParallel());
} else {
  const results: RunResult[] = [];
  for (let seed = first; seed < first + seeds; seed++) results.push(runSeed(seed));
  report(results);
}
