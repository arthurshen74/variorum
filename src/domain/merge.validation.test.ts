/**
 * The spec for assertValidDump (DESIGN.md "Replace — the wholesale door",
 * "Validation"): the dump boundary guards shared by import and replace.
 * planMerge's own refusal behavior stays locked in merge.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { assertValidDump } from './merge';
import type { DatabaseDump, Unit } from './types';
import { SCHEMA_VERSION } from './types';

const T = '2026-01-01T00:00:00.000Z';

const unit = (id: string, configName: string): Unit => ({
  id,
  conversationName: `conversation ${id}`,
  configName,
  createdAt: T,
  archived: false,
  messages: [],
  artifacts: [],
});

const dump = (configNames: string[] = [], units: Unit[] = []): DatabaseDump => ({
  schemaVersion: SCHEMA_VERSION,
  configurations: configNames.map((name) => ({
    name,
    artifactType: 'yaml',
    archived: false,
  })),
  configurationVersions: configNames.map((name) => ({
    name,
    version: 1,
    modelName: 'm',
    systemPrompt: 's',
  })),
  units,
});

describe('[G1] assertValidDump', () => {
  it('throws on a schemaVersion mismatch', () => {
    const incoming = { ...dump(), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => assertValidDump(SCHEMA_VERSION, incoming)).toThrow(/schema/i);
  });

  it('throws when a unit references a configuration name absent from the dump', () => {
    const incoming = dump([], [unit('u1', 'ghost')]);
    expect(() => assertValidDump(SCHEMA_VERSION, incoming)).toThrow(/ghost/);
  });

  it('accepts a dump whose units all reference dump configurations', () => {
    const incoming = dump(['cfg'], [unit('u1', 'cfg')]);
    expect(() => assertValidDump(SCHEMA_VERSION, incoming)).not.toThrow();
  });

  it('accepts an empty dump', () => {
    expect(() => assertValidDump(SCHEMA_VERSION, dump())).not.toThrow();
  });
});
