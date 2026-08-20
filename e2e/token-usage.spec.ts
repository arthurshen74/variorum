/**
 * [G3] Acceptance for DESIGN.md "Token usage display": the readout in the
 * exchange-state slot — a live ≈ estimate from streamed characters while
 * a response is in flight, the server's exact figures once it completes,
 * the carried-forward baseline on the next send, calibration written to
 * localStorage per model, nothing settled from a truncated response, and
 * nothing surviving a reload (session-ephemeral, never in the record).
 *
 * Locator contract: the readout is the element labeled "Token usage",
 * absent whenever there is nothing to show.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

// Spelled here, not imported (e2e runs under its own tsconfig). Sources
// of truth: TOKEN_RATIO_KEY_PREFIX and the display grammar in
// src/llm/token-usage.ts.
const RATIO_KEY = 'variorum.tokenRatio.mock-model';
const TRUNCATED_TEXT = "cut short by the server's limits";

interface DevRepository {
  createConfiguration(
    info: { name: string; artifactType: string },
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  createUnit(
    conversationName: string,
    configName: string,
  ): Promise<{ id: string }>;
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

async function send(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

const readout = (page: Page) => page.getByLabel('Token usage');

// 30 completion tokens: over the calibration floor.
const SETTLED = {
  chunks: [{ content: 'Sure, here is a long enough reply.' }],
  usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
};

test('[G3] while streaming, the readout estimates from streamed characters', async ({
  page,
}) => {
  await seedUnit(page);
  // 40 chars at the stock ratio of 4, no baseline yet: ≈10 tokens out.
  llm.respondWith({ chunks: [{ content: 'x'.repeat(40) }], holdOpen: true });
  await send(page, 'go');

  await expect(readout(page)).toHaveText('Tokens out: ≈10');
  llm.release();
});

test('[G3] on completion, the readout snaps to the server exact figures', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith(SETTLED);
  await send(page, 'go');

  await expect(readout(page)).toHaveText('130 tokens · 100 in + 30 out');
});

test('[G3] a completed exchange calibrates the model ratio in localStorage', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith(SETTLED);
  await send(page, 'go');
  await expect(readout(page)).toHaveText('130 tokens · 100 in + 30 out');

  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    RATIO_KEY,
  );
  expect(stored).not.toBeNull();
});

test('[G3] the next send carries the previous total forward as the baseline', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith(SETTLED, { chunks: [], holdOpen: true });
  await send(page, 'go');
  await expect(readout(page)).toHaveText('130 tokens · 100 in + 30 out');

  await send(page, 'again');
  await expect(readout(page)).toHaveText('Context Tokens: ≈130');
  llm.release();
});

test('[G3] a truncated response never settles the readout', async ({
  page,
}) => {
  await seedUnit(page);
  // The readout must be live BEFORE the cut, or this asserts a vacuous
  // absence. 27 chars at the stock ratio of 4: ≈7 tokens out.
  llm.respondWith({
    chunks: [{ content: 'half a thought here we go..' }],
    holdOpen: true,
    finishReason: 'length',
    usage: { prompt_tokens: 8000, completion_tokens: 191, total_tokens: 8191 },
  });
  await send(page, 'go');
  await expect(readout(page)).toHaveText('Tokens out: ≈7');

  llm.release();
  await expect(page.getByRole('alert')).toContainText(TRUNCATED_TEXT);
  await expect(readout(page)).toHaveCount(0);
});

test('[G3] the readout is session-ephemeral — a reload leaves the slot empty', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith(SETTLED);
  await send(page, 'go');
  await expect(readout(page)).toHaveText('130 tokens · 100 in + 30 out');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  await page.getByRole('button', { name: 'thread' }).click();
  await expect(
    page.getByText('Sure, here is a long enough reply.'),
  ).toBeVisible();
  await expect(readout(page)).toHaveCount(0);
});

test('[G3] a reply under the calibration floor leaves the ratio unchanged', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [{ content: 'ok.' }],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
  });
  await send(page, 'go');
  await expect(readout(page)).toHaveText('25 tokens · 20 in + 5 out');

  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    RATIO_KEY,
  );
  expect(stored).toBeNull();
});
