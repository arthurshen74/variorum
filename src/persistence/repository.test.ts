/**
 * Repository behavior against fake-indexeddb. The export dump's shape is
 * closed: exactly the three collections plus schemaVersion. Device state
 * (the theme preference, API keys) lives in localStorage and must never
 * ride along (DESIGN.md "Theming"). Export also owns half of prune's gate:
 * the dirty bit clears only once the dump has actually been delivered
 * (DESIGN.md "The Dump Is a File").
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { variorumStore } from '@/state/store';
import type { DatabaseDump } from '@/domain/types';

const deliveryOk = async (): Promise<void> => {};

const deliveryFails = async (): Promise<void> => {
  throw new Error('delivery refused');
};

it('export dump contains exactly the three collections and no theme field', async () => {
  await repository.boot();
  const dump = await repository.exportDatabase(deliveryOk);
  expect(Object.keys(dump).sort()).toEqual(
    ['configurations', 'configurationVersions', 'schemaVersion', 'units'].sort(),
  );
  expect(JSON.stringify(dump)).not.toContain('theme');
});

describe('[G2] exportDatabase delivers before it clears the dirty bit', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('runs the deliverer while the dirty bit is still set', async () => {
    await repository.createConfiguration(
      { name: 'export-order', artifactType: 'yaml' },
      { modelName: 'm', systemPrompt: 's' },
    );
    expect(variorumStore.getState().dirtySinceExport).toBe(true);
    let dirtyDuringDelivery: boolean | undefined;
    await repository.exportDatabase(async () => {
      dirtyDuringDelivery = variorumStore.getState().dirtySinceExport;
    });
    expect(dirtyDuringDelivery).toBe(true);
    expect(variorumStore.getState().dirtySinceExport).toBe(false);
  });

  it('hands the deliverer the same dump it returns', async () => {
    let delivered: DatabaseDump | undefined;
    const dump = await repository.exportDatabase(async (d) => {
      delivered = d;
    });
    expect(delivered).toEqual(dump);
  });

  it('a rejected delivery propagates and leaves the dirty bit set', async () => {
    await repository.createConfiguration(
      { name: 'export-cancelled', artifactType: 'yaml' },
      { modelName: 'm', systemPrompt: 's' },
    );
    await expect(repository.exportDatabase(deliveryFails)).rejects.toThrow(
      /delivery refused/,
    );
    expect(variorumStore.getState().dirtySinceExport).toBe(true);
  });

  it('prune still refuses after a cancelled export, and proceeds after a delivered one', async () => {
    await repository.createConfiguration(
      { name: 'export-gate', artifactType: 'yaml' },
      { modelName: 'm', systemPrompt: 's' },
    );
    await expect(repository.exportDatabase(deliveryFails)).rejects.toThrow(
      /delivery refused/,
    );
    await expect(repository.pruneArchivedUnits()).rejects.toThrow(/export/);
    await repository.exportDatabase(deliveryOk);
    await expect(repository.pruneArchivedUnits()).resolves.toBeGreaterThanOrEqual(
      0,
    );
  });
});
