/**
 * Acceptance for DESIGN.md "Replace — the wholesale door" — the amended
 * deletion invariant: a true delete ships with its own mechanically
 * captured undo. Driven through the window.variorum dev handle (there is
 * no replace UI yet; the repository IS the surface under test). Structural
 * types are declared locally because the e2e project has no alias into
 * src/; they are type-only and erased before the callbacks are serialized
 * into the page.
 */
import { expect, test } from '@playwright/test';

interface Dump {
  schemaVersion: number;
  configurations: { name: string; artifactType: string; archived: boolean }[];
  configurationVersions: {
    name: string;
    version: number;
    modelName: string;
    systemPrompt: string;
  }[];
  units: {
    id: string;
    configName: string;
    conversationName: string;
    createdAt: string;
    archived: boolean;
    messages: unknown[];
    artifacts: unknown[];
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
  exportDatabase(): Promise<Dump>;
  replaceDatabase(dump: Dump): Promise<Dump>;
}

type DevWindow = { variorum: { repository: DevRepository } };

test('[G2] replace wipes wholesale, returns the pre-wipe backup, and the backup restores exactly', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();

  const result = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'test-model', systemPrompt: 'v1' },
    );
    await repository.createUnit('own thread', 'linkml');
    const worldA = await repository.exportDatabase();
    const dumpB: Dump = {
      schemaVersion: worldA.schemaVersion,
      configurations: [
        { name: 'other', artifactType: 'yaml', archived: false },
      ],
      configurationVersions: [
        {
          name: 'other',
          version: 1,
          modelName: 'test-model',
          systemPrompt: 'other v1',
        },
      ],
      units: [],
    };
    const backup = await repository.replaceDatabase(dumpB);
    const afterReplace = await repository.exportDatabase();
    await repository.replaceDatabase(backup);
    const afterUndo = await repository.exportDatabase();
    return { worldA, dumpB, backup, afterReplace, afterUndo };
  });

  expect(result.afterReplace).toEqual(result.dumpB);
  expect(result.backup).toEqual(result.worldA);
  expect(result.afterUndo).toEqual(result.worldA);
});

test('[G2] a replaced database survives reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();

  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'doomed', artifactType: 'yaml' },
      { modelName: 'test-model', systemPrompt: 'v1' },
    );
    await repository.createUnit('doomed thread', 'doomed');
    const dump = await repository.exportDatabase();
    const fresh: Dump = {
      schemaVersion: dump.schemaVersion,
      configurations: [{ name: 'fresh', artifactType: 'yaml', archived: false }],
      configurationVersions: [
        {
          name: 'fresh',
          version: 1,
          modelName: 'test-model',
          systemPrompt: 'fresh v1',
        },
      ],
      units: [
        {
          id: 'fresh-u1',
          conversationName: 'fresh thread',
          configName: 'fresh',
          createdAt: '2026-01-01T00:00:00.000Z',
          archived: false,
          messages: [],
          artifacts: [],
        },
      ],
    };
    await repository.replaceDatabase(fresh);
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();

  const after = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase();
  });

  expect(after.configurations.map((c) => c.name)).toEqual(['fresh']);
  expect(after.units.map((u) => u.id)).toEqual(['fresh-u1']);
});
