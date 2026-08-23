/**
 * [G2] Acceptance for DESIGN.md "Management UI" — the Database view and
 * the sidebar's gear button, driven through the real dialog. The
 * window.variorum dev handle seeds data and asserts database effects (the
 * management-ui.spec.ts pattern); locators define the accessibility
 * contract. Structural types are declared locally because the e2e project
 * has no alias into src/.
 */
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

interface Dump {
  schemaVersion: number;
  configurations: { name: string; artifactType: string; archived: boolean }[];
  configurationVersions: {
    name: string;
    version: number;
    modelName: string;
    systemPrompt: string;
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

const INCOMING: Dump = {
  schemaVersion: 1,
  configurations: [
    { name: 'from-file', artifactType: 'yaml', archived: false },
  ],
  configurationVersions: [
    {
      name: 'from-file',
      version: 1,
      modelName: 'test-model',
      systemPrompt: 'v1',
    },
  ],
  units: [
    {
      id: 'file-u1',
      conversationName: 'thread from a file',
      configName: 'from-file',
      createdAt: '2026-01-01T00:00:00.000Z',
      archived: false,
      messages: [],
      artifacts: [],
    },
  ],
};

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

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
}

/** Seed one configuration and one unit so the database is non-empty. */
function seed(page: Page) {
  return page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'test-model', systemPrompt: 'v1' },
    );
    await repository.createUnit('seeded thread', 'linkml');
  });
}

function exportDump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
}

async function openDatabaseView(page: Page) {
  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Database' }).click();
  return dialog;
}

function dumpFile(name: string, dump: Dump) {
  return {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(dump, null, 2), 'utf8'),
  };
}

test('[G2] the sidebar Configurations control is an icon button that opens the dialog', async ({
  page,
}) => {
  await openApp(page);
  const button = page.getByRole('button', { name: 'Configurations' });
  await expect(button.locator('svg')).toBeVisible();
  await button.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('[G2] the Database view offers three separate actions', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openDatabaseView(page);
  await expect(
    dialog.getByRole('button', { name: 'Export database' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Import (merge)' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Replace from backup' }),
  ).toBeVisible();
});

test('[G2] Export database downloads a dump and reports the outcome', async ({
  page,
}) => {
  // Removing the picker forces the deterministic anchor path — the same
  // emulation dump-transport.spec.ts uses for the Firefox fallback.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });
  await openApp(page);
  await seed(page);
  const dialog = await openDatabaseView(page);

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export database' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^variorum-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
  );
  const text = await readFile(await download.path(), 'utf8');
  expect(JSON.parse(text)).toMatchObject({ schemaVersion: 1 });
  await expect(dialog.getByRole('status')).toBeVisible();
});

test('[G2] Import (merge) renders the report and the merged unit appears', async ({
  page,
}) => {
  await openApp(page);
  await seed(page);
  const dialog = await openDatabaseView(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import (merge)' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(dumpFile('variorum-2026-01-01-0000.json', INCOMING));

  const status = dialog.getByRole('status');
  await expect(status).toContainText('Configurations added: from-file');
  await expect(status).toContainText('Units added: 1');

  await page.keyboard.press('Escape');
  await expect(page.getByText('thread from a file')).toBeVisible();
});

test('[G2] a malformed import shows the path-bearing error and changes nothing', async ({
  page,
}) => {
  await openApp(page);
  await seed(page);
  const before = await exportDump(page);
  const dialog = await openDatabaseView(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import (merge)' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      '{ "schemaVersion": 1, "units": "not an array" }',
      'utf8',
    ),
  });

  await expect(dialog.getByRole('alert')).toContainText('dump.');
  expect(await exportDump(page)).toEqual(before);
});

test('[G2] Replace asks for confirmation and touches nothing until confirmed', async ({
  page,
}) => {
  await openApp(page);
  await seed(page);
  const before = await exportDump(page);
  const dialog = await openDatabaseView(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Replace from backup' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(dumpFile('variorum-backup.json', REPLACEMENT));

  // The confirmation names both consequences: the wipe and the backup.
  await expect(dialog.getByText(/replaced/i)).toBeVisible();
  await expect(dialog.getByText(/backup/i)).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Confirm replace' }),
  ).toBeVisible();
  expect(await exportDump(page)).toEqual(before);
});

test('[G2] a confirmed replace downloads the backup first and swaps the database', async ({
  page,
}) => {
  await openApp(page);
  await seed(page);
  const dialog = await openDatabaseView(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Replace from backup' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(dumpFile('variorum-backup.json', REPLACEMENT));

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Confirm replace' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^variorum-pre-replace-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
  );
  const backup = JSON.parse(
    await readFile(await download.path(), 'utf8'),
  ) as Dump;
  expect(backup.units.map((u) => u.conversationName)).toEqual([
    'seeded thread',
  ]);

  const after = await exportDump(page);
  expect(after.configurations.map((c) => c.name)).toEqual(['fresh']);
  expect(after.units.map((u) => u.conversationName)).toEqual(['fresh thread']);
});

test('[G2] a successful replace deselects the active unit', async ({
  page,
}) => {
  await openApp(page);
  await seed(page);
  await page.getByText('seeded thread', { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Variorum: seeded thread' }),
  ).toBeVisible();

  const dialog = await openDatabaseView(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Replace from backup' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(dumpFile('variorum-backup.json', REPLACEMENT));
  await dialog.getByRole('button', { name: 'Confirm replace' }).click();
  await expect(dialog.getByRole('status')).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Variorum', exact: true }),
  ).toBeVisible();
});

test('[G2] cancelling the replace confirmation is a no-op', async ({
  page,
}) => {
  await openApp(page);
  await seed(page);
  await page.getByText('seeded thread', { exact: true }).click();
  const before = await exportDump(page);

  const dialog = await openDatabaseView(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Replace from backup' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(dumpFile('variorum-backup.json', REPLACEMENT));
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  expect(await exportDump(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('heading', { name: 'Variorum: seeded thread' }),
  ).toBeVisible();
});
