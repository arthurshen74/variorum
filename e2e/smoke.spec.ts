/**
 * Harness smoke spec — proves the Playwright wiring, not the application.
 * Boots the app via the dev server and asserts the shell renders.
 * Delete this file once real acceptance specs exist.
 */
import { expect, test } from '@playwright/test';

test('the app shell boots', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Variorum' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible();
});
