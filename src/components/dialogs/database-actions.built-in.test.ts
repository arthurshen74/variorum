/**
 * [G1] The built-in configuration check that follows a replace (DESIGN.md
 * "First-Run Setup", "The built-in configuration"; "Replace — the
 * wholesale door", "One write may follow"): runReplace is the one
 * orchestration every replace surface goes through, so it is where the
 * follow-up write is made. Ports in, outcome out — no browser, no
 * IndexedDB.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseDump } from '@/domain/types';
import type { ImportReport } from '@design/repository-api';
import { type DatabasePorts, runReplace } from './database-actions';

const EMPTY_DUMP: DatabaseDump = {
  schemaVersion: 1,
  configurations: [],
  configurationVersions: [],
  units: [],
};

const EMPTY_REPORT: ImportReport = {
  configurationsAdded: [],
  configurationsFastForwarded: [],
  lineagesRenamed: [],
  unitsAdded: [],
  unitsFastForwarded: [],
  unitsKeptBoth: [],
  skippedIdentical: 0,
};

function makePorts(overrides: Partial<DatabasePorts> = {}): DatabasePorts {
  return {
    exportDatabase: vi.fn(async () => {}),
    importDatabase: vi.fn(async () => EMPTY_REPORT),
    replaceDatabase: vi.fn(async () => EMPTY_DUMP),
    ensureBuiltInConfiguration: vi.fn(async () => null),
    deliverExport: vi.fn(async () => {}),
    deliverBackup: vi.fn(async () => {}),
    readDumpFile: vi.fn(async () => EMPTY_DUMP),
    ...overrides,
  };
}

describe('[G1] runReplace — the built-in configuration check', () => {
  it('runs the check after the replace resolves', async () => {
    const calls: string[] = [];
    const ports = makePorts({
      replaceDatabase: vi.fn(async () => {
        calls.push('replace:start');
        await Promise.resolve();
        calls.push('replace:done');
        return EMPTY_DUMP;
      }),
      ensureBuiltInConfiguration: vi.fn(async () => {
        calls.push('ensure');
        return null;
      }),
    });
    const outcome = await runReplace(ports, EMPTY_DUMP);
    expect(outcome.kind).toBe('success');
    expect(calls).toEqual(['replace:start', 'replace:done', 'ensure']);
  });

  it('skips the check when the replace rejects', async () => {
    const ensureBuiltInConfiguration = vi.fn(async () => null);
    const ports = makePorts({
      replaceDatabase: vi.fn(async () => {
        throw new Error('delivery refused');
      }),
      ensureBuiltInConfiguration,
    });
    const outcome = await runReplace(ports, EMPTY_DUMP);
    expect(outcome).toEqual({ kind: 'error', message: 'delivery refused' });
    expect(ensureBuiltInConfiguration).not.toHaveBeenCalled();
  });
});
