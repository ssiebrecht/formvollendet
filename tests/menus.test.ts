import { describe, expect, it } from 'vitest';
import { applyDebugSave, parseLaunch } from '../src/app/debug.ts';
import { AXIOM_LIST } from '../src/content/axioms.ts';
import { CHARACTER_LIST } from '../src/content/characters.ts';
import { ENEMY_LIST } from '../src/content/enemies.ts';
import { PROOFS } from '../src/content/meta.ts';
import { BASE_WEAPONS, THEOREMS } from '../src/content/weapons.ts';
import { CODEX_TABS, codexEntries, codexProgress } from '../src/meta/codex.ts';
import { freshSave } from '../src/meta/save.ts';

describe('kompendium', () => {
  it('counts every weapon, theorem, axiom, enemy and form once', () => {
    const total =
      BASE_WEAPONS.length +
      THEOREMS.length +
      AXIOM_LIST.length +
      ENEMY_LIST.length +
      CHARACTER_LIST.length;
    expect(codexProgress(freshSave()).total).toBe(total);
    const perTab = CODEX_TABS.reduce((sum, t) => sum + codexProgress(freshSave(), t).total, 0);
    expect(perTab).toBe(total);
  });

  it('starts with the free forms only and follows the save', () => {
    const save = freshSave();
    const forms = codexEntries(save, 'forms');
    expect(forms.filter((e) => e.discovered).map((e) => e.id)).toEqual(
      CHARACTER_LIST.filter((c) => !c.locked).map((c) => c.id),
    );
    expect(codexProgress(save, 'weapons').found).toBe(0);

    save.seen.weapons.push('spitze', 'sternpolygon');
    save.seen.enemies.push('punkt');
    expect(codexProgress(save, 'weapons').found).toBe(1);
    expect(codexProgress(save, 'theorems').found).toBe(1);
    expect(codexProgress(save, 'enemies').found).toBe(1);
  });

  it('opens a locked form with its Beweis', () => {
    const save = freshSave();
    const locked = CHARACTER_LIST.find((c) => c.locked);
    if (!locked) return;
    const proof = PROOFS.find((p) => p.unlocks.includes(`char:${locked.id}`));
    expect(proof).toBeDefined();
    save.proofs.push(proof!.id);
    const entry = codexEntries(save, 'forms').find((e) => e.id === locked.id);
    expect(entry?.discovered).toBe(true);
  });
});

describe('launch parameters', () => {
  it('opens the menus and keeps the save by default', () => {
    const o = parseLaunch('');
    expect(o).toMatchObject({
      direct: false,
      debug: false,
      unlock: false,
      persistent: true,
      scene: null,
      splitter: null,
      seed: null,
      character: 'delta',
    });
  });

  it('starts a run directly for run parameters', () => {
    expect(parseLaunch('?seed=7').direct).toBe(true);
    expect(parseLaunch('?char=nova')).toMatchObject({ direct: true, character: 'nova' });
    // A fixed seed or a form is fair play; the save stays on.
    expect(parseLaunch('?seed=7&char=nova').persistent).toBe(true);
  });

  it('never writes the save for debug and cheat parameters', () => {
    for (const q of ['?debug', '?t=300', '?stress=500', '?splitter=100', '?unlock']) {
      expect(parseLaunch(q).persistent, q).toBe(false);
    }
    // Direct debug runs unlock every item, as before the save existed.
    expect(parseLaunch('?seed=7&debug').unlock).toBe(true);
    expect(parseLaunch('?debug').unlock).toBe(false);
  });

  it('accepts only known sheets and sane Splitter amounts', () => {
    expect(parseLaunch('?scene=shop').scene).toBe('shop');
    expect(parseLaunch('?scene=nowhere').scene).toBeNull();
    expect(parseLaunch('?splitter=2400.7').splitter).toBe(2400);
    expect(parseLaunch('?splitter=-5').splitter).toBeNull();
    expect(parseLaunch('?splitter=abc').splitter).toBeNull();
  });

  it('applies ?splitter and ?unlock to the session save', () => {
    const save = freshSave();
    applyDebugSave(save, parseLaunch('?splitter=900&unlock'));
    expect(save.splitter).toBe(900);
    expect(save.proofs).toHaveLength(PROOFS.length);
    const all = codexProgress(save);
    expect(all.found).toBe(all.total);

    const untouched = freshSave();
    applyDebugSave(untouched, parseLaunch('?debug'));
    expect(untouched).toEqual(freshSave());
  });
});
