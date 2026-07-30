/**
 * Acceptance for DESIGN.md "Import Is a Merge" — the two locked criteria,
 * driven through the window.variorum dev handle (there is no import/export
 * UI yet; the repository IS the surface under test). Structural types are
 * declared locally because the e2e project has no alias into src/; they are
 * type-only and erased before the callbacks are serialized into the page.
 */
import { expect, test } from '@playwright/test';

interface Dump {
  schemaVersion: number;
  configurations: { name: string }[];
  configurationVersions: {
    name: string;
    version: number;
    modelName: string;
    systemPrompt: string;
  }[];
  units: { id: string; configName: string; conversationName: string }[];
}

interface Report {
  configurationsAdded: string[];
  configurationsFastForwarded: { name: string; newVersions: number[] }[];
  lineagesRenamed: { from: string; to: string }[];
  unitsAdded: string[];
  unitsFastForwarded: string[];
  unitsKeptBoth: { originalId: string; cloneId: string }[];
  skippedIdentical: number;
}

interface DevRepository {
  createConfiguration(
    info: { name: string; artifactType: string },
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  saveConfigurationVersion(
    name: string,
    draft: { modelName: string; systemPrompt: string },
  ): Promise<unknown>;
  createUnit(conversationName: string, configName: string): Promise<{ id: string }>;
  exportDatabase(): Promise<Dump>;
  importDatabase(dump: Dump): Promise<Report>;
}

type DevWindow = { variorum: { repository: DevRepository } };

test('[G2] importing your own export changes nothing and reports everything skipped', async ({
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
    const before = await repository.exportDatabase();
    const report = await repository.importDatabase(before);
    const after = await repository.exportDatabase();
    return { before, report, after };
  });

  expect(result.after).toEqual(result.before);
  expect(result.report.skippedIdentical).toBe(2);
  expect(result.report.configurationsAdded).toEqual([]);
  expect(result.report.configurationsFastForwarded).toEqual([]);
  expect(result.report.lineagesRenamed).toEqual([]);
  expect(result.report.unitsAdded).toEqual([]);
  expect(result.report.unitsFastForwarded).toEqual([]);
  expect(result.report.unitsKeptBoth).toEqual([]);
});

test('[G2] a merged database survives reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();

  const report = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'test-model', systemPrompt: 'v1' },
    );
    await repository.createUnit('own thread', 'linkml');
    const dump = await repository.exportDatabase();
    // the "other machine": shares v1, then saved a DIFFERENT v2
    await repository.saveConfigurationVersion('linkml', {
      modelName: 'test-model',
      systemPrompt: 'local v2',
    });
    const incoming = structuredClone(dump);
    incoming.configurationVersions.push({
      name: 'linkml',
      version: 2,
      modelName: 'test-model',
      systemPrompt: 'incoming v2',
    });
    return repository.importDatabase(incoming);
  });

  expect(report.lineagesRenamed).toEqual([{ from: 'linkml', to: 'linkml~2' }]);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();

  const after = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase();
  });

  expect(after.configurations.map((c) => c.name).sort()).toEqual([
    'linkml',
    'linkml~2',
  ]);
  expect(
    after.configurationVersions
      .filter((v) => v.name === 'linkml~2')
      .map((v) => v.version)
      .sort((a, b) => a - b),
  ).toEqual([1, 2]);
  expect(
    after.configurationVersions.find(
      (v) => v.name === 'linkml~2' && v.version === 2,
    )?.systemPrompt,
  ).toBe('incoming v2');
});
