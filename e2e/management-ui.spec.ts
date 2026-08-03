/**
 * Acceptance for DESIGN.md "Management UI" and the Endpoint view of
 * "API Keys & Endpoint URL" — the dialogs and sidebar controls, driven
 * through the real UI. The window.variorum dev handle seeds data and
 * asserts database effects (the import-merge.spec.ts pattern); locators
 * define the accessibility contract the implementation must meet.
 */
import { expect, test, type Page } from '@playwright/test';

const BASE_URL_KEY = 'variorum.baseUrl';
const DEFAULT_BASE_URL = 'http://localhost:1234/v1';

interface Dump {
  configurations: {
    name: string;
    description?: string;
    artifactType: string;
    archived: boolean;
  }[];
  configurationVersions: {
    name: string;
    version: number;
    modelName: string;
    systemPrompt: string;
  }[];
  units: { id: string; conversationName: string; archived: boolean }[];
}

interface DevRepository {
  createConfiguration(
    info: { name: string; description?: string; artifactType: string },
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  createUnit(
    conversationName: string,
    configName: string,
  ): Promise<{ id: string }>;
  exportDatabase(deliver: (dump: Dump) => Promise<void>): Promise<Dump>;
  pruneArchivedUnits(): Promise<number>;
}

type DevWindow = { variorum: { repository: DevRepository } };

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
}

function seedConfiguration(page: Page, name: string) {
  return page.evaluate(async (n) => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: n, description: 'seed', artifactType: 'yaml' },
      { modelName: 'test-model', systemPrompt: 'v1' },
    );
  }, name);
}

function exportDump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
}

async function openConfigurations(page: Page) {
  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('[G2] creating a configuration through the dialog lists it and mints version 1', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'New configuration' }).click();
  await dialog.getByLabel('Name').fill('linkml');
  await dialog.getByLabel('Artifact type').fill('yaml');
  await dialog.getByLabel('Model').fill('test-model');
  await dialog.getByLabel('System prompt').fill('You produce LinkML.');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByText('linkml')).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.configurations.map((c) => c.name)).toEqual(['linkml']);
  expect(dump.configurationVersions).toHaveLength(1);
  expect(dump.configurationVersions[0]).toMatchObject({
    name: 'linkml',
    version: 1,
    modelName: 'test-model',
    systemPrompt: 'You produce LinkML.',
  });
});

test('[G2] a duplicate configuration name shows an error and the dialog stays open', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  const dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'New configuration' }).click();
  await dialog.getByLabel('Name').fill('linkml');
  await dialog.getByLabel('Artifact type').fill('yaml');
  await dialog.getByLabel('Model').fill('test-model');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.configurationVersions).toHaveLength(1);
});

test('[G2] editing the recipe and saving mints version 2; name and artifact type are read-only in Edit', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  const dialog = await openConfigurations(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'linkml' })
    .getByRole('button', { name: 'Edit' })
    .click();

  await expect(dialog.getByLabel('Name')).toBeDisabled();
  await expect(dialog.getByLabel('Artifact type')).toBeDisabled();

  await dialog.getByLabel('System prompt').fill('v2 prompt');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const dump = await exportDump(page);
  expect(
    dump.configurationVersions.map((v) => v.version).sort((a, b) => a - b),
  ).toEqual([1, 2]);
  expect(
    dump.configurationVersions.find((v) => v.version === 2)?.systemPrompt,
  ).toBe('v2 prompt');
});

test('[G2] saving the Edit form untouched mints no version and no description write', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  const dialog = await openConfigurations(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'linkml' })
    .getByRole('button', { name: 'Edit' })
    .click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  const dump = await exportDump(page);
  expect(dump.configurationVersions).toHaveLength(1);
  expect(dump.configurations[0]?.description).toBe('seed');
});

test('[G2] changing only the description updates it without minting a version', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  const dialog = await openConfigurations(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'linkml' })
    .getByRole('button', { name: 'Edit' })
    .click();
  await dialog.getByLabel('Description').fill('sharper description');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const dump = await exportDump(page);
  expect(dump.configurations[0]?.description).toBe('sharper description');
  expect(dump.configurationVersions).toHaveLength(1);
});

test('[G2] closing the dialog mid-edit discards the draft; reopening shows the latest saved recipe', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  let dialog = await openConfigurations(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'linkml' })
    .getByRole('button', { name: 'Edit' })
    .click();
  await dialog.getByLabel('System prompt').fill('abandoned draft');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  dialog = await openConfigurations(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'linkml' })
    .getByRole('button', { name: 'Edit' })
    .click();
  await expect(dialog.getByLabel('System prompt')).toHaveValue('v1');
  const dump = await exportDump(page);
  expect(dump.configurationVersions).toHaveLength(1);
});

test('[G2] an archived configuration leaves the new-unit picker; restore returns it', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'alpha');
  await seedConfiguration(page, 'beta');

  let dialog = await openConfigurations(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'beta' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'New unit' }).click();
  let picker = page.getByRole('dialog').getByLabel('Configuration');
  await expect(picker.locator('option')).toHaveText(['alpha']);
  await page.keyboard.press('Escape');

  dialog = await openConfigurations(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'beta' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'New unit' }).click();
  picker = page.getByRole('dialog').getByLabel('Configuration');
  await expect(picker.locator('option')).toHaveText(['alpha', 'beta']);
});

test('[G2] the New unit button is disabled with zero active configurations and enabled once one exists', async ({
  page,
}) => {
  await openApp(page);
  const newUnit = page.getByRole('button', { name: 'New unit' });
  await expect(newUnit).toBeDisabled();
  await seedConfiguration(page, 'linkml');
  await expect(newUnit).toBeEnabled();
});

test('[G2] creating a unit from the New unit dialog adds it to the sidebar and loads it', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  await page.getByRole('button', { name: 'New unit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Conversation name').fill('first thread');
  await dialog.getByLabel('Configuration').selectOption('linkml');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole('listitem').filter({ hasText: 'first thread' }),
  ).toBeVisible();
  await expect(
    page.getByText('Select a unit from the sidebar'),
  ).toBeHidden();
});

test('[G2] archiving a unit asks for confirmation, removes it from the list, and clears the panes if it was the loaded one', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createUnit('doomed thread', 'linkml');
  });

  const row = page.getByRole('listitem').filter({ hasText: 'doomed thread' });
  await row.getByRole('button', { name: 'doomed thread' }).click();
  await expect(
    page.getByText('Select a unit from the sidebar'),
  ).toBeHidden();

  await row.getByRole('button', { name: 'Archive' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await confirm.getByRole('button', { name: 'Archive' }).click();

  await expect(row).toBeHidden();
  await expect(
    page.getByText('Select a unit from the sidebar'),
  ).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.units).toHaveLength(1);
  expect(dump.units[0]?.archived).toBe(true);
});

test('[G2] the Endpoint view shows the default URL; saving a new one persists across reload', async ({
  page,
}) => {
  await openApp(page);
  let dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'Endpoint' }).click();
  const field = dialog.getByLabel('Endpoint URL');
  await expect(field).toHaveValue(DEFAULT_BASE_URL);

  await field.fill('http://localhost:5555/v1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), BASE_URL_KEY))
    .toBe('http://localhost:5555/v1');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'Endpoint' }).click();
  await expect(dialog.getByLabel('Endpoint URL')).toHaveValue(
    'http://localhost:5555/v1',
  );
});

test('[G2] an invalid endpoint URL shows an error and stores nothing', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'Endpoint' }).click();
  await dialog.getByLabel('Endpoint URL').fill('not a url');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(
    await page.evaluate((k) => localStorage.getItem(k), BASE_URL_KEY),
  ).toBeNull();
});

test('[G2] Reset to default removes the stored value and the view shows the default again', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'Endpoint' }).click();
  const field = dialog.getByLabel('Endpoint URL');
  await field.fill('http://localhost:5555/v1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), BASE_URL_KEY))
    .toBe('http://localhost:5555/v1');

  await dialog.getByRole('button', { name: 'Reset to default' }).click();
  await expect(field).toHaveValue(DEFAULT_BASE_URL);
  expect(
    await page.evaluate((k) => localStorage.getItem(k), BASE_URL_KEY),
  ).toBeNull();
});

test('[G2] changing the endpoint appears in no export and does not trip the dirty-since-export bit', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'linkml');
  await exportDump(page); // clears dirty-since-export

  const dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'Endpoint' }).click();
  await dialog.getByLabel('Endpoint URL').fill('http://localhost:5555/v1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('Escape');

  // prune requires a fresh export; it resolving proves the endpoint
  // change was not a database mutation.
  const result = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    const pruned = await repository.pruneArchivedUnits();
    const dump = await repository.exportDatabase(async () => {});
    return { pruned, dump };
  });
  expect(result.pruned).toBe(0);
  expect(JSON.stringify(result.dump)).not.toContain('5555');
});
