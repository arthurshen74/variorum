/**
 * [G3] Acceptance for DESIGN.md "Revision History & Restore", the
 * parse-failure affordance: the banner appears only when the latest
 * SAVED revision fails the applicable extension's validates hook, offers
 * a one-click restore of the newest revision that parses, survives tab
 * switches, and never triggers on drafts or hook-less units.
 *
 * Locator contract the implementation must meet: the banner carries the
 * text "The latest revision doesn't parse"; its action is a button named
 * "Restore last valid revision", absent when no revision validates.
 * React Flow's `.react-flow__node` marks graph nodes (as in
 * linkml-graph.spec.ts).
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

const SCHEMA = `id: https://example.org/pets
name: pets
classes:
  Person:
    attributes:
      name:
        range: string
`;

const BROKEN = 'a: b: c';

const banner = (page: Page) =>
  page.getByText("The latest revision doesn't parse");
const restoreButton = (page: Page) =>
  page.getByRole('button', { name: 'Restore last valid revision' });
const personNode = (page: Page) =>
  page.locator('.react-flow__node', { hasText: 'Person' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
});

/** Seeds a link-ml unit; contents become revisions v1, v2, ... */
async function seedLinkmlUnit(page: Page, contents: string[]): Promise<string> {
  const unitId = await page.evaluate(
    async (revisions) => {
      const { repository } = (window as unknown as DevWindow).variorum;
      await repository.createConfiguration(
        { name: 'link-ml', artifactType: 'yaml' },
        { modelName: 'mock-model', systemPrompt: 'You produce LinkML.' },
      );
      const unit = await repository.createUnit('schema', 'link-ml');
      for (const content of revisions) {
        await repository.saveManualEdit(unit.id, content);
      }
      return unit.id;
    },
    contents,
  );
  await page.getByRole('button', { name: 'schema' }).click();
  return unitId;
}

test('[G3] a landed revision that fails validates shows the banner', async ({
  page,
}) => {
  const unitId = await seedLinkmlUnit(page, [SCHEMA]);
  await expect(personNode(page)).toBeVisible();
  await expect(banner(page)).toBeHidden();

  await page.evaluate(
    async ({ unitId, content }) => {
      const { repository } = (window as unknown as DevWindow).variorum;
      await repository.saveManualEdit(unitId, content);
    },
    { unitId, content: BROKEN },
  );
  await expect(banner(page)).toBeVisible();
  await expect(restoreButton(page)).toBeVisible();
});

test('[G3] the banner action restores the newest revision that parses and the graph returns', async ({
  page,
}) => {
  await seedLinkmlUnit(page, [SCHEMA, BROKEN]);
  await expect(banner(page)).toBeVisible();

  await restoreButton(page).click();
  await expect(personNode(page)).toBeVisible();
  await expect(banner(page)).toBeHidden();
});

test('[G3] the banner persists across a switch to the Editor tab', async ({
  page,
}) => {
  await seedLinkmlUnit(page, [SCHEMA, BROKEN]);
  await expect(banner(page)).toBeVisible();

  await page.getByRole('button', { name: 'Editor' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(banner(page)).toBeVisible();
});

test('[G3] a broken draft alone never shows the banner', async ({ page }) => {
  await seedLinkmlUnit(page, [SCHEMA]);
  await expect(personNode(page)).toBeVisible();

  await page.getByRole('button', { name: 'Editor' }).click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(BROKEN);
  await expect(page.getByText('unsaved')).toBeVisible();

  await expect(banner(page)).toBeHidden();
});

test('[G3] when no revision validates the banner offers no action', async ({
  page,
}) => {
  await seedLinkmlUnit(page, [BROKEN]);
  await expect(banner(page)).toBeVisible();
  await expect(restoreButton(page)).toBeHidden();
});

test('[G3] a unit without a validates extension never shows the banner', async ({
  page,
}) => {
  await page.evaluate(async (content) => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'notes', artifactType: 'markdown' },
      { modelName: 'mock-model', systemPrompt: 'Notes.' },
    );
    const unit = await repository.createUnit('plain', 'notes');
    await repository.saveManualEdit(unit.id, content);
  }, BROKEN);
  await page.getByRole('button', { name: 'plain' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(banner(page)).toBeHidden();
});
