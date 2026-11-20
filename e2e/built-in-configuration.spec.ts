/**
 * [G1] Acceptance for DESIGN.md "First-Run Setup", "The built-in
 * configuration": a configuration named link-ml always exists — created
 * at load when no name record carries the name, never duplicated, never
 * restored from archive, and re-added after a replace that removed it.
 *
 * Every test seeds a Models/Providers document so the setup gate stays
 * out of the way; the gate has its own spec, first-run.spec.ts. The
 * window.variorum dev handle asserts database effects (the
 * management-ui.spec.ts pattern). Structural types are declared locally
 * because the e2e project has no alias into src/.
 */
import { expect, test, type Page } from '@playwright/test';
import { seedModelEndpoint } from './model-endpoint.ts';

const BUILT_IN = 'link-ml';

interface Dump {
  schemaVersion: number;
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
    temperature?: number;
    topP?: number;
    topK?: number;
    reasoningEffort?: string;
  }[];
  units: {
    id: string;
    configName: string;
    conversationName: string;
    createdAt: string;
    archived: boolean;
    messages: unknown[];
    artifacts: unknown[];
  }[];
}

interface DevRepository {
  exportDatabase(deliver: (dump: Dump) => Promise<void>): Promise<Dump>;
}

type DevWindow = { variorum: { repository: DevRepository } };

/** A backup from another machine: one configuration, one unit, no link-ml. */
const REPLACEMENT: Dump = {
  schemaVersion: 1,
  configurations: [{ name: 'fresh', artifactType: 'yaml', archived: false }],
  configurationVersions: [
    {
      name: 'fresh',
      version: 1,
      modelName: 'test-model',
      systemPrompt: 'fresh v1',
    },
  ],
  units: [
    {
      id: 'fresh-u1',
      conversationName: 'fresh thread',
      configName: 'fresh',
      createdAt: '2026-01-01T00:00:00.000Z',
      archived: false,
      messages: [],
      artifacts: [],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await seedModelEndpoint(page, 'http://127.0.0.1:9/v1');
});

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
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

test('[G1] a fresh database shows link-ml in the Configurations list and the New unit picker, with no units', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openConfigurations(page);
  await expect(
    dialog.getByRole('listitem').filter({ hasText: BUILT_IN }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'New unit' }).click();
  const picker = page.getByRole('dialog').getByLabel('Configuration');
  await expect(picker.locator('option')).toHaveText([BUILT_IN]);

  const dump = await exportDump(page);
  expect(dump.units).toEqual([]);
});

test('[G1] a reload does not duplicate link-ml: one name record, one version', async ({
  page,
}) => {
  await openApp(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();

  const dump = await exportDump(page);
  expect(dump.configurations.map((c) => c.name)).toEqual([BUILT_IN]);
  expect(
    dump.configurationVersions.map((v) => `${v.name}.${v.version}`),
  ).toEqual([`${BUILT_IN}.1`]);
});

test('[G1] the exported link-ml.1 is the shipped recipe', async ({ page }) => {
  await openApp(page);
  const dump = await exportDump(page);

  expect(dump.configurations).toHaveLength(1);
  expect(dump.configurations[0]).toMatchObject({
    name: BUILT_IN,
    artifactType: 'yaml',
    archived: false,
  });
  expect(dump.configurations[0]?.description?.trim()).toBeTruthy();

  expect(dump.configurationVersions).toHaveLength(1);
  const version = dump.configurationVersions[0];
  expect(version).toMatchObject({
    name: BUILT_IN,
    version: 1,
    temperature: 0,
    topP: 0.95,
    reasoningEffort: 'high',
  });
  expect(version).not.toHaveProperty('topK');
  expect(version?.modelName.trim()).toBeTruthy();
  expect(version?.systemPrompt).toContain('"yaml artifact"');
});

test('[G1] archiving link-ml survives a reload: still archived, and New unit is disabled', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openConfigurations(page);
  const row = dialog.getByRole('listitem').filter({ hasText: BUILT_IN });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Archive' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'New unit' })).toBeDisabled();
  const dump = await exportDump(page);
  expect(dump.configurations).toHaveLength(1);
  expect(dump.configurations[0]).toMatchObject({
    name: BUILT_IN,
    archived: true,
  });
  expect(dump.configurationVersions).toHaveLength(1);
});

test('[G1] Replace from backup with a file lacking link-ml leaves the file configurations plus link-ml', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openConfigurations(page);
  await dialog.getByRole('button', { name: 'Database' }).click();

  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Replace from backup' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'variorum-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(REPLACEMENT, null, 2), 'utf8'),
  });

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Confirm replace' }).click();
  await downloadPromise;
  await expect(dialog.getByRole('status')).toBeVisible();

  const after = await exportDump(page);
  expect(after.configurations.map((c) => c.name).sort()).toEqual([
    'fresh',
    BUILT_IN,
  ]);
  expect(
    after.configurationVersions.map((v) => `${v.name}.${v.version}`).sort(),
  ).toEqual(['fresh.1', `${BUILT_IN}.1`]);
  expect(after.units.map((u) => u.conversationName)).toEqual(['fresh thread']);
});
