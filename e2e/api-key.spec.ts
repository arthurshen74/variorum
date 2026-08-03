/**
 * [G1] Acceptance for DESIGN.md "API Keys & Endpoint URL" and the API
 * key field of the Endpoint view: masked entry, prefill, on-the-wire
 * Authorization behavior (no placeholder when unset), empty-save
 * removal, and export-invisibility — driven through the real UI against
 * the scripted endpoint (mock-llm.ts) at the network boundary.
 *
 * Locator contract: the field is labelled "API key" inside the Endpoint
 * view and is a password input; the view's existing "Save" button covers
 * it.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

const API_KEY_KEY = 'variorum.apiKey';

interface DevRepository {
  createConfiguration(
    info: { name: string; artifactType: string },
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  createUnit(
    conversationName: string,
    configName: string,
  ): Promise<{ id: string }>;
  exportDatabase(deliver: (dump: unknown) => Promise<void>): Promise<unknown>;
}

type DevWindow = { variorum: { repository: DevRepository } };

let llm: MockLlm;

test.beforeEach(async ({ page }) => {
  llm = new MockLlm();
  await llm.start();
  await page.addInitScript((url) => {
    localStorage.setItem('variorum.baseUrl', url);
  }, llm.url);
});

test.afterEach(async () => {
  await llm.close();
});

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
}

async function openEndpointView(page: Page) {
  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Endpoint' }).click();
  return dialog;
}

async function seedUnit(page: Page) {
  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'mock-model', systemPrompt: 'You produce YAML.' },
    );
    await repository.createUnit('thread', 'linkml');
  });
  await page.getByRole('button', { name: 'thread' }).click();
}

async function send(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

const storedKey = (page: Page) =>
  page.evaluate((k) => localStorage.getItem(k), API_KEY_KEY);

test('[G1] the Endpoint view shows a masked API key field prefilled with the stored key', async ({
  page,
}) => {
  await page.addInitScript((k) => {
    localStorage.setItem(k, 'sk-seeded');
  }, API_KEY_KEY);
  await openApp(page);
  const dialog = await openEndpointView(page);
  const field = dialog.getByLabel('API key');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveValue('sk-seeded');
});

test('[G1] with no key stored, the completion request carries no Authorization header', async ({
  page,
}) => {
  await openApp(page);
  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'Hi.' }] });
  await send(page, 'hello');
  await expect(page.getByRole('log')).toContainText('Hi.');
  expect(llm.headers[0]?.authorization).toBeUndefined();
});

test('[G1] saving a key sends Authorization: Bearer <key> on the next request', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openEndpointView(page);
  await dialog.getByLabel('API key').fill('  sk-test-123  ');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => storedKey(page)).toBe('sk-test-123');
  await page.keyboard.press('Escape');

  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'Hi.' }] });
  await send(page, 'hello');
  await expect(page.getByRole('log')).toContainText('Hi.');
  expect(llm.headers[0]?.authorization).toBe('Bearer sk-test-123');
});

test('[G1] clearing the field and saving removes the key; the next request has no Authorization header', async ({
  page,
}) => {
  await page.addInitScript((k) => {
    localStorage.setItem(k, 'sk-old');
  }, API_KEY_KEY);
  await openApp(page);
  const dialog = await openEndpointView(page);
  const field = dialog.getByLabel('API key');
  await expect(field).toHaveValue('sk-old');
  await field.fill('   ');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => storedKey(page)).toBeNull();
  await page.keyboard.press('Escape');

  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'Hi.' }] });
  await send(page, 'hello');
  await expect(page.getByRole('log')).toContainText('Hi.');
  expect(llm.headers[0]?.authorization).toBeUndefined();
});

test('[G1] the export dump does not contain the stored key', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openEndpointView(page);
  await dialog.getByLabel('API key').fill('sk-secret-999');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => storedKey(page)).toBe('sk-secret-999');
  await page.keyboard.press('Escape');

  const dump = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
  expect(JSON.stringify(dump)).not.toContain('sk-secret-999');
});
