/**
 * Acceptance: theming (DESIGN.md "Theming"). Auto follows the browser's
 * color scheme and reacts live; light/dark override it; the choice
 * persists on this device; every surface — the CodeMirror editor
 * included — renders the active theme's tokens. System scheme is driven
 * with Playwright's emulateMedia, never mocked inside the app.
 */
import { expect, test, type Page } from '@playwright/test';

const DARK_CLASS = /\bdark\b/;

const html = (page: Page) => page.locator('html');

/**
 * No UI flow creates units yet, so the editor spec seeds one straight
 * into the real IndexedDB (shapes per design/application-schema.yaml),
 * then reloads so hydrate-at-boot picks it up.
 */
async function seedUnit(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const open = indexedDB.open('variorum', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(
      ['configurations', 'configurationVersions', 'units'],
      'readwrite',
    );
    tx.objectStore('configurations').put({
      name: 'linkml',
      artifactType: 'yaml',
      archived: false,
    });
    tx.objectStore('configurationVersions').put({
      name: 'linkml',
      version: 1,
      modelName: 'test-model',
      systemPrompt: 'test',
    });
    tx.objectStore('units').put({
      id: 'theme-test-unit',
      conversationName: 'Theme test unit',
      configName: 'linkml',
      createdAt: new Date().toISOString(),
      archived: false,
      messages: [],
      artifacts: [
        {
          version: 1,
          savedAt: new Date().toISOString(),
          source: 'manual',
          content: 'key: value\n',
        },
      ],
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
}

test('boots dark under auto when the browser prefers dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(html(page)).toHaveClass(DARK_CLASS);
});

test('boots light under auto when the browser prefers light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Variorum' }),
  ).toBeVisible();
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
});

test('follows a mid-session color-scheme flip while in auto', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
});

test('selecting light overrides a dark browser preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await page.getByLabel('Theme').selectOption('light');
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
});

test('selected theme survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByLabel('Theme').selectOption('dark');
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await page.reload();
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await expect(page.getByLabel('Theme')).toHaveValue('dark');
  expect(
    await page.evaluate(() => localStorage.getItem('variorum.theme')),
  ).toBe('dark');
});

test('returning to auto resumes following the browser', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByLabel('Theme').selectOption('light');
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
  await page.getByLabel('Theme').selectOption('auto');
  await expect(html(page)).toHaveClass(DARK_CLASS);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html(page)).not.toHaveClass(DARK_CLASS);
});

test("the artifact editor pane renders with the dark theme's colors", async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await seedUnit(page);
  await page.getByRole('button', { name: 'Theme test unit' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
  const { editorBg, bodyBg } = await page.evaluate(() => {
    const editor = document.querySelector('.cm-editor');
    if (editor === null) {
      throw new Error('.cm-editor not found');
    }
    return {
      editorBg: getComputedStyle(editor).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(editorBg).toBe(bodyBg);
});
