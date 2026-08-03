/**
 * [G5] Acceptance for the keep-or-take prompt (DESIGN.md "Chat" step 5,
 * "Extensions"): an LLM revision landing while the working copy is dirty
 * prompts the human; the revision is captured unconditionally either
 * way. Revisions land through the repository dev handle — the same
 * completeExchange call the chat layer makes.
 *
 * Locator contract: the prompt is a dialog offering "Keep my edit" and
 * "Take new revision".
 */
import { expect, test, type Page } from '@playwright/test';

interface Dump {
  units: { artifacts: { version: number; content: string }[] }[];
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

async function seedUnit(page: Page): Promise<string> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
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

const editor = (page: Page) => page.locator('.cm-content');

async function dirtyTheWorkingCopy(page: Page) {
  await editor(page).click();
  await page.keyboard.type('# my local edit\n');
  await expect(page.getByText('unsaved')).toBeVisible();
}

test('[G5] a revision landing on a dirty working copy prompts; the revision is captured regardless', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await expect(editor(page)).toContainText('a: 1');

  await dirtyTheWorkingCopy(page);
  await landRevision(page, unitId, 'b: 2\n');

  const prompt = page.getByRole('dialog');
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole('button', { name: 'Keep my edit' }),
  ).toBeVisible();
  await expect(
    prompt.getByRole('button', { name: 'Take new revision' }),
  ).toBeVisible();
  const dump = await exportDump(page);
  expect(dump.units[0]?.artifacts.map((a) => a.version)).toEqual([1, 2]);
});

test('[G5] Take new revision replaces the working copy', async ({ page }) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await expect(editor(page)).toContainText('a: 1');
  await dirtyTheWorkingCopy(page);
  await landRevision(page, unitId, 'b: 2\n');

  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Take new revision' })
    .click();
  await expect(editor(page)).toContainText('b: 2');
  await expect(editor(page)).not.toContainText('my local edit');
  await expect(page.getByText('unsaved')).toBeHidden();
});

test('[G5] Keep my edit leaves the working copy dirty against the new latest', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await expect(editor(page)).toContainText('a: 1');
  await dirtyTheWorkingCopy(page);
  await landRevision(page, unitId, 'b: 2\n');

  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Keep my edit' })
    .click();
  await expect(editor(page)).toContainText('my local edit');
  await expect(editor(page)).not.toContainText('b: 2');
  await expect(page.getByText('unsaved')).toBeVisible();
});

test('[G5] a revision landing on a clean working copy follows silently', async ({
  page,
}) => {
  const unitId = await seedUnit(page);
  await landRevision(page, unitId, 'a: 1\n');
  await expect(editor(page)).toContainText('a: 1');

  await landRevision(page, unitId, 'b: 2\n');
  await expect(editor(page)).toContainText('b: 2');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('unsaved')).toBeHidden();
});
