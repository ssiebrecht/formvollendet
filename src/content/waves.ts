import type { ScriptEvent, WaveSegment } from './types.ts';

/** Minute table for the 15-minute run. Rates are spawns per second, lerped across the segment. */
export const WAVES: readonly WaveSegment[] = [
  { from: 0, to: 60, rate: [1.1, 2.4], maxAlive: 84, pool: [{ enemy: 'punkt', weight: 1 }] },
  {
    from: 60,
    to: 180,
    rate: [2.4, 4.4],
    maxAlive: 168,
    pool: [
      { enemy: 'punkt', weight: 3 },
      { enemy: 'keil', weight: 1 },
    ],
  },
  {
    from: 180,
    to: 360,
    rate: [4.4, 6.0],
    maxAlive: 264,
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
    rate: [6.0, 8.2],
    maxAlive: 384,
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
    rate: [8.2, 10.5],
    maxAlive: 504,
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
    rate: [10.5, 13.2],
    maxAlive: 624,
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
];

export const SCRIPT: readonly ScriptEvent[] = [
  { at: 180, kind: 'elite', enemy: 'block', drop: 'vertex', count: 1, hp: 2.5 },
  { at: 270, kind: 'ring', enemy: 'block', count: 20, radius: 430 },
  { at: 360, kind: 'elite', enemy: 'rhombus', drop: 'vertex', count: 1, hp: 8 },
  { at: 450, kind: 'line', enemy: 'punkt', count: 40, spacing: 22 },
  { at: 540, kind: 'elite', enemy: 'werfer', drop: 'vertex', count: 1, hp: 4 },
  { at: 630, kind: 'ring', enemy: 'keil', count: 28, radius: 450 },
  { at: 720, kind: 'elite', enemy: 'wabe', drop: 'upgrade', count: 2, hp: 6 },
  { at: 810, kind: 'ring', enemy: 'block', count: 36, radius: 460 },
  { at: 900, kind: 'boss', enemy: 'sierpinski' },
];
