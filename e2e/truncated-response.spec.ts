/**
 * [G1] Acceptance for DESIGN.md "Truncation discards, too": a response the
 * server cut short is a failed request. Nothing from it is persisted — no
 * assistant message, no artifact revision — even when the partial text
 * carries a COMPLETE artifact fence, which is exactly the shape that would
 * otherwise mint a revision from output the model never finished.
 *
 * Locator contract: the error row is the alert carrying the truncation
 * message, with a "Retry" button; everything else follows chat.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

// Spelled here, not imported: e2e runs under its own tsconfig, and
// importing src drags it into that project. The source of truth is
// TRUNCATED_RESPONSE_MESSAGE in src/llm/chat-transport.ts.
const TRUNCATED_TEXT = "cut short by the server's limits";

interface Dump {
  units: {
    id: string;
    messages: { role: string; content: string }[];
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

// A complete fence: the extractor would lift this and mint a revision.
const CLOSED_FENCE = '```yaml artifact\nname: cut-short\n```\n';

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

async function seedUnit(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'mock-model', systemPrompt: 'You produce YAML.' },
    );
    await repository.createUnit('thread', 'linkml');
  });
  await page.getByRole('button', { name: 'thread' }).click();
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
const errorRow = (page: Page) => page.getByRole('alert');

test('[G1] a truncated response mints no revision and persists nothing', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [{ content: `Here you go:\n\n${CLOSED_FENCE}` }],
    finishReason: 'length',
  });
  await send(page, 'write me a schema');

  await expect(errorRow(page)).toContainText(TRUNCATED_TEXT);

  // The partial leaves the display, so the screen never disagrees with
  // the record.
  await expect(transcript(page)).not.toContainText('Here you go');
  await expect(transcript(page)).not.toContainText('cut-short');
  await expect(transcript(page)).toContainText('write me a schema');

  const dump = await exportDump(page);
  const unit = dump.units[0];
  expect(unit?.artifacts).toEqual([]);
  expect(unit?.messages.map((m) => m.role)).toEqual(['user']);
  expect(unit?.messages[0]?.content).toBe('write me a schema');
});

test('[G1] Retry after truncation re-sends without duplicating the user message', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith(
    { chunks: [{ content: 'half a thou' }], finishReason: 'length' },
    { chunks: [{ content: 'All done.' }] },
  );
  await send(page, 'write me a schema');
  await expect(errorRow(page)).toContainText(TRUNCATED_TEXT);

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(transcript(page)).toContainText('All done.');

  expect(llm.requests).toHaveLength(2);
  const dump = await exportDump(page);
  const messages = dump.units[0]?.messages ?? [];
  expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(messages[0]?.content).toBe('write me a schema');
});
