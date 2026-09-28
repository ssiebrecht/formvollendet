import { COLORS } from './palette.ts';
import type { AbilityDef, AbilityId, CharacterDef, CharacterId } from './types.ts';

const LIST: CharacterDef[] = [
  {
    id: 'delta',
    name: 'Delta',
    role: 'Allrounder',
    desc: 'Ein spitzes, reguläres Polygon. Schnell, präzise, verzeiht Fehler.',
    traitText: '+10 % Projektiltempo',
    color: COLORS.delta,
    style: 'regular',
    maxHp: 100,
    moveSpeed: 160,
    magnet: 60,
    mods: [{ stat: 'projSpeed', value: 0.1 }],
    critShards: false,
    startWeapon: 'spitze',
    ability: 'vektor',
    locked: false,
  },
  {
    id: 'nova',
    name: 'Nova',
    role: 'Glaskanone',
    desc: 'Ein Sternpolygon – jede Ecke ist ein Zacken. Hoher Schaden, wenig Reserven.',
    traitText: '+15 % Krit, −20 % HP, +6 % Lauftempo. Krits sprühen 3 Mini-Zacken.',
    color: COLORS.nova,
    style: 'star',
    maxHp: 80,
    moveSpeed: 170,
    magnet: 60,
    mods: [{ stat: 'crit', value: 0.15 }],
    critShards: true,
    startWeapon: 'kreisbahn',
    ability: 'supernova',
    locked: true,
  },
];

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = Object.fromEntries(
  LIST.map((c) => [c.id, c]),
) as Record<CharacterId, CharacterDef>;

export const CHARACTER_LIST: readonly CharacterDef[] = LIST;

export const ABILITIES: Readonly<Record<AbilityId, AbilityDef>> = {
  vektor: {
    id: 'vektor',
    name: 'Vektor',
    desc: 'Dash in Laufrichtung mit kurzer Unverwundbarkeit. Hinterlässt eine Schadenslinie.',
    cooldown: 4,
    distance: 150,
    dashTime: 0.15,
    iframes: 0.3,
    damage: 20,
    lineLife: 0.5,
  },
  supernova: {
    id: 'supernova',
    name: 'Supernova',
    desc: '16 Zacken fliegen radial davon, Gegner werden weggestoßen.',
    cooldown: 8,
    shards: 16,
    damage: 15,
    speed: 420,
    pierce: 3,
    knockRadius: 220,
    knockPower: 900,
    iframes: 0.3,
  },
};
