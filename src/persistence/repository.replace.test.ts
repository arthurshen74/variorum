/**
 * replaceDatabase end to end against fake-indexeddb (DESIGN.md "Replace —
 * the wholesale door"): atomic wipe-and-load, the mandatory pre-wipe backup
 * captured and DELIVERED before the wipe, refusals that touch nothing, the
 * dirty bit, and the prune interaction. The shared boundary guard is locked in
 * src/domain/merge.validation.test.ts.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { variorumStore } from '@/state/store';
import type { DatabaseDump, Unit } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';

const T = '2026-01-01T00:00:00.000Z';

/** A delivery that succeeds — the caller put the backup somewhere durable. */
const deliveryOk = async (): Promise<void> => {};

/** A delivery that fails — a cancelled save, a full disk. */
const deliveryFails = async (): Promise<void> => {
  throw new Error('delivery refused');
};

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
    await repository.replaceDatabase(
      dumpWith('replace-cfg', 'replace-u1'),
      deliveryOk,
    );
    const s = variorumStore.getState();
    expect(s.configurations.map((c) => c.name)).toEqual(['replace-cfg']);
    expect(
      s.configurationVersions.map((v) => `${v.name}.${v.version}`),
    ).toEqual(['replace-cfg.1']);
    expect(s.units.map((u) => u.id)).toEqual(['replace-u1']);
  });

  it('returns a pre-wipe backup that deep-equals the pre-replace database', async () => {
    await repository.replaceDatabase(dumpWith('base-cfg', 'base-u1'), deliveryOk);
    const before = variorumStore.getState();
    const backup = await repository.replaceDatabase(
      dumpWith('next-cfg'),
      deliveryOk,
    );
    expect(backup).toEqual({
      schemaVersion: SCHEMA_VERSION,
      configurations: before.configurations,
      configurationVersions: before.configurationVersions,
      units: before.units,
    });
  });

  it('refuses a schemaVersion mismatch, leaving database, store, and dirty bit untouched', async () => {
    await repository.replaceDatabase(dumpWith('kept-cfg', 'kept-u1'), deliveryOk);
    await repository.exportDatabase(deliveryOk);
    const before = variorumStore.getState();
    expect(before.dirtySinceExport).toBe(false);
    const bad = {
      ...dumpWith('bad-cfg'),
      schemaVersion: SCHEMA_VERSION + 1,
    };
    await expect(repository.replaceDatabase(bad, deliveryOk)).rejects.toThrow(
      /schema/i,
    );
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
    await expect(repository.replaceDatabase(bad, deliveryOk)).rejects.toThrow(
      /ghost/,
    );
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
    expect(after.units).toEqual(before.units);
  });

  it('replacing with the returned backup undoes a replace', async () => {
    await repository.replaceDatabase(
      dumpWith('world-a-cfg', 'world-a-u1'),
      deliveryOk,
    );
    const before = variorumStore.getState();
    const backup = await repository.replaceDatabase(
      dumpWith('world-b-cfg', 'world-b-u1'),
      deliveryOk,
    );
    await repository.replaceDatabase(backup, deliveryOk);
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
    expect(after.units).toEqual(before.units);
  });

  it('the replaced database survives a re-boot', async () => {
    await repository.replaceDatabase(
      dumpWith('reboot-cfg', 'reboot-u1'),
      deliveryOk,
    );
    await repository.boot();
    const s = variorumStore.getState();
    expect(s.configurations.map((c) => c.name)).toEqual(['reboot-cfg']);
    expect(s.units.map((u) => u.id)).toEqual(['reboot-u1']);
  });

  it('replacing with an empty dump empties the database', async () => {
    await repository.replaceDatabase(
      dumpWith('doomed-cfg', 'doomed-u1'),
      deliveryOk,
    );
    await repository.replaceDatabase(emptyDump(), deliveryOk);
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
    await repository.exportDatabase(deliveryOk);
    await repository.replaceDatabase(dumpWith('dirty-cfg'), deliveryOk);
    expect(variorumStore.getState().dirtySinceExport).toBe(true);
    await expect(repository.pruneArchivedUnits()).rejects.toThrow(/export/);
  });

  it('archived units in the dump are prunable after a fresh export', async () => {
    await repository.replaceDatabase(
      dumpWith('prune-cfg', 'prune-u1', true),
      deliveryOk,
    );
    await repository.exportDatabase(deliveryOk);
    const pruned = await repository.pruneArchivedUnits();
    expect(pruned).toBe(1);
    expect(variorumStore.getState().units).toEqual([]);
  });
});

describe('[G2] replaceDatabase delivers before it destroys', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('runs the deliverer while the old database is still intact', async () => {
    await repository.replaceDatabase(dumpWith('pre-cfg', 'pre-u1'), deliveryOk);
    let seenDuringDelivery: string[] = [];
    await repository.replaceDatabase(dumpWith('post-cfg'), async () => {
      seenDuringDelivery = variorumStore
        .getState()
        .configurations.map((c) => c.name);
    });
    expect(seenDuringDelivery).toEqual(['pre-cfg']);
    expect(
      variorumStore.getState().configurations.map((c) => c.name),
    ).toEqual(['post-cfg']);
  });

  it('hands the deliverer the same backup it returns', async () => {
    await repository.replaceDatabase(
      dumpWith('handed-cfg', 'handed-u1'),
      deliveryOk,
    );
    const before = variorumStore.getState();
    let delivered: DatabaseDump | undefined;
    const backup = await repository.replaceDatabase(
      dumpWith('other-cfg'),
      async (b) => {
        delivered = b;
      },
    );
    expect(delivered).toEqual({
      schemaVersion: SCHEMA_VERSION,
      configurations: before.configurations,
      configurationVersions: before.configurationVersions,
      units: before.units,
    });
    expect(delivered).toEqual(backup);
  });

  it('a rejected delivery propagates and leaves store and dirty bit untouched', async () => {
    await repository.replaceDatabase(dumpWith('safe-cfg', 'safe-u1'), deliveryOk);
    await repository.exportDatabase(deliveryOk);
    const before = variorumStore.getState();
    expect(before.dirtySinceExport).toBe(false);
    await expect(
      repository.replaceDatabase(dumpWith('never-cfg'), deliveryFails),
    ).rejects.toThrow(/delivery refused/);
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
    expect(after.units).toEqual(before.units);
    expect(after.dirtySinceExport).toBe(false);
  });

  it('a rejected delivery leaves the database untouched across a re-boot', async () => {
    await repository.replaceDatabase(
      dumpWith('durable-cfg', 'durable-u1'),
      deliveryOk,
    );
    await expect(
      repository.replaceDatabase(dumpWith('never-cfg'), deliveryFails),
    ).rejects.toThrow(/delivery refused/);
    await repository.boot();
    const s = variorumStore.getState();
    expect(s.configurations.map((c) => c.name)).toEqual(['durable-cfg']);
    expect(s.units.map((u) => u.id)).toEqual(['durable-u1']);
  });

  it('never invokes the deliverer when the dump is refused', async () => {
    let invoked = false;
    const bad = { ...dumpWith('bad-cfg'), schemaVersion: SCHEMA_VERSION + 1 };
    await expect(
      repository.replaceDatabase(bad, async () => {
        invoked = true;
      }),
    ).rejects.toThrow(/schema/i);
    expect(invoked).toBe(false);
  });
});
