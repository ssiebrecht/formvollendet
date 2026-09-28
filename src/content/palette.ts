/**
 * Colour language: cool hues (cyan, mint, white) are friendly, warm hues are hostile and encode the
 * attack type. Shapes repeat the same information so colour is never the only cue.
 */
export const COLORS = {
  bg: 0x07080d,
  gridMinor: 0x0f1320,
  gridMajor: 0x19213a,
  axis: 0x2c3a5e,

  delta: 0x3ff0ff,
  nova: 0xffd23f,
  core: 0xffffff,

  gemSmall: 0x6dff8a,
  gemMedium: 0x3dffc4,
  gemLarge: 0xd8fff0,
  splitter: 0xb77bff,
  pickup: 0xffffff,
  cube: 0xffffff,

  contact: 0xff3b5c,
  ranged: 0xff4fd8,
  explosive: 0xff9a3c,
  summoner: 0xffc23c,
  enemyBullet: 0xff4fd8,
  telegraph: 0xff3b5c,
  elite: 0xffffff,
  boss: 0xff2e63,

  damage: 0xffffff,
  crit: 0xffd23f,
  heal: 0x6dff8a,
} as const;

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
