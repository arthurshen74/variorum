/**
 * importDatabase end to end against fake-indexeddb: the repository executes
 * the merge plan, writes IndexedDB before the store, marks the export bit,
 * and the merged database survives a re-boot. Semantics of the plan itself
 * are locked in src/domain/merge.test.ts.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { variorumStore } from '@/state/store';
import type { DatabaseDump } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';

const T = '2026-01-01T00:00:00.000Z';

const deliveryOk = async (): Promise<void> => {};

/** A dump holding one single-version lineage and optionally one unit. */
const dumpWith = (configName: string, unitId?: string): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: [{ name: configName, artifactType: 'yaml', archived: false }],
  configurationVersions: [
    { name: configName, version: 1, modelName: 'm', systemPrompt: 's' },
  ],
  units:
    unitId === undefined
      ? []
      : [
          {
            id: unitId,
            conversationName: `conversation ${unitId}`,
            configName,
            createdAt: T,
            archived: false,
            messages: [],
            artifacts: [],
          },
        ],
});

describe('[G2] importDatabase', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('writes the plan to IndexedDB and the store and returns the report', async () => {
    const report = await repository.importDatabase(
      dumpWith('imported-cfg', 'imported-u1'),
    );
    expect(report.configurationsAdded).toEqual(['imported-cfg']);
    expect(report.unitsAdded).toEqual(['imported-u1']);
    const s = variorumStore.getState();
    expect(s.configurations.some((c) => c.name === 'imported-cfg')).toBe(true);
    expect(s.configurationVersions.some((v) => v.name === 'imported-cfg')).toBe(
      true,
    );
    expect(s.units.some((u) => u.id === 'imported-u1')).toBe(true);
  });

  it('importing your own export leaves the store deep-equal and reports everything skipped', async () => {
    await repository.createConfiguration(
      { name: 'own-cfg', artifactType: 'yaml' },
      { modelName: 'm', systemPrompt: 's' },
    );
    await repository.createUnit('own conversation', 'own-cfg');
    const dump = await repository.exportDatabase(deliveryOk);
    const before = variorumStore.getState();
    const report = await repository.importDatabase(dump);
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
    expect(after.units).toEqual(before.units);
    expect(report).toEqual({
      configurationsAdded: [],
      configurationsFastForwarded: [],
      lineagesRenamed: [],
      unitsAdded: [],
      unitsFastForwarded: [],
      unitsKeptBoth: [],
      skippedIdentical: dump.configurations.length + dump.units.length,
    });
  });

  it('marks dirtySinceExport so prune refuses until a fresh export', async () => {
    await repository.exportDatabase(deliveryOk);
    await repository.importDatabase(dumpWith('dirty-cfg'));
    expect(variorumStore.getState().dirtySinceExport).toBe(true);
    await expect(repository.pruneArchivedUnits()).rejects.toThrow(/export/);
  });

  it('merged records survive a re-boot', async () => {
    await repository.importDatabase(dumpWith('reboot-cfg', 'reboot-u1'));
    await repository.boot();
    const s = variorumStore.getState();
    expect(s.configurations.some((c) => c.name === 'reboot-cfg')).toBe(true);
    expect(s.units.some((u) => u.id === 'reboot-u1')).toBe(true);
  });
});
