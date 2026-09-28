import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layers that must stay headless and deterministic: they run in Node (tests, balance sim).
const HEADLESS = ['src/sim/**/*.ts', 'src/content/**/*.ts', 'src/meta/**/*.ts'];

export default defineConfig(
  globalIgnores(['dist', 'node_modules', 'coverage', '.smoke']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // A switch with an explicit `default` is deliberately partial; one without must cover the union.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Hot loops index pooled arrays by count, not by length; `!` after a bounds-checked index is fine.
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: HEADLESS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['pixi.js', 'pixi.js/*'], message: 'Headless layer: no Pixi.' },
            {
              group: ['**/render/**', '**/ui/**', '**/app/**', '**/audio/**'],
              message: 'Headless layer must not import browser layers.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'navigator',
        'performance',
        'requestAnimationFrame',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng.' },
        { object: 'Date', property: 'now', message: 'Use simulation time.' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
