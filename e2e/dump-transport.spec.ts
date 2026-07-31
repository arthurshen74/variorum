/**
 * Acceptance for DESIGN.md "The Dump Is a File" — the transport half, in real
 * Chromium, because a download event and a file chooser are the only honest
 * proof that a dump reached disk and came back. Driven through the
 * window.variorum dev handle (there is no dialog layer yet). Structural types
 * are declared locally because the e2e project has no alias into src/.
 *
 * NOT covered here, deliberately: the showSaveFilePicker success path, which
 * Playwright cannot drive. Only its absent-API fallback is asserted.
 */
import { readFile } from 'node:fs/promises';
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

interface Report {
  unitsAdded: string[];
  skippedIdentical: number;
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
  importDatabase(dump: Dump): Promise<Report>;
  replaceDatabase(
    dump: Dump,
    deliverBackup: (backup: Dump) => Promise<void>,
  ): Promise<Dump>;
}

type DevWindow = {
  variorum: {
    repository: DevRepository;
    deliverExport(dump: Dump): Promise<void>;
    deliverBackup(backup: Dump): Promise<void>;
    readDumpFile(): Promise<Dump | null>;
  };
};

const OTHER_WORLD: Dump = {
  schemaVersion: 1,
  configurations: [{ name: 'other', artifactType: 'yaml', archived: false }],
  configurationVersions: [
    { name: 'other', version: 1, modelName: 'test-model', systemPrompt: 'v1' },
  ],
  units: [],
};

/** Seed one configuration and one unit so the database is non-empty. */
const seed = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Variorum' })).toBeVisible();
  await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.createConfiguration(
      { name: 'linkml', artifactType: 'yaml' },
      { modelName: 'test-model', systemPrompt: 'v1' },
    );
    await repository.createUnit('seeded thread', 'linkml');
  });
};

test('[G3] replace downloads the pre-replace backup under its own name', async ({
  page,
}) => {
  await seed(page);

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async (dump) => {
    const { repository, deliverBackup } = (window as unknown as DevWindow)
      .variorum;
    await repository.replaceDatabase(dump, deliverBackup);
  }, OTHER_WORLD);
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^variorum-pre-replace-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
  );
});

test('[G3] the downloaded backup restores the pre-replace database', async ({
  page,
}) => {
  await seed(page);

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async (dump) => {
    const { repository, deliverBackup } = (window as unknown as DevWindow)
      .variorum;
    await repository.replaceDatabase(dump, deliverBackup);
  }, OTHER_WORLD);
  const download = await downloadPromise;

  const path = await download.path();
  const text = await readFile(path, 'utf8');
  const backup = JSON.parse(text) as Dump;

  const restored = await page.evaluate(async (b) => {
    const { repository } = (window as unknown as DevWindow).variorum;
    await repository.replaceDatabase(b, async () => {});
    return repository.exportDatabase(async () => {});
  }, backup);

  expect(restored.configurations.map((c) => c.name)).toEqual(['linkml']);
  expect(restored.units.map((u) => u.conversationName)).toEqual([
    'seeded thread',
  ]);
});

test('[G3] export downloads a pretty-printed dump under a dated name', async ({
  page,
}) => {
  await seed(page);

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { repository, deliverExport } = (window as unknown as DevWindow)
      .variorum;
    await repository.exportDatabase(deliverExport);
  });
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^variorum-\d{4}-\d{2}-\d{2}-\d{4}\.json$/,
  );

  const text = await readFile(await download.path(), 'utf8');
  expect(text).toContain('\n  "schemaVersion"');
  expect(JSON.parse(text)).toMatchObject({ schemaVersion: 1 });
});

test('[G3] export falls back to an anchor download when the save picker is absent', async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });
  await seed(page);

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { repository, deliverExport } = (window as unknown as DevWindow)
      .variorum;
    await repository.exportDatabase(deliverExport);
  });
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^variorum-.*\.json$/);
});

test('[G3] a dump chosen from the file input merges into the database', async ({
  page,
}) => {
  await seed(page);

  const incoming: Dump = {
    schemaVersion: 1,
    configurations: [{ name: 'from-file', artifactType: 'yaml', archived: false }],
    configurationVersions: [
      {
        name: 'from-file',
        version: 1,
        modelName: 'test-model',
        systemPrompt: 'v1',
      },
    ],
    units: [
      {
        id: 'file-u1',
        conversationName: 'thread from a file',
        configName: 'from-file',
        createdAt: '2026-01-01T00:00:00.000Z',
        archived: false,
        messages: [],
        artifacts: [],
      },
    ],
  };

  const chooserPromise = page.waitForEvent('filechooser');
  const reportPromise = page.evaluate(async () => {
    const { repository, readDumpFile } = (window as unknown as DevWindow)
      .variorum;
    const dump = await readDumpFile();
    if (dump === null) return null;
    return repository.importDatabase(dump);
  });
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'variorum-2026-01-01-0000.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming, null, 2), 'utf8'),
  });

  const report = await reportPromise;
  expect(report?.unitsAdded).toEqual(['file-u1']);

  const after = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
  expect(after.configurations.map((c) => c.name).sort()).toEqual([
    'from-file',
    'linkml',
  ]);
});

test('[G3] a malformed file is rejected and the database is unchanged', async ({
  page,
}) => {
  await seed(page);

  const before = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });

  const chooserPromise = page.waitForEvent('filechooser');
  const outcomePromise = page.evaluate(async () => {
    const { readDumpFile } = (window as unknown as DevWindow).variorum;
    try {
      await readDumpFile();
      return 'accepted';
    } catch (error) {
      return `rejected: ${(error as Error).message}`;
    }
  });
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ "schemaVersion": 1, "units": "not an array" }', 'utf8'),
  });

  expect(await outcomePromise).toMatch(/^rejected:/);

  const after = await page.evaluate(async () => {
    const { repository } = (window as unknown as DevWindow).variorum;
    return repository.exportDatabase(async () => {});
  });
  expect(after).toEqual(before);
});
