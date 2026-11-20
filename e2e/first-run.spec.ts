/**
 * [G2] Acceptance for DESIGN.md "First-Run Setup", "The setup gate" and
 * "Restore from backup, on the gate": a machine whose Models/Providers
 * document holds no endpoint, or no model, is walked through adding
 * them by a dialog that cannot be dismissed — and can bring its own
 * database along first.
 *
 * Locator contract: the gate is a dialog named "First-run setup". Its
 * endpoint and model steps are the Models/Providers forms, so the labels
 * are theirs — "Endpoint URL", "Model name", "Handle", a "Save" button,
 * refusals as an alert inside the dialog — minus Cancel. A "Restore from
 * backup" button opens a file chooser; a file that parses is followed by
 * a confirmation naming both consequences, with "Confirm replace" and
 * "Cancel".
 *
 * This spec starts every test from empty storage: it is the one place the
 * app is met as a fresh machine.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const DOCUMENT_KEY = 'variorum.llm';
const DEFAULT_URL = 'http://localhost:1234/v1';
const OPENAI_LABEL = 'OpenAI Chat Completions';

interface ModelRow {
  modelName: string;
  handle: string;
}

interface Endpoint {
  id: string;
  url: string;
  api: 'openai-compatible' | 'anthropic-messages';
  authRequired: boolean;
  models: ModelRow[];
}

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
  exportDatabase(deliver: (dump: Dump) => Promise<void>): Promise<Dump>;
}

type DevWindow = { variorum: { repository: DevRepository } };

/** A backup from another machine: one configuration, one unit. */
const BACKUP: Dump = {
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

const ENDPOINT_NO_MODELS: Endpoint = {
  id: 'ep-1',
  url: 'http://127.0.0.1:7001/v1',
  api: 'openai-compatible',
  authRequired: false,
  models: [],
};

const ENDPOINT_ONE_MODEL: Endpoint = {
  ...ENDPOINT_NO_MODELS,
  models: [{ modelName: 'qwen/x', handle: 'qwen' }],
};

const gate = (page: Page) =>
  page.getByRole('dialog', { name: 'First-run setup' });

const shell = (page: Page) => page.getByRole('heading', { name: 'Variorum' });

/** Seeds the document only when absent, so a reload keeps later edits. */
function seedDocumentOnce(page: Page, endpoints: Endpoint[]) {
  return page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    { key: DOCUMENT_KEY, value: JSON.stringify({ endpoints }) },
  );
}

function storedDocument(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), DOCUMENT_KEY);
}

async function storedEndpoints(page: Page): Promise<Endpoint[] | undefined> {
  const parsed = JSON.parse((await storedDocument(page)) ?? 'null') as {
    endpoints: Endpoint[];
  } | null;
  return parsed?.endpoints;
}

function exportDump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
}

/** Walks both steps: the prefilled endpoint, then one model. */
async function completeSetup(page: Page) {
  await expect(gate(page).getByLabel('Endpoint URL')).toBeVisible();
  await gate(page).getByRole('button', { name: 'Save' }).click();
  await expect(gate(page).getByLabel('Model name')).toBeVisible();
  await gate(page).getByLabel('Model name').fill('qwen/qwen3-14b');
  await gate(page).getByRole('button', { name: 'Save' }).click();
  await expect(gate(page)).toBeHidden();
}

function backupFile(content: string) {
  return {
    name: 'variorum-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content, 'utf8'),
  };
}

async function chooseBackup(page: Page, content: string) {
  await expect(
    gate(page).getByRole('button', { name: 'Restore from backup' }),
  ).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await gate(page).getByRole('button', { name: 'Restore from backup' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(backupFile(content));
}

test('[G2] a fresh machine opens the gate on Add Endpoint, prefilled with the LM Studio URL, with nothing stored', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await expect(gate(page).getByLabel('Endpoint URL')).toHaveValue(DEFAULT_URL);
  expect(await storedEndpoints(page)).toEqual([]);
});

test('[G2] the gate cannot be dismissed: Escape and an outside click leave it open, and it offers no Close or Cancel', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(gate(page)).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(gate(page)).toBeVisible();
  await expect(
    gate(page).getByRole('button', { name: /close|cancel/i }),
  ).toHaveCount(0);
});

test('[G2] saving the endpoint advances to Add Model; saving a model closes the gate; the document holds both', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await gate(page).getByRole('button', { name: 'Save' }).click();

  await expect(gate(page).getByLabel('Model name')).toBeVisible();
  await expect(gate(page).getByLabel('Endpoint URL')).toBeHidden();
  await gate(page).getByLabel('Model name').fill('qwen/qwen3-14b');
  await expect(gate(page).getByLabel('Handle')).toHaveValue('qwen/qwen3-14b');
  await gate(page).getByRole('button', { name: 'Save' }).click();

  await expect(gate(page)).toBeHidden();
  await expect(shell(page)).toBeVisible();
  const endpoints = await storedEndpoints(page);
  expect(endpoints).toHaveLength(1);
  expect(endpoints?.[0]).toMatchObject({
    url: DEFAULT_URL,
    api: 'openai-compatible',
    authRequired: false,
    models: [{ modelName: 'qwen/qwen3-14b', handle: 'qwen/qwen3-14b' }],
  });
});

test('[G2] after setup, a reload opens straight to the app', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await completeSetup(page);

  await page.reload();
  await expect(shell(page)).toBeVisible();
  await expect(gate(page)).toBeHidden();
});

test('[G2] an invalid URL is refused with an alert and stores nothing', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await gate(page).getByLabel('Endpoint URL').fill('not a url');
  await gate(page).getByRole('button', { name: 'Save' }).click();

  await expect(gate(page).getByRole('alert')).toBeVisible();
  await expect(gate(page).getByLabel('Endpoint URL')).toBeVisible();
  expect(await storedEndpoints(page)).toEqual([]);
});

test('[G2] a document with an endpoint but no models opens the gate on Add Model', async ({
  page,
}) => {
  await seedDocumentOnce(page, [ENDPOINT_NO_MODELS]);
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await expect(gate(page).getByLabel('Model name')).toBeVisible();
  await expect(gate(page).getByLabel('Endpoint URL')).toBeHidden();
});

test('[G2] a document with a model opens no gate', async ({ page }) => {
  await seedDocumentOnce(page, [ENDPOINT_ONE_MODEL]);
  await page.goto('/');
  await expect(shell(page)).toBeVisible();
  await expect(gate(page)).toBeHidden();
});

test('[G2] a malformed document opens no gate and is left byte-identical', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) => localStorage.setItem(key, '{not json'),
    { key: DOCUMENT_KEY },
  );
  await page.goto('/');
  await expect(shell(page)).toBeVisible();
  await expect(gate(page)).toBeHidden();
  expect(await storedDocument(page)).toBe('{not json');
});

test('[G2] deleting the last model mid-session does not raise the gate; the next load does', async ({
  page,
}) => {
  await seedDocumentOnce(page, [ENDPOINT_ONE_MODEL]);
  await page.goto('/');
  await expect(shell(page)).toBeVisible();

  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Models/Providers' }).click();
  const group = dialog.getByRole('group', {
    name: `${ENDPOINT_ONE_MODEL.url} (${OPENAI_LABEL})`,
  });
  await group
    .getByRole('listitem')
    .filter({ hasText: 'qwen' })
    .getByRole('button', { name: 'Delete model' })
    .click();
  await expect(group.getByRole('listitem')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(gate(page)).toBeHidden();

  await page.reload();
  await expect(gate(page)).toBeVisible();
  await expect(gate(page).getByLabel('Model name')).toBeVisible();
});

test('[G2] Restore from backup: file, then confirmation; Confirm downloads the pre-replace backup, the gate stays on its endpoint step, and after setup the restored unit is in the sidebar', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await chooseBackup(page, JSON.stringify(BACKUP, null, 2));

  await expect(gate(page)).toContainText(/entire database will be replaced/i);
  await expect(gate(page)).toContainText(/pre-replace backup/i);
  const downloadPromise = page.waitForEvent('download');
  await gate(page).getByRole('button', { name: 'Confirm replace' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^variorum-pre-replace-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
  );

  await expect(gate(page)).toBeVisible();
  await expect(gate(page).getByLabel('Endpoint URL')).toBeVisible();
  const restored = await exportDump(page);
  expect(restored.units.map((u) => u.conversationName)).toEqual([
    'fresh thread',
  ]);

  await completeSetup(page);
  await expect(page.getByRole('button', { name: 'fresh thread' })).toBeVisible();
});

test('[G2] cancelling the restore confirmation changes nothing', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await chooseBackup(page, JSON.stringify(BACKUP, null, 2));

  await expect(
    gate(page).getByRole('button', { name: 'Confirm replace' }),
  ).toBeVisible();
  await gate(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(gate(page).getByLabel('Endpoint URL')).toBeVisible();
  await expect(
    gate(page).getByRole('button', { name: 'Confirm replace' }),
  ).toHaveCount(0);
  const dump = await exportDump(page);
  expect(dump.configurations.map((c) => c.name)).not.toContain('fresh');
  expect(dump.units).toEqual([]);
});

test('[G2] a malformed backup file is refused before any confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(gate(page)).toBeVisible();
  await chooseBackup(page, 'not json');

  await expect(gate(page).getByRole('alert')).toBeVisible();
  await expect(
    gate(page).getByRole('button', { name: 'Confirm replace' }),
  ).toHaveCount(0);
  await expect(gate(page).getByLabel('Endpoint URL')).toBeVisible();
});
