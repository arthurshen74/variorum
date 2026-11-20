/**
 * [G3] Acceptance for DESIGN.md "First-Run Setup", "Choosing a model at
 * use": a configuration whose latest version names a handle this machine
 * has not bound gets a model choice where the user runs into it — the New
 * unit dialog and the chat error row — and choosing is an explicit Save
 * that mints the next version with only the handle changed.
 *
 * Locator contract: in the New unit dialog an unbound configuration adds
 * a native select labelled "Model" (one option per bound handle, in
 * document order, the first selected) and the line "Saves <name>.<N> with
 * model <handle>"; with no model in the document Create is disabled and a
 * hint names "Models/Providers". In the chat error row (the alert) an
 * unbound handle adds the same "Model" select and a button "Save
 * <name>.<N> and retry" beside "Retry".
 *
 * Every test picks its configuration explicitly, so the built-in
 * configuration's presence in the picker does not matter here.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

const DOCUMENT_KEY = 'variorum.llm';
const OPENAI_LABEL = 'OpenAI Chat Completions';
const UNBOUND_MESSAGE = (handle: string) =>
  `no endpoint bound for model ${handle}, please check your models/providers configuration`;

interface ModelRow {
  modelName: string;
  handle: string;
  apiKey?: string;
}

interface Endpoint {
  id: string;
  url: string;
  api: 'openai-compatible' | 'anthropic-messages';
  authRequired: boolean;
  apiKey?: string;
  models: ModelRow[];
}

interface DumpVersion {
  name: string;
  version: number;
  modelName: string;
  systemPrompt: string;
  temperature?: number;
  topP?: number;
}

interface Dump {
  configurationVersions: DumpVersion[];
  units: {
    id: string;
    configName: string;
    conversationName: string;
    messages: { role: string; configVersion: number }[];
  }[];
}

interface DevRepository {
  createConfiguration(
    info: { name: string; artifactType: string },
    draft: {
      modelName: string;
      systemPrompt: string;
      temperature?: number;
      topP?: number;
    },
  ): Promise<unknown>;
  createUnit(
    conversationName: string,
    configName: string,
  ): Promise<{ id: string }>;
  exportDatabase(deliver: (dump: Dump) => Promise<void>): Promise<Dump>;
}

type DevWindow = { variorum: { repository: DevRepository } };

let llm: MockLlm;

test.beforeEach(async () => {
  llm = new MockLlm();
  await llm.start();
});

test.afterEach(async () => {
  await llm.close();
});

/** The scripted endpoint serving two models under two handles. */
const twoModels = (): Endpoint => ({
  id: 'ep-1',
  url: llm.url,
  api: 'openai-compatible',
  authRequired: false,
  models: [
    { modelName: 'mock-model', handle: 'local-a' },
    { modelName: 'mock-model-b', handle: 'local-b' },
  ],
});

/** The scripted endpoint serving one model. */
const oneModel = (): Endpoint => ({
  ...twoModels(),
  models: [{ modelName: 'mock-model', handle: 'local-a' }],
});

const groupLabel = (endpoint: Endpoint) => `${endpoint.url} (${OPENAI_LABEL})`;

function seedDocument(page: Page, endpoints: Endpoint[]) {
  return page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: DOCUMENT_KEY, value: JSON.stringify({ endpoints }) },
  );
}

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
}

function seedConfiguration(page: Page, name: string, modelName: string) {
  return page.evaluate(
    async ({ name, modelName }) => {
      const { repository } = (window as unknown as DevWindow).variorum;
      await repository.createConfiguration(
        { name, artifactType: 'yaml' },
        {
          modelName,
          systemPrompt: 'You produce YAML.',
          temperature: 0.3,
          topP: 0.9,
        },
      );
    },
    { name, modelName },
  );
}

async function seedUnit(page: Page, configName: string) {
  await page.evaluate(async (config) => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createUnit('thread', config);
  }, configName);
  await page.getByRole('button', { name: 'thread' }).click();
}

function exportDump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
}

async function versionsOf(page: Page, name: string): Promise<DumpVersion[]> {
  const dump = await exportDump(page);
  return dump.configurationVersions
    .filter((v) => v.name === name)
    .sort((a, b) => a.version - b.version);
}

async function send(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

async function openNewUnit(page: Page, configName: string) {
  await page.getByRole('button', { name: 'New unit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Configuration').selectOption(configName);
  return dialog;
}

async function openProvidersView(page: Page) {
  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Models/Providers' }).click();
  return dialog;
}

/** Empties the document's only endpoint through the tree, mid-session. */
async function deleteOnlyModel(page: Page, endpoint: Endpoint, handle: string) {
  const dialog = await openProvidersView(page);
  const group = dialog.getByRole('group', { name: groupLabel(endpoint) });
  await group
    .getByRole('listitem')
    .filter({ hasText: handle })
    .getByRole('button', { name: 'Delete model' })
    .click();
  await expect(group.getByRole('listitem')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

const modelPicker = (scope: Locator) =>
  scope.getByLabel('Model', { exact: true });

const saveAndRetry = (scope: Locator) =>
  scope.getByRole('button', { name: /^Save .+ and retry$/ });

// ---- The New unit dialog ---------------------------------------------------

test('[G3] New unit on an unbound configuration shows the Model picker over the document handles, the first selected, and the line naming what Create saves', async ({
  page,
}) => {
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  const dialog = await openNewUnit(page, 'notes');

  await expect(modelPicker(dialog)).toBeVisible();
  await expect(modelPicker(dialog).locator('option')).toHaveText([
    'local-a',
    'local-b',
  ]);
  await expect(modelPicker(dialog)).toHaveValue('local-a');
  await expect(dialog).toContainText('Saves notes.2 with model local-a');
});

test('[G3] Create saves the next version with the chosen handle and every other field unchanged, then creates and loads the unit', async ({
  page,
}) => {
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  const dialog = await openNewUnit(page, 'notes');
  await dialog.getByLabel('Conversation name').fill('first thread');
  await expect(modelPicker(dialog)).toBeVisible();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole('listitem').filter({ hasText: 'first thread' }),
  ).toBeVisible();
  await expect(page.getByText('Select a unit from the sidebar')).toBeHidden();

  const versions = await versionsOf(page, 'notes');
  expect(versions).toHaveLength(2);
  expect(versions[1]).toEqual({
    ...versions[0],
    version: 2,
    modelName: 'local-a',
  });
  const dump = await exportDump(page);
  expect(dump.units.map((u) => u.configName)).toEqual(['notes']);
});

test('[G3] choosing another model updates the line, and that handle is the one saved', async ({
  page,
}) => {
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  const dialog = await openNewUnit(page, 'notes');
  await expect(modelPicker(dialog)).toBeVisible();
  await modelPicker(dialog).selectOption('local-b');
  await expect(dialog).toContainText('Saves notes.2 with model local-b');

  await dialog.getByLabel('Conversation name').fill('second thread');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();

  const versions = await versionsOf(page, 'notes');
  expect(versions.map((v) => v.modelName)).toEqual(['ghost', 'local-b']);
});

test('[G3] a bound configuration shows no picker, and Create saves no version', async ({
  page,
}) => {
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'bound-notes', 'local-a');
  const dialog = await openNewUnit(page, 'bound-notes');
  await dialog.getByLabel('Conversation name').fill('bound thread');

  await expect(modelPicker(dialog)).toHaveCount(0);
  await expect(dialog).not.toContainText('Saves bound-notes');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog).toBeHidden();

  expect(await versionsOf(page, 'bound-notes')).toHaveLength(1);
});

test('[G3] switching the Configuration picker between a bound and an unbound configuration shows and hides the Model picker', async ({
  page,
}) => {
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  await seedConfiguration(page, 'bound-notes', 'local-a');
  const dialog = await openNewUnit(page, 'notes');

  await expect(modelPicker(dialog)).toBeVisible();
  await dialog.getByLabel('Configuration').selectOption('bound-notes');
  await expect(modelPicker(dialog)).toHaveCount(0);
  await dialog.getByLabel('Configuration').selectOption('notes');
  await expect(modelPicker(dialog)).toBeVisible();
});

test('[G3] opening the dialog and cancelling saves nothing', async ({
  page,
}) => {
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  const dialog = await openNewUnit(page, 'notes');
  await expect(modelPicker(dialog)).toBeVisible();
  await modelPicker(dialog).selectOption('local-b');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  expect(await versionsOf(page, 'notes')).toHaveLength(1);
  expect((await exportDump(page)).units).toEqual([]);
});

test('[G3] with no model in the document, Create is disabled and a hint names Models/Providers', async ({
  page,
}) => {
  const endpoint = oneModel();
  await seedDocument(page, [endpoint]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  await deleteOnlyModel(page, endpoint, 'local-a');

  const dialog = await openNewUnit(page, 'notes');
  await dialog.getByLabel('Conversation name').fill('stuck thread');
  await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();
  await expect(dialog).toContainText('Models/Providers');
});

// ---- The chat error row ----------------------------------------------------

test('[G3] a send on an unbound handle shows the error row with the picker, the labelled save-and-retry, and plain Retry', async ({
  page,
}) => {
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  await seedUnit(page, 'notes');
  await send(page, 'hello');

  const errorRow = page.getByRole('alert');
  await expect(errorRow).toContainText(UNBOUND_MESSAGE('ghost'));
  await expect(modelPicker(errorRow)).toBeVisible();
  await expect(modelPicker(errorRow).locator('option')).toHaveText([
    'local-a',
    'local-b',
  ]);
  await expect(modelPicker(errorRow)).toHaveValue('local-a');
  await expect(
    errorRow.getByRole('button', { name: 'Save notes.2 and retry' }),
  ).toBeVisible();
  await expect(
    errorRow.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
  expect(llm.requests).toHaveLength(0);
});

test('[G3] Save and retry mints the next version, the request reaches the endpoint with the chosen model, and the response is tagged with it', async ({
  page,
}) => {
  llm.respondWith({ chunks: [{ content: 'Bound now.' }] });
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  await seedUnit(page, 'notes');
  await send(page, 'hello');

  const errorRow = page.getByRole('alert');
  await expect(
    errorRow.getByRole('button', { name: 'Save notes.2 and retry' }),
  ).toBeVisible();
  await errorRow
    .getByRole('button', { name: 'Save notes.2 and retry' })
    .click();

  await expect(page.getByRole('log')).toContainText('Bound now.');
  await expect(page.getByRole('log')).toContainText('notes.2');
  expect(llm.requests).toHaveLength(1);
  expect(llm.requests[0]?.model).toBe('mock-model');

  await expect
    .poll(async () => (await exportDump(page)).units[0]?.messages.length)
    .toBe(2);
  const versions = await versionsOf(page, 'notes');
  expect(versions).toHaveLength(2);
  expect(versions[1]).toEqual({
    ...versions[0],
    version: 2,
    modelName: 'local-a',
  });
  const dump = await exportDump(page);
  expect(dump.units[0]?.messages.at(-1)).toMatchObject({
    role: 'assistant',
    configVersion: 2,
  });
});

test('[G3] binding the handle in the tree and pressing plain Retry still works and saves no version', async ({
  page,
}) => {
  llm.respondWith({ chunks: [{ content: 'Bound now.' }] });
  const endpoint = oneModel();
  await seedDocument(page, [endpoint]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  await seedUnit(page, 'notes');
  await send(page, 'hello');

  const errorRow = page.getByRole('alert');
  await expect(modelPicker(errorRow)).toBeVisible();

  const dialog = await openProvidersView(page);
  const hint = dialog.getByRole('list', {
    name: 'Referenced by configurations, not bound',
  });
  await hint
    .getByRole('listitem')
    .filter({ hasText: 'ghost' })
    .getByRole('button', { name: 'Add to endpoint' })
    .click();
  await dialog.getByRole('combobox', { name: 'Endpoint' }).click();
  await page.getByRole('option', { name: groupLabel(endpoint) }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(
    dialog
      .getByRole('group', { name: groupLabel(endpoint) })
      .getByRole('listitem')
      .filter({ hasText: 'ghost' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Bound now.');
  expect(llm.requests).toHaveLength(1);
  expect(llm.requests[0]?.model).toBe('ghost');
  expect(await versionsOf(page, 'notes')).toHaveLength(1);
});

test('[G3] a missing-API-key failure shows no picker', async ({ page }) => {
  await seedDocument(page, [
    {
      id: 'ep-auth',
      url: llm.url,
      api: 'openai-compatible',
      authRequired: true,
      models: [{ modelName: 'mock-model', handle: 'keyless' }],
    },
    {
      id: 'ep-open',
      url: 'http://127.0.0.1:9/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [{ modelName: 'other-model', handle: 'local-a' }],
    },
  ]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'keyless');
  await seedUnit(page, 'notes');
  await send(page, 'hello');

  const errorRow = page.getByRole('alert');
  await expect(errorRow).toContainText('no API key for model keyless');
  await expect(modelPicker(errorRow)).toHaveCount(0);
  await expect(saveAndRetry(errorRow)).toHaveCount(0);
  await expect(
    errorRow.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
});

test('[G3] a network failure on a bound handle shows no picker', async ({
  page,
}) => {
  llm.respondWith({ status: 500 });
  await seedDocument(page, [twoModels()]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'local-a');
  await seedUnit(page, 'notes');
  await send(page, 'hello');

  const errorRow = page.getByRole('alert');
  await expect(errorRow).toBeVisible();
  await expect(modelPicker(errorRow)).toHaveCount(0);
  await expect(saveAndRetry(errorRow)).toHaveCount(0);
  await expect(
    errorRow.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
});

test('[G3] with no model in the document, the error row offers only Retry', async ({
  page,
}) => {
  const endpoint = oneModel();
  await seedDocument(page, [endpoint]);
  await openApp(page);
  await seedConfiguration(page, 'notes', 'ghost');
  await deleteOnlyModel(page, endpoint, 'local-a');
  await seedUnit(page, 'notes');
  await send(page, 'hello');

  const errorRow = page.getByRole('alert');
  await expect(errorRow).toContainText(UNBOUND_MESSAGE('ghost'));
  await expect(modelPicker(errorRow)).toHaveCount(0);
  await expect(saveAndRetry(errorRow)).toHaveCount(0);
  await expect(
    errorRow.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
});
