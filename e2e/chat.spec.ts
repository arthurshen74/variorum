/**
 * [G4] Acceptance for DESIGN.md "Chat": streaming, chain-of-thought,
 * cancel-discards, post-hoc extraction with the artifact chip, the
 * version badge, and the error row — driven through the real UI against
 * a scripted SSE endpoint (mock-llm.ts) at the network boundary.
 *
 * Locator contract the implementation must meet: the transcript is a
 * `log` role; the waiting animation a `status` role; the composer field
 * is labelled "Message" with buttons "Send" / "Stop"; the reasoning
 * block's trigger is a button named "Reasoning" carrying aria-expanded;
 * request failures surface an `alert` role with a "Retry" button.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

interface DumpMessage {
  role: string;
  configVersion: number;
  reasoning?: string;
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
  exportDatabase(deliver: (dump: Dump) => Promise<void>): Promise<Dump>;
}

type DevWindow = { variorum: { repository: DevRepository } };

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

async function seedUnit(page: Page, conversationName = 'thread') {
  await page.evaluate(
    async (name) => {
      const { repository } = (window as unknown as DevWindow).variorum;
      await repository.createConfiguration(
        { name: 'linkml', artifactType: 'yaml' },
        { modelName: 'mock-model', systemPrompt: 'You produce YAML.' },
      );
      await repository.createUnit(name, 'linkml');
    },
    conversationName,
  );
  await page.getByRole('button', { name: conversationName }).click();
}

async function addUnit(page: Page, conversationName: string) {
  await page.evaluate(async (name) => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createUnit(name, 'linkml');
  }, conversationName);
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

test('[G4] the loader animates between send and first token', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'Hi there.', delayMs: 1200 }] });
  await send(page, 'hello');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(transcript(page)).toContainText('Hi there.');
  await expect(page.getByRole('status')).toBeHidden();
});

test('[G4] text streams incrementally — partial text is visible before the stream closes', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'Hello ' }], holdOpen: true });
  await send(page, 'hello');
  await expect(transcript(page)).toContainText('Hello');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  llm.release([{ content: 'world.' }]);
  await expect(transcript(page)).toContainText('Hello world.');
});

test('[G4] reasoning streams into the block open, and collapses on finish', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [{ reasoning: 'thinking about yaml' }],
    holdOpen: true,
  });
  await send(page, 'hello');
  const trigger = page.getByRole('button', { name: /reasoning/i });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(transcript(page)).toContainText('thinking about yaml');
  llm.release([{ content: 'Answer.' }]);
  await expect(transcript(page)).toContainText('Answer.');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('[G4] the assistant message shows its configuration version tag', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'Tagged.' }] });
  await send(page, 'hello');
  await expect(transcript(page)).toContainText('Tagged.');
  await expect(transcript(page)).toContainText('linkml.1');
});

test('[G4] a matching fence lands a revision and collapses to the chip', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [{ content: 'Here:\n\n```yaml\na: 1\n```\n\nDone.' }],
  });
  await send(page, 'make it');

  await expect(transcript(page).getByText(/revision 1/)).toBeVisible();
  await expect(transcript(page)).not.toContainText('a: 1');
  await expect(page.locator('.cm-content')).toContainText('a: 1');
  const dump = await exportDump(page);
  expect(dump.units[0]?.artifacts).toHaveLength(1);
  expect(dump.units[0]?.artifacts[0]).toMatchObject({
    version: 1,
    source: 'llm',
  });
});

test('[G4] a byte-identical fence shows the unchanged chip and mints nothing', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [{ content: 'First:\n```yaml\na: 1\n```\n' }],
  });
  await send(page, 'make it');
  await expect(transcript(page).getByText(/revision 1/)).toBeVisible();

  llm.respondWith({
    chunks: [{ content: 'Same again:\n```yaml\na: 1\n```\n' }],
  });
  await send(page, 'repeat it');
  await expect(transcript(page).getByText(/unchanged/i)).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.units[0]?.artifacts).toHaveLength(1);
});

test('[G4] a response with no matching fence shows no chip and mints nothing', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ chunks: [{ content: 'No changes needed.' }] });
  await send(page, 'thoughts?');
  await expect(transcript(page)).toContainText('No changes needed.');
  await expect(transcript(page).getByText(/revision|unchanged/i)).toHaveCount(
    0,
  );
  const dump = await exportDump(page);
  expect(dump.units[0]?.artifacts).toHaveLength(0);
});

test('[G4] cancel discards the partial: display and record both drop it', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [{ content: 'PARTIAL-WORDS ' }],
    holdOpen: true,
  });
  await send(page, 'hello');
  await expect(transcript(page)).toContainText('PARTIAL-WORDS');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(transcript(page)).not.toContainText('PARTIAL-WORDS');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  await page.getByRole('button', { name: 'thread' }).click();
  await expect(transcript(page)).toContainText('hello');
  await expect(transcript(page)).not.toContainText('PARTIAL-WORDS');
  const dump = await exportDump(page);
  expect(dump.units[0]?.messages.map((m) => m.role)).toEqual(['user']);
  expect(dump.units[0]?.artifacts).toHaveLength(0);
});

test('[G4] switching units mid-stream cancels with the same discard semantics', async ({
  page,
}) => {
  await seedUnit(page, 'thread-a');
  await addUnit(page, 'thread-b');
  llm.respondWith({
    chunks: [{ content: 'PARTIAL-WORDS ' }],
    holdOpen: true,
  });
  await send(page, 'hello');
  await expect(transcript(page)).toContainText('PARTIAL-WORDS');

  await page.getByRole('button', { name: 'thread-b' }).click();
  await expect(transcript(page)).not.toContainText('PARTIAL-WORDS');
  await page.getByRole('button', { name: 'thread-a' }).click();
  await expect(transcript(page)).not.toContainText('PARTIAL-WORDS');

  await expect
    .poll(async () => {
      const dump = await exportDump(page);
      return dump.units.map((u) => u.messages.length);
    })
    .toEqual([1, 0]);
});

test('[G4] a failed request shows the error row; Retry re-sends without duplicating the user message', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({ status: 500 }, { chunks: [{ content: 'Recovered.' }] });
  await send(page, 'hello');
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(transcript(page)).toContainText('Recovered.');
  const dump = await exportDump(page);
  expect(dump.units[0]?.messages.map((m) => m.role)).toEqual([
    'user',
    'assistant',
  ]);
});

test('[G4] persisted reasoning survives reload, collapsed', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [{ reasoning: 'deep thought' }, { content: 'Answer.' }],
  });
  await send(page, 'hello');
  await expect(transcript(page)).toContainText('Answer.');
  await expect
    .poll(async () => (await exportDump(page)).units[0]?.messages.length)
    .toBe(2);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  await page.getByRole('button', { name: 'thread' }).click();
  const trigger = page.getByRole('button', { name: /reasoning/i });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(transcript(page)).toContainText('deep thought');
  const dump = await exportDump(page);
  expect(dump.units[0]?.messages[1]?.reasoning).toBe('deep thought');
});
