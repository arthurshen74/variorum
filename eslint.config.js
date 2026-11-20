/**
 * ESLint — import ordering only (CLAUDE.md "TypeScript / React
 * specifics"): side-effect imports, then react and third-party, then
 * first-party (`@/`, `@design/`), then relative; alphabetical within each
 * group, no blank lines between groups. No other rules are enabled.
 * `npm run lint:fix` applies the order.
 */
import tsParser from '@typescript-eslint/parser';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default [
  {
    // ESLint does not read .gitignore: these mirror its entries that can
    // hold scripts (worktrees included), plus the vendored components —
    // generated in their own style by the shadcn and AI Elements CLIs
    // (same list as .prettierignore).
    ignores: [
      '.claude/',
      'dist/',
      'dist-ssr/',
      'builds/',
      'publish/',
      'scripts/',
      'design/chats/',
      'test-results/',
      'playwright-report/',
      'src/components/ui/',
      'src/components/ai-elements/',
    ],
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { parser: tsParser },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          // One inner array: groups are ordered but not blank-separated.
          // Side-effect imports lead so setup such as fake-indexeddb/auto
          // still evaluates before the modules that use it.
          groups: [
            [
              '^\\u0000',
              '^react(-dom)?(/.*)?$',
              '^node:',
              '^@?\\w',
              '^@/',
              '^@design/',
              '^\\.',
            ],
          ],
        },
      ],
    },
  },
];
