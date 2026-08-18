/**
 * [G3] Acceptance for DESIGN.md "Manual edits enter the conversation" and
 * the CLAUDE.md persisted-before-send invariant: a manual save is
 * announced to the model as a persisted user-role notice in the next
 * request, the request context equals the persisted record, and the
 * transcript collapses the notice to a chip.
 *
 * Locator contract: the notice chip carries the text
 * "You edited → revision N"; everything else follows chat.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

interface DumpMessage {
  role: string;
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
          sentAt: '2026-08-03T10:00:00.000Z',
          receivedFinishedAt: '2026-08-03T10:00:05.000Z',
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

const transcript = (page: Page) => page.getByRole('log');
const editor = (page: Page) => page.locator('.cm-content');

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

test('[G3] a manual save reaches the model as a notice, and the request equals the record', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await expect(editor(page)).toContainText('a: 1');

  await editAndSave(page, 'edited: true\n');
  llm.respondWith({ chunks: [{ content: 'Understood.' }] });
  await send(page, 'tweak it');
  await expect(transcript(page)).toContainText('Understood.');

  const sent = completionMessages(0);
  expect(sent.at(-1)).toMatchObject({ role: 'user', content: 'tweak it' });
  const notice = sent.at(-2);
  expect(notice?.role).toBe('user');
  expect(notice?.content).toContain(
    'The user manually edited the artifact. The current artifact is:',
  );
  expect(notice?.content).toContain('```yaml artifact\nedited: true\n```');

  // The request context is exactly the persisted message history.
  const dump = await exportDump(page);
  const persisted = dump.units[0]?.messages ?? [];
  expect(sent.map((m) => [m.role, m.content])).toEqual(
    persisted.slice(0, sent.length).map((m) => [m.role, m.content]),
  );
  expect(persisted.at(-3)?.kind).toBe('editNotice');
  expect(persisted.at(-3)?.artifactVersion).toBe(2);
});

test('[G3] the transcript collapses the notice to a chip, no raw artifact dump', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await editAndSave(page, 'edited: true\n');
  llm.respondWith({ chunks: [{ content: 'Understood.' }] });
  await send(page, 'tweak it');
  await expect(transcript(page)).toContainText('Understood.');

  await expect(transcript(page)).toContainText('You edited → revision 2');
  await expect(transcript(page)).not.toContainText('edited: true');
  await expect(transcript(page)).not.toContainText('```yaml artifact');
});

test('[G3] no manual save, no notice', async ({ page }) => {
  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'Hi.' }] });
  await send(page, 'hello');
  await expect(transcript(page)).toContainText('Hi.');

  const sent = completionMessages(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ role: 'user', content: 'hello' });
  await expect(transcript(page)).not.toContainText('You edited');
});

test('[G3] the chip survives a reload — persisted kind drives the display', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await editAndSave(page, 'edited: true\n');
  llm.respondWith({ chunks: [{ content: 'Understood.' }] });
  await send(page, 'tweak it');
  await expect(transcript(page)).toContainText('Understood.');

  await page.reload();
  await page.getByRole('button', { name: 'thread' }).click();
  await expect(transcript(page)).toContainText('You edited → revision 2');
  await expect(transcript(page)).not.toContainText('```yaml artifact');
});
