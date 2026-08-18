/**
 * [G1] Acceptance for DESIGN.md "Chat" — "Response chrome is
 * Streamdown's, made functional — copy yes, download no": copy controls
 * on code fences, mermaid blocks, and tables put the content on the
 * clipboard; mermaid fullscreen opens and closes; download buttons are
 * gone from all three surfaces; the lifted artifact fence carries no
 * controls at all (it collapsed to the chip).
 *
 * Locator contract: Streamdown's data attributes and accessible names —
 * code blocks are `[data-streamdown="code-block"]` with a
 * `code-block-copy-button` / `code-block-download-button`; mermaid
 * blocks are `[data-streamdown="mermaid-block"]` with buttons "Copy
 * Code", "Download diagram", "View fullscreen" / "Exit fullscreen";
 * tables are `[data-streamdown="table-wrapper"]` with buttons "Copy
 * table" and "Download table".
 *
 * Every scripted response ends with trailing prose: an open dropdown is
 * absolutely positioned and adds no scroll height, so a block at the
 * very bottom of the conversation scroller would have its menu clipped.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

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

const TRAILING = 'Trailing prose so menus have room below. '.repeat(30);

let llm: MockLlm;

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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

async function seedUnit(page: Page) {
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

async function respondAndSend(page: Page, content: string) {
  llm.respondWith({ chunks: [{ content }] });
  await page.getByLabel('Message').fill('go');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('log')).toContainText(
    'Trailing prose so menus have room below.',
  );
}

function readClipboard(page: Page) {
  return page.evaluate(() =>
    navigator.clipboard.readText().catch(() => 'CLIPBOARD-READ-FAILED'),
  );
}

const PYTHON_FENCE = 'A helper:\n\n```python\nprint("hi")\n```\n\n';
const MERMAID_FENCE = 'A diagram:\n\n```mermaid\ngraph TD\nA-->B\n```\n\n';
const TABLE = 'A table:\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n';

test('[G1] copy on a non-artifact code fence puts the fence body on the clipboard', async ({
  page,
}) => {
  await seedUnit(page);
  await respondAndSend(
    page,
    `${PYTHON_FENCE}The artifact:\n\n\`\`\`yaml\na: 1\n\`\`\`\n\n${TRAILING}`,
  );
  await expect(page.getByRole('log').getByText(/revision 1/)).toBeVisible();

  // One copy button: the python fence's. The lifted artifact fence
  // collapsed to the chip and carries no controls.
  const copyButtons = page.locator(
    '[data-streamdown="code-block-copy-button"]',
  );
  await expect(copyButtons).toHaveCount(1);
  await copyButtons.click({ timeout: 5000 });
  await expect.poll(() => readClipboard(page)).toContain('print("hi")');
});

test('[G1] code fences render no download button', async ({ page }) => {
  await seedUnit(page);
  await respondAndSend(page, `${PYTHON_FENCE}${TRAILING}`);
  await expect(page.locator('[data-streamdown="code-block"]')).toBeVisible();
  await expect(
    page.locator('[data-streamdown="code-block-download-button"]'),
  ).toHaveCount(0);
});

test('[G1] mermaid copy puts the diagram source on the clipboard', async ({
  page,
}) => {
  await seedUnit(page);
  await respondAndSend(page, `${MERMAID_FENCE}${TRAILING}`);
  const block = page.locator('[data-streamdown="mermaid-block"]');
  await expect(block).toBeVisible();
  await block
    .getByRole('button', { name: 'Copy Code' })
    .click({ timeout: 5000 });
  await expect.poll(() => readClipboard(page)).toContain('graph TD');
});

test('[G1] mermaid blocks render no download button', async ({ page }) => {
  await seedUnit(page);
  await respondAndSend(page, `${MERMAID_FENCE}${TRAILING}`);
  const block = page.locator('[data-streamdown="mermaid-block"]');
  await expect(block).toBeVisible();
  await expect(
    block.getByRole('button', { name: 'Download diagram' }),
  ).toHaveCount(0);
});

test('[G1] mermaid fullscreen opens and Escape closes it', async ({ page }) => {
  await seedUnit(page);
  await respondAndSend(page, `${MERMAID_FENCE}${TRAILING}`);
  const block = page.locator('[data-streamdown="mermaid-block"]');
  await expect(block).toBeVisible();
  await block
    .getByRole('button', { name: 'View fullscreen' })
    .click({ timeout: 5000 });
  const exit = page.getByRole('button', { name: 'Exit fullscreen' });
  await expect(exit).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(exit).toHaveCount(0);
});

test('[G1] table copy as Markdown puts the pipe table on the clipboard', async ({
  page,
}) => {
  await seedUnit(page);
  await respondAndSend(page, `${TABLE}${TRAILING}`);
  await expect(page.locator('[data-streamdown="table-wrapper"]')).toBeVisible();
  await page
    .getByRole('button', { name: 'Copy table' })
    .click({ timeout: 5000 });
  await page
    .getByRole('button', { name: 'Markdown', exact: true })
    .click({ timeout: 5000 });
  await expect.poll(() => readClipboard(page)).toContain('| a | b |');
});

test('[G1] tables render no download button', async ({ page }) => {
  await seedUnit(page);
  await respondAndSend(page, `${TABLE}${TRAILING}`);
  await expect(page.locator('[data-streamdown="table-wrapper"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download table' })).toHaveCount(
    0,
  );
});
