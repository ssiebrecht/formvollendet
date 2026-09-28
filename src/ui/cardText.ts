import { AXIOMS } from '../content/axioms.ts';
import { COLORS } from '../content/palette.ts';
import { S } from '../content/strings.de.ts';
import type { ShapeId } from '../content/types.ts';
import { WEAPONS } from '../content/weapons.ts';
import type { Card } from '../sim/draft.ts';
import type { CubeReward } from '../sim/events.ts';

export interface CardLook {
  tag: string;
  name: string;
  /** "NEU", "Lv 2 → 3" or "Q.E.D.". */
  badge: string;
  desc: string;
  /** Extra line under the description (theorem proof). */
  note: string;
  icon: ShapeId;
  color: number;
  gold: boolean;
}

export function cardLook(card: Card): CardLook {
  switch (card.kind) {
    case 'newWeapon': {
      const d = WEAPONS[card.weapon];
      return {
        tag: S.draft.tagWeapon,
        name: d.name,
        badge: S.draft.isNew,
        desc: d.desc,
        note: '',
        icon: d.icon,
        color: d.color,
        gold: false,
      };
    }
    case 'upgradeWeapon': {
      const d = WEAPONS[card.weapon];
      const text = d.levels[card.level - 2]?.text ?? '';
      return {
        tag: S.draft.tagWeapon,
        name: d.name,
        badge: S.draft.level(card.level - 1, card.level),
        desc: text,
        note: '',
        icon: d.icon,
        color: d.color,
        gold: false,
      };
    }
    case 'newAxiom': {
      const d = AXIOMS[card.axiom];
      return {
        tag: S.draft.tagAxiom,
        name: d.name,
        badge: S.draft.isNew,
        desc: d.desc,
        note: '',
        icon: d.icon,
        color: d.color,
        gold: false,
      };
    }
    case 'upgradeAxiom': {
      const d = AXIOMS[card.axiom];
      return {
        tag: S.draft.tagAxiom,
        name: d.name,
        badge: S.draft.level(card.level - 1, card.level),
        desc: d.desc,
        note: '',
        icon: d.icon,
        color: d.color,
        gold: false,
      };
    }
    case 'theorem': {
      const d = WEAPONS[card.weapon];
      const from = WEAPONS[card.from];
      const axiom = from.evolvesWith ? AXIOMS[from.evolvesWith].name : '';
      return {
        tag: S.draft.tagTheorem,
        name: d.name,
        badge: 'Q.E.D.',
        desc: d.desc,
        note: S.draft.theoremFrom(from.name, axiom),
        icon: d.icon,
        color: COLORS.crit,
        gold: true,
      };
    }
    case 'heal':
      return {
        tag: S.draft.tagHeal,
        name: S.draft.heal(card.amount),
        badge: '',
        desc: S.draft.healDesc,
        note: '',
        icon: 'plus',
        color: COLORS.heal,
        gold: false,
      };
    case 'splitter':
      return {
        tag: S.draft.tagSplitter,
        name: S.draft.splitter(card.amount),
        badge: '',
        desc: S.draft.splitterDesc,
        note: '',
        icon: 'splitter',
        color: COLORS.splitter,
        gold: false,
      };
  }
}

export function rewardText(r: CubeReward): { text: string; icon: ShapeId; color: number } {
  switch (r.kind) {
    case 'theorem':
      return {
        text: S.cube.theorem(WEAPONS[r.weapon].name),
        icon: WEAPONS[r.weapon].icon,
        color: COLORS.crit,
      };
    case 'weapon': {
      const d = WEAPONS[r.weapon];
      return { text: S.cube.weapon(d.name, r.level), icon: d.icon, color: d.color };
    }
    case 'axiom': {
      const d = AXIOMS[r.axiom];
      return { text: S.cube.axiom(d.name, r.level), icon: d.icon, color: d.color };
    }
    case 'heal':
      return { text: S.cube.heal(r.amount), icon: 'plus', color: COLORS.heal };
    case 'splitter':
      return { text: S.cube.splitter(r.amount), icon: 'splitter', color: COLORS.splitter };
  }
}
