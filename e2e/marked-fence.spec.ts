/**
 * [G1] Acceptance for the marked-fence extraction rule (DESIGN.md
 * "Post-hoc extraction"): a response carrying the artifact in a marked
 * fence plus an unmarked example fence lifts the marked one — the
 * schema-then-example response that broke last-fence-wins.
 */
import { expect, test, type Page } from '@playwright/test';
import { MockLlm } from './mock-llm.ts';

interface Dump {
  units: { artifacts: { version: number; source: string; content: string }[] }[];
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

const transcript = (page: Page) => page.getByRole('log');
const editor = (page: Page) => page.locator('.cm-content');

test('[G1] the marked schema fence is lifted; the unmarked example stays prose', async ({
  page,
}) => {
  await seedUnit(page);
  llm.respondWith({
    chunks: [
      {
        content:
          'Schema:\n```yaml artifact\nclasses: {}\n```\n' +
          'Example:\n```yaml\nname: Ada\n```\nDone.',
      },
    ],
  });

  await page.getByLabel('Message').fill('make the schema');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(transcript(page)).toContainText('Done.');

  // The chip stands in for the marked fence; the example is an ordinary
  // code block still visible in the transcript.
  await expect(transcript(page)).toContainText('Artifact → revision 1');
  await expect(transcript(page)).toContainText('name: Ada');
  await expect(transcript(page)).not.toContainText('classes: {}');

  // The artifact pane holds the schema, not the example.
  await expect(editor(page)).toContainText('classes: {}');
  await expect(editor(page)).not.toContainText('name: Ada');

  const dump = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
  expect(dump.units[0]?.artifacts).toEqual([
    expect.objectContaining({
      version: 1,
      source: 'llm',
      content: 'classes: {}\n',
    }),
  ]);
});
