/**
 * replaceDatabase end to end against fake-indexeddb (DESIGN.md "Replace —
 * the wholesale door"): atomic wipe-and-load, the mandatory pre-wipe backup
 * as the return value, refusals that touch nothing, the dirty bit, and the
 * prune interaction. The shared boundary guard is locked in
 * src/domain/merge.validation.test.ts.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { variorumStore } from '@/state/store';
import type { DatabaseDump, Unit } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';

const T = '2026-01-01T00:00:00.000Z';

const unit = (id: string, configName: string, archived = false): Unit => ({
  id,
  conversationName: `conversation ${id}`,
  configName,
  createdAt: T,
  archived,
  messages: [],
  artifacts: [],
});

/** A dump holding one single-version lineage and optionally one unit. */
const dumpWith = (
  configName: string,
  unitId?: string,
  archived = false,
): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: [{ name: configName, artifactType: 'yaml', archived: false }],
  configurationVersions: [
    { name: configName, version: 1, modelName: 'm', systemPrompt: 's' },
  ],
  units: unitId === undefined ? [] : [unit(unitId, configName, archived)],
});

const emptyDump = (): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: [],
  configurationVersions: [],
  units: [],
});

describe('[G2] replaceDatabase', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('wipes the database and loads the dump wholesale', async () => {
    await repository.createConfiguration(
      { name: 'local-cfg', artifactType: 'yaml' },
      { modelName: 'm', systemPrompt: 's' },
    );
    await repository.createUnit('local conversation', 'local-cfg');
    await repository.replaceDatabase(dumpWith('replace-cfg', 'replace-u1'));
    const s = variorumStore.getState();
    expect(s.configurations.map((c) => c.name)).toEqual(['replace-cfg']);
    expect(
      s.configurationVersions.map((v) => `${v.name}.${v.version}`),
    ).toEqual(['replace-cfg.1']);
    expect(s.units.map((u) => u.id)).toEqual(['replace-u1']);
  });

  it('returns a pre-wipe backup that deep-equals the pre-replace database', async () => {
    await repository.replaceDatabase(dumpWith('base-cfg', 'base-u1'));
    const before = variorumStore.getState();
    const backup = await repository.replaceDatabase(dumpWith('next-cfg'));
    expect(backup).toEqual({
      schemaVersion: SCHEMA_VERSION,
      configurations: before.configurations,
      configurationVersions: before.configurationVersions,
      units: before.units,
    });
  });

  it('refuses a schemaVersion mismatch, leaving database, store, and dirty bit untouched', async () => {
    await repository.replaceDatabase(dumpWith('kept-cfg', 'kept-u1'));
    await repository.exportDatabase();
    const before = variorumStore.getState();
    expect(before.dirtySinceExport).toBe(false);
    const bad = {
      ...dumpWith('bad-cfg'),
      schemaVersion: SCHEMA_VERSION + 1,
    };
    await expect(repository.replaceDatabase(bad)).rejects.toThrow(/schema/i);
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
    expect(after.units).toEqual(before.units);
    expect(after.dirtySinceExport).toBe(false);
  });

  it('refuses a dump whose unit references a missing configuration, leaving the database untouched', async () => {
    const before = variorumStore.getState();
    const bad: DatabaseDump = {
      ...emptyDump(),
      units: [unit('ghost-u1', 'ghost')],
    };
    await expect(repository.replaceDatabase(bad)).rejects.toThrow(/ghost/);
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
    expect(after.units).toEqual(before.units);
  });

  it('replacing with the returned backup undoes a replace', async () => {
    await repository.replaceDatabase(dumpWith('world-a-cfg', 'world-a-u1'));
    const before = variorumStore.getState();
    const backup = await repository.replaceDatabase(
      dumpWith('world-b-cfg', 'world-b-u1'),
    );
    await repository.replaceDatabase(backup);
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
    expect(after.units).toEqual(before.units);
  });

  it('the replaced database survives a re-boot', async () => {
    await repository.replaceDatabase(dumpWith('reboot-cfg', 'reboot-u1'));
    await repository.boot();
    const s = variorumStore.getState();
    expect(s.configurations.map((c) => c.name)).toEqual(['reboot-cfg']);
    expect(s.units.map((u) => u.id)).toEqual(['reboot-u1']);
  });

  it('replacing with an empty dump empties the database', async () => {
    await repository.replaceDatabase(dumpWith('doomed-cfg', 'doomed-u1'));
    await repository.replaceDatabase(emptyDump());
    const s = variorumStore.getState();
    expect(s.configurations).toEqual([]);
    expect(s.configurationVersions).toEqual([]);
    expect(s.units).toEqual([]);
    // the stores were actually CLEARED, not just left out of the write set
    await repository.boot();
    const rebooted = variorumStore.getState();
    expect(rebooted.configurations).toEqual([]);
    expect(rebooted.configurationVersions).toEqual([]);
    expect(rebooted.units).toEqual([]);
  });

  it('marks dirtySinceExport so prune refuses until a fresh export', async () => {
    await repository.exportDatabase();
    await repository.replaceDatabase(dumpWith('dirty-cfg'));
    expect(variorumStore.getState().dirtySinceExport).toBe(true);
    await expect(repository.pruneArchivedUnits()).rejects.toThrow(/export/);
  });

  it('archived units in the dump are prunable after a fresh export', async () => {
    await repository.replaceDatabase(dumpWith('prune-cfg', 'prune-u1', true));
    await repository.exportDatabase();
    const pruned = await repository.pruneArchivedUnits();
    expect(pruned).toBe(1);
    expect(variorumStore.getState().units).toEqual([]);
  });
});
