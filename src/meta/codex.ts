import { AXIOM_LIST } from '../content/axioms.ts';
import { CHARACTER_LIST } from '../content/characters.ts';
import { ENEMY_LIST } from '../content/enemies.ts';
import { BASE_WEAPONS, THEOREMS } from '../content/weapons.ts';
import { isCharacterUnlocked } from './progression.ts';
import type { SaveData } from './save.ts';

export type CodexTab = 'weapons' | 'theorems' | 'axioms' | 'enemies' | 'forms';

export const CODEX_TABS: readonly CodexTab[] = [
  'weapons',
  'theorems',
  'axioms',
  'enemies',
  'forms',
];

export interface CodexEntry {
  tab: CodexTab;
  id: string;
  discovered: boolean;
}

/** Kompendium entries of one tab in content order; forms count as discovered once playable. */
export function codexEntries(save: SaveData, tab: CodexTab): CodexEntry[] {
  const seen = save.seen;
  switch (tab) {
    case 'weapons':
      return BASE_WEAPONS.map((d) => ({ tab, id: d.id, discovered: seen.weapons.includes(d.id) }));
    case 'theorems':
      return THEOREMS.map((d) => ({ tab, id: d.id, discovered: seen.weapons.includes(d.id) }));
    case 'axioms':
      return AXIOM_LIST.map((d) => ({ tab, id: d.id, discovered: seen.axioms.includes(d.id) }));
    case 'enemies':
      return ENEMY_LIST.map((d) => ({ tab, id: d.id, discovered: seen.enemies.includes(d.id) }));
    case 'forms':
      return CHARACTER_LIST.map((c) => ({
        tab,
        id: c.id,
        discovered: isCharacterUnlocked(save, c.id),
      }));
  }
}

export interface CodexProgress {
  found: number;
  total: number;
}

/** Discovered / total for one tab, or for the whole Kompendium. */
export function codexProgress(save: SaveData, tab?: CodexTab): CodexProgress {
  let found = 0;
  let total = 0;
  for (const t of tab ? [tab] : CODEX_TABS) {
    for (const e of codexEntries(save, t)) {
      total++;
      if (e.discovered) found++;
    }
  }
  return { found, total };
}
