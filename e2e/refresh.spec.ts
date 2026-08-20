/**
 * [G2] Acceptance for DESIGN.md "Refresh — the stranded user message":
 * the control appears exactly when the unit's last persisted message is a
 * user turn with no answer, re-sends the record unchanged, and announces
 * a manual edit made while stranded by appending the notice AFTER that
 * message.
 *
 * Locator contract the implementation must meet: the control is a button
 * named "Refresh", rendered in the transcript's exchange-state slot
 * beside the loader and the error row, and never visible at the same time
 * as the error row's "Retry"; everything else follows chat.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

interface DumpMessage {
  role: string;
  configVersion: number;
  kind?: string;
  artifactVersion?: number;
  content: string;
}

interface Dump {
  units: {
    id: string;
    messages: DumpMessage[];
    artifacts: { version: number; source: string; content: string }[];
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
  saveConfigurationVersion(
    name: string,
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  completeExchange(
    unitId: string,
    assistant: { content: string; sentAt: string; receivedFinishedAt: string },
    artifactContent?: string,
  ): Promise<unknown>;
  exportDatabase(deliver: (dump: Dump) => Promise<void>): Promise<Dump>;
}

type DevWindow = { variorum: { repository: DevRepository } };

interface RequestMessage {
  role: string;
  content: string;
}

let llm: MockLlm;

test.beforeEach(async ({ page }) => {
  llm = new MockLlm();
  await llm.start();
  await page.addInitScript((url) => {
    localStorage.setItem('variorum.baseUrl', url);
  }, llm.url);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
});

test.afterEach(async () => {
  await llm.close();
});

async function seedUnit(page: Page): Promise<string> {
  const unitId = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'mock-model', systemPrompt: 'You produce YAML.' },
    );
    const unit = await repository.createUnit('thread', 'linkml');
    return unit.id;
  });
  await page.getByRole('button', { name: 'thread' }).click();
  return unitId;
}

function landRevision(page: Page, unitId: string, artifact: string) {
  return page.evaluate(
    async (args) => {
      const { repository } = (window as unknown as DevWindow).variorum;
      await repository.completeExchange(
        args.unitId,
        {
          content: 'revised',
          sentAt: '2026-08-19T10:00:00.000Z',
          receivedFinishedAt: '2026-08-19T10:00:05.000Z',
        },
        args.artifact,
      );
    },
    { unitId, artifact },
  );
}

function exportDump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
}

async function send(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

/** Reload and reopen the unit — the error row goes, the record stays. */
async function reopen(page: Page) {
  await page.reload();
  await page.getByRole('button', { name: 'thread' }).click();
}

const transcript = (page: Page) => page.getByRole('log');
const editor = (page: Page) => page.locator('.cm-content');
const errorRow = (page: Page) => page.getByRole('alert');
const refresh = (page: Page) => page.getByRole('button', { name: 'Refresh' });

/** Replace the whole working copy and save it through the real UI. */
async function editAndSave(page: Page, content: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(content);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('unsaved')).toBeHidden();
}

function completionMessages(index: number): RequestMessage[] {
  const request = llm.requests[index] as { messages: RequestMessage[] };
  return request.messages.filter((m) => m.role !== 'system');
}

test('[G2] a cancelled response leaves the message refreshable', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith(
    { chunks: [{ content: 'half a thou' }], holdOpen: true },
    { chunks: [{ content: 'All done.' }] },
  );
  await send(page, 'write me a schema');
  await expect(transcript(page)).toContainText('half a thou');

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(transcript(page)).not.toContainText('half a thou');
  await expect(errorRow(page)).toBeHidden();

  await expect(refresh(page)).toBeVisible();
  await refresh(page).click();
  await expect(transcript(page)).toContainText('All done.');
});

test('[G2] Refresh survives a reload, where the error row does not', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ status: 500 }, { chunks: [{ content: 'All done.' }] });
  await send(page, 'write me a schema');
  await expect(errorRow(page)).toBeVisible();

  await reopen(page);
  await expect(transcript(page)).toContainText('write me a schema');
  await expect(errorRow(page)).toBeHidden();

  await expect(refresh(page)).toBeVisible();
  await refresh(page).click();
  await expect(transcript(page)).toContainText('All done.');
});

test('[G2] Refresh goes away once an assistant response is recorded', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ status: 500 }, { chunks: [{ content: 'All done.' }] });
  await send(page, 'hello');
  await expect(errorRow(page)).toBeVisible();

  await reopen(page);
  await expect(refresh(page)).toBeVisible();

  await refresh(page).click();
  await expect(transcript(page)).toContainText('All done.');
  await expect(refresh(page)).toBeHidden();
});

test('[G2] Refresh goes away while a response is in flight', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith(
    { status: 500 },
    { chunks: [{ content: 'streaming' }], holdOpen: true },
  );
  await send(page, 'hello');
  await expect(errorRow(page)).toBeVisible();

  await reopen(page);
  await expect(refresh(page)).toBeVisible();

  await refresh(page).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(refresh(page)).toBeHidden();

  llm.release([{ content: ' done.' }]);
  await expect(transcript(page)).toContainText('streaming done.');
});

test('[G2] Refresh gives way to the error row — never two re-send controls', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ status: 500 });
  await send(page, 'hello');
  await expect(errorRow(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(refresh(page)).toBeHidden();

  await reopen(page);
  await expect(refresh(page)).toBeVisible();

  // A Refresh that fails again hands the affordance back to the error row.
  await refresh(page).click();
  await expect(errorRow(page)).toBeVisible();
  await expect(refresh(page)).toBeHidden();
});

test('[G2] Refresh re-sends the persisted history exactly', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ status: 500 }, { chunks: [{ content: 'All done.' }] });
  await send(page, 'write me a schema');
  await expect(errorRow(page)).toBeVisible();

  await reopen(page);
  await refresh(page).click();
  await expect(transcript(page)).toContainText('All done.');

  expect(llm.requests).toHaveLength(2);
  const sent = completionMessages(1);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ role: 'user', content: 'write me a schema' });

  const dump = await exportDump(page);
  const messages = dump.units[0]?.messages ?? [];
  expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(messages[0]?.content).toBe('write me a schema');
});

test('[G2] a manual edit made while stranded is announced after the message', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await expect(editor(page)).toContainText('a: 1');

  llm.respondWith({ status: 500 }, { chunks: [{ content: 'All done.' }] });
  await send(page, 'tweak it');
  await expect(errorRow(page)).toBeVisible();

  await editAndSave(page, 'edited: true\n');
  await reopen(page);
  await refresh(page).click();
  await expect(transcript(page)).toContainText('All done.');

  // The notice rides along, appended AFTER the stranded user message.
  const sent = completionMessages(1);
  expect(sent.map((m) => m.role)).toEqual(['assistant', 'user', 'user']);
  expect(sent[1]).toMatchObject({ content: 'tweak it' });
  expect(sent[2]?.content).toContain(
    'The user manually edited the artifact. The current artifact is:',
  );
  expect(sent[2]?.content).toContain('```yaml artifact\nedited: true\n```');

  await expect(transcript(page)).toContainText('You edited → revision 2');

  const dump = await exportDump(page);
  const messages = dump.units[0]?.messages ?? [];
  expect(messages.map((m) => m.kind ?? 'chat')).toEqual([
    'chat',
    'chat',
    'editNotice',
    'chat',
  ]);
  expect(messages[2]?.artifactVersion).toBe(2);
  // The request context is exactly the persisted message history.
  expect(sent.map((m) => [m.role, m.content])).toEqual(
    messages.slice(0, sent.length).map((m) => [m.role, m.content]),
  );
});

test('[G2] a Refresh with nothing pending mints no revision and no notice', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');

  llm.respondWith({ status: 500 }, { chunks: [{ content: 'All done.' }] });
  await send(page, 'tweak it');
  await expect(errorRow(page)).toBeVisible();

  await reopen(page);
  await refresh(page).click();
  await expect(transcript(page)).toContainText('All done.');

  const dump = await exportDump(page);
  expect(dump.units[0]?.artifacts).toHaveLength(1);
  expect(dump.units[0]?.messages.map((m) => m.kind ?? 'chat')).toEqual([
    'chat',
    'chat',
    'chat',
  ]);
});

test('[G2] a configuration saved before the Refresh tags the answer, not the question', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ status: 500 }, { chunks: [{ content: 'All done.' }] });
  await send(page, 'hello');
  await expect(errorRow(page)).toBeVisible();

  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.saveConfigurationVersion('linkml', {
      modelName: 'mock-model',
      systemPrompt: 'You produce YAML, tersely.',
    });
  });

  await reopen(page);
  await refresh(page).click();
  await expect(transcript(page)).toContainText('All done.');

  await expect(transcript(page)).toContainText('linkml.2');
  const dump = await exportDump(page);
  expect(dump.units[0]?.messages.map((m) => m.configVersion)).toEqual([1, 2]);
});
