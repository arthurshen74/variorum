/**
 * [G3] Acceptance for DESIGN.md "LinkML Graph Viewer": the Graph tab as
 * linkml default, class/edge rendering, the parse error replacing the
 * canvas, position persistence, never-dirties, and auto-arrange.
 *
 * Locator contract the implementation must meet: tab buttons carry their
 * titles ("Graph", "Editor"); React Flow's `.react-flow__node` class
 * marks nodes (its public DOM contract); the error pane is headed "This
 * artifact isn't valid YAML"; the arrange control is a button named
 * "Auto-arrange"; the pane's dirty marker is the text "unsaved" beside a
 * "Save" button (ArtifactPane's existing contract).
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
      pets:
        range: Dog
        multivalued: true
  Dog:
    attributes:
      nickname:
        range: string
`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
});

/** Seeds a linkml configuration + unit with SCHEMA saved, selects it. */
async function seedLinkmlUnit(page: Page, name = 'schema'): Promise<string> {
  const unitId = await page.evaluate(
    async ({ name, content }) => {
      const { repository } = (window as unknown as DevWindow).variorum;
      await repository.createConfiguration(
        { name: 'link-ml', artifactType: 'yaml' },
        { modelName: 'mock-model', systemPrompt: 'You produce LinkML.' },
      );
      const unit = await repository.createUnit(name, 'link-ml');
      await repository.saveManualEdit(unit.id, content);
      return unit.id;
    },
    { name, content: SCHEMA },
  );
  await page.getByRole('button', { name }).click();
  return unitId;
}

const personNode = (page: Page) =>
  page.locator('.react-flow__node', { hasText: 'Person' });

async function dragBy(page: Page, dx: number, dy: number) {
  const box = await personNode(page).boundingBox();
  if (box === null) throw new Error('Person node not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 12 + dy, {
    steps: 8,
  });
  await page.mouse.up();
}

test('[G3] a linkml unit opens on the Graph tab; a non-linkml unit has no Graph tab', async ({
  page,
}) => {
  await seedLinkmlUnit(page);
  await expect(page.getByRole('button', { name: 'Graph' })).toBeVisible();
  // Default tab: graph content renders without clicking anything.
  await expect(personNode(page)).toBeVisible();

  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'notes', artifactType: 'markdown' },
      { modelName: 'mock-model', systemPrompt: 'Notes.' },
    );
    await repository.createUnit('plain', 'notes');
  });
  await page.getByRole('button', { name: 'plain' }).click();
  await expect(page.getByRole('button', { name: 'Graph' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Editor' })).toBeVisible();
});

test('[G3] classes render as nodes with slot rows; a class-range slot is an edge with its cardinality', async ({
  page,
}) => {
  await seedLinkmlUnit(page);
  await expect(personNode(page)).toBeVisible();
  await expect(personNode(page)).toContainText('name');
  await expect(personNode(page)).toContainText('string');
  await expect(
    page.locator('.react-flow__node', { hasText: 'Dog' }),
  ).toBeVisible();
  // The relationship edge carries its derived cardinality as a label.
  await expect(page.getByText('0..*')).toBeVisible();
  // pets is an edge, not a row inside the Person node.
  await expect(personNode(page)).not.toContainText('pets');
});

test('[G3] breaking the YAML in the Editor replaces the graph with a parse error', async ({
  page,
}) => {
  await seedLinkmlUnit(page);
  await expect(personNode(page)).toBeVisible();

  await page.getByRole('button', { name: 'Editor' }).click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  // Broken through the editor's bracket auto-closing, which would turn a
  // typed `{` into a perfectly valid `{}`.
  await page.keyboard.type('a: b: c');

  await page.getByRole('button', { name: 'Graph' }).click();
  await expect(
    page.getByText("This artifact isn't valid YAML"),
  ).toBeVisible();
  await expect(personNode(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Auto-arrange' })).toBeHidden();
});

test('[G3] a dragged position survives a reload', async ({ page }) => {
  const unitId = await seedLinkmlUnit(page);
  await expect(personNode(page)).toBeVisible();

  await dragBy(page, 160, 90);
  const stored = await page.evaluate(
    (id) => localStorage.getItem(`variorum.ext.linkml-graph.${id}`),
    unitId,
  );
  expect(stored).not.toBeNull();
  const box = await personNode(page).boundingBox();

  await page.reload();
  await page.getByRole('button', { name: 'schema' }).click();
  await expect(personNode(page)).toBeVisible();
  const after = await personNode(page).boundingBox();
  expect(Math.abs((after?.x ?? 0) - (box?.x ?? 0))).toBeLessThan(5);
  expect(Math.abs((after?.y ?? 0) - (box?.y ?? 0))).toBeLessThan(5);
});

test('[G3] dragging never dirties the working copy', async ({ page }) => {
  await seedLinkmlUnit(page);
  await expect(personNode(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await dragBy(page, 120, 60);
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(page.getByText('unsaved')).toBeHidden();
});

test('[G3] auto-arrange repositions nodes and overwrites saved positions', async ({
  page,
}) => {
  const unitId = await seedLinkmlUnit(page);
  await expect(personNode(page)).toBeVisible();

  await dragBy(page, 240, 140);
  const dragged = await personNode(page).boundingBox();

  await page.getByRole('button', { name: 'Auto-arrange' }).click();
  await expect
    .poll(async () => {
      const box = await personNode(page).boundingBox();
      return (
        Math.abs((box?.x ?? 0) - (dragged?.x ?? 0)) +
        Math.abs((box?.y ?? 0) - (dragged?.y ?? 0))
      );
    })
    .toBeGreaterThan(20);

  const stored = await page.evaluate(
    (id) => localStorage.getItem(`variorum.ext.linkml-graph.${id}`),
    unitId,
  );
  expect(stored).not.toBeNull();
});
