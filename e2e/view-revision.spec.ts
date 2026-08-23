/**
 * [G1] Acceptance for DESIGN.md "Revision History & Restore" — the View
 * half: View seats a revision in the editable buffer, the chip is
 * version-aware, Save after View mints forward, and unsaved edits are
 * guarded by the one confirmation in the history surface.
 *
 * Locator contract the implementation must meet: each History listitem
 * has a button named "View", enabled on every row including the latest;
 * the pane's chip is the text "viewing vN" while a viewed revision sits
 * untouched, "unsaved" after the first edit; the discard confirmation is
 * a dialog containing "Discard unsaved edits?" with buttons named
 * "Discard and view" and "Cancel".
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

async function viewRevision(page: Page, designator: string) {
  const dialog = await openHistory(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: designator })
    .getByRole('button', { name: 'View' })
    .click();
  return dialog;
}

test('[G1] View seats an old revision', async ({ page }) => {
  await seedNotesUnit(page);
  const dialog = await viewRevision(page, 'v1');
  await expect(dialog).toBeHidden();

  await expect(page.locator('.cm-content')).toContainText('one');
  await expect(page.getByText('viewing v1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('[G1] first edit demotes the chip', async ({ page }) => {
  await seedNotesUnit(page);
  await viewRevision(page, 'v1');
  await expect(page.getByText('viewing v1')).toBeVisible();

  await page.locator('.cm-content').click();
  await page.keyboard.type('x');

  await expect(page.getByText('viewing v1')).toBeHidden();
  await expect(page.getByText('unsaved')).toBeVisible();
});

test('[G1] View then Save mints a new revision', async ({ page }) => {
  await seedNotesUnit(page);
  await viewRevision(page, 'v1');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.cm-content')).toContainText('one');
  await expect(page.getByText('viewing v1')).toBeHidden();
  await expect(page.getByText('unsaved')).toBeHidden();

  const dialog = await openHistory(page);
  const rows = dialog.getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('v4');
  await expect(rows.nth(0)).toContainText('manual');
  await expect(rows.nth(3)).toContainText('v1');
});

test('[G1] dirty-edit guard: cancel keeps the edits', async ({ page }) => {
  await seedNotesUnit(page);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('my own edit ');
  await expect(page.getByText('unsaved')).toBeVisible();

  await viewRevision(page, 'v1');
  await expect(page.getByText('Discard unsaved edits?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(editor).toContainText('my own edit');
  await expect(page.getByText('unsaved')).toBeVisible();
});

test('[G1] dirty-edit guard: discard seats the view', async ({ page }) => {
  await seedNotesUnit(page);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('my own edit ');
  await expect(page.getByText('unsaved')).toBeVisible();

  await viewRevision(page, 'v1');
  await expect(page.getByText('Discard unsaved edits?')).toBeVisible();
  await page.getByRole('button', { name: 'Discard and view' }).click();

  await expect(editor).toContainText('one');
  await expect(editor).not.toContainText('my own edit');
  await expect(page.getByText('viewing v1')).toBeVisible();
});

test('[G1] view-on-top-of-view skips the confirm', async ({ page }) => {
  await seedNotesUnit(page);
  await viewRevision(page, 'v2');
  await expect(page.getByText('viewing v2')).toBeVisible();

  await viewRevision(page, 'v1');

  await expect(page.locator('.cm-content')).toContainText('one');
  await expect(page.getByText('viewing v1')).toBeVisible();
  await expect(page.getByText('Discard unsaved edits?')).toBeHidden();
});

test('[G1] latest row: View enabled, Restore disabled', async ({ page }) => {
  await seedNotesUnit(page);
  const dialog = await openHistory(page);
  const latestRow = dialog.getByRole('listitem').filter({ hasText: 'v3' });
  await expect(latestRow.getByRole('button', { name: 'View' })).toBeEnabled();
  await expect(
    latestRow.getByRole('button', { name: 'Restore' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await viewRevision(page, 'v1');
  await expect(page.getByText('viewing v1')).toBeVisible();

  await viewRevision(page, 'v3');
  await expect(page.locator('.cm-content')).toContainText('three');
  await expect(page.getByText('viewing v3')).toBeVisible();
});
