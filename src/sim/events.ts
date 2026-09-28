import type {
  AbilityId,
  AxiomId,
  EnemyId,
  PickupKind,
  ShapeId,
  WeaponId,
} from '../content/types.ts';

/** One line of an opened upgrade cube; the UI turns it into text. */
export type CubeReward =
  | { kind: 'theorem'; weapon: WeaponId }
  | { kind: 'weapon'; weapon: WeaponId; level: number }
  | { kind: 'axiom'; axiom: AxiomId; level: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'splitter'; amount: number };

/**
 * Everything the browser shells need to react to (VFX, audio, banners). The sim fills the queue
 * during a tick; the app drains it right after each step.
 */
export type SimEvent =
  | { type: 'hit'; x: number; y: number; amount: number; crit: boolean }
  | {
      type: 'kill';
      x: number;
      y: number;
      r: number;
      shape: ShapeId;
      color: number;
      rot: number;
      elite: boolean;
    }
  | { type: 'shell'; x: number; y: number; r: number; shape: ShapeId; color: number; rot: number }
  | { type: 'playerHurt'; amount: number }
  | { type: 'playerHeal'; amount: number }
  | { type: 'revive' }
  | { type: 'levelUp'; level: number }
  | { type: 'gem'; value: number }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number }
  | { type: 'morph'; vertices: number }
  | { type: 'upgradeCube'; rewards: readonly CubeReward[] }
  | { type: 'theorem'; weapon: WeaponId }
  | { type: 'fire'; weapon: WeaponId }
  | { type: 'explosion'; x: number; y: number; r: number; color: number }
  | { type: 'pulse'; x: number; y: number; r: number; color: number }
  | { type: 'enemyShot'; x: number; y: number }
  | { type: 'ability'; ability: AbilityId; x: number; y: number }
  | { type: 'elite'; enemy: EnemyId }
  | { type: 'formation'; kind: 'ring' | 'line' }
  | { type: 'boss'; enemy: EnemyId }
  | { type: 'bossSplit'; x: number; y: number; r: number; depth: number }
  | { type: 'bossDefeated' }
  | { type: 'playerDied' }
  | { type: 'won' };

export type SimEventType = SimEvent['type'];
