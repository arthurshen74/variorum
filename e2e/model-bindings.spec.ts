/**
 * [G3] Acceptance for DESIGN.md "Model Bindings" and the Models view of
 * "Management UI": per-model bindings drive where a chat request goes
 * and which protocol it speaks, through the real UI against scripted
 * endpoints at the network boundary. Locator contract: the Models view
 * opens from a "Models" button in the Configurations dialog; each model
 * renders as a group (fieldset) named by the model name, holding an
 * "API" combobox, "Endpoint URL", "API key" (password), a "Max output
 * tokens" field shown only for anthropic-messages, and per-group Save
 * and Reset buttons.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { MockAnthropic } from './mock-anthropic.ts';
import { MockLlm } from './mock-llm.ts';

const DEFAULT_BASE_URL = 'http://localhost:1234/v1';

interface Dump {
  configurations: { name: string }[];
  configurationVersions: { name: string; version: number; modelName: string }[];
  units: { id: string }[];
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

function seedConfiguration(page: Page, name: string, modelName: string) {
  return page.evaluate(
    async ({ name, modelName }) => {
      const { repository } = (window as unknown as DevWindow).variorum;
      await repository.createConfiguration(
        { name, artifactType: 'yaml' },
        { modelName, systemPrompt: 'You produce YAML.' },
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

async function openModelsView(page: Page) {
  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Models' }).click();
  return dialog;
}

function seedBinding(page: Page, modelName: string, binding: object) {
  return page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: `variorum.model.${modelName}`,
      value: JSON.stringify(binding),
    },
  );
}

function storedBinding(page: Page, modelName: string) {
  return page.evaluate(
    (key) => localStorage.getItem(key),
    `variorum.model.${modelName}`,
  );
}

async function send(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('[G3] the Models view lists a configured model with the default binding; a saved anthropic binding persists across reload', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'claude-writer', 'claude-mock');
  let dialog = await openModelsView(page);
  const group = dialog.getByRole('group', { name: 'claude-mock' });
  await expect(group.getByLabel('Endpoint URL')).toHaveValue(DEFAULT_BASE_URL);
  await expect(group.getByLabel('Max output tokens')).toBeHidden();

  await group.getByRole('combobox', { name: 'API' }).click();
  await page.getByRole('option', { name: 'anthropic-messages' }).click();
  await expect(group.getByLabel('Max output tokens')).toBeVisible();
  await group.getByLabel('Endpoint URL').fill('http://127.0.0.1:8899/v1');
  await group.getByLabel('API key').fill('sk-ant-test');
  await group.getByLabel('Max output tokens').fill('8000');
  await group.getByRole('button', { name: 'Save' }).click();

  await expect
    .poll(() => storedBinding(page, 'claude-mock'))
    .toBe(
      JSON.stringify({
        api: 'anthropic-messages',
        endpointUrl: 'http://127.0.0.1:8899/v1',
        apiKey: 'sk-ant-test',
        maxOutputTokens: 8000,
      }),
    );

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  dialog = await openModelsView(page);
  const reopened = dialog.getByRole('group', { name: 'claude-mock' });
  await expect(reopened.getByRole('combobox', { name: 'API' })).toContainText(
    'anthropic-messages',
  );
  await expect(reopened.getByLabel('Endpoint URL')).toHaveValue(
    'http://127.0.0.1:8899/v1',
  );
  await expect(reopened.getByLabel('API key')).toHaveValue('sk-ant-test');
  await expect(reopened.getByLabel('Max output tokens')).toHaveValue('8000');
});

test('[G3] an invalid endpoint URL shows an error and stores nothing', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'claude-writer', 'claude-mock');
  const dialog = await openModelsView(page);
  const group = dialog.getByRole('group', { name: 'claude-mock' });
  await group.getByLabel('Endpoint URL').fill('not a url');
  await group.getByRole('button', { name: 'Save' }).click();

  await expect(group.getByRole('alert')).toBeVisible();
  expect(await storedBinding(page, 'claude-mock')).toBeNull();
});

test('[G3] a chat send on an anthropic-bound model reaches that endpoint as a Messages request', async ({
  page,
}) => {
  const anthropic = new MockAnthropic();
  await anthropic.start();
  anthropic.respondWith({
    thinking: ['Considering.'],
    text: ['Here you go.'],
  });
  try {
    await seedBinding(page, 'claude-mock', {
      api: 'anthropic-messages',
      endpointUrl: anthropic.url,
      apiKey: 'sk-ant-test',
      maxOutputTokens: 1234,
    });
    await openApp(page);
    await seedConfiguration(page, 'claude-writer', 'claude-mock');
    await seedUnit(page, 'claude-writer');
    await send(page, 'hello');

    await expect(page.getByRole('log')).toContainText('Here you go.');
    expect(anthropic.paths[0]).toBe('/v1/messages');
    expect(anthropic.headers[0]?.['x-api-key']).toBe('sk-ant-test');
    expect(
      anthropic.headers[0]?.['anthropic-dangerous-direct-browser-access'],
    ).toBe('true');
    expect(anthropic.requests[0]?.model).toBe('claude-mock');
    expect(anthropic.requests[0]?.max_tokens).toBe(1234);
  } finally {
    await anthropic.close();
  }
});

test('[G3] an unbound model goes to the LM Studio default with no auth header — the legacy global keys are dead', async ({
  page,
}) => {
  // The dead keys must not steer the request (DESIGN.md "Model Bindings").
  await page.addInitScript(() => {
    localStorage.setItem('variorum.baseUrl', 'http://localhost:4321/v1');
    localStorage.setItem('variorum.apiKey', 'legacy-key');
  });
  // Nothing may listen on the real default port in CI, so this one spec
  // intercepts at the browser boundary instead of running a server there.
  const captured: { path: string; authorization: string | undefined }[] = [];
  const sse = (payload: object) => `data: ${JSON.stringify(payload)}\n\n`;
  await page.route('http://localhost:1234/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
      return;
    }
    captured.push({
      path: new URL(route.request().url()).pathname,
      authorization: route.request().headers()['authorization'],
    });
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'content-type': 'text/event-stream',
      },
      body:
        sse({
          id: 'r1',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'mock-model',
          choices: [
            { index: 0, delta: { content: 'From default.' }, finish_reason: null },
          ],
        }) +
        sse({
          id: 'r1',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'mock-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }) +
        'data: [DONE]\n\n',
    });
  });

  await openApp(page);
  await seedConfiguration(page, 'notes', 'mock-model');
  await seedUnit(page, 'notes');
  await send(page, 'hello');

  await expect(page.getByRole('log')).toContainText('From default.');
  expect(captured[0]?.path).toBe('/v1/chat/completions');
  expect(captured[0]?.authorization).toBeUndefined();
});

test("[G3] an openai-compatible binding's key rides as a Bearer Authorization header", async ({
  page,
}) => {
  const llm = new MockLlm();
  await llm.start();
  llm.respondWith({ chunks: [{ content: 'Hi.' }] });
  try {
    await seedBinding(page, 'mock-model', {
      api: 'openai-compatible',
      endpointUrl: llm.url,
      apiKey: 'sk-open-test',
    });
    await openApp(page);
    await seedConfiguration(page, 'notes', 'mock-model');
    await seedUnit(page, 'notes');
    await send(page, 'hello');

    await expect(page.getByRole('log')).toContainText('Hi.');
    expect(llm.headers[0]?.['authorization']).toBe('Bearer sk-open-test');
  } finally {
    await llm.close();
  }
});

test('[G3] Reset removes the stored binding and the row returns to the default', async ({
  page,
}) => {
  await seedBinding(page, 'claude-mock', {
    api: 'anthropic-messages',
    endpointUrl: 'http://127.0.0.1:8899/v1',
    apiKey: 'sk-ant-test',
  });
  await openApp(page);
  await seedConfiguration(page, 'claude-writer', 'claude-mock');
  const dialog = await openModelsView(page);
  const group = dialog.getByRole('group', { name: 'claude-mock' });
  await expect(group.getByLabel('Endpoint URL')).toHaveValue(
    'http://127.0.0.1:8899/v1',
  );

  await group.getByRole('button', { name: 'Reset' }).click();
  await expect(group.getByLabel('Endpoint URL')).toHaveValue(DEFAULT_BASE_URL);
  await expect.poll(() => storedBinding(page, 'claude-mock')).toBeNull();
});

test('[G3] the API key field is masked and prefilled from the stored binding', async ({
  page,
}) => {
  await seedBinding(page, 'claude-mock', {
    api: 'anthropic-messages',
    endpointUrl: 'http://127.0.0.1:8899/v1',
    apiKey: 'sk-ant-test',
  });
  await openApp(page);
  await seedConfiguration(page, 'claude-writer', 'claude-mock');
  const dialog = await openModelsView(page);
  const field = dialog
    .getByRole('group', { name: 'claude-mock' })
    .getByLabel('API key');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveValue('sk-ant-test');
});

test('[G3] a model binding appears in no export and does not trip the dirty-since-export bit', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'claude-writer', 'claude-mock');
  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.exportDatabase(async () => {});
  });

  const dialog = await openModelsView(page);
  const group = dialog.getByRole('group', { name: 'claude-mock' });
  await group.getByLabel('Endpoint URL').fill('http://127.0.0.1:7788/v1');
  await group.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(() => storedBinding(page, 'claude-mock'))
    .not.toBeNull();
  await page.keyboard.press('Escape');

  // prune requires a fresh export; it resolving proves the binding save
  // was not a database mutation.
  const result = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    const pruned = await repository.pruneArchivedUnits();
    const dump = await repository.exportDatabase(async () => {});
    return { pruned, dump };
  });
  expect(result.pruned).toBe(0);
  expect(JSON.stringify(result.dump)).not.toContain('7788');
});
