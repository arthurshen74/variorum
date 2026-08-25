/**
 * [G4] Acceptance for DESIGN.md "Models and Providers" and the
 * Models/Providers view of "Management UI": the device-local document
 * drives where a chat request goes, which protocol it speaks and which
 * key rides on it, through the real UI against scripted endpoints at the
 * network boundary.
 *
 * Locator contract: the view opens from a "Models/Providers" button in
 * the Configurations dialog. Each endpoint renders as a group (fieldset)
 * named "<url> (<protocol label>)" holding "Add model", "Edit endpoint"
 * and "Delete endpoint" buttons and a list whose items carry the handle
 * text (plus the model name when it differs, and "No API key" when the
 * key gap flag applies) with "Edit model" and "Delete model" buttons. An
 * "Add endpoint" button sits above the tree. The endpoint form has
 * "Endpoint URL", a "Protocol" combobox (options by adapter label), a
 * "Requires authentication" checkbox, "API key" (password, only when
 * checked), Save and Cancel. The model form has "Model name", "Handle",
 * an "Endpoint" combobox (options by endpoint label), "API key" (only
 * when the endpoint requires authentication), "Max output tokens" (only
 * under an adapter with a cap), Save and Cancel. Refusals render as an
 * alert inside the dialog. Below the tree, "Referenced by
 * configurations, not bound" lists handles each with an "Add to
 * endpoint" button. The chat error row is the alert with a Retry button.
 * The configuration form's "Model" field is a free-text input with a
 * "Show bound handles" toggle opening a listbox (one role=option per
 * bound handle, unfiltered on open); selecting an option fills the
 * input (amendment A10, design/plans/models-providers.md).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { MockAnthropic } from './mock-anthropic.ts';
import { MockLlm } from './mock-llm.ts';

const DOCUMENT_KEY = 'variorum.llm';
const DEFAULT_URL = 'http://localhost:1234/v1';
const OPENAI_LABEL = 'OpenAI Chat Completions';
const ANTHROPIC_LABEL = 'Anthropic Messages';
const UNBOUND_MESSAGE = (handle: string) =>
  `no endpoint bound for model ${handle}, please check your models/providers configuration`;

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

interface ModelRow {
  modelName: string;
  handle: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

interface Endpoint {
  id: string;
  url: string;
  api: 'openai-compatible' | 'anthropic-messages';
  authRequired: boolean;
  apiKey?: string;
  models: ModelRow[];
}

const label = (endpoint: { url: string; api: string }) =>
  `${endpoint.url} (${endpoint.api === 'anthropic-messages' ? ANTHROPIC_LABEL : OPENAI_LABEL})`;

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
}

function seedDocument(page: Page, endpoints: Endpoint[]) {
  return page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: DOCUMENT_KEY, value: JSON.stringify({ endpoints }) },
  );
}

function storedDocument(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), DOCUMENT_KEY);
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

async function openProvidersView(page: Page) {
  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Models/Providers' }).click();
  return dialog;
}

async function send(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

const endpointGroup = (
  dialog: Locator,
  endpoint: { url: string; api: string },
) => dialog.getByRole('group', { name: label(endpoint) });

const modelItem = (group: Locator, handle: string) =>
  group.getByRole('listitem').filter({ hasText: handle });

async function chooseOption(dialog: Locator, combobox: string, option: string) {
  await dialog.getByRole('combobox', { name: combobox }).click();
  await dialog.page().getByRole('option', { name: option }).click();
}

test('[G4] Models/Providers opens from the Configurations dialog and shows the seeded LM Studio endpoint with no models', async ({
  page,
}) => {
  await openApp(page);
  const dialog = await openProvidersView(page);
  const seed = endpointGroup(dialog, {
    url: DEFAULT_URL,
    api: 'openai-compatible',
  });
  await expect(seed).toBeVisible();
  await expect(seed.getByRole('listitem')).toHaveCount(0);

  const stored = JSON.parse((await storedDocument(page)) ?? 'null') as {
    endpoints: Endpoint[];
  } | null;
  expect(stored?.endpoints).toHaveLength(1);
  expect(stored?.endpoints[0]).toMatchObject({
    url: DEFAULT_URL,
    api: 'openai-compatible',
    authRequired: false,
    models: [],
  });
});

test('[G4] adding an endpoint and a model beneath it persists across reload; the tree shows <url> (label) and the handle', async ({
  page,
}) => {
  await openApp(page);
  let dialog = await openProvidersView(page);

  await dialog.getByRole('button', { name: 'Add endpoint' }).click();
  await dialog.getByLabel('Endpoint URL').fill('http://127.0.0.1:8899/v1');
  await chooseOption(dialog, 'Protocol', ANTHROPIC_LABEL);
  await expect(dialog.getByLabel('API key')).toBeHidden();
  await dialog.getByLabel('Requires authentication').check();
  await expect(dialog.getByLabel('API key')).toHaveAttribute(
    'type',
    'password',
  );
  await dialog.getByLabel('API key').fill('sk-ant-test');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const anthropic = {
    url: 'http://127.0.0.1:8899/v1',
    api: 'anthropic-messages',
  };
  await expect(endpointGroup(dialog, anthropic)).toBeVisible();

  await endpointGroup(dialog, anthropic)
    .getByRole('button', { name: 'Add model' })
    .click();
  await dialog.getByLabel('Model name').fill('claude-x');
  await expect(dialog.getByLabel('Handle')).toHaveValue('claude-x');
  await expect(dialog.getByLabel('Max output tokens')).toBeVisible();
  await dialog.getByLabel('Max output tokens').fill('8000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(
    modelItem(endpointGroup(dialog, anthropic), 'claude-x'),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  dialog = await openProvidersView(page);
  await expect(
    modelItem(endpointGroup(dialog, anthropic), 'claude-x'),
  ).toBeVisible();

  const stored = JSON.parse((await storedDocument(page)) ?? 'null') as {
    endpoints: Endpoint[];
  };
  const added = stored.endpoints.find((e) => e.api === 'anthropic-messages');
  expect(added).toMatchObject({
    url: 'http://127.0.0.1:8899/v1',
    authRequired: true,
    apiKey: 'sk-ant-test',
    models: [
      { modelName: 'claude-x', handle: 'claude-x', maxOutputTokens: 8000 },
    ],
  });
});

test('[G4] an invalid URL, a duplicate (url, api), and a duplicate handle are each refused with an alert and store nothing', async ({
  page,
}) => {
  const existing: Endpoint = {
    id: 'ep-1',
    url: 'http://127.0.0.1:7001/v1',
    api: 'openai-compatible',
    authRequired: false,
    models: [{ modelName: 'qwen/x', handle: 'qwen' }],
  };
  await seedDocument(page, [existing]);
  await openApp(page);
  const dialog = await openProvidersView(page);
  const before = await storedDocument(page);

  await dialog.getByRole('button', { name: 'Add endpoint' }).click();
  await dialog.getByLabel('Endpoint URL').fill('not a url');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await dialog.getByLabel('Endpoint URL').fill('http://127.0.0.1:7001/v1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/already exists/);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await endpointGroup(dialog, existing)
    .getByRole('button', { name: 'Add model' })
    .click();
  await dialog.getByLabel('Model name').fill('other/model');
  await dialog.getByLabel('Handle').fill('qwen');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/handle/);

  expect(await storedDocument(page)).toBe(before);
});

test('[G4] deleting an endpoint with a model is refused; after deleting the model it succeeds', async ({
  page,
}) => {
  const endpoint: Endpoint = {
    id: 'ep-1',
    url: 'http://127.0.0.1:7001/v1',
    api: 'openai-compatible',
    authRequired: false,
    models: [{ modelName: 'qwen/x', handle: 'qwen' }],
  };
  await seedDocument(page, [endpoint]);
  await openApp(page);
  const dialog = await openProvidersView(page);
  const group = endpointGroup(dialog, endpoint);

  await group.getByRole('button', { name: 'Delete endpoint' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/still has models/);
  await expect(group).toBeVisible();

  await modelItem(group, 'qwen')
    .getByRole('button', { name: 'Delete model' })
    .click();
  await expect(group.getByRole('listitem')).toHaveCount(0);
  await group.getByRole('button', { name: 'Delete endpoint' }).click();
  await expect(group).toBeHidden();

  const stored = JSON.parse((await storedDocument(page)) ?? 'null') as {
    endpoints: Endpoint[];
  };
  expect(stored.endpoints).toEqual([]);
});

test('[G4] reassigning a model moves it under the other endpoint and the next send goes there', async ({
  page,
}) => {
  const first = new MockLlm();
  const second = new MockLlm();
  await first.start();
  await second.start();
  first.respondWith({ chunks: [{ content: 'From first.' }] });
  second.respondWith({ chunks: [{ content: 'From second.' }] });
  try {
    const a: Endpoint = {
      id: 'ep-a',
      url: first.url,
      api: 'openai-compatible',
      authRequired: false,
      models: [{ modelName: 'mock-model', handle: 'mock' }],
    };
    const b: Endpoint = {
      id: 'ep-b',
      url: second.url,
      api: 'openai-compatible',
      authRequired: false,
      models: [],
    };
    await seedDocument(page, [a, b]);
    await openApp(page);
    await seedConfiguration(page, 'notes', 'mock');
    await seedUnit(page, 'notes');
    await send(page, 'hello');
    await expect(page.getByRole('log')).toContainText('From first.');
    expect(first.requests).toHaveLength(1);

    const dialog = await openProvidersView(page);
    await modelItem(endpointGroup(dialog, a), 'mock')
      .getByRole('button', { name: 'Edit model' })
      .click();
    await chooseOption(dialog, 'Endpoint', label(b));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(modelItem(endpointGroup(dialog, b), 'mock')).toBeVisible();
    await expect(endpointGroup(dialog, a).getByRole('listitem')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await send(page, 'again');
    await expect(page.getByRole('log')).toContainText('From second.');
    expect(second.requests).toHaveLength(1);
    expect(first.requests).toHaveLength(1);
  } finally {
    await first.close();
    await second.close();
  }
});

test('[G4] a handle bound to an anthropic endpoint reaches it as a Messages request with the endpoint key as x-api-key', async ({
  page,
}) => {
  const anthropic = new MockAnthropic();
  await anthropic.start();
  anthropic.respondWith({ thinking: ['Considering.'], text: ['Here you go.'] });
  try {
    await seedDocument(page, [
      {
        id: 'ep-ant',
        url: anthropic.url,
        api: 'anthropic-messages',
        authRequired: true,
        apiKey: 'sk-ant-test',
        models: [
          { modelName: 'claude-mock', handle: 'claude', maxOutputTokens: 1234 },
        ],
      },
    ]);
    await openApp(page);
    await seedConfiguration(page, 'claude-writer', 'claude');
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

test('[G4] a model key overrides the endpoint key as the Bearer header', async ({
  page,
}) => {
  const llm = new MockLlm();
  await llm.start();
  llm.respondWith({ chunks: [{ content: 'Hi.' }] });
  try {
    await seedDocument(page, [
      {
        id: 'ep-1',
        url: llm.url,
        api: 'openai-compatible',
        authRequired: true,
        apiKey: 'endpoint-key',
        models: [
          { modelName: 'mock-model', handle: 'mock', apiKey: 'model-key' },
        ],
      },
    ]);
    await openApp(page);
    await seedConfiguration(page, 'notes', 'mock');
    await seedUnit(page, 'notes');
    await send(page, 'hello');

    await expect(page.getByRole('log')).toContainText('Hi.');
    expect(llm.headers[0]?.['authorization']).toBe('Bearer model-key');
    expect(llm.requests[0]?.model).toBe('mock-model');
  } finally {
    await llm.close();
  }
});

test('[G4] an unbound handle shows the exact error row with no request leaving the browser; "Add to endpoint" from the referenced list then Retry succeeds', async ({
  page,
}) => {
  const llm = new MockLlm();
  await llm.start();
  llm.respondWith({ chunks: [{ content: 'Bound now.' }] });
  try {
    const endpoint: Endpoint = {
      id: 'ep-1',
      url: llm.url,
      api: 'openai-compatible',
      authRequired: false,
      models: [],
    };
    await seedDocument(page, [endpoint]);
    await openApp(page);
    await seedConfiguration(page, 'notes', 'ghost');
    await seedUnit(page, 'notes');
    await send(page, 'hello');

    const errorRow = page.getByRole('alert');
    await expect(errorRow).toContainText(UNBOUND_MESSAGE('ghost'));
    await expect(errorRow.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(llm.requests).toHaveLength(0);

    const dialog = await openProvidersView(page);
    const hint = dialog.getByRole('list', {
      name: 'Referenced by configurations, not bound',
    });
    await expect(
      hint.getByRole('listitem').filter({ hasText: 'ghost' }),
    ).toBeVisible();
    await hint
      .getByRole('listitem')
      .filter({ hasText: 'ghost' })
      .getByRole('button', { name: 'Add to endpoint' })
      .click();
    await expect(dialog.getByLabel('Model name')).toHaveValue('ghost');
    await expect(dialog.getByLabel('Handle')).toHaveValue('ghost');
    await chooseOption(dialog, 'Endpoint', label(endpoint));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(
      modelItem(endpointGroup(dialog, endpoint), 'ghost'),
    ).toBeVisible();
    await expect(hint).toBeHidden();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('log')).toContainText('Bound now.');
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0]?.model).toBe('ghost');
  } finally {
    await llm.close();
  }
});

test('[G4] legacy variorum.model.* records are folded on first open and the legacy keys are gone', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'variorum.model.claude-mock',
      JSON.stringify({
        api: 'anthropic-messages',
        endpointUrl: 'http://127.0.0.1:8899/v1',
        apiKey: 'sk-ant-test',
        maxOutputTokens: 1234,
      }),
    );
    localStorage.setItem(
      'variorum.model.qwen',
      JSON.stringify({
        api: 'openai-compatible',
        endpointUrl: 'http://localhost:1234/v1',
      }),
    );
  });
  await openApp(page);
  const dialog = await openProvidersView(page);

  const anthropic = {
    url: 'http://127.0.0.1:8899/v1',
    api: 'anthropic-messages',
  };
  await expect(
    modelItem(endpointGroup(dialog, anthropic), 'claude-mock'),
  ).toBeVisible();
  await expect(
    modelItem(
      endpointGroup(dialog, { url: DEFAULT_URL, api: 'openai-compatible' }),
      'qwen',
    ),
  ).toBeVisible();

  const legacy = await page.evaluate(() => [
    localStorage.getItem('variorum.model.claude-mock'),
    localStorage.getItem('variorum.model.qwen'),
  ]);
  expect(legacy).toEqual([null, null]);
  const stored = JSON.parse((await storedDocument(page)) ?? 'null') as {
    endpoints: Endpoint[];
  };
  expect(
    stored.endpoints.find((e) => e.api === 'anthropic-messages'),
  ).toMatchObject({
    authRequired: true,
    apiKey: 'sk-ant-test',
    models: [
      {
        modelName: 'claude-mock',
        handle: 'claude-mock',
        maxOutputTokens: 1234,
      },
    ],
  });
});

test("[G4] the configuration form's Model field offers the document's handles and still accepts free text", async ({
  page,
}) => {
  await seedDocument(page, [
    {
      id: 'ep-1',
      url: 'http://127.0.0.1:7001/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [
        { modelName: 'qwen/x', handle: 'qwen-local' },
        { modelName: 'meta/llama', handle: 'llama' },
      ],
    },
  ]);
  await openApp(page);
  await page.getByRole('button', { name: 'Configurations' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add' }).click();

  const model = dialog.getByLabel('Model');
  await dialog.getByRole('button', { name: 'Show bound handles' }).click();
  const options = page.getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(page.getByRole('option', { name: 'qwen-local' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'llama' })).toBeVisible();
  await page.getByRole('option', { name: 'llama' }).click();
  await expect(model).toHaveValue('llama');

  await dialog.getByLabel('Name').fill('free');
  await dialog.getByLabel('Artifact type').fill('yaml');
  await model.fill('not-yet-bound');
  await dialog.getByLabel('System prompt').fill('You produce YAML.');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const dump = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
  expect(dump.configurationVersions).toEqual([
    expect.objectContaining({
      name: 'free',
      version: 1,
      modelName: 'not-yet-bound',
    }),
  ]);
});

test('[G4] a keyless model under an auth-required endpoint is flagged in the tree', async ({
  page,
}) => {
  const endpoint: Endpoint = {
    id: 'ep-1',
    url: 'http://127.0.0.1:7001/v1',
    api: 'openai-compatible',
    authRequired: true,
    models: [
      { modelName: 'bare', handle: 'bare' },
      { modelName: 'keyed', handle: 'keyed', apiKey: 'k' },
    ],
  };
  await seedDocument(page, [endpoint]);
  await openApp(page);
  const dialog = await openProvidersView(page);
  const group = endpointGroup(dialog, endpoint);
  await expect(modelItem(group, 'bare')).toContainText('No API key');
  await expect(modelItem(group, 'keyed')).not.toContainText('No API key');
});

test('[G4] the document appears in no export and does not trip the dirty-since-export bit', async ({
  page,
}) => {
  await openApp(page);
  await seedConfiguration(page, 'notes', 'mock');
  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.exportDatabase(async () => {});
  });

  const dialog = await openProvidersView(page);
  await dialog.getByRole('button', { name: 'Add endpoint' }).click();
  await dialog.getByLabel('Endpoint URL').fill('http://127.0.0.1:7788/v1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(
    endpointGroup(dialog, {
      url: 'http://127.0.0.1:7788/v1',
      api: 'openai-compatible',
    }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // prune requires a fresh export; it resolving proves the document save
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
