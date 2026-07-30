/**
 * Vitest — the unit-test harness (CLAUDE.md "Development workflow").
 * Merges the app's Vite config so aliases (@, @design) and plugins match
 * the build exactly. Environment is node: unit tests cover domain logic
 * and repository behavior (via fake-indexeddb, imported per test file) —
 * never CSS or visual behavior, which belong to Playwright.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }),
);
