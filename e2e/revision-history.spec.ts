/**
 * [G2] Acceptance for DESIGN.md "Revision History & Restore": the History
 * dialog lists every revision newest first, restore mints forward, the
 * latest revision's restore is a disabled no-op, and a restore landing on
 * a dirty buffer raises the existing keep-or-take prompt.
 *
 * Locator contract the implementation must meet: the pane header has a
 * button named "History"; the dialog contains a list whose listitems each
 * carry the version designator ("v3"), a time containing ":", and the
 * source word ("manual" or "llm"); each listitem has a button named
 * "Restore", disabled on the latest revision; clicking Restore closes the
 * dialog. The collision prompt is ArtifactPane's existing "A new revision
 * landed" dialog.
 */
import { expect, test, type Page } from '@playwright/test';

interface DevRepository {
  createConfiguration(
    info: { name: string; artifactType: string },
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  createUnit(
    conversationName: string,
    configName: string,
  ): Promise<{ id: string }>;
  saveManualEdit(unitId: string, content: string): Promise<unknown>;
}

type DevWindow = { variorum: { repository: DevRepository } };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
});

/** Seeds a notes unit with three revisions: "one", "two", "three". */
async function seedNotesUnit(page: Page): Promise<string> {
  const unitId = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'notes', artifactType: 'markdown' },
      { modelName: 'mock-model', systemPrompt: 'Notes.' },
    );
    const unit = await repository.createUnit('draft', 'notes');
    await repository.saveManualEdit(unit.id, 'one');
    await repository.saveManualEdit(unit.id, 'two');
    await repository.saveManualEdit(unit.id, 'three');
    return unit.id;
  });
  await page.getByRole('button', { name: 'draft' }).click();
  return unitId;
}

async function openHistory(page: Page) {
  await page.getByRole('button', { name: 'History' }).click();
  return page.getByRole('dialog');
}

test('[G2] the History dialog lists revisions newest first with version, time, and source', async ({
  page,
}) => {
  await seedNotesUnit(page);
  const dialog = await openHistory(page);
  const rows = dialog.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('v3');
  await expect(rows.nth(1)).toContainText('v2');
  await expect(rows.nth(2)).toContainText('v1');
  await expect(rows.nth(0)).toContainText('manual');
  await expect(rows.nth(0)).toContainText(':');
});

test('[G2] Restore mints a new revision and a clean buffer follows it', async ({
  page,
}) => {
  await seedNotesUnit(page);
  let dialog = await openHistory(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'v1' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(dialog).toBeHidden();

  await expect(page.locator('.cm-content')).toContainText('one');
  await expect(page.getByText('unsaved')).toBeHidden();

  dialog = await openHistory(page);
  await expect(dialog.getByRole('listitem')).toHaveCount(4);
  await expect(dialog.getByRole('listitem').nth(0)).toContainText('v4');
});

test('[G2] a restored revision lists as source manual', async ({ page }) => {
  await seedNotesUnit(page);
  let dialog = await openHistory(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'v2' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(dialog).toBeHidden();

  dialog = await openHistory(page);
  await expect(dialog.getByRole('listitem').nth(0)).toContainText('v4');
  await expect(dialog.getByRole('listitem').nth(0)).toContainText('manual');
});

test('[G2] Restore is disabled on the latest revision', async ({ page }) => {
  await seedNotesUnit(page);
  const dialog = await openHistory(page);
  await expect(
    dialog
      .getByRole('listitem')
      .filter({ hasText: 'v3' })
      .getByRole('button', { name: 'Restore' }),
  ).toBeDisabled();
  await expect(
    dialog
      .getByRole('listitem')
      .filter({ hasText: 'v1' })
      .getByRole('button', { name: 'Restore' }),
  ).toBeEnabled();
});

test('[G2] restoring while the working copy is dirty raises the keep-or-take prompt', async ({
  page,
}) => {
  await seedNotesUnit(page);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('my own edit ');
  await expect(page.getByText('unsaved')).toBeVisible();

  const dialog = await openHistory(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'v1' })
    .getByRole('button', { name: 'Restore' })
    .click();

  await expect(page.getByText('A new revision landed')).toBeVisible();
});
