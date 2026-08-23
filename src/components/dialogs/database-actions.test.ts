/**
 * [G1] Unit spec for the Database view's action orchestration
 * (DESIGN.md "Management UI", the Database view). Ports in, outcome out:
 * no browser, no IndexedDB — the repository and file-io arrive as mocks.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ImportReport } from '@design/repository-api';
import type { DatabaseDump } from '@/domain/types';
import {
  importReportLines,
  pickReplaceFile,
  runExport,
  runImport,
  runReplace,
  type DatabasePorts,
} from './database-actions';

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

const FULL_REPORT: ImportReport = {
  configurationsAdded: ['linkml', 'react-component'],
  configurationsFastForwarded: [{ name: 'sql', newVersions: [4, 5] }],
  lineagesRenamed: [{ from: 'prose', to: 'prose~2' }],
  unitsAdded: ['u-added'],
  unitsFastForwarded: ['u-ff-1', 'u-ff-2'],
  unitsKeptBoth: [{ originalId: 'u-orig', cloneId: 'u-clone' }],
  skippedIdentical: 7,
};

function makePorts(overrides: Partial<DatabasePorts> = {}): DatabasePorts {
  return {
    exportDatabase: vi.fn(async () => {}),
    importDatabase: vi.fn(async () => EMPTY_REPORT),
    replaceDatabase: vi.fn(async () => EMPTY_DUMP),
    deliverExport: vi.fn(async () => {}),
    deliverBackup: vi.fn(async () => {}),
    readDumpFile: vi.fn(async () => EMPTY_DUMP),
    ...overrides,
  };
}

function abortError(): DOMException {
  return new DOMException('The user aborted a request.', 'AbortError');
}

describe('[G1] runExport', () => {
  it('resolves success when the repository export resolves', async () => {
    const outcome = await runExport(makePorts());
    expect(outcome.kind).toBe('success');
  });

  it('passes the picker deliverer to the repository', async () => {
    const ports = makePorts();
    await runExport(ports);
    expect(ports.exportDatabase).toHaveBeenCalledWith(ports.deliverExport);
  });

  it('maps a dismissed picker (AbortError) to cancelled, not error', async () => {
    const ports = makePorts({
      exportDatabase: vi.fn(async () => {
        throw abortError();
      }),
    });
    expect(await runExport(ports)).toEqual({ kind: 'cancelled' });
  });

  it('maps any other failure to an error carrying the message', async () => {
    const ports = makePorts({
      exportDatabase: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });
    expect(await runExport(ports)).toEqual({
      kind: 'error',
      message: 'disk full',
    });
  });
});

describe('[G1] runImport', () => {
  it('treats a dismissed chooser as cancelled and never merges', async () => {
    const ports = makePorts({ readDumpFile: vi.fn(async () => null) });
    expect(await runImport(ports)).toEqual({ kind: 'cancelled' });
    expect(ports.importDatabase).not.toHaveBeenCalled();
  });

  it('surfaces a parse failure verbatim, path and all', async () => {
    const ports = makePorts({
      readDumpFile: vi.fn(async () => {
        throw new Error('dump.units[3].artifacts[0].savedAt must be a string');
      }),
    });
    expect(await runImport(ports)).toEqual({
      kind: 'error',
      message: 'dump.units[3].artifacts[0].savedAt must be a string',
    });
    expect(ports.importDatabase).not.toHaveBeenCalled();
  });

  it('surfaces a merge guard failure as an error', async () => {
    const ports = makePorts({
      importDatabase: vi.fn(async () => {
        throw new Error('dump schemaVersion 2 is not supported');
      }),
    });
    expect(await runImport(ports)).toEqual({
      kind: 'error',
      message: 'dump schemaVersion 2 is not supported',
    });
  });

  it('renders the returned report as its success lines', async () => {
    const ports = makePorts({
      importDatabase: vi.fn(async () => FULL_REPORT),
    });
    expect(await runImport(ports)).toEqual({
      kind: 'success',
      lines: importReportLines(FULL_REPORT),
    });
  });
});

describe('[G1] importReportLines', () => {
  it('covers every non-empty category, in report order', () => {
    expect(importReportLines(FULL_REPORT)).toEqual([
      'Configurations added: linkml, react-component',
      'Configuration versions added: sql.4, sql.5',
      'Configuration lineages renamed: prose → prose~2',
      'Units added: 1',
      'Units extended: 2',
      'Units kept as both copies: 1',
      'Identical records skipped: 7',
    ]);
  });

  it('omits empty categories but always states the skipped count', () => {
    expect(importReportLines(EMPTY_REPORT)).toEqual([
      'Identical records skipped: 0',
    ]);
  });
});

describe('[G1] pickReplaceFile', () => {
  it('treats a dismissed chooser as cancelled', async () => {
    const ports = makePorts({ readDumpFile: vi.fn(async () => null) });
    expect(await pickReplaceFile(ports)).toEqual({ kind: 'cancelled' });
  });

  it('surfaces a parse failure as an error and lets no dump escape', async () => {
    const ports = makePorts({
      readDumpFile: vi.fn(async () => {
        throw new Error('dump is not valid JSON');
      }),
    });
    expect(await pickReplaceFile(ports)).toEqual({
      kind: 'error',
      message: 'dump is not valid JSON',
    });
  });

  it('carries the parsed dump through untouched', async () => {
    const dump: DatabaseDump = { ...EMPTY_DUMP, schemaVersion: 1 };
    const ports = makePorts({ readDumpFile: vi.fn(async () => dump) });
    const picked = await pickReplaceFile(ports);
    expect(picked).toEqual({ kind: 'picked', dump });
  });
});

describe('[G1] runReplace', () => {
  it('resolves success when the repository replace resolves', async () => {
    const outcome = await runReplace(makePorts(), EMPTY_DUMP);
    expect(outcome.kind).toBe('success');
  });

  it('passes the dump and the anchor deliverer to the repository', async () => {
    const ports = makePorts();
    await runReplace(ports, EMPTY_DUMP);
    expect(ports.replaceDatabase).toHaveBeenCalledWith(
      EMPTY_DUMP,
      ports.deliverBackup,
    );
  });

  it('surfaces a rejected backup delivery as an error', async () => {
    const ports = makePorts({
      replaceDatabase: vi.fn(async () => {
        throw new Error('backup delivery failed');
      }),
    });
    expect(await runReplace(ports, EMPTY_DUMP)).toEqual({
      kind: 'error',
      message: 'backup delivery failed',
    });
  });
});
