/**
 * [G1] ensureBuiltInConfiguration against fake-indexeddb (DESIGN.md
 * "First-Run Setup", "The built-in configuration"): created only when no
 * name record carries the name, archived counting as present; never
 * updated or re-synced; no units; an ordinary mutation for the dirty
 * bit; and its own write — never part of boot or replaceDatabase.
 *
 * Each test sets the whole database with replaceDatabase, so the tests
 * are independent of order.
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { repository } from './repository';
import { variorumStore } from '@/state/store';
import {
  BUILT_IN_CONFIGURATION_DRAFT,
  BUILT_IN_CONFIGURATION_INFO,
  BUILT_IN_CONFIGURATION_NAME,
} from '@/domain/seed-configuration';
import type {
  ConfigurationVersion,
  DatabaseDump,
  Unit,
} from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';

const T = '2026-01-01T00:00:00.000Z';

const deliveryOk = async (): Promise<void> => {};

const BUILT_IN_VERSION_ONE: ConfigurationVersion = {
  name: BUILT_IN_CONFIGURATION_NAME,
  version: 1,
  ...BUILT_IN_CONFIGURATION_DRAFT,
};

const unit = (id: string, configName: string): Unit => ({
  id,
  conversationName: `conversation ${id}`,
  configName,
  createdAt: T,
  archived: false,
  messages: [],
  artifacts: [],
});

const emptyDump = (): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: [],
  configurationVersions: [],
  units: [],
});

/** One single-version lineage with one unit, under any name but the built-in's. */
const otherDump = (): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: [{ name: 'other-cfg', artifactType: 'yaml', archived: false }],
  configurationVersions: [
    { name: 'other-cfg', version: 1, modelName: 'm', systemPrompt: 's' },
  ],
  units: [unit('other-u1', 'other-cfg')],
});

/** A database whose link-ml is the user's own: two versions, not the seed's. */
const ownLinkMlDump = (archived: boolean): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: [
    {
      name: BUILT_IN_CONFIGURATION_NAME,
      artifactType: 'yaml',
      archived,
      description: 'mine',
    },
  ],
  configurationVersions: [
    {
      name: BUILT_IN_CONFIGURATION_NAME,
      version: 1,
      modelName: 'my-model',
      systemPrompt: 'my v1',
    },
    {
      name: BUILT_IN_CONFIGURATION_NAME,
      version: 2,
      modelName: 'my-model',
      systemPrompt: 'my v2',
      temperature: 0.7,
    },
  ],
  units: [],
});

const names = (): string[] =>
  variorumStore
    .getState()
    .configurations.map((c) => c.name)
    .sort();

describe('[G1] ensureBuiltInConfiguration', () => {
  beforeAll(async () => {
    await repository.boot();
  });

  it('on an empty database creates the name record and version 1 from the seed and returns the version', async () => {
    await repository.replaceDatabase(emptyDump(), deliveryOk);
    const created = await repository.ensureBuiltInConfiguration();
    expect(created).toEqual(BUILT_IN_VERSION_ONE);
    const s = variorumStore.getState();
    expect(s.configurations).toEqual([
      { ...BUILT_IN_CONFIGURATION_INFO, archived: false },
    ]);
    expect(s.configurationVersions).toEqual([BUILT_IN_VERSION_ONE]);
  });

  it('a second call writes nothing and returns null', async () => {
    await repository.replaceDatabase(emptyDump(), deliveryOk);
    await repository.ensureBuiltInConfiguration();
    const before = variorumStore.getState();
    const second = await repository.ensureBuiltInConfiguration();
    expect(second).toBeNull();
    const after = variorumStore.getState();
    expect(after.configurations).toEqual(before.configurations);
    expect(after.configurationVersions).toEqual(before.configurationVersions);
  });

  it('two concurrent calls create exactly one record', async () => {
    await repository.replaceDatabase(emptyDump(), deliveryOk);
    const results = await Promise.all([
      repository.ensureBuiltInConfiguration(),
      repository.ensureBuiltInConfiguration(),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const s = variorumStore.getState();
    expect(s.configurations).toHaveLength(1);
    expect(s.configurationVersions).toHaveLength(1);
  });

  it('an archived link-ml is left archived and nothing is written', async () => {
    const dump = ownLinkMlDump(true);
    await repository.replaceDatabase(dump, deliveryOk);
    const result = await repository.ensureBuiltInConfiguration();
    expect(result).toBeNull();
    const s = variorumStore.getState();
    expect(s.configurations).toEqual(dump.configurations);
    expect(s.configurations[0]?.archived).toBe(true);
    expect(s.configurationVersions).toEqual(dump.configurationVersions);
  });

  it('an existing link-ml with its own versions is left byte-identical', async () => {
    const dump = ownLinkMlDump(false);
    await repository.replaceDatabase(dump, deliveryOk);
    const result = await repository.ensureBuiltInConfiguration();
    expect(result).toBeNull();
    const s = variorumStore.getState();
    expect(s.configurations).toEqual(dump.configurations);
    expect(s.configurationVersions).toEqual(dump.configurationVersions);
  });

  it('with other configurations and no link-ml, adds it alongside and leaves the others untouched', async () => {
    const dump = otherDump();
    await repository.replaceDatabase(dump, deliveryOk);
    const created = await repository.ensureBuiltInConfiguration();
    expect(created).toEqual(BUILT_IN_VERSION_ONE);
    expect(names()).toEqual([BUILT_IN_CONFIGURATION_NAME, 'other-cfg']);
    const s = variorumStore.getState();
    expect(s.configurations.find((c) => c.name === 'other-cfg')).toEqual(
      dump.configurations[0],
    );
    expect(
      s.configurationVersions.filter((v) => v.name === 'other-cfg'),
    ).toEqual(dump.configurationVersions);
    expect(s.units).toEqual(dump.units);
  });

  it('creates no units', async () => {
    await repository.replaceDatabase(emptyDump(), deliveryOk);
    await repository.ensureBuiltInConfiguration();
    expect(variorumStore.getState().units).toEqual([]);
  });

  it('creating sets dirtySinceExport; a no-op leaves a cleared bit cleared', async () => {
    await repository.replaceDatabase(emptyDump(), deliveryOk);
    await repository.exportDatabase(deliveryOk);
    expect(variorumStore.getState().dirtySinceExport).toBe(false);
    await repository.ensureBuiltInConfiguration();
    expect(variorumStore.getState().dirtySinceExport).toBe(true);

    await repository.exportDatabase(deliveryOk);
    await repository.ensureBuiltInConfiguration();
    expect(variorumStore.getState().dirtySinceExport).toBe(false);
  });

  it('boot alone creates nothing; a created record survives a re-boot', async () => {
    await repository.replaceDatabase(emptyDump(), deliveryOk);
    await repository.boot();
    expect(variorumStore.getState().configurations).toEqual([]);

    await repository.ensureBuiltInConfiguration();
    await repository.boot();
    const s = variorumStore.getState();
    expect(s.configurations).toEqual([
      { ...BUILT_IN_CONFIGURATION_INFO, archived: false },
    ]);
    expect(s.configurationVersions).toEqual([BUILT_IN_VERSION_ONE]);
  });

  it('replaceDatabase alone adds nothing; a following check adds link-ml beside the dump', async () => {
    await repository.replaceDatabase(otherDump(), deliveryOk);
    expect(names()).toEqual(['other-cfg']);

    await repository.ensureBuiltInConfiguration();
    expect(names()).toEqual([BUILT_IN_CONFIGURATION_NAME, 'other-cfg']);
  });
});
