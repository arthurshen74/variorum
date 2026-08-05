/**
 * [G1] Acceptance for DESIGN.md "Management UI" (Rename): the per-row
 * pencil swaps the name for a prefilled input; Enter commits via
 * renameConversation, Escape or blur cancels, a whitespace-only commit
 * calls nothing. Locators define the accessibility contract: the pencil
 * is a button named "Rename", the input is labelled "Conversation name".
 */
import { expect, test, type Page } from '@playwright/test';

interface Dump {
  units: { id: string; conversationName: string }[];
}

interface DevRepository {
  createConfiguration(
    info: { name: string; artifactType: string },
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  createUnit(
    conversationName: string,
    configName: string,
  ): Promise<{ id: string }>;
  exportDatabase(deliver: (dump: Dump) => Promise<void>): Promise<Dump>;
}

type DevWindow = { variorum: { repository: DevRepository } };

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
}

async function seedUnit(page: Page, conversationName: string) {
  await page.evaluate(async (name) => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'test-model', systemPrompt: 'v1' },
    );
    await repository.createUnit(name, 'linkml');
  }, conversationName);
}

function exportDump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
}

function unitRow(page: Page, conversationName: string) {
  return page.getByRole('listitem').filter({ hasText: conversationName });
}

async function openEditor(page: Page, conversationName: string) {
  await unitRow(page, conversationName)
    .getByRole('button', { name: 'Rename' })
    .click();
  const input = page.getByLabel('Conversation name');
  await expect(input).toBeVisible();
  return input;
}

test('[G1] pencil opens prefilled input; Enter commits and persists across reload', async ({
  page,
}) => {
  await openApp(page);
  await seedUnit(page, 'old name');

  const input = await openEditor(page, 'old name');
  await expect(input).toHaveValue('old name');
  // While editing, the row's select and archive actions are hidden.
  await expect(page.getByRole('button', { name: 'Archive' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'old name' })).toBeHidden();

  await input.fill('new name');
  await input.press('Enter');
  await expect(input).toBeHidden();
  await expect(unitRow(page, 'new name')).toBeVisible();
  await expect(unitRow(page, 'old name')).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  await expect(unitRow(page, 'new name')).toBeVisible();
});

test('[G1] Escape cancels', async ({ page }) => {
  await openApp(page);
  await seedUnit(page, 'old name');

  const input = await openEditor(page, 'old name');
  await input.fill('discarded');
  await input.press('Escape');
  await expect(input).toBeHidden();
  await expect(unitRow(page, 'old name')).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.units.map((u) => u.conversationName)).toEqual(['old name']);
});

test('[G1] blur cancels', async ({ page }) => {
  await openApp(page);
  await seedUnit(page, 'old name');

  const input = await openEditor(page, 'old name');
  await input.fill('discarded');
  await page.getByRole('heading', { name: 'Variorum' }).click();
  await expect(input).toBeHidden();
  await expect(unitRow(page, 'old name')).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.units.map((u) => u.conversationName)).toEqual(['old name']);
});

test('[G1] whitespace-only commit is a no-op', async ({ page }) => {
  await openApp(page);
  await seedUnit(page, 'old name');

  const input = await openEditor(page, 'old name');
  await input.fill('   ');
  await input.press('Enter');
  await expect(input).toBeHidden();
  await expect(unitRow(page, 'old name')).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.units.map((u) => u.conversationName)).toEqual(['old name']);
});
