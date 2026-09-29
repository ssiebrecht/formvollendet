import type { ScriptEvent, WaveSegment } from './types.ts';

/** Minute table for the 20-minute run. Rates are spawns per second, lerped across the segment. */
export const WAVES: readonly WaveSegment[] = [
  { from: 0, to: 60, rate: [1.1, 2.4], maxAlive: 84, pool: [{ enemy: 'punkt', weight: 1 }] },
  {
    from: 60,
    to: 180,
    rate: [2.4, 4.2],
    maxAlive: 160,
    pool: [
      { enemy: 'punkt', weight: 3 },
      { enemy: 'keil', weight: 1 },
    ],
  },
  {
    from: 180,
    to: 360,
    rate: [4.2, 5.6],
    maxAlive: 240,
    pool: [
      { enemy: 'punkt', weight: 3 },
      { enemy: 'keil', weight: 2 },
      { enemy: 'block', weight: 1 },
      { enemy: 'rhombus', weight: 1 },
    ],
  },
  {
    from: 360,
    to: 540,
    rate: [5.6, 7.2],
    maxAlive: 330,
    pool: [
      { enemy: 'punkt', weight: 3 },
      { enemy: 'keil', weight: 2 },
      { enemy: 'block', weight: 1.5 },
      { enemy: 'rhombus', weight: 1.5 },
      { enemy: 'werfer', weight: 1 },
      { enemy: 'stern', weight: 1 },
    ],
  },
  {
    from: 540,
    to: 720,
    rate: [7.2, 8.8],
    maxAlive: 420,
    pool: [
      { enemy: 'punkt', weight: 3 },
      { enemy: 'keil', weight: 2 },
      { enemy: 'block', weight: 2 },
      { enemy: 'rhombus', weight: 1.5 },
      { enemy: 'werfer', weight: 1.2 },
      { enemy: 'stern', weight: 1.2 },
      { enemy: 'wabe', weight: 0.5 },
    ],
  },
  {
    from: 720,
    to: 900,
    rate: [8.8, 10.5],
    maxAlive: 504,
    pool: [
      { enemy: 'punkt', weight: 2 },
      { enemy: 'keil', weight: 2 },
      { enemy: 'block', weight: 2 },
      { enemy: 'rhombus', weight: 2 },
      { enemy: 'werfer', weight: 1.5 },
      { enemy: 'stern', weight: 1.5 },
      { enemy: 'wabe', weight: 0.8 },
    ],
  },
  {
    from: 900,
    to: 1050,
    rate: [10.5, 12.2],
    maxAlive: 580,
    pool: [
      { enemy: 'punkt', weight: 1.5 },
      { enemy: 'keil', weight: 2 },
      { enemy: 'block', weight: 2 },
      { enemy: 'rhombus', weight: 2 },
      { enemy: 'werfer', weight: 1.5 },
      { enemy: 'stern', weight: 1.5 },
      { enemy: 'wabe', weight: 1 },
    ],
  },
  {
    from: 1050,
    to: 1200,
    rate: [12.2, 14],
    maxAlive: 660,
    pool: [
      { enemy: 'punkt', weight: 1 },
      { enemy: 'keil', weight: 2 },
      { enemy: 'block', weight: 2 },
      { enemy: 'rhombus', weight: 2.5 },
      { enemy: 'werfer', weight: 2 },
      { enemy: 'stern', weight: 2 },
      { enemy: 'wabe', weight: 1.2 },
    ],
  },
];

export const SCRIPT: readonly ScriptEvent[] = [
  { at: 180, kind: 'elite', enemy: 'block', drop: 'vertex', count: 1, hp: 2.5 },
  { at: 270, kind: 'ring', enemy: 'block', count: 20, radius: 430 },
  { at: 390, kind: 'elite', enemy: 'rhombus', drop: 'vertex', count: 1, hp: 8 },
  { at: 480, kind: 'line', enemy: 'punkt', count: 40, spacing: 22 },
  { at: 600, kind: 'elite', enemy: 'werfer', drop: 'vertex', count: 1, hp: 4 },
  { at: 690, kind: 'ring', enemy: 'keil', count: 28, radius: 450 },
  { at: 780, kind: 'elite', enemy: 'wabe', drop: 'upgrade', count: 1, hp: 6 },
  { at: 870, kind: 'line', enemy: 'keil', count: 44, spacing: 22 },
  { at: 960, kind: 'elite', enemy: 'rhombus', drop: 'upgrade', count: 2, hp: 8 },
  { at: 1050, kind: 'ring', enemy: 'block', count: 36, radius: 460 },
  { at: 1110, kind: 'elite', enemy: 'wabe', drop: 'upgrade', count: 2, hp: 6 },
  { at: 1170, kind: 'line', enemy: 'punkt', count: 60, spacing: 20 },
  { at: 1200, kind: 'boss', enemy: 'sierpinski' },
];

/**
 * Endless mode: one lap of `ENDLESS.cycle` seconds, repeated from the run length on. Times are
 * relative to the lap start; each lap ends with Sierpinski's return.
 */
export const ENDLESS_SCRIPT: readonly ScriptEvent[] = [
  { at: 90, kind: 'elite', enemy: 'werfer', drop: 'upgrade', count: 1, hp: 6 },
  { at: 150, kind: 'ring', enemy: 'block', count: 40, radius: 470 },
  { at: 240, kind: 'elite', enemy: 'wabe', drop: 'upgrade', count: 2, hp: 6 },
  { at: 330, kind: 'line', enemy: 'keil', count: 60, spacing: 20 },
  { at: 420, kind: 'ring', enemy: 'rhombus', count: 32, radius: 470 },
  { at: 510, kind: 'elite', enemy: 'rhombus', drop: 'upgrade', count: 2, hp: 8 },
  { at: 600, kind: 'boss', enemy: 'sierpinski' },
];
